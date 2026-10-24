/* Importacion Excel de presupuesto mensual por cuenta PUC (clases 4-7), sucursal y
 * centro de costo, integrada al almacen existente accounting.pyg_budgets que lee el
 * comparador PYG. Politica de duplicados: la importacion NUNCA sobrescribe. Si la
 * tupla periodo|cuenta|sucursal|centro ya existe (en el archivo o en el almacen) la
 * fila se rechaza con error puntual; el editor manual (PUT) conserva su upsert.
 * La importacion no escribe ningun asiento ni linea de libro: solo actualiza la
 * config del tenant y registra auditoria. La semantica es mensual pura: cada fila
 * planea un mes puntual YYYY-MM y jamas toca periodos anteriores.
 */
const { createHash } = require("node:crypto");
const prisma = require("../../core/prisma");
const { invalidateTenantCache } = require("../../core/tenantCache");
const { budgetKey, budgetReferenceIssues } = require("./pyg-budget");
const {
  pucClassOf,
  parseOrganizationTree,
  readBudgetStore
} = require("./pyg-interactive");
const { acquireAccountingLock } = require("./service");

const MAX_BUDGET_IMPORT_ROWS = 2000;
const COMPLEX_TRANSACTION_OPTIONS = { maxWait: 5_000, timeout: 20_000 };
const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const TEMPLATE_HEADERS = ["periodo", "cuenta", "centro_costo", "sucursal", "presupuesto"];
const BUDGET_SHEET_NAME = "presupuesto";

function appError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function normalizeHeader(value) {
  return String(value || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "_");
}

// ExcelJS entrega formulas como {formula, result}; el result puede ser numero, texto,
// error (#VALUE!), fecha o un objeto de texto enriquecido. Se resuelve hasta el valor.
function cellResult(value) {
  let current = value;
  for (let depth = 0; depth < 4 && current && typeof current === "object"; depth += 1) {
    if (current instanceof Date) return current;
    if (Array.isArray(current.richText)) return current.richText.map((part) => part.text || "").join("");
    if (current.error) return null;
    if (current.result !== undefined && current.result !== null) { current = current.result; continue; }
    if (typeof current.text === "string") return current.text;
    break;
  }
  return current;
}

function cellText(value) {
  if (value === null || value === undefined) return "";
  const resolved = cellResult(value);
  if (resolved === null || resolved === undefined) return "";
  if (resolved instanceof Date) return resolved.toISOString();
  if (typeof resolved === "object") return "";
  return String(resolved);
}

function periodCellValue(value) {
  const resolved = cellResult(value);
  if (resolved instanceof Date && !Number.isNaN(resolved.getTime())) return resolved.toISOString().substring(0, 7);
  // Un mes tecleado como numero (7) no se convierte en periodo: la fila recibe
  // INVALID_PERIOD en vez de inventar un mes.
  return cellText(resolved).trim();
}

function accountCodeCellValue(value) {
  const resolved = cellResult(value);
  if (typeof resolved === "number" && Number.isFinite(resolved) && Number.isInteger(resolved)) return String(resolved);
  const text = cellText(resolved).trim();
  return text.replace(/\.0+$/, "").trim();
}

// Acepta numero, texto con separadores ("1.234,56" o "1,234.56") y celdas de formula.
// Rechaza no finitos (Infinity, NaN), errores de Excel y texto no numerico.
function parseBudgetAmount(value) {
  const resolved = cellResult(value);
  if (typeof resolved === "number") return Number.isFinite(resolved) ? resolved : NaN;
  if (resolved === null || resolved === undefined) return NaN;
  const raw = String(resolved).trim();
  if (!raw) return NaN;
  const compact = raw.replace(/\s/g, "").replace(/[^\d.,+-]/g, "");
  if (!compact || !/\d/.test(compact)) return NaN;
  const lastDot = compact.lastIndexOf(".");
  const lastComma = compact.lastIndexOf(",");
  let normalized = compact;
  if (lastDot >= 0 && lastComma >= 0) {
    const decimal = lastDot > lastComma ? "." : ",";
    const thousands = decimal === "." ? /,/g : /\./g;
    normalized = compact.replace(thousands, "");
    if (decimal === ",") normalized = normalized.replace(",", ".");
  } else if (lastComma >= 0) {
    const decimals = compact.length - lastComma - 1;
    normalized = decimals > 0 && decimals <= 2 ? compact.replace(",", ".") : compact.replace(/,/g, "");
  } else if (lastDot >= 0) {
    const decimals = compact.length - lastDot - 1;
    if (decimals > 0 && decimals <= 2) normalized = compact;
    else normalized = compact.replace(/\./g, "");
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function round2(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function canonicalKey(value) {
  return String(value || "").trim().toLowerCase();
}

function canonicalMasterLookup(rows, keyField) {
  const byKey = new Map();
  for (const row of rows || []) {
    const key = canonicalKey(row[keyField]);
    if (!key) continue;
    const bucket = byKey.get(key) || [];
    bucket.push(row);
    byKey.set(key, bucket);
  }
  return byKey;
}

async function createPygBudgetTemplate() {
  const ExcelJS = require("exceljs");
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Presupuesto");
  sheet.addRow(["Plantilla de presupuesto mensual por cuenta contable"]);
  sheet.addRow(["Escriba en periodo el mes presupuestado con formato AAAA-MM (por ejemplo 2026-07). Cada fila es el presupuesto de ese mes; no es una fecha de corte y cargar un mes no cambia los meses anteriores."]);
  sheet.addRow(["Escriba el valor en pesos sin signo negativo: el reporte lo clasifica solo segun la cuenta (ingresos a favor, gastos y costos en contra). No hace falta que el total cuadre en cero. Use las clases 4 a 7. No cambie los encabezados de la fila 4 y no agregue una columna de tercero."]);
  sheet.addRow(TEMPLATE_HEADERS);
  sheet.getRow(4).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(4).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF146C63" } };
  sheet.getColumn(1).width = 14; sheet.getColumn(2).width = 16; sheet.getColumn(3).width = 18;
  sheet.getColumn(4).width = 16; sheet.getColumn(5).width = 18;
  sheet.getColumn(1).numFmt = "@";
  sheet.getColumn(2).numFmt = "@";
  sheet.getColumn(3).numFmt = "@";
  sheet.getColumn(4).numFmt = "@";
  sheet.getColumn(5).numFmt = "#,##0.00";
  return workbook.xlsx.writeBuffer();
}

async function parsePygBudgetWorkbook(buffer) {
  const ExcelJS = require("exceljs");
  const workbook = new ExcelJS.Workbook();
  try { await workbook.xlsx.load(buffer); } catch { throw appError(422, "INVALID_BUDGET_FILE", "El archivo Excel no se puede leer"); }
  const sheet = workbook.worksheets.find((row) => normalizeHeader(row.name) === BUDGET_SHEET_NAME) || workbook.worksheets[0];
  if (!sheet) throw appError(422, "INVALID_BUDGET_FILE", "La plantilla no contiene hojas");
  const headers = sheet.getRow(4).values.slice(1).map((value) => normalizeHeader(cellText(value)));
  const missing = TEMPLATE_HEADERS.filter((header) => !headers.includes(header));
  if (missing.length) throw appError(422, "INVALID_BUDGET_TEMPLATE", `Faltan columnas: ${missing.join(", ")}`);
  const rows = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber <= 4) return;
    const data = {};
    headers.forEach((header, index) => { data[header] = row.getCell(index + 1).value; });
    if (Object.values(data).some((value) => value !== null && value !== undefined && cellText(value).trim())) {
      rows.push({ ...data, excel_row: rowNumber });
    }
  });
  if (!rows.length) throw appError(400, "EMPTY_BUDGET_FILE", "La plantilla no contiene filas de presupuesto");
  if (rows.length > MAX_BUDGET_IMPORT_ROWS) throw appError(413, "BUDGET_FILE_TOO_LARGE", `La plantilla admite maximo ${MAX_BUDGET_IMPORT_ROWS} filas de presupuesto`);
  return rows;
}

function rowError(errors, code, message) {
  errors.push({ code, message });
}

/* Resuelve las filas crudas contra los maestros del tenant (cuentas PUC activas y
 * transaccionales por codigo insensible a mayusculas, sucursal/centro canonicos) y
 * acumula TODOS los errores por fila en vez de fallar en el primero. Tambien detecta
 * duplicados dentro del archivo y conflictos con tuplas ya existentes en el almacen. */
async function buildBudgetImportPreview(client, tenantId, tree, storeRows, rawRows) {
  const accountsByKey = new Map();
  const accountKeys = [...new Set(rawRows.map((row) => canonicalKey(accountCodeCellValue(row.cuenta))).filter(Boolean))];
  if (accountKeys.length) {
    const accounts = await client.account.findMany({ where: { __includeInactive: true } });
    for (const account of accounts) {
      const key = canonicalKey(account.code);
      if (!accountKeys.includes(key)) continue;
      const bucket = accountsByKey.get(key) || [];
      bucket.push(account);
      accountsByKey.set(key, bucket);
    }
  }
  const branchLookup = canonicalMasterLookup(tree.branches, "code");
  const centerLookup = canonicalMasterLookup(tree.cost_centers, "code");
  const existingKeys = new Set((storeRows || []).filter((row) => row && row.period && row.account_id).map((row) => budgetKey(row)));
  const seenInFile = new Map();

  const resolved = [];
  for (const raw of rawRows) {
    const excelRow = raw.excel_row;
    const errors = [];
    const period = periodCellValue(raw.periodo);
    if (!PERIOD_RE.test(period)) rowError(errors, "INVALID_PERIOD", `Fila ${excelRow}: periodo debe tener formato YYYY-MM (mes de presupuesto, no fecha de corte)`);
    const accountRaw = accountCodeCellValue(raw.cuenta);
    const accountKey = canonicalKey(accountRaw);
    let account = null;
    if (!accountRaw) rowError(errors, "REQUIRED_ACCOUNT_CODE", `Fila ${excelRow}: la cuenta PUC es obligatoria`);
    else {
      const bucket = accountsByKey.get(accountKey) || [];
      if (!bucket.length) rowError(errors, "BUDGET_ACCOUNT_NOT_FOUND", `Fila ${excelRow}: cuenta ${accountRaw} no existe en este tenant`);
      else if (bucket.length > 1) rowError(errors, "BUDGET_ACCOUNT_AMBIGUOUS", `Fila ${excelRow}: el codigo ${accountRaw} coincide con mas de una cuenta almacenada`);
      else account = bucket[0];
    }
    const branchRaw = cellText(raw.sucursal).trim();
    const centerRaw = cellText(raw.centro_costo).trim();
    const branchBucket = canonicalKey(branchRaw) ? (branchLookup.get(canonicalKey(branchRaw)) || []) : [];
    const centerBucket = canonicalKey(centerRaw) ? (centerLookup.get(canonicalKey(centerRaw)) || []) : [];
    let branch = null;
    let center = null;
    if (!branchRaw) rowError(errors, "REQUIRED_BRANCH", `Fila ${excelRow}: la sucursal es obligatoria`);
    else if (!branchBucket.length) rowError(errors, "BUDGET_BRANCH_NOT_FOUND", `Fila ${excelRow}: sucursal ${branchRaw} inexistente o inactiva en la estructura`);
    else if (branchBucket.length > 1) rowError(errors, "BUDGET_BRANCH_AMBIGUOUS", `Fila ${excelRow}: la sucursal ${branchRaw} coincide con mas de un codigo almacenado`);
    else branch = branchBucket[0];
    if (!centerRaw) rowError(errors, "REQUIRED_CENTER", `Fila ${excelRow}: el centro de costo es obligatorio`);
    else if (!centerBucket.length) rowError(errors, "BUDGET_CENTER_NOT_FOUND", `Fila ${excelRow}: centro de costo ${centerRaw} inexistente o inactivo en la estructura`);
    else if (centerBucket.length > 1) rowError(errors, "BUDGET_CENTER_AMBIGUOUS", `Fila ${excelRow}: el centro de costo ${centerRaw} coincide con mas de un codigo almacenado`);
    else center = centerBucket[0];
    const amount = parseBudgetAmount(raw.presupuesto);
    if (!Number.isFinite(amount)) rowError(errors, "INVALID_BUDGET_AMOUNT", `Fila ${excelRow}: el valor del presupuesto no es un numero valido`);
    else if (amount < 0) rowError(errors, "BUDGET_AMOUNT_NEGATIVE", `Fila ${excelRow}: el valor del presupuesto no puede ser negativo`);
    const amountCents = Number.isFinite(amount) ? Math.round(amount * 100) : null;
    if (amountCents !== null && !Number.isSafeInteger(amountCents)) rowError(errors, "INVALID_BUDGET_AMOUNT", `Fila ${excelRow}: el valor del presupuesto excede la precision soportada en centavos`);
    resolved.push({
      excel_row: excelRow,
      period: PERIOD_RE.test(period) ? period : "",
      account: account ? { id: account.id, code: String(account.code), name: String(account.name), active: account.active === true, allows_tx: account.allows_tx !== false } : null,
      account_raw: accountRaw,
      branch: branch ? { code: String(branch.code) } : null,
      center: center ? { code: String(center.code) } : null,
      amount: Number.isFinite(amount) ? round2(amount) : null,
      amount_cents: amountCents,
      errors
    });
  }

  // Duplicados dentro del archivo: la segunda aparicion y siguientes se rechazan.
  for (const row of resolved) {
    if (!row.account || !row.branch || !row.center || !PERIOD_RE.test(row.period)) continue;
    const key = budgetKey({ period: row.period, account_id: row.account.id, branch_code: row.branch.code, cost_center_code: row.center.code });
    const first = seenInFile.get(key);
    if (first !== undefined) {
      rowError(row.errors, "BUDGET_DUPLICATE_ROW", `Fila ${row.excel_row}: tupla repetida periodo/cuenta/sucursal/centro (primera aparicion fila ${first})`);
    } else {
      seenInFile.set(key, row.excel_row);
    }
  }

  // Conflictos con el almacen existente: politica sin sobrescritura silenciosa.
  for (const row of resolved) {
    if (row.errors.length || !row.account || !row.branch || !row.center) continue;
    const key = budgetKey({ period: row.period, account_id: row.account.id, branch_code: row.branch.code, cost_center_code: row.center.code });
    if (existingKeys.has(key)) {
      rowError(row.errors, "BUDGET_TUPLE_EXISTS", `Fila ${row.excel_row}: ya existe presupuesto para esta tupla en ${row.period}; la importacion no sobrescribe. Edite o elimine esa fila en el editor de presupuesto.`);
    }
  }

  // Validacion de referencias del editor existente (activo, transaccional, clase PUC 4-7,
  // jerarquia sucursal/centro) solo para las filas que ya resolvieron cuenta y dimensiones.
  const referenceIndexes = [];
  const referenceCandidates = [];
  resolved.forEach((row, index) => {
    if (!row.account || !row.branch || !row.center) return;
    referenceIndexes.push(index);
    referenceCandidates.push({ account_id: row.account.id, branch_code: row.branch.code, cost_center_code: row.center.code });
  });
  const accountsById = new Map(resolved.filter((row) => row.account).map((row) => [row.account.id, {
    id: row.account.id,
    code: row.account.code,
    name: row.account.name,
    active: row.account.active,
    allows_tx: row.account.allows_tx,
    cls: pucClassOf(row.account.code)
  }]));
  const referenceIssues = budgetReferenceIssues(tree, accountsById, referenceCandidates);
  for (const issue of referenceIssues) {
    const row = resolved[referenceIndexes[issue.index]];
    if (!row) continue;
    rowError(row.errors, issue.code, `Fila ${row.excel_row}: ${issue.message.replace(/^Fila \d+: /, "")}`);
  }

  const previewRows = resolved.map((row) => ({
    excel_row: row.excel_row,
    period: row.period || null,
    account_id: row.account ? row.account.id : null,
    account_code: row.account ? row.account.code : row.account_raw || null,
    account_name: row.account ? row.account.name : null,
    branch_code: row.branch ? row.branch.code : cellText(rawRows.find((raw) => raw.excel_row === row.excel_row)?.sucursal || "").trim() || null,
    cost_center_code: row.center ? row.center.code : cellText(rawRows.find((raw) => raw.excel_row === row.excel_row)?.centro_costo || "").trim() || null,
    amount: row.amount,
    amount_cents: row.amount_cents,
    status: row.errors.length ? "error" : "ok",
    errors: row.errors
  }));
  const validRows = previewRows.filter((row) => row.status === "ok");
  const periods = [...new Set(validRows.map((row) => row.period).filter(Boolean))].sort();
  return {
    valid: validRows.length === previewRows.length && previewRows.length > 0,
    file_hash: null,
    periods,
    totals: { rows: previewRows.length, valid_rows: validRows.length, error_rows: previewRows.length - validRows.length },
    rows: previewRows,
    monthly_semantics: "Cada fila planea un mes puntual (periodo YYYY-MM); la importacion no usa fechas de corte y no altera presupuestos de otros periodos."
  };
}

async function validatePygBudgetWorkbook(tenantId, buffer) {
  const fileHash = createHash("sha256").update(buffer).digest("hex");
  const rawRows = await parsePygBudgetWorkbook(buffer);
  return prisma.runWithTenant(tenantId, async () => {
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { config: true } });
    const accounting = tenant?.config && typeof tenant.config === "object" ? tenant.config.accounting || {} : {};
    const tree = parseOrganizationTree(accounting);
    const store = readBudgetStore(accounting);
    const preview = await buildBudgetImportPreview(prisma, tenantId, tree, store.rows, rawRows);
    return { ...preview, file_hash: fileHash };
  });
}

async function importPygBudgetWorkbook(tenantId, userId, buffer) {
  const fileHash = createHash("sha256").update(buffer).digest("hex");
  const rawRows = await parsePygBudgetWorkbook(buffer);
  const result = await prisma.runWithTenant(tenantId, () => prisma.$transaction(async (tx) => {
    // Mismo candado que el editor manual (savePygBudgets), la numeracion, los saldos
    // iniciales y las anulaciones: se toma antes de leer la config para no pisar
    // presupuestos o next_number escritos en paralelo por otro flujo.
    await acquireAccountingLock(tx, tenantId);
    const tenant = await tx.tenant.findUnique({ where: { id: tenantId }, select: { config: true } });
    const config = tenant?.config && typeof tenant.config === "object" ? tenant.config : {};
    const accounting = config.accounting && typeof config.accounting === "object" ? config.accounting : {};
    const tree = parseOrganizationTree(accounting);
    const store = readBudgetStore(accounting);
    if (store.last_import && store.last_import.file_hash === fileHash) {
      throw appError(409, "BUDGET_FILE_ALREADY_IMPORTED", "Este archivo ya fue importado antes; la importacion no sobrescribe tuplas existentes");
    }
    const preview = await buildBudgetImportPreview(tx, tenantId, tree, store.rows, rawRows);
    if (!preview.valid) {
      const error = appError(422, "BUDGET_IMPORT_VALIDATION_FAILED", `La importacion tiene ${preview.totals.error_rows} fila(s) con errores; no se guardo ninguna fila`);
      error.details = preview;
      throw error;
    }
    // Append-only: las filas nuevas no pueden chocar con el almacen porque los conflictos
    // ya se rechazaron arriba dentro de la misma transaccion (candado advisory incluido).
    const nowIso = new Date().toISOString();
    const records = preview.rows.map((row) => ({
      period: row.period,
      account_id: Number(row.account_id),
      account_code: row.account_code || null,
      branch_code: row.branch_code,
      cost_center_code: row.cost_center_code,
      amount: row.amount,
      amount_cents: row.amount_cents,
      updated_at: nowIso,
      updated_by: userId || null
    }));
    const nextRows = [...(store.rows || []), ...records].sort((a, b) => (
      String(a.period).localeCompare(String(b.period))
      || Number(a.account_id) - Number(b.account_id)
      || String(a.branch_code || "").localeCompare(String(b.branch_code || ""))
      || String(a.cost_center_code || "").localeCompare(String(b.cost_center_code || ""))
    ));
    const pyg_budgets = { ...store, rows: nextRows, updated_at: nowIso, last_import: { file_hash: fileHash, at: nowIso, by: userId || null, created: records.length } };
    await tx.tenant.update({ where: { id: tenantId }, data: { config: { ...config, accounting: { ...accounting, pyg_budgets } } } });
    await tx.auditLog.create({
      data: {
        user_id: userId || null,
        action: "IMPORT",
        module: "accounting",
        entity: "PygBudget",
        entity_id: preview.periods.join(","),
        old_value: { rows: (store.rows || []).length },
        new_value: { rows: nextRows.length, imported: records.length, file_hash: fileHash, periods: preview.periods }
      }
    });
    return { imported: true, file_hash: fileHash, created_count: records.length, updated_count: 0, periods: preview.periods, totals: preview.totals, rows: records };
  }, COMPLEX_TRANSACTION_OPTIONS));
  await invalidateTenantCache(tenantId).catch(() => undefined);
  return result;
}

module.exports = {
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
};
