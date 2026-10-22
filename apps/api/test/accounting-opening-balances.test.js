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
  matchOpeningBalanceCode,
  resolveOpeningBalanceAccount,
  resolveOpeningBalanceCenter
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
  assert.match(service, /account_code: account\.code, branch_code: branch\.code, cost_center_code: center\.code/);
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
