/* Presupuesto mensual por cuenta PUC (clases 4-7), sucursal y centro de costo.
 * Se guarda en la config del tenant (accounting.pyg_budgets) con bloqueo consultivo
 * por tenant antes de leer-modificar-escribir; nunca reemplaza claves ajenas de la
 * config y nunca borra filas de presupuesto no incluidas en la carga (upsert puntual).
 */
const prisma = require("../../core/prisma");
const { invalidateTenantCache } = require("../../core/tenantCache");
const {
  parsePeriodInput,
  parseAmount,
  pucClassOf,
  CLASS_TO_SECTION,
  parseOrganizationTree,
  readBudgetStore
} = require("./pyg-interactive");

const MAX_BUDGET_ROWS = 2000;
const COMPLEX_TRANSACTION_OPTIONS = { maxWait: 5_000, timeout: 20_000 };

function appError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function budgetKey(row) {
  return `${String(row.period || "").trim()}|${row.account_id}|${String(row.branch_code || "").trim()}|${String(row.cost_center_code || "").trim()}`;
}

function normalizeBudgetInput(data) {
  const period = parsePeriodInput(data && data.period);
  const rows = data && Array.isArray(data.rows) ? data.rows : null;
  if (!rows || !rows.length) throw appError(400, "BUDGET_ROWS_REQUIRED", "El presupuesto requiere al menos una fila");
  if (rows.length > MAX_BUDGET_ROWS) throw appError(413, "BUDGET_ROWS_TOO_LARGE", `El presupuesto admite maximo ${MAX_BUDGET_ROWS} filas por carga`);
  const seen = new Set();
  const normalized = rows.map((row, index) => {
    const accountId = Number(row && row.account_id);
    const branch = String(row && row.branch_code || "").trim();
    const center = String(row && row.cost_center_code || "").trim();
    const amount = parseAmount(row && row.amount);
    if (!Number.isSafeInteger(accountId) || accountId <= 0) throw appError(422, "BUDGET_INVALID_ROW", `Fila ${index + 1}: account_id entero positivo obligatorio`);
    if (!branch || !center) throw appError(422, "BUDGET_INVALID_ROW", `Fila ${index + 1}: sucursal y centro de costo obligatorios`);
    if (!Number.isFinite(amount)) throw appError(422, "BUDGET_INVALID_AMOUNT", `Fila ${index + 1}: el valor del presupuesto no es un numero valido`);
    if (amount < 0) throw appError(422, "BUDGET_AMOUNT_NEGATIVE", `Fila ${index + 1}: el valor del presupuesto no puede ser negativo`);
    const amountCents = Math.round(amount * 100);
    if (!Number.isSafeInteger(amountCents)) throw appError(422, "BUDGET_INVALID_AMOUNT", `Fila ${index + 1}: el valor del presupuesto excede la precision soportada en centavos`);
    const key = budgetKey({ period, account_id: accountId, branch_code: branch, cost_center_code: center });
    if (seen.has(key)) throw appError(422, "BUDGET_DUPLICATE_ROW", `Fila ${index + 1}: tupla repetida periodo/cuenta/sucursal/centro`);
    seen.add(key);
    return {
      account_id: accountId,
      branch_code: branch,
      cost_center_code: center,
      amount: amountCents / 100,
      amount_cents: amountCents
    };
  });
  return { period, rows: normalized };
}

function budgetReferenceIssues(tree, accountsById, rows) {
  const issues = [];
  const branches = new Map((tree.branches || []).map((row) => [String(row.code || "").trim(), row]));
  const centers = new Map((tree.cost_centers || []).map((row) => [String(row.code || "").trim(), row]));
  rows.forEach((row, index) => {
    const label = `Fila ${index + 1}`;
    const account = accountsById.get(row.account_id);
    if (!account) {
      issues.push({ index, status: 422, code: "BUDGET_ACCOUNT_NOT_FOUND", message: `${label}: cuenta ${row.account_id} no encontrada en este tenant` });
      return;
    }
    if (account.active !== true) {
      issues.push({ index, status: 422, code: "BUDGET_ACCOUNT_INACTIVE", message: `${label}: cuenta ${account.code} inactiva` });
      return;
    }
    if (account.allows_tx !== true) {
      issues.push({ index, status: 422, code: "BUDGET_ACCOUNT_NOT_TRANSACTIONAL", message: `${label}: cuenta ${account.code} no permite movimientos` });
      return;
    }
    if (!CLASS_TO_SECTION[pucClassOf(account.code)]) {
      issues.push({ index, status: 422, code: "BUDGET_ACCOUNT_NOT_PUC_4_7", message: `${label}: la cuenta ${account.code} no pertenece a las clases PUC 4-7` });
      return;
    }
    const branch = branches.get(row.branch_code);
    if (!branch || branch.active === false) {
      issues.push({ index, status: 422, code: "BUDGET_BRANCH_NOT_FOUND", message: `${label}: sucursal ${row.branch_code} inexistente o inactiva en la estructura` });
      return;
    }
    const center = centers.get(row.cost_center_code);
    if (!center || center.active === false) {
      issues.push({ index, status: 422, code: "BUDGET_CENTER_NOT_FOUND", message: `${label}: centro de costo ${row.cost_center_code} inexistente o inactivo en la estructura` });
      return;
    }
    if (String(center.branch_code || "").trim() !== String(branch.code || "").trim()) {
      issues.push({ index, status: 422, code: "BUDGET_CENTER_BRANCH_MISMATCH", message: `${label}: el centro ${row.cost_center_code} no pertenece a la sucursal ${row.branch_code}` });
      return;
    }
    if (String(center.society_code || "").trim() !== String(branch.society_code || "").trim()) {
      issues.push({ index, status: 422, code: "BUDGET_CENTER_BRANCH_MISMATCH", message: `${label}: el centro ${row.cost_center_code} y la sucursal ${row.branch_code} no comparten sociedad` });
    }
  });
  return issues;
}

function mergeBudgetStore(existingRows, period, rows, nowIso, userId) {
  const map = new Map();
  for (const row of existingRows || []) {
    if (row && typeof row === "object" && row.period && row.account_id) map.set(budgetKey(row), row);
  }
  let created = 0;
  let updated = 0;
  for (const row of rows) {
    const key = budgetKey({ period, account_id: row.account_id, branch_code: row.branch_code, cost_center_code: row.cost_center_code });
    const record = {
      period,
      account_id: row.account_id,
      account_code: row.account_code || null,
      branch_code: row.branch_code,
      cost_center_code: row.cost_center_code,
      amount: row.amount,
      amount_cents: row.amount_cents,
      updated_at: nowIso,
      updated_by: userId || null
    };
    if (map.has(key)) updated += 1;
    else created += 1;
    map.set(key, record);
  }
  const nextRows = [...map.values()].sort((a, b) => (
    String(a.period).localeCompare(String(b.period))
    || Number(a.account_id) - Number(b.account_id)
    || String(a.branch_code || "").localeCompare(String(b.branch_code || ""))
    || String(a.cost_center_code || "").localeCompare(String(b.cost_center_code || ""))
  ));
  return { nextRows, created, updated };
}

function budgetRowDto(row, accountById) {
  const account = row.account_id ? accountById.get(Number(row.account_id)) : null;
  const parsedAmount = parseAmount(row.amount);
  const amount = Number.isFinite(parsedAmount) ? parsedAmount : (Number(row.amount_cents) || 0) / 100;
  return {
    period: String(row.period || ""),
    account_id: Number(row.account_id),
    account_code: account ? account.code : (row.account_code || null),
    account_name: account ? account.name : null,
    account_active: account ? account.active : null,
    branch_code: String(row.branch_code || ""),
    cost_center_code: String(row.cost_center_code || ""),
    amount,
    amount_cents: Number(row.amount_cents) || Math.round(amount * 100),
    updated_at: row.updated_at || null,
    updated_by: row.updated_by || null
  };
}

async function getPygBudgets(tenantId, query = {}) {
  const period = parsePeriodInput(query.period);
  return prisma.runWithTenant(tenantId, async () => {
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { config: true } });
    const accounting = tenant?.config && typeof tenant.config === "object" ? tenant.config.accounting || {} : {};
    const store = readBudgetStore(accounting);
    const rows = store.rows.filter((row) => row && String(row.period || "").trim() === period);
    const accountIds = [...new Set(rows.map((row) => Number(row.account_id)).filter((id) => Number.isSafeInteger(id)))];
    const accounts = accountIds.length
      ? await prisma.account.findMany({ where: { __includeInactive: true, id: { in: accountIds } } })
      : [];
    const accountById = new Map(accounts.map((account) => [account.id, { code: String(account.code), name: String(account.name), active: account.active === true }]));
    return {
      period,
      rows: rows.map((row) => budgetRowDto(row, accountById)),
      updated_at: store.updated_at || null
    };
  });
}

async function savePygBudgets(tenantId, userId, data) {
  const { period, rows } = normalizeBudgetInput(data);
  const result = await prisma.runWithTenant(tenantId, () => prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", `${tenantId}:accounting-numbering`);
    const tenant = await tx.tenant.findUnique({ where: { id: tenantId }, select: { config: true } });
    const config = tenant?.config && typeof tenant.config === "object" ? tenant.config : {};
    const accounting = config.accounting && typeof config.accounting === "object" ? config.accounting : {};
    const tree = parseOrganizationTree(accounting);
    const accountIds = [...new Set(rows.map((row) => row.account_id))];
    const accounts = await tx.account.findMany({ where: { __includeInactive: true, id: { in: accountIds } } });
    const accountsById = new Map(accounts.map((account) => [account.id, {
      id: account.id,
      code: String(account.code),
      name: String(account.name),
      active: account.active === true,
      allows_tx: account.allows_tx !== false,
      cls: pucClassOf(account.code)
    }]));
    const issues = budgetReferenceIssues(tree, accountsById, rows);
    if (issues.length) throw appError(issues[0].status, issues[0].code, issues[0].message);
    const enriched = rows.map((row) => {
      const account = accountsById.get(row.account_id);
      return { ...row, account_code: account.code };
    });
    const store = readBudgetStore(accounting);
    const nowIso = new Date().toISOString();
    const { nextRows, created, updated } = mergeBudgetStore(store.rows, period, enriched, nowIso, userId);
    const pyg_budgets = { ...store, rows: nextRows, updated_at: nowIso };
    await tx.tenant.update({
      where: { id: tenantId },
      data: { config: { ...config, accounting: { ...accounting, pyg_budgets } } }
    });
    await tx.auditLog.create({
      data: {
        user_id: userId || null,
        action: "UPSERT",
        module: "accounting",
        entity: "PygBudget",
        entity_id: period,
        old_value: { rows: (store.rows || []).length },
        new_value: { rows: nextRows.length, saved: enriched.length, created, updated }
      }
    });
    return {
      period,
      rows: nextRows.filter((row) => String(row.period || "").trim() === period),
      saved_count: enriched.length,
      created_count: created,
      updated_count: updated
    };
  }, COMPLEX_TRANSACTION_OPTIONS));
  await invalidateTenantCache(tenantId).catch(() => undefined);
  return result;
}

module.exports = {
  getPygBudgets,
  savePygBudgets,
  normalizeBudgetInput,
  budgetReferenceIssues,
  mergeBudgetStore,
  budgetKey
};
