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
    activityEvidence: { findMany: async () => [] }
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
