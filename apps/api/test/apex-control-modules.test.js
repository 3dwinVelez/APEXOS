process.env.DISABLE_REDIS = "true";
process.env.REDIS_DISABLED = "true";

const assert = require("node:assert/strict");
const test = require("node:test");
const Fastify = require("fastify");

const { MODULE_CATALOG, getModules } = require("../src/modules/apex-control/modules");
const routes = require("../src/modules/apex-control/routes");

const NOW = new Date("2026-11-03T12:00:00.000Z");
const TENANT = "tenant-a";

function minutesAgo(minutes) {
  return new Date(NOW.getTime() - minutes * 60000);
}

function fakeDb({ aggregates = {}, incidents = [] } = {}) {
  const calls = [];
  const db = {
    apexIncident: {
      async findMany() {
        return incidents;
      }
    }
  };
  for (const entry of MODULE_CATALOG.filter((item) => item.model)) {
    db[entry.model] = {
      async aggregate(args) {
        calls.push({ model: entry.model, args });
        return aggregates[entry.model] || { _count: { _all: 0 }, _max: {} };
      }
    };
  }
  return { db, calls };
}

function components(overrides = {}) {
  return ["api", "db", "redis", "queues", "crons", "brain", "minio", "mail", "websocket"].map((key) => ({
    key,
    status: overrides[key] || "ok"
  }));
}

function byKey(result, key) {
  return result.modules.find((module) => module.key === key);
}

test("mide registros y frescura con aislamiento de tenant", async () => {
  const { db, calls } = fakeDb({
    aggregates: {
      item: { _count: { _all: 42 }, _max: { updated_at: minutesAgo(30) } },
      transportTrip: { _count: { _all: 7 }, _max: { updated_at: minutesAgo(5000) } },
      apexHealthSample: { _count: { _all: 900 }, _max: { sampled_at: minutesAgo(1) } }
    }
  });

  const result = await getModules(TENANT, { prisma: db, components: components(), now: NOW });

  const inventario = byKey(result, "inventario");
  assert.equal(inventario.status, "ok");
  assert.equal(inventario.data.records, 42);
  assert.equal(inventario.data.state, "fresh");
  assert.equal(inventario.data.age_minutes, 30);

  const transporte = byKey(result, "transporte");
  assert.equal(transporte.status, "degraded");
  assert.equal(transporte.data.state, "stale");
  assert.match(transporte.detail, /Sin actividad/);

  const itemCall = calls.find((call) => call.model === "item");
  assert.equal(itemCall.args.where.tenant_id, TENANT);

  const healthCall = calls.find((call) => call.model === "apexHealthSample");
  assert.equal("tenant_id" in healthCall.args.where, false);

  assert.equal(result.scope, "tenant");
  assert.equal(result.summary.total, MODULE_CATALOG.length);
  assert.equal(result.summary.records, 949);
});

test("un modulo sin datos o sin modelo queda en unknown, nunca en ok", async () => {
  const { db } = fakeDb();
  const result = await getModules(TENANT, { prisma: db, components: components(), now: NOW });

  const ventas = byKey(result, "ventas");
  assert.equal(ventas.status, "unknown");
  assert.equal(ventas.data.state, "empty");

  const calidad = byKey(result, "calidad");
  assert.equal(calidad.status, "unknown");
  assert.equal(calidad.declared, false);
  assert.match(calidad.detail, /sin modelo operativo/i);
});

test("una dependencia caida baja el modulo aunque el dato este fresco", async () => {
  const { db } = fakeDb({
    aggregates: {
      item: { _count: { _all: 10 }, _max: { updated_at: minutesAgo(5) } }
    }
  });
  const result = await getModules(TENANT, { prisma: db, components: components({ queues: "down" }), now: NOW });
  const inventario = byKey(result, "inventario");
  assert.equal(inventario.status, "down");
  assert.match(inventario.detail, /Colas BullMQ/);
  assert.equal(inventario.services.find((service) => service.key === "queues").status, "down");
});

test("adjunta incidentes abiertos de sus dependencias y respeta el limite", async () => {
  const { db } = fakeDb({
    incidents: [
      { id: 1n, component_key: "db", severity: "critical", status: "open", title: "PostgreSQL lento" },
      { id: 2n, component_key: "db", severity: "high", status: "acknowledged", title: "Conexiones altas" },
      { id: 3n, component_key: "brain", severity: "high", status: "open", title: "Brain sin respuesta" },
      { id: 4n, component_key: "minio", severity: "medium", status: "open", title: "Bucket lento" }
    ]
  });
  const result = await getModules(TENANT, { prisma: db, components: components(), now: NOW });
  const inventario = byKey(result, "inventario");
  assert.deepEqual(inventario.alerts.map((alert) => alert.id), ["1", "2"]);
  assert.equal(byKey(result, "inventario").alerts[0].title, "PostgreSQL lento");
  assert.equal(byKey(result, "calidad").alerts.length, 0);
});

test("un error de medicion deja el modulo en unknown con evidencia", async () => {
  const { db } = fakeDb();
  db.item.aggregate = async () => {
    throw new Error("P2024 timeout");
  };
  const result = await getModules(TENANT, { prisma: db, components: components(), now: NOW });
  const inventario = byKey(result, "inventario");
  assert.equal(inventario.status, "unknown");
  assert.equal(inventario.data.state, "unavailable");
  assert.equal(inventario.data.error, "P2024 timeout");
});

test("GET /apex-control/modules exige licencia y permiso de lectura", async () => {
  const app = Fastify();
  const calls = [];
  await app.register(routes, {
    authenticate: async (request, reply) => {
      if (!String(request.headers.authorization || "").startsWith("Bearer ")) {
        return reply.code(401).send({ error: "Token invalido", code: "TOKEN_INVALIDO" });
      }
      request.user = { id: 1, tenant_id: TENANT, role: { name: "APEX_ADMIN", permissions: [] } };
    },
    tenancy: async (request) => {
      request.tenant = { id: TENANT, active: true, active_modules: ["M-22"] };
    },
    service: {
      getModules: async (tenantId) => {
        calls.push(tenantId);
        return { generated_at: NOW.toISOString(), scope: "tenant", summary: {}, modules: [] };
      }
    },
    report: { buildDailySummary: async () => ({}) },
    emit: async () => ({}),
    registerLive: false
  });
  await app.ready();

  const anonymous = await app.inject({ method: "GET", url: "/apex-control/modules" });
  assert.equal(anonymous.statusCode, 401);

  const response = await app.inject({ method: "GET", url: "/apex-control/modules", headers: { authorization: "Bearer 1-token" } });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().scope, "tenant");
  assert.deepEqual(calls, [TENANT]);
  await app.close();
});
