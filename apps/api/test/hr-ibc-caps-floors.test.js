const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

process.env.DISABLE_REDIS = "true";

const SMMLV = 1750905;
const MONTHLY_TOP = SMMLV * 25;
const HALF_MONTH_TOP = SMMLV * 12.5;
const HALF_MONTH_FLOOR = SMMLV * 0.5;

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

function buildContributionFake({ employee, payrollDocuments = [] }) {
  async function queryRaw(strings) {
    const sql = sqlText(strings);
    if (sql.includes("th_parametros_laborales")) {
      return [
        { code: "SMMLV", value: SMMLV, unit: "currency", metadata: {} },
        { code: "IBC_TOPE_SMMLV", value: 25, unit: "smmlv", metadata: {} }
      ];
    }
    if (sql.includes("th_nomina_documentos")) return payrollDocuments;
    return [];
  }
  return {
    runWithTenant: (_tenantId, callback) => Promise.resolve(callback()),
    tenant: { findUnique: async () => null },
    employee: { findMany: async () => [employee] },
    $queryRaw: queryRaw,
    $executeRaw: async () => 1
  };
}

function contributionEmployee(salaryBase = 2000000) {
  return { id: 1, code: "EMP-1", salary_base: salaryBase, metadata: { name: "Empleado IBC", social_security: { arl_risk_class: 1 } }, user: null };
}

function payrollDocument({ ibc, days = 30 }) {
  return {
    employee_id: 1,
    source_summary: {
      ibc,
      worked_cotizable_remuneration: ibc,
      days_worked: days,
      contribution_worked_days: days,
      devengos_salariales: ibc
    }
  };
}

async function previewContributions({ salaryBase, documents, periodType = "mes", start = "2026-09-01", end = "2026-09-30", options = {} }) {
  const loaded = loadHrService(buildContributionFake({ employee: contributionEmployee(salaryBase), payrollDocuments: documents }));
  try {
    return await loaded.service.previewSocialContributions("tenant-qa", { fecha_inicio: start, fecha_fin: end, period_type: periodType }, options);
  } finally {
    loaded.restore();
  }
}

function buildLiquidationFake({ salaryBase, periodDays }) {
  const days = Array.from({ length: periodDays }, (_, index) => ({
    employee_id: 1,
    date: new Date(Date.UTC(2026, 8, index + 1)),
    ordinary_day_minutes: 480,
    ordinary_night_minutes: 0,
    overtime_day_minutes: 0,
    overtime_night_minutes: 0,
    inconsistent: false
  }));
  const deductionRows = [
    { code: "DED_SALUD", name: "Deduccion salud empleado", value: 4, unit: "percent", metadata: { category: "deduction", legal_group: "seguridad_social" } },
    { code: "DED_PENSION", name: "Deduccion pension empleado", value: 4, unit: "percent", metadata: { category: "deduction", legal_group: "seguridad_social" } },
    { code: "DED_FONDO_SOLIDARIDAD_PENSIONAL", name: "Fondo de solidaridad pensional", value: 0, unit: "percent", metadata: { category: "deduction", legal_group: "seguridad_social" } }
  ];
  const parameterRows = [
    { code: "SMMLV", value: SMMLV, unit: "currency", metadata: {} },
    { code: "AUX_TRANSPORTE", value: 249095, unit: "currency", metadata: {} },
    { code: "AUX_TRANSPORTE_TOPE_SMMLV", value: 2, unit: "smmlv", metadata: {} },
    { code: "IBC_TOPE_SMMLV", value: 25, unit: "smmlv", metadata: {} },
    { code: "IBC_CAPS_FLOORS", value: null, unit: "json", metadata: { salud: {}, pension: {}, arl: {} } }
  ];
  async function queryRaw(strings) {
    const sql = sqlText(strings);
    if (sql.includes("th_parametros_laborales")) {
      return sql.includes("metadata->>'category'") ? deductionRows : parameterRows;
    }
    return [];
  }
  return {
    runWithTenant: (_tenantId, callback) => Promise.resolve(callback()),
    tenant: { findUnique: async () => null },
    employee: {
      findMany: async () => [{
        id: 1,
        code: "EMP-1",
        salary_base: salaryBase,
        metadata: { name: "Empleado IBC", social_security: { arl_risk_class: 1 } },
        user: null
      }]
    },
    processedWorkday: { findMany: async () => days },
    timePunch: { findMany: async () => [] },
    workSchedule: { findMany: async () => [] },
    timeRoute: { findMany: async () => [] },
    $queryRaw: queryRaw,
    $executeRaw: async () => 1
  };
}

async function previewLiquidation({ salaryBase, periodDays, periodType = "mes", end = "2026-09-30" }) {
  const loaded = loadHrService(buildLiquidationFake({ salaryBase, periodDays }));
  try {
    const result = await loaded.service.previewPayrollLiquidation("tenant-qa", { fecha_inicio: "2026-09-01", fecha_fin: end, period_type: periodType });
    return result.documents[0];
  } finally {
    loaded.restore();
  }
}

test("la migracion siembra tope y configuracion de IBC con vigencia 2026", () => {
  const migration = fs.readFileSync(
    path.resolve(__dirname, "../prisma/migrations/20261030130000_hr_ibc_caps_floors_2026/migration.sql"),
    "utf8"
  );
  assert.match(migration, /'IBC_TOPE_SMMLV', 'Tope del IBC en SMMLV', 25/);
  assert.match(migration, /DATE '2026-01-01'/);
  assert.match(migration, /'IBC_CAPS_FLOORS'/);
  assert.match(migration, /WHERE NOT EXISTS/);
});

test("aportes aplica el piso de 1 SMMLV cuando la nomina ordinaria no trae novedades", async () => {
  const { document } = await previewContributions({ salaryBase: 1400000, documents: [payrollDocument({ ibc: 1400000 })] });
  const employee = document.employees[0];
  assert.equal(employee.ibc, SMMLV, "el IBC se eleva al piso legal");
  assert.equal(employee.ibc_by_subsystem.salud, SMMLV);
  assert.equal(employee.ibc_by_subsystem.pension, SMMLV);
  assert.equal(employee.ibc_by_subsystem.arl, SMMLV);
  assert.equal(employee.ibc_by_subsystem.parafiscales, 1400000, "los parafiscales no se tocan en esta intervencion");
  const salud = document.lines.find((line) => line.concept_code === "DED_SALUD");
  assert.equal(salud.ibc, SMMLV);
  assert.equal(salud.employee_amount, 70036.2, "4% sobre el piso");
});

test("aportes aplica el tope de 25 SMMLV sobre el IBC mensual", async () => {
  const raw = SMMLV * 30;
  const { document } = await previewContributions({ salaryBase: raw, documents: [payrollDocument({ ibc: raw })] });
  const employee = document.employees[0];
  assert.equal(employee.ibc, MONTHLY_TOP);
  assert.equal(employee.ibc_by_subsystem.salud, MONTHLY_TOP);
  assert.equal(employee.ibc_by_subsystem.parafiscales, raw);
  const salud = document.lines.find((line) => line.concept_code === "DED_SALUD");
  assert.equal(salud.ibc, MONTHLY_TOP);
  assert.equal(salud.employee_amount, MONTHLY_TOP * 0.04);
  const solidaridad = document.lines.find((line) => line.concept_code === "DED_FONDO_SOLIDARIDAD_PENSIONAL");
  assert.equal(solidaridad.ibc, MONTHLY_TOP, "la solidaridad se calcula sobre el IBC topado");
});

test("aportes prorratea tope y piso en una quincena", async () => {
  const raw = SMMLV * 20;
  const { document } = await previewContributions({
    salaryBase: raw * 2,
    documents: [payrollDocument({ ibc: raw, days: 15 })],
    periodType: "quincena",
    end: "2026-09-15"
  });
  const employee = document.employees[0];
  assert.equal(employee.ibc, HALF_MONTH_TOP, "12.5 SMMLV en 15 dias");
  const baja = await previewContributions({
    salaryBase: 700000,
    documents: [payrollDocument({ ibc: 700000, days: 15 })],
    periodType: "quincena",
    end: "2026-09-15"
  });
  assert.equal(baja.document.employees[0].ibc, HALF_MONTH_FLOOR, "0.5 SMMLV en 15 dias");
});

test("aportes rechaza el salario como fallback cuando no hay nomina liquidada", async () => {
  await assert.rejects(
    () => previewContributions({ salaryBase: 2000000, documents: [] }),
    (error) => error.statusCode === 409 && error.code === "IBC_REPORTADO_REQUERIDO" && /liquide la nomina/i.test(error.message)
  );
  const tolerant = await previewContributions({ salaryBase: 2000000, documents: [], options: { allowMissingPayroll: true } });
  assert.equal(tolerant.document.employees.length, 0);
  assert.deepEqual(tolerant.document.source_summary.missing_payroll.map((row) => row.employee_id), [1]);
});

test("nomina deduce salud y pension sobre el piso de IBC", async () => {
  const row = await previewLiquidation({ salaryBase: 1400000, periodDays: 30 });
  assert.equal(row.source_summary.ibc, SMMLV);
  const auxilio = row.lines.find((line) => line.code === "AUX_TRANSPORTE");
  assert.equal(row.source_summary.ibc_sin_topes, row.gross - auxilio.amount, "la base sin tope excluye el auxilio y conserva el recargo dominical");
  assert.equal(row.source_summary.ibc_reglas.aplicado, true);
  const salud = row.lines.find((line) => line.code === "DED_SALUD");
  const pension = row.lines.find((line) => line.code === "DED_PENSION");
  assert.equal(Math.abs(salud.amount), 70036.2);
  assert.equal(Math.abs(pension.amount), 70036.2);
});

test("nomina deduce sobre el tope de IBC y calcula la solidaridad con la misma base", async () => {
  const raw = SMMLV * 30;
  const row = await previewLiquidation({ salaryBase: raw, periodDays: 30 });
  assert.equal(row.source_summary.ibc, MONTHLY_TOP);
  assert.equal(row.source_summary.ibc_sin_topes, row.gross, "sin auxilio por superar 2 SMMLV la base sin tope es el devengo total");
  const salud = row.lines.find((line) => line.code === "DED_SALUD");
  assert.equal(Math.abs(salud.amount), MONTHLY_TOP * 0.04);
  const solidaridad = row.lines.find((line) => line.code === "DED_FONDO_SOLIDARIDAD_PENSIONAL");
  assert.equal(Math.abs(solidaridad.amount), MONTHLY_TOP * 0.02);
});
