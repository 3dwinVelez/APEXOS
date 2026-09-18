const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const scriptPath = path.resolve(__dirname, "../certifications/erp-module-recovery-qa.js");
const source = fs.readFileSync(scriptPath, "utf8");
const { READONLY_NEGATIVES, READS, assertQaUrl, collection } = require(scriptPath);

test("el certificador rechaza destinos que no sean QA HTTPS", () => {
  const previous = process.env.TARGET_ENV;
  process.env.TARGET_ENV = "qa";
  try {
    assert.equal(assertQaUrl("QA_API_URL", "https://api.qa.apexos.example/"), "https://api.qa.apexos.example");
    assert.throws(() => assertQaUrl("QA_API_URL", "http://api.qa.apexos.example"), /HTTPS/);
    assert.throws(() => assertQaUrl("QA_API_URL", "https://api.production.apexos.example"), /productiva/);
  } finally {
    if (previous === undefined) delete process.env.TARGET_ENV;
    else process.env.TARGET_ENV = previous;
  }
});

test("el catalogo cubre los cinco modulos y la dependencia CxC", () => {
  const endpoints = READS.map((entry) => entry[1]).join("\n");
  for (const prefix of ["/inventory/", "/purchases/", "/sales/", "/treasury/", "/accounting/", "/accounts-receivable/"]) {
    assert.match(endpoints, new RegExp(prefix.replaceAll("/", "\\/")));
  }
  assert.equal(READONLY_NEGATIVES.length, 5);
});

test("normaliza contenedores historicos sin aceptar objetos vacios", () => {
  assert.deepEqual(collection([1]), [1]);
  assert.deepEqual(collection({ data: [2] }), [2]);
  assert.deepEqual(collection({ payments: [3] }), [3]);
  assert.equal(collection({}), null);
});

test("exige commit desplegado, RBAC, aislamiento y no registra secretos", () => {
  for (const marker of ["QA_EXPECTED_COMMIT", "authentication_required", "cross_tenant_denied", "credentials_recorded: false"]) {
    assert.match(source, new RegExp(marker));
  }
  assert.doesNotMatch(source, /evidence\.(password|token|anonKey)/);
});
