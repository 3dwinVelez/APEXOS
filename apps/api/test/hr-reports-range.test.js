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

test("reportes de Talento Humano consultan el rango inclusivo solicitado", async () => {
  const received = {};
  const fakePrisma = {
    runWithTenant: (_tenantId, callback) => callback(),
    timePunch: { findMany: async (query) => { received.attendance = query; return []; } },
    workActivity: { findMany: async (query) => { received.activities = query; return []; } },
    timeRoute: { findMany: async (query) => { received.routes = query; return []; } },
    employee: { findMany: async () => [] }
  };
  const loaded = loadHrService(fakePrisma);
  try {
    const query = { fecha_inicio: "2026-08-01", fecha_fin: "2026-08-10" };
    await loaded.service.listAttendance("tenant-qa", query);
    await loaded.service.listWorkActivities("tenant-qa", query);
    await loaded.service.listRoutes("tenant-qa", query);

    const expected = { gte: new Date("2026-08-01T05:00:00.000Z"), lt: new Date("2026-08-11T05:00:00.000Z") };
    assert.deepEqual(received.attendance.where.date, expected);
    assert.deepEqual(received.activities.where.occurred_at, expected);
    assert.deepEqual(received.routes.where.date, expected);
  } finally {
    loaded.restore();
  }
});

test("reportes rechazan rangos invertidos o mayores a 92 dias", async () => {
  const fakePrisma = { runWithTenant: () => { throw new Error("no debe consultar la base"); } };
  const loaded = loadHrService(fakePrisma);
  try {
    await assert.rejects(
      () => loaded.service.listAttendance("tenant-qa", { fecha_inicio: "2026-08-10", fecha_fin: "2026-08-01" }),
      (error) => error.statusCode === 400 && error.code === "INVALID_REPORT_DATE_RANGE"
    );
    await assert.rejects(
      () => loaded.service.listWorkActivities("tenant-qa", { fecha_inicio: "2026-01-01", fecha_fin: "2026-08-01" }),
      (error) => error.statusCode === 400 && error.code === "REPORT_DATE_RANGE_TOO_LARGE"
    );
  } finally {
    loaded.restore();
  }
});
