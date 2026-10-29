import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "../../..");
const page = fs.readFileSync(path.join(root, "apps/web/app/dashboard/contabilidad/pyg/page.tsx"), "utf8").replace(/\r\n/g, "\n");
const component = fs.readFileSync(path.join(root, "apps/web/components/transport-pyg/TransportPygAccountConfig.tsx"), "utf8").replace(/\r\n/g, "\n");
const accountingPyg = fs.readFileSync(path.join(root, "apps/web/components/accounting/AccountingPyg.tsx"), "utf8").replace(/\r\n/g, "\n");
const statementTable = fs.readFileSync(path.join(root, "apps/web/components/accounting/PygStatementTable.tsx"), "utf8").replace(/\r\n/g, "\n");
const accountDrill = fs.readFileSync(path.join(root, "apps/web/components/accounting/PygAccountDrill.tsx"), "utf8").replace(/\r\n/g, "\n");
const vehicleReadings = fs.readFileSync(path.join(root, "apps/web/components/accounting/PygVehicleReadings.tsx"), "utf8").replace(/\r\n/g, "\n");
const apiClient = fs.readFileSync(path.join(root, "apps/web/lib/api.ts"), "utf8");

// Los helpers de presentacion se extrajeron a componentes compartidos: la pagina debe usarlos
// y las protecciones se verifican en el componente compartido.
function sharedFunctionBody(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start > 0, `no se encontro la funcion ${name} en el componente compartido`);
  const end = source.indexOf("\n}\n", start);
  assert.ok(end > start, `no se pudo delimitar la funcion ${name} en el componente compartido`);
  return source.slice(start, end);
}
function sharedExportBody(name) {
  const exportStart = vehicleReadings.indexOf(`export function ${name}(`);
  assert.ok(exportStart > 0, `no se encontro ${name} en PygVehicleReadings`);
  const end = vehicleReadings.indexOf("\n}\n", exportStart);
  assert.ok(end > exportStart, `no se pudo delimitar ${name} en PygVehicleReadings`);
  return vehicleReadings.slice(exportStart, end);
}

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

test("el presupuesto nulo se presenta sin comparar contra cero, compartido entre pagina y StatementTable", () => {
  assert.match(page, /gastos\?\.budget == null \? "Sin presupuesto definido"/);
  // La conversion a Excel sigue usando la fila del reporte.
  assert.match(page, /presupuesto: row\.budget == null \? "" : row\.budget/);
  // El presupuesto operativo por placa ya no existe en la vista de vehículo:
  // el presupuesto real proviene del Presupuesto PUC (PYG Contable).
  assert.doesNotMatch(page, /saveTransportPygBudgets/);
  assert.doesNotMatch(page, /getTransportPygBudgets/);
  assert.doesNotMatch(page, /"Presupuestos"/);
  // El componente compartido muestra celdas de presupuesto via RowCell (null → guion), sin comparar contra cero.
  assert.match(statementTable, /<RowCell value=\{row\.budget\} \/>/);
  assert.match(sharedFunctionBody(vehicleReadings, "RowCell"), /if \(value == null\) return <span className="text-content-subtle">—<\/span>/);
});

test("las filas muestran etiqueta humana del tipo y no el valor interno", () => {
  // La etiqueta vive ahora en el StatementTable compartido...
  assert.match(statementTable, /const kindLabel = KIND_LABELS\[row\.kind\]/);
  assert.match(statementTable, /kindLabel \? <span[^>]*>\{kindLabel\}/);
  // ...y la pagina la usa importando el componente compartido.
  assert.match(page, /import \{ StatementTable \} from "@\/components\/accounting\/PygStatementTable"/);
  assert.match(page, /<StatementTable /);
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

test("por vehículo conserva un único estado individual sin matriz comparativa ni columnas laterales", () => {
  const body = functionBody("VehiclesView");
  assert.match(body, /<StatementTable caption=\{`Estado de resultados de la placa \$\{vehicle\.plate\}/);
  assert.match(body, /rows=\{vehicle\.rows\} title=\{`PYG \$\{vehicle\.plate\} · \$\{report\.period\}`\} \/>/);
  assert.doesNotMatch(body, /MatrixTable|gridConcepts|xl:grid-cols-\[1\.2fr_1fr\]/);
  assert.doesNotMatch(page, /Matriz de ejecutados por placa|function MatrixTable\(/);
});

test("la vista individual mantiene selección de placas, indicadores, sin asignar y desglose contable", () => {
  const body = functionBody("VehiclesView");
  assert.match(body, /report\.vehicles\.map\(\(item\) =>/);
  assert.match(body, /setLocalSelection\(item\.plate\); onSelectPlate\(item\.plate\)/);
  // El enlace a la ventana ampliada se genera con la placa EXACTA del reporte.
  assert.match(body, /pygExpandedHref\(\{ plate: vehicle\.plate, period: report\.period \}\)/);
  // KPIs: viven en el componente compartido y la pagina los usa con la placa exacta.
  assert.match(sharedExportBody("VehicleKpis"), /export function VehicleKpis\(\{ vehicle \}: \{ vehicle: TransportPygReport\["vehicles"\]\[number\] \}\)/);
  assert.match(sharedExportBody("VehicleKpis"), /label="Vehículo" value=\{vehicle\.plate\}/);
  assert.match(sharedExportBody("VehicleKpis"), /label="Ingresos" value=\{vehicleMoney\.format\(vehicle\.income_actual\)\}/);
  assert.match(sharedExportBody("VehicleKpis"), /label="Utilidad operacional"/);
  assert.match(sharedExportBody("VehicleKpis"), /label="Utilidad neta"/);
  assert.match(body, /<VehicleKpis vehicle=\{vehicle\} \/>/);
  assert.doesNotMatch(body, /<VehicleKpis report=/, "VehicleKpis no recibe un report sin uso");
  assert.match(body, /<UnassignedKpis unassigned=\{report\.unassigned\} \/>/);
  assert.match(body, /rows=\{report\.unassigned\.rows\}/);
  // AccountDrillRow: ahora vive en PygAccountDrill y lo monta el StatementTable compartido.
  assert.match(statementTable, /import \{ AccountDrillRow \} from "\.\/PygAccountDrill"/);
  assert.match(statementTable, /<AccountDrillRow account=\{account\}/);
  assert.match(accountDrill, /export function AccountDrillRow\(/);
  assert.match(sharedFunctionBody(accountDrill, "AccountDrillRow"), /account\.centers\.map/);
});

test("SourceNote comparte la aclaración de fuente del libro y la página la usa", () => {
  assert.match(sharedExportBody("SourceNote"), /Fuente: libro contable \(asientos publicados del periodo \{period\}\)/);
  assert.match(page, /<SourceNote period=\{report\.period\} \/>/);
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
  // La nota de fuente vive ahora en el componente compartido y la pagina la monta.
  assert.match(sharedExportBody("SourceNote"), /Fuente: libro contable \(asientos publicados del periodo \{period\}\)/);
  assert.match(page, /<SourceNote period=\{report\.period\} \/>/);
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
