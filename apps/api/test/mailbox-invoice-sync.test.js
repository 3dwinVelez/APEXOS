const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const JSZip = require("jszip");

const {
  readSyncConfig,
  syncFolder,
  archiveFor,
  siblingPdf
} = require("../src/modules/mailbox/invoice-folder-sync");

const HEX_CUFE = "b4e2".padEnd(96, "1");

function invoiceXml({ cufe = HEX_CUFE, number = "FE1001" } = {}) {
  return `<?xml version="1.0" encoding="utf-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2">
  <cbc:ID>${number}</cbc:ID>
  <cbc:UUID schemeID="1" schemeName="CUFE-SHA384">${cufe}</cbc:UUID>
  <cbc:IssueDate>2026-10-26</cbc:IssueDate>
  <cbc:DocumentCurrencyCode>COP</cbc:DocumentCurrencyCode>
  <cac:LegalMonetaryTotal>
    <cbc:PayableAmount currencyID="COP">119000.00</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
</Invoice>`;
}

function makeTempFolder() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "apexos-invoice-sync-"));
}

function fakeEngine() {
  const calls = [];
  const seen = new Map();
  const ingest = async (options) => {
    calls.push(options);
    if (seen.has(options.messageKey)) {
      const duplicates = seen.get(options.messageKey);
      return {
        status: "duplicate_email",
        duplicate: true,
        invoices: Array.from({ length: duplicates }, (_, index) => ({ id: index + 1, status: "duplicate" })),
        errors: [],
        rejected: [],
        summary: { created: 0, duplicates, failed: 0 }
      };
    }
    seen.set(options.messageKey, 1);
    return {
      status: "processed",
      duplicate: false,
      invoices: [{ id: calls.length, status: "created", full_number: "FE1001", total: 119000, needs_review: false }],
      errors: [],
      rejected: [],
      summary: { created: 1, duplicates: 0, failed: 0 }
    };
  };
  return { calls, ingest };
}

function baseConfig(folder) {
  return { tenantId: "tenant-prueba", folder };
}

test("readSyncConfig exige tenant y carpeta valida", () => {
  assert.throws(() => readSyncConfig({ MAILBOX_INVOICE_SYNC_DIR: "/tmp" }), (err) => err.code === "SYNC_TENANT_REQUERIDO");
  assert.throws(() => readSyncConfig({ MAILBOX_INVOICE_SYNC_TENANT_ID: "t1" }), (err) => err.code === "SYNC_CARPETA_REQUERIDA");
  assert.throws(
    () => readSyncConfig({ MAILBOX_INVOICE_SYNC_TENANT_ID: "t1", MAILBOX_INVOICE_SYNC_DIR: "/no/existe" }),
    (err) => err.code === "SYNC_CARPETA_INVALIDA"
  );
  const folder = makeTempFolder();
  const config = readSyncConfig({ MAILBOX_INVOICE_SYNC_TENANT_ID: "t1", MAILBOX_INVOICE_SYNC_DIR: folder });
  assert.equal(config.tenantId, "t1");
  assert.equal(config.folder, path.resolve(folder));
});

test("readSyncConfig acepta fallback de tenant desde MAILBOX_INGEST_TENANT_ID", () => {
  const folder = makeTempFolder();
  const config = readSyncConfig({ MAILBOX_INGEST_TENANT_ID: "tenant-fallback", MAILBOX_INVOICE_SYNC_DIR: folder });
  assert.equal(config.tenantId, "tenant-fallback");
});

test("un XML suelto viaja con su PDF hermano y todo entra por el motor unificado", async () => {
  const folder = makeTempFolder();
  fs.writeFileSync(path.join(folder, "factura-suelta.xml"), invoiceXml({ number: "XML900" }));
  fs.writeFileSync(path.join(folder, "factura-suelta.pdf"), "%PDF-1.4 demo");
  fs.writeFileSync(path.join(folder, "otro.pdf"), "%PDF-1.4 sin xml");
  const nested = path.join(folder, "2026", "10");
  fs.mkdirSync(nested, { recursive: true });
  const zip = new JSZip();
  zip.file("factura-zip.xml", invoiceXml({ number: "ZIP800" }));
  const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });
  fs.writeFileSync(path.join(nested, "lote.zip"), zipBuffer);
  fs.writeFileSync(path.join(nested, "ignorado.txt"), "no es factura");

  const engine = fakeEngine();
  const summary = await syncFolder({ config: baseConfig(folder), ingest: engine.ingest });

  assert.equal(summary.scanned, 2);
  assert.equal(summary.inserted, 2);
  assert.equal(summary.duplicates, 0);
  assert.deepEqual(summary.failed, []);
  assert.equal(engine.calls.length, 2);

  const xmlCall = engine.calls.find((call) => call.archiveName === "factura-suelta.zip");
  assert.ok(xmlCall);
  assert.match(xmlCall.messageKey, /^folder:xml:[a-f0-9]{64}$/);
  assert.equal(xmlCall.source, "folder");
  assert.equal(xmlCall.mailbox, folder);
  const synthetic = await JSZip.loadAsync(xmlCall.archiveBuffer);
  assert.deepEqual(Object.keys(synthetic.files).sort(), ["factura-suelta.pdf", "factura-suelta.xml"]);

  const zipCall = engine.calls.find((call) => call.archiveName === "lote.zip");
  assert.ok(zipCall);
  assert.match(zipCall.messageKey, /^folder:zip:[a-f0-9]{64}$/);
  assert.equal(Buffer.compare(zipCall.archiveBuffer, zipBuffer), 0);

  const second = await syncFolder({ config: baseConfig(folder), ingest: engine.ingest });
  assert.equal(second.inserted, 0);
  assert.equal(second.duplicates, 2);
  assert.deepEqual(
    engine.calls.slice(2).map((call) => call.messageKey),
    engine.calls.slice(0, 2).map((call) => call.messageKey)
  );
});

test("syncFolder aisla fallos y omite metadatos ignorados", async () => {
  const folder = makeTempFolder();
  fs.writeFileSync(path.join(folder, "mala.xml"), invoiceXml({ number: "MALA" }));
  fs.writeFileSync(path.join(folder, "lote.zip"), await new JSZip().generateAsync({ type: "nodebuffer" }));

  const ingest = async (options) => {
    if (options.archiveName === "mala.zip") throw Object.assign(new Error("motor caido"), { code: "INGESTA_FALLIDA" });
    return {
      status: "processed_with_errors",
      invoices: [],
      errors: [{ code: "DOCUMENTO_SIN_DATOS", message: "lote.zip: sin datos" }],
      rejected: [
        { file_name: "notas.txt", reason: "extension_sin_contenido_valido" },
        { file_name: ".DS_Store", reason: "metadato_del_sistema", ignored: true }
      ],
      summary: { created: 0, duplicates: 0, failed: 1 }
    };
  };

  const summary = await syncFolder({ config: baseConfig(folder), ingest });

  assert.equal(summary.scanned, 2);
  assert.equal(summary.inserted, 0);
  assert.equal(summary.failed.length, 3);
  assert.ok(summary.failed.some((entry) => entry.file === "mala.xml" && entry.error === "motor caido"));
  assert.ok(summary.failed.some((entry) => entry.file === "lote.zip:notas.txt"));
  assert.ok(summary.failed.some((entry) => entry.file === "lote.zip" && entry.error === "lote.zip: sin datos"));
});

test("siblingPdf solo empareja mismo directorio y mismo nombre base", async () => {
  const folder = makeTempFolder();
  const sub = path.join(folder, "sub");
  fs.mkdirSync(sub, { recursive: true });
  const xml = path.join(sub, "FV-1.xml");
  fs.writeFileSync(xml, invoiceXml({ number: "FV-1" }));
  const pdf = path.join(sub, "FV-1.pdf");
  fs.writeFileSync(pdf, "%PDF-1.4 demo");
  const otherDir = path.join(folder, "otra", "FV-1.pdf");
  const wrongBase = path.join(sub, "FV-2.pdf");
  assert.equal(siblingPdf(xml, [xml, pdf, otherDir, wrongBase]), pdf);

  const result = await archiveFor(xml, [xml, pdf]);
  assert.equal(result.archiveName, "FV-1.zip");
  const zip = await JSZip.loadAsync(result.buffer);
  assert.deepEqual(Object.keys(zip.files).sort(), ["FV-1.pdf", "FV-1.xml"]);
});
