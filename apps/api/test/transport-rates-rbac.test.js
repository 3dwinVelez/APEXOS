const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const prismaPath = require.resolve("../src/core/prisma");
require.cache[prismaPath] = {
  id: prismaPath,
  filename: prismaPath,
  loaded: true,
  exports: {}
};

const { requireAnyPermission } = require("../src/middleware/rbac");

function replyRecorder() {
  return {
    statusCode: 200,
    payload: null,
    code(statusCode) {
      this.statusCode = statusCode;
      return this;
    },
    send(payload) {
      this.payload = payload;
      return payload;
    }
  };
}

function requestFor(permissions) {
  return {
    tenant: { active_modules: ["M-14"] },
    user: {
      role: {
        id: 21,
        name: "Analista tarifario",
        metadata: { scope: "company" },
        permissions
      }
    },
    params: {},
    query: {},
    body: {}
  };
}

const ratesGuard = () => requireAnyPermission([{ module: "transport", action: "write" }, { module: "transport", action: "manage_rates" }]);

test("el permiso dedicado manage_rates habilita la edicion de tarifarios sin escritura general", async () => {
  const request = requestFor([{ module: "transport", action: "read" }, { module: "transport", action: "manage_rates" }]);
  const reply = replyRecorder();
  await ratesGuard()(request, reply);
  assert.equal(reply.statusCode, 200);
  assert.equal(request.rbacScope.role_name, "Analista tarifario");
});

test("la escritura general de transporte sigue autorizando la edicion de tarifarios", async () => {
  const request = requestFor([{ module: "transport", action: "read" }, { module: "transport", action: "write" }]);
  const reply = replyRecorder();
  await ratesGuard()(request, reply);
  assert.equal(reply.statusCode, 200);
});

test("la sola lectura de transporte no autoriza la edicion de tarifarios", async () => {
  const request = requestFor([{ module: "transport", action: "read" }]);
  const reply = replyRecorder();
  await ratesGuard()(request, reply);
  assert.equal(reply.statusCode, 403);
  assert.equal(reply.payload.code, "PERMISO_DENEGADO");
});

test("las mutaciones de tarifarios usan el guard combinado write o manage_rates", () => {
  const routes = fs.readFileSync(path.resolve(__dirname, "../src/modules/transport/routes.js"), "utf8");
  assert.match(routes, /requireAnyPermission\(\[\{ module: "transport", action: "write" \}, \{ module: "transport", action: "manage_rates" \}\]\)/);
  assert.match(routes, /put\("\/transport\/rate-cards\/:id"[\s\S]*?ratesWrite/);
  assert.match(routes, /post\("\/transport\/rate-cards\/:id\/versions"[\s\S]*?ratesWrite/);
  assert.match(routes, /post\("\/transport\/rate-cards\/:id\/activate"[\s\S]*?ratesWrite/);
  assert.match(routes, /post\("\/transport\/rate-cards\/:id\/deactivate"[\s\S]*?ratesWrite/);
  assert.match(routes, /post\("\/transport\/rate-cards"[\s\S]*?requirePermission\("transport", "write"\)/);
});

test("el catalogo de roles expone manage_rates para el modulo transporte", () => {
  const adminService = fs.readFileSync(path.resolve(__dirname, "../src/modules/admin/service.js"), "utf8");
  const transporteRow = adminService.match(/\{ key: "transporte"[\s\S]*?\}/);
  assert.ok(transporteRow);
  assert.match(transporteRow[0], /"manage_rates"/);
  assert.match(transporteRow[0], /grants: grants\("transport", \[[\s\S]*"manage_rates"[\s\S]*\]\)/);
});
