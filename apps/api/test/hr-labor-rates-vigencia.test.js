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

const { processWorkday } = require("../src/modules/hr/timeLogic");

const schedule = {
  id: 10,
  active: true,
  start_time: null,
  end_time: null,
  // Almuerzo programado fuera del turno nocturno para no descontar minutos.
  lunch_start_time: "12:00",
  lunch_end_time: "13:00"
};

const employee = { id: 1, code: "EMP-01", metadata: {}, user: null, active: true };

function punchesFor(date, entry, exit) {
  return [
    { id: 1, employee_id: 1, user_name: "EMP-01", type: "entrada", punched_at: `${date}T${entry}:00-05:00` },
    { id: 2, employee_id: 1, user_name: "EMP-01", type: "salida", punched_at: `${date}T${exit}:00-05:00` }
  ];
}

function buildProcessDayPrisma({ nightStart = 19, punches = punchesFor("2026-10-28", "19:00", "22:00") } = {}) {
  const created = [];
  const fakePrisma = {
    created,
    runWithTenant: (tenantId, callback) => Promise.resolve(callback()),
    employee: { findMany: async () => [employee] },
    workSchedule: { findMany: async () => [schedule] },
    timePunch: { findMany: async () => punches },
    processedWorkday: {
      upsert: async ({ create }) => {
        created.push(create);
        return create;
      }
    },
    $queryRaw: async (strings) => {
      const sql = Array.isArray(strings) ? strings.join("?") : String(strings);
      if (sql.includes("th_parametros_laborales")) {
        return [
          { code: "JORNADA_NOCTURNA_INICIO", value: nightStart, metadata: {} },
          { code: "JORNADA_NOCTURNA_FIN", value: 6, metadata: {} }
        ];
      }
      return [];
    }
  };
  return fakePrisma;
}

test("processWorkday clasifica como nocturno desde las 19:00 por defecto", () => {
  const result = processWorkday({
    employee,
    schedule,
    punches: punchesFor("2026-10-28", "19:00", "21:00"),
    params: {},
    holidays: new Set(),
    date: new Date("2026-10-28T00:00:00-05:00")
  });
  assert.equal(result.ordinary_night_minutes, 120);
  assert.equal(result.ordinary_day_minutes, 0);
});

test("processDay lee JORNADA_NOCTURNA_INICIO del tenant", async () => {
  const fakePrisma = buildProcessDayPrisma({ nightStart: 19 });
  const { service, restore } = loadHrService(fakePrisma);
  try {
    const result = await service.processDay("tenant-a", { date: "2026-10-28" });
    assert.equal(result.processed, 1);
    assert.equal(fakePrisma.created[0].ordinary_night_minutes, 180);
    assert.equal(fakePrisma.created[0].ordinary_day_minutes, 0);
  } finally {
    restore();
  }
});

test("processDay respeta un inicio nocturno configurado en 21:00", async () => {
  const fakePrisma = buildProcessDayPrisma({ nightStart: 21 });
  const { service, restore } = loadHrService(fakePrisma);
  try {
    await service.processDay("tenant-a", { date: "2026-10-28" });
    assert.equal(fakePrisma.created[0].ordinary_day_minutes, 120);
    assert.equal(fakePrisma.created[0].ordinary_night_minutes, 60);
  } finally {
    restore();
  }
});

test("el divisor mensual sigue la jornada vigente (220 hasta 14-jul, 210 desde 15-jul)", () => {
  const { service, restore } = loadHrService({});
  try {
    assert.equal(service.__monthlyOrdinaryHoursForDate("2026-01-01"), 220);
    assert.equal(service.__monthlyOrdinaryHoursForDate("2026-06-30"), 220);
    assert.equal(service.__monthlyOrdinaryHoursForDate("2026-07-14"), 220);
    assert.equal(service.__monthlyOrdinaryHoursForDate("2026-07-15"), 210);
    assert.equal(service.__monthlyOrdinaryHoursForDate("2026-08-01"), 210);
  } finally {
    restore();
  }
});
