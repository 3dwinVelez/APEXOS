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
  const transactionCalls = [];

  function lockEntry(scope) {
    let entry = lockState.get(scope);
    if (!entry) {
      entry = { holders: 0 };
      lockState.set(scope, entry);
    }
    return entry;
  }

  // Semantica de pg_try_advisory_xact_lock: intenta y reporta exito, nunca bloquea.
  // El reintento con pg_sleep lo maneja el bucle del servicio.
  function tryAcquireLock(scope) {
    events.push({ kind: "lock", scope });
    const entry = lockEntry(scope);
    if (entry.holders > 0) return false;
    entry.holders += 1;
    return true;
  }

  function holdScopeExternally(scope) {
    const entry = lockEntry(scope);
    entry.holders += 1;
    return () => {
      entry.holders -= 1;
    };
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
      $queryRaw: async (strings, ...values) => {
        const sql = Array.isArray(strings) ? strings.join("?") : String(strings);
        if (sql.includes("pg_try_advisory_xact_lock")) {
          const scope = values[0];
          const acquired = tryAcquireLock(scope);
          if (acquired) heldScopes.push(scope);
          else await new Promise((resolve) => setTimeout(resolve, 50)); // espejo del pg_sleep del servicio
          return [{ acquired }];
        }
        return [];
      },
      $executeRaw: async (strings, ...values) => {
        const sql = Array.isArray(strings) ? strings.join("?") : String(strings);
        if (sql.includes("pg_advisory_xact_lock")) {
          const scope = values[0];
          const acquired = tryAcquireLock(scope);
          if (acquired) heldScopes.push(scope);
          return acquired ? 1 : 0;
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
    transactionCalls,
    holdScopeExternally,
    runWithTenant: (_tenantId, callback) => callback(),
    employee: { findMany: async () => [employeeFixture] },
    // El pre-chequeo de solapamiento (fuera de la transaccion) usa el cliente raiz,
    // igual que produccion; el chequeo definitivo ocurre dentro del lock con tx.timeRoute.
    timeRoute: {
      findMany: timeRouteFindMany
    },
    $transaction: async (callback, options) => {
      transactionCalls.push(options ?? null);
      const tx = makeTx();
      try {
        return await callback(tx);
      } finally {
        for (const scope of tx.heldScopes || []) lockEntry(scope).holders -= 1;
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

function scopeFor(tenantId, employeeKey, date) {
  // startOfDay("YYYY-MM-DD") = medianoche de America/Bogota => 05:00Z (OPERATING_OFFSET).
  return `${tenantId}:asignacion:${employeeKey}:${date}T05:00:00.000Z`;
}

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
    assert.ok(locks.length >= 2, "ambas peticiones deben intentar el lock");
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
    assert.equal(new Set(lockScopes).size, 5, "un scope por dia del rango");
    assert.ok(lockScopes.every((scope) => scope.startsWith("tenant-qa:asignacion:emp-41:")), "scopes de asignacion por tenant y empleado");
    const firstLock = fakePrisma.events.findIndex((event) => event.kind === "lock");
    const firstCheck = fakePrisma.events.findIndex((event, index) => event.kind === "check" && index > firstLock);
    const firstCreate = fakePrisma.events.findIndex((event) => event.kind === "create");
    assert.ok(firstLock < firstCheck && firstCheck < firstCreate, "orden lock -> validacion -> creacion");
  } finally {
    loaded.restore();
  }
});

test("una jornada de descanso no se bloquea por una malla de trabajo superpuesta", async () => {
  const fakePrisma = buildFakePrisma();
  fakePrisma.routes.push({
    id: 5,
    tenant_id: "tenant-qa",
    date: new Date("2026-09-25T05:00:00.000Z"),
    employees: ["EMP-41"],
    start_time: "08:00",
    end_time: "17:00",
    tolerance_minutes: 15,
    per_diem: 0,
    notes: "",
    status: "active",
    kind: "trabajo"
  });
  const loaded = loadHrService(fakePrisma);
  try {
    const route = await loaded.service.createRoute("tenant-qa", { ...routeInput, kind: "descanso" });
    assert.equal(route.kind, "descanso");
    assert.equal(fakePrisma.routes.length, 2, "el descanso se crea pese al solapamiento con una malla de trabajo");
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

test("fix P2028: las transacciones de mallas declaran timeout y maxWait ampliados", async () => {
  const fakePrisma = buildFakePrisma();
  const loaded = loadHrService(fakePrisma);
  try {
    await loaded.service.createRoute("tenant-qa", routeInput);
    await loaded.service.createRoutesBulk("tenant-qa", {
      start_date: "2026-09-28",
      end_date: "2026-09-29",
      weekdays: [1, 2],
      employees: ["EMP-41"],
      start_time: "08:00",
      end_time: "17:00"
    });
    assert.equal(fakePrisma.transactionCalls.length, 2, "createRoute y createRoutesBulk deben pasar opciones");
    for (const options of fakePrisma.transactionCalls) {
      assert.ok(options, "la transaccion no puede correr con opciones por defecto");
      assert.ok(options.timeout > 5_000, "el timeout debe superar los 5s por defecto que provocaban P2028");
      assert.ok(options.maxWait >= 1_000, "maxWait debe dar margen al pool");
    }
  } finally {
    loaded.restore();
  }
});

test("fix P2028: contencion externa del lock se reintenta y la creacion termina guardando la malla", async () => {
  const fakePrisma = buildFakePrisma();
  const loaded = loadHrService(fakePrisma);
  try {
    const scope = scopeFor("tenant-qa", "emp-41", routeInput.date);
    const release = fakePrisma.holdScopeExternally(scope);
    // El titular externo libera durante la espera: antes esto abortaba con P2028 a los 5s.
    setTimeout(release, 400);
    const route = await loaded.service.createRoute("tenant-qa", routeInput);
    assert.ok(route.id, "la malla debe crearse tras reintentar el lock");
    assert.equal(fakePrisma.routes.length, 1);
    const attempts = fakePrisma.events.filter((event) => event.kind === "lock" && event.scope === scope);
    assert.ok(attempts.length >= 2, "debe haberse reintentado el try-lock antes de adquirirlo");
  } finally {
    loaded.restore();
  }
});

test("fix P2028: si el lock no se libera en la ventana, falla 503 ROUTE_ASSIGNMENT_BUSY y no P2028", async () => {
  const fakePrisma = buildFakePrisma();
  const loaded = loadHrService(fakePrisma);
  try {
    const servicePath = require.resolve("../src/modules/hr/service");
    // Ventana de espera corta para que el test no tarde 25 segundos reales.
    require(servicePath).__setRouteLockWaitMsForTests(600);
    const scope = scopeFor("tenant-qa", "emp-41", routeInput.date);
    const release = fakePrisma.holdScopeExternally(scope);
    try {
      await assert.rejects(
        () => loaded.service.createRoute("tenant-qa", routeInput),
        (error) => {
          assert.equal(error.code, "ROUTE_ASSIGNMENT_BUSY");
          assert.equal(error.statusCode, 503);
          return true;
        }
      );
      assert.equal(fakePrisma.routes.length, 0, "no debe persistir nada cuando el lock sigue tomado");
      const attempts = fakePrisma.events.filter((event) => event.kind === "lock" && event.scope === scope);
      assert.ok(attempts.length >= 3, "debe reintentar de forma acotada antes de rendirse");
    } finally {
      release();
      require(servicePath).__setRouteLockWaitMsForTests(25_000);
    }
  } finally {
    loaded.restore();
  }
});
