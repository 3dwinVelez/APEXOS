const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

process.env.DISABLE_REDIS = "true";

const SMMLV = 1750905;
const AUX_TRANSPORTE = 249095;

function read(relative) {
  return fs.readFileSync(path.resolve(__dirname, "..", "..", "..", relative), "utf8");
}

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

function sqlText(strings) {
  return Array.isArray(strings) ? strings.join("?") : String(strings);
}

function buildLaborFake({ salaryBase = 2000000, days = [], overtimeMinutesPerDay = 0, maxDailyHours = 2, maxWeeklyHours = 12 } = {}) {
  const workdays = days.map((date, index) => ({
    employee_id: 1,
    date,
    ordinary_day_minutes: 480,
    overtime_day_minutes: index < 1 ? overtimeMinutesPerDay : 0,
    overtime_night_minutes: 0,
    overtime_sunday_holiday_day_minutes: 0,
    overtime_sunday_holiday_night_minutes: 0,
    alerts: [],
    inconsistent: false
  }));
  const deductionRows = [
    { code: "DED_SALUD", name: "Deduccion salud empleado", value: 4, unit: "percent", metadata: { category: "deduction", legal_group: "seguridad_social" } },
    { code: "DED_PENSION", name: "Deduccion pension empleado", value: 4, unit: "percent", metadata: { category: "deduction", legal_group: "seguridad_social" } },
    { code: "DED_FONDO_SOLIDARIDAD_PENSIONAL", name: "Fondo de solidaridad pensional", value: 0, unit: "percent", metadata: { category: "deduction", legal_group: "seguridad_social" } }
  ];
  const parameterRows = [
    { code: "SMMLV", value: SMMLV, unit: "currency", metadata: {} },
    { code: "AUX_TRANSPORTE", value: AUX_TRANSPORTE, unit: "currency", metadata: {} },
    { code: "AUX_TRANSPORTE_TOPE_SMMLV", value: 2, unit: "smmlv", metadata: {} },
    { code: "IBC_TOPE_SMMLV", value: 25, unit: "smmlv", metadata: {} },
    { code: "IBC_CAPS_FLOORS", value: null, unit: "json", metadata: { salud: {}, pension: {}, arl: {} } },
    { code: "MAX_HE_DIARIO", value: maxDailyHours, unit: "hour", metadata: {} },
    { code: "MAX_HE_SEMANAL", value: maxWeeklyHours, unit: "hour", metadata: {} }
  ];
  async function queryRaw(strings) {
    const sql = sqlText(strings);
    if (sql.includes("th_parametros_laborales")) {
      return sql.includes("metadata->>'category'") ? deductionRows : parameterRows;
    }
    return [];
  }
  const fakePrisma = {
    runWithTenant: (_tenantId, callback) => Promise.resolve(callback()),
    tenant: { findUnique: async () => null },
    employee: {
      findMany: async () => [{
        id: 1,
        code: "EMP-1",
        salary_base: salaryBase,
        contract_type: "indefinido",
        metadata: { name: "Empleado Legal", social_security: { arl_risk_class: 1 } },
        user: null
      }]
    },
    processedWorkday: { findMany: async () => workdays },
    timeRoute: { findMany: async () => [] },
    $queryRaw: queryRaw,
    $executeRaw: async () => 1,
    $transaction: async (callback) => callback({
      $queryRaw: queryRaw,
      $executeRaw: async () => 1,
      payroll: { upsert: async () => ({ id: 900 }) }
    })
  };
  return fakePrisma;
}

async function previewRow(options) {
  const fake = buildLaborFake(options);
  const loaded = loadHrService(fake);
  try {
    const result = await loaded.service.previewPayrollLiquidation("tenant-qa", { fecha_inicio: "2026-09-01", fecha_fin: "2026-09-30", period_type: "mes", ...options.input });
    return result.documents[0];
  } finally {
    loaded.restore();
  }
}

function fullMonthDays() {
  return Array.from({ length: 30 }, (_, index) => new Date(Date.UTC(2026, 8, index + 1)));
}

test("R-07: una nomina sin marcaciones ni justificacion no paga salario ni prestaciones", async () => {
  const row = await previewRow({ days: [] });
  assert.equal(row.gross, 0, "sin soporte no hay devengos");
  assert.equal(row.source_summary.base_prestaciones_sociales, 0, "sin dias soportados no se causan prestaciones");
  assert.equal(row.source_summary.base_vacaciones, 0);
  assert.equal(row.lines.some((line) => line.code === "AUX_TRANSPORTE"), false, "sin dias soportados no hay auxilio");
});

test("R-07: la validacion bloquea con SIN_MARCACIONES y acepta justificacion trazable", async () => {
  const fake = buildLaborFake({ days: [] });
  const loaded = loadHrService(fake);
  try {
    const blocked = await loaded.service.validatePayrollPeriod("tenant-qa", { fecha_inicio: "2026-09-01", fecha_fin: "2026-09-30", period_type: "mes" });
    assert.equal(blocked.ok, false);
    assert.ok(blocked.issues.some((issue) => issue.code === "SIN_MARCACIONES" && issue.severity === "error"));

    const justified = await loaded.service.validatePayrollPeriod("tenant-qa", {
      fecha_inicio: "2026-09-01",
      fecha_fin: "2026-09-30",
      period_type: "mes",
      justificacion_sin_marcaciones: "Personal de direccion con salario fijo sin marcacion."
    });
    assert.equal(justified.ok, true);
    assert.ok(justified.issues.some((issue) => issue.code === "SIN_MARCACIONES_JUSTIFICADA" && issue.severity === "warning"));

    await assert.rejects(
      () => loaded.service.runPayrollLiquidation("tenant-qa", { fecha_inicio: "2026-09-01", fecha_fin: "2026-09-30", period_type: "mes" }),
      (error) => error.statusCode === 422 && error.code === "SIN_MARCACIONES"
    );
  } finally {
    loaded.restore();
  }
});

test("R-07: el auxilio de transporte no integra la base de prestaciones", async () => {
  const salaryBase = 2000000;
  const row = await previewRow({ salaryBase, days: fullMonthDays() });
  const auxilio = row.lines.find((line) => line.code === "AUX_TRANSPORTE");
  assert.ok(auxilio, "el auxilio se paga cuando el salario no supera 2 SMMLV");
  assert.equal(auxilio.include_in_social_benefits_base, false);
  assert.equal(auxilio.salary_constitutive, false);
  const b = row.source_summary.base_prestaciones_sociales;
  const salaryConstitutive = Math.round(row.lines.filter((line) => line.amount > 0 && line.salary_constitutive !== false).reduce((sum, line) => sum + line.amount, 0) * 100) / 100;
  assert.equal(b, salaryConstitutive, "la base son solo los devengos constitutivos de salario");
  assert.equal(b, row.gross - auxilio.amount, "el auxilio queda fuera de la base aunque se pague");
  assert.equal(row.source_summary.base_vacaciones, b);
});

test("R-10A: las horas extra por encima del tope quedan alertadas y trazadas", async () => {
  const row = await previewRow({ days: [new Date(Date.UTC(2026, 8, 1))], overtimeMinutesPerDay: 180 });
  const trace = row.source_summary.topes_trabajo_suplementario;
  assert.equal(trace.tope_diario_horas, 2);
  assert.equal(trace.tope_semanal_horas, 12);
  assert.equal(trace.excedido, true, "3 horas extra superan el tope diario de 2");
  assert.equal(trace.dias_excedidos.length, 1);
  assert.equal(trace.modo, "alerta");
  const fake = buildLaborFake({ days: [new Date(Date.UTC(2026, 8, 1))], overtimeMinutesPerDay: 180 });
  const loaded = loadHrService(fake);
  try {
    const validation = await loaded.service.validatePayrollPeriod("tenant-qa", { fecha_inicio: "2026-09-01", fecha_fin: "2026-09-30", period_type: "mes" });
    assert.ok(validation.issues.some((issue) => issue.code === "TOPES_TRABAJO_SUPLEMENTARIO"));
  } finally {
    loaded.restore();
  }
});

test("R-06: la libranza deriva el saldo de movimientos y excluye el periodo en curso", () => {
  const source = read("apps/api/src/modules/hr/service.js");
  assert.match(source, /available_balance/);
  assert.match(source, /period_key <> \$\{periodKey\}/, "el saldo disponible excluye el periodo que se reliquida");
  assert.match(source, /row\.available_balance/, "la linea de libranza usa el saldo derivado, no la columna espejo");
  assert.match(source, /if \(recalculate\) \{[\s\S]{0,400}buildPayrollLiquidationRows/, "la reversion corre antes de construir las filas");
});

test("R-08: la indemnizacion usa el SMMLV del periodo y ya no lee variables de entorno", () => {
  const source = read("apps/api/src/modules/hr/service.js");
  assert.doesNotMatch(source, /process\.env\.SMLV_CO/);
  assert.match(source, /10 \* referenceSmmlv/);
  assert.match(source, /smmlv_referencia_indemnizacion/);
  assert.match(source, /LEGAL_PARAMETER_FALLBACKS_CO_2026\.SMMLV/);
});

test("R-09: el motor plano historico delega en la liquidacion oficial", () => {
  const source = read("apps/api/src/modules/hr/service.js");
  const routes = read("apps/api/src/modules/hr/routes.js");
  assert.match(source, /async function processPayrollRange\([\s\S]{0,300}return runPayrollLiquidation/);
  assert.doesNotMatch(source, /hourly \* 1\.25/);
  assert.match(routes, /processPayrollRange\(request\.user\?\.tenant_id, request\.body \|\| \{\}, request\.user\)/);
});

test("R-10: el reporte operativo contrasta las horas extra con la jornada procesada", () => {
  const page = fs.readFileSync(path.resolve(__dirname, "..", "..", "web", "app", "dashboard", "talento-humano", "reportes", "page.tsx"), "utf8");
  assert.match(page, /\/api\/v1\/hr\/workdays\?fecha_inicio=/);
  assert.match(page, /liquidatedOvertimeMinutes/);
  assert.match(page, /Diferencia con nomina/);
});

test("la migracion 2026 corrige el auxilio y siembra los topes de trabajo suplementario", () => {
  const migration = fs.readFileSync(
    path.resolve(__dirname, "../prisma/migrations/20261113120000_hr_nomina_legal_2026/migration.sql"),
    "utf8"
  );
  assert.match(migration, /'AUX_TRANSPORTE'/);
  assert.match(migration, /include_in_social_benefits_base\}', 'false'/);
  assert.match(migration, /'MAX_HE_DIARIO', 'Maximo de horas extra por dia', 2/);
  assert.match(migration, /'MAX_HE_SEMANAL', 'Maximo de horas extra por semana', 12/);
  assert.match(migration, /WHERE NOT EXISTS/);
});
