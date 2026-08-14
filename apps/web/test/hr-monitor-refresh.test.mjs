import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("la marcacion movil emite refresh inmediato para monitores abiertos", () => {
  const source = read("app/dashboard/talento-humano/marcacion/page.tsx");
  assert.match(source, /publishHrMonitorRefresh\(\{ source: "mobile-punch"/);
  assert.match(source, /publishHrMonitorRefresh\(\{ source: "mobile-activity"/);
});

test("el monitor de horarios escucha refresh local y actualiza resúmenes cada 5 segundos", () => {
  const source = read("app/dashboard/talento-humano/rutas/page.tsx");
  assert.match(source, /subscribeHrMonitorRefresh/);
  assert.match(source, /window\.setInterval\(refreshVisible, 5000\)/);
  assert.match(source, /hr\/routes\/event-summaries/);
  assert.match(source, /loadRoutes\(\);\s*loadEventSummaries\(\)/);
  assert.match(source, /routeEventCount\(route\)/);
});

test("la carga de horarios reintenta respuestas vacias transitorias y conserva el ultimo estado valido", () => {
  const source = read("app/dashboard/talento-humano/rutas/page.tsx");
  assert.match(source, /for \(let attempt = 0; attempt < 3; attempt \+= 1\)/);
  assert.match(source, /window\.setTimeout\(resolve, 500\)/);
  assert.match(source, /if \(latest\) setRoutes\(latest\)/);
  assert.doesNotMatch(source, /api<TimeRoute\[]>\("\/api\/v1\/hr\/routes"[^\n]+catch\(\(\) => \[\]\)/);
});

test("el listado de horarios carga al montar sin esperar catalogos secundarios", () => {
  const source = read("app/dashboard/talento-humano/rutas/page.tsx");
  assert.match(source, /useEffect\(\(\) => \{\s*void loadRoutes\(\);\s*void loadReferenceData\(\);\s*void loadEventSummaries\(\);/);
  assert.doesNotMatch(source, /setVehicles\(vehicleData\);\s*await loadRoutes\(\);/);
  assert.match(source, /onClick=\{\(\) => \{ loadRoutes\(\); loadEventSummaries\(\);/);
});

test("el monitor solicita estado operativo fresco y conserva evidencia resumida", () => {
  const monitorSource = read("app/dashboard/talento-humano/rutas/page.tsx");
  const apiSource = read("lib/api.ts");
  assert.match(monitorSource, /operations-map[^\n]+\{ cache: "no-store" \}/);
  assert.match(monitorSource, /extra_evidence\?\.has_base64_data/);
  assert.match(apiSource, /options\.cache === "no-store"/);
  assert.match(apiSource, /!bypassReadCache/);
  assert.match(apiSource, /inFlightGetRequests\.has\(requestKey\)/);
});
