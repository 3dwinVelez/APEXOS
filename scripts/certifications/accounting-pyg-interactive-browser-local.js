/* Certificacion local completa del PYG contable interactivo (Contable · PUC).
 * Chrome real, API local real, Prisma local real. Sin interceptar peticiones,
 * sin mocks de React y sin tocar entornos de QA.
 * Prerequisitos: PostgreSQL loopback migrado, API parcheada en LOCAL_API_URL
 * (default http://127.0.0.1:3215), web parcheada compilada en LOCAL_WEB_URL
 * (default http://127.0.0.1:3004), Chrome instalado y DATABASE_URL loopback
 * exportado. Ejecutar desde la raiz del repositorio.
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
const output = path.resolve(root, process.env.BROWSER_EVIDENCE_PATH || "docs/qa/evidence/accounting-pyg-interactive-20261022/browser-local.json");
const evidenceDir = path.dirname(output);
const browserPath = process.env.CHROME_BIN || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const suffix = crypto.randomBytes(5).toString("hex");
const checks = [];
const db = new PrismaClient();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const SOCIETY = "SOC-PYG";
const B1 = "SUC-NORTE";
const B2 = "SUC-SUR";
const C1 = "CC-NORTE-1";
const C2 = "CC-NORTE-2";
const C3 = "CC-SUR-1";
const PERIOD = "2026-03";
const PRIOR_PERIOD = "2025-03";
const PERIOD_JAN = "2026-01";
const PERIOD_FEB = "2026-02";

const screenshots = {};
const shot = (name) => path.join(evidenceDir, `${name}-${suffix}.png`);

const SOURCE_FILES = {
  engine: "apps/api/src/modules/accounting/pyg-interactive.js",
  budgets_service: "apps/api/src/modules/accounting/pyg-budget.js",
  routes: "apps/api/src/modules/accounting/routes.js",
  web_page: "apps/web/app/dashboard/contabilidad/pyg/page.tsx",
  web_matrix: "apps/web/components/accounting/AccountingPyg.tsx",
  web_budget_editor: "apps/web/components/accounting/AccountingPygBudget.tsx",
  web_nav: "apps/web/components/contabilidad-nav.tsx",
  web_landing: "apps/web/app/dashboard/contabilidad/page.tsx",
  api_unit: "apps/api/test/accounting-pyg-interactive.test.js",
  web_unit: "apps/web/test/accounting-pyg-interactive.test.mjs",
  script: "scripts/certifications/accounting-pyg-interactive-browser-local.js"
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

async function apiCall(method, pathname, token, body, isForm = false) {
  const headers = { ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  let payload;
  if (isForm) payload = body;
  else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const response = await fetch(`${apiUrl}/api/v1${pathname}`, { method, headers, body: payload, signal: AbortSignal.timeout(60000) });
  const text = await response.text();
  let json = null;
  try { json = JSON.parse(text); } catch { json = null; }
  return { status: response.status, body: json, text, headers: response.headers };
}

async function registerTenant(label) {
  const email = `${label}-${suffix}@apexos.local`;
  const password = `Pyg-Cert-${suffix}9!`;
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

async function resolveCostAccount(token, tenantId, cls) {
  const candidates = await db.account.findMany({
    where: { tenant_id: tenantId, code: { startsWith: cls } },
    orderBy: { code: "asc" }
  });
  if (!candidates.length) {
    const root = await db.account.findFirst({ where: { tenant_id: tenantId, code: cls } });
    if (!root) return { account: null, status: null, reason: "no_class_root", cls };
    const code = `${cls}99999`;
    const created = await apiCall("POST", "/accounting/accounts", token, {
      code, name: `Costo certificacion PYG clase ${cls}`, type: "cost", parent_code: cls, active: true, allows_tx: true
    });
    const account = [200, 201].includes(created.status) ? await db.account.findFirst({ where: { tenant_id: tenantId, code } }) : null;
    return { account, status: created.status, reason: account ? "created" : "create_failed", cls, code: created.body?.code || null };
  }
  const sorted = [...candidates].sort((a, b) => {
    const aSix = String(a.code).length === 6 ? 1 : 0;
    const bSix = String(b.code).length === 6 ? 1 : 0;
    if (aSix !== bSix) return bSix - aSix;
    const lengthDiff = String(b.code).length - String(a.code).length;
    if (lengthDiff !== 0) return lengthDiff;
    const levelDiff = (Number(b.level) || 0) - (Number(a.level) || 0);
    if (levelDiff !== 0) return levelDiff;
    return String(a.code).localeCompare(String(b.code), undefined, { numeric: true });
  });
  const target = sorted[0];
  let status = 200;
  let reason = "already_enabled";
  if (target.active !== true || target.allows_tx !== true) {
    const enabled = await apiCall("PUT", `/accounting/accounts/${target.id}`, token, {
      code: target.code,
      name: target.name,
      type: target.type,
      parent_id: target.parent_id,
      level: target.level,
      active: true,
      allows_tx: true
    });
    status = enabled.status;
    if (![200, 201].includes(enabled.status)) {
      return { account: null, status, reason: "enable_failed", cls, target: target.code, error: enabled.body?.code || enabled.body?.message || null };
    }
    reason = "enabled";
  }
  const account = await db.account.findUnique({ where: { id: target.id } });
  return { account, status, reason, cls, target: target.code };
}

async function seedOrganization(token, tenantId) {
  const units = [
    { type: "society", code: SOCIETY, name: "Sociedad PYG QA" },
    { type: "branch", code: B1, name: "Sucursal Norte QA", society_code: SOCIETY },
    { type: "branch", code: B2, name: "Sucursal Sur QA", society_code: SOCIETY },
    { type: "cost_center", code: C1, name: "Centro Norte 1 QA", society_code: SOCIETY, branch_code: B1 },
    { type: "cost_center", code: C2, name: "Centro Norte 2 QA", society_code: SOCIETY, branch_code: B1 },
    { type: "cost_center", code: C3, name: "Centro Sur 1 QA", society_code: SOCIETY, branch_code: B2 }
  ];
  for (const unit of units) {
    const result = await apiCall("POST", "/accounting/organization-tree", token, unit);
    if (![200, 201].includes(result.status)) throw new Error(`org_tree_${unit.type}_${unit.code}_failed status=${result.status} code=${result.body?.code || ""}`.trim());
  }
  check("fixture_org_tree_configured_via_local_api", true, { society: SOCIETY, branches: [B1, B2], centers: [C1, C2, C3], tenant_id: tenantId });
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

function pygReportResponse(page, timeout = 60000, period = null) {
  return page.waitForResponse((response) => {
    if (response.request().method() !== "GET") return false;
    const url = new URL(response.url());
    if (!url.pathname.endsWith("/api/v1/accounting/reports/pyg-interactive")) return false;
    return period ? url.searchParams.get("period") === period : true;
  }, { timeout });
}

function pygBudgetResponse(page, timeout = 60000) {
  return page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname.endsWith("/api/v1/accounting/reports/pyg-interactive/budgets") && response.request().method() === "PUT";
  }, { timeout });
}

function moneyText(value) {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(value);
}

async function setMonthInput(page, value) {
  await page.waitForSelector('input[type="month"]', { visible: true, timeout: 45000 });
  await page.$eval('input[type="month"]', (input, next) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    setter.call(input, next);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
}

async function main() {
  await waitForServer(apiUrl, ["/health", "/api/v1/health"]);
  await waitForServer(webUrl, ["/"]);
  if (!fs.existsSync(browserPath)) throw new Error(`PREREQUISITO: no existe Chrome en ${browserPath}`);
  const sources = collectSources();
  fs.mkdirSync(evidenceDir, { recursive: true });

  await db.$connect();
  const tenantA = await registerTenant("pyg-cert-a");
  const tenantB = await registerTenant("pyg-cert-b");

  const accountCount = await db.account.count({ where: { tenant_id: tenantA.tenantId } });
  check("fixture_standard_chart_initialized", accountCount >= 2500, { accounts: accountCount });

  await seedOrganization(tenantA.token, tenantA.tenantId);
  const party = await db.party.create({ data: { tenant_id: tenantA.tenantId, type: "customer", name: "Cliente PYG QA", active: true } });

  const income = await pickAccount(tenantA.tenantId, "4175");
  const expense = await pickAccount(tenantA.tenantId, "5105");
  const cost6Result = await resolveCostAccount(tenantA.token, tenantA.tenantId, "6");
  const cost7Result = await resolveCostAccount(tenantA.token, tenantA.tenantId, "7");
  const cost6 = cost6Result.account;
  const cost7 = cost7Result.account;
  const cash = await pickAccount(tenantA.tenantId, "110505") || await pickAccount(tenantA.tenantId, "1105");
  const class1 = await db.account.findFirst({ where: { tenant_id: tenantA.tenantId, code: { startsWith: "1105" }, active: true, allows_tx: true }, orderBy: { code: "asc" } });
  const group4 = await db.account.findFirst({ where: { tenant_id: tenantA.tenantId, code: "4" } });
  check("fixture_accounts_resolved", Boolean(income && expense && cost6 && cost7 && cash && class1 && group4), {
    income: income?.code, expense: expense?.code, cost6: cost6?.code, cost7: cost7?.code, cash: cash?.code, class1: class1?.code, group4: group4?.code
  });
  check("fixture_cost_accounts_enabled_via_api", [200, 201].includes(cost6Result.status) && [200, 201].includes(cost7Result.status), {
    cost6: { status: cost6Result.status, reason: cost6Result.reason, code: cost6Result.target || cost6Result.code || null },
    cost7: { status: cost7Result.status, reason: cost7Result.reason, code: cost7Result.target || cost7Result.code || null }
  });
  check("fixture_cost_accounts_materialized", Boolean(cost6 && cost7 && cost6.active === true && cost6.allows_tx === true && cost7.active === true && cost7.allows_tx === true && String(cost6.code).startsWith("6") && String(cost7.code).startsWith("7")), {
    cost6: { code: cost6?.code, active: cost6?.active, allows_tx: cost6?.allows_tx, reason: cost6Result.reason },
    cost7: { code: cost7?.code, active: cost7?.active, allows_tx: cost7?.allows_tx, reason: cost7Result.reason }
  });

  const childResult = await apiCall("POST", "/accounting/accounts", tenantA.token, { code: `${income.code}CERT`, name: "Ingreso hijo certificacion PYG", type: "income", parent_code: income.code, active: true, allows_tx: true });
  if (![200, 201].includes(childResult.status)) throw new Error(`child_account_failed status=${childResult.status} code=${childResult.body?.code || ""}`.trim());
  const childAccount = await db.account.findFirst({ where: { tenant_id: tenantA.tenantId, code: `${income.code}CERT` } });
  check("fixture_child_account_created_via_api", Boolean(childAccount?.parent_id === income.id), { child: childAccount?.code, parent: income.code });

  const docIncome = await postDocument(tenantA.token, {
    posting_date: "2026-03-10", header_text: "Ingreso certificacion PYG",
    lines: [
      docLine(income.code, B1, C1, "credit", 1500, party.id, "Ingreso servicio"),
      docLine(cash.code, B1, C1, "debit", 1500, party.id, "Caja contrapartida")
    ]
  });
  const incomeEntry = docIncome.lines.find((line) => line.account_code === income.code);
  await postDocument(tenantA.token, {
    posting_date: "2026-03-11", header_text: "Devolucion ingreso certificacion PYG",
    lines: [
      docLine(income.code, B1, C1, "debit", 400, party.id, "Devolucion ingreso"),
      docLine(cash.code, B1, C1, "credit", 400, party.id, "Caja contrapartida")
    ]
  });
  await postDocument(tenantA.token, {
    posting_date: "2026-03-12", header_text: "Gasto certificacion PYG",
    lines: [
      docLine(expense.code, B1, C1, "debit", 800, party.id, "Gasto administrativo"),
      docLine(cash.code, B1, C1, "credit", 800, party.id, "Caja contrapartida")
    ]
  });
  await postDocument(tenantA.token, {
    posting_date: "2026-03-13", header_text: "Costo clase 6 certificacion PYG",
    lines: [
      docLine(cost6.code, B1, C2, "debit", 200, party.id, "Costo de ventas"),
      docLine(cash.code, B1, C2, "credit", 200, party.id, "Caja contrapartida")
    ]
  });
  await postDocument(tenantA.token, {
    posting_date: "2026-03-14", header_text: "Costo clase 7 certificacion PYG",
    lines: [
      docLine(cost7.code, B2, C3, "debit", 100, party.id, "Costo de produccion"),
      docLine(cash.code, B2, C3, "credit", 100, party.id, "Caja contrapartida")
    ]
  });
  await postDocument(tenantA.token, {
    posting_date: "2026-03-15", header_text: "Ingreso hijo certificacion PYG",
    lines: [
      docLine(childAccount.code, B1, C1, "credit", 250, party.id, "Ingreso hijo"),
      docLine(cash.code, B1, C1, "debit", 250, party.id, "Caja contrapartida")
    ]
  });
  await postDocument(tenantA.token, {
    posting_date: `${PRIOR_PERIOD}-10`, header_text: "Ingreso ano anterior certificacion PYG",
    lines: [
      docLine(income.code, B1, C1, "credit", 500, party.id, "Ingreso ano anterior"),
      docLine(cash.code, B1, C1, "debit", 500, party.id, "Caja contrapartida")
    ]
  });
  await postDocument(tenantA.token, {
    posting_date: `${PERIOD_JAN}-15`, header_text: "Ingreso enero certificacion PYG",
    lines: [
      docLine(income.code, B1, C1, "credit", 300, party.id, "Ingreso enero"),
      docLine(cash.code, B1, C1, "debit", 300, party.id, "Caja contrapartida")
    ]
  });
  await postDocument(tenantA.token, {
    posting_date: `${PERIOD_FEB}-15`, header_text: "Ingreso febrero certificacion PYG",
    lines: [
      docLine(income.code, B1, C1, "credit", 300, party.id, "Ingreso febrero"),
      docLine(cash.code, B1, C1, "debit", 300, party.id, "Caja contrapartida")
    ]
  });

  const journal = await apiCall("POST", "/accounting/journal", tenantA.token, {
    description: "Asiento sin comprobante certificacion PYG", date: "2026-03-15",
    entries: [{ account: income.code, credit: 300 }, { account: expense.code, debit: 300 }]
  });
  check("fixture_journal_orphans_created_via_api", journal.status === 201 && journal.body?.length === 2, { status: journal.status, entries: journal.body?.length });

  await db.cntCuedoc.create({
    data: {
      tenant_id: tenantA.tenantId, cabdoc_id: docIncome.id, line_no: 99, account_id: income.id, account_code: income.code,
      branch_code: B1, cost_center_code: C2, party_id: party.id, movement: "credit", debit: 0, credit: 1500,
      description: "Metadata ambigua certificacion PYG", ledger_entry_id: incomeEntry.ledger_entry_id
    }
  });

  const unposted = await db.cntCabdoc.create({
    data: {
      tenant_id: tenantA.tenantId, document_type: "OP", document_number: 910001, full_number: `OP-910001-${suffix}`, posting_date: new Date("2026-03-20T00:00:00.000Z"),
      header_text: "Liquidacion operativa sin contabilizar certificacion PYG", society_code: SOCIETY, total_debit: 999, total_credit: 999
    }
  });
  await db.cntCuedoc.create({
    data: {
      tenant_id: tenantA.tenantId, cabdoc_id: unposted.id, line_no: 1, account_id: income.id, account_code: income.code,
      branch_code: B1, cost_center_code: C1, party_id: null, movement: "credit", debit: 0, credit: 999,
      description: "Sin ledger_entry_id certificacion PYG", ledger_entry_id: null
    }
  });
  check("fixture_unposted_operational_record_ready", true, { cabdoc_id: unposted.id });

  const budgetPut = async (body) => apiCall("PUT", "/accounting/reports/pyg-interactive/budgets", tenantA.token, body);
  const happy = await budgetPut({
    period: PERIOD,
    rows: [
      { account_id: income.id, branch_code: B1, cost_center_code: C1, amount: 2000 },
      { account_id: expense.id, branch_code: B1, cost_center_code: C1, amount: 1000 },
      { account_id: cost7.id, branch_code: B2, cost_center_code: C3, amount: 50 },
      { account_id: income.id, branch_code: B1, cost_center_code: C2, amount: 75 }
    ]
  });
  check("budget_put_happy_path", happy.status === 200 && happy.body?.saved_count === 4, { status: happy.status, body: happy.body });
  await budgetPut({ period: PERIOD_JAN, rows: [{ account_id: income.id, branch_code: B1, cost_center_code: C1, amount: 100 }] });
  await budgetPut({ period: PERIOD_FEB, rows: [{ account_id: income.id, branch_code: B1, cost_center_code: C1, amount: 200 }] });

  const budgetList = await apiCall("GET", "/accounting/reports/pyg-interactive/budgets?period=" + PERIOD, tenantA.token);
  check("budget_get_returns_saved_rows", budgetList.status === 200 && budgetList.body?.rows?.length === 4 && budgetList.body.rows.every((row) => row.account_code && row.amount !== undefined), { status: budgetList.status, rows: budgetList.body?.rows?.length });

  const expectBudgetError = async (name, body, status, code) => {
    const result = await budgetPut(body);
    check(name, result.status === status && result.body?.code === code, { status: result.status, code: result.body?.code, expected: code });
  };
  await expectBudgetError("budget_negative_amount_rejected", { period: PERIOD, rows: [{ account_id: income.id, branch_code: B1, cost_center_code: C1, amount: -5 }] }, 422, "BUDGET_AMOUNT_NEGATIVE");
  await expectBudgetError("budget_duplicate_tuple_rejected", {
    period: PERIOD,
    rows: [
      { account_id: income.id, branch_code: B1, cost_center_code: C1, amount: 10 },
      { account_id: income.id, branch_code: B1, cost_center_code: C1, amount: 20 }
    ]
  }, 422, "BUDGET_DUPLICATE_ROW");
  await expectBudgetError("budget_non_puc_account_rejected", { period: PERIOD, rows: [{ account_id: class1.id, branch_code: B1, cost_center_code: C1, amount: 10 }] }, 422, "BUDGET_ACCOUNT_NOT_PUC_4_7");
  await expectBudgetError("budget_non_transactional_account_rejected", { period: PERIOD, rows: [{ account_id: group4.id, branch_code: B1, cost_center_code: C1, amount: 10 }] }, 422, "BUDGET_ACCOUNT_NOT_TRANSACTIONAL");
  await expectBudgetError("budget_cross_branch_center_rejected", { period: PERIOD, rows: [{ account_id: income.id, branch_code: B1, cost_center_code: C3, amount: 10 }] }, 422, "BUDGET_CENTER_BRANCH_MISMATCH");
  await expectBudgetError("budget_invalid_period_rejected", { period: "bad", rows: [{ account_id: income.id, branch_code: B1, cost_center_code: C1, amount: 10 }] }, 400, "INVALID_PERIOD");
  await expectBudgetError("budget_empty_rows_rejected", { period: PERIOD, rows: [] }, 400, "BUDGET_ROWS_REQUIRED");

  const foreignIncome = await pickAccount(tenantB.tenantId, "4175");
  await expectBudgetError("budget_foreign_tenant_account_rejected", { period: PERIOD, rows: [{ account_id: foreignIncome.id, branch_code: B1, cost_center_code: C1, amount: 10 }] }, 422, "BUDGET_ACCOUNT_NOT_FOUND");

  await db.account.update({ where: { id: income.id }, data: { active: false } });
  await expectBudgetError("budget_inactive_account_rejected", { period: PERIOD, rows: [{ account_id: income.id, branch_code: B1, cost_center_code: C1, amount: 10 }] }, 422, "BUDGET_ACCOUNT_INACTIVE");
  await db.account.update({ where: { id: income.id }, data: { active: true } });

  const afterInvalid = await apiCall("GET", "/accounting/reports/pyg-interactive/budgets?period=" + PERIOD, tenantA.token);
  check("budget_invalid_writes_rolled_back", afterInvalid.status === 200 && afterInvalid.body?.rows?.length === 4, { rows: afterInvalid.body?.rows?.length });
  const janRows = await apiCall("GET", "/accounting/reports/pyg-interactive/budgets?period=" + PERIOD_JAN, tenantA.token);
  const febRows = await apiCall("GET", "/accounting/reports/pyg-interactive/budgets?period=" + PERIOD_FEB, tenantA.token);
  check("budget_other_periods_preserved", janRows.body?.rows?.length === 1 && febRows.body?.rows?.length === 1, { jan: janRows.body?.rows?.length, feb: febRows.body?.rows?.length });

  const auditCount = await db.auditLog.count({ where: { tenant_id: tenantA.tenantId, module: "accounting", entity: "PygBudget" } });
  check("budget_audit_log_written", auditCount === 3, { audit: auditCount });

  const report = await apiCall("GET", `/accounting/reports/pyg-interactive?period=${PERIOD}&mode=month`, tenantA.token);
  check("report_month_status_and_no_store", report.status === 200 && String(report.headers.get("cache-control") || "").includes("no-store"), { status: report.status, cache_control: report.headers.get("cache-control") });
  const r = report.body;
  check("report_metadata_source_ledger", r.metadata?.source === "ledger" && r.metadata?.amount_convention === "signed_net_contribution" && r.metadata?.prior_year_only === true, { metadata: r.metadata });
  const sectionByKey = Object.fromEntries(r.sections.map((section) => [section.key, section]));
  check("report_sections_signed_math", sectionByKey.ingresos4?.actual === 1650 && sectionByKey.gastos5?.actual === -1100 && sectionByKey.costos6?.actual === -200 && sectionByKey.costosproduccion7?.actual === -100, {
    ingresos: sectionByKey.ingresos4?.actual, gastos: sectionByKey.gastos5?.actual, costos6: sectionByKey.costos6?.actual, costos7: sectionByKey.costosproduccion7?.actual
  });
  check("report_sections_prior_math", sectionByKey.ingresos4?.prior === 500 && sectionByKey.gastos5?.prior === 0 && sectionByKey.costos6?.prior === 0 && sectionByKey.costosproduccion7?.prior === 0, {
    ingresos: sectionByKey.ingresos4?.prior, gastos: sectionByKey.gastos5?.prior, costos6: sectionByKey.costos6?.prior, costos7: sectionByKey.costosproduccion7?.prior
  });
  check("report_net_consolidated", r.net?.actual === 250 && r.net?.prior === 500 && r.net?.variation_pct === -50, { net: r.net?.actual, prior: r.net?.prior, variation: r.net?.variation_pct });
  check("report_month_budget_signed_totals", sectionByKey.ingresos4?.budget === 2075 && r.net?.budget === 1025, { income_budget: sectionByKey.ingresos4?.budget, net_budget: r.net?.budget });
  check("report_prior_year_range", r.prior_range?.periods?.join(",") === PRIOR_PERIOD, { prior: r.prior_range?.periods });
  check("report_linkage_counts", r.linkage?.ledger_entries === 9 && r.linkage?.orphan === 2 && r.linkage?.ambiguous === 1 && r.linkage?.linked === 6, { linkage: r.linkage });
  check("report_linkage_amounts", r.linkage?.ambiguous_amount === 1500 && r.linkage?.orphan_amount === 0, { ambiguous: r.linkage?.ambiguous_amount, orphan: r.linkage?.orphan_amount });
  check("report_linkage_warnings", r.warnings?.some((warning) => warning.code === "LEDGER_WITHOUT_METADATA") && r.warnings?.some((warning) => warning.code === "LEDGER_AMBIGUOUS_METADATA"), { warnings: r.warnings?.map((warning) => warning.code) });

  const incomeNodes = findNodes(r.nodes, income.id);
  const incomeParent = incomeNodes.find((node) => node.code === income.code);
  check("report_income_node_actual_with_child_and_own_posting", incomeParent?.actual === 1650 && incomeParent?.budget === 2075, { incomeNodes: incomeNodes.map((node) => ({ code: node.code, actual: node.actual, budget: node.budget, level: node.level })) });

  const expenseMainNodes = findNodes(r.nodes, expense.id);
  const expenseParent = expenseMainNodes.find((node) => node.code === expense.code);
  const incomeUnassigned = (incomeParent?.children || []).find((node) => node.dimension === "branch" && node.code === "" && node.name === "Sin sucursal");
  const expenseUnassigned = (expenseParent?.children || []).find((node) => node.dimension === "branch" && node.code === "" && node.name === "Sin sucursal");
  check("report_default_puc_unassigned_income", incomeUnassigned?.actual === 1800, { branches: (incomeParent?.children || []).filter((node) => node.dimension === "branch").map((node) => ({ name: node.name, actual: node.actual })) });
  check("report_default_puc_unassigned_expense", expenseUnassigned?.actual === -300, { branches: (expenseParent?.children || []).filter((node) => node.dimension === "branch").map((node) => ({ name: node.name, actual: node.actual })) });

  const branchFirst = await apiCall("GET", `/accounting/reports/pyg-interactive?period=${PERIOD}&mode=month&dimensions=branch,puc,cost_center`, tenantA.token);
  const unassignedBranch = branchFirst.body?.nodes?.find((node) => node.dimension === "branch" && node.name === "Sin sucursal");
  check("report_unassigned_branch_node_present", unassignedBranch?.actual === 1500, { branches: branchFirst.body?.nodes?.filter((node) => node.dimension === "branch").map((node) => ({ name: node.name, actual: node.actual })) });

  const incomeBranchNorte = (incomeParent?.children || []).find((node) => node.dimension === "branch" && node.code === B1);
  const budgetIncome = (incomeBranchNorte?.children || []).find((node) => node.dimension === "cost_center" && node.code === `${B1}|${C1}` && node.budget === 2000 && node.actual === -400);
  const budgetOnly = (incomeBranchNorte?.children || []).find((node) => node.dimension === "cost_center" && node.code === `${B1}|${C2}` && node.budget === 75 && node.actual === 0);
  check("report_budget_in_same_node", Boolean(budgetIncome), { branches: (incomeParent?.children || []).filter((node) => node.dimension === "branch").map((node) => ({ code: node.code, children: node.children.map((child) => ({ code: child.code, budget: child.budget, actual: child.actual })) })) });
  check("report_budget_only_node_visible", Boolean(budgetOnly), { budget_only: Boolean(budgetOnly) });
  const cost7Nodes = findNodes(r.nodes, cost7.id);
  check("report_cost7_budget_variance_signed", cost7Nodes.some((node) => node.code === cost7.code && node.budget === -50 && node.budget_variance === -50 && Math.round(node.budget_execution_pct) === 200), { cost7: cost7Nodes.map((node) => ({ code: node.code, budget: node.budget, variance: node.budget_variance, execution: node.budget_execution_pct })) });

  const rawMarchEntries = await db.ledgerEntry.findMany({
    where: {
      tenant_id: tenantA.tenantId,
      account_id: { in: [income.id, childAccount.id, expense.id, cost6.id, cost7.id] },
      date: { gte: new Date("2026-03-01T00:00:00.000Z"), lt: new Date("2026-04-01T00:00:00.000Z") }
    },
    select: { account_id: true, debit: true, credit: true }
  });
  const rawSignedCents = (entries, ids) => entries
    .filter((entry) => ids.includes(entry.account_id))
    .reduce((sum, entry) => sum + (Math.round(entry.credit * 100) - Math.round(entry.debit * 100)), 0);
  const rawIncome = rawSignedCents(rawMarchEntries, [income.id, childAccount.id]);
  const rawExpense = rawSignedCents(rawMarchEntries, [expense.id]);
  const rawCost6 = rawSignedCents(rawMarchEntries, [cost6.id]);
  const rawCost7 = rawSignedCents(rawMarchEntries, [cost7.id]);
  check("raw_ledger_march_entry_count", rawMarchEntries.length === 8, { entries: rawMarchEntries.length });
  check("raw_ledger_march_income_aggregate", rawIncome === 165000, { income: rawIncome / 100 });
  check("raw_ledger_march_net_aggregate", rawIncome + rawExpense + rawCost6 + rawCost7 === 25000, { net: (rawIncome + rawExpense + rawCost6 + rawCost7) / 100, income: rawIncome / 100, expense: rawExpense / 100, cost6: rawCost6 / 100, cost7: rawCost7 / 100 });

  const beforeUnposted = r.net.actual;
  const reportAgain = await apiCall("GET", `/accounting/reports/pyg-interactive?period=${PERIOD}&mode=month`, tenantA.token);
  check("unposted_operational_record_has_no_effect", reportAgain.body.net.actual === beforeUnposted && reportAgain.body.net.actual === 250, { before: beforeUnposted, after: reportAgain.body.net.actual });

  await db.account.update({ where: { id: expense.id }, data: { active: false } });
  const inactiveReport = await apiCall("GET", `/accounting/reports/pyg-interactive?period=${PERIOD}&mode=month`, tenantA.token);
  const inactiveExpenseNodes = findNodes(inactiveReport.body.nodes, expense.id);
  check("inactive_account_with_movement_included_and_flagged", inactiveExpenseNodes.some((node) => node.code === expense.code && node.inactive === true && node.actual === -1100), { nodes: inactiveExpenseNodes.map((node) => ({ code: node.code, inactive: node.inactive, actual: node.actual })) });
  await db.account.update({ where: { id: expense.id }, data: { active: true } });

  const aprilOriginal = await postDocument(tenantA.token, {
    posting_date: "2026-04-10", header_text: "Ingreso abril certificacion reverso PYG",
    lines: [
      docLine(income.code, B1, C1, "credit", 100, party.id, "Ingreso abril original"),
      docLine(cash.code, B1, C1, "debit", 100, party.id, "Caja contrapartida")
    ]
  });
  const reversalCabdoc = await db.cntCabdoc.create({
    data: {
      tenant_id: tenantA.tenantId, document_type: "NC", document_number: 920001, full_number: `NC-920001-${suffix}`,
      posting_date: new Date("2026-04-11T00:00:00.000Z"), header_text: "Reverso ingreso abril certificacion PYG",
      society_code: SOCIETY, referenced_document_id: aprilOriginal.id, is_reversal: true,
      total_debit: 100, total_credit: 100
    }
  });
  const reversalIncomeEntry = await db.ledgerEntry.create({
    data: { tenant_id: tenantA.tenantId, account_id: income.id, date: new Date("2026-04-11T00:00:00.000Z"), debit: 100, credit: 0, balance: 0, description: "Reverso ingreso abril certificacion PYG", period: "2026-04" }
  });
  const reversalCashEntry = await db.ledgerEntry.create({
    data: { tenant_id: tenantA.tenantId, account_id: cash.id, date: new Date("2026-04-11T00:00:00.000Z"), debit: 0, credit: 100, balance: 0, description: "Reverso caja abril certificacion PYG", period: "2026-04" }
  });
  await db.cntCuedoc.createMany({
    data: [
      { tenant_id: tenantA.tenantId, cabdoc_id: reversalCabdoc.id, line_no: 1, account_id: income.id, account_code: income.code, branch_code: B1, cost_center_code: C1, party_id: party.id, movement: "debit", debit: 100, credit: 0, description: "Reverso ingreso abril original", ledger_entry_id: reversalIncomeEntry.id },
      { tenant_id: tenantA.tenantId, cabdoc_id: reversalCabdoc.id, line_no: 2, account_id: cash.id, account_code: cash.code, branch_code: B1, cost_center_code: C1, party_id: party.id, movement: "credit", debit: 0, credit: 100, description: "Reverso caja abril contrapartida", ledger_entry_id: reversalCashEntry.id }
    ]
  });
  await db.cntCabdoc.update({ where: { id: aprilOriginal.id }, data: { is_cancelled: true, cancelled_by: reversalCabdoc.id, cancelled_at: new Date("2026-04-11T00:00:00.000Z") } });
  const aprilRaw = await db.ledgerEntry.findMany({
    where: { tenant_id: tenantA.tenantId, account_id: income.id, date: { gte: new Date("2026-04-01T00:00:00.000Z"), lt: new Date("2026-05-01T00:00:00.000Z") } },
    select: { debit: true, credit: true }
  });
  const aprilSigned = aprilRaw.map((entry) => Math.round(entry.credit * 100) - Math.round(entry.debit * 100));
  check("reversal_preserves_original_and_cancellation", aprilRaw.length === 2 && aprilSigned.includes(10000) && aprilSigned.includes(-10000), { signed_cents: aprilSigned });
  const reversalFlags = await db.cntCabdoc.findMany({ where: { tenant_id: tenantA.tenantId, id: { in: [aprilOriginal.id, reversalCabdoc.id] } }, select: { id: true, is_reversal: true, is_cancelled: true, referenced_document_id: true } });
  const originalFlag = reversalFlags.find((row) => row.id === aprilOriginal.id);
  const reversalFlag = reversalFlags.find((row) => row.id === reversalCabdoc.id);
  check("reversal_header_flags_persisted", originalFlag?.is_cancelled === true && reversalFlag?.is_reversal === true && reversalFlag?.referenced_document_id === aprilOriginal.id, { flags: reversalFlags });
  const aprilReport = await apiCall("GET", "/accounting/reports/pyg-interactive?period=2026-04&mode=month", tenantA.token);
  const aprilIncome = sectionByKeyOf(aprilReport.body).ingresos4;
  check("reversal_report_net_zero", aprilReport.status === 200 && aprilIncome?.actual === 0 && aprilReport.body?.net?.actual === 0, { income: aprilIncome?.actual, net: aprilReport.body?.net?.actual });

  const ytd = await apiCall("GET", `/accounting/reports/pyg-interactive?period=${PERIOD}&mode=ytd`, tenantA.token);
  check("report_ytd_ranges", ytd.body.range?.periods?.join(",") === `${PERIOD_JAN},${PERIOD_FEB},${PERIOD}` && ytd.body.prior_range?.periods?.join(",") === "2025-01,2025-02,2025-03", { periods: ytd.body.range?.periods, prior: ytd.body.prior_range?.periods });
  check("report_ytd_income_sums", sectionByKeyOf(ytd.body).ingresos4.actual === 2250, { sections: ytd.body.sections });
  check("report_ytd_net_sums", ytd.body.net?.actual === 850 && ytd.body.net?.prior === 500 && ytd.body.net?.variation_pct === 70, { net: ytd.body.net });
  check("report_ytd_budget_sums", sectionByKeyOf(ytd.body).ingresos4.budget === 2375 && ytd.body.net?.budget === 1325, { income_budget: sectionByKeyOf(ytd.body).ingresos4.budget, net_budget: ytd.body.net?.budget });
  check("report_month_budget_coverage_full", r.budget_coverage === "full" && r.budget_periods_found?.join(",") === PERIOD, { coverage: r.budget_coverage, found: r.budget_periods_found });
  const ytdFeb = await apiCall("GET", `/accounting/reports/pyg-interactive?period=${PERIOD_FEB}&mode=ytd`, tenantA.token);
  const ytdFebIncome = findNodes(ytdFeb.body.nodes, income.id);
  check("report_ytd_budget_sums_monthly_rows", ytdFebIncome.some((node) => node.budget === 300 && node.actual === 600), { nodes: ytdFebIncome.map((node) => ({ budget: node.budget, actual: node.actual })) });
  const ytdIncomeNodes = findNodes(ytd.body.nodes, income.id);
  const ytdExpenseNodes = findNodes(ytd.body.nodes, expense.id);
  check("report_ytd_budget_coverage_partial_per_leaf", ytd.body.budget_coverage === "partial" && ytd.body.budget_periods_found?.join(",") === `${PERIOD_JAN},${PERIOD_FEB},${PERIOD}` && ytd.body.warnings?.some((warning) => warning.code === "BUDGET_PARTIAL_PERIOD_COVERAGE"), { coverage: ytd.body.budget_coverage, found: ytd.body.budget_periods_found, warnings: ytd.body.warnings?.map((warning) => warning.code) });
  check("report_ytd_budget_month_sets_per_node", ytdIncomeNodes.some((node) => node.budget_months_found?.length === 3 && node.budget_coverage === "partial") && ytdExpenseNodes.some((node) => node.budget_months_found?.length === 1 && node.budget_months_found?.[0] === PERIOD && node.budget_status === "partial" && node.budget_coverage === "partial"), { income: ytdIncomeNodes.map((node) => ({ months: node.budget_months_found, coverage: node.budget_coverage })), expense: ytdExpenseNodes.map((node) => ({ months: node.budget_months_found, coverage: node.budget_coverage, status: node.budget_status })) });
  const ytdApr = await apiCall("GET", `/accounting/reports/pyg-interactive?period=2026-04&mode=ytd`, tenantA.token);
  check("report_ytd_budget_coverage_partial_warns", ytdApr.body.budget_coverage === "partial" && ytdApr.body.warnings?.some((warning) => warning.code === "BUDGET_PARTIAL_PERIOD_COVERAGE"), { coverage: ytdApr.body.budget_coverage, warnings: ytdApr.body.warnings?.map((warning) => warning.code) });
  const monthNoBudget = await apiCall("GET", `/accounting/reports/pyg-interactive?period=2026-05&mode=month`, tenantA.token);
  check("report_month_without_budgets_coverage_none", monthNoBudget.body.budget_coverage === "none" && monthNoBudget.body.budget_periods_found?.length === 0, { coverage: monthNoBudget.body.budget_coverage });

  const branchFilter = await apiCall("GET", `/accounting/reports/pyg-interactive?period=${PERIOD}&mode=month&branch=${B2}`, tenantA.token);
  check("report_branch_filter_isolates", branchFilter.body.net.actual === -100, { net: branchFilter.body.net.actual });
  const centerFilter = await apiCall("GET", `/accounting/reports/pyg-interactive?period=${PERIOD}&mode=month&branch=${B2}&cost_center=${C3}`, tenantA.token);
  check("report_center_filter_isolates", centerFilter.body.net.actual === -100 && centerFilter.body.filters?.cost_center === C3, { net: centerFilter.body.net.actual });

  await expectBudgetError("report_invalid_period_rejected", { period: "bad", rows: [] }, 400, "INVALID_PERIOD");
  const badDims = await apiCall("GET", `/accounting/reports/pyg-interactive?period=${PERIOD}&dimensions=branch,cost_center`, tenantA.token);
  check("report_dimensions_without_puc_rejected", badDims.status === 400 && badDims.body?.code === "INVALID_DIMENSIONS", { status: badDims.status, code: badDims.body?.code });
  const badMode = await apiCall("GET", `/accounting/reports/pyg-interactive?period=${PERIOD}&mode=quarter`, tenantA.token);
  check("report_invalid_mode_rejected", badMode.status === 400 && badMode.body?.code === "INVALID_MODE", { status: badMode.status, code: badMode.body?.code });

  const tenantBReport = await apiCall("GET", `/accounting/reports/pyg-interactive?period=${PERIOD}`, tenantB.token);
  check("cross_company_report_isolated", tenantBReport.status === 200 && tenantBReport.body.is_empty === true && tenantBReport.body.nodes?.length === 0 && tenantBReport.body.net?.actual === 0, { is_empty: tenantBReport.body.is_empty, nodes: tenantBReport.body.nodes?.length });
  const tenantBBudgets = await apiCall("GET", "/accounting/reports/pyg-interactive/budgets?period=" + PERIOD, tenantB.token);
  check("cross_company_budgets_isolated", tenantBBudgets.body?.rows?.length === 0, { rows: tenantBBudgets.body?.rows?.length });
  const anon = await apiCall("GET", `/accounting/reports/pyg-interactive?period=${PERIOD}`);
  check("anonymous_report_denied", anon.status === 401, { status: anon.status });

  await setRolePermissions(tenantA.tenantId, tenantA.email, "CERT_PYG_READER", ["read"]);
  const readerBudget = await budgetPut({ period: PERIOD, rows: [{ account_id: income.id, branch_code: B1, cost_center_code: C1, amount: 1 }] });
  check("read_only_role_cannot_write_budgets", readerBudget.status === 403 && readerBudget.body?.code === "PERMISO_DENEGADO", { status: readerBudget.status, code: readerBudget.body?.code });
  const readerReport = await apiCall("GET", `/accounting/reports/pyg-interactive?period=${PERIOD}`, tenantA.token);
  check("read_only_role_still_reads_report", readerReport.status === 200, { status: readerReport.status });
  await setRolePermissions(tenantA.tenantId, tenantA.email, "CERT_PYG_ROLE", ["read", "write"]);

  // ---- Fase de navegador real ----
  let browser = null;
  let page = null;
  try {
    browser = await puppeteer.launch({ executablePath: browserPath, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"] });
    page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    page.setDefaultTimeout(20000);
    page.setDefaultNavigationTimeout(60000);
    await login(page, tenantA.email, tenantA.password);

    await page.goto(`${webUrl}/dashboard/contabilidad/pyg`, { waitUntil: "networkidle2" });
    const firstReport = pygReportResponse(page, 60000, PERIOD);
    await setMonthInput(page, PERIOD);
    const firstResponse = await firstReport;
    check("browser_report_served_no_store", firstResponse.status() === 200 && String(firstResponse.headers()["cache-control"] || "").includes("no-store"), { status: firstResponse.status(), cache_control: firstResponse.headers()["cache-control"] });

    await page.waitForFunction(() => document.body.innerText.includes("PYG Contable · PUC") && document.body.innerText.includes("Matriz interactiva") && document.body.innerText.includes("Utilidad neta"), { timeout: 45000 });
    await clickButton(page, "Expandir todo");
    await page.waitForFunction((code) => document.body.innerText.includes(code), { timeout: 30000 }, income.code);
    const pageText = await page.$eval("body", (body) => body.innerText);
    check("browser_default_contable_view", pageText.includes("Contable · PUC") && pageText.includes("Presupuesto PUC") && pageText.includes("Sin sucursal") && pageText.includes("Sin centro de costo"), {});
    check("browser_income_node_visible", pageText.includes(income.code), { code: income.code });
    check("browser_net_kpi_formatted", pageText.includes(moneyText(250)), { expected: moneyText(250) });
    await page.screenshot({ path: shot("pyg-matrix-desktop"), fullPage: false });
    screenshots.matrix_desktop = relative(shot("pyg-matrix-desktop"));

    const grouped = pygReportResponse(page, 60000, PERIOD);
    await clickButton(page, "Sucursal · PUC · Centro");
    await grouped;
    await page.waitForFunction(() => document.body.innerText.includes("Agrupación Sucursal → Cuenta PUC → Centro de costo"), { timeout: 30000 });
    check("browser_grouping_preset_applied", true, { preset: "branch,puc,cost_center" });

    await page.waitForFunction(() => [...document.querySelectorAll('button[aria-label^="Expandir"]')].length > 0, { timeout: 20000 });
    const rowsBeforeExpand = await page.$$eval("table tbody tr", (rows) => rows.length);
    const firstExpand = await page.$('button[aria-label^="Expandir"]');
    const expanderLabel = await firstExpand.evaluate((node) => node.getAttribute("aria-label"));
    await firstExpand.click();
    const collapsedLabel = String(expanderLabel || "").replace(/^Expandir /, "Contraer ");
    await page.waitForFunction((label) => [...document.querySelectorAll('button')].some((button) => button.getAttribute("aria-label") === label), { timeout: 20000 }, collapsedLabel);
    const rowsAfterExpand = await page.$$eval("table tbody tr", (rows) => rows.length);
    check("browser_expander_reveals_puc_level", rowsAfterExpand > rowsBeforeExpand, { before: rowsBeforeExpand, after: rowsAfterExpand, expander: expanderLabel });

    await clickButton(page, "Expandir todo");
    await page.waitForFunction((code) => document.body.innerText.includes(code), { timeout: 30000 }, income.code);
    const expandedText = await page.$eval("body", (body) => body.innerText);
    check("browser_grouped_income_visible", expandedText.includes(income.code) && expandedText.includes("Ingresos"), { code: income.code });
    await page.screenshot({ path: shot("pyg-matrix-branch-first"), fullPage: false });
    screenshots.matrix_branch_first = relative(shot("pyg-matrix-branch-first"));

    const refreshDoc = await postDocument(tenantA.token, {
      posting_date: "2026-03-18", header_text: "Ingreso posterior certificacion refresco UI",
      lines: [
        docLine(income.code, B1, C1, "credit", 700, party.id, "Ingreso de refresco"),
        docLine(cash.code, B1, C1, "debit", 700, party.id, "Caja contrapartida")
      ]
    });
    check("browser_refresh_document_posted", Boolean(refreshDoc?.full_number), { document: refreshDoc?.full_number });
    await sleep(500);
    const refreshed = pygReportResponse(page, 60000, PERIOD);
    await clickButton(page, "Actualizar");
    const refreshResponse = await refreshed;
    check("browser_refresh_button_refetches_report", refreshResponse.status() === 200 && refreshResponse.request().method() === "GET", { status: refreshResponse.status() });
    await page.waitForFunction((expected) => document.body.innerText.includes(expected), { timeout: 30000 }, moneyText(950));
    check("browser_refresh_shows_new_posting", (await page.$eval("body", (body) => body.innerText)).includes(moneyText(950)), { expected: moneyText(950) });

    const defaultPreset = pygReportResponse(page, 60000, PERIOD);
    await clickButton(page, "PUC · Sucursal · Centro");
    await defaultPreset;
    await page.waitForFunction(() => document.body.innerText.includes("Agrupación Cuenta PUC → Sucursal → Centro de costo"), { timeout: 30000 });
    check("browser_default_preset_restored_before_budget", true, { preset: "puc,branch,cost_center" });

    await clickButton(page, "Presupuesto PUC");
    await page.waitForFunction(() => document.body.innerText.includes("Presupuesto mensual por cuenta PUC"), { timeout: 30000 });
    await page.waitForFunction(() => document.querySelectorAll("table tbody tr").length >= 4, { timeout: 30000 });
    const firstRow = await page.$("table tbody tr");
    const accountInput = firstRow ? await firstRow.$('input[aria-label^="Buscar cuenta PUC"]') : null;
    const branchSelect = firstRow ? await firstRow.$('select[aria-label="Sucursal"]') : null;
    const centerSelect = firstRow ? await firstRow.$('select[aria-label="Centro de costo"]') : null;
    const initialRow = accountInput && branchSelect && centerSelect ? {
      account: await accountInput.evaluate((node) => node.value),
      branch: await branchSelect.evaluate((node) => node.value),
      center: await centerSelect.evaluate((node) => node.value)
    } : null;
    check("browser_budget_editor_first_row_is_income_b1_c1", Boolean(initialRow) && initialRow.account === income.code && initialRow.branch === B1 && initialRow.center === C1, { row: initialRow, expected: { account: income.code, branch: B1, center: C1 } });
    if (!initialRow || initialRow.account !== income.code || initialRow.branch !== B1 || initialRow.center !== C1) throw new Error("browser_budget_editor_first_row_mismatch");

    await accountInput.click({ clickCount: 3 });
    await page.keyboard.press("Backspace");
    await accountInput.type(income.code);
    await page.waitForSelector('[role="option"]', { visible: true, timeout: 20000 });
    const accountOptions = await page.$$('[role="option"]');
    const optionCodes = [];
    let selectedOption = null;
    for (const option of accountOptions) {
      const code = await option.evaluate((node) => (node.querySelector("span")?.textContent || "").trim());
      optionCodes.push(code);
      if (code === income.code) selectedOption = option;
    }
    check("browser_budget_editor_option_matches_income_code", Boolean(selectedOption), { code: income.code, options: optionCodes });
    if (!selectedOption) throw new Error("browser_budget_editor_income_option_not_found");
    await selectedOption.click();
    await page.waitForFunction(({ selector, code }) => {
      const input = document.querySelector(selector);
      return Boolean(input) && input.value === code && String(input.getAttribute("aria-label") || "").includes("seleccionada");
    }, { timeout: 20000 }, { selector: 'table tbody tr:first-child input[aria-label^="Buscar cuenta PUC"]', code: income.code });
    await page.select('table tbody tr:first-child select[aria-label="Sucursal"]', B1);
    await page.select('table tbody tr:first-child select[aria-label="Centro de costo"]', C1);
    const amountInput = await page.waitForSelector('table tbody tr:first-child input[aria-label="Valor mensual del presupuesto"]', { visible: true, timeout: 20000 });
    await amountInput.click({ clickCount: 3 });
    await page.keyboard.press("Backspace");
    await amountInput.type("1200");
    const stagedRow = {
      account: await accountInput.evaluate((node) => node.value),
      branch: await branchSelect.evaluate((node) => node.value),
      center: await centerSelect.evaluate((node) => node.value),
      amount: await amountInput.evaluate((node) => node.value)
    };
    check("browser_budget_editor_row_staged", stagedRow.account === income.code && stagedRow.branch === B1 && stagedRow.center === C1 && stagedRow.amount === "1200", stagedRow);
    await page.screenshot({ path: shot("pyg-budget-editor"), fullPage: false });
    screenshots.budget_editor = relative(shot("pyg-budget-editor"));
    await page.waitForFunction(() => {
      const button = document.querySelector('button[aria-label="Actualizar reporte"]');
      return Boolean(button) && !button.disabled;
    }, { timeout: 30000 });
    const budgetSave = pygBudgetResponse(page);
    const matrixRefresh = pygReportResponse(page, 60000, PERIOD);
    await clickButton(page, "Guardar presupuesto");
    const budgetSaveResponse = await budgetSave;
    const savedBudget = await budgetSaveResponse.json().catch(() => ({}));
    check("browser_budget_editor_saves_via_real_put", budgetSaveResponse.status() === 200 && savedBudget.saved_count === 4 && savedBudget.updated_count === 4, { status: budgetSaveResponse.status(), body: savedBudget });
    await page.waitForFunction(() => document.body.innerText.includes("guardado"), { timeout: 30000 });

    const matrixResponse = await matrixRefresh;
    const refreshedBody = await matrixResponse.json();
    check("browser_budget_save_refreshes_report", matrixResponse.status() === 200 && refreshedBody.period === PERIOD && (refreshedBody.dimensions || []).join(",") === "puc,branch,cost_center", { status: matrixResponse.status(), period: refreshedBody.period, dimensions: refreshedBody.dimensions });
    const refreshedIncome = findNodes(refreshedBody.nodes || [], income.id).find((node) => node.dimension === "puc" && node.code === income.code);
    const incomeBranch = refreshedIncome ? (refreshedIncome.children || []).find((node) => node.dimension === "branch" && node.code === B1) : null;
    const incomeC1Leaf = incomeBranch ? (incomeBranch.children || []).find((node) => node.dimension === "cost_center" && node.code === `${B1}|${C1}`) : null;
    const incomeC2Leaf = incomeBranch ? (incomeBranch.children || []).find((node) => node.dimension === "cost_center" && node.code === `${B1}|${C2}`) : null;
    check("browser_saved_budget_parent_visible_in_matrix", Boolean(refreshedIncome) && refreshedIncome.actual === 2350 && refreshedIncome.budget === 1275, { parent: refreshedIncome ? { actual: refreshedIncome.actual, budget: refreshedIncome.budget } : null });
    check("browser_saved_budget_leaf_visible_in_matrix", Boolean(incomeC1Leaf) && incomeC1Leaf.actual === 300 && incomeC1Leaf.budget === 1200, { leaf: incomeC1Leaf ? { actual: incomeC1Leaf.actual, budget: incomeC1Leaf.budget } : null });
    check("browser_budget_parent_includes_other_leaf", Boolean(incomeC2Leaf) && incomeC2Leaf.actual === 0 && incomeC2Leaf.budget === 75, { leaf: incomeC2Leaf ? { actual: incomeC2Leaf.actual, budget: incomeC2Leaf.budget } : null });

    await clickButton(page, "Matriz interactiva");
    await page.waitForFunction((period) => document.body.innerText.includes(`Matriz mensual · ${period}`), { timeout: 30000 }, PERIOD);
    await page.waitForFunction(({ code, actual, budget }) => {
      const row = [...document.querySelectorAll("table tbody tr")].find((item) => (item.textContent || "").includes(code));
      return Boolean(row) && row.textContent.includes(actual) && row.textContent.includes(budget);
    }, { timeout: 30000 }, { code: income.code, actual: moneyText(2350), budget: moneyText(1275) });
    const savedIncomeRowText = await page.evaluate((code) => {
      const row = [...document.querySelectorAll("table tbody tr")].find((item) => (item.textContent || "").includes(code));
      return row ? row.textContent || "" : "";
    }, income.code);
    check("browser_saved_budget_rendered_in_matrix_row", savedIncomeRowText.includes(moneyText(2350)) && savedIncomeRowText.includes(moneyText(1275)), { row: savedIncomeRowText });

    await clickButton(page, "Por vehículo");
    await page.waitForFunction(() => document.body.innerText.includes("PYG por Vehículo") && document.body.innerText.includes("Consolidado"), { timeout: 30000 });
    check("browser_vehicle_view_preserved", true, {});
    await page.screenshot({ path: shot("pyg-vehicle-view"), fullPage: false });
    screenshots.vehicle_view = relative(shot("pyg-vehicle-view"));
    await clickButton(page, "Contable · PUC");
    await page.waitForFunction(() => document.body.innerText.includes("PYG Contable · PUC"), { timeout: 30000 });

    await setRolePermissions(tenantA.tenantId, tenantA.email, "CERT_PYG_READER", ["read"]);
    await page.evaluate(() => localStorage.clear());
    await login(page, tenantA.email, tenantA.password);
    const stored = await page.evaluate(() => ({ permissions: JSON.parse(localStorage.getItem("role_permissions") || "[]"), role: localStorage.getItem("role_name") }));
    check("browser_readonly_role_stored_not_privileged", stored.permissions.some((item) => item.module === "accounting" && item.action === "read") && !stored.permissions.some((item) => item.action === "write" || item.action === "*"), stored);
    await page.goto(`${webUrl}/dashboard/contabilidad/pyg`, { waitUntil: "networkidle2" });
    await page.waitForFunction(() => document.body.innerText.includes("Matriz interactiva"), { timeout: 45000 });
    await clickButton(page, "Presupuesto PUC");
    await page.waitForFunction(() => document.body.innerText.toLowerCase().includes("solo lectura"), { timeout: 30000 });
    const readOnlyText = await page.$eval("body", (body) => body.innerText);
    check("browser_readonly_budget_editor_hides_writes", readOnlyText.includes("Consulta de solo lectura") && !readOnlyText.includes("Agregar fila") && !readOnlyText.includes("Guardar presupuesto"), {});
    await page.screenshot({ path: shot("pyg-budget-readonly"), fullPage: false });
    screenshots.budget_readonly = relative(shot("pyg-budget-readonly"));

    await setRolePermissions(tenantA.tenantId, tenantA.email, "CERT_PYG_ROLE", ["read", "write"]);
    await page.setViewport({ width: 1024, height: 768 });
    await page.evaluate(() => localStorage.clear());
    await login(page, tenantA.email, tenantA.password);
    await page.goto(`${webUrl}/dashboard/contabilidad/pyg`, { waitUntil: "networkidle2" });
    await page.waitForFunction(() => document.body.innerText.includes("Matriz interactiva"), { timeout: 45000 });
    await page.screenshot({ path: shot("pyg-matrix-responsive"), fullPage: false });
    screenshots.matrix_responsive = relative(shot("pyg-matrix-responsive"));

    check("screenshots_captured", Object.values(screenshots).every((file) => fs.existsSync(path.join(root, file)) && fs.statSync(path.join(root, file)).size > 0), { screenshots });
  } finally {
    if (browser) await browser.close().catch(() => undefined);
  }

  await db.$disconnect().catch(() => undefined);
  return { tenant_a: tenantA.tenantId, tenant_b: tenantB.tenantId, accounts: { income: income.code, expense: expense.code, cost6: cost6.code, cost7: cost7.code }, screenshots };
}

function sectionByKeyOf(report) {
  return Object.fromEntries((report.sections || []).map((section) => [section.key, section]));
}

function writeEvidence(status, payload, sources) {
  const evidence = {
    version: 2,
    certification: "accounting-pyg-interactive-browser-local",
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
      "Registro permite nuevos tenants aislados; ejecutar desde la raiz del repositorio."
    ],
    checks,
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
    writeEvidence("failed", { error: String(error?.stack || error), screenshots }, sources);
  });
