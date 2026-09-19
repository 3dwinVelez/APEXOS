const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

process.env.DISABLE_REDIS = "true";

// Regresion FM-01: el cierre de jornada (salida) en ruta vehicular con kilometraje
// inserta en th_jornada_kilometrajes. El ON CONFLICT debe coincidir con el indice
// parcial real (tenant_id, COALESCE(route_id,-1), COALESCE(employee_id,-1)) WHERE active=true;
// de lo contrario PostgreSQL lanza 42P10, aborta la transaccion (25P02) y la marcacion
// se revierte con un 500 generico (la plataforma "se bloquea" al cerrar el dia).

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

function buildTx({ capturedSql, failKilometraje = false }) {
  const current = driverFreeEmployee();
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
    $executeRaw: async (...args) => {
      const sql = args[0].join("?");
      capturedSql.push(sql);
      if (failKilometraje && /th_jornada_kilometrajes/i.test(sql)) {
        const error = new Error("Raw query failed. Code: 42P10");
        error.code = "P2010";
        error.meta = { code: "42P10" };
        throw error;
      }
    }
  };
}

function kilometrajeSql(capturedSql) {
  return capturedSql.find((sql) => /th_jornada_kilometrajes/i.test(sql)) || "";
}

test("FM-01: la salida vehicular con kilometraje usa el ON CONFLICT del indice parcial real y cierra ok", async () => {
  const capturedSql = [];
  const tx = buildTx({ capturedSql });
  const fakePrisma = {
    runWithTenant: (_tenantId, callback) => callback(),
    $transaction: async (callback) => callback(tx),
    timePunch: { findFirst: async () => null }
  };
  const loaded = loadHrService(fakePrisma);
  try {
    const result = await loaded.service.createPunch("tenant-qa", {
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

    assert.equal(result.ok, true, "la salida vehicular debe cerrarse sin error");
    const sql = kilometrajeSql(capturedSql);
    assert.ok(sql, "debe ejecutarse el INSERT de th_jornada_kilometrajes");
    assert.match(sql, /ON CONFLICT \(tenant_id, COALESCE\(route_id, -1\), COALESCE\(employee_id, -1\)\)/, "el conflicto debe coincidir con el indice parcial expresion");
    assert.match(sql, /WHERE active = true/, "debe conservar el predicado del indice parcial");
    assert.doesNotMatch(sql, /ON CONFLICT \(tenant_id, route_id, employee_id, active\)/, "no debe usar el objetivo de conflicto roto que provoca 42P10");
  } finally {
    loaded.restore();
  }
});

test("FM-01: un fallo real del INSERT de kilometraje se propaga y no envenena la transaccion en silencio", async () => {
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
      loaded.service.createPunch("tenant-qa", {
        employee_id: 41,
        user_name: "EMP-41",
        route_id: 12,
        type: "salida",
        punched_at: new Date().toISOString(),
        kilometraje_dia: "42.5",
        idempotency_key: "qa-km-salida-0002"
      }, { id: 7, email: "empleado41@apexos.local" }),
      /42P10|Raw query failed/i,
      "el error del INSERT debe propagarse (sin .catch que lo trague y aborte la transaccion)"
    );
  } finally {
    loaded.restore();
  }
});

test("FM-01: el servicio ya no traga el error del INSERT de kilometraje con .catch(() => null)", () => {
  const service = fs.readFileSync(path.resolve(__dirname, "../src/modules/hr/service.js"), "utf8");
  const start = service.indexOf("INSERT INTO th_jornada_kilometrajes");
  assert.ok(start >= 0, "debe existir el INSERT de th_jornada_kilometrajes");
  const block = service.slice(start, start + 900);
  assert.match(block, /ON CONFLICT \(tenant_id, COALESCE\(route_id, -1\), COALESCE\(employee_id, -1\)\)/);
  assert.doesNotMatch(block, /ON CONFLICT \(tenant_id, route_id, employee_id, active\)/);
  // El executeRaw del kilometraje no debe terminar en .catch(() => null) (enmascaraba el 42P10).
  const conflictEnd = block.indexOf("DO NOTHING");
  const afterConflict = block.slice(conflictEnd, conflictEnd + 60);
  assert.doesNotMatch(afterConflict, /\.catch\(\(\) => null\)/, "el INSERT de kilometraje no debe tragar errores");
});
