const assert = require("node:assert/strict");
const test = require("node:test");

process.env.DISABLE_REDIS = "true";

const SCHEDULE = { id: 7, tenant_id: "tenant-1", start_time: "08:00", end_time: "17:00", lunch_start_time: "12:00", lunch_end_time: "13:00", active: true };
const EMPLOYEE = { id: 1, tenant_id: "tenant-1", code: "QA-1", metadata: { name: "Uno" }, user: { name: "Uno", email: "uno@example.invalid" } };

function punch(id, type, iso) {
  return { id, employee_id: 1, user_name: "Uno", type, date: new Date(`${iso.slice(0, 10)}T05:00:00.000Z`), time: iso.slice(11, 16), punched_at: new Date(`${iso}-05:00`), route_id: null, vehicle_plate: "" };
}

function loadHrService(fakePrisma) {
  const prismaPath = require.resolve("../src/core/prisma");
  const servicePath = require.resolve("../src/modules/hr/service");
  const tenantCachePath = require.resolve("../src/core/tenantCache");
  const previous = [prismaPath, servicePath, tenantCachePath].map((path) => [path, require.cache[path]]);
  require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: fakePrisma };
  delete require.cache[tenantCachePath];
  delete require.cache[servicePath];
  const service = require(servicePath);
  return {
    service,
    restore() {
      delete require.cache[servicePath];
      delete require.cache[tenantCachePath];
      for (const [path, cached] of previous) {
        if (cached) require.cache[path] = cached;
        else delete require.cache[path];
      }
    }
  };
}

function workdayPrisma({ stored = [], punches = [] } = {}) {
  return {
    runWithTenant: async (tenantId, run) => run(),
    tenant: { findUnique: async ({ where }) => ({ id: where.id, config: {} }) },
    processedWorkday: { findMany: async () => stored },
    employee: { findMany: async () => [EMPLOYEE] },
    workSchedule: { findMany: async () => [SCHEDULE] },
    timePunch: { findMany: async () => punches },
    timeRoute: { findMany: async () => [] },
    $queryRaw: async () => []
  };
}

test("listWorkdays proyecta las marcaciones del rango aunque el dia no se haya procesado", async () => {
  const punches = [
    punch(1, "entrada", "2026-09-02T08:00"),
    punch(2, "inicio_almuerzo", "2026-09-02T12:00"),
    punch(3, "fin_almuerzo", "2026-09-02T13:00"),
    punch(4, "salida", "2026-09-02T18:00")
  ];
  const { service, restore } = loadHrService(workdayPrisma({ punches }));
  try {
    const days = await service.listWorkdays("tenant-1", { fecha_inicio: "2026-09-02", fecha_fin: "2026-09-02" });
    assert.equal(days.length, 1);
    assert.equal(days[0].employee_id, 1);
    assert.equal(days[0].source, "time_punch");
    assert.equal(days[0].overtime_day_minutes, 60, "la hora posterior a la jornada ordinaria queda como extra");
    assert.equal(days[0].employee?.user?.name, "Uno", "el reporte conserva la ficha del empleado");
    assert.equal(days[0].schedule?.id, 7, "el reporte conserva el horario aplicado");
  } finally {
    restore();
  }
});

test("listWorkdays conserva las jornadas procesadas sin marcaciones y refresca las que si tienen", async () => {
  const stored = [
    { id: 11, tenant_id: "tenant-1", employee_id: 1, date: new Date("2026-09-01T05:00:00.000Z"), schedule_id: 7, ordinary_day_minutes: 480, overtime_day_minutes: 0, employee: EMPLOYEE, schedule: SCHEDULE },
    { id: 12, tenant_id: "tenant-1", employee_id: 1, date: new Date("2026-09-02T05:00:00.000Z"), schedule_id: 7, ordinary_day_minutes: 1, overtime_day_minutes: 0, employee: EMPLOYEE, schedule: SCHEDULE }
  ];
  const punches = [
    punch(1, "entrada", "2026-09-02T08:00"),
    punch(2, "inicio_almuerzo", "2026-09-02T12:00"),
    punch(3, "fin_almuerzo", "2026-09-02T13:00"),
    punch(4, "salida", "2026-09-02T18:00")
  ];
  const { service, restore } = loadHrService(workdayPrisma({ stored, punches }));
  try {
    const days = await service.listWorkdays("tenant-1", { fecha_inicio: "2026-09-01", fecha_fin: "2026-09-02" });
    assert.equal(days.length, 2);
    const first = days.find((day) => day.id === 11);
    const second = days.find((day) => day.employee_id === 1 && new Date(day.date).toISOString().slice(0, 10) === "2026-09-02");
    assert.equal(first.ordinary_day_minutes, 480, "la jornada sin marcaciones se conserva tal como se proceso");
    assert.equal(second.ordinary_day_minutes, 480, "la marcacion reemplaza las horas cacheadas");
    assert.equal(second.overtime_day_minutes, 60);
    assert.equal(second.source, "time_punch");
  } finally {
    restore();
  }
});
