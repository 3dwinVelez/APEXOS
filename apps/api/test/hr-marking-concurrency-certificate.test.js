const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const source = fs.readFileSync(path.resolve(__dirname, "../scripts/certifications/hr-marking-concurrency-qa.js"), "utf8");

test("el certificador masivo exige QA, SHA exacto y niveles 20/50/100", () => {
  assert.match(source, /CERTIFICATION_TARGET/);
  assert.match(source, /\["local", "qa"\]/);
  assert.match(source, /DATABASE_URL debe ser local/);
  assert.match(source, /apexos-api-qa-production/);
  assert.match(source, /CERTIFICATION_EXPECTED_COMMIT/);
  assert.match(source, /20,50,100/);
  assert.match(source, /deployed_commit/);
  assert.match(source, /\/api\/v1\/auth\/login/);
  assert.match(source, /\/api\/v1\/hr\/self\/time-punches/);
  assert.match(source, /AbortSignal\.timeout/);
});

test("el certificador comprueba idempotencia, perdida, duplicados y horario del dia", () => {
  assert.match(source, /idempotent_replays/);
  assert.match(source, /duplicates/);
  assert.match(source, /lost/);
  assert.match(source, /route_visibility_today_only/);
  assert.match(source, /self\/routes expuso un horario fuera del dia actual/);
});

test("el certificador limpia eventos y desactiva identidades aun ante fallo", () => {
  assert.match(source, /finally/);
  assert.match(source, /timePunch\.deleteMany/);
  assert.match(source, /timeRoute\.deleteMany/);
  assert.match(source, /active: false/);
  assert.match(source, /events_and_routes_deleted_certification_identities_deactivated/);
});
