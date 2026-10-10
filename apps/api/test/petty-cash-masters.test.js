const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

process.env.DISABLE_REDIS = "true";

// Helpers puros del modulo real (no tocan base de datos).
const pettyCash = require("../src/modules/petty-cash/service");
const schema = require("../src/modules/petty-cash/schema");

// === Cargador con prisma falso (mismo patron que purchases-supplier-flow.test.js) ===

function fakePrisma({ accounts = [], parties = [], concepts = [], boxes = [] } = {}) {
  const calls = [];
  const custodianRoles = ["supplier", "employee"];
  const matchesRole = (party) => party.type && custodianRoles.includes(party.type);

  const findAccount = async ({ where }) => {
    calls.push({ op: "account.findFirst", where });
    return accounts.find((account) => account.code === where.code) || null;
  };

  return {
    calls,
    runWithTenant: (_tenantId, callback) => callback(),
    account: {
      findFirst: findAccount,
      findMany: async ({ where }) => {
        calls.push({ op: "account.findMany", where });
        return accounts.filter((account) => where.code.in.includes(account.code)
          && (!where.type || account.type === where.type)
          && account.active !== false && account.allows_tx !== false);
      }
    },
    party: {
      findFirst: async ({ where }) => {
        calls.push({ op: "party.findFirst", where });
        return parties.find((party) => party.id === where.id && party.active !== false && matchesRole(party)) || null;
      },
      findMany: async ({ where }) => {
        calls.push({ op: "party.findMany", where });
        return parties.filter((party) => where.id.in.includes(party.id) && party.active !== false);
      }
    },
    pettyCashConcept: {
      findFirst: async ({ where }) => {
        calls.push({ op: "pettyCashConcept.findFirst", where });
        return concepts.find((row) => (where.id ? (where.id.not ? row.id !== where.id.not : row.id === where.id) : row.code === where.code)) || null;
      },
      create: async ({ data }) => {
        calls.push({ op: "pettyCashConcept.create", data });
        const created = { id: 1, tenant_id: "t-1", active: true, ...data };
        concepts.push(created);
        return created;
      },
      update: async ({ where, data }) => {
        calls.push({ op: "pettyCashConcept.update", where, data });
        const row = concepts.find((item) => item.id === where.id);
        Object.assign(row, data);
        return row;
      }
    },
    pettyCashBox: {
      findFirst: async ({ where }) => {
        calls.push({ op: "pettyCashBox.findFirst", where });
        return boxes.find((row) => (where.id ? (where.id.not ? row.id !== where.id.not : row.id === where.id) : row.code === where.code)) || null;
      },
      create: async ({ data }) => {
        calls.push({ op: "pettyCashBox.create", data });
        const created = { id: 10, tenant_id: "t-1", active: true, ...data };
        boxes.push(created);
        return created;
      },
      update: async ({ where, data }) => {
        calls.push({ op: "pettyCashBox.update", where, data });
        const row = boxes.find((item) => item.id === where.id);
        Object.assign(row, data);
        return row;
      }
    }
  };
}

function fakeAccounting({
  vatMasters = [
    { code: "COMPRAS-19", percent: 19, account_code: "2408", scope: "purchases", active: true },
    { code: "COMPRAS-0", percent: 0, account_code: "2408", scope: "purchases", active: true },
    { code: "COMPRAS-5", percent: 5, account_code: "2408", scope: "purchases", active: false }
  ],
  tree = {
    societies: [{ code: "SOC-01", name: "Sociedad principal", active: true }],
    branches: [{ code: "B-01", name: "Bogota", society_code: "SOC-01", active: true }],
    cost_centers: [{ code: "CC-10", name: "Operaciones", branch_code: "B-01", society_code: "SOC-01", active: true }]
  }
} = {}) {
  return {
    getVatMasters: async (_tenantId, scope = "purchases") => vatMasters.filter((row) => (row.scope || "purchases") === scope),
    getOrganizationTree: async () => tree
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

const EXPENSE_ACCOUNT = { id: 501, code: "519505", name: "Peajes", type: "expense", active: true, allows_tx: true };
const CASH_ACCOUNT = { id: 101, code: "110505", name: "Caja menor", type: "asset", active: true, allows_tx: true };
const ADVANCE_ACCOUNT = { id: 130, code: "133001", name: "Anticipos a terceros", type: "asset", active: true, allows_tx: true };
const INVENTORY_ASSET = { id: 140, code: "143501", name: "Mercancias", type: "asset", active: true, allows_tx: true };
const CUSTODIAN = { id: 77, name: "Juan Perez", legal_name: "Juan Perez SAS", type: "employee", active: true };

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

// === (a) Helpers puros ===

test("normalizeAdvancePolicy normaliza el bloqueo cuando la caja no usa anticipos", () => {
  // Caso incoherente: sin anticipo no tiene sentido bloquear segundos anticipos -> se normaliza.
  assert.deepEqual(pettyCash.normalizeAdvancePolicy(false, true), { require_advance: false, block_unliquidated_advance: false });
  assert.deepEqual(pettyCash.normalizeAdvancePolicy(undefined, true), { require_advance: false, block_unliquidated_advance: false });
  assert.deepEqual(pettyCash.normalizeAdvancePolicy(false, false), { require_advance: false, block_unliquidated_advance: false });
  // Anticipo obligatorio con varios anticipos abiertos permitidos: combinacion valida, se respeta.
  assert.deepEqual(pettyCash.normalizeAdvancePolicy(true, false), { require_advance: true, block_unliquidated_advance: false });
  assert.deepEqual(pettyCash.normalizeAdvancePolicy(true, true), { require_advance: true, block_unliquidated_advance: true });
  // Default del esquema Prisma: si exige anticipo y no se dice nada, se bloquea el segundo.
  assert.deepEqual(pettyCash.normalizeAdvancePolicy(true, undefined), { require_advance: true, block_unliquidated_advance: true });
});

test("assertMonthlyLimit rechaza cero y negativos con BOX_LIMIT_INVALID", () => {
  assert.equal(pettyCash.assertMonthlyLimit(undefined), null);
  assert.equal(pettyCash.assertMonthlyLimit(null), null);
  assert.equal(pettyCash.assertMonthlyLimit(1500), 1500);
  assert.equal(pettyCash.assertMonthlyLimit(1234.567), 1234.57);
  assertThrowsCode(() => pettyCash.assertMonthlyLimit(0), 400, "BOX_LIMIT_INVALID");
  assertThrowsCode(() => pettyCash.assertMonthlyLimit(-10), 400, "BOX_LIMIT_INVALID");
  assertThrowsCode(() => pettyCash.assertMonthlyLimit("abc"), 400, "BOX_LIMIT_INVALID");
});

test("assertVatMaster acepta null como 'sin IVA sugerido' y rechaza codigos inexistentes o inactivos", () => {
  const list = [
    { code: "COMPRAS-19", active: true },
    { code: "COMPRAS-5", active: false }
  ];
  assert.equal(pettyCash.assertVatMaster(list, null), null);
  assert.equal(pettyCash.assertVatMaster(list, ""), null);
  assert.equal(pettyCash.assertVatMaster(list, " compras-19 "), "COMPRAS-19");
  assertThrowsCode(() => pettyCash.assertVatMaster(list, "COMPRAS-99"), 400, "VAT_MASTER_NOT_FOUND");
  assertThrowsCode(() => pettyCash.assertVatMaster(list, "COMPRAS-5"), 400, "VAT_MASTER_NOT_FOUND");
});

test("assertBoxOrganizationReferences valida sucursal y centro de costo contra el arbol contable", () => {
  const tree = { branches: [{ code: "B-01", active: true }], cost_centers: [{ code: "CC-10", branch_code: "B-01", active: true }] };
  assert.deepEqual(pettyCash.assertBoxOrganizationReferences(tree, null, null), { branch_code: null, cost_center_code: null });
  assert.deepEqual(pettyCash.assertBoxOrganizationReferences(tree, " B-01 ", "CC-10"), { branch_code: "B-01", cost_center_code: "CC-10" });
  assertThrowsCode(() => pettyCash.assertBoxOrganizationReferences(tree, "B-99", null), 400, "ORGANIZATION_REFERENCE_INVALID");
  assertThrowsCode(() => pettyCash.assertBoxOrganizationReferences(tree, null, "CC-99"), 400, "ORGANIZATION_REFERENCE_INVALID");
  // Centro de costo que existe pero pertenece a otra sucursal.
  assertThrowsCode(() => pettyCash.assertBoxOrganizationReferences(
    { branches: [{ code: "B-01", active: true }, { code: "B-02", active: true }], cost_centers: [{ code: "CC-10", branch_code: "B-01", active: true }] },
    "B-02", "CC-10"
  ), 400, "ORGANIZATION_REFERENCE_INVALID");
  // Sucursal inactiva no sirve.
  assertThrowsCode(() => pettyCash.assertBoxOrganizationReferences({ branches: [{ code: "B-01", active: false }], cost_centers: [] }, "B-01", null), 400, "ORGANIZATION_REFERENCE_INVALID");
});

test("assertExpenseAccount exige cuenta de gasto activa y movible", () => {
  assert.equal(pettyCash.assertExpenseAccount(EXPENSE_ACCOUNT, "519505").id, 501);
  assertThrowsCode(() => pettyCash.assertExpenseAccount(null, "519505"), 400, "CONCEPT_ACCOUNT_INVALID");
  assertThrowsCode(() => pettyCash.assertExpenseAccount({ ...EXPENSE_ACCOUNT, type: "asset" }, "110505"), 400, "CONCEPT_ACCOUNT_INVALID");
  assertThrowsCode(() => pettyCash.assertExpenseAccount({ ...EXPENSE_ACCOUNT, active: false }, "519505"), 400, "CONCEPT_ACCOUNT_INVALID");
  assertThrowsCode(() => pettyCash.assertExpenseAccount({ ...EXPENSE_ACCOUNT, allows_tx: false }, "519505"), 400, "CONCEPT_ACCOUNT_INVALID");
});

test("assertBoxAccount y assertBoxAdvanceAccount exigen prefijos PUC 11 y 13", () => {
  assert.equal(pettyCash.assertBoxAccount(CASH_ACCOUNT, "110505").code, "110505");
  assert.equal(pettyCash.assertBoxAdvanceAccount(ADVANCE_ACCOUNT, "133001").code, "133001");
  assertThrowsCode(() => pettyCash.assertBoxAccount(INVENTORY_ASSET, "143501"), 400, "BOX_ACCOUNT_INVALID");
  assertThrowsCode(() => pettyCash.assertBoxAdvanceAccount(CASH_ACCOUNT, "110505"), 400, "BOX_ADVANCE_ACCOUNT_INVALID");
  // El PUC de referencia 1330 no se asume: si no viene, error explicito.
  assertThrowsCode(() => pettyCash.assertBoxAdvanceAccount(null, ""), 400, "BOX_ADVANCE_ACCOUNT_INVALID");
});

test("custodianPartyWhere reutiliza partyRoleWhere de proveedor y empleado", () => {
  const where = pettyCash.custodianPartyWhere();
  assert.deepEqual(where.OR, [
    { type: "supplier" }, { metadata: { path: ["role_flags", "supplier"], equals: true } },
    { type: "employee" }, { metadata: { path: ["role_flags", "employee"], equals: true } }
  ]);
  assert.deepEqual(pettyCash.CUSTODIAN_PARTY_ROLES, ["supplier", "employee"]);
});

test("boxReadiness informa en espanol que falta para poder girar anticipos", () => {
  const base = { id: 10, code: "CM-01", account_id: 101, advance_account_code: "133001" };
  const notReady = pettyCash.boxReadiness(base, { advanceAccount: ADVANCE_ACCOUNT, custodian: null });
  assert.equal(notReady.ready_for_advances, false);
  assert.equal(notReady.warnings.length, 1);
  assert.match(notReady.warnings[0], /custodio/i);

  const ready = pettyCash.boxReadiness(base, { advanceAccount: ADVANCE_ACCOUNT, custodian: CUSTODIAN });
  assert.equal(ready.ready_for_advances, true);
  assert.deepEqual(ready.warnings, []);

  const broken = pettyCash.boxReadiness({ ...base, account_id: null }, {});
  assert.equal(broken.ready_for_advances, false);
  assert.equal(broken.warnings.length, 3);
  assertThrowsCode(() => pettyCash.assertBoxReadyForAdvances(base, { custodian: null }), 422, "BOX_NOT_READY_FOR_ADVANCES");
  assert.equal(pettyCash.assertBoxReadyForAdvances(base, { custodian: CUSTODIAN, advanceAccount: ADVANCE_ACCOUNT }).ready_for_advances, true);
});

test("custodianDisplayName prefiere la razon social del tercero", () => {
  assert.equal(pettyCash.custodianDisplayName(CUSTODIAN), "Juan Perez SAS");
  assert.equal(pettyCash.custodianDisplayName({ name: "Ana Gomez", legal_name: "  " }), "Ana Gomez");
  assert.equal(pettyCash.custodianDisplayName(null), null);
});

test("los normalizadores separan codigos de maestro (mayusculas) de codigos de cuenta (solo trim)", () => {
  assert.equal(pettyCash.upperCode("  cm-01 "), "CM-01");
  assert.equal(pettyCash.trimCode("  519505 "), "519505");
  assert.equal(pettyCash.trimCode("  b-01 "), "b-01");
  assert.equal(pettyCash.nullableText("   "), null);
  assert.equal(pettyCash.nullableText(" nota "), "nota");
  assert.deepEqual(pettyCash.activeRows([{ active: false }, { active: true }, {}]), [{ active: true }, {}]);
  assert.equal(pettyCash.round(1.005), 1.01);
});

// === (b) Concepto con cuenta que no es de gasto ===

test("un concepto cuya cuenta no es de gasto falla con CONCEPT_ACCOUNT_INVALID", async () => {
  const prisma = fakePrisma({ accounts: [CASH_ACCOUNT, EXPENSE_ACCOUNT] });
  const { service, restore } = loadPettyCashService(prisma, fakeAccounting());
  try {
    const error = await assertRejectsCode(
      service.saveConcept("t-1", 9, { code: "PEAJE", name: "Peajes", account_code: "110505" }),
      400, "CONCEPT_ACCOUNT_INVALID"
    );
    assert.match(error.message, /gasto/i);
    assert.ok(!prisma.calls.some((call) => call.op === "pettyCashConcept.create"));
  } finally { restore(); }
});

test("el concepto valida default_vat_code contra el maestro de IVA de compras", async () => {
  const prisma = fakePrisma({ accounts: [EXPENSE_ACCOUNT] });
  const { service, restore } = loadPettyCashService(prisma, fakeAccounting());
  try {
    await assertRejectsCode(
      service.saveConcept("t-1", 9, { code: "PEAJE", name: "Peajes", account_code: "519505", default_vat_code: "COMPRAS-99" }),
      400, "VAT_MASTER_NOT_FOUND"
    );
    const created = await service.saveConcept("t-1", 9, { code: "PEAJE", name: " Peajes ", account_code: "519505", default_vat_code: " compras-19 " });
    assert.equal(created.code, "PEAJE");
    assert.equal(created.name, "Peajes");
    assert.equal(created.account_id, 501);
    assert.equal(created.account_code, "519505");
    assert.equal(created.default_vat_code, "COMPRAS-19");
    assert.equal(created.requires_supplier, false);
    assert.equal(created.requires_invoice_reference, false);
  } finally { restore(); }
});

test("default_vat_code nulo se persiste como null (sin IVA sugerido)", async () => {
  const prisma = fakePrisma({ accounts: [EXPENSE_ACCOUNT] });
  const { service, restore } = loadPettyCashService(prisma, fakeAccounting());
  try {
    const created = await service.saveConcept("t-1", 9, { code: "UTILES", name: "Utiles", account_code: "519505", default_vat_code: null, requires_supplier: true, requires_invoice_reference: true });
    assert.equal(created.default_vat_code, null);
    assert.equal(created.requires_supplier, true);
    assert.equal(created.requires_invoice_reference, true);
  } finally { restore(); }
});

test("el codigo de concepto duplicado responde 409 CONCEPT_CODE_TAKEN", async () => {
  const prisma = fakePrisma({ accounts: [EXPENSE_ACCOUNT], concepts: [{ id: 5, code: "PEAJE", name: "Peajes", active: true }] });
  const { service, restore } = loadPettyCashService(prisma, fakeAccounting());
  try {
    const error = await assertRejectsCode(service.saveConcept("t-1", 9, { code: "peaje", name: "Otro", account_code: "519505" }), 409, "CONCEPT_CODE_TAKEN");
    assert.match(error.message, /PEAJE/);
  } finally { restore(); }
});

test("los conceptos se desactivan de forma logica, nunca con delete fisico", async () => {
  const prisma = fakePrisma({ accounts: [EXPENSE_ACCOUNT], concepts: [{ id: 5, code: "PEAJE", name: "Peajes", active: true, account_code: "519505" }] });
  const { service, restore } = loadPettyCashService(prisma, fakeAccounting());
  try {
    const deactivated = await service.setConceptActive("t-1", 5, false);
    assert.equal(deactivated.active, false);
    const activated = await service.setConceptActive("t-1", 5, true);
    assert.equal(activated.active, true);
    assert.ok(!prisma.calls.some((call) => /delete/i.test(call.op)));
    assert.ok(prisma.calls.some((call) => call.op === "pettyCashConcept.update"));
  } finally { restore(); }
});

test("el maestro de conceptos usa __includeInactive y no escribe el filtro de tenant a mano", async () => {
  const prisma = fakePrisma({ accounts: [EXPENSE_ACCOUNT], concepts: [{ id: 5, code: "PEAJE", name: "Peajes", active: false }] });
  const { service, restore } = loadPettyCashService(prisma, fakeAccounting());
  try {
    const found = await service.getConcept("t-1", 5);
    assert.equal(found.id, 5);
    const lookup = prisma.calls.find((call) => call.op === "pettyCashConcept.findFirst");
    assert.equal(lookup.where.__includeInactive, true);
    assert.equal("tenant_id" in lookup.where, false, "el filtro de tenant lo inyecta runWithTenant, no el servicio");
    await service.saveConcept("t-1", 9, { code: "OTRO", name: "Otro", account_code: "519505" });
    const write = prisma.calls.find((call) => call.op === "pettyCashConcept.create");
    assert.equal("tenant_id" in write.data, false, "el servicio nunca escribe tenant_id a mano");
    await assertRejectsCode(service.getConcept("t-1", 999), 404, "CONCEPT_NOT_FOUND");
  } finally { restore(); }
});

// === (c) y (d) Cuentas de la caja menor ===

test("una caja cuya cuenta de efectivo no inicia por 11 falla con BOX_ACCOUNT_INVALID", async () => {
  const prisma = fakePrisma({ accounts: [INVENTORY_ASSET, ADVANCE_ACCOUNT, CASH_ACCOUNT], parties: [CUSTODIAN] });
  const { service, restore } = loadPettyCashService(prisma, fakeAccounting());
  try {
    const error = await assertRejectsCode(service.saveBox("t-1", 9, {
      code: "CM-01", name: "Goliat", account_code: "143501", advance_account_code: "133001"
    }), 400, "BOX_ACCOUNT_INVALID");
    assert.match(error.message, /empezar por 11/);
    assert.ok(!prisma.calls.some((call) => call.op === "pettyCashBox.create"));
  } finally { restore(); }
});

test("una cuenta de anticipo que no inicia por 13 falla con BOX_ADVANCE_ACCOUNT_INVALID", async () => {
  const prisma = fakePrisma({ accounts: [CASH_ACCOUNT, ADVANCE_ACCOUNT], parties: [CUSTODIAN] });
  const { service, restore } = loadPettyCashService(prisma, fakeAccounting());
  try {
    const error = await assertRejectsCode(service.saveBox("t-1", 9, {
      code: "CM-01", name: "Goliat", account_code: "110505", advance_account_code: "110505"
    }), 400, "BOX_ADVANCE_ACCOUNT_INVALID");
    assert.match(error.message, /empezar por 13/);
    // Sin cuenta de anticipo explicita tampoco se asume el PUC 1330.
    await assertRejectsCode(service.saveBox("t-1", 9, {
      code: "CM-02", name: "Goliat 2", account_code: "110505", advance_account_code: ""
    }), 400, "BOX_ADVANCE_ACCOUNT_INVALID");
  } finally { restore(); }
});

test("un custodio inexistente, inactivo o sin rol falla con BOX_CUSTODIAN_INVALID", async () => {
  const customer = { id: 88, name: "Cliente SA", type: "customer", active: true };
  const prisma = fakePrisma({ accounts: [CASH_ACCOUNT, ADVANCE_ACCOUNT], parties: [customer] });
  const { service, restore } = loadPettyCashService(prisma, fakeAccounting());
  try {
    await assertRejectsCode(service.saveBox("t-1", 9, {
      code: "CM-01", name: "Goliat", account_code: "110505", advance_account_code: "133001", custodian_party_id: 77
    }), 400, "BOX_CUSTODIAN_INVALID");
    await assertRejectsCode(service.saveBox("t-1", 9, {
      code: "CM-01", name: "Goliat", account_code: "110505", advance_account_code: "133001", custodian_party_id: 88
    }), 400, "BOX_CUSTODIAN_INVALID");
  } finally { restore(); }
});

test("la caja se crea sin custodio, devuelve ready_for_advances en false y avisos en espanol", async () => {
  const prisma = fakePrisma({ accounts: [CASH_ACCOUNT, ADVANCE_ACCOUNT], parties: [CUSTODIAN] });
  const { service, restore } = loadPettyCashService(prisma, fakeAccounting());
  try {
    const created = await service.saveBox("t-1", 9, { code: "CM-01", name: "Goliat", account_code: "110505", advance_account_code: "133001" });
    assert.equal(created.custodian_party_id, null);
    assert.equal(created.custodian_name, null);
    assert.equal(created.ready_for_advances, false);
    assert.equal(created.warnings.length, 1);
    assert.match(created.warnings[0], /custodio/i);
    assert.ok(prisma.calls.some((call) => call.op === "pettyCashBox.create"), "la creacion no se bloquea por falta de custodio");
  } finally { restore(); }
});

test("con custodio y cuentas validas la caja queda lista para anticipos y copia el nombre del tercero", async () => {
  const prisma = fakePrisma({ accounts: [CASH_ACCOUNT, ADVANCE_ACCOUNT], parties: [CUSTODIAN] });
  const { service, restore } = loadPettyCashService(prisma, fakeAccounting());
  try {
    const created = await service.saveBox("t-1", 9, {
      code: "CM-01", name: "Goliat", account_code: "110505", advance_account_code: "133001",
      custodian_party_id: 77, monthly_limit: 2000000, branch_code: "B-01", cost_center_code: "CC-10"
    });
    assert.equal(created.ready_for_advances, true);
    assert.deepEqual(created.warnings, []);
    assert.equal(created.custodian_party_id, 77);
    assert.equal(created.custodian_name, "Juan Perez SAS");
    assert.equal(created.account_id, 101);
    assert.equal(created.account_code, "110505");
    assert.equal(created.advance_account_code, "133001");
    assert.equal(created.monthly_limit, 2000000);
    assert.equal(created.branch_code, "B-01");
    assert.equal(created.cost_center_code, "CC-10");
    assert.equal(created.created_by, 9);
  } finally { restore(); }
});

// === (e) Normalizacion de block_unliquidated_advance en el guardado real ===

test("guardar una caja sin anticipo obliga normaliza block_unliquidated_advance a false", async () => {
  const prisma = fakePrisma({ accounts: [CASH_ACCOUNT, ADVANCE_ACCOUNT], parties: [CUSTODIAN] });
  const { service, restore } = loadPettyCashService(prisma, fakeAccounting());
  try {
    const created = await service.saveBox("t-1", 9, {
      code: "CM-01", name: "Goliat", account_code: "110505", advance_account_code: "133001",
      require_advance: false, block_unliquidated_advance: true
    });
    assert.equal(created.require_advance, false);
    assert.equal(created.block_unliquidated_advance, false, "se devuelve normalizado, sin error");
  } finally { restore(); }
});

test("anticipo obligatorio con varios anticipos abiertos es una combinacion valida", async () => {
  const prisma = fakePrisma({ accounts: [CASH_ACCOUNT, ADVANCE_ACCOUNT], parties: [CUSTODIAN] });
  const { service, restore } = loadPettyCashService(prisma, fakeAccounting());
  try {
    const created = await service.saveBox("t-1", 9, {
      code: "CM-02", name: "Fotografia", account_code: "110505", advance_account_code: "133001",
      require_advance: true, block_unliquidated_advance: false
    });
    assert.equal(created.require_advance, true);
    assert.equal(created.block_unliquidated_advance, false);
  } finally { restore(); }
});

test("el limite mensual en cero se rechaza con BOX_LIMIT_INVALID", async () => {
  const prisma = fakePrisma({ accounts: [CASH_ACCOUNT, ADVANCE_ACCOUNT], parties: [CUSTODIAN] });
  const { service, restore } = loadPettyCashService(prisma, fakeAccounting());
  try {
    await assertRejectsCode(service.saveBox("t-1", 9, {
      code: "CM-03", name: "Goliat", account_code: "110505", advance_account_code: "133001", monthly_limit: 0
    }), 400, "BOX_LIMIT_INVALID");
  } finally { restore(); }
});

test("sucursal o centro de costo fuera del arbol organizacional falla con ORGANIZATION_REFERENCE_INVALID", async () => {
  const prisma = fakePrisma({ accounts: [CASH_ACCOUNT, ADVANCE_ACCOUNT], parties: [CUSTODIAN] });
  const { service, restore } = loadPettyCashService(prisma, fakeAccounting());
  try {
    await assertRejectsCode(service.saveBox("t-1", 9, {
      code: "CM-04", name: "Goliat", account_code: "110505", advance_account_code: "133001", branch_code: "B-99"
    }), 400, "ORGANIZATION_REFERENCE_INVALID");
    await assertRejectsCode(service.saveBox("t-1", 9, {
      code: "CM-05", name: "Goliat", account_code: "110505", advance_account_code: "133001", cost_center_code: "CC-99"
    }), 400, "ORGANIZATION_REFERENCE_INVALID");
  } finally { restore(); }
});

test("el codigo de caja duplicado responde 409 BOX_CODE_TAKEN", async () => {
  const prisma = fakePrisma({
    accounts: [CASH_ACCOUNT, ADVANCE_ACCOUNT],
    parties: [CUSTODIAN],
    boxes: [{ id: 3, code: "CM-01", name: "Goliat", active: true }]
  });
  const { service, restore } = loadPettyCashService(prisma, fakeAccounting());
  try {
    const error = await assertRejectsCode(service.saveBox("t-1", 9, {
      code: "cm-01", name: "Otra", account_code: "110505", advance_account_code: "133001"
    }), 409, "BOX_CODE_TAKEN");
    assert.match(error.message, /CM-01/);
  } finally { restore(); }
});

test("actualizar una caja hereda la politica ausente y conserva el borrado logico", async () => {
  const existing = {
    id: 3, code: "CM-01", name: "Goliat", active: false, account_code: "110505", account_id: 101,
    advance_account_code: "133001", custodian_party_id: 77, custodian_name: "Juan Perez SAS",
    branch_code: null, cost_center_code: null, monthly_limit: 500000,
    require_advance: true, block_unliquidated_advance: true, notes: "nota previa"
  };
  const prisma = fakePrisma({ accounts: [CASH_ACCOUNT, ADVANCE_ACCOUNT], parties: [CUSTODIAN], boxes: [existing] });
  const { service, restore } = loadPettyCashService(prisma, fakeAccounting());
  try {
    const updated = await service.saveBox("t-1", 9, { code: "CM-01", name: "Goliat norte", account_code: "110505", advance_account_code: "133001" }, 3);
    assert.equal(updated.name, "Goliat norte");
    assert.equal(updated.monthly_limit, 500000, "el limite vigente se conserva si no se envia");
    assert.equal(updated.require_advance, true, "la politica de anticipo vigente se conserva");
    assert.equal(updated.block_unliquidated_advance, true);
    assert.equal(updated.notes, "nota previa");
    assert.equal(updated.active, false, "no se reactiva de paso al editar");
    const activated = await service.setBoxActive("t-1", 3, true);
    assert.equal(activated.active, true);
    assert.equal(activated.ready_for_advances, true);
    assert.ok(!prisma.calls.some((call) => /delete/i.test(call.op)));
  } finally { restore(); }
});

test("listBoxes enriquece en lote sin N+1 y respeta include_inactive", async () => {
  const prisma = fakePrisma({ accounts: [CASH_ACCOUNT, ADVANCE_ACCOUNT], parties: [CUSTODIAN] });
  const { service, restore } = loadPettyCashService(prisma, fakeAccounting());
  try {
    prisma.pettyCashBox.findMany = async ({ where }) => {
      prisma.calls.push({ op: "pettyCashBox.findMany", where });
      return [{ id: 3, code: "CM-01", name: "Goliat", active: true, account_id: 101, advance_account_code: "133001", custodian_party_id: 77, monthly_limit: "2000000.00" }];
    };
    const rows = await service.listBoxes("t-1", { include_inactive: "true" });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].ready_for_advances, true);
    assert.equal(rows[0].monthly_limit, 2000000);
    assert.equal(prisma.calls.filter((call) => call.op === "account.findMany").length, 1);
    assert.equal(prisma.calls.filter((call) => call.op === "party.findMany").length, 1);
    assert.equal(prisma.calls.find((call) => call.op === "pettyCashBox.findMany").where.__includeInactive, true);
    assert.equal(pettyCash.includesInactive({}), false);
    assert.equal(pettyCash.includesInactive({ include_inactive: "true" }), true);
  } finally { restore(); }
});

// === Contratos de esquema y de rutas ===

test("los esquemas de body son cerrados y exigen los campos minimos", () => {
  assert.equal(schema.conceptBody.additionalProperties, false);
  assert.equal(schema.boxBody.additionalProperties, false);
  assert.deepEqual(schema.conceptBody.required, ["code", "name", "account_code"]);
  assert.deepEqual(schema.boxBody.required, ["code", "name", "account_code", "advance_account_code"]);
  // advance_account_code de la caja es obligatorio y de tipo string: no se acepta null.
  assert.deepEqual(schema.boxBody.properties.advance_account_code.type, "string");
  // monthly_limit admite 0 para que el servicio responda BOX_LIMIT_INVALID y no un 400 generico.
  assert.deepEqual(schema.boxBody.properties.monthly_limit.type, ["number", "null"]);
  assert.equal(schema.boxBody.properties.monthly_limit.minimum, 0);
  assert.deepEqual(schema.boxBody.properties.custodian_party_id.type, ["integer", "null"]);
  // Campos de solo lectura fuera del body.
  for (const readOnly of ["id", "tenant_id", "account_id", "created_by", "ready_for_advances", "warnings", "custodian_name"]) {
    assert.equal(readOnly in schema.boxBody.properties, false, `${readOnly} no debe aceptarse en el body`);
    assert.equal(readOnly in schema.conceptBody.properties, false, `${readOnly} no debe aceptarse en el body`);
  }
  assert.deepEqual(schema.idParams.properties.id, { type: "integer", minimum: 1 });
  assert.equal(schema.conceptUpdateSchema.params, schema.idParams);
  assert.equal(schema.boxUpdateSchema.params, schema.idParams);
  // activate/deactivate no declaran body: evita FST_ERR_CTP_EMPTY_JSON_BODY en el cliente.
  assert.equal("body" in schema.idParamSchema, false);
});

function readRoutes() {
  return fs.readFileSync(path.join(__dirname, "../src/modules/petty-cash/routes.js"), "utf8");
}

function routeLine(source, method, url) {
  const line = source.split(/\r?\n/).find((row) => row.includes(`fastify.${method}("${url}"`));
  assert.ok(line, `falta la ruta ${method.toUpperCase()} ${url}`);
  return line;
}

test("routes registra los 12 endpoints de maestros con el permiso correcto", () => {
  const source = readRoutes();
  const readRoutesList = [
    ["get", "/petty-cash/concepts"], ["get", "/petty-cash/concepts/:id"],
    ["get", "/petty-cash/boxes"], ["get", "/petty-cash/boxes/:id"]
  ];
  const writeRoutesList = [
    ["post", "/petty-cash/concepts"], ["put", "/petty-cash/concepts/:id"],
    ["post", "/petty-cash/concepts/:id/activate"], ["post", "/petty-cash/concepts/:id/deactivate"],
    ["post", "/petty-cash/boxes"], ["put", "/petty-cash/boxes/:id"],
    ["post", "/petty-cash/boxes/:id/activate"], ["post", "/petty-cash/boxes/:id/deactivate"]
  ];
  for (const [method, url] of readRoutesList) assert.match(routeLine(source, method, url), /preHandler: read/, `${method} ${url} debe usar read`);
  for (const [method, url] of writeRoutesList) assert.match(routeLine(source, method, url), /preHandler: write/, `${method} ${url} debe usar write`);
  assert.equal(readRoutesList.length + writeRoutesList.length, 12);
  assert.match(source, /fastify\.addHook\("preHandler", fastify\.authenticate\)/);
  assert.match(source, /fastify\.addHook\("preHandler", tenancy\)/);
});

test("routes reutiliza el modulo de permisos accounting y no inventa petty-cash", () => {
  const source = readRoutes();
  assert.match(source, /requirePermission\("accounting", "read"\)/);
  assert.match(source, /requirePermission\("accounting", "write"\)/);
  assert.doesNotMatch(source, /requirePermission\("petty-cash"/);
  // MODULE_CODES no se toca en T2: sigue sin conocer "petty-cash".
  const rbac = fs.readFileSync(path.join(__dirname, "../src/middleware/rbac.js"), "utf8");
  assert.doesNotMatch(rbac, /"petty-cash":\s*\[/);
});

test("las rutas quedan bajo /petty-cash para que la auditoria registre el modulo", () => {
  const source = readRoutes();
  const urls = source.match(/fastify\.(?:get|post|put|patch|delete)\("([^"]+)"/g) || [];
  // 12 de maestros (T2) + 9 de anticipos y comprobantes (T3) + 3 de reporteria (T4).
  assert.equal(urls.length, 24);
  for (const url of urls) assert.match(url, /"\/petty-cash\//);
  // Sin DELETE fisico: el borrado es logico por POST activate/deactivate.
  assert.doesNotMatch(source, /fastify\.delete\(/);
});

test("server registra el modulo petty-cash con el prefijo global", () => {
  const server = fs.readFileSync(path.join(__dirname, "../server.js"), "utf8");
  assert.match(server, /"petty-cash"/);
  assert.match(server, /registerRoutes\("petty-cash", require\("\.\/src\/modules\/petty-cash\/routes"\), \{ prefix: "\/api\/v1" \}\)/);
});

test("los maestros quedan en SOFT_DELETE y fuera del borrado fisico", () => {
  const core = fs.readFileSync(path.join(__dirname, "../src/core/prisma.js"), "utf8");
  const softDelete = core.slice(core.indexOf("const SOFT_DELETE"), core.indexOf("const PHYSICAL_DELETE_ALLOWED"));
  assert.match(softDelete, /"PettyCashConcept", "PettyCashBox"/);
  const physical = core.slice(core.indexOf("const PHYSICAL_DELETE_ALLOWED"));
  assert.doesNotMatch(physical.slice(0, physical.indexOf("];")), /PettyCash/);
  const tenantModels = core.slice(core.indexOf("const TENANT_MODELS"), core.indexOf("const WRITE_OPS"));
  assert.match(tenantModels, /"PettyCashConcept", "PettyCashBox", "PettyCashAdvance", "PettyCashVoucher", "PettyCashVoucherLine"/);
});

test("la reporteria de T4 queda expuesta bajo /petty-cash/reports (solo lectura)", () => {
  const service = fs.readFileSync(path.join(__dirname, "../src/modules/petty-cash/service.js"), "utf8");
  const routes = readRoutes();
  // T4 expone los tres reportes GET: la auditoria sigue registrando el modulo petty-cash.
  assert.match(routes, /fastify\.get\("\/petty-cash\/reports\/summary"/);
  assert.match(routes, /fastify\.get\("\/petty-cash\/reports\/detail"/);
  assert.match(routes, /fastify\.get\("\/petty-cash\/reports\/boxes-ranking"/);
  // El marcador reservado desaparece: la reporteria ya no es alcance futuro.
  assert.doesNotMatch(service, /=== Reservado T4/);
  // createAccountingDocument abre su propia transaccion: T3 contabiliza dentro de la del modulo.
  assert.doesNotMatch(service, /accounting\.createAccountingDocument\(/);
});
