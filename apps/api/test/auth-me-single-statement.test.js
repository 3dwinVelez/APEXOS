const assert = require("node:assert/strict");
const test = require("node:test");

process.env.DISABLE_REDIS = "true";

// El piso de una peticion autenticada es por viaje al pooler (~660 ms medidos desde Railway el
// 2026-11-24), y `/auth/me` lo paga en cada apertura de pantalla: el dashboard lo consulta desde
// `apps/web/lib/moduleAccess.ts`. Esta prueba fija que la respuesta sale de la MISMA sentencia que
// ya decidio la autorizacion (`AUTHORIZATION_SNAPSHOT`) y no de cuatro lecturas `include`.

const prismaPath = require.resolve("../src/core/prisma");
const queuesPath = require.resolve("../src/fabric/queues");
const accountingPath = require.resolve("../src/modules/accounting/service");
const servicePath = require.resolve("../src/modules/auth/service");
// `authorizationState` captura `core/prisma` al cargarse: si no se desmonta junto con el servicio,
// el segundo test sigue viendo el stub del primero y los fixtures distintos (cuenta inactiva, sin
// fila) no pueden ejercitarse.
const statePath = require.resolve("../src/security/authorizationState");

const HASH = "$2b$12$S36X7Uc8tRh0EPeuWmminO0Ne4xKFPVqp94hVC14zntOU4K1R3PLO";

function fixtureUser(overrides = {}) {
  return {
    id: 7,
    name: "Usuario Prueba",
    email: "activo@example.test",
    tenant_id: 41,
    active: true,
    authorization_version: 3,
    password: HASH,
    role_id: 2,
    preferences: { company_id: "c-9", tema: "oscuro" },
    ...overrides
  };
}

function makePrisma(overrides = {}) {
  const llamadas = { raw: [], userFindUnique: 0, tenantFindUnique: 0, userFindMany: 0 };
  const user = overrides.user === null ? null : fixtureUser(overrides.user || {});
  const tenant = overrides.tenant === null ? null : {
    id: 41,
    name: "Empresa A",
    active: true,
    industry: "Importaciones",
    country: "CO",
    currency: "COP",
    active_modules: ["M-04", "M-22"],
    config: { company_id: "c-9" },
    authorization_version: 5,
    ...(overrides.tenant || {})
  };
  const prisma = {
    async $queryRawUnsafe(sql, sid, uid) {
      llamadas.raw.push({ sql, sid, uid });
      if (!user || user.id !== uid) return [];
      const { role, ...columns } = user;
      return [{
        user: columns,
        role: role || { id: user.role_id, name: "Tecnico", permissions: [{ code: "hr.read" }], metadata: { nivel: 2 } },
        tenant,
        session: null
      }];
    },
    user: {
      async findUnique(args) { llamadas.userFindUnique += 1; return user; },
      async findMany(args) { llamadas.userFindMany += 1; return []; }
    },
    tenant: { async findUnique() { llamadas.tenantFindUnique += 1; return tenant; } }
  };
  return { prisma, llamadas };
}

function loadAuthService(fakePrisma) {
  const cache = [prismaPath, queuesPath, accountingPath, statePath, servicePath].map((id) => [id, require.cache[id]]);
  require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: fakePrisma };
  require.cache[queuesPath] = { id: queuesPath, filename: queuesPath, loaded: true, exports: {} };
  require.cache[accountingPath] = { id: accountingPath, filename: accountingPath, loaded: true, exports: {} };
  delete require.cache[statePath];
  delete require.cache[servicePath];
  const service = require(servicePath);
  return {
    service,
    restore() {
      delete require.cache[servicePath];
      for (const [id, previous] of cache) {
        if (previous) require.cache[id] = previous;
        else delete require.cache[id];
      }
    }
  };
}

test("me resuelve el perfil en una sola sentencia y no vuelve a leer usuario ni tenant", async () => {
  const { prisma, llamadas } = makePrisma();
  const { service, restore } = loadAuthService(prisma);
  try {
    const result = await service.me({ id: 7 });
    assert.equal(llamadas.raw.length, 1, `/auth/me volvió a pagar ${llamadas.raw.length} sentencias crudas`);
    assert.equal(llamadas.userFindUnique, 0, "me() sigue leyendo el usuario con include aparte");
    assert.equal(llamadas.tenantFindUnique, 0, "me() sigue leyendo el tenant con una sentencia aparte");
    // La sentencia usada es la de autorizacion: la misma que ya corrio el middleware.
    assert.match(llamadas.raw[0].sql, /from "User" u/, "no es el snapshot de autorizacion");
    assert.equal(llamadas.raw[0].uid, 7, "el identificador no llega como parametro");
  } finally {
    restore();
  }
});

test("la proyeccion de me conserva cada campo que consume el cliente", async () => {
  const { prisma } = makePrisma();
  const { service, restore } = loadAuthService(prisma);
  try {
    const result = await service.me({ id: 7 });
    assert.deepEqual(result.user, {
      id: 7,
      name: "Usuario Prueba",
      email: "activo@example.test",
      tenant_id: 41,
      company_id: "c-9",
      role: "Tecnico",
      role_id: 2,
      role_permissions: [{ code: "hr.read" }],
      role_metadata: { nivel: 2 }
    });
    assert.deepEqual(result.tenant, {
      id: 41,
      name: "Empresa A",
      company_id: "c-9",
      industry: "Importaciones",
      country: "CO",
      currency: "COP",
      active_modules: ["M-04", "M-22"]
    });
  } finally {
    restore();
  }
});

// El snapshot es la fila cruda del usuario: trae el hash de clave. Un cambio de proyeccion no puede
// devolverla nunca al cliente.
test("me no filtra el hash de clave ni otros campos crudos", async () => {
  const { prisma } = makePrisma();
  const { service, restore } = loadAuthService(prisma);
  try {
    const serializado = JSON.stringify(await service.me({ id: 7 }));
    assert.ok(!serializado.includes(HASH), "el hash de clave salio en la respuesta");
    assert.ok(!/"password"/.test(serializado), "salio un campo password crudo");
    assert.ok(!serializado.includes("authorization_version"), "salio la version de autorizacion");
  } finally {
    restore();
  }
});

test("me rechaza una cuenta desactivada leida del snapshot", async () => {
  const { prisma } = makePrisma({ user: { active: false } });
  const { service, restore } = loadAuthService(prisma);
  try {
    await assert.rejects(() => service.me({ id: 7 }), (error) => {
      assert.equal(error.statusCode, 401);
      return true;
    });
  } finally {
    restore();
  }
});

test("me sin fila de usuario responde 401 en lugar de inventar el perfil", async () => {
  const { prisma } = makePrisma({ user: null });
  const { service, restore } = loadAuthService(prisma);
  try {
    await assert.rejects(() => service.me({ id: 7 }), (error) => error.statusCode === 401);
  } finally {
    restore();
  }
});

test("me sin tenant devuelve tenant nulo y no revienta la pantalla", async () => {
  const { prisma } = makePrisma({ tenant: null });
  const { service, restore } = loadAuthService(prisma);
  try {
    const result = await service.me({ id: 7 });
    assert.equal(result.tenant, null, "un tenant ausente no puede serializarse como objeto vacio");
    assert.equal(result.user.id, 7);
  } finally {
    restore();
  }
});
