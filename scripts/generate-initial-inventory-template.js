const fs = require("node:fs");
const path = require("node:path");
const ExcelJS = require("exceljs");

async function generate(outputPath) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "APEXOS";
  const sheet = workbook.addWorksheet("Cargue inicial", { views: [{ state: "frozen", ySplit: 4, showGridLines: false }] });
  sheet.mergeCells("A1:H1"); sheet.getCell("A1").value = "PLANTILLA DE CARGUE INICIAL DE INVENTARIO";
  sheet.getCell("A1").font = { bold: true, color: { argb: "FFFFFFFF" }, size: 16 }; sheet.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0B3B35" } }; sheet.getRow(1).height = 32;
  sheet.mergeCells("A2:H2"); sheet.getCell("A2").value = "Una plantilla corresponde a una sola sociedad y fecha. No cambie los encabezados."; sheet.getCell("A2").font = { italic: true, color: { argb: "FF146C63" } }; sheet.getCell("A2").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8F4F1" } };
  const headers = ["fecha_contabilizacion", "sku", "bodega", "ubicacion", "cantidad", "costo_unitario", "lote", "observaciones"];
  sheet.getRow(4).values = headers; sheet.getRow(4).height = 26;
  sheet.getRow(4).eachCell((cell) => { cell.font = { bold: true, color: { argb: "FFFFFFFF" } }; cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF146C63" } }; });
  [22, 18, 18, 18, 18, 18, 16, 36].forEach((width, index) => { sheet.getColumn(index + 1).width = width; });
  for (let row = 5; row <= 24; row += 1) { sheet.getCell(row, 1).numFmt = "yyyy-mm-dd"; sheet.getCell(row, 5).numFmt = "#,##0.0000"; sheet.getCell(row, 6).numFmt = '"$"#,##0.00'; }
  const guide = workbook.addWorksheet("Instrucciones", { views: [{ showGridLines: false }] });
  guide.mergeCells("A1:B1"); guide.getCell("A1").value = "INSTRUCCIONES Y EJEMPLO"; guide.getCell("A1").font = { bold: true, color: { argb: "FFFFFFFF" }, size: 16 }; guide.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0B3B35" } };
  const rules = [["Campo", "Regla"], ["fecha_contabilizacion", "Fecha igual en todas las filas."], ["sku", "Código exacto de un producto activo."], ["bodega", "Código exacto de bodega activa de la misma sociedad."], ["ubicacion", "Opcional; si queda vacía usa la primera ubicación activa."], ["cantidad", "Unidades iniciales mayores que cero."], ["costo_unitario", "Costo unitario inicial mayor que cero."], ["lote", "Opcional; no repita SKU + ubicación + lote."], ["observaciones", "Opcional; se muestra como motivo en kardex."]];
  rules.forEach((values, index) => { guide.getRow(index + 3).values = values; }); guide.getRow(3).eachCell((cell) => { cell.font = { bold: true, color: { argb: "FFFFFFFF" } }; cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF146C63" } }; }); guide.getColumn(1).width = 28; guide.getColumn(2).width = 78;
  guide.getCell("A13").value = "Ejemplo"; guide.getRow(14).values = ["2026-08-13", "SKU-001", "BP01", "GEN", 10, 25000, "LOTE-01", "Saldo de apertura"];
  fs.mkdirSync(path.dirname(outputPath), { recursive: true }); await workbook.xlsx.writeFile(outputPath);
}

if (require.main === module) generate(path.resolve(__dirname, "../apps/web/public/plantillas/Plantilla_Cargue_Inicial_Inventario.xlsx")).catch((error) => { console.error(error); process.exitCode = 1; });
module.exports = { generate };
