const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("el contenedor API instala la dependencia de métricas en su propio workspace", () => {
  const packageJson = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../package.json"), "utf8"));
  assert.equal(packageJson.dependencies?.["prom-client"], "^15.1.3");
  assert.doesNotThrow(() => require("prom-client"));
});

test("commitments y visits estan montadas en /api/v1 y bloquean acceso anonimo", {
  skip: process.env.COMMERCIAL_ROUTE_INTEGRATION !== "1"
}, async () => {
  process.env.NODE_ENV = "test";
  process.env.REDIS_DISABLED = "true";
  process.env.DISABLE_REDIS = "true";
  process.env.JWT_SECRET ||= "commercial-route-certification-secret-with-32-characters";
  const build = require("../server");
  const app = await build();
  try {
    await app.ready();
    for (const url of [
      "/api/v1/commercial-management/commitments",
      "/api/v1/commercial-management/visits"
    ]) {
      const response = await app.inject({ method: "GET", url });
      assert.notEqual(response.statusCode, 404, `${url} no puede quedar sin registrar`);
      assert.equal(response.statusCode, 401, `${url} debe exigir autenticacion`);
    }
  } finally {
    await app.close();
  }
});
