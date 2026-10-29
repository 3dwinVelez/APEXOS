/* Motor puro del PYG por vehiculo con fuente contable (LedgerEntry via
 * getInteractivePyg). Sin Prisma: recibe las hojas terminales centro de costo
 * ya firmadas (credito - debito), la configuracion de conceptos con rangos
 * PUC y la estructura organizacional, y produce el DTO del reporte.
 *
 * Convenciones:
 *  - Concepto ingreso  -> contribucion = credit - debit (positivo a favor).
 *  - Concepto gasto    -> contribucion = debit - credit (positivo = gasto).
 *  - Concepto impuesto -> debit - credit; DEPRECIACION informativa se presenta
 *    pero NO se resta en la utilidad neta (comportamiento del Excel).
 *  - Presupuesto null = sin presupuesto (nunca cero implicito); cero
 *    presupuestado conserva su valor 0 con cobertura.
 *  - La reconciliacion corporativa incluye TODOS los centros, asignados o no;
 *    ningun importe desaparece y nada se asigna dos veces.
 */

const {
  matchAccountCode,
  isSubtotalKind,
  conceptHasAccounts,
  PENDING_MESSAGE,
  UNCLASSIFIED_INCOME_CONCEPT,
  UNCLASSIFIED_EXPENSE_CONCEPT
} = require("./account-config");

const UNASSIGNED_BUCKET = "SIN_VEHICULO";

function round2(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function cents(value) {
  return Math.round(Number(value || 0) * 100);
}

function periodEndOf(period) {
  const [year, month] = String(period).split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${period}-${String(lastDay).padStart(2, "0")}`;
}

function pct(numerator, denominator) {
  if (!denominator || Math.abs(denominator) < 1e-9) return null;
  return Math.round((numerator / denominator) * 10000) / 10000;
}

function normalizePlate(value) {
  return String(value || "").toUpperCase().replace(/\s+/g, "");
}

function normalizeCode(value) {
  return String(value || "").trim().toUpperCase();
}

function signedDisplay(kind, signedCentsValue) {
  if (signedCentsValue === null || signedCentsValue === undefined) return null;
  const sign = kind === "income" ? 1 : -1;
  return round2((sign * Number(signedCentsValue)) / 100);
}

// Los subtotales se derivan de formulas conocidas por tipo/seccion; nunca se
// evaluan cadenas arbitrarias del usuario.
const SUBTOTAL_FORMULA = {
  subtotal_ingresos: (rows) => rows.filter((row) => row.kind === "income" && row.section === "ingresos"),
  subtotal_gastos_operativos: (rows) => rows.filter((row) => row.kind === "expense" && row.section === "gastos_operativos"),
  subtotal_utilidad_operacional: null,
  subtotal_antes_de_impuestos: null,
  subtotal_utilidad_neta: null
};

function combineCoverage(coverages) {
  const list = coverages.filter((value) => value !== undefined && value !== null);
  if (!list.length) return "none";
  if (list.every((value) => value === "full")) return "full";
  if (list.every((value) => value === "none")) return "none";
  return "partial";
}

function signedBudgetSum(terms) {
  const values = terms.map((term) => term.value).filter((value) => value !== null && value !== undefined);
  if (!values.length) return null;
  return round2(terms.reduce((sum, term) => sum + (term.value == null ? 0 : term.sign * term.value), 0));
}

function centerAssignments(tree) {
  const byCode = new Map();
  for (const row of tree.cost_centers || []) {
    if (!row || row.code === undefined || row.code === null) continue;
    const key = normalizeCode(row.code);
    if (!key) continue;
    const list = byCode.get(key) || [];
    list.push(row);
    byCode.set(key, list);
  }
  return byCode;
}

function vehicleBranches(vehicle, tree) {
  const plateKey = normalizePlate(vehicle.plate);
  const branches = new Set();
  for (const row of tree.cost_centers || []) {
    const belongs = (row.vehicle_id != null && Number(row.vehicle_id) === Number(vehicle.id))
      || (plateKey && normalizePlate(row.code) === plateKey);
    const branch = normalizeCode(row.branch_code);
    if (belongs && branch) branches.add(branch);
  }
  return branches;
}

function branchKeyOf(row) {
  return normalizeCode(row && row.branch_code);
}

// Las hojas del libro traen la sucursal en `branch`; el maestro de
// organization_tree la guarda en `branch_code`.
function leafBranchKey(leaf) {
  return normalizeCode(leaf && leaf.branch);
}

// El codigo del centro puede ser la placa del vehiculo y repetirse en varias
// sucursales. Solo se asigna cuando el centro y la sucursal identifican un
// unico registro; cualquier ambiguedad deja la hoja sin vehiculo.
function centerRowForLeaf(leaf, byCenterCode, warnings) {
  const centerKey = normalizeCode(leaf.center || "");
  if (!centerKey) return null;
  const rows = (byCenterCode.get(centerKey) || []).filter((row) => row.vehicle_id != null);
  if (!rows.length) return null;
  const branchKey = leafBranchKey(leaf);
  if (branchKey) {
    const sameBranch = rows.filter((row) => branchKeyOf(row) === branchKey);
    if (sameBranch.length === 1) return sameBranch[0];
  }
  if (rows.length === 1) {
    const only = rows[0];
    const centerBranch = branchKeyOf(only);
    if (!centerBranch || !branchKey || centerBranch === branchKey) return only;
    return { ambiguous: true };
  }
  return { ambiguous: true };
}

// El vehiculo se resuelve primero por organization_tree cost_centers.vehicle_id
// (exacto por codigo de centro + sucursal); como respaldo, placa normalizada
// solo si la coincidencia es unica. Centros sin vehiculo nunca desaparecen:
// van al bloque SIN_VEHICULO.
function resolveVehicleForLeaf(leaf, vehicles, byCenterCode, warnings, tree) {
  const centerKey = normalizeCode(leaf.center || "");
  const centerRow = centerRowForLeaf(leaf, byCenterCode, warnings);
  if (centerRow && centerRow.ambiguous) {
    warnings.push({ code: "CENTER_BRANCH_AMBIGUOUS", message: `El centro ${leaf.center_name || centerKey} coincide con varios centros/vehiculos; queda sin vehiculo para no asignar importes ajenos.` });
    return { bucket: UNASSIGNED_BUCKET, center: null, fallback: false };
  }
  if (centerRow && centerRow.vehicle_id != null) {
    const vehicle = vehicles.find((item) => Number(item.id) === Number(centerRow.vehicle_id));
    if (vehicle) return { bucket: vehicle.id, center: centerRow, fallback: false };
    warnings.push({ code: "CENTER_VEHICLE_NOT_IN_FLEET", message: `El centro ${leaf.center_name || centerKey} referencia el vehiculo ${centerRow.vehicle_id}, que no esta en la flota activa.` });
    return { bucket: UNASSIGNED_BUCKET, center: centerRow, fallback: false };
  }
  const normalized = normalizePlate(leaf.center || "");
  if (normalized) {
    const matches = vehicles.filter((item) => normalizePlate(item.plate) === normalized);
    if (matches.length === 1 && !contradictsLeaf(matches[0], leaf, tree)) {
      return { bucket: matches[0].id, center: null, fallback: true };
    }
    if (matches.length > 1) {
      warnings.push({ code: "CENTER_PLATE_AMBIGUOUS", message: `El centro ${leaf.center_name || leaf.center} coincide con varias placas; queda sin vehiculo para no asignar dos veces.` });
    }
  }
  return { bucket: UNASSIGNED_BUCKET, center: null, fallback: false };
}

// El respaldo por placa se descarta si la sucursal de la hoja no esta entre las
// sucursales del vehiculo o si la hoja trae un propietario distinto.
function contradictsLeaf(vehicle, leaf, tree) {
  const leafBranch = leafBranchKey(leaf);
  if (leafBranch) {
    const branches = vehicleBranches(vehicle, tree || {});
    if (branches.size && !branches.has(leafBranch)) return true;
  }
  if (vehicle.owner_id != null && leaf.owner_id != null && Number(vehicle.owner_id) !== Number(leaf.owner_id)) return true;
  return false;
}

// Reporte contable: solo clases PUC 4 (ingreso) y 5-7 (gasto/costo). Dentro de
// esas clases la naturaleza no depende del signo del movimiento (un gasto
// revertido o presupuestado sin ejecucion conserva su clase).
const PUC_INCOME_CLASS = "4";
const PUC_EXPENSE_CLASSES = new Set(["5", "6", "7"]);

function unclassifiedConceptOf(leaf) {
  const cls = /^\d/.test(String(leaf.account_code || "")) ? String(leaf.account_code)[0] : null;
  if (cls === PUC_INCOME_CLASS) return UNCLASSIFIED_INCOME_CONCEPT;
  if (PUC_EXPENSE_CLASSES.has(cls)) return UNCLASSIFIED_EXPENSE_CONCEPT;
  // Fuera del PUC 4-7 (cuentas no incluidas en el reporte): respaldo por tipo
  // de cuenta y, en ultimo caso, por el signo de la contribucion.
  const type = String(leaf.account_type || "").trim().toLowerCase();
  if (type === "income") return UNCLASSIFIED_INCOME_CONCEPT;
  if (type === "expense") return UNCLASSIFIED_EXPENSE_CONCEPT;
  return (leaf.actual_cents || 0) >= 0 ? UNCLASSIFIED_INCOME_CONCEPT : UNCLASSIFIED_EXPENSE_CONCEPT;
}

function newConceptAggregate(code, kind, section, name) {
  return {
    code, kind, section, name,
    actual_cents: 0,
    budget_cents: null,
    budget_leafs: 0,
    total_leafs: 0,
    accounts: new Map()
  };
}

function accountKeyOf(leaf) {
  return `${leaf.account_id}|${normalizeCode(leaf.branch || "")}|${normalizeCode(leaf.center || "")}`;
}

// Tupla hoja -> centro de costo de la hoja TODOSCC del Excel: el centro y la
// sucursal identifican la columna; los centros repetidos en sucursales distintas
// quedan como columnas separadas.
function centerKeyOf(leaf) {
  return `${normalizeCode(leaf.center || "")}|${normalizeCode(leaf.branch || "")}`;
}

function newAccountNode(leaf) {
  return {
    account_id: leaf.account_id,
    account_code: String(leaf.account_code || ""),
    account_name: String(leaf.account_name || leaf.account_code || ""),
    actual_cents: 0,
    budget_cents: null,
    budget_leafs: 0,
    total_leafs: 0,
    centers: new Map()
  };
}

function newCenterNode(leaf) {
  return {
    center_code: String(leaf.center || ""),
    center_name: String(leaf.center_name || leaf.center || "Sin centro de costo"),
    branch_code: String(leaf.branch || ""),
    branch_name: String(leaf.branch_name || leaf.branch || ""),
    actual_cents: 0,
    budget_cents: null,
    budget_leafs: 0,
    total_leafs: 0
  };
}

// Suma una hoja al agregado del concepto (importe, presupuesto y desglose por
// cuenta/centro). Compartido por el bloque por vehiculo y el bloque por centro.
function accumulateLeaf(aggregate, leaf, kind) {
  const signed = leaf.actual_cents || 0;
  const hasBudget = leaf.budget_cents !== null && leaf.budget_cents !== undefined;
  const display = signedDisplay(kind, signed);
  const budgetDisplay = hasBudget ? signedDisplay(kind, leaf.budget_cents) : null;

  aggregate.actual_cents += cents(display);
  if (budgetDisplay !== null) {
    aggregate.budget_cents = (aggregate.budget_cents || 0) + cents(budgetDisplay);
    aggregate.budget_leafs += 1;
  }
  aggregate.total_leafs += 1;

  let account = aggregate.accounts.get(leaf.account_id);
  if (!account) {
    account = newAccountNode(leaf);
    aggregate.accounts.set(leaf.account_id, account);
  }
  account.actual_cents += cents(display);
  if (budgetDisplay !== null) {
    account.budget_cents = (account.budget_cents || 0) + cents(budgetDisplay);
    account.budget_leafs += 1;
  }
  account.total_leafs += 1;

  const centerKey = centerKeyOf(leaf);
  let center = account.centers.get(centerKey);
  if (!center) {
    center = newCenterNode(leaf);
    account.centers.set(centerKey, center);
  }
  center.actual_cents += cents(display);
  if (budgetDisplay !== null) {
    center.budget_cents = (center.budget_cents || 0) + cents(budgetDisplay);
    center.budget_leafs += 1;
  }
  center.total_leafs += 1;
}

// Reparte las hojas entre centros de costo sin mirar el vehiculo: es la lectura
// paralela del Excel (hoja TODOSCC) y no altera la asignacion por placa ni el
// consolidado. Deduplica la misma tupla cuenta/sucursal/centro una sola vez.
function buildCenterBuckets({ concepts, leaves }) {
  const conceptByCode = new Map(concepts.map((concept) => [concept.code, concept]));
  const buckets = new Map();
  const seenLeafKeys = new Set();

  function holderFor(leaf) {
    const key = centerKeyOf(leaf);
    let holder = buckets.get(key);
    if (!holder) {
      holder = {
        key,
        center_code: String(leaf.center || ""),
        center_name: String(leaf.center_name || leaf.center || "Sin centro de costo"),
        branch_code: String(leaf.branch || ""),
        branch_name: String(leaf.branch_name || leaf.branch || ""),
        concepts: new Map(),
        dynamic: []
      };
      buckets.set(key, holder);
    }
    return holder;
  }

  for (const leaf of leaves || []) {
    const tupleKey = accountKeyOf(leaf);
    if (seenLeafKeys.has(tupleKey)) continue;
    seenLeafKeys.add(tupleKey);
    const holder = holderFor(leaf);
    const conceptCode = matchAccountCode(leaf.account_code, concepts);
    if (!conceptCode) {
      const signed = leaf.actual_cents || 0;
      const hasBudget = leaf.budget_cents !== null && leaf.budget_cents !== undefined;
      if (signed === 0 && !hasBudget) continue;
      const dynamic = unclassifiedConceptOf(leaf);
      holder.dynamic.push({ code: dynamic.code, kind: dynamic.kind, section: dynamic.section, name: dynamic.name, leaf });
      continue;
    }
    const concept = conceptByCode.get(conceptCode);
    if (!concept || isSubtotalKind(concept.kind)) continue;
    let aggregate = holder.concepts.get(conceptCode);
    if (!aggregate) {
      aggregate = newConceptAggregate(concept.code, concept.kind, concept.section, concept.name);
      holder.concepts.set(conceptCode, aggregate);
    }
    accumulateLeaf(aggregate, leaf, concept.kind);
  }

  for (const holder of buckets.values()) {
    for (const entry of holder.dynamic) {
      let aggregate = holder.concepts.get(entry.code);
      if (!aggregate) {
        aggregate = newConceptAggregate(entry.code, entry.kind, entry.section, entry.name);
        aggregate.dynamic = true;
        holder.concepts.set(entry.code, aggregate);
      }
      accumulateLeaf(aggregate, entry.leaf, entry.kind);
    }
  }

  return buckets;
}

function buildBuckets({ concepts, leaves, vehicles, tree, warnings, period }) {
  const byCenterCode = centerAssignments(tree);
  const conceptByCode = new Map(concepts.map((concept) => [concept.code, concept]));
  const buckets = new Map();
  const seenLeafKeys = new Set();

  function bucketFor(id) {
    const key = id === UNASSIGNED_BUCKET ? UNASSIGNED_BUCKET : Number(id);
    if (!buckets.has(key)) {
      buckets.set(key, {
        key,
        vehicle: id === UNASSIGNED_BUCKET ? null : vehicles.find((item) => Number(item.id) === Number(id)) || null,
        concepts: new Map(),
        dynamic: []
      });
    }
    return buckets.get(key);
  }

  for (const leaf of leaves || []) {
    const tupleKey = accountKeyOf(leaf);
    if (seenLeafKeys.has(tupleKey)) {
      warnings.push({ code: "DUPLICATE_LEAF_TUPLE", message: `Tupla repetida cuenta ${leaf.account_code} / ${leaf.branch} / ${leaf.center} en la fuente contable; se cuenta una sola vez.` });
      continue;
    }
    seenLeafKeys.add(tupleKey);
    const { bucket } = resolveVehicleForLeaf(leaf, vehicles, byCenterCode, warnings, tree);
    const holder = bucketFor(bucket);
    const conceptCode = matchAccountCode(leaf.account_code, concepts);
    const signed = leaf.actual_cents || 0;
    const hasBudget = leaf.budget_cents !== null && leaf.budget_cents !== undefined;
    if (!conceptCode) {
      if (signed === 0 && !hasBudget) continue;
      const dynamic = unclassifiedConceptOf(leaf);
      holder.dynamic.push({ code: dynamic.code, kind: dynamic.kind, section: dynamic.section, name: dynamic.name, leaf });
      continue;
    }
    const concept = conceptByCode.get(conceptCode);
    if (!concept || isSubtotalKind(concept.kind)) continue;
    let aggregate = holder.concepts.get(conceptCode);
    if (!aggregate) {
      aggregate = newConceptAggregate(concept.code, concept.kind, concept.section, concept.name);
      holder.concepts.set(conceptCode, aggregate);
    }
    accumulateLeaf(aggregate, leaf, concept.kind);
  }

  // Las hojas dinamicas (sin clasificar) se agregan al agregado del concepto dinamico.
  for (const holder of buckets.values()) {
    for (const entry of holder.dynamic) {
      let aggregate = holder.concepts.get(entry.code);
      if (!aggregate) {
        aggregate = newConceptAggregate(entry.code, entry.kind, entry.section, entry.name);
        aggregate.dynamic = true;
        holder.concepts.set(entry.code, aggregate);
      }
      accumulateLeaf(aggregate, entry.leaf, entry.kind);
    }
  }

  return buckets;
}

function serializeChildren(aggregate) {
  return [...aggregate.accounts.values()]
    .sort((a, b) => String(a.account_code).localeCompare(String(b.account_code), undefined, { numeric: true }))
    .map((account) => ({
      account_code: account.account_code,
      account_name: account.account_name,
      actual: round2(account.actual_cents / 100),
      budget: account.budget_cents === null ? null : round2(account.budget_cents / 100),
      budget_coverage: account.total_leafs === 0 ? "none" : (account.budget_leafs >= account.total_leafs ? "full" : (account.budget_leafs === 0 ? "none" : "partial")),
      centers: [...account.centers.values()]
        .sort((a, b) => String(a.center_name).localeCompare(String(b.center_name), undefined, { numeric: true }))
        .map((center) => ({
          center_code: center.center_code,
          center_name: center.center_name,
          branch_code: center.branch_code,
          branch_name: center.branch_name,
          actual: round2(center.actual_cents / 100),
          budget: center.budget_cents === null ? null : round2(center.budget_cents / 100),
          budget_coverage: center.total_leafs === 0 ? "none" : (center.budget_leafs >= center.total_leafs ? "full" : (center.budget_leafs === 0 ? "none" : "partial"))
        }))
    }));
}

function aggregateBudget(aggregate) {
  return aggregate.budget_cents === null ? null : round2(aggregate.budget_cents / 100);
}

function aggregateCoverage(aggregate) {
  if (aggregate.total_leafs === 0) return "none";
  if (aggregate.budget_leafs === 0) return "none";
  if (aggregate.budget_leafs >= aggregate.total_leafs) return "full";
  return "partial";
}

function buildStatementRows({ concepts, holder, corporateIncome, dynamicCatalog = null }) {
  const ordered = [...concepts].sort((a, b) => {
    const orderDiff = Number(a.order || 0) - Number(b.order || 0);
    if (orderDiff !== 0) return orderDiff;
    return String(a.code).localeCompare(String(b.code));
  });
  const rows = [];
  const aggregates = holder.concepts;
  const incomeTotal = round2([...aggregates.values()]
    .filter((aggregate) => aggregate.kind === "income" && aggregate.section === "ingresos")
    .reduce((sum, aggregate) => sum + aggregate.actual_cents, 0) / 100);

  // Las filas dinamicas (cuentas sin concepto configurado) se ubican antes del
  // subtotal de su seccion para que TOTAL_INGRESOS y TOTAL_GASTOS_OPERACIONALES
  // las incluyan; si el subtotal no existe, van al final.
  const configuredCodes = new Set(ordered.map((concept) => concept.code));
  const dynamicCodes = [...new Set([
    ...[...aggregates.values()].filter((aggregate) => aggregate.dynamic).map((aggregate) => aggregate.code),
    ...(dynamicCatalog ? dynamicCatalog.keys() : [])
  ])].filter((code) => !configuredCodes.has(code));
  const dynamicRows = dynamicCodes
    .sort((a, b) => String(a).localeCompare(String(b)))
    .map((code) => {
      const aggregate = aggregates.get(code) || {
        ...(dynamicCatalog.get(code)),
        actual_cents: 0,
        budget_cents: null,
        budget_leafs: 0,
        total_leafs: 0,
        accounts: new Map()
      };
      const actual = round2(aggregate.actual_cents / 100);
      const budget = aggregateBudget(aggregate);
      const row = {
        code: aggregate.code,
        name: aggregate.name,
        section: aggregate.section,
        kind: aggregate.kind,
        display_order: null,
        dynamic: true,
        budget,
        budget_coverage: aggregateCoverage(aggregate),
        actual,
        pct: null,
        cump: budget !== null && budget > 0 ? pct(actual, budget) : null,
        pending: false,
        informational: false,
        children: serializeChildren(aggregate)
      };
      // % de INGRESOS contra el ingreso corporativo; igual que la fila fija.
      if (row.kind === "income" && row.section === "ingresos") row.pct = pct(actual, corporateIncome);
      return row;
    });
  const dynamicIncomeRows = dynamicRows.filter((row) => row.kind === "income" && row.section === "ingresos");
  const dynamicExpenseRows = dynamicRows.filter((row) => row.kind === "expense" && row.section === "gastos_operativos");
  const placed = new Set();

  function pushDynamicIncomes() {
    for (const row of dynamicIncomeRows) {
      if (placed.has(row.code)) continue;
      placed.add(row.code);
      rows.push(row);
    }
  }
  function pushDynamicExpenses() {
    for (const row of dynamicExpenseRows) {
      if (placed.has(row.code)) continue;
      placed.add(row.code);
      rows.push(row);
    }
  }

  for (const concept of ordered) {
    if (concept.kind === "subtotal_ingresos") pushDynamicIncomes();
    if (concept.kind === "subtotal_gastos_operativos") pushDynamicExpenses();
    if (isSubtotalKind(concept.kind)) {
      rows.push({
        code: concept.code,
        name: concept.name,
        section: concept.section,
        kind: concept.kind,
        display_order: concept.order,
        budget: null,
        budget_coverage: "none",
        actual: 0,
        pct: null,
        cump: null,
        children: []
      });
      continue;
    }
    const aggregate = aggregates.get(concept.code);
    const hasAccounts = conceptHasAccounts(concept);
    if (!aggregate) {
      const pending = !hasAccounts;
      rows.push({
        code: concept.code,
        name: concept.name,
        section: concept.section,
        kind: concept.kind,
        display_order: concept.order,
        budget: null,
        budget_coverage: "none",
        actual: 0,
        pct: null,
        cump: null,
        pending,
        ...(pending ? { pending_message: PENDING_MESSAGE } : {}),
        informational: concept.kind === "informational",
        children: []
      });
      continue;
    }
    const actual = round2(aggregate.actual_cents / 100);
    const budget = aggregateBudget(aggregate);
    rows.push({
      code: concept.code,
      name: concept.name,
      section: concept.section,
      kind: concept.kind,
      display_order: concept.order,
      dynamic: Boolean(aggregate.dynamic),
      budget,
      budget_coverage: aggregateCoverage(aggregate),
      actual,
      pct: pct(actual, concept.code === "INGRESOS" ? corporateIncome : incomeTotal),
      cump: budget !== null && budget > 0 ? pct(actual, budget) : null,
      pending: !hasAccounts,
      ...(!hasAccounts ? { pending_message: PENDING_MESSAGE } : {}),
      informational: concept.kind === "informational",
      children: serializeChildren(aggregate)
    });
  }
  pushDynamicIncomes();
  pushDynamicExpenses();
  return { rows, incomeTotal };
}

function subtotalValue(rows, filter) {
  const selected = rows.filter(filter);
  const actual = round2(selected.reduce((sum, row) => sum + row.actual, 0));
  const budget = signedBudgetSum(selected.map((row) => ({ value: row.budget, sign: 1 })));
  const coverage = combineCoverage(selected.map((row) => row.budget_coverage));
  return { actual, budget, coverage };
}

function fillSubtotals(rows) {
  const incomeRows = () => rows.filter((row) => row.kind === "income" && row.section === "ingresos");
  const expenseRows = () => rows.filter((row) => row.kind === "expense" && row.section === "gastos_operativos");
  const incomeNoOp = () => rows.filter((row) => row.kind === "income" && row.section === "no_operativos");
  const expenseNoOp = () => rows.filter((row) => row.kind === "expense" && row.section === "no_operativos");
  const taxRows = () => rows.filter((row) => row.kind === "tax");

  const totalIngresos = subtotalValue(rows, (row) => row.kind === "income" && row.section === "ingresos");
  const totalGastos = subtotalValue(rows, (row) => row.kind === "expense" && row.section === "gastos_operativos");
  const utilidadOp = {
    actual: round2(totalIngresos.actual - totalGastos.actual),
    budget: signedBudgetSum([
      ...incomeRows().map((row) => ({ value: row.budget, sign: 1 })),
      ...expenseRows().map((row) => ({ value: row.budget, sign: -1 }))
    ]),
    coverage: combineCoverage([totalIngresos.coverage, totalGastos.coverage])
  };
  const noOpNeto = {
    actual: round2(incomeNoOp().reduce((sum, row) => sum + row.actual, 0) - expenseNoOp().reduce((sum, row) => sum + row.actual, 0)),
    budget: signedBudgetSum([
      ...incomeNoOp().map((row) => ({ value: row.budget, sign: 1 })),
      ...expenseNoOp().map((row) => ({ value: row.budget, sign: -1 }))
    ]),
    coverage: combineCoverage([...incomeNoOp(), ...expenseNoOp()].map((row) => row.budget_coverage))
  };
  const antes = {
    actual: round2(utilidadOp.actual + noOpNeto.actual),
    budget: signedBudgetSum([
      ...incomeRows().map((row) => ({ value: row.budget, sign: 1 })),
      ...expenseRows().map((row) => ({ value: row.budget, sign: -1 })),
      ...incomeNoOp().map((row) => ({ value: row.budget, sign: 1 })),
      ...expenseNoOp().map((row) => ({ value: row.budget, sign: -1 }))
    ]),
    coverage: combineCoverage([utilidadOp.coverage, noOpNeto.coverage])
  };
  const impuesto = {
    actual: round2(taxRows().reduce((sum, row) => sum + row.actual, 0)),
    budget: signedBudgetSum(taxRows().map((row) => ({ value: row.budget, sign: 1 }))),
    coverage: combineCoverage(taxRows().map((row) => row.budget_coverage))
  };
  const neta = {
    actual: round2(antes.actual - impuesto.actual),
    budget: signedBudgetSum([
      ...incomeRows().map((row) => ({ value: row.budget, sign: 1 })),
      ...expenseRows().map((row) => ({ value: row.budget, sign: -1 })),
      ...incomeNoOp().map((row) => ({ value: row.budget, sign: 1 })),
      ...expenseNoOp().map((row) => ({ value: row.budget, sign: -1 })),
      ...taxRows().map((row) => ({ value: row.budget, sign: -1 }))
    ]),
    coverage: combineCoverage([antes.coverage, impuesto.coverage])
  };

  for (const row of rows) {
    const target = {
      subtotal_ingresos: totalIngresos,
      subtotal_gastos_operativos: totalGastos,
      subtotal_utilidad_operacional: utilidadOp,
      subtotal_antes_de_impuestos: antes,
      subtotal_utilidad_neta: neta
    }[row.kind];
    if (!target) continue;
    row.actual = target.actual;
    row.budget = target.budget;
    row.budget_coverage = target.coverage;
    row.cump = row.budget !== null && row.budget > 0 ? pct(row.actual, row.budget) : null;
  }
  const incomeTotal = totalIngresos.actual;
  for (const row of rows) {
    if (isSubtotalKind(row.kind)) row.pct = pct(row.actual, incomeTotal);
  }
  return { totalIngresos, totalGastos, utilidadOp, antes, impuesto, neta, incomeTotal };
}

// Catalogo de filas dinamicas a nivel de reporte: si alguna tupla del libro
// quedo sin clasificar, todos los bloques (vehiculos sin movimiento incluidos)
// muestran las mismas filas, en cero cuando no les corresponde importe.
function buildDynamicCatalog(buckets) {
  const catalog = new Map();
  for (const holder of buckets.values()) {
    for (const aggregate of holder.concepts.values()) {
      if (!aggregate.dynamic) continue;
      if (!catalog.has(aggregate.code)) {
        catalog.set(aggregate.code, { code: aggregate.code, kind: aggregate.kind, section: aggregate.section, name: aggregate.name });
      }
    }
  }
  return catalog;
}

function buildBucketReport({ concepts, holder, corporateIncome, dynamicCatalog = null }) {
  const { rows, incomeTotal } = buildStatementRows({ concepts, holder, corporateIncome, dynamicCatalog });
  const totals = fillSubtotals(rows);
  const unmappedExpense = round2([...holder.concepts.values()]
    .filter((aggregate) => aggregate.dynamic && aggregate.kind === "expense")
    .reduce((sum, aggregate) => sum + aggregate.actual_cents, 0) / 100);
  return { rows, totals, incomeTotal, unmappedExpense };
}

function vehicleCenterInfo(vehicle, tree) {
  const rows = (tree.cost_centers || []).filter((row) => row.vehicle_id != null && Number(row.vehicle_id) === Number(vehicle.id));
  if (rows.length) {
    const row = rows[0];
    return { center_code: String(row.code || ""), center_name: String(row.name || row.code || ""), branch_code: String(row.branch_code || ""), branch_name: "" };
  }
  const plateKey = normalizePlate(vehicle.plate);
  const match = (tree.cost_centers || []).find((row) => normalizePlate(row.code || "") === plateKey && plateKey);
  if (match) {
    return { center_code: String(match.code || ""), center_name: String(match.name || match.code || ""), branch_code: String(match.branch_code || ""), branch_name: "" };
  }
  return { center_code: "", center_name: "", branch_code: "", branch_name: "" };
}

function branchNameOf(code, tree) {
  const row = (tree.branches || []).find((item) => String(item.code || "").trim() === String(code || "").trim());
  return row ? String(row.name || row.code) : String(code || "");
}

function buildAccountingReport({ period, concepts, vehicles, tree, leaves, interactive = {}, taxPercent = 2.25 }) {
  const warnings = [];
  const buckets = buildBuckets({ concepts, leaves, vehicles, tree, warnings, period });

  const vehicleBuckets = [];
  for (const vehicle of vehicles || []) {
    const holder = buckets.get(Number(vehicle.id));
    if (holder) vehicleBuckets.push({ vehicle, holder });
    else vehicleBuckets.push({ vehicle, holder: null });
  }
  const unassignedHolder = buckets.get(UNASSIGNED_BUCKET) || null;

  const bucketReports = new Map();
  const allBuckets = [];
  const dynamicCatalog = buildDynamicCatalog(buckets);
  for (const { vehicle, holder } of vehicleBuckets) {
    // Un vehiculo sin movimiento conserva todas las filas de conceptos en cero
    // (requisito "todos los conceptos incluidos, ordenados").
    const effectiveHolder = holder || { concepts: new Map() };
    const report = buildBucketReport({ concepts, holder: effectiveHolder, corporateIncome: 0, dynamicCatalog });
    const info = vehicleCenterInfo(vehicle, tree);
    const entry = {
      vehicle_id: vehicle.id,
      plate: vehicle.plate,
      vehicle_label: [vehicle.brand, vehicle.line].filter(Boolean).join(" ") || null,
      driver_id: vehicle.authorized_driver_id || null,
      center_code: info.center_code,
      center_name: info.center_name,
      branch_code: info.branch_code,
      branch_name: branchNameOf(info.branch_code, tree),
      income_actual: report.totals ? report.totals.totalIngresos.actual : 0,
      unmapped_expense: report.unmappedExpense,
      rows: report.rows,
      totals: report.totals
    };
    bucketReports.set(Number(vehicle.id), entry);
    allBuckets.push(entry);
  }

  let unassignedEntry = null;
  if (unassignedHolder) {
    const report = buildBucketReport({ concepts, holder: unassignedHolder, corporateIncome: 0, dynamicCatalog });
    unassignedEntry = {
      vehicle_id: null,
      plate: UNASSIGNED_BUCKET,
      vehicle_label: "Sin vehículo / sin asignar",
      center_code: null,
      center_name: null,
      income_actual: report.totals ? report.totals.totalIngresos.actual : 0,
      unmapped_expense: report.unmappedExpense,
      rows: report.rows,
      totals: report.totals
    };
    allBuckets.push(unassignedEntry);
  }

  // pct de la fila INGRESOS contra el ingreso corporativo consolidado.
  const corporateIncome = round2(allBuckets.reduce((sum, entry) => sum + entry.income_actual, 0));
  for (const entry of allBuckets) {
    const ingresosRow = entry.rows.find((row) => row.code === "INGRESOS");
    if (ingresosRow) ingresosRow.pct = pct(ingresosRow.actual, corporateIncome);
  }

  // Lectura paralela por centro de costo (hoja TODOSCC del Excel): una columna
  // por centro con la misma estructura de conceptos. No altera la asignacion por
  // placa ni el consolidado: cada hoja cae en un solo centro.
  const centerEntries = [];
  for (const holder of buildCenterBuckets({ concepts, leaves }).values()) {
    // En el Excel el % de cada fila de ingreso del centro (configurada o sin
    // clasificar) va contra el ingreso total propio del centro: el subtotal
    // TOTAL_INGRESOS es 100% de ese total, mientras la fila configurada INGRESOS
    // solo es 100% cuando no hay ingresos sin clasificar (p. ej. 83.33% si parte
    // del ingreso cae en cuentas sin concepto).
    const ownIncome = round2([...holder.concepts.values()]
      .filter((aggregate) => aggregate.kind === "income" && aggregate.section === "ingresos")
      .reduce((sum, aggregate) => sum + aggregate.actual_cents, 0) / 100);
    const report = buildBucketReport({ concepts, holder, corporateIncome: ownIncome, dynamicCatalog });
    centerEntries.push({
      center_code: holder.center_code,
      center_name: holder.center_name,
      branch_code: holder.branch_code,
      branch_name: holder.branch_name,
      plate: null,
      vehicle_label: null,
      income_actual: report.totals ? report.totals.totalIngresos.actual : 0,
      unmapped_expense: report.unmappedExpense,
      rows: report.rows,
      totals: report.totals
    });
  }

  // Un centro con vehiculo activo pero sin movimiento conserva su columna en
  // cero. Con sucursal conocida la columna es la tupla exacta centro+sucursal:
  // si el libro no la trae se crea en cero y se agrega a las columnas existentes
  // (nunca reemplaza la de otra sucursal). Solo cuando la sucursal del vehiculo
  // es desconocida se acepta un respaldo por codigo unico sin sucursal.
  const centersByCode = new Map();
  for (const entry of centerEntries) {
    const code = normalizeCode(entry.center_code);
    if (!code) continue;
    const list = centersByCode.get(code) || [];
    list.push(entry);
    centersByCode.set(code, list);
  }
  for (const vehicle of vehicles || []) {
    const info = vehicleCenterInfo(vehicle, tree);
    const code = normalizeCode(info.center_code);
    if (!code) continue;
    const infoBranch = normalizeCode(info.branch_code);
    const candidates = centersByCode.get(code) || [];
    let entry = null;
    if (infoBranch) {
      entry = candidates.find((item) => normalizeCode(item.branch_code) === infoBranch) || null;
    } else if (candidates.length === 1 && !normalizeCode(candidates[0].branch_code)) {
      entry = candidates[0];
    }
    if (!entry) {
      const report = buildBucketReport({ concepts, holder: { concepts: new Map() }, corporateIncome: 0, dynamicCatalog });
      entry = {
        center_code: info.center_code,
        center_name: info.center_name || info.center_code,
        branch_code: info.branch_code,
        branch_name: branchNameOf(info.branch_code, tree),
        plate: null,
        vehicle_label: null,
        income_actual: 0,
        unmapped_expense: 0,
        rows: report.rows,
        totals: report.totals
      };
      const list = centersByCode.get(code) || [];
      list.push(entry);
      centersByCode.set(code, list);
      centerEntries.push(entry);
    }
    entry.plate = entry.plate || vehicle.plate;
    entry.vehicle_label = entry.vehicle_label || ([vehicle.brand, vehicle.line].filter(Boolean).join(" ") || null);
  }
  centerEntries.sort((a, b) => String(a.center_name || a.center_code).localeCompare(String(b.center_name || b.center_code), undefined, { numeric: true })
    || String(a.branch_code).localeCompare(String(b.branch_code)));

  // Consolidado corporativo: suma de todos los bloques (vehiculos + sin asignar),
  // incluyendo el desglose por cuenta y centro para el drill de nombres.
  const corporateAggregates = new Map();
  for (const entry of allBuckets) {
    const holder = entry.vehicle_id === null ? unassignedHolder : buckets.get(Number(entry.vehicle_id));
    if (!holder) continue;
    for (const [code, aggregate] of holder.concepts) {
      let target = corporateAggregates.get(code);
      if (!target) {
        target = newConceptAggregate(aggregate.code, aggregate.kind, aggregate.section, aggregate.name);
        target.dynamic = Boolean(aggregate.dynamic);
        corporateAggregates.set(code, target);
      }
      target.actual_cents += aggregate.actual_cents;
      target.budget_cents = target.budget_cents === null ? aggregate.budget_cents : (aggregate.budget_cents === null ? target.budget_cents : target.budget_cents + aggregate.budget_cents);
      target.budget_leafs += aggregate.budget_leafs;
      target.total_leafs += aggregate.total_leafs;
      for (const [accountId, account] of aggregate.accounts) {
        let targetAccount = target.accounts.get(accountId);
        if (!targetAccount) {
          targetAccount = {
            account_id: account.account_id,
            account_code: account.account_code,
            account_name: account.account_name,
            actual_cents: 0,
            budget_cents: null,
            budget_leafs: 0,
            total_leafs: 0,
            centers: new Map()
          };
          target.accounts.set(accountId, targetAccount);
        }
        targetAccount.actual_cents += account.actual_cents;
        targetAccount.budget_cents = targetAccount.budget_cents === null ? account.budget_cents : (account.budget_cents === null ? targetAccount.budget_cents : targetAccount.budget_cents + account.budget_cents);
        targetAccount.budget_leafs += account.budget_leafs;
        targetAccount.total_leafs += account.total_leafs;
        for (const [centerKey, center] of account.centers) {
          let targetCenter = targetAccount.centers.get(centerKey);
          if (!targetCenter) {
            targetCenter = { ...center, actual_cents: 0, budget_cents: null, budget_leafs: 0, total_leafs: 0 };
            targetAccount.centers.set(centerKey, targetCenter);
          }
          targetCenter.actual_cents += center.actual_cents;
          targetCenter.budget_cents = targetCenter.budget_cents === null ? center.budget_cents : (center.budget_cents === null ? targetCenter.budget_cents : targetCenter.budget_cents + center.budget_cents);
          targetCenter.budget_leafs += center.budget_leafs;
          targetCenter.total_leafs += center.total_leafs;
        }
      }
    }
  }
  const corporateHolder = { concepts: corporateAggregates };
  const corporateReport = buildBucketReport({ concepts, holder: corporateHolder, corporateIncome });
  const corporateUnmapped = round2(allBuckets.reduce((sum, entry) => sum + entry.unmapped_expense, 0));

  // Reconciliacion: la neta consolidada debe coincidir con la suma firmada de
  // TODAS las hojas (credit - debit), salvo la depreciacion informativa que
  // por diseno del Excel se presenta sin restar.
  const ledgerNet = round2((leaves || []).reduce((sum, leaf) => sum + (leaf.actual_cents || 0), 0) / 100);
  const informationalActual = round2(corporateReport.rows
    .filter((row) => row.kind === "informational")
    .reduce((sum, row) => sum + row.actual, 0));
  const netaActual = corporateReport.totals ? corporateReport.totals.neta.actual : 0;
  const reconciliation = {
    ledger_net: ledgerNet,
    neta_actual: netaActual,
    difference: round2(netaActual - ledgerNet),
    informational_actual: informationalActual,
    note: "La utilidad neta es reconciliable contra la suma firmada de las cuentas de resultado (clases 4-7) del libro; la unica exclusion explicita es la depreciacion informativa."
  };

  // Warnings del reporte: conceptos pendientes, sin clasificar, sin asignar y
  // el estado de enlace de metadatos del PYG interactivo.
  for (const concept of concepts) {
    if (isSubtotalKind(concept.kind)) continue;
    if (conceptHasAccounts(concept)) continue;
    warnings.push({ code: "CONCEPT_PENDING_ACCOUNT", message: `${concept.name} (${concept.code}): ${PENDING_MESSAGE}.` });
  }
  for (const entry of allBuckets) {
    const unclassified = entry.rows.filter((row) => row.dynamic);
    if (!unclassified.length) continue;
    const label = entry.vehicle_id === null ? "Sin vehículo / sin asignar" : entry.plate;
    for (const row of unclassified) {
      warnings.push({ code: "UNCLASSIFIED_LEDGER_ACCOUNTS", message: `${label}: cuentas contables sin concepto PYG configurado se presentan en "${row.name}".` });
    }
  }
  if (unassignedEntry) {
    const magnitude = round2(unassignedEntry.rows.reduce((sum, row) => sum + Math.abs(row.actual), 0));
    warnings.push({ code: "UNASSIGNED_CENTERS_PRESENT", message: "Existen centros de costo sin vehículo asignado; se presentan en el bloque \"Sin vehículo / sin asignar\" y se incluyen en el consolidado.", detail: { centers_magnitude: magnitude } });
  }
  const linkage = interactive.linkage || {};
  if (linkage.orphan) warnings.push({ code: "LEDGER_WITHOUT_METADATA", message: `${linkage.orphan} asientos sin comprobante contable vinculado se presentan sin asignar.` });
  if (linkage.ambiguous) warnings.push({ code: "LEDGER_AMBIGUOUS_METADATA", message: `${linkage.ambiguous} asientos con varios centros/sucursales vinculados se presentan sin asignar para no multiplicar importes.` });
  for (const warning of interactive.warnings || []) {
    warnings.push({ code: warning.code || "INTERACTIVE_WARNING", message: warning.message || String(warning) });
  }
  if (reconciliation.difference !== 0) {
    warnings.push({ code: "RECONCILIATION_DIFFERENCE", message: `La utilidad neta difiere del libro en ${reconciliation.difference} por la depreciacion informativa excluida.`, detail: reconciliation });
  }

  const dataStatus = {
    source: "accounting",
    vehicle_count: vehicleBuckets.length,
    vehicles_with_income: allBuckets.filter((entry) => entry.vehicle_id !== null && entry.income_actual > 0).length,
    unmapped_total: corporateUnmapped,
    unassigned_centers: unassignedEntry ? 1 : 0,
    centers_count: centerEntries.length,
    unclassified_income: round2(allBuckets.reduce((sum, entry) => sum + entry.rows.filter((row) => row.dynamic && row.kind === "income").reduce((inner, row) => inner + row.actual, 0), 0)),
    unclassified_expense: round2(allBuckets.reduce((sum, entry) => sum + entry.rows.filter((row) => row.dynamic && row.kind === "expense").reduce((inner, row) => inner + row.actual, 0), 0))
  };

  return {
    period,
    period_start: `${period}-01`,
    period_end: periodEndOf(period),
    tax_percent: Number(taxPercent || 0),
    source: "accounting",
    report_source: "ledger",
    concepts: concepts.map((concept) => ({
      code: concept.code,
      name: concept.name,
      section: concept.section,
      kind: concept.kind,
      display_order: concept.order,
      has_accounts: conceptHasAccounts(concept),
      pending: !conceptHasAccounts(concept) && !isSubtotalKind(concept.kind),
      informational: concept.kind === "informational"
    })),
    vehicles: allBuckets.filter((entry) => entry.vehicle_id !== null),
    centers: centerEntries,
    unassigned: unassignedEntry,
    corporate: {
      income_actual: corporateIncome,
      unmapped_expense: corporateUnmapped,
      rows: corporateReport.rows,
      totals: corporateReport.totals
    },
    reconciliation,
    warnings,
    data_status: dataStatus
  };
}

module.exports = {
  buildAccountingReport,
  resolveVehicleForLeaf,
  normalizePlate,
  normalizeCode,
  round2,
  pct,
  UNASSIGNED_BUCKET,
  SUBTOTAL_FORMULA
};
