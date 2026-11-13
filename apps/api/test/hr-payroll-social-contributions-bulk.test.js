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

function sqlText(strings) {
  return Array.isArray(strings) ? strings.join("?") : String(strings);
}

function buildFakePrisma({ employees = [], payrollDocuments = [], payrollAdjustments = [] } = {}) {
  const events = [];
  let tenantContext = null;

  async function queryRaw(strings, ...values) {
    const sql = sqlText(strings);
    events.push({ kind: "query", sql });
    if (sql.includes("INSERT INTO th_aportes_sociales_documentos")) return [{ id: 77 }];
    if (sql.includes("th_parametros_laborales")) return [{ code: "SMMLV", value: 1750905, metadata: {} }];
    if (sql.includes("th_nomina_documentos")) return payrollDocuments;
    if (sql.includes("th_nomina_ajustes")) return payrollAdjustments;
    return [];
  }

  const fakePrisma = {
    events,
    runWithTenant: (tenantId, callback) => {
      const previous = tenantContext;
      tenantContext = tenantId;
      return Promise.resolve(callback()).finally(() => { tenantContext = previous; });
    },
    employee: {
      findMany: async (args) => {
        events.push({ kind: "employeeFindMany", where: args?.where, tenantContext });
        return employees;
      }
    },
    $queryRaw: queryRaw,
    $executeRaw: async (strings, ...values) => {
      events.push({ kind: "execute", sql: sqlText(strings), values });
      return 1;
    },
    $transaction: async (callback, options) => {
      events.push({ kind: "transaction", options });
      const tx = {
        $queryRaw: queryRaw,
        $executeRaw: fakePrisma.$executeRaw
      };
      return callback(tx);
    }
  };
  return fakePrisma;
}

const employeesFixture = [1, 2, 3].map((index) => ({
  id: index,
  code: `EMP-0${index}`,
  salary_base: 2000000,
  metadata: { name: `Empleado ${index}`, social_security: { arl_risk_class: 1 } },
  user: null
}));

test("aportes sociales inserta las lineas por lotes y dentro del contexto de tenant", async () => {
  const fakePrisma = buildFakePrisma({ employees: employeesFixture });
  const loaded = loadHrService(fakePrisma);
  try {
    const result = await loaded.service.runSocialContributions("tenant-qa", {
      fecha_inicio: "2026-09-01",
      fecha_fin: "2026-09-30"
    }, { id: 18 });

    assert.equal(result.ok, true);
    assert.equal(result.lines, 24, "3 empleados x 8 conceptos por defecto");

    const findMany = fakePrisma.events.find((event) => event.kind === "employeeFindMany");
    assert.equal(findMany.tenantContext, "tenant-qa", "la consulta de empleados debe correr dentro del contexto de tenant en el flujo de escritura");

    const lineInserts = fakePrisma.events.filter((event) => event.kind === "execute" && event.sql.includes("INSERT INTO th_aportes_sociales_lineas"));
    assert.equal(lineInserts.length, 1, "24 lineas deben ir en un solo INSERT multi-VALUES, no uno por linea");

    const transaction = fakePrisma.events.find((event) => event.kind === "transaction");
    assert.equal(transaction.options?.timeout, 30000, "la transaccion remota necesita timeout ampliado");
  } finally {
    loaded.restore();
  }
});

test("preview de aportes consume segmentos de ajuste y no vuelve a descontar SLN al trabajador", async () => {
  const employee = { ...employeesFixture[0], metadata: { name: "Empleado 1", social_security: { arl_risk_class: 1, exoneration_eligible: false } } };
  const fakePrisma = buildFakePrisma({
    employees: [employee],
    payrollDocuments: [{ employee_id: 1, source_summary: { ibc: 1500000, days_worked: 15, devengos_salariales: 1500000 } }],
    payrollAdjustments: [{ employee_id: 1, period_key: "mes:2026-08-01:2026-08-31", adjustment_type: "sln", concept_code: "SLN", amount: 0, metadata: { date_start: "2026-09-16", date_end: "2026-09-30", days: 15, continuity_key: "sln-1", document_support: "acta-1", reference_source: "manual_reported_pila", frozen_historical_reference: { monthlyAmount: 3000000, sourcePeriod: "2026-08", capturedAt: "2026-09-16" } } }]
  });
  const loaded = loadHrService(fakePrisma);
  try {
    const result = await loaded.service.previewSocialContributions("tenant-qa", { fecha_inicio: "2026-09-01", fecha_fin: "2026-09-30", period_type: "mes" });
    const employeeRow = result.document.employees[0];
    assert.equal(employeeRow.segment_result.segments.find((segment) => segment.type === "SLN").employeeAmounts.salud, 0);
    assert.equal(employeeRow.segment_result.segments.find((segment) => segment.type === "SLN").employeeAmounts.pension, 0);
    assert.equal(employeeRow.segment_result.segments.find((segment) => segment.type === "SLN").reference.sourcePeriod, "2026-08");
    assert.equal(result.document.lines.filter((line) => line.concept_code === "DED_SALUD")[0].employee_amount, 60000);
    assert.ok(fakePrisma.events.some((event) => event.kind === "query" && event.sql.includes("metadata->>'date_start'") && event.sql.includes("metadata->>'date_end'")), "las novedades deben consultarse por solapamiento de fechas aunque period_key sea distinto");
  } finally {
    loaded.restore();
  }
});

test("SLN completo permite IBC reportado cero sin usar salario como fallback", async () => {
  const employee = { ...employeesFixture[0], metadata: { name: "Empleado SLN", social_security: { arl_risk_class: 1 } } };
  const fakePrisma = buildFakePrisma({
    employees: [employee],
    payrollDocuments: [{ employee_id: 1, source_summary: { ibc: 0, worked_cotizable_remuneration: 0, days_worked: 0, devengos_salariales: 0 } }],
    payrollAdjustments: [{ employee_id: 1, adjustment_type: "sln", concept_code: "SLN", amount: 0, metadata: { date_start: "2026-09-01", date_end: "2026-09-30", days: 30, document_support: "acta-sln", reference_source: "manual_reported_pila", frozen_historical_reference: { monthlyAmount: 3000000, sourcePeriod: "2026-08", capturedAt: "2026-09-01" } } }]
  });
  const loaded = loadHrService(fakePrisma);
  try {
    const result = await loaded.service.previewSocialContributions("tenant-qa", { fecha_inicio: "2026-09-01", fecha_fin: "2026-09-30", period_type: "mes" });
    const row = result.document.employees[0];
    assert.equal(row.segment_result.segments.find((segment) => segment.type === "TRABAJO"), undefined);
    assert.equal(row.segment_result.segments.find((segment) => segment.type === "SLN").amount, 3000000);
    assert.ok(row.segment_result.totals.employerAmounts.pension > 0);
  } finally {
    loaded.restore();
  }
});

test("novedad cross-month conserva referencia y prorratea reconocido comercial por período", async () => {
  const employee = { ...employeesFixture[0], metadata: { name: "Empleado cross-month", social_security: { arl_risk_class: 1 } } };
  const adjustment = { employee_id: 1, period_key: "mes:2026-05-01:2026-05-31", adjustment_type: "vacaciones", concept_code: "VACACIONES", amount: 0, metadata: { date_start: "2026-05-25", date_end: "2026-06-05", days: 11, recognized_value: 880000, document_support: "vac-cross", reference_source: "manual_reported_pila", reported_pila_id: "PILA-MAY-001", frozen_historical_reference: { monthlyAmount: 2800000, sourcePeriod: "2026-04", capturedAt: "2026-05-01" } } };
  const run = async (from, to, ibc) => {
    const fakePrisma = buildFakePrisma({ employees: [employee], payrollDocuments: [{ employee_id: 1, source_summary: { ibc, worked_cotizable_remuneration: ibc, days_worked: 24, devengos_salariales: ibc } }], payrollAdjustments: [adjustment] });
    const loaded = loadHrService(fakePrisma);
    try { return (await loaded.service.previewSocialContributions("tenant-qa", { fecha_inicio: from, fecha_fin: to, period_type: "mes" })).document.employees[0]; } finally { loaded.restore(); }
  };
  const may = await run("2026-05-01", "2026-05-31", 2400000);
  const june = await run("2026-06-01", "2026-06-30", 2500000);
  const maySegment = may.segment_result.segments.find((segment) => segment.type === "VAC_DISFRUTADAS");
  const juneSegment = june.segment_result.segments.find((segment) => segment.type === "VAC_DISFRUTADAS");
  assert.equal(maySegment.recognized, 480000);
  assert.equal(juneSegment.recognized, 400000);
  assert.equal(maySegment.reference.sourcePeriod, "2026-04");
  assert.equal(juneSegment.reference.sourcePeriod, "2026-04");
  assert.equal(maySegment.recognized + juneSegment.recognized, 880000);
});

test("PILA redondea cada obligación una vez y mantiene separados los parafiscales", async () => {
  // Fractional contributions detect both duplicated health/pension totals and
  // the extra $100 caused by rounding employee/employer shares separately.
  const employee = { ...employeesFixture[0], salary_base: 3000011 };
  for (const segmented of [false, true]) {
    const loaded = loadHrService(buildFakePrisma({
      employees: [employee],
      payrollDocuments: [{ employee_id: 1, source_summary: { ibc: 3000011, worked_cotizable_remuneration: 3000011, days_worked: 30, devengos_salariales: 3000011 } }],
      payrollAdjustments: segmented ? [{ employee_id: 1, adjustment_type: "vacaciones_compensadas", concept_code: "VACACIONES_COMPENSADAS", amount: 1000011, metadata: { date_start: "2026-09-30", date_end: "2026-09-30", days: 0, recognized_value: 1000011, document_support: "compensacion" } }] : []
    }));
    try {
      const { document } = await loaded.service.previewSocialContributions("tenant-qa", { fecha_inicio: "2026-09-01", fecha_fin: "2026-09-30", period_type: "mes" });
      const row = document.employees[0];
      const ceil100 = (value) => Math.ceil(value / 100) * 100;
      for (const [subsystem, type] of [["salud", "EPS"], ["pension", "PENSION"], ["arl", "ARL"]]) {
        const amount = document.lines.filter((line) => line.entity_type === type && line.concept_code !== "DED_FONDO_SOLIDARIDAD_PENSIONAL").reduce((sum, line) => sum + line.total_amount, 0);
        assert.equal(row.pila_totals[subsystem], ceil100(amount), `${subsystem}, segmented=${segmented}`);
      }
      const parafiscalLines = document.lines.filter((line) => ["APORTE_CAJA", "APORTE_SENA", "APORTE_ICBF"].includes(line.concept_code));
      assert.ok(parafiscalLines.length > 0);
      for (const line of parafiscalLines) assert.equal(row.pila_totals[line.concept_code], ceil100(line.total_amount));
      assert.equal(document.total_payable_pila, Object.values(row.pila_totals).reduce((sum, value) => sum + value, 0));
      assert.ok(document.total_payable_pila >= document.total_payable);
      assert.equal(row.pila_totals.DED_SALUD, undefined, "no duplicate employee-share obligation");
      assert.equal(row.pila_totals.APORTE_SALUD, undefined, "no duplicate employer-share obligation");
    } finally { loaded.restore(); }
  }
});

test("aportes sociales segmenta en varios lotes cuando las lineas exceden el chunk", async () => {
  const many = [];
  for (let index = 1; index <= 1100; index += 1) {
    many.push({ ...employeesFixture[0], id: index, code: `EMP-${index}` });
  }
  const fakePrisma = buildFakePrisma({ employees: many });
  const loaded = loadHrService(fakePrisma);
  try {
    const result = await loaded.service.runSocialContributions("tenant-qa", {
      fecha_inicio: "2026-09-01",
      fecha_fin: "2026-09-30"
    }, { id: 18 });

    assert.equal(result.lines, 8800);
    const lineInserts = fakePrisma.events.filter((event) => event.kind === "execute" && event.sql.includes("INSERT INTO th_aportes_sociales_lineas"));
    assert.equal(lineInserts.length, 18, "8800 lineas se reparten en lotes de 500 sin agotar el tope de parametros");
  } finally {
    loaded.restore();
  }
});

test("provisiones de prestaciones inserta los saldos en un solo lote", async () => {
  const payrollDocuments = [1, 2].map((employeeId) => ({
    id: employeeId,
    employee_id: employeeId,
    days_worked: 30,
    source_summary: { dias_prestaciones_sociales: 30, base_prestaciones_sociales: 2000000 }
  }));
  const fakePrisma = buildFakePrisma({ payrollDocuments });
  const loaded = loadHrService(fakePrisma);
  try {
    const result = await loaded.service.runSocialBenefitProvisions("tenant-qa", {
      fecha_inicio: "2026-09-01",
      fecha_fin: "2026-09-30"
    }, { id: 18 });

    assert.equal(result.ok, true);
    assert.equal(result.provisioned_lines, 8, "2 empleados x 4 conceptos de provision");

    const saldoInserts = fakePrisma.events.filter((event) => event.kind === "execute" && event.sql.includes("INSERT INTO th_prestaciones_saldos"));
    assert.equal(saldoInserts.length, 1, "8 saldos deben ir en un solo INSERT multi-VALUES");

    const transaction = fakePrisma.events.find((event) => event.kind === "transaction");
    assert.equal(transaction.options?.timeout, 30000);
  } finally {
    loaded.restore();
  }
});
