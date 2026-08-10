const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const serviceSource = fs.readFileSync(path.resolve(__dirname, "../src/modules/hr/service.js"), "utf8");

test("operations-map no transporta evidencia fotografica completa en cada refresco", () => {
  assert.match(serviceSource, /monitorEvidenceSelect/);
  assert.match(serviceSource, /evidence: \{ select: monitorEvidenceSelect \}/);
  assert.match(serviceSource, /has_base64_data: Boolean\(base64\)/);
});
