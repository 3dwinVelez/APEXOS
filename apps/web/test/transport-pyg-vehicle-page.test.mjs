import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "../../..");
const page = fs.readFileSync(path.join(root, "apps/web/app/dashboard/contabilidad/pyg/page.tsx"), "utf8").replace(/\r\n/g, "\n");

function functionBody(name) {
  const start = page.indexOf(`function ${name}(`);
  assert.ok(start > 0, `no se encontro la funcion ${name}`);
  const end = page.indexOf("\n}\n", start);
  assert.ok(end > start, `no se pudo delimitar la funcion ${name}`);
  return page.slice(start, end);
}

test("la vista de configuracion se decide sin depender de la flota vacia", () => {
  const marker = '{activeView === "configuracion" ? <ConfigView';
  const start = page.indexOf(marker);
  assert.ok(start > 0, "no se encontro la rama de configuracion");
  // Rama del ternario: desde la condicion hasta el "else" (: ( o fragmento <>).
  const rest = page.slice(start);
  const elseAt = Math.min(
    ...[/\)\s*:\s*\(/, /\n\s*<>/].map((pattern) => {
      const found = rest.search(pattern);
      return found < 0 ? Number.POSITIVE_INFINITY : found;
    })
  );
  assert.ok(Number.isFinite(elseAt), "no se encontro el else de la rama de configuracion");
  const configBranch = rest.slice(0, elseAt);
  assert.match(configBranch, /<ConfigView canWrite=\{canWrite\} onSaved=\{\(\) => void load\(\)\} report=\{report\} \/>/);
  assert.doesNotMatch(configBranch, /vehicle_count/);
});

test("el aviso de flota vacia no oculta el consolidado ni la configuracion", () => {
  assert.match(page, /<NoVehiclesNotice onConfig=\{\(\) => setView\("configuracion"\)\} \/>/);
  assert.match(page, /activeView === "consolidado" \? <ConsolidatedView/);
  // TransportPygAccountConfig vive en ConfigView, fuera del return principal.
  assert.match(functionBody("ConfigView"), /<TransportPygAccountConfig canWrite=\{canWrite\} onSaved=\{onSaved\} \/>/);
  assert.match(page, /centros de costo del libro sin vehículo siguen visibles en el consolidado/);
});

test("presupuesto nullable: no se compara directamente contra cero", () => {
  assert.doesNotMatch(page, /row\.budget > 0/);
  assert.match(page, /const budget = row\.budget;\s*if \(budget != null && budget > 0\)/);
  assert.match(page, /gastos\?\.budget == null \? "Sin presupuesto definido"/);
  assert.match(page, /presupuesto: row\.budget == null \? "" : row\.budget/);
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

test("volver a la fuente operativa conserva los conceptos guardados", () => {
  const component = fs.readFileSync(path.join(root, "apps/web/components/transport-pyg/TransportPygAccountConfig.tsx"), "utf8");
  assert.doesNotMatch(component, /source: "operational", concepts: \[\]/);
  assert.match(component, /saveTransportPygAccountConfiguration\(\{ source: "operational", concepts: toPayload\(concepts\) \}\)/);
  assert.match(component, /if \(dirty\) \{[\s\S]*?return;\s*\}\s*if \(!window\.confirm\(/);
});
