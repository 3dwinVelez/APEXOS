// PYG por vehiculo: pruebas del motor puro (buildReport) y del servicio (persistencia
// y agregacion SQL con prisma falso). Los valores replican la hoja GOLIAT (agosto 2026)
// del PYG corporativo de logistica para anclar el criterio de calculo.
const assert = require("node:assert/strict");
const test = require("node:test");

const { CONCEPT_CATALOG, DEFAULT_SOURCE_MAP, UNMAPPED_CONCEPT } = require("../src/modules/transport-pyg/concept-catalog");
const { buildReport, periodBounds, normalizePlate } = require("../src/modules/transport-pyg/engine");

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

function loadService(fakePrisma) {
  const prismaPath = require.resolve("../src/core/prisma");
  const servicePath = require.resolve("../src/modules/transport-pyg/service");
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

function buildFakePrisma() {
  const state = {
    budgets: new Map(),
    vehicles: new Map([[1, { id: 1, plate: "ESQ 294", active: true, deleted_at: null, authorized_driver_id: 10 }]]),
    concepts: new Map(),
    maps: new Map(),
    config: null,
    audit: [],
    tenantContexts: []
  };
  const key = (...parts) => parts.join("||");
  const db = {
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
        state.concepts.set(where.tenant_id_code.code, { ...create, ...update });
        return state.concepts.get(where.tenant_id_code.code);
      },
      findMany: async () => CONCEPT_CATALOG.map((concept) => ({ ...concept, display_order: concept.order }))
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
      state.tenant = tenantId;
      return callback();
    },
    $transaction: async (callback) => callback(db)
  };
  return { db, state };
}

test("servicio: getReport agrega ingresos/gastos y devuelve el DTO con tenant correcto", async () => {
  const fake = buildFakePrisma();
  const loaded = loadService(fake.db);
  try {
    const report = await loaded.service.getReport("tenant-qa", { period: PERIOD });
    assert.equal(report.period, PERIOD);
    assert.equal(report.tax_percent, 2.25);
    assert.equal(report.vehicles[0].income_actual, 19150000);
    assert.equal(report.vehicles[0].rows.find((row) => row.code === "GASTOS_PERSONAL").actual, 7803733);
    assert.equal(report.corporate.income_actual, 19150000);
    assert.equal(fake.state.tenant, "tenant-qa");
    // La siembra idempotente creo el catalogo completo y el mapping por defecto.
    assert.equal(fake.state.concepts.size, CONCEPT_CATALOG.length);
    assert.equal(fake.state.maps.size, DEFAULT_SOURCE_MAP.length);
  } finally {
    loaded.restore();
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
