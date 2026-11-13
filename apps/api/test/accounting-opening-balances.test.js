// tenantCache exige REDIS_URL al importar el servicio.
process.env.DISABLE_REDIS = "true";
process.env.REDIS_DISABLED = "true";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ExcelJS = require("exceljs");
const {
  createOpeningBalancesTemplate,
  openingBalanceLegacyPartyId,
  resolveOpeningBalanceParty,
  resolveOpeningBalancePartiesBatched,
  resolveOpeningBalancePartyBatched,
  matchOpeningBalanceCode,
  resolveOpeningBalanceAccount,
  resolveOpeningBalanceAccountsBatched,
  resolveOpeningBalanceCenter,
  parseOpeningBalancesWorkbook,
  prepareOpeningBalanceRows,
  postOpeningBalancesWorkbook
} = require("../src/modules/accounting/service");

const service = fs.readFileSync(path.resolve(__dirname, "../src/modules/accounting/service.js"), "utf8");
const routes = fs.readFileSync(path.resolve(__dirname, "../src/modules/accounting/routes.js"), "utf8");
const schema = fs.readFileSync(path.resolve(__dirname, "../prisma/schema.prisma"), "utf8");
const migration = fs.readFileSync(path.resolve(__dirname, "../prisma/migrations/20261014120000_accounting_opening_balances_nullable_party/migration.sql"), "utf8");
const page = fs.readFileSync(path.resolve(__dirname, "../../web/app/dashboard/contabilidad/importar-saldos-iniciales/page.tsx"), "utf8");

test("saldos iniciales tienen plantilla, preview y confirmacion protegidos por contabilidad", () => {
  assert.match(routes, /accounting\/opening-balances\/template/);
  assert.match(routes, /accounting\/opening-balances\/validate/);
  assert.match(routes, /accounting\/opening-balances\"/);
  assert.match(routes, /requirePermission\("accounting", "write"\)/);
  assert.match(service, /openingCents/);
  assert.match(service, /OPENING_BALANCE_UNBALANCED/);
  assert.match(service, /OPENING_BALANCES_ALREADY_POSTED/);
  assert.match(service, /pg_advisory_xact_lock/);
  assert.match(service, /reserveAccountingDocumentNumber/);
  assert.match(page, /Validar plantilla/);
  assert.match(page, /Confirmar contabilización/);
});

test("tercero contable es opcional en la linea persistida y la migracion es puntual", () => {
  assert.match(schema, /model CntCuedoc[\s\S]*?party_id\s+Int\?/);
  assert.match(migration, /ALTER TABLE \"cnt_cuedoc\" ALTER COLUMN \"party_id\" DROP NOT NULL/);
  assert.doesNotMatch(service, /OPENING_BALANCE_PARTY_REQUIRED/);
});

test("recuperacion puntual conserva modelos de gastos menores y tipos contables", () => {
  assert.match(schema, /model PettyCashConcept/);
  assert.match(schema, /model PettyCashBox/);
  assert.match(schema, /model PettyCashAdvance/);
  assert.match(schema, /model PettyCashVoucher/);
  assert.match(schema, /model PettyCashVoucherLine/);
  assert.match(service, /code: \"GM\"/);
  assert.match(service, /code: \"APC\"/);
  assert.match(service, /code: \"LCM\"/);
});

function scopedPartyClient(parties) {
  const calls = [];
  return {
    calls,
    party: {
      async findFirst({ where }) {
        calls.push(where);
        return parties.find((party) => {
          if (where.id !== undefined && party.id !== where.id) return false;
          if (where.tax_id !== undefined && party.tax_id !== where.tax_id) return false;
          if (where.active !== undefined && party.active !== where.active) return false;
          if (where.active === undefined && where.__includeInactive !== true && party.active === false) return false;
          return true;
        }) || null;
      }
    }
  };
}

async function assertPartyNotFound(promise) {
  await assert.rejects(promise, (error) => {
    assert.equal(error.statusCode, 404);
    assert.equal(error.code, "OPENING_BALANCE_PARTY_NOT_FOUND");
    return true;
  });
}

test("saldos iniciales resuelven NIT numerico por tax_id antes que un id interno coincidente", async () => {
  const taxParty = { id: 7, tax_id: "900255181", active: true };
  const idCollision = { id: 900255181, tax_id: "OTRO", active: true };
  const client = scopedPartyClient([taxParty, idCollision]);
  const party = await resolveOpeningBalanceParty(client, "900255181", 5);
  assert.equal(party, taxParty);
  assert.deepEqual(client.calls[0], { tax_id: "900255181", active: true });
  assert.ok(client.calls.every((where) => where.id === undefined));
});

test("saldos iniciales resuelven NIT alfanumerico por tax_id exacto", async () => {
  const taxParty = { id: 9, tax_id: "NIT-ABC-9", active: true };
  const client = scopedPartyClient([taxParty]);
  assert.equal(await resolveOpeningBalanceParty(client, "NIT-ABC-9", 6), taxParty);
  assert.deepEqual(client.calls, [{ tax_id: "NIT-ABC-9", active: true }]);
});

test("saldos iniciales conservan el fallback a id interno solo sin coincidencia de tax_id", async () => {
  const legacyParty = { id: 42, tax_id: null, active: true };
  const client = scopedPartyClient([legacyParty]);
  assert.equal(await resolveOpeningBalanceParty(client, "42", 7), legacyParty);
  assert.deepEqual(client.calls, [
    { tax_id: "42", active: true },
    { tax_id: "42", __includeInactive: true },
    { id: 42, active: true }
  ]);
});

test("saldos iniciales resuelven NIT numerico largo por tax_id sin convertirlo a id", async () => {
  const longNit = "99999999999999999999";
  const taxParty = { id: 11, tax_id: longNit, active: true };
  const client = scopedPartyClient([taxParty]);
  assert.equal(await resolveOpeningBalanceParty(client, longNit, 8), taxParty);
  assert.ok(client.calls.every((where) => where.id === undefined));
});

test("saldos iniciales no convierten NIT largos ni fueras de rango Postgres Int", async () => {
  assert.equal(openingBalanceLegacyPartyId("2147483647"), 2147483647);
  assert.equal(openingBalanceLegacyPartyId("2147483648"), null);
  assert.equal(openingBalanceLegacyPartyId("99999999999999999999"), null);
  assert.equal(openingBalanceLegacyPartyId("0"), null);
  assert.equal(openingBalanceLegacyPartyId("-5"), null);
  assert.equal(openingBalanceLegacyPartyId("12.3"), null);
  assert.equal(openingBalanceLegacyPartyId("NIT-1"), null);
  const client = scopedPartyClient([]);
  await assertPartyNotFound(resolveOpeningBalanceParty(client, "99999999999999999999", 8));
  assert.ok(client.calls.every((where) => where.id === undefined));
});

test("saldos iniciales mantienen tercero opcional en blanco o nulo", async () => {
  const client = scopedPartyClient([]);
  assert.equal(await resolveOpeningBalanceParty(client, null, 9), null);
  assert.equal(await resolveOpeningBalanceParty(client, undefined, 9), null);
  assert.equal(await resolveOpeningBalanceParty(client, "   ", 9), null);
  assert.equal(client.calls.length, 0);
});

test("saldos iniciales rechazan tercero inactivo sin caer a un id interno ajeno", async () => {
  const inactiveTax = { id: 3, tax_id: "900255181", active: false };
  const unrelatedActiveId = { id: 900255181, tax_id: "OTRO", active: true };
  const client = scopedPartyClient([inactiveTax, unrelatedActiveId]);
  await assertPartyNotFound(resolveOpeningBalanceParty(client, "900255181", 10));
  assert.ok(client.calls.every((where) => where.id === undefined));
});

test("saldos iniciales dan notfound controlado para tercero inexistente o fuera del cliente scoped", async () => {
  const client = scopedPartyClient([{ id: 1, tax_id: "NIT-DE-OTRO-TENANT", active: true }]);
  await assertPartyNotFound(resolveOpeningBalanceParty(client, "NIT-INEXISTENTE", 11));
  assert.ok(client.calls.length > 0);
});

test("plantilla real conserva texto en cuenta, centro, sucursal y tercero", async () => {
  const buffer = await createOpeningBalancesTemplate();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.getWorksheet("Saldos iniciales");
  assert.deepEqual(sheet.getRow(4).values.slice(1), ["fecha_corte", "cuenta", "centro_costo", "sucursal", "saldo", "tercero"]);
  assert.equal(sheet.getColumn(1).numFmt, "yyyy-mm-dd");
  assert.equal(sheet.getColumn(2).numFmt, "@");
  assert.equal(sheet.getColumn(3).numFmt, "@");
  assert.equal(sheet.getColumn(4).numFmt, "@");
  assert.equal(sheet.getColumn(5).numFmt, "#,##0.00");
  assert.equal(sheet.getColumn(6).numFmt, "@");
});

function scopedAccountClient(accounts) {
  const calls = [];
  function matches(account, where) {
    const filter = where.code;
    if (filter && typeof filter === "object" && filter.mode === "insensitive") {
      return account.code.toLowerCase() === String(filter.equals).toLowerCase();
    }
    return account.code === filter;
  }
  return {
    calls,
    account: {
      async findFirst({ where }) {
        calls.push({ op: "findFirst", where });
        return accounts.find((account) => matches(account, where)) || null;
      },
      async findMany({ where, take }) {
        calls.push({ op: "findMany", where, take });
        return accounts.filter((account) => matches(account, where)).slice(0, take);
      }
    }
  };
}

test("cuenta exacta tiene prioridad sobre una variante de mayusculas", async () => {
  const exact = { id: 1, code: "130505HEART", active: true, allows_tx: true };
  const variant = { id: 2, code: "130505heart", active: true, allows_tx: true };
  const client = scopedAccountClient([variant, exact]);
  assert.equal(await resolveOpeningBalanceAccount(client, "130505HEART", 12), exact);
  assert.deepEqual(client.calls.map((call) => call.op), ["findFirst"]);
  assert.deepEqual(client.calls[0].where, { code: "130505HEART", __includeInactive: true });
});

test("cuenta resuelve minusculas o mixtas al codigo canonico almacenado", async () => {
  const canonical = { id: 3, code: "130505Heart", active: true, allows_tx: true };
  const client = scopedAccountClient([canonical]);
  assert.equal(await resolveOpeningBalanceAccount(client, "  130505heart  ", 13), canonical);
  assert.deepEqual(client.calls, [
    { op: "findFirst", where: { code: "130505heart", __includeInactive: true } },
    { op: "findMany", where: { code: { equals: "130505heart", mode: "insensitive" }, __includeInactive: true }, take: 2 }
  ]);
});

test("cuenta ambigua por mayusculas falla claramente sin elegir la primera", async () => {
  const client = scopedAccountClient([
    { id: 4, code: "220505CASE", active: true, allows_tx: true },
    { id: 5, code: "220505case", active: true, allows_tx: true }
  ]);
  await assert.rejects(resolveOpeningBalanceAccount(client, "220505Case", 14), (error) => {
    assert.equal(error.statusCode, 422);
    assert.equal(error.code, "OPENING_BALANCE_AMBIGUOUS_CODE");
    assert.match(error.message, /cuenta 220505Case/);
    return true;
  });
  assert.deepEqual(client.calls.map((call) => call.op), ["findFirst", "findMany"]);
});

test("cuenta exacta inactiva no cae a una variante activa", async () => {
  const client = scopedAccountClient([
    { id: 6, code: "130505INACTIVO", active: false, allows_tx: true },
    { id: 7, code: "130505inactivo", active: true, allows_tx: true }
  ]);
  await assert.rejects(resolveOpeningBalanceAccount(client, "130505INACTIVO", 15), (error) => {
    assert.equal(error.statusCode, 404);
    assert.equal(error.code, "OPENING_BALANCE_ACCOUNT_NOT_FOUND");
    return true;
  });
  assert.deepEqual(client.calls.map((call) => call.op), ["findFirst"]);
});

test("cuenta exacta no transaccional se rechaza sin fallback", async () => {
  const client = scopedAccountClient([{ id: 8, code: "130505SINMOV", active: true, allows_tx: false }]);
  await assert.rejects(resolveOpeningBalanceAccount(client, "130505SINMOV", 16), (error) => {
    assert.equal(error.statusCode, 404);
    assert.equal(error.code, "OPENING_BALANCE_ACCOUNT_NOT_FOUND");
    return true;
  });
  assert.deepEqual(client.calls.map((call) => call.op), ["findFirst"]);
});

test("sucursal y centro de costo aceptan mayusculas y minusculas con codigo canonico", () => {
  const branch = { code: "NORTE", active: true };
  const center = { code: "CC-ADMIN", active: true, branch_code: "NORTE" };
  assert.equal(matchOpeningBalanceCode([branch], " norte ", { label: "sucursal", rowNumber: 17 }), branch);
  assert.equal(matchOpeningBalanceCode([center], "cc-admin", { label: "centro de costo", rowNumber: 17 }), center);
});

test("sucursal conserva la coincidencia exacta aunque exista otra variante", () => {
  const exact = { code: "Norte", active: true };
  const variant = { code: "NORTE", active: true };
  assert.equal(matchOpeningBalanceCode([variant, exact], " Norte ", { label: "sucursal", rowNumber: 18 }), exact);
});

test("sucursal o centro ambiguo por mayusculas falla claramente", () => {
  assert.throws(
    () => matchOpeningBalanceCode([{ code: "Mixta", active: true }, { code: "MIXTA", active: true }], "mixta", { label: "sucursal", rowNumber: 19 }),
    (error) => {
      assert.equal(error.statusCode, 422);
      assert.equal(error.code, "OPENING_BALANCE_AMBIGUOUS_CODE");
      assert.match(error.message, /sucursal mixta/);
      return true;
    }
  );
});

test("la coincidencia insensible conserva inactivos para que el llamador los rechace", () => {
  const inactive = { code: "SUR", active: false };
  assert.equal(matchOpeningBalanceCode([inactive], "sur", { label: "sucursal", rowNumber: 20 }), inactive);
});

test("sucursal exacta no toma un centro enlazado a otra sucursal con distinta capitalizacion", () => {
  const tree = {
    branches: [
      { code: "Bodega", active: true, society_code: "SOC-01" },
      { code: "BODEGA", active: true, society_code: "SOC-01" }
    ],
    cost_centers: [{ code: "CC-BODEGA", branch_code: "BODEGA", society_code: "SOC-01", active: true }]
  };
  const exact = matchOpeningBalanceCode(tree.branches, "Bodega", { label: "sucursal", rowNumber: 21 });
  assert.equal(exact.code, "Bodega");
  assert.throws(() => resolveOpeningBalanceCenter(tree, exact, "cc-bodega", 21), (error) => {
    assert.equal(error.statusCode, 422);
    assert.equal(error.code, "OPENING_BALANCE_COST_CENTER_NOT_FOUND");
    return true;
  });
  const other = matchOpeningBalanceCode(tree.branches, "BODEGA", { label: "sucursal", rowNumber: 21 });
  assert.equal(resolveOpeningBalanceCenter(tree, other, "cc-bodega", 21), tree.cost_centers[0]);
});

test("centro de costo ambiguo por mayusculas falla claramente", () => {
  const tree = {
    branches: [{ code: "NORTE", active: true, society_code: "SOC-01" }],
    cost_centers: [
      { code: "CC-DUP", branch_code: "NORTE", society_code: "SOC-01", active: true },
      { code: "cc-dup", branch_code: "NORTE", society_code: "SOC-01", active: true }
    ]
  };
  const branch = matchOpeningBalanceCode(tree.branches, "norte", { label: "sucursal", rowNumber: 22 });
  assert.throws(() => resolveOpeningBalanceCenter(tree, branch, "Cc-Dup", 22), (error) => {
    assert.equal(error.statusCode, 422);
    assert.equal(error.code, "OPENING_BALANCE_AMBIGUOUS_CODE");
    assert.match(error.message, /centro de costo Cc-Dup/);
    return true;
  });
});

test("centro con sociedad almacenada distinta no se acepta", () => {
  const tree = {
    branches: [{ code: "NORTE", active: true, society_code: "SOC-01" }],
    cost_centers: [{ code: "CC-ADMIN", branch_code: "NORTE", society_code: "soc-01", active: true }]
  };
  const branch = matchOpeningBalanceCode(tree.branches, "norte", { label: "sucursal", rowNumber: 23 });
  assert.throws(() => resolveOpeningBalanceCenter(tree, branch, "cc-admin", 23), (error) => {
    assert.equal(error.statusCode, 422);
    assert.equal(error.code, "OPENING_BALANCE_COST_CENTER_NOT_FOUND");
    return true;
  });
});

test("saldos iniciales persisten y agrupan los codigos canonicos almacenados", () => {
  assert.match(service, /account_code: account\.code/);
  assert.match(service, /branch_code: row\.branch_code, cost_center_code: row\.cost_center_code, society_code: row\.society_code/);
  assert.match(service, /const key = `\$\{row\.account_code\}\|\$\{row\.branch_code\}\|\$\{row\.cost_center_code\}\|\$\{row\.party_id \|\| ""\}`/);
  assert.match(service, /tree\.cost_centers\.filter\(\(item\) => normalizeCode\(item\.branch_code\) === normalizeCode\(branch\.code\)\)/);
  assert.match(service, /normalizeCode\(center\.society_code\) !== normalizeCode\(branch\.society_code\)/);
});

test("normalizeCode global sigue siendo solo trim para no alterar otros modulos", () => {
  const definition = service.match(/function normalizeCode\(value\) \{[\s\S]*?\n\}/);
  assert.ok(definition);
  assert.match(definition[0], /String\(value \|\| ""\)\.trim\(\)/);
  assert.doesNotMatch(definition[0], /toUpperCase|toLowerCase/);
});

function batchAccountClient(accounts) {
  const calls = [];
  return {
    calls,
    account: {
      async findMany({ where }) {
        calls.push({ op: "findMany", where });
        const codes = where.code.in;
        const mode = where.code.mode;
        return accounts.filter((account) => {
          if (!codes.some((code) => mode === "insensitive" ? account.code.toLowerCase() === code.toLowerCase() : account.code === code)) return false;
          if (where.__includeInactive !== true && where.active !== undefined && account.active !== where.active) return false;
          if (where.__includeInactive !== true && where.active === undefined && account.active === false) return false;
          return true;
        });
      }
    }
  };
}

function batchAccountEntries(codes) {
  return codes.map((code, index) => ({ code, excel_row: index + 5 }));
}

test("resolucion por lote de cuentas usa una sola consulta insensible y preserva precedencia exacta", async () => {
  const exact = { id: 1, code: "130505HEART", active: true, allows_tx: true };
  const variant = { id: 2, code: "130505heart", active: true, allows_tx: true };
  const client = batchAccountClient([variant, exact]);
  const result = await resolveOpeningBalanceAccountsBatched(client, batchAccountEntries(["130505HEART", "130505unused"]));
  assert.equal(result.get("130505HEART"), exact);
  assert.equal(result.get("130505unused"), null);
  assert.equal(client.calls.length, 1);
  assert.equal(client.calls[0].op, "findMany");
  assert.deepEqual(client.calls[0].where.code.in, ["130505HEART", "130505unused"]);
  assert.equal(client.calls[0].where.code.mode, "insensitive");
});

test("resolucion por lote de cuentas conserva ambiguedad por mayusculas con numero de fila", async () => {
  const client = batchAccountClient([
    { id: 4, code: "220505CASE", active: true, allows_tx: true },
    { id: 5, code: "220505case", active: true, allows_tx: true }
  ]);
  await assert.rejects(resolveOpeningBalanceAccountsBatched(client, batchAccountEntries(["220505Case"])), (error) => {
    assert.equal(error.statusCode, 422);
    assert.equal(error.code, "OPENING_BALANCE_AMBIGUOUS_CODE");
    assert.match(error.message, /Fila 5: cuenta 220505Case/);
    return true;
  });
});

test("resolucion por lote de cuentas devuelve inactiva para que el llamador la rechace con fila", async () => {
  const client = batchAccountClient([{ id: 6, code: "130505INACTIVO", active: false, allows_tx: true }]);
  const result = await resolveOpeningBalanceAccountsBatched(client, batchAccountEntries(["130505INACTIVO"]));
  assert.equal(result.get("130505INACTIVO").active, false);
});

function batchPartyClient(parties) {
  const calls = [];
  return {
    calls,
    party: {
      async findMany({ where }) {
        calls.push({ op: "findMany", where });
        const match = (party) => {
          if (where.tax_id && where.tax_id.in) {
            if (!where.tax_id.in.some((v) => party.tax_id === v)) return false;
          }
          if (where.id && where.id.in) {
            if (!where.id.in.some((v) => party.id === v)) return false;
          }
          if (where.active !== undefined && party.active !== where.active) return false;
          if (where.__includeInactive !== true && where.active === undefined && party.active === false) return false;
          return true;
        };
        return parties.filter(match);
      }
    }
  };
}

function batchPartyRows(values) {
  return values.map((tercero, index) => ({ tercero, excel_row: index + 1 }));
}

test("resolucion por lote de terceros prioriza NIT activo antes que id interno coincidente", async () => {
  const taxParty = { id: 7, tax_id: "900255181", active: true };
  const idCollision = { id: 900255181, tax_id: "OTRO", active: true };
  const client = batchPartyClient([taxParty, idCollision]);
  const result = await resolveOpeningBalancePartiesBatched(client, batchPartyRows(["900255181"]));
  assert.equal(result.get("900255181"), taxParty);
});

test("resolucion por lote de terceros conserva fallback a id interno solo sin NIT", async () => {
  const legacyParty = { id: 42, tax_id: null, active: true };
  const client = batchPartyClient([legacyParty]);
  const result = await resolveOpeningBalancePartiesBatched(client, batchPartyRows(["42"]));
  assert.equal(result.get("42"), legacyParty);
});

test("resolucion por lote de terceros no cae de un NIT numerico inactivo a otro id", async () => {
  const inactiveTax = { id: 3, tax_id: "900255181", active: false };
  const unrelatedActiveId = { id: 900255181, tax_id: "OTRO", active: true };
  const client = batchPartyClient([inactiveTax, unrelatedActiveId]);
  const result = await resolveOpeningBalancePartiesBatched(client, batchPartyRows(["900255181"]));
  assert.equal(result.has("900255181"), false);
  assert.throws(() => resolveOpeningBalancePartyBatched(result, "900255181", 10), (error) => {
    assert.equal(error.statusCode, 404);
    assert.equal(error.code, "OPENING_BALANCE_PARTY_NOT_FOUND");
    return true;
  });
});

test("resolucion por lote de terceros mantiene opcionalidad en blanco", async () => {
  const client = batchPartyClient([]);
  const result = await resolveOpeningBalancePartiesBatched(client, batchPartyRows(["", null, "   "]));
  assert.equal(result.size, 0);
  assert.equal(resolveOpeningBalancePartyBatched(result, "", 1), null);
  assert.equal(resolveOpeningBalancePartyBatched(result, null, 1), null);
});

test("resolucion por lote de terceros respeta minuto de consultas acotadas (una por lote)", async () => {
  const parties = [
    { id: 1, tax_id: "NIT-1", active: true },
    { id: 2, tax_id: "NIT-2", active: true },
    { id: 3, tax_id: "NIT-3", active: true }
  ];
  const client = batchPartyClient(parties);
  await resolveOpeningBalancePartiesBatched(client, batchPartyRows(["NIT-1", "NIT-2", "NIT-3"]));
  assert.equal(client.calls.length, 1);
  assert.deepEqual(client.calls[0].where.tax_id.in, ["NIT-1", "NIT-2", "NIT-3"]);
});

function openingBalanceTxClient({ config, accounts, parties }) {
  const auditLogs = [];
  const numberingLocks = [];
  const docs = new Map();
  let nextDocId = 1;
  const tx = {
    async $executeRaw() { return 0; },
    numberingLocks,
    async $executeRawUnsafe(sql, ...params) { numberingLocks.push([sql, ...params]); return 0; },
    tenant: {
      async findUnique({ where }) { return { id: where.id, config }; }
    },
    party: {
      async findMany({ where }) {
        return parties.filter((party) => {
          if (where.tax_id?.in) return where.tax_id.in.includes(party.tax_id) && (where.active !== true || party.active === true);
          if (where.id?.in) return where.id.in.includes(party.id) && party.active === true;
          return false;
        });
      }
    },
    account: {
      async findMany({ where }) {
        const filter = where.code;
        if (filter && typeof filter === "object" && Array.isArray(filter.in)) {
          const codes = filter.in.map((code) => String(code));
          const insensitive = filter.mode === "insensitive";
          return accounts.filter((account) => codes.some((code) => insensitive
            ? account.code.toLowerCase() === code.toLowerCase()
            : account.code === code));
        }
        const equals = String(filter && typeof filter === "object" ? filter.equals : filter ?? "");
        const insensitive = filter && typeof filter === "object" && filter.mode === "insensitive";
        return accounts.filter((account) => insensitive
          ? account.code.toLowerCase() === equals.toLowerCase()
          : account.code === equals);
      }
    },
    cntCabdoc: {
      async findFirst({ where }) { return [...docs.values()].find((doc) => doc.reference === where.reference) || null; },
      async aggregate() { return { _max: { document_number: 0 } }; },
      async create({ data }) { const doc = { id: nextDocId++, lines: [], ...data }; docs.set(doc.id, doc); return doc; },
      async findUnique({ where }) { const doc = docs.get(where.id); return doc ? { ...doc, lines: [...doc.lines] } : null; }
    },
    cntCuedoc: {
      async create({ data }) { docs.get(data.cabdoc_id).lines.push(data); return data; }
    },
    ledgerEntry: {
      async create({ data }) { return { id: docs.size + 1, ...data }; }
    },
    auditLog: {
      async create({ data }) { auditLogs.push(data); return data; }
    }
  };
  return { tx, auditLogs };
}

function tenantConfigWithNumbering() {
  return {
    accounting: {
      organization_tree: {
        societies: [{ code: "SOC-01", active: true }],
        branches: [{ code: "SUC-01", society_code: "SOC-01", active: true }],
        cost_centers: [{ code: "CC-01", branch_code: "SUC-01", society_code: "SOC-01", active: true }]
      },
      accounting_numbering: [{ document_type: "AJ", prefix: "SI", next_number: 1, active: true }]
    }
  };
}

async function withStubbedPrisma(overrides, fn) {
  const prisma = require("../src/core/prisma");
  const originals = new Map();
  for (const [key, value] of Object.entries(overrides)) {
    originals.set(key, prisma[key]);
    prisma[key] = value;
  }
  try {
    return await fn(prisma);
  } finally {
    for (const [key, value] of originals) {
      if (value === undefined) delete prisma[key];
      else prisma[key] = value;
    }
  }
}

test("contabilizar saldos iniciales resuelve config.accounting del tenant sin ReferenceError", async () => {
  const buffer = await createOpeningBalancesTemplate();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.getWorksheet("Saldos iniciales");
  sheet.addRow(["2026-01-31", "110505", "CC-01", "SUC-01", 100, "NIT-1"]);
  sheet.addRow(["2026-01-31", "220505", "CC-01", "SUC-01", -100, "NIT-1"]);
  const edited = await workbook.xlsx.writeBuffer();

  const config = tenantConfigWithNumbering();
  const accounts = [
    { id: 1, code: "110505", name: "Caja", active: true, allows_tx: true },
    { id: 2, code: "220505", name: "Proveedores", active: true, allows_tx: true }
  ];
  const parties = [{ id: 9, tax_id: "NIT-1", active: true }];
  const { tx, auditLogs } = openingBalanceTxClient({ config, accounts, parties });
  const uniqueFixtureTenantId = `tenant-opening-balances-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  let readConfigCalls = 0;
  let preparedRows;
  let result;
  try {
    ({ preparedRows, result } = await withStubbedPrisma({
      tenant: { findUnique: async () => { readConfigCalls += 1; return { id: uniqueFixtureTenantId, config }; } },
      $transaction: (fn) => fn(tx)
    }, async () => {
      // Post primero: cachea el tenant; un prepare previo haria que el post no leyera config.
      const posted = await postOpeningBalancesWorkbook(uniqueFixtureTenantId, 7, edited);
      const prepared = await prepareOpeningBalanceRows(tx, uniqueFixtureTenantId, await parseOpeningBalancesWorkbook(edited));
      return { preparedRows: prepared, result: posted };
    }));
  } finally {
    const { invalidateTenantCache } = require("../src/core/tenantCache");
    await invalidateTenantCache(uniqueFixtureTenantId);
  }

  assert.equal(preparedRows.lines.length, 2);
  assert.ok(readConfigCalls >= 1);
  assert.equal(tx.numberingLocks.length, 2);
  for (const [, lockKey] of tx.numberingLocks) {
    assert.equal(lockKey, `${uniqueFixtureTenantId}:accounting-numbering`);
  }
  assert.equal(result.valid, true);
  assert.equal(result.lines, 2);
  assert.equal(result.total_debit, 100);
  assert.equal(result.total_credit, 100);
  assert.match(result.reference, /^SI-[0-9A-F]{24}$/);
  assert.equal(result.accounting_document.lines.length, 2);
  assert.equal(result.accounting_document.full_number, "SI-000001");
  assert.equal(auditLogs.length, 1);
  assert.equal(auditLogs[0].entity, "CntCabdoc");
});

