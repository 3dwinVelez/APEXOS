/* Certificacion local completa de anulacion automatica de asientos y de importacion
 * Excel de presupuesto mensual por cuenta PUC. Chrome real, API local real y Prisma
 * local real. Sin interceptar peticiones, sin mocks de React y sin tocar entornos QA.
 * Prerequisitos: PostgreSQL loopback migrado, API parcheada en LOCAL_API_URL (default
 * http://127.0.0.1:3215), web parcheada compilada en LOCAL_WEB_URL (default
 * http://127.0.0.1:3004), Chrome instalado y DATABASE_URL loopback exportado.
 * Ejecutar desde la raiz del repositorio. No inicia ni detiene servidores.
 */
process.env.NODE_ENV = "test";
process.env.REDIS_DISABLED = "true";
process.env.DISABLE_REDIS = "true";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const Module = require("node:module");
const { execFileSync } = require("node:child_process");
const root = path.resolve(__dirname, "../..");
const moduleRoots = ["node_modules", "apps/api/node_modules", "apps/web/node_modules"]
  .map((dir) => path.join(root, dir))
  .filter((dir) => fs.existsSync(dir));
process.env.NODE_PATH = [...moduleRoots, process.env.NODE_PATH].filter(Boolean).join(path.delimiter);
Module._initPaths();

const puppeteer = require("puppeteer-core");
const ExcelJS = require("exceljs");
const { PrismaClient } = require("@prisma/client");

const LOOPBACK = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
function loopbackUrl(name, value) {
  let parsed = null;
  try { parsed = new URL(value); } catch { parsed = null; }
  if (!parsed || parsed.protocol !== "http:" || !LOOPBACK.has(parsed.hostname)) {
    throw new Error(`BLOQUEADO: ${name} debe ser una URL HTTP loopback (localhost o 127.0.0.1).`);
  }
  return String(value).replace(/\/+$/, "");
}
const databaseUrl = String(process.env.DATABASE_URL || "");
let parsedDatabase = null;
try { parsedDatabase = new URL(databaseUrl); } catch { parsedDatabase = null; }
if (!parsedDatabase || !/^postgres(ql)?:$/.test(parsedDatabase.protocol) || !LOOPBACK.has(parsedDatabase.hostname)) {
  throw new Error("BLOQUEADO: DATABASE_URL debe apuntar a PostgreSQL loopback local.");
}
const apiUrl = loopbackUrl("LOCAL_API_URL", process.env.LOCAL_API_URL || "http://127.0.0.1:3215");
const webUrl = loopbackUrl("LOCAL_WEB_URL", process.env.LOCAL_WEB_URL || "http://127.0.0.1:3004");
const output = path.resolve(root, process.env.BROWSER_EVIDENCE_PATH || "docs/qa/evidence/accounting-reversal-budget-import-20261023/browser-local.json");
const evidenceDir = path.dirname(output);
const browserPath = process.env.CHROME_BIN || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const suffix = crypto.randomBytes(5).toString("hex");
const checks = [];
const db = new PrismaClient();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const SOCIETY = "SOC-RV";
const B1 = "NORTE";
const C1 = "CC-NORTE-1";
const PERIOD_2026_01 = "2026-01";
const PERIOD_2026_02 = "2026-02";
const PERIOD_2026_06 = "2026-06";
const PERIOD_2026_07 = "2026-07";
const PERIOD_2026_08 = "2026-08";
const PRIOR_PERIOD = "2025-05";
const TODAY_ISO = new Date().toISOString().slice(0, 10);

const screenshots = {};
const shot = (name) => path.join(evidenceDir, `${name}-${suffix}.png`);
const consoleLogs = [];
const pageErrors = [];
const failedRequests = [];
const observedRequests = [];
const dialogs = [];
const MAX_LOG_ENTRIES = 200;
const MAX_TEXT_CHARS = 20000;

function pushBounded(list, entry) {
  list.push(entry);
  if (list.length > MAX_LOG_ENTRIES) list.shift();
}

const SOURCE_FILES = {
  reversal_service: "apps/api/src/modules/accounting/reversal.js",
  budget_import_service: "apps/api/src/modules/accounting/pyg-budget-import.js",
  accounting_service: "apps/api/src/modules/accounting/service.js",
  routes: "apps/api/src/modules/accounting/routes.js",
  schema: "apps/api/src/modules/accounting/schema.js",
  web_asientos: "apps/web/app/dashboard/contabilidad/asientos/page.tsx",
  web_budget_import: "apps/web/components/accounting/AccountingPygBudgetImport.tsx",
  web_budget_editor: "apps/web/components/accounting/AccountingPygBudget.tsx",
  api_unit_reversal: "apps/api/test/accounting-reversal.test.js",
  api_unit_budget_import: "apps/api/test/accounting-pyg-budget-import.test.js",
  web_unit: "apps/web/test/accounting-reversal-budget-import.test.mjs",
  script: "scripts/certifications/accounting-reversal-budget-import-browser-local.js"
};

function check(name, ok, detail = {}) {
  checks.push({ name, ok: Boolean(ok), detail });
  assert.ok(ok, `${name}: ${JSON.stringify(detail)}`);
}
function sha256(buffer) { return crypto.createHash("sha256").update(buffer).digest("hex"); }
function relative(file) { return path.relative(root, file).replace(/\\/g, "/"); }

async function waitForServer(url, endpoints) {
  let lastError = null;
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(`${url}${endpoint}`, { signal: AbortSignal.timeout(5000) });
      if (response.ok) return;
      lastError = new Error(`${url}${endpoint} respondio ${response.status}`);
    } catch (error) { lastError = error; }
  }
  throw lastError || new Error(`${url} no responde`);
}

function collectSources() {
  const sources = {};
  for (const [key, file] of Object.entries(SOURCE_FILES)) {
    const buffer = fs.readFileSync(path.join(root, file));
    sources[key] = { path: file, bytes: buffer.length, sha256: sha256(buffer) };
  }
  check("source_hashes_collected", Object.values(sources).every((source) => /^[a-f0-9]{64}$/.test(source.sha256)), { files: Object.keys(sources) });
  return sources;
}

function commitHash() {
  try { return execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(); } catch { return null; }
}

async function apiCall(method, pathname, token, body) {
  const headers = { ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  let payload;
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const response = await fetch(`${apiUrl}/api/v1${pathname}`, { method, headers, body: payload, signal: AbortSignal.timeout(60000) });
  const text = await response.text();
  let json = null;
  try { json = JSON.parse(text); } catch { json = null; }
  return { status: response.status, body: json, text, headers: response.headers };
}

async function apiFile(method, pathname, token, buffer, filename) {
  const form = new FormData();
  form.append("file", new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), filename);
  const response = await fetch(`${apiUrl}/api/v1${pathname}`, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: form,
    signal: AbortSignal.timeout(60000)
  });
  const text = await response.text();
  let json = null;
  try { json = JSON.parse(text); } catch { json = null; }
  return { status: response.status, body: json, text, headers: response.headers };
}

async function registerTenant(label) {
  const email = `${label}-${suffix}@apexos.local`;
  const password = `Rv-Budget-${suffix}9!`;
  const response = await fetch(`${apiUrl}/api/v1/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(60000),
    body: JSON.stringify({ company_name: `${label} ${suffix}`, industry: "qa", email, password, name: `${label} Admin`, country: "CO", timezone: "America/Bogota", currency: "COP", plan: "crown" })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`register_failed status=${response.status} code=${body.code || ""}`.trim());
  const token = body.token;
  const tenantId = body.tenant?.id || body.user?.tenant_id;
  if (!token || !tenantId) throw new Error("register_missing_token_or_tenant");
  return { token, tenantId, email, password };
}

function pickAccount(tenantId, prefix, where = {}) {
  return db.account.findFirst({ where: { tenant_id: tenantId, code: { startsWith: prefix }, active: true, allows_tx: true, ...where }, orderBy: { code: "asc" } });
}

async function seedOrganization(token, tenantId) {
  const units = [
    { type: "society", code: SOCIETY, name: "Sociedad Reverso QA" },
    { type: "branch", code: B1, name: "Sucursal Norte Reverso QA", society_code: SOCIETY },
    { type: "cost_center", code: C1, name: "Centro Norte Reverso QA", society_code: SOCIETY, branch_code: B1 }
  ];
  for (const unit of units) {
    const result = await apiCall("POST", "/accounting/organization-tree", token, unit);
    if (![200, 201].includes(result.status)) throw new Error(`org_tree_${unit.type}_${unit.code}_failed status=${result.status} code=${result.body?.code || ""}`.trim());
  }
  check("fixture_org_tree_configured_via_local_api", true, { society: SOCIETY, branch: B1, center: C1, tenant_id: tenantId });
}

async function postDocument(token, { posting_date, header_text, document_type = "CC", society_code = SOCIETY, lines }) {
  const result = await apiCall("POST", "/accounting/documents", token, { posting_date, header_text, document_type, society_code, lines });
  if (result.status !== 201) throw new Error(`document_failed status=${result.status} code=${result.body?.code || ""} message=${result.body?.message || ""}`.trim());
  return result.body;
}

function docLine(accountCode, branch, center, movement, amount, partyId, description) {
  return { account_code: accountCode, branch_code: branch, cost_center_code: center, party_id: partyId, movement, amount, description };
}

function findNodes(nodes, accountId, out = []) {
  for (const node of nodes) {
    if (node.account_id === accountId) out.push(node);
    findNodes(node.children || [], accountId, out);
  }
  return out;
}

function sectionByKeyOf(report) {
  return Object.fromEntries((report.sections || []).map((section) => [section.key, section]));
}

async function setRolePermissions(tenantId, email, name, actions) {
  const user = await db.user.findFirst({ where: { tenant_id: tenantId, email } });
  if (!user?.role_id) throw new Error(`role_not_found_for_${email}`);
  await db.role.update({ where: { id: user.role_id }, data: { name, metadata: {} } });
  await db.permission.deleteMany({ where: { role_id: user.role_id } });
  for (const action of actions) {
    await db.permission.create({ data: { role_id: user.role_id, module: "accounting", action } });
  }
}

async function login(page, email, password) {
  await page.goto(`${webUrl}/login`, { waitUntil: "networkidle2" });
  await page.waitForSelector('input[name="email"]', { visible: true, timeout: 45000 });
  await page.waitForSelector('input[name="password"]', { visible: true, timeout: 45000 });
  const pending = page.waitForResponse((response) => new URL(response.url()).pathname.endsWith("/api/v1/auth/login") && response.request().method() === "POST", { timeout: 45000 });
  for (const selector of ['input[name="email"]', 'input[name="password"]']) {
    await page.click(selector, { clickCount: 3 });
    await page.keyboard.down("Control"); await page.keyboard.press("A"); await page.keyboard.up("Control"); await page.keyboard.press("Backspace");
  }
  await page.type('input[name="email"]', email);
  await page.type('input[name="password"]', password);
  await page.click('form button[type="submit"]');
  const response = await pending;
  await page.waitForFunction(() => !location.pathname.endsWith("/login"), { timeout: 45000 });
  check("browser_login_real", response.status() === 200, { status: response.status() });
}

async function clickButton(page, label) {
  await page.waitForFunction((text) => [...document.querySelectorAll("button")].some((button) => (button.textContent || "").includes(text) && !button.disabled), { timeout: 20000 }, label);
  const alreadyActive = await page.evaluate((text) => [...document.querySelectorAll("nav button")].some((button) => (button.textContent || "").includes(text) && button.className.includes("bg-apex")), label).catch(() => false);
  if (alreadyActive) return;
  for (const button of await page.$$("button")) {
    const state = await button.evaluate((node) => ({ text: node.textContent || "", disabled: Boolean(node.disabled) }));
    if (state.text.includes(label) && !state.disabled) {
      await button.scrollIntoView();
      await button.click();
      return;
    }
  }
  throw new Error(`button_not_found:${label}`);
}

function attachDiagnostics(page) {
  page.on("console", (message) => {
    const type = message.type();
    if (!["error", "warning", "warn"].includes(type)) return;
    pushBounded(consoleLogs, { at: new Date().toISOString(), type, text: message.text().slice(0, 2000), url: page.url() });
  });
  page.on("pageerror", (error) => {
    pushBounded(pageErrors, { at: new Date().toISOString(), message: String(error?.message || error).slice(0, 4000), stack: String(error?.stack || "").slice(0, 8000), url: page.url() });
  });
  page.on("requestfailed", (request) => {
    pushBounded(failedRequests, { at: new Date().toISOString(), method: request.method(), url: request.url().slice(0, 2000), error: request.failure()?.errorText || "" });
  });
  page.on("dialog", async (dialog) => {
    dialogs.push({ at: new Date().toISOString(), message: dialog.message().slice(0, 2000) });
    await dialog.accept().catch(() => undefined);
  });
  page.on("response", (response) => {
    const url = response.url();
    if (!url.includes("/api/v1/accounting/")) return;
    const request = response.request();
    pushBounded(observedRequests, {
      at: new Date().toISOString(), method: request.method(), status: response.status(), url: url.slice(0, 2000)
    });
  });
}

async function snapshotBrowserState(page, label) {
  const captured = { label, at: new Date().toISOString(), url: null, title: null, screenshot: null, text_file: null, text: null, text_truncated: false, markers: null, error: null };
  try { captured.url = page.url(); } catch (error) { captured.error = String(error?.message || error); }
  try {
    const file = shot(label);
    await page.screenshot({ path: file, fullPage: false });
    screenshots[label] = relative(file);
    captured.screenshot = relative(file);
  } catch (error) { captured.error = `${captured.error ? `${captured.error} | ` : ""}screenshot: ${String(error?.message || error)}`; }
  try {
    captured.title = await page.title();
    const text = await page.$eval("body", (body) => body.innerText);
    captured.text_truncated = text.length > MAX_TEXT_CHARS;
    captured.text = text.slice(0, MAX_TEXT_CHARS);
    const textFile = path.join(evidenceDir, `${label}-${suffix}.txt`);
    fs.writeFileSync(textFile, text);
    captured.text_file = relative(textFile);
  } catch (error) { captured.error = `${captured.error ? `${captured.error} | ` : ""}text: ${String(error?.message || error)}`; }
  try {
    captured.markers = await page.evaluate(() => {
      const text = document.body.innerText;
      const matches = (needle) => text.includes(needle);
      return {
        import_panel: matches("Importar presupuesto desde Excel"),
        preview_ok: matches("Validación correcta"),
        import_ok: matches("Presupuesto importado"),
        anular_modal: matches("Anular"),
        elegible: matches("Elegible para anulacion"),
        ineligible: matches("No se puede anular desde contabilidad"),
        solo_lectura: matches("Solo lectura")
      };
    });
  } catch (error) { captured.error = `${captured.error ? `${captured.error} | ` : ""}markers: ${String(error?.message || error)}`; }
  return captured;
}

// ---------------------------------------------------------------- workbooks de prueba

async function buildOpeningWorkbook(fecha, rows) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Saldos iniciales");
  sheet.addRow(["Plantilla de saldos iniciales historicos"]);
  sheet.addRow(["Una sola fecha de corte por archivo"]);
  sheet.addRow(["No cambie los encabezados"]);
  sheet.addRow(["fecha_corte", "cuenta", "centro_costo", "sucursal", "saldo", "tercero"]);
  for (const row of rows) sheet.addRow([fecha, row.cuenta, row.centro_costo, row.sucursal, row.saldo, row.tercero || ""]);
  return workbook.xlsx.writeBuffer();
}

async function buildBudgetWorkbook(rows) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Presupuesto");
  sheet.addRow(["Plantilla de presupuesto mensual por cuenta PUC"]);
  sheet.addRow(["Semantica MENSUAL: cada fila planea un unico mes (periodo YYYY-MM). No usa fechas de corte ni saldos iniciales."]);
  sheet.addRow(["Cargue valores positivos. No cambie los encabezados de la fila 4. No hay columna de tercero."]);
  sheet.addRow(["periodo", "cuenta", "centro_costo", "sucursal", "presupuesto"]);
  for (const row of rows) sheet.addRow([row.periodo, row.cuenta, row.centro_costo, row.sucursal, row.presupuesto]);
  return workbook.xlsx.writeBuffer();
}

function budgetRow(periodo, cuenta, presupuesto) {
  return { periodo, cuenta, centro_costo: C1, sucursal: B1, presupuesto };
}

function moneyText(value) {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(value);
}

// Acepta texto de moneda regional ("$ 400", "400,00", "COP 400", "(400)") sin fijar
// el simbolo ni el separador: solo exige que el valor sea exactamente el esperado.
function parseRegionalAmount(text, expected) {
  const raw = String(text ?? "").replace(/[^\d.,()-]/g, "").trim();
  if (!/\d/.test(raw)) return { ok: false, text: String(text ?? ""), raw };
  const negative = raw.startsWith("(") && raw.endsWith(")");
  const candidate = raw.replace(/[()]/g, "");
  const lastDot = candidate.lastIndexOf(".");
  const lastComma = candidate.lastIndexOf(",");
  const decimalMark = lastDot > lastComma ? "." : lastComma > lastDot ? "," : "";
  const digitsAfter = decimalMark ? candidate.length - candidate.lastIndexOf(decimalMark) - 1 : 0;
  let normalized;
  if (decimalMark && digitsAfter > 0 && digitsAfter <= 2) {
    const grouped = candidate.slice(0, candidate.lastIndexOf(decimalMark)).replace(/[.,]/g, "");
    normalized = `${grouped}.${candidate.slice(candidate.lastIndexOf(decimalMark) + 1)}`;
  } else {
    normalized = candidate.replace(/[.,]/g, "");
  }
  const value = Number(normalized) * (negative ? -1 : 1);
  return { ok: Number.isFinite(value) && value === expected, text: String(text ?? ""), raw, value: Number.isFinite(value) ? value : null };
}

async function setMonthInput(page, value) {
  const inputs = await page.$$('input[type="month"]');
  let input = null;
  for (const candidate of inputs) {
    const box = await candidate.boundingBox().catch(() => null);
    if (box && box.width > 0 && box.height > 0) { input = candidate; break; }
  }
  if (!input) throw new Error("month_input_not_found");
  await input.scrollIntoView();
  await input.evaluate((node, next) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    setter.call(node, next);
    node.dispatchEvent(new Event("input", { bubbles: true }));
    node.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
}

// ---------------------------------------------------------------- main

async function main() {
  await waitForServer(apiUrl, ["/health", "/api/v1/health"]);
  await waitForServer(webUrl, ["/"]);
  if (!fs.existsSync(browserPath)) throw new Error(`PREREQUISITO: no existe Chrome en ${browserPath}`);
  const sources = collectSources();
  fs.mkdirSync(evidenceDir, { recursive: true });

  await db.$connect();
  const tenantA = await registerTenant("rv-budget-a");
  const tenantB = await registerTenant("rv-budget-b");

  const accountCount = await db.account.count({ where: { tenant_id: tenantA.tenantId } });
  check("fixture_standard_chart_initialized", accountCount >= 2500, { accounts: accountCount });

  await seedOrganization(tenantA.token, tenantA.tenantId);
  const party = await db.party.create({ data: { tenant_id: tenantA.tenantId, type: "customer", name: "Cliente Reverso QA", active: true } });

  const income = await pickAccount(tenantA.tenantId, "4175");
  const expense = await pickAccount(tenantA.tenantId, "5105");
  const cash = await pickAccount(tenantA.tenantId, "110505") || await pickAccount(tenantA.tenantId, "1105");
  check("fixture_accounts_resolved", Boolean(income && expense && cash), { income: income?.code, expense: expense?.code, cash: cash?.code });

  // Cuenta exclusiva del tenant A para probar aislamiento de maestros en la importacion.
  const tenantAOnlyCode = `${expense.code}RVAISO`;
  const childResult = await apiCall("POST", "/accounting/accounts", tenantA.token, {
    code: tenantAOnlyCode, name: "Gasto aislamiento importacion QA", type: "expense", parent_code: expense.code, active: true, allows_tx: true
  });
  if (![200, 201].includes(childResult.status)) throw new Error(`child_account_failed status=${childResult.status} code=${childResult.body?.code || ""}`.trim());
  const tenantAOnlyAccount = await db.account.findFirst({ where: { tenant_id: tenantA.tenantId, code: tenantAOnlyCode } });
  check("fixture_tenant_a_only_account_created", Boolean(tenantAOnlyAccount), { code: tenantAOnlyAccount?.code });

  // ---------------------------------------------------------------- Feature 1: anulacion API
  const reversalDateToday = TODAY_ISO;
  const m1 = await postDocument(tenantA.token, {
    posting_date: "2026-10-15", header_text: "Gasto manual certificacion reverso M1",
    lines: [
      docLine(expense.code, B1, C1, "debit", 500, party.id, "Gasto administrativo"),
      docLine(cash.code, B1, C1, "credit", 500, party.id, "Caja contrapartida")
    ]
  });
  const m3 = await postDocument(tenantA.token, {
    posting_date: "2026-10-16", header_text: "Gasto manual origen compras M3",
    lines: [
      docLine(expense.code, B1, C1, "debit", 222, party.id, "Gasto con enlace de transaccion"),
      docLine(cash.code, B1, C1, "credit", 222, party.id, "Caja contrapartida")
    ]
  });
  const m4 = await postDocument(tenantA.token, {
    posting_date: "2026-10-17", header_text: "Ingreso manual navegador M4",
    lines: [
      docLine(income.code, B1, C1, "credit", 400, party.id, "Ingreso de servicio"),
      docLine(cash.code, B1, C1, "debit", 400, party.id, "Caja contrapartida")
    ]
  });
  check("manual_document_posted", Boolean(m1?.full_number && m3?.full_number && m4?.full_number), { m1: m1?.full_number, m3: m3?.full_number, m4: m4?.full_number });

  const beforeReport = await apiCall("GET", `/accounting/reports/pyg-interactive?period=2026-10&mode=month`, tenantA.token);
  check("reversal_report_before_netting", beforeReport.status === 200 && sectionByKeyOf(beforeReport.body).gastos5?.actual === -722, { gastos5: sectionByKeyOf(beforeReport.body).gastos5?.actual });

  const listDocs = await apiCall("GET", "/accounting/documents?limit=50", tenantA.token);
  const listedM1 = (listDocs.body || []).find((row) => row.id === m1.id);
  check("list_documents_enriched_eligible", listDocs.status === 200 && listedM1?.reversal_status === "posted" && listedM1?.reversal_eligibility?.eligible === true && listedM1?.reversal_eligibility?.origin === "manual", { eligibility: listedM1?.reversal_eligibility });

  const eligibilityM1 = await apiCall("GET", `/accounting/documents/${m1.id}/reversal-eligibility`, tenantA.token);
  check("eligibility_endpoint_manual_eligible", eligibilityM1.status === 200 && eligibilityM1.body?.eligibility?.eligible === true && eligibilityM1.body?.eligibility?.origin === "manual" && eligibilityM1.body?.document?.full_number === m1.full_number, { body: eligibilityM1.body });

  const reverseM1 = await apiCall("POST", `/accounting/documents/${m1.id}/reverse`, tenantA.token, {
    reason: "Error de digitacion en valores del comprobante", reversal_date: reversalDateToday
  });
  check("reversal_manual_created_201", reverseM1.status === 201 && reverseM1.body?.reversed === true && reverseM1.body?.reversal_document_id && reverseM1.body?.reversal_number, { status: reverseM1.status, body: reverseM1.body });

  const reversalDoc = await db.cntCabdoc.findUnique({ where: { id: reverseM1.body.reversal_document_id }, include: { lines: { orderBy: { line_no: "asc" } } } });
  const originalDoc = await db.cntCabdoc.findUnique({ where: { id: m1.id }, include: { lines: { orderBy: { line_no: "asc" } } } });
  check("reversal_header_mirror_persisted", reversalDoc?.is_reversal === true && reversalDoc?.referenced_document_id === m1.id && reversalDoc?.status === "posted" && reversalDoc?.reference === m1.full_number && reversalDoc?.total_debit === 500 && reversalDoc?.total_credit === 500 && reversalDoc?.society_code === SOCIETY, { reversalDoc, header_text: reversalDoc?.header_text });
  // El espejo invierte el sentido de cada linea del original persistido: misma cuenta,
  // sucursal, centro de costo y tercero, con debito y credito intercambiados por line_no.
  const originalLines = originalDoc?.lines || [];
  const reversalMirrorMismatches = originalLines.length === 2 && reversalDoc?.lines?.length === 2
    ? originalLines.flatMap((originalLine) => {
      const mirror = reversalDoc.lines.find((line) => line.line_no === originalLine.line_no);
      const expected = `reversal[line_no=${originalLine.line_no}]`;
      if (!mirror) return [{ line: expected, field: "missing" }];
      const drift = [];
      if (Number(mirror.debit) !== Number(originalLine.credit)) drift.push({ line: expected, field: "debit", actual: mirror.debit, expected: originalLine.credit });
      if (Number(mirror.credit) !== Number(originalLine.debit)) drift.push({ line: expected, field: "credit", actual: mirror.credit, expected: originalLine.debit });
      if (mirror.account_id !== originalLine.account_id) drift.push({ line: expected, field: "account_id", actual: mirror.account_id, expected: originalLine.account_id });
      if (mirror.account_code !== originalLine.account_code) drift.push({ line: expected, field: "account_code", actual: mirror.account_code, expected: originalLine.account_code });
      if (mirror.branch_code !== originalLine.branch_code) drift.push({ line: expected, field: "branch_code", actual: mirror.branch_code, expected: originalLine.branch_code });
      if (mirror.cost_center_code !== originalLine.cost_center_code) drift.push({ line: expected, field: "cost_center_code", actual: mirror.cost_center_code, expected: originalLine.cost_center_code });
      if (mirror.party_id !== originalLine.party_id) drift.push({ line: expected, field: "party_id", actual: mirror.party_id, expected: originalLine.party_id });
      if ((mirror.party_tax_id ?? null) !== (originalLine.party_tax_id ?? null)) drift.push({ line: expected, field: "party_tax_id", actual: mirror.party_tax_id, expected: originalLine.party_tax_id });
      if ((mirror.movement === "debit") !== (Number(mirror.debit) > 0)) drift.push({ line: expected, field: "movement", actual: mirror.movement, expected: Number(mirror.debit) > 0 ? "debit" : "credit" });
      return drift;
    })
    : [{ line: "lines", field: "length", actual: reversalDoc?.lines?.length ?? null, expected: 2, original: originalLines.length }];
  check("reversal_lines_inverted_persisted",
    reversalDoc?.lines?.length === 2
      && originalLines.length === 2
      && reversalDoc.lines.some((line) => line.account_id === expense.id && Number(line.credit) === 500 && Number(line.debit) === 0)
      && reversalDoc.lines.some((line) => line.account_id === cash.id && Number(line.debit) === 500 && Number(line.credit) === 0)
      && reversalMirrorMismatches.length === 0,
    { lines: reversalDoc?.lines, original_lines: originalDoc?.lines, mismatches: reversalMirrorMismatches });
  check("reversal_original_cancelled_persisted", originalDoc?.status === "cancelled" && originalDoc?.is_cancelled === true && originalDoc?.cancelled_by !== null, { original: originalDoc && { status: originalDoc.status, is_cancelled: originalDoc.is_cancelled, cancelled_by: originalDoc.cancelled_by } });

  const auditReversal = await db.auditLog.findFirst({ where: { tenant_id: tenantA.tenantId, action: "REVERSE", entity: "CntCabdoc", entity_id: String(m1.id) } });
  check("reversal_audit_log_written", Boolean(auditReversal), { audit: auditReversal && { module: auditReversal.module, entity_id: auditReversal.entity_id } });

  // Origen por defecto cerrado: la unica prueba de "manual" es la marca que el servidor
  // grabo al crear el asiento. M4 conserva su marca y sigue siendo elegible; la prueba
  // de origen desconocido usa un fixture heredado creado directo en la base, sin marca.
  const manualMarker = await db.auditLog.findFirst({ where: { tenant_id: tenantA.tenantId, action: "CREATE", entity: "CntCabdoc", entity_id: String(m4.id), new_value: { path: ["provenance"], equals: "manual_document" } } });
  check("manual_provenance_marker_written_atomically", Boolean(manualMarker), { marker: manualMarker && manualMarker.new_value });

  // Asiento heredado local-only: imita tipo y cabecera, pero no tiene marca de origen ni
  // efectos de libro. Solo prueba provenance; la validacion estructural es independiente.
  const legacyDocumentNumber = 1000000 + crypto.randomInt(0, 1000000);
  const legacyDoc = await db.cntCabdoc.create({ data: {
    tenant_id: tenantA.tenantId,
    document_type: "CC",
    document_number: legacyDocumentNumber,
    full_number: `LEGACY-${suffix}`,
    posting_date: new Date("2026-01-01T00:00:00.000Z"),
    header_text: "Gasto manual certificacion reverso LEGADO",
    society_code: SOCIETY,
    status: "posted",
    total_debit: 0,
    total_credit: 0
  } });
  const legacyEligibility = await apiCall("GET", `/accounting/documents/${legacyDoc.id}/reversal-eligibility`, tenantA.token);
  check("legacy_unknown_origin_blocked_even_with_manual_look",
    legacyEligibility.status === 200
      && legacyEligibility.body?.eligibility?.eligible === false
      && legacyEligibility.body?.eligibility?.reason_code === "ORIGIN_UNVERIFIED"
      && !legacyEligibility.body?.provenance?.marker,
    { document: legacyDoc.full_number, eligibility: legacyEligibility.body?.eligibility, provenance: legacyEligibility.body?.provenance });
  const legacyReverse = await apiCall("POST", `/accounting/documents/${legacyDoc.id}/reverse`, tenantA.token, { reason: "asiento heredado sin marca", reversal_date: reversalDateToday });
  check("legacy_unknown_origin_reverse_rejected_422", legacyReverse.status === 422 && legacyReverse.body?.code === "ORIGIN_UNVERIFIED", { status: legacyReverse.status, code: legacyReverse.body?.code });

  const reversalLines = reversalDoc?.lines || [];
  const m1Ledger = await db.ledgerEntry.findMany({ where: { tenant_id: tenantA.tenantId, id: { in: originalLines.map((line) => line.ledger_entry_id) } } });
  const reversalLedger = await db.ledgerEntry.findMany({ where: { tenant_id: tenantA.tenantId, id: { in: reversalLines.map((line) => line.ledger_entry_id) } } });
  const ledgerById = new Map(m1Ledger.map((row) => [row.id, row]));
  // El libro espejo invierte el sentido del libro original de la misma linea: el debito
  // del original es el credito del espejo y viceversa, sobre la misma cuenta.
  const reversalLedgerMismatches = originalLines.flatMap((originalLine) => {
    const originalLedger = ledgerById.get(originalLine.ledger_entry_id);
    const mirrorLine = reversalLines.find((line) => line.line_no === originalLine.line_no);
    const mirrorLedger = mirrorLine ? reversalLedger.find((row) => row.id === mirrorLine.ledger_entry_id) : null;
    const expected = `ledger[line_no=${originalLine.line_no}]`;
    if (!originalLedger) return [{ entry: expected, field: "original_missing" }];
    if (!mirrorLedger) return [{ entry: expected, field: "mirror_missing" }];
    const drift = [];
    if (Number(mirrorLedger.debit) !== Number(originalLedger.credit)) drift.push({ entry: expected, field: "debit", actual: mirrorLedger.debit, expected: originalLedger.credit });
    if (Number(mirrorLedger.credit) !== Number(originalLedger.debit)) drift.push({ entry: expected, field: "credit", actual: mirrorLedger.credit, expected: originalLedger.debit });
    if (mirrorLedger.account_id !== originalLedger.account_id) drift.push({ entry: expected, field: "account_id", actual: mirrorLedger.account_id, expected: originalLedger.account_id });
    return drift;
  });
  check("reversal_ledger_net_zero_no_deletion",
    m1Ledger.length === 2
      && reversalLedger.length === 2
      && reversalLedger.every((row) => row.transaction_id === null)
      && m1Ledger.reduce((sum, row) => sum + row.debit - row.credit, 0) + reversalLedger.reduce((sum, row) => sum + row.debit - row.credit, 0) === 0
      && reversalLedgerMismatches.length === 0,
    { original: m1Ledger, reversal: reversalLedger, mismatches: reversalLedgerMismatches });

  const afterReport = await apiCall("GET", `/accounting/reports/pyg-interactive?period=2026-10&mode=month`, tenantA.token);
  check("reversal_report_nets_original_and_reversal", afterReport.status === 200 && sectionByKeyOf(afterReport.body).gastos5?.actual === -222 && sectionByKeyOf(afterReport.body).ingresos4?.actual === 400, { gastos5: sectionByKeyOf(afterReport.body).gastos5?.actual, ingresos4: sectionByKeyOf(afterReport.body).ingresos4?.actual });

  const doubleReverse = await apiCall("POST", `/accounting/documents/${m1.id}/reverse`, tenantA.token, { reason: "segundo intento prohibido", reversal_date: reversalDateToday });
  check("double_reversal_rejected_409", doubleReverse.status === 409 && doubleReverse.body?.code === "ALREADY_REVERSED", { status: doubleReverse.status, code: doubleReverse.body?.code });

  const reverseOfReversal = await apiCall("POST", `/accounting/documents/${reversalDoc.id}/reverse`, tenantA.token, { reason: "anular la anulacion prohibido", reversal_date: reversalDateToday });
  check("reversal_of_reversal_rejected", reverseOfReversal.status === 409 && reverseOfReversal.body?.code === "REVERSAL_DOCUMENT", { status: reverseOfReversal.status, code: reverseOfReversal.body?.code });

  // Periodo cerrado: el asiento M2 se registra en 2026-01, se cierra el periodo y la
  // anulacion con fecha de ese periodo se rechaza antes de abrir la transaccion.
  const m2 = await postDocument(tenantA.token, {
    posting_date: `${PERIOD_2026_01}-15`, header_text: "Gasto manual periodo cerrado M2",
    lines: [
      docLine(expense.code, B1, C1, "debit", 111, party.id, "Gasto enero"),
      docLine(cash.code, B1, C1, "credit", 111, party.id, "Caja contrapartida")
    ]
  });
  const closePeriod = await apiCall("PATCH", `/accounting/periods/${PERIOD_2026_01}`, tenantA.token, { status: "closed", notes: "cierre de prueba certificacion" });
  const closedReverse = await apiCall("POST", `/accounting/documents/${m2.id}/reverse`, tenantA.token, { reason: "intento en periodo cerrado", reversal_date: `${PERIOD_2026_01}-20` });
  check("closed_period_reversal_rejected_423", closePeriod.status === 200 && closedReverse.status === 423 && closedReverse.body?.code === "PERIOD_CLOSED", { close: closePeriod.status, status: closedReverse.status, code: closedReverse.body?.code });
  const reopenPeriod = await apiCall("PATCH", `/accounting/periods/${PERIOD_2026_01}`, tenantA.token, { status: "open" });
  const reopenReverse = await apiCall("POST", `/accounting/documents/${m2.id}/reverse`, tenantA.token, { reason: "anulacion tras reabrir el periodo", reversal_date: `${PERIOD_2026_01}-20` });
  check("reopened_period_reversal_succeeds", reopenPeriod.status === 200 && reopenReverse.status === 201, { reopen: reopenPeriod.status, reverse: reopenReverse.status });

  // Restriccion de origen: lineas de libro ligadas a una transaccion de compras.
  const m3LineIds = (await db.cntCuedoc.findMany({ where: { tenant_id: tenantA.tenantId, cabdoc_id: m3.id }, select: { ledger_entry_id: true } })).map((row) => row.ledger_entry_id);
  await db.ledgerEntry.updateMany({ where: { tenant_id: tenantA.tenantId, id: { in: m3LineIds } }, data: { transaction_id: 424242 } });
  const eligibilityM3 = await apiCall("GET", `/accounting/documents/${m3.id}/reversal-eligibility`, tenantA.token);
  const reverseM3 = await apiCall("POST", `/accounting/documents/${m3.id}/reverse`, tenantA.token, { reason: "no se debe poder anular", reversal_date: reversalDateToday });
  check("source_module_document_rejected_422", reverseM3.status === 422 && reverseM3.body?.code === "SOURCE_MODULE_DOCUMENT" && String(reverseM3.body?.error || reverseM3.body?.message || "").toLowerCase().includes("compras"), { status: reverseM3.status, code: reverseM3.body?.code, message: reverseM3.body?.error || reverseM3.body?.message });
  check("source_module_eligibility_explains_module", eligibilityM3.status === 200 && eligibilityM3.body?.eligibility?.eligible === false && eligibilityM3.body?.eligibility?.reason_code === "SOURCE_MODULE_DOCUMENT" && eligibilityM3.body?.eligibility?.origin === "purchases", { eligibility: eligibilityM3.body?.eligibility });

  // RBAC y aislamiento de tenant.
  await setRolePermissions(tenantA.tenantId, tenantA.email, "CERT_RV_READER", ["read"]);
  const rbacReverse = await apiCall("POST", `/accounting/documents/${m4.id}/reverse`, tenantA.token, { reason: "rol de solo lectura", reversal_date: reversalDateToday });
  const rbacEligibility = await apiCall("GET", `/accounting/documents/${m4.id}/reversal-eligibility`, tenantA.token);
  check("read_only_role_cannot_reverse_403", rbacReverse.status === 403 && rbacReverse.body?.code === "PERMISO_DENEGADO", { status: rbacReverse.status, code: rbacReverse.body?.code });
  check("read_only_role_still_reads_eligibility", rbacEligibility.status === 200, { status: rbacEligibility.status });
  await setRolePermissions(tenantA.tenantId, tenantA.email, "CERT_RV_ROLE", ["read", "write"]);

  const crossReverse = await apiCall("POST", `/accounting/documents/${m4.id}/reverse`, tenantB.token, { reason: "aislamiento de tenant", reversal_date: reversalDateToday });
  const crossEligibility = await apiCall("GET", `/accounting/documents/${m4.id}/reversal-eligibility`, tenantB.token);
  check("cross_company_reverse_isolated_404", crossReverse.status === 404 && crossReverse.body?.code === "ACCOUNTING_DOCUMENT_NOT_FOUND" && crossEligibility.status === 404, { reverse: crossReverse.status, eligibility: crossEligibility.status });

  // Anulacion de saldos iniciales historicos (flujo completo con Excel real).
  const openingBuffer = await buildOpeningWorkbook("2026-02-28", [
    { cuenta: expense.code, centro_costo: C1, sucursal: B1, saldo: 200, tercero: "" },
    { cuenta: cash.code, centro_costo: C1, sucursal: B1, saldo: -200, tercero: "" }
  ]);
  const openingPost = await apiFile("POST", "/accounting/opening-balances", tenantA.token, openingBuffer, "saldos-rv.xlsx");
  check("opening_balances_posted_via_api", openingPost.status === 201 && openingPost.body?.accounting_document?.id && openingPost.body?.reference?.startsWith("SI-"), { status: openingPost.status, reference: openingPost.body?.reference, full_number: openingPost.body?.accounting_document?.full_number });
  const openingDoc = openingPost.body.accounting_document;
  const openingEligibility = await apiCall("GET", `/accounting/documents/${openingDoc.id}/reversal-eligibility`, tenantA.token);
  check("opening_balances_eligibility_origin", openingEligibility.status === 200 && openingEligibility.body?.eligibility?.eligible === true && openingEligibility.body?.eligibility?.origin === "opening_balances", { eligibility: openingEligibility.body?.eligibility });
  const openingReverse = await apiCall("POST", `/accounting/documents/${openingDoc.id}/reverse`, tenantA.token, {
    reason: "Saldos iniciales cargados con valores equivocados", reversal_date: "2026-02-28"
  });
  check("opening_balances_reversal_201", openingReverse.status === 201 && openingReverse.body?.reversal_number, { status: openingReverse.status, body: openingReverse.body });
  const openingExpenseLedger = await db.ledgerEntry.findMany({ where: { tenant_id: tenantA.tenantId, account_id: expense.id, date: { gte: new Date("2026-02-01T00:00:00.000Z"), lt: new Date("2026-03-01T00:00:00.000Z") } }, select: { debit: true, credit: true } });
  const openingReport = await apiCall("GET", `/accounting/reports/pyg-interactive?period=${PERIOD_2026_02}&mode=month`, tenantA.token);
  check("opening_balances_net_zero_after_reversal", openingExpenseLedger.length === 2 && openingExpenseLedger.reduce((sum, row) => sum + row.debit - row.credit, 0) === 0 && openingReport.status === 200 && sectionByKeyOf(openingReport.body).gastos5?.actual === 0, { ledger: openingExpenseLedger, gastos5: sectionByKeyOf(openingReport.body).gastos5?.actual });

  // ---------------------------------------------------------------- Feature 2: importacion de presupuesto API
  const template = await apiCall("GET", "/accounting/reports/pyg-interactive/budgets/template", tenantA.token);
  check("budget_template_download_status", template.status === 200 && String(template.headers.get("content-type") || "").includes("spreadsheetml"), { status: template.status, content_type: template.headers.get("content-type"), disposition: template.headers.get("content-disposition") });
  const templateBuffer = Buffer.from(await (await fetch(`${apiUrl}/api/v1/accounting/reports/pyg-interactive/budgets/template`, { headers: { Authorization: `Bearer ${tenantA.token}` }, signal: AbortSignal.timeout(60000) })).arrayBuffer());
  const templateWorkbook = new ExcelJS.Workbook();
  await templateWorkbook.xlsx.load(templateBuffer);
  const templateSheet = templateWorkbook.getWorksheet("Presupuesto");
  const templateInstructions = templateSheet ? [2, 3].map((row) => String(templateSheet.getRow(row).getCell(1).value)) : [];
  check("budget_template_download_readback",
    templateSheet
      && templateSheet.getRow(4).values.slice(1).join(",") === "periodo,cuenta,centro_costo,sucursal,presupuesto"
      && templateInstructions[0].includes("AAAA-MM")
      && templateInstructions[0].includes("fecha de corte")
      && templateInstructions[1].includes("clases 4 a 7")
      && templateInstructions[1].includes("tercero")
      && !/Semantica|semantica|PYG firma/.test(templateInstructions.join(" ")),
    { headers: templateSheet?.getRow(4).values.slice(1), instructions: templateInstructions });

  // Presupuesto previo (conflicto de tupla) y presupuesto de ano anterior (no afectado).
  const budgetPut = async (body) => apiCall("PUT", "/accounting/reports/pyg-interactive/budgets", tenantA.token, body);
  const budgetGet = async (period) => apiCall("GET", `/accounting/reports/pyg-interactive/budgets?period=${period}`, tenantA.token);
  const seedConflict = await budgetPut({ period: PERIOD_2026_06, rows: [{ account_id: expense.id, branch_code: B1, cost_center_code: C1, amount: 777 }] });
  const seedPrior = await budgetPut({ period: PRIOR_PERIOD, rows: [{ account_id: income.id, branch_code: B1, cost_center_code: C1, amount: 300 }] });
  check("budget_seed_conflict_and_prior", seedConflict.status === 200 && seedPrior.status === 200, { conflict: seedConflict.status, prior: seedPrior.status });
  const conflictAfterFlows = await budgetGet(PERIOD_2026_06);
  check("budget_config_survives_prior_reversals", conflictAfterFlows.status === 200 && (conflictAfterFlows.body?.rows || []).some((row) => row.account_id === expense.id && row.branch_code === B1 && row.cost_center_code === C1 && Number(row.amount) === 777), { rows: conflictAfterFlows.body?.rows });

  const workbookInvalid = await buildBudgetWorkbook([
    budgetRow(PERIOD_2026_06, expense.code, 100),   // conflicto con tupla existente
    budgetRow(PERIOD_2026_07, income.code, 200),    // valida
    budgetRow(PERIOD_2026_07, income.code, 300),    // duplicada dentro del archivo
    budgetRow(PERIOD_2026_07, "0000", 10),          // cuenta inexistente
    budgetRow(PERIOD_2026_07, expense.code, -5)     // negativa
  ]);
  const validateInvalid = await apiFile("POST", "/accounting/reports/pyg-interactive/budgets/validate", tenantA.token, workbookInvalid, "presupuesto-invalido-rv.xlsx");
  const errorRowsOf = (preview) => Object.fromEntries(preview.rows.map((row) => [row.excel_row, row.errors.map((error) => error.code)]));
  check("budget_validate_row_errors", validateInvalid.status === 200 && validateInvalid.body?.valid === false && validateInvalid.body?.totals?.error_rows === 4 && validateInvalid.body?.totals?.valid_rows === 1, { status: validateInvalid.status, totals: validateInvalid.body?.totals, rows: errorRowsOf(validateInvalid.body) });
  const errByRow = errorRowsOf(validateInvalid.body);
  check("budget_validate_conflict_and_duplicate", errByRow[5]?.includes("BUDGET_TUPLE_EXISTS") && errByRow[7]?.includes("BUDGET_DUPLICATE_ROW") && errByRow[8]?.includes("BUDGET_ACCOUNT_NOT_FOUND") && errByRow[9]?.includes("BUDGET_AMOUNT_NEGATIVE") && errByRow[6]?.length === 0, { rows: errByRow });

  const importInvalid = await apiFile("POST", "/accounting/reports/pyg-interactive/budgets/import", tenantA.token, workbookInvalid, "presupuesto-invalido-rv.xlsx");
  const conflictAfter = await apiCall("GET", `/accounting/reports/pyg-interactive/budgets?period=${PERIOD_2026_06}`, tenantA.token);
  check("budget_import_invalid_rejected_422_no_save", importInvalid.status === 422 && importInvalid.body?.code === "BUDGET_IMPORT_VALIDATION_FAILED" && conflictAfter.body?.rows?.length === 1 && conflictAfter.body.rows[0].amount === 777, { status: importInvalid.status, code: importInvalid.body?.code, conflict_rows: conflictAfter.body?.rows });

  const ledgerBeforeImport = await db.ledgerEntry.count({ where: { tenant_id: tenantA.tenantId } });
  const workbookClean = await buildBudgetWorkbook([
    budgetRow(PERIOD_2026_07, income.code, 200),
    budgetRow(PERIOD_2026_07, expense.code, 150)
  ]);
  const validateClean = await apiFile("POST", "/accounting/reports/pyg-interactive/budgets/validate", tenantA.token, workbookClean, "presupuesto-rv.xlsx");
  check("budget_validate_clean_valid", validateClean.status === 200 && validateClean.body?.valid === true && validateClean.body?.periods?.join(",") === PERIOD_2026_07, { status: validateClean.status, totals: validateClean.body?.totals, periods: validateClean.body?.periods });
  const importClean = await apiFile("POST", "/accounting/reports/pyg-interactive/budgets/import", tenantA.token, workbookClean, "presupuesto-rv.xlsx");
  check("budget_import_created_201", importClean.status === 201 && importClean.body?.imported === true && importClean.body?.created_count === 2 && importClean.body?.updated_count === 0, { status: importClean.status, body: importClean.body });
  // La importacion escribe la config completa del tenant bajo el candado compartido: no
  // debe perder la fila 2026-06 que existia antes (escrita por el editor manual).
  const conflictAfterImport = await budgetGet(PERIOD_2026_06);
  check("budget_import_preserves_concurrent_config_rows", conflictAfterImport.status === 200 && conflictAfterImport.body?.rows?.length === 1 && conflictAfterImport.body.rows[0].amount === 777, { rows: conflictAfterImport.body?.rows });
  const m1AfterImport = await db.cntCabdoc.findUnique({ where: { id: m1.id }, select: { status: true, is_cancelled: true } });
  check("budget_import_preserves_reversal_state", m1AfterImport?.status === "cancelled" && m1AfterImport?.is_cancelled === true, { m1: m1AfterImport });

  const julyBudgets = await apiCall("GET", `/accounting/reports/pyg-interactive/budgets?period=${PERIOD_2026_07}`, tenantA.token);
  const julyIncome = (julyBudgets.body?.rows || []).find((row) => row.account_id === income.id);
  const julyExpense = (julyBudgets.body?.rows || []).find((row) => row.account_id === expense.id);
  check("budget_import_appended_not_overwritten", julyBudgets.body?.rows?.length === 2 && julyIncome?.amount === 200 && julyIncome?.account_code === income.code && julyExpense?.amount === 150, { rows: julyBudgets.body?.rows });

  const priorAfter = await apiCall("GET", `/accounting/reports/pyg-interactive/budgets?period=${PRIOR_PERIOD}`, tenantA.token);
  check("budget_prior_year_preserved", priorAfter.body?.rows?.length === 1 && priorAfter.body.rows[0].amount === 300, { rows: priorAfter.body?.rows });

  const ledgerAfterImport = await db.ledgerEntry.count({ where: { tenant_id: tenantA.tenantId } });
  check("budget_import_no_ledger_writes", ledgerAfterImport === ledgerBeforeImport, { before: ledgerBeforeImport, after: ledgerAfterImport });

  const importAgain = await apiFile("POST", "/accounting/reports/pyg-interactive/budgets/import", tenantA.token, workbookClean, "presupuesto-rv.xlsx");
  check("budget_import_idempotent_409", importAgain.status === 409 && importAgain.body?.code === "BUDGET_FILE_ALREADY_IMPORTED", { status: importAgain.status, code: importAgain.body?.code });

  const auditImport = await db.auditLog.findFirst({ where: { tenant_id: tenantA.tenantId, action: "IMPORT", entity: "PygBudget" } });
  check("budget_import_audit_written", Boolean(auditImport), { audit: auditImport && { entity_id: auditImport.entity_id, new_value: auditImport.new_value } });

  // Los presupuestos importados aparecen en el PYG en todos los niveles PUC y filtros.
  const julyReport = await apiCall("GET", `/accounting/reports/pyg-interactive?period=${PERIOD_2026_07}&mode=month`, tenantA.token);
  const julyIncomeNodes = findNodes(julyReport.body?.nodes || [], income.id);
  const julyIncomeParent = julyIncomeNodes.find((node) => node.code === income.code);
  const julyExpenseNodes = findNodes(julyReport.body?.nodes || [], expense.id);
  const julyExpenseParent = julyExpenseNodes.find((node) => node.code === expense.code);
  const flattenNodes = (roots) => {
    const all = [];
    const stack = [...roots];
    while (stack.length) {
      const node = stack.pop();
      all.push(node);
      if (Array.isArray(node.children)) stack.push(...node.children);
    }
    return all;
  };
  const incomeLeaf = julyIncomeParent ? flattenNodes([julyIncomeParent]).find((node) => node.dimension === "cost_center" && node.code === `${B1}|${C1}`) : null;
  check("budget_pyg_report_shows_imported_budgets", julyReport.status === 200 && julyIncomeParent?.budget === 200 && julyExpenseParent?.budget === -150 && incomeLeaf?.budget === 200, { income_budget: julyIncomeParent?.budget, expense_budget: julyExpenseParent?.budget, leaf_budget: incomeLeaf?.budget });
  const julyBranchFilter = await apiCall("GET", `/accounting/reports/pyg-interactive?period=${PERIOD_2026_07}&mode=month&branch=${B1}`, tenantA.token);
  const julyCenterFilter = await apiCall("GET", `/accounting/reports/pyg-interactive?period=${PERIOD_2026_07}&mode=month&branch=${B1}&cost_center=${C1}`, tenantA.token);
  check("budget_pyg_parent_puc_and_filters", sectionByKeyOf(julyBranchFilter.body).ingresos4?.budget === 200 && sectionByKeyOf(julyCenterFilter.body).ingresos4?.budget === 200, { branch: sectionByKeyOf(julyBranchFilter.body).ingresos4?.budget, center: sectionByKeyOf(julyCenterFilter.body).ingresos4?.budget });
  const priorReport = await apiCall("GET", `/accounting/reports/pyg-interactive?period=${PRIOR_PERIOD}&mode=month`, tenantA.token);
  check("budget_prior_year_report_preserved", sectionByKeyOf(priorReport.body).ingresos4?.budget === 300, { budget: sectionByKeyOf(priorReport.body).ingresos4?.budget });

  // Aislamiento de maestros por tenant en la validacion de importacion.
  const workbookIsolation = await buildBudgetWorkbook([budgetRow("2026-09", tenantAOnlyCode, 50)]);
  const validateIsolationA = await apiFile("POST", "/accounting/reports/pyg-interactive/budgets/validate", tenantA.token, workbookIsolation, "presupuesto-aislamiento-rv.xlsx");
  const validateIsolationB = await apiFile("POST", "/accounting/reports/pyg-interactive/budgets/validate", tenantB.token, workbookIsolation, "presupuesto-aislamiento-rv.xlsx");
  check("budget_cross_company_validate_isolated", validateIsolationA.status === 200 && validateIsolationA.body?.valid === true && validateIsolationB.status === 200 && validateIsolationB.body?.valid === false && validateIsolationB.body?.rows?.[0]?.errors?.some((error) => error.code === "BUDGET_ACCOUNT_NOT_FOUND"), { tenant_a_valid: validateIsolationA.body?.valid, tenant_b_errors: validateIsolationB.body?.rows?.[0]?.errors });

  // RBAC de importacion.
  await setRolePermissions(tenantA.tenantId, tenantA.email, "CERT_RV_READER", ["read"]);
  const rbacImport = await apiFile("POST", "/accounting/reports/pyg-interactive/budgets/import", tenantA.token, workbookClean, "presupuesto-rv.xlsx");
  const rbacTemplate = await apiCall("GET", "/accounting/reports/pyg-interactive/budgets/template", tenantA.token);
  check("budget_read_only_import_403", rbacImport.status === 403 && rbacImport.body?.code === "PERMISO_DENEGADO" && rbacTemplate.status === 200, { import_status: rbacImport.status, template_status: rbacTemplate.status });
  await setRolePermissions(tenantA.tenantId, tenantA.email, "CERT_RV_ROLE", ["read", "write"]);

  // ---------------------------------------------------------------- Fase de navegador real
  let browser = null;
  let page = null;
  let browserPhase = null;
  const browserDiagnostics = { console: consoleLogs, page_errors: pageErrors, failed_requests: failedRequests, dialogs, observed_requests: observedRequests, snapshots: [] };
  try {
    browser = await puppeteer.launch({ executablePath: browserPath, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"] });
    page = await browser.newPage();
    attachDiagnostics(page);
    await page.setViewport({ width: 1440, height: 900 });
    page.setDefaultTimeout(20000);
    page.setDefaultNavigationTimeout(60000);
    await login(page, tenantA.email, tenantA.password);

    // Importacion de presupuesto desde el navegador (descarga, validacion, confirmacion).
    browserPhase = "budget_import_panel";
    await page.goto(`${webUrl}/dashboard/contabilidad/pyg`, { waitUntil: "networkidle2" });
    await page.waitForFunction(() => document.body.innerText.includes("Matriz interactiva"), { timeout: 45000 });
    await clickButton(page, "Presupuesto PUC");
    await page.waitForFunction(() => document.body.innerText.includes("Importar presupuesto desde Excel"), { timeout: 30000 });
    check("browser_budget_import_panel_visible", true, {});

    // La plantilla se verifica sobre el archivo que Chrome escribio realmente en disco.
    const downloadsDir = path.join(evidenceDir, `downloads-${suffix}`);
    fs.mkdirSync(downloadsDir, { recursive: true });
    const cdp = await page.createCDPSession();
    let cdpClosed = false;
    const closeCdp = async () => {
      if (cdpClosed) return;
      cdpClosed = true;
      await cdp.detach().catch(() => undefined);
    };
    try {
      await cdp.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: downloadsDir, eventsEnabled: true });
      const downloadFileName = "plantilla-presupuesto-mensual.xlsx";
      const downloadedPath = path.join(downloadsDir, downloadFileName);
      const templateResponse = page.waitForResponse((response) => response.url().includes("/api/v1/accounting/reports/pyg-interactive/budgets/template") && response.status() === 200, { timeout: 30000 });
      await clickButton(page, "Descargar Excel");
      const templateDownload = await templateResponse;
      const downloadStartedAt = Date.now();
      const downloadWaitMs = 30000;
      let downloadState = null;
      while (Date.now() - downloadStartedAt <= downloadWaitMs) {
        const present = fs.existsSync(downloadedPath) && fs.statSync(downloadedPath).size > 0;
        const partial = fs.existsSync(`${downloadedPath}.crdownload`);
        downloadState = { present, partial, size: present ? fs.statSync(downloadedPath).size : 0 };
        if (present && !partial) break;
        await sleep(250);
      }
      check("browser_budget_template_download_file_on_disk", downloadState?.present === true && downloadState?.partial === false && downloadState?.size > 0, { file: relative(downloadedPath), state: downloadState, waited_ms: Date.now() - downloadStartedAt });
      const downloaded = fs.readFileSync(downloadedPath);
      const downloadedWorkbook = new ExcelJS.Workbook();
      await downloadedWorkbook.xlsx.load(downloaded);
      const downloadedSheet = downloadedWorkbook.getWorksheet("Presupuesto");
      check("browser_budget_template_download_real", String(templateDownload.headers()["content-disposition"] || "").includes(downloadFileName) && downloadedSheet && downloadedSheet.getRow(4).values.slice(1).join(",") === "periodo,cuenta,centro_costo,sucursal,presupuesto", { disposition: templateDownload.headers()["content-disposition"], headers: downloadedSheet?.getRow(4).values.slice(1), file: relative(downloadedPath), bytes: downloaded.length, sha256: sha256(downloaded) });
    } finally {
      await closeCdp();
    }

    const browserWorkbook = await buildBudgetWorkbook([budgetRow(PERIOD_2026_08, income.code, 400)]);
    const browserUploadPath = path.join(evidenceDir, `budget-import-browser-${suffix}.xlsx`);
    fs.writeFileSync(browserUploadPath, browserWorkbook);
    const fileInput = await page.waitForSelector('input[type="file"][accept=".xlsx"]', { visible: true, timeout: 30000 });
    await fileInput.uploadFile(browserUploadPath);

    const validateResponse = page.waitForResponse((response) => response.url().includes("/api/v1/accounting/reports/pyg-interactive/budgets/validate") && response.request().method() === "POST", { timeout: 30000 });
    await clickButton(page, "Validar plantilla");
    const validateBrowser = await validateResponse;
    const validateBrowserBody = await validateBrowser.json().catch(() => ({}));
    check("browser_budget_validate_preview_visible", validateBrowser.status() === 200 && validateBrowserBody.valid === true && validateBrowserBody.periods?.join(",") === PERIOD_2026_08, { status: validateBrowser.status(), totals: validateBrowserBody.totals });
    await page.waitForFunction(() => document.body.innerText.includes("Validación correcta"), { timeout: 30000 });
    await page.screenshot({ path: shot("rv-budget-validate-preview"), fullPage: false });
    screenshots.budget_validate_preview = relative(shot("rv-budget-validate-preview"));

    const importResponse = page.waitForResponse((response) => response.url().includes("/api/v1/accounting/reports/pyg-interactive/budgets/import") && response.request().method() === "POST", { timeout: 30000 });
    await clickButton(page, "Confirmar importación");
    const importBrowser = await importResponse;
    check("browser_budget_confirm_dialog_and_import", importBrowser.status() === 201 && dialogs.some((dialog) => dialog.message.includes("no sobrescribe")), { status: importBrowser.status(), dialogs: dialogs.map((dialog) => dialog.message) });
    await page.waitForFunction(() => document.body.innerText.includes("Presupuesto importado"), { timeout: 30000 });
    await page.screenshot({ path: shot("rv-budget-import-success"), fullPage: false });
    screenshots.budget_import_success = relative(shot("rv-budget-import-success"));
    check("browser_budget_success_message", true, {});

    const augustBudgets = await apiCall("GET", `/accounting/reports/pyg-interactive/budgets?period=${PERIOD_2026_08}`, tenantA.token);
    const augustIncome = (augustBudgets.body?.rows || []).find((row) => row.account_id === income.id);
    check("browser_budget_imported_period_in_store", augustBudgets.body?.rows?.length === 1 && augustIncome?.amount === 400, { rows: augustBudgets.body?.rows });
    const augustReport = await apiCall("GET", `/accounting/reports/pyg-interactive?period=${PERIOD_2026_08}&mode=month`, tenantA.token);
    check("browser_budget_imported_in_matrix", sectionByKeyOf(augustReport.body).ingresos4?.budget === 400, { budget: sectionByKeyOf(augustReport.body).ingresos4?.budget });

    // Comparativo renderizado en la matriz real: mismo periodo importado, cabecera
    // Actual/Año anterior/Presupuesto, fila de la cuenta 4 desde el DOM de NodeRows y
    // columna Presupuesto con el valor importado.
    browserPhase = "budget_matrix_comparative";
    await clickButton(page, "Matriz interactiva");
    const matrixResponsePromise = page.waitForResponse((response) => {
      if (!response.url().includes("/api/v1/accounting/reports/pyg-interactive")) return false;
      if (response.url().includes("/budgets")) return false;
      return new URL(response.url()).searchParams.get("period") === PERIOD_2026_08 && response.request().method() === "GET";
    }, { timeout: 60000 });
    await setMonthInput(page, PERIOD_2026_08);
    const matrixResponse = await matrixResponsePromise;
    const matrixBody = await matrixResponse.json().catch(() => null);
    check("browser_budget_matrix_report_response_2026_08",
      matrixResponse.status() === 200 && matrixBody?.period === PERIOD_2026_08,
      { status: matrixResponse.status(), period: matrixBody?.period });
    await page.waitForFunction((title) => document.body.innerText.includes(title), { timeout: 45000 }, `Matriz mensual · ${PERIOD_2026_08}`);
    await page.evaluate(() => {
      const button = [...document.querySelectorAll("button")].find((node) => (node.textContent || "").trim() === "Expandir todo" && !node.disabled);
      button?.click();
    });

    const matrixDom = await page.evaluate(({ accountCode, accountName, expected }) => {
      const parseRegionalAmount = (text, target) => {
        const raw = String(text ?? "").replace(/[^\d.,()-]/g, "").trim();
        if (!/\d/.test(raw)) return { ok: false, text: String(text ?? ""), raw };
        const negative = raw.startsWith("(") && raw.endsWith(")");
        const candidate = raw.replace(/[()]/g, "");
        const lastDot = candidate.lastIndexOf(".");
        const lastComma = candidate.lastIndexOf(",");
        const decimalMark = lastDot > lastComma ? "." : lastComma > lastDot ? "," : "";
        const digitsAfter = decimalMark ? candidate.length - candidate.lastIndexOf(decimalMark) - 1 : 0;
        let normalized;
        if (decimalMark && digitsAfter > 0 && digitsAfter <= 2) {
          const grouped = candidate.slice(0, candidate.lastIndexOf(decimalMark)).replace(/[.,]/g, "");
          normalized = `${grouped}.${candidate.slice(candidate.lastIndexOf(decimalMark) + 1)}`;
        } else {
          normalized = candidate.replace(/[.,]/g, "");
        }
        const value = Number(normalized) * (negative ? -1 : 1);
        return { ok: Number.isFinite(value) && value === target, text: String(text ?? ""), raw, value: Number.isFinite(value) ? value : null };
      };
      const table = [...document.querySelectorAll("table")].find((node) => [...node.querySelectorAll("thead th")].some((th) => (th.textContent || "").trim() === "Presupuesto"));
      if (!table) return { error: "matrix_table_not_found" };
      const headers = [...table.querySelectorAll("thead th")].map((th) => (th.textContent || "").trim());
      const rows = [...table.querySelectorAll("tbody tr")].map((row) => {
        const cells = [...row.querySelectorAll("td")];
        return {
          label: (cells[0]?.innerText || "").replace(/\s+/g, " ").trim().toLowerCase(),
          amount: parseRegionalAmount(cells[5]?.innerText || "", expected)
        };
      });
      const codeLike = new RegExp(`(^|\\D)${accountCode}(\\D|$)`);
      const matchesName = (row) => row.label.includes(accountName.toLowerCase());
      const matchesCode = (row) => codeLike.test(row.label);
      const class4ParentLike = new RegExp(`^${accountCode[0]}(\\D|$)`);
      const class4Candidates = rows.filter((row) => class4ParentLike.test(row.label));
      const incomeRows = rows.filter((row) => matchesName(row) && matchesCode(row));
      return {
        headers,
        row_count: rows.length,
        income: incomeRows.slice(0, 3),
        class4: class4Candidates.map((row) => ({ label: row.label, amount: row.amount })),
        class4_unambiguous: class4Candidates.length === 1
      };
    }, { accountCode: income.code, accountName: income.name, expected: 400 });

    const matrixHeaders = matrixDom.headers || [];
    check("browser_budget_matrix_headers_comparative",
      matrixHeaders.includes("Actual") && matrixHeaders.includes("Año anterior") && matrixHeaders.includes("Presupuesto"),
      { headers: matrixHeaders });
    check("browser_budget_matrix_income_row_budget_visible",
      Array.isArray(matrixDom.income) && matrixDom.income.length > 0
        && matrixDom.income.every((row) => row.label.includes(income.name.toLowerCase()))
        && matrixDom.income.some((row) => row.amount.ok),
      { expected: income.code, rows: matrixDom.income, error: matrixDom.error });
    check("browser_budget_matrix_class4_parent_budget_visible",
      matrixDom.class4_unambiguous === true && Array.isArray(matrixDom.class4) && matrixDom.class4.length === 1 && matrixDom.class4[0].amount.ok,
      { rows: matrixDom.class4, unambiguous: matrixDom.class4_unambiguous });
    // El viewport de 900px solo muestra la cabecera de la matriz y recorta el cuerpo:
    // se centra la tabla real (thead con Presupuesto) antes de capturar la evidencia.
    const matrixScrolled = await page.evaluate(() => {
      const table = [...document.querySelectorAll("table")].find((node) => [...node.querySelectorAll("thead th")].some((th) => (th.textContent || "").trim() === "Presupuesto"));
      if (!table) return false;
      table.scrollIntoView({ block: "center" });
      return true;
    });
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    check("browser_budget_matrix_comparative_scrolled_into_view", matrixScrolled === true, {});
    await page.screenshot({ path: shot("rv-budget-matrix-comparative"), fullPage: false });
    screenshots.budget_matrix_comparative = relative(shot("rv-budget-matrix-comparative"));

    // Anulacion desde el navegador: flujo elegible de M4 con motivo y confirmacion.
    browserPhase = "asientos_reversal_eligible";
    await page.goto(`${webUrl}/dashboard/contabilidad/asientos`, { waitUntil: "networkidle2" });
    await page.waitForFunction((fullNumber) => document.body.innerText.includes(fullNumber), { timeout: 45000 }, m4.full_number);
    await page.evaluate((fullNumber) => {
      const row = [...document.querySelectorAll("table tbody tr")].find((item) => (item.textContent || "").includes(fullNumber));
      const button = row?.querySelector('button[title="Anular asiento"]');
      if (!button) throw new Error("anular_button_not_found");
      button.click();
    }, m4.full_number);
    await page.waitForFunction(() => document.body.innerText.includes("Elegible para anulacion"), { timeout: 30000 });
    const modalText = await page.$eval("body", (body) => body.innerText);
    check("browser_asientos_anular_eligible_modal", modalText.includes("Documento contable manual") && modalText.includes("Motivo de anulacion") && modalText.includes("periodo contable abierto"), {});
    await page.screenshot({ path: shot("rv-asientos-reversal-eligible"), fullPage: false });
    screenshots.asientos_reversal_eligible = relative(shot("rv-asientos-reversal-eligible"));
    await page.type("textarea", "Motivo de anulacion digitado desde el navegador");
    const reverseResponse = page.waitForResponse((response) => response.url().includes("/api/v1/accounting/documents/") && response.url().endsWith("/reverse") && response.request().method() === "POST", { timeout: 30000 });
    await clickButton(page, "Confirmar anulacion");
    const reverseBrowser = await reverseResponse;
    check("browser_reversal_confirm_flow", reverseBrowser.status() === 201 && dialogs.some((dialog) => dialog.message.includes("asiento espejo")), { status: reverseBrowser.status(), dialogs: dialogs.map((dialog) => dialog.message) });
    await page.waitForFunction(() => document.body.innerText.includes("Comprobante anulado"), { timeout: 30000 });
    check("browser_asientos_reversed_message", true, {});
    // La fecha contabilizacion es date-only: debe mostrarse el mismo dia calendario
    // sin corrimiento por zona horaria, formateado exactamente como lo hace la pagina.
    const reversalBrowserBody = await reverseBrowser.json().catch(() => ({}));
    const reversalNumber = reversalBrowserBody?.reversal_number || "";
    const dateOnly = (value) => new Date(`${value}T00:00:00.000Z`).toLocaleDateString("es-CO", { timeZone: "UTC" });
    const expectedReversalDate = dateOnly(reversalDateToday);
    const expectedOpeningDate = dateOnly("2026-02-28");
    const expectedM4Date = dateOnly("2026-10-17");
    if (reversalNumber) await page.waitForFunction((fullNumber) => [...document.querySelectorAll("table tbody tr")].some((row) => {
      const link = row.querySelector('button[title="Ver registro contable"]');
      return (link?.textContent || "").trim() === fullNumber;
    }), { timeout: 45000 }, reversalNumber);
    const reversedRowDates = await page.evaluate(({ reversalNumber, m4Number, openingNumber }) => {
      const dateOf = (fullNumber) => {
        const row = [...document.querySelectorAll("table tbody tr")].find((item) => {
          const link = item.querySelector("button[title='Ver registro contable']");
          return (link?.textContent || "").trim() === fullNumber;
        });
        return row ? (row.querySelectorAll("td")[1]?.innerText || "").trim() : null;
      };
      return { reversal: dateOf(reversalNumber), m4: dateOf(m4Number), opening: dateOf(openingNumber) };
    }, { reversalNumber, m4Number: m4.full_number, openingNumber: openingDoc.full_number });
    check("browser_asientos_reversal_row_date_utc",
      Boolean(reversalNumber) && reversedRowDates.reversal === expectedReversalDate,
      { reversal_number: reversalNumber, row: reversedRowDates.reversal, expected: expectedReversalDate });
    check("browser_asientos_opening_row_date_utc",
      reversedRowDates.opening === expectedOpeningDate,
      { row: reversedRowDates.opening, expected: expectedOpeningDate, previous_day_regression: "27/2/2026" });
    check("browser_asientos_m4_row_date_utc",
      reversedRowDates.m4 === expectedM4Date,
      { row: reversedRowDates.m4, expected: expectedM4Date });
    await page.screenshot({ path: shot("rv-asientos-reversed"), fullPage: false });
    screenshots.asientos_reversed = relative(shot("rv-asientos-reversed"));
    const octoberReport = await apiCall("GET", "/accounting/reports/pyg-interactive?period=2026-10&mode=month", tenantA.token);
    check("browser_reversal_nets_in_report", sectionByKeyOf(octoberReport.body).ingresos4?.actual === 0, { ingresos4: sectionByKeyOf(octoberReport.body).ingresos4?.actual });

    // Anulacion desde el navegador: documento de modulo de origen explicado como no elegible.
    browserPhase = "asientos_reversal_ineligible";
    await page.evaluate((fullNumber) => {
      const row = [...document.querySelectorAll("table tbody tr")].find((item) => (item.textContent || "").includes(fullNumber));
      const button = row?.querySelector('button[title="Anular asiento"]');
      if (!button) throw new Error("anular_button_not_found");
      button.click();
    }, m3.full_number);
    await page.waitForFunction(() => document.body.innerText.includes("No se puede anular desde contabilidad"), { timeout: 30000 });
    const ineligibleText = await page.$eval("body", (body) => body.innerText);
    // La razon especifica del servidor nombra el modulo concreto; el texto generico
    // ("modulo de origen") no distingue el origen y se compara sin diacriticos.
    const normalizeText = (value) => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const normalizedIneligible = normalizeText(ineligibleText);
    check("browser_asientos_ineligible_origin_explained",
      ineligibleText.includes("Compras")
        && normalizedIneligible.includes("modulo de compras")
        && normalizedIneligible.includes("modulo de origen")
        && ineligibleText.includes("Solo lectura") === false,
      { reason_excerpt: ineligibleText.split("\n").map((line) => line.trim()).filter((line) => /modulo de/i.test(normalizeText(line))).slice(0, 5) });
    await page.screenshot({ path: shot("rv-asientos-reversal-ineligible"), fullPage: false });
    screenshots.asientos_reversal_ineligible = relative(shot("rv-asientos-reversal-ineligible"));
    await clickButton(page, "Entendido");

    // Navegador en rol de solo lectura: sin boton de anulacion ni panel de importacion.
    browserPhase = "read_only_browser";
    await setRolePermissions(tenantA.tenantId, tenantA.email, "CERT_RV_READER", ["read"]);
    await page.evaluate(() => localStorage.clear());
    await login(page, tenantA.email, tenantA.password);
    await page.goto(`${webUrl}/dashboard/contabilidad/asientos`, { waitUntil: "networkidle2" });
    await page.waitForFunction(() => document.body.innerText.includes("Asientos contables"), { timeout: 45000 });
    const readOnlyAsientos = await page.$eval("body", (body) => body.innerText);
    check("browser_readonly_asientos_solo_lectura", readOnlyAsientos.includes("Solo lectura") && !readOnlyAsientos.includes("Anular asiento"), {});
    await page.goto(`${webUrl}/dashboard/contabilidad/pyg`, { waitUntil: "networkidle2" });
    await page.waitForFunction(() => document.body.innerText.includes("Matriz interactiva"), { timeout: 45000 });
    await clickButton(page, "Presupuesto PUC");
    await page.waitForFunction(() => document.body.innerText.toLowerCase().includes("solo lectura"), { timeout: 30000 });
    const readOnlyBudget = await page.$eval("body", (body) => body.innerText);
    check("browser_readonly_budget_import_hidden", readOnlyBudget.includes("Consulta de solo lectura") && !readOnlyBudget.includes("Importar presupuesto desde Excel"), {});
    await page.screenshot({ path: shot("rv-budget-readonly"), fullPage: false });
    screenshots.budget_readonly = relative(shot("rv-budget-readonly"));

    check("screenshots_captured", Object.values(screenshots).every((file) => fs.existsSync(path.join(root, file)) && fs.statSync(path.join(root, file)).size > 0), { screenshots });
    browserPhase = "completed";
  } catch (error) {
    browserPhase = browserPhase || "browser_phase";
    if (page) {
      await snapshotBrowserState(page, `diag-failure-${browserPhase}`)
        .then((snapshot) => browserDiagnostics.snapshots.push(snapshot))
        .catch((snapshotError) => { browserDiagnostics.snapshot_error = String(snapshotError?.stack || snapshotError); });
    }
    error.browserDiagnostics = browserDiagnostics;
    error.failureCheckpoint = browserPhase;
    throw error;
  } finally {
    if (browser) await browser.close().catch(() => undefined);
  }

  await db.$disconnect().catch(() => undefined);
  return {
    tenant_a: tenantA.tenantId,
    tenant_b: tenantB.tenantId,
    accounts: { income: income.code, expense: expense.code, cash: cash.code },
    documents: { manual: m1.full_number, closed_period: m2.full_number, source_module: m3.full_number, browser_reversal: m4.full_number, legacy_unknown: legacyDoc.full_number },
    screenshots,
    browser_diagnostics: browserDiagnostics
  };
}

function writeEvidence(status, payload, sources) {
  const evidence = {
    version: 2,
    certification: "accounting-reversal-budget-import-browser-local",
    status: checks.some((item) => !item.ok) ? "failed" : status,
    generated_at: new Date().toISOString(),
    commit: commitHash(),
    scope: "local_only_browser_api_prisma",
    api_url: apiUrl,
    web_url: webUrl,
    browser: browserPath,
    database: "loopback",
    sources,
    prerequisites: [
      "PostgreSQL loopback migrado; DATABASE_URL exportado para este shell.",
      "API parcheada corriendo en LOCAL_API_URL (default http://127.0.0.1:3215).",
      "Web parcheada compilada corriendo en LOCAL_WEB_URL (default http://127.0.0.1:3004).",
      "Google Chrome en la ruta estandar o CHROME_BIN.",
      "Registro permite nuevos tenants aislados; ejecutar desde la raiz del repositorio.",
      "Este script no inicia ni detiene servidores ni aplica migraciones."
    ],
    checks,
    browser_diagnostics: { console: consoleLogs, page_errors: pageErrors, failed_requests: failedRequests, dialogs, observed_requests: observedRequests },
    ...payload
  };
  fs.mkdirSync(evidenceDir, { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`);
  if (evidence.status !== "passed") process.exitCode = 1;
  console.log(JSON.stringify(evidence));
}

main()
  .then((payload) => writeEvidence("passed", payload, collectSources()))
  .catch(async (error) => {
    await db.$disconnect().catch(() => undefined);
    const sources = (() => { try { return collectSources(); } catch { return {}; } })();
    const diagnostics = error?.browserDiagnostics || { console: consoleLogs, page_errors: pageErrors, failed_requests: failedRequests, dialogs, observed_requests: observedRequests, snapshots: [] };
    writeEvidence("failed", {
      error: String(error?.stack || error),
      failure_checkpoint: error?.failureCheckpoint || null,
      screenshots,
      browser_diagnostics: diagnostics
    }, sources);
  });
