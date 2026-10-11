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

function buildFakePrisma({ employees = [], payrollDocuments = [] } = {}) {
  const events = [];
  let tenantContext = null;

  async function queryRaw(strings, ...values) {
    const sql = sqlText(strings);
    events.push({ kind: "query", sql });
    if (sql.includes("INSERT INTO th_aportes_sociales_documentos")) return [{ id: 77 }];
    if (sql.includes("th_nomina_documentos")) return payrollDocuments;
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
