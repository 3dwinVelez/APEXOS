const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const source = fs.readFileSync(path.resolve(__dirname, "..", "certifications", "nyvora-production-mass-regression.js"), "utf8");

test("the Nyvora mass certificate covers every operational API family", () => {
  const endpointCount = (source.match(/"\/api\/v1\//g) || []).length;
  assert.ok(endpointCount >= 65, `Expected at least 65 endpoint checks, received ${endpointCount}.`);
  for (const module of ["admin", "inventory", "purchases", "sales", "invoicing", "accounts-receivable", "accounting", "projects", "services", "hr", "transport", "brain"]) {
    assert.match(source, new RegExp(`\\/api\\/v1\\/${module}`));
  }
});

test("the temporary certification administrator is always deactivated", () => {
  assert.match(source, /finally \{[\s\S]*active: false[\s\S]*certification_user_deactivated = true/);
  assert.match(source, /TARGET_ENV debe ser production/);
  assert.match(source, /apexos-api-prod-production\.up\.railway\.app/);
});

test("required-parameter contracts are certified as explicit negative cases", () => {
  assert.match(source, /purchases\/orders\/open[^\n]+REQUIRED_SUPPLIER/);
  assert.match(source, /accounting\/payables\/open-invoices[^\n]+REQUIRED_SUPPLIER/);
  assert.match(source, /income-statement\?period=2026-08/);
  assert.match(source, /reports\/taxes\?period=2026-08/);
});
