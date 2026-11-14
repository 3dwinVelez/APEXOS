// PYG por vehiculo: pruebas del motor puro (buildReport) y del servicio (persistencia
// y agregacion SQL con prisma falso). Los valores replican la hoja GOLIAT (agosto 2026)
// del PYG corporativo de logistica para anclar el criterio de calculo.
const assert = require("node:assert/strict");
const test = require("node:test");

const { CONCEPT_CATALOG, DEFAULT_SOURCE_MAP, UNMAPPED_CONCEPT } = require("../src/modules/transport-pyg/concept-catalog");
const { buildReport, periodBounds, normalizePlate } = require("../src/modules/transport-pyg/engine");
const accountConfig = require("../src/modules/transport-pyg/account-config");

const PERIOD = "2026-08";

function goliatBudgets(vehicleId = 1) {
  const values = {
    INGRESOS: 25000000,
    GASTOS_PERSONAL: 8085596,
    PROVISION_PRESTACIONES: 1214848,
    DOTACION: 238000,
    SEGURIDAD_SOCIAL: 830750,
    HONORARIOS_CONTABLES_SST: 584360,
    COMBUSTIBLE: 3386582,
    VIATICOS: 986456,
    MANTENIMIENTO_VEHICULO: 3147200,
    SEGURO_POLIZA: 894740,
    PARQUEADERO: 35000,
    PEAJES: 1011909,
    SEGURIDAD_MONITOREO: 92649,
    OTROS: 700000,
    GASTOS_LEGALES: 0,
    INGRESOS_NO_OPERACIONALES: 0,
    GASTOS_FINANCIEROS: 132117,
    GASTOS_NO_FINANCIEROS: 0
  };
  return Object.entries(values).map(([concept_code, amount]) => ({ vehicle_id: vehicleId, concept_code, amount }));
}

function goliatInputs() {
  return {
    period: PERIOD,
    concepts: CONCEPT_CATALOG,
    vehicles: [
      { id: 1, plate: "ESQ 294", brand: "NPR", line: "GOLIAT", authorized_driver_id: 10 },
      { id: 2, plate: "JYY249", brand: "NKR", line: "ZEUS", authorized_driver_id: null }
    ],
    budgets: goliatBudgets(1),
    incomeRows: [{ plate: "ESQ 294", total: 19150000 }],
    pettyRows: [
      { plate: "ESQ 294", concept_code: "COMBUSTIBLE", total: 3323769.1 },
      { plate: "esq 294", concept_code: "PEAJES", total: 2013600 },
      { plate: "ESQ 294", concept_code: "VIATICOS", total: 755000 },
      { plate: "ESQ 294", concept_code: "DOTACION", total: 814842.78 },
      { plate: "ESQ 294", concept_code: "MANTENIMIENTO_VEHICULO", total: 4082037 },
      { plate: "ESQ 294", concept_code: "SEGURO_POLIZA", total: 715511 },
      { plate: "ESQ 294", concept_code: "HONORARIOS", total: 397666.67 },
      { plate: "ESQ 294", concept_code: "OTROS", total: 385544.78 }
    ],
    payrollRows: [{ employee_id: 10, total: 7803733 }],
    pilaRows: [{ employee_id: 10, total: 1191588.11 }],
    provisionRows: [{ employee_id: 10, total: 1170559.95 }],
    sourceMaps: DEFAULT_SOURCE_MAP,
    taxPercent: 2.25
  };
}

test("periodBounds y normalizePlate siguen el contrato del reporte", () => {
  assert.deepEqual(periodBounds("2026-08"), { start: "2026-08-01", end: "2026-08-31" });
  assert.deepEqual(periodBounds("2026-02"), { start: "2026-02-01", end: "2026-02-28" });
  assert.equal(normalizePlate("  esq   294 "), "ESQ294");
  assert.equal(normalizePlate("ESQ294"), "ESQ294");
  assert.equal(normalizePlate(undefined), "");
});

test("buildReport replica el PYG GOLIAT: canales de gasto y resultados", () => {
  const report = buildReport(goliatInputs());
  const goliat = report.vehicles.find((vehicle) => vehicle.vehicle_id === 1);
  const row = (code) => goliat.rows.find((item) => item.code === code);

  assert.equal(goliat.income_actual, 19150000);
  // Canal personal: nomina/PILA/provision se imputan por conductor autorizado.
  assert.equal(row("GASTOS_PERSONAL").actual, 7803733);
  assert.equal(row("SEGURIDAD_SOCIAL").actual, 1191588.11);
  assert.equal(row("PROVISION_PRESTACIONES").actual, 1170559.95);
  // Canal caja menor: clasificacion por mapping.
  assert.equal(row("COMBUSTIBLE").actual, 3323769.1);
  assert.equal(row("PEAJES").actual, 2013600);
  assert.equal(row("HONORARIOS_CONTABLES_SST").actual, 397666.67);
  // Subtotales: la suma aritmetica de las lineas da .39; el Excel impreso
  // redondea el total a .38 por decimales de fuente no visibles.
  assert.equal(row("TOTAL_GASTOS_OPERACIONALES").actual, 22653852.39);
  assert.equal(row("UTILIDAD_OPERACIONAL").actual, -3503852.39);
  // Impuesto regimen simple = 2.25% sobre ingresos ejecutados.
  assert.equal(row("IMPUESTO_REGIMEN_SIMPLE").actual, 430875);
  assert.equal(row("UTILIDAD_ANTES_DE_IMPUESTOS").actual, -3503852.39);
  assert.equal(row("UTILIDAD_NETA").actual, -3934727.39);
  // Cumplimiento ingresos = ejecutado/presupuesto (0.766 en el Excel).
  assert.equal(row("INGRESOS").cump, 0.766);
  assert.equal(row("INGRESOS").budget, 25000000);
  // Vehiculo sin datos: aparece con ceros y no rompe el consolidado.
  const zeus = report.vehicles.find((vehicle) => vehicle.vehicle_id === 2);
  assert.equal(zeus.income_actual, 0);
  assert.equal(report.corporate.income_actual, 19150000);
});

test("buildReport: presupuesto de subtotales y de impuesto derivan del presupuesto de ingresos", () => {
  const report = buildReport(goliatInputs());
  const goliat = report.vehicles.find((vehicle) => vehicle.vehicle_id === 1);
  const row = (code) => goliat.rows.find((item) => item.code === code);

  assert.equal(row("TOTAL_GASTOS_OPERACIONALES").budget, 21208090);
  assert.equal(row("UTILIDAD_OPERACIONAL").budget, 3791910);
  assert.equal(row("IMPUESTO_REGIMEN_SIMPLE").budget, 562500);
  assert.equal(row("UTILIDAD_ANTES_DE_IMPUESTOS").budget, 3791910 - 132117);
  assert.equal(row("UTILIDAD_NETA").budget, 3791910 - 132117 - 562500);
});

test("buildReport: gastos sin mapping se exponen como fila dinamica y entran al subtotal", () => {
  const inputs = goliatInputs();
  inputs.pettyRows.push({ plate: "ESQ 294", concept_code: "FOO_SIN_MAPA", total: 100000 });
  const report = buildReport(inputs);
  const goliat = report.vehicles.find((vehicle) => vehicle.vehicle_id === 1);
  const row = (code) => goliat.rows.find((item) => item.code === code);

  assert.ok(row(UNMAPPED_CONCEPT.code), "debe existir la fila dinamica de sin clasificar");
  assert.equal(row(UNMAPPED_CONCEPT.code).actual, 100000);
  assert.equal(row("TOTAL_GASTOS_OPERACIONALES").actual, 22753852.39);
  assert.equal(report.data_status.unmapped_total, 100000);
  const corporateRow = report.corporate.rows.find((item) => item.code === UNMAPPED_CONCEPT.code);
  assert.equal(corporateRow.actual, 100000);
  // La fila dinamica va despues de GASTOS_LEGALES y antes del total de gastos.
  const codes = goliat.rows.map((item) => item.code);
  assert.ok(codes.indexOf(UNMAPPED_CONCEPT.code) > codes.indexOf("GASTOS_LEGALES"));
  assert.ok(codes.indexOf(UNMAPPED_CONCEPT.code) < codes.indexOf("TOTAL_GASTOS_OPERACIONALES"));
});

test("buildReport: porcentajes contra ingresos corporativos y cumplimiento nulo sin presupuesto", () => {
  const report = buildReport(goliatInputs());
  const goliat = report.vehicles.find((vehicle) => vehicle.vehicle_id === 1);
  const row = (code) => goliat.rows.find((item) => item.code === code);
  // % del concepto contra ingreso del vehiculo (gastos operativos = 118.3% del ingreso GOLIAT).
  assert.equal(row("TOTAL_GASTOS_OPERACIONALES").pct, 1.183);
  // GASTOS_LEGALES sin presupuesto ni ejecucion: cumplimiento nulo.
  assert.equal(row("GASTOS_LEGALES").cump, null);
  assert.equal(row("GASTOS_LEGALES").actual, 0);
});

// ---- Servicio con prisma falso: validaciones y agregacion SQL ----

// pyg-interactive se require de forma lazy desde service.js; se inyecta un
// stub por require.cache antes de cargar el servicio (sin importar el modulo
// real, que arrastra tenantCache -> Redis y exige REDIS_URL) y se restaura al
// terminar cada caso.
const interactivePath = require.resolve("../src/modules/accounting/pyg-interactive");
const interactiveStub = {
  getInteractivePyg: async () => ({ nodes: [] }),
  parseOrganizationTree: (config) => {
    const source = config && typeof config === "object" ? config : {};
    const accounting = source.accounting && typeof source.accounting === "object" ? source.accounting : source;
    const tree = accounting.organization_tree && typeof accounting.organization_tree === "object" ? accounting.organization_tree : {};
    return {
      societies: Array.isArray(tree.societies) ? tree.societies : [],
      branches: Array.isArray(tree.branches) ? tree.branches : [],
      cost_centers: Array.isArray(tree.cost_centers) ? tree.cost_centers : []
    };
  }
};

function loadService(fakePrisma) {
  const prismaPath = require.resolve("../src/core/prisma");
  const servicePath = require.resolve("../src/modules/transport-pyg/service");
  const previousPrisma = require.cache[prismaPath];
  const previousService = require.cache[servicePath];
  const previousInteractive = require.cache[interactivePath];
  require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: fakePrisma };
  require.cache[interactivePath] = { id: interactivePath, filename: interactivePath, loaded: true, exports: interactiveStub };
  delete require.cache[servicePath];
  const service = require(servicePath);
  return {
    service,
    restore() {
      delete require.cache[servicePath];
      if (previousService) require.cache[servicePath] = previousService;
      if (previousPrisma) require.cache[prismaPath] = previousPrisma;
      else delete require.cache[prismaPath];
      if (previousInteractive) require.cache[interactivePath] = previousInteractive;
      else delete require.cache[interactivePath];
    }
  };
}

function buildFakePrisma() {
  const state = {
    budgets: new Map(),
    vehicles: new Map([[1, { id: 1, plate: "ESQ 294", active: true, deleted_at: null, authorized_driver_id: 10 }]]),
    concepts: new Map(),
    maps: new Map(),
    config: null,
    tenant: { id: "tenant-qa", config: {} },
    activeTenantId: null,
    audit: [],
    tenantContexts: [],
    conceptUpserts: []
  };
  const key = (...parts) => parts.join("||");
  const db = {
    tenant: {
      findUnique: async ({ where }) => {
        state.tenantContexts.push(`tenant.findUnique:${where.id}`);
        if (where.id !== state.tenant.id) return null;
        return { id: state.tenant.id, config: state.tenant.config };
      }
    },
    vehicle: {
      findMany: async () => {
        state.tenantContexts.push("vehicle.findMany");
        return [{ id: 1, plate: "ESQ 294", brand: "NPR", line: "GOLIAT", authorized_driver_id: 10 }];
      },
      findFirst: async ({ where }) => state.vehicles.get(where.id) || null
    },
    transportPygBudget: {
      findMany: async () => goliatBudgets(1).map((row) => ({ ...row, amount: String(row.amount) })),
      upsert: async ({ where, update, create }) => {
        const mapKey = key(create.tenant_id, create.vehicle_id, create.period, create.concept_code);
        state.budgets.set(mapKey, { ...create, ...update });
        return state.budgets.get(mapKey);
      }
    },
    transportPygConcept: {
      upsert: async ({ where, update, create }) => {
        state.conceptUpserts.push({ update });
        const code = where.tenant_id_code.code;
        const existing = state.concepts.get(code);
        const next = existing ? { ...existing, ...update } : { ...create };
        state.concepts.set(code, next);
        return next;
      },
      findMany: async () => [...state.concepts.values()].sort((a, b) => a.display_order - b.display_order)
    },
    transportPygSourceMap: {
      findMany: async () => DEFAULT_SOURCE_MAP.map((row) => ({ ...row, active: true })),
      findFirst: async ({ where }) => state.maps.get(key(where.tenant_id, where.source_type, where.source_code)) || null,
      create: async ({ data }) => {
        state.maps.set(key(data.tenant_id, data.source_type, data.source_code), data);
        return data;
      },
      update: async ({ where, data }) => {
        const existing = [...state.maps.entries()].find(([, value]) => value.id === where.id);
        if (existing) state.maps.set(existing[0], { ...existing[1], ...data });
        return existing?.[1];
      }
    },
    transportPygConfig: {
      findFirst: async () => state.config,
      upsert: async ({ create, update }) => {
        state.config = { ...create, ...update };
        return state.config;
      }
    },
    account: {
      // El plan real solo se consume desde core/prisma; el servicio contable ya
      // no re-filtra hojas por Account.type.
      findMany: async () => {
        throw new Error("db.account.findMany no debe consultarse desde el reporte PYG contable");
      }
    },
    auditLog: { create: async ({ data }) => { state.audit.push(data); return data; } },
    $queryRaw: async (strings, ...values) => {
      const sql = Array.isArray(strings) ? strings.join("?") : String(strings);
      if (sql.includes("TransportSettlementItem")) return [{ plate: "ESQ 294", total: 19150000 }];
      if (sql.includes("petty_cash_voucher_lines")) return [{ plate: "ESQ 294", concept_code: "COMBUSTIBLE", total: 3323769.1 }];
      if (sql.includes('"Payroll"')) return [{ employee_id: 10, total: 7803733 }];
      if (sql.includes("th_aportes_sociales_lineas")) return [{ employee_id: 10, total: 1191588.11 }];
      if (sql.includes("th_prestaciones_saldos")) return [{ employee_id: 10, total: 1170559.95 }];
      return [];
    },
    $executeRawUnsafe: async () => 1,
    runWithTenant: (tenantId, callback) => {
      state.activeTenantId = tenantId;
      return callback();
    },
    $transaction: async (callback) => callback(db)
  };
  return { db, state };
}

test("servicio: getOperationalReport conserva el calculador legacy (caja menor, nomina, liquidacion)", async () => {
  const fake = buildFakePrisma();
  const loaded = loadService(fake.db);
  try {
    const report = await loaded.service.getOperationalReport("tenant-qa", { period: PERIOD });
    assert.equal(report.period, PERIOD);
    assert.equal(report.tax_percent, 2.25);
    assert.equal(report.source, "operational");
    assert.equal(report.vehicles[0].income_actual, 19150000);
    assert.equal(report.vehicles[0].rows.find((row) => row.code === "GASTOS_PERSONAL").actual, 7803733);
    assert.equal(report.corporate.income_actual, 19150000);
    assert.equal(fake.state.activeTenantId, "tenant-qa");
    assert.equal(fake.state.tenant.id, "tenant-qa");
    // La siembra idempotente del legacy (solo via getOperationalReport) crea el
    // catalogo completo y el mapping por defecto.
    assert.equal(fake.state.concepts.size, CONCEPT_CATALOG.length);
    assert.equal(fake.state.maps.size, DEFAULT_SOURCE_MAP.length);
  } finally {
    loaded.restore();
  }
});

test("servicio: getReport siempre lee el libro contable, incluso sin config ni fuente operativa", async () => {
  const fake = buildFakePrisma();
  // Sin vehicle_pyg guardado: getReport no puede delegar en fuente operativa.
  fake.state.tenant.config = {
    accounting: {
      organization_tree: {
        branches: [{ code: "B1", name: "Sucursal Norte" }],
        cost_centers: [{ code: "ESQ294", name: "GOLIAT", branch_code: "B1", vehicle_id: 1 }]
      }
    }
  };
  const sourceNodes = [{
    dimension: "puc",
    code: "41450501",
    name: "41450501 · INGRESOS FLETES 2026",
    account_id: 11,
    children: [{
      dimension: "branch",
      code: "B1",
      name: "Sucursal Norte",
      children: [{
        dimension: "cost_center",
        code: "B1|ESQ294",
        name: "GOLIAT",
        is_leaf: true,
        amount_cents: 1915000000,
        budget_rows: 1,
        budget_cents: 300000000,
        budget_months_found: ["2026-08"],
        children: []
      }]
    }]
  }];
  interactiveStub.getInteractivePyg = async () => ({ nodes: sourceNodes, warnings: [], linkage: {} });
  const loaded = loadService(fake.db);
  try {
    const report = await loaded.service.getReport("tenant-qa", { period: PERIOD });
    assert.equal(report.source, "accounting");
    const vehicle = report.vehicles.find((item) => item.plate === "ESQ 294");
    const ingresos = vehicle.rows.find((row) => row.code === "INGRESOS");
    // Seed del catalogo operativo no debe ejecutarse en el GET del reporte.
    assert.equal(fake.state.concepts.size, 0);
    assert.equal(fake.state.maps.size, 0);
    assert.equal(ingresos.actual, 19150000);
  } finally {
    loaded.restore();
    interactiveStub.getInteractivePyg = async () => ({ nodes: [] });
  }
});

test("servicio: getReport con flag legacy operational sigue leyendo el libro, no Operational$raw", async () => {
  const fake = buildFakePrisma();
  fake.state.tenant.config = {
    accounting: {
      vehicle_pyg: { source: "operational", concepts: [] },
      organization_tree: {
        branches: [{ code: "B1", name: "Sucursal Norte" }],
        cost_centers: [{ code: "ESQ294", name: "GOLIAT", branch_code: "B1", vehicle_id: 1 }]
      }
    }
  };
  const sourceNodes = [{
    dimension: "puc",
    code: "41450501",
    name: "41450501 · INGRESOS FLETES 2026",
    account_id: 11,
    children: [{
      dimension: "branch",
      code: "B1",
      name: "Sucursal Norte",
      children: [{
        dimension: "cost_center",
        code: "B1|ESQ294",
        name: "GOLIAT",
        is_leaf: true,
        amount_cents: 1234000,
        budget_rows: 0,
        budget_cents: 0,
        budget_months: [],
        children: []
      }]
    }]
  }];
  interactiveStub.getInteractivePyg = async () => ({ nodes: sourceNodes, warnings: [], linkage: {} });
  const loaded = loadService(fake.db);
  try {
    const report = await loaded.service.getReport("tenant-qa", { period: PERIOD });
    assert.equal(report.source, "accounting");
    assert.equal(report.report_source, "ledger");
    assert.equal(report.vehicles.find((item) => item.plate === "ESQ 294").rows.find((row) => row.code === "INGRESOS").actual, 12340);
    assert.equal(fake.state.concepts.size, 0, "el GET no debe sembrar catalogo operativo");
    assert.equal(fake.state.maps.size, 0, "el GET no debe sembrar mapping operativo");
  } finally {
    loaded.restore();
    interactiveStub.getInteractivePyg = async () => ({ nodes: [] });
  }
});

test("servicio: getReport pasa el mes solicitado exacto al lector contable", async () => {
  const fake = buildFakePrisma();
  fake.state.tenant.config = {
    accounting: {
      vehicle_pyg: { source: "accounting", concepts: accountConfig.cloneProposal().concepts },
      organization_tree: { branches: [], cost_centers: [] }
    }
  };
  const periodsSeen = [];
  interactiveStub.getInteractivePyg = async (_tenantId, args) => {
    periodsSeen.push(args.period);
    return { nodes: [], warnings: [], linkage: {} };
  };
  const loaded = loadService(fake.db);
  try {
    await loaded.service.getReport("tenant-qa", { period: "2026-08" });
    assert.deepEqual(periodsSeen, ["2026-08"], "el periodo pedido va exacto al lector, sin mes anterior ni periodo actual");
  } finally {
    loaded.restore();
    interactiveStub.getInteractivePyg = async () => ({ nodes: [] });
  }
});

test("servicio: el libro firmado incluye resultados historicos importados y centros sin asignar", async () => {
  const fake = buildFakePrisma();
  fake.state.tenant.config = {
    accounting: {
      vehicle_pyg: { source: "accounting", concepts: accountConfig.cloneProposal().concepts },
      organization_tree: {
        branches: [{ code: "B1", name: "Sucursal Norte" }],
        cost_centers: [{ code: "ESQ294", name: "GOLIAT", branch_code: "B1", vehicle_id: 1 }]
      }
    }
  };
  const sourceNodes = [{
    dimension: "puc",
    code: "41450501",
    name: "41450501 · INGRESOS FLETES",
    account_id: 11,
    children: [{
      dimension: "branch",
      code: "B1",
      name: "Sucursal Norte",
      children: [
        {
          dimension: "cost_center",
          code: "B1|ESQ294",
          name: "GOLIAT",
          is_leaf: true,
          amount_cents: 1000000,
          budget_rows: 0,
          budget_cents: 0,
          budget_months: [],
          children: []
        },
        {
          dimension: "cost_center",
          code: "B1|HISTORICO",
          name: "Centro historico importado",
          is_leaf: true,
          amount_cents: 250000,
          budget_rows: 0,
          budget_cents: 0,
          budget_months: [],
          children: []
        }
      ]
    }]
  }];
  interactiveStub.getInteractivePyg = async () => ({ nodes: sourceNodes, warnings: [], linkage: {} });
  const loaded = loadService(fake.db);
  try {
    const report = await loaded.service.getReport("tenant-qa", { period: PERIOD });
    assert.equal(report.source, "accounting");
    // El centro sin vehiculo (historico importado) no se pierde: aparece en el
    // bloque sin asignar y en el consolidado firmado.
    assert.ok(report.unassigned);
    assert.equal(report.unassigned.rows.find((row) => row.code === "INGRESOS").actual, 2500);
    assert.equal(report.corporate.totals.totalIngresos.actual, 12500);
    // La reconciliacion firma la suma completa de hojas de resultado.
    assert.equal(report.reconciliation.ledger_net, 12500);
    assert.equal(report.reconciliation.difference, 0);
  } finally {
    loaded.restore();
    interactiveStub.getInteractivePyg = async () => ({ nodes: [] });
  }
});

test("servicio: ensureCatalog no sobrescribe nombre, orden ni defaults del tenant", async () => {
  const fake = buildFakePrisma();
  fake.state.concepts.set("INGRESOS", { tenant_id: "tenant-qa", code: "INGRESOS", name: "INGRESOS AJUSTADOS", section: "ingresos", kind: "income", display_order: 99 });
  const loaded = loadService(fake.db);
  try {
    const rows = await loaded.service.listConcepts("tenant-qa");
    const ingresos = rows.find((row) => row.code === "INGRESOS");
    assert.equal(ingresos.name, "INGRESOS AJUSTADOS");
    assert.equal(ingresos.display_order, 99);
    assert.ok(fake.state.conceptUpserts.every((entry) => Object.keys(entry.update).length === 0));
  } finally {
    loaded.restore();
  }
});

test("servicio: getReport con fuente contable usa el arbol interactivo y hojas limpias", async () => {
  const fake = buildFakePrisma();
  fake.state.tenant.config = {
    accounting: {
      vehicle_pyg: { source: "accounting", concepts: accountConfig.cloneProposal().concepts },
      organization_tree: {
        branches: [{ code: "B1", name: "Sucursal Norte" }],
        cost_centers: [{ code: "ESQ294", name: "GOLIAT", branch_code: "B1", vehicle_id: 1 }]
      }
    }
  };
  const sourceNodes = [{
    dimension: "puc",
    code: "41450501",
    name: "41450501 · INGRESOS FLETES 2026",
    account_id: 11,
    children: [{
      dimension: "branch",
      code: "B1",
      name: "Sucursal Norte",
      children: [{
        dimension: "cost_center",
        code: "B1|ESQ294",
        name: "GOLIAT",
        is_leaf: true,
        amount_cents: 1915000000,
        budget_rows: 1,
        // Clase 4: el presupuesto se firma credit - debit (positivo).
        budget_cents: 300000000,
        budget_months_found: ["2026-08"],
        children: []
      }, {
        dimension: "cost_center",
        code: "B1|SINPRESU",
        name: "Sin presupuesto",
        is_leaf: true,
        amount_cents: 50000,
        budget_rows: 0,
        budget_cents: 0,
        budget_months: [],
        children: []
      }]
    }]
  }];
  interactiveStub.getInteractivePyg = async () => ({ nodes: sourceNodes, warnings: [], linkage: {} });
  const loaded = loadService(fake.db);
  try {
    const report = await loaded.service.getReport("tenant-qa", { period: PERIOD });
    assert.equal(report.source, "accounting");
    const vehicle = report.vehicles.find((item) => item.plate === "ESQ 294");
    const ingresos = vehicle.rows.find((row) => row.code === "INGRESOS");
    assert.equal(ingresos.actual, 19150000);
    assert.equal(ingresos.budget, 3000000);
    assert.equal(ingresos.children.length, 1, "sin presupuesto no debe agregar una cuenta fantasma");
    assert.equal(ingresos.children[0].account_name, "INGRESOS FLETES 2026", "sin prefijo de codigo, conservando numeros del nombre");
    assert.equal(ingresos.children[0].budget, 3000000);
    // El centro sin vehiculo no se pierde: va al bloque sin asignar y al consolidado.
    assert.ok(report.unassigned);
    assert.equal(report.unassigned.rows.find((row) => row.code === "INGRESOS").actual, 500);
    assert.equal(report.corporate.totals.totalIngresos.actual, 19150500);
    assert.equal(report.reconciliation.difference, 0);
  } finally {
    loaded.restore();
    interactiveStub.getInteractivePyg = async () => ({ nodes: [] });
  }
});

test("servicio: el extractor limpia el prefijo del nombre y respeta budget_months_found", async () => {
  const fake = buildFakePrisma();
  fake.state.tenant.config = {
    accounting: {
      vehicle_pyg: { source: "accounting", concepts: accountConfig.cloneProposal().concepts },
      organization_tree: { branches: [{ code: "B1", name: "Sucursal Norte" }], cost_centers: [] }
    }
  };
  interactiveStub.getInteractivePyg = async () => ({
    nodes: [
      {
        dimension: "puc",
        code: "41450501",
        name: "41450501 · INGRESOS 2026 FLETES",
        account_id: 11,
        children: [{
          dimension: "branch",
          code: "B1",
          name: "Sucursal Norte",
          children: [{
            dimension: "cost_center",
            code: "B1|ABC123",
            name: "GOLIAT",
            is_leaf: true,
            amount_cents: 150000,
            budget_rows: 1,
            budget_cents: 250000,
            budget_months: null,
            budget_months_found: ["2026-08"],
            children: []
          }]
        }]
      },
      {
        dimension: "puc",
        code: "41450502",
        name: "41450502 INGRESOS SIN SEPARADOR",
        account_id: 13,
        children: [{
          dimension: "branch",
          code: "B1",
          name: "Sucursal Norte",
          children: [{
            dimension: "cost_center",
            code: "B1|ABC123",
            name: "GOLIAT",
            is_leaf: true,
            amount_cents: 50000,
            budget_rows: 0,
            budget_cents: 0,
            budget_months: [],
            children: []
          }]
        }]
      }
    ],
    warnings: [],
    linkage: {}
  });
  const loaded = loadService(fake.db);
  try {
    const report = await loaded.service.getReport("tenant-qa", { period: PERIOD });
    // El centro ABC123 no tiene maestro en organization_tree: sus hojas caen al
    // bloque sin vehiculo, y por eso se leen en el consolidado.
    assert.ok(report.vehicles.every((item) => item.rows.find((row) => row.code === "INGRESOS").actual === 0));
    assert.equal(report.unassigned.rows.find((row) => row.code === "INGRESOS").actual, 2000);
    const ingresos = report.corporate.rows.find((row) => row.code === "INGRESOS");
    assert.equal(ingresos.children.length, 2);
    const conPresupuesto = ingresos.children.find((item) => item.account_code === "41450501");
    const sinPresupuesto = ingresos.children.find((item) => item.account_code === "41450502");
    // Se quita solo "<codigo> · "; los numeros propios del nombre se conservan.
    assert.equal(conPresupuesto.account_name, "INGRESOS 2026 FLETES");
    assert.equal(conPresupuesto.budget, 2500);
    assert.equal(conPresupuesto.budget_coverage, "full");
    // Sin separador no hay prefijo que quitar.
    assert.equal(sinPresupuesto.account_name, "41450502 INGRESOS SIN SEPARADOR");
    assert.equal(sinPresupuesto.budget, null);
    assert.equal(sinPresupuesto.budget_coverage, "none");
    // Presupuesto 0 con budget_rows 0 no debe convertirse en cero implicito.
    assert.equal(ingresos.budget, 2500);
    assert.equal(ingresos.actual, 2000);
  } finally {
    loaded.restore();
    interactiveStub.getInteractivePyg = async () => ({ nodes: [] });
  }
});

test("servicio: configuracion guardada invalida cae a la propuesta con aviso", async () => {
  const fake = buildFakePrisma();
  fake.state.tenant.config = {
    accounting: {
      vehicle_pyg: { source: "accounting", concepts: [{ code: "", name: "", kind: "x", section: "x", order: 0 }] },
      organization_tree: { branches: [], cost_centers: [] }
    }
  };
  interactiveStub.getInteractivePyg = async () => ({ nodes: [], warnings: [], linkage: {} });
  const loaded = loadService(fake.db);
  try {
    const report = await loaded.service.getReport("tenant-qa", { period: PERIOD });
    assert.equal(report.source, "accounting");
    assert.ok(report.warnings.some((item) => item.code === "VEHICLE_PYG_CONFIG_FALLBACK"));
    assert.equal(report.corporate.rows.length, accountConfig.EXCEL_PROPOSAL.concepts.length);
  } finally {
    loaded.restore();
  }
});

test("servicio: los meses de presupuesto salen de budget_months_found", async () => {
  const fake = buildFakePrisma();
  fake.state.tenant.config = {
    accounting: {
      vehicle_pyg: { source: "accounting", concepts: accountConfig.cloneProposal().concepts },
      organization_tree: { branches: [], cost_centers: [{ code: "ESQ294", name: "GOLIAT", branch_code: "B1", vehicle_id: 1 }] }
    }
  };
  interactiveStub.getInteractivePyg = async () => ({
    nodes: [{
      dimension: "puc",
      code: "41450501",
      name: "41450501 · INGRESOS FLETES 2026",
      account_id: 11,
      children: [{
        dimension: "branch",
        code: "B1",
        name: "Sucursal Norte",
        children: [{
          dimension: "cost_center",
          code: "B1|ESQ294",
          name: "GOLIAT",
          is_leaf: true,
          amount_cents: 100000,
          budget_rows: 1,
          budget_cents: 250000,
          budget_months: null,
          budget_months_found: ["2026-08"],
          children: []
        }]
      }]
    }],
    warnings: [],
    linkage: {}
  });
  const loaded = loadService(fake.db);
  try {
    const report = await loaded.service.getReport("tenant-qa", { period: PERIOD });
    const vehicle = report.vehicles.find((item) => item.plate === "ESQ 294");
    const account = vehicle.rows.find((row) => row.code === "INGRESOS").children[0];
    assert.equal(account.budget_coverage, "full");
  } finally {
    loaded.restore();
    interactiveStub.getInteractivePyg = async () => ({ nodes: [] });
  }
});

test("servicio: getReport rechaza periodo invalido", async () => {
  const fake = buildFakePrisma();
  const loaded = loadService(fake.db);
  try {
    await assert.rejects(() => loaded.service.getReport("tenant-qa", { period: "2026-13" }), /YYYY-MM/);
    await assert.rejects(() => loaded.service.getReport("tenant-qa", {}), /YYYY-MM/);
  } finally {
    loaded.restore();
  }
});

test("servicio: saveBudgets valida concepto, vehiculo y monto; audita el cambio", async () => {
  const fake = buildFakePrisma();
  const loaded = loadService(fake.db);
  try {
    const result = await loaded.service.saveBudgets("tenant-qa", { id: 5 }, {
      period: PERIOD,
      rows: [{ vehicle_id: 1, concept_code: "ingresos", amount: 25000000 }]
    });
    assert.equal(result.upserted, 1);
    assert.ok(fake.state.budgets.has("tenant-qa||1||2026-08||INGRESOS"));
    assert.equal(fake.state.audit.filter((entry) => entry.action === "transport.pyg.budgets.updated").length, 1);

    await assert.rejects(
      () => loaded.service.saveBudgets("tenant-qa", { id: 5 }, { period: PERIOD, rows: [{ vehicle_id: 1, concept_code: "FOO", amount: 1 }] }),
      /no existe/
    );
    await assert.rejects(
      () => loaded.service.saveBudgets("tenant-qa", { id: 5 }, { period: PERIOD, rows: [{ vehicle_id: 999, concept_code: "INGRESOS", amount: 1 }] }),
      /no existe en la empresa activa/
    );
    await assert.rejects(
      () => loaded.service.saveBudgets("tenant-qa", { id: 5 }, { period: PERIOD, rows: [{ vehicle_id: 1, concept_code: "INGRESOS", amount: -5 }] }),
      /mayor o igual a 0/
    );
  } finally {
    loaded.restore();
  }
});

test("servicio: saveConfig persiste la tarifa del impuesto y valida el rango", async () => {
  const fake = buildFakePrisma();
  const loaded = loadService(fake.db);
  try {
    await loaded.service.saveConfig("tenant-qa", { id: 5 }, { tax_percent: 3.5 });
    assert.equal(Number(fake.state.config.tax_percent), 3.5);
    const config = await loaded.service.getConfig("tenant-qa");
    assert.equal(config.tax_percent, 3.5);
    await assert.rejects(() => loaded.service.saveConfig("tenant-qa", { id: 5 }, { tax_percent: 120 }), /entre 0 y 100/);
  } finally {
    loaded.restore();
  }
});

// ---- Configuracion contable GET/PUT (runWithTenant real sin parametro) ----

const redisConfigPath = require.resolve("../src/fabric/redisConfig");
const tenantCachePath = require.resolve("../src/core/tenantCache");

function loadAccountConfigService(fakePrisma) {
  const prismaPath = require.resolve("../src/core/prisma");
  const servicePath = require.resolve("../src/modules/transport-pyg/account-config-service");
  const previous = {
    prisma: require.cache[prismaPath],
    service: require.cache[servicePath],
    tenantCache: require.cache[tenantCachePath],
    redis: require.cache[redisConfigPath]
  };
  require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: fakePrisma };
  require.cache[tenantCachePath] = {
    id: tenantCachePath,
    filename: tenantCachePath,
    loaded: true,
    exports: { invalidateTenantCache: async () => undefined, getTenantConfig: async () => ({}) }
  };
  delete require.cache[servicePath];
  const service = require(servicePath);
  return {
    service,
    restore() {
      delete require.cache[servicePath];
      for (const [path, cached] of [[prismaPath, previous.prisma], [servicePath, previous.service], [tenantCachePath, previous.tenantCache], [redisConfigPath, previous.redis]]) {
        if (cached) require.cache[path] = cached;
        else delete require.cache[path];
      }
    }
  };
}

// Reproduce core/prisma.js: runWithTenant NO entrega cliente al callback.
function buildTenantPrisma(tenantConfig = {}) {
  const state = { config: tenantConfig, updates: [], audits: [], scopes: [] };
  const db = {
    tenant: {
      findUnique: async () => ({ id: "tenant-qa", config: state.config }),
      update: async ({ data }) => {
        state.updates.push(data);
        state.config = data.config;
        return { id: "tenant-qa", config: state.config };
      }
    },
    auditLog: { create: async ({ data }) => { state.audits.push(data); return data; } },
    $executeRawUnsafe: async () => 1,
    $transaction: async (callback) => callback(db),
    runWithTenant: (tenantId, callback) => {
      state.scopes.push(tenantId);
      return callback();
    }
  };
  return { db, state };
}

test("config: GET no falla con runWithTenant sin parametro y no escribe", async () => {
  const fake = buildTenantPrisma({ accounting: { vehicle_pyg: { source: "accounting", concepts: [{ code: "INGRESOS", name: "X", section: "ingresos", kind: "income", order: 1, ranges: [], exclusions: [] }] } } });
  const loaded = loadAccountConfigService(fake.db);
  try {
    const config = await loaded.service.getAccountConfiguration("tenant-qa");
    assert.equal(config.source, "accounting");
    assert.equal(config.has_config, true);
    assert.equal(config.config.concepts.length, 1);
    assert.equal(config.proposal_from, "excel-presupuesto");
    assert.deepEqual(fake.state.scopes, ["tenant-qa"]);
    assert.equal(fake.state.updates.length, 0);
    assert.equal(fake.state.audits.length, 0);
  } finally {
    loaded.restore();
  }
});

test("config: GET sin tenant exige empresa y sin config devuelve propuesta", async () => {
  const fake = buildTenantPrisma({});
  const loaded = loadAccountConfigService(fake.db);
  try {
    await assert.rejects(() => loaded.service.getAccountConfiguration(null), /Empresa requerida/);
    const config = await loaded.service.getAccountConfiguration("tenant-qa");
    assert.equal(config.has_config, false);
    assert.equal(config.config, null);
    assert.equal(config.proposal.concepts.length, accountConfig.EXCEL_PROPOSAL.concepts.length);
  } finally {
    loaded.restore();
  }
});

test("config: PUT conserva las demas claves del tenant config", async () => {
  const fake = buildTenantPrisma({ locale: "es-CO", accounting: { organization_tree: { branches: [{ code: "B1" }] }, otros: 7 } });
  const loaded = loadAccountConfigService(fake.db);
  try {
    const proposal = accountConfig.cloneProposal();
    const result = await loaded.service.saveAccountConfiguration("tenant-qa", { id: 9 }, proposal);
    assert.equal(result.ok, true);
    assert.equal(result.concepts, proposal.concepts.length);
    const stored = fake.state.config;
    assert.equal(stored.locale, "es-CO");
    assert.equal(stored.accounting.otros, 7);
    assert.deepEqual(stored.accounting.organization_tree, { branches: [{ code: "B1" }] });
    assert.equal(stored.accounting.vehicle_pyg.source, "accounting");
    const audit = fake.state.audits.find((entry) => entry.action === "transport.pyg.account_config.updated");
    assert.ok(audit);
    assert.equal(audit.entity_id, "tenant-qa");
  } finally {
    loaded.restore();
  }
});

test("config: PUT rechaza rangos fuera del PYG sin escribir", async () => {
  const fake = buildTenantPrisma({ accounting: { vehicle_pyg: { source: "operational" } } });
  const loaded = loadAccountConfigService(fake.db);
  try {
    const invalid = accountConfig.cloneProposal();
    invalid.concepts[0].ranges = [{ start: "14050101", end: "14050101" }];
    await assert.rejects(
      () => loaded.service.saveAccountConfiguration("tenant-qa", { id: 9 }, invalid),
      (err) => err.statusCode === 400 && err.code === "PYG_ACCOUNT_CONFIG_INVALID" && err.detail.some((item) => item.code === "RANGE_CLASS_NOT_PYG")
    );
    assert.equal(fake.state.updates.length, 0);
  } finally {
    loaded.restore();
  }
});

test("config: GET con flag legacy operational reporta accounting efectivo y no escribe", async () => {
  const legacyConcepts = [{ code: "INGRESOS", name: "INGRESOS", section: "ingresos", kind: "income", order: 1, ranges: [], exclusions: [] }];
  const fake = buildTenantPrisma({ locale: "es-CO", accounting: { vehicle_pyg: { source: "operational", concepts: legacyConcepts }, otros: 3 } });
  const loaded = loadAccountConfigService(fake.db);
  try {
    const config = await loaded.service.getAccountConfiguration("tenant-qa");
    assert.equal(config.source, "accounting");
    assert.equal(config.has_config, true);
    assert.equal(config.config.source, "accounting");
    assert.deepEqual(config.config.concepts, legacyConcepts);
    // Ninguna escritura del tenant ni auditoria en un GET.
    assert.equal(fake.state.updates.length, 0);
    assert.equal(fake.state.audits.length, 0);
    // El tenant config sigue intacto (sin normalizar ni persistir cambios).
    assert.equal(fake.state.config.accounting.vehicle_pyg.source, "operational");
    assert.equal(fake.state.config.locale, "es-CO");
    assert.equal(fake.state.config.accounting.otros, 3);
  } finally {
    loaded.restore();
  }
});

test("config: GET con conceptos legacy vacios usa propuesta sin escribir", async () => {
  const original = { accounting: { vehicle_pyg: { source: "operational", concepts: [] }, otros: 7 } };
  const fake = buildTenantPrisma(original);
  const loaded = loadAccountConfigService(fake.db);
  try {
    const config = await loaded.service.getAccountConfiguration("tenant-qa");
    assert.equal(config.source, "accounting");
    assert.equal(config.has_config, false);
    assert.equal(config.config, null);
    assert.deepEqual(config.proposal.concepts, accountConfig.cloneProposal().concepts);
    assert.deepEqual(fake.state.config, original);
    assert.equal(fake.state.updates.length, 0);
    assert.equal(fake.state.audits.length, 0);
  } finally {
    loaded.restore();
  }
});

test("config: GET sin config devuelve propuesta accounting y sin config registrada", async () => {
  const fake = buildTenantPrisma({});
  const loaded = loadAccountConfigService(fake.db);
  try {
    const config = await loaded.service.getAccountConfiguration("tenant-qa");
    assert.equal(config.source, "accounting");
    assert.equal(config.has_config, false);
    assert.equal(config.config, null);
    assert.equal(config.proposal.source, "accounting");
    assert.equal(config.proposal.concepts.length, accountConfig.EXCEL_PROPOSAL.concepts.length);
    assert.equal(fake.state.updates.length, 0);
    assert.equal(fake.state.audits.length, 0);
  } finally {
    loaded.restore();
  }
});

test("config: PUT rechaza la fuente operativa de forma controlada sin escribir", async () => {
  const fake = buildTenantPrisma({ accounting: { vehicle_pyg: { source: "accounting", concepts: [] } } });
  const loaded = loadAccountConfigService(fake.db);
  try {
    await assert.rejects(
      () => loaded.service.saveAccountConfiguration("tenant-qa", { id: 9 }, { source: "operational", concepts: [] }),
      (err) => err.statusCode === 400 && err.code === "PYG_ACCOUNT_CONFIG_INVALID" && err.detail.some((item) => item.code === "SOURCE_INVALID")
    );
    assert.equal(fake.state.updates.length, 0);
    assert.equal(fake.state.audits.length, 0);
  } finally {
    loaded.restore();
  }
});

test("validacion: la fuente operativa se rechaza de forma controlada", () => {
  const result = accountConfig.validateAccountConfig({ source: "operational", concepts: [] });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((item) => item.code === "SOURCE_INVALID"));
});
