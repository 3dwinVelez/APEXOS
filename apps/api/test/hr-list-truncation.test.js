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

function summaryRow(id) {
  return { id, date: new Date("2026-09-21T05:00:00.000Z"), employees: [] };
}

function summaryPrisma(rows, calls) {
  return {
    runWithTenant: async (tenantId, run) => run(),
    timeRoute: { findMany: async (args) => { calls.push(args); return rows; } },
    employee: { findMany: async () => [] },
    timePunch: { groupBy: async () => [], findMany: async () => [] },
    workActivity: { groupBy: async () => [], findMany: async () => [] },
    activityEvidence: { findMany: async () => [] },
    // El conteo de evidencias por ruta salio del `select` con base64 y hoy viene de `$queryRaw`
    // (monitorEvidenceRows.js); sin esta llave el stub revienta antes de llegar al truncamiento.
    $queryRaw: async () => []
  };
}

test("listRoutes gobierna el limite explicito entre 50 y 500", async () => {
  const calls = [];
  const fakePrisma = {
    runWithTenant: async (tenantId, run) => run(),
    timeRoute: { findMany: async (args) => { calls.push(args); return []; } },
    employee: { findMany: async () => [] }
  };
  const { service, restore } = loadHrService(fakePrisma);
  try {
    await service.listRoutes("tenant-1", { limit: 500 });
    await service.listRoutes("tenant-1", {});
    await service.listRoutes("tenant-1", { limit: 99999 });
    await service.listRoutes("tenant-1", { limit: 10 });
    await service.listRoutes("tenant-1", { limit: "abc" });
    assert.deepEqual(calls.map((call) => call.take), [500, 100, 500, 50, 100]);
  } finally {
    restore();
  }
});

test("listRouteEventSummaries consulta limite+1 y senala el truncamiento", async () => {
  const calls = [];
  const rows = Array.from({ length: 101 }, (unused, index) => summaryRow(index + 1));
  const { service, restore } = loadHrService(summaryPrisma(rows, calls));
  try {
    const result = await service.listRouteEventSummaries("tenant-1");
    assert.equal(calls[0].take, 101);
    assert.equal(result.truncation.truncated, true);
    assert.equal(result.truncation.limit, 100);
    assert.equal(result.truncation.returned, 100);
    assert.ok(result.truncation.hint.includes("100 rutas mas recientes"));
    assert.equal(result.routes.length, 100);
  } finally {
    restore();
  }
});

test("listRouteEventSummaries sin desborde reporta truncamiento en falso", async () => {
  const calls = [];
  const rows = [summaryRow(1), summaryRow(2)];
  const { service, restore } = loadHrService(summaryPrisma(rows, calls));
  try {
    const result = await service.listRouteEventSummaries("tenant-1");
    assert.equal(result.truncation.truncated, false);
    assert.equal(result.truncation.returned, 2);
    assert.equal(result.truncation.hint, "");
  } finally {
    restore();
  }
});

test("listRouteEventSummaries vacio conserva la senal de truncamiento en la respuesta", async () => {
  const { service, restore } = loadHrService(summaryPrisma([], []));
  try {
    const result = await service.listRouteEventSummaries("tenant-1");
    assert.deepEqual(result.routes, []);
    assert.equal(result.truncation.truncated, false);
  } finally {
    restore();
  }
});

// El agregado unico por tipo tiene que reproducir los dos conteos que daban dos sentencias. Con el
// stub devolviendo [] todo sale cero y la derivacion pasa en falso, asi que aqui viajan filas reales
// de dos rutas y dos tipos: si el total o las salidas se desalinean, el monitor muestra 0 marcaciones
// sobre datos que si existen.
test("una sola agregacion de TimePunch reproduce total, salidas y ultimo evento", async () => {
  const llamadas = [];
  const fakePrisma = {
    runWithTenant: async (tenantId, run) => run(),
    timeRoute: { findMany: async () => [summaryRow(1), summaryRow(2)] },
    employee: { findMany: async () => [] },
    timePunch: {
      groupBy: async (args) => {
        llamadas.push(args);
        return [
          { route_id: 1, type: "entrada", _count: { _all: 3 }, _max: { punched_at: new Date("2026-09-21T10:00:00.000Z") } },
          { route_id: 1, type: "salida", _count: { _all: 2 }, _max: { punched_at: new Date("2026-09-21T18:00:00.000Z") } },
          { route_id: 2, type: "entrada", _count: { _all: 1 }, _max: { punched_at: new Date("2026-09-21T09:00:00.000Z") } }
        ];
      },
      findMany: async () => []
    },
    workActivity: { groupBy: async () => [], findMany: async () => [] },
    activityEvidence: { findMany: async () => [] },
    $queryRaw: async () => []
  };
  const { service, restore } = loadHrService(fakePrisma);
  try {
    const result = await service.listRouteEventSummaries("tenant-1");
    assert.equal(llamadas.length, 1, `TimePunch vuelve a agregarse en ${llamadas.length} sentencias`);
    assert.ok(llamadas[0].by.includes("type"), "el agregado unico no trae el tipo: no puede derivar las salidas");
    const byId = new Map(result.routes.map((row) => [row.route_id, row]));
    assert.equal(byId.get(1).punch_count, 5, "el total de marcaciones no suma los tipos");
    assert.equal(byId.get(1).closed_count, 2, "las salidas no se derivan del agregado por tipo");
    assert.equal(byId.get(2).punch_count, 1);
    assert.equal(byId.get(2).closed_count, 0, "una ruta sin salidas sale cerrada");
    assert.equal(byId.get(1).last_event_at, "2026-09-21T18:00:00.000Z", "el max se queda con el primer tipo procesado");
  } finally {
    restore();
  }
});

test("listRouteEventSummaries acota las rutas al dia que la pantalla tiene fijado", async () => {
  const calls = [];
  const { service, restore } = loadHrService(summaryPrisma([summaryRow(1)], calls));
  try {
    await service.listRouteEventSummaries("tenant-1", { date: "2026-11-23" });
    const range = calls[0].where?.date;
    assert.ok(range?.gte instanceof Date, "la consulta perdio la ventana del dia");
    assert.ok(range?.lt instanceof Date);
    // Dia calendario en America/Bogota: arranca a las 05:00 UTC del mismo numero de dia.
    assert.equal(range.gte.toISOString(), "2026-11-23T05:00:00.000Z");
    assert.equal(range.lt.toISOString(), "2026-11-24T05:00:00.000Z");
  } finally {
    restore();
  }
});

test("listRouteEventSummaries sin fecha sigue recorriendo todo el historial", async () => {
  const calls = [];
  const { service, restore } = loadHrService(summaryPrisma([summaryRow(1)], calls));
  try {
    await service.listRouteEventSummaries("tenant-1");
    assert.deepEqual(calls[0].where, {}, "el resumen dejo de ser historico cuando no se le pide dia");
  } finally {
    restore();
  }
});

test("listRouteEventSummaries avisa el rango en la senal de truncamiento", async () => {
  const rows = Array.from({ length: 101 }, (unused, index) => summaryRow(index + 1));
  const { service, restore } = loadHrService(summaryPrisma(rows, []));
  try {
    const result = await service.listRouteEventSummaries("tenant-1", { from: "2026-11-01", to: "2026-11-23" });
    assert.ok(result.truncation.hint.includes("100 rutas mas recientes"));
    assert.ok(result.truncation.hint.includes("del rango consultado"), "el hint sigue prometiendo el historial completo");
  } finally {
    restore();
  }
});

test("listRouteEventSummaries rechaza un rango mas alla del tope del reporte", async () => {
  const { service, restore } = loadHrService(summaryPrisma([], []));
  try {
    await assert.rejects(
      () => service.listRouteEventSummaries("tenant-1", { from: "2026-01-01", to: "2026-11-23" }),
      /rango maximo permitido/
    );
  } finally {
    restore();
  }
});
