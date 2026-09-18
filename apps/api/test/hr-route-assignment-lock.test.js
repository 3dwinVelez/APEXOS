const assert = require("node:assert/strict");
const test = require("node:test");

process.env.DISABLE_REDIS = "true";

function loadHrService(fakePrisma) {
  const prismaPath = require.resolve("../src/core/prisma");
  const servicePath = require.resolve("../src/modules/hr/service");
  const previousPrisma = require.cache[prismaPath];
  const previousService = require.cache[servicePath];
  require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: fakePrisma };
  delete require.cache[servicePath];
  const service = require(servicePath);
  return {
    service,
    restore() {
      delete require.cache[servicePath];
      if (previousService) require.cache[servicePath] = previousService;
      if (previousPrisma) require.cache[prismaPath] = previousPrisma;
      else delete require.cache[prismaPath];
    }
  };
}

const employeeFixture = {
  id: 41,
  user_id: 7,
  code: "EMP-41",
  user_type: "operario",
  metadata: { name: "Empleado 41" },
  user: { id: 7, name: "Empleado 41", email: "empleado41@apexos.local" }
};

function buildFakePrisma() {
  const lockState = new Map();
  const routes = [];
  const events = [];

  async function executeRawLock(scope, heldScopes) {
    events.push({ kind: "lock", scope });
    let entry = lockState.get(scope) || { holders: 0, waiters: [] };
    while (entry.holders > 0) {
      await new Promise((resolve) => entry.waiters.push(resolve));
      entry = lockState.get(scope);
    }
    entry.holders += 1;
    lockState.set(scope, entry);
    heldScopes.push(scope);
  }

  function releaseLocks(heldScopes) {
    for (const scope of heldScopes) {
      const entry = lockState.get(scope);
      entry.holders -= 1;
      if (entry.holders === 0) {
        const waiters = entry.waiters.splice(0);
        for (const wake of waiters) wake();
      }
    }
  }

  async function timeRouteFindMany(query) {
    events.push({ kind: "check", where: query.where });
    return routes.filter((route) => {
      if (query.where.id?.not && route.id === query.where.id.not) return false;
      if (query.where.status?.notIn?.includes(route.status)) return false;
      if (query.where.date?.gte && route.date < query.where.date.gte) return false;
      if (query.where.date?.lt && route.date >= query.where.date.lt) return false;
      return true;
    });
  }

  function makeTx() {
    const heldScopes = [];
    const tx = {
      $executeRaw: async (strings, ...values) => {
        const sql = Array.isArray(strings) ? strings.join("?") : String(strings);
        if (sql.includes("pg_advisory_xact_lock")) {
          await executeRawLock(values[0], heldScopes);
          return 1;
        }
        return 1;
      },
      timeRoute: {
        findMany: timeRouteFindMany,
        create: async ({ data }) => {
          events.push({ kind: "create", data });
          const route = { id: routes.length + 1, ...data };
          routes.push(route);
          return route;
        },
        update: async ({ where, data }) => {
          events.push({ kind: "update", where, data });
          const route = routes.find((item) => item.id === where.id);
          if (!route) throw new Error("route not found");
          Object.assign(route, data);
          return route;
        }
      }
    };
    tx.heldScopes = heldScopes;
    return tx;
  }

  return {
    events,
    routes,
    runWithTenant: (_tenantId, callback) => callback(),
    employee: { findMany: async () => [employeeFixture] },
    $transaction: async (callback) => {
      const tx = makeTx();
      try {
        return await callback(tx);
      } finally {
        releaseLocks(tx.heldScopes || []);
      }
    }
  };
}

const routeInput = {
  date: "2026-09-25",
  employees: ["EMP-41"],
  start_time: "08:00",
  end_time: "17:00",
  tolerance_minutes: 15,
  notes: "turno prueba"
};

test("crear mallas concurrentes superpuestas se serializa por advisory lock y una sola gana", async () => {
  const fakePrisma = buildFakePrisma();
  const loaded = loadHrService(fakePrisma);
  try {
    const results = await Promise.allSettled([
      loaded.service.createRoute("tenant-qa", routeInput),
      loaded.service.createRoute("tenant-qa", routeInput)
    ]);
    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter((result) => result.status === "rejected");
    assert.equal(fulfilled.length, 1, "exactamente una creacion debe ganar");
    assert.equal(rejected.length, 1, "la segunda creacion debe rechazarse");
    assert.equal(rejected[0].reason?.code, "MALLA_SOLAPADA");
    assert.equal(fakePrisma.routes.length, 1, "no debe persistir malla duplicada");
    const locks = fakePrisma.events.filter((event) => event.kind === "lock");
    assert.equal(locks.length, 2, "ambas peticiones deben adquirir el lock");
    assert.equal(new Set(locks.map((event) => event.scope)).size, 1, "mismo scope por empleado y fecha");
    const creates = fakePrisma.events.filter((event) => event.kind === "create");
    assert.equal(creates.length, 1);
  } finally {
    loaded.restore();
  }
});

test("crear mallas masivas adquiere locks por empleado y fecha antes de validar y crear", async () => {
  const fakePrisma = buildFakePrisma();
  const loaded = loadHrService(fakePrisma);
  try {
    const result = await loaded.service.createRoutesBulk("tenant-qa", {
      start_date: "2026-09-28",
      end_date: "2026-10-02",
      weekdays: [1, 2, 3, 4, 5],
      employees: ["EMP-41"],
      start_time: "08:00",
      end_time: "17:00",
      tolerance_minutes: 15,
      notes: ""
    });
    assert.equal(result.created, 5);
    const lockScopes = fakePrisma.events.filter((event) => event.kind === "lock").map((event) => event.scope);
    assert.equal(lockScopes.length, 5, "un lock por dia del rango");
    assert.ok(lockScopes.every((scope) => scope.startsWith("tenant-qa:asignacion:emp-41:")), "scopes de asignacion por tenant y empleado");
    const firstLock = fakePrisma.events.findIndex((event) => event.kind === "lock");
    const firstCheck = fakePrisma.events.findIndex((event) => event.kind === "check");
    const firstCreate = fakePrisma.events.findIndex((event) => event.kind === "create");
    assert.ok(firstLock < firstCheck && firstCheck < firstCreate, "orden lock -> validacion -> creacion");
  } finally {
    loaded.restore();
  }
});

test("editar malla adquiere lock y excluye la malla editada del chequeo de solapamiento", async () => {
  const fakePrisma = buildFakePrisma();
  fakePrisma.routes.push({
    id: 9,
    tenant_id: "tenant-qa",
    date: new Date("2026-09-25T05:00:00.000Z"),
    employees: ["EMP-41"],
    start_time: "08:00",
    end_time: "17:00",
    tolerance_minutes: 15,
    per_diem: 0,
    notes: "",
    status: "active"
  });
  const loaded = loadHrService(fakePrisma);
  try {
    await loaded.service.updateRoute("tenant-qa", 9, routeInput);
    const checkEvent = fakePrisma.events.find((event) => event.kind === "check");
    assert.equal(checkEvent.where.id.not, 9, "la malla editada no debe contarse como solapamiento");
    const lockScopes = fakePrisma.events.filter((event) => event.kind === "lock").map((event) => event.scope);
    assert.ok(lockScopes.length >= 1);
  } finally {
    loaded.restore();
  }
});
