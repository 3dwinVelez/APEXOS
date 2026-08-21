const test = require("node:test");
const assert = require("node:assert/strict");
const { argsFrom, assertSafeTarget } = require("../../../scripts/seed-consignment-sales-demo");

test("el seed interpreta vista previa, tenant, cantidad y confirmaciones explicitas", () => {
  assert.deepEqual(argsFrom(["--tenant", "qa.local", "--count=4", "--apply", "--allow-shared-qa"]), {
    tenant: "qa.local",
    count: "4",
    apply: true,
    "allow-shared-qa": true
  });
});

test("el seed admite base local sin confirmacion de entorno compartido", () => {
  assert.doesNotThrow(() => assertSafeTarget({}, { DATABASE_URL: "postgresql://user:pass@127.0.0.1:5432/apex_test", NODE_ENV: "test" }));
});

test("el seed bloquea una base compartida sin confirmacion explicita", () => {
  assert.throws(
    () => assertSafeTarget({}, { DATABASE_URL: "postgresql://user:pass@qa-db.example.test:5432/apex", TARGET_ENV: "qa" }),
    /--allow-shared-qa/
  );
});

test("el seed bloquea produccion incluso con confirmacion de QA", () => {
  assert.throws(
    () => assertSafeTarget({ "allow-shared-qa": true }, { DATABASE_URL: "postgresql://user:pass@prod-db.example.test:5432/apex", TARGET_ENV: "production" }),
    /no puede ejecutarse contra produccion/
  );
});
