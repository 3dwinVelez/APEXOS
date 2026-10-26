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

test("self routes entrega un unico horario y conserva el de la jornada activa", async () => {
  const current = employee();
  const today = new Date();
  const routes = [
    { id: 21, tenant_id: "tenant-qa", date: today, employees: [current.code], start_time: "08:00", end_time: "17:00", status: "active", notes: "", per_diem: 0, tolerance_minutes: 15 },
    { id: 22, tenant_id: "tenant-qa", date: today, employees: [current.code], start_time: "09:00", end_time: "18:00", status: "active", notes: "", per_diem: 0, tolerance_minutes: 15 }
  ];
  const fakePrisma = {
    runWithTenant: (_tenantId, callback) => callback(),
    employee: { findFirst: async () => current, findMany: async () => [current] },
    timeRoute: { findMany: async () => routes },
    workSession: { findFirst: async () => ({ route_id: 21 }) },
    timePunch: { findFirst: async () => ({ route_id: 22 }) }
  };
  const loaded = loadHrService(fakePrisma);
  try {
    const result = await loaded.service.listOwnRoutes("tenant-qa", { id: 7, email: current.user.email });
    assert.deepEqual(result.map((route) => route.id), [21]);
  } finally {
    loaded.restore();
  }
});

test("los endpoints self rechazan un horario alterno distinto al activo del dia", async () => {
  const current = employee();
  const today = new Date();
  const routes = [
    { id: 31, tenant_id: "tenant-qa", date: today, employees: [current.code], start_time: "08:00", end_time: "17:00", status: "active", notes: "", per_diem: 0, tolerance_minutes: 15 },
    { id: 32, tenant_id: "tenant-qa", date: today, employees: [current.code], start_time: "09:00", end_time: "18:00", status: "active", notes: "", per_diem: 0, tolerance_minutes: 15 }
  ];
  const fakePrisma = {
    runWithTenant: (_tenantId, callback) => callback(),
    employee: { findFirst: async () => current, findMany: async () => [current] },
    timeRoute: {
      findFirst: async ({ where }) => routes.find((route) => route.id === where.id) || null,
      findMany: async () => routes
    },
    workSession: { findFirst: async () => ({ route_id: 32 }) },
    timePunch: { findFirst: async () => null }
  };
  const loaded = loadHrService(fakePrisma);
  try {
    await assert.rejects(
      loaded.service.getOwnWorkSession("tenant-qa", { id: 7, email: current.user.email }, { route_id: 31 }),
      (error) => error.code === "HORARIO_NO_ACTIVO" && error.statusCode === 409
    );
  } finally {
    loaded.restore();
  }
});

test("createPunch usa lock por empleado, idempotencia y opciones de transaccion resistentes", async () => {
  const current = employee();
  let transactionOptions;
  const lockScopes = [];
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
    $queryRaw: async (strings, ...values) => {
      const sql = String(strings?.join ? strings.join("") : strings);
      // El lock se pide con try-lock: si la prueba no devuelve el booleano, el reintento
      // creeria que nunca adquirio el candado y la marcacion moriria con 503.
      if (sql.includes("pg_try_advisory_xact_lock")) {
        lockScopes.push(String(values[0]));
        return [{ acquired: true }];
      }
      return [];
    },
    $executeRaw: async () => 0
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
    assert.equal(lockScopes.length, 1, "la marcacion serializa su propio alcance de dia");
    assert.match(lockScopes[0], /^tenant-qa:41:12:/, "el alcance sigue siendo tenant, empleado, ruta y dia");
    assert.equal(createdData.idempotency_key, "qa-idempotency-0001");
    assert.deepEqual(transactionOptions, { maxWait: 10000, timeout: 20000 });
  } finally {
    loaded.restore();
  }
});

test("fix concurrencia: la marcacion espera el lock con deadline y rinde un 503 controlado", async () => {
  const current = employee();
  let attempts = 0;
  const tx = {
    employee: { findFirst: async () => current },
    timeRoute: { findFirst: async () => ({ id: 12, tenant_id: "tenant-qa", employees: [current.code], vehicle_plate: "", end_time: "23:59", tolerance_minutes: 15 }) },
    routePreoperationalChecklist: { findFirst: async () => null },
    timePunch: { findFirst: async () => null, findMany: async () => [], create: async ({ data }) => ({ id: 91, ...data }) },
    gpsPing: { create: async () => ({}) },
    workSession: { findFirst: async () => null, create: async () => ({}), update: async () => ({}) },
    $queryRaw: async (strings) => {
      const sql = String(strings?.join ? strings.join("") : strings);
      if (sql.includes("pg_try_advisory_xact_lock")) {
        attempts += 1;
        return [{ acquired: false }];
      }
      return [];
    },
    $executeRaw: async () => 0
  };
  const fakePrisma = {
    runWithTenant: (_tenantId, callback) => callback(),
    $transaction: async (callback) => callback(tx),
    timePunch: { findFirst: async () => null }
  };
  const loaded = loadHrService(fakePrisma);
  try {
    loaded.service.__setContentionLockWaitMsForTests(120);
    const started = Date.now();
    await assert.rejects(
      loaded.service.createPunch("tenant-qa", {
        employee_id: current.id,
        user_name: current.code,
        route_id: 12,
        type: "entrada",
        punched_at: new Date().toISOString()
      }, { id: 7, email: current.user.email }),
      (error) => error.statusCode === 503 && error.code === "MARCACION_CONCURRENCIA_TEMPORAL",
      "el candado ocupado debe rendirse con 503 del propio servicio, no con P2028"
    );
    assert.ok(Date.now() - started < 5_000, "la operacion queda acotada por el deadline compartido");
    assert.ok(attempts > 1, "el lock se reintenta hasta el deadline");
  } finally {
    loaded.service.__setContentionLockWaitMsForTests(0);
    loaded.restore();
  }
});

test("fix concurrencia: ninguna escritura de Talento Humano deja un lock bloqueante", () => {
  const service = fs.readFileSync(path.resolve(__dirname, "../src/modules/hr/service.js"), "utf8");
  assert.doesNotMatch(
    service,
    /pg_advisory_xact_lock/,
    "un lock bloqueante no puede avisar al operario: espera hasta que Prisma aborta y el error sale como 500"
  );
  // Version main: son 3 ambitos, no 4. El cuarto (ajuste de nomina IBC) no existe en esta rama:
  // portar la prueba habria exigido llevar funcionalidad de negocio ajena a esta correccion
  // puntual. Mismo criterio que el commit b7358e03 de la ronda anterior.
  assert.equal((service.match(/await acquireBoundedScopeLocks\(/g) || []).length, 3, "mallas, marcacion y kilometraje: las tres escrituras con lock que hay en main");
  const helper = service.slice(service.indexOf("async function acquireBoundedScopeLocks"));
  assert.match(helper, /pg_try_advisory_xact_lock/);
  assert.match(helper, /if \(Date\.now\(\) >= deadlineAt\) throw validationError\(message, 503, code\)/);
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

test("el preoperacional reutiliza la transaccion de marcacion y no agota el pool", () => {
  const service = fs.readFileSync(path.resolve(__dirname, "../src/modules/hr/service.js"), "utf8");
  assert.match(service, /ensurePreoperationalChecklist\(\{ tenantId, user, employee, route, punch: null, input, db: tx \}\)/);
  assert.match(service, /ensurePreoperationalChecklist\(\{ tenantId, user, employee, route, punch, input, db: tx \}\)/);
  const helperStart = service.indexOf("async function ensurePreoperationalChecklist");
  const helperEnd = service.indexOf("async function getActivePreoperationalChecklist", helperStart);
  const helper = helperStart >= 0 && helperEnd > helperStart ? service.slice(helperStart, helperEnd) : "";
  assert.match(helper, /db = prisma/);
  assert.doesNotMatch(helper, /await prisma\./);
});
