const assert = require("node:assert/strict");
const bcrypt = require("bcrypt");
const test = require("node:test");

// C-04 del plan candado: tener `users:create`/`users:edit` no autoriza a
// entregar el rol APEX_ADMIN ni a cambiar la clave de otra cuenta. El permiso
// de la matriz se queda corto frente a la apropiacion de una cuenta, asi que
// el servicio exige dos cosas que la ruta no puede aportar por si sola:
//   1. que el actor sea APEX_ADMIN para asignar un rol de superadministrador;
//   2. que el actor pruebe su propia clave (428 si falta, 403 si no coincide)
//      antes de escribir la clave de otro usuario.

const TARGET_PASSWORD = "ClaveObjetivo1";
const ACTOR_PASSWORD = "ClaveAdmin1";

function strictRole(overrides = {}) {
  return {
    id: 1,
    tenant_id: "tenant-a",
    name: "APEX_ADMIN",
    metadata: { role_type: "superadmin", active: true },
    ...overrides
  };
}

function ordinaryRole(overrides = {}) {
  return {
    id: 3,
    tenant_id: "tenant-a",
    name: "Empleado",
    metadata: { role_type: "custom", active: true },
    ...overrides
  };
}

function targetUser() {
  return {
    id: 42,
    tenant_id: "tenant-a",
    name: "Usuario Objetivo",
    email: "objetivo@example.test",
    role_id: 3,
    active: true,
    password: "hash-interno-no-usado",
    preferences: {},
    role: ordinaryRole(),
    employee: {
      id: 7,
      code: "EMP-42",
      position: "Analista",
      department: "Administracion",
      salary_base: 0,
      salary_type: "monthly",
      hire_date: new Date("2026-01-01T00:00:00Z"),
      end_date: null,
      contract_type: "indefinite",
      active: true,
      user_type: "empleado",
      metadata: { company: "APEX", document: "1020304050" }
    }
  };
}

function loadSubject({ role = ordinaryRole(), actor = null } = {}) {
  const prismaPath = require.resolve("../src/core/prisma");
  const authorizationPath = require.resolve("../src/security/authorizationState");
  const supabasePath = require.resolve("../src/security/supabaseAdminCredentials");
  const servicePath = require.resolve("../src/modules/admin/service");
  const calls = { userCreates: [], userUpdates: [], employeeUpdates: [], audits: [], revocations: [] };
  const target = targetUser();

  const prisma = {
    runWithTenant(_tenantId, fn) {
      return fn();
    },
    tenant: {
      async findUnique() {
        return { active_modules: [] };
      }
    },
    role: {
      // ensureSystemRoles pregunta que plantillas existen y crea las que faltan.
      // Devolver exactamente las consultadas evita altas colaterales en la prueba.
      async findMany({ where }) {
        return (where?.name?.in || []).map((name) => ({ name }));
      },
      async findFirst() {
        return role;
      }
    },
    user: {
      async findFirst({ where }) {
        if (where?.email) return null;
        if (actor && where?.id === actor.id) return actor;
        return null;
      },
      async findFirstOrThrow() {
        return target;
      },
      async create(args) {
        calls.userCreates.push(args);
        return {
          ...target,
          ...args.data,
          role,
          employee: { ...target.employee, metadata: args.data?.employee?.create?.metadata || {} }
        };
      },
      async update(args) {
        calls.userUpdates.push(args);
        return { ...target, ...args.data };
      }
    },
    employee: {
      async update(args) {
        calls.employeeUpdates.push(args);
        return target.employee;
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
  const supabaseCredentials = {
    credentialPatch() {
      return { changed: false, payload: {} };
    },
    async syncSupabaseCredentials() {
      return { changed: false, provider: null };
    }
  };

  require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: prisma };
  require.cache[authorizationPath] = { id: authorizationPath, filename: authorizationPath, loaded: true, exports: authorizationState };
  require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: supabaseCredentials };
  delete require.cache[servicePath];
  return { service: require(servicePath), calls };
}

async function actorFixture() {
  return { id: 99, tenant_id: "tenant-a", name: "Actor Admin", email: "actor@example.test", active: true, password: await bcrypt.hash(ACTOR_PASSWORD, 12) };
}

function createInput(roleId) {
  return {
    name: "Usuario Nuevo",
    email: "nuevo@example.test",
    role_id: roleId,
    company: "APEX",
    document: "1020304050",
    password: "ClaveInicial1"
  };
}

test("un administrador de empresa no puede crear un usuario con rol APEX_ADMIN", async () => {
  const { service, calls } = loadSubject({ role: strictRole() });

  await assert.rejects(
    service.createUser("tenant-a", createInput(1), 99, "Administrador de empresa"),
    (error) => error.statusCode === 403 && /superadministrador/.test(error.message)
  );
  assert.equal(calls.userCreates.length, 0, "el usuario no debe crearse con un rol que el actor no puede asignar");
});

test("el rol se bloquea por metadata superadmin aunque el nombre sea otro", async () => {
  const { service, calls } = loadSubject({ role: strictRole({ name: "Administrador maestro", metadata: { role_type: "superadmin", active: true } }) });

  await assert.rejects(
    service.createUser("tenant-a", createInput(1), 99, "Administrador de empresa"),
    (error) => error.statusCode === 403
  );
  assert.equal(calls.userCreates.length, 0);
});

test("APEX_ADMIN puede crear usuarios con el rol APEX_ADMIN y la clave se guarda hasheada", async () => {
  const { service, calls } = loadSubject({ role: strictRole() });

  await service.createUser("tenant-a", createInput(1), 99, "APEX_ADMIN");

  assert.equal(calls.userCreates.length, 1);
  assert.equal(calls.userCreates[0].data.role_id, 1);
  assert.match(calls.userCreates[0].data.password, /^\$2[aby]\$/);
  assert.notEqual(calls.userCreates[0].data.password, "ClaveInicial1");
});

test("un administrador de empresa no puede elevar a APEX_ADMIN con updateUser", async () => {
  const { service, calls } = loadSubject({ role: strictRole() });

  await assert.rejects(
    service.updateUser("tenant-a", 42, { role_id: 1 }, 99, "Administrador de empresa"),
    (error) => error.statusCode === 403
  );
  assert.equal(calls.userUpdates.length, 0);
});

test("cambiar la clave de otro usuario sin confirmar la propia responde 428", async () => {
  const { service, calls } = loadSubject({ actor: await actorFixture() });

  await assert.rejects(
    service.updateUser("tenant-a", 42, { password: TARGET_PASSWORD }, 99, "Administrador de empresa"),
    (error) => error.statusCode === 428 && /clave actual/.test(error.message)
  );
  assert.equal(calls.userUpdates.length, 0, "sin re-autenticacion no se escribe ninguna clave");
});

test("cambiar la clave con una clave de administrador incorrecta responde 403", async () => {
  const { service, calls } = loadSubject({ actor: await actorFixture() });

  await assert.rejects(
    service.updateUser("tenant-a", 42, { password: TARGET_PASSWORD, current_password: "NoEsMiClave1" }, 99, "Administrador de empresa"),
    (error) => error.statusCode === 403 && /no coincide/.test(error.message)
  );
  assert.equal(calls.userUpdates.length, 0);
});

test("con la clave correcta se escribe el hash y nunca la clave en claro", async () => {
  const { service, calls } = loadSubject({ actor: await actorFixture() });

  await service.updateUser("tenant-a", 42, { password: TARGET_PASSWORD, current_password: ACTOR_PASSWORD }, 99, "Administrador de empresa");

  assert.equal(calls.userUpdates.length, 1);
  const written = calls.userUpdates[0].data.password;
  assert.match(written, /^\$2[aby]\$/);
  assert.notEqual(written, TARGET_PASSWORD);
  assert.equal(await bcrypt.compare(TARGET_PASSWORD, written), true);
});

test("la ruta de acceso aplica la misma re-autenticacion antes de cambiar la clave", async () => {
  const { service, calls } = loadSubject({ actor: await actorFixture() });

  await assert.rejects(
    service.updateUserAccess("tenant-a", 42, { password: TARGET_PASSWORD }, 99),
    (error) => error.statusCode === 428
  );
  await assert.rejects(
    service.updateUserAccess("tenant-a", 42, { password: TARGET_PASSWORD, current_password: "OtraClave1" }, 99),
    (error) => error.statusCode === 403
  );
  assert.equal(calls.userUpdates.length, 0);
});
