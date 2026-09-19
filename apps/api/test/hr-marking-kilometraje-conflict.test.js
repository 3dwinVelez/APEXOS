const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

process.env.DISABLE_REDIS = "true";

// Regresion FM-01: el cierre de jornada (salida) en ruta vehicular con kilometraje
// escribe th_jornada_kilometrajes. El indice unico parcial de esa tabla difiere entre
// ambientes (columnas planas en QA vs expresiones COALESCE en la migracion canonica),
// por lo que ningun ON CONFLICT es portable: PostgreSQL lanza 42P10, aborta la
// transaccion (25P02) y la marcacion se revierte con un 500 generico (la plataforma
// "se bloquea" al cerrar el dia). El upsert debe ser agnostico al indice: lock de
// renglon activo + select + update/insert dentro de la transaccion de marcacion.

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

function driverFreeEmployee() {
  return {
    id: 41,
    user_id: 7,
    code: "EMP-41",
    user_type: "operario",
    metadata: { name: "Empleado 41" },
    user: { id: 7, name: "Empleado 41", email: "empleado41@apexos.local" }
  };
}

function vehicleRoute() {
  return { id: 12, tenant_id: "tenant-qa", employees: ["EMP-41"], vehicle_plate: "SIMBLL01", end_time: "23:59", tolerance_minutes: 15 };
}

// Tres marcaciones previas para que la siguiente permitida sea "salida".
function priorPunches() {
  return [{ type: "entrada" }, { type: "inicio_almuerzo" }, { type: "fin_almuerzo" }];
}

function buildTx({ capturedSql, capturedValues = [], failKilometraje = false, activeMileageRow = null }) {
  const current = driverFreeEmployee();
  const runRaw = (sql) => {
    if (failKilometraje && /th_jornada_kilometrajes/i.test(sql)) {
      const error = new Error("Raw query failed. Code: 42P10");
      error.code = "P2010";
      error.meta = { code: "42P10" };
      throw error;
    }
  };
  return {
    employee: { findFirst: async () => current },
    timeRoute: { findFirst: async () => vehicleRoute() },
    routePreoperationalChecklist: { findFirst: async () => null },
    timePunch: {
      findFirst: async () => null,
      findMany: async () => priorPunches(),
      create: async ({ data }) => ({ id: 91, ...data })
    },
    gpsPing: { create: async () => ({}) },
    workSession: { findFirst: async () => ({ id: 5 }), create: async () => ({}), update: async () => ({}) },
    $queryRaw: async (strings, ...values) => {
      const sql = strings.join("?");
      capturedSql.push(sql);
      capturedValues.push(values);
      runRaw(sql);
      if (/FROM th_jornada_kilometrajes/i.test(sql)) return activeMileageRow ? [activeMileageRow] : [];
      return [];
    },
    $executeRaw: async (strings, ...values) => {
      const sql = Array.isArray(strings) ? strings.join("?") : String(strings);
      capturedSql.push(sql);
      capturedValues.push(values);
      runRaw(sql);
    }
  };
}

function punchSalida(service) {
  return service.createPunch("tenant-qa", {
    employee_id: 41,
    user_name: "EMP-41",
    route_id: 12,
    type: "salida",
    punched_at: new Date().toISOString(),
    latitude: 6.338,
    longitude: -75.559,
    kilometraje_dia: "42.5",
    idempotency_key: "qa-km-salida-0001"
  }, { id: 7, email: "empleado41@apexos.local" });
}

test("FM-01: la salida vehicular sin renglon activo inserta kilometraje sin depender del indice", async () => {
  const capturedSql = [];
  const capturedValues = [];
  const tx = buildTx({ capturedSql, capturedValues });
  const fakePrisma = {
    runWithTenant: (_tenantId, callback) => callback(),
    $transaction: async (callback) => callback(tx),
    timePunch: { findFirst: async () => null }
  };
  const loaded = loadHrService(fakePrisma);
  try {
    const result = await punchSalida(loaded.service);
    assert.equal(result.ok, true, "la salida vehicular debe cerrarse sin error");
    const joined = capturedSql.join("\n");
    const joinedValues = capturedValues.flat().map(String).join("\n");
    assert.match(joined, /pg_advisory_xact_lock/, "debe serializar el renglon activo de kilometraje con lock");
    assert.match(joinedValues, /^tenant-qa:kilometraje:\d+:\d+$/m, "el lock debe usar el alcance estable del renglon de kilometraje");
    assert.match(joined, /SELECT id FROM th_jornada_kilometrajes[\s\S]*active = true/, "debe buscar el renglon activo antes de escribir");
    assert.match(joined, /INSERT INTO th_jornada_kilometrajes/, "sin renglon activo debe insertar");
    assert.doesNotMatch(joined, /ON CONFLICT[\s\S]*th_jornada_kilometrajes|th_jornada_kilometrajes[\s\S]*ON CONFLICT/, "no debe inferir un indice unico que difiere entre ambientes");
  } finally {
    loaded.restore();
  }
});

test("FM-01: con renglon activo previo la salida actualiza el kilometraje en lugar de duplicar", async () => {
  const capturedSql = [];
  const tx = buildTx({ capturedSql, activeMileageRow: { id: 500 } });
  const fakePrisma = {
    runWithTenant: (_tenantId, callback) => callback(),
    $transaction: async (callback) => callback(tx),
    timePunch: { findFirst: async () => null }
  };
  const loaded = loadHrService(fakePrisma);
  try {
    const result = await punchSalida(loaded.service);
    assert.equal(result.ok, true);
    const joined = capturedSql.join("\n");
    assert.match(joined, /UPDATE th_jornada_kilometrajes[\s\S]*WHERE id = \?/, "debe actualizar el renglon activo existente");
    assert.doesNotMatch(joined, /INSERT INTO th_jornada_kilometrajes/, "no debe insertar un segundo renglon activo");
  } finally {
    loaded.restore();
  }
});

test("FM-01: un fallo real del escritura de kilometraje se propaga y no envenena la transaccion en silencio", async () => {
  const capturedSql = [];
  const tx = buildTx({ capturedSql, failKilometraje: true });
  const fakePrisma = {
    runWithTenant: (_tenantId, callback) => callback(),
    $transaction: async (callback) => callback(tx),
    timePunch: { findFirst: async () => null }
  };
  const loaded = loadHrService(fakePrisma);
  try {
    await assert.rejects(
      punchSalida(loaded.service),
      /42P10|Raw query failed/i,
      "el error de escritura debe propagarse (sin .catch que lo trague y aborte la transaccion)"
    );
  } finally {
    loaded.restore();
  }
});

test("FM-01: el servicio resuelve kilometraje sin ON CONFLICT y sin tragar errores", () => {
  const service = fs.readFileSync(path.resolve(__dirname, "../src/modules/hr/service.js"), "utf8");
  const start = service.indexOf("if (dayMileage != null)");
  assert.ok(start >= 0, "debe existir el bloque de kilometraje del dia");
  const block = service.slice(start, start + 2200);
  assert.match(block, /pg_advisory_xact_lock/);
  assert.match(block, /SELECT id FROM th_jornada_kilometrajes/);
  assert.match(block, /UPDATE th_jornada_kilometrajes/);
  assert.match(block, /INSERT INTO th_jornada_kilometrajes/);
  assert.doesNotMatch(block, /ON CONFLICT \(tenant_id, route_id, employee_id, active\)/, "no debe usar el objetivo de conflicto roto que provoca 42P10");
  assert.doesNotMatch(block, /ON CONFLICT \(tenant_id, COALESCE\(route_id, -1\)/, "tampoco debe depender del indice expresion ausente en QA");
  assert.doesNotMatch(block, /DO NOTHING[\s\S]{0,40}\.catch\(\(\) => null\)/, "la escritura de kilometraje no debe tragar errores");
});
