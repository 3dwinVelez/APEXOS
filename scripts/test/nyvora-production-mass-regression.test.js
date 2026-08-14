const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const source = fs.readFileSync(path.resolve(__dirname, "..", "certifications", "nyvora-production-mass-regression.js"), "utf8");
const deployedSource = fs.readFileSync(path.resolve(__dirname, "..", "..", "apps", "api", "scripts", "certifications", "nyvora-mass-regression.js"), "utf8");
const catalogSource = fs.readFileSync(path.resolve(__dirname, "..", "..", "apps", "api", "scripts", "certifications", "nyvora-mass-endpoints.js"), "utf8");

test("the Nyvora mass certificate covers every operational API family", () => {
  const endpointCount = (catalogSource.match(/"\/api\/v1\//g) || []).length;
  assert.ok(endpointCount >= 65, `Expected at least 65 endpoint checks, received ${endpointCount}.`);
  for (const module of ["admin", "inventory", "purchases", "sales", "invoicing", "accounts-receivable", "accounting", "projects", "services", "hr", "transport", "brain"]) {
    assert.match(catalogSource, new RegExp(`\\/api\\/v1\\/${module}`));
  }
  assert.match(source, /nyvora-mass-endpoints/);
  assert.match(deployedSource, /nyvora-mass-endpoints/);
});

test("the temporary certification administrator is always deactivated", () => {
  assert.match(source, /finally \{[\s\S]*active: false[\s\S]*certification_user_deactivated = true/);
  assert.match(source, /TARGET_ENV debe ser production/);
  assert.match(source, /apexos-api-prod-production\.up\.railway\.app/);
  assert.match(deployedSource, /finally \{[\s\S]*active: false[\s\S]*certification_user_deactivated = true/);
  assert.match(deployedSource, /CERTIFICATION_TARGET debe ser qa o production/);
  assert.match(deployedSource, /jbirkghkekuifgfsgquq/);
  assert.match(deployedSource, /jzbwzmkidfthknsohhnr/);
  assert.match(deployedSource, /result\.commit !== expectedCommit\.slice\(0, 12\)/);
});

test("required-parameter contracts are certified as explicit negative cases", () => {
  assert.match(catalogSource, /purchases\/orders\/open[^\n]+REQUIRED_SUPPLIER/);
  assert.match(catalogSource, /accounting\/payables\/open-invoices[^\n]+REQUIRED_SUPPLIER/);
  assert.match(catalogSource, /income-statement\?period=2026-08/);
  assert.match(catalogSource, /reports\/taxes\?period=2026-08/);
});
