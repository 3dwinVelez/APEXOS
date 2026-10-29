import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { NO_BRANCH, centerBranchLabel, centerExcelLabel } from "../lib/pyg-center-labels.mjs";

const root = path.resolve(import.meta.dirname, "../../..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8").replace(/\r\n/g, "\n");

const center = (overrides = {}) => ({
  center_code: "CC-10",
  center_name: "Administración",
  branch_code: "BOG",
  branch_name: "Bogotá",
  plate: null,
  ...overrides
});

// Mismo patrón de cuatro métricas que usa la hoja "Matriz CC" del exportador.
function excelLabels(centers) {
  const suffix = ["PRESUPUESTO", "EJECUTADO", "%", "CUMP %"];
  return centers.flatMap((item, index) => suffix.map((metric) => `${centerExcelLabel(item, index)} · ${metric}`));
}

const page = read("apps/web/app/dashboard/contabilidad/pyg/page.tsx");
const matrix = read("apps/web/components/accounting/PygCentersMatrix.tsx");
const statementTable = read("apps/web/components/accounting/PygStatementTable.tsx");
const readings = read("apps/web/components/accounting/PygVehicleReadings.tsx");
const apiClient = read("apps/web/lib/api.ts");

function functionBody(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start > 0, `no se encontro la funcion ${name}`);
  const end = source.indexOf("\n}\n", start);
  assert.ok(end > start, `no se pudo delimitar la funcion ${name}`);
  return source.slice(start, end);
}

test("el reporte por vehiculo ofrece la vista Por CC además de consolidado y por vehículo", () => {
  assert.match(page, /type View = "consolidado" \| "vehiculos" \| "centros" \| "configuracion";/);
  assert.match(page, /\["centros", "Por CC"\]/);
  assert.match(page, /import \{ PygCentersMatrix \} from "@\/components\/accounting\/PygCentersMatrix";/);
  assert.match(page, /view === "centros" \? <PygCentersMatrix report=\{report\} \/>/);
  // La configuración sigue siendo una rama independiente del reporte.
  assert.match(page, /view === "configuracion" \? \(\s*\n\s*<ConfigView canWrite=\{canWrite\} onSaved=\{\(\) => void load\(period\)\} \/>/);
});

test("el cliente tipa los centros de costo que entrega el reporte", () => {
  assert.match(apiClient, /export type TransportPygCenter = \{/);
  assert.match(apiClient, /center_code: string; center_name: string; branch_code: string; branch_name: string;/);
  assert.match(apiClient, /plate: string \| null; vehicle_label: string \| null;/);
  assert.match(apiClient, /rows: TransportPygRow\[\];\s*\n\};/);
  assert.match(apiClient, /centers\?: TransportPygCenter\[\];/);
});

test("la matriz pone los centros en las columnas con la estructura del PYG en las filas", () => {
  const body = functionBody(matrix, "PygCentersMatrix");
  // Filas: la misma estructura de conceptos del consolidado, sin recalcular.
  assert.match(body, /const concepts = report\.corporate\.rows;/);
  assert.match(body, /concepts\.map\(\(concept\) =>/);
  // Columnas: una por centro de costo, cada una con presupuesto, ejecutado, % y cumplimiento.
  assert.match(body, /const centers = report\.centers \|\| \[\];/);
  assert.match(body, /centers\.map\(\(center\) => \(/);
  assert.match(body, /colSpan=\{4\}/);
  assert.match(body, /Presupuesto<\/th>/);
  assert.match(body, /Ejecutado<\/th>/);
  assert.match(body, /Cump<\/th>/);
  // El concepto queda fijo al desplazar horizontalmente la matriz.
  assert.match(body, /sticky left-0/);
  // Sin centros no se inventa una matriz vacía.
  assert.match(body, /if \(!centers\.length\)/);
});

test("la matriz muestra la sucursal como subtítulo del grupo de columnas del centro", () => {
  const body = functionBody(matrix, "PygCentersMatrix");
  const branch = functionBody(matrix, "centerBranch");
  assert.match(matrix, /import \{ centerBranchLabel \} from "@\/lib\/pyg-center-labels.mjs";/);
  assert.match(branch, /return centerBranchLabel\(center\);/);
  assert.doesNotMatch(branch, /center\.branch_name/, "la matriz no duplica la regla de sucursal");
  // El nombre del centro sigue visible y la sucursal se pinta en su propia línea.
  assert.match(body, /\{centerTitle\(center\)\}/);
  assert.match(body, /\{centerBranch\(center\)\}/);
  assert.match(body, /\{centerDetail\(center\)\}/);
  const branchSpan = body.indexOf("<span className=\"block text-[10px] font-semibold normal-case text-apex\">{centerBranch(center)}</span>");
  const nameSpan = body.indexOf("{centerTitle(center)}");
  const detailSpan = body.indexOf("{centerDetail(center)}");
  assert.ok(nameSpan > 0 && branchSpan > nameSpan && detailSpan > branchSpan, "sucursal entre el nombre y el detalle");
  // Encabezados de métricas y columnas por centro intactos.
  assert.match(body, /colSpan=\{4\}/);
  assert.match(body, /scope="col">Presupuesto<\/th>/);
  assert.match(body, /scope="col">Ejecutado<\/th>/);
  assert.match(body, /scope="col">%<\/th>/);
  assert.match(body, /scope="col">Cump<\/th>/);
});

test("la sucursal distingue centros con el mismo nombre en sucursales distintas", () => {
  const bogota = center();
  const medellin = center({ center_code: "CC-20", branch_code: "MDE", branch_name: "Medellín" });
  assert.equal(centerBranchLabel(bogota), "Bogotá");
  assert.equal(centerBranchLabel(medellin), "Medellín");
  assert.notEqual(centerExcelLabel(bogota, 0), centerExcelLabel(medellin, 1));
  assert.equal(centerExcelLabel(bogota, 0), "Administración · Bogotá");
  assert.equal(centerExcelLabel(medellin, 1), "Administración · Medellín");
  // Sin sucursal registrada se rotula explícitamente el faltante.
  const noBranch = center({ center_code: "CC-30", branch_code: "", branch_name: "" });
  assert.equal(centerBranchLabel(noBranch), NO_BRANCH);
  assert.equal(centerExcelLabel(noBranch, 2), `Administración · ${NO_BRANCH}`);
});

test("el nombre de sucursal tiene prioridad y el código queda como respaldo", () => {
  assert.equal(centerBranchLabel(center()), "Bogotá");
  assert.equal(centerBranchLabel(center({ branch_name: "" })), "BOG");
});

test("la etiqueta base del Excel conserva placa, nombre de centro y numeración de respaldo", () => {
  assert.equal(centerExcelLabel(center({ plate: "ABC123" }), 0), "ABC123 · Bogotá");
  assert.equal(centerExcelLabel(center({ center_name: "" }), 1), "CC 2 · Bogotá");
  assert.equal(centerExcelLabel(center({ center_name: "" }), 0), "CC 1 · Bogotá");
});

test("la página arma la etiqueta del Excel con la misma regla que la matriz", () => {
  assert.match(page, /import \{ centerExcelLabel \} from "@\/lib\/pyg-center-labels.mjs";/);
  assert.match(page, /const label = centerExcelLabel\(center, index\);/);
  assert.doesNotMatch(page, /const base = center\.plate/, "la página no duplica la etiqueta base");
  const helper = read("apps/web/lib/pyg-center-labels.mjs");
  assert.match(helper, /center\.branch_name \|\| center\.branch_code \|\| NO_BRANCH/);
  assert.match(matrix, /return centerBranchLabel\(center\);/);
});

test("la matriz usa la misma sucursal que el Excel", () => {
  assert.match(matrix, /return centerBranchLabel\(center\);/);
  assert.match(page, /const label = centerExcelLabel\(center, index\);/);
});

test("la matriz se excluye del configurador global de columnas", () => {
  // El configurador indexa las columnas por la primera fila de encabezados; con
  // colSpan esa fila solo tiene las celdas de grupo y ocultaria las metricas.
  const body = functionBody(matrix, "PygCentersMatrix");
  assert.match(body, /<table[^>]*data-table-layout="detail"/);
  const enhancer = read("apps/web/components/system/StandardTableExperience.tsx");
  assert.match(enhancer, /table\.dataset\.tableLayout === "detail"/);
});

test("la matriz no recalcula importes: lee presupuesto, ejecutado, % y cumplimiento del reporte", () => {
  const body = functionBody(matrix, "PygCentersMatrix");
  assert.match(body, /<RowCell value=\{row \? row\.budget : null\} \/>/);
  assert.match(body, /money\.format\(row\?\.actual \?\? 0\)/);
  assert.match(body, /<PctCell value=\{row\?\.pct \?\? null\} \/>/);
  assert.match(body, /<CumpCell center=\{center\} code=\{concept\.code\} \/>/);
  assert.match(functionBody(matrix, "CumpCell"), /if \(!row \|\| row\.cump == null\) return <span className="text-content-subtle">—<\/span>/);
  assert.doesNotMatch(body, /reduce\(\(sum/, "la matriz no suma ni recalcula sus propios importes");
});

test("el tono de cumplimiento es único y compartido entre la tabla del PYG y la matriz", () => {
  assert.match(readings, /export function cumpTone\(row: Pick<TransportPygRow, "kind" \| "cump">\)/);
  assert.match(readings, /export const CUMP_TONE_CLASS/);
  assert.match(statementTable, /import \{ CUMP_TONE_CLASS, KIND_CLASS, PctCell, RowCell, cumpTone,/);
  assert.doesNotMatch(statementTable, /function cumpTone\(/, "la tabla no puede duplicar el criterio de cumplimiento");
  assert.match(matrix, /import \{ CUMP_TONE_CLASS, KIND_CLASS, RowCell, PctCell, cumpTone,/);
});

test("la exportación a Excel agrega la hoja Matriz CC con cuatro columnas por centro", () => {
  assert.match(page, /name: "Matriz CC"/);
  assert.match(page, /label: `\$\{label\} · PRESUPUESTO`/);
  assert.match(page, /label: `\$\{label\} · EJECUTADO`/);
  assert.match(page, /label: `\$\{label\} · %`/);
  assert.match(page, /label: `\$\{label\} · CUMP %`/);
  assert.match(page, /import \{ centerExcelLabel \} from "@\/lib\/pyg-center-labels.mjs";/);
  assert.match(page, /const label = centerExcelLabel\(center, index\);/);
  assert.doesNotMatch(page, /const base = center\.plate \|\| center\.center_name/, "el sufijo se arma sobre la etiqueta del helper");
  assert.equal(centerExcelLabel(center({ plate: "ABC123" }), 0), "ABC123 · Bogotá");
  assert.match(page, /record\[`cc\$\{index\}_presupuesto`\] = row\?\.budget == null \? "" : row\.budget;/);
  // Las cuatro métricas salen ya rotuladas por sucursal, sin cambiar el sufijo.
  assert.deepEqual(excelLabels([center()]), [
    "Administración · Bogotá · PRESUPUESTO",
    "Administración · Bogotá · EJECUTADO",
    "Administración · Bogotá · %",
    "Administración · Bogotá · CUMP %"
  ]);
  // Dos centros homónimos en sucursales distintas producen encabezados distintos.
  const homonyms = excelLabels([center(), center({ center_code: "CC-20", branch_code: "MDE", branch_name: "Medellín" })]);
  assert.equal(homonyms.length, 8);
  assert.equal(new Set(homonyms).size, 8, "ningún encabezado se repite entre sucursales");
  assert.ok(homonyms[0].endsWith("PRESUPUESTO") && homonyms[4].endsWith("PRESUPUESTO"));
  assert.notEqual(homonyms[0], homonyms[4]);
});
