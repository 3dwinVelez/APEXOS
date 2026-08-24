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
  assert.match(serviceSource, /async function listRouteEventSummaries/);
  assert.match(serviceSource, /timePunch\.groupBy/);
  assert.match(serviceSource, /workActivity\.groupBy/);
  assert.match(summarySource, /event_count: punchCount \+ activityCount/);
  assert.doesNotMatch(serviceSource.match(/async function listRouteEventSummaries[\s\S]*?\n}\n/)?.[0] || "", /base64_data/);
});
