// tenantCache exige REDIS_URL al importar el modulo.
process.env.DISABLE_REDIS = "true";
process.env.REDIS_DISABLED = "true";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const test = require("node:test");
const ExcelJS = require("exceljs");
const prisma = require("../src/core/prisma");
const {
  createPygBudgetTemplate,
  parsePygBudgetWorkbook,
  buildBudgetImportPreview,
  validatePygBudgetWorkbook,
  importPygBudgetWorkbook,
  periodCellValue,
  accountCodeCellValue,
  parseBudgetAmount,
  canonicalKey,
  TEMPLATE_HEADERS,
  MAX_BUDGET_IMPORT_ROWS
} = require("../src/modules/accounting/pyg-budget-import");

const sha256 = (buffer) => crypto.createHash("sha256").update(buffer).digest("hex");

async function buildWorkbook(rows, headers = TEMPLATE_HEADERS) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Presupuesto");
  sheet.addRow(["Plantilla de presupuesto mensual"]);
  sheet.addRow(["Semantica MENSUAL: cada fila planea un unico mes"]);
  sheet.addRow(["Cargue valores positivos"]);
  sheet.addRow(headers);
  for (const row of rows) sheet.addRow([row.periodo, row.cuenta, row.centro_costo, row.sucursal, row.presupuesto]);
  return workbook.xlsx.writeBuffer();
}

const TREE = {
  branches: [
    { code: "NORTE", name: "Norte", active: true, society_code: "SOC-01" },
    { code: "SUR", name: "Sur", active: true, society_code: "SOC-01" }
  ],
  cost_centers: [
    { code: "CC-ADMIN", name: "Admin Norte", active: true, branch_code: "NORTE", society_code: "SOC-01" },
    { code: "CC-VENTAS", name: "Ventas Sur", active: true, branch_code: "SUR", society_code: "SOC-01" }
  ]
};

function account(id, code, extra = {}) {
  return { id, code, name: `Cuenta ${code}`, active: true, allows_tx: true, ...extra };
}

function accountClient(accounts) {
  const calls = { accountQueries: [] };
  return {
    calls,
    account: { async findMany({ where }) { calls.accountQueries.push(where); return accounts; } }
  };
}

function rawRow(periodo, cuenta, centroCosto, sucursal, presupuesto, excelRow) {
  return { periodo, cuenta, centro_costo: centroCosto, sucursal, presupuesto, excel_row: excelRow };
}

// ---------------------------------------------------------------- plantilla y parseo

test("plantilla de presupuesto conserva encabezados, formato de texto e instrucciones en espanol simple", async () => {
  const buffer = await createPygBudgetTemplate();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.getWorksheet("Presupuesto");
  assert.ok(sheet);
  assert.deepEqual(sheet.getRow(4).values.slice(1), TEMPLATE_HEADERS);
  assert.equal(sheet.getColumn(1).numFmt, "@");
  assert.equal(sheet.getColumn(2).numFmt, "@");
  assert.equal(sheet.getColumn(3).numFmt, "@");
  assert.equal(sheet.getColumn(4).numFmt, "@");
  assert.equal(sheet.getColumn(5).numFmt, "#,##0.00");
  const instructions = [2, 3].map((row) => String(sheet.getRow(row).getCell(1).value));
  assert.match(instructions[0], /AAAA-MM/);
  assert.match(instructions[0], /no es una fecha de corte/);
  assert.match(instructions[1], /clases 4 a 7/);
  assert.match(instructions[1], /no agregue una columna de tercero/);
  // Sin jerga tecnica en la copia visible para el usuario.
  assert.doesNotMatch(instructions.join(" "), /Semantica|semantica|PYG firma|por naturaleza de cuenta/);
  assert.ok(!TEMPLATE_HEADERS.includes("tercero"));
  assert.equal(sheet.getRow(4).font.bold, true);
});

test("parseo lee filas de datos desde la fila 5 y conserva el numero de fila Excel", async () => {
  const buffer = await buildWorkbook([
    { periodo: "2026-05", cuenta: "4135", centro_costo: "CC-ADMIN", sucursal: "NORTE", presupuesto: 2500 }
  ]);
  const rows = await parsePygBudgetWorkbook(buffer);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].excel_row, 5);
  assert.equal(rows[0].periodo, "2026-05");
});

test("parseo rechaza plantillas con encabezados alterados", async () => {
  const buffer = await buildWorkbook([], ["periodo", "cuenta", "otro", "sucursal", "presupuesto"]);
  await assert.rejects(parsePygBudgetWorkbook(buffer), (error) => error.statusCode === 422 && error.code === "INVALID_BUDGET_TEMPLATE");
});

test("parseo rechaza archivos vacios y sin hojas legibles", async () => {
  await assert.rejects(parsePygBudgetWorkbook(await buildWorkbook([])), (error) => error.statusCode === 400 && error.code === "EMPTY_BUDGET_FILE");
  await assert.rejects(parsePygBudgetWorkbook(Buffer.from("no es un excel")), (error) => error.statusCode === 422 && error.code === "INVALID_BUDGET_FILE");
});

test("parseo rechaza archivos que exceden el maximo de filas", async () => {
  const rows = Array.from({ length: MAX_BUDGET_IMPORT_ROWS + 1 }, (_, index) => ({
    periodo: "2026-05", cuenta: `4${String(index).padStart(3, "0")}`, centro_costo: "CC-ADMIN", sucursal: "NORTE", presupuesto: 1
  }));
  const buffer = await buildWorkbook(rows);
  await assert.rejects(parsePygBudgetWorkbook(buffer), (error) => error.statusCode === 413 && error.code === "BUDGET_FILE_TOO_LARGE");
});

test("helpers de celdas normalizan periodo, cuenta y clave canonica", () => {
  assert.equal(periodCellValue(new Date("2026-05-10T00:00:00.000Z")), "2026-05");
  assert.equal(accountCodeCellValue(4135), "4135");
  assert.equal(accountCodeCellValue("4135.0"), "4135");
  assert.equal(accountCodeCellValue("  110505  "), "110505");
  assert.equal(accountCodeCellValue({ formula: "LEFT(A5,4)", result: 4135 }), "4135");
  assert.equal(accountCodeCellValue({ richText: [{ text: "41" }, { text: "35" }] }), "4135");
  assert.equal(periodCellValue({ formula: "TEXT(A5,\"YYYY-MM\")", result: "2026-07" }), "2026-07");
  assert.equal(periodCellValue(new Date("2026-07-31T00:00:00.000Z")), "2026-07");
  assert.equal(periodCellValue({ error: "#VALUE!" }), "");
  assert.equal(accountCodeCellValue({ error: "#VALUE!" }), "");
  assert.equal(canonicalKey(" Norte "), "norte");
  assert.equal(canonicalKey(null), "");
});

test("presupuesto acepta formulas, texto con separadores y rechaza errores o valores no finitos", () => {
  assert.equal(parseBudgetAmount({ formula: "SUM(B5:B7)", result: 1500 }), 1500);
  assert.equal(parseBudgetAmount(2500.5), 2500.5);
  assert.equal(parseBudgetAmount("2500.50"), 2500.5);
  assert.equal(parseBudgetAmount("1.234,56"), 1234.56);
  assert.equal(parseBudgetAmount("1,234.56"), 1234.56);
  assert.equal(parseBudgetAmount("$ 1.500"), 1500);
  assert.ok(Number.isNaN(parseBudgetAmount({ error: "#VALUE!", result: undefined })));
  assert.ok(Number.isNaN(parseBudgetAmount(Infinity)));
  assert.ok(Number.isNaN(parseBudgetAmount("abc")));
  assert.ok(Number.isNaN(parseBudgetAmount("")));
  assert.ok(Number.isNaN(parseBudgetAmount(null)));
});

// ---------------------------------------------------------------- preview de validacion

test("preview resuelve cuentas, sucursal y centro de costo insensibles a mayusculas", async () => {
  const client = accountClient([account(10, "4135"), account(20, "110505")]);
  const preview = await buildBudgetImportPreview(client, "t1", TREE, [], [
    rawRow("2026-05", "4135", "cc-admin", "norte", "2500.5", 5)
  ]);
  assert.equal(preview.valid, true);
  assert.equal(preview.totals.valid_rows, 1);
  const row = preview.rows[0];
  assert.equal(row.status, "ok");
  assert.equal(row.account_id, 10);
  assert.equal(row.account_code, "4135");
  assert.equal(row.branch_code, "NORTE");
  assert.equal(row.cost_center_code, "CC-ADMIN");
  assert.equal(row.amount, 2500.5);
  assert.equal(row.amount_cents, 250050);
  assert.deepEqual(preview.periods, ["2026-05"]);
});

test("preview acumula errores por fila sin fallar en el primero", async () => {
  const client = accountClient([account(10, "4135"), account(20, "110505")]);
  const preview = await buildBudgetImportPreview(client, "t1", TREE, [], [
    rawRow("2026-13", "", "CC-ADMIN", "NORTE", -5, 5),
    rawRow("2026-05", "9999", "CC-ADMIN", "NORTE", "abc", 6)
  ]);
  assert.equal(preview.valid, false);
  assert.equal(preview.totals.error_rows, 2);
  const codes = (row) => row.errors.map((error) => error.code);
  assert.deepEqual(codes(preview.rows[0]).sort(), ["INVALID_PERIOD", "REQUIRED_ACCOUNT_CODE", "BUDGET_AMOUNT_NEGATIVE"].sort());
  assert.deepEqual(codes(preview.rows[1]).sort(), ["BUDGET_ACCOUNT_NOT_FOUND", "INVALID_BUDGET_AMOUNT"].sort());
});

test("preview exige sucursal y centro y detecta maestros inexistentes o ambiguos", async () => {
  const client = accountClient([account(10, "4135")]);
  const preview = await buildBudgetImportPreview(client, "t1", TREE, [], [
    rawRow("2026-05", "4135", "CC-ADMIN", "", 10, 5),
    rawRow("2026-05", "4135", "", "NORTE", 10, 6),
    rawRow("2026-05", "4135", "CC-X", "NORTE", 10, 7),
    rawRow("2026-05", "4135", "CC-ADMIN", "OESTE", 10, 8)
  ]);
  assert.deepEqual(preview.rows[0].errors.map((error) => error.code), ["REQUIRED_BRANCH"]);
  assert.deepEqual(preview.rows[1].errors.map((error) => error.code), ["REQUIRED_CENTER"]);
  assert.deepEqual(preview.rows[2].errors.map((error) => error.code), ["BUDGET_CENTER_NOT_FOUND"]);
  assert.deepEqual(preview.rows[3].errors.map((error) => error.code), ["BUDGET_BRANCH_NOT_FOUND"]);
});

test("preview rechaza codigos de cuenta y dimensiones ambiguos por mayusculas", async () => {
  const client = accountClient([account(1, "4135ABC"), account(2, "4135abc")]);
  const ambiguousTree = {
    branches: [{ code: "Mixta", active: true, society_code: "SOC-01" }, { code: "MIXTA", active: true, society_code: "SOC-01" }],
    cost_centers: [{ code: "CC-A", active: true, branch_code: "Mixta", society_code: "SOC-01" }]
  };
  const preview = await buildBudgetImportPreview(client, "t1", ambiguousTree, [], [
    rawRow("2026-05", "4135Abc", "CC-A", "mixta", 10, 5)
  ]);
  assert.deepEqual(preview.rows[0].errors.map((error) => error.code).sort(), ["BUDGET_ACCOUNT_AMBIGUOUS", "BUDGET_BRANCH_AMBIGUOUS"].sort());
  assert.equal(client.calls.accountQueries.length, 1, "la ambiguedad de cuentas nunca se resuelve con auditoria");
});

test("preview rechaza siempre dos PUC gemelas sin preferir ninguna por auditoria", async () => {
  const accounts = [account(1, "4135ABC", { name: "Importada por terceros" }), account(2, "4135abc", { name: "Creada en contabilidad" })];
  const client = accountClient(accounts);
  const preview = await buildBudgetImportPreview(client, "t1", TREE, [], [
    rawRow("2026-05", "4135abc", "CC-ADMIN", "NORTE", 10, 5)
  ]);
  assert.deepEqual(preview.rows[0].errors.map((error) => error.code), ["BUDGET_ACCOUNT_AMBIGUOUS"]);
  assert.equal(client.calls.accountQueries.length, 1, "la resolucion solo consulta el catalogo de cuentas");
});

test("preview trata celdas con error #VALUE! como vacias o no numericas y rechaza la fila", async () => {
  const client = accountClient([account(10, "4135")]);
  const preview = await buildBudgetImportPreview(client, "t1", TREE, [], [
    rawRow({ error: "#VALUE!" }, "4135", "CC-ADMIN", "NORTE", 10, 5),
    rawRow("2026-05", { error: "#VALUE!" }, "CC-ADMIN", "NORTE", 10, 6),
    rawRow("2026-05", "4135", "CC-ADMIN", "NORTE", { error: "#VALUE!" }, 7)
  ]);
  assert.deepEqual(preview.rows[0].errors.map((error) => error.code), ["INVALID_PERIOD"]);
  assert.deepEqual(preview.rows[1].errors.map((error) => error.code), ["REQUIRED_ACCOUNT_CODE"]);
  assert.deepEqual(preview.rows[2].errors.map((error) => error.code), ["INVALID_BUDGET_AMOUNT"]);
  assert.equal(preview.valid, false);
});

test("preview rechaza duplicados dentro del archivo citando la primera aparicion", async () => {
  const client = accountClient([account(10, "4135")]);
  const preview = await buildBudgetImportPreview(client, "t1", TREE, [], [
    rawRow("2026-05", "4135", "CC-ADMIN", "NORTE", 100, 5),
    rawRow("2026-05", "4135", "cc-admin", "norte", 200, 9)
  ]);
  assert.equal(preview.rows[0].status, "ok");
  assert.deepEqual(preview.rows[1].errors.map((error) => error.code), ["BUDGET_DUPLICATE_ROW"]);
  assert.match(preview.rows[1].errors[0].message, /primera aparicion fila 5/);
});

test("preview rechaza tuplas que ya existen en el almacen sin sobrescribir", async () => {
  const client = accountClient([account(10, "4135")]);
  const storeRows = [{ period: "2026-05", account_id: 10, branch_code: "NORTE", cost_center_code: "CC-ADMIN", amount: 100 }];
  const preview = await buildBudgetImportPreview(client, "t1", TREE, storeRows, [
    rawRow("2026-05", "4135", "CC-ADMIN", "NORTE", 200, 5)
  ]);
  assert.deepEqual(preview.rows[0].errors.map((error) => error.code), ["BUDGET_TUPLE_EXISTS"]);
  assert.match(preview.rows[0].errors[0].message, /no sobrescribe/);
  assert.equal(preview.valid, false);
});

test("preview aplica las validaciones del editor: activa, transaccional, clase PUC y jerarquia", async () => {
  const inactive = account(10, "4135", { active: false });
  const nonTx = account(11, "5105", { allows_tx: false });
  const classOne = account(12, "110505");
  const client = accountClient([inactive, nonTx, classOne, account(13, "6135")]);
  const preview = await buildBudgetImportPreview(client, "t1", TREE, [], [
    rawRow("2026-05", "4135", "CC-ADMIN", "NORTE", 10, 5),
    rawRow("2026-05", "5105", "CC-ADMIN", "NORTE", 10, 6),
    rawRow("2026-05", "110505", "CC-ADMIN", "NORTE", 10, 7),
    rawRow("2026-05", "6135", "CC-VENTAS", "NORTE", 10, 8)
  ]);
  assert.deepEqual(preview.rows[0].errors.map((error) => error.code), ["BUDGET_ACCOUNT_INACTIVE"]);
  assert.deepEqual(preview.rows[1].errors.map((error) => error.code), ["BUDGET_ACCOUNT_NOT_TRANSACTIONAL"]);
  assert.deepEqual(preview.rows[2].errors.map((error) => error.code), ["BUDGET_ACCOUNT_NOT_PUC_4_7"]);
  assert.deepEqual(preview.rows[3].errors.map((error) => error.code), ["BUDGET_CENTER_BRANCH_MISMATCH"]);
});

test("preview lista periodos unicos ordenados de las filas validas", async () => {
  const client = accountClient([account(10, "4135"), account(11, "5105")]);
  const preview = await buildBudgetImportPreview(client, "t1", TREE, [], [
    rawRow("2026-06", "4135", "CC-ADMIN", "NORTE", 10, 5),
    rawRow("2026-04", "5105", "CC-VENTAS", "SUR", 10, 6),
    rawRow("2026-06", "9999", "CC-ADMIN", "NORTE", 10, 7)
  ]);
  assert.deepEqual(preview.periods, ["2026-04", "2026-06"]);
  assert.equal(preview.valid, false);
  assert.equal(preview.totals.valid_rows, 2);
});

// ---------------------------------------------------------------- importacion atomica

function budgetConfig(tree, store, overrides = {}) {
  return { accounting: { organization_tree: tree, pyg_budgets: { rows: store.rows || [], ...store, ...overrides } } };
}

function fakeImportTx({ config = {}, accounts = [] } = {}) {
  const calls = { advisory: [], tenantUpdate: [], auditCreate: [] };
  const tx = {
    calls,
    $executeRawUnsafe: async (sql, key) => { calls.advisory.push({ sql, key }); },
    account: { findMany: async () => accounts },
    tenant: {
      findUnique: async () => ({ config }),
      update: async ({ where, data }) => { calls.tenantUpdate.push({ where, data }); return { id: where.id, config: data.config }; }
    },
    auditLog: { create: async ({ data }) => { calls.auditCreate.push(data); return { id: 1, ...data }; } }
  };
  return tx;
}

function withFakeTransaction(fakeTx, fn) {
  const original = prisma.$transaction;
  prisma.$transaction = (callback) => callback(fakeTx);
  return Promise.resolve()
    .then(fn)
    .finally(() => { prisma.$transaction = original; });
}

test("importacion valida guarda solo filas nuevas, audita y nunca escribe libro", async () => {
  const income = account(10, "4135");
  const buffer = await buildWorkbook([
    { periodo: "2026-05", cuenta: "4135", centro_costo: "cc-admin", sucursal: "norte", presupuesto: 2500 }
  ]);
  const existing = [{ period: "2026-04", account_id: 20, account_code: "5105", branch_code: "NORTE", cost_center_code: "CC-ADMIN", amount: 300, amount_cents: 30000, updated_at: "2026-01-01T00:00:00.000Z" }];
  const config = budgetConfig(TREE, { rows: existing, updated_at: "2026-01-01T00:00:00.000Z", last_import: null });
  const tx = fakeImportTx({ config, accounts: [income] });

  const result = await withFakeTransaction(tx, () => importPygBudgetWorkbook("t1", 42, buffer));

  assert.equal(result.imported, true);
  assert.equal(result.created_count, 1);
  assert.equal(result.updated_count, 0);
  assert.deepEqual(result.periods, ["2026-05"]);
  assert.equal(Object.prototype.hasOwnProperty.call(tx, "ledgerEntry"), false, "la importacion no escribe lineas de libro");
  // Mismo candado que el editor manual y la numeracion, tomado antes de leer la config:
  // evita que la importacion reescriba presupuestos o next_number concurrentes.
  assert.deepEqual(tx.calls.advisory.map((row) => row.key), ["t1:accounting-numbering"]);

  assert.equal(tx.calls.tenantUpdate.length, 1);
  const store = tx.calls.tenantUpdate[0].data.config.accounting.pyg_budgets;
  assert.equal(store.rows.length, 2, "las filas existentes de otros periodos se conservan");
  assert.equal(store.rows.filter((row) => row.period === "2026-04").length, 1);
  const imported = store.rows.find((row) => row.period === "2026-05");
  assert.equal(imported.account_id, 10);
  assert.equal(imported.account_code, "4135");
  assert.equal(imported.branch_code, "NORTE");
  assert.equal(imported.cost_center_code, "CC-ADMIN");
  assert.equal(imported.amount, 2500);
  assert.equal(imported.updated_by, 42);
  assert.equal(store.last_import.file_hash, sha256(buffer));
  assert.equal(store.last_import.created, 1);

  assert.equal(tx.calls.auditCreate.length, 1);
  assert.equal(tx.calls.auditCreate[0].action, "IMPORT");
  assert.equal(tx.calls.auditCreate[0].entity, "PygBudget");
  assert.equal(tx.calls.auditCreate[0].entity_id, "2026-05");
});

test("importacion con filas invalidas aborta sin guardar nada y entrega el preview", async () => {
  const buffer = await buildWorkbook([
    { periodo: "2026-05", cuenta: "9999", centro_costo: "CC-ADMIN", sucursal: "NORTE", presupuesto: 10 }
  ]);
  const tx = fakeImportTx({ config: budgetConfig(TREE, { rows: [] }), accounts: [account(10, "4135")] });
  await assert.rejects(
    withFakeTransaction(tx, () => importPygBudgetWorkbook("t1", 42, buffer)),
    (error) => {
      assert.equal(error.statusCode, 422);
      assert.equal(error.code, "BUDGET_IMPORT_VALIDATION_FAILED");
      assert.equal(error.details.totals.error_rows, 1);
      assert.deepEqual(error.details.rows[0].errors.map((row) => row.code), ["BUDGET_ACCOUNT_NOT_FOUND"]);
      return true;
    }
  );
  assert.equal(tx.calls.tenantUpdate.length, 0);
  assert.equal(tx.calls.auditCreate.length, 0);
});

test("importacion es idempotente por hash de archivo y no reimporta", async () => {
  const buffer = await buildWorkbook([
    { periodo: "2026-05", cuenta: "4135", centro_costo: "CC-ADMIN", sucursal: "NORTE", presupuesto: 10 }
  ]);
  const config = budgetConfig(TREE, { rows: [] }, { last_import: { file_hash: sha256(buffer), at: "2026-01-01T00:00:00.000Z", by: 7, created: 1 } });
  const tx = fakeImportTx({ config, accounts: [account(10, "4135")] });
  await assert.rejects(
    withFakeTransaction(tx, () => importPygBudgetWorkbook("t1", 42, buffer)),
    (error) => error.statusCode === 409 && error.code === "BUDGET_FILE_ALREADY_IMPORTED"
  );
  assert.equal(tx.calls.tenantUpdate.length, 0);
});

test("importacion adquiere el candado compartido antes de leer la config del tenant", async () => {
  const buffer = await buildWorkbook([
    { periodo: "2026-05", cuenta: "4135", centro_costo: "CC-ADMIN", sucursal: "NORTE", presupuesto: 10 }
  ]);
  const order = [];
  const tx = fakeImportTx({ config: budgetConfig(TREE, { rows: [] }), accounts: [account(10, "4135")] });
  tx.$executeRawUnsafe = async (sql, key) => { order.push(`lock:${key}`); tx.calls.advisory.push({ sql, key }); };
  tx.tenant.findUnique = async () => { order.push("read:config"); return { config: budgetConfig(TREE, { rows: [] }) }; };
  tx.tenant.update = async ({ where, data }) => { order.push("write:config"); tx.calls.tenantUpdate.push({ where, data }); return { id: where.id, config: data.config }; };
  await withFakeTransaction(tx, () => importPygBudgetWorkbook("t1", 42, buffer));
  assert.deepEqual(order, ["lock:t1:accounting-numbering", "read:config", "write:config"]);
});

test("validacion en lectura devuelve preview con hash sin escribir nada", async () => {
  const original = prisma.tenant;
  prisma.tenant = {
    findUnique: async () => ({ config: budgetConfig(TREE, { rows: [] }) })
  };
  const accountsOriginal = prisma.account;
  prisma.account = {
    findMany: async () => [account(10, "4135")]
  };
  try {
    const buffer = await buildWorkbook([
      { periodo: "2026-05", cuenta: "4135", centro_costo: "CC-ADMIN", sucursal: "NORTE", presupuesto: 25 },
      { periodo: "2026-05", cuenta: "0000", centro_costo: "CC-ADMIN", sucursal: "NORTE", presupuesto: 10 }
    ]);
    const preview = await validatePygBudgetWorkbook("t1", buffer);
    assert.equal(preview.file_hash, sha256(buffer));
    assert.equal(preview.valid, false);
    assert.equal(preview.totals.error_rows, 1);
    assert.match(preview.monthly_semantics, /unico mes|puntual/i);
  } finally {
    prisma.tenant = original;
    prisma.account = accountsOriginal;
  }
});
