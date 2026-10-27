import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "../../..");
const page = fs.readFileSync(path.join(root, "apps/web/app/dashboard/contabilidad/pyg/page.tsx"), "utf8").replace(/\r\n/g, "\n");
const component = fs.readFileSync(path.join(root, "apps/web/components/transport-pyg/TransportPygAccountConfig.tsx"), "utf8").replace(/\r\n/g, "\n");
const accountingPyg = fs.readFileSync(path.join(root, "apps/web/components/accounting/AccountingPyg.tsx"), "utf8").replace(/\r\n/g, "\n");
const apiClient = fs.readFileSync(path.join(root, "apps/web/lib/api.ts"), "utf8");

test("el reporte por vehiculo vuelve a consultar el libro sin reutilizar respuestas", () => {
  assert.match(apiClient, /export function getTransportPygReport\(period: string\)[^\n]+cache: "no-store"/);
});

function functionBody(name) {
  const start = page.indexOf(`function ${name}(`);
  assert.ok(start > 0, `no se encontro la funcion ${name}`);
  const end = page.indexOf("\n}\n", start);
  assert.ok(end > start, `no se pudo delimitar la funcion ${name}`);
  return page.slice(start, end);
}

test("la vista de configuracion se decide sin depender del reporte ni de la flota vacia", () => {
  // ConfigView se monta como rama propia, sin recibir report ni depender de vehicle_count.
  assert.match(page, /view === "configuracion" \? \(\s*\n\s*<ConfigView canWrite=\{canWrite\} onSaved=\{\(\) => void load\(period\)\} \/>/);
  assert.doesNotMatch(functionBody("ConfigView"), /report/);
});

test("el aviso de flota vacia no oculta el consolidado ni la configuracion", () => {
  assert.match(page, /<NoVehiclesNotice onConfig=\{\(\) => setView\("configuracion"\)\} \/>/);
  assert.match(page, /view === "consolidado" \? <ConsolidatedView/);
  // TransportPygAccountConfig vive en ConfigView, fuera del return principal.
  assert.match(functionBody("ConfigView"), /<TransportPygAccountConfig canWrite=\{canWrite\} onSaved=\{onSaved\} \/>/);
  assert.match(page, /centros de costo del libro sin vehículo siguen visibles en el consolidado/);
});

test("presupuesto de lectura: los valores nulos se presentan sin comparar contra cero", () => {
  assert.match(page, /gastos\?\.budget == null \? "Sin presupuesto definido"/);
  assert.match(page, /presupuesto: row\.budget == null \? "" : row\.budget/);
  // El presupuesto operativo por placa ya no existe en la vista de vehículo:
  // el presupuesto real proviene del Presupuesto PUC (PYG Contable).
  assert.doesNotMatch(page, /saveTransportPygBudgets/);
  assert.doesNotMatch(page, /getTransportPygBudgets/);
  assert.doesNotMatch(page, /"Presupuestos"/);
});

test("las filas muestran etiqueta humana del tipo y no el valor interno", () => {
  assert.match(page, /const kindLabel = KIND_LABELS\[row\.kind\]/);
  assert.match(page, /kindLabel \? <span[^>]*>\{kindLabel\}/);
});

test("el consolidado muestra el bloque sin vehículo aunque no haya placas activas", () => {
  const body = functionBody("ConsolidatedView");
  const match = /\{report\.unassigned \? \(\n([\s\S]*?)\n\s*\) : null\}/.exec(body);
  assert.ok(match, "falta el bloque condicional de report.unassigned");
  // La condicion del bloque no puede depender del conteo de placas (el KPI de
  // cobertura de ingresos si usa vehicle_count y es legitimo).
  assert.doesNotMatch(match[0], /vehicle_count/);
  assert.match(match[1], /<StatementTable caption=\{`Centros de costo del libro sin vehículo asignado/);
});

test("la configuracion guarda siempre fuente contable y no ofrece cambiar de fuente", () => {
  assert.match(component, /saveTransportPygAccountConfiguration\(\{ source: "accounting", concepts: toPayload\(concepts\) \}\)/);
  assert.doesNotMatch(component, /source: "operational"/);
  assert.doesNotMatch(component, /restoreOperational/);
  assert.doesNotMatch(component, /Volver a fuente operativa/);
  // La propuesta del Excel sigue disponible como borrador con confirmacion explicita.
  assert.match(component, /Restablecer propuesta del Excel/);
  assert.match(component, /window\.confirm\(/);
});

test("el header aclara que el PYG por vehiculo sale de los asientos del libro", () => {
  assert.match(page, /construido automáticamente desde el libro contable \(asientos publicados del periodo seleccionado\)/);
  assert.match(page, /Fuente: libro contable \(asientos publicados del periodo \{report\.period\}\)/);
  assert.doesNotMatch(page, /liquidaciones, caja menor|fuente operativa histórica/);
});

test("Contable y Por vehículo comparten un único estado de periodo", () => {
  assert.match(page, /<AccountingPyg period=\{period\} onPeriodChange=\{setPeriod\} \/>/);
  assert.match(accountingPyg, /onPeriodChange\?: \(value: string\) => void/);
  assert.match(accountingPyg, /const effectivePeriod = period \?\? internalPeriod;/);
  assert.match(accountingPyg, /if \(onPeriodChange\) onPeriodChange\(value\); else setInternalPeriod\(value\);/);
});

test("la solicitud obsoleta del periodo anterior no pisa el resultado nuevo", () => {
  assert.match(page, /const loadSeq = useRef\(0\);/);
  assert.match(page, /const seq = \+\+loadSeq\.current;/);
  assert.match(page, /if \(seq !== loadSeq\.current\) return;/);
  assert.match(page, /setLoadedPeriod\(targetPeriod\);/);
  assert.match(page, /const reportReady = !!report && !loading && !error && loadedPeriod === period;/);
});
