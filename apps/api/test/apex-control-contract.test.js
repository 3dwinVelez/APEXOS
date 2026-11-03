process.env.DISABLE_REDIS = "true";
process.env.REDIS_DISABLED = "true";

const assert = require("node:assert/strict");
const test = require("node:test");
const Fastify = require("fastify");

const routes = require("../src/modules/apex-control/routes");
const service = require("../src/modules/apex-control/service");

const LICENSED_TENANT = { id: "tenant-a", active: true, active_modules: ["administracion_apex"] };
const UNLICENSED_TENANT = { id: "tenant-b", active: true, active_modules: ["inventario"] };
const ADMIN_USER = { id: 1, tenant_id: "tenant-a", role: { name: "APEX_ADMIN", permissions: [], metadata: {} } };
const SALES_USER = { id: 2, tenant_id: "tenant-a", role: { name: "Ventas", permissions: [{ module: "sales", action: "read" }], metadata: {} } };
const OPERATOR_USER = { id: 3, tenant_id: "tenant-a", role: { name: "Operador", permissions: [{ module: "apex-control", action: "read" }, { module: "apex-control", action: "operate" }], metadata: {} } };
const READER_USER = { id: 4, tenant_id: "tenant-a", role: { name: "Consulta", permissions: [{ module: "apex-control", action: "read" }], metadata: {} } };

const STATUS_PAYLOAD = {
  generated_at: "2026-11-02T12:00:00.000Z",
  status: "ok",
  score: 100,
  counts: { ok: 9, degraded: 0, down: 0, unknown: 0 },
  enabled: true,
  interval_ms: 15000,
  components: [],
  incidents: [],
  notifications_unread: 0,
  last_report: null
};

async function buildApp({ user = ADMIN_USER, tenant = LICENSED_TENANT, serviceStub = {}, emit } = {}) {
  const app = Fastify();
  await app.register(routes, {
    authenticate: async (request, reply) => {
      const header = String(request.headers.authorization || "");
      if (!header.startsWith("Bearer ")) {
        return reply.code(401).send({ error: "Token invalido", code: "TOKEN_INVALIDO" });
      }
      request.user = user;
    },
    tenancy: async (request) => {
      request.tenant = tenant;
    },
    service: {
      getStatus: async () => STATUS_PAYLOAD,
      listEvents: async () => ({ events: [], generated_at: STATUS_PAYLOAD.generated_at }),
      listIncidents: async () => [],
      acknowledgeIncident: async (tenantId, userId, id) => ({ id, tenant_id: tenantId, status: "acknowledged", acknowledged_by: userId }),
      listNotifications: async () => ({ notifications: [], unread: 0 }),
      markNotificationRead: async (tenantId, id) => ({ id, tenant_id: tenantId }),
      markAllNotificationsRead: async () => ({ updated: 0 }),
      listReportRuns: async () => [],
      ...serviceStub
    },
    report: { buildDailySummary: async () => ({ kind: "daily", period_key: "2026-11-02" }) },
    emit: emit || (async () => ({ success: true })),
    registerLive: false
  });
  await app.ready();
  return app;
}

const auth = (user = ADMIN_USER) => ({ authorization: `Bearer ${user.id}-token` });

test("sin token responde 401 y con licencia/permiso responde 200", async () => {
  const app = await buildApp();
  const anonymous = await app.inject({ method: "GET", url: "/apex-control/status" });
  assert.equal(anonymous.statusCode, 401);
  assert.equal(anonymous.json().code, "TOKEN_INVALIDO");

  const ok = await app.inject({ method: "GET", url: "/apex-control/status", headers: auth() });
  assert.equal(ok.statusCode, 200);
  assert.equal(ok.json().score, 100);
  await app.close();
});

test("separa licencia de modulo y permiso RBAC", async () => {
  const unlicensed = await buildApp({ tenant: UNLICENSED_TENANT });
  const blocked = await unlicensed.inject({ method: "GET", url: "/apex-control/status", headers: auth() });
  assert.equal(blocked.statusCode, 403);
  assert.equal(blocked.json().code, "MODULO_NO_HABILITADO");
  await unlicensed.close();

  const sales = await buildApp({ user: SALES_USER });
  const denied = await sales.inject({ method: "GET", url: "/apex-control/status", headers: auth(SALES_USER) });
  assert.equal(denied.statusCode, 403);
  assert.equal(denied.json().code, "PERMISO_DENEGADO");
  await sales.close();
});

test("la licencia M-22 de administracion habilita APEX Control en F0", async () => {
  const app = await buildApp({ tenant: { ...LICENSED_TENANT, id: "tenant-m22", active_modules: ["M-22"] } });
  const response = await app.inject({ method: "GET", url: "/apex-control/status", headers: auth() });
  assert.equal(response.statusCode, 200);
  await app.close();
});

test("acusar incidente exige operate y propaga tenant y usuario", async () => {
  let received = null;
  const app = await buildApp({
    user: OPERATOR_USER,
    serviceStub: {
      acknowledgeIncident: async (tenantId, userId, id) => {
        received = { tenantId, userId, id };
        return { id, tenant_id: tenantId, status: "acknowledged" };
      }
    }
  });
  const response = await app.inject({ method: "POST", url: "/apex-control/incidents/42/acknowledge", headers: auth(OPERATOR_USER) });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(received, { tenantId: "tenant-a", userId: 3, id: "42" });

  const reader = await buildApp({ user: READER_USER });
  const denied = await reader.inject({ method: "POST", url: "/apex-control/incidents/42/acknowledge", headers: auth(READER_USER) });
  assert.equal(denied.statusCode, 403);
  assert.equal(denied.json().code, "PERMISO_DENEGADO");
  await app.close();
  await reader.close();
});

test("aislamiento de notificaciones: tenant B no ve registros del tenant A", async () => {
  const rows = [
    { id: 1n, tenant_id: "tenant-a", level: "error", title: "A", message: "a", read_at: null, created_at: new Date() },
    { id: 2n, tenant_id: "tenant-b", level: "info", title: "B", message: "b", read_at: null, created_at: new Date() },
    { id: 3n, tenant_id: null, level: "warning", title: "Global", message: "g", read_at: null, created_at: new Date() }
  ];
  const matches = (row, where) => {
    const scope = where?.OR || [];
    const inScope = scope.some((clause) => Object.entries(clause).every(([key, value]) => row[key] === value));
    if (!inScope) return false;
    if ("read_at" in (where || {}) && row.read_at !== where.read_at) return false;
    return true;
  };
  const db = {
    apexNotification: {
      async findMany({ where, take }) {
        return rows
          .filter((row) => matches(row, where))
          .sort((a, b) => (b.id > a.id ? 1 : -1))
          .slice(0, take);
      },
      async count({ where }) { return rows.filter((row) => matches(row, where)).length; },
      async findFirst({ where }) { return rows.find((row) => row.id === where.id && matches(row, where)) || null; },
      async update() { throw new Error("no debe actualizar notificaciones de otro tenant"); }
    }
  };

  const listed = await service.listNotifications("tenant-b", {}, { prisma: db });
  assert.deepEqual(listed.notifications.map((item) => item.id), ["3", "2"]);
  assert.equal(listed.notifications.some((item) => item.tenant_id === "tenant-a"), false);

  await assert.rejects(
    () => service.markNotificationRead("tenant-b", "1", { prisma: db }),
    (error) => error.code === "NOTIFICACION_NO_ENCONTRADA" && error.statusCode === 404
  );
});

test("la simulacion de fallo solo existe en local y emite un evento de error", async () => {
  const previousEnv = process.env.APP_ENV;
  const previousFlag = process.env.APEX_CONTROL_SIMULATION_ENABLED;
  try {
    process.env.APP_ENV = "qa";
    process.env.APEX_CONTROL_SIMULATION_ENABLED = "true";
    const outsideLocal = await buildApp();
    const hidden = await outsideLocal.inject({ method: "POST", url: "/apex-control/_simulate/failure", headers: auth() });
    assert.equal(hidden.statusCode, 404);
    await outsideLocal.close();

    process.env.APP_ENV = "local";
    const emitted = [];
    const local = await buildApp({ emit: async (event) => { emitted.push(event); return { id: "1" }; } });
    const simulated = await local.inject({ method: "POST", url: "/apex-control/_simulate/failure", headers: auth() });
    assert.equal(simulated.statusCode, 500);
    assert.equal(simulated.json().code, "FALLO_SIMULADO");
    assert.equal(emitted.length, 1);
    assert.equal(emitted[0].kind, "simulation.failure");
    assert.equal(emitted[0].severity, "error");
    await local.close();
  } finally {
    process.env.APP_ENV = previousEnv;
    process.env.APEX_CONTROL_SIMULATION_ENABLED = previousFlag;
  }
});
