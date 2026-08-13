const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const fixture = fs.readFileSync(path.join(root, "scripts/certifications/fixtures/nyvora-service-correction.js"), "utf8");
const correction = fs.readFileSync(path.join(root, "scripts/certifications/service-correction-evidence-nyvora.js"), "utf8");
const regression = fs.readFileSync(path.join(root, "scripts/certifications/platform-regression-qa.js"), "utf8");

test("Nyvora habilita lecturas transversales sin ampliar el rol limitado", () => {
  for (const permission of ['["hr", "read"]', '["inventory", "read"]', '["accounting", "read"]']) {
    assert.match(fixture, new RegExp(permission.replace(/[\[\]"]/g, "\\$&")));
  }
  assert.match(fixture, /const limitedPermissions = \[\["services", "read"\], \["services", "write"\]\]/);
});

test("los certificados identifican QA o produccion y validan el commit", () => {
  assert.match(correction, /CERTIFICATION_ENVIRONMENT/);
  assert.match(regression, /CERTIFICATION_ENVIRONMENT/);
  assert.match(regression, /bootstrapNyvoraFixture/);
  assert.match(regression, /expectedCommit\.slice\(0, 12\)/);
  assert.match(correction, /assert\.notEqual\(tenantId\(otherTenantSession\), tenantId\(session\)/);
  assert.doesNotMatch(correction, /doesNotMatch\(JSON\.stringify\(otherTenantSession\)/);
});
