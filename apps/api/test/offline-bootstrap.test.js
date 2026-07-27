const test = require("node:test");
const assert = require("node:assert/strict");
const Fastify = require("fastify");
const {
  createOfflineService,
  limits,
  readRevision,
  VERSION_STRATEGY
} = require("../src/modules/offline/service");
const offlineRoutes = require("../src/modules/offline/routes");
const {
  validateOfflineBootstrapResponse
} = require("../../../packages/types/offline");

const tenantId = "tenant-qa";
const user = {
  id: 7,
  tenant_id: tenantId,
  active: true,
  role: { id: 3, name: "Tecnico", permissions: [] }
};

function enabledEnv(overrides = {}) {
  return {
    APP_ENV: "development",
    OFFLINE_ALLOWED_ENVIRONMENTS: "development",
    OFFLINE_ALLOWED_TENANT_IDS: tenantId,
    OFFLINE_ALLOWED_USER_IDS: String(user.id),
    OFFLINE_ALLOWED_ROLES: "",
    OFFLINE_TECHNICIAN_ENABLED: "true",
    OFFLINE_SYNC_ENABLED: "false",
    OFFLINE_EVIDENCE_UPLOAD_ENABLED: "false",
    OFFLINE_AUTO_SYNC_ENABLED: "false",
    ...overrides
  };
}

function order(overrides = {}) {
  return {
    id: 101,
    number: "TEST-101",
    technician_id: 55,
    service_type: "montaje",
    status: "pendiente",
    customer_name: "Cliente controlado",
    customer_address: "Direccion de prueba",
    customer_phone: "0000000000",
    scheduled_date: new Date("2026-07-28T14:00:00.000Z"),
    metadata: {
      inspection: { items: [{ part_id: 88, status: "ok" }] },
      administrative_notes: "NO_DEBE_SALIR"
    },
    updated_at: new Date("2026-07-27T12:00:00.000Z"),
    reference: {
      name: "Referencia controlada",
      parts: [{ id: 88, name: "Pieza de prueba", display_order: 1 }]
    },
    invoice_number: "NO_DEBE_SALIR",
    notes: "NO_DEBE_SALIR",
    ...overrides
  };
}

function mockPrisma(rows = [order()], options = {}) {
  const calls = [];
  return {
    calls,
    runWithTenant: async (receivedTenant, callback) => {
      calls.push({ model: "tenant", tenantId: receivedTenant });
      return callback();
    },
    employee: {
      findFirst: async (args) => {
        calls.push({ model: "employee", args });
        if (options.employeeError) throw options.employeeError;
        return options.employee === undefined ? { id: 55 } : options.employee;
      }
    },
    serviceOrder: {
      findMany: async (args) => {
        calls.push({ model: "serviceOrder", args });
        if (options.orderError) throw options.orderError;
        if (options.neverResolve) return new Promise(() => undefined);
        return rows;
      }
    }
  };
}

function serviceFor(database, observed = []) {
  return createOfflineService({
    prisma: database,
    now: () => new Date("2026-07-27T13:00:00.000Z"),
    randomUUID: () => "11111111-1111-4111-8111-111111111111",
    observer: { record: async (event) => observed.push(event) }
  });
}

test("capacidad permanece apagada ante flag, ambiente, tenant o identidad no permitidos", async () => {
  const service = serviceFor(mockPrisma());
  const cases = [
    enabledEnv({ OFFLINE_TECHNICIAN_ENABLED: "false" }),
    enabledEnv({ APP_ENV: "qa" }),
    enabledEnv({ OFFLINE_ALLOWED_TENANT_IDS: "other" }),
    enabledEnv({ OFFLINE_ALLOWED_USER_IDS: "", OFFLINE_ALLOWED_ROLES: "" })
  ];
  for (const env of cases) {
    const result = await service.capabilities(tenantId, user, env);
    assert.equal(result.offlineTechnician.enabled, false);
    assert.equal(result.context, null);
    await assert.rejects(
      service.bootstrap(tenantId, user, env),
      (error) => error.statusCode === 403 && error.code === "OFFLINE_NOT_AUTHORIZED"
    );
  }
});

test("capacidad autorizada es solo lectura y no habilita sync o evidencias", async () => {
  const service = serviceFor(mockPrisma());
  const result = await service.capabilities(tenantId, user, enabledEnv());
  assert.deepEqual(result, {
    offlineTechnician: {
      enabled: true,
      readOnly: true,
      syncEnabled: false,
      evidenceEnabled: false,
      autoSyncEnabled: false
    },
    context: {
      environmentId: "development",
      companyId: tenantId,
      userId: String(user.id)
    }
  });
});

test("cambio de rol bloquea bootstrap aunque el usuario este allowlisted", async () => {
  const service = serviceFor(mockPrisma());
  await assert.rejects(
    service.bootstrap(tenantId, { ...user, role: { name: "Supervisor" } }, enabledEnv()),
    (error) =>
      error.statusCode === 403 && error.code === "OFFLINE_TECHNICIAN_ROLE_REQUIRED"
  );
});

test("requiere perfil tecnico activo ligado a la sesion", async () => {
  const service = serviceFor(mockPrisma([], { employee: null }));
  await assert.rejects(
    service.bootstrap(tenantId, user, enabledEnv()),
    (error) =>
      error.statusCode === 403 && error.code === "OFFLINE_TECHNICIAN_PROFILE_REQUIRED"
  );
});

test("genera snapshot minimo valido y deriva empresa y usuario de sesion", async () => {
  const database = mockPrisma();
  const observed = [];
  const snapshot = await serviceFor(database, observed).bootstrap(tenantId, user, enabledEnv());
  assert.equal(snapshot.schemaVersion, 2);
  assert.equal(snapshot.companyId, tenantId);
  assert.equal(snapshot.userId, String(user.id));
  assert.equal(snapshot.environmentId, "development");
  assert.equal(snapshot.metadata.ttlSeconds, 86400);
  assert.equal(snapshot.metadata.versionStrategy, VERSION_STRATEGY);
  assert.equal(snapshot.orders.length, 1);
  assert.equal(snapshot.activities.length, 3);
  assert.equal(snapshot.checklists.length, 1);
  assert.equal(snapshot.catalogs.length, 1);
  assert.equal(validateOfflineBootstrapResponse(snapshot).success, true);
  assert.match(snapshot.serverCheckpoint, /^bootstrap:[a-f0-9]{32}$/);
  assert.equal(observed.at(-1).event, "offline_bootstrap_authorized");
  assert.equal(observed.at(-1).queryCount, 2);
});

test("consulta solo tecnico asignado, estados autorizados y ventana de siete dias", async () => {
  const database = mockPrisma();
  await serviceFor(database).bootstrap(tenantId, user, enabledEnv());
  const employeeQuery = database.calls.find((call) => call.model === "employee").args;
  const orderQuery = database.calls.find((call) => call.model === "serviceOrder").args;
  assert.equal(employeeQuery.where.user_id, user.id);
  assert.equal(orderQuery.where.technician_id, 55);
  assert.deepEqual(orderQuery.where.OR[0].status.in, ["en_curso", "inspeccion", "ejecucion"]);
  assert.equal(orderQuery.where.OR[1].status, "pendiente");
  assert.equal(
    orderQuery.where.OR[1].scheduled_date.lte.toISOString(),
    "2026-08-03T13:00:00.000Z"
  );
  assert.equal(orderQuery.take, 101);
  assert.equal(database.calls.filter((call) => call.model !== "tenant").length, 2);
});

test("DTO excluye datos administrativos, financieros y payload completo de metadata", async () => {
  const snapshot = await serviceFor(mockPrisma()).bootstrap(tenantId, user, enabledEnv());
  const serialized = JSON.stringify(snapshot);
  for (const forbidden of [
    "invoice_number",
    "administrative_notes",
    "NO_DEBE_SALIR",
    "created_by",
    "photos",
    "incidents"
  ]) {
    assert.equal(serialized.includes(forbidden), false);
  }
});

test("serverVersion es revision temporal de lectura basada en timestamp servidor", () => {
  assert.equal(
    readRevision(new Date("2026-07-27T12:00:00.000Z")),
    Date.parse("2026-07-27T12:00:00.000Z")
  );
  assert.throws(() => readRevision("fecha-invalida"));
});

test("indica hasMore sin truncamiento silencioso al superar ordenes", async () => {
  const rows = Array.from({ length: 101 }, (_, index) =>
    order({
      id: index + 1,
      number: `TEST-${index + 1}`,
      updated_at: new Date(1753617600000 + index)
    })
  );
  const snapshot = await serviceFor(mockPrisma(rows)).bootstrap(tenantId, user, enabledEnv());
  assert.equal(snapshot.orders.length, 100);
  assert.equal(snapshot.metadata.hasMore, true);
});

test("rechaza limite de checklist y payload maximo", async () => {
  const manyParts = Array.from({ length: 1001 }, (_, index) => ({
    id: index + 1,
    name: `Pieza ${index}`,
    display_order: index
  }));
  await assert.rejects(
    serviceFor(mockPrisma([order({ reference: { name: "Ref", parts: manyParts } })])).bootstrap(
      tenantId,
      user,
      enabledEnv()
    ),
    (error) => error.statusCode === 413 && error.code === "OFFLINE_CHECKLIST_LIMIT_EXCEEDED"
  );

  const huge = "X".repeat(40000);
  await assert.rejects(
    serviceFor(mockPrisma([order({ customer_address: huge })])).bootstrap(
      tenantId,
      user,
      enabledEnv({ OFFLINE_BOOTSTRAP_MAX_BYTES: "32768" })
    ),
    (error) => error.statusCode === 413 && error.code === "OFFLINE_SNAPSHOT_TOO_LARGE"
  );
});

test("error de base de datos se convierte en respuesta interna controlada", async () => {
  const observed = [];
  const service = serviceFor(mockPrisma([], { orderError: new Error("database secret") }), observed);
  await assert.rejects(
    service.bootstrap(tenantId, user, enabledEnv()),
    (error) =>
      error.statusCode === 500 &&
      error.code === "OFFLINE_BOOTSTRAP_FAILED" &&
      !error.message.includes("database secret")
  );
  assert.equal(observed.at(-1).event, "offline_bootstrap_rejected");
});

test("timeout se convierte en 503 sin detalles internos", async () => {
  const service = serviceFor(mockPrisma([], { neverResolve: true }));
  await assert.rejects(
    service.bootstrap(
      tenantId,
      user,
      enabledEnv({ OFFLINE_BOOTSTRAP_TIMEOUT_MS: "500" })
    ),
    (error) => error.statusCode === 503 && error.code === "OFFLINE_BOOTSTRAP_TIMEOUT"
  );
});

test("limites quedan acotados aun con configuracion invalida", () => {
  assert.deepEqual(limits({}), {
    ttlSeconds: 86400,
    futureDays: 7,
    maxOrders: 100,
    maxActivities: 500,
    maxChecklists: 1000,
    maxCatalogs: 100,
    maxBytes: 1048576,
    timeoutMs: 5000
  });
  assert.equal(limits({ OFFLINE_BOOTSTRAP_MAX_ORDERS: "9999" }).maxOrders, 200);
});

test("rutas rechazan query libre y configuran rate limit por usuario y empresa", async () => {
  const routes = [];
  const fakeFastify = {
    authenticate: async () => undefined,
    addHook: () => undefined,
    get: (path, options, handler) => routes.push({ path, options, handler })
  };
  await offlineRoutes(fakeFastify);
  const capabilities = routes.find((route) => route.path === "/offline/capabilities");
  const bootstrap = routes.find((route) => route.path === "/offline/bootstrap");
  assert.equal(capabilities.options.schema.querystring.additionalProperties, false);
  assert.equal(bootstrap.options.config.rateLimit.max, 6);
  assert.equal(
    bootstrap.options.config.rateLimit.keyGenerator({
      user: { tenant_id: tenantId, id: user.id },
      ip: "127.0.0.1"
    }),
    `${tenantId}:${user.id}`
  );
});

test("usuario no autenticado recibe 401 antes de ejecutar bootstrap", async () => {
  const app = Fastify();
  app.decorate("authenticate", async (_request, reply) => {
    return reply.code(401).send({ error: "Token invalido", code: "TOKEN_INVALIDO" });
  });
  await app.register(offlineRoutes, { prefix: "/api/v1" });
  const response = await app.inject({ method: "GET", url: "/api/v1/offline/bootstrap" });
  assert.equal(response.statusCode, 401);
  assert.equal(response.json().code, "TOKEN_INVALIDO");
  await app.close();
});

