// Build with the bundled artifact-tool runtime. No repository spreadsheet dependencies.
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
const workspace = process.env.APEX_ARTIFACT_WORKSPACE;
if (!workspace) throw new Error("Configure APEX_ARTIFACT_WORKSPACE with its bundled node_modules junction.");
const bundled = createRequire(path.join(workspace, "loader.cjs"));
const { Workbook, SpreadsheetFile } = await import(pathToFileURL(bundled.resolve("@oai/artifact-tool")).href);
const root = path.resolve(import.meta.dirname, "../..");
const spec = JSON.parse(await fs.readFile(path.join(root, "apps/api/src/modules/transport/settlement-import-format.json"), "utf8"));
const output = path.join(root, "outputs", "01a15ec1-liquidaciones");
await fs.mkdir(output, { recursive: true });
const workbook = Workbook.create();
const sheet = workbook.worksheets.add(spec.sheet);
const guide = workbook.worksheets.add("Guia");
for (const tab of [sheet, guide]) tab.showGridLines = false;
sheet.getRange("A1:L201").format.font = { name: "Arial", size: 10, color: "#17212B" };
sheet.getRange("A1:L201").format.rowHeight = 24;
sheet.getRange("A1:L201").format.columnWidth = 23;
sheet.getRange("A1:L1").values = [spec.columns];
sheet.getRange("A1:L1").format = { fill: "#153F4A", font: { name: "Arial", bold: true, color: "#FFFFFF" }, rowHeight: 32, horizontalAlignment: "center", verticalAlignment: "center" };
sheet.getRange("A2:L201").format.fill = "#FFFCEF";
sheet.getRange("A2:E201").setNumberFormat("@");
sheet.getRange("G2:H201").setNumberFormat("@");
sheet.getRange("K2:L201").setNumberFormat("@");
sheet.getRange("F2:F201").setNumberFormat("yyyy-mm-dd");
sheet.getRange("I2:I201").setNumberFormat("0");
sheet.getRange("J2:J201").setNumberFormat("0.00");
sheet.getRange("I2:I201").dataValidation = { rule: { type: "whole", operator: "between", formula1: 1, formula2: 1000000 } };
sheet.getRange("J2:J201").dataValidation = { rule: { type: "decimal", operator: "between", formula1: 0.01, formula2: 1000000 } };
sheet.getRange("K1:L201").format.columnWidth = 45;
sheet.freezePanes.freezeRows(1); sheet.freezePanes.freezeColumns(2);
const table = sheet.tables.add("A1:L201", true, "LiquidacionesCarga"); table.showFilterButton = true;
guide.getRange("A1:D28").format.font = { name: "Arial", size: 10, color: "#17212B" };
guide.getRange("A1:D28").format.rowHeight = 26;
guide.getRange("A1:A28").format.columnWidth = 24;
guide.getRange("B1:B28").format.columnWidth = 13;
guide.getRange("C1:C28").format.columnWidth = 82;
guide.getRange("D1:D28").format.columnWidth = 36;
guide.getRange("A2").values = [["Carga de liquidaciones de transporte"]]; guide.getRange("A2").format.font = { name: "Arial", size: 14, bold: true };
guide.getRange("A4").values = [["Flujo"]]; guide.getRange("C4").values = [["Validar Excel → importar a revisión → aprobar → contabilizar con su permiso."]];
guide.getRange("A5").values = [["Límites"]]; guide.getRange("C5").values = [["200 filas y 30 paquetes por archivo .xlsx (máximo 2 MB). Moneda COP."]];
guide.getRange("A6").values = [["Agrupación"]]; guide.getRange("C6").values = [["Una fila por criterio. Repetir paquete/documento agrupa criterios del mismo recorrido."]];
guide.getRange("A7").values = [["Valores y periodo"]]; guide.getRange("C7").values = [["El servidor calcula con tarifario vigente y usa el periodo contable actual de Bogotá."]];
guide.getRange("A8").values = [["Centro de costos"]]; guide.getRange("C8").values = [["Debe coincidir con la asignación del vehículo; no se admite redirigir el asiento desde Excel."]];
guide.getRange("A9").values = [["Antes de llenar"]]; guide.getRange("C9").values = [["Descargue las referencias de su empresa desde Carga masiva. Los ejemplos no son maestros reales."]];
const rows = [
  ["Campo", "Obligatorio", "Regla", "Ejemplo ilustrativo"],
  ["paquete", "Sí", "Referencia externa única por empresa. Hasta 80 letras/números, guiones, puntos o barras, sin espacios.", "LOTE-202610-001"],
  ["documento", "Sí", "Referencia del recorrido/documento, única entre paquetes. Repetir solo para sus diferentes criterios.", "REM-202610-001"],
  ["placa", "Sí", "Placa de un vehículo habilitado de la empresa. Un solo vehículo por paquete.", "ABC123"],
  ["centro_costos", "Sí", "Código contable asignado al vehículo (ver referencias). Sociedad y sucursal se resuelven en servidor.", "ABC123"],
  ["cliente_documento", "Sí", "Documento/NIT exacto de un cliente activo. Mantener como texto para conservar ceros iniciales.", "900123456-7"],
  ["fecha_servicio", "Sí", "Fecha real Excel o texto AAAA-MM-DD. El tarifario debe estar vigente ese día.", "2026-10-21"],
  ["destinos_codigos", "Sí", "Códigos de tiendas/destinos activos del cliente, separados por punto y coma, sin repetir.", "TIENDA-01;TIENDA-02"],
  ["tarifa_codigo", "Sí", "Código exacto de un tarifario activo y compatible con el vehículo. Los importes se calculan en servidor.", "FLETE-URBANO"],
  ["tarifa_version", "Sí", "Número entero de la versión activa. Un criterio por tarifario en cada documento.", "1"],
  ["cantidad_servicios", "Sí", "Cantidad positiva. Se multiplica por el valor unitario parametrizado en el tarifario.", "2"],
  ["soporte", "Sí", "Referencia del soporte del criterio (máximo 1000 caracteres); no es una aprobación ni un enlace a descargar.", "REM-001 / soporte operativo"],
  ["observacion", "No", "Hasta 2000 caracteres; conservar el mismo texto en todas las filas del paquete.", "Servicios de octubre"]
];
guide.getRange("A11:D23").values = rows;
guide.getRange("A11:D11").format = { fill: "#153F4A", font: { name: "Arial", bold: true, color: "#FFFFFF" }, horizontalAlignment: "center" };
guide.getRange("C12:D23").format.wrapText = true;
guide.getRange("A12:D23").format.rowHeight = 42;
guide.getRange("A25").values = [["Reintentos"]]; guide.getRange("C25").values = [["El mismo paquete y datos recuperan su liquidación. Si cambia datos, corrija la liquidación existente."]];
guide.getRange("A26").values = [["Aprobaciones"]]; guide.getRange("C26").values = [["No escribir estados ni aprobadores. Los permisos, segregación y bloqueos documentales siguen vigentes."]];
guide.getRange("A27").values = [["Contabilización"]]; guide.getRange("C27").values = [["Seleccionar cuentas de ingreso y cartera y fechas válidas en la aplicación, después de aprobar."]];
guide.getRange("C25:C27").format.wrapText = true; guide.getRange("A25:D27").format.rowHeight = 36;
workbook.recalculate();
console.log((await workbook.inspect({ kind: "table", range: "Liquidaciones!A1:L3", include: "values", tableMaxRows: 3, tableMaxCols: 12, maxChars: 1500 })).ndjson);
for (const [name, tab, range] of [["plantilla-izquierda", "Liquidaciones", "A1:F6"], ["plantilla-derecha", "Liquidaciones", "G1:L6"], ["guia", "Guia", "A1:D27"]]) {
  const preview = await workbook.render({ sheetName: tab, range, scale: 1.4, format: "png" });
  await fs.writeFile(path.join(workspace, `${name}.png`), new Uint8Array(await preview.arrayBuffer()));
}
const file = await SpreadsheetFile.exportXlsx(workbook);
const destination = path.join(output, "Plantilla_Liquidaciones_Transporte.xlsx");
await file.save(destination);
// Keep the exporter's diagnostic sidecar with local previews, outside deliverables.
await fs.rename(`${destination}.inspect.ndjson`, path.join(workspace, "template.inspect.ndjson")).catch(error => { if (error.code !== "ENOENT") throw error; });
await fs.copyFile(destination, path.join(root, "apps/web/public/plantillas/Plantilla_Liquidaciones_Transporte.xlsx"));
console.log(destination);
