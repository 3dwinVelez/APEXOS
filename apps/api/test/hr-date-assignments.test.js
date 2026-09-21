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

test("listDateAssignments acota al dia operativo con el mismo filtro que el chequeo de solapamiento", async () => {
  const calls = [];
  const rows = [
    { id: 1, employees: ["EMP-1"], start_time: "08:00", end_time: "17:00", status: "active", vehicle_plate: "ABC123" },
    { id: 2, employees: ["EMP-2"], start_time: "17:00", end_time: "20:00", status: "closed", vehicle_plate: "" }
  ];
  const fakePrisma = {
    runWithTenant: async (tenantId, run) => run(),
    timeRoute: { findMany: async (args) => { calls.push(args); return rows; } }
  };
  const { service, restore } = loadHrService(fakePrisma);
  try {
    const result = await service.listDateAssignments("tenant-1", { date: "2026-09-21" });
    assert.equal(calls.length, 1);
    const where = calls[0].where;
    assert.equal(where.tenant_id, "tenant-1");
    assert.deepEqual(where.status.notIn, ["cancelled", "cancelada", "inactive", "inactiva"]);
    // Medianoche de America/Bogota: 05:00Z. Si la ventana derivara, el aviso del formulario
    // y el 409 MALLA_SOLAPADA dejarian de coincidir.
    assert.match(where.date.gte.toISOString(), /^2026-09-21T05:00:00\.000Z$/);
    assert.match(where.date.lt.toISOString(), /^2026-09-22T05:00:00\.000Z$/);
    assert.deepEqual(result, [
      { route_id: 1, date: "2026-09-21", start_time: "08:00", end_time: "17:00", status: "active", vehicle_plate: "ABC123", employees: ["EMP-1"] },
      { route_id: 2, date: "2026-09-21", start_time: "17:00", end_time: "20:00", status: "closed", vehicle_plate: "", employees: ["EMP-2"] }
    ]);
  } finally {
    restore();
  }
});

test("listDateAssignments rechaza una fecha mal formada sin consultar la base", async () => {
  let queried = false;
  const fakePrisma = {
    runWithTenant: async (tenantId, run) => run(),
    timeRoute: { findMany: async () => { queried = true; return []; } }
  };
  const { service, restore } = loadHrService(fakePrisma);
  try {
    await assert.rejects(
      () => service.listDateAssignments("tenant-1", { date: "21/09/2026" }),
      (error) => error.code === "FECHA_INVALIDA"
    );
    assert.equal(queried, false);
  } finally {
    restore();
  }
});
