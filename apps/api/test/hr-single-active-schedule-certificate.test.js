const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const source = fs.readFileSync(path.resolve(__dirname, "../scripts/certifications/hr-single-active-schedule-qa.js"), "utf8");

test("el certificador exige QA, SCJ y el commit desplegado exacto", () => {
  assert.match(source, /apexos-api-qa-production/);
  assert.match(source, /jbirkghkekuifgfsgquq/);
  assert.match(source, /cbbf3627-4336-4f23-95c6-1077414bcd17/);
  assert.match(source, /EXPECTED_COMMIT\.slice\(0, 12\)/);
});

test("el certificador prueba exposicion unica y rechazo del horario alterno", () => {
  assert.match(source, /routes_visible/);
  assert.match(source, /HORARIO_NO_ACTIVO/);
  assert.match(source, /active_route_marked/);
});

test("el certificador limpia eventos y rutas temporales aun ante error", () => {
  assert.match(source, /finally/);
  assert.match(source, /timePunch\.deleteMany/);
  assert.match(source, /timeRoute\.deleteMany/);
  assert.match(source, /identity_deactivated/);
});
