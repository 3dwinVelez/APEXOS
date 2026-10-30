const assert = require("node:assert/strict");
const test = require("node:test");

process.env.DISABLE_REDIS = "true";

const SMMLV = 1750905;

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

// Prisma.join devuelve un Prisma.Sql cuyos parametros no se aplanan hasta la ejecucion real;
// este helper recorre esos fragmentos para inspeccionar los valores que recibe el fake.
function flattenParams(values) {
  const flat = [];
  const walk = (value) => {
    if (Array.isArray(value)) value.forEach(walk);
    else if (value && Array.isArray(value.values)) value.values.forEach(walk);
    else flat.push(value);
  };
  values.forEach(walk);
  return flat;
}

// Fake de cierre: la nomina nace durante el cierre (la validacion corre sin documentos y
// la liquidacion los crea). Asi se prueba el orden real validacion -> nomina -> provisiones
// -> aportes en vez de asumir documentos preexistentes.
function buildClosureFake({ salaryBase = 2000000 } = {}) {
  const events = [];
  const payrollDocuments = [];
  const periodKey = "mes:2026-09-01:2026-09-30";
  const days = Array.from({ length: 30 }, (_, index) => ({
    employee_id: 1,
    date: new Date(Date.UTC(2026, 8, index + 1))
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

  async function queryRaw(strings, ...values) {
    const sql = sqlText(strings);
    if (sql.includes("INSERT INTO th_nomina_documentos")) {
      const document = {
        id: 501,
        tenant_id: "tenant-qa",
        employee_id: 1,
        payroll_id: 900,
        period_key: periodKey,
        period_type: "mes",
        date_start: "2026-09-01",
        date_end: "2026-09-30",
        status: "draft",
        gross: salaryBase,
        deductions: salaryBase * 0.08,
        net: salaryBase * 0.92,
        employer_cost: salaryBase,
        lines: [],
        source_summary: {
          ibc: salaryBase,
          worked_cotizable_remuneration: salaryBase,
          days_worked: 30,
          contribution_worked_days: 30,
          devengos_salariales: salaryBase,
          dias_prestaciones_sociales: 30,
          base_prestaciones_sociales: salaryBase,
          base_vacaciones: salaryBase
        },
        employee_name: "Empleado Cierre",
        employee_code: "EMP-1"
      };
      payrollDocuments.push(document);
      events.push({ kind: "payrollDocumentInsert", document });
      return [document];
    }
    if (sql.includes("INSERT INTO th_aportes_sociales_documentos")) {
      events.push({ kind: "socialDocumentInsert" });
      return [{ id: 77, tenant_id: "tenant-qa", period_key: periodKey, total_payable: 1000000 }];
    }
    if (sql.includes("INSERT INTO th_nomina_cierres_periodo")) {
      const sourceSummary = values.map((value) => {
        if (typeof value !== "string" || !value.startsWith("{")) return null;
        try { return JSON.parse(value); } catch { return null; }
      }).find((value) => value && Array.isArray(value.steps));
      events.push({ kind: "closureInsert", values, sourceSummary });
      return [{ id: 1, tenant_id: "tenant-qa", period_key: periodKey, status: "cerrado" }];
    }
    if (sql.includes("FROM th_nomina_documentos")) return payrollDocuments;
    if (sql.includes("FROM th_nomina_cierres_periodo")) return [];
    if (sql.includes("FROM th_nomina_ajustes")) return [];
    if (sql.includes("th_empleado_afiliaciones")) return [];
    if (sql.includes("FROM th_aportes_sociales_documentos")) return [];
    if (sql.includes("FROM th_aportes_sociales_lineas")) return [];
    if (sql.includes("th_parametros_laborales")) {
      return sql.includes("metadata->>'category'") ? deductionRows : parameterRows;
    }
    return [];
  }

  const fakePrisma = {
    events,
    payrollDocuments,
    runWithTenant: (_tenantId, callback) => Promise.resolve(callback()),
    tenant: { findUnique: async () => null },
    employee: {
      findMany: async () => [{
        id: 1,
        code: "EMP-1",
        salary_base: salaryBase,
        metadata: { name: "Empleado Cierre", social_security: { arl_risk_class: 1 } },
        user: null
      }]
    },
    processedWorkday: { findMany: async () => days },
    timeRoute: { findMany: async () => [] },
    $queryRaw: queryRaw,
    $executeRaw: async (strings, ...values) => {
      events.push({ kind: "execute", sql: sqlText(strings), values });
      return 1;
    },
    $transaction: async (callback) => {
      const tx = {
        $queryRaw: queryRaw,
        $executeRaw: fakePrisma.$executeRaw,
        payroll: { upsert: async () => ({ id: 900 }) }
      };
      return callback(tx);
    }
  };
  return fakePrisma;
}

test("el cierre liquida la nomina, provisiona prestaciones y registra el monto real", async () => {
  const fakePrisma = buildClosureFake();
  const loaded = loadHrService(fakePrisma);
  try {
    const result = await loaded.service.closePayrollPeriod("tenant-qa", {
      fecha_inicio: "2026-09-01",
      fecha_fin: "2026-09-30",
      period_type: "mes"
    }, { id: 18 });

    assert.equal(result.ok, true);

    const provisionInserts = fakePrisma.events.filter((event) => event.kind === "execute" && event.sql.includes("INSERT INTO th_prestaciones_saldos"));
    assert.equal(provisionInserts.length, 1, "el cierre debe provisionar prestaciones en th_prestaciones_saldos");
    const provisionParams = flattenParams(provisionInserts[0].values);
    assert.equal(
      provisionParams.filter((value) => typeof value === "string" && value.includes("provision_prestaciones_sociales")).length,
      4,
      "las cuatro lineas provisionadas se marcan con su origen"
    );

    const closure = fakePrisma.events.find((event) => event.kind === "closureInsert");
    assert.ok(closure, "el cierre se persiste en th_nomina_cierres_periodo");
    assert.deepEqual(closure.sourceSummary.steps, ["validacion", "nomina", "provisiones", "aportes_sociales", "cierre"]);
    const provisions = closure.sourceSummary.social_benefit_provisions;
    assert.equal(provisions.skipped, null, "con nomina liquidada no se omiten las provisiones");
    assert.equal(provisions.provisioned_lines, 4, "prima, cesantias, intereses y vacaciones");
    assert.ok(provisions.total_provisions > 0, "el total de provisiones es real y no cero");

    // El monto insertado en el documento de cierre coincide con las provisiones calculadas.
    const indexedValues = closure.values;
    const totalProvisionsColumn = indexedValues.find((value) => value === provisions.total_provisions);
    assert.notEqual(totalProvisionsColumn, undefined, "la columna total_provisions recibe el acumulado calculado");

    const expected = Math.round(((2000000 * 30) / 360) * 2 * 100) / 100; // prima + cesantias
    assert.ok(provisions.total_provisions > expected, "el total incluye tambien intereses y vacaciones");
  } finally {
    loaded.restore();
  }
});

test("el cierre sin nomina no inventa provisiones", async () => {
  const fakePrisma = buildClosureFake();
  fakePrisma.employee.findMany = async () => [];
  const loaded = loadHrService(fakePrisma);
  try {
    const result = await loaded.service.closePayrollPeriod("tenant-qa", {
      fecha_inicio: "2026-09-01",
      fecha_fin: "2026-09-30",
      period_type: "mes",
      force: true
    }, { id: 18 });
    const closure = fakePrisma.events.find((event) => event.kind === "closureInsert");
    assert.equal(closure.sourceSummary.social_benefit_provisions.skipped, "SIN_NOMINA");
    assert.equal(closure.sourceSummary.social_benefit_provisions.total_provisions, 0);
    assert.equal(fakePrisma.events.filter((event) => event.kind === "execute" && event.sql.includes("INSERT INTO th_prestaciones_saldos")).length, 0);
    assert.equal(result.ok, true);
  } finally {
    loaded.restore();
  }
});
