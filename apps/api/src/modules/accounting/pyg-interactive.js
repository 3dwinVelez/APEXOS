/* Estado de resultados interactivo (Contable · PUC).
 * Fuente canonica de importes: LedgerEntry (nunca CntCuedoc). CntCuedoc se usa
 * unicamente como metadato de sucursal/centro de costo via ledger_entry_id.
 * Todas las consultas corren dentro del middleware de tenancy; las llaves raw
 * incluyen el tenant de forma parametrizada.
 */
const prisma = require("../../core/prisma");
const { getTenantConfig } = require("../../core/tenantCache");

const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const ALLOWED_DIMENSIONS = ["puc", "branch", "cost_center"];
const DEFAULT_DIMENSIONS = ["puc", "branch", "cost_center"];

const SECTIONS = {
  ingresos4: { key: "ingresos4", label: "Ingresos (clase 4)", cls: "4", order: 0 },
  gastos5: { key: "gastos5", label: "Gastos (clase 5)", cls: "5", order: 1 },
  costos6: { key: "costos6", label: "Costos (clase 6)", cls: "6", order: 2 },
  costosproduccion7: { key: "costosproduccion7", label: "Costos de producción (clase 7)", cls: "7", order: 3 },
  no_clasificado: { key: "no_clasificado", label: "Ingresos/gastos fuera del PUC", cls: null, order: 4 }
};
const CLASS_TO_SECTION = { 4: "ingresos4", 5: "gastos5", 6: "costos6", 7: "costosproduccion7" };
const UNASSIGNED_BRANCH = "Sin sucursal";
const UNASSIGNED_CENTER = "Sin centro de costo";

function appError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function round2(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function cents(value) {
  return Math.round((Number(value) || 0) * 100);
}

function parsePeriodInput(value) {
  const period = String(value || "").trim();
  if (!period) throw appError(400, "REQUIRED_PERIOD", "El periodo YYYY-MM es obligatorio");
  if (!PERIOD_RE.test(period)) throw appError(400, "INVALID_PERIOD", "El periodo debe tener formato YYYY-MM");
  return period;
}

function parseModeInput(value) {
  const mode = String(value || "month").trim().toLowerCase();
  if (mode !== "month" && mode !== "ytd") throw appError(400, "INVALID_MODE", "El modo debe ser month o ytd");
  return mode;
}

function validateDimensions(value) {
  const raw = value === undefined || value === null || value === ""
    ? DEFAULT_DIMENSIONS
    : (Array.isArray(value) ? value : String(value).split(","));
  const dims = raw.map((item) => String(item).trim().toLowerCase()).filter(Boolean);
  if (!dims.length) throw appError(400, "INVALID_DIMENSIONS", "La agrupacion requiere al menos la dimension puc");
  const invalid = dims.find((dim) => !ALLOWED_DIMENSIONS.includes(dim));
  if (invalid) throw appError(400, "INVALID_DIMENSIONS", `Dimension de agrupacion invalida: ${invalid}`);
  if (new Set(dims).size !== dims.length) throw appError(400, "INVALID_DIMENSIONS", "Las dimensiones de agrupacion no pueden repetirse");
  if (!dims.includes("puc")) throw appError(400, "INVALID_DIMENSIONS", "La dimension puc es obligatoria en la agrupacion");
  return dims;
}

function monthPeriods(period, mode) {
  const [year, month] = period.split("-").map(Number);
  if (mode === "month") return [period];
  const list = [];
  for (let m = 1; m <= month; m += 1) list.push(`${year}-${String(m).padStart(2, "0")}`);
  return list;
}

function shiftYearPeriods(periods) {
  return periods.map((period) => {
    const [year, month] = period.split("-").map(Number);
    return `${year - 1}-${String(month).padStart(2, "0")}`;
  });
}

function periodBounds(period) {
  const [year, month] = period.split("-").map(Number);
  return {
    start: new Date(Date.UTC(year, month - 1, 1)),
    end: new Date(Date.UTC(year, month, 1) - 1)
  };
}

function periodRange(period, mode) {
  const periods = monthPeriods(period, mode);
  const priorPeriods = shiftYearPeriods(periods);
  const currentBounds = { start: periodBounds(periods[0]).start, end: periodBounds(periods[periods.length - 1]).end };
  const priorBounds = { start: periodBounds(priorPeriods[0]).start, end: periodBounds(priorPeriods[priorPeriods.length - 1]).end };
  return {
    periods,
    prior_periods: priorPeriods,
    current: { start: currentBounds.start, end: currentBounds.end, periods },
    prior: { start: priorBounds.start, end: priorBounds.end, periods: priorPeriods }
  };
}

function pucClassOf(code) {
  const text = String(code || "");
  return /^\d/.test(text) ? text[0] : null;
}

function sectionOfAccount(account) {
  const cls = pucClassOf(account.code);
  if (CLASS_TO_SECTION[cls]) return CLASS_TO_SECTION[cls];
  if (account.type === "income" || account.type === "expense") return "no_clasificado";
  return null;
}

/* Importe firmado como contribucion al resultado: ingresos positivos,
 * gastos/costos negativos. Con doble partida ambos equivalen a credit - debit. */
function signedCents(debit, credit) {
  return cents(credit) - cents(debit);
}

/* El presupuesto se guarda siempre como magnitud no negativa; al agregarlo se
 * firma segun la naturaleza de la cuenta para que desvio y ejecucion sean
 * coherentes (ingresos positivos, gastos/costos negativos). */
function signedBudgetCents(section, amount) {
  const value = section === "ingresos4" ? cents(amount) : -cents(amount);
  return value === 0 ? 0 : value;
}

function sectionMeta(sectionKey) {
  return SECTIONS[sectionKey] || SECTIONS.no_clasificado;
}

function accountLabel(account) {
  return `${account.code} · ${account.name}`;
}

function branchLabelOf(code, labels) {
  if (!code) return UNASSIGNED_BRANCH;
  const row = labels.get(code);
  if (!row) return `${code} (sin maestro)`;
  return row.active === false ? `${row.name || code} (inactiva)` : row.name || code;
}

function centerLabelOf(code, labels) {
  if (!code) return UNASSIGNED_CENTER;
  const row = labels.get(code);
  if (!row) return `${code} (sin maestro)`;
  return row.active === false ? `${row.name || code} (inactivo)` : row.name || code;
}

/* Acepta tanto la config completa del tenant ({ accounting: {...} }) como la
 * seccion accounting ({ organization_tree: {...} }) que usan los llamadores. */
function parseOrganizationTree(config) {
  const source = config && typeof config === "object" ? config : {};
  const accounting = source.accounting && typeof source.accounting === "object" ? source.accounting : source;
  const tree = accounting.organization_tree && typeof accounting.organization_tree === "object" ? accounting.organization_tree : {};
  return {
    societies: Array.isArray(tree.societies) ? tree.societies : [],
    branches: Array.isArray(tree.branches) ? tree.branches : [],
    cost_centers: Array.isArray(tree.cost_centers) ? tree.cost_centers : []
  };
}

/* Convierte valores de presupuesto sin coercionar cadenas vacias o no numericas
 * a cero: NaN indica valor invalido para el llamador. */
function parseAmount(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : NaN;
  }
  return NaN;
}

/* Cobertura de periodos del presupuesto frente al rango pedido (mes o YTD). */
function budgetCoverageOf(expectedPeriods, foundPeriods) {
  if (!foundPeriods.length) return "none";
  return foundPeriods.length >= expectedPeriods.length ? "full" : "partial";
}

/* Cobertura por hoja: cada tupla cuenta/sucursal/centro lleva el conjunto de
 * meses planeados. El reporte solo es completo si TODAS las hojas con
 * presupuesto cubren TODOS los periodos del rango; una hoja sin un mes marca
 * parcial aunque la union global de meses parezca completa. */
function budgetCoverageFromLeaves(expectedPeriods, leaves) {
  let covered = 0;
  let full = 0;
  const months = new Set();
  for (const leaf of leaves.values()) {
    const planned = leaf && leaf.budget_months && leaf.budget_months.size ? leaf.budget_months : null;
    if (!planned) continue;
    covered += 1;
    for (const month of planned) months.add(month);
    if ([...expectedPeriods].every((period) => planned.has(period))) full += 1;
  }
  return {
    months_found: [...months].sort(),
    coverage: covered === 0 ? "none" : full === covered ? "full" : "partial"
  };
}

function organizationMaps(tree) {
  const branches = new Map();
  for (const row of tree.branches) if (row && typeof row.code === "string" && row.code.trim()) branches.set(row.code.trim(), row);
  const centers = new Map();
  for (const row of tree.cost_centers) if (row && typeof row.code === "string" && row.code.trim()) centers.set(row.code.trim(), row);
  return { branches, centers };
}

function readBudgetStore(accounting) {
  const raw = accounting && typeof accounting === "object" ? accounting.pyg_budgets : null;
  if (Array.isArray(raw)) return { rows: raw };
  if (raw && typeof raw === "object" && Array.isArray(raw.rows)) return raw;
  return { rows: [] };
}

function chunked(list, size) {
  const chunks = [];
  for (let index = 0; index < list.length; index += size) chunks.push(list.slice(index, index + size));
  return chunks;
}

function assignmentForMetadata(rows) {
  if (!rows.length) return { status: "orphan", branch: "", center: "" };
  const tuples = new Set();
  for (const row of rows) tuples.add(`${String(row.branch_code || "").trim()}|${String(row.cost_center_code || "").trim()}`);
  if (tuples.size > 1) return { status: "ambiguous", branch: "", center: "" };
  const [branch, center] = [...tuples][0].split("|");
  const missingBranch = !branch;
  const missingCenter = !center;
  if (missingBranch && missingCenter) return { status: "unassigned", branch: "", center: "" };
  return { status: missingBranch || missingCenter ? "partial" : "linked", branch, center, missing_branch: missingBranch, missing_center: missingCenter };
}

/* Construye la ruta de ancestros PUC real (parent_id) de una cuenta, sin inventar
 * padres por prefijo. Detiene ciclos y padres inexistentes/foraneos con warning. */
function pucPathOf(accountId, accountsById, warnings, seen) {
  if (seen.has(accountId)) return seen.get(accountId);
  const path = [];
  const visited = new Set();
  let current = accountId;
  while (current !== null && current !== undefined) {
    if (visited.has(current)) {
      const account = accountsById.get(current) || accountsById.get(accountId);
      warnings.push({ code: "PUC_CYCLE", message: `Ciclo de parent_id detectado en la cuenta ${account ? account.code : current}; la cuenta queda como raiz de su clase` });
      break;
    }
    visited.add(current);
    const account = accountsById.get(current);
    if (!account) {
      warnings.push({ code: "PUC_PARENT_MISSING", message: `La cuenta ${current} referencia un padre inexistente (parent_id); la cuenta queda como raiz de su clase` });
      break;
    }
    if (path.length && account.section !== path[0].section && account.section !== "no_clasificado" && path[0].section !== "no_clasificado") {
      warnings.push({ code: "PUC_FOREIGN_PARENT", message: `La cuenta ${account.code} cuelga de un padre de otra clase PUC; la cuenta queda como raiz de su clase` });
      break;
    }
    path.unshift(account);
    if (account.parent_id === null || account.parent_id === undefined) break;
    current = account.parent_id;
  }
  seen.set(accountId, path);
  return path;
}

function nodeSortValue(node) {
  if (node.dimension === "puc") return node.sectionOrder ?? 0;
  return 0;
}

function compareNodes(a, b) {
  if (a.dimension === "puc" && b.dimension === "puc") {
    if (a.sectionOrder !== b.sectionOrder) return a.sectionOrder - b.sectionOrder;
    return String(a.code).localeCompare(String(b.code), undefined, { numeric: true });
  }
  const aUnassigned = String(a.code || "") === "";
  const bUnassigned = String(b.code || "") === "";
  if (aUnassigned !== bUnassigned) return aUnassigned ? 1 : -1;
  return String(a.name).localeCompare(String(b.name), undefined, { numeric: true });
}

/* Motor puro del arbol de la matriz. Los importes se agregan por centavos y cada
 * hoja contribuye exactamente una vez a cada nodo de su ruta (sin doble conteo). */
function buildMatrixTree({ leaves, accountsById, dims, branchLabels, centerLabels, budgetPeriods = [] }) {
  const warnings = [];
  const pathCache = new Map();
  const nodeIndex = new Map();
  const roots = [];
  const expectedMonths = budgetPeriods;
  function ensureNode(parentKey, parentList, dimension, code, make) {
    const key = `${parentKey}/${dimension}:${code}`;
    const existing = nodeIndex.get(key);
    if (existing) return existing;
    const node = {
      key,
      dimension,
      code,
      name: "",
      section: null,
      sectionOrder: 0,
      level: 0,
      account_id: null,
      inactive: false,
      children: [],
      direct: { actual: 0, prior: 0, budget: 0, leafRows: 0, budgetRows: 0, budgetFullRows: 0, budgetMonths: new Set() },
      totals: null,
      sections: new Set()
    };
    Object.assign(node, make(node));
    nodeIndex.set(key, node);
    parentList.push(node);
    return node;
  }
  const ROOT_KEY = "$";
  for (const leaf of leaves.values()) {
    const account = accountsById.get(leaf.account_id);
    if (!account) {
      warnings.push({ code: "LEAF_ACCOUNT_MISSING", message: `Hoja con cuenta ${leaf.account_id} sin registro en el plan; el importe se excluye del arbol`, detail: { account_id: leaf.account_id } });
      continue;
    }
    let parentKey = ROOT_KEY;
    let parentList = roots;
    let terminal = null;
    for (const dim of dims) {
      if (dim === "puc") {
        const path = pucPathOf(account.id, accountsById, warnings, pathCache);
        for (const step of path) {
          /* La llave estable sigue siendo el id interno; el code expuesto es el
           * codigo PUC canonico que el reporte y el orden deben mostrar. */
          terminal = ensureNode(parentKey, parentList, "puc", String(step.id), () => ({
            code: String(step.code),
            name: accountLabel(step),
            section: step.section,
            sectionOrder: sectionMeta(step.section).order,
            level: Number(step.level) || 1,
            account_id: step.id,
            inactive: step.active === false
          }));
          parentKey = terminal.key;
          parentList = terminal.children;
        }
      } else if (dim === "branch") {
        terminal = ensureNode(parentKey, parentList, "branch", leaf.branch || "", () => ({
          name: branchLabelOf(leaf.branch || "", branchLabels),
          level: 1
        }));
        parentKey = terminal.key;
        parentList = terminal.children;
      } else if (dim === "cost_center") {
        terminal = ensureNode(parentKey, parentList, "cost_center", `${leaf.branch || ""}|${leaf.center || ""}`, () => ({
          name: centerLabelOf(leaf.center || "", centerLabels),
          level: 1
        }));
        parentKey = terminal.key;
        parentList = terminal.children;
      }
    }
    const sink = terminal;
    sink.direct.actual += leaf.current_cents;
    sink.direct.prior += leaf.prior_cents;
    sink.direct.leafRows += 1;
    sink.sections.add(account.section);
    if (leaf.budget_cents !== null) {
      sink.direct.budget += leaf.budget_cents;
      sink.direct.budgetRows += 1;
      const planned = leaf.budget_months && leaf.budget_months.size ? leaf.budget_months : new Set();
      for (const month of planned) sink.direct.budgetMonths.add(month);
      if (!expectedMonths.length || expectedMonths.every((month) => planned.has(month))) sink.direct.budgetFullRows += 1;
    }
  }
  /* Agregado interno (una sola ejecucion por nodo via cache) separado del DTO
   * serializado: los padres consumen los Sets del agregado, nunca del DTO. */
  const rolledCache = new WeakMap();
  function rollupAggregate(node) {
    if (rolledCache.has(node)) return rolledCache.get(node);
    const aggregate = {
      actual_cents: node.direct.actual,
      prior_cents: node.direct.prior,
      budget_cents: node.direct.budget,
      leaf_rows: node.direct.leafRows,
      budget_rows: node.direct.budgetRows,
      budget_full_rows: node.direct.budgetFullRows,
      sections: new Set(node.sections),
      budget_months: new Set(node.direct.budgetMonths)
    };
    for (const child of node.children) {
      const childAggregate = rollupAggregate(child);
      aggregate.actual_cents += childAggregate.actual_cents;
      aggregate.prior_cents += childAggregate.prior_cents;
      aggregate.budget_cents += childAggregate.budget_cents;
      aggregate.leaf_rows += childAggregate.leaf_rows;
      aggregate.budget_rows += childAggregate.budget_rows;
      aggregate.budget_full_rows += childAggregate.budget_full_rows;
      for (const section of childAggregate.sections) aggregate.sections.add(section);
      for (const month of childAggregate.budget_months) aggregate.budget_months.add(month);
    }
    rolledCache.set(node, aggregate);
    return aggregate;
  }
  function serialize(node) {
    const aggregate = rollupAggregate(node);
    const { actual_cents, prior_cents, budget_cents, leaf_rows, budget_rows, budget_full_rows, sections, budget_months } = aggregate;
    let section = node.section;
    if (!section || sections.size > 1) section = "mixed";
    else if (sections.size === 1) section = [...sections][0];
    const amount = round2(actual_cents / 100);
    const priorAmount = round2(prior_cents / 100);
    const budgetDefined = budget_rows > 0;
    const budgetAmount = budgetDefined ? round2(budget_cents / 100) : null;
    const difference = round2(amount - priorAmount);
    const variationPct = prior_cents === 0 ? null : round2(((actual_cents - prior_cents) / Math.abs(prior_cents)) * 100);
    const budgetVariance = budgetDefined ? round2(amount - budgetAmount) : null;
    const budgetExecutionPct = budgetDefined && budget_cents !== 0 ? round2((actual_cents / budget_cents) * 100) : null;
    const budgetStatus = !budgetDefined ? "none" : (budget_rows >= leaf_rows && budget_full_rows >= budget_rows ? "complete" : "partial");
    const monthsFound = [...budget_months].sort();
    const budgetCoverage = !budgetDefined ? "none" : (budget_full_rows >= budget_rows && monthsFound.length >= expectedMonths.length ? "full" : "partial");
    node.totals = {
      actual_cents,
      prior_cents,
      budget_cents,
      leaf_rows,
      budget_rows,
      sections
    };
    node.section = section;
    node.sectionOrder = sectionMeta(section === "mixed" ? "no_clasificado" : section).order;
    const rolled = {
      key: node.key,
      dimension: node.dimension,
      code: node.code,
      name: node.name,
      section,
      level: node.level,
      account_id: node.account_id,
      inactive: node.inactive,
      is_leaf: node.children.length === 0,
      children: node.children.map(serialize).sort(compareNodes),
      actual: amount,
      prior: priorAmount,
      difference,
      variation_pct: variationPct,
      budget: budgetAmount,
      budget_status: budgetStatus,
      budget_variance: budgetVariance,
      budget_execution_pct: budgetExecutionPct,
      budget_coverage: budgetCoverage,
      budget_months_found: monthsFound,
      leaf_rows,
      budget_rows,
      has_movement: actual_cents !== 0 || prior_cents !== 0,
      amount_cents: actual_cents,
      prior_cents,
      budget_cents,
      sections: [...sections]
    };
    return rolled;
  }
  const tree = roots.map((node) => serialize(node)).sort(compareNodes);
  return { nodes: tree, warnings };
}

function totalEntry(leaves, accountSection, kindFilter = null, expectedPeriods = []) {
  let actual = 0;
  let prior = 0;
  let budget = 0;
  let leafRows = 0;
  let budgetRows = 0;
  let budgetFullRows = 0;
  const budgetMonths = new Set();
  for (const leaf of leaves.values()) {
    if (leaf.section !== accountSection) continue;
    if (kindFilter && leaf.kind !== kindFilter) continue;
    actual += leaf.current_cents;
    prior += leaf.prior_cents;
    leafRows += 1;
    if (leaf.budget_cents !== null) {
      budget += leaf.budget_cents;
      budgetRows += 1;
      const planned = leaf.budget_months && leaf.budget_months.size ? leaf.budget_months : new Set();
      for (const month of planned) budgetMonths.add(month);
      if (!expectedPeriods.length || expectedPeriods.every((month) => planned.has(month))) budgetFullRows += 1;
    }
  }
  const budgetDefined = budgetRows > 0;
  /* Cobertura por hoja: una hoja sin presupuesto deja la seccion en parcial;
   * el mes ausente de una hoja con presupuesto tambien, aunque la union de
   * meses parezca completa. */
  const budgetStatus = !budgetDefined
    ? "none"
    : (budgetRows >= leafRows && budgetFullRows >= budgetRows ? "complete" : "partial");
  const budgetAmount = budgetDefined ? round2(budget / 100) : null;
  return {
    actual: round2(actual / 100),
    prior: round2(prior / 100),
    difference: round2((actual - prior) / 100),
    variation_pct: prior === 0 ? null : round2(((actual - prior) / Math.abs(prior)) * 100),
    budget: budgetAmount,
    budget_status: budgetStatus,
    budget_variance: budgetDefined ? round2((actual - budget) / 100) : null,
    budget_execution_pct: budgetDefined && budget !== 0 ? round2((actual / budget) * 100) : null,
    budget_months_found: [...budgetMonths].sort(),
    leaf_rows: leafRows,
    budget_rows: budgetRows
  };
}

async function loadLeaves(tenantId, query) {
  const period = parsePeriodInput(query.period);
  const mode = parseModeInput(query.mode);
  const dims = validateDimensions(query.dimensions);
  const range = periodRange(period, mode);
  const branchFilter = String(query.branch || "").trim();
  const centerFilter = String(query.cost_center || query.center || "").trim();

  return prisma.runWithTenant(tenantId, async () => {
    const allAccounts = await prisma.account.findMany({
      where: { __includeInactive: true },
      orderBy: { code: "asc" }
    });
    const relevant = allAccounts.filter((account) => {
      const cls = pucClassOf(account.code);
      if (CLASS_TO_SECTION[cls]) return true;
      return account.type === "income" || account.type === "expense";
    });
    const accountsById = new Map();
    for (const account of relevant) {
      accountsById.set(account.id, {
        id: account.id,
        code: String(account.code),
        name: String(account.name),
        type: account.type,
        class: pucClassOf(account.code),
        section: sectionOfAccount(account),
        parent_id: account.parent_id,
        level: account.level,
        active: account.active === true,
        allows_tx: account.allows_tx !== false
      });
    }
    const accountIds = [...accountsById.keys()];

    const [currentEntries, priorEntries] = await Promise.all([
      prisma.ledgerEntry.findMany({
        where: { account_id: { in: accountIds }, date: { gte: range.current.start, lte: range.current.end } },
        select: { id: true, account_id: true, debit: true, credit: true }
      }),
      prisma.ledgerEntry.findMany({
        where: { account_id: { in: accountIds }, date: { gte: range.prior.start, lte: range.prior.end } },
        select: { id: true, account_id: true, debit: true, credit: true }
      })
    ]);

    const entryIds = [...new Set([...currentEntries.map((row) => row.id), ...priorEntries.map((row) => row.id)])];
    const metaRows = [];
    for (const batch of chunked(entryIds, 4000)) {
      const rows = await prisma.cntCuedoc.findMany({
        where: { tenant_id: tenantId, ledger_entry_id: { in: batch } },
        select: { ledger_entry_id: true, branch_code: true, cost_center_code: true }
      });
      metaRows.push(...rows);
    }
    const metaByEntry = new Map();
    for (const row of metaRows) {
      const list = metaByEntry.get(row.ledger_entry_id) || [];
      list.push(row);
      metaByEntry.set(row.ledger_entry_id, list);
    }

    const linkage = {
      ledger_entries: entryIds.length,
      linked: 0,
      orphan: 0,
      ambiguous: 0,
      partial: 0,
      missing_branch: 0,
      missing_center: 0,
      orphan_amount_cents: 0,
      ambiguous_amount_cents: 0,
      missing_branch_amount_cents: 0,
      missing_center_amount_cents: 0
    };
    const assignments = new Map();
    for (const entryId of entryIds) {
      const assignment = assignmentForMetadata(metaByEntry.get(entryId) || []);
      assignments.set(entryId, assignment);
      if (assignment.status === "linked") linkage.linked += 1;
      else if (assignment.status === "orphan") linkage.orphan += 1;
      else if (assignment.status === "ambiguous") linkage.ambiguous += 1;
      else { linkage.partial += 1; if (assignment.missing_branch) linkage.missing_branch += 1; if (assignment.missing_center) linkage.missing_center += 1; }
    }

    const leaves = new Map();
    function addEntries(entries, target) {
      for (const entry of entries) {
        const account = accountsById.get(entry.account_id);
        if (!account) continue;
        const signed = signedCents(entry.debit, entry.credit);
        const assignment = assignments.get(entry.id) || { status: "orphan", branch: "", center: "" };
        if (assignment.status === "orphan") linkage.orphan_amount_cents += signed;
        if (assignment.status === "ambiguous") linkage.ambiguous_amount_cents += signed;
        if (assignment.missing_branch) linkage.missing_branch_amount_cents += signed;
        if (assignment.missing_center) linkage.missing_center_amount_cents += signed;
        if (branchFilter && assignment.branch !== branchFilter) continue;
        if (centerFilter && assignment.center !== centerFilter) continue;
        const key = `${entry.account_id}|${assignment.branch}|${assignment.center}`;
        const leaf = leaves.get(key) || {
          account_id: entry.account_id,
          branch: assignment.branch,
          center: assignment.center,
          section: account.section,
          kind: account.type === "expense" ? "expense" : "income",
          current_cents: 0,
          prior_cents: 0,
          budget_cents: null,
          budget_months: new Set()
        };
        leaf[target] += signed;
        leaves.set(key, leaf);
      }
    }
    addEntries(currentEntries, "current_cents");
    addEntries(priorEntries, "prior_cents");

    // Presupuesto mensual por cuenta/sucursal/centro desde la config del tenant.
    const config = await getTenantConfig(tenantId);
    const tree = parseOrganizationTree(config);
    const budgetPeriods = range.periods;
    const storeRows = readBudgetStore(config.accounting).rows;
    const budgetRows = storeRows
      .filter((row) => row && typeof row === "object" && budgetPeriods.includes(String(row.period || "").trim()));
    const budgetWarnings = [];
    for (const row of budgetRows) {
      const accountId = Number(row.account_id);
      const branch = String(row.branch_code || "").trim();
      const center = String(row.cost_center_code || "").trim();
      const amount = parseAmount(row.amount);
      const account = accountsById.get(accountId);
      if (!account) {
        budgetWarnings.push({ code: "BUDGET_ORPHAN_ACCOUNT", message: `Presupuesto referenciando cuenta ${accountId} inexistente en el plan actual`, detail: { account_id: accountId, period: row.period } });
        continue;
      }
      if (!CLASS_TO_SECTION[pucClassOf(account.code)]) {
        budgetWarnings.push({ code: "BUDGET_NON_PUC_ACCOUNT", message: `Presupuesto en cuenta no PUC 4-7 ${account.code}`, detail: { account_code: account.code, period: row.period } });
        continue;
      }
      if (!branch || !center || !Number.isFinite(amount) || amount < 0) {
        budgetWarnings.push({ code: "BUDGET_INVALID_ROW", message: `Presupuesto invalido para ${account.code}`, detail: { period: row.period, branch, center, amount } });
        continue;
      }
      if (branchFilter && branch !== branchFilter) continue;
      if (centerFilter && center !== centerFilter) continue;
      const key = `${accountId}|${branch}|${center}`;
      const signedBudget = signedBudgetCents(account.section, amount);
      const month = String(row.period || "").trim();
      const existing = leaves.get(key);
      if (existing) {
        existing.budget_cents = (existing.budget_cents || 0) + signedBudget;
        existing.budget_months.add(month);
      } else {
        leaves.set(key, {
          account_id: accountId,
          branch,
          center,
          section: account.section,
          kind: account.type === "expense" ? "expense" : "income",
          current_cents: 0,
          prior_cents: 0,
          budget_cents: signedBudget,
          budget_months: new Set([month])
        });
      }
    }
    const { months_found: budgetPeriodsFound, coverage: budgetCoverage } = budgetCoverageFromLeaves(budgetPeriods, leaves);
    if (budgetCoverage === "partial") {
      budgetWarnings.push({
        code: "BUDGET_PARTIAL_PERIOD_COVERAGE",
        message: `El presupuesto no cubre todos los periodos del rango en todas las cuentas/sucursales/centros; los periodos sin presupuesto no aportan al comparativo`,
        detail: { expected: budgetPeriods, found: budgetPeriodsFound }
      });
    }

    const coverage = linkage.ledger_entries ? round2((linkage.linked / linkage.ledger_entries) * 100) : null;
    return {
      period,
      mode,
      dims,
      range,
      branchFilter,
      centerFilter,
      leaves,
      accountsById,
      tree,
      linkage: {
        ledger_entries: linkage.ledger_entries,
        linked: linkage.linked,
        orphan: linkage.orphan,
        ambiguous: linkage.ambiguous,
        partial: linkage.partial,
        missing_branch: linkage.missing_branch,
        missing_center: linkage.missing_center,
        coverage_pct: coverage,
        orphan_amount: round2(linkage.orphan_amount_cents / 100),
        ambiguous_amount: round2(linkage.ambiguous_amount_cents / 100),
        missing_branch_amount: round2(linkage.missing_branch_amount_cents / 100),
        missing_center_amount: round2(linkage.missing_center_amount_cents / 100)
      },
      budget_warnings: budgetWarnings,
      budget_periods: budgetPeriods,
      budget_periods_found: budgetPeriodsFound,
      budget_coverage: budgetCoverage
    };
  });
}

function sectionTotals(leaves, expectedPeriods = []) {
  const totals = {};
  for (const key of ["ingresos4", "gastos5", "costos6", "costosproduccion7", "no_clasificado"]) {
    totals[key] = totalEntry(leaves, key, null, expectedPeriods);
  }
  const unclassifiedIncome = totalEntry(leaves, "no_clasificado", "income", expectedPeriods);
  const unclassifiedExpense = totalEntry(leaves, "no_clasificado", "expense", expectedPeriods);
  const net = {
    actual: round2(totals.ingresos4.actual + totals.gastos5.actual + totals.costos6.actual + totals.costosproduccion7.actual + totals.no_clasificado.actual),
    prior: round2(totals.ingresos4.prior + totals.gastos5.prior + totals.costos6.prior + totals.costosproduccion7.prior + totals.no_clasificado.prior),
    budget: null,
    budget_status: "none"
  };
  const budgetDefined = Object.values(totals).some((entry) => entry.budget !== null);
  if (budgetDefined) {
    net.budget = round2(Object.values(totals).reduce((sum, entry) => sum + (entry.budget ?? 0), 0));
    const complete = Object.values(totals).every((entry) => entry.leaf_rows === 0 || entry.budget_status === "complete");
    net.budget_status = complete ? "complete" : "partial";
  }
  net.difference = round2(net.actual - net.prior);
  net.variation_pct = net.prior === 0 ? null : round2(((net.actual - net.prior) / Math.abs(net.prior)) * 100);
  net.budget_variance = net.budget === null ? null : round2(net.actual - net.budget);
  net.budget_execution_pct = net.budget === null || net.budget === 0 ? null : round2((net.actual / net.budget) * 100);
  return { totals, unclassified: { income: unclassifiedIncome, expense: unclassifiedExpense }, net };
}

async function getInteractivePyg(tenantId, query = {}) {
  const loaded = await loadLeaves(tenantId, query);
  const { leaves, accountsById, tree, dims, period, mode, range, branchFilter, centerFilter, linkage, budget_warnings, budget_periods, budget_periods_found, budget_coverage } = loaded;
  const { branches, centers } = organizationMaps(tree);
  const built = buildMatrixTree({ leaves, accountsById, dims, branchLabels: branches, centerLabels: centers, budgetPeriods: budget_periods });
  const { totals, unclassified, net } = sectionTotals(leaves, budget_periods);

  const warnings = [];
  if (linkage.orphan) warnings.push({ code: "LEDGER_WITHOUT_METADATA", message: `${linkage.orphan} asientos sin comprobante contable vinculado se presentan en "${UNASSIGNED_BRANCH}" / "${UNASSIGNED_CENTER}"`, detail: { entries: linkage.orphan, amount: linkage.orphan_amount } });
  if (linkage.ambiguous) warnings.push({ code: "LEDGER_AMBIGUOUS_METADATA", message: `${linkage.ambiguous} asientos con varios centros/sucursales vinculados se presentan sin asignar para no multiplicar importes`, detail: { entries: linkage.ambiguous, amount: linkage.ambiguous_amount } });
  if (linkage.missing_center) warnings.push({ code: "LEDGER_MISSING_CENTER", message: `${linkage.missing_center} asientos con sucursal pero sin centro de costo se presentan en "${UNASSIGNED_CENTER}"`, detail: { entries: linkage.missing_center, amount: linkage.missing_center_amount } });
  if (linkage.missing_branch) warnings.push({ code: "LEDGER_MISSING_BRANCH", message: `${linkage.missing_branch} asientos con centro de costo pero sin sucursal se presentan en "${UNASSIGNED_BRANCH}"`, detail: { entries: linkage.missing_branch, amount: linkage.missing_branch_amount } });
  if (branchFilter && !branches.has(branchFilter)) warnings.push({ code: "FILTER_BRANCH_NOT_IN_MASTER", message: `El filtro de sucursal ${branchFilter} no existe en el maestro de estructura` });
  if (centerFilter && !centers.has(centerFilter)) warnings.push({ code: "FILTER_CENTER_NOT_IN_MASTER", message: `El filtro de centro de costo ${centerFilter} no existe en el maestro de estructura` });
  for (const warning of built.warnings) warnings.push(warning);
  for (const warning of budget_warnings) warnings.push(warning);

  const sections = ["ingresos4", "gastos5", "costos6", "costosproduccion7", "no_clasificado"].map((key) => ({
    key,
    label: sectionMeta(key).label,
    ...totals[key]
  }));

  return {
    period,
    mode,
    dimensions: dims,
    filters: { branch: branchFilter || null, cost_center: centerFilter || null },
    range: {
      start: range.current.start.toISOString().slice(0, 10),
      end: range.current.end.toISOString().slice(0, 10),
      periods: range.current.periods
    },
    prior_range: {
      start: range.prior.start.toISOString().slice(0, 10),
      end: range.prior.end.toISOString().slice(0, 10),
      periods: range.prior.periods
    },
    budget_periods,
    budget_periods_found,
    budget_coverage,
    sections,
    unclassified: {
      income: unclassified.income,
      expense: unclassified.expense
    },
    net,
    nodes: built.nodes,
    organization: {
      branches: tree.branches.map((row) => ({ code: String(row.code || "").trim(), name: row.name || row.code, active: row.active !== false, society_code: row.society_code || null })),
      cost_centers: tree.cost_centers.map((row) => ({ code: String(row.code || "").trim(), name: row.name || row.code, active: row.active !== false, branch_code: row.branch_code || null, society_code: row.society_code || null }))
    },
    linkage,
    warnings,
    is_empty: leaves.size === 0,
    metadata: {
      generated_at: new Date().toISOString(),
      source: "ledger",
      amount_convention: "signed_net_contribution",
      accounts_included: accountsById.size,
      prior_year_only: true
    }
  };
}

module.exports = {
  getInteractivePyg,
  parsePeriodInput,
  parseModeInput,
  validateDimensions,
  periodRange,
  monthPeriods,
  shiftYearPeriods,
  pucClassOf,
  sectionOfAccount,
  signedCents,
  signedBudgetCents,
  assignmentForMetadata,
  buildMatrixTree,
  sectionTotals,
  readBudgetStore,
  parseOrganizationTree,
  parseAmount,
  budgetCoverageOf,
  budgetCoverageFromLeaves,
  organizationMaps,
  UNASSIGNED_BRANCH,
  UNASSIGNED_CENTER,
  SECTIONS,
  CLASS_TO_SECTION
};
