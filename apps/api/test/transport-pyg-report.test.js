// PYG por vehiculo: pruebas del motor puro (buildReport) y del servicio (persistencia
// y agregacion SQL con prisma falso). Los valores replican la hoja GOLIAT (agosto 2026)
// del PYG corporativo de logistica para anclar el criterio de calculo.
const assert = require("node:assert/strict");
const test = require("node:test");
const { AsyncLocalStorage } = require("node:async_hooks");

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
  const storage = new AsyncLocalStorage();
  const state = {
    budgets: new Map(), vehicles: new Map(), concepts: new Map(), maps: new Map(),
    configs: new Map(), sources: new Map(), inputs: new Map(), tenants: new Map(),
    audit: [], calls: [], nextId: 1
  };
  const key = (...parts) => parts.join("||");
  const addTenant = (tenantId, inputs = goliatInputs()) => {
    state.tenants.set(tenantId, { id: tenantId, config: {} });
    state.inputs.set(tenantId, structuredClone(inputs));
    for (const vehicle of inputs.vehicles) state.vehicles.set(key(tenantId, vehicle.id), { ...vehicle, tenant_id: tenantId, active: true, deleted_at: null });
    for (const row of inputs.budgets) state.budgets.set(key(tenantId, row.vehicle_id, PERIOD, row.concept_code), { ...row, tenant_id: tenantId, period: PERIOD, amount: String(row.amount) });
  };
  addTenant("tenant-qa");
  state.tenant = state.tenants.get("tenant-qa");

  async function record(name, args, type = "read", explicitTenant = true) {
    // Ceder el turno fuerza el entrelazado de peticiones concurrentes sin un tenant global.
    await Promise.resolve();
    const context = storage.getStore();
    assert.ok(context?.tenantId, `${name}: contexto de tenant requerido`);
    state.calls.push({ name, args: structuredClone(args), type, tenantId: context.tenantId, transaction: context.transaction === true });
    if (type === "write" || type === "transaction") {
      assert.notEqual(context.readOnly, true, `${name}: DML prohibido en GET`);
      if (type === "write") assert.equal(context.transaction, true, `${name}: escritura fuera de transaccion`);
    }
    if (explicitTenant) {
      const compound = args?.where?.tenant_id_code || args?.where?.tenant_id_vehicle_id_period_concept_code;
      const tenant = args?.data?.tenant_id ?? args?.create?.tenant_id ?? compound?.tenant_id ?? args?.where?.tenant_id;
      assert.equal(tenant, context.tenantId, `${name}: filtro tenant explicito inconsistente`);
    }
    return context;
  }

  async function findRows(table, name, args, explicitTenant = true) {
    const context = await record(name, args, "read", explicitTenant);
    // Solo vehicle emula la inyeccion del middleware, como el servicio existente.
    const where = { ...args.where, tenant_id: context.tenantId };
    let rows = [...table.values()].filter((row) => Object.entries(where).every(([field, value]) => row[field] === value));
    const ordering = args.orderBy ? (Array.isArray(args.orderBy) ? args.orderBy : [args.orderBy]) : [];
    rows.sort((left, right) => {
      for (const entry of ordering) {
        const [field, direction] = Object.entries(entry)[0];
        const comparison = typeof left[field] === "number" ? left[field] - right[field] : String(left[field]).localeCompare(String(right[field]));
        if (comparison) return direction === "desc" ? -comparison : comparison;
      }
      return 0;
    });
    return rows.map((row) => args.select
      ? Object.fromEntries(Object.keys(args.select).filter((field) => args.select[field]).map((field) => [field, row[field]]))
      : { ...row });
  }

  async function upsert(table, name, args, mapKey) {
    await record(name, args, "write");
    const existing = table.get(mapKey);
    const row = existing ? { ...existing, ...args.update } : { id: state.nextId++, active: true, ...args.create };
    table.set(mapKey, row);
    return { ...row };
  }

  const db = {
    tenant: {
      findUnique: async (args) => {
        const context = await record("tenant.findUnique", args, "read", false);
        assert.equal(args.where.id, context.tenantId, "lectura de otro tenant prohibida");
        assert.deepEqual(args.select, { config: true }, "solo config es necesaria para el reporte");
        const tenant = state.tenants.get(args.where.id);
        return tenant ? { config: structuredClone(tenant.config) } : null;
      }
    },
    vehicle: {
      findMany: (args) => findRows(state.vehicles, "vehicle.findMany", args, false),
      findFirst: async (args) => (await findRows(state.vehicles, "vehicle.findFirst", args, false))[0] || null
    },
    transportPygBudget: {
      findMany: (args) => findRows(state.budgets, "budget.findMany", args),
      upsert: (args) => upsert(state.budgets, "budget.upsert", args, key(args.create.tenant_id, args.create.vehicle_id, args.create.period, args.create.concept_code))
    },
    transportPygConcept: {
      findMany: (args) => findRows(state.concepts, "concept.findMany", args),
      upsert: (args) => upsert(state.concepts, "concept.upsert", args, key(args.where.tenant_id_code.tenant_id, args.where.tenant_id_code.code))
    },
    transportPygSourceMap: {
      findMany: (args) => findRows(state.maps, "map.findMany", args),
      findFirst: async (args) => (await findRows(state.maps, "map.findFirst", args))[0] || null,
      create: async (args) => {
        await record("map.create", args, "write");
        const mapKey = key(args.data.tenant_id, args.data.source_type, args.data.source_code);
        assert.equal(state.maps.has(mapKey), false, "tuple de mapping duplicada");
        const row = { id: state.nextId++, active: true, ...args.data };
        state.maps.set(mapKey, row);
        return { ...row };
      },
      update: async (args) => {
        const context = await record("map.update", args, "write", false);
        const existing = [...state.maps.entries()].find(([, row]) => row.id === args.where.id);
        assert.ok(existing, "mapping existente requerido");
        assert.equal(existing[1].tenant_id, context.tenantId, "update de otro tenant prohibido");
        const row = { ...existing[1], ...args.data };
        state.maps.set(existing[0], row);
        return { ...row };
      }
    },
    transportPygConfig: {
      findFirst: async (args) => (await findRows(state.configs, "config.findFirst", args))[0] || null,
      upsert: (args) => upsert(state.configs, "config.upsert", args, args.create.tenant_id)
    },
    account: {
      // El plan real solo se consume desde core/prisma; el servicio contable ya
      // no re-filtra hojas por Account.type.
      findMany: async () => {
        throw new Error("db.account.findMany no debe consultarse desde el reporte PYG contable");
      }
    },
    pettyCashConcept: { findMany: (args) => findRows(state.sources, "source.findMany", args) },
    auditLog: { create: async (args) => {
      const context = await record("audit.create", args, "write", false);
      const row = { ...args.data, tenant_id: context.tenantId };
      state.audit.push(row);
      return row;
    } },
    $queryRaw: async (strings, ...values) => {
      const sql = strings.join("?");
      const context = await record("queryRaw", { sql, values }, "raw", false);
      assert.match(sql, /tenant_id = \?/);
      assert.equal(values[0], context.tenantId);
      const inputs = state.inputs.get(context.tenantId);
      if (sql.includes("TransportSettlementItem")) {
        assert.equal(values[1], context.tenantId);
        return structuredClone(inputs?.incomeRows || []);
      }
      if (sql.includes("petty_cash_voucher_lines")) return structuredClone(inputs?.pettyRows || []);
      if (sql.includes('"Payroll"')) return structuredClone(inputs?.payrollRows || []);
      if (sql.includes("th_aportes_sociales_lineas")) return structuredClone(inputs?.pilaRows || []);
      if (sql.includes("th_prestaciones_saldos")) return structuredClone(inputs?.provisionRows || []);
      assert.fail("SQL inesperado");
    },
    $executeRawUnsafe: async (sql, lockKey) => {
      const context = await record("executeRawUnsafe", { sql, lockKey }, "write", false);
      assert.equal(sql, "SELECT pg_advisory_xact_lock(hashtext($1))");
      assert.equal(lockKey, `transport-pyg:${context.tenantId}`);
      return 1;
    },
    runWithTenant: (tenantId, callback) => storage.run({ ...storage.getStore(), tenantId }, callback),
    $transaction: async (callback, options) => {
      const context = await record("transaction", options, "transaction", false);
      const snapshot = structuredClone({ maps: state.maps, concepts: state.concepts, budgets: state.budgets, configs: state.configs, audit: state.audit });
      try {
        return await storage.run({ ...context, transaction: true }, () => callback(db));
      } catch (error) {
        Object.assign(state, snapshot);
        throw error;
      }
    }
  };
  return { db, state, key, addTenant, readOnly: (fn) => storage.run({ readOnly: true }, fn) };
}

function persistConcept(fake, tenantId, code, patch = {}) {
  const concept = CONCEPT_CATALOG.find((row) => row.code === code);
  const row = { id: fake.state.nextId++, tenant_id: tenantId, ...concept, code, display_order: concept?.order ?? 0, active: true, ...patch };
  fake.state.concepts.set(fake.key(tenantId, code), row);
  return row;
}

function persistMap(fake, tenantId, sourceCode, patch = {}) {
  const map = DEFAULT_SOURCE_MAP.find((row) => row.source_code === sourceCode);
  const row = { id: fake.state.nextId++, tenant_id: tenantId, source_type: "petty_cash_concept", ...map, source_code: sourceCode, active: true, ...patch };
  fake.state.maps.set(fake.key(tenantId, row.source_type, sourceCode), row);
  return row;
}

function seedCatalogState(fake, tenantId) {
  for (const concept of CONCEPT_CATALOG) persistConcept(fake, tenantId, concept.code);
  for (const map of DEFAULT_SOURCE_MAP) persistMap(fake, tenantId, map.source_code);
}

function storedState(fake) {
  const { concepts, maps, budgets, configs, audit } = fake.state;
  return structuredClone({ concepts, maps, budgets, configs, audit });
}

function conceptDTO(row) {
  return { code: row.code, name: row.name, section: row.section, kind: row.kind, display_order: row.display_order ?? row.order };
}

function mappingDTO(row) {
  return { source_type: row.source_type, source_code: row.source_code, pyg_concept_code: row.pyg_concept_code, active: row.active ?? true };
}

function sortMaps(rows) {
  return rows.sort((left, right) => left.source_type.localeCompare(right.source_type) || left.source_code.localeCompare(right.source_code));
}

function assertSingleRead(fake, name, select) {
  assert.equal(fake.state.calls.length, 1);
  assert.equal(fake.state.calls[0].name, name);
  assert.equal(fake.state.calls[0].type, "read");
  assert.deepEqual(fake.state.calls[0].args.where, { tenant_id: "tenant-qa" });
  assert.deepEqual(fake.state.calls[0].args.select, select);
}

for (const seeded of [false, true]) {
  test(`servicio: conceptos y mapping ${seeded ? "sembrados" : "vacios"} requieren una lectura cada uno y cero DML`, async () => {
    const fake = buildFakePrisma();
    if (seeded) seedCatalogState(fake, "tenant-qa");
    const before = storedState(fake);
    const loaded = loadService(fake.db);
    try {
      const concepts = await fake.readOnly(() => loaded.service.listConcepts("tenant-qa"));
      assert.deepEqual(concepts, CONCEPT_CATALOG.map(conceptDTO));
      assertSingleRead(fake, "concept.findMany", { code: true, name: true, section: true, kind: true, display_order: true, active: true });
      fake.state.calls.length = 0;
      const mapping = await fake.readOnly(() => loaded.service.getMapping("tenant-qa"));
      assert.deepEqual(mapping, { rows: sortMaps(DEFAULT_SOURCE_MAP.map(mappingDTO)) });
      assertSingleRead(fake, "map.findMany", { source_type: true, source_code: true, pyg_concept_code: true, active: true });
      fake.state.calls.length = 0;
      const report = await fake.readOnly(() => loaded.service.getOperationalReport("tenant-qa", { period: PERIOD }));
      assert.deepEqual(report, buildReport(goliatInputs()));
      assert.equal(fake.state.calls.length, 9);
      assert.equal(fake.state.calls.filter((call) => call.type === "read").length, 4);
      assert.equal(fake.state.calls.filter((call) => call.type === "raw").length, 5);
      assert.deepEqual(storedState(fake), before);
    } finally {
      loaded.restore();
    }
  });
}

test("servicio: conceptos persistidos prevalecen incluso inactivos, vacios y con orden cero", async () => {
  const fake = buildFakePrisma();
  persistConcept(fake, "tenant-qa", "COMBUSTIBLE", { active: false });
  const override = persistConcept(fake, "tenant-qa", "INGRESOS", { name: "", section: "propia", kind: "expense", display_order: 0 });
  const custom = persistConcept(fake, "tenant-qa", "CUSTOM", { name: "Propio", section: "propia", kind: "income", display_order: 1 });
  persistConcept(fake, "tenant-qa", "CUSTOM_INACTIVE", { active: false, display_order: -1 });
  persistConcept(fake, "tenant-other", "DOTACION", { name: "No pertenece", display_order: -2 });
  const before = storedState(fake);
  const loaded = loadService(fake.db);
  try {
    const concepts = await fake.readOnly(() => loaded.service.listConcepts("tenant-qa"));
    const expected = [override, custom, ...CONCEPT_CATALOG.filter((row) => !["INGRESOS", "COMBUSTIBLE"].includes(row.code))].map(conceptDTO);
    assert.deepEqual(concepts, expected);
    assert.equal(concepts.some((row) => "id" in row || "active" in row || "tenant_id" in row || "order" in row), false);
    assert.equal(fake.state.calls.length, 1);
    assert.deepEqual(storedState(fake), before);
  } finally {
    loaded.restore();
  }
});

test("servicio: mapping fusiona por tuple, conserva false/vacio, custom y orden estable", async () => {
  const fake = buildFakePrisma();
  const inactive = persistMap(fake, "tenant-qa", "PEAJES", { active: false, pyg_concept_code: "OTROS" });
  const blank = persistMap(fake, "tenant-qa", "HONORARIOS", { active: true, pyg_concept_code: "" });
  const custom = persistMap(fake, "tenant-qa", "AAA_CUSTOM", { pyg_concept_code: "VIATICOS" });
  const otherType = persistMap(fake, "tenant-qa", "COMBUSTIBLE", { source_type: "another_type", pyg_concept_code: "OTROS" });
  persistMap(fake, "tenant-other", "COMBUSTIBLE", { active: false, pyg_concept_code: "" });
  const before = storedState(fake);
  const loaded = loadService(fake.db);
  try {
    const expected = sortMaps([
      ...DEFAULT_SOURCE_MAP.filter((row) => !["PEAJES", "HONORARIOS"].includes(row.source_code)),
      inactive, blank, custom, otherType
    ].map(mappingDTO));
    const mapping = await fake.readOnly(() => loaded.service.getMapping("tenant-qa"));
    assert.deepEqual(mapping, { rows: expected });
    assert.equal(mapping.rows.some((row) => "id" in row || "tenant_id" in row), false);
    assert.equal(fake.state.calls.length, 1);
    fake.state.calls.length = 0;
    assert.deepEqual(await fake.readOnly(() => loaded.service.getMapping("tenant-qa")), mapping);
    assert.equal(fake.state.calls.length, 1, "segunda lectura sin cache global");
    assert.deepEqual(storedState(fake), before);
  } finally {
    loaded.restore();
  }
});

test("servicio: GET concurrentes de dos tenants no comparten overrides, mapa ni impuesto", async () => {
  const fake = buildFakePrisma();
  fake.addTenant("tenant-other");
  persistConcept(fake, "tenant-qa", "INGRESOS", { active: false, name: "No cambia el motor" });
  persistConcept(fake, "tenant-other", "INGRESOS", { name: "Empresa B" });
  const inactive = persistMap(fake, "tenant-qa", "COMBUSTIBLE", { active: false });
  const override = persistMap(fake, "tenant-other", "COMBUSTIBLE", { pyg_concept_code: "OTROS" });
  const blank = persistMap(fake, "tenant-other", "PEAJES", { pyg_concept_code: "", active: true });
  fake.state.configs.set("tenant-qa", { tenant_id: "tenant-qa", tax_percent: "0" });
  fake.state.configs.set("tenant-other", { tenant_id: "tenant-other", tax_percent: "3.5" });
  const before = storedState(fake);
  const loaded = loadService(fake.db);
  try {
    await fake.readOnly(async () => {
      await Promise.all(Array.from({ length: 6 }, async (_, index) => {
        const tenantId = index % 2 ? "tenant-other" : "tenant-qa";
        const [concepts, mapping, report] = await Promise.all([
          loaded.service.listConcepts(tenantId), loaded.service.getMapping(tenantId),
          loaded.service.getOperationalReport(tenantId, { period: PERIOD })
        ]);
        const inputs = goliatInputs();
        inputs.taxPercent = tenantId === "tenant-qa" ? 0 : 3.5;
        inputs.sourceMaps = [...DEFAULT_SOURCE_MAP.filter((row) => row.source_code !== "COMBUSTIBLE" && (tenantId === "tenant-qa" || row.source_code !== "PEAJES")), ...(tenantId === "tenant-qa" ? [inactive] : [override, blank])];
        assert.deepEqual(report, buildReport(inputs), "calculo con catalogo canonico y configuracion propia");
        if (tenantId === "tenant-qa") {
          assert.equal(concepts.some((row) => row.code === "INGRESOS"), false);
          assert.equal(mapping.rows.find((row) => row.source_code === "COMBUSTIBLE").active, false);
          assert.equal(report.data_status.unmapped_total, 3323769.1);
        } else {
          assert.equal(concepts.find((row) => row.code === "INGRESOS").name, "Empresa B");
          assert.equal(mapping.rows.find((row) => row.source_code === "COMBUSTIBLE").pyg_concept_code, "OTROS");
          assert.equal(report.data_status.unmapped_total, 2013600);
        }
      }));
    });
    assert.equal(fake.state.calls.length, 6 * 11);
    for (const tenantId of ["tenant-qa", "tenant-other"]) {
      const calls = fake.state.calls.filter((call) => call.tenantId === tenantId);
      assert.equal(calls.length, 3 * 11);
      assert.equal(calls.filter((call) => call.name === "concept.findMany").length, 3);
      assert.equal(calls.filter((call) => call.name === "map.findMany").length, 6);
    }
    assert.deepEqual(storedState(fake), before);
  } finally {
    loaded.restore();
  }
});

test("servicio: todos los GET rechazan tenant ausente antes de consultar", async () => {
  const fake = buildFakePrisma();
  const loaded = loadService(fake.db);
  try {
    for (const method of ["listConcepts", "getMapping", "getReport", "getOperationalReport", "listSourceConcepts", "getBudgets", "getConfig"]) {
      await assert.rejects(async () => loaded.service[method](null, { period: PERIOD }), { code: "PYG_TENANT_REQUIRED", statusCode: 401 });
    }
    assert.equal(fake.state.calls.length, 0);
  } finally {
    loaded.restore();
  }
});

test("fake: GET no puede abrir transaccion ni escribir aunque tenga contexto tenant", async () => {
  const fake = buildFakePrisma();
  const row = persistMap(fake, "tenant-qa", "PEAJES");
  await fake.readOnly(() => fake.db.runWithTenant("tenant-qa", async () => {
    for (const mutation of [
      () => fake.db.transportPygConcept.upsert({ where: { tenant_id_code: { tenant_id: "tenant-qa", code: "INGRESOS" } }, create: { tenant_id: "tenant-qa", code: "INGRESOS" }, update: {} }),
      () => fake.db.transportPygSourceMap.create({ data: row }),
      () => fake.db.transportPygSourceMap.update({ where: { id: row.id }, data: { active: false } }),
      () => fake.db.$executeRawUnsafe("SELECT 1"),
      () => fake.db.$transaction(async () => null)
    ]) await assert.rejects(mutation, /DML prohibido en GET/);
  }));
  assert.equal(fake.state.maps.get(fake.key("tenant-qa", "petty_cash_concept", "PEAJES")).active, true);
});

test("servicio: inicializacion explicita conserva overrides y no resucita tombstones", async () => {
  const fake = buildFakePrisma();
  const concept = persistConcept(fake, "tenant-qa", "INGRESOS", { name: "Propio", section: "otra", kind: "expense", display_order: 0, active: false });
  const tombstone = persistMap(fake, "tenant-qa", "COMBUSTIBLE", { active: false, pyg_concept_code: "" });
  const loaded = loadService(fake.db);
  try {
    for (let index = 0; index < 2; index += 1) {
      await fake.db.runWithTenant("tenant-qa", () => fake.db.$transaction((tx) => loaded.service.ensureCatalog(tx, "tenant-qa")));
      assert.deepEqual(fake.state.concepts.get(fake.key("tenant-qa", "INGRESOS")), concept);
      assert.deepEqual(fake.state.maps.get(fake.key("tenant-qa", "petty_cash_concept", "COMBUSTIBLE")), tombstone);
      assert.equal(fake.state.concepts.size, CONCEPT_CATALOG.length);
      assert.equal(fake.state.maps.size, DEFAULT_SOURCE_MAP.length);
    }
    assert.ok(fake.state.calls.filter((call) => call.name === "concept.upsert").every((call) => Object.keys(call.args.update).length === 0));
  } finally {
    loaded.restore();
  }
});

test("servicio: getOperationalReport conserva el calculador legacy (caja menor, nomina, liquidacion)", async () => {
  const fake = buildFakePrisma();
  const loaded = loadService(fake.db);
  try {
    const report = await fake.readOnly(() => loaded.service.getOperationalReport("tenant-qa", { period: PERIOD }));
    assert.equal(report.period, PERIOD);
    assert.equal(report.tax_percent, 2.25);
    assert.equal(report.source, "operational");
    assert.equal(report.vehicles[0].income_actual, 19150000);
    assert.equal(report.vehicles[0].rows.find((row) => row.code === "GASTOS_PERSONAL").actual, 7803733);
    assert.equal(report.corporate.income_actual, 19150000);
    assert.equal(fake.state.tenant.id, "tenant-qa");
    assert.deepEqual(report, buildReport(goliatInputs()));
    assert.ok(fake.state.calls.every((call) => call.tenantId === "tenant-qa"));
    // La proyeccion legacy tampoco inicializa tablas: usa defaults virtuales.
    assert.equal(fake.state.concepts.size, 0);
    assert.equal(fake.state.maps.size, 0);
    assert.equal(fake.state.calls.filter((call) => call.type === "write" || call.type === "transaction").length, 0);
    assert.equal(fake.state.calls.filter((call) => call.type === "read").length, 4);
    assert.equal(fake.state.calls.filter((call) => call.type === "raw").length, 5);
  } finally {
    loaded.restore();
  }
});

test("servicio: source-concepts filtra inactivos y otro tenant y selecciona solo campos publicos", async () => {
  const fake = buildFakePrisma();
  const row = { id: 81, tenant_id: "tenant-qa", code: "FUEL", name: "Combustible", active: true, account_code: "5105", metadata: { private: true } };
  fake.state.sources.set(fake.key("tenant-qa", "FUEL"), row);
  fake.state.sources.set(fake.key("tenant-qa", "HIDDEN"), { ...row, id: 82, code: "HIDDEN", active: false });
  fake.state.sources.set(fake.key("tenant-other", "FUEL"), { ...row, id: 83, tenant_id: "tenant-other" });
  const before = structuredClone(fake.state.sources);
  const loaded = loadService(fake.db);
  try {
    const sources = await fake.readOnly(() => loaded.service.listSourceConcepts("tenant-qa"));
    assert.deepEqual(sources, [{ id: 81, code: "FUEL", name: "Combustible", active: true }]);
    assert.equal(fake.state.calls.length, 1);
    assert.equal(fake.state.calls[0].name, "source.findMany");
    assert.deepEqual(fake.state.calls[0].args.where, { tenant_id: "tenant-qa", active: true });
    assert.deepEqual(fake.state.calls[0].args.select, { id: true, code: true, name: true, active: true });
    assert.deepEqual(fake.state.sources, before);
  } finally {
    loaded.restore();
  }
});

test("servicio: reporte publico ignora liquidacion, nomina, caja menor y presupuesto operativo sin ledger", async () => {
  const fake = buildFakePrisma();
  persistConcept(fake, "tenant-qa", "INGRESOS", { active: false, name: "Override operativo" });
  persistMap(fake, "tenant-qa", "COMBUSTIBLE", { active: false, pyg_concept_code: "" });
  fake.state.tenant.config = { accounting: { vehicle_pyg: { source: "operational", concepts: [] } } };
  const before = storedState(fake);
  const tenantBefore = structuredClone(fake.state.tenants);
  const calls = [];
  interactiveStub.getInteractivePyg = async (tenantId, query) => {
    calls.push({ tenantId, query });
    return { nodes: [], warnings: [], linkage: {} };
  };
  const loaded = loadService(fake.db);
  try {
    const report = await fake.readOnly(() => loaded.service.getReport("tenant-qa", { period: PERIOD }));
    assert.equal(report.source, "accounting");
    assert.equal(report.report_source, "ledger");
    assert.deepEqual(calls, [{ tenantId: "tenant-qa", query: { period: PERIOD, mode: "month", dimensions: "puc,branch,cost_center" } }]);
    for (const vehicle of report.vehicles) {
      for (const code of ["INGRESOS", "GASTOS_PERSONAL", "COMBUSTIBLE"]) {
        const row = vehicle.rows.find((item) => item.code === code);
        assert.equal(row.actual, 0);
        assert.equal(row.budget, null);
        assert.equal(row.cump, null);
      }
    }
    assert.equal(report.corporate.totals.totalIngresos.actual, 0);
    assert.equal(report.reconciliation.ledger_net, 0);
    assert.equal(report.reconciliation.difference, 0);
    assert.equal(fake.state.calls.filter((call) => call.type !== "read").length, 0);
    assert.equal(fake.state.calls.some((call) => ["budget.findMany", "map.findMany", "concept.findMany"].includes(call.name)), false);
    assert.ok(fake.state.calls.every((call) => call.tenantId === "tenant-qa"));
    assert.deepEqual(storedState(fake), before);
    assert.deepEqual(fake.state.tenants, tenantBefore);
  } finally {
    loaded.restore();
    interactiveStub.getInteractivePyg = async () => ({ nodes: [] });
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
    const report = await fake.readOnly(() => loaded.service.getReport("tenant-qa", { period: PERIOD }));
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
    const report = await fake.readOnly(() => loaded.service.getReport("tenant-qa", { period: PERIOD }));
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
    await fake.readOnly(() => loaded.service.getReport("tenant-qa", { period: "2026-08" }));
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
    const report = await fake.readOnly(() => loaded.service.getReport("tenant-qa", { period: PERIOD }));
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
  const override = persistConcept(fake, "tenant-qa", "INGRESOS", { name: "INGRESOS AJUSTADOS", section: "ingresos", kind: "income", display_order: 99 });
  const loaded = loadService(fake.db);
  try {
    await fake.db.runWithTenant("tenant-qa", () => fake.db.$transaction((tx) => loaded.service.ensureCatalog(tx, "tenant-qa")));
    const upserts = fake.state.calls.filter((call) => call.name === "concept.upsert");
    assert.equal(upserts.length, CONCEPT_CATALOG.length);
    assert.ok(upserts.every((entry) => Object.keys(entry.args.update).length === 0));
    assert.deepEqual(fake.state.concepts.get(fake.key("tenant-qa", "INGRESOS")), override);
    const rows = await fake.readOnly(() => loaded.service.listConcepts("tenant-qa"));
    const ingresos = rows.find((row) => row.code === "INGRESOS");
    assert.equal(ingresos.name, "INGRESOS AJUSTADOS");
    assert.equal(ingresos.display_order, 99);
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
    const report = await fake.readOnly(() => loaded.service.getReport("tenant-qa", { period: PERIOD }));
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
    const report = await fake.readOnly(() => loaded.service.getReport("tenant-qa", { period: PERIOD }));
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
    const report = await fake.readOnly(() => loaded.service.getReport("tenant-qa", { period: PERIOD }));
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
    const report = await fake.readOnly(() => loaded.service.getReport("tenant-qa", { period: PERIOD }));
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

test("servicio: PUT desactiva default ausente, GET conserva tombstone y PUT reactiva con override propio", async () => {
  const fake = buildFakePrisma();
  fake.addTenant("tenant-other");
  const otherMap = persistMap(fake, "tenant-other", "COMBUSTIBLE", { pyg_concept_code: "VIATICOS" });
  fake.state.configs.set("tenant-qa", { tenant_id: "tenant-qa", tax_percent: "0" });
  const unchanged = structuredClone({ budgets: fake.state.budgets, configs: fake.state.configs, concepts: fake.state.concepts });
  const loaded = loadService(fake.db);
  const mapKey = fake.key("tenant-qa", "petty_cash_concept", "COMBUSTIBLE");
  try {
    const result = await loaded.service.saveMapping("tenant-qa", { id: 5 }, {
      tenant_id: "tenant-other",
      rows: [{ tenant_id: "tenant-other", source_code: " combustible ", pyg_concept_code: " ", active: true }]
    });
    assert.deepEqual(result, { ok: true, upserted: 1 });
    const tombstone = fake.state.maps.get(mapKey);
    assert.ok(tombstone.id);
    assert.deepEqual(mappingDTO(tombstone), { source_type: "petty_cash_concept", source_code: "COMBUSTIBLE", pyg_concept_code: "", active: false });
    assert.equal(tombstone.tenant_id, "tenant-qa");
    assert.equal(fake.state.maps.size, 2);
    assert.equal(fake.state.calls.filter((call) => call.name === "map.create").length, 1);
    assert.equal(fake.state.calls.filter((call) => call.name === "transaction").length, 1);
    assert.deepEqual(fake.state.calls.find((call) => call.name === "transaction").args, { maxWait: 10000, timeout: 25000 });
    assert.equal(fake.state.calls.filter((call) => call.name === "executeRawUnsafe").length, 1);
    assert.ok(fake.state.calls.filter((call) => call.type === "write").every((call) => call.transaction && call.tenantId === "tenant-qa"));
    assert.equal(fake.state.audit.length, 1);
    assert.equal(fake.state.audit[0].action, "transport.pyg.mapping.updated");
    assert.equal(fake.state.audit[0].tenant_id, "tenant-qa");

    fake.state.calls.length = 0;
    const mapping = await fake.readOnly(() => loaded.service.getMapping("tenant-qa"));
    assert.deepEqual(mapping.rows.find((row) => row.source_code === "COMBUSTIBLE"), mappingDTO(tombstone));
    assertSingleRead(fake, "map.findMany", { source_type: true, source_code: true, pyg_concept_code: true, active: true });
    const disabledReport = await fake.readOnly(() => loaded.service.getOperationalReport("tenant-qa", { period: PERIOD }));
    assert.deepEqual(disabledReport, buildReport({ ...goliatInputs(), taxPercent: 0, sourceMaps: [...DEFAULT_SOURCE_MAP.filter((row) => row.source_code !== "COMBUSTIBLE"), tombstone] }));
    assert.equal(disabledReport.data_status.unmapped_total, 3323769.1);
    assert.deepEqual(fake.state.maps.get(fake.key("tenant-other", "petty_cash_concept", "COMBUSTIBLE")), otherMap);

    fake.state.calls.length = 0;
    await loaded.service.saveMapping("tenant-qa", { id: 5 }, {
      rows: [{ source_code: "combustible", pyg_concept_code: " otros ", active: true }]
    });
    const override = fake.state.maps.get(mapKey);
    assert.equal(override.id, tombstone.id, "reactiva la fila existente sin duplicar el tuple");
    assert.deepEqual(mappingDTO(override), { source_type: "petty_cash_concept", source_code: "COMBUSTIBLE", pyg_concept_code: "OTROS", active: true });
    assert.equal(fake.state.calls.filter((call) => call.name === "map.update").length, 1);
    assert.equal(fake.state.calls.filter((call) => call.name === "map.create").length, 0);
    assert.equal(fake.state.audit.length, 2);
    assert.ok(fake.state.audit.every((entry) => entry.tenant_id === "tenant-qa" && entry.action === "transport.pyg.mapping.updated"));

    fake.state.calls.length = 0;
    const reactivated = await fake.readOnly(() => loaded.service.getMapping("tenant-qa"));
    assert.deepEqual(reactivated.rows.find((row) => row.source_code === "COMBUSTIBLE"), mappingDTO(override));
    assertSingleRead(fake, "map.findMany", { source_type: true, source_code: true, pyg_concept_code: true, active: true });
    const activeReport = await fake.readOnly(() => loaded.service.getOperationalReport("tenant-qa", { period: PERIOD }));
    assert.deepEqual(activeReport, buildReport({ ...goliatInputs(), taxPercent: 0, sourceMaps: [...DEFAULT_SOURCE_MAP.filter((row) => row.source_code !== "COMBUSTIBLE"), override] }));
    assert.equal(activeReport.data_status.unmapped_total, 0);
    const otherMapping = await fake.readOnly(() => loaded.service.getMapping("tenant-other"));
    assert.deepEqual(otherMapping.rows.find((row) => row.source_code === "COMBUSTIBLE"), mappingDTO(otherMap));
    assert.deepEqual(fake.state.maps.get(fake.key("tenant-other", "petty_cash_concept", "COMBUSTIBLE")), otherMap);
    assert.deepEqual({ budgets: fake.state.budgets, configs: fake.state.configs, concepts: fake.state.concepts }, unchanged);
  } finally {
    loaded.restore();
  }
});

test("servicio: PUT limpia mapping existente y conserva active false con destino no vacio", async () => {
  const fake = buildFakePrisma();
  const existing = persistMap(fake, "tenant-qa", "PEAJES", { pyg_concept_code: "OTROS" });
  const loaded = loadService(fake.db);
  try {
    const result = await loaded.service.saveMapping("tenant-qa", { id: 5 }, {
      rows: [
        { source_code: "PEAJES", pyg_concept_code: "" },
        { source_code: "VIATICOS", pyg_concept_code: "DOTACION", active: false },
        { source_code: "CUSTOM", pyg_concept_code: "HONORARIOS_CONTABLES_SST" }
      ]
    });
    assert.deepEqual(result, { ok: true, upserted: 3 });
    const cleared = fake.state.maps.get(fake.key("tenant-qa", "petty_cash_concept", "PEAJES"));
    assert.equal(cleared.id, existing.id);
    assert.equal(cleared.pyg_concept_code, "");
    assert.equal(cleared.active, false);
    const disabled = fake.state.maps.get(fake.key("tenant-qa", "petty_cash_concept", "VIATICOS"));
    assert.equal(disabled.pyg_concept_code, "DOTACION");
    assert.equal(disabled.active, false);
    fake.state.calls.length = 0;
    const mapping = await fake.readOnly(() => loaded.service.getMapping("tenant-qa"));
    for (const row of fake.state.maps.values()) assert.deepEqual(mapping.rows.find((item) => item.source_code === row.source_code), mappingDTO(row));
    assertSingleRead(fake, "map.findMany", { source_type: true, source_code: true, pyg_concept_code: true, active: true });
  } finally {
    loaded.restore();
  }
});

test("servicio: PUT valida y revierte tombstone parcial sin afectar otro tenant ni auditar", async () => {
  const fake = buildFakePrisma();
  fake.addTenant("tenant-other");
  persistMap(fake, "tenant-other", "COMBUSTIBLE", { pyg_concept_code: "OTROS" });
  const before = storedState(fake);
  const loaded = loadService(fake.db);
  try {
    await assert.rejects(() => loaded.service.saveMapping("tenant-qa", { id: 5 }, {
      rows: [{ source_code: "COMBUSTIBLE", pyg_concept_code: "" }, { source_code: "PEAJES", pyg_concept_code: "NO_EXISTE" }]
    }), { code: "PYG_MAPPING_CONCEPT_INVALID", statusCode: 400 });
    assert.equal(fake.state.calls.filter((call) => call.name === "map.create").length, 1, "se intento el tombstone antes del error");
    assert.equal(fake.state.calls.filter((call) => call.name === "audit.create").length, 0);
    assert.deepEqual(storedState(fake), before, "la transaccion revierte el lote completo");
    for (const [input, code] of [
      [{ rows: [] }, "PYG_MAPPING_EMPTY"],
      [{ rows: [{ source_type: "other", source_code: "PEAJES" }] }, "PYG_MAPPING_SOURCE_INVALID"],
      [{ rows: [{ source_code: " " }] }, "PYG_MAPPING_SOURCE_CODE_REQUIRED"]
    ]) await assert.rejects(() => loaded.service.saveMapping("tenant-qa", { id: 5 }, input), { code, statusCode: 400 });
    await assert.rejects(() => loaded.service.saveMapping(null, { id: 5 }, { rows: [{ source_code: "COMBUSTIBLE", pyg_concept_code: "" }] }), { code: "PYG_TENANT_REQUIRED", statusCode: 401 });
    assert.deepEqual(storedState(fake), before);
    fake.state.calls.length = 0;
    const mapping = await fake.readOnly(() => loaded.service.getMapping("tenant-qa"));
    assert.deepEqual(mapping.rows.find((row) => row.source_code === "COMBUSTIBLE"), mappingDTO(DEFAULT_SOURCE_MAP.find((row) => row.source_code === "COMBUSTIBLE")));
    assertSingleRead(fake, "map.findMany", { source_type: true, source_code: true, pyg_concept_code: true, active: true });
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
    assert.equal(Number(fake.state.configs.get("tenant-qa").tax_percent), 3.5);
    const config = await fake.readOnly(() => loaded.service.getConfig("tenant-qa"));
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
