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

test("el monitor de horarios escucha refresh local y el respaldo baja de 30 segundos", () => {
  const source = read("app/dashboard/talento-humano/rutas/page.tsx");
  assert.match(source, /subscribeHrMonitorRefresh/);
  assert.match(source, /const ROUTES_BACKSTOP_POLL_MS = 30_000;/);
  assert.match(source, /window\.setInterval\(refreshVisible, ROUTES_BACKSTOP_POLL_MS\)/);
  assert.doesNotMatch(source, /window\.setInterval\(refreshVisible, 5000\)/);
  assert.match(source, /hr\/routes\/event-summaries/);
  assert.match(source, /loadRoutes\(\);\s*loadEventSummaries\(\)/);
  assert.match(source, /routeEventCount\(route\)/);
});

test("la carga de horarios pide el dia fijado y solo reintenta una peticion que no devolvio lista", () => {
  const source = read("app/dashboard/talento-humano/rutas/page.tsx");
  // El dia se baja del servidor: la pantalla ya no pide 500 horarios de todo el historial.
  assert.match(source, /hr\/routes\?limit=\$\{ROUTES_LIST_LIMIT\}\$\{dateFilter \? `&date=/);
  assert.match(source, /encodeURIComponent\(dateFilter\)/);
  // Un dia sin horarios es una respuesta valida: el reintento ciego atado a la lista vacia
  // desaparecio, y con el la espera de un segundo antes de pintar.
  assert.match(source, /for \(let attempt = 0; attempt < 2; attempt \+= 1\)/);
  assert.match(source, /if \(Array\.isArray\(data\)\) \{\s*setRoutes\(data\);\s*return;/);
  assert.doesNotMatch(source, /if \(data\.length\) \{/);
  assert.match(source, /window\.setTimeout\(resolve, 500\)/);
  assert.doesNotMatch(source, /api<TimeRoute\[]>\("\/api\/v1\/hr\/routes"[^\n]+catch\(\(\) => \[\]\)/);
});

test("la pantalla arranca fijada al dia de hoy y conserva la salida a otras fechas", () => {
  const source = read("app/dashboard/talento-humano/rutas/page.tsx");
  assert.match(source, /const \[dateFilter, setDateFilter\] = useState\(initialDate\);/);
  assert.match(source, /event-summaries\$\{dateFilter \? `\?date=/);
  // El vacio no puede mentir: si el dia fijado no trajo horarios, la pantalla lo dice.
  assert.match(source, /La pantalla esta fijada al \$\{dateFilter\}/);
  assert.match(source, /function clearFilters\(\)/);
});

test("el listado de horarios carga al montar sin esperar catalogos secundarios", () => {
  const source = read("app/dashboard/talento-humano/rutas/page.tsx");
  assert.match(source, /useEffect\(\(\) => \{\s*void loadReferenceData\(\);\s*\}, \[loadReferenceData\]\);/);
  assert.match(source, /useEffect\(\(\) => \{\s*void loadRoutes\(\);\s*void loadEventSummaries\(\);/);
  assert.doesNotMatch(source, /setVehicles\(vehicleData\);\s*await loadRoutes\(\);/);
  assert.match(source, /onClick=\{\(\) => \{ loadRoutes\(\); loadEventSummaries\(\);/);
});

test("la evidencia del timeline baja con concurrencia acotada", () => {
  const source = read("app/dashboard/talento-humano/rutas/page.tsx");
  assert.match(source, /const EVIDENCE_FETCH_CONCURRENCY = 4;/);
  assert.match(source, /if \(gate\.running < EVIDENCE_FETCH_CONCURRENCY\) start\(\);/);
  assert.match(source, /gate\.waiting\.push\(start\);/);
  assert.match(source, /queueTimelineEvidence\(event\);/);
  assert.doesNotMatch(source, /void loadTimelineEvidence\(event\);/);
});

test("el monitor solicita estado operativo fresco y conserva evidencia resumida", () => {
  const monitorSource = read("app/dashboard/talento-humano/rutas/page.tsx");
  const apiSource = read("lib/api.ts");
  assert.match(monitorSource, /operations-map[^\n]+\{ cache: "no-store" \}/);
  assert.match(monitorSource, /event\.evidence\?\.\[0\]\?\.available/);
  assert.match(monitorSource, /\/api\/v1\/hr\/monitor-evidence\/\$\{source\}\/\$\{encodeURIComponent/);
  assert.match(monitorSource, /Cargar evidencia/);
  assert.match(monitorSource, /Reintentar evidencia/);
  assert.match(apiSource, /scheduleMonitorPunchEvidenceSummary\(punch\)/);
  assert.match(apiSource, /evidence: activity\.metadata\?\.photo \? \[\{ id: activity\.id/);
  assert.match(apiSource, /options\.cache === "no-store"/);
  assert.match(apiSource, /!bypassReadCache/);
  assert.match(apiSource, /inFlightGetRequests\.has\(requestKey\)/);
});
