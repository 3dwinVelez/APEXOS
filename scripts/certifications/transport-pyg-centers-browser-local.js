/* Certificacion local de la vista "Por CC" del PYG por vehiculo: centros de
 * costo en las columnas y la estructura del PYG en las filas, leida del libro
 * contable real. Chrome real, API local real, Prisma local real. Sin mocks de
 * React ni interceptacion de peticiones.
 * Prerequisitos: PostgreSQL loopback con el esquema aplicado y
 * apexos_accounting_private.ensure_standard_chart disponible (la crea la
 * migracion de Supabase; en local se aplica esa migracion), API en
 * LOCAL_API_URL (default http://127.0.0.1:3215), web en LOCAL_WEB_URL
 * (default http://127.0.0.1:3004), Chrome instalado y DATABASE_URL loopback
 * exportado. Ejecutar desde la raiz del repositorio.
 * Nota: cada corrida registra dos tenants de QA y /auth/register limita a
 * cinco registros por hora por IP; si se agota, reiniciar la API local
 * (el contador es en memoria cuando DISABLE_REDIS=1) antes de repetir.
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
const output = path.resolve(root, process.env.BROWSER_EVIDENCE_PATH || "docs/qa/evidence/transport-pyg-centers-20261029/browser-local.json");
const evidenceDir = path.dirname(output);
const browserPath = process.env.CHROME_BIN || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const suffix = crypto.randomBytes(5).toString("hex");
const checks = [];
const db = new PrismaClient();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const PERIOD = "2026-08";
const SOCIETY = "SOC-CC";
const BRANCH = "SUC-CC";
const CENTERS = ["CC-ALFA", "CC-BETA", "CC-GAMMA"];
const CONCEPTS = [
  { code: "41450101", name: "Ingresos operacionales transporte", parent: "4145", type: "income" },
  { code: "52050601", name: "Sueldos operacionales", parent: "5205", type: "expense" },
  { code: "52953501", name: "Combustible", parent: "5295", type: "expense" },
  { code: "52559501", name: "Peajes", parent: "5255", type: "expense" },
  { code: "52454001", name: "Mantenimiento vehiculo", parent: "5245", type: "expense" }
];
const EXECUTED = {
  "CC-ALFA": { income: 25000000, "52050601": 5000000, "52953501": 2000000, "52559501": 1000000, "52454001": 500000 },
  "CC-BETA": { income: 10000000, "52050601": 2500000, "52953501": 1000000, "52559501": 500000 },
  "CC-GAMMA": { income: 0, "52050601": 1000000, "52454001": 500000 }
};
const BUDGET = {
  "CC-ALFA": { "41450101": 20000000, "52050601": 6000000, "52953501": 2500000, "52559501": 800000, "52454001": 700000 },
  "CC-BETA": { "41450101": 12000000, "52050601": 2000000, "52953501": 1200000, "52559501": 400000 },
  "CC-GAMMA": { "52050601": 1200000, "52454001": 300000 }
};

const screenshots = {};
const shot = (name) => path.join(evidenceDir, `${name}-${suffix}.png`);
const consoleLogs = [];
const pageErrors = [];
const failedRequests = [];
const observedReports = [];

function pushBounded(list, entry) {
  list.push(entry);
  if (list.length > 200) list.shift();
}

const SOURCE_FILES = {
  engine: "apps/api/src/modules/transport-pyg/account-engine.js",
  routes: "apps/api/src/modules/transport-pyg/routes.js",
  web_page: "apps/web/app/dashboard/contabilidad/pyg/page.tsx",
  web_matrix: "apps/web/components/accounting/PygCentersMatrix.tsx",
  web_readings: "apps/web/components/accounting/PygVehicleReadings.tsx",
  web_table_enhancer: "apps/web/components/system/StandardTableExperience.tsx",
  api_unit: "apps/api/test/transport-pyg-centers-matrix.test.js",
  web_unit: "apps/web/test/transport-pyg-centers-matrix.test.mjs",
  script: "scripts/certifications/transport-pyg-centers-browser-local.js"
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
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(`${apiUrl}/api/v1${pathname}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(120000) });
  const text = await response.text();
  let json = null;
  try { json = JSON.parse(text); } catch { json = null; }
  return { status: response.status, body: json, text, headers: response.headers };
}

async function must(method, pathname, token, body, expected = [200, 201]) {
  const result = await apiCall(method, pathname, token, body);
  if (!expected.includes(result.status)) {
    throw new Error(`${method} ${pathname} -> ${result.status} ${JSON.stringify(result.body).slice(0, 400)}`);
  }
  return result.body;
}

async function registerTenant(label) {
  const email = `${label}-${suffix}@apexos.local`;
  const password = `Cc-Cert-${suffix}9!`;
  const body = await must("POST", "/auth/register", null, {
    company_name: `${label} ${suffix}`, industry: "qa", email, password, name: `${label} Admin`,
    country: "CO", timezone: "America/Bogota", currency: "COP", plan: "crown"
  });
  const token = body.token;
  const tenantId = body.tenant?.id || body.user?.tenant_id;
  if (!token || !tenantId) throw new Error("register_missing_token_or_tenant");
  return { token, tenantId, email, password };
}

async function seedOrganization(token) {
  await must("POST", "/accounting/organization-tree", token, { type: "society", code: SOCIETY, name: "Sociedad Centros QA" });
  await must("POST", "/accounting/organization-tree", token, { type: "branch", code: BRANCH, name: "Sucursal Centros QA", society_code: SOCIETY });
  for (const code of CENTERS) {
    await must("POST", "/accounting/organization-tree", token, { type: "cost_center", code, name: `Centro ${code.slice(3)} QA`, society_code: SOCIETY, branch_code: BRANCH });
  }
  check("fixture_org_tree_via_local_api", true, { society: SOCIETY, branch: BRANCH, centers: CENTERS });
}

async function ensureAccount(token, tenantId, code, name, type, parentCode, allowsTx) {
  const existing = await db.account.findFirst({ where: { tenant_id: tenantId, code } });
  if (existing) return existing;
  await must("POST", "/accounting/accounts", token, { code, name, type, parent_code: parentCode, active: true, allows_tx: allowsTx });
  const created = await db.account.findFirst({ where: { tenant_id: tenantId, code } });
  if (!created) throw new Error(`account_not_materialized:${code}`);
  return created;
}

async function postDocument(token, { header, center, lines }) {
  return must("POST", "/accounting/documents", token, {
    posting_date: `${PERIOD}-15`, header_text: header, document_type: "CC", society_code: SOCIETY,
    lines: lines.map((line) => ({ branch_code: BRANCH, cost_center_code: center, ...line }))
  });
}

function moneyText(value) {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(value);
}
function percentText(value) {
  return `${new Intl.NumberFormat("es-CO", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value * 100)}%`;
}
function normalize(value) {
  return String(value == null ? "" : value).replace(/[\s\u00a0\u202f]+/g, " ").trim();
}

function centerRow(center, code) {
  return (center.rows || []).find((row) => row.code === code) || null;
}

function verifyApiReport(report, label) {
  const centers = report.centers || [];
  check(`${label}_api_source_ledger`, report.report_source === "ledger" && report.period === PERIOD, { source: report.report_source, period: report.period });
  check(`${label}_api_three_centers`, centers.length === 3 && report.data_status?.centers_count === 3, { centers: centers.map((center) => center.center_code), status: report.data_status });
  check(`${label}_api_centers_match_org_tree`, CENTERS.every((code) => centers.some((center) => center.center_code === code && center.branch_code === BRANCH)), { centers: centers.map((center) => `${center.branch_code}|${center.center_code}`) });
  check(`${label}_api_reconciliation_zero`, report.reconciliation?.difference === 0 && report.reconciliation?.neta_actual === 21000000, report.reconciliation);

  const alfa = centers.find((center) => center.center_code === "CC-ALFA");
  const beta = centers.find((center) => center.center_code === "CC-BETA");
  const gamma = centers.find((center) => center.center_code === "CC-GAMMA");
  check(`${label}_api_alfa_income`, centerRow(alfa, "INGRESOS")?.actual === 25000000 && centerRow(alfa, "INGRESOS")?.budget === 20000000 && centerRow(alfa, "INGRESOS")?.cump === 1.25, centerRow(alfa, "INGRESOS"));
  check(`${label}_api_beta_income`, centerRow(beta, "INGRESOS")?.actual === 10000000 && centerRow(beta, "INGRESOS")?.budget === 12000000 && Math.round((centerRow(beta, "INGRESOS")?.cump ?? 0) * 10000) === 8333, centerRow(beta, "INGRESOS"));
  check(`${label}_api_gamma_without_income_budget`, centerRow(gamma, "INGRESOS")?.actual === 0 && centerRow(gamma, "INGRESOS")?.budget == null && centerRow(gamma, "INGRESOS")?.cump == null, centerRow(gamma, "INGRESOS"));
  check(`${label}_api_gamma_personal_expense`, centerRow(gamma, "GASTOS_PERSONAL")?.actual === 1000000 && centerRow(gamma, "GASTOS_PERSONAL")?.budget === 1200000 && Math.round((centerRow(gamma, "GASTOS_PERSONAL")?.cump ?? 0) * 10000) === 8333, centerRow(gamma, "GASTOS_PERSONAL"));

  const corporate = (code) => (report.corporate?.rows || []).find((row) => row.code === code)?.actual ?? null;
  const sumCenters = (code) => centers.reduce((sum, center) => sum + (centerRow(center, code)?.actual ?? 0), 0);
  const codes = ["INGRESOS", "GASTOS_PERSONAL", "COMBUSTIBLE", "PEAJES", "MANTENIMIENTO_VEHICULO", "UTILIDAD_NETA"];
  check(`${label}_api_centers_sum_to_corporate`, codes.every((code) => sumCenters(code) === corporate(code)), {
    rows: codes.map((code) => ({ code, centers: sumCenters(code), corporate: corporate(code) }))
  });
  check(`${label}_api_net_matches_ledger`, corporate("UTILIDAD_NETA") === 21000000, { net: corporate("UTILIDAD_NETA") });
}

async function matrixProbe(page) {
  return page.evaluate(() => {
    const norm = (value) => String(value == null ? "" : value).replace(/[\s\u00a0\u202f]+/g, " ").trim();
    const heading = [...document.querySelectorAll("h2")].find((node) => (node.textContent || "").includes("PYG por centro de costo")) || null;
    const section = heading ? heading.closest("section") : null;
    const table = section ? section.querySelector("table") : null;
    const headerRows = table ? [...table.tHead.rows] : [];
    const groups = headerRows[0] ? [...headerRows[0].cells].map((cell) => ({ text: norm(cell.textContent), colSpan: cell.colSpan, rowSpan: cell.rowSpan, width: Math.round(cell.getBoundingClientRect().width) })) : [];
    const metrics = headerRows[1] ? [...headerRows[1].cells].map((cell) => ({ text: norm(cell.textContent), hidden: cell.hasAttribute("hidden"), width: Math.round(cell.getBoundingClientRect().width) })) : [];
    const bodyRows = table ? [...table.tBodies[0].rows].map((row) => [...row.cells].map((cell) => ({ text: norm(cell.textContent), hidden: cell.hasAttribute("hidden"), width: Math.round(cell.getBoundingClientRect().width) }))) : [];
    const viewport = table ? table.parentElement : null;
    return {
      heading: norm(heading?.textContent),
      has_section: Boolean(section),
      has_table: Boolean(table),
      layout: table ? table.getAttribute("data-table-layout") : null,
      enhanced: table ? table.hasAttribute("data-apex-standard-table") : null,
      standard_class: table ? table.classList.contains("apex-standard-table") : null,
      toolbar_in_section: section ? Boolean(section.querySelector(".apex-standard-table-toolbar")) : null,
      viewport_class: viewport ? viewport.classList.contains("apex-standard-table-viewport") : null,
      sticky_concept: table ? Boolean(table.querySelector("th.sticky.left-0")) : false,
      header_row_count: headerRows.length,
      groups,
      metrics,
      rows: bodyRows.map((cells) => cells.map((cell) => cell.text)),
      hidden_cells: metrics.filter((cell) => cell.hidden).length + bodyRows.flat().filter((cell) => cell.hidden).length,
      zero_width_metric_cells: metrics.filter((cell) => cell.width === 0).length,
      zero_width_body_cells: bodyRows[0] ? bodyRows[0].filter((cell) => cell.width === 0).length : 0,
      scroll: viewport ? { scroll_width: viewport.scrollWidth, client_width: viewport.clientWidth, scrollable: viewport.scrollWidth > viewport.clientWidth } : null,
      standards: { tables_enhanced: document.querySelectorAll("table[data-apex-standard-table]").length, toolbars: document.querySelectorAll(".apex-standard-table-toolbar").length }
    };
  });
}

async function clickNavButton(page, label) {
  await page.waitForFunction((text) => [...document.querySelectorAll("button")].some((button) => (button.textContent || "").trim() === text && !button.disabled), { timeout: 30000 }, label);
  const clicked = await page.evaluate((text) => {
    const button = [...document.querySelectorAll("button")].find((node) => (node.textContent || "").trim() === text && !node.disabled);
    if (!button) return false;
    button.scrollIntoView({ block: "center" });
    button.click();
    return true;
  }, label);
  if (!clicked) throw new Error(`nav_button_not_found:${label}`);
}

async function enterVehicleView(page) {
  const clicked = await page.evaluate(() => {
    const nav = document.querySelector('nav[aria-label="Vista del PYG"]');
    const button = nav ? [...nav.querySelectorAll("button")].find((node) => (node.textContent || "").trim() === "Por vehículo") : null;
    if (!button) return false;
    button.click();
    return true;
  });
  if (!clicked) throw new Error("vehicle_view_button_not_found");
  await page.waitForSelector('input[type="month"]', { visible: true, timeout: 45000 });
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

function transportReportResponse(page, timeout = 120000, period = PERIOD) {
  return page.waitForResponse((response) => {
    if (response.request().method() !== "GET") return false;
    const url = new URL(response.url());
    if (!url.pathname.endsWith("/api/v1/transport-pyg/report")) return false;
    return !period || url.searchParams.get("period") === period;
  }, { timeout });
}

function attachDiagnostics(page) {
  page.on("console", (message) => {
    if (!["error", "warning", "warn"].includes(message.type())) return;
    pushBounded(consoleLogs, { at: new Date().toISOString(), type: message.type(), text: message.text().slice(0, 2000), url: page.url() });
  });
  page.on("pageerror", (error) => {
    pushBounded(pageErrors, { at: new Date().toISOString(), message: String(error?.message || error).slice(0, 4000), url: page.url() });
  });
  page.on("requestfailed", (request) => {
    pushBounded(failedRequests, { at: new Date().toISOString(), method: request.method(), url: request.url().slice(0, 2000), error: request.failure()?.errorText || "" });
  });
  page.on("response", (response) => {
    const url = response.url();
    if (!url.includes("/api/v1/transport-pyg/report")) return;
    pushBounded(observedReports, {
      at: new Date().toISOString(), method: response.request().method(), status: response.status(),
      cache_control: response.headers()["cache-control"] || "", url: url.slice(0, 2000)
    });
  });
}

async function login(page, email, password) {
  await page.goto(`${webUrl}/login`, { waitUntil: "networkidle2" });
  await page.waitForSelector('input[name="email"]', { visible: true, timeout: 60000 });
  await page.waitForSelector('input[name="password"]', { visible: true, timeout: 60000 });
  const pending = page.waitForResponse((response) => new URL(response.url()).pathname.endsWith("/api/v1/auth/login") && response.request().method() === "POST", { timeout: 60000 });
  for (const selector of ['input[name="email"]', 'input[name="password"]']) {
    await page.click(selector, { clickCount: 3 });
    await page.keyboard.down("Control"); await page.keyboard.press("A"); await page.keyboard.up("Control"); await page.keyboard.press("Backspace");
  }
  await page.type('input[name="email"]', email);
  await page.type('input[name="password"]', password);
  await page.click('form button[type="submit"]');
  const response = await pending;
  await page.waitForFunction(() => !location.pathname.endsWith("/login"), { timeout: 60000 });
  check("browser_login_real", response.status() === 200, { status: response.status() });
}

async function main() {
  await waitForServer(apiUrl, ["/health", "/api/v1/health"]);
  await waitForServer(webUrl, ["/"]);
  if (!fs.existsSync(browserPath)) throw new Error(`PREREQUISITO: no existe Chrome en ${browserPath}`);
  const sources = collectSources();
  fs.mkdirSync(evidenceDir, { recursive: true });

  await db.$connect();
  const tenantA = await registerTenant("cc-cert-a");
  const tenantB = await registerTenant("cc-cert-b");
  const accountCount = await db.account.count({ where: { tenant_id: tenantA.tenantId } });
  check("fixture_standard_chart_initialized", accountCount > 0, { accounts: accountCount, tenant_id: tenantA.tenantId });

  await seedOrganization(tenantA.token);
  const accounts = {};
  for (const concept of CONCEPTS) {
    const subCode = concept.code.slice(0, 6);
    await ensureAccount(tenantA.token, tenantA.tenantId, subCode, `Subcuenta ${subCode}`, concept.type, concept.parent, false);
    accounts[concept.code] = await ensureAccount(tenantA.token, tenantA.tenantId, concept.code, concept.name, concept.type, subCode, true);
  }
  const cash = await db.account.findFirst({ where: { tenant_id: tenantA.tenantId, code: "1105" } });
  if (!cash) throw new Error("fixture_cash_account_missing");
  const party = await db.party.create({ data: { tenant_id: tenantA.tenantId, type: "customer", name: `Cliente Centros ${suffix}`, active: true } });
  check("fixture_concept_accounts_created_via_api", CONCEPTS.every((concept) => accounts[concept.code]?.parent_id), { accounts: CONCEPTS.map((concept) => ({ code: concept.code, id: accounts[concept.code].id })) });

  for (const [center, movement] of Object.entries(EXECUTED)) {
    if (movement.income > 0) {
      await postDocument(tenantA.token, {
        header: `Ingreso ${center}`, center,
        lines: [
          { account_code: accounts["41450101"].code, party_id: party.id, movement: "credit", amount: movement.income, description: "Ingreso servicio" },
          { account_code: cash.code, party_id: party.id, movement: "debit", amount: movement.income, description: "Caja contrapartida" }
        ]
      });
    }
    for (const concept of CONCEPTS.filter((item) => item.type === "expense")) {
      const amount = movement[concept.code] || 0;
      if (!amount) continue;
      await postDocument(tenantA.token, {
        header: `${concept.name} ${center}`, center,
        lines: [
          { account_code: accounts[concept.code].code, party_id: party.id, movement: "debit", amount, description: concept.name },
          { account_code: cash.code, party_id: party.id, movement: "credit", amount, description: "Caja contrapartida" }
        ]
      });
    }
  }
  check("fixture_documents_posted_via_api", true, { centers: Object.keys(EXECUTED), period: PERIOD });

  const budgetRows = [];
  for (const [center, plan] of Object.entries(BUDGET)) {
    for (const [code, amount] of Object.entries(plan)) {
      budgetRows.push({ account_id: accounts[code].id, branch_code: BRANCH, cost_center_code: center, amount });
    }
  }
  const budget = await must("PUT", "/accounting/reports/pyg-interactive/budgets", tenantA.token, { period: PERIOD, rows: budgetRows });
  check("fixture_budgets_saved_via_api", budget.saved_count === budgetRows.length, { saved: budget.saved_count, rows: budgetRows.length });

  const report = await apiCall("GET", `/transport-pyg/report?period=${PERIOD}`, tenantA.token);
  check("api_report_ok", report.status === 200 && report.body?.period === PERIOD, { status: report.status, period: report.body?.period });
  verifyApiReport(report.body, "report");

  const tenantBReport = await apiCall("GET", `/transport-pyg/report?period=${PERIOD}`, tenantB.token);
  check("cross_company_centers_isolated", tenantBReport.status === 200 && (tenantBReport.body.centers || []).length === 0 && (tenantBReport.body.reconciliation?.neta_actual ?? 0) === 0, {
    centers: (tenantBReport.body.centers || []).length, net: tenantBReport.body.reconciliation?.neta_actual
  });

  // ---- Fase de navegador real ----
  let browser = null;
  let page = null;
  let phase = null;
  try {
    browser = await puppeteer.launch({ executablePath: browserPath, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"] });
    page = await browser.newPage();
    attachDiagnostics(page);
    await page.setViewport({ width: 1440, height: 900 });
    page.setDefaultTimeout(30000);
    page.setDefaultNavigationTimeout(120000);
    await login(page, tenantA.email, tenantA.password);

    phase = "enter_vehicle_view";
    const firstLoad = transportReportResponse(page, 120000, null);
    await page.goto(`${webUrl}/dashboard/contabilidad/pyg`, { waitUntil: "networkidle2" });
    await enterVehicleView(page);
    const loaded = await firstLoad;
    check("browser_report_served", loaded.status() === 200 && new URL(loaded.url()).searchParams.get("period") !== null, { status: loaded.status(), url: loaded.url() });

    phase = "set_period";
    const periodReport = transportReportResponse(page);
    await setMonthInput(page, PERIOD);
    const periodResponse = await periodReport;
    check("browser_period_request", periodResponse.status() === 200, { status: periodResponse.status(), period: PERIOD });
    await page.waitForFunction((period) => document.body.innerText.includes(`PYG corporativo · ${period}`), { timeout: 60000 }, PERIOD);

    phase = "consolidado_enhancer_regression";
    await page.waitForFunction(() => document.querySelectorAll("table[data-apex-standard-table]").length > 0 && document.querySelectorAll(".apex-standard-table-toolbar").length > 0, { timeout: 30000 });
    const consolidated = await page.evaluate(() => ({
      enhanced_tables: document.querySelectorAll("table[data-apex-standard-table]").length,
      toolbars: document.querySelectorAll(".apex-standard-table-toolbar").length
    }));
    check("browser_operational_tables_keep_global_enhancer", consolidated.enhanced_tables > 0 && consolidated.toolbars > 0, consolidated);

    phase = "open_centers_view";
    await clickNavButton(page, "Por CC");
    await page.waitForFunction((period) => {
      const heading = [...document.querySelectorAll("h2")].find((node) => (node.textContent || "").includes("PYG por centro de costo"));
      return Boolean(heading) && (heading.textContent || "").includes(period);
    }, { timeout: 60000 }, PERIOD);
    const probe = await matrixProbe(page);

    check("browser_matrix_heading", normalize(probe.heading) === normalize(`PYG por centro de costo · ${PERIOD}`), { heading: probe.heading });
    check("browser_matrix_table_present", probe.has_table && probe.header_row_count === 2, { rows: probe.header_row_count });
    check("browser_matrix_opted_out_of_column_configurator", probe.layout === "detail" && probe.enhanced === false && probe.standard_class === false && probe.toolbar_in_section === false && probe.viewport_class === false, {
      layout: probe.layout, enhanced: probe.enhanced, standard_class: probe.standard_class, toolbar: probe.toolbar_in_section, viewport: probe.viewport_class
    });
    check("browser_matrix_group_headers", probe.groups.length === CENTERS.length + 1 && normalize(probe.groups[0]?.text) === "Concepto" && CENTERS.every((code, index) => normalize(probe.groups[index + 1]?.text).includes(`Centro ${code.slice(3)}`)), { groups: probe.groups.map((group) => group.text) });
    // Cada encabezado de grupo debe mostrar la sucursal real del reporte para que
    // centros homonimos de sucursales distintas no se confundan en la matriz.
    const branchLabels = CENTERS.map((code) => {
      const center = (report.body.centers || []).find((item) => item.center_code === code);
      return { code, api_branch_name: center?.branch_name ?? null, dom: normalize(probe.groups[CENTERS.indexOf(code) + 1]?.text) };
    });
    check("browser_matrix_group_headers_show_branch_name", branchLabels.length === CENTERS.length && branchLabels.every((item) => {
      // La sucursal viene del APIreport real; el texto puede partir el nombre en
      // varias lineas, por eso se compara ya normalizado por token de texto.
      const expectedBranch = normalize(item.api_branch_name || "Sin sucursal");
      return item.dom.includes(`Centro ${item.code.slice(3)}`) && item.dom.includes(expectedBranch);
    }), { headers: branchLabels });
    check("browser_matrix_four_metrics_per_center", probe.metrics.length === CENTERS.length * 4 && probe.metrics.every((cell, index) => cell.text === ["Presupuesto", "Ejecutado", "%", "Cump"][index % 4]), { metrics: probe.metrics.map((cell) => cell.text) });
    check("browser_matrix_metrics_visible", probe.hidden_cells === 0 && probe.zero_width_metric_cells === 0 && probe.zero_width_body_cells === 0, {
      hidden_cells: probe.hidden_cells, zero_width_metrics: probe.zero_width_metric_cells, zero_width_body: probe.zero_width_body_cells
    });
    check("browser_matrix_concept_column_sticky", probe.sticky_concept === true, { sticky: probe.sticky_concept });
    check("browser_matrix_row_count_matches_report", probe.rows.length === report.body.corporate.rows.length, { dom: probe.rows.length, report: report.body.corporate.rows.length });

    const incomeRow = probe.rows.find((cells) => normalize(cells[0]) === "INGRESOS");
    const expectedIncome = [
      "INGRESOS",
      moneyText(20000000), moneyText(25000000), percentText(1), percentText(1.25),
      moneyText(12000000), moneyText(10000000), percentText(1), percentText(10000000 / 12000000),
      "—", moneyText(0), "—", "—"
    ].map(normalize);
    check("browser_matrix_income_row_values", Boolean(incomeRow) && incomeRow.length === expectedIncome.length && expectedIncome.every((value, index) => normalize(incomeRow[index]) === value), { actual: incomeRow, expected: expectedIncome });

    const personalRow = probe.rows.find((cells) => normalize(cells[0]) === "GASTOS DE PERSONAL");
    // Celda 0 = concepto; cada centro ocupa 4 celdas, GAMMA es el tercero.
    const gammaPersonal = personalRow ? personalRow.slice(9, 13) : [];
    const expectedGamma = [moneyText(1200000), moneyText(1000000), "—", percentText(1000000 / 1200000)].map(normalize);
    check("browser_matrix_gamma_expense_visible", gammaPersonal.length === 4 && expectedGamma.every((value, index) => normalize(gammaPersonal[index]) === value), { gamma_personal: gammaPersonal, expected: expectedGamma });

    phase = "screenshots";
    await page.evaluate(() => {
      const heading = [...document.querySelectorAll("h2")].find((node) => (node.textContent || "").includes("PYG por centro de costo"));
      heading?.scrollIntoView({ block: "start", behavior: "instant" });
    });
    await sleep(300);
    const section = await page.evaluateHandle(() => {
      const heading = [...document.querySelectorAll("h2")].find((node) => (node.textContent || "").includes("PYG por centro de costo"));
      return heading ? heading.closest("section") : null;
    });
    const sectionElement = section.asElement();
    if (!sectionElement) throw new Error("matrix_section_handle_missing");
    await sectionElement.screenshot({ path: shot("pyg-centers-matrix") });
    screenshots.matrix = relative(shot("pyg-centers-matrix"));
    await page.screenshot({ path: shot("pyg-centers-page"), fullPage: false });
    screenshots.page = relative(shot("pyg-centers-page"));

    phase = "excel_export";
    await page.evaluate(() => {
      window.__apexExport = null;
      window.__apexExportName = null;
      const originalCreate = URL.createObjectURL.bind(URL);
      URL.createObjectURL = (blob) => {
        if (blob && String(blob.type || "").includes("spreadsheet")) {
          blob.arrayBuffer().then((buffer) => {
            const bytes = new Uint8Array(buffer);
            let binary = "";
            for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]);
            window.__apexExport = btoa(binary);
            window.__apexExportSize = bytes.length;
          }).catch(() => undefined);
        }
        return originalCreate(blob);
      };
      const originalClick = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function () {
        if (this.download) {
          window.__apexExportName = this.download;
          return;
        }
        return originalClick.call(this);
      };
    });
    await page.evaluate(() => {
      const button = [...document.querySelectorAll("button")].find((node) => (node.textContent || "").trim() === "Excel" && !node.disabled);
      if (!button) throw new Error("excel_button_missing");
      button.click();
    });
    await page.waitForFunction(() => Boolean(window.__apexExport), { timeout: 60000 });
    const workbook = await page.evaluate(async () => {
      const binary = atob(window.__apexExport);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
      const view = new DataView(bytes.buffer);
      const entries = {};
      for (let index = 0; index + 30 <= bytes.length; index += 1) {
        if (view.getUint32(index, true) !== 0x04034b50) continue;
        const method = view.getUint16(index + 8, true);
        const size = view.getUint32(index + 18, true);
        const nameLength = view.getUint16(index + 26, true);
        const extraLength = view.getUint16(index + 28, true);
        const name = new TextDecoder().decode(bytes.subarray(index + 30, index + 30 + nameLength));
        const start = index + 30 + nameLength + extraLength;
        if (size > 0 && !entries[name]) entries[name] = { method, data: bytes.subarray(start, start + size) };
      }
      const inflate = async (entry) => {
        if (!entry) return "";
        if (entry.method === 0) return new TextDecoder().decode(entry.data);
        const stream = new Blob([entry.data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
        return await new Response(stream).text();
      };
      const workbookXml = await inflate(entries["xl/workbook.xml"]);
      const shared = await inflate(entries["xl/sharedStrings.xml"]);
      const sheetNames = [...workbookXml.matchAll(/<sheet [^>]*name="([^"]+)"/g)].map((match) => match[1]);
      const strings = [...shared.matchAll(/<t[^>]*>([^<]*)<\/t>/g)].map((match) => match[1]);
      return { name: window.__apexExportName, size: window.__apexExportSize, sheet_names: sheetNames, strings, worksheet_files: Object.keys(entries).filter((key) => key.startsWith("xl/worksheets/sheet")) };
    });
    check("browser_excel_workbook_downloaded", Boolean(workbook.name) && workbook.name.endsWith(".xlsx") && workbook.size > 5000, { name: workbook.name, size: workbook.size });
    check("browser_excel_sheets_include_matrix_cc", workbook.sheet_names.includes("Consolidado") && workbook.sheet_names.includes("Matriz CC"), { sheets: workbook.sheet_names });
    check("browser_excel_matrix_cc_title", workbook.strings.some((value) => normalize(value) === normalize(`PYG POR CENTRO DE COSTO · ${PERIOD}`)), { titles: workbook.strings.filter((value) => value.startsWith("PYG POR")).slice(0, 4) });
    const expectedHeaders = CENTERS.flatMap((code) => {
      const center = (report.body.centers || []).find((item) => item.center_code === code);
      const label = `${center?.plate || center?.center_name || `CC ${code}`} · ${center?.branch_name || center?.branch_code || "Sin sucursal"}`;
      return ["PRESUPUESTO", "EJECUTADO", "%", "CUMP %"].map((metric) => `${label} · ${metric}`);
    });
    check("browser_excel_matrix_cc_columns", expectedHeaders.every((header) => workbook.strings.some((value) => normalize(value) === normalize(header))), { missing: expectedHeaders.filter((header) => !workbook.strings.some((value) => normalize(value) === normalize(header))) });

    phase = "narrow_viewport";
    await page.setViewport({ width: 390, height: 844 });
    await sleep(500);
    const narrow = await matrixProbe(page);
    check("browser_matrix_narrow_keeps_columns", narrow.has_table && narrow.hidden_cells === 0 && narrow.metrics.length === CENTERS.length * 4 && narrow.scroll?.scrollable === true, {
      hidden_cells: narrow.hidden_cells, metrics: narrow.metrics.length, scroll: narrow.scroll
    });
    await page.screenshot({ path: shot("pyg-centers-narrow"), fullPage: false });
    screenshots.narrow = relative(shot("pyg-centers-narrow"));

    check("browser_no_page_errors", pageErrors.length === 0, { page_errors: pageErrors.slice(0, 3) });
    const failedApi = failedRequests.filter((request) => request.url.includes("/api/v1/"));
    check("browser_no_failed_api_requests", failedApi.length === 0, { failed: failedApi.slice(0, 3) });
    check("screenshots_captured", Object.values(screenshots).every((file) => fs.existsSync(path.join(root, file)) && fs.statSync(path.join(root, file)).size > 0), { screenshots });
    phase = "completed";
  } finally {
    if (page && phase !== "completed") {
      try {
        await page.screenshot({ path: shot(`failure-${phase || "browser"}`), fullPage: false });
        screenshots.failure = relative(shot(`failure-${phase || "browser"}`));
      } catch { /* La captura de fallo es best-effort. */ }
    }
    if (browser) await browser.close().catch(() => undefined);
  }

  await db.$disconnect().catch(() => undefined);
  return {
    tenant_a: tenantA.tenantId,
    tenant_b: tenantB.tenantId,
    period: PERIOD,
    centers: report.body.centers.map((center) => ({ code: center.center_code, name: center.center_name, branch: center.branch_code })),
    accounts: Object.fromEntries(CONCEPTS.map((concept) => [concept.code, accounts[concept.code].id])),
    screenshots,
    browser_diagnostics: { console: consoleLogs, page_errors: pageErrors, failed_requests: failedRequests, report_requests: observedReports }
  };
}

function writeEvidence(status, payload, sources) {
  const evidence = {
    version: 2,
    certification: "transport-pyg-centers-browser-local",
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
      "PostgreSQL loopback con el esquema Prisma aplicado y apexos_accounting_private.ensure_standard_chart disponible.",
      "API local en LOCAL_API_URL (default http://127.0.0.1:3215) con DISABLE_REDIS=1.",
      "Web local en LOCAL_WEB_URL (default http://127.0.0.1:3004).",
      "Google Chrome en la ruta estandar o CHROME_BIN.",
      "DATABASE_URL loopback exportado; ejecutar desde la raiz del repositorio."
    ],
    checks,
    browser_diagnostics: { console: consoleLogs, page_errors: pageErrors, failed_requests: failedRequests, report_requests: observedReports },
    ...payload
  };
  fs.mkdirSync(evidenceDir, { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`);
  if (evidence.status !== "passed") process.exitCode = 1;
  console.log(JSON.stringify({ status: evidence.status, checks: checks.length, failed: checks.filter((item) => !item.ok).map((item) => item.name), output: relative(output) }));
}

main()
  .then((payload) => writeEvidence("passed", payload, collectSources()))
  .catch(async (error) => {
    await db.$disconnect().catch(() => undefined);
    const sources = (() => { try { return collectSources(); } catch { return {}; } })();
    writeEvidence("failed", { error: String(error?.stack || error), screenshots }, sources);
  });
