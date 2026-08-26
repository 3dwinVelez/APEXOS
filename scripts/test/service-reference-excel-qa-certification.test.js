const test = require("node:test");
const assert = require("node:assert/strict");
const { assertQaUrl, importRow } = require("../certifications/service-reference-excel-qa");

test("la certificacion solo permite destinos QA HTTPS", () => {
  const previous = process.env.TARGET_ENV;
  process.env.TARGET_ENV = "qa";
  assert.equal(assertQaUrl("QA_API_URL", "https://api.qa.apexos.example/"), "https://api.qa.apexos.example");
  assert.throws(() => assertQaUrl("QA_API_URL", "https://api.production.example"), /productiva/);
  assert.throws(() => assertQaUrl("QA_API_URL", "http://api.qa.example"), /HTTPS/);
  assert.throws(() => assertQaUrl("QA_API_URL", "http://localhost:3100"), /ALLOW_LOCAL_CANDIDATE/);
  process.env.ALLOW_LOCAL_CANDIDATE = "true";
  assert.equal(assertQaUrl("QA_API_URL", "http://localhost:3100/"), "http://localhost:3100");
  delete process.env.ALLOW_LOCAL_CANDIDATE;
  if (previous === undefined) delete process.env.TARGET_ENV;
  else process.env.TARGET_ENV = previous;
});

test("el registro certificable cumple el contrato completo de importacion", () => {
  const row = importRow("QA-XLSX-001");
  assert.equal(row.active, true);
  assert.equal(row.part_quantity, 1);
  assert.match(row.manual_url, /^https:\/\//);
  assert.deepEqual(Object.keys(row), ["code", "name", "category", "description", "estimated_minutes", "brand", "model", "active", "part_name", "part_quantity", "part_unit", "part_description", "manual_title", "manual_url", "manual_notes"]);
});
