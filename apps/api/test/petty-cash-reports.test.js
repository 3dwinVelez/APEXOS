const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

process.env.DISABLE_REDIS = "true";

// Instancia real del modulo (sin base de datos) para los helpers puros de T4: solo se ejercitan
// funciones que no tocan Prisma. reportFilters/reportSummary/reportDetail/reportBoxesRanking se
// prueban abajo contra el arnes en memoria con el modulo recargado.
const realAccounting = require("../src/modules/accounting/service");
const pettyCash = require("../src/modules/petty-cash/service");

// === Fixtures ===

const EXPENSE_ACCOUNT = { id: 501, tenant_id: "t-1", code: "519505", name: "Gastos de viaje", type: "expense", active: true, allows_tx: true };
const STATIONERY_ACCOUNT = { id: 502, tenant_id: "t-1", code: "519595", name: "Utiles y papeleria", type: "expense", active: true, allows_tx: true };
const CASH_ACCOUNT = { id: 101, tenant_id: "t-1", code: "110505", name: "Caja menor", type: "asset", active: true, allows_tx: true };
const ADVANCE_ACCOUNT = { id: 130, tenant_id: "t-1", code: "133001", name: "Anticipos a terceros", type: "asset", active: true, allows_tx: true };
const VAT_ACCOUNT = { id: 240, tenant_id: "t-1", code: "2408", name: "IVA descontable", type: "liability", active: true, allows_tx: true };

const SUPPLIER = { id: 55, tenant_id: "t-1", name: "Papeleria Andina", legal_name: "Papeleria Andina SAS", type: "supplier", active: true, tax_id: "900123456" };
const CUSTODIAN = { id: 77, tenant_id: "t-1", name: "Juan Perez", legal_name: "Juan Perez SAS", type: "employee", active: true, tax_id: null };
const CUSTODIAN_2 = { id: 78, tenant_id: "t-1", name: "Maria Gomez", legal_name: "Maria Gomez", type: "employee", active: true, tax_id: null };

const BOX_BOGOTA = {
  id: 3, tenant_id: "t-1", code: "CM-01", name: "Caja menor Bogota", active: true,
  account_code: "110505", account_id: 101, advance_account_code: "133001",
  custodian_party_id: 77, custodian_name: "Juan Perez SAS",
  branch_code: "B-01", cost_center_code: "CC-10",
  monthly_limit: 1000000, require_advance: false, block_unliquidated_advance: false,
  notes: null, created_by: 9,
  created_at: new Date("2026-01-05T10:00:00.000Z"), updated_at: new Date("2026-01-05T10:00:00.000Z")
};
const BOX_GOLIAT = {
  ...BOX_BOGOTA, id: 4, code: "GOLIAT", name: "Caja Goliat",
  custodian_party_id: 78, custodian_name: "Maria Gomez",
  branch_code: "B-02", cost_center_code: "CC-20",
  monthly_limit: null
};
// Caja inactiva sin comprobantes: reportFilters resuelve box_code contra el maestro completo
// (__includeInactive), asi que el filtro por codigo tambien acepta cajas cerradas (historico).
const BOX_CLOSED = {
  ...BOX_BOGOTA, id: 5, code: "CERRADA", name: "Caja cerrada 2025", active: false, monthly_limit: null
};
// Caja de OTRA empresa (t-2) que reutiliza el codigo CM-01: los codigos de caja son unicos por
// tenant, no globales, asi que la resolucion de box_code debe quedar aislada por empresa.
const BOX_OTHER_TENANT = {
  ...BOX_BOGOTA, id: 6, tenant_id: "t-2", code: "CM-01", name: "Caja menor Cali",
  custodian_party_id: 90, custodian_name: "Cali SAS", monthly_limit: null
};

const CONCEPT_TRAVEL = {
  id: 5, tenant_id: "t-1", code: "PEAJE", name: "Peajes", account_code: "519505",
  advance_account_code: null, default_vat_code: null,
  requires_supplier: false, requires_invoice_reference: false, active: true
};
const CONCEPT_STATIONERY = {
  id: 6, tenant_id: "t-1", code: "PAPELERIA", name: "Papeleria", account_code: "519595",
  advance_account_code: null, default_vat_code: null,
  requires_supplier: true, requires_invoice_reference: true, active: true
};
// MENSAJERIA se usa en lineas pero NO existe en el maestro: prueba el label de respaldo por codigo.

// Anticipo abierto de la caja Bogota: cubre exactamente la linea L11 (liquidacion parcial).
const ADVANCE_OPEN = {
  id: 21, tenant_id: "t-1", box_id: 3, custodian_party_id: 77, document_type: "AN",
  number: 21, amount: 300000, applied_total: 238000, balance: 62000,
  full_number: "AN-000021", status: "open", liquidated_at: null, created_by: 9,
  created_at: new Date("2026-03-01T10:00:00.000Z"), updated_at: new Date("2026-03-01T10:00:00.000Z")
};
// Anticipo LIQUIDADO con saldo 300000: la liquidacion preserva el invariante
// balance = amount - applied_total, asi que el saldo vivo no implica estado abierto.
// El detalle debe leer el CAMPO status, nunca derivarlo del saldo.
const ADVANCE_LIQUIDATED = {
  id: 22, tenant_id: "t-1", box_id: 3, custodian_party_id: 77, document_type: "AN",
  number: 22, amount: 800000, applied_total: 500000, balance: 300000,
  full_number: "AN-000022", status: "liquidated", liquidated_at: new Date("2026-04-25T10:00:00.000Z"), created_by: 9,
  created_at: new Date("2026-04-01T10:00:00.000Z"), updated_at: new Date("2026-04-25T10:00:00.000Z")
};

// Arbol organizacional falso: los reportes resuelven nombres de centros de costo contra el arbol
// contable (accounting.getOrganizationTree), no contra una tabla propia.
const ORG_TREE = {
  societies: [],
  branches: [
    { code: "B-01", name: "Sede norte", active: true },
    { code: "B-02", name: "Sede sur", active: true }
  ],
  cost_centers: [
    { code: "CC-10", name: "Centro Bogota", active: true },
    { code: "CC-20", name: "Centro Goliat", active: true }
  ]
};

function voucherFixture(overrides = {}) {
  return {
    id: 1, tenant_id: "t-1", box_id: 3, advance_id: null, document_type: "GM",
    number: 1, full_number: "GM-000001", date: new Date("2026-03-05T00:00:00.000Z"),
    posting_date: new Date("2026-03-05T00:00:00.000Z"), period: "2026-03", status: "posted",
    subtotal: 0, vat_total: 0, total: 0, accounting_document_id: 900, reversal_accounting_document_id: null,
    description: null, created_by: 9,
    created_at: new Date("2026-03-05T10:00:00.000Z"), updated_at: new Date("2026-03-05T10:00:00.000Z"),
    ...overrides
  };
}

function lineFixture(overrides = {}) {
  return {
    id: 1, tenant_id: "t-1", voucher_id: 1, line_number: 1,
    concept_id: 5, concept_code: "PEAJE", account_code: "519505",
    description: "Peaje", cost_center_code: null, branch_code: null,
    supplier_party_id: null, invoice_reference: null,
    base_amount: 100000, vat_code: null, vat_percent: 0, vat_amount: 0, vat_account_code: null,
    total: 100000, advance_applied: 0, ledger_entry_id: 800,
    created_at: new Date("2026-03-05T10:00:00.000Z"), updated_at: new Date("2026-03-05T10:00:00.000Z"),
    ...overrides
  };
}

// Dataset canonico de T4: 3 cajas (1 inactiva sin datos), 2 conceptos en maestro (uno mas ausente),
// 5 comprobantes (1 anulado, 1 de 2025), 6 lineas con IVA/anticipo/centro de costo/proveedor variados.
function reportDataset() {
  const vouchers = [
    voucherFixture({ id: 1, box_id: 3, advance_id: 21, full_number: "GM-000001", date: new Date("2026-03-05T00:00:00.000Z"), period: "2026-03", description: "Gira viaje", subtotal: 200000, vat_total: 38000, total: 238000 }),
    voucherFixture({ id: 2, box_id: 3, advance_id: null, number: 2, full_number: "GM-000002", date: new Date("2026-03-12T00:00:00.000Z"), period: "2026-03", description: "Compras varias", subtotal: 150000, vat_total: 9500, total: 159500 }),
    voucherFixture({ id: 3, box_id: 4, advance_id: null, number: 3, full_number: "GM-000003", date: new Date("2026-04-02T00:00:00.000Z"), period: "2026-04", description: "Mensajeria", subtotal: 80000, vat_total: 0, total: 80000 }),
    voucherFixture({ id: 4, box_id: 4, advance_id: null, number: 4, full_number: "GM-000004", date: new Date("2026-03-20T00:00:00.000Z"), period: "2026-03", status: "cancelled", description: "Anulado", subtotal: 50000, vat_total: 0, total: 50000 }),
    voucherFixture({ id: 5, box_id: 3, advance_id: null, number: 5, full_number: "GM-000005", date: new Date("2025-12-15T00:00:00.000Z"), period: "2025-12", description: "Cierre 2025", subtotal: 30000, vat_total: 0, total: 30000 })
  ];
  const lines = [
    // v1: peaje con IVA 19% pagado con anticipo, centro de costo CC-10.
    lineFixture({ id: 11, voucher_id: 1, line_number: 1, base_amount: 200000, vat_code: "COMPRAS-19", vat_percent: 19, vat_amount: 38000, total: 238000, advance_applied: 238000, cost_center_code: "CC-10", branch_code: "B-01", description: "Peajes giramovil" }),
    // v2: dos lineas sin anticipo y sin centro de costo; la segunda con proveedor.
    lineFixture({ id: 12, voucher_id: 2, line_number: 1, base_amount: 100000, total: 100000, description: "Peajes ciudad" }),
    lineFixture({ id: 13, voucher_id: 2, line_number: 2, concept_id: 6, concept_code: "PAPELERIA", account_code: "519595", base_amount: 50000, vat_code: "COMPRAS-19", vat_percent: 19, vat_amount: 9500, total: 59500, supplier_party_id: 55, invoice_reference: "FE-123", description: "Papeleria ofimatica" }),
    // v3: concepto MENSAJERIA ausente del maestro, con proveedor y CC-20.
    lineFixture({ id: 14, voucher_id: 3, line_number: 1, concept_id: null, concept_code: "MENSAJERIA", account_code: "519505", base_amount: 80000, total: 80000, supplier_party_id: 55, cost_center_code: "CC-20", branch_code: "B-02", description: "Mensajeria domicilios" }),
    // v4: comprobante anulado: excluido de todos los reportes por defecto.
    lineFixture({ id: 15, voucher_id: 4, line_number: 1, base_amount: 50000, total: 50000, description: "Peaje anulado" }),
    // v5: ejercicio anterior (2025).
    lineFixture({ id: 16, voucher_id: 5, line_number: 1, base_amount: 30000, total: 30000, description: "Peaje diciembre" })
  ];
  return {
    boxes: [BOX_BOGOTA, BOX_GOLIAT, BOX_CLOSED],
    concepts: [CONCEPT_TRAVEL, CONCEPT_STATIONERY],
    parties: [SUPPLIER, CUSTODIAN, CUSTODIAN_2],
    accounts: [EXPENSE_ACCOUNT, STATIONERY_ACCOUNT, CASH_ACCOUNT, ADVANCE_ACCOUNT, VAT_ACCOUNT],
    advances: [ADVANCE_OPEN],
    vouchers,
    lines
  };
}

// Dataset multi-tenant: la empresa t-2 reutiliza el codigo de caja CM-01 y tiene su propio
// historico. Los maestros (conceptos, cuentas, parties) solo existen para t-1: bajo t-2 el
// historico queda sin etiquetas de maestro ajeno.
function mixedTenantDataset() {
  const base = reportDataset();
  return {
    ...base,
    boxes: [...base.boxes, BOX_OTHER_TENANT],
    vouchers: [
      ...base.vouchers,
      voucherFixture({
        id: 21, tenant_id: "t-2", box_id: 6, number: 21, full_number: "GM-000101",
        date: new Date("2026-03-15T00:00:00.000Z"), period: "2026-03", description: "Compra otra empresa",
        subtotal: 50000, vat_total: 9500, total: 59500
      })
    ],
    lines: [
      ...base.lines,
      lineFixture({
        id: 210, tenant_id: "t-2", voucher_id: 21, base_amount: 50000,
        vat_code: "COMPRAS-19", vat_percent: 19, vat_amount: 9500, total: 59500,
        description: "Peaje otra empresa"
      })
    ]
  };
}

// === Base de datos falsa en memoria (solo lectura: los reportes no escriben) ===

function isFilterObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date);
}

function sameValue(actual, expected) {
  if (expected instanceof Date || actual instanceof Date) return new Date(actual).getTime() === new Date(expected).getTime();
  return actual === expected;
}

function matchField(actual, expected) {
  if (expected === undefined) return true;
  if (expected === null) return actual === null || actual === undefined;
  if (isFilterObject(expected)) {
    return Object.entries(expected).every(([operator, operand]) => {
      switch (operator) {
        case "in": return (operand || []).some((item) => sameValue(actual, item));
        case "notIn": return !(operand || []).some((item) => sameValue(actual, item));
        case "not": return !matchField(actual, operand);
        case "gte": return Number(actual) >= Number(operand);
        case "gt": return Number(actual) > Number(operand);
        case "lte": return Number(actual) <= Number(operand);
        case "lt": return Number(actual) < Number(operand);
        case "equals": return sameValue(actual, operand);
        default: return sameValue(actual, operand);
      }
    });
  }
  return sameValue(actual, expected);
}

function matchesWhere(row, where = {}) {
  return Object.entries(where || {}).every(([key, expected]) => {
    // __includeInactive es una bandera del middleware de soft-delete, no un campo del where.
    if (key.startsWith("__")) return true;
    if (key === "AND") return (expected || []).every((clause) => matchesWhere(row, clause));
    if (key === "OR") return (expected || []).some((clause) => matchesWhere(row, clause));
    return matchField(row[key], expected);
  });
}

// orderBy con criterios anidados: [{ voucher: { date: "desc" } }, { voucher: { id: "desc" } }, { line_number: "asc" }].
// La relacion voucher se adjunta ANTES de ordenar (igual que Prisma).
function applyOrderBy(rows, orderBy) {
  if (!orderBy) return rows;
  const criteria = Array.isArray(orderBy) ? orderBy : [orderBy];
  const comparable = (value) => (value instanceof Date ? value.getTime() : value);
  return [...rows].sort((a, b) => {
    for (const criterion of criteria) {
      const [field, direction] = Object.entries(criterion)[0];
      let left = a[field];
      let right = b[field];
      let nested = null;
      if (typeof direction === "object" && direction !== null) {
        const [[innerField, innerDirection]] = Object.entries(direction);
        nested = innerDirection;
        left = left ? left[innerField] : undefined;
        right = right ? right[innerField] : undefined;
      }
      if (comparable(left) === comparable(right)) continue;
      const greater = comparable(left) > comparable(right) ? 1 : -1;
      const effective = nested || direction;
      return effective === "desc" ? -greater : greater;
    }
    return 0;
  });
}

function createHarness(initial = {}) {
  const dataset = initial.dataset || reportDataset();
  const store = {
    boxes: [...dataset.boxes],
    concepts: [...dataset.concepts],
    parties: [...dataset.parties],
    accounts: [...dataset.accounts],
    advances: [...dataset.advances],
    vouchers: [...dataset.vouchers],
    lines: [...dataset.lines]
  };
  const calls = [];

  function select(row, args) {
    if (!row) return row;
    if (args?.select) {
      const projection = {};
      for (const field of Object.keys(args.select)) projection[field] = row[field];
      return projection;
    }
    return { ...row };
  }

  function voucherById(id) {
    return store.vouchers.find((row) => Number(row.id) === Number(id)) || null;
  }

  // Emulacion fiel de los middlewares de src/core/prisma.js:
  // 1) tenant: dentro de runWithTenant inyecta tenant_id en la RAIZ del where de toda lectura
  //    de un modelo con tenant; la relacion anidada voucher: {...} nunca la recibe.
  // 2) soft-delete: consume __includeInactive y, sin la bandera, exige active: true
  //    (Party, Account, PettyCashConcept, PettyCashBox).
  // calls registra el where CRUDO del servicio (pre-middleware): permite afirmar que T4
  // nunca filtra el tenant a mano y delega el aislamiento a runWithTenant.
  const TENANT_SCOPED_MODELS = new Set(["account", "party", "pettyCashConcept", "pettyCashBox", "pettyCashAdvance", "pettyCashVoucherLine"]);
  const SOFT_DELETE_MODELS = new Set(["account", "party", "pettyCashConcept", "pettyCashBox"]);
  let currentTenant = null;

  function scopedWhere(modelName, args) {
    const where = { ...(args.where || {}) };
    if (currentTenant && TENANT_SCOPED_MODELS.has(modelName)) where.tenant_id = currentTenant;
    if (SOFT_DELETE_MODELS.has(modelName)) {
      const includeInactive = where.__includeInactive === true;
      delete where.__includeInactive;
      if (!includeInactive && !("active" in where)) where.active = true;
    }
    return where;
  }

  const db = {
    calls,
    store,
    runWithTenant: async (tenantId, callback) => {
      const previous = currentTenant;
      currentTenant = tenantId === null || tenantId === undefined ? null : String(tenantId);
      try {
        return await callback();
      } finally {
        currentTenant = previous;
      }
    },
    account: {
      findMany: async (args) => { calls.push({ op: "account.findMany", where: args.where }); return store.accounts.filter((row) => matchesWhere(row, scopedWhere("account", args))).map((row) => select(row, args)); }
    },
    party: {
      findMany: async (args) => { calls.push({ op: "party.findMany", where: args.where }); return store.parties.filter((row) => matchesWhere(row, scopedWhere("party", args))).map((row) => select(row, args)); }
    },
    pettyCashConcept: {
      findMany: async (args) => { calls.push({ op: "pettyCashConcept.findMany", where: args.where }); return store.concepts.filter((row) => matchesWhere(row, scopedWhere("pettyCashConcept", args))).map((row) => ({ ...row })); }
    },
    pettyCashBox: {
      // findFirst: resolucion de box_code en reportFilters (incluye inactivas via __includeInactive).
      findFirst: async (args) => { calls.push({ op: "pettyCashBox.findFirst", where: args.where }); return store.boxes.find((row) => matchesWhere(row, scopedWhere("pettyCashBox", args))) || null; },
      findMany: async (args) => { calls.push({ op: "pettyCashBox.findMany", where: args.where }); return store.boxes.filter((row) => matchesWhere(row, scopedWhere("pettyCashBox", args))).map((row) => ({ ...row })); }
    },
    pettyCashAdvance: {
      // Resolucion por lotes del estado del anticipo en reportDetail.
      findMany: async (args) => { calls.push({ op: "pettyCashAdvance.findMany", where: args.where, select: args.select }); return store.advances.filter((row) => matchesWhere(row, scopedWhere("pettyCashAdvance", args))).map((row) => select(row, args)); }
    },
    pettyCashVoucherLine: {
      // Soporta el filtro relacional voucher: {...} (estado/caja/fecha del comprobante).
      findMany: async (args) => {
        calls.push({ op: "pettyCashVoucherLine.findMany", where: args.where, take: args.take });
        const where = scopedWhere("pettyCashVoucherLine", args);
        let voucherWhere = null;
        if (where.voucher) { voucherWhere = where.voucher; delete where.voucher; }
        const matched = store.lines.filter((line) => {
          if (!matchesWhere(line, where)) return false;
          if (voucherWhere) {
            const voucher = voucherById(line.voucher_id);
            if (!voucher || !matchesWhere(voucher, voucherWhere)) return false;
          }
          return true;
        });
        const withVoucher = matched.map((line) => {
          const voucher = voucherById(line.voucher_id);
          let projected = voucher ? { ...voucher } : null;
          if (voucher && args.include?.voucher?.select) {
            projected = {};
            for (const field of Object.keys(args.include.voucher.select)) projected[field] = voucher[field];
          }
          return { ...line, voucher: projected };
        });
        const sorted = applyOrderBy(withVoucher, args.orderBy);
        return sorted.slice(0, args.take || sorted.length);
      }
    }
  };
  return { store, calls, db };
}

// T4 no invoca contabilidad transaccional: basta un modulo contable minimo con los helpers reales
// mas getOrganizationTree simulado (los reportes resuelven centros de costo del arbol activo).
function loadPettyCashService(prisma) {
  const prismaPath = require.resolve("../src/core/prisma");
  const accountingPath = require.resolve("../src/modules/accounting/service");
  const servicePath = require.resolve("../src/modules/petty-cash/service");
  const previous = { prisma: require.cache[prismaPath], accounting: require.cache[accountingPath], service: require.cache[servicePath] };
  const accountingModule = {
    DEFAULT_ACCOUNTING_DOCUMENT_TYPES: realAccounting.DEFAULT_ACCOUNTING_DOCUMENT_TYPES,
    periodFromDate: realAccounting.periodFromDate,
    getOrganizationTree: async () => ORG_TREE
  };
  require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: prisma };
  require.cache[accountingPath] = { id: accountingPath, filename: accountingPath, loaded: true, exports: accountingModule };
  delete require.cache[servicePath];
  const service = require(servicePath);
  return {
    service,
    restore() {
      delete require.cache[servicePath];
      const restoreEntry = (key, target) => { if (previous[key]) require.cache[target] = previous[key]; else delete require.cache[target]; };
      restoreEntry("prisma", prismaPath);
      restoreEntry("accounting", accountingPath);
      if (previous.service) require.cache[servicePath] = previous.service;
    }
  };
}

function setup(initial = {}) {
  const harness = createHarness(initial);
  const loaded = loadPettyCashService(harness.db);
  return { ...harness, service: loaded.service, restore: loaded.restore };
}

function assertThrowsCode(fn, statusCode, code) {
  let error = null;
  try { fn(); } catch (thrown) { error = thrown; }
  assert.ok(error, `se esperaba un error ${code}`);
  assert.equal(error.code, code);
  assert.equal(error.statusCode, statusCode);
  return error;
}

async function assertRejectsCode(promise, statusCode, code) {
  let error = null;
  try { await promise; } catch (thrown) { error = thrown; }
  assert.ok(error, `se esperaba un error ${code}`);
  assert.equal(error.code, code);
  assert.equal(error.statusCode, statusCode);
  return error;
}

const EMPTY_ECHO = {
  year: null, month: null, date_from: null, date_to: null, box_id: null, box_code: null,
  concept_code: null, cost_center_code: null, branch_code: null,
  supplier_party_id: null, account_code: null, include_cancelled: false
};

// === (A) Helpers puros de T4 (modulo real, sin Prisma) ===

test("reportYearFilter acepta 4 digitos sin cotas de ejercicio", () => {
  assert.equal(pettyCash.reportYearFilter({ year: "2026" }), 2026);
  assert.equal(pettyCash.reportYearFilter({ year: 2026 }), 2026);
  assert.equal(pettyCash.reportYearFilter({ year: "1999" }), 1999);
  assert.equal(pettyCash.reportYearFilter({}), null);
  assertThrowsCode(() => pettyCash.reportYearFilter({ year: "abcd" }), 400, "REPORT_FILTER_INVALID");
  assertThrowsCode(() => pettyCash.reportYearFilter({ year: "189" }), 400, "REPORT_FILTER_INVALID");
});

test("reportMonthFilter valida 1-12 y acepta cero inicial", () => {
  assert.equal(pettyCash.reportMonthFilter({ month: "3" }), 3);
  assert.equal(pettyCash.reportMonthFilter({ month: "12" }), 12);
  assert.equal(pettyCash.reportMonthFilter({ month: "03" }), 3);
  assert.equal(pettyCash.reportMonthFilter({}), null);
  assertThrowsCode(() => pettyCash.reportMonthFilter({ month: "13" }), 400, "REPORT_FILTER_INVALID");
  assertThrowsCode(() => pettyCash.reportMonthFilter({ month: "0" }), 400, "REPORT_FILTER_INVALID");
  assertThrowsCode(() => pettyCash.reportMonthFilter({ month: "abc" }), 400, "REPORT_FILTER_INVALID");
});

test("reportIncludeCancelled acepta true/false insensible a mayusculas y rechaza cualquier otra cosa", () => {
  assert.equal(pettyCash.reportIncludeCancelled({ include_cancelled: "true" }), true);
  assert.equal(pettyCash.reportIncludeCancelled({ include_cancelled: "TRUE" }), true);
  assert.equal(pettyCash.reportIncludeCancelled({ include_cancelled: "false" }), false);
  assert.equal(pettyCash.reportIncludeCancelled({ include_cancelled: "FALSE" }), false);
  assert.equal(pettyCash.reportIncludeCancelled({}), false);
  assertThrowsCode(() => pettyCash.reportIncludeCancelled({ include_cancelled: "si" }), 400, "REPORT_FILTER_INVALID");
});

test("reportDateRange construye year/month en UTC y cruza (AND) con date_from/date_to", () => {
  const march = pettyCash.reportDateRange({ year: "2026", month: "3" });
  assert.equal(march.from.toISOString(), "2026-03-01T00:00:00.000Z");
  assert.equal(march.to.toISOString(), "2026-03-31T23:59:59.999Z");
  const fullYear = pettyCash.reportDateRange({ year: 2026 });
  assert.equal(fullYear.from.toISOString(), "2026-01-01T00:00:00.000Z");
  assert.equal(fullYear.to.toISOString(), "2026-12-31T23:59:59.999Z");
  const explicit = pettyCash.reportDateRange({ date_from: "2026-02-10", date_to: "2026-03-15" });
  assert.equal(explicit.from.toISOString(), "2026-02-10T00:00:00.000Z");
  assert.equal(explicit.to.toISOString(), "2026-03-15T23:59:59.999Z");
  // Interseccion: year/month acotado ademas por date_from.
  const intersected = pettyCash.reportDateRange({ year: "2026", month: "3", date_from: "2026-03-10" });
  assert.equal(intersected.from.toISOString(), "2026-03-10T00:00:00.000Z");
  assert.equal(intersected.to.toISOString(), "2026-03-31T23:59:59.999Z");
  assert.deepEqual(pettyCash.reportDateRange({}), { from: null, to: null });
});

test("reportDateRange rechaza filtros incoherentes con REPORT_FILTER_INVALID", () => {
  assertThrowsCode(() => pettyCash.reportDateRange({ month: "3" }), 400, "REPORT_FILTER_INVALID");
  assertThrowsCode(() => pettyCash.reportDateRange({ year: "2026", month: "13" }), 400, "REPORT_FILTER_INVALID");
  assertThrowsCode(() => pettyCash.reportDateRange({ year: "2026", month: "0" }), 400, "REPORT_FILTER_INVALID");
  assertThrowsCode(() => pettyCash.reportDateRange({ year: "189" }), 400, "REPORT_FILTER_INVALID");
  assertThrowsCode(() => pettyCash.reportDateRange({ year: "2026", month: "3", date_from: "2026-04-01" }), 400, "REPORT_FILTER_INVALID");
  assertThrowsCode(() => pettyCash.reportDateRange({ date_from: "2026-05-01", date_to: "2026-04-01" }), 400, "REPORT_FILTER_INVALID");
  // 31/03/2026 no es AAAA-MM-DD y V8 no lo parsea: rechazado en la frontera.
  assertThrowsCode(() => pettyCash.reportDateRange({ date_from: "31/03/2026" }), 400, "REPORT_FILTER_INVALID");
});

test("reportGroupBy defaulta a caja, normaliza mayusculas y rechaza dimensiones desconocidas", () => {
  assert.equal(pettyCash.reportGroupBy({}), "box");
  assert.equal(pettyCash.reportGroupBy({ group_by: "CONCEPT" }), "concept");
  assert.deepEqual(pettyCash.REPORT_GROUP_BYS, ["box", "concept", "month", "cost_center", "supplier", "account"]);
  assertThrowsCode(() => pettyCash.reportGroupBy({ group_by: "warehouse" }), 400, "REPORT_FILTER_INVALID");
});

test("reportFilters echa los filtros normalizados sin tocar la base cuando no hay box_code", async () => {
  const filters = await pettyCash.reportFilters({
    year: "2026", month: "3", date_from: "2026-03-01", date_to: "2026-03-31",
    box_id: "3", concept_code: " peaje ", cost_center_code: "cc-10",
    branch_code: " b-01 ", supplier_party_id: "55", account_code: "519505",
    include_cancelled: "true"
  });
  assert.deepEqual(filters.echo, {
    year: 2026, month: 3, date_from: "2026-03-01", date_to: "2026-03-31",
    box_id: 3, box_code: null, concept_code: "PEAJE", cost_center_code: "cc-10",
    branch_code: "b-01", supplier_party_id: 55, account_code: "519505", include_cancelled: true
  });
  assert.equal(filters.boxId, 3);
  assert.equal(filters.conceptCode, "PEAJE");
  assert.equal(filters.costCenterCode, "cc-10");
  assert.equal(filters.branchCode, "b-01");
  assert.equal(filters.supplierPartyId, 55);
  assert.equal(filters.accountCode, "519505");
  assert.equal(filters.range.from.toISOString(), "2026-03-01T00:00:00.000Z");
  assert.equal(filters.range.to.toISOString(), "2026-03-31T23:59:59.999Z");
  // Sin filtros: todo null y el anulado excluido por defecto.
  const empty = await pettyCash.reportFilters({});
  assert.deepEqual(empty.echo, EMPTY_ECHO);
  assert.deepEqual({ from: empty.range.from, to: empty.range.to }, { from: null, to: null });
  assert.equal(empty.includeCancelled, false);
  // Identificadores no positivos ni numericos: rechazados, no silenciados.
  await assertRejectsCode(pettyCash.reportFilters({ box_id: "0" }), 400, "REPORT_FILTER_INVALID");
  await assertRejectsCode(pettyCash.reportFilters({ supplier_party_id: "abc" }), 400, "REPORT_FILTER_INVALID");
});

test("reportLineWhere compone filtros de linea con el where del comprobante", async () => {
  const filters = await pettyCash.reportFilters({
    concept_code: "peaje", cost_center_code: "CC-10", branch_code: "B-01",
    account_code: "519505", supplier_party_id: "55", box_id: "3",
    year: "2026", month: "3"
  });
  assert.deepEqual(pettyCash.reportLineWhere(filters), {
    concept_code: "PEAJE",
    cost_center_code: "CC-10",
    branch_code: "B-01",
    account_code: "519505",
    supplier_party_id: 55,
    voucher: {
      status: { not: "cancelled" },
      box_id: 3,
      date: { gte: new Date("2026-03-01T00:00:00.000Z"), lte: new Date("2026-03-31T23:59:59.999Z") }
    }
  });
  // Por defecto solo filtra el estado del comprobante: nunca suma el anulado.
  const defaults = await pettyCash.reportFilters({});
  assert.deepEqual(pettyCash.reportLineWhere(defaults), { voucher: { status: { not: "cancelled" } } });
  // include_cancelled=true: el estado deja de filtrar (where vacio, scan completo).
  const withCancelled = await pettyCash.reportFilters({ include_cancelled: "true" });
  assert.deepEqual(pettyCash.reportLineWhere(withCancelled), {});
});

// === (B) reportSummary ===

test("summary por caja sin filtros: totales, etiquetas y orden por gasto total desc", async () => {
  const context = setup();
  try {
    const report = await context.service.reportSummary("t-1", {});
    assert.equal(report.group_by, "box");
    assert.equal(report.truncated, false);
    assert.equal(report.rows.length, 2);
    const bogota = report.rows[0];
    assert.equal(bogota.box_id, 3);
    assert.equal(bogota.box_code, "CM-01");
    assert.equal(bogota.label, "CM-01 - Caja menor Bogota");
    assert.deepEqual(
      {
        vouchers_count: bogota.vouchers_count, lines_count: bogota.lines_count,
        base_total: bogota.base_total, vat_total: bogota.vat_total, total: bogota.total,
        advance_applied_total: bogota.advance_applied_total, cash_applied_total: bogota.cash_applied_total
      },
      { vouchers_count: 3, lines_count: 4, base_total: 380000, vat_total: 47500, total: 427500, advance_applied_total: 238000, cash_applied_total: 189500 }
    );
    const goliat = report.rows[1];
    assert.equal(goliat.box_id, 4);
    assert.equal(goliat.label, "GOLIAT - Caja Goliat");
    assert.deepEqual(
      { lines_count: goliat.lines_count, total: goliat.total, vouchers_count: goliat.vouchers_count },
      { lines_count: 1, total: 80000, vouchers_count: 1 }
    );
    assert.deepEqual(report.totals, {
      vouchers_count: 4, lines_count: 5, base_total: 460000, vat_total: 47500,
      total: 507500, advance_applied_total: 238000, cash_applied_total: 269500
    });
    assert.deepEqual(report.filters, EMPTY_ECHO);
    assert.deepEqual(report.date_range, { from: null, to: null });
  } finally {
    context.restore();
  }
});

test("summary por caja con year excluye el ejercicio anterior", async () => {
  const context = setup();
  try {
    const report = await context.service.reportSummary("t-1", { year: "2026" });
    assert.equal(report.rows.length, 2);
    const bogota = report.rows[0];
    assert.deepEqual(
      { lines_count: bogota.lines_count, base_total: bogota.base_total, total: bogota.total, vouchers_count: bogota.vouchers_count },
      { lines_count: 3, base_total: 350000, total: 397500, vouchers_count: 2 }
    );
    assert.equal(report.date_range.from.toISOString(), "2026-01-01T00:00:00.000Z");
    assert.equal(report.date_range.to.toISOString(), "2026-12-31T23:59:59.999Z");
    assert.deepEqual(report.totals, { vouchers_count: 3, lines_count: 4, base_total: 430000, vat_total: 47500, total: 477500, advance_applied_total: 238000, cash_applied_total: 239500 });
  } finally {
    context.restore();
  }
});

test("summary con year+month acota al mes calendario en UTC", async () => {
  const context = setup();
  try {
    const report = await context.service.reportSummary("t-1", { year: "2026", month: "3" });
    assert.equal(report.rows.length, 1);
    assert.equal(report.rows[0].box_id, 3);
    assert.deepEqual(report.totals, { vouchers_count: 2, lines_count: 3, base_total: 350000, vat_total: 47500, total: 397500, advance_applied_total: 238000, cash_applied_total: 159500 });
  } finally {
    context.restore();
  }
});

test("summary con include_cancelled=true suma el comprobante anulado", async () => {
  const context = setup();
  try {
    const report = await context.service.reportSummary("t-1", { include_cancelled: "true" });
    const goliat = report.rows[1];
    assert.deepEqual({ lines_count: goliat.lines_count, base_total: goliat.base_total, total: goliat.total, vouchers_count: goliat.vouchers_count }, { lines_count: 2, base_total: 130000, total: 130000, vouchers_count: 2 });
    assert.equal(report.filters.include_cancelled, true);
    assert.deepEqual(report.totals, { vouchers_count: 5, lines_count: 6, base_total: 510000, vat_total: 47500, total: 557500, advance_applied_total: 238000, cash_applied_total: 319500 });
  } finally {
    context.restore();
  }
});

test("summary por concepto usa el nombre del maestro y el codigo como respaldo", async () => {
  const context = setup();
  try {
    const report = await context.service.reportSummary("t-1", { group_by: "concept" });
    assert.deepEqual(report.rows.map((row) => row.label), ["Peajes", "MENSAJERIA", "Papeleria"]);
    const peajes = report.rows[0];
    assert.equal(peajes.concept_code, "PEAJE");
    assert.deepEqual(
      { lines_count: peajes.lines_count, base_total: peajes.base_total, vat_total: peajes.vat_total, total: peajes.total, advance_applied_total: peajes.advance_applied_total, cash_applied_total: peajes.cash_applied_total, vouchers_count: peajes.vouchers_count },
      { lines_count: 3, base_total: 330000, vat_total: 38000, total: 368000, advance_applied_total: 238000, cash_applied_total: 130000, vouchers_count: 3 }
    );
    const mensajeria = report.rows[1];
    assert.equal(mensajeria.concept_code, "MENSAJERIA");
    assert.deepEqual({ lines_count: mensajeria.lines_count, total: mensajeria.total, vouchers_count: mensajeria.vouchers_count }, { lines_count: 1, total: 80000, vouchers_count: 1 });
  } finally {
    context.restore();
  }
});

test("summary por proveedor agrupa Sin proveedor y prefiere la razon social", async () => {
  const context = setup();
  try {
    const report = await context.service.reportSummary("t-1", { group_by: "supplier" });
    assert.equal(report.rows.length, 2);
    const sinProveedor = report.rows[0];
    assert.equal(sinProveedor.supplier_party_id, null);
    assert.equal(sinProveedor.label, "Sin proveedor");
    assert.deepEqual({ lines_count: sinProveedor.lines_count, total: sinProveedor.total, vouchers_count: sinProveedor.vouchers_count }, { lines_count: 3, total: 368000, vouchers_count: 3 });
    const papeleria = report.rows[1];
    assert.equal(papeleria.supplier_party_id, 55);
    // custodianDisplayName prefiere legal_name: "Papeleria Andina SAS", no el nombre corto.
    assert.equal(papeleria.label, "Papeleria Andina SAS");
    assert.deepEqual({ lines_count: papeleria.lines_count, base_total: papeleria.base_total, vat_total: papeleria.vat_total, total: papeleria.total, vouchers_count: papeleria.vouchers_count }, { lines_count: 2, base_total: 130000, vat_total: 9500, total: 139500, vouchers_count: 2 });
  } finally {
    context.restore();
  }
});

test("summary por centro de costo etiqueta con el arbol organizacional", async () => {
  const context = setup();
  try {
    const report = await context.service.reportSummary("t-1", { group_by: "cost_center" });
    assert.deepEqual(report.rows.map((row) => row.label), ["Centro Bogota", "Sin centro de costo", "Centro Goliat"]);
    assert.deepEqual(report.rows.map((row) => row.cost_center_code), ["CC-10", null, "CC-20"]);
    assert.deepEqual(report.rows.map((row) => row.total), [238000, 189500, 80000]);
    const sinCentro = report.rows[1];
    assert.deepEqual({ lines_count: sinCentro.lines_count, base_total: sinCentro.base_total, vouchers_count: sinCentro.vouchers_count }, { lines_count: 3, base_total: 180000, vouchers_count: 2 });
  } finally {
    context.restore();
  }
});

test("summary por cuenta contable expone el nombre del plan de cuentas", async () => {
  const context = setup();
  try {
    const report = await context.service.reportSummary("t-1", { group_by: "account" });
    assert.equal(report.rows.length, 2);
    const viajes = report.rows[0];
    assert.equal(viajes.account_code, "519505");
    assert.equal(viajes.account_name, "Gastos de viaje");
    assert.equal(viajes.label, "519505 - Gastos de viaje");
    assert.deepEqual({ lines_count: viajes.lines_count, base_total: viajes.base_total, vat_total: viajes.vat_total, total: viajes.total, vouchers_count: viajes.vouchers_count }, { lines_count: 4, base_total: 410000, vat_total: 38000, total: 448000, vouchers_count: 4 });
    const papeleria = report.rows[1];
    assert.equal(papeleria.account_code, "519595");
    assert.equal(papeleria.account_name, "Utiles y papeleria");
    assert.equal(papeleria.total, 59500);
  } finally {
    context.restore();
  }
});

test("summary por mes ordena por periodo ascendente", async () => {
  const context = setup();
  try {
    const report = await context.service.reportSummary("t-1", { group_by: "month" });
    assert.deepEqual(report.rows.map((row) => row.period), ["2025-12", "2026-03", "2026-04"]);
    const march = report.rows[1];
    assert.deepEqual({ lines_count: march.lines_count, total: march.total, vouchers_count: march.vouchers_count }, { lines_count: 3, total: 397500, vouchers_count: 2 });
    const april = report.rows[2];
    assert.deepEqual({ lines_count: april.lines_count, total: april.total, vouchers_count: april.vouchers_count }, { lines_count: 1, total: 80000, vouchers_count: 1 });
    // v4 (anulado, 2026-03) no aparece: el reporte de gasto no suma comprobantes revertidos.
    assert.equal(report.totals.total, 507500);
  } finally {
    context.restore();
  }
});

test("summary filtra por box_id y por concepto normalizado a mayusculas", async () => {
  const context = setup();
  try {
    const byBox = await context.service.reportSummary("t-1", { box_id: "4" });
    assert.equal(byBox.rows.length, 1);
    assert.equal(byBox.rows[0].box_id, 4);
    assert.equal(byBox.rows[0].total, 80000);
    assert.equal(byBox.filters.box_id, 4);
    // concept_code llega en minusculas desde el querystring: upperCode lo normaliza antes del where.
    const byConcept = await context.service.reportSummary("t-1", { concept_code: "peaje" });
    assert.equal(byConcept.rows[0].total, 368000);
    assert.equal(byConcept.filters.concept_code, "PEAJE");
  } finally {
    context.restore();
  }
});

test("summary filtra por rango de fechas explicito", async () => {
  const context = setup();
  try {
    const report = await context.service.reportSummary("t-1", { date_from: "2026-01-01", date_to: "2026-03-31" });
    assert.equal(report.rows.length, 1);
    assert.equal(report.rows[0].box_id, 3);
    assert.deepEqual({ lines_count: report.rows[0].lines_count, total: report.rows[0].total, vouchers_count: report.rows[0].vouchers_count }, { lines_count: 3, total: 397500, vouchers_count: 2 });
  } finally {
    context.restore();
  }
});

test("summary resuelve box_code contra el maestro completo (incluye cajas inactivas)", async () => {
  const context = setup();
  try {
    const goliat = await context.service.reportSummary("t-1", { box_code: "goliat" });
    assert.equal(goliat.rows.length, 1);
    assert.equal(goliat.rows[0].box_id, 4);
    assert.equal(goliat.rows[0].total, 80000);
    assert.equal(goliat.filters.box_code, "GOLIAT");
    assert.equal(goliat.filters.box_id, null);

    const cm01 = await context.service.reportSummary("t-1", { box_code: "cm-01" });
    assert.equal(cm01.rows[0].box_id, 3);
    assert.equal(cm01.rows[0].total, 427500);
    assert.equal(cm01.filters.box_code, "CM-01");

    // Caja inactiva sin comprobantes: el codigo resuelve y el reporte llega vacio, sin error.
    const cerrada = await context.service.reportSummary("t-1", { box_code: "cerrada" });
    assert.equal(cerrada.rows.length, 0);
    assert.equal(cerrada.totals.total, 0);
    assert.equal(cerrada.filters.box_code, "CERRADA");

    await assertRejectsCode(context.service.reportSummary("t-1", { box_code: "NOPE" }), 400, "REPORT_FILTER_INVALID");
    await assertRejectsCode(context.service.reportSummary("t-1", { box_id: "3", box_code: "GOLIAT" }), 400, "REPORT_FILTER_INVALID");
  } finally {
    context.restore();
  }
});

test("summary rechaza combinaciones de filtros invalidas con 400 REPORT_FILTER_INVALID", async () => {
  const context = setup();
  try {
    await assertRejectsCode(context.service.reportSummary("t-1", { month: "3" }), 400, "REPORT_FILTER_INVALID");
    await assertRejectsCode(context.service.reportSummary("t-1", { year: "2026", month: "13" }), 400, "REPORT_FILTER_INVALID");
    await assertRejectsCode(context.service.reportSummary("t-1", { year: "abcd" }), 400, "REPORT_FILTER_INVALID");
    await assertRejectsCode(context.service.reportSummary("t-1", { group_by: "warehouse" }), 400, "REPORT_FILTER_INVALID");
    await assertRejectsCode(context.service.reportSummary("t-1", { box_id: "0" }), 400, "REPORT_FILTER_INVALID");
    await assertRejectsCode(context.service.reportSummary("t-1", { include_cancelled: "si" }), 400, "REPORT_FILTER_INVALID");
  } finally {
    context.restore();
  }
});

// === (C) reportDetail ===

test("detail devuelve lineas ordenadas por fecha desc con paginacion por defecto", async () => {
  const context = setup();
  try {
    const report = await context.service.reportDetail("t-1", {});
    assert.deepEqual(report.rows.map((row) => row.voucher_id), [3, 2, 2, 1, 5]);
    assert.deepEqual(report.pagination, { limit: 200, offset: 0, returned: 5, total: 5 });
    assert.deepEqual(report.totals, {
      vouchers_count: 4, lines_count: 5, base_total: 460000, vat_total: 47500,
      total: 507500, advance_applied_total: 238000, cash_applied_total: 269500
    });
    assert.deepEqual(report.filters, EMPTY_ECHO);
    assert.equal(report.truncated, false);
  } finally {
    context.restore();
  }
});

test("detail enriquece cada linea con maestros, arbol y estado del anticipo", async () => {
  const context = setup();
  try {
    const report = await context.service.reportDetail("t-1", {});
    // rows[0] = L14 (v3, 2026-04-02): concepto fuera de maestro, proveedor, CC-20.
    const first = report.rows[0];
    assert.equal(first.voucher_id, 3);
    assert.equal(first.line_number, 1);
    assert.equal(first.full_number, "GM-000003");
    assert.equal(first.status, "posted");
    assert.equal(first.period, "2026-04");
    assert.equal(first.date.toISOString(), "2026-04-02T00:00:00.000Z");
    assert.equal(first.voucher_description, "Mensajeria");
    assert.equal(first.advance_id, null);
    assert.equal(first.advance_full_number, null);
    assert.equal(first.advance_status, null);
    assert.equal(first.box_id, 4);
    assert.equal(first.box_code, "GOLIAT");
    assert.equal(first.box_name, "Caja Goliat");
    assert.equal(first.concept_code, "MENSAJERIA");
    assert.equal(first.concept_name, null);
    assert.equal(first.account_code, "519505");
    assert.equal(first.account_name, "Gastos de viaje");
    assert.equal(first.description, "Mensajeria domicilios");
    assert.equal(first.cost_center_code, "CC-20");
    assert.equal(first.cost_center_name, "Centro Goliat");
    assert.equal(first.branch_code, "B-02");
    assert.equal(first.supplier_party_id, 55);
    assert.equal(first.supplier_name, "Papeleria Andina SAS");
    assert.deepEqual(
      { base_amount: first.base_amount, vat_code: first.vat_code, vat_amount: first.vat_amount, total: first.total, advance_applied: first.advance_applied, cash_applied: first.cash_applied },
      { base_amount: 80000, vat_code: null, vat_amount: 0, total: 80000, advance_applied: 0, cash_applied: 80000 }
    );
    // rows[2] = L13 (v2): papeleria con IVA y referencia de factura.
    const papeleria = report.rows[2];
    assert.equal(papeleria.concept_code, "PAPELERIA");
    assert.equal(papeleria.concept_name, "Papeleria");
    assert.equal(papeleria.invoice_reference, "FE-123");
    assert.equal(papeleria.vat_code, "COMPRAS-19");
    assert.equal(papeleria.vat_percent, 19);
    assert.equal(papeleria.vat_amount, 9500);
    assert.equal(papeleria.supplier_party_id, 55);
    // rows[3] = L11 (v1): linea pagada con el anticipo AN-000021.
    const peaje = report.rows[3];
    assert.equal(peaje.full_number, "GM-000001");
    assert.equal(peaje.advance_id, 21);
    assert.equal(peaje.advance_full_number, "AN-000021");
    assert.equal(peaje.advance_status, "open");
    assert.equal(peaje.cost_center_code, "CC-10");
    assert.equal(peaje.cost_center_name, "Centro Bogota");
    assert.deepEqual({ total: peaje.total, advance_applied: peaje.advance_applied, cash_applied: peaje.cash_applied }, { total: 238000, advance_applied: 238000, cash_applied: 0 });
  } finally {
    context.restore();
  }
});

test("detail respeta include_cancelled y los filtros de concepto y proveedor", async () => {
  const context = setup();
  try {
    const withCancelled = await context.service.reportDetail("t-1", { include_cancelled: "true" });
    assert.equal(withCancelled.pagination.total, 6);
    assert.deepEqual(withCancelled.rows.map((row) => row.voucher_id), [3, 4, 2, 2, 1, 5]);

    const peaje = await context.service.reportDetail("t-1", { concept_code: "peaje" });
    assert.deepEqual(peaje.rows.map((row) => row.voucher_id), [2, 1, 5]);
    assert.equal(peaje.pagination.total, 3);

    const peajeCancelled = await context.service.reportDetail("t-1", { concept_code: "peaje", include_cancelled: "true" });
    // v4 (2026-03-20) ordena antes que v2 (2026-03-12) por fecha descendente.
    assert.deepEqual(peajeCancelled.rows.map((row) => row.voucher_id), [4, 2, 1, 5]);
    assert.equal(peajeCancelled.pagination.total, 4);

    const proveedor = await context.service.reportDetail("t-1", { supplier_party_id: "55" });
    assert.deepEqual(proveedor.rows.map((row) => row.voucher_id), [3, 2]);
    assert.equal(proveedor.filters.supplier_party_id, 55);
  } finally {
    context.restore();
  }
});

test("detail pagina sobre la ventana ordenada y sus totales resumen la ventana completa", async () => {
  const context = setup();
  try {
    const report = await context.service.reportDetail("t-1", { year: "2026", month: "3", date_from: "2026-03-10" });
    assert.deepEqual(report.rows.map((row) => row.voucher_id), [2, 2]);
    assert.equal(report.totals.total, 159500);
    assert.deepEqual(report.pagination, { limit: 200, offset: 0, returned: 2, total: 2 });

    const paged = await context.service.reportDetail("t-1", { year: "2026", month: "3", date_from: "2026-03-10", limit: "1", offset: "1" });
    assert.equal(paged.rows.length, 1);
    assert.equal(paged.rows[0].line_number, 2);
    assert.equal(paged.rows[0].invoice_reference, "FE-123");
    assert.deepEqual(paged.pagination, { limit: 1, offset: 1, returned: 1, total: 2 });
    // totals resume la ventana escaneada, no la pagina visible.
    assert.equal(paged.totals.total, 159500);
  } finally {
    context.restore();
  }
});

test("detail rechaza filtros invalidos con 400 REPORT_FILTER_INVALID", async () => {
  const context = setup();
  try {
    await assertRejectsCode(context.service.reportDetail("t-1", { date_from: "2026-05-01", date_to: "2026-04-01" }), 400, "REPORT_FILTER_INVALID");
    await assertRejectsCode(context.service.reportDetail("t-1", { supplier_party_id: "abc" }), 400, "REPORT_FILTER_INVALID");
    await assertRejectsCode(context.service.reportDetail("t-1", { year: "2026", month: "0" }), 400, "REPORT_FILTER_INVALID");
  } finally {
    context.restore();
  }
});

// === (D) reportBoxesRanking ===

test("ranking ordena cajas por gasto total desc con desglose por concepto", async () => {
  const context = setup();
  try {
    const report = await context.service.reportBoxesRanking("t-1", {});
    assert.equal(report.single_month, null);
    assert.equal(report.rows.length, 2);
    const bogota = report.rows[0];
    assert.deepEqual(bogota.box, { id: 3, code: "CM-01", name: "Caja menor Bogota", custodian_name: "Juan Perez SAS", monthly_limit: 1000000 });
    assert.deepEqual(
      {
        vouchers_count: bogota.vouchers_count, lines_count: bogota.lines_count,
        base_total: bogota.base_total, vat_total: bogota.vat_total, total: bogota.total,
        advance_applied_total: bogota.advance_applied_total, cash_applied_total: bogota.cash_applied_total
      },
      { vouchers_count: 3, lines_count: 4, base_total: 380000, vat_total: 47500, total: 427500, advance_applied_total: 238000, cash_applied_total: 189500 }
    );
    assert.equal(bogota.limit_month, null);
    assert.equal(bogota.limit_pct, null);
    assert.deepEqual(bogota.concepts.map((row) => row.concept_code), ["PEAJE", "PAPELERIA"]);
    const peaje = bogota.concepts[0];
    assert.equal(peaje.concept_name, "Peajes");
    assert.deepEqual(
      {
        vouchers_count: peaje.vouchers_count, lines_count: peaje.lines_count,
        base_total: peaje.base_total, vat_total: peaje.vat_total, total: peaje.total,
        advance_applied_total: peaje.advance_applied_total, cash_applied_total: peaje.cash_applied_total
      },
      { vouchers_count: 3, lines_count: 3, base_total: 330000, vat_total: 38000, total: 368000, advance_applied_total: 238000, cash_applied_total: 130000 }
    );
    const goliat = report.rows[1];
    assert.deepEqual(goliat.box, { id: 4, code: "GOLIAT", name: "Caja Goliat", custodian_name: "Maria Gomez", monthly_limit: null });
    assert.equal(goliat.limit_pct, null);
    assert.deepEqual(goliat.concepts.map((row) => row.concept_code), ["MENSAJERIA"]);
    assert.equal(goliat.concepts[0].concept_name, null);
    assert.equal(goliat.concepts[0].total, 80000);
    assert.deepEqual(report.totals, {
      vouchers_count: 4, lines_count: 5, base_total: 460000, vat_total: 47500,
      total: 507500, advance_applied_total: 238000, cash_applied_total: 269500
    });
    assert.deepEqual(report.filters, EMPTY_ECHO);
  } finally {
    context.restore();
  }
});

test("ranking con mes unico calcula el porcentaje contra el tope mensual", async () => {
  const context = setup();
  try {
    const report = await context.service.reportBoxesRanking("t-1", { year: "2026", month: "3" });
    assert.equal(report.single_month, "2026-03");
    assert.equal(report.rows.length, 1);
    const bogota = report.rows[0];
    assert.equal(bogota.total, 397500);
    assert.equal(bogota.limit_month, "2026-03");
    assert.equal(bogota.limit_pct, 39.75);
    assert.deepEqual(report.totals, { vouchers_count: 2, lines_count: 3, base_total: 350000, vat_total: 47500, total: 397500, advance_applied_total: 238000, cash_applied_total: 159500 });
    assert.deepEqual(bogota.concepts.map((row) => row.concept_code), ["PEAJE", "PAPELERIA"]);
    assert.deepEqual({ lines_count: bogota.concepts[0].lines_count, base_total: bogota.concepts[0].base_total, total: bogota.concepts[0].total }, { lines_count: 2, base_total: 300000, total: 338000 });
  } finally {
    context.restore();
  }
});

test("ranking en rango multi-mes no calcula porcentaje contra el tope de un solo mes", async () => {
  const context = setup();
  try {
    const yearOnly = await context.service.reportBoxesRanking("t-1", { year: "2026" });
    assert.equal(yearOnly.single_month, null);
    assert.equal(yearOnly.rows.length, 2);
    assert.equal(yearOnly.rows[0].limit_month, null);
    assert.equal(yearOnly.rows[0].limit_pct, null);
    // year+month con rango explicito: sigue siendo multi-mes para efectos del tope.
    const withRange = await context.service.reportBoxesRanking("t-1", { year: "2026", month: "3", date_from: "2026-03-10" });
    assert.equal(withRange.single_month, null);
    assert.equal(withRange.rows[0].limit_pct, null);
  } finally {
    context.restore();
  }
});

test("ranking rechaza filtros invalidos con 400 REPORT_FILTER_INVALID", async () => {
  const context = setup();
  try {
    await assertRejectsCode(context.service.reportBoxesRanking("t-1", { year: "189" }), 400, "REPORT_FILTER_INVALID");
    await assertRejectsCode(context.service.reportBoxesRanking("t-1", { month: "3" }), 400, "REPORT_FILTER_INVALID");
  } finally {
    context.restore();
  }
});

// === (E) Tope de filas ===

test("los reportes truncan en REPORT_ROW_CAP y piden tope+1 para detectarlo", async () => {
  // Dataset masivo: un comprobante 2026-05 con 20001 lineas de peaje (20001 x 10 = 200010).
  const vouchers = [
    voucherFixture({ id: 9, box_id: 3, advance_id: null, number: 9, full_number: "GM-000009", date: new Date("2026-05-01T00:00:00.000Z"), period: "2026-05", description: "Peaje masivo", subtotal: 200010, total: 200010 })
  ];
  const lines = [];
  for (let i = 0; i < 20001; i += 1) {
    lines.push(lineFixture({ id: 10000 + i, voucher_id: 9, line_number: i + 1, base_amount: 10, total: 10, description: "Peaje masivo" }));
  }
  const context = setup({ dataset: { ...reportDataset(), vouchers, lines } });
  try {
    const summary = await context.service.reportSummary("t-1", {});
    assert.equal(summary.truncated, true);
    assert.equal(summary.rows.length, 1);
    assert.equal(summary.rows[0].lines_count, pettyCash.REPORT_ROW_CAP);
    assert.equal(summary.rows[0].vouchers_count, 1);

    const detail = await context.service.reportDetail("t-1", {});
    assert.equal(detail.truncated, true);
    assert.deepEqual(detail.pagination, { limit: 200, offset: 0, returned: 200, total: pettyCash.REPORT_ROW_CAP });
    assert.equal(detail.rows[0].full_number, "GM-000009");

    const ranking = await context.service.reportBoxesRanking("t-1", {});
    assert.equal(ranking.truncated, true);
    assert.equal(ranking.rows[0].lines_count, pettyCash.REPORT_ROW_CAP);
    assert.equal(ranking.rows[0].concepts.length, 1);

    // Los tres reportes consultan con take = tope + 1: detectan truncamiento sin conteo extra.
    const lineCalls = context.calls.filter((call) => call.op === "pettyCashVoucherLine.findMany");
    assert.equal(lineCalls.length, 3);
    assert.ok(lineCalls.every((call) => call.take === pettyCash.REPORT_ROW_CAP + 1));
  } finally {
    context.restore();
  }
});

// === (F) Aislamiento por tenant ===

test("la reporteria aísla por tenant: cada empresa solo ve su historico", async () => {
  const context = setup({ dataset: mixedTenantDataset() });
  try {
    // t-1 ve exactamente sus cajas y sus totales: nada de t-2 se cuela en el scan.
    const t1 = await context.service.reportSummary("t-1", {});
    assert.deepEqual(t1.rows.map((row) => row.box_id), [3, 4]);
    assert.deepEqual(t1.totals, {
      vouchers_count: 4, lines_count: 5, base_total: 460000, vat_total: 47500,
      total: 507500, advance_applied_total: 238000, cash_applied_total: 269500
    });

    // t-2 solo ve su propia caja con el contrato completo de fila del summary.
    const t2 = await context.service.reportSummary("t-2", {});
    assert.equal(t2.rows.length, 1);
    const otra = t2.rows[0];
    assert.equal(otra.box_id, 6);
    assert.equal(otra.box_code, "CM-01");
    assert.equal(otra.label, "CM-01 - Caja menor Cali");
    assert.deepEqual(Object.keys(otra), [
      "box_id", "box_code", "label", "vouchers_count", "lines_count",
      "base_total", "vat_total", "total", "advance_applied_total", "cash_applied_total"
    ]);
    assert.deepEqual(t2.totals, {
      vouchers_count: 1, lines_count: 1, base_total: 50000, vat_total: 9500,
      total: 59500, advance_applied_total: 0, cash_applied_total: 59500
    });

    // CM-01 existe en ambas empresas: cada tenant resuelve SU caja (findFirst con tenant).
    const t1cm = await context.service.reportSummary("t-1", { box_code: "cm-01" });
    assert.equal(t1cm.rows.length, 1);
    assert.equal(t1cm.rows[0].box_id, 3);
    assert.equal(t1cm.rows[0].total, 427500);
    const t2cm = await context.service.reportSummary("t-2", { box_code: "cm-01" });
    assert.equal(t2cm.rows.length, 1);
    assert.equal(t2cm.rows[0].box_id, 6);
    assert.equal(t2cm.rows[0].total, 59500);

    // Detalle de t-2: los maestros de t-1 (concepto, cuenta) no etiquetan su historico.
    const t2detail = await context.service.reportDetail("t-2", {});
    assert.equal(t2detail.pagination.total, 1);
    const row = t2detail.rows[0];
    assert.equal(row.voucher_id, 21);
    assert.equal(row.full_number, "GM-000101");
    assert.equal(row.box_code, "CM-01");
    assert.equal(row.box_name, "Caja menor Cali");
    assert.equal(row.concept_code, "PEAJE");
    assert.equal(row.concept_name, null);
    assert.equal(row.account_code, "519505");
    assert.equal(row.account_name, null);
    assert.equal(row.supplier_party_id, null);

    // Ranking de t-2: una sola caja y el desglose por concepto sin nombre de maestro ajeno.
    const t2ranking = await context.service.reportBoxesRanking("t-2", {});
    assert.equal(t2ranking.rows.length, 1);
    assert.deepEqual(t2ranking.rows[0].box, { id: 6, code: "CM-01", name: "Caja menor Cali", custodian_name: "Cali SAS", monthly_limit: null });
    assert.equal(t2ranking.rows[0].concepts[0].concept_code, "PEAJE");
    assert.equal(t2ranking.rows[0].concepts[0].concept_name, null);
    assert.equal(t2ranking.rows[0].total, 59500);

    // El servicio nunca filtra por tenant a mano: delega el aislamiento al middleware via
    // runWithTenant (ningun where crudo lleva tenant_id, ni en la raiz ni en la relacion).
    const lineCalls = context.calls.filter((call) => call.op === "pettyCashVoucherLine.findMany");
    assert.equal(lineCalls.length, 6);
    for (const call of context.calls) {
      if (!call.where) continue;
      assert.ok(!("tenant_id" in call.where), "el where del servicio no debe filtrar tenant a mano");
      if (call.where.voucher) assert.ok(!("tenant_id" in call.where.voucher));
    }
  } finally {
    context.restore();
  }
});

// === (G) Estado del anticipo: el campo status, nunca el saldo ===

test("el detalle lee el estado del anticipo del campo status, nunca del saldo", async () => {
  // AN-000022 quedo LIQUIDADO con saldo 300000 (la liquidacion preserva el invariante
  // balance = amount - applied_total): derivar el estado del saldo diria "open" y mentiria.
  const base = reportDataset();
  const context = setup({
    dataset: {
      ...base,
      advances: [...base.advances, ADVANCE_LIQUIDATED],
      vouchers: [
        ...base.vouchers,
        voucherFixture({
          id: 6, box_id: 3, advance_id: 22, number: 6, full_number: "GM-000006",
          date: new Date("2026-04-20T00:00:00.000Z"), period: "2026-04", description: "Gira regional",
          subtotal: 50000, total: 50000
        })
      ],
      lines: [
        ...base.lines,
        lineFixture({ id: 18, voucher_id: 6, line_number: 1, base_amount: 50000, total: 50000, advance_applied: 50000, description: "Peajes gira regional" })
      ]
    }
  });
  try {
    const report = await context.service.reportDetail("t-1", {});
    assert.deepEqual(report.rows.map((row) => row.voucher_id), [6, 3, 2, 2, 1, 5]);
    assert.deepEqual(report.pagination, { limit: 200, offset: 0, returned: 6, total: 6 });

    // Contrato de fila del detalle: los 31 campos literales que consume la pantalla de T7.
    assert.deepEqual(Object.keys(report.rows[0]), [
      "voucher_id", "line_number", "date", "full_number", "status", "period", "voucher_description",
      "advance_id", "advance_full_number", "advance_status",
      "box_id", "box_code", "box_name", "concept_code", "concept_name", "account_code", "account_name",
      "description", "cost_center_code", "cost_center_name", "branch_code",
      "supplier_party_id", "supplier_name", "invoice_reference",
      "base_amount", "vat_code", "vat_percent", "vat_amount", "total", "advance_applied", "cash_applied"
    ]);

    // La linea de la gira regional se pago con el anticipo liquidado (saldo 300000).
    const liquidado = report.rows[0];
    assert.equal(liquidado.advance_id, 22);
    assert.equal(liquidado.advance_full_number, "AN-000022");
    assert.equal(liquidado.advance_status, "liquidated");
    assert.deepEqual(
      { total: liquidado.total, advance_applied: liquidado.advance_applied, cash_applied: liquidado.cash_applied },
      { total: 50000, advance_applied: 50000, cash_applied: 0 }
    );

    // AN-000021 sigue abierto pese a su saldo parcial (62000): status "open".
    const abierto = report.rows[4];
    assert.equal(abierto.advance_id, 21);
    assert.equal(abierto.advance_full_number, "AN-000021");
    assert.equal(abierto.advance_status, "open");

    // Resolucion por lotes: una sola consulta de anticipos con select id/full_number/status.
    // El saldo (amount/balance/applied_total) ni se consulta.
    const advanceCalls = context.calls.filter((call) => call.op === "pettyCashAdvance.findMany");
    assert.equal(advanceCalls.length, 1);
    assert.deepEqual([...advanceCalls[0].where.id.in].sort((a, b) => a - b), [21, 22]);
    assert.deepEqual(advanceCalls[0].select, { id: true, full_number: true, status: true });
    assert.deepEqual(Object.keys(advanceCalls[0].where), ["id"]);
  } finally {
    context.restore();
  }
});

// === (H) Contrato de rutas y de fuente ===

test("routes registra los tres reportes GET con permiso read de contabilidad", () => {
  const source = fs.readFileSync(require.resolve("../src/modules/petty-cash/routes"), "utf8");
  // El permiso es el mismo read de contabilidad que el resto del modulo.
  assert.match(source, /const read = requirePermission\("accounting", "read"\)/);

  const reportLines = source.split("\n").filter((line) => line.includes("/petty-cash/reports/"));
  assert.equal(reportLines.length, 3);
  const expected = [
    ["summary", "reportSummary"],
    ["detail", "reportDetail"],
    ["boxes-ranking", "reportBoxesRanking"]
  ];
  for (const [endpoint, handler] of expected) {
    const line = reportLines.find((content) => content.includes(`/petty-cash/reports/${endpoint}`));
    assert.ok(line, `falta la ruta /petty-cash/reports/${endpoint}`);
    assert.match(line, new RegExp(`fastify\\.get\\("/petty-cash/reports/${endpoint}", \\{ preHandler: read \\}`));
    // Cada reporte recibe el tenant del usuario autenticado y el querystring crudo.
    assert.match(line, new RegExp(`service\\.${handler}\\(request\\.user\\?\\.tenant_id, request\\.query\\)`));
    // Sin esquema de querystring: la validacion vive en el servicio (REPORT_FILTER_INVALID).
    assert.doesNotMatch(line, /schema\s*:/);
  }

  // El modulo completo mantiene sus 24 rutas y ninguna de borrado.
  assert.equal((source.match(/fastify\.(get|post|put|patch|delete)\(/g) || []).length, 24);
  assert.doesNotMatch(source, /fastify\.delete\(/);
});

test("la reporteria de T4 usa solo el constructor de consultas de Prisma dentro de runWithTenant", () => {
  const source = fs.readFileSync(require.resolve("../src/modules/petty-cash/service"), "utf8");
  // El corte evita el lockBox de T3, que si usa SQL crudo legitimamente (antes del marcador).
  const marker = source.indexOf("=== T4: reporter");
  assert.ok(marker > 0, "falta el marcador de la seccion T4");
  // Sin comentarios: la cabecera de T4 menciona $queryRaw precisamente para explicar que NO se usa.
  const t4 = source.slice(marker).replace(/\/\/[^\n]*/g, "");
  for (const forbidden of ["$queryRaw", "$queryRawUnsafe", "$queryRawTyped", "$executeRaw", "$executeRawUnsafe"]) {
    assert.equal(t4.includes(forbidden), false, `la reporteria no debe usar ${forbidden}`);
  }
  // Aislamiento explicito: los tres reportes envuelven su scan en runWithTenant con el tenantId recibido.
  assert.equal((t4.match(/prisma\.runWithTenant\(tenantId/g) || []).length, 3);
  assert.match(t4, /take: REPORT_ROW_CAP \+ 1/);
});
