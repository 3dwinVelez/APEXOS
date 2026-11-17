const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const serviceSource = fs.readFileSync(path.resolve(__dirname, "../src/modules/hr/service.js"), "utf8");
const routesSource = fs.readFileSync(path.resolve(__dirname, "../src/modules/hr/routes.js"), "utf8");
const summarySource = fs.readFileSync(path.resolve(__dirname, "../src/modules/hr/routeEventSummaries.js"), "utf8");

test("operations-map no transporta evidencia fotografica completa en cada refresco", () => {
  assert.match(serviceSource, /monitorEvidenceSelect/);
  assert.match(serviceSource, /evidence: \{ select: monitorEvidenceSelect \}/);
  assert.match(serviceSource, /const available = Boolean\(base64 \|\| fileUrl \|\| fileName \|\| evidence\.storage_path \|\| evidenceId\)/);
  assert.doesNotMatch(JSON.stringify(serviceSource.match(/const monitorEvidenceSelect = \{[\s\S]*?\n\};/)?.[0] || ""), /base64_data/);
  // El mapa se repite cada 5 s desde el monitor, asi que la lectura de marcaciones del dia
  // no puede traer los bytes NI abrir el jsonb tostado para recortarlos: solo declara que la
  // evidencia existe y la pantalla la pide por id al abrirla (monitorEvidenceRows).
  const mapSource = serviceSource.match(/async function getOperationsMap[\s\S]*?(?=\r?\nasync function )/)?.[0] || "";
  assert.match(mapSource, /monitorEvidenceRows\.readDayEvidencePunches/);
  assert.doesNotMatch(mapSource, /prisma\.timePunch\.findMany/);
  assert.match(mapSource, /monitorPunchEvidenceFlag\(punch\)/, "el mapa vuelve a construir el resumen desde los bytes");
  assert.equal((mapSource.match(/monitorPunchEvidence\(punch/g) || []).length, 0);
});

test("la evidencia completa se consulta bajo demanda con permiso HR y aislamiento de tenant", () => {
  assert.match(routesSource, /\/hr\/monitor-evidence\/:source\/:id/);
  assert.match(routesSource, /requirePermission\("hr", "read"\)/);
  assert.match(serviceSource, /async function getMonitorEvidence\(tenantId, source, id\)/);
  assert.match(serviceSource, /tenant_id: tenantId, activity: \{ tenant_id: tenantId \}/);
  assert.match(serviceSource, /timePunch\.findFirst\(\{ where: \{ id: evidenceId, tenant_id: tenantId \} \}\)/);
  assert.match(serviceSource, /EVIDENCIA_MONITOR_NO_ENCONTRADA/);
});

test("el listado dinamico usa agregados ligeros para todas las rutas", () => {
  const listingSource = serviceSource.match(/async function listRouteEventSummaries[\s\S]*?(?=\r?\nasync function listEmployees)/)?.[0] || "";
  assert.match(serviceSource, /async function listRouteEventSummaries/);
  assert.match(serviceSource, /timePunch\.groupBy/);
  assert.match(serviceSource, /workActivity\.groupBy/);
  assert.match(summarySource, /event_count: punchCount \+ activityCount/);
  assert.match(listingSource, /return prisma\.runWithTenant/);
  assert.doesNotMatch(listingSource, /base64_data/);
});
