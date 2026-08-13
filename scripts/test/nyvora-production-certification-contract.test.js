const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const artifactDirectory = path.join(root, "apps/api/scripts/certifications");
const fixture = fs.readFileSync(path.join(artifactDirectory, "fixtures/nyvora-service-correction.js"), "utf8");
const correction = fs.readFileSync(path.join(artifactDirectory, "service-correction-evidence-nyvora.js"), "utf8");
const regression = fs.readFileSync(path.join(artifactDirectory, "platform-regression-qa.js"), "utf8");

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
  assert.match(correction, /attached\.correction\?\.status/);
  assert.match(correction, /attached\.evidence\?\.metadata\?\.authorization_id/);
});

test("la imagen API incluye los certificados canonicos y la raiz conserva compatibilidad", () => {
  const dockerfile = fs.readFileSync(path.join(root, "apps/api/Dockerfile"), "utf8");
  const dockerignore = fs.readFileSync(path.join(root, "apps/api/.dockerignore"), "utf8");
  const correctionWrapper = fs.readFileSync(path.join(root, "scripts/certifications/service-correction-evidence-nyvora.js"), "utf8");
  const regressionWrapper = fs.readFileSync(path.join(root, "scripts/certifications/platform-regression-qa.js"), "utf8");
  assert.match(dockerfile, /COPY \. \./);
  assert.doesNotMatch(dockerignore, /^scripts\s*$/m);
  assert.match(correctionWrapper, /apps\/api\/scripts\/certifications\/service-correction-evidence-nyvora/);
  assert.match(regressionWrapper, /apps\/api\/scripts\/certifications\/platform-regression-qa/);
});
