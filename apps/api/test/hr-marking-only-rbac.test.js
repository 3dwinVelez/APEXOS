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

const { requireAnyPermission, requirePermission, tenantHasModule } = require("../src/middleware/rbac");

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
    tenant: { active_modules: ["M-17"] },
    user: {
      role: {
        id: 15,
        name: "Empleado marcaciones",
        metadata: { access_profile: "marking_only", scope: "company" },
        permissions
      }
    },
    params: {},
    query: {},
    body: {}
  };
}

test("time_tracking usa la habilitacion M-17 del tenant", () => {
  assert.equal(tenantHasModule({ active_modules: ["M-17"] }, "time_tracking"), true);
});

test("el rol exclusivo puede usar endpoints self de lectura y escritura", async () => {
  const request = requestFor([
    { module: "time_tracking", action: "read" },
    { module: "time_tracking", action: "write" }
  ]);
  const readReply = replyRecorder();
  const writeReply = replyRecorder();
  await requireAnyPermission([{ module: "time_tracking", action: "read" }, { module: "hr", action: "read" }])(request, readReply);
  await requireAnyPermission([{ module: "time_tracking", action: "write" }, { module: "hr", action: "write" }])(request, writeReply);
  assert.equal(readReply.statusCode, 200);
  assert.equal(writeReply.statusCode, 200);
  assert.equal(request.rbacScope.role_name, "Empleado marcaciones");
});

test("el rol exclusivo no obtiene acceso al modulo general hr", async () => {
  const request = requestFor([{ module: "time_tracking", action: "read" }]);
  const reply = replyRecorder();
  await requirePermission("hr", "read")(request, reply);
  assert.equal(reply.statusCode, 403);
  assert.equal(reply.payload.code, "PERMISO_DENEGADO");
});

test("las rutas self fuerzan identidad y las rutas generales conservan hr", () => {
  const routes = fs.readFileSync(path.resolve(__dirname, "../src/modules/hr/routes.js"), "utf8");
  const service = fs.readFileSync(path.resolve(__dirname, "../src/modules/hr/service.js"), "utf8");
  assert.match(routes, /\/hr\/self\/time-punches[\s\S]*ownWrite/);
  assert.match(routes, /\/hr\/self\/attendance[\s\S]*ownRead/);
  assert.match(routes, /\/hr\/employees[\s\S]*requirePermission\("hr", "read"\)/);
  assert.match(routes, /\/hr\/operations-map[\s\S]*requirePermission\("hr", "read"\)/);
  assert.match(service, /async function createOwnPunch[\s\S]*ownOperationalInput/);
  assert.match(service, /HORARIO_AJENO_DENEGADO/);
  assert.match(service, /CHECKLIST_AJENO_DENEGADO/);
  assert.match(service, /employee_id: employee\.id/);
});
