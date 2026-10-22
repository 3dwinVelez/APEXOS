// tenantCache exige REDIS_URL al importar el servicio.
process.env.DISABLE_REDIS = "true";
process.env.REDIS_DISABLED = "true";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const pyg = require("../src/modules/accounting/pyg-interactive");
const budgets = require("../src/modules/accounting/pyg-budget");

const routes = fs.readFileSync(path.resolve(__dirname, "../src/modules/accounting/routes.js"), "utf8");

const account = (id, code, name, overrides = {}) => ({
  id,
  code,
  name,
  type: /^[4-7]/.test(String(code)) ? (/^4/.test(String(code)) ? "income" : "expense") : "asset",
  class: /^\d/.test(String(code)) ? String(code)[0] : null,
  section: pyg.sectionOfAccount({ code, type: /^4/.test(String(code)) ? "income" : "expense" }),
  parent_id: null,
  level: 1,
  active: true,
  allows_tx: true,
  ...overrides
});

const accountsById = (accounts) => new Map(accounts.map((row) => [row.id, row]));

const leaf = (account_id, current, prior = 0, extra = {}) => ({
  account_id,
  branch: "",
  center: "",
  section: "ingresos4",
  kind: "income",
  current_cents: Math.round(current * 100),
  prior_cents: Math.round(prior * 100),
  budget_cents: null,
  budget_months: new Set(),
  ...extra
});

function leavesOf(...rows) {
  return new Map(rows.map((row, index) => [`${row.account_id}|${row.branch}|${row.center}|${index}`, row]));
}

function sumRoots(nodes, field) {
  return nodes.reduce((sum, node) => sum + node[field], 0);
}

function flatten(nodes, out = []) {
  for (const node of nodes) { out.push(node); flatten(node.children, out); }
  return out;
}

test("validacion de periodo, modo y dimensiones", () => {
  assert.equal(pyg.parsePeriodInput("2026-03"), "2026-03");
  assert.throws(() => pyg.parsePeriodInput("2026-3"), (error) => error.code === "INVALID_PERIOD");
  assert.throws(() => pyg.parsePeriodInput(""), (error) => error.code === "REQUIRED_PERIOD");
  assert.throws(() => pyg.parsePeriodInput("bad"), (error) => error.code === "INVALID_PERIOD");
  assert.equal(pyg.parseModeInput("month"), "month");
  assert.equal(pyg.parseModeInput("YTD"), "ytd");
  assert.throws(() => pyg.parseModeInput("quarter"), (error) => error.code === "INVALID_MODE");
  assert.deepEqual(pyg.validateDimensions(undefined), ["puc", "branch", "cost_center"]);
  assert.deepEqual(pyg.validateDimensions("branch,puc,cost_center"), ["branch", "puc", "cost_center"]);
  assert.deepEqual(pyg.validateDimensions(["cost_center", "puc", "branch"]), ["cost_center", "puc", "branch"]);
  assert.throws(() => pyg.validateDimensions(["branch", "cost_center"]), (error) => error.code === "INVALID_DIMENSIONS");
  assert.throws(() => pyg.validateDimensions(["puc", "puc", "branch"]), (error) => error.code === "INVALID_DIMENSIONS");
  assert.throws(() => pyg.validateDimensions(["puc", "territorio"]), (error) => error.code === "INVALID_DIMENSIONS");
});

test("rangos mes y acumulado ano con comparacion del ano anterior", () => {
  const month = pyg.periodRange("2026-03", "month");
  assert.deepEqual(month.periods, ["2026-03"]);
  assert.deepEqual(month.prior_periods, ["2025-03"]);
  assert.equal(month.current.start.toISOString(), "2026-03-01T00:00:00.000Z");
  assert.equal(month.current.end.toISOString(), "2026-03-31T23:59:59.999Z");
  assert.equal(month.prior.start.toISOString(), "2025-03-01T00:00:00.000Z");
  const ytd = pyg.periodRange("2026-03", "ytd");
  assert.deepEqual(ytd.periods, ["2026-01", "2026-02", "2026-03"]);
  assert.deepEqual(ytd.prior_periods, ["2025-01", "2025-02", "2025-03"]);
  assert.equal(ytd.current.start.toISOString(), "2026-01-01T00:00:00.000Z");
  assert.equal(ytd.current.end.toISOString(), "2026-03-31T23:59:59.999Z");
  assert.equal(ytd.prior.end.toISOString(), "2025-03-31T23:59:59.999Z");
  const january = pyg.periodRange("2026-01", "ytd");
  assert.deepEqual(january.periods, ["2026-01"]);
});

test("aritmetica firmada y convencion de presupuesto por naturaleza", () => {
  assert.equal(pyg.signedCents(0, 250.5), 25050);
  assert.equal(pyg.signedCents(120.35, 0), -12035);
  assert.equal(pyg.signedBudgetCents("ingresos4", 100), 10000);
  assert.equal(pyg.signedBudgetCents("gastos5", 100), -10000);
  assert.equal(pyg.signedBudgetCents("costos6", 7.5), -750);
  assert.equal(pyg.signedBudgetCents("costosproduccion7", 0), 0);
  assert.ok(Object.is(pyg.signedBudgetCents("gastos5", 0), 0), "presupuesto cero de gasto no debe producir -0");
});

test("clases PUC 4-7 y cuentas fuera del PUC seccionadas sin replicar 5105 como costo de venta", () => {
  const income = pyg.sectionOfAccount({ code: "41750501", type: "income" });
  assert.equal(income, "ingresos4");
  assert.equal(pyg.sectionOfAccount({ code: "510506", type: "expense" }), "gastos5");
  assert.equal(pyg.sectionOfAccount({ code: "6135", type: "cost" }), "costos6");
  assert.equal(pyg.sectionOfAccount({ code: "7105", type: "cost" }), "costosproduccion7");
  assert.equal(pyg.sectionOfAccount({ code: "110505", type: "asset" }), null);
  assert.equal(pyg.sectionOfAccount({ code: "XX-01", type: "income" }), "no_clasificado");
  assert.equal(pyg.sectionOfAccount({ code: "XX-02", type: "expense" }), "no_clasificado");
  assert.equal(pyg.pucClassOf("510506"), "5");
  assert.equal(pyg.pucClassOf("XYZ"), null);
});

test("asignacion de metadatos: huerfano, ambiguo, parcial y vinculado", () => {
  assert.deepEqual(pyg.assignmentForMetadata([]), { status: "orphan", branch: "", center: "" });
  assert.deepEqual(pyg.assignmentForMetadata([{ branch_code: "B1", cost_center_code: "C1" }]), { status: "linked", branch: "B1", center: "C1", missing_branch: false, missing_center: false });
  assert.deepEqual(pyg.assignmentForMetadata([
    { branch_code: "B1", cost_center_code: "C1" },
    { branch_code: "B1", cost_center_code: "C2" }
  ]), { status: "ambiguous", branch: "", center: "" });
  assert.deepEqual(pyg.assignmentForMetadata([{ branch_code: "B1", cost_center_code: "" }]), { status: "partial", branch: "B1", center: "", missing_branch: false, missing_center: true });
  assert.deepEqual(pyg.assignmentForMetadata([{ branch_code: "", cost_center_code: "C1" }]), { status: "partial", branch: "", center: "C1", missing_branch: true, missing_center: false });
});

test("el arbol conserva importes en cualquier orden de dimensiones sin doble conteo", () => {
  const acc1 = account(1, "41750501", "Ingresos A", { parent_id: null });
  const acc2 = account(2, "4175050101", "Ingresos A.1", { parent_id: 1, level: 2 });
  const acc3 = account(3, "510506", "Gasto B");
  const rows = [
    leaf(2, 1000, 900, { branch: "B1", center: "C1" }),
    leaf(2, 500, 0, { branch: "B2", center: "C1" }),
    leaf(3, -200, -150, { branch: "B1", center: "C2", section: "gastos5", kind: "expense" })
  ];
  const leaves = leavesOf(...rows);
  const ids = accountsById([acc1, acc2, acc3]);
  const net = 1000 + 500 - 200;
  const priorNet = 900 - 150;
  for (const dims of [
    ["puc", "branch", "cost_center"],
    ["puc", "cost_center", "branch"],
    ["branch", "puc", "cost_center"],
    ["branch", "cost_center", "puc"],
    ["cost_center", "puc", "branch"],
    ["cost_center", "branch", "puc"]
  ]) {
    const built = pyg.buildMatrixTree({ leaves, accountsById: ids, dims, branchLabels: new Map(), centerLabels: new Map() });
    const roots = built.nodes;
    const totalActual = sumRoots(roots, "actual");
    const totalPrior = sumRoots(roots, "prior");
    assert.ok(Math.abs(totalActual - net) < 0.001, `${dims.join(",")} actual ${totalActual} != ${net}`);
    assert.ok(Math.abs(totalPrior - priorNet) < 0.001, `${dims.join(",")} prior ${totalPrior} != ${priorNet}`);
    const terminals = flatten(roots).filter((node) => node.is_leaf);
    const terminalSum = terminals.reduce((sum, node) => sum + node.actual, 0);
    assert.ok(Math.abs(terminalSum - net) < 0.001);
    assert.equal(terminals.length, 3);
  }
});

test("padre con movimiento propio suma una sola vez cada hoja", () => {
  const acc1 = account(1, "41750501", "Ingresos padre");
  const acc2 = account(2, "4175050101", "Ingresos hijo", { parent_id: 1, level: 2 });
  const leaves = leavesOf(
    leaf(1, 300),
    leaf(2, 700)
  );
  const built = pyg.buildMatrixTree({ leaves, accountsById: accountsById([acc1, acc2]), dims: ["puc"], branchLabels: new Map(), centerLabels: new Map() });
  const root = built.nodes[0];
  assert.equal(root.name, "41750501 · Ingresos padre");
  assert.equal(root.actual, 1000);
  assert.equal(root.leaf_rows, 2);
  const child = root.children.find((node) => node.code === "2");
  assert.equal(child.actual, 700);
  assert.equal(child.leaf_rows, 1);
});

test("rollup unico en jerarquia de tres niveles: cada hoja aporta una sola vez", () => {
  const accG = account(10, "4", "Clase 4");
  const accP = account(20, "41", "Operacionales", { parent_id: 10, level: 2 });
  const accL = account(30, "41750501", "Ingresos operacionales", { parent_id: 20, level: 3 });
  const leaves = leavesOf(
    leaf(10, 50),
    leaf(20, 30),
    leaf(30, 120)
  );
  const built = pyg.buildMatrixTree({ leaves, accountsById: accountsById([accG, accP, accL]), dims: ["puc"], branchLabels: new Map(), centerLabels: new Map() });
  assert.equal(built.nodes.length, 1);
  const grandparent = built.nodes[0];
  assert.equal(grandparent.actual, 200);
  assert.equal(grandparent.leaf_rows, 3);
  assert.equal(grandparent.is_leaf, false);
  const parent = grandparent.children[0];
  assert.equal(parent.actual, 150);
  assert.equal(parent.leaf_rows, 2);
  const leafNode = parent.children[0];
  assert.equal(leafNode.actual, 120);
  assert.equal(leafNode.leaf_rows, 1);
  assert.equal(leafNode.is_leaf, true);
  const all = flatten(built.nodes);
  assert.equal(all.length, 3);
  assert.equal(all.reduce((sum, node) => sum + node.leaf_rows, 0), 6, "cada hoja se cuenta una vez en su rama y las ramas no se duplican");
});

test("parseOrganizationTree acepta la config completa y la seccion accounting", () => {
  const tree = {
    societies: [{ code: "S1", name: "Sociedad" }],
    branches: [{ code: "B1", name: "Bogota" }],
    cost_centers: [{ code: "C1", name: "Operacion", branch_code: "B1" }]
  };
  assert.deepEqual(pyg.parseOrganizationTree({ accounting: { organization_tree: tree } }), tree);
  assert.deepEqual(pyg.parseOrganizationTree({ organization_tree: tree }), tree);
  assert.deepEqual(pyg.parseOrganizationTree(null), { societies: [], branches: [], cost_centers: [] });
});

test("parseAmount solo acepta numeros o cadenas numericas no vacias", () => {
  assert.equal(pyg.parseAmount(25.5), 25.5);
  assert.equal(pyg.parseAmount("25.5"), 25.5);
  assert.equal(pyg.parseAmount(0), 0);
  assert.ok(Number.isNaN(pyg.parseAmount("")));
  assert.ok(Number.isNaN(pyg.parseAmount("  ")));
  assert.ok(Number.isNaN(pyg.parseAmount("abc")));
  assert.ok(Number.isNaN(pyg.parseAmount(true)));
  assert.ok(Number.isNaN(pyg.parseAmount(null)));
  assert.ok(Number.isNaN(pyg.parseAmount(undefined)));
  assert.ok(Number.isNaN(pyg.parseAmount([10])));
});

test("cobertura de periodos de presupuesto: ninguna, parcial y completa", () => {
  assert.equal(pyg.budgetCoverageOf(["2026-01", "2026-02", "2026-03"], []), "none");
  assert.equal(pyg.budgetCoverageOf(["2026-01", "2026-02", "2026-03"], ["2026-01"]), "partial");
  assert.equal(pyg.budgetCoverageOf(["2026-01", "2026-02", "2026-03"], ["2026-01", "2026-02", "2026-03"]), "full");
  assert.equal(pyg.budgetCoverageOf(["2026-03"], ["2026-03"]), "full");
});

test("cobertura por hoja: una cuenta sin un mes marca parcial aunque la union global sea completa", () => {
  const expected = ["2026-01", "2026-02", "2026-03"];
  const oneAccountMissingMonth = leavesOf(
    leaf(1, 100, 0, { budget_cents: 10000, budget_months: new Set(["2026-01", "2026-02", "2026-03"]) }),
    leaf(2, -50, 0, { section: "gastos5", kind: "expense", budget_cents: -5000, budget_months: new Set(["2026-02"]) })
  );
  const result = pyg.budgetCoverageFromLeaves(expected, oneAccountMissingMonth);
  assert.equal(result.coverage, "partial");
  assert.deepEqual(result.months_found, ["2026-01", "2026-02", "2026-03"]);

  const splitAcrossAccounts = leavesOf(
    leaf(1, 100, 0, { budget_cents: 10000, budget_months: new Set(["2026-01"]) }),
    leaf(2, -50, 0, { section: "gastos5", kind: "expense", budget_cents: -5000, budget_months: new Set(["2026-02"]) }),
    leaf(3, -30, 0, { section: "costos6", kind: "expense", budget_cents: -3000, budget_months: new Set(["2026-03"]) })
  );
  const split = pyg.budgetCoverageFromLeaves(expected, splitAcrossAccounts);
  assert.equal(split.coverage, "partial");
  assert.deepEqual(split.months_found, ["2026-01", "2026-02", "2026-03"]);

  const complete = pyg.budgetCoverageFromLeaves(expected, leavesOf(
    leaf(1, 100, 0, { budget_cents: 10000, budget_months: new Set(expected) }),
    leaf(2, -50, 0, { section: "gastos5", kind: "expense", budget_cents: -5000, budget_months: new Set(expected) })
  ));
  assert.equal(complete.coverage, "full");
  assert.deepEqual(complete.months_found, expected);

  const none = pyg.budgetCoverageFromLeaves(expected, leavesOf(leaf(1, 100)));
  assert.equal(none.coverage, "none");
  assert.deepEqual(none.months_found, []);
});

test("estado de presupuesto por nodo considera los meses planeados por hoja en modo YTD", () => {
  const acc1 = account(1, "41750501", "Ingresos");
  const acc2 = account(2, "510506", "Gasto", { section: "gastos5" });
  const leaves = leavesOf(
    leaf(1, 100, 0, { budget_cents: 10000, budget_months: new Set(["2026-01", "2026-02"]) }),
    leaf(2, -40, 0, { section: "gastos5", kind: "expense", budget_cents: -4000, budget_months: new Set(["2026-02"]) })
  );
  const built = pyg.buildMatrixTree({
    leaves,
    accountsById: accountsById([acc1, acc2]),
    dims: ["puc"],
    branchLabels: new Map(),
    centerLabels: new Map(),
    budgetPeriods: ["2026-01", "2026-02"]
  });
  const incomeNode = built.nodes.find((node) => node.code === "1");
  assert.equal(incomeNode.budget_status, "complete");
  assert.deepEqual(incomeNode.budget_months_found, ["2026-01", "2026-02"]);
  assert.equal(incomeNode.budget_coverage, "full");
  const expenseNode = built.nodes.find((node) => node.code === "2");
  assert.equal(expenseNode.budget_status, "partial");
  assert.deepEqual(expenseNode.budget_months_found, ["2026-02"]);
  assert.equal(expenseNode.budget_coverage, "partial");
});

test("totales con presupuesto firmado: neto de presupuesto coherente por naturaleza", () => {
  const acc4 = account(1, "41750501", "Ingresos");
  const acc5 = account(2, "510506", "Gasto", { section: "gastos5" });
  const leaves = leavesOf(
    leaf(1, 1000, 800, { budget_cents: pyg.signedBudgetCents("ingresos4", 2000) }),
    leaf(2, -300, -200, { section: "gastos5", kind: "expense", budget_cents: pyg.signedBudgetCents("gastos5", 1200) })
  );
  const result = pyg.sectionTotals(leaves);
  assert.equal(result.totals.ingresos4.budget, 2000);
  assert.equal(result.totals.gastos5.budget, -1200);
  assert.equal(result.net.budget, 800);
  assert.equal(result.net.budget_status, "complete");
});

test("ciclos, padres inexistentes y padres de otra clase mantienen importes visibles con warnings", () => {
  const accA = account(1, "41750501", "A", { parent_id: 2 });
  const accB = account(2, "4175050101", "B", { parent_id: 1 });
  const accC = account(3, "510506", "C", { parent_id: 99 });
  const accD = account(4, "6135", "D", { parent_id: 5 });
  const accE = account(5, "4175", "E");
  const leaves = leavesOf(
    leaf(1, 100),
    leaf(3, -50, 0, { section: "gastos5", kind: "expense" }),
    leaf(4, -25, 0, { section: "costos6", kind: "expense" })
  );
  const built = pyg.buildMatrixTree({ leaves, accountsById: accountsById([accA, accB, accC, accD, accE]), dims: ["puc"], branchLabels: new Map(), centerLabels: new Map() });
  const codes = built.warnings.map((warning) => warning.code);
  assert.ok(codes.includes("PUC_CYCLE"));
  assert.ok(codes.includes("PUC_PARENT_MISSING"));
  assert.ok(codes.includes("PUC_FOREIGN_PARENT"));
  const names = flatten(built.nodes).map((node) => node.name);
  assert.ok(names.includes("41750501 · A"));
  assert.ok(names.includes("510506 · C"));
  assert.ok(names.includes("6135 · D"));
  assert.ok(Math.abs(sumRoots(built.nodes, "actual") - 25) < 0.001);
});

test("variacion nula con ano anterior en cero y presupuesto explicito cero distinguible del no planeado", () => {
  const acc1 = account(1, "41750501", "Ingresos");
  const acc2 = account(2, "510506", "Gasto", { section: "gastos5" });
  const leaves = leavesOf(
    leaf(1, 100, 0, { budget_cents: 0 }),
    leaf(2, -40, 0, { section: "gastos5", kind: "expense", budget_cents: null })
  );
  const built = pyg.buildMatrixTree({ leaves, accountsById: accountsById([acc1, acc2]), dims: ["puc"], branchLabels: new Map(), centerLabels: new Map() });
  assert.equal(built.nodes.length, 2);
  const incomeNode = built.nodes.find((node) => node.code === "1");
  assert.equal(incomeNode.prior, 0);
  assert.equal(incomeNode.variation_pct, null);
  assert.equal(incomeNode.difference, 100);
  assert.equal(incomeNode.budget, 0);
  assert.equal(incomeNode.budget_status, "complete");
  assert.equal(incomeNode.budget_execution_pct, null);
  const expenseNode = built.nodes.find((node) => node.code === "2");
  assert.equal(expenseNode.actual, -40);
  assert.equal(expenseNode.budget, null);
  assert.equal(expenseNode.budget_status, "none");
  assert.equal(expenseNode.budget_variance, null);
});

test("presupuesto firmado por naturaleza: desvio y ejecucion coherentes en gastos", () => {
  const acc1 = account(1, "510506", "Gasto", { section: "gastos5" });
  const leaves = leavesOf(
    leaf(1, -800, 0, { section: "gastos5", kind: "expense", budget_cents: pyg.signedBudgetCents("gastos5", 1200) })
  );
  const built = pyg.buildMatrixTree({ leaves, accountsById: accountsById([acc1]), dims: ["puc"], branchLabels: new Map(), centerLabels: new Map() });
  const node = built.nodes[0];
  assert.equal(node.budget, -1200);
  assert.equal(node.budget_variance, 400);
  assert.ok(Math.abs(node.budget_execution_pct - 66.67) < 0.01);
});

test("neto: diferencia, variacion y comparativo de presupuesto coherentes con los importes reales", () => {
  const acc4 = account(1, "41750501", "Ingresos");
  const acc5 = account(2, "510506", "Gasto", { section: "gastos5" });
  const leaves = leavesOf(
    leaf(1, 250, 500, { budget_cents: pyg.signedBudgetCents("ingresos4", 1000) }),
    leaf(2, 0, 0, { section: "gastos5", kind: "expense", budget_cents: pyg.signedBudgetCents("gastos5", 25) })
  );
  const { net } = pyg.sectionTotals(leaves);
  assert.equal(net.actual, 250);
  assert.equal(net.prior, 500);
  assert.equal(net.difference, -250);
  assert.equal(net.variation_pct, -50);
  assert.equal(net.budget, 975);
  assert.equal(net.budget_variance, -725);
  assert.ok(Math.abs(net.budget_execution_pct - 25.64) < 0.01);
});

test("neto: variacion nula con ano anterior en cero y presupuesto no planeado produce nulos", () => {
  const leaves = leavesOf(leaf(1, 120, 0));
  const { net } = pyg.sectionTotals(leaves);
  assert.equal(net.difference, 120);
  assert.equal(net.variation_pct, null);
  assert.equal(net.budget, null);
  assert.equal(net.budget_status, "none");
  assert.equal(net.budget_variance, null);
  assert.equal(net.budget_execution_pct, null);
});

test("neto: presupuesto explicito cero no produce porcentaje ni desvio", () => {
  const leaves = leavesOf(
    leaf(1, 100, 0, { budget_cents: 0 }),
    leaf(2, -40, 0, { section: "gastos5", kind: "expense", budget_cents: 0 })
  );
  const { net, totals } = pyg.sectionTotals(leaves);
  assert.equal(totals.ingresos4.budget, 0);
  assert.equal(totals.ingresos4.budget_status, "complete");
  assert.equal(net.budget, 0);
  assert.equal(net.budget_status, "complete");
  assert.equal(net.budget_variance, 60);
  assert.equal(net.budget_execution_pct, null);
});

test("neto: diferencia y variacion redondeadas a centavos y dos decimales", () => {
  const leaves = leavesOf(
    leaf(1, 333.34, 100.11),
    leaf(2, -100.01, -0.10, { section: "gastos5", kind: "expense" })
  );
  const { net } = pyg.sectionTotals(leaves);
  assert.equal(net.actual, 233.33);
  assert.equal(net.prior, 100.01);
  assert.equal(net.difference, 133.32);
  assert.equal(net.variation_pct, 133.31);
});

test("cobertura YTD en totales: una seccion con meses incompletos deja el neto en parcial", () => {
  const expected = ["2026-01", "2026-02", "2026-03"];
  const leaves = leavesOf(
    leaf(1, 300, 0, { budget_cents: 30000, budget_months: new Set(expected) }),
    leaf(2, -50, 0, { section: "gastos5", kind: "expense", budget_cents: -5000, budget_months: new Set(["2026-03"]) })
  );
  const result = pyg.sectionTotals(leaves, expected);
  assert.equal(result.totals.ingresos4.budget_status, "complete");
  assert.deepEqual(result.totals.ingresos4.budget_months_found, expected);
  assert.equal(result.totals.gastos5.budget_status, "partial");
  assert.deepEqual(result.totals.gastos5.budget_months_found, ["2026-03"]);
  assert.equal(result.net.budget_status, "partial");
  assert.equal(result.net.budget, 250);
  assert.equal(result.net.actual, 250);
  assert.equal(result.net.budget_execution_pct, 100);
});

test("cobertura YTD en totales: seccion sin presupuesto deja el neto en parcial y hoja sin presupuesto marca parcial", () => {
  const expected = ["2026-01", "2026-02"];
  const completeLeaves = leavesOf(
    leaf(1, 200, 0, { budget_cents: 20000, budget_months: new Set(expected) }),
    leaf(2, -50, 0, { section: "gastos5", kind: "expense", budget_cents: -5000, budget_months: new Set(expected) })
  );
  const complete = pyg.sectionTotals(completeLeaves, expected);
  assert.equal(complete.totals.gastos5.budget_status, "complete");
  assert.equal(complete.net.budget_status, "complete");

  const missingSection = pyg.sectionTotals(leavesOf(
    leaf(1, 200, 0, { budget_cents: 20000, budget_months: new Set(expected) }),
    leaf(3, -30, 0, { section: "costos6", kind: "expense", budget_cents: -3000, budget_months: new Set(expected) }),
    leaf(2, -50, 0, { section: "gastos5", kind: "expense" })
  ), expected);
  assert.equal(missingSection.totals.gastos5.budget_status, "none");
  assert.equal(missingSection.net.budget_status, "partial");

  const leafWithoutBudget = pyg.sectionTotals(leavesOf(
    leaf(1, 200, 0, { budget_cents: 20000, budget_months: new Set(expected) }),
    leaf(2, -50, 0, { section: "gastos5", kind: "expense", budget_cents: -5000, budget_months: new Set(expected) }),
    leaf(4, -10, 0, { section: "gastos5", kind: "expense", budget_cents: null })
  ), expected);
  assert.equal(leafWithoutBudget.totals.gastos5.budget_status, "partial");
  assert.equal(leafWithoutBudget.net.budget_status, "partial");
});

test("cobertura YTD en totales: sin periodos esperados conserva la compatibilidad de los totales puros", () => {
  const leaves = leavesOf(
    leaf(1, 100, 0, { budget_cents: 1000, budget_months: new Set(["2026-01"]) }),
    leaf(2, -40, 0, { section: "gastos5", kind: "expense", budget_cents: -400 })
  );
  const withoutPeriods = pyg.sectionTotals(leaves);
  const withPeriods = pyg.sectionTotals(leaves, []);
  assert.deepEqual(withoutPeriods, withPeriods);
  assert.equal(withoutPeriods.totals.ingresos4.budget_status, "complete");
  assert.equal(withoutPeriods.net.budget_status, "complete");
  assert.equal(withoutPeriods.net.budget, 6);
});

test("totales por seccion: ingresos, gastos, costos 6 y 7, no clasificado y neto", () => {
  const acc4 = account(1, "41750501", "Ingresos");
  const acc5 = account(2, "510506", "Gasto", { section: "gastos5" });
  const acc6 = account(3, "6135", "Costo 6", { section: "costos6" });
  const acc7 = account(4, "7105", "Costo 7", { section: "costosproduccion7" });
  const accX = account(5, "XX-01", "Ingreso no PUC", { section: "no_clasificado", type: "income" });
  const accY = account(6, "XX-02", "Gasto no PUC", { section: "no_clasificado", type: "expense" });
  const leaves = leavesOf(
    leaf(1, 1000, 800),
    leaf(2, -300, -200, { section: "gastos5", kind: "expense" }),
    leaf(3, -100, -50, { section: "costos6", kind: "expense" }),
    leaf(4, -80, 0, { section: "costosproduccion7", kind: "expense" }),
    leaf(5, 60, 0, { section: "no_clasificado", kind: "income" }),
    leaf(6, -20, 0, { section: "no_clasificado", kind: "expense" })
  );
  const result = pyg.sectionTotals(leaves);
  assert.equal(result.totals.ingresos4.actual, 1000);
  assert.equal(result.totals.gastos5.actual, -300);
  assert.equal(result.totals.costos6.actual, -100);
  assert.equal(result.totals.costosproduccion7.actual, -80);
  assert.equal(result.totals.no_clasificado.actual, 40);
  assert.equal(result.unclassified.income.actual, 60);
  assert.equal(result.unclassified.expense.actual, -20);
  assert.equal(result.net.actual, 560);
  assert.equal(result.net.prior, 550);
  assert.equal(result.net.difference, 10);
});

test("presupuesto: normalizacion, duplicados, negativos y upsert puntual que no toca otros periodos", () => {
  const payload = budgets.normalizeBudgetInput({
    period: "2026-03",
    rows: [
      { account_id: 1, branch_code: "B1", cost_center_code: "C1", amount: 100 },
      { account_id: 2, branch_code: "B1", cost_center_code: "C1", amount: "25.5" }
    ]
  });
  assert.equal(payload.period, "2026-03");
  assert.equal(payload.rows.length, 2);
  assert.equal(payload.rows[1].amount_cents, 2550);
  assert.throws(() => budgets.normalizeBudgetInput({ period: "2026-03", rows: [] }), (error) => error.code === "BUDGET_ROWS_REQUIRED");
  assert.throws(() => budgets.normalizeBudgetInput({ period: "2026-03", rows: [{ account_id: 1, branch_code: "B1", cost_center_code: "C1", amount: -5 }] }), (error) => error.code === "BUDGET_AMOUNT_NEGATIVE");
  assert.throws(() => budgets.normalizeBudgetInput({ period: "2026-03", rows: [{ account_id: 1, branch_code: "B1", cost_center_code: "C1", amount: "abc" }] }), (error) => error.code === "BUDGET_INVALID_AMOUNT");
  assert.throws(() => budgets.normalizeBudgetInput({ period: "2026-03", rows: [{ account_id: 1, branch_code: "B1", cost_center_code: "C1", amount: "" }] }), (error) => error.code === "BUDGET_INVALID_AMOUNT");
  assert.throws(() => budgets.normalizeBudgetInput({ period: "2026-03", rows: [{ account_id: 1, branch_code: "B1", cost_center_code: "C1", amount: true }] }), (error) => error.code === "BUDGET_INVALID_AMOUNT");
  assert.throws(() => budgets.normalizeBudgetInput({ period: "2026-03", rows: [{ account_id: 1, branch_code: "B1", cost_center_code: "C1", amount: 99999999999999 }] }), (error) => error.code === "BUDGET_INVALID_AMOUNT");
  assert.throws(() => budgets.normalizeBudgetInput({ period: "2026-03", rows: [{ account_id: 1, branch_code: "B1", cost_center_code: "C1", amount: "1e400" }] }), (error) => error.code === "BUDGET_INVALID_AMOUNT");
  assert.throws(() => budgets.normalizeBudgetInput({
    period: "2026-03",
    rows: [
      { account_id: 1, branch_code: "B1", cost_center_code: "C1", amount: 10 },
      { account_id: 1, branch_code: "B1", cost_center_code: "C1", amount: 20 }
    ]
  }), (error) => error.code === "BUDGET_DUPLICATE_ROW");

  const existing = [
    { period: "2026-02", account_id: 9, branch_code: "B1", cost_center_code: "C1", amount: 5, amount_cents: 500, updated_at: "t0", updated_by: null },
    { period: "2026-03", account_id: 1, branch_code: "B1", cost_center_code: "C1", amount: 10, amount_cents: 1000, updated_at: "t0", updated_by: null }
  ];
  const merged = budgets.mergeBudgetStore(existing, "2026-03", [
    { account_id: 1, branch_code: "B1", cost_center_code: "C1", amount: 30, amount_cents: 3000, account_code: "4175" },
    { account_id: 2, branch_code: "B1", cost_center_code: "C2", amount: 40, amount_cents: 4000, account_code: "5105" }
  ], "t1", 77);
  assert.equal(merged.created, 1);
  assert.equal(merged.updated, 1);
  assert.equal(merged.nextRows.length, 3);
  assert.equal(merged.nextRows.find((row) => row.period === "2026-02" && row.account_id === 9).amount, 5);
  const updated = merged.nextRows.find((row) => row.period === "2026-03" && row.account_id === 1);
  assert.equal(updated.amount, 30);
  assert.equal(updated.updated_by, 77);
});

test("referencias de presupuesto: cuenta, actividad, clase PUC y relacion sucursal-centro", () => {
  const tree = {
    branches: [{ code: "B1", name: "Bogota", active: true, society_code: "S1" }],
    cost_centers: [
      { code: "C1", name: "Operacion", active: true, branch_code: "B1", society_code: "S1" },
      { code: "C2", name: "Admin", active: true, branch_code: "B2", society_code: "S1" }
    ]
  };
  const ids = accountsById([
    account(1, "41750501", "Ingresos", { active: true, allows_tx: true }),
    account(2, "510506", "Gasto", { active: false, allows_tx: true }),
    account(3, "110505", "Caja", { active: true, allows_tx: true }),
    account(4, "6135", "Costo", { active: true, allows_tx: true })
  ]);
  const issues = budgets.budgetReferenceIssues(tree, ids, [
    { account_id: 99, branch_code: "B1", cost_center_code: "C1" },
    { account_id: 2, branch_code: "B1", cost_center_code: "C1" },
    { account_id: 3, branch_code: "B1", cost_center_code: "C1" },
    { account_id: 4, branch_code: "B9", cost_center_code: "C1" },
    { account_id: 4, branch_code: "B1", cost_center_code: "C2" },
    { account_id: 4, branch_code: "B1", cost_center_code: "C1" }
  ]);
  assert.deepEqual(issues.map((issue) => issue.code), [
    "BUDGET_ACCOUNT_NOT_FOUND",
    "BUDGET_ACCOUNT_INACTIVE",
    "BUDGET_ACCOUNT_NOT_PUC_4_7",
    "BUDGET_BRANCH_NOT_FOUND",
    "BUDGET_CENTER_BRANCH_MISMATCH"
  ]);
  assert.equal(issues.length, 5);
});

test("rutas del reporte interactivo: permisos contables, sin cache y sin cambios en globalservice", () => {
  assert.match(routes, /pyg-interactive/);
  assert.match(routes, /fastify\.get\("\/accounting\/reports\/pyg-interactive",/);
  assert.match(routes, /fastify\.get\("\/accounting\/reports\/pyg-interactive\/budgets",/);
  assert.match(routes, /fastify\.put\("\/accounting\/reports\/pyg-interactive\/budgets",/);
  assert.match(routes, /reply\.header\("Cache-Control", "no-store"\)/);
  const readOccurrences = (routes.match(/requirePermission\("accounting", "read"\)/g) || []).length;
  const writeOccurrences = (routes.match(/requirePermission\("accounting", "write"\)/g) || []).length;
  assert.ok(readOccurrences >= 2);
  assert.ok(writeOccurrences >= 1);
  assert.doesNotMatch(routes, /globalservice/);
});

test("motores de presupuesto y reporte comparten llaves y convenciones", () => {
  assert.equal(typeof pyg.getInteractivePyg, "function");
  assert.equal(typeof budgets.getPygBudgets, "function");
  assert.equal(typeof budgets.savePygBudgets, "function");
  assert.equal(pyg.UNASSIGNED_BRANCH, "Sin sucursal");
  assert.equal(pyg.UNASSIGNED_CENTER, "Sin centro de costo");
  assert.deepEqual(pyg.SECTIONS.ingresos4.label, "Ingresos (clase 4)");
  assert.deepEqual(pyg.CLASS_TO_SECTION, { 4: "ingresos4", 5: "gastos5", 6: "costos6", 7: "costosproduccion7" });
});
