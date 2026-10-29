const test = require("node:test");
const assert = require("node:assert/strict");
const JSZip = require("jszip");

const { parseInvoiceXml, buildDedupeKey } = require("../src/modules/accounting/received-invoices/parser");
const { extractPdfText, extractPdfInvoice, comparePdfWithDraft } = require("../src/modules/accounting/received-invoices/pdf-text");
const { inspectZip, hasZipSignature, inspectEntryName } = require("../src/modules/accounting/received-invoices/zip-archive");
const { pairDocuments, normalizedBase, dedupeKeyFor, archiveTitle } = require("../src/modules/accounting/received-invoices/ingest");
const { buildInvoiceXml, buildInvoicePdf, buildDemoZip, CUFE } = require("./fixtures/received-invoices/demo-archive");

test("el XML UBL se extrae completo y sin marcas de revision", () => {
  const parsed = parseInvoiceXml(buildInvoiceXml());
  assert.equal(parsed.ok, true);
  assert.equal(parsed.draft.full_number, "FV-2026-000123");
  assert.equal(parsed.draft.prefix, "FV-2026");
  assert.equal(parsed.draft.invoice_number, "000123");
  assert.equal(parsed.draft.cufe, CUFE);
  assert.equal(parsed.draft.issuer_tax_id, "900123456");
  assert.equal(parsed.draft.issuer_name, "Distribuciones Andinas SAS");
  assert.equal(parsed.draft.receiver_tax_id, "901555777");
  assert.equal(parsed.draft.subtotal, 1000000);
  assert.equal(parsed.draft.iva, 190000);
  assert.deepEqual(parsed.draft.iva_percents, [19]);
  assert.equal(parsed.draft.total, 1190000);
  assert.equal(parsed.draft.currency, "COP");
  assert.equal(parsed.draft.issue_date.toISOString().slice(0, 10), "2026-10-20");
  assert.equal(parsed.draft.cufe_validation.valid, true);
  assert.equal(parsed.draft.needs_review, false);
  assert.deepEqual(parsed.draft.missing_fields, []);
});

test("el CUFE se valida estructuralmente y un formato inválido exige revisión", () => {
  const invalid = parseInvoiceXml(buildInvoiceXml({ cufe: "xyz" }));
  assert.equal(invalid.draft.cufe_validation.valid, false);
  assert.ok(invalid.draft.validation_issues.some((issue) => issue.code === "CUFE_INVALIDO" && issue.severity === "critical"));
  assert.equal(invalid.draft.needs_review, true);

  const missing = parseInvoiceXml(buildInvoiceXml({ cufe: "" }));
  assert.equal(missing.draft.cufe, null);
  assert.ok(missing.draft.validation_issues.some((issue) => issue.code === "CUFE_NO_IDENTIFICADO" && issue.severity === "critical"));
  assert.equal(missing.draft.needs_review, true);
});

test("el NIT se normaliza sin digito de verificacion", () => {
  const parsed = parseInvoiceXml(buildInvoiceXml({ issuerTaxId: "900123456-7", receiverTaxId: "901.555.777-2" }));
  assert.equal(parsed.draft.issuer_tax_id, "900123456");
  assert.equal(parsed.draft.receiver_tax_id, "901555777");
});

test("el XML incompleto queda marcado para revision y no inventa datos", () => {
  const xml = buildInvoiceXml({ issuerTaxId: "", issuerName: "", total: 0 });
  const parsed = parseInvoiceXml(xml);
  assert.equal(parsed.draft.needs_review, true);
  const codes = parsed.draft.validation_issues.map((issue) => issue.code);
  assert.ok(codes.includes("EMISOR_NIT_NO_IDENTIFICADO"));
  assert.ok(codes.includes("TOTAL_NO_IDENTIFICADO"));
  assert.equal(parsed.draft.issuer_tax_id, null);
  assert.equal(parsed.draft.total, 0);
});

test("el XML con DOCTYPE o mal formado se rechaza", () => {
  assert.throws(() => parseInvoiceXml('<?xml version="1.0"?><!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><Invoice/>'), /DOCTYPE|ENTITY/);
  assert.throws(() => parseInvoiceXml("<Invoice><ID>FV-1</ID>"), /mal formado|truncado/i);
});

test("el PDF de la factura se lee y coincide con el XML", async () => {
  const parsed = parseInvoiceXml(buildInvoiceXml());
  const text = await extractPdfText(buildInvoicePdf());
  assert.equal(text.has_text, true);
  assert.equal(text.page_count, 1);
  assert.equal(text.ocr_available, false);
  const draft = extractPdfInvoice(text.text);
  assert.equal(draft.invoice_number, "FV-2026-000123");
  assert.equal(draft.issuer_tax_id, "900123456");
  assert.equal(draft.subtotal, 1000000);
  assert.equal(draft.iva, 190000);
  assert.equal(draft.total, 1190000);
  assert.equal(draft.needs_review, true);
  const comparison = comparePdfWithDraft(text.text, parsed.draft);
  assert.deepEqual(comparison.issues, []);
});

test("una diferencia entre PDF y XML genera alerta critica", async () => {
  const parsed = parseInvoiceXml(buildInvoiceXml());
  const text = await extractPdfText(buildInvoicePdf({ total: 1090000 }));
  const comparison = comparePdfWithDraft(text.text, parsed.draft);
  assert.ok(comparison.issues.some((issue) => issue.code === "PDF_TOTAL_DIFERENTE" && issue.severity === "critical"));
});

test("un PDF danado no se confunde con un XML", async () => {
  await assert.rejects(() => extractPdfText(Buffer.from("%PDF-1.4 roto")), /dañado|no se pudo leer/i);
  await assert.rejects(() => extractPdfText(Buffer.from("<Invoice/>")), /no corresponde a un PDF/i);
});

test("el ZIP demo extrae solo XML y PDF con checksum", async () => {
  const archive = await buildDemoZip();
  const inspected = await inspectZip(archive, { fileName: "facturas.zip" });
  assert.equal(inspected.entry_count, 2);
  assert.equal(inspected.extracted_count, 2);
  const kinds = inspected.files.map((file) => file.kind).sort();
  assert.deepEqual(kinds, ["pdf", "xml"]);
  for (const file of inspected.files) {
    assert.match(file.checksum_sha256, /^[a-f0-9]{64}$/);
    assert.ok(file.bytes.length > 0);
  }
});

test("las entradas de metadatos del sistema se ignoran", async () => {
  const zip = new JSZip();
  zip.file("__MACOSX/._factura.xml", "basura");
  zip.file(".DS_Store", "basura");
  zip.file("factura.xml", buildInvoiceXml());
  const inspected = await inspectZip(await zip.generateAsync({ type: "nodebuffer" }));
  assert.equal(inspected.files.length, 1);
  assert.equal(inspected.files[0].file_name, "factura.xml");
  assert.ok(inspected.rejected.every((entry) => entry.ignored === true));
});

test("el ZIP sin documentos reconocibles se rechaza", async () => {
  const zip = new JSZip();
  zip.file("notas.txt", "hola");
  const buffer = await zip.generateAsync({ type: "nodebuffer" });
  await assert.rejects(() => inspectZip(buffer), /no contiene archivos XML o PDF/i);
});

test("el tipo se decide por contenido y un XML mal nombrado se rechaza", async () => {
  const zip = new JSZip();
  zip.file("roto.xml", "esto no es un xml");
  zip.file("factura.pdf", buildInvoiceXml());
  const inspected = await inspectZip(await zip.generateAsync({ type: "nodebuffer" }));
  assert.equal(inspected.files.length, 1);
  // El contenido manda: se acepta como XML aunque la extension diga PDF.
  assert.equal(inspected.files[0].file_name, "factura.pdf");
  assert.equal(inspected.files[0].kind, "xml");
  assert.ok(inspected.rejected.some((entry) => entry.reason === "xml_no_reconocido"));
});

test("firmas y nombres de entrada se validan", () => {
  assert.equal(hasZipSignature(Buffer.from([0x50, 0x4b, 0x03, 0x04])), true);
  assert.equal(hasZipSignature(Buffer.from("PK??")), false);
  assert.equal(inspectEntryName("../x.xml").reason, "ruta_no_permitida");
  assert.equal(inspectEntryName("/etc/x.xml").reason, "ruta_absoluta");
  assert.equal(inspectEntryName("C:/x.xml").reason, "ruta_absoluta");
  assert.equal(inspectEntryName("__MACOSX/x.xml").ignored, true);
  assert.equal(inspectEntryName("carpeta/factura.xml").ok, true);
});

test("la clave de deduplicacion prioriza CUFE y usa file como respaldo", () => {
  const parsed = parseInvoiceXml(buildInvoiceXml());
  assert.equal(buildDedupeKey(parsed.draft), `cufe:${CUFE}`);
  assert.equal(dedupeKeyFor(parsed.draft, { checksum_sha256: "a".repeat(64) }), `cufe:${CUFE}`);
  const incomplete = { ...parsed.draft, cufe: null, invoice_number: null, total: 0 };
  assert.equal(dedupeKeyFor(incomplete, { checksum_sha256: "b".repeat(64) }), `file:${"b".repeat(64)}`);
});

test("el emparejamiento XML/PDF tolera prefijos y nombres distintos", () => {
  const xml = { kind: "xml", file_name: "Factura_FV-2026-000123.xml" };
  const pdf = { kind: "pdf", file_name: "FV-2026-000123.pdf" };
  const groups = pairDocuments([xml, pdf]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].pdfs.length, 1);
  assert.equal(normalizedBase("Factura_FV-2026-000123.xml"), "2026 000123");
  assert.equal(archiveTitle("C:\\correo\\lote.zip"), "lote.zip");
});

test("varios XML emparejan cada PDF con su factura", () => {
  const groups = pairDocuments([
    { kind: "xml", file_name: "FV-1.xml" },
    { kind: "xml", file_name: "FV-2.xml" },
    { kind: "pdf", file_name: "FV-1.pdf" },
    { kind: "pdf", file_name: "FV-2.pdf" }
  ]);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups.map((group) => group.pdfs.map((pdf) => pdf.file_name)), [["FV-1.pdf"], ["FV-2.pdf"]]);
});
