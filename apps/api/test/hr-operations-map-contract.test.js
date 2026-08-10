const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const serviceSource = fs.readFileSync(path.resolve(__dirname, "../src/modules/hr/service.js"), "utf8");
const summarySource = fs.readFileSync(path.resolve(__dirname, "../src/modules/hr/routeEventSummaries.js"), "utf8");

test("operations-map no transporta evidencia fotografica completa en cada refresco", () => {
  assert.match(serviceSource, /monitorEvidenceSelect/);
  assert.match(serviceSource, /evidence: \{ select: monitorEvidenceSelect \}/);
  assert.match(serviceSource, /has_base64_data: Boolean\(base64\)/);
});

test("el listado dinamico usa agregados ligeros para todas las rutas", () => {
  assert.match(serviceSource, /async function listRouteEventSummaries/);
  assert.match(serviceSource, /timePunch\.groupBy/);
  assert.match(serviceSource, /workActivity\.groupBy/);
  assert.match(summarySource, /event_count: punchCount \+ activityCount/);
  assert.doesNotMatch(serviceSource.match(/async function listRouteEventSummaries[\s\S]*?\n}\n/)?.[0] || "", /base64_data/);
});
