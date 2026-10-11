const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

process.env.DISABLE_REDIS = "true";

// Contabilidad real: solo se reutilizan sus helpers puros y la reserva canonica de numeracion.
// getVatMasters / getOrganizationTree / assertPeriodOpen si se falsifican (leen cache de tenant).
const realAccounting = require("../src/modules/accounting/service");
// Instancia real del modulo (sin base de datos) para probar helpers puros de T3.
const pettyCash = require("../src/modules/petty-cash/service");
const schema = require("../src/modules/petty-cash/schema");

// === Fixtures ===

const EXPENSE_ACCOUNT = { id: 501, code: "519505", name: "Gastos de viaje", type: "expense", active: true, allows_tx: true };
const STATIONERY_ACCOUNT = { id: 502, code: "519595", name: "Utiles y papeleria", type: "expense", active: true, allows_tx: true };
const CASH_ACCOUNT = { id: 101, code: "110505", name: "Caja menor", type: "asset", active: true, allows_tx: true };
const ADVANCE_ACCOUNT = { id: 130, code: "133001", name: "Anticipos a terceros", type: "asset", active: true, allows_tx: true };
const VAT_ACCOUNT = { id: 240, code: "2408", name: "IVA descontable", type: "liability", active: true, allows_tx: true };
const ALL_ACCOUNTS = [EXPENSE_ACCOUNT, STATIONERY_ACCOUNT, CASH_ACCOUNT, ADVANCE_ACCOUNT, VAT_ACCOUNT];

const CUSTODIAN = { id: 77, name: "Juan Perez", legal_name: "Juan Perez SAS", type: "employee", active: true, metadata: {} };
const SUPPLIER = { id: 55, name: "Papeleria Andina", legal_name: "Papeleria Andina SAS", type: "supplier", active: true, tax_id: "900123456", metadata: {} };
const CUSTOMER = { id: 88, name: "Cliente Final", type: "customer", active: true, metadata: {} };
const INACTIVE_SUPPLIER = { id: 56, name: "Proveedor Inactivo", type: "supplier", active: false, metadata: {} };

const CONCEPT_TRAVEL = {
  id: 5, tenant_id: "t-1", code: "PEAJE", name: "Peajes", account_code: "519505",
  advance_account_code: null, default_vat_code: "COMPRAS-19",
  requires_supplier: false, requires_invoice_reference: false, active: true
};
const CONCEPT_STATIONERY = {
  id: 6, tenant_id: "t-1", code: "PAPELERIA", name: "Papeleria", account_code: "519595",
  advance_account_code: null, default_vat_code: null,
  requires_supplier: true, requires_invoice_reference: true, active: true
};
const CONCEPT_INACTIVE = { id: 7, tenant_id: "t-1", code: "VIEJO", name: "Concepto retirado", account_code: "519505", active: false };

function boxFixture(overrides = {}) {
  return {
    id: 3, tenant_id: "t-1", code: "CM-01", name: "Caja menor Bogota", active: true,
    account_code: "110505", account_id: 101, advance_account_code: "133001",
    custodian_party_id: 77, custodian_name: "Juan Perez SAS",
    branch_code: "B-01", cost_center_code: "CC-10",
    monthly_limit: null, require_advance: false, block_unliquidated_advance: false,
    notes: null, created_by: 9,
    created_at: new Date("2026-01-05T10:00:00.000Z"), updated_at: new Date("2026-01-05T10:00:00.000Z"),
    ...overrides
  };
}

function advanceFixture(overrides = {}) {
  return {
    id: 21, tenant_id: "t-1", box_id: 3, document_type: "APC", number: 1, full_number: "APC-000001",
    date: new Date("2026-03-02T00:00:00.000Z"), custodian_party_id: 77, custodian_name: "Juan Perez SAS",
    amount: 500, applied_total: 0, balance: 500, status: "open", description: null,
    accounting_document_id: 900, reversal_accounting_document_id: null, liquidated_at: null,
    refund_amount: 0, shortfall_amount: 0, created_by: 9,
    created_at: new Date("2026-03-02T10:00:00.000Z"), updated_at: new Date("2026-03-02T10:00:00.000Z"),
    ...overrides
  };
}

// Documento contable del anticipo de la fixture (id 900) con sus dos lineas: se reutiliza en las
// pruebas de lectura y de anulacion para no repetir el literal.
function apcCabdocFixture(overrides = {}) {
  return {
    id: 900, tenant_id: "t-1", document_type: "APC", document_number: 1, full_number: "APC-000001",
    reference: null, referenced_document_id: null, posting_date: new Date("2026-03-02T00:00:00.000Z"),
    header_text: "APC APC-000001 - Anticipo caja menor CM-01", society_code: "SOC-01", status: "posted",
    is_reversal: false, is_cancelled: false, cancelled_by: null, cancelled_at: null,
    total_debit: 500, total_credit: 500, created_by: 9,
    created_at: new Date("2026-03-02T10:00:00.000Z"), updated_at: new Date("2026-03-02T10:00:00.000Z"),
    ...overrides
  };
}

function apcCuedocFixture() {
  return [
    { id: 700, cabdoc_id: 900, line_no: 1, account_id: 130, account_code: "133001", branch_code: "B-01", cost_center_code: "CC-10", party_id: 77, party_tax_id: null, movement: "debit", debit: 500, credit: 0, description: "Anticipo caja menor CM-01", tax_type: null, tax_code: null, tax_base: 0, tax_rate: 0, tax_amount: 0, ledger_entry_id: 800 },
    { id: 701, cabdoc_id: 900, line_no: 2, account_id: 101, account_code: "110505", branch_code: "B-01", cost_center_code: "CC-10", party_id: 77, party_tax_id: null, movement: "credit", debit: 0, credit: 500, description: "Giro de anticipo", tax_type: null, tax_code: null, tax_base: 0, tax_rate: 0, tax_amount: 0, ledger_entry_id: 801 }
  ];
}

const VAT_MASTERS = [
  { code: "COMPRAS-19", concept: "IVA compras 19%", percent: 19, account_code: "2408", scope: "purchases", active: true },
  { code: "COMPRAS-5", concept: "IVA compras 5%", percent: 5, account_code: "2408", scope: "purchases", active: true },
  { code: "COMPRAS-0", concept: "Exento", percent: 0, account_code: "2408", scope: "purchases", active: true },
  { code: "COMPRAS-RETIRED", concept: "Retirado", percent: 19, account_code: "2408", scope: "purchases", active: false }
];

const ORG_TREE = {
  societies: [{ code: "SOC-01", name: "Sociedad principal", active: true }],
  branches: [{ code: "B-01", name: "Bogota", society_code: "SOC-01", active: true }],
  cost_centers: [{ code: "CC-10", name: "Operaciones", branch_code: "B-01", society_code: "SOC-01", active: true }]
};

// === Base de datos falsa en memoria (con rollback de transaccion) ===

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
        // metadata: { path: ["role_flags","supplier"], equals: true }
        case "path": {
          const value = (operand || []).reduce((cursor, key) => (cursor === null || cursor === undefined ? undefined : cursor[key]), actual);
          return sameValue(value, expected.equals);
        }
        default: return sameValue(actual, operand);
      }
    });
  }
  return sameValue(actual, expected);
}

function matchesWhere(row, where = {}) {
  return Object.entries(where || {}).every(([key, expected]) => {
    if (key === "__includeInactive") return true;
    if (key === "AND") return (expected || []).every((clause) => matchesWhere(row, clause));
    if (key === "OR") return (expected || []).some((clause) => matchesWhere(row, clause));
    if (key === "lines") return matchesRelation(row, expected);
    return matchField(row[key], expected);
  });
}

// Filtro relacional usado por listVouchers (concept_code -> lines: { some: { concept_code } }).
let relationResolver = () => [];
function matchesRelation(row, expected = {}) {
  const children = relationResolver(row);
  if (expected.some) return children.some((child) => matchesWhere(child, expected.some));
  if (expected.every) return children.every((child) => matchesWhere(child, expected.every));
  if (expected.none) return !children.some((child) => matchesWhere(child, expected.none));
  return true;
}

function applyOrderBy(rows, orderBy) {
  if (!orderBy) return rows;
  const criteria = Array.isArray(orderBy) ? orderBy : [orderBy];
  return [...rows].sort((a, b) => {
    for (const criterion of criteria) {
      const [field, direction] = Object.entries(criterion)[0];
      const left = a[field];
      const right = b[field];
      const comparable = (value) => (value instanceof Date ? value.getTime() : value);
      if (comparable(left) === comparable(right)) continue;
      const greater = comparable(left) > comparable(right) ? 1 : -1;
      return direction === "desc" ? -greater : greater;
    }
    return 0;
  });
}

function applyData(row, data = {}) {
  for (const [key, value] of Object.entries(data)) {
    if (isFilterObject(value) && !Array.isArray(value)) {
      if ("increment" in value) { row[key] = Number(row[key] || 0) + Number(value.increment); continue; }
      if ("decrement" in value) { row[key] = Number(row[key] || 0) - Number(value.decrement); continue; }
      if ("set" in value) { row[key] = value.set; continue; }
    }
    row[key] = value;
  }
  return row;
}

function aggregateRows(rows, where, args = {}) {
  const matched = rows.filter((row) => matchesWhere(row, where));
  const result = {};
  for (const [kind, fields] of Object.entries(args)) {
    if (!fields || typeof fields !== "object") continue;
    result[kind] = {};
    for (const field of Object.keys(fields)) {
      const values = matched.map((row) => Number(row[field] || 0));
      if (kind === "_sum") result[kind][field] = values.reduce((sum, value) => sum + value, 0);
      if (kind === "_max") result[kind][field] = matched.length ? Math.max(...values) : null;
      if (kind === "_min") result[kind][field] = matched.length ? Math.min(...values) : null;
      if (kind === "_avg") result[kind][field] = matched.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
    }
  }
  if (args._count) result._count = matched.length;
  return result;
}

function nextId(rows) {
  return rows.reduce((max, row) => Math.max(max, Number(row.id) || 0), 0) + 1;
}

function createHarness(initial = {}) {
  const store = {
    accounts: initial.accounts ? [...initial.accounts] : [...ALL_ACCOUNTS],
    parties: initial.parties ? [...initial.parties] : [CUSTODIAN, SUPPLIER, CUSTOMER, INACTIVE_SUPPLIER],
    concepts: initial.concepts ? [...initial.concepts] : [CONCEPT_TRAVEL, CONCEPT_STATIONERY, CONCEPT_INACTIVE],
    boxes: initial.boxes ? [...initial.boxes] : [boxFixture()],
    advances: initial.advances ? [...initial.advances] : [],
    vouchers: initial.vouchers ? [...initial.vouchers] : [],
    lines: initial.lines ? [...initial.lines] : [],
    cabdocs: initial.cabdocs ? [...initial.cabdocs] : [],
    cuedocs: initial.cuedocs ? [...initial.cuedocs] : [],
    ledgers: initial.ledgers ? [...initial.ledgers] : [],
    config: initial.config ? structuredClone(initial.config) : { accounting: { accounting_numbering: {} } }
  };
  const calls = [];
  const failures = new Map();
  const txOptionsSeen = [];

  relationResolver = (row) => store.lines.filter((line) => line.voucher_id === row.id);

  const record = (op, payload) => { calls.push({ op, ...payload }); };
  const guard = (op) => {
    const failure = failures.get(op);
    if (failure) throw failure;
  };

  function select(row, args) {
    if (!row) return row;
    if (args?.select) {
      const projection = {};
      for (const field of Object.keys(args.select)) projection[field] = row[field];
      return projection;
    }
    return { ...row };
  }

  function attachAdvance(row, args) {
    const out = { ...row };
    const include = args?.include || {};
    if (include.box) out.box = store.boxes.find((box) => box.id === row.box_id) || null;
    if (include.vouchers) {
      const vouchers = store.vouchers.filter((voucher) => voucher.advance_id === row.id);
      out.vouchers = applyOrderBy(vouchers, include.vouchers?.orderBy).map((voucher) => {
        const copy = { ...voucher };
        if (include.vouchers?.include?.lines) {
          copy.lines = applyOrderBy(store.lines.filter((line) => line.voucher_id === voucher.id), include.vouchers.include.lines.orderBy);
        }
        return copy;
      });
    }
    if (args?._count?.select?.vouchers) out._count = { vouchers: store.vouchers.filter((voucher) => voucher.advance_id === row.id).length };
    return out;
  }

  function attachVoucher(row, args) {
    const out = { ...row };
    const include = args?.include || {};
    if (include.box) out.box = store.boxes.find((box) => box.id === row.box_id) || null;
    if (include.advance) out.advance = store.advances.find((advance) => advance.id === row.advance_id) || null;
    if (include.lines) out.lines = applyOrderBy(store.lines.filter((line) => line.voucher_id === row.id), include.lines.orderBy).map((line) => ({ ...line }));
    if (args?._count?.select?.lines) out._count = { lines: store.lines.filter((line) => line.voucher_id === row.id).length };
    return out;
  }

  function attachCabdoc(row, args) {
    const out = { ...row };
    if (args?.include?.lines) {
      out.lines = applyOrderBy(store.cuedocs.filter((line) => line.cabdoc_id === row.id), args.include.lines.orderBy).map((line) => ({ ...line }));
    }
    return out;
  }

  const db = {
    calls,
    failures,
    txOptionsSeen,
    store,
    runWithTenant: (_tenantId, callback) => callback(),
    $executeRawUnsafe: async (sql, ...args) => { record("$executeRawUnsafe", { sql, args }); return 1; },
    $transaction: async (callback, options) => {
      txOptionsSeen.push(options);
      record("$transaction", { options });
      // Snapshot/restore: simula el rollback real de Prisma para poder afirmar "sin huerfanos".
      const snapshot = structuredClone(store);
      try {
        return await callback(db);
      } catch (error) {
        for (const key of Object.keys(snapshot)) {
          if (Array.isArray(store[key])) { store[key].length = 0; store[key].push(...snapshot[key]); } else store[key] = snapshot[key];
        }
        throw error;
      }
    },
    tenant: {
      findUnique: async (args) => { record("tenant.findUnique", { args }); guard("tenant.findUnique"); return select(store.boxes.length ? { id: "t-1", config: store.config } : null, args); },
      update: async (args) => { record("tenant.update", { args }); guard("tenant.update"); store.config = args.data.config; return { id: "t-1", config: store.config }; }
    },
    account: {
      findFirst: async (args) => { record("account.findFirst", { where: args.where }); guard("account.findFirst"); return store.accounts.find((row) => matchesWhere(row, args.where)) || null; },
      findMany: async (args) => { record("account.findMany", { where: args.where }); guard("account.findMany"); return store.accounts.filter((row) => matchesWhere(row, args.where)).map((row) => ({ ...row })); }
    },
    party: {
      findFirst: async (args) => { record("party.findFirst", { where: args.where }); guard("party.findFirst"); return select(store.parties.find((row) => matchesWhere(row, args.where)) || null, args); },
      findMany: async (args) => { record("party.findMany", { where: args.where }); guard("party.findMany"); return store.parties.filter((row) => matchesWhere(row, args.where)).map((row) => select(row, args)); }
    },
    pettyCashConcept: {
      findFirst: async (args) => { record("pettyCashConcept.findFirst", { where: args.where }); guard("pettyCashConcept.findFirst"); return store.concepts.find((row) => matchesWhere(row, args.where)) || null; }
    },
    pettyCashBox: {
      findFirst: async (args) => { record("pettyCashBox.findFirst", { where: args.where }); guard("pettyCashBox.findFirst"); return store.boxes.find((row) => matchesWhere(row, args.where)) || null; }
    },
    pettyCashAdvance: {
      findFirst: async (args) => {
        record("pettyCashAdvance.findFirst", { where: args.where, include: args.include });
        guard("pettyCashAdvance.findFirst");
        const row = applyOrderBy(store.advances.filter((item) => matchesWhere(item, args.where)), args.orderBy)[0];
        return row ? attachAdvance(row, args) : null;
      },
      findMany: async (args) => {
        record("pettyCashAdvance.findMany", { where: args.where, include: args.include, orderBy: args.orderBy, take: args.take, skip: args.skip });
        guard("pettyCashAdvance.findMany");
        const rows = applyOrderBy(store.advances.filter((item) => matchesWhere(item, args.where)), args.orderBy);
        return rows.slice(args.skip || 0, (args.skip || 0) + (args.take || rows.length)).map((row) => attachAdvance(row, args));
      },
      create: async (args) => {
        record("pettyCashAdvance.create", { data: args.data });
        guard("pettyCashAdvance.create");
        const created = { id: nextId(store.advances), tenant_id: "t-1", created_at: new Date("2026-03-02T10:00:00.000Z"), updated_at: new Date("2026-03-02T10:00:00.000Z"), ...args.data };
        store.advances.push(created);
        return { ...created };
      },
      updateMany: async (args) => {
        record("pettyCashAdvance.updateMany", { where: args.where, data: args.data });
        guard("pettyCashAdvance.updateMany");
        const matched = store.advances.filter((row) => matchesWhere(row, args.where));
        matched.forEach((row) => applyData(row, args.data));
        return { count: matched.length };
      },
      aggregate: async (args) => { record("pettyCashAdvance.aggregate", { where: args.where }); guard("pettyCashAdvance.aggregate"); return aggregateRows(store.advances, args.where, args); }
    },
    pettyCashVoucher: {
      findFirst: async (args) => {
        record("pettyCashVoucher.findFirst", { where: args.where, include: args.include });
        guard("pettyCashVoucher.findFirst");
        const row = applyOrderBy(store.vouchers.filter((item) => matchesWhere(item, args.where)), args.orderBy)[0];
        return row ? attachVoucher(row, args) : null;
      },
      findMany: async (args) => {
        record("pettyCashVoucher.findMany", { where: args.where, orderBy: args.orderBy, take: args.take, skip: args.skip });
        guard("pettyCashVoucher.findMany");
        const rows = applyOrderBy(store.vouchers.filter((item) => matchesWhere(item, args.where)), args.orderBy);
        return rows.slice(args.skip || 0, (args.skip || 0) + (args.take || rows.length)).map((row) => attachVoucher(row, args));
      },
      create: async (args) => {
        record("pettyCashVoucher.create", { data: args.data });
        guard("pettyCashVoucher.create");
        const created = { id: nextId(store.vouchers), tenant_id: "t-1", created_at: new Date("2026-03-03T10:00:00.000Z"), updated_at: new Date("2026-03-03T10:00:00.000Z"), ...args.data };
        store.vouchers.push(created);
        return { ...created };
      },
      updateMany: async (args) => {
        record("pettyCashVoucher.updateMany", { where: args.where, data: args.data });
        guard("pettyCashVoucher.updateMany");
        const matched = store.vouchers.filter((row) => matchesWhere(row, args.where));
        matched.forEach((row) => applyData(row, args.data));
        return { count: matched.length };
      },
      count: async (args) => { record("pettyCashVoucher.count", { where: args.where }); guard("pettyCashVoucher.count"); return store.vouchers.filter((row) => matchesWhere(row, args.where)).length; }
    },
    pettyCashVoucherLine: {
      createMany: async (args) => {
        record("pettyCashVoucherLine.createMany", { data: args.data });
        guard("pettyCashVoucherLine.createMany");
        const created = args.data.map((row) => ({ id: nextId(store.lines), tenant_id: "t-1", created_at: new Date("2026-03-03T10:00:00.000Z"), updated_at: new Date("2026-03-03T10:00:00.000Z"), ...row }));
        created.forEach((row) => { row.id = nextId(store.lines); store.lines.push(row); });
        return { count: created.length };
      },
      findMany: async (args) => { record("pettyCashVoucherLine.findMany", { where: args.where }); guard("pettyCashVoucherLine.findMany"); return store.lines.filter((row) => matchesWhere(row, args.where)).map((row) => ({ ...row })); }
    },
    cntCabdoc: {
      create: async (args) => {
        record("cntCabdoc.create", { data: args.data });
        guard("cntCabdoc.create");
        const created = {
          id: nextId(store.cabdocs), tenant_id: "t-1", status: "posted", is_cancelled: false,
          cancelled_by: null, cancelled_at: null, created_at: new Date("2026-03-03T10:00:00.000Z"), ...args.data
        };
        store.cabdocs.push(created);
        return { ...created };
      },
      findFirst: async (args) => {
        record("cntCabdoc.findFirst", { where: args.where });
        guard("cntCabdoc.findFirst");
        const row = store.cabdocs.find((item) => matchesWhere(item, args.where));
        return row ? attachCabdoc(row, args) : null;
      },
      update: async (args) => {
        record("cntCabdoc.update", { where: args.where, data: args.data });
        guard("cntCabdoc.update");
        const row = store.cabdocs.find((item) => matchesWhere(item, args.where));
        return row ? applyData(row, args.data) : null;
      },
      aggregate: async (args) => { record("cntCabdoc.aggregate", { where: args.where }); guard("cntCabdoc.aggregate"); return aggregateRows(store.cabdocs, args.where, args); }
    },
    cntCuedoc: {
      create: async (args) => {
        record("cntCuedoc.create", { data: args.data });
        guard("cntCuedoc.create");
        const created = { id: nextId(store.cuedocs), tenant_id: "t-1", ...args.data };
        store.cuedocs.push(created);
        return { ...created };
      },
      findMany: async (args) => { record("cntCuedoc.findMany", { where: args.where }); guard("cntCuedoc.findMany"); return store.cuedocs.filter((row) => matchesWhere(row, args.where)).map((row) => ({ ...row })); }
    },
    ledgerEntry: {
      create: async (args) => {
        record("ledgerEntry.create", { data: args.data });
        guard("ledgerEntry.create");
        const created = { id: nextId(store.ledgers), tenant_id: "t-1", ...args.data };
        store.ledgers.push(created);
        return { ...created };
      },
      findMany: async (args) => { record("ledgerEntry.findMany", { where: args.where }); guard("ledgerEntry.findMany"); return store.ledgers.filter((row) => matchesWhere(row, args.where)).map((row) => ({ ...row })); }
    }
  };
  return { store, calls, failures, txOptionsSeen, db };
}

function fakeAccounting(harness, { vatMasters = VAT_MASTERS, tree = ORG_TREE, closedPeriods = [] } = {}) {
  return {
    // Helpers puros y numeracion: los REALES (misma implementacion que usa el servicio en produccion).
    DEFAULT_ACCOUNTING_DOCUMENT_TYPES: realAccounting.DEFAULT_ACCOUNTING_DOCUMENT_TYPES,
    normalizeAccountingDocumentType: realAccounting.normalizeAccountingDocumentType,
    mergeNumbering: realAccounting.mergeNumbering,
    reserveAccountingDocumentNumber: realAccounting.reserveAccountingDocumentNumber,
    periodFromDate: realAccounting.periodFromDate,
    periodBounds: realAccounting.periodBounds,
    getVatMasters: async (_tenantId, scope = "purchases") => {
      harness.calls.push({ op: "accounting.getVatMasters", scope });
      return vatMasters.filter((row) => (row.scope || "purchases") === scope);
    },
    getOrganizationTree: async (tenantId) => {
      harness.calls.push({ op: "accounting.getOrganizationTree", tenantId });
      return tree;
    },
    assertPeriodOpen: async (_tenantId, date) => {
      const period = realAccounting.periodFromDate(date);
      harness.calls.push({ op: "accounting.assertPeriodOpen", period });
      if (closedPeriods.includes(period)) {
        const error = new Error(`El periodo contable ${period} esta cerrado`);
        error.statusCode = 423;
        error.code = "PERIOD_CLOSED";
        throw error;
      }
    }
  };
}

function loadPettyCashService(prisma, accountingModule) {
  const prismaPath = require.resolve("../src/core/prisma");
  const accountingPath = require.resolve("../src/modules/accounting/service");
  const servicePath = require.resolve("../src/modules/petty-cash/service");
  const previous = { prisma: require.cache[prismaPath], accounting: require.cache[accountingPath], service: require.cache[servicePath] };
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

// Construye el entorno de prueba: harness + servicio con prisma/accounting falsos.
function setup(initial = {}, accountingOptions = {}) {
  const harness = createHarness(initial);
  const loaded = loadPettyCashService(harness.db, fakeAccounting(harness, accountingOptions));
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

function postedDocuments(harness) {
  return harness.store.cabdocs.filter((row) => row.is_reversal !== true);
}

function linesOf(harness, cabdocId) {
  return harness.store.cuedocs.filter((row) => row.cabdoc_id === cabdocId).sort((a, b) => a.line_no - b.line_no);
}

// === (A) Helpers puros de T3 ===

test("money convierte Decimal/string a numero y redondea a dos decimales", () => {
  assert.equal(pettyCash.money("1250.5"), 1250.5);
  assert.equal(pettyCash.money("1250.456"), 1250.46);
  assert.equal(pettyCash.money(null), 0);
  assert.equal(pettyCash.money(undefined), 0);
  assert.equal(pettyCash.money(""), 0);
  assert.equal(pettyCash.money("abc"), 0);
});

test("parseDocumentDate fuerza medianoche UTC para que el periodo no se corra de mes", () => {
  const parsed = pettyCash.parseDocumentDate("2026-03-31", "VOUCHER_DATE_INVALID", "del comprobante");
  assert.equal(parsed.toISOString(), "2026-03-31T00:00:00.000Z");
  assert.equal(realAccounting.periodFromDate(parsed), "2026-03");
  assertThrowsCode(() => pettyCash.parseDocumentDate("", "VOUCHER_DATE_INVALID", "del comprobante"), 400, "VOUCHER_DATE_INVALID");
  assertThrowsCode(() => pettyCash.parseDocumentDate("31/03/2026", "VOUCHER_DATE_INVALID", "del comprobante"), 400, "VOUCHER_DATE_INVALID");
});

test("pageParams pagina con tope y dateRange cubre el dia completo del filtro final", () => {
  assert.deepEqual(pettyCash.pageParams({}), { take: 200, skip: 0 });
  assert.deepEqual(pettyCash.pageParams({ limit: "25", offset: "50" }), { take: 25, skip: 50 });
  assert.deepEqual(pettyCash.pageParams({ limit: 999999 }), { take: 1000, skip: 0 });
  assert.deepEqual(pettyCash.pageParams({ limit: "abc", offset: -5 }), { take: 200, skip: 0 });
  const range = pettyCash.dateRange({ date_from: "2026-03-01", date_to: "2026-03-31" });
  assert.equal(range.date.gte.toISOString(), "2026-03-01T00:00:00.000Z");
  assert.equal(range.date.lte.toISOString(), "2026-03-31T23:59:59.999Z");
  assert.deepEqual(pettyCash.dateRange({}), {});
});

test("documentLine construye el asiento con un solo lado y assertBalancedDocument exige cuadre", () => {
  const line = pettyCash.documentLine({
    account: EXPENSE_ACCOUNT, movement: "debit", amount: "1000.005", party: SUPPLIER,
    description: "Peaje", branchCode: "B-01", costCenterCode: "CC-10",
    tax: { tax_type: "iva", tax_code: "COMPRAS-19", tax_base: 1000, tax_rate: 19, tax_amount: 190 }
  });
  assert.equal(line.debit, 1000.01);
  assert.equal(line.credit, 0);
  assert.equal(line.movement, "debit");
  assert.equal(line.party_id, 55);
  assert.equal(line.tax_amount, 190);
  const totals = pettyCash.assertBalancedDocument([line, { ...line, movement: "credit", debit: 0, credit: 1000.01 }]);
  assert.deepEqual(totals, { total_debit: 1000.01, total_credit: 1000.01 });
  const error = assertThrowsCode(
    () => pettyCash.assertBalancedDocument([line, { ...line, movement: "credit", debit: 0, credit: 900 }]),
    422, "UNBALANCED_DOCUMENT"
  );
  assert.match(error.message, /no cuadra/i);
  // La tolerancia de 1 centavo no dispara el error (redondeo por linea).
  assert.deepEqual(pettyCash.assertBalancedDocument([line, { ...line, movement: "credit", debit: 0, credit: 1000.015 }]), { total_debit: 1000.01, total_credit: 1000.02 });
});

// === (B) Anticipos: giro, numeracion y documento APC ===

test("el giro de anticipo debita la cuenta 13xx y acredita la caja 11xx en un solo documento APC", async () => {
  const context = setup();
  try {
    const advance = await context.service.createAdvance("t-1", 9, { box_id: 3, date: "2026-03-02", amount: 500000, description: "Gira viaje" });
    assert.equal(advance.status, "open");
    assert.equal(advance.amount, 500000);
    assert.equal(advance.balance, 500000);
    assert.equal(advance.applied_total, 0);
    assert.equal(advance.document_type, "APC");
    assert.equal(advance.full_number, "APC-000001");
    assert.equal(advance.number, 1);
    assert.equal(advance.custodian_party_id, 77);
    assert.equal(advance.custodian_name, "Juan Perez SAS");
    assert.equal(advance.description, "Gira viaje");

    const documents = postedDocuments(context);
    assert.equal(documents.length, 1, "un unico documento contable por anticipo");
    const document = documents[0];
    assert.equal(document.document_type, "APC");
    assert.equal(document.full_number, "APC-000001");
    assert.equal(document.posting_date.toISOString(), "2026-03-02T00:00:00.000Z");
    assert.equal(document.is_reversal, false);
    assert.equal(document.total_debit, 500000);
    assert.equal(document.total_credit, 500000);
    assert.equal(advance.accounting_document_id, document.id);

    const lines = linesOf(context, document.id);
    assert.equal(lines.length, 2);
    assert.equal(lines[0].account_code, "133001");
    assert.equal(lines[0].movement, "debit");
    assert.equal(lines[0].debit, 500000);
    assert.equal(lines[0].party_id, 77);
    assert.equal(lines[1].account_code, "110505");
    assert.equal(lines[1].movement, "credit");
    assert.equal(lines[1].credit, 500000);
    // Cada linea deja su LedgerEntry y la relacion queda trazada.
    assert.equal(context.store.ledgers.length, 2);
    assert.deepEqual(lines.map((line) => line.ledger_entry_id), context.store.ledgers.map((ledger) => ledger.id));
    assert.equal(context.store.ledgers[0].period, "2026-03");
    assert.equal(context.store.ledgers[0].debit, 500000);
    assert.equal(lines[0].branch_code, "B-01");
    assert.equal(lines[0].cost_center_code, "CC-10");
    assert.equal(lines[0].line_no, 1);
  } finally { context.restore(); }
});

test("la numeracion APC se reserva con candado advisory, se auto-sana y se persiste el siguiente", async () => {
  // next_number obsoleto en la config (otro modulo reescribio Tenant.config desde cache):
  // ya existe un APC-000007 emitido, asi que la reserva debe saltar a 8.
  const context = setup({
    config: { accounting: { accounting_numbering: [{ document_type: "APC", prefix: "APC", next_number: 2, active: true }] } },
    cabdocs: [{ id: 900, tenant_id: "t-1", document_type: "APC", document_number: 7, full_number: "APC-000007", posting_date: new Date("2026-02-01T00:00:00.000Z"), header_text: "APC anterior", society_code: "SOC-01", status: "posted", is_reversal: false, is_cancelled: false, total_debit: 100, total_credit: 100 }]
  });
  try {
    const advance = await context.service.createAdvance("t-1", 9, { box_id: 3, date: "2026-03-02", amount: 1000 });
    assert.equal(advance.number, 8);
    assert.equal(advance.full_number, "APC-000008");
    const locks = context.calls.filter((call) => call.op === "$executeRawUnsafe");
    assert.ok(locks.some((call) => /pg_advisory_xact_lock/.test(call.sql) && call.args[0] === "t-1:accounting-numbering"), "candado de numeracion contable");
    assert.ok(locks.some((call) => /pg_advisory_xact_lock/.test(call.sql) && call.args[0] === "t-1:petty-cash-box:3"), "candado por caja antes de leer el estado");
    const persisted = context.store.config.accounting.accounting_numbering.find((row) => row.document_type === "APC");
    assert.equal(persisted.next_number, 9);
    // Los demas tipos del maestro no se pierden al reescribir la config.
    assert.ok(context.store.config.accounting.accounting_numbering.some((row) => row.document_type === "GM"));
    assert.ok(context.store.config.accounting.accounting_numbering.some((row) => row.document_type === "LCM"));
  } finally { context.restore(); }
});

test("el anticipo usa el custodio de la caja cuando no se envia otro y valida el periodo cerrado", async () => {
  const context = setup();
  try {
    const advance = await context.service.createAdvance("t-1", 9, { box_id: 3, date: "2026-03-02", amount: 100 });
    assert.equal(advance.custodian_party_id, 77);
    assert.ok(context.calls.some((call) => call.op === "accounting.assertPeriodOpen" && call.period === "2026-03"));
  } finally { context.restore(); }

  const closed = setup({}, { closedPeriods: ["2026-02"] });
  try {
    await assertRejectsCode(closed.service.createAdvance("t-1", 9, { box_id: 3, date: "2026-02-15", amount: 100 }), 423, "PERIOD_CLOSED");
    assert.equal(closed.store.cabdocs.length, 0, "no se contabiliza nada con el periodo cerrado");
  } finally { closed.restore(); }
});

test("un anticipo en cero o negativo falla con ADVANCE_AMOUNT_INVALID y una caja sin custodio con BOX_NOT_READY_FOR_ADVANCES", async () => {
  const context = setup();
  try {
    await assertRejectsCode(context.service.createAdvance("t-1", 9, { box_id: 3, date: "2026-03-02", amount: 0 }), 400, "ADVANCE_AMOUNT_INVALID");
    await assertRejectsCode(context.service.createAdvance("t-1", 9, { box_id: 3, date: "2026-03-02", amount: -500 }), 400, "ADVANCE_AMOUNT_INVALID");
    assert.equal(context.store.advances.length, 0);
  } finally { context.restore(); }

  const withoutCustodian = setup({ boxes: [boxFixture({ custodian_party_id: null, custodian_name: null })] });
  try {
    const error = await assertRejectsCode(
      withoutCustodian.service.createAdvance("t-1", 9, { box_id: 3, date: "2026-03-02", amount: 500 }),
      422, "BOX_NOT_READY_FOR_ADVANCES"
    );
    assert.match(error.message, /custodio/i);
    assert.equal(withoutCustodian.store.cabdocs.length, 0);
  } finally { withoutCustodian.restore(); }
});

test("block_unliquidated_advance con un anticipo abierto responde 409 ADVANCE_ALREADY_OPEN nombrandolo", async () => {
  const context = setup({
    boxes: [boxFixture({ block_unliquidated_advance: true, require_advance: true })],
    advances: [advanceFixture({ full_number: "APC-000004", number: 4, balance: 250, applied_total: 250 })]
  });
  try {
    const error = await assertRejectsCode(
      context.service.createAdvance("t-1", 9, { box_id: 3, date: "2026-03-05", amount: 1000 }),
      409, "ADVANCE_ALREADY_OPEN"
    );
    assert.match(error.message, /APC-000004/);
    assert.match(error.message, /saldo 250/);
    assert.equal(context.store.advances.length, 1, "no se crea el segundo anticipo");
    assert.equal(context.store.cabdocs.length, 0);
  } finally { context.restore(); }
});

test("con block_unliquidated_advance y el anticipo ya liquidado si se puede girar uno nuevo", async () => {
  const context = setup({
    boxes: [boxFixture({ block_unliquidated_advance: true, require_advance: true })],
    advances: [advanceFixture({ status: "liquidated", balance: 0, applied_total: 500, liquidated_at: new Date("2026-03-04T00:00:00.000Z") })]
  });
  try {
    const advance = await context.service.createAdvance("t-1", 9, { box_id: 3, date: "2026-03-05", amount: 1000 });
    assert.equal(advance.status, "open");
    assert.equal(context.store.advances.length, 2);
  } finally { context.restore(); }
});

test("el limite mensual de la caja responde 422 ADVANCE_EXCEEDS_MONTHLY_LIMIT con el disponible", async () => {
  const context = setup({
    boxes: [boxFixture({ monthly_limit: 1000000 })],
    advances: [advanceFixture({ date: new Date("2026-03-01T00:00:00.000Z"), amount: 800000 }), advanceFixture({ id: 22, date: new Date("2026-02-10T00:00:00.000Z"), amount: 5000000, status: "liquidated" })]
  });
  try {
    const error = await assertRejectsCode(
      context.service.createAdvance("t-1", 9, { box_id: 3, date: "2026-03-20", amount: 300000 }),
      422, "ADVANCE_EXCEEDS_MONTHLY_LIMIT"
    );
    assert.match(error.message, /1000000/);
    assert.match(error.message, /200000/, "informa el disponible del mes");
    // Febrero no cuenta para el limite de marzo.
    const ok = await context.service.createAdvance("t-1", 9, { box_id: 3, date: "2026-03-21", amount: 200000 });
    assert.equal(ok.amount, 200000);
  } finally { context.restore(); }
});

test("el limite mensual usa el calendario UTC de la fecha del documento, sin corrimiento por zona horaria", async () => {
  // accounting.periodBounds arma el rango con `new Date(year, month - 1, 1)` (hora local): en
  // America/Bogota (UTC-5) devuelve [01T05:00Z .. dia1SiguienteT04:59Z] y dejaria por fuera los
  // documentos fechados el primer dia del mes, que parseDocumentDate guarda a medianoche UTC.
  const bounds = pettyCash.monthBoundsUtc("2026-03");
  assert.equal(bounds.start.toISOString(), "2026-03-01T00:00:00.000Z");
  assert.equal(bounds.end.toISOString(), "2026-03-31T23:59:59.999Z");
  assert.equal(pettyCash.monthBoundsUtc("2026-02").end.toISOString(), "2026-02-28T23:59:59.999Z");
  assert.equal(pettyCash.monthBoundsUtc("2028-02").end.toISOString(), "2028-02-29T23:59:59.999Z", "ano bisiesto");
  assert.equal(pettyCash.monthBoundsUtc("2026-04").end.toISOString(), "2026-04-30T23:59:59.999Z", "mes de 30 dias");
  assertThrowsCode(() => pettyCash.monthBoundsUtc("2026-13"), 400, "INVALID_PERIOD");
  assertThrowsCode(() => pettyCash.monthBoundsUtc(null), 400, "INVALID_PERIOD");

  // El dia 1 del mes cuenta para ese mes; el dia 1 del mes siguiente no.
  const context = setup({
    boxes: [boxFixture({ monthly_limit: 1000000 })],
    advances: [
      advanceFixture({ date: new Date("2026-03-01T00:00:00.000Z"), amount: 900000 }),
      advanceFixture({ id: 22, date: new Date("2026-04-01T00:00:00.000Z"), amount: 100000 })
    ]
  });
  try {
    await assertRejectsCode(
      context.service.createAdvance("t-1", 9, { box_id: 3, date: "2026-03-31", amount: 200000 }),
      422, "ADVANCE_EXCEEDS_MONTHLY_LIMIT"
    );
    const abril = await context.service.createAdvance("t-1", 9, { box_id: 3, date: "2026-04-02", amount: 200000 });
    assert.equal(abril.amount, 200000);
  } finally { context.restore(); }
});

test("los anticipos anulados no consumen limite mensual y una caja inactiva responde 409 BOX_INACTIVE", async () => {
  const context = setup({
    boxes: [boxFixture({ monthly_limit: 1000000 })],
    advances: [advanceFixture({ status: "cancelled", amount: 900000, date: new Date("2026-03-01T00:00:00.000Z") })]
  });
  try {
    const advance = await context.service.createAdvance("t-1", 9, { box_id: 3, date: "2026-03-02", amount: 900000 });
    assert.equal(advance.amount, 900000);
  } finally { context.restore(); }

  const inactive = setup({ boxes: [boxFixture({ active: false })] });
  try {
    await assertRejectsCode(inactive.service.createAdvance("t-1", 9, { box_id: 3, date: "2026-03-02", amount: 100 }), 409, "BOX_INACTIVE");
  } finally { inactive.restore(); }
});

// === (C) Comprobantes de gasto: contabilizacion inmediata ===

function voucherPayload(overrides = {}, lines = []) {
  return { box_id: 3, date: "2026-03-03", lines, ...overrides };
}

test("caso 1: un comprobante sin IVA cuadra debito de gasto contra credito de caja", async () => {
  const context = setup();
  try {
    const voucher = await context.service.createVoucher("t-1", 9, voucherPayload({ description: "Gastos de carretera" }, [
      { concept_code: "PEAJE", description: "Peaje Chusaca", base_amount: 12500 }
    ]));
    assert.equal(voucher.status, "posted");
    assert.equal(voucher.document_type, "GM");
    assert.equal(voucher.full_number, "GM-000001");
    assert.equal(voucher.period, "2026-03");
    assert.equal(voucher.posting_date.toISOString(), "2026-03-03T00:00:00.000Z");
    assert.equal(voucher.subtotal, 12500);
    assert.equal(voucher.vat_total, 0);
    assert.equal(voucher.total, 12500);
    assert.equal(voucher.advance_id, null);

    const line = voucher.lines[0];
    assert.equal(line.vat_code, null);
    assert.equal(line.vat_percent, 0);
    assert.equal(line.vat_amount, 0);
    assert.equal(line.vat_account_code, null);
    assert.equal(line.total, 12500);
    assert.equal(line.concept_code, "PEAJE");
    assert.equal(line.account_code, "519505");
    assert.equal(line.advance_applied, 0);
    assert.equal(line.cash_applied, 12500);
    assert.equal(line.branch_code, "B-01");
    assert.equal(line.cost_center_code, "CC-10");
    assert.ok(line.ledger_entry_id, "la linea queda amarrada a su LedgerEntry");

    const document = postedDocuments(context)[0];
    assert.equal(document.total_debit, 12500);
    assert.equal(document.total_credit, 12500);
    const accountingLines = linesOf(context, document.id);
    assert.equal(accountingLines.length, 2, "sin IVA no hay linea de impuesto");
    assert.deepEqual(accountingLines.map((row) => [row.account_code, row.movement, row.debit, row.credit]), [
      ["519505", "debit", 12500, 0],
      ["110505", "credit", 0, 12500]
    ]);
    assert.equal(accountingLines[0].party_id, 77, "sin proveedor se usa el custodio de la caja");
    assert.equal(accountingLines[0].tax_type, null);
    assert.equal(accountingLines[0].tax_amount, 0);
    // El default_vat_code del concepto NO se aplica automaticamente.
    assert.equal(line.vat_code, null);
  } finally { context.restore(); }
});

test("caso 2: con IVA el documento cuadra y el servidor recalcula vat_percent, vat_amount y total", async () => {
  const context = setup();
  try {
    const voucher = await context.service.createVoucher("t-1", 9, voucherPayload({}, [
      // El cliente manda vat_amount y total inventados: se ignoran y se recalculan.
      { concept_code: "PEAJE", description: "Compra con IVA", base_amount: 100000, vat_code: "compras-19", vat_amount: 1, total: 100001 }
    ]));
    const line = voucher.lines[0];
    assert.equal(line.vat_code, "COMPRAS-19");
    assert.equal(line.vat_percent, 19);
    assert.equal(line.vat_amount, 19000);
    assert.equal(line.total, 119000);
    assert.equal(line.vat_account_code, "2408");
    assert.equal(voucher.subtotal, 100000);
    assert.equal(voucher.vat_total, 19000);
    assert.equal(voucher.total, 119000);

    const document = postedDocuments(context)[0];
    assert.equal(document.total_debit, 119000);
    assert.equal(document.total_credit, 119000);
    const accountingLines = linesOf(context, document.id);
    assert.equal(accountingLines.length, 3);
    assert.deepEqual(accountingLines.map((row) => [row.account_code, row.movement, row.debit, row.credit]), [
      ["519505", "debit", 100000, 0],
      ["2408", "debit", 19000, 0],
      ["110505", "credit", 0, 119000]
    ]);
    // Convencion de impuesto heredada de preparePayableDocument: la base lleva el detalle del IVA.
    assert.equal(accountingLines[0].tax_type, "iva");
    assert.equal(accountingLines[0].tax_code, "COMPRAS-19");
    assert.equal(accountingLines[0].tax_base, 100000);
    assert.equal(accountingLines[0].tax_rate, 19);
    assert.equal(accountingLines[0].tax_amount, 19000);
    assert.match(accountingLines[1].description, /IVA 19%/);
  } finally { context.restore(); }
});

test("caso 3: un vat_code inexistente o inactivo responde 400 VAT_MASTER_NOT_FOUND", async () => {
  const context = setup();
  try {
    const error = await assertRejectsCode(
      context.service.createVoucher("t-1", 9, voucherPayload({}, [{ concept_code: "PEAJE", description: "Gasto", base_amount: 1000, vat_code: "COMPRAS-99" }])),
      400, "VAT_MASTER_NOT_FOUND"
    );
    assert.match(error.message, /COMPRAS-99/);
    await assertRejectsCode(
      context.service.createVoucher("t-1", 9, voucherPayload({}, [{ concept_code: "PEAJE", description: "Gasto", base_amount: 1000, vat_code: "COMPRAS-RETIRED" }])),
      400, "VAT_MASTER_NOT_FOUND"
    );
    assert.equal(context.store.vouchers.length, 0);
    assert.equal(context.store.cabdocs.length, 0);
  } finally { context.restore(); }
});

test("caso 4: el gasto imputado a un anticipo acredita la cuenta 13xx y mueve saldo e imputado", async () => {
  const context = setup({ advances: [advanceFixture({ amount: 500, applied_total: 0, balance: 500 })] });
  try {
    const voucher = await context.service.createVoucher("t-1", 9, voucherPayload({ advance_id: 21 }, [
      { concept_code: "PEAJE", description: "Peaje imputado", base_amount: 200 }
    ]));
    assert.equal(voucher.advance_id, 21);
    assert.equal(voucher.total, 200);
    assert.equal(voucher.advance_applied_total, 200);
    assert.equal(voucher.cash_applied_total, 0);
    assert.equal(voucher.lines[0].advance_applied, 200);
    assert.equal(voucher.lines[0].cash_applied, 0);

    const document = postedDocuments(context).find((row) => row.document_type === "GM");
    const accountingLines = linesOf(context, document.id);
    assert.deepEqual(accountingLines.map((row) => [row.account_code, row.movement, row.debit, row.credit]), [
      ["519505", "debit", 200, 0],
      ["133001", "credit", 0, 200]
    ], "el credito va contra el anticipo, no contra la caja");
    assert.equal(document.total_debit, document.total_credit);

    const advance = context.store.advances.find((row) => row.id === 21);
    assert.equal(Number(advance.balance), 300);
    assert.equal(Number(advance.applied_total), 200);
    assert.equal(advance.status, "open", "imputar no liquida el anticipo");
  } finally { context.restore(); }
});

test("caso 5: el gasto que excede el anticipo parte el credito entre anticipo y caja sin dejar saldo negativo", async () => {
  // require_advance = false: el anticipo es opcional y el excedente se paga con la caja.
  const context = setup({
    boxes: [boxFixture({ require_advance: false, block_unliquidated_advance: false })],
    advances: [advanceFixture({ amount: 500, applied_total: 0, balance: 500 })]
  });
  try {
    const voucher = await context.service.createVoucher("t-1", 9, voucherPayload({ advance_id: 21 }, [
      { concept_code: "PEAJE", description: "Primer gasto", base_amount: 400 },
      { concept_code: "PEAJE", description: "Segundo gasto", base_amount: 300 }
    ]));
    assert.equal(voucher.total, 700);
    assert.equal(voucher.advance_applied_total, 500);
    assert.equal(voucher.cash_applied_total, 200);
    // Imputacion linea a linea: la primera consume 400 y la segunda agota el anticipo (100) y derrama 200.
    assert.equal(voucher.lines[0].advance_applied, 400);
    assert.equal(voucher.lines[0].cash_applied, 0);
    assert.equal(voucher.lines[1].advance_applied, 100);
    assert.equal(voucher.lines[1].cash_applied, 200);

    const document = postedDocuments(context).find((row) => row.document_type === "GM");
    const accountingLines = linesOf(context, document.id);
    assert.deepEqual(accountingLines.map((row) => [row.account_code, row.movement, row.debit, row.credit]), [
      ["519505", "debit", 400, 0],
      ["519505", "debit", 300, 0],
      ["133001", "credit", 0, 500],
      ["110505", "credit", 0, 200]
    ], "el credito se parte en dos lineas");
    assert.equal(document.total_debit, 700);
    assert.equal(document.total_credit, 700);

    const advance = context.store.advances.find((row) => row.id === 21);
    assert.equal(Number(advance.balance), 0, "el saldo se preserva: nunca queda en negativo");
    assert.equal(Number(advance.applied_total), 500);
    assert.equal(Number(advance.amount), 500);
  } finally { context.restore(); }
});

test("caso 6: una caja con require_advance y sin anticipo responde 422 ADVANCE_REQUIRED", async () => {
  const context = setup({ boxes: [boxFixture({ require_advance: true })] });
  try {
    const error = await assertRejectsCode(
      context.service.createVoucher("t-1", 9, voucherPayload({}, [{ concept_code: "PEAJE", description: "Gasto", base_amount: 100 }])),
      422, "ADVANCE_REQUIRED"
    );
    assert.match(error.message, /CM-01/);
    assert.equal(context.store.vouchers.length, 0);
    assert.equal(context.store.cabdocs.length, 0);
  } finally { context.restore(); }
});

test("con require_advance el anticipo debe cubrir el comprobante: 422 ADVANCE_INSUFFICIENT_BALANCE", async () => {
  const context = setup({
    boxes: [boxFixture({ require_advance: true })],
    advances: [advanceFixture({ amount: 100, applied_total: 0, balance: 100 })]
  });
  try {
    const error = await assertRejectsCode(
      context.service.createVoucher("t-1", 9, voucherPayload({ advance_id: 21 }, [{ concept_code: "PEAJE", description: "Gasto", base_amount: 500 }])),
      422, "ADVANCE_INSUFFICIENT_BALANCE"
    );
    assert.match(error.message, /100/, "informa el saldo disponible");
    assert.match(error.message, /500/);
    const advance = context.store.advances.find((row) => row.id === 21);
    assert.equal(Number(advance.balance), 100, "no se descuenta nada si falla");
    assert.equal(context.store.cabdocs.length, 0);
  } finally { context.restore(); }
});

test("el anticipo de otra caja, inexistente o ya liquidado no se puede imputar", async () => {
  const context = setup({
    boxes: [boxFixture()],
    advances: [advanceFixture({ box_id: 4 }), advanceFixture({ id: 22, status: "liquidated", balance: 0, applied_total: 500 })]
  });
  try {
    const mismatch = await assertRejectsCode(
      context.service.createVoucher("t-1", 9, voucherPayload({ advance_id: 21 }, [{ concept_code: "PEAJE", description: "Gasto", base_amount: 10 }])),
      422, "ADVANCE_BOX_MISMATCH"
    );
    assert.match(mismatch.message, /APC-000001/);
    await assertRejectsCode(
      context.service.createVoucher("t-1", 9, voucherPayload({ advance_id: 999 }, [{ concept_code: "PEAJE", description: "Gasto", base_amount: 10 }])),
      404, "ADVANCE_NOT_FOUND"
    );
    await assertRejectsCode(
      context.service.createVoucher("t-1", 9, voucherPayload({ advance_id: 22 }, [{ concept_code: "PEAJE", description: "Gasto", base_amount: 10 }])),
      409, "ADVANCE_NOT_OPEN"
    );
    assert.equal(context.store.vouchers.length, 0);
  } finally { context.restore(); }
});

test("las validaciones de linea responden CONCEPT_NOT_FOUND, LINE_DESCRIPTION_REQUIRED, LINE_AMOUNT_INVALID", async () => {
  const context = setup();
  try {
    await assertRejectsCode(
      context.service.createVoucher("t-1", 9, voucherPayload({}, [{ concept_code: "NO-EXISTE", description: "Gasto", base_amount: 100 }])),
      400, "CONCEPT_NOT_FOUND"
    );
    await assertRejectsCode(
      context.service.createVoucher("t-1", 9, voucherPayload({}, [{ description: "Sin concepto", base_amount: 100 }])),
      400, "CONCEPT_NOT_FOUND"
    );
    await assertRejectsCode(
      context.service.createVoucher("t-1", 9, voucherPayload({}, [{ concept_code: "VIEJO", description: "Concepto inactivo", base_amount: 100 }])),
      400, "CONCEPT_NOT_FOUND"
    );
    // concept_id tambien resuelve el concepto.
    const byId = await context.service.createVoucher("t-1", 9, voucherPayload({}, [{ concept_id: 5, description: "Por id", base_amount: 100 }]));
    assert.equal(byId.lines[0].concept_code, "PEAJE");
    await assertRejectsCode(
      context.service.createVoucher("t-1", 9, voucherPayload({}, [{ concept_code: "PEAJE", description: "   ", base_amount: 100 }])),
      400, "LINE_DESCRIPTION_REQUIRED"
    );
    await assertRejectsCode(
      context.service.createVoucher("t-1", 9, voucherPayload({}, [{ concept_code: "PEAJE", description: "Cero", base_amount: 0 }])),
      400, "LINE_AMOUNT_INVALID"
    );
    await assertRejectsCode(
      context.service.createVoucher("t-1", 9, voucherPayload({}, [])),
      400, "VOUCHER_LINES_REQUIRED"
    );
  } finally { context.restore(); }
});

test("los conceptos con requires_supplier y requires_invoice_reference exigen proveedor y soporte validos", async () => {
  const context = setup();
  try {
    const required = await assertRejectsCode(
      context.service.createVoucher("t-1", 9, voucherPayload({}, [{ concept_code: "PAPELERIA", description: "Resmas", base_amount: 5000 }])),
      400, "SUPPLIER_REQUIRED"
    );
    assert.match(required.message, /PAPELERIA/);
    await assertRejectsCode(
      context.service.createVoucher("t-1", 9, voucherPayload({}, [{ concept_code: "PAPELERIA", description: "Resmas", base_amount: 5000, supplier_party_id: 55 }])),
      400, "INVOICE_REFERENCE_REQUIRED"
    );
    // Proveedor inactivo o sin rol proveedor no sirve (partyRoleWhere reutilizado).
    await assertRejectsCode(
      context.service.createVoucher("t-1", 9, voucherPayload({}, [{ concept_code: "PAPELERIA", description: "Resmas", base_amount: 5000, supplier_party_id: 56, invoice_reference: "FV-1" }])),
      400, "SUPPLIER_INVALID"
    );
    await assertRejectsCode(
      context.service.createVoucher("t-1", 9, voucherPayload({}, [{ concept_code: "PAPELERIA", description: "Resmas", base_amount: 5000, supplier_party_id: 88, invoice_reference: "FV-1" }])),
      400, "SUPPLIER_INVALID"
    );
    const voucher = await context.service.createVoucher("t-1", 9, voucherPayload({}, [
      { concept_code: "PAPELERIA", description: "Resmas", base_amount: 5000, supplier_party_id: 55, invoice_reference: "FV-1" }
    ]));
    assert.equal(voucher.lines[0].supplier_party_id, 55);
    assert.equal(voucher.lines[0].invoice_reference, "FV-1");
    assert.equal(voucher.lines[0].supplier.name, "Papeleria Andina");
    const document = postedDocuments(context).find((row) => row.document_type === "GM");
    assert.equal(linesOf(context, document.id)[0].party_id, 55, "la linea contabiliza contra el proveedor");
    assert.equal(linesOf(context, document.id)[0].party_tax_id, "900123456");
  } finally { context.restore(); }
});

test("sin custodio y sin proveedor la linea no se puede contabilizar: 422 PARTY_REQUIRED_FOR_POSTING", async () => {
  const context = setup({ boxes: [boxFixture({ custodian_party_id: null, custodian_name: null })] });
  try {
    const error = await assertRejectsCode(
      context.service.createVoucher("t-1", 9, voucherPayload({}, [{ concept_code: "PEAJE", description: "Gasto", base_amount: 100 }])),
      422, "PARTY_REQUIRED_FOR_POSTING"
    );
    assert.match(error.message, /tercero/i);
    assert.equal(context.store.cabdocs.length, 0);
  } finally { context.restore(); }
});

test("una sucursal o centro de costo fuera del arbol responde 400 ORGANIZATION_REFERENCE_INVALID", async () => {
  const context = setup();
  try {
    await assertRejectsCode(
      context.service.createVoucher("t-1", 9, voucherPayload({}, [{ concept_code: "PEAJE", description: "Gasto", base_amount: 100, branch_code: "B-99" }])),
      400, "ORGANIZATION_REFERENCE_INVALID"
    );
    await assertRejectsCode(
      context.service.createVoucher("t-1", 9, voucherPayload({}, [{ concept_code: "PEAJE", description: "Gasto", base_amount: 100, cost_center_code: "CC-99" }])),
      400, "ORGANIZATION_REFERENCE_INVALID"
    );
    const voucher = await context.service.createVoucher("t-1", 9, voucherPayload({}, [
      { concept_code: "PEAJE", description: "Gasto con estructura propia", base_amount: 100, branch_code: "B-01", cost_center_code: "CC-10" }
    ]));
    assert.equal(voucher.lines[0].branch_code, "B-01");
    assert.equal(voucher.lines[0].cost_center_code, "CC-10");
  } finally { context.restore(); }
});

test("si falla la grabacion de las lineas la transaccion se revierte y no quedan huerfanos", async () => {
  const context = setup({ advances: [advanceFixture({ amount: 500, balance: 500 })] });
  context.failures.set("pettyCashVoucherLine.createMany", new Error("fallo simulado al grabar lineas"));
  try {
    await assert.rejects(
      context.service.createVoucher("t-1", 9, voucherPayload({ advance_id: 21 }, [{ concept_code: "PEAJE", description: "Gasto", base_amount: 200 }])),
      /fallo simulado/
    );
    assert.equal(context.store.vouchers.length, 0, "sin comprobante");
    assert.equal(context.store.lines.length, 0, "sin lineas");
    assert.equal(context.store.cabdocs.length, 0, "sin documento contable huerfano");
    assert.equal(context.store.cuedocs.length, 0);
    assert.equal(context.store.ledgers.length, 0, "sin apunte en el mayor general");
    assert.equal(Number(context.store.advances[0].balance), 500, "el saldo del anticipo no se descuenta");
    assert.equal(Number(context.store.advances[0].applied_total), 0);
  } finally { context.restore(); }
});

test("todo el comprobante se graba en una unica transaccion con las opciones del modulo", async () => {
  const context = setup();
  try {
    await context.service.createVoucher("t-1", 9, voucherPayload({}, [{ concept_code: "PEAJE", description: "Gasto", base_amount: 100 }]));
    assert.equal(context.txOptionsSeen.length, 1, "un solo $transaction por comprobante");
    assert.deepEqual(context.txOptionsSeen[0], pettyCash.TX_OPTIONS);
    // Ni el servicio ni el harness escriben el filtro de tenant a mano.
    for (const call of context.calls) {
      if (call.data) assert.equal("tenant_id" in call.data, false, `${call.op} no debe escribir tenant_id`);
      if (call.where) assert.equal("tenant_id" in call.where, false, `${call.op} no debe filtrar tenant_id a mano`);
    }
  } finally { context.restore(); }
});

test("varias lineas con y sin IVA producen un documento cuadrado con una linea de impuesto por base gravada", async () => {
  const context = setup();
  try {
    const voucher = await context.service.createVoucher("t-1", 9, voucherPayload({}, [
      { concept_code: "PEAJE", description: "Con IVA 19", base_amount: 10000, vat_code: "COMPRAS-19" },
      { concept_code: "PAPELERIA", description: "Con IVA 5", base_amount: 4000, vat_code: "COMPRAS-5", supplier_party_id: 55, invoice_reference: "FV-9" },
      { concept_code: "PEAJE", description: "Sin IVA", base_amount: 2500 }
    ]));
    assert.equal(voucher.subtotal, 16500);
    assert.equal(voucher.vat_total, 2100);
    assert.equal(voucher.total, 18600);
    assert.equal(voucher.lines_count, 3);
    const document = postedDocuments(context).find((row) => row.document_type === "GM");
    const accountingLines = linesOf(context, document.id);
    // 3 bases + 2 IVA + 1 credito de caja.
    assert.equal(accountingLines.length, 6);
    assert.equal(document.total_debit, 18600);
    assert.equal(document.total_credit, 18600);
    assert.equal(accountingLines[accountingLines.length - 1].account_code, "110505");
    assert.equal(accountingLines[accountingLines.length - 1].credit, 18600);
    assert.equal(accountingLines.filter((row) => row.account_code === "2408").length, 2);
    assert.equal(voucher.lines[0].line_number, 1);
    assert.equal(voucher.lines[2].vat_percent, 0);
  } finally { context.restore(); }
});

// === (D) Liquidacion de anticipos (LCM) ===

test("caso 8: liquidar con sobrante debita la caja, acredita el anticipo y marca liquidated con refund_amount", async () => {
  const context = setup({ advances: [advanceFixture({ amount: 500, applied_total: 200, balance: 300 })] });
  try {
    const advance = await context.service.liquidateAdvance("t-1", 9, 21, { refund_amount: 300, date: "2026-03-10" });
    assert.equal(advance.status, "liquidated");
    assert.equal(advance.refund_amount, 300);
    assert.equal(advance.shortfall_amount, 0);
    assert.equal(advance.liquidated_at.toISOString(), "2026-03-10T00:00:00.000Z");
    assert.equal(advance.balance, 300, "la liquidacion preserva balance = amount - applied_total");
    assert.equal(advance.applied_total, 200);

    const document = context.store.cabdocs.find((row) => row.document_type === "LCM");
    assert.ok(document, "se emite un documento LCM");
    assert.equal(document.full_number, "LCM-000001");
    assert.equal(document.total_debit, 300);
    assert.equal(document.total_credit, 300);
    const accountingLines = linesOf(context, document.id);
    assert.deepEqual(accountingLines.map((row) => [row.account_code, row.movement, row.debit, row.credit]), [
      ["110505", "debit", 300, 0],
      ["133001", "credit", 0, 300]
    ]);
  } finally { context.restore(); }
});

test("caso 8b: sin refund_amount la liquidacion reintegra todo el saldo pendiente", async () => {
  const context = setup({ advances: [advanceFixture({ amount: 500, applied_total: 0, balance: 500 })] });
  try {
    const advance = await context.service.liquidateAdvance("t-1", 9, 21, {});
    assert.equal(advance.refund_amount, 500);
    assert.equal(advance.status, "liquidated");
    const document = context.store.cabdocs.find((row) => row.document_type === "LCM");
    assert.equal(document.total_debit, 500);
    assert.equal(linesOf(context, document.id).length, 2, "solo reintegro: dos lineas");
  } finally { context.restore(); }
});

test("caso 9: liquidar con faltante agrega el debito del concepto y persiste shortfall_amount", async () => {
  const context = setup({ advances: [advanceFixture({ amount: 500, applied_total: 100, balance: 400 })] });
  try {
    const advance = await context.service.liquidateAdvance("t-1", 9, 21, {
      refund_amount: 250, shortfall_amount: 150, shortfall_concept_code: "PEAJE", date: "2026-03-11"
    });
    assert.equal(advance.status, "liquidated");
    assert.equal(advance.refund_amount, 250);
    assert.equal(advance.shortfall_amount, 150);
    const document = context.store.cabdocs.find((row) => row.document_type === "LCM");
    assert.equal(document.total_debit, 400);
    assert.equal(document.total_credit, 400);
    assert.deepEqual(linesOf(context, document.id).map((row) => [row.account_code, row.movement, row.debit, row.credit]), [
      ["110505", "debit", 250, 0],
      ["519505", "debit", 150, 0],
      ["133001", "credit", 0, 400]
    ]);
  } finally { context.restore(); }
});

test("caso 9b: un faltante sin concepto activo responde 400 CONCEPT_NOT_FOUND", async () => {
  const context = setup({ advances: [advanceFixture({ amount: 500, balance: 500 })] });
  try {
    await assertRejectsCode(
      context.service.liquidateAdvance("t-1", 9, 21, { refund_amount: 400, shortfall_amount: 100 }),
      400, "CONCEPT_NOT_FOUND"
    );
    await assertRejectsCode(
      context.service.liquidateAdvance("t-1", 9, 21, { refund_amount: 400, shortfall_amount: 100, shortfall_concept_code: "VIEJO" }),
      400, "CONCEPT_NOT_FOUND"
    );
    assert.equal(context.store.advances[0].status, "open", "no se liquida si falla el concepto");
    assert.equal(context.store.cabdocs.length, 0);
  } finally { context.restore(); }
});

test("caso 10: reintegro mas faltante distinto del saldo responde 400 LIQUIDATION_AMOUNTS_MISMATCH", async () => {
  const context = setup({ advances: [advanceFixture({ amount: 500, applied_total: 100, balance: 400 })] });
  try {
    const error = await assertRejectsCode(
      context.service.liquidateAdvance("t-1", 9, 21, { refund_amount: 300, shortfall_amount: 50 }),
      400, "LIQUIDATION_AMOUNTS_MISMATCH"
    );
    assert.match(error.message, /400/);
    await assertRejectsCode(
      context.service.liquidateAdvance("t-1", 9, 21, { refund_amount: -1, shortfall_amount: 401 }),
      400, "LIQUIDATION_AMOUNTS_MISMATCH"
    );
    assert.equal(context.store.advances[0].status, "open");
    assert.equal(context.store.cabdocs.length, 0);
  } finally { context.restore(); }
});

test("liquidar un anticipo ya liquidado, anulado o inexistente responde 409 o 404", async () => {
  const context = setup({
    advances: [
      advanceFixture({ id: 21, status: "liquidated", balance: 0, applied_total: 500 }),
      advanceFixture({ id: 22, status: "cancelled", balance: 500 })
    ]
  });
  try {
    await assertRejectsCode(context.service.liquidateAdvance("t-1", 9, 21, {}), 409, "ADVANCE_NOT_OPEN");
    await assertRejectsCode(context.service.liquidateAdvance("t-1", 9, 22, {}), 409, "ADVANCE_NOT_OPEN");
    await assertRejectsCode(context.service.liquidateAdvance("t-1", 9, 999, {}), 404, "ADVANCE_NOT_FOUND");
  } finally { context.restore(); }
});

test("un anticipo totalmente imputado no tiene nada que liquidar: 422 ADVANCE_FULLY_APPLIED", async () => {
  const context = setup({ advances: [advanceFixture({ amount: 500, applied_total: 500, balance: 0 })] });
  try {
    const error = await assertRejectsCode(context.service.liquidateAdvance("t-1", 9, 21, {}), 422, "ADVANCE_FULLY_APPLIED");
    assert.match(error.message, /saldo 0/);
  } finally { context.restore(); }
});

// === (E) Anulaciones: reversion espejo ===

test("caso 12: anular un anticipo con comprobantes imputados responde 409 ADVANCE_HAS_VOUCHERS", async () => {
  const context = setup({
    advances: [advanceFixture({ amount: 500, applied_total: 200, balance: 300 })],
    vouchers: [{ id: 41, tenant_id: "t-1", box_id: 3, advance_id: 21, document_type: "GM", number: 1, full_number: "GM-000001", date: new Date("2026-03-03T00:00:00.000Z"), posting_date: new Date("2026-03-03T00:00:00.000Z"), period: "2026-03", status: "posted", subtotal: 200, vat_total: 0, total: 200, accounting_document_id: 901 }],
    lines: [{ id: 61, tenant_id: "t-1", voucher_id: 41, line_number: 1, concept_id: 5, concept_code: "PEAJE", account_code: "519505", description: "Peaje", base_amount: 200, vat_amount: 0, total: 200, advance_applied: 200 }],
    cabdocs: [{ id: 900, tenant_id: "t-1", document_type: "APC", document_number: 1, full_number: "APC-000001", posting_date: new Date("2026-03-02T00:00:00.000Z"), header_text: "Anticipo", society_code: "SOC-01", status: "posted", is_reversal: false, is_cancelled: false, total_debit: 500, total_credit: 500 }],
    cuedocs: [
      { id: 700, cabdoc_id: 900, line_no: 1, account_id: 130, account_code: "133001", branch_code: "B-01", cost_center_code: "CC-10", party_id: 77, party_tax_id: null, movement: "debit", debit: 500, credit: 0, description: "Anticipo", tax_base: 0, tax_rate: 0, tax_amount: 0, ledger_entry_id: 800 },
      { id: 701, cabdoc_id: 900, line_no: 2, account_id: 101, account_code: "110505", branch_code: "B-01", cost_center_code: "CC-10", party_id: 77, party_tax_id: null, movement: "credit", debit: 0, credit: 500, description: "Giro", tax_base: 0, tax_rate: 0, tax_amount: 0, ledger_entry_id: 801 }
    ]
  });
  try {
    const error = await assertRejectsCode(context.service.cancelAdvance("t-1", 9, 21), 409, "ADVANCE_HAS_VOUCHERS");
    assert.match(error.message, /1 comprobante/, "informa cuantos comprobantes lo impiden");
    assert.match(error.message, /anulelos primero/i);
    assert.equal(context.store.advances[0].status, "open");
    assert.equal(context.store.cabdocs.filter((row) => row.is_reversal).length, 0);
  } finally { context.restore(); }
});

test("anular un anticipo sin comprobantes emite el espejo y deja el original cancelado", async () => {
  const context = setup({
    advances: [advanceFixture({ amount: 500, balance: 500 })],
    cabdocs: [apcCabdocFixture()],
    cuedocs: apcCuedocFixture()
  });
  try {
    const advance = await context.service.cancelAdvance("t-1", 9, 21);
    assert.equal(advance.status, "cancelled");
    assert.ok(advance.reversal_accounting_document_id, "queda trazado el documento de reversion");
    const reversal = context.store.cabdocs.find((row) => row.id === advance.reversal_accounting_document_id);
    assert.equal(reversal.is_reversal, true);
    assert.equal(reversal.referenced_document_id, 900);
    assert.equal(reversal.document_type, "APC");
    assert.equal(reversal.reference, "APC-000001");
    const original = context.store.cabdocs.find((row) => row.id === 900);
    assert.equal(original.is_cancelled, true);
    assert.equal(original.cancelled_by, 9);
    assert.ok(original.cancelled_at instanceof Date);
    assert.deepEqual(linesOf(context, reversal.id).map((row) => [row.account_code, row.movement, row.debit, row.credit]), [
      ["133001", "credit", 0, 500],
      ["110505", "debit", 500, 0]
    ], "espejo exacto del original");
    assert.equal(reversal.total_debit, 500);
    assert.equal(reversal.total_credit, 500);
    // Nunca borrado fisico: el asiento original sigue en la base.
    assert.equal(context.store.cabdocs.length, 2);
  } finally { context.restore(); }
});

test("caso 11: anular un comprobante revierte el asiento y restaura el saldo del anticipo", async () => {
  const context = setup({ advances: [advanceFixture({ amount: 500000, applied_total: 0, balance: 500000 })] });
  try {
    const voucher = await context.service.createVoucher("t-1", 9, voucherPayload({ advance_id: 21 }, [
      { concept_code: "PEAJE", description: "Peaje", base_amount: 100000, vat_code: "COMPRAS-19" }
    ]));
    const advanceAfterPost = context.store.advances.find((row) => row.id === 21);
    assert.equal(Number(advanceAfterPost.balance), 381000);
    assert.equal(Number(advanceAfterPost.applied_total), 119000);

    const cancelled = await context.service.cancelVoucher("t-1", 9, voucher.id);
    assert.equal(cancelled.status, "cancelled");
    assert.ok(cancelled.reversal_accounting_document_id);
    assert.equal(cancelled.accounting_document_id, voucher.accounting_document_id);

    const original = context.store.cabdocs.find((row) => row.id === voucher.accounting_document_id);
    assert.equal(original.is_cancelled, true);
    const reversal = context.store.cabdocs.find((row) => row.id === cancelled.reversal_accounting_document_id);
    assert.equal(reversal.is_reversal, true);
    assert.equal(reversal.referenced_document_id, original.id);
    assert.equal(reversal.document_type, "GM");
    assert.equal(reversal.total_debit, original.total_credit);
    assert.equal(reversal.total_credit, original.total_debit);
    assert.deepEqual(
      linesOf(context, reversal.id).map((row) => [row.account_code, row.movement, row.debit, row.credit]),
      [
        ["519505", "credit", 0, 100000],
        ["2408", "credit", 0, 19000],
        ["133001", "debit", 119000, 0]
      ], "el espejo invierte debitos y creditos linea por linea"
    );
    assert.match(linesOf(context, reversal.id)[0].description, /Reversion GM-000001/);

    const advance = context.store.advances.find((row) => row.id === 21);
    assert.equal(Number(advance.balance), 500000, "el saldo del anticipo se restaura");
    assert.equal(Number(advance.applied_total), 0);
    assert.equal(advance.status, "open");
    // Las lineas del comprobante se conservan (trazabilidad), solo cambia el estado.
    assert.equal(context.store.lines.length, 1);
  } finally { context.restore(); }
});

test("anular dos veces el mismo comprobante responde 409 VOUCHER_ALREADY_CANCELLED", async () => {
  const context = setup();
  try {
    const voucher = await context.service.createVoucher("t-1", 9, voucherPayload({}, [{ concept_code: "PEAJE", description: "Peaje", base_amount: 100 }]));
    await context.service.cancelVoucher("t-1", 9, voucher.id);
    await assertRejectsCode(context.service.cancelVoucher("t-1", 9, voucher.id), 409, "VOUCHER_ALREADY_CANCELLED");
    await assertRejectsCode(context.service.cancelVoucher("t-1", 9, 9999), 404, "VOUCHER_NOT_FOUND");
    assert.equal(context.store.cabdocs.filter((row) => row.is_reversal).length, 1);
  } finally { context.restore(); }
});

test("no se puede anular un comprobante cuyo anticipo ya fue liquidado: 409 VOUCHER_ADVANCE_LIQUIDATED", async () => {
  const context = setup({ advances: [advanceFixture({ amount: 500, applied_total: 200, balance: 300 })] });
  try {
    const voucher = await context.service.createVoucher("t-1", 9, voucherPayload({ advance_id: 21 }, [{ concept_code: "PEAJE", description: "Peaje", base_amount: 200 }]));
    await context.service.liquidateAdvance("t-1", 9, 21, {});
    const error = await assertRejectsCode(context.service.cancelVoucher("t-1", 9, voucher.id), 409, "VOUCHER_ADVANCE_LIQUIDATED");
    assert.match(error.message, /APC-000001/);
    assert.equal(context.store.vouchers.find((row) => row.id === voucher.id).status, "posted");
    const advance = context.store.advances.find((row) => row.id === 21);
    // La liquidacion no se deshace: saldo/imputado quedan como estaban y no se emite reversion.
    assert.equal(Number(advance.balance), 100);
    assert.equal(Number(advance.applied_total), 400);
    assert.equal(advance.status, "liquidated");
    assert.equal(context.store.cabdocs.filter((row) => row.is_reversal).length, 0);
    assert.equal(context.store.cabdocs.find((row) => row.id === voucher.accounting_document_id).is_cancelled, false);
  } finally { context.restore(); }
});

test("anular un comprobante directo contra caja no toca anticipos y revierte contra 11xx", async () => {
  const context = setup();
  try {
    const voucher = await context.service.createVoucher("t-1", 9, voucherPayload({}, [{ concept_code: "PEAJE", description: "Peaje", base_amount: 1000 }]));
    const cancelled = await context.service.cancelVoucher("t-1", 9, voucher.id);
    const reversal = context.store.cabdocs.find((row) => row.id === cancelled.reversal_accounting_document_id);
    assert.deepEqual(linesOf(context, reversal.id).map((row) => [row.account_code, row.movement, row.debit, row.credit]), [
      ["519505", "credit", 0, 1000],
      ["110505", "debit", 1000, 0]
    ]);
    assert.equal(context.store.advances.length, 0);
  } finally { context.restore(); }
});

test("sin asiento vigente que reversar la anulacion responde 422 ACCOUNTING_TRACE_NOT_FOUND", async () => {
  const context = setup({
    advances: [advanceFixture({ amount: 500, balance: 500, accounting_document_id: null })]
  });
  try {
    await assertRejectsCode(context.service.cancelAdvance("t-1", 9, 21), 422, "ACCOUNTING_TRACE_NOT_FOUND");
  } finally { context.restore(); }
});

// === (F) Lecturas y contrato JSON para T4/T5-T7 ===

test("GET /advances lista con filtros de caja, estado y rango de fechas sin N+1 de cajas", async () => {
  const context = setup({
    advances: [
      advanceFixture({ id: 21, date: new Date("2026-03-02T00:00:00.000Z"), amount: 500, applied_total: 100, balance: 400 }),
      advanceFixture({ id: 22, date: new Date("2026-02-02T00:00:00.000Z"), status: "liquidated", amount: 300, applied_total: 300, balance: 0 })
    ],
    vouchers: [{ id: 41, tenant_id: "t-1", box_id: 3, advance_id: 21, document_type: "GM", number: 1, full_number: "GM-000001", date: new Date("2026-03-03T00:00:00.000Z"), posting_date: new Date("2026-03-03T00:00:00.000Z"), period: "2026-03", status: "posted", subtotal: 100, vat_total: 0, total: 100 }]
  });
  try {
    const all = await context.service.listAdvances("t-1", {});
    assert.equal(all.length, 2);
    assert.equal(all[0].id, 21, "orden descendente por fecha");
    assert.equal(all[0].vouchers_count, 1);
    assert.equal(all[0].box.code, "CM-01");
    const byStatus = await context.service.listAdvances("t-1", { status: "liquidated" });
    assert.equal(byStatus.length, 1);
    assert.equal(byStatus[0].id, 22);
    const byRange = await context.service.listAdvances("t-1", { date_from: "2026-03-01", date_to: "2026-03-31" });
    assert.equal(byRange.length, 1);
    assert.equal(byRange[0].id, 21);
    const paged = await context.service.listAdvances("t-1", { limit: 1, offset: 1 });
    assert.equal(paged.length, 1);
    assert.equal(paged[0].id, 22);
    const query = context.calls.find((call) => call.op === "pettyCashAdvance.findFirst");
    assert.equal(query, undefined);
    assert.ok(context.calls.some((call) => call.op === "pettyCashAdvance.findMany"));
  } finally { context.restore(); }
});

test("GET /advances/:id trae los comprobantes imputados y los documentos contables", async () => {
  const context = setup({
    advances: [advanceFixture({ amount: 500, applied_total: 200, balance: 300 })],
    cabdocs: [apcCabdocFixture()],
    cuedocs: apcCuedocFixture()
  });
  try {
    await context.service.createVoucher("t-1", 9, voucherPayload({ advance_id: 21 }, [{ concept_code: "PEAJE", description: "Peaje", base_amount: 200 }]));
    const advance = await context.service.getAdvance("t-1", 21);
    assert.equal(advance.vouchers.length, 1);
    assert.equal(advance.vouchers[0].full_number, "GM-000001");
    assert.equal(advance.vouchers[0].lines.length, 1);
    assert.equal(advance.accounting_document.document_type, "APC");
    assert.equal(advance.accounting_document.lines.length, 2);
    assert.equal(advance.accounting_document.is_reversal, false);
    assert.equal(advance.custodian.name, "Juan Perez");
    assert.equal(advance.reversal_accounting_document, null);
    await assertRejectsCode(context.service.getAdvance("t-1", 9999), 404, "ADVANCE_NOT_FOUND");
  } finally { context.restore(); }
});

test("GET /vouchers expone el contrato exacto que consumen T5-T7", async () => {
  const context = setup({ advances: [advanceFixture({ amount: 500000, applied_total: 0, balance: 500000 })] });
  try {
    await context.service.createVoucher("t-1", 9, voucherPayload({ advance_id: 21, description: "Gira marzo" }, [
      { concept_code: "PAPELERIA", description: "Resmas", base_amount: 50000, vat_code: "COMPRAS-19", supplier_party_id: 55, invoice_reference: "FV-31" }
    ]));
    const rows = await context.service.listVouchers("t-1", {});
    assert.equal(rows.length, 1);
    assert.deepEqual(Object.keys(rows[0]).sort(), [
      "accounting_document_id", "advance", "advance_applied_total", "advance_id", "box", "box_id",
      "cash_applied_total", "created_at", "created_by", "date", "description", "document_type",
      "full_number", "id", "lines_count", "number", "period", "posting_date",
      "reversal_accounting_document_id", "status", "subtotal", "total", "updated_at", "vat_total"
    ].sort());
    assert.equal(rows[0].box.code, "CM-01");
    assert.equal(rows[0].advance.full_number, "APC-000001");
    assert.equal(rows[0].lines_count, 1);
    assert.equal(rows[0].lines, undefined, "la lista no trae las lineas (solo el detalle)");
    assert.equal(rows[0].total, 59500);
    assert.equal(typeof rows[0].total, "number", "los importes salen numericos, nunca Decimal");

    const detail = await context.service.getVoucher("t-1", rows[0].id);
    assert.deepEqual(Object.keys(detail.lines[0]).sort(), [
      "account_code", "advance_applied", "base_amount", "branch_code", "cash_applied", "concept_code",
      "concept_id", "cost_center_code", "created_at", "description", "id", "invoice_reference",
      "ledger_entry_id", "line_number", "supplier", "supplier_party_id", "total", "updated_at",
      "vat_account_code", "vat_amount", "vat_code", "vat_percent", "voucher_id"
    ].sort());
    assert.equal(detail.lines[0].supplier.name, "Papeleria Andina");
    assert.equal(detail.accounting_document.document_type, "GM");
    assert.equal(detail.accounting_document.lines.length, 3);
    assert.deepEqual(Object.keys(detail.accounting_document.lines[0]).sort(), [
      "account_code", "account_id", "branch_code", "cost_center_code", "credit", "debit", "description",
      "ledger_entry_id", "line_no", "movement", "party_id", "party_tax_id", "tax_amount", "tax_base",
      "tax_code", "tax_rate", "tax_type"
    ].sort());
    assert.equal(detail.reversal_accounting_document, null);
    await assertRejectsCode(context.service.getVoucher("t-1", 9999), 404, "VOUCHER_NOT_FOUND");
  } finally { context.restore(); }
});

test("GET /vouchers filtra por caja, anticipo, concepto, periodo, estado y fechas", async () => {
  const context = setup({ advances: [advanceFixture({ amount: 500, applied_total: 0, balance: 500 })] });
  try {
    await context.service.createVoucher("t-1", 9, voucherPayload({ advance_id: 21 }, [{ concept_code: "PEAJE", description: "Peaje", base_amount: 100 }]));
    await context.service.createVoucher("t-1", 9, voucherPayload({}, [{ concept_code: "PAPELERIA", description: "Resmas", base_amount: 200, supplier_party_id: 55, invoice_reference: "FV-1" }]));
    assert.equal((await context.service.listVouchers("t-1", {})).length, 2);
    assert.equal((await context.service.listVouchers("t-1", { box_id: 3 })).length, 2);
    assert.equal((await context.service.listVouchers("t-1", { box_id: 99 })).length, 0);
    assert.equal((await context.service.listVouchers("t-1", { advance_id: 21 })).length, 1);
    assert.equal((await context.service.listVouchers("t-1", { concept_code: "peaje" })).length, 1);
    assert.equal((await context.service.listVouchers("t-1", { concept_code: "PAPELERIA" })).length, 1);
    assert.equal((await context.service.listVouchers("t-1", { period: "2026-03" })).length, 2);
    assert.equal((await context.service.listVouchers("t-1", { period: "2026-02" })).length, 0);
    assert.equal((await context.service.listVouchers("t-1", { status: "posted" })).length, 2);
    assert.equal((await context.service.listVouchers("t-1", { status: "cancelled" })).length, 0);
    assert.equal((await context.service.listVouchers("t-1", { date_from: "2026-03-04" })).length, 0);
    assert.equal((await context.service.listVouchers("t-1", { date_from: "2026-03-01", date_to: "2026-03-31" })).length, 2);
    const conceptQuery = context.calls.filter((call) => call.op === "pettyCashVoucher.findMany").find((call) => call.where.lines);
    assert.deepEqual(conceptQuery.where.lines, { some: { concept_code: "PEAJE" } });
  } finally { context.restore(); }
});

test("el periodo contable del comprobante se deriva de la fecha del documento", async () => {
  const context = setup();
  try {
    const voucher = await context.service.createVoucher("t-1", 9, voucherPayload({ date: "2026-01-31" }, [{ concept_code: "PEAJE", description: "Peaje", base_amount: 100 }]));
    assert.equal(voucher.period, "2026-01");
    assert.equal(context.store.ledgers[0].period, "2026-01");
    assert.equal(context.store.cabdocs[0].posting_date.toISOString(), "2026-01-31T00:00:00.000Z");
  } finally { context.restore(); }
});

// === (G) Contrato de tipos de documento, esquemas y rutas ===

test("caso 13: GM, APC y LCM estan en el maestro contable y no se reutiliza AP de treasury", () => {
  const codes = realAccounting.DEFAULT_ACCOUNTING_DOCUMENT_TYPES.map((row) => row.code);
  for (const code of ["GM", "APC", "LCM"]) assert.ok(codes.includes(code), `${code} debe estar en DEFAULT_ACCOUNTING_DOCUMENT_TYPES`);
  // AP pertenece a los anticipos a proveedores de treasury: no se toca ni se reutiliza.
  assert.equal(codes.includes("AP"), false, "AP no debe agregarse al maestro contable");
  const treasurySource = fs.readFileSync(path.join(__dirname, "../src/modules/treasury/service.js"), "utf8");
  assert.match(treasurySource, /docType: "AP"/, "treasury conserva AP para anticipos a proveedores");

  assert.equal(pettyCash.ADVANCE_DOCUMENT_TYPE, "APC");
  assert.equal(pettyCash.VOUCHER_DOCUMENT_TYPE, "GM");
  assert.equal(pettyCash.LIQUIDATION_DOCUMENT_TYPE, "LCM");
  const serviceSource = fs.readFileSync(path.join(__dirname, "../src/modules/petty-cash/service.js"), "utf8");
  assert.doesNotMatch(serviceSource, /documentType:\s*"AP"/);
  assert.doesNotMatch(serviceSource, /document_type:\s*"AP"/);

  // Sin sembrar en base de datos: la numeracion sale del maestro fusionado con Tenant.config.
  const numbering = realAccounting.mergeNumbering(realAccounting.DEFAULT_ACCOUNTING_DOCUMENT_TYPES, null);
  const byType = Object.fromEntries(numbering.map((row) => [row.document_type, row]));
  for (const code of ["GM", "APC", "LCM"]) {
    assert.equal(byType[code].prefix, code);
    assert.equal(byType[code].next_number, 1);
    assert.equal(byType[code].active, true);
  }
  assert.equal("AP" in byType, false);
});

test("los esquemas de T3 son cerrados, exigen los minimos y no aceptan campos calculados", () => {
  assert.equal(schema.advanceBody.additionalProperties, false);
  assert.equal(schema.voucherBody.additionalProperties, false);
  assert.equal(schema.voucherLineBody.additionalProperties, false);
  assert.equal(schema.liquidateBody.additionalProperties, false);
  assert.deepEqual(schema.advanceBody.required, ["box_id", "date", "amount"]);
  assert.deepEqual(schema.voucherBody.required, ["box_id", "date", "lines"]);
  assert.deepEqual(schema.voucherLineBody.required, ["description", "base_amount"]);
  assert.equal(schema.voucherBody.properties.lines.minItems, 1);
  assert.equal(schema.voucherBody.properties.lines.items, schema.voucherLineBody);
  assert.equal(schema.liquidateBody.required, undefined, "liquidar sin cuerpo usa el saldo como reintegro");
  assert.match(schema.advanceBody.properties.date.pattern, /\\d\{4\}/);
  // base_amount admite 0 para que el servicio responda LINE_AMOUNT_INVALID y no un 400 generico.
  assert.equal(schema.voucherLineBody.properties.base_amount.minimum, 0);
  assert.deepEqual(schema.voucherLineBody.properties.vat_code.type, ["string", "null"]);
  for (const readOnly of ["status", "balance", "applied_total", "full_number", "number", "period", "accounting_document_id", "tenant_id", "subtotal", "vat_total"]) {
    assert.equal(readOnly in schema.voucherBody.properties, false, `${readOnly} no debe aceptarse en el body del comprobante`);
    assert.equal(readOnly in schema.advanceBody.properties, false, `${readOnly} no debe aceptarse en el body del anticipo`);
  }
  for (const readOnly of ["vat_percent", "vat_account_code", "advance_applied", "account_code", "ledger_entry_id"]) {
    assert.equal(readOnly in schema.voucherLineBody.properties, false, `${readOnly} lo calcula el servidor`);
  }
  // params y body separados; las anulaciones no declaran body.
  assert.equal(schema.advanceCreateSchema.params, undefined);
  assert.equal(schema.voucherCreateSchema.params, undefined);
  assert.equal(schema.liquidateSchema.params, schema.idParams);
  assert.equal(schema.liquidateSchema.body, schema.liquidateBody);
  assert.equal("body" in schema.idParamSchema, false);
});

// Comportamiento real de Fastify con los esquemas de T3 (sin base de datos ni autenticacion):
// la validacion corre antes del preHandler, y con removeAdditional (default de Fastify) los campos
// no declarados se DESCARTAN, asi que ningun campo calculado del cliente llega al servicio.
test("Fastify descarta los campos no declarados y acepta liquidar sin cuerpo", async () => {
  const Fastify = require("fastify");
  const app = Fastify();
  const optionalBody = (request, reply, done) => {
    if (request.body === undefined || request.body === null) request.body = {};
    done();
  };
  app.post("/vouchers", { schema: schema.voucherCreateSchema }, (request) => ({ recibido: request.body }));
  app.post("/advances/:id/liquidate", { schema: schema.liquidateSchema, preValidation: optionalBody }, (request) => ({ recibido: request.body, id: request.params.id }));

  const conBasura = await app.inject({
    method: "POST", url: "/vouchers",
    payload: {
      box_id: 1, date: "2026-03-03", status: "posted", full_number: "GM-9", tenant_id: "otro",
      lines: [{ description: "x", base_amount: 10, vat_percent: 19, vat_account_code: "2408", ledger_entry_id: 5, advance_applied: 999 }]
    }
  });
  assert.equal(conBasura.statusCode, 200);
  assert.deepEqual(conBasura.json().recibido, {
    box_id: 1, date: "2026-03-03",
    lines: [{ description: "x", base_amount: 10 }]
  }, "solo sobreviven los campos declarados: no hay asignacion masiva");

  const sinLineas = await app.inject({ method: "POST", url: "/vouchers", payload: { box_id: 1, date: "2026-03-03", lines: [] } });
  assert.equal(sinLineas.statusCode, 400);
  assert.equal(sinLineas.json().code, "FST_ERR_VALIDATION");

  const fechaMala = await app.inject({ method: "POST", url: "/vouchers", payload: { box_id: 1, date: "03/03/2026", lines: [{ description: "x", base_amount: 10 }] } });
  assert.equal(fechaMala.statusCode, 400);

  const sinCuerpo = await app.inject({ method: "POST", url: "/advances/21/liquidate" });
  assert.equal(sinCuerpo.statusCode, 200, "liquidar sin cuerpo no revienta con FST_ERR_CTP_EMPTY_JSON_BODY");
  assert.deepEqual(sinCuerpo.json().recibido, {});
  const conCuerpo = await app.inject({ method: "POST", url: "/advances/21/liquidate", payload: { refund_amount: 100, basura: 1 } });
  assert.deepEqual(conCuerpo.json().recibido, { refund_amount: 100 });
  // El id del path se valida y se convierte a entero (coerceTypes de Fastify).
  assert.equal(conCuerpo.json().id, 21);
  assert.equal((await app.inject({ method: "POST", url: "/advances/abc/liquidate" })).statusCode, 400);
  assert.equal((await app.inject({ method: "POST", url: "/advances/0/liquidate" })).statusCode, 400);

  await app.close();
});

function readRoutes() {
  return fs.readFileSync(path.join(__dirname, "../src/modules/petty-cash/routes.js"), "utf8");
}

function routeLine(source, method, url) {
  const line = source.split(/\r?\n/).find((row) => row.includes(`fastify.${method}("${url}"`));
  assert.ok(line, `falta la ruta ${method.toUpperCase()} ${url}`);
  return line;
}

test("routes registra los 9 endpoints de T3 con el permiso correcto (approve para liquidar y anular)", () => {
  const source = readRoutes();
  const readList = [
    ["get", "/petty-cash/advances"], ["get", "/petty-cash/advances/:id"],
    ["get", "/petty-cash/vouchers"], ["get", "/petty-cash/vouchers/:id"]
  ];
  const writeList = [["post", "/petty-cash/advances"], ["post", "/petty-cash/vouchers"]];
  const approveList = [
    ["post", "/petty-cash/advances/:id/liquidate"], ["post", "/petty-cash/advances/:id/cancel"],
    ["post", "/petty-cash/vouchers/:id/cancel"]
  ];
  for (const [method, url] of readList) assert.match(routeLine(source, method, url), /preHandler: read/, `${method} ${url} debe usar read`);
  for (const [method, url] of writeList) assert.match(routeLine(source, method, url), /preHandler: write/, `${method} ${url} debe usar write`);
  for (const [method, url] of approveList) assert.match(routeLine(source, method, url), /preHandler: approve/, `${method} ${url} debe usar approve`);
  assert.equal(readList.length + writeList.length + approveList.length, 9);
  assert.match(source, /requirePermission\("accounting", "approve"\)/);
  assert.doesNotMatch(source, /requirePermission\("petty-cash"/);
  // Las creaciones responden 201.
  assert.match(routeLine(source, "post", "/petty-cash/advances"), /reply\.code\(201\)/);
  assert.match(routeLine(source, "post", "/petty-cash/vouchers"), /reply\.code\(201\)/);
  // Las anulaciones no declaran body.
  assert.match(routeLine(source, "post", "/petty-cash/advances/:id/cancel"), /schema: schema\.idParamSchema/);
  assert.match(routeLine(source, "post", "/petty-cash/vouchers/:id/cancel"), /schema: schema\.idParamSchema/);
  // Liquidar admite llamada sin cuerpo: el gancho completa {} antes de validar el esquema cerrado.
  assert.match(routeLine(source, "post", "/petty-cash/advances/:id/liquidate"), /schema: schema\.liquidateSchema, preValidation: optionalBody/);
  assert.match(source, /const optionalBody = \(request, reply, done\) => \{/);
  const urls = source.match(/fastify\.(?:get|post|put|patch|delete)\("([^"]+)"/g) || [];
  assert.equal(urls.length, 24, "12 maestros de T2 + 9 de T3 + 3 reportes de T4");
  assert.doesNotMatch(source, /fastify\.delete\(/);
});

test("los documentos de caja menor se emiten dentro de la transaccion del modulo, no con createAccountingDocument", () => {
  const serviceSource = fs.readFileSync(path.join(__dirname, "../src/modules/petty-cash/service.js"), "utf8");
  // Opcion A/B documentada: createAccountingDocument abre su propio $transaction (sin atomicidad).
  assert.doesNotMatch(serviceSource, /accounting\.createAccountingDocument\(/);
  assert.match(serviceSource, /accounting\.reserveAccountingDocumentNumber\(/, "la numeracion usa el candado canonico");
  assert.match(serviceSource, /accounting\.mergeNumbering\(/);
  assert.match(serviceSource, /accounting\.assertPeriodOpen\(/);
  assert.match(serviceSource, /accounting\.periodFromDate\(/);
  assert.match(serviceSource, /pg_advisory_xact_lock/);
  // El rango del limite mensual es UTC (monthBoundsUtc): accounting.periodBounds arma el rango en
  // hora local y desfasaria el primer dia del mes respecto de la fecha guardada a medianoche UTC.
  assert.match(serviceSource, /monthBoundsUtc\(/);
  assert.doesNotMatch(serviceSource, /accounting\.periodBounds\(/);
  // Reutiliza los exportados de T2 en vez de duplicarlos.
  for (const helper of ["findBox", "resolveCustodian", "resolveBoxAdvanceAccount", "assertBoxReadyForAdvances", "custodianDisplayName", "boxReadiness", "TX_OPTIONS"]) {
    assert.match(serviceSource, new RegExp(helper), `${helper} debe seguir en uso`);
  }
  // accounting/service.js exporta aditivo lo que T3 necesita.
  const accountingSource = fs.readFileSync(path.join(__dirname, "../src/modules/accounting/service.js"), "utf8");
  for (const exported of ["DEFAULT_ACCOUNTING_DOCUMENT_TYPES", "normalizeAccountingDocumentType", "mergeNumbering", "reserveAccountingDocumentNumber"]) {
    assert.match(accountingSource, new RegExp(`^\\s{2}${exported},$`, "m"), `${exported} debe exportarse`);
  }
  assert.equal(typeof realAccounting.reserveAccountingDocumentNumber, "function");
});

test("T4 implementa la reporteria y conserva el borrado logico de los maestros", () => {
  const serviceSource = fs.readFileSync(path.join(__dirname, "../src/modules/petty-cash/service.js"), "utf8");
  // El marcador reservado de T4 fue remplazado por la seccion de reporteria real.
  assert.doesNotMatch(serviceSource, /=== Reservado T4: reportes ===/);
  assert.match(serviceSource, /=== T4: reporter/);
  assert.match(readRoutes(), /fastify\.get\("\/petty-cash\/reports\/summary"/);
  const core = fs.readFileSync(path.join(__dirname, "../src/core/prisma.js"), "utf8");
  const physical = core.slice(core.indexOf("const PHYSICAL_DELETE_ALLOWED"));
  // Los movimientos no se borran fisicamente: la anulacion es siempre reversion espejo.
  assert.doesNotMatch(physical.slice(0, physical.indexOf("];")), /PettyCashAdvance|PettyCashVoucher/);
  assert.doesNotMatch(serviceSource, /\.delete(Many)?\(/);
});
