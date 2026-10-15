process.env.DISABLE_REDIS = "true";
process.env.REDIS_DISABLED = "true";
const assert = require("node:assert/strict");
const test = require("node:test");

const { buildChartTreePlan, validateChartTreeCatalog, accountNature } = require("../src/modules/accounting/service");

function minimalCatalog() {
  const types = { "1": "asset", "2": "liability", "3": "equity", "4": "income", "5": "expense", "6": "cost", "7": "cost", "8": "order", "9": "order" };
  return Array.from({ length: 9 }, (_, index) => {
    const classCode = String(index + 1);
    const groupCode = `${classCode}1`;
    const accountCode = `${groupCode}05`;
    const subaccountCode = `${accountCode}05`;
    return [
      { code: classCode, name: `Clase ${classCode}`, type: types[classCode], level: 1 },
      { code: groupCode, name: `Grupo ${groupCode}`, type: types[classCode], parent_code: classCode, level: 2 },
      { code: accountCode, name: `Cuenta ${accountCode}`, type: types[classCode], parent_code: groupCode, level: 3 },
      { code: subaccountCode, name: `Subcuenta ${subaccountCode}`, type: types[classCode], parent_code: accountCode, level: 4 }
    ];
  }).flat();
}

test("el catalogo PUC valida las nueve clases y los niveles 1/2/4/6", () => {
  const catalog = minimalCatalog();
  const normalized = validateChartTreeCatalog(catalog);
  assert.equal(normalized.length, 36);
  assert.equal(normalized.find((row) => row.code === "110505").parent_code, "1105");
});

test("el plan no pisa cuentas existentes y propone reparar solo el parent link", () => {
  const catalog = minimalCatalog();
  const plan = buildChartTreePlan(catalog, [
    { id: 10, code: "1105", name: "Cuenta 1105", type: "asset", active: true, parent_id: null },
    { id: 11, code: "110505", name: "Subcuenta 110505", type: "asset", active: true, parent_id: 999 }
  ]);
  assert.ok(plan.creates.some((row) => row.code === "1"));
  assert.ok(plan.repairs.some((row) => row.code === "1105"));
  assert.ok(plan.conflicts.some((row) => row.code === "110505" && row.reason === "EXISTING_PARENT_CONFLICT"));
  assert.equal(plan.conflicts.some((row) => row.reason === "EXISTING_ACCOUNT_FIELDS_DIFFER"), false);
});

test("las diferencias de etiqueta se preservan como warning y el nivel se repara", () => {
  const catalog = minimalCatalog();
  const plan = buildChartTreePlan(catalog, [
    { id: 1, code: "11", name: "Grupo 11", type: "asset", active: true, parent_id: null, level: 2 },
    { id: 10, code: "1105", name: "Nombre legacy", type: "asset", active: true, parent_id: 1, level: 99 }
  ]);
  assert.ok(plan.warnings.some((row) => row.code === "1105"));
  assert.ok(plan.repairs.some((row) => row.code === "1105" && row.level === 3));
  assert.equal(plan.conflicts.length, 0);
});

test("los auxiliares de ocho digitos no forman parte de la carga automatica 1/2/4/6", () => {
  const catalog = minimalCatalog();
  assert.throws(() => validateChartTreeCatalog([...catalog, { code: "11050501", name: "Auxiliar", type: "asset", level: 5 }]), /catalogo PUC/);
});

test("la naturaleza distingue costos y cuentas de orden por clase", () => {
  assert.equal(accountNature("cost", "6105"), "debit");
  assert.equal(accountNature("order", "8105"), "debit");
  assert.equal(accountNature("order", "9105"), "credit");
});

test("el validador rechaza clases extra, tipos de clase inconsistentes y grupos transaccionales", () => {
  const invalid = (catalog) => assert.throws(() => validateChartTreeCatalog(catalog), (error) => error.code === "INVALID_CHART_CATALOG");
  invalid([{ ...minimalCatalog()[0], code: "0" }, ...minimalCatalog().slice(1)]);
  invalid(minimalCatalog().map((row) => row.code === "1" ? { ...row, type: "expense" } : row));
  invalid(minimalCatalog().map((row) => row.code === "11" ? { ...row, allows_tx: true } : row));
});
