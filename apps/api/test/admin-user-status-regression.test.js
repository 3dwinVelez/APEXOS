const assert = require("node:assert/strict");
const test = require("node:test");

function loadSubject() {
  const prismaPath = require.resolve("../src/core/prisma");
  const authorizationPath = require.resolve("../src/security/authorizationState");
  const servicePath = require.resolve("../src/modules/admin/service");
  const calls = { lookups: [], updates: [], employeeUpdates: [], revocations: [], audits: [] };
  let active = true;
  const user = {
    id: 7,
    tenant_id: "tenant-a",
    name: "QA User",
    email: "qa.user@example.test",
    role_id: 3,
    active: true,
    role: { id: 3, name: "Empleado" },
    employee: {
      id: 17,
      active: true,
      code: "EMP-7",
      position: "QA",
      department: "QA",
      salary_base: 0,
      hire_date: new Date("2026-01-01T00:00:00Z"),
      contract_type: "indefinite",
      metadata: {}
    }
  };
  const prisma = {
    runWithTenant(tenantId, fn) {
      calls.tenantId = tenantId;
      return fn();
    },
    user: {
      async findFirstOrThrow({ where }) {
        calls.lookups.push({ ...where });
        if (where.tenant_id !== user.tenant_id) {
          const error = new Error("Record not found");
          error.code = "P2025";
          throw error;
        }
        if (!active && where.__includeInactive !== true) {
          const error = new Error("Inactive record filtered");
          error.code = "P2025";
          throw error;
        }
        return { ...user, active, employee: { ...user.employee, active } };
      },
      async update({ where, data }) {
        calls.updates.push({ where, data });
        active = data.active;
        return { ...user, active };
      }
    },
    employee: {
      async update(args) {
        calls.employeeUpdates.push(args);
        return { ...user.employee, active: args.data.active };
      }
    },
    auditLog: {
      async create(args) {
        calls.audits.push(args);
        return args.data;
      }
    }
  };
  const authorizationState = {
    async revokeAllUserSessions(userId, reason) {
      calls.revocations.push({ userId, reason });
    }
  };

  require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: prisma };
  require.cache[authorizationPath] = { id: authorizationPath, filename: authorizationPath, loaded: true, exports: authorizationState };
  delete require.cache[servicePath];
  const service = require(servicePath);
  return { service, calls };
}

test("desactivar usuario responde con el registro inactivo y revoca sesiones", async () => {
  const { service, calls } = loadSubject();
  const result = await service.setUserActive("tenant-a", 7, false, 99);

  assert.equal(result.id, 7);
  assert.equal(result.active, false);
  assert.equal(result.user_status, "inactivo");
  assert.deepEqual(calls.revocations, [{ userId: 7, reason: "user_deactivated" }]);
  assert.equal(calls.updates[0].data.active, false);
  assert.equal(calls.employeeUpdates[0].data.active, false);
  assert.equal(calls.audits[0].data.action, "deactivated");
  assert.equal(calls.lookups.at(-1).__includeInactive, true);
});

test("el cambio de estado no puede operar sobre un usuario de otro tenant", async () => {
  const { service, calls } = loadSubject();

  await assert.rejects(
    service.setUserActive("tenant-b", 7, false, 99),
    (error) => error.code === "P2025"
  );
  assert.equal(calls.updates.length, 0);
  assert.equal(calls.revocations.length, 0);
  assert.equal(calls.audits.length, 0);
});

test("la ruta publica el resultado exitoso del servicio sin convertirlo en 404", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const source = fs.readFileSync(path.resolve(__dirname, "../src/modules/admin/routes.js"), "utf8");
  assert.match(source, /patch\("\/admin\/users\/:id\/status"[\s\S]*service\.setUserActive/);
});

test("reactivar un usuario inactivo opera sobre el mismo id que se desactivó", async () => {
  const { service, calls } = loadSubject();

  const desactivado = await service.setUserActive("tenant-a", 7, false, 99);
  assert.equal(desactivado.active, false);

  const reactivado = await service.setUserActive("tenant-a", 7, true, 99);
  assert.equal(reactivado.id, 7);
  assert.equal(reactivado.active, true);
  assert.equal(reactivado.user_status, "activo");
  assert.deepEqual(calls.revocations.map((revocation) => revocation.reason), [
    "user_deactivated",
    "user_reactivated"
  ]);
  assert.deepEqual(calls.audits.map((audit) => audit.data.action), ["deactivated", "activated"]);
  for (const lookup of calls.lookups) {
    assert.equal(lookup.__includeInactive, true, "una cuenta inactiva debe ser legible para revertirla");
  }
});

test("el bloqueo de acceso de una cuenta inactiva no se pierde en un 404 al leerla", async () => {
  const { service, calls } = loadSubject();

  await service.setUserActive("tenant-a", 7, false, 99);
  const result = await service.updateUserAccess("tenant-a", 7, { session_status: "bloqueada", active: false }, 99);

  assert.equal(result.id, 7);
  assert.equal(result.active, false);
  assert.equal(calls.employeeUpdates.at(-1).data.metadata.access.session_status, "bloqueada");
});

test("inactivar desde el acceso responde con la fila escrita, no con un 404 posterior", async () => {
  const { service, calls } = loadSubject();

  const result = await service.updateUserAccess("tenant-a", 7, { active: false }, 99);

  assert.equal(result.active, false, "la lectura de cierre debe ver la cuenta que acaba de inactivar");
  assert.equal(calls.audits.at(-1).data.action, "access_updated");
});

test("toda lectura de cuenta en administracion ve la inactiva y conserva su tenant", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const source = fs.readFileSync(path.resolve(__dirname, "../src/modules/admin/service.js"), "utf8");
  const lecturas = source
    .split(/\r?\n/)
    .filter((line) => line.includes("prisma.user.findFirstOrThrow("));

  assert.ok(lecturas.length >= 10, `se esperaban las lecturas de cuenta conocidas, hay ${lecturas.length}`);
  for (const linea of lecturas) {
    assert.match(linea, /__includeInactive: true/, `lectura ciega ante cuentas inactivas: ${linea.trim()}`);
    assert.match(linea, /tenant_id/, `ninguna lectura de cuenta puede soltar el filtro de tenant: ${linea.trim()}`);
  }
});
