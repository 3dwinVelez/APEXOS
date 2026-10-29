const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  readSyncConfig,
  buildDedupeKey,
  invoiceRow,
  syncFolder
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
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyTaxScheme>
        <cbc:RegistrationName>PROVEEDOR DE PRUEBA S.A.S.</cbc:RegistrationName>
        <cbc:CompanyID schemeID="8">901111111-1</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>01</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyTaxScheme>
        <cbc:RegistrationName>CLIENTE PRUEBA</cbc:RegistrationName>
        <cbc:CompanyID schemeID="4">900255181</cbc:CompanyID>
      </cac:PartyTaxScheme>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="COP">19000.00</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxAmount currencyID="COP">19000.00</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:Percent>19.00</cbc:Percent>
        <cac:TaxScheme><cbc:ID>01</cbc:ID><cbc:Name>IVA</cbc:Name></cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="COP">100000.00</cbc:LineExtensionAmount>
    <cbc:TaxInclusiveAmount currencyID="COP">119000.00</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="COP">119000.00</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
</Invoice>`;
}

function makeTempFolder() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "apexos-invoice-sync-"));
}

function makeFakePrisma() {
  const rows = [];
  return {
    rows,
    runWithTenant: async (_tenantId, fn) => fn(),
    receivedInvoice: {
      findFirst: async ({ where }) => rows.find((row) => row.tenant_id === where.tenant_id && row.dedupe_key === where.dedupe_key) || null,
      create: async ({ data }) => {
        rows.push({ id: rows.length + 1, ...data });
        return rows[rows.length - 1];
      }
    }
  };
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

test("buildDedupeKey prioriza cufe y cae en doc sin cufe", () => {
  const withCufe = buildDedupeKey({ cufe: ` ${HEX_CUFE.toUpperCase()} `, invoice_number: "FE1", total_payable: 100 });
  assert.equal(withCufe, `cufe:${HEX_CUFE}`);
  const withoutCufe = buildDedupeKey({ invoice_number: "FE1001", total_payable: 119000, issuer_tax_id_raw: "901111111" });
  assert.equal(withoutCufe, "doc:901111111|fe|fe1001|119000.00");
});

test("syncFolder inserta facturas de xml y zip, escanea subcarpetas y es idempotente", async () => {
  const folder = makeTempFolder();
  fs.writeFileSync(path.join(folder, "factura-suelta.xml"), invoiceXml({ cufe: "d".padEnd(96, "3"), number: "XML900" }));
  const nested = path.join(folder, "2026", "10");
  fs.mkdirSync(nested, { recursive: true });
  const JSZip = require("jszip");
  const zip = new JSZip();
  zip.file("factura-zip.xml", invoiceXml({ number: "ZIP800" }));
  zip.file("otra.xml", invoiceXml({ cufe: "c".padEnd(96, "7"), number: "ZIP801" }));
  fs.writeFileSync(path.join(nested, "lote.zip"), await zip.generateAsync({ type: "nodebuffer" }));
  fs.writeFileSync(path.join(nested, "ignorado.txt"), "no es factura");

  const prisma = makeFakePrisma();
  const config = baseConfig(folder);
  const summary = await syncFolder({ config, prisma });

  assert.equal(summary.scanned, 2);
  assert.equal(summary.inserted, 3);
  assert.equal(summary.duplicates, 0);
  assert.equal(summary.failed.length, 0);

  const byNumber = Object.fromEntries(prisma.rows.map((row) => [row.invoice_number, row]));
  assert.equal(byNumber.XML900.issuer_tax_id, "901111111");
  assert.equal(byNumber.XML900.receiver_tax_id, "900255181");
  assert.equal(byNumber.XML900.total, 119000);
  assert.equal(byNumber.XML900.iva, 19000);
  assert.equal(byNumber.XML900.tax_total, 19000);
  assert.equal(byNumber.XML900.issue_date.toISOString().slice(0, 10), "2026-10-26");
  assert.equal(byNumber.XML900.currency, "COP");
  assert.equal(byNumber.XML900.processing_status, "pending_assignment");
  assert.equal(byNumber.XML900.needs_review, false);
  assert.equal(byNumber.XML900.dedupe_key, `cufe:${"d".padEnd(96, "3")}`);
  assert.equal(byNumber.ZIP800.source_archive, "lote.zip:factura-zip.xml");
  assert.equal(byNumber.ZIP800.extraction_metadata.sync, "mailbox-folder");

  const second = await syncFolder({ config, prisma });
  assert.equal(second.inserted, 0);
  assert.equal(second.duplicates, 3);
});

test("syncFolder registra fallos sin abortar el lote", async () => {
  const folder = makeTempFolder();
  fs.writeFileSync(path.join(folder, "buena.xml"), invoiceXml({ number: "OK1" }));
  fs.writeFileSync(path.join(folder, "mala.xml"), "<html><body/></html>");
  const JSZip = require("jszip");
  const zip = new JSZip();
  zip.file("dañada.xml", "<Invoice><ID>1</ID>");
  fs.writeFileSync(path.join(folder, "lote.zip"), await zip.generateAsync({ type: "nodebuffer" }));

  const prisma = makeFakePrisma();
  const summary = await syncFolder({ config: baseConfig(folder), prisma });

  assert.equal(summary.inserted, 1);
  assert.equal(summary.failed.length, 2);
  const codes = summary.failed.map((item) => item.file).sort();
  assert.deepEqual(codes, ["lote.zip:dañada.xml", "mala.xml"]);
});

test("invoiceRow marca revisión cuando el CUFE falta o es inválido", () => {
  const now = new Date("2026-10-28T10:00:00.000Z");
  const base = {
    document_type: "invoice",
    invoice_number: "FE1",
    issue_date: "2026-10-26",
    total_payable: 1000,
    has_iva: false,
    iva_amount: 0,
    iva_percents: [],
    other_tax_amount: 0,
    currency: "COP",
    cufe: null,
    cufe_validation: { valid: false, reason: "CUFE_NO_ENCONTRADO" }
  };
  const noCufe = invoiceRow(base, { tenantId: "t1", sourceFile: "a.xml", now });
  assert.equal(noCufe.needs_review, true);
  assert.deepEqual(noCufe.review_reasons, ["CUFE_NO_IDENTIFICADO"]);
  assert.equal(noCufe.processing_status, "review");

  const badCufe = invoiceRow({ ...base, cufe: "xyz", cufe_validation: { valid: false } }, { tenantId: "t1", sourceFile: "a.xml", now });
  assert.equal(badCufe.needs_review, true);
  assert.deepEqual(badCufe.review_reasons, ["CUFE_INVALIDO"]);
});
