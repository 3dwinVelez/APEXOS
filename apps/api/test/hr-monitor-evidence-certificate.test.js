const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const source = fs.readFileSync(path.resolve(__dirname, "../../../scripts/certifications/hr-monitor-evidence-qa.js"), "utf8");

test("el certificado QA recorre monitor, carga bajo demanda y negativas", () => {
  assert.match(source, /route_events_registered/);
  assert.match(source, /monitor_activity_visible/);
  assert.match(source, /monitor_payload_is_lightweight/);
  assert.match(source, /evidence_loaded_on_demand/);
  assert.match(source, /authentication_required/);
  assert.match(source, /activity_evidence_binding_enforced/);
  assert.match(source, /invalid_identifier_rejected/);
  assert.match(source, /deployed_commit/);
});

test("el certificado no persiste el contenido fotografico en la evidencia JSON", () => {
  assert.match(source, /encoded_length: base64Data\.length/);
  assert.doesNotMatch(source, /detail\.body\.base64_data\s*[,}]/);
});
