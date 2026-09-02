const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
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

function employee() {
  return {
    id: 41,
    user_id: 7,
    code: "EMP-41",
    user_type: "operario",
    metadata: { name: "Empleado 41" },
    user: { id: 7, name: "Empleado 41", email: "empleado41@apexos.local" }
  };
}

test("self routes fuerza exclusivamente la fecha operativa actual", async () => {
  let routeQuery;
  const current = employee();
  const fakePrisma = {
    runWithTenant: (_tenantId, callback) => callback(),
    employee: {
      findFirst: async () => current,
      findMany: async () => [current]
    },
    timeRoute: {
      findMany: async (query) => {
        routeQuery = query;
        return [{ id: 8, tenant_id: "tenant-qa", date: new Date(), employees: [current.code], start_time: "08:00", end_time: "17:00", notes: "", per_diem: 0, tolerance_minutes: 15 }];
      }
    }
  };
  const loaded = loadHrService(fakePrisma);
  try {
    const routes = await loaded.service.listOwnRoutes("tenant-qa", { id: 7, email: current.user.email }, { fecha_inicio: "2020-01-01" });
    assert.equal(routes.length, 1);
    assert.ok(routeQuery.where.date.gte instanceof Date);
    assert.equal(routeQuery.where.date.lt.getTime() - routeQuery.where.date.gte.getTime(), 86400000);
    assert.equal(routeQuery.where.date.gte.toISOString().slice(11), "05:00:00.000Z");
  } finally {
    loaded.restore();
  }
});

test("createPunch usa lock por empleado, idempotencia y opciones de transaccion resistentes", async () => {
  const current = employee();
  let transactionOptions;
  let lockCalls = 0;
  let createdData;
  const tx = {
    employee: { findFirst: async () => current },
    timeRoute: { findFirst: async () => ({ id: 12, tenant_id: "tenant-qa", employees: [current.code], vehicle_plate: "", end_time: "23:59", tolerance_minutes: 15 }) },
    routePreoperationalChecklist: { findFirst: async () => null },
    timePunch: {
      findFirst: async () => null,
      findMany: async () => [],
      create: async ({ data }) => {
        createdData = data;
        return { id: 91, ...data };
      }
    },
    gpsPing: { create: async () => ({}) },
    workSession: { findFirst: async () => null, create: async () => ({}), update: async () => ({}) },
    $executeRaw: async () => { lockCalls += 1; }
  };
  const fakePrisma = {
    runWithTenant: (_tenantId, callback) => callback(),
    $transaction: async (callback, options) => {
      transactionOptions = options;
      return callback(tx);
    },
    timePunch: { findFirst: async () => null }
  };
  const loaded = loadHrService(fakePrisma);
  try {
    const result = await loaded.service.createPunch("tenant-qa", {
      employee_id: current.id,
      user_name: current.code,
      route_id: 12,
      type: "entrada",
      punched_at: new Date().toISOString(),
      idempotency_key: "qa-idempotency-0001"
    }, { id: 7, email: current.user.email });
    assert.equal(result.ok, true);
    assert.equal(lockCalls, 1);
    assert.equal(createdData.idempotency_key, "qa-idempotency-0001");
    assert.deepEqual(transactionOptions, { maxWait: 10000, timeout: 20000 });
  } finally {
    loaded.restore();
  }
});

test("el contrato versiona idempotencia y evita reintentar validaciones permanentes", () => {
  const schema = fs.readFileSync(path.resolve(__dirname, "../prisma/schema.prisma"), "utf8");
  const migration = fs.readFileSync(path.resolve(__dirname, "../prisma/migrations/20260902090000_hr_time_punch_idempotency/migration.sql"), "utf8");
  const page = fs.readFileSync(path.resolve(__dirname, "../../web/app/dashboard/talento-humano/marcacion/page.tsx"), "utf8");
  const routes = fs.readFileSync(path.resolve(__dirname, "../src/modules/hr/routes.js"), "utf8");
  assert.match(schema, /idempotency_key\s+String\?/);
  assert.match(schema, /@@unique\(\[tenant_id, idempotency_key\]\)/);
  assert.match(migration, /CREATE UNIQUE INDEX "TimePunch_tenant_id_idempotency_key_key"/);
  assert.match(page, /permanentSyncFailure/);
  assert.match(page, /idempotency_key: idempotencyKey/);
  assert.match(page, /pendiente de confirmar/);
  assert.match(routes, /\/hr\/self\/time-punches[\s\S]*?rateLimit: \{ max: 600, timeWindow: "1 minute" \}/);
});
