process.env.DISABLE_REDIS = "true";
process.env.REDIS_DISABLED = "true";

const assert = require("node:assert/strict");
const test = require("node:test");
const Fastify = require("fastify");

const { getActivity, getTenants, crossTenantEnabled } = require("../src/modules/apex-control/activity");
const routes = require("../src/modules/apex-control/routes");

const NOW = new Date("2026-11-03T12:00:00.000Z");
const TENANT = "tenant-a";

function activityDb(overrides = {}) {
  const calls = [];
  const auditRows = overrides.auditRows || [
    { day: "2026-11-01", total: 3 },
    { day: "2026-11-03", total: 5 }
  ];
  const eventRows = overrides.eventRows || [
    { day: "2026-11-03", total: 2 }
  ];
  return {
    calls,
    async $queryRaw(strings) {
      const sql = Array.isArray(strings) ? strings.join("?") : String(strings);
      calls.push(sql);
      return sql.includes('"AuditLog"') ? auditRows : eventRows;
    },
    tenant: {
      async findUnique() {
        return { id: TENANT, name: "Empresa A", plan: "pro", active: true };
      }
    },
    user: {
      async count(args) {
        calls.push({ model: "user.count", args });
        return 4;
      }
    },
    authorizationSession: {
      async findMany() {
        return [
          { user_id: 1, last_seen_at: new Date("2026-11-03T11:55:00.000Z") },
          { user_id: 1, last_seen_at: new Date("2026-11-03T11:40:00.000Z") },
          { user_id: 2, last_seen_at: new Date("2026-11-03T10:00:00.000Z") }
        ];
      }
    },
    auditLog: {
      async aggregate() {
        return { _max: { timestamp: new Date("2026-11-03T11:59:00.000Z") } };
      }
    },
    apexEvent: {
      async aggregate() {
        return { _max: { occurred_at: new Date("2026-11-03T11:58:00.000Z") } };
      }
    },
    gpsPing: {
      async aggregate() {
        return { _count: { _all: 12 }, _max: { captured_at: new Date("2026-11-03T11:50:00.000Z") } };
      }
    }
  };
}

test("la actividad diaria suma auditoria y eventos sin salir del tenant", async () => {
  const db = activityDb();
  const result = await getActivity(TENANT, { days: 7 }, {
    prisma: db,
    now: NOW,
    wsManager: { stats: () => ({ clients: 3, tenants: 2 }) }
  });

  assert.equal(result.scope, "tenant");
  assert.equal(result.days, 7);
  assert.equal(result.tenant.name, "Empresa A");
  assert.equal(result.daily.length, 7);
  const day = result.daily.find((item) => item.date === "2026-11-03");
  assert.equal(day.audit, 5);
  assert.equal(day.events, 2);
  assert.equal(day.total, 7);
  assert.equal(result.daily.find((item) => item.date === "2026-11-01").total, 3);
  assert.equal(result.activity.today, 7);
  assert.equal(result.activity.period, 10);
  assert.equal(result.activity.active_users, 4);
  assert.equal(result.connections.active_sessions, 3);
  assert.equal(result.connections.distinct_users, 2);
  assert.equal(result.connections.websocket.scope, "process");
  assert.equal(result.connections.websocket.clients, 3);
  assert.equal(result.connections.gps.pings_period, 12);
  assert.equal(result.connections.gps.last_ping_age_minutes, 10);
  assert.match(result.activity.last_activity_at, /2026-11-03T11:59:00.000Z/);

  const countCall = db.calls.find((call) => call.model === "user.count");
  assert.equal(countCall.args.where.tenant_id, TENANT);
});

test("las consultas diarias llevan el tenant como parametro", async () => {
  const db = activityDb();
  await getActivity(TENANT, {}, { prisma: db, now: NOW, wsManager: { stats: () => ({ clients: 0, tenants: 0 }) } });
  const rawCalls = db.calls.filter((call) => typeof call === "string");
  assert.equal(rawCalls.length, 2);
  assert.ok(rawCalls.some((sql) => sql.includes('"AuditLog"')));
  assert.ok(rawCalls.some((sql) => sql.includes("apex_events")));
});

test("la vista por empresa es cross-tenant y resume actividad, sesiones y GPS", async () => {
  const calls = [];
  const db = {
    tenant: {
      async findMany(args) {
        calls.push({ model: "tenant.findMany", args });
        return [
          { id: "t1", name: "Alpha", plan: "pro", active: true, active_modules: ["M-01"] },
          { id: "t2", name: "Beta", plan: "seed", active: true, active_modules: [] },
          { id: "t3", name: "Gamma", plan: "seed", active: false, active_modules: [] }
        ];
      }
    },
    user: {
      async groupBy(args) {
        calls.push({ model: "user.groupBy", args });
        return [
          { tenant_id: "t1", _count: { _all: 3 }, _max: { last_login: new Date("2026-11-03T09:00:00.000Z") } },
          { tenant_id: "t2", _count: { _all: 1 }, _max: { last_login: null } }
        ];
      }
    },
    authorizationSession: {
      async groupBy() {
        return [{ tenant_id: "t1", _count: { _all: 2 }, _max: { last_seen_at: new Date("2026-11-03T11:00:00.000Z") } }];
      }
    },
    auditLog: {
      async groupBy() {
        return [{ tenant_id: "t1", _count: { _all: 40 }, _max: { timestamp: new Date("2026-11-03T11:30:00.000Z") } }];
      }
    },
    apexEvent: {
      async groupBy() {
        return [
          { tenant_id: "t1", _count: { _all: 5 } },
          { tenant_id: null, _count: { _all: 99 } }
        ];
      }
    },
    gpsPing: {
      async groupBy() {
        return [{ tenant_id: "t1", _count: { _all: 20 }, _max: { captured_at: new Date("2026-11-03T11:45:00.000Z") } }];
      }
    }
  };

  const result = await getTenants({ days: 7 }, { prisma: db, now: NOW, env: {} });

  assert.equal(result.scope, "cross-tenant");
  assert.equal(result.restricted, false);
  assert.equal(result.summary.total, 3);
  assert.equal(result.summary.active, 2);
  assert.equal(result.summary.with_activity, 1);
  assert.equal(result.summary.with_sessions, 1);
  assert.equal(result.summary.with_gps, 1);

  const alpha = result.tenants.find((tenant) => tenant.tenant_id === "t1");
  assert.equal(alpha.status, "ok");
  assert.equal(alpha.activity_period, 45);
  assert.equal(alpha.sessions_active, 2);
  assert.equal(alpha.gps_period, 20);

  const beta = result.tenants.find((tenant) => tenant.tenant_id === "t2");
  assert.equal(beta.activity_period, 0);
  assert.equal(beta.status, "degraded");

  const gamma = result.tenants.find((tenant) => tenant.tenant_id === "t3");
  assert.equal(gamma.status, "unknown");

  const userCall = calls.find((call) => call.model === "user.groupBy");
  assert.equal("tenant_id" in userCall.args.where, false);
});

test("la allowlist de empresas limita la lectura cross-tenant", async () => {
  let received = null;
  const emptyGroup = async () => [];
  const db = {
    tenant: {
      async findMany(args) {
        received = args;
        return [{ id: "t1", name: "Alpha", active: true, active_modules: [] }];
      }
    },
    user: { groupBy: emptyGroup },
    authorizationSession: { groupBy: emptyGroup },
    auditLog: { groupBy: emptyGroup },
    apexEvent: { groupBy: emptyGroup },
    gpsPing: { groupBy: emptyGroup }
  };
  const result = await getTenants({}, {
    prisma: db,
    now: NOW,
    env: { APEX_CONTROL_CROSS_TENANT_TENANTS: "t1, t9" }
  });
  assert.equal(result.restricted, true);
  assert.deepEqual(result.allowlist, ["t1", "t9"]);
  assert.deepEqual(received.where, { id: { in: ["t1", "t9"] } });
});

test("cross-tenant queda apagado fuera de local salvo bandera explicita", () => {
  assert.equal(crossTenantEnabled({ NODE_ENV: "development" }), true);
  assert.equal(crossTenantEnabled({ NODE_ENV: "production" }), false);
  assert.equal(crossTenantEnabled({ NODE_ENV: "production", APEX_CONTROL_CROSS_TENANT: "true" }), true);
  assert.equal(crossTenantEnabled({ NODE_ENV: "development", APEX_CONTROL_CROSS_TENANT: "false" }), false);
});

function buildApp(service, overrides = {}) {
  const app = Fastify();
  app.register(routes, {
    authenticate: async (request, reply) => {
      if (!String(request.headers.authorization || "").startsWith("Bearer ")) {
        return reply.code(401).send({ error: "Token invalido", code: "TOKEN_INVALIDO" });
      }
      request.user = { id: 1, tenant_id: TENANT, role: { name: "APEX_ADMIN", permissions: [{ module: "*", action: "*" }] } };
    },
    tenancy: async (request) => {
      request.tenant = { id: TENANT, active: true, active_modules: ["M-22"] };
    },
    service: {
      getModules: async () => ({ modules: [] }),
      getActivity: async (tenantId, query) => ({ scope: "tenant", tenantId, query }),
      getTenants: async (query) => ({ scope: "cross-tenant", query }),
      ...service
    },
    report: { buildDailySummary: async () => ({}) },
    emit: async () => ({}),
    registerLive: false,
    ...overrides
  });
  return app;
}

test("GET /apex-control/activity exige autenticacion y respeta el tenant", async () => {
  const app = buildApp();
  await app.ready();

  const anonymous = await app.inject({ method: "GET", url: "/apex-control/activity" });
  assert.equal(anonymous.statusCode, 401);

  const response = await app.inject({ method: "GET", url: "/apex-control/activity?days=7", headers: { authorization: "Bearer token" } });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().tenantId, TENANT);
  assert.deepEqual(response.json().query, { days: "7" });
  await app.close();
});

test("GET /apex-control/tenants se bloquea si la lectura entre empresas esta apagada", async () => {
  const previous = process.env.APEX_CONTROL_CROSS_TENANT;
  process.env.APEX_CONTROL_CROSS_TENANT = "false";
  try {
    const app = buildApp();
    await app.ready();
    const response = await app.inject({ method: "GET", url: "/apex-control/tenants", headers: { authorization: "Bearer token" } });
    assert.equal(response.statusCode, 403);
    assert.equal(response.json().code, "CROSS_TENANT_DESHABILITADO");
    await app.close();
  } finally {
    if (previous === undefined) delete process.env.APEX_CONTROL_CROSS_TENANT;
    else process.env.APEX_CONTROL_CROSS_TENANT = previous;
  }
});

test("GET /apex-control/tenants responde agregados cuando esta habilitado", async () => {
  const previous = process.env.APEX_CONTROL_CROSS_TENANT;
  process.env.APEX_CONTROL_CROSS_TENANT = "true";
  try {
    const app = buildApp();
    await app.ready();
    const response = await app.inject({ method: "GET", url: "/apex-control/tenants?days=7", headers: { authorization: "Bearer token" } });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().scope, "cross-tenant");
    await app.close();
  } finally {
    if (previous === undefined) delete process.env.APEX_CONTROL_CROSS_TENANT;
    else process.env.APEX_CONTROL_CROSS_TENANT = previous;
  }
});

test("GET /apex-control/tenants rechaza sin permiso explicito", async () => {
  const previous = process.env.APEX_CONTROL_CROSS_TENANT;
  process.env.APEX_CONTROL_CROSS_TENANT = "true";
  try {
    const app = Fastify();
    app.register(routes, {
      authenticate: async (request) => {
        request.user = { id: 2, tenant_id: TENANT, role: { name: "Operador", permissions: [{ module: "apex-control", action: "read" }] } };
      },
      tenancy: async (request) => {
        request.tenant = { id: TENANT, active: true, active_modules: ["M-22"] };
      },
      service: { getTenants: async () => ({ tenants: [] }) },
      report: { buildDailySummary: async () => ({}) },
      emit: async () => ({}),
      registerLive: false
    });
    await app.ready();
    const response = await app.inject({ method: "GET", url: "/apex-control/tenants", headers: { authorization: "Bearer token" } });
    assert.equal(response.statusCode, 403);
    assert.equal(response.json().code, "PERMISO_DENEGADO");
    await app.close();
  } finally {
    if (previous === undefined) delete process.env.APEX_CONTROL_CROSS_TENANT;
    else process.env.APEX_CONTROL_CROSS_TENANT = previous;
  }
});
