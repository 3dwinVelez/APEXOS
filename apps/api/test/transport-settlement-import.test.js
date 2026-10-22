const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire } = require("node:module");
const ExcelJS = require("exceljs");
const importer = require("../src/modules/transport/settlement-import");
const format = require("../src/modules/transport/settlement-import-format.json");
const sample = ["EXT-1", "DOC-1", "ABC123", "ABC123", "00123-4", "2026-10-21", "STORE-1", "FLETE", 1, 2, "Soporte operativo", ""];
async function fixture(rows = [sample], mutate = () => {}) {
  const book = new ExcelJS.Workbook(); const sheet = book.addWorksheet(format.sheet);
  sheet.addRow(format.columns); rows.forEach(row => sheet.addRow(row)); mutate(sheet);
  return Buffer.from(await book.xlsx.writeBuffer());
}
test("la plantilla entregada se lee y está vacía para impedir cargas de ejemplo accidentales", async () => {
  const buffer = fs.readFileSync(path.resolve(__dirname, "../../../apps/web/public/plantillas/Plantilla_Liquidaciones_Transporte.xlsx"));
  await assert.rejects(importer.parseWorkbook(buffer), { code: "TMS_IMPORT_EMPTY" });
});
test("el lector conserva documentos y fechas Excel, números y ceros iniciales", async () => {
  const buffer = await fixture([sample], sheet => { sheet.getCell("F2").value = new Date("2026-10-21T00:00:00Z"); sheet.getCell("F2").numFmt = "yyyy-mm-dd"; });
  const result = await importer.parseWorkbook(buffer);
  assert.equal(result.errors.length, 0); assert.equal(result.rows[0].cliente_documento, "00123-4");
  assert.equal(result.rows[0].fecha_servicio, "2026-10-21"); assert.equal(result.rows[0].cantidad_servicios, 2);
});
test("fórmulas, hipervínculos, fechas imposibles, celdas faltantes y cantidades inválidas tienen error por fila", async () => {
  for (const [column, value] of [["A2", { formula: 'WEBSERVICE("https://example.invalid")' }], ["K2", { text: "enlace", hyperlink: "https://example.invalid" }], ["F2", "2026-02-31"], ["J2", -1], ["E2", ""]]) {
    const parsed = await importer.parseWorkbook(await fixture([sample], sheet => { sheet.getCell(column).value = value; }));
    assert.equal(parsed.errors.length, 1); assert.equal(parsed.errors[0].row, 2);
  }
});
test("rechaza firma falsa, archivos grandes, columnas extra y encabezados alterados", async () => {
  assert.throws(() => importer.checkWorkbookArchive(Buffer.from("not a workbook")), { code: "TMS_IMPORT_FILE" });
  assert.throws(() => importer.checkWorkbookArchive(Buffer.alloc(importer.MAX_FILE_BYTES + 1)), { code: "TMS_IMPORT_FILE" });
  await assert.rejects(importer.parseWorkbook(await fixture([sample], sheet => { sheet.getCell("M1").value = "estado"; })), { code: "TMS_IMPORT_SHEET" });
  await assert.rejects(importer.parseWorkbook(await fixture([sample], sheet => { sheet.getCell("A1").value = "tenant_id"; })), { code: "TMS_IMPORT_HEADERS" });
});
test("rechaza macros, compresión excesiva y desbordes de filas o paquetes", async () => {
  const JSZip = require("jszip"); const zip = await JSZip.loadAsync(await fixture());
  zip.file("xl/vbaProject.bin", "macro");
  await assert.rejects(importer.parseWorkbook(await zip.generateAsync({ type: "nodebuffer" })), { code: "TMS_IMPORT_ARCHIVE_LIMIT" });
  const bomb = await JSZip.loadAsync(await fixture()); bomb.file("xl/large.xml", "a".repeat(9 * 1024 * 1024));
  await assert.rejects(importer.parseWorkbook(await bomb.generateAsync({ type: "nodebuffer", compression: "DEFLATE" })), { code: "TMS_IMPORT_ARCHIVE_LIMIT" });
  await assert.rejects(importer.parseWorkbook(await fixture(Array.from({ length: 201 }, () => sample))), { code: "TMS_IMPORT_SHEET" });
  await assert.rejects(importer.parseWorkbook(await fixture(Array.from({ length: 31 }, (_, index) => ["P-" + index, ...sample.slice(1)]))), { code: "TMS_IMPORT_PACKAGE_LIMIT" });
});
test("rechaza contadores ZIP falsos antes de leer partes fuera de los límites", async () => {
  const JSZip = require("jszip");
  const zip = await JSZip.loadAsync(await fixture());
  zip.file("xl/oversized.xml", "a".repeat(9 * 1024 * 1024));
  const archive = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  const end = archive.length - 22;
  for (const count of [0, 1]) {
    const altered = Buffer.from(archive);
    altered.writeUInt16LE(count, end + 8);
    altered.writeUInt16LE(count, end + 10);
    await assert.rejects(importer.parseWorkbook(altered), { code: "TMS_IMPORT_ZIP" });
  }
});
test("rechaza directorios ZIP inconsistentes y desplazamientos de lectura", async () => {
  const archive = await fixture();
  const end = archive.length - 22, directory = archive.readUInt32LE(end + 16);
  for (const mutate of [
    buffer => buffer.writeUInt16LE(0, end + 8),
    buffer => buffer.writeUInt16LE(buffer.readUInt16LE(end + 10) + 1, end + 10),
    buffer => buffer.writeUInt32LE(buffer.readUInt32LE(end + 12) - 1, end + 12),
    buffer => buffer.writeUInt32LE(directory - 1, end + 16),
    buffer => buffer.writeUInt32LE(directory, directory + 42),
    buffer => buffer.writeUInt16LE(1, directory + 34)
  ]) {
    const altered = Buffer.from(archive);
    mutate(altered);
    await assert.rejects(importer.parseWorkbook(altered), { code: "TMS_IMPORT_ZIP" });
  }
});
test("admite comentarios ZIP ordinarios pero rechaza un final ambiguo", async () => {
  const JSZip = require("jszip");
  const zip = await JSZip.loadAsync(await fixture());
  const normal = await zip.generateAsync({ type: "nodebuffer", comment: "Plantilla de transporte" });
  assert.equal((await importer.parseWorkbook(normal)).rows.length, 1);
  const ambiguous = await zip.generateAsync({ type: "nodebuffer", comment: "PK\u0005\u0006" });
  await assert.rejects(importer.parseWorkbook(ambiguous), { code: "TMS_IMPORT_ZIP" });
});
test("una operación compuesta comparte transacción y no admite saltar a otro tenant", async () => {
  const file = path.resolve(__dirname, "../src/modules/transport/settlement-service.js");
  const localRequire = createRequire(file); let transactions = 0;
  const tx = { $executeRawUnsafe: async () => {} };
  const db = { runWithTenant: (_, fn) => fn(), $transaction: async fn => { transactions++; return fn(tx); } };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(file, "utf8"), { module, exports: module.exports, require(name) { return name === "../../core/prisma" ? db : localRequire(name); } });
  const service = module.exports;
  const result = await service.withSettlementTransaction("A", async outer => service.withSettlementTransaction("A", inner => outer === inner));
  assert.equal(result, true); assert.equal(transactions, 1);
  await assert.rejects(service.withSettlementTransaction("A", () => service.withSettlementTransaction("B", () => {})), { code: "TMS_IMPORT_TENANT_MISMATCH" });
  await assert.rejects(service.createSettlementPackage("A", {}, { metadata: { settlement_import: {} } }), { code: "TMS_IMPORT_METADATA_RESERVED" });
  await assert.rejects(service.updateSettlementPackage("A", {}, 1, { metadata: { settlement_import: null } }), { code: "TMS_IMPORT_METADATA_RESERVED" });
});
