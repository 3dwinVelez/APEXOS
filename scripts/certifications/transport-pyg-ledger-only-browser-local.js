/* Certificacion local completa del PYG por vehiculo con fuente de libro unica
 * (ledger-only): el reporte por vehiculo SIEMPRE lee el libro contable del mes
 * pedido, sin activacion de fuente ni eleccion de fuente, y sin poder volver a
 * la fuente operativa historica. La web comparte el periodo entre el PYG
 * Contable (AccountingPyg) y la vista Por vehiculo, protege las respuestas
 * tardias (stale) para que nunca sobrescriban el mes finalmente seleccionado,
 * y la configuracion es solo de rangos PUC (la propuesta del Excel por defecto
 * ya funciona). Chrome real, API local real y Prisma local real; no se
 * interceptan peticiones para falsear respuestas (solo se difiere el envío
 * real con request.continue para certificar la guarda de obsolescencia), no hay
 * mocks de React y no se tocan entornos QA.
 *
 * Cubre:
 *  - GET/PUT /transport-pyg/account-configuration: fuente fija ledger, la
 *    propuesta del Excel queda activa por defecto, el GET nunca escribe
 *    tenant.config, el flag legacy "operational" almacenado se normaliza a
 *    ledger sin mutar la config, y el PUT con source "operational" se rechaza
 *    con 400 (nunca se puede restaurar la fuente operativa).
 *  - Reporte contable por vehiculo (asignacion por centro/placa, subtotales,
 *    sin clasificar, bloque SIN VEHICULO, reconciliacion contra el libro y
 *    contra el PYG Contable del mismo mes, presupuesto desde PYG Contable).
 *  - Aislamiento entre tenants y RBAC (lectura/escritura de contabilidad).
 *  - Fase de navegador real: periodo compartido Contable <-> Por vehiculo,
 *    totals nonzero coincidentes con el libro, configuracion solo de rangos
 *    (sin activacion ni restauracion operativa), edicion nombre/orden/rango/
 *    exclusion con persistencia, presupuesto PUC accesible y correcto, y
 *    guarda frente a respuestas tardias (cambio de mes mientras una peticion
 *    del mes previo sigue en vuelo).
 *  - Ventana ampliada (/dashboard/contabilidad/pyg/ampliado): el enlace nativo
 *    "Abrir en otra ventana" (aria-label real, target=_blank rel=noopener
 *    noreferrer, href de lib/pyg-expanded) se pulsa con click real de Chrome y
 *    la pestaña nueva se localiza con browser.waitForTarget por su URL ampliada
 *    (el opener DEBE ser null). La vista se contrasta contra la MISMA respuesta
 *    real de la API: sin <aside> lateral, un unico statement del vehiculo,
 *    importes del libro, heading y ancho completos, drill hasta cuenta y centro
 *    (nombres e importes leidos del DOM real), URL placa/periodo. Cambiar de
 *    placa o SIN_VEHICULO filtra los datos ya cargados SIN nuevo GET; cambiar
 *    de mes y F5 SI producen GET. Periodo invalido muestra seleccion requerida
 *    sin consultar la API y recupera al elegir un mes valido; una placa externa
 *    rechazada no muestra la lectura de otra placa. La lectura previa del
 *    popup (un unico statement real, sin guard) se certifica ANTES de "Volver
 *    al PYG", que navega en el popup hacia /dashboard/contabilidad/pyg SIN
 *    query con el <aside> restaurado, y el padre conserva placa/periodo
 *    intactos. Pantalla completa
 *    real solo si Chrome la soporta (se scrollea document.fullscreenElement y
 *    se sale con ElementHandle.click; si no, exige el fallback literal y lo
 *    registra), capturas y acceso denegado (403 real de la API + guard) para un
 *    rol sin accounting:read con sesion web real tras login limpio. Se
 *    conservan los 66 checks originales: dos casos imposibles (el periodo
 *    invalido que exigia un GET y la placa externa que esperaba fallback a otra
 *    placa) se reescribieron como seleccion requerida sin consulta y rechazo
 *    sin revelar otra placa, y se anadio recuperacion tras periodo invalido y
 *    GET real de F5. La ausencia del concepto padre renombrado en la vista
 *    ampliada era una expectation erronea (contradecia las esperanzas de
 *    presencia de la fase de configuracion, y ambas vistas comparten
 *    vehicle.rows y el mismo StatementTable); se sustituyo por
 *    browser_expanded_rows_match_inline_statement, que exige paridad DOM-a-DOM
 *    de filas, importes y presupuesto con el statement inline del mismo
 *    vehiculo y periodo. browser_coverage_completed exige que TODOS pasen.
 *
 * Prerequisitos: PostgreSQL loopback migrado, API parcheada en LOCAL_API_URL
 * (default http://127.0.0.1:3219), web parcheada compilada en LOCAL_WEB_URL
 * (default http://127.0.0.1:3011), Chrome instalado y DATABASE_URL loopback
 * exportado. Ejecutar desde la raiz del repositorio. No inicia ni detiene
 * servidores ni aplica migraciones ni toca esquemas remotos.
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
const accountConfigModule = require(path.join(root, "apps/api/src/modules/transport-pyg/account-config.js"));

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
const apiUrl = loopbackUrl("LOCAL_API_URL", process.env.LOCAL_API_URL || "http://127.0.0.1:3219");
const webUrl = loopbackUrl("LOCAL_WEB_URL", process.env.LOCAL_WEB_URL || "http://127.0.0.1:3011");
const output = path.resolve(root, process.env.BROWSER_EVIDENCE_PATH || "docs/qa/evidence/transport-pyg-ledger-only-20261026/browser-local.json");
const evidenceDir = path.dirname(output);
const browserPath = process.env.CHROME_BIN || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const suffix = crypto.randomBytes(5).toString("hex");
const checks = [];
const db = new PrismaClient();

const SOCIETY = "SOC-PYG";
const B1 = "NORTE";
const C1 = "CC-NORTE-1";
const PERIOD = "2026-08";
const JULY = "2026-07";
const V1_PLATE = "RVQ101";
const V2_PLATE = "RVQ102";

const screenshots = {};
const shot = (name) => path.join(evidenceDir, `${name}-${suffix}.png`);
const consoleLogs = [];
const pageErrors = [];
const failedRequests = [];
const observedRequests = [];
const dialogs = [];
const fullscreenBranches = [];
const MAX_LOG_ENTRIES = 200;
const MAX_TEXT_CHARS = 20000;

function pushBounded(list, entry) {
  list.push(entry);
  if (list.length > MAX_LOG_ENTRIES) list.shift();
}

const SOURCE_FILES = {
  api_account_config: "apps/api/src/modules/transport-pyg/account-config.js",
  api_account_engine: "apps/api/src/modules/transport-pyg/account-engine.js",
  api_account_config_service: "apps/api/src/modules/transport-pyg/account-config-service.js",
  api_service: "apps/api/src/modules/transport-pyg/service.js",
  api_routes: "apps/api/src/modules/transport-pyg/routes.js",
  api_schema: "apps/api/src/modules/transport-pyg/schema.js",
  api_engine: "apps/api/src/modules/transport-pyg/engine.js",
  api_pyg_interactive: "apps/api/src/modules/accounting/pyg-interactive.js",
  web_api_client: "apps/web/lib/api.ts",
  web_config_lib: "apps/web/lib/transport-pyg-account-config.ts",
  web_config_component: "apps/web/components/transport-pyg/TransportPygAccountConfig.tsx",
  web_pyg_page: "apps/web/app/dashboard/contabilidad/pyg/page.tsx",
  web_accounting_component: "apps/web/components/accounting/AccountingPyg.tsx",
  web_pyg_expanded_lib: "apps/web/lib/pyg-expanded.ts",
  web_pyg_expanded_page: "apps/web/app/dashboard/contabilidad/pyg/ampliado/page.tsx",
  web_pyg_expanded_component: "apps/web/components/accounting/PygVehicleExpanded.tsx",
  web_statement_table: "apps/web/components/accounting/PygStatementTable.tsx",
  web_account_drill: "apps/web/components/accounting/PygAccountDrill.tsx",
  web_vehicle_readings: "apps/web/components/accounting/PygVehicleReadings.tsx",
  web_dashboard_chrome: "apps/web/components/shell/DashboardChrome.tsx",
  web_route_access_guard: "apps/web/components/shell/RouteAccessGuard.tsx",
  web_sidebar: "apps/web/components/shell/Sidebar.tsx",
  web_contabilidad_nav: "apps/web/components/contabilidad-nav.tsx",
  script: "scripts/certifications/transport-pyg-ledger-only-browser-local.js"
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

async function registerTenant(label) {
  const email = `${label}-${suffix}@apexos.local`;
  const password = `Pyg-Ledger-${suffix}9!`;
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

// Altura de la cadena PUC: las cuentas de agrupacion (1, 2, 4 y 6 digitos) no
// admiten movimientos; solo el auxiliar de 8 digitos es transaccional.
const ACCOUNT_LEVELS = [1, 2, 4, 6, 8];
function accountDepth(code) {
  return ACCOUNT_LEVELS.indexOf(String(code).length);
}
function accountParentCode(code) {
  const parentLength = ACCOUNT_LEVELS[accountDepth(code) - 1];
  return parentLength ? String(code).slice(0, parentLength) : null;
}
function accountAllowsTx(code) {
  return String(code).length === 8;
}

async function ensureAccount(token, tenantId, code, name, type, parentCode = accountParentCode(code)) {
  const existing = await db.account.findFirst({ where: { tenant_id: tenantId, code } });
  if (existing) return existing;
  if (accountDepth(code) < 1) throw new Error(`account_${code}_not_puc_code`);
  if (parentCode !== accountParentCode(code)) throw new Error(`account_${code}_invalid_parent_${parentCode}`);
  if (parentCode) {
    const parent = await ensureAccount(token, tenantId, parentCode, `${name} (agrupacion PUC ${parentCode})`, type);
    if (parent.active !== true) throw new Error(`account_${code}_inactive_parent_${parent.code}`);
  }
  const result = await apiCall("POST", "/accounting/accounts", token, { code, name, type, parent_code: parentCode || undefined, active: true, allows_tx: accountAllowsTx(code) });
  if ([200, 201].includes(result.status)) {
    const created = await db.account.findFirst({ where: { tenant_id: tenantId, code } });
    if (!created) throw new Error(`account_${code}_missing_after_create`);
    return created;
  }
  const raced = await db.account.findFirst({ where: { tenant_id: tenantId, code } });
  if (raced) return raced;
  throw new Error(`account_${code}_failed status=${result.status} code=${result.body?.code || ""} message=${result.body?.message || ""}`.trim());
}

async function ensureCashAccount(token, tenantId) {
  const existing = await pickAccount(tenantId, "11");
  if (existing) return { account: existing, created: false };
  const account = await ensureAccount(token, tenantId, "11050501", "Caja general cautiva QA", "asset");
  if (account.active !== true || account.allows_tx !== true) throw new Error("account_11050501_not_transactional_after_create");
  return { account, created: true };
}

async function seedOrganization(token, tenantId) {
  const units = [
    { type: "society", code: SOCIETY, name: "Sociedad PYG QA" },
    { type: "branch", code: B1, name: "Sucursal Norte PYG QA", society_code: SOCIETY },
    { type: "cost_center", code: C1, name: "Centro Norte PYG QA", society_code: SOCIETY, branch_code: B1 }
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

async function setRolePermissions(tenantId, email, name, entries) {
  const user = await db.user.findFirst({ where: { tenant_id: tenantId, email } });
  if (!user?.role_id) throw new Error(`role_not_found_for_${email}`);
  await db.role.update({ where: { id: user.role_id }, data: { name, metadata: {} } });
  await db.permission.deleteMany({ where: { role_id: user.role_id } });
  for (const entry of entries) {
    await db.permission.create({ data: { role_id: user.role_id, module: entry.module, action: entry.action } });
  }
  const { invalidateTenantCache } = require(path.join(root, "apps/api/src/core/tenantCache.js"));
  await invalidateTenantCache(tenantId);
}

// Reaplica permisos y renueva el token del tenant (el login relee rol/permisos).
async function applyPermissionsAndRelogin(tenant, name, entries) {
  await setRolePermissions(tenant.tenantId, tenant.email, name, entries);
  const relogin = await apiCall("POST", "/auth/login", null, { email: tenant.email, password: tenant.password });
  if (relogin.status !== 200 || !relogin.body?.token) throw new Error(`relogin_failed status=${relogin.status}`);
  tenant.token = relogin.body.token;
  return relogin.body.token;
}
const FULL_PERMISSIONS = () => [
  { module: "accounting", action: "read" }, { module: "accounting", action: "write" },
  { module: "transport", action: "read" }, { module: "transport", action: "write" }
];
const READER_PERMISSIONS = () => [
  { module: "accounting", action: "read" }, { module: "transport", action: "read" }
];

async function login(page, email, password) {
  await page.goto(`${webUrl}/login`, { waitUntil: "networkidle2" });
  await page.waitForSelector('input[name="email"]', { visible: true, timeout: 45000 });
  await page.waitForSelector('input[name="password"]', { visible: true, timeout: 45000 });
  const pending = page.waitForResponse((response) => new URL(response.url()).pathname.endsWith("/api/v1/auth/login") && response.request().method() === "POST", { timeout: 45000 });
  pending.catch(() => undefined);
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
  await page.waitForFunction((text) => [...document.querySelectorAll("button")].some((node) => {
    const full = (node.textContent || "").trim();
    const direct = [...node.children].filter((child) => child.tagName === "SPAN").map((child) => (child.textContent || "").trim());
    return (full === text || direct.includes(text)) && !node.disabled;
  }), { timeout: 20000 }, label);
  const alreadyActive = await page.evaluate((text) => [...document.querySelectorAll("nav button")].some((node) => {
    const full = (node.textContent || "").trim();
    const direct = [...node.children].filter((child) => child.tagName === "SPAN").map((child) => (child.textContent || "").trim());
    return (full === text || direct.includes(text)) && node.className.includes("bg-apex");
  }), label).catch(() => false);
  if (alreadyActive) return;
  const found = await page.evaluate((text) => {
    const button = [...document.querySelectorAll("button")].find((node) => {
      const full = (node.textContent || "").trim();
      const direct = [...node.children].filter((child) => child.tagName === "SPAN").map((child) => (child.textContent || "").trim());
      return (full === text || direct.includes(text)) && !node.disabled;
    });
    if (!button) return false;
    button.scrollIntoView();
    button.click();
    return true;
  }, label);
  if (!found) throw new Error(`button_not_found:${label}`);
}

async function clickTab(page, label) {
  await page.waitForFunction((text) => {
    const navs = [...document.querySelectorAll("nav")].filter((node) => node.className.includes("overflow-x-auto")
      && [...node.querySelectorAll("button")].some((button) => (button.textContent || "").trim() === "Consolidado"));
    for (const nav of navs) {
      const button = [...nav.querySelectorAll("button")].find((node) => (node.textContent || "").trim() === text && !node.disabled);
      if (button) return true;
    }
    return false;
  }, { timeout: 20000 }, label);
  await page.evaluate((text) => {
    const navs = [...document.querySelectorAll("nav")].filter((node) => node.className.includes("overflow-x-auto")
      && [...node.querySelectorAll("button")].some((button) => (button.textContent || "").trim() === "Consolidado"));
    for (const nav of navs) {
      const button = [...nav.querySelectorAll("button")].find((node) => (node.textContent || "").trim() === text && !node.disabled);
      if (!button) continue;
      if (button.className.includes("bg-apex")) return;
      button.click();
      return;
    }
    throw new Error("tab_not_found:" + text);
  }, label);
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
    if (!url.includes("/api/v1/transport-pyg/") && !url.includes("/api/v1/accounting/reports/pyg-interactive")) return;
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
        pyg_corporativo: matches("PYG corporativo"),
        rangos_puc: matches("Rangos PUC · Agrupación de cuentas del PYG por vehículo"),
        fuente_contable: matches("FUENTE: LIBRO CONTABLE (ASIENTOS)"),
        fuente_operativa: matches("FUENTE: OPERATIVA HISTÓRICA"),
        usar_excel: matches("Usar estructura del Excel"),
        restaurar_operativa: matches("Volver a fuente operativa"),
        sin_vehiculo: matches("Sin vehículo / sin asignar"),
        reconciliacion: matches("Reconciliación con el libro"),
        presupuesto_puc: matches("Presupuesto PUC")
      };
    });
  } catch (error) { captured.error = `${captured.error ? `${captured.error} | ` : ""}markers: ${String(error?.message || error)}`; }
  return captured;
}

// Acepta texto de moneda regional ("$ 400", "400,00", "COP 400", "(400)") sin
// fijar el simbolo ni el separador: solo exige que el valor sea exactamente el
// esperado.
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

// El periodo lo comparten el PYG Contable (AccountingPyg) y la vista Por
// vehiculo: se localiza el unico input month visible de la vista activa.
function readVisibleMonthInput(page) {
  return page.evaluate(() => {
    const input = [...document.querySelectorAll('input[type="month"]')].find((node) => {
      const box = node.getBoundingClientRect();
      return box.width > 0 && box.height > 0;
    });
    return input ? input.value : null;
  });
}

// En la ventana ampliada conviven el selector de vehiculo (input horario) y el
// del periodo (month): el filtro por atributo evita pulsar el equivocado.
function readExpandedMonthInput(page) {
  return page.evaluate(() => {
    const input = [...document.querySelectorAll('input[type="month"]')].find((node) => {
      const box = node.getBoundingClientRect();
      return box.width > 0 && box.height > 0;
    });
    return input ? input.value : null;
  });
}

function setExpandedMonthInput(page, next) {
  return page.evaluate((value) => {
    const input = [...document.querySelectorAll('input[type="month"]')].find((node) => {
      const box = node.getBoundingClientRect();
      return box.width > 0 && box.height > 0;
    });
    if (!input) throw new Error("expanded_month_input_not_found");
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, next);
}

function setVisibleMonthInput(page, next) {
  return page.evaluate((value) => {
    const input = [...document.querySelectorAll('input[type="month"]')].find((node) => {
      const box = node.getBoundingClientRect();
      return box.width > 0 && box.height > 0;
    });
    if (!input) throw new Error("month_input_not_found");
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, next);
}

async function setVehiclePeriod(page, period, waitForReport = true) {
  const current = await readVisibleMonthInput(page);
  if (!current) throw new Error("month_input_missing");
  if (current === period) return;
  const pending = waitForReport
    ? page.waitForResponse((response) => response.url().includes("/api/v1/transport-pyg/report") && new URL(response.url()).searchParams.get("period") === period && response.request().method() === "GET", { timeout: 60000 })
    : null;
  pending?.catch(() => undefined);
  await setVisibleMonthInput(page, period);
  if (pending) await pending;
}

// Tabla de estado (StatementTable): la cabecera "Cumplimiento" la distingue de
// la matriz. El label primario de la fila excluye los badges hermanos. En la
// fila de centro (PygAccountDrill) el td trae title="Centro ... · Sucursal ..."
// con el nombre en span.text-content-strong y la sucursal en span.ml-1: el
// label primario es SOLO el span hijo con el nombre (la sucursal queda en
// rowText y el detalle conserva "· Sucursal ...").
async function readStatementTables(page) {
  return page.evaluate(() => {
    const headerMatcher = (table) => [...table.querySelectorAll("thead th")].some((th) => (th.textContent || "").trim().toLowerCase() === "cumplimiento");
    const centerCell = (cell) => /^Centro .+ · Sucursal /.test(String(cell.getAttribute("title") || "").trim());
    const primaryLabel = (cell) => {
      if (centerCell(cell)) {
        const nameSpan = [...cell.children].find((node) => node.tagName === "SPAN" && node.classList.contains("text-content-strong"));
        if (nameSpan) return (nameSpan.textContent || "").replace(/\s+/g, " ").trim();
      }
      const drill = cell.querySelector('button[aria-label^="Desglosar "]');
      if (drill) {
        const span = drill.querySelector("span.truncate");
        if (span) return (span.textContent || "").replace(/\s+/g, " ").trim();
      }
      const text = [...cell.childNodes].filter((n) => n.nodeType === Node.TEXT_NODE).map((n) => n.textContent || "").join("").replace(/\s+/g, " ").trim();
      if (text) return text;
      const clone = cell.cloneNode(true);
      clone.querySelectorAll("span.ml-2, svg").forEach((n) => n.remove());
      return (clone.textContent || "").replace(/\s+/g, " ").trim();
    };
    const tables = [...document.querySelectorAll("table")].filter(headerMatcher);
    return tables.map((table) => [...table.querySelectorAll("tbody tr")].map((row) => {
      const cells = [...row.querySelectorAll("td")];
      return {
        label: primaryLabel(cells[0]),
        budget: (cells[1]?.innerText || "").trim(),
        actual: (cells[2]?.innerText || "").trim(),
        rowText: (row.innerText || "").replace(/\s+/g, " ").trim()
      };
    }));
  });
}

function statementRow(tables, tableIndex, label) {
  const rows = tables[tableIndex] || [];
  return rows.find((row) => row.label === label) || null;
}

// Editor de Rangos PUC: localiza el articulo del concepto por su input de
// codigo y edita un campo (order | code | name) con los setters nativos.
async function setConceptField(page, conceptCode, field, value) {
  await page.evaluate(({ conceptCode, field, value }) => {
    const articles = [...document.querySelectorAll("article")];
    const article = articles.find((node) => [...node.querySelectorAll("input")].some((input) => String(input.value || "").toUpperCase() === String(conceptCode).toUpperCase()));
    if (!article) throw new Error("concept_article_not_found:" + conceptCode);
    const labels = [...article.querySelectorAll("label")];
    const input = labels.find((node) => (node.firstChild?.textContent || "").replace(/\s+/g, " ").trim() === field)?.querySelector("input");
    if (!input) throw new Error("concept_field_not_found:" + field);
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, { conceptCode, field, value });
}

async function setRangeField(page, conceptCode, ariaPrefix, value) {
  await page.evaluate(({ conceptCode, ariaPrefix, value }) => {
    const articles = [...document.querySelectorAll("article")];
    const article = articles.find((node) => [...node.querySelectorAll("input")].some((input) => String(input.value || "").toUpperCase() === String(conceptCode).toUpperCase()));
    if (!article) throw new Error("concept_article_not_found:" + conceptCode);
    const input = [...article.querySelectorAll("input")].find((node) => String(node.getAttribute("aria-label") || "").startsWith(ariaPrefix));
    if (!input) throw new Error("range_input_not_found:" + ariaPrefix);
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, { conceptCode, ariaPrefix, value });
}

async function clickInConcept(page, conceptCode, label) {
  await page.evaluate(({ conceptCode, label }) => {
    const articles = [...document.querySelectorAll("article")];
    const article = articles.find((node) => [...node.querySelectorAll("input")].some((input) => String(input.value || "").toUpperCase() === String(conceptCode).toUpperCase()));
    if (!article) throw new Error("concept_article_not_found:" + conceptCode);
    const button = [...article.querySelectorAll("button")].find((node) => (node.textContent || "").includes(label) && !node.disabled);
    if (!button) throw new Error("concept_button_not_found:" + label);
    button.click();
  }, { conceptCode, label });
}

async function conceptFieldValue(page, conceptCode, field) {
  return page.evaluate(({ conceptCode, field }) => {
    const articles = [...document.querySelectorAll("article")];
    const article = articles.find((node) => [...node.querySelectorAll("input")].some((input) => String(input.value || "").toUpperCase() === String(conceptCode).toUpperCase()));
    if (!article) return null;
    const labels = [...article.querySelectorAll("label")];
    const input = labels.find((node) => (node.firstChild?.textContent || "").replace(/\s+/g, " ").trim() === field)?.querySelector("input");
    return input ? input.value : null;
  }, { conceptCode, field });
}

function rowOf(entry, code) {
  return (entry?.rows || []).find((row) => row.code === code) || null;
}

// ---------------------------------------------------------------- ventana ampliada

const EXPANDED_PATH = "/dashboard/contabilidad/pyg/ampliado";
// Etiqueta nativa del enlace (page.tsx: ExpandedWindowLink). El guion no la
// inventa: debe coincidir con el aria-label real del producto.
const PLATE_LINK_LABEL = "Abrir el PYG del vehículo en una pestaña o ventana nueva";
const PLATE_LINK_TEXT = "Abrir en otra ventana";
const FULLSCREEN_ENTER_LABEL = "Pantalla completa";
const FULLSCREEN_EXIT_LABEL = "Salir de pantalla completa";

// Click de puntero real sobre un boton buscado por texto exacto, con
// scrollIntoView propio del ElementHandle antes de medir/clicar (en pantalla
// completa el boton puede quedar fuera del viewport).
async function clickButtonByText(page, label) {
  const handle = await page.evaluateHandle((text) => [...document.querySelectorAll("button")].find((node) => {
    const full = (node.textContent || "").trim();
    const direct = [...node.children].filter((child) => child.tagName === "SPAN").map((child) => (child.textContent || "").trim());
    return (full === text || direct.includes(text)) && !node.disabled;
  }) || null, label);
  const element = handle.asElement();
  if (!element) { await handle.dispose().catch(() => undefined); throw new Error(`button_not_found:${label}`); }
  try {
    await element.scrollIntoViewIfNeeded();
    await element.click();
  } finally {
    await handle.dispose().catch(() => undefined);
  }
}

// El boton de pantalla completa (Alternar) se pulsa por su texto exacto y
// visible con click de puntero real: requestFullscreen exige gesto de usuario.
async function clickTextButton(page, label) {
  const box = await page.evaluate((text) => {
    const node = [...document.querySelectorAll("button")].find((button) => (button.textContent || "").trim() === text
      && !button.disabled
      && button.getBoundingClientRect().width > 0 && button.getBoundingClientRect().height > 0);
    if (!node) return null;
    const rect = node.getBoundingClientRect();
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  }, label);
  if (!box) throw new Error(`button_not_found:${label}`);
  await page.mouse.click(box.x, box.y);
}

function expandedPathOf(url) {
  try { return new URL(url).pathname; } catch { return ""; }
}

function isExpandedUrl(url) {
  return expandedPathOf(url) === EXPANDED_PATH;
}

function queryOf(url) {
  try { return Object.fromEntries(new URL(url, webUrl).searchParams.entries()); } catch { return {}; }
}

// El sidebar real es el <aside> pegajoso del DashboardChrome (con el boton
// "Ocultar menú"/"Expandir menú"); no existen los aria-label que usaba esta
// fase antes. Se mide visibilidad y bounds reales.
function readSidebarState(page) {
  return page.evaluate(() => {
    const aside = [...document.querySelectorAll("aside")].find((node) => {
      const box = node.getBoundingClientRect();
      return box.width > 0 && box.height > 0;
    });
    const toggle = aside ? [...aside.querySelectorAll("button")].find((node) => ["Ocultar menú", "Expandir menú"].includes(String(node.getAttribute("aria-label") || ""))) : null;
    return {
      present: Boolean(aside),
      width: aside ? Math.round(aside.getBoundingClientRect().width) : 0,
      height: aside ? Math.round(aside.getBoundingClientRect().height) : 0,
      toggleLabel: toggle ? String(toggle.getAttribute("aria-label")) : null
    };
  });
}

// Ancho de un elemento respecto al contenedor principal de la vista ampliada.
function expandedHeadingLayout(page, title) {
  return page.evaluate((expected) => {
    const heading = [...document.querySelectorAll("h2")].find((node) => (node.textContent || "").trim() === expected);
    const section = heading?.closest("section");
    const main = document.querySelector("#apex-main-content");
    const unassigned = [...document.querySelectorAll("h2")].some((node) => (node.textContent || "").trim().startsWith("Sin vehículo / sin asignar · "));
    const visibleAside = [...document.querySelectorAll("aside")].find((node) => {
      const box = node.getBoundingClientRect();
      return box.width > 0 && box.height > 0;
    });
    // main.clientWidth excluye borde y scrollbar pero incluye padding: el ancho
    // realmente disponible para el contenido es clientWidth menos el padding
    // horizontal, y es ese valor el que debe compararse con la seccion.
    const mainStyle = main ? getComputedStyle(main) : null;
    const mainOuterWidth = main?.getBoundingClientRect().width || 0;
    const mainPaddingLeft = parseFloat(mainStyle?.paddingLeft || "0") || 0;
    const mainPaddingRight = parseFloat(mainStyle?.paddingRight || "0") || 0;
    const mainContentWidth = main ? main.clientWidth - mainPaddingLeft - mainPaddingRight : 0;
    return {
      found: Boolean(heading),
      sectionWidth: section?.getBoundingClientRect().width || 0,
      mainWidth: mainContentWidth,
      mainOuterWidth,
      mainClientWidth: main?.clientWidth || 0,
      mainPaddingLeft,
      mainPaddingRight,
      sidebar: Boolean(visibleAside),
      otherMenuButtons: [...document.querySelectorAll("button")].filter((node) => ["Consolidado", "Por vehículo", "Configuración", "Contable · PUC"].includes((node.textContent || "").trim())).length,
      statementTables: [...document.querySelectorAll("table")].filter((table) => [...table.querySelectorAll("thead th")].some((th) => (th.textContent || "").trim().toLowerCase() === "cumplimiento")).length,
      hasPlateMatrix: document.body.innerText.includes("Matriz de ejecutados por placa"),
      unassignedVisible: unassigned
    };
  }, title);
}

// Primera tabla de estado (cabecera "Cumplimiento") de la vista ampliada.
async function readFirstStatementTable(page) {
  const rows = await readStatementTables(page);
  return rows[0] || [];
}

// El enlace nativo del PYG por vehiculo: target/rel/href de lib/pyg-expanded y
// etiqueta accesible. Se lee del DOM padre ANTES de pulsarlo, pero el href de
// destino se vuelve a leer en el momento del clic (nunca guardado antes de
// cambios de placa/periodo).
function readExpandedLinkAttributes(page) {
  return page.evaluate(({ path, label, text }) => {
    const link = [...document.querySelectorAll(`a[aria-label="${label}"]`)].find((node) => {
      const box = node.getBoundingClientRect();
      return box.width > 0 && box.height > 0;
    });
    if (!link) return null;
    const url = new URL(link.href, location.origin);
    return {
      text: (link.textContent || "").replace(/\s+/g, " ").trim(),
      target: link.getAttribute("target"),
      rel: link.getAttribute("rel"),
      sameOrigin: url.origin === location.origin,
      pathname: url.pathname,
      expectedPath: path,
      plate: url.searchParams.get("placa"),
      period: url.searchParams.get("periodo"),
      expectedText: text
    };
  }, { path: EXPANDED_PATH, label: PLATE_LINK_LABEL, text: PLATE_LINK_TEXT });
}

// Click real de Chrome sobre el enlace nativo (no page.goto). La pestaña nueva
// se localiza con browser.waitForTarget por su URL ampliada y se exige
// window.opener === null (rel=noopener real).
async function clickExpandedLink(page, expected) {
  const parentTarget = page.target();
  const targetPromise = page.browser().waitForTarget((candidate) => candidate !== parentTarget && isExpandedUrl(candidate.url()), { timeout: 45000 });
  targetPromise.catch(() => undefined);
  const clicked = await page.evaluate((label) => {
    const link = [...document.querySelectorAll(`a[aria-label="${label}"]`)].find((node) => {
      const box = node.getBoundingClientRect();
      return box.width > 0 && box.height > 0;
    });
    if (!link) return null;
    link.scrollIntoView({ block: "center" });
    const rect = link.getBoundingClientRect();
    return { href: link.getAttribute("href"), x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  }, PLATE_LINK_LABEL);
  if (!clicked) throw new Error("expanded_link_not_found_at_click_time");
  await page.mouse.click(clicked.x, clicked.y);
  const target = await targetPromise;
  const expanded = await target.page();
  if (!expanded) throw new Error("PREREQUISITO: la ventana emergente no expuso una página CDP (Chrome sin soporte de pestañas emergentes).");
  attachDiagnostics(expanded);
  await expanded.bringToFront();
  // El target puede aparecer con la pagina aun en about:blank (document.body
  // null): esperar el DOM sin provocar otra navegacion antes de evaluar.
  await expanded.waitForFunction(() => Boolean(document.body), { timeout: 45000, polling: "raf" });
  await expanded.setViewport({ width: 1440, height: 900 });
  expanded.setDefaultTimeout(20000);
  expanded.setDefaultNavigationTimeout(60000);
  await expanded.waitForFunction((path) => location.pathname === path, { timeout: 45000 }, EXPANDED_PATH);
  // rel=noopener hace que window.opener sea null de forma ASINCRONA (el agente
  // de navegacion lo libera tras el commit): se espera con timeout en lugar de
  // leerlo una sola vez. Si la pestaña conservara un opener real, esto falla.
  let opener = false;
  try {
    await expanded.waitForFunction(() => window.opener === null, { timeout: 10000 });
    opener = true;
  } catch { opener = false; }
  const query = queryOf(expanded.url());
  if (expected) {
    check("browser_expanded_opened_from_real_click_with_expected_query", opener === true && query.placa === expected.plate && query.periodo === expected.period && String(clicked.href || "").includes(expected.plate) && String(clicked.href || "").includes(expected.period), { opener_null: opener, query, expected, href_at_click: clicked.href });
  }
  return { target, expanded };
}

async function closeExpanded(expanded) {
  if (!expanded) return;
  try {
    const target = expanded.target();
    await target?.close?.();
  } catch { /* la pestaña ya se cerro */ }
  await expanded.close().catch(() => undefined);
}

// ---------------------------------------------------------------- payloads de configuracion

function proposalConcepts() {
  return accountConfigModule.cloneProposal().concepts;
}

// El desarrollo ledger-only elimina la eleccion de fuente: el unico PUT valido
// es source "accounting" y "operational" queda rechazado (nunca se restaura la
// fuente operativa historica).
function operationalPayload() {
  return { source: "operational", concepts: proposalConcepts() };
}

// Configuracion personalizada del flujo: INGRESOS con exclusion de 41450501 y
// concepto nuevo INGRESOS_SERVICIO (desambiguacion por exclusion).
function customConfigConcepts() {
  const concepts = proposalConcepts();
  const ingresos = concepts.find((concept) => concept.code === "INGRESOS");
  ingresos.name = "INGRESOS OPERATIVOS";
  ingresos.exclusions = [{ start: "41450501", end: "41450501" }];
  concepts.splice(1, 0, { code: "INGRESOS_SERVICIO", name: "INGRESOS SERVICIO ESPECIAL", section: "ingresos", kind: "income", order: 1, ranges: [{ start: "41450501", end: "41450501" }], exclusions: [] });
  return concepts;
}

// ---------------------------------------------------------------- main

async function main() {
  await waitForServer(apiUrl, ["/health", "/api/v1/health"]);
  if (!fs.existsSync(browserPath)) throw new Error(`PREREQUISITO: no existe Chrome en ${browserPath}`);
  const sources = collectSources();
  fs.mkdirSync(evidenceDir, { recursive: true });

  await db.$connect();
  const tenantA = await registerTenant("pyg-ledger-a");
  const tenantB = await registerTenant("pyg-ledger-b");
  await setRolePermissions(tenantA.tenantId, tenantA.email, "CERT_PYG_ROLE", FULL_PERMISSIONS());
  await setRolePermissions(tenantB.tenantId, tenantB.email, "CERT_PYG_ROLE_B", FULL_PERMISSIONS());

  const accountCount = await db.account.count({ where: { tenant_id: tenantA.tenantId } });
  check("fixture_standard_chart_initialized", accountCount >= 2500, { accounts: accountCount });

  await seedOrganization(tenantA.token, tenantA.tenantId);
  const party = await db.party.create({ data: { tenant_id: tenantA.tenantId, type: "customer", name: "Cliente PYG QA", active: true } });

  // Cuentas exactas del flujo (8 digitos). ensureAccount asegura la cadena PUC
  // completa por prefijo antes de crear (padres reales, nunca inventados).
  const accounts = {
    income_service: await ensureAccount(tenantA.token, tenantA.tenantId, "41450501", "Servicio transporte QA", "income"),
    income_noop: await ensureAccount(tenantA.token, tenantA.tenantId, "42100501", "Ingreso no operativo QA", "income"),
    income_unclassified: await ensureAccount(tenantA.token, tenantA.tenantId, "42950501", "Ingreso sin clasificar QA", "income"),
    expense_personal: await ensureAccount(tenantA.token, tenantA.tenantId, "52050601", "Sueldos QA", "expense"),
    expense_fuel: await ensureAccount(tenantA.token, tenantA.tenantId, "52953501", "Combustible QA", "expense"),
    expense_maintenance: await ensureAccount(tenantA.token, tenantA.tenantId, "52454001", "Mantenimiento vehicular QA", "expense"),
    expense_unclassified: await ensureAccount(tenantA.token, tenantA.tenantId, "51050601", "Gasto sin clasificar QA", "expense"),
    tax_group: await ensureAccount(tenantA.token, tenantA.tenantId, "541005", "Impuesto regimen simple QA grupo", "expense"),
    tax_simple: await ensureAccount(tenantA.token, tenantA.tenantId, "54100501", "Impuesto regimen simple QA", "expense")
  };
  for (const [key, account] of Object.entries(accounts)) {
    const expectedLength = key === "tax_group" ? 6 : 8;
    if (String(account.code).length !== expectedLength) throw new Error(`fixture_${key}_length_${account.code}`);
    const transactional = key === "tax_group" ? account.active === true : account.active === true && account.allows_tx === true;
    if (!transactional) throw new Error(`fixture_${key}_not_${key === "tax_group" ? "active" : "transactional"}_${account.code}`);
  }
  const accountById = (id, tenantId) => db.account.findFirst({ where: { tenant_id: tenantId, id } });
  const parentOf = (account, tenantId) => accountById(account.parent_id, tenantId);
  const ancestorsOf = async (account, tenantId) => {
    const chain = [];
    let current = account;
    while (String(current.code).length > 1) {
      const parent = await parentOf(current, tenantId);
      chain.push({ child: String(current.code), parent });
      if (!parent) break;
      current = parent;
    }
    return chain;
  };
  const auxiliaries = Object.entries(accounts).filter(([, account]) => /^\d{8}$/.test(String(account.code)));
  const chains = await Promise.all(auxiliaries.map(([, account]) => ancestorsOf(account, tenantA.tenantId)));
  const chainRowsOk = chains.every((chain) => chain.every((link) => link.parent
    && String(link.parent.code) === accountParentCode(link.child)
    && link.parent.active === true));
  const taxParent = await parentOf(accounts.tax_simple, tenantA.tenantId);
  check("fixture_accounts_created_under_real_puc_parents",
    auxiliaries.length === 8
      && chainRowsOk
      && Boolean(taxParent)
      && String(taxParent.code) === "541005"
      && String(accounts.tax_group.parent_id) === String((await parentOf(accounts.tax_group, tenantA.tenantId))?.id ?? "")
      && String(accounts.tax_simple.parent_id) === String(accounts.tax_group.id)
      && accounts.tax_group.type === "expense" && accounts.tax_simple.type === taxParent.type,
    { chains: chains.map((chain) => chain.map((link) => `${link.child}<-${link.parent?.code || null}`)), tax_group: accounts.tax_group.code, tax_group_type: accounts.tax_group.type, tax_group_parent: taxParent?.code || null, tax_simple_type: accounts.tax_simple.type });
  const cashSetup = await ensureCashAccount(tenantA.token, tenantA.tenantId);
  const cash = cashSetup.account;
  check("fixture_accounts_resolved", Object.values(accounts).every(Boolean) && Boolean(cash), { accounts: Object.fromEntries(Object.entries(accounts).map(([key, row]) => [key, row?.code])), cash: cash?.code, cash_created: cashSetup.created });

  // Vehiculos: la creacion enlaza el centro contable (placa) a la sucursal B1.
  const createVehicle = async (plate, line) => {
    const result = await apiCall("POST", "/transport/vehicles", tenantA.token, {
      plate, type: "camion", brand: "Toyota", line, model: "2025", ownership_type: "propio", base_site: "BOG", accounting_branch_code: B1
    });
    if (![200, 201].includes(result.status)) throw new Error(`vehicle_${plate}_failed status=${result.status} code=${result.body?.code || ""} message=${result.body?.message || ""}`.trim());
    const row = await db.vehicle.findFirst({ where: { tenant_id: tenantA.tenantId, plate } });
    if (!row) throw new Error(`vehicle_${plate}_missing_after_create`);
    return row;
  };
  const vehicle1 = await createVehicle(V1_PLATE, "Hilux");
  const vehicle2 = await createVehicle(V2_PLATE, "Hilux");
  const tenantConfigAfterVehicles = await db.tenant.findUnique({ where: { id: tenantA.tenantId }, select: { config: true } });
  const vehicleCenters = tenantConfigAfterVehicles.config?.accounting?.organization_tree?.cost_centers || [];
  check("fixture_vehicle_centers_linked_in_org_tree",
    vehicleCenters.some((row) => row.code === V1_PLATE && Number(row.vehicle_id) === Number(vehicle1.id) && row.branch_code === B1)
      && vehicleCenters.some((row) => row.code === V2_PLATE && Number(row.vehicle_id) === Number(vehicle2.id) && row.branch_code === B1),
    { centers: vehicleCenters.map((row) => ({ code: row.code, vehicle_id: row.vehicle_id, branch_code: row.branch_code })) });

  // ---------------------------------------------------------------- GET/PUT account-configuration (ledger-only)
  // Sin configuracion guardada, el GET ya informa la fuente ledger y la
  // propuesta del Excel (que queda activa por defecto, sin activacion).
  const configGet1 = await apiCall("GET", "/transport-pyg/account-configuration", tenantA.token);
  const proposal = configGet1.body?.proposal;
  check("config_get_ledger_default_with_proposal",
    configGet1.status === 200
      && configGet1.body?.source === "accounting"
      && configGet1.body?.has_config === false
      && configGet1.body?.config === null
      && configGet1.body?.proposal_from === "excel-presupuesto"
      && proposal?.source === "accounting"
      && Array.isArray(proposal?.concepts) && proposal.concepts.length === 26,
    { status: configGet1.status, body: configGet1.body && { source: configGet1.body.source, has_config: configGet1.body.has_config, proposal_from: configGet1.body.proposal_from, concepts: proposal?.concepts?.length } });
  check("config_proposal_matches_excel_structure",
    proposal?.concepts?.[0]?.code === "INGRESOS"
      && proposal.concepts[0].ranges?.[0]?.start === "41450101"
      && proposal.concepts[0].ranges?.[0]?.end === "41999999"
      && proposal.concepts.find((concept) => concept.code === "UTILIDAD_ANTES_DE_IMPUESTOS")?.name?.includes("ANTES DE PROVISIONES")
      && proposal.concepts.find((concept) => concept.code === "DEPRECIACION")?.kind === "informational"
      && proposal.concepts.find((concept) => concept.code === "CREDITOS")?.ranges?.length === 0
      && proposal.concepts.find((concept) => concept.code === "TOTAL_INGRESOS")?.kind === "subtotal_ingresos",
    { first: proposal?.concepts?.[0] });

  const configGet2 = await apiCall("GET", "/transport-pyg/account-configuration", tenantA.token);
  const tenantConfigAfterGets = await db.tenant.findUnique({ where: { id: tenantA.tenantId }, select: { config: true } });
  check("config_get_is_read_only_never_writes",
    configGet2.status === 200 && configGet2.body?.has_config === false
      && !tenantConfigAfterGets.config?.accounting?.vehicle_pyg,
    { has_config: configGet2.body?.has_config, vehicle_pyg: tenantConfigAfterGets.config?.accounting?.vehicle_pyg ?? null });

  // La fuente operativa historica ya no se puede guardar: el PUT con source
  // "operational" se rechaza con 400. El schema y el validador comparten el
  // mismo contrato (solo accounting).
  const operationalHttp = await apiCall("PUT", "/transport-pyg/account-configuration", tenantA.token, operationalPayload());
  const operationalValidated = accountConfigModule.validateAccountConfig(operationalPayload());
  check("config_put_rejects_operational_source_400",
    operationalHttp.status === 400
      && operationalValidated.errors.some((error) => error.code === "SOURCE_INVALID")
      && !operationalValidated.ok,
    { status: operationalHttp.status, code: operationalHttp.body?.code, codes: operationalValidated.errors.map((error) => error.code) });
  const tenantConfigAfterOperationalReject = await db.tenant.findUnique({ where: { id: tenantA.tenantId }, select: { config: true } });
  check("config_operational_rejected_never_writes",
    !tenantConfigAfterOperationalReject.config?.accounting?.vehicle_pyg,
    { vehicle_pyg: tenantConfigAfterOperationalReject.config?.accounting?.vehicle_pyg ?? null });

  // ---------------------------------------------------------------- reporte antes de movimientos
  const reportBefore = await apiCall("GET", `/transport-pyg/report?period=${PERIOD}`, tenantA.token);
  check("accounting_report_before_movements_zeroed",
    reportBefore.status === 200
      && reportBefore.body?.source === "accounting"
      && reportBefore.body?.report_source === "ledger"
      && Array.isArray(reportBefore.body?.vehicles) && reportBefore.body.vehicles.length === 2
      && reportBefore.body?.unassigned === null
      && reportBefore.body?.corporate?.totals?.neta?.actual === 0
      && reportBefore.body?.reconciliation?.difference === 0,
    { status: reportBefore.status, source: reportBefore.body?.source, vehicles: reportBefore.body?.vehicles?.length, reconciliation: reportBefore.body?.reconciliation });

  // ---------------------------------------------------------------- documentos (historicos Ag 2026 + un aislante Jul 2026)
  const docs = [
    { date: "2026-08-05", text: "Ingreso placa RVQ101", lines: [docLine(accounts.income_service.code, B1, V1_PLATE, "credit", 2500000, party.id, "Ingreso servicio"), docLine(cash.code, B1, V1_PLATE, "debit", 2500000, party.id, "Caja contrapartida")] },
    { date: "2026-08-06", text: "Ingreso centro sin vehiculo", lines: [docLine(accounts.income_service.code, B1, C1, "credit", 1000000, party.id, "Ingreso servicio centro"), docLine(cash.code, B1, C1, "debit", 1000000, party.id, "Caja contrapartida")] },
    { date: "2026-08-07", text: "Sueldos RVQ101", lines: [docLine(accounts.expense_personal.code, B1, V1_PLATE, "debit", 800000, party.id, "Sueldos"), docLine(cash.code, B1, V1_PLATE, "credit", 800000, party.id, "Caja contrapartida")] },
    { date: "2026-08-08", text: "Combustible RVQ101", lines: [docLine(accounts.expense_fuel.code, B1, V1_PLATE, "debit", 300000, party.id, "Combustible"), docLine(cash.code, B1, V1_PLATE, "credit", 300000, party.id, "Caja contrapartida")] },
    { date: "2026-08-09", text: "Mantenimiento RVQ102", lines: [docLine(accounts.expense_maintenance.code, B1, V2_PLATE, "debit", 150000, party.id, "Mantenimiento"), docLine(cash.code, B1, V2_PLATE, "credit", 150000, party.id, "Caja contrapartida")] },
    { date: "2026-08-10", text: "Impuesto simple RVQ101", lines: [docLine(accounts.tax_simple.code, B1, V1_PLATE, "debit", 100000, party.id, "Impuesto regimen simple"), docLine(cash.code, B1, V1_PLATE, "credit", 100000, party.id, "Caja contrapartida")] },
    { date: "2026-08-11", text: "Ingreso no operativo RVQ102", lines: [docLine(accounts.income_noop.code, B1, V2_PLATE, "credit", 50000, party.id, "Ingreso no operativo"), docLine(cash.code, B1, V2_PLATE, "debit", 50000, party.id, "Caja contrapartida")] },
    { date: "2026-08-12", text: "Gasto sin clasificar RVQ101", lines: [docLine(accounts.expense_unclassified.code, B1, V1_PLATE, "debit", 40000, party.id, "Gasto sin clasificar"), docLine(cash.code, B1, V1_PLATE, "credit", 40000, party.id, "Caja contrapartida")] },
    { date: "2026-08-13", text: "Ingreso sin clasificar centro", lines: [docLine(accounts.income_unclassified.code, B1, C1, "credit", 25000, party.id, "Ingreso sin clasificar"), docLine(cash.code, B1, C1, "debit", 25000, party.id, "Caja contrapartida")] },
    { date: "2026-08-14", text: "Ingreso placa RVQ102", lines: [docLine(accounts.income_service.code, B1, V2_PLATE, "credit", 400000, party.id, "Ingreso servicio"), docLine(cash.code, B1, V2_PLATE, "debit", 400000, party.id, "Caja contrapartida")] },
    { date: "2026-08-15", text: "Combustible RVQ102", lines: [docLine(accounts.expense_fuel.code, B1, V2_PLATE, "debit", 120000, party.id, "Combustible"), docLine(cash.code, B1, V2_PLATE, "credit", 120000, party.id, "Caja contrapartida")] },
    // Aislante de mes previo: NO debe aparecer en el reporte de agosto; si
    // apareciera en julio certifica que julio solo lee sus propios asientos.
    { date: "2026-07-20", text: "Ingreso julio aislante RVQ102", lines: [docLine(accounts.income_service.code, B1, V2_PLATE, "credit", 777000, party.id, "Ingreso julio"), docLine(cash.code, B1, V2_PLATE, "debit", 777000, party.id, "Caja contrapartida")] }
  ];
  for (const doc of docs) {
    await postDocument(tenantA.token, { posting_date: doc.date, header_text: doc.text, lines: doc.lines });
  }
  check("fixture_documents_posted_via_canonical_api", true, { count: docs.length });

  // Presupuesto desde el almacen PYG Contable (cuenta/sucursal/centro): misma
  // fuente que usa el reporte contable.
  const budgetPut = await apiCall("PUT", "/accounting/reports/pyg-interactive/budgets", tenantA.token, {
    period: PERIOD,
    rows: [
      { account_id: accounts.income_service.id, branch_code: B1, cost_center_code: V1_PLATE, amount: 2000000 },
      { account_id: accounts.expense_fuel.id, branch_code: B1, cost_center_code: V1_PLATE, amount: 300000 },
      { account_id: accounts.expense_personal.id, branch_code: B1, cost_center_code: V1_PLATE, amount: 400000 }
    ]
  });
  check("fixture_pyg_budgets_put_via_canonical_api", budgetPut.status === 200, { status: budgetPut.status });

  // Reproduce el incidente: ya existen asientos de agosto, pero la empresa
  // nunca ha activado ni guardado una configuracion de PYG por vehiculo.
  const noConfigBefore = await db.tenant.findUnique({ where: { id: tenantA.tenantId }, select: { config: true } });
  check("default_fixture_has_no_vehicle_configuration", !noConfigBefore.config?.accounting?.vehicle_pyg);
  const [automatic, sameMonthBook] = await Promise.all([
    apiCall("GET", `/transport-pyg/report?period=${PERIOD}`, tenantA.token),
    apiCall("GET", `/accounting/reports/pyg-interactive?period=${PERIOD}&mode=month&dimensions=puc,branch,cost_center`, tenantA.token)
  ]);
  const noConfigAfter = await db.tenant.findUnique({ where: { id: tenantA.tenantId }, select: { config: true } });
  check("posted_august_reads_ledger_without_configuration_or_activation",
    automatic.status === 200 && sameMonthBook.status === 200
      && automatic.body?.source === "accounting" && automatic.body?.report_source === "ledger"
      && automatic.body?.period === PERIOD && sameMonthBook.body?.period === PERIOD
      && automatic.body?.corporate?.totals?.neta?.actual === 2465000
      && automatic.body?.reconciliation?.ledger_net === sameMonthBook.body?.net?.actual
      && automatic.body?.reconciliation?.difference === 0
      && (automatic.body?.vehicles || []).some((vehicle) => vehicle.income_actual > 0),
    { period: automatic.body?.period, source: automatic.body?.source, net: automatic.body?.corporate?.totals?.neta?.actual, book_net: sameMonthBook.body?.net?.actual });
  check("automatic_ledger_read_does_not_write_configuration",
    JSON.stringify(noConfigAfter.config) === JSON.stringify(noConfigBefore.config)
      && !noConfigAfter.config?.accounting?.vehicle_pyg);

  const configBeforeCustomPut = noConfigAfter;
  const putCustom = await apiCall("PUT", "/transport-pyg/account-configuration", tenantA.token, { source: "accounting", concepts: customConfigConcepts() });
  check("config_put_custom_with_exclusion_accepted",
    putCustom.status === 200 && putCustom.body?.ok === true && putCustom.body?.source === "accounting" && putCustom.body?.concepts === 27,
    { status: putCustom.status, body: putCustom.body });
  const tenantConfigAfterPut = await db.tenant.findUnique({ where: { id: tenantA.tenantId }, select: { config: true } });
  const storedVehiclePyg = tenantConfigAfterPut.config?.accounting?.vehicle_pyg;
  const orgTreeBefore = configBeforeCustomPut.config?.accounting?.organization_tree;
  const orgTreeAfter = tenantConfigAfterPut.config?.accounting?.organization_tree;
  check("config_put_persists_vehicle_pyg_and_preserves_org_tree",
    storedVehiclePyg?.source === "accounting"
      && Array.isArray(storedVehiclePyg?.concepts) && storedVehiclePyg.concepts.length === 27
      && storedVehiclePyg.concepts.some((concept) => concept.code === "INGRESOS_SERVICIO")
      && JSON.stringify(orgTreeAfter) === JSON.stringify(orgTreeBefore),
    { stored_concepts: storedVehiclePyg?.concepts?.length, org_tree_preserved: JSON.stringify(orgTreeAfter) === JSON.stringify(orgTreeBefore) });
  const auditConfig = await db.auditLog.findFirst({ where: { tenant_id: tenantA.tenantId, action: "transport.pyg.account_config.updated", entity: "TenantConfig" } });
  check("config_put_audit_log_written", Boolean(auditConfig) && auditConfig.module === "accounting" && auditConfig.new_value?.source === "accounting", { audit: auditConfig && { module: auditConfig.module, entity: auditConfig.entity, concepts: auditConfig.new_value?.concepts?.length } });
  const configGet3 = await apiCall("GET", "/transport-pyg/account-configuration", tenantA.token);
  check("config_get_reflects_saved_state",
    configGet3.status === 200 && configGet3.body?.has_config === true && configGet3.body?.source === "accounting" && configGet3.body?.config?.concepts?.length === 27,
    { status: configGet3.status, has_config: configGet3.body?.has_config, source: configGet3.body?.source, concepts: configGet3.body?.config?.concepts?.length });

  // ---------------------------------------------------------------- GET del reporte no escribe tenant.config
  const tenantConfigBeforeReport = await db.tenant.findUnique({ where: { id: tenantA.tenantId }, select: { config: true } });
  const reportAfterBudget = await apiCall("GET", `/transport-pyg/report?period=${PERIOD}`, tenantA.token);
  const tenantConfigAfterReport = await db.tenant.findUnique({ where: { id: tenantA.tenantId }, select: { config: true } });
  check("report_get_never_writes_tenant_config",
    reportAfterBudget.status === 200
      && JSON.stringify(tenantConfigAfterReport.config) === JSON.stringify(tenantConfigBeforeReport.config),
    { config_unchanged: JSON.stringify(tenantConfigAfterReport.config) === JSON.stringify(tenantConfigBeforeReport.config) });

  // ---------------------------------------------------------------- reporte contable por vehiculo (Ag 2026)
  const report = await apiCall("GET", `/transport-pyg/report?period=${PERIOD}`, tenantA.token);
  const body = report.body || {};
  const v1 = (body.vehicles || []).find((vehicle) => vehicle.plate === V1_PLATE);
  const v2 = (body.vehicles || []).find((vehicle) => vehicle.plate === V2_PLATE);
  const unassigned = body.unassigned;
  const corporate = body.corporate || { rows: [] };
  const corporateRow = (code) => rowOf(corporate, code);
  check("accounting_report_dto_shape", report.status === 200 && v1 && v2 && unassigned && body.source === "accounting" && body.report_source === "ledger" && body.period === PERIOD, { status: report.status, period: body.period });

  check("accounting_report_vehicle_v1_values",
    v1.income_actual === 2500000
      && v1.unmapped_expense === 40000
      && rowOf(v1, "INGRESOS")?.actual === 0
      && rowOf(v1, "INGRESOS_SERVICIO")?.actual === 2500000
      && rowOf(v1, "GASTOS_PERSONAL")?.actual === 800000
      && rowOf(v1, "COMBUSTIBLE")?.actual === 300000
      && rowOf(v1, "IMPUESTO_REGIMEN_SIMPLE")?.actual === 100000
      && rowOf(v1, "GASTOS_SIN_CLASIFICAR")?.actual === 40000
      && rowOf(v1, "GASTOS_SIN_CLASIFICAR")?.dynamic === true
      && rowOf(v1, "TOTAL_INGRESOS")?.actual === 2500000
      && rowOf(v1, "TOTAL_GASTOS_OPERACIONALES")?.actual === 1140000
      && rowOf(v1, "UTILIDAD_OPERACIONAL")?.actual === 1360000
      && rowOf(v1, "UTILIDAD_ANTES_DE_IMPUESTOS")?.actual === 1360000
      && rowOf(v1, "UTILIDAD_NETA")?.actual === 1260000,
    { v1: v1 && { income_actual: v1.income_actual, unmapped: v1.unmapped_expense, rows: v1.rows.map((row) => ({ code: row.code, actual: row.actual })) } });

  check("accounting_report_vehicle_v2_values",
    v2.income_actual === 400000
      && rowOf(v2, "INGRESOS_SERVICIO")?.actual === 400000
      && rowOf(v2, "MANTENIMIENTO_VEHICULO")?.actual === 150000
      && rowOf(v2, "COMBUSTIBLE")?.actual === 120000
      && rowOf(v2, "INGRESOS_NO_OPERACIONALES")?.actual === 50000
      && rowOf(v2, "UTILIDAD_ANTES_DE_IMPUESTOS")?.actual === 180000
      && rowOf(v2, "UTILIDAD_NETA")?.actual === 180000,
    { v2: v2 && { income_actual: v2.income_actual, rows: v2.rows.map((row) => ({ code: row.code, actual: row.actual })) } });

  check("accounting_report_unassigned_block_values",
    unassigned?.plate === "SIN_VEHICULO"
      && unassigned?.income_actual === 1025000
      && rowOf(unassigned, "INGRESOS_SERVICIO")?.actual === 1000000
      && rowOf(unassigned, "INGRESOS_SIN_CLASIFICAR")?.actual === 25000
      && rowOf(unassigned, "INGRESOS_SIN_CLASIFICAR")?.dynamic === true
      && rowOf(unassigned, "UTILIDAD_NETA")?.actual === 1025000,
    { unassigned: unassigned && { income_actual: unassigned.income_actual, rows: unassigned.rows.map((row) => ({ code: row.code, actual: row.actual })) } });

  check("accounting_report_corporate_values",
    corporate.income_actual === 3925000
      && corporateRow("INGRESOS_SERVICIO")?.actual === 3900000
      && corporateRow("INGRESOS_SIN_CLASIFICAR")?.actual === 25000
      && corporateRow("GASTOS_SIN_CLASIFICAR")?.actual === 40000
      && corporateRow("TOTAL_INGRESOS")?.actual === 3925000
      && corporateRow("TOTAL_GASTOS_OPERACIONALES")?.actual === 1410000
      && corporateRow("UTILIDAD_OPERACIONAL")?.actual === 2515000
      && corporateRow("UTILIDAD_ANTES_DE_IMPUESTOS")?.actual === 2565000
      && corporateRow("IMPUESTO_REGIMEN_SIMPLE")?.actual === 100000
      && corporateRow("UTILIDAD_NETA")?.actual === 2465000,
    { corporate: { income_actual: corporate.income_actual, rows: corporate.rows.map((row) => ({ code: row.code, actual: row.actual })) } });

  check("accounting_report_budget_from_pyg_contable",
    rowOf(v1, "INGRESOS_SERVICIO")?.budget === 2000000
      && rowOf(v1, "INGRESOS_SERVICIO")?.budget_coverage === "full"
      && rowOf(v1, "GASTOS_PERSONAL")?.budget === 400000
      && rowOf(v1, "GASTOS_PERSONAL")?.budget_coverage === "full"
      && rowOf(v1, "COMBUSTIBLE")?.budget === 300000
      && rowOf(v1, "IMPUESTO_REGIMEN_SIMPLE")?.budget === null
      && rowOf(v2, "INGRESOS_SERVICIO")?.budget === null
      && corporateRow("INGRESOS_SERVICIO")?.budget === 2000000,
    { v1_ingresos: rowOf(v1, "INGRESOS_SERVICIO"), v2_ingresos: rowOf(v2, "INGRESOS_SERVICIO"), corporate_ingresos: corporateRow("INGRESOS_SERVICIO") });

  check("accounting_report_reconciliation_net_zero_difference",
    body.reconciliation?.ledger_net === 2465000
      && body.reconciliation?.neta_actual === 2465000
      && body.reconciliation?.difference === 0
      && body.reconciliation?.informational_actual === 0,
    { reconciliation: body.reconciliation });

  check("accounting_report_data_status",
    body.data_status?.vehicle_count === 2
      && body.data_status?.vehicles_with_income === 2
      && body.data_status?.unassigned_centers === 1
      && body.data_status?.unclassified_income === 25000
      && body.data_status?.unclassified_expense === 40000
      && body.data_status?.unmapped_total === 40000,
    { data_status: body.data_status });

  const v1IngresosChildren = rowOf(v1, "INGRESOS_SERVICIO")?.children || [];
  const v1IngresosAccount = v1IngresosChildren.find((child) => child.account_code === "41450501");
  const v1IngresosCenter = v1IngresosAccount?.centers?.find((center) => center.center_code === V1_PLATE);
  check("accounting_report_drill_children_names_and_centers",
    v1IngresosAccount?.account_name === "Servicio transporte QA"
      && v1IngresosAccount?.actual === 2500000
      && v1IngresosAccount?.budget === 2000000
      && v1IngresosAccount?.budget_coverage === "full"
      && v1IngresosCenter?.actual === 2500000
      && v1IngresosCenter?.branch_code === B1
      && v1IngresosCenter?.center_name === `Vehiculo ${V1_PLATE}`,
    { children: v1IngresosChildren });

  const warningCodes = (body.warnings || []).map((warning) => warning.code);
  check("accounting_report_warnings_explain_gaps",
    warningCodes.includes("CONCEPT_PENDING_ACCOUNT")
      && warningCodes.includes("UNCLASSIFIED_LEDGER_ACCOUNTS")
      && warningCodes.includes("UNASSIGNED_CENTERS_PRESENT")
      && !warningCodes.includes("RECONCILIATION_DIFFERENCE"),
    { warning_codes: warningCodes });

  // Reconciliacion explicita contra el PYG Contable del MISMO mes (2026-08):
  // la neta del por-vehiculo debe coincidir con la neta del libro del PYG
  // Contable para el mes exacto.
  const interactiveAug = await apiCall("GET", `/accounting/reports/pyg-interactive?period=${PERIOD}&mode=month&dimensions=puc,branch,cost_center`, tenantA.token);
  check("accounting_report_reconciles_to_pyg_contable_exact_month",
    interactiveAug.status === 200
      && interactiveAug.body?.net?.actual === 2465000
      && body.reconciliation?.ledger_net === interactiveAug.body?.net?.actual,
    { ledger_net: body.reconciliation?.ledger_net, pyg_contable_net: interactiveAug.body?.net?.actual });

  // ---------------------------------------------------------------- julio no debe incluir asientos de agosto
  const reportJuly = await apiCall("GET", `/transport-pyg/report?period=${JULY}`, tenantA.token);
  const julyV1 = (reportJuly.body?.vehicles || []).find((vehicle) => vehicle.plate === V1_PLATE);
  const julyV2 = (reportJuly.body?.vehicles || []).find((vehicle) => vehicle.plate === V2_PLATE);
  check("july_report_excludes_august_entries",
    reportJuly.status === 200
      && reportJuly.body?.period === JULY
      && julyV1?.income_actual === 0
      && julyV2?.income_actual === 777000
      && rowOf(julyV2, "INGRESOS_SERVICIO")?.actual === 777000
      && (reportJuly.body?.corporate?.totals?.neta?.actual ?? 0) === 777000,
    { july_v1_income: julyV1?.income_actual, july_v2_income: julyV2?.income_actual, july_ingresos_servicio: rowOf(julyV2, "INGRESOS_SERVICIO")?.actual });

  // ---------------------------------------------------------------- RBAC y aislamiento
  await setRolePermissions(tenantA.tenantId, tenantA.email, "CERT_PYG_READER", READER_PERMISSIONS());
  const rbacPut = await apiCall("PUT", "/transport-pyg/account-configuration", tenantA.token, { source: "accounting", concepts: proposalConcepts() });
  const rbacGet = await apiCall("GET", "/transport-pyg/account-configuration", tenantA.token);
  const rbacReport = await apiCall("GET", `/transport-pyg/report?period=${PERIOD}`, tenantA.token);
  check("read_only_role_config_put_403_get_200",
    rbacPut.status === 403 && rbacPut.body?.code === "PERMISO_DENEGADO" && rbacGet.status === 200 && rbacReport.status === 200,
    { put: rbacPut.status, get: rbacGet.status, report: rbacReport.status, code: rbacPut.body?.code });
  await setRolePermissions(tenantA.tenantId, tenantA.email, "CERT_PYG_ROLE", FULL_PERMISSIONS());
  tenantA.token = (await apiCall("POST", "/auth/login", null, { email: tenantA.email, password: tenantA.password })).body?.token || tenantA.token;

  const configB1 = await apiCall("GET", "/transport-pyg/account-configuration", tenantB.token);
  const reportB1 = await apiCall("GET", `/transport-pyg/report?period=${PERIOD}`, tenantB.token);
  check("cross_company_config_and_report_isolated",
    configB1.status === 200 && configB1.body?.has_config === false && configB1.body?.source === "accounting"
      && reportB1.status === 200 && reportB1.body?.source === "accounting" && reportB1.body?.report_source === "ledger"
      && (reportB1.body?.vehicles || []).length === 0
      && (reportB1.body?.corporate?.totals?.neta?.actual ?? 0) === 0,
    { config: configB1.body && { has_config: configB1.body.has_config, source: configB1.body.source }, report_source: reportB1.body?.source, vehicles: reportB1.body?.vehicles?.length, neta: reportB1.body?.corporate?.totals?.neta?.actual });
  const putB = await apiCall("PUT", "/transport-pyg/account-configuration", tenantB.token, { source: "accounting", concepts: [proposalConcepts()[0]] });
  const configAAfterB = await apiCall("GET", "/transport-pyg/account-configuration", tenantA.token);
  check("cross_company_config_writes_stay_scoped",
    putB.status === 200
      && configAAfterB.body?.config?.concepts?.length === 27
      && configAAfterB.body?.config?.concepts?.some((concept) => concept.code === "INGRESOS_SERVICIO"),
    { put_b: putB.status, config_a_concepts: configAAfterB.body?.config?.concepts?.length });

  // ---------------------------------------------------------------- flag legacy + custom mappings via Prisma fixture
  // Se siembra DIRECTAMENTE en la base local (solo el tenant sintetico) un
  // flag legacy "operational" junto a mappings personalizados validos, para
  // certificar que el GET sigue leyendo ledger, normaliza la fuente a
  // "accounting" y NO muta la config ni pierde los mappings.
  const legacyConcepts = proposalConcepts();
  const legacyIngresos = legacyConcepts.find((concept) => concept.code === "INGRESOS");
  legacyIngresos.name = "INGRESOS LEGACY CUSTOM";
  const tenantConfigBeforeLegacySeed = await db.tenant.findUnique({ where: { id: tenantA.tenantId }, select: { config: true } });
  const legacyAccounting = tenantConfigBeforeLegacySeed.config?.accounting || {};
  const legacyVehiclePyg = { source: "operational", concepts: legacyConcepts };
  await db.tenant.update({
    where: { id: tenantA.tenantId },
    data: { config: { ...tenantConfigBeforeLegacySeed.config, accounting: { ...legacyAccounting, vehicle_pyg: legacyVehiclePyg } } }
  });
  const tenantConfigSqlAfterSeed = await db.tenant.findUnique({ where: { id: tenantA.tenantId }, select: { config: true } });
  check("fixture_legacy_flag_seeded_via_local_prisma",
    tenantConfigSqlAfterSeed.config?.accounting?.vehicle_pyg?.source === "operational"
      && tenantConfigSqlAfterSeed.config?.accounting?.vehicle_pyg?.concepts?.length === 26,
    { seeded_source: tenantConfigSqlAfterSeed.config?.accounting?.vehicle_pyg?.source, seeded_concepts: tenantConfigSqlAfterSeed.config?.accounting?.vehicle_pyg?.concepts?.length });

  const configAfterLegacySeed = await apiCall("GET", "/transport-pyg/account-configuration", tenantA.token);
  const reportAfterLegacySeed = await apiCall("GET", `/transport-pyg/report?period=${PERIOD}`, tenantA.token);
  const tenantConfigAfterLegacyGets = await db.tenant.findUnique({ where: { id: tenantA.tenantId }, select: { config: true } });
  check("legacy_flag_normalized_to_ledger_get_no_mutation",
    configAfterLegacySeed.status === 200
      && configAfterLegacySeed.body?.source === "accounting"
      && configAfterLegacySeed.body?.has_config === true
      && configAfterLegacySeed.body?.config?.source === "accounting"
      && configAfterLegacySeed.body?.config?.concepts?.length === 26
      && configAfterLegacySeed.body?.config?.concepts?.some((concept) => concept.code === "INGRESOS" && concept.name === "INGRESOS LEGACY CUSTOM")
      && reportAfterLegacySeed.body?.source === "accounting"
      && reportAfterLegacySeed.body?.report_source === "ledger"
      && JSON.stringify(tenantConfigAfterLegacyGets.config) === JSON.stringify(tenantConfigSqlAfterSeed.config),
    { source: configAfterLegacySeed.body?.source, has_config: configAfterLegacySeed.body?.has_config, concepts: configAfterLegacySeed.body?.config?.concepts?.length, preserved: configAfterLegacySeed.body?.config?.concepts?.find((concept) => concept.code === "INGRESOS")?.name, report_source: reportAfterLegacySeed.body?.report_source, unmuted: JSON.stringify(tenantConfigAfterLegacyGets.config) === JSON.stringify(tenantConfigSqlAfterSeed.config) });

  // Tras el flag legacy, el PUT operativo sigue rechazado (no se puede
  // "restaurar" la fuente operativa ni siquiera desde un estado legacy).
  const operationalAfterLegacy = await apiCall("PUT", "/transport-pyg/account-configuration", tenantA.token, operationalPayload());
  check("config_put_operational_still_rejected_after_legacy_seed",
    operationalAfterLegacy.status === 400,
    { status: operationalAfterLegacy.status, code: operationalAfterLegacy.body?.code });

  // Se devuelve la config a una personalizada valida (fuente contable) para el
  // flujo de navegador: INGRESOS renovada + INGRESOS_SERVICIO.
  await apiCall("PUT", "/transport-pyg/account-configuration", tenantA.token, { source: "accounting", concepts: customConfigConcepts() });

  // ---------------------------------------------------------------- fase de navegador real
  let browser = null;
  let page = null;
  let browserPhase = "web_availability";
  const browserDiagnostics = { console: consoleLogs, page_errors: pageErrors, failed_requests: failedRequests, dialogs, observed_requests: observedRequests, snapshots: [] };
  try {
    await waitForServer(webUrl, ["/"]);
    check("browser_web_server_available", true, { web_url: webUrl });
    browser = await puppeteer.launch({ executablePath: browserPath, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"] });
    page = await browser.newPage();
    attachDiagnostics(page);
    await page.setViewport({ width: 1440, height: 900 });
    page.setDefaultTimeout(20000);
    page.setDefaultNavigationTimeout(60000);
    await login(page, tenantA.email, tenantA.password);

    // PYG Contable (AccountingPyg): se fija el periodo Ag 2026 en la vista
    // contable; la vista Por vehiculo debe heredar ese mismo periodo.
    browserPhase = "pyg_shared_period_contable";
    await page.goto(`${webUrl}/dashboard/contabilidad/pyg`, { waitUntil: "networkidle2" });
    await page.waitForFunction(() => document.body.innerText.includes("Matriz interactiva"), { timeout: 45000 });
    check("browser_contable_puc_view_open", true, {});
    // En la vista contable el input month es el unico visible de AccountingPyg.
    await setVisibleMonthInput(page, PERIOD);
    await page.waitForFunction((period) => {
      const input = [...document.querySelectorAll('input[type="month"]')].find((node) => {
        const box = node.getBoundingClientRect();
        return box.width > 0 && box.height > 0;
      });
      return input && input.value === period;
    }, { timeout: 15000 }, PERIOD);

    // Se cambia a Por vehiculo: el periodo debe seguir siendo Ag 2026 (compartido)
    // y mostrar totals nonzero coincidentes con el libro.
    browserPhase = "pyg_vehicle_view_shared_period";
    await clickButton(page, "Por vehículo");
    await page.waitForFunction(() => document.body.innerText.includes("PYG corporativo"), { timeout: 60000 });
    const inheritedPeriod = await readVisibleMonthInput(page);
    check("browser_vehicle_inherits_contable_period", inheritedPeriod === PERIOD, { inherited_period: inheritedPeriod });
    await page.waitForFunction(() => document.body.innerText.includes("Sin vehículo / sin asignar"), { timeout: 45000 });

    const accountingBodyText = await page.$eval("body", (body) => body.innerText);
    check("browser_accounting_report_markers",
      accountingBodyText.includes("Reconciliación con el libro")
        && accountingBodyText.includes("aviso(s) del PYG por vehículo")
        && accountingBodyText.includes("Configurar Rangos PUC"),
      {});

    let tables = await readStatementTables(page);
    const corpIngresosServicio = statementRow(tables, 0, "INGRESOS SERVICIO ESPECIAL");
    const corpNeta = statementRow(tables, 0, "UTILIDAD NETA");
    const unassignedIngresos = statementRow(tables, 1, "INGRESOS SERVICIO ESPECIAL");
    check("browser_consolidated_dom_values_august",
      parseRegionalAmount(corpIngresosServicio?.actual, 3900000).ok
        && parseRegionalAmount(corpNeta?.actual, 2465000).ok
        && parseRegionalAmount(corpIngresosServicio?.budget, 2000000).ok
        && parseRegionalAmount(unassignedIngresos?.actual, 1000000).ok,
      { corp_ingresos: corpIngresosServicio, corp_neta: corpNeta, unassigned_ingresos: unassignedIngresos });

    // Drill concepto > cuenta > centro (nombres, sin codigos en la tabla).
    browserPhase = "pyg_drill";
    await page.evaluate(() => {
      const button = [...document.querySelectorAll("button")].find((node) => (node.getAttribute("aria-label") || "") === "Desglosar INGRESOS SERVICIO ESPECIAL");
      if (!button) throw new Error("drill_button_not_found");
      button.click();
    });
    await page.waitForFunction(() => document.body.innerText.includes("Servicio transporte QA"), { timeout: 15000 });
    await page.evaluate(() => {
      const button = [...document.querySelectorAll("button")].find((node) => (node.getAttribute("aria-label") || "") === "Desglosar Servicio transporte QA");
      if (!button) throw new Error("account_drill_button_not_found");
      button.click();
    });
    await page.waitForFunction((plate) => document.body.innerText.includes(`Vehiculo ${plate}`), { timeout: 15000 }, V1_PLATE);
    const drillText = await page.$eval("body", (body) => body.innerText);
    const drillNoCodes = await page.evaluate(() => {
      const tables = [...document.querySelectorAll("table")].filter((table) => [...table.querySelectorAll("thead th")].some((th) => (th.textContent || "").trim().toLowerCase() === "cumplimiento"));
      if (tables.length === 0) return false;
      const text = tables.map((table) => table.innerText).join("\n");
      return !/41450501|42100501|42950501|52050601|52953501|52454001|51050601|54100501/.test(text);
    });
    check("browser_drill_names_centers_branch_no_codes",
      drillText.includes(`Vehiculo ${V1_PLATE}`)
        && drillText.includes(`Vehiculo ${V2_PLATE}`)
        && drillText.includes("Centro Norte PYG QA")
        && drillText.includes("Sucursal Norte PYG QA")
        && drillNoCodes === true,
      { drill_no_codes: drillNoCodes });
    await page.screenshot({ path: shot("pyg-accounting-drill"), fullPage: false });
    screenshots.accounting_drill = relative(shot("pyg-accounting-drill"));

    browserPhase = "pyg_single_vehicle_full_width";
    await clickTab(page, "Por vehículo");
    await clickButton(page, V1_PLATE);
    await page.waitForFunction((plate) => document.body.innerText.includes(`PYG ${plate} · 2026-08`), { timeout: 15000 }, V1_PLATE);
    const vehicleLayout = await page.evaluate((plate) => {
      const heading = [...document.querySelectorAll("h2")].find((node) => node.textContent.trim() === `PYG ${plate} · 2026-08`);
      const section = heading?.closest("section");
      return {
        hasComparison: document.body.innerText.includes("Matriz de ejecutados por placa"),
        statementTables: [...document.querySelectorAll("table")].filter((table) => table.querySelector("thead")?.textContent.toLowerCase().includes("cumplimiento")).length,
        width: section?.getBoundingClientRect().width || 0,
        availableWidth: section?.parentElement?.getBoundingClientRect().width || 0
      };
    }, V1_PLATE);
    let vehicleTables = await readStatementTables(page);
    check("browser_single_vehicle_full_width_without_plate_matrix", !vehicleLayout.hasComparison && vehicleLayout.statementTables === 1 && vehicleLayout.width > 0 && vehicleLayout.width >= vehicleLayout.availableWidth * 0.98, vehicleLayout);
    check("browser_single_vehicle_values_match_ledger", parseRegionalAmount(statementRow(vehicleTables, 0, "UTILIDAD NETA")?.actual, rowOf(v1, "UTILIDAD_NETA").actual).ok);
    await page.click('button[aria-label="Desglosar INGRESOS SERVICIO ESPECIAL"]');
    await page.waitForSelector('button[aria-label="Desglosar Servicio transporte QA"]');
    await page.click('button[aria-label="Desglosar Servicio transporte QA"]');
    await page.waitForFunction((plate) => document.body.innerText.includes(`Vehiculo ${plate}`), { timeout: 15000 }, V1_PLATE);
    check("browser_single_vehicle_drill_preserved", true);
    await page.screenshot({ path: shot("pyg-single-vehicle"), fullPage: false });
    screenshots.single_vehicle = relative(shot("pyg-single-vehicle"));
    await clickButton(page, V2_PLATE);
    await page.waitForFunction((plate) => document.body.innerText.includes(`PYG ${plate} · 2026-08`), { timeout: 15000 }, V2_PLATE);
    vehicleTables = await readStatementTables(page);
    check("browser_switch_vehicle_preserves_individual_values", vehicleTables.length === 1 && parseRegionalAmount(statementRow(vehicleTables, 0, "UTILIDAD NETA")?.actual, rowOf(v2, "UTILIDAD_NETA").actual).ok);
    await clickButton(page, "Sin vehículo / sin asignar");
    await page.waitForFunction(() => [...document.querySelectorAll("h2")].some((node) => node.textContent.includes("Sin vehículo / sin asignar · 2026-08")), { timeout: 15000 });
    vehicleTables = await readStatementTables(page);
    check("browser_single_unassigned_block_preserved", vehicleTables.length === 1 && !await page.evaluate(() => document.body.innerText.includes("Matriz de ejecutados por placa")));

    // Configuracion: fuente fija ledger, sin activacion de fuente ni
    // restauracion operativa. La propuesta del Excel ya es el borrador por
    // defecto (no existe boton "Usar estructura del Excel").
    browserPhase = "pyg_config_ledger_only";
    await clickTab(page, "Configuración");
    await page.waitForFunction(() => document.body.innerText.includes("Rangos PUC · Agrupación de cuentas del PYG por vehículo"), { timeout: 30000 });
    const configText1 = await page.$eval("body", (body) => body.innerText);
    check("browser_config_ledger_only_no_source_choice",
      configText1.includes("FUENTE: LIBRO CONTABLE (ASIENTOS)")
        && !configText1.includes("FUENTE: OPERATIVA HISTÓRICA")
        && !configText1.includes("Usar estructura del Excel")
        && !configText1.includes("Volver a fuente operativa")
        && configText1.includes("Orden"),
      { has_operativa: configText1.includes("FUENTE: OPERATIVA HISTÓRICA"), has_usar_excel: configText1.includes("Usar estructura del Excel"), has_restaurar: configText1.includes("Volver a fuente operativa") });
    await page.screenshot({ path: shot("pyg-config-ledger-only"), fullPage: false });
    screenshots.config_ledger_only = relative(shot("pyg-config-ledger-only"));

    // Edicion de nombre/orden/rango/exclusion y guardado persistente.
    browserPhase = "pyg_config_edit_persist";
    await setConceptField(page, "INGRESOS", "Nombre", "INGRESOS DEL SERVICIO");
    await setConceptField(page, "INGRESOS", "Orden", "2");
    await setRangeField(page, "INGRESOS_SERVICIO", "Inicio del rango 1", "41450501");
    await setRangeField(page, "INGRESOS_SERVICIO", "Fin del rango 1", "41450502");
    await clickInConcept(page, "INGRESOS_SERVICIO", "Añadir exclusión");
    await setRangeField(page, "INGRESOS_SERVICIO", "Inicio de la exclusión 1", "41450502");
    await setRangeField(page, "INGRESOS_SERVICIO", "Fin de la exclusión 1", "41450502");
    const proposalSaveResponse = page.waitForResponse((response) => response.url().includes("/api/v1/transport-pyg/account-configuration") && response.request().method() === "PUT", { timeout: 30000 });
    const reportAfterSaveResponse = page.waitForResponse((response) => response.url().includes("/api/v1/transport-pyg/report") && response.request().method() === "GET", { timeout: 60000 });
    proposalSaveResponse.catch(() => undefined);
    reportAfterSaveResponse.catch(() => undefined);
    await clickButton(page, "Guardar cambios");
    const proposalSave = await proposalSaveResponse;
    await reportAfterSaveResponse;
    await page.waitForFunction(() => document.body.innerText.includes("Agrupación de cuentas guardada"), { timeout: 15000 });
    check("browser_config_save_put_200", proposalSave.status() === 200, { status: proposalSave.status() });
    await page.screenshot({ path: shot("pyg-config-saved"), fullPage: false });
    screenshots.config_saved = relative(shot("pyg-config-saved"));

    const configGetAfterBrowser = await apiCall("GET", "/transport-pyg/account-configuration", tenantA.token);
    const savedIngresos = (configGetAfterBrowser.body?.config?.concepts || []).find((concept) => concept.code === "INGRESOS");
    const savedIngresosServicio = (configGetAfterBrowser.body?.config?.concepts || []).find((concept) => concept.code === "INGRESOS_SERVICIO");
    check("browser_config_concept_edits_persisted",
      savedIngresos?.name === "INGRESOS DEL SERVICIO"
        && savedIngresos?.order === 2
        && savedIngresos?.exclusions?.[0]?.start === "41450501"
        && savedIngresos?.exclusions?.[0]?.end === "41450501"
        && savedIngresosServicio?.ranges?.[0]?.start === "41450501"
        && savedIngresosServicio?.ranges?.[0]?.end === "41450502"
        && savedIngresosServicio?.exclusions?.[0]?.start === "41450502"
        && savedIngresosServicio?.exclusions?.[0]?.end === "41450502",
      { ingresos: savedIngresos, ingresos_servicio: savedIngresosServicio });

    // Presupuesto PUC accesible en Contable y correcto (2000000 en INGRESOS
    // SERVICIO del bloque v1), y no oculto por la fuente ledger.
    browserPhase = "pyg_puc_budget_access";
    await clickTab(page, "Consolidado");
    await page.waitForFunction(() => document.body.innerText.includes("PYG corporativo"), { timeout: 45000 });
    await page.reload({ waitUntil: "networkidle2" });
    await page.waitForFunction(() => document.body.innerText.includes("Matriz interactiva"), { timeout: 45000 });
    await clickButton(page, "Por vehículo");
    await page.waitForFunction(() => document.body.innerText.includes("PYG corporativo"), { timeout: 60000 });
    await setVehiclePeriod(page, PERIOD);
    await page.waitForFunction(() => document.body.innerText.includes("INGRESOS SERVICIO ESPECIAL"), { timeout: 45000 });
    tables = await readStatementTables(page);
    const budgetRow = statementRow(tables, 0, "INGRESOS SERVICIO ESPECIAL");
    check("browser_puc_budget_value_reconciles_in_vehicle_report",
      parseRegionalAmount(budgetRow?.budget, 2000000).ok,
      { row: budgetRow });

    // Moverse a julio y volver a agosto: el periodo compartido debe preservarse
    // en la vista Contable.
    browserPhase = "pyg_period_roundtrip";
    await setVehiclePeriod(page, JULY);
    await page.waitForFunction(() => document.body.innerText.includes("PYG corporativo · 2026-07"), { timeout: 15000 });
    await clickButton(page, "Contable · PUC");
    await page.waitForFunction(() => document.body.innerText.includes("Matriz interactiva"), { timeout: 45000 });
    const contablePeriodAfterJuly = await readVisibleMonthInput(page);
    check("browser_contable_period_preserved_after_july", contablePeriodAfterJuly === JULY, { contable_period: contablePeriodAfterJuly });
    await clickButton(page, "Por vehículo");
    await page.waitForFunction(() => document.body.innerText.includes("PYG corporativo"), { timeout: 60000 });
    await setVehiclePeriod(page, PERIOD);
    await page.waitForFunction(() => document.body.innerText.includes("INGRESOS DEL SERVICIO"), { timeout: 45000 });

    // ---------------------------------------------------------------- guarda frente a respuestas tardias (stale)
    // Se intercepta la peticion real del reporte del mes VIEJO (2026-08) y se
    // difiere su envio hasta que julio quede asentado (NUNCA request.respond:
    // la respuesta es real de la API). Mientras sigue en vuelo se cambia al
    // mes NUEVO (2026-07): la respuesta tardia de agosto no debe sobrescribir
    // el mes finalmente seleccionado (julio).
    browserPhase = "pyg_stale_response_guard";
    await page.evaluate(() => localStorage.clear());
    await login(page, tenantA.email, tenantA.password);
    await page.goto(`${webUrl}/dashboard/contabilidad/pyg`, { waitUntil: "networkidle2" });
    await page.waitForFunction(() => document.body.innerText.includes("Matriz interactiva"), { timeout: 45000 });
    await clickButton(page, "Por vehículo");
    await page.waitForFunction(() => document.body.innerText.includes("PYG corporativo"), { timeout: 60000 });
    // Primero se selecciona agosto (mes viejo) de forma settled.
    await setVehiclePeriod(page, PERIOD);
    await page.waitForFunction(() => document.body.innerText.includes("INGRESOS DEL SERVICIO"), { timeout: 45000 });

    // Instalar la guarda: difiere SOLO la siguiente peticion del reporte de
    // agosto; todo lo demas sigue normal. Se never a request.respond.
    let delayedOldRequest = null;
    let intercepted;
    const interceptedPromise = new Promise((resolve) => { intercepted = resolve; });
    await page.setRequestInterception(true);
    const requestHandler = (request) => {
      const url = request.url();
      if (request.method() === "GET"
        && url.includes("/api/v1/transport-pyg/report")
        && new URL(url).searchParams.get("period") === PERIOD
        && !delayedOldRequest) {
        delayedOldRequest = request;
        intercepted();
        return;
      }
      request.continue().catch(() => undefined);
    };
    page.on("request", requestHandler);
    const oldResponse = page.waitForResponse((response) => response.url().includes("/api/v1/transport-pyg/report") && new URL(response.url()).searchParams.get("period") === PERIOD, { timeout: 20000 });
    oldResponse.catch(() => undefined);
    await page.click('button[aria-label="Actualizar"]');
    await Promise.race([interceptedPromise, new Promise((_, reject) => setTimeout(() => reject(new Error("old_request_not_intercepted")), 10000))]);
    const loadingState = await page.evaluate(() => ({
      loading: document.body.innerText.includes("Leyendo el libro contable del periodo…"),
      oldReport: document.body.innerText.includes("PYG corporativo · 2026-08"),
      exportDisabled: [...document.querySelectorAll("button")].find((button) => button.textContent.trim() === "Excel")?.disabled === true
    }));
    check("browser_loading_hides_old_report_and_disables_export", loadingState.loading && !loadingState.oldReport && loadingState.exportDisabled, loadingState);

    // Se cambia al mes nuevo mientras la peticion de agosto sigue en vuelo.
    await setVisibleMonthInput(page, JULY);
    await page.waitForFunction((period) => {
      const input = [...document.querySelectorAll('input[type="month"]')].find((node) => {
        const box = node.getBoundingClientRect();
        return box.width > 0 && box.height > 0;
      });
      return input && input.value === period;
    }, { timeout: 15000 }, JULY);
    await page.waitForFunction(() => document.body.innerText.includes("PYG corporativo · 2026-07"), { timeout: 15000 });
    await delayedOldRequest.continue();
    await oldResponse;
    // Estabilidad: dar margen para que cualquier efecto de la respuesta tardia
    // se hubiera aplicado; el mes finalmente seleccionado debe seguir JULY.
    await new Promise((resolve) => setTimeout(resolve, 3000));
    const finalMonthAfterStale = await readVisibleMonthInput(page);
    const staleBodyText = await page.$eval("body", (body) => body.innerText);
    check("browser_stale_response_cannot_overwrite_selected_month",
      delayedOldRequest !== null
        && finalMonthAfterStale === JULY
        && staleBodyText.includes("PYG corporativo · 2026-07")
        && staleBodyText.includes("Matriz interactiva") === false,
      { delayed_old: Boolean(delayedOldRequest), final_month: finalMonthAfterStale, shows_august_name: staleBodyText.includes("INGRESOS DEL SERVICIO") });
    const staleTables = await readStatementTables(page);
    check("browser_stale_response_keeps_july_book_total", parseRegionalAmount(statementRow(staleTables, 0, "UTILIDAD NETA")?.actual, 777000).ok);
    page.off("request", requestHandler);
    await page.setRequestInterception(false);
    await page.screenshot({ path: shot("pyg-stale-guard"), fullPage: false });
    screenshots.stale_guard = relative(shot("pyg-stale-guard"));

    browserPhase = "pyg_refresh_reads_newly_posted_ledger";
    await postDocument(tenantA.token, {
      posting_date: "2026-07-21", header_text: "Ingreso posterior a consulta para verificar Actualizar",
      lines: [docLine(accounts.income_service.code, B1, V2_PLATE, "credit", 50000, party.id, "Ingreso nuevo"), docLine(cash.code, B1, V2_PLATE, "debit", 50000, party.id, "Contrapartida")]
    });
    const freshResponse = page.waitForResponse((response) => response.request().method() === "GET" && response.url().includes("/api/v1/transport-pyg/report") && new URL(response.url()).searchParams.get("period") === JULY, { timeout: 20000 });
    freshResponse.catch(() => undefined);
    await page.click('button[aria-label="Actualizar"]');
    const refreshed = await freshResponse;
    const freshPayload = await refreshed.json();
    await page.waitForFunction(() => document.body.innerText.includes("PYG corporativo · 2026-07") && document.body.innerText.includes("827.000"), { timeout: 15000 });
    const refreshedTables = await readStatementTables(page);
    check("browser_refresh_fetches_new_posted_ledger_without_cache", refreshed.status() === 200 && freshPayload.corporate?.totals?.neta?.actual === 827000 && parseRegionalAmount(statementRow(refreshedTables, 0, "UTILIDAD NETA")?.actual, 827000).ok);

    // Reporte mientras carga no muestra un mes distinto obsoleto; tras asentarse,
    // los totals coinciden con el libro y el aviso de guardado de config se
    // conserva. (El aviso ya se verifico tras el guardado previo.)
    browserPhase = "pyg_loading_no_stale_render";
    await page.evaluate(() => localStorage.clear());
    await login(page, tenantA.email, tenantA.password);
    await page.goto(`${webUrl}/dashboard/contabilidad/pyg`, { waitUntil: "networkidle2" });
    await page.waitForFunction(() => document.body.innerText.includes("Matriz interactiva"), { timeout: 45000 });
    await clickButton(page, "Por vehículo");
    await page.waitForFunction(() => document.body.innerText.includes("PYG corporativo"), { timeout: 60000 });
    await setVehiclePeriod(page, PERIOD);
    await page.waitForFunction(() => document.body.innerText.includes("INGRESOS DEL SERVICIO"), { timeout: 60000 });
    const loadingMarker = await page.evaluate(() => document.body.innerText.includes("Leyendo el libro contable del periodo…"));
    tables = await readStatementTables(page);
    const finalNeta = statementRow(tables, 0, "UTILIDAD NETA");
    check("browser_settled_totals_match_book_and_loading_not_stale",
      loadingMarker === false
        && parseRegionalAmount(finalNeta?.actual, 2465000).ok,
      { loading_during_assert: loadingMarker, final_neta: finalNeta });

    // ---------------------------------------------------------------- ventana ampliada
    // La fase usa el rol lector: tras aplicar permisos se hace un login REAL en
    // el navegador (applyPermissionsAndRelogin solo renueva el token de Node y
    // no toca el localStorage del browser), para que la pestana nueva herede una
    // sesion con contabilidad concedida. El reader conserva accounting:read, por
    // lo que puede leer el fixture que servira de contraste DOM.
    browserPhase = "pyg_expanded_reader_role";
    await setRolePermissions(tenantA.tenantId, tenantA.email, "CERT_PYG_READER", READER_PERMISSIONS());
    const readerToken = (await apiCall("POST", "/auth/login", null, { email: tenantA.email, password: tenantA.password })).body?.token;
    if (!readerToken) throw new Error("expanded_reader_relogin_failed");
    await page.goto(`${webUrl}/login`, { waitUntil: "networkidle2" });
    await page.evaluate(() => localStorage.clear());
    await login(page, tenantA.email, tenantA.password);
    await page.goto(`${webUrl}/dashboard/contabilidad/pyg`, { waitUntil: "networkidle2" });
    await page.waitForFunction(() => document.body.innerText.includes("Matriz interactiva"), { timeout: 45000 });
    const readerReport = await apiCall("GET", `/transport-pyg/report?period=${PERIOD}`, readerToken);
    const readerV1 = (readerReport.body?.vehicles || []).find((vehicle) => vehicle.plate === V1_PLATE) || null;
    const readerV2 = (readerReport.body?.vehicles || []).find((vehicle) => vehicle.plate === V2_PLATE) || null;
    const readerUnassigned = readerReport.body?.unassigned || null;
    // Con la configuracion por defecto el concepto INGRESOS tiene exclusion 41450501;
    // si el producto aun no aplica la configuracion persistida, el drill de
    // INGRESOS es el que contiene esa cuenta.
    const incomeServiceChild = rowOf(readerV1, "INGRESOS_SERVICIO")?.children?.find((child) => child.account_code === "41450501") || null;
    const drillAccount = incomeServiceChild || rowOf(readerV1, "INGRESOS")?.children?.find((child) => child.account_code === "41450501") || null;
    const drillConceptLabel = incomeServiceChild ? "INGRESOS SERVICIO ESPECIAL" : "INGRESOS DEL SERVICIO";
    const drillCenter = drillAccount?.centers?.find((center) => center.center_code === V1_PLATE) || drillAccount?.centers?.[0] || null;
    const netRow = (entry) => rowOf(entry, "UTILIDAD_NETA");
    const incomeServiceRow = (entry) => rowOf(entry, "INGRESOS_SERVICIO");
    check("browser_expanded_fixture_read_from_ledger_api",
      readerReport.status === 200
        && readerReport.body?.source === "accounting" && readerReport.body?.report_source === "ledger"
        && readerV1?.plate === V1_PLATE && readerV2?.plate === V2_PLATE
        && netRow(readerV1)?.actual === 1260000
        && netRow(readerV2)?.actual === 180000
        && netRow(readerUnassigned)?.actual === 1025000
        && drillAccount?.account_code === "41450501"
        && drillAccount?.actual === 2500000
        && drillCenter?.actual === 2500000,
      { v1_net: netRow(readerV1)?.actual, v2_net: netRow(readerV2)?.actual, unassigned_net: netRow(readerUnassigned)?.actual, child: drillAccount && { code: drillAccount.account_code, name: drillAccount.account_name } });

    // Contrato de URL: un periodo invalido NUNCA consulta la API (la vista
    // exige seleccion y deja el input vacio); una placa externa rechazada no
    // revela ni muestra la lectura de otra placa. Ningun caso invalido compara
    // utilidades ni exige heading/tabla del vehiculo.
    browserPhase = "pyg_expanded_url_contract";
    const invalidPeriodTab = await browser.newPage();
    attachDiagnostics(invalidPeriodTab);
    await invalidPeriodTab.setViewport({ width: 1440, height: 900 });
    invalidPeriodTab.setDefaultTimeout(20000);
    invalidPeriodTab.setDefaultNavigationTimeout(60000);
    let rejectedReportSeen = false;
    invalidPeriodTab.on("response", (response) => {
      if (response.request().method() === "GET" && new URL(response.url()).pathname.includes("/api/v1/transport-pyg/report")) rejectedReportSeen = true;
    });
    await invalidPeriodTab.goto(`${webUrl}${EXPANDED_PATH}?placa=${V1_PLATE}&periodo=2026-13`, { waitUntil: "domcontentloaded" });
    await invalidPeriodTab.waitForFunction(() => document.body.innerText.includes("Selecciona un período válido (mes y año) para leer el libro contable. No se consulta la API hasta entonces."), { timeout: 45000 });
    const invalidState = await invalidPeriodTab.evaluate((plate) => ({
      monthValue: [...document.querySelectorAll('input[type="month"]')].map((node) => node.value).find((value) => value !== "") || "",
      anyMonthFilled: [...document.querySelectorAll('input[type="month"]')].some((node) => node.value !== ""),
      tables: [...document.querySelectorAll("table")].length,
      plateHeading: [...document.querySelectorAll("h2")].some((node) => (node.textContent || "").trim().startsWith(`PYG ${plate} · `)),
      guard: document.body.innerText.includes("Acceso no autorizado"),
      url: location.pathname + location.search
    }), V1_PLATE);
    check("browser_expanded_invalid_period_requires_selection_without_api_query",
      invalidState.monthValue === ""
        && invalidState.anyMonthFilled === false
        && rejectedReportSeen === false
        && invalidState.tables === 0
        && invalidState.plateHeading === false
        && invalidState.guard === false
        && queryOf(invalidState.url).periodo === "2026-13"
        && queryOf(invalidState.url).placa === V1_PLATE,
      { state: invalidState, report_requests_seen: rejectedReportSeen });
    // Recuperacion: al elegir un periodo valido si se consulta la API y la
    // lectura del libro aparece con la placa original.
    const recoveryResponse = invalidPeriodTab.waitForResponse((response) => response.request().method() === "GET"
      && response.url().includes("/api/v1/transport-pyg/report")
      && new URL(response.url()).searchParams.get("period") === PERIOD, { timeout: 60000 });
    recoveryResponse.catch(() => undefined);
    await setExpandedMonthInput(invalidPeriodTab, PERIOD);
    const recoveryHttp = await recoveryResponse;
    const recoveryBody = await recoveryHttp.json().catch(() => null);
    await invalidPeriodTab.waitForFunction((title) => document.body.innerText.includes(title), { timeout: 45000 }, `PYG ${V1_PLATE} · ${PERIOD}`);
    const recoveryTables = await readFirstStatementTable(invalidPeriodTab);
    check("browser_expanded_invalid_period_recovers_with_valid_selection",
      recoveryHttp.status() === 200 && recoveryBody?.period === PERIOD
        && parseRegionalAmount(statementRow([recoveryTables], 0, "UTILIDAD NETA")?.actual, netRow(readerV1)?.actual).ok,
      { status: recoveryHttp.status(), api_period: recoveryBody?.period, neta: statementRow([recoveryTables], 0, "UTILIDAD NETA")?.actual });
    await invalidPeriodTab.close().catch(() => undefined);

    const externalPlateTab = await browser.newPage();
    attachDiagnostics(externalPlateTab);
    await externalPlateTab.setViewport({ width: 1440, height: 900 });
    externalPlateTab.setDefaultTimeout(20000);
    externalPlateTab.setDefaultNavigationTimeout(60000);
    const externalRequest = externalPlateTab.waitForResponse((response) => response.request().method() === "GET"
      && response.url().includes("/api/v1/transport-pyg/report")
      && new URL(response.url()).searchParams.get("period") === PERIOD, { timeout: 60000 });
    externalRequest.catch(() => undefined);
    await externalPlateTab.goto(`${webUrl}${EXPANDED_PATH}?placa=${encodeURIComponent("https://evil.external/PYG999")}&periodo=${PERIOD}`, { waitUntil: "domcontentloaded" });
    const externalResponse = await externalRequest;
    const externalBody = await externalResponse.json().catch(() => null);
    // La placa externa se descarta (seleccion vacia): con reporte cargado la
    // vista pide seleccion y NUNCA muestra el statement de otra placa. El
    // enlace conserva el periodo pedido; no se exige que la URL reescriba la
    // placa rechazada.
    await externalPlateTab.waitForFunction(() => document.body.innerText.includes("Selecciona un vehículo en «Vehículo» para ver su PYG"), { timeout: 45000 });
    const externalUrl = externalPlateTab.url();
    const externalText = await externalPlateTab.$eval("body", (body) => body.innerText).catch(() => "");
    const externalState = await externalPlateTab.evaluate(() => ({
      tables: [...document.querySelectorAll("table")].filter((table) => [...table.querySelectorAll("thead th")].some((th) => (th.textContent || "").trim().toLowerCase() === "cumplimiento")).length,
      vehicleHeadings: [...document.querySelectorAll("h2")].map((node) => (node.textContent || "").trim()).filter((text) => /^PYG [A-Z0-9]+ · \d{4}-\d{2}$/.test(text)),
      selectValue: [...document.querySelectorAll("select")].map((node) => node.value)
    }));
    check("browser_expanded_external_plate_rejected_never_shows_other_vehicle",
      externalResponse.status() === 200
        && externalBody?.period === PERIOD
        && externalState.tables === 0
        && externalState.vehicleHeadings.length === 0
        && !externalText.includes("evil.external")
        && !externalText.includes("PYG999")
        && queryOf(externalUrl).periodo === PERIOD,
      { status: externalResponse.status(), url: externalUrl, state: externalState, text_head: externalText.slice(0, 300) });
    await externalPlateTab.close().catch(() => undefined);

    // Vuelta al PYG normal con el rol lector antes de pulsar el enlace nativo.
    browserPhase = "pyg_expanded_open_native_link";
    await page.goto(`${webUrl}/dashboard/contabilidad/pyg`, { waitUntil: "networkidle2" });
    await page.waitForFunction(() => document.body.innerText.includes("Matriz interactiva"), { timeout: 45000 });
    await clickButton(page, "Por vehículo");
    await page.waitForFunction(() => document.body.innerText.includes("PYG corporativo"), { timeout: 60000 });
    await setVehiclePeriod(page, PERIOD);
    await page.waitForFunction(() => document.body.innerText.includes("INGRESOS DEL SERVICIO"), { timeout: 45000 });
    await clickTab(page, "Por vehículo");
    await clickButton(page, V1_PLATE);
    await page.waitForFunction((plate) => [...document.querySelectorAll("h2")].some((node) => (node.textContent || "").trim().startsWith(`PYG ${plate} · `)), { timeout: 15000 }, V1_PLATE);
    // Paridad de base: las filas del statement inline del MISMO vehiculo y
    // periodo, leidas del DOM padre justo antes de pulsar el enlace. La ventana
    // ampliada se contrasta contra estas filas (mismo vehicle.rows y mismo
    // StatementTable), nunca contra una lista de rótulos esperada "a mano".
    const parentStatementTables = await page.evaluate(() => [...document.querySelectorAll("table")]
      .filter((table) => [...table.querySelectorAll("thead th")].some((th) => (th.textContent || "").trim().toLowerCase() === "cumplimiento")).length);
    const inlineVehicleRows = await readFirstStatementTable(page);
    const parentBefore = {
      url: page.url(),
      period: await readVisibleMonthInput(page),
      plate: await page.evaluate((target) => {
        const buttons = [...document.querySelectorAll("button")].filter((node) => [...node.querySelectorAll("span")].some((span) => (span.textContent || "").trim() === target));
        return buttons.find((node) => node.className.includes("border-apex"))?.innerText.split("\n")[0] || null;
      }, V1_PLATE)
    };
    const linkAttributes = await readExpandedLinkAttributes(page);
    check("browser_expanded_link_native_target_blank_noopener",
      linkAttributes?.target === "_blank"
        && /noopener/.test(linkAttributes.rel || "")
        && /noreferrer/.test(linkAttributes.rel || "")
        && linkAttributes.sameOrigin === true
        && linkAttributes.pathname === EXPANDED_PATH
        && linkAttributes.expectedPath === EXPANDED_PATH
        && linkAttributes.plate === V1_PLATE
        && linkAttributes.period === PERIOD
        && linkAttributes.text.includes(linkAttributes.expectedText),
      { link: linkAttributes });
    const opened = await clickExpandedLink(page, { plate: V1_PLATE, period: PERIOD });
    let expanded = opened.expanded;
    try {
      browserPhase = "pyg_expanded_native_tab_content";
      // El enlace apunta a una SPA: el commit puede dejar el body vacio mientras
      // React monta la vista; null-safe para no contaminar page_errors.
      await expanded.waitForFunction((title) => (document.body?.innerText || "").includes(title), { timeout: 60000 }, `PYG ${V1_PLATE} · ${PERIOD}`);
      await expanded.waitForFunction(() => (document.body?.innerText || "").includes("INGRESOS SERVICIO ESPECIAL"), { timeout: 45000 });
      const expandedQuery = queryOf(expanded.url());
      check("browser_expanded_url_carries_plate_and_period", expandedQuery.placa === V1_PLATE && expandedQuery.periodo === PERIOD && isExpandedUrl(expanded.url()), { url: expanded.url(), query: expandedQuery });

      const expandedLayout = await expandedHeadingLayout(expanded, `PYG ${V1_PLATE} · ${PERIOD}`);
      check("browser_expanded_no_sidebar_no_other_menus",
        expandedLayout.found === true
          && expandedLayout.sidebar === false
          && expandedLayout.otherMenuButtons === 0
          && expandedLayout.statementTables === 1
          && expandedLayout.hasPlateMatrix === false
          && expandedLayout.unassignedVisible === false,
        expandedLayout);
      check("browser_expanded_statement_full_width", expandedLayout.mainWidth > 0 && expandedLayout.sectionWidth >= expandedLayout.mainWidth * 0.98, {
        section_width: expandedLayout.sectionWidth,
        main_width: expandedLayout.mainWidth,
        main_outer_width: expandedLayout.mainOuterWidth,
        main_client_width: expandedLayout.mainClientWidth,
        main_padding_left: expandedLayout.mainPaddingLeft,
        main_padding_right: expandedLayout.mainPaddingRight
      });

      const expandedTables = await readFirstStatementTable(expanded);
      const expandedIncomeRow = statementRow([expandedTables], 0, "INGRESOS SERVICIO ESPECIAL");
      const expandedNetRow = statementRow([expandedTables], 0, "UTILIDAD NETA");
      check("browser_expanded_amounts_match_ledger_api",
        Boolean(incomeServiceRow(readerV1)) && Boolean(netRow(readerV1))
          && parseRegionalAmount(expandedIncomeRow?.actual, incomeServiceRow(readerV1)?.actual).ok
          && parseRegionalAmount(expandedNetRow?.actual, netRow(readerV1)?.actual).ok
          && parseRegionalAmount(expandedIncomeRow?.budget, incomeServiceRow(readerV1)?.budget).ok,
        { rows: expandedTables.map((row) => ({ label: row.label, actual: row.actual, budget: row.budget })), api_income: incomeServiceRow(readerV1)?.actual, api_net: netRow(readerV1)?.actual });
      // Paridad DOM-a-DOM: la ventana ampliada no debe anadir, quitar ni
      // reetiquetar filas frente al statement inline del mismo vehiculo. El
      // concepto padre renombrado por la fase de configuracion
      // ("INGRESOS DEL SERVICIO", con $ 0 tras excluirle 41450501) debe
      // aparecer en AMBAS vistas; exigir su ausencia contradecia las
      // esperanzas de presencia de las fases previas.
      const rowKey = (row) => `${row.label}|${row.actual}|${row.budget}`;
      check("browser_expanded_rows_match_inline_statement",
        parentStatementTables === 1
          && inlineVehicleRows.length > 0
          && expandedTables.length === inlineVehicleRows.length
          && expandedTables.map(rowKey).join("\n") === inlineVehicleRows.map(rowKey).join("\n"),
        { parent_statement_tables: parentStatementTables, inline_count: inlineVehicleRows.length, expanded_count: expandedTables.length,
          only_inline: inlineVehicleRows.filter((row) => !expandedTables.some((other) => rowKey(other) === rowKey(row))).map(rowKey),
          only_expanded: expandedTables.filter((row) => !inlineVehicleRows.some((other) => rowKey(other) === rowKey(row))).map(rowKey) });
      await expanded.screenshot({ path: shot("pyg-expanded-vehicle"), fullPage: false });
      screenshots.expanded_vehicle = relative(shot("pyg-expanded-vehicle"));

      const expandedCatalog = await expanded.evaluate(() => {
        const vehicleSelect = [...document.querySelectorAll("select")].find((select) => [...select.options].some((option) => option.value === "SIN_VEHICULO"));
        // El href del enlace "Volver al PYG" se registra aqui, pero la fase de
        // vuelta lo vuelve a leer en el momento del clic (nunca usa este valor
        // guardado tras cambios de placa/periodo).
        const backLink = [...document.querySelectorAll("a")].find((node) => (node.textContent || "").trim() === "Volver al PYG");
        return {
          options: [...(vehicleSelect?.options || [])].map((option) => option.value),
          href: backLink?.getAttribute("href") || null
        };
      });
      check("browser_expanded_vehicle_selector_lists_only_period_vehicles",
        expandedCatalog.options.includes(V1_PLATE)
          && expandedCatalog.options.includes(V2_PLATE)
          && expandedCatalog.options.includes("SIN_VEHICULO")
          && !expandedCatalog.options.some((value) => /^[A-Z0-9]{1,10}$/.test(value) && ![V1_PLATE, V2_PLATE, "SIN_VEHICULO"].includes(value)),
        expandedCatalog);

      browserPhase = "pyg_expanded_drill_account_center";
      // readStatementTables solo entrega label/budget/actual/rowText: los
      // nombres e importes del drill se afirman contra el DOM real, mientras
      // que children/centers esperados salen del reporte de la API.
      let drillAccountRow = null;
      let drillCenterRow = null;
      let drillCodesHidden = false;
      if (drillAccount && drillCenter) {
        await expanded.click(`button[aria-label="Desglosar ${drillConceptLabel}"]`);
        await expanded.waitForSelector(`button[aria-label="Desglosar ${drillAccount.account_name}"]`, { timeout: 15000 });
        await expanded.click(`button[aria-label="Desglosar ${drillAccount.account_name}"]`);
        await expanded.waitForFunction((name) => document.body.innerText.includes(name), { timeout: 15000 }, drillCenter.center_name || `Vehiculo ${V1_PLATE}`);
        const drillTables = await readFirstStatementTable(expanded);
        drillAccountRow = statementRow([drillTables], 0, drillAccount.account_name) || null;
        drillCenterRow = statementRow([drillTables], 0, drillCenter.center_name || `Vehiculo ${V1_PLATE}`) || null;
        drillCodesHidden = await expanded.evaluate(() => {
          const table = [...document.querySelectorAll("table")].find((node) => [...node.querySelectorAll("thead th")].some((th) => (th.textContent || "").trim().toLowerCase() === "cumplimiento"));
          return table ? !/41450501|42100501|42950501|52050601|52953501|52454001|51050601|54100501/.test(table.innerText) : false;
        });
      }
      check("browser_expanded_drill_account_and_center",
        Boolean(drillAccount) && Boolean(drillCenter)
          && drillAccountRow?.label === drillAccount?.account_name
          && parseRegionalAmount(drillAccountRow?.actual, drillAccount?.actual).ok
          && drillCenterRow?.label === (drillCenter?.center_name || `Vehiculo ${V1_PLATE}`)
          && parseRegionalAmount(drillCenterRow?.actual, drillCenter?.actual).ok
          && drillCodesHidden === true,
        { account: drillAccountRow && { label: drillAccountRow.label, actual: drillAccountRow.actual }, center: drillCenterRow && { label: drillCenterRow.label, actual: drillCenterRow.actual }, codes_hidden: drillCodesHidden, fixture_account: drillAccount?.account_code || null });

      browserPhase = "pyg_expanded_period_change_and_persistence";
      const julyExpandedResponse = expanded.waitForResponse((response) => response.request().method() === "GET" && response.url().includes("/api/v1/transport-pyg/report") && new URL(response.url()).searchParams.get("period") === JULY, { timeout: 60000 });
      julyExpandedResponse.catch(() => undefined);
      await setExpandedMonthInput(expanded, JULY);
      const julyExpanded = await julyExpandedResponse;
      const julyPayload = await julyExpanded.json().catch(() => null);
      await expanded.waitForFunction(() => [...document.querySelectorAll("h2")].some((node) => (node.textContent || "").trim().startsWith("PYG ") && node.textContent.trim().endsWith(" · 2026-07")), { timeout: 45000 });
      const julyExpandedUrl = expanded.url();
      const julyRow = (julyPayload?.vehicles || []).find((vehicle) => vehicle.plate === V1_PLATE);
      const julyTables = await readFirstStatementTable(expanded);
      check("browser_expanded_period_change_persisted_in_url_and_ledger",
        queryOf(julyExpandedUrl).placa === V1_PLATE
          && queryOf(julyExpandedUrl).periodo === JULY
          && netRow(julyRow)?.actual === 0
          && parseRegionalAmount(statementRow([julyTables], 0, "UTILIDAD NETA")?.actual, 0).ok,
        { url: julyExpandedUrl, api_net: netRow(julyRow)?.actual });
      await expanded.reload({ waitUntil: "networkidle2" });
      await expanded.waitForFunction(() => [...document.querySelectorAll("h2")].some((node) => (node.textContent || "").trim().startsWith("PYG ") && node.textContent.trim().endsWith(" · 2026-07")), { timeout: 45000 });
      const reloadUrl = expanded.url();
      const reloadMonth = await readExpandedMonthInput(expanded);
      const reloadTables = await readFirstStatementTable(expanded);
      check("browser_expanded_period_persists_after_reload",
        reloadUrl === julyExpandedUrl
          && reloadMonth === JULY
          && queryOf(reloadUrl).placa === V1_PLATE
          && parseRegionalAmount(statementRow([reloadTables], 0, "UTILIDAD NETA")?.actual, 0).ok,
        { url: reloadUrl, month: reloadMonth });

      const augustExpandedResponse = expanded.waitForResponse((response) => response.request().method() === "GET" && response.url().includes("/api/v1/transport-pyg/report") && new URL(response.url()).searchParams.get("period") === PERIOD, { timeout: 60000 });
      augustExpandedResponse.catch(() => undefined);
      await setExpandedMonthInput(expanded, PERIOD);
      await augustExpandedResponse;
      await expanded.waitForFunction((title) => (document.body?.innerText || "").includes(title), { timeout: 45000 }, `PYG ${V1_PLATE} · ${PERIOD}`);
      const backToAugustUrl = expanded.url();
      check("browser_expanded_back_to_august_keeps_query", queryOf(backToAugustUrl).placa === V1_PLATE && queryOf(backToAugustUrl).periodo === PERIOD, { url: backToAugustUrl });

      browserPhase = "pyg_expanded_switch_second_plate";
      // Cambiar de placa NO vuelve a consultar la API: los datos ya cargados
      // se filtran en el cliente. Se espera DOM/URL actualizados y se compara
      // contra el fixture del reporte de la API leido antes. El contador cubre
      // desde aqui hasta el centinela: cualquier GET durante un cambio de
      // seleccion es regresion (los reloads deliberados quedan fuera).
      const expandedEvents = { reportResponses: 0 };
      const plateSwitchCounter = (response) => {
        if (response.request().method() === "GET" && new URL(response.url()).pathname.includes("/api/v1/transport-pyg/report")) expandedEvents.reportResponses += 1;
      };
      expanded.on("response", plateSwitchCounter);
      await expanded.select('select', V2_PLATE);
      await expanded.waitForFunction((title) => (document.body?.innerText || "").includes(title), { timeout: 45000 }, `PYG ${V2_PLATE} · ${PERIOD}`);
      const secondPlateUrl = expanded.url();
      const secondPlateTables = await readFirstStatementTable(expanded);
      const secondIncomeRow = statementRow([secondPlateTables], 0, "INGRESOS SERVICIO ESPECIAL");
      check("browser_expanded_second_plate_values_match_ledger",
        queryOf(secondPlateUrl).placa === V2_PLATE
          && queryOf(secondPlateUrl).periodo === PERIOD
          && expandedEvents.reportResponses === 0
          && parseRegionalAmount(statementRow([secondPlateTables], 0, "UTILIDAD NETA")?.actual, netRow(readerV2)?.actual).ok
          && parseRegionalAmount(secondIncomeRow?.actual, incomeServiceRow(readerV2)?.actual ?? 0).ok,
        { url: secondPlateUrl, net: statementRow([secondPlateTables], 0, "UTILIDAD NETA")?.actual, api_net: netRow(readerV2)?.actual, ingresos_servicio_dom: secondIncomeRow?.actual, api_income_service: incomeServiceRow(readerV2)?.actual, report_requests_during_switch: expandedEvents.reportResponses });
      await expanded.screenshot({ path: shot("pyg-expanded-second-plate"), fullPage: false });
      screenshots.expanded_second_plate = relative(shot("pyg-expanded-second-plate"));

      browserPhase = "pyg_expanded_unassigned_sentinel";
      // SIN_VEHICULO tampoco consulta: filtra el bloque ya cargado.
      await expanded.select('select', "SIN_VEHICULO");
      await expanded.waitForFunction(() => [...document.querySelectorAll("h2")].some((node) => (node.textContent || "").trim().startsWith("Sin vehículo / sin asignar · ")), { timeout: 45000 });
      const sentinelUrl = expanded.url();
      const sentinelTables = await readFirstStatementTable(expanded);
      check("browser_expanded_unassigned_sentinel_in_url",
        queryOf(sentinelUrl).placa === "SIN_VEHICULO"
          && queryOf(sentinelUrl).periodo === PERIOD
          && expandedEvents.reportResponses === 0
          && parseRegionalAmount(statementRow([sentinelTables], 0, "UTILIDAD NETA")?.actual, netRow(readerUnassigned)?.actual).ok,
        { url: sentinelUrl, report_requests_during_switch: expandedEvents.reportResponses });
      await expanded.off("response", plateSwitchCounter);
      await expanded.reload({ waitUntil: "networkidle2" });
      await expanded.waitForFunction(() => [...document.querySelectorAll("h2")].some((node) => (node.textContent || "").trim().startsWith("Sin vehículo / sin asignar · ")), { timeout: 45000 });
      const sentinelReloadUrl = expanded.url();
      const sentinelReloadValues = await expanded.evaluate(() => ({
        plate: [...document.querySelectorAll("select")].map((select) => select.value).find((value) => value === "SIN_VEHICULO") || null,
        text: document.body.innerText.includes("Sin vehículo / sin asignar")
      }));
      const sentinelReloadTables = await readFirstStatementTable(expanded);
      check("browser_expanded_unassigned_sentinel_persists_after_reload",
        sentinelReloadUrl === sentinelUrl
          && queryOf(sentinelReloadUrl).placa === "SIN_VEHICULO"
          && sentinelReloadValues.plate === "SIN_VEHICULO"
          && parseRegionalAmount(statementRow([sentinelReloadTables], 0, "UTILIDAD NETA")?.actual, netRow(readerUnassigned)?.actual).ok,
        { url: sentinelReloadUrl, select: sentinelReloadValues.plate });

      // F5 (recarga) SI produce un GET real del periodo pedido.
      browserPhase = "pyg_expanded_reload_queries_get";
      const reloadedGet = expanded.waitForResponse((response) => response.request().method() === "GET"
        && response.url().includes("/api/v1/transport-pyg/report")
        && new URL(response.url()).searchParams.get("period") === PERIOD, { timeout: 60000 });
      reloadedGet.catch(() => undefined);
      await expanded.reload({ waitUntil: "domcontentloaded" });
      const reloadedHttp = await reloadedGet;
      const reloadedBody = await reloadedHttp.json().catch(() => null);
      await expanded.waitForFunction(() => [...document.querySelectorAll("h2")].some((node) => (node.textContent || "").trim().startsWith("Sin vehículo / sin asignar · ")), { timeout: 45000 });
      check("browser_expanded_f5_reload_produces_real_get",
        reloadedHttp.status() === 200 && reloadedBody?.period === PERIOD && reloadedBody?.report_source === "ledger",
        { status: reloadedHttp.status(), api_period: reloadedBody?.period, url: expanded.url() });

      // Pantalla completa real solo si Chrome la soporta con el gesto del click.
      browserPhase = "pyg_expanded_fullscreen";
      const fullscreenCapability = await expanded.evaluate(() => ({
        apiAvailable: typeof document.documentElement.requestFullscreen === "function" && typeof document.exitFullscreen === "function",
        enabled: document.fullscreenEnabled === true,
        fallback: document.body.innerText.includes("pantalla completa no disponible en este navegador"),
        button: [...document.querySelectorAll("button")].some((node) => (node.textContent || "").trim() === "Pantalla completa")
      }));
      // Solo se admite la rama nativa si la API esta disponible y el gesto real
      // activa fullscreenElement; si el gesto no la activa se falla como bloqueo
      // (no se declara exito simulado).
      let fullscreenResult;
      if (fullscreenCapability.apiAvailable && fullscreenCapability.enabled) {
        await clickButtonByText(expanded, FULLSCREEN_ENTER_LABEL);
        let enteredOk = false;
        try {
          await expanded.waitForFunction(() => document.fullscreenElement !== null, { timeout: 15000 });
          enteredOk = true;
        } catch { enteredOk = false; }
        const entered = await expanded.evaluate(() => ({
          element: document.fullscreenElement?.getAttribute("class")?.slice(0, 120) || null,
          hasElement: document.fullscreenElement !== null,
          exitButton: [...document.querySelectorAll("button")].some((node) => (node.textContent || "").trim() === "Salir de pantalla completa")
        }));
        if (entered.hasElement) {
          await expanded.screenshot({ path: shot("pyg-expanded-fullscreen"), fullPage: false });
          screenshots.expanded_fullscreen = relative(shot("pyg-expanded-fullscreen"));
        }
        // En fullscreen natural el scroll vive en document.fullscreenElement
        // (la vista pone overflow-y-auto sobre si misma), no en window.
        const scrollWhileFullscreen = await expanded.evaluate(async () => {
          const target = document.fullscreenElement || document.scrollingElement || document.documentElement;
          const before = target.scrollTop;
          const max = Math.max(0, target.scrollHeight - target.clientHeight);
          target.scrollTo({ top: max, behavior: "auto" });
          await new Promise((resolve) => requestAnimationFrame(() => resolve()));
          return { before, after: target.scrollTop, max, scroller: target === document.fullscreenElement ? "fullscreenElement" : "documentElement" };
        });
        // El boton "Salir" puede quedar fuera del viewport tras bajar al final:
        // ElementHandle.click hace scrollIntoView propio antes del clic.
        const exitHandle = await expanded.evaluateHandle(() => [...document.querySelectorAll("button")].find((node) => (node.textContent || "").trim() === "Salir de pantalla completa" && !node.disabled) || null);
        const exitElement = exitHandle.asElement();
        if (!exitElement) { await exitHandle.dispose().catch(() => undefined); throw new Error("fullscreen_exit_button_not_found"); }
        try {
          await exitElement.click();
        } finally {
          await exitHandle.dispose().catch(() => undefined);
        }
        await expanded.waitForFunction(() => document.fullscreenElement === null, { timeout: 15000 });
        const exited = await expanded.evaluate(() => ({
          hasElement: document.fullscreenElement !== null,
          enterButton: [...document.querySelectorAll("button")].some((node) => (node.textContent || "").trim() === "Pantalla completa")
        }));
        fullscreenResult = {
          branch: "native_fullscreen",
          api_available: true,
          entered: enteredOk && entered.exitButton,
          exited: !exited.hasElement && exited.enterButton,
          scroll: scrollWhileFullscreen,
          fullscreen_element: entered.element
        };
        fullscreenBranches.push(fullscreenResult);
        check("browser_expanded_fullscreen_supported_and_working",
          enteredOk === true
            && entered.exitButton === true
            && (scrollWhileFullscreen.max === 0 || scrollWhileFullscreen.after > scrollWhileFullscreen.before)
            && exited.hasElement === false
            && exited.enterButton === true,
          fullscreenResult);
      } else {
        // Sin soporte nativo se exige el fallback literal visible del producto
        // (span "pantalla completa no disponible en este navegador") y que no
        // exista boton de alternar. No se simula con mocks.
        const fallbackVisible = await expanded.evaluate(() => document.body.innerText.includes("Vista ampliada (pantalla completa no disponible en este navegador)"));
        fullscreenResult = { branch: "ui_fallback", api_available: fullscreenCapability.apiAvailable, enabled: fullscreenCapability.enabled, fallback_literal: fallbackVisible, fullscreen_button: fullscreenCapability.button };
        fullscreenBranches.push(fullscreenResult);
        check("browser_expanded_fullscreen_unsupported_requires_literal_fallback",
          fallbackVisible === true && fullscreenCapability.button === false,
          fullscreenResult);
      }

      // La pestana ampliada se abrio ANTES del cambio de rol y conserva su
      // sesion lectora en memoria: se certifica que esa lectura previa existe
      // (un unico statement del libro, sin guard) mientras el popup sigue
      // mostrando el vehiculo, ANTES del "Volver al PYG" que lo navega a la
      // ruta normal. Tras el F5 de la fase recarga, la seleccion vigente del
      // popup es el centinela SIN_VEHICULO, que tambien trae un statement real.
      browserPhase = "pyg_expanded_reader_read_before_denial";
      const popupReadState = await expanded.evaluate(() => ({
        tables: [...document.querySelectorAll("table")].filter((table) => [...table.querySelectorAll("thead th")].some((th) => (th.textContent || "").trim().toLowerCase() === "cumplimiento")).length,
        statementHeading: [...document.querySelectorAll("h2")].some((node) => /^PYG |^Sin vehículo/.test((node.textContent || "").trim())),
        guard: document.body.innerText.includes("Acceso no autorizado")
      }));
      check("browser_expanded_popup_read_precedes_denial_certification",
        popupReadState.tables === 1 && popupReadState.statementHeading === true && popupReadState.guard === false,
        { read_state: popupReadState });

      browserPhase = "pyg_expanded_back_to_normal_pyg";
      // Volver al PYG: el href se lee en el momento del clic (no guardado antes
      // de cambios). El popup navega en su propia pestana: se mide la URL y el
      // aside DEL POPUP, no del padre. Destino: /dashboard/contabilidad/pyg sin
      // parametros; el padre debe conservar placa/periodo originales intactos.
      const parentUrlBeforeBack = page.url();
      // El href se lee en el momento del clic. "Volver al PYG" usa el router de
      // Next (history API), no una navegacion completa: se espera el estado
      // final en la propia pestana y se absorbe cualquier navegacion completa.
      const backState = await expanded.evaluate(() => {
        const link = [...document.querySelectorAll("a")].find((node) => (node.textContent || "").trim() === "Volver al PYG");
        if (!link) return null;
        link.scrollIntoView({ block: "center" });
        const rect = link.getBoundingClientRect();
        return { href: link.getAttribute("href"), x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
      });
      if (!backState) throw new Error("back_link_not_found_in_expanded");
      const backNavigation = expanded.waitForNavigation({ waitUntil: "networkidle2", timeout: 60000 }).catch(() => null);
      await expanded.mouse.click(backState.x, backState.y);
      await expanded.waitForFunction(() => location.pathname === "/dashboard/contabilidad/pyg" && (document.body.innerText.includes("Matriz interactiva") || document.body.innerText.includes("PYG por Vehículo")), { timeout: 60000 });
      await backNavigation;
      const backUrl = expanded.url();
      const backPathname = expandedPathOf(backUrl);
      const backQuery = queryOf(backUrl);
      const backSidebar = await readSidebarState(expanded);
      check("browser_expanded_back_restores_sidebar_on_normal_route",
        backState.href === "/dashboard/contabilidad/pyg"
          && backPathname === "/dashboard/contabilidad/pyg"
          && Object.keys(backQuery).length === 0
          && backSidebar.present === true
          && backSidebar.width > 0 && backSidebar.height > 0
          && ["Ocultar menú", "Expandir menú"].includes(backSidebar.toggleLabel || ""),
        { url: backUrl, href_at_click: backState.href, sidebar: backSidebar });
      const parentAfterBack = await page.evaluate(() => ({
        heading: [...document.querySelectorAll("h2")].map((node) => (node.textContent || "").trim()).find((text) => /^PYG [A-Z0-9]+ · /.test(text)) || null,
        month: [...document.querySelectorAll('input[type="month"]')].find((node) => { const box = node.getBoundingClientRect(); return box.width > 0 && box.height > 0; })?.value || null
      }));
      check("browser_expanded_parent_selection_unchanged_after_back",
        parentBefore.period === PERIOD
          && parentBefore.plate === V1_PLATE
          && page.url() === parentUrlBeforeBack
          && parentAfterBack.month === PERIOD
          && parentAfterBack.heading === `PYG ${V1_PLATE} · ${PERIOD}`,
        { parent_url_before: parentUrlBeforeBack, parent_url_after: page.url(), parent_before: parentBefore, parent_after: parentAfterBack });

      // El popup ya navego de vuelta a la ruta normal (fase back) y alli no hay
      // statement que leer: la lectura previa se certifico ANTES de esa vuelta.
      await closeExpanded(expanded);
      expanded = null;
      // Acceso denegado: rol sin accounting:read. applyPermissionsAndRelogin
      // solo renueva el token en Node; el navegador debe hacer un login REAL
      // para que su sesion almacene los permisos nuevos (limpieza de storage
      // UNA sola vez, antes del login). La API real responde 403 y el guard de
      // rutas niega el modulo de contabilidad con sesion autentica.
      browserPhase = "pyg_expanded_access_denied";
      await setRolePermissions(tenantA.tenantId, tenantA.email, "CERT_PYG_TRANSPORT_ONLY", [
        { module: "transport", action: "read" }, { module: "transport", action: "write" }
      ]);
      // El token Node se renueva para la API; el navegador hara su propio login
      // real. tenantA.token no vuelve a usarse como lector de contabilidad en la
      // fase ampliada (el fixture reader ya se leyo con el token lector).
      const deniedToken = (await apiCall("POST", "/auth/login", null, { email: tenantA.email, password: tenantA.password })).body?.token;
      if (!deniedToken) throw new Error("expanded_denied_relogin_failed");
      tenantA.token = deniedToken;
      const deniedReport = await apiCall("GET", `/transport-pyg/report?period=${PERIOD}`, deniedToken);
      check("api_expanded_report_denied_without_accounting_read",
        deniedReport.status === 403 && deniedReport.body?.code === "PERMISO_DENEGADO",
        { status: deniedReport.status, code: deniedReport.body?.code });

      const deniedTab = await browser.newPage();
      attachDiagnostics(deniedTab);
      await deniedTab.setViewport({ width: 1440, height: 900 });
      deniedTab.setDefaultTimeout(20000);
      deniedTab.setDefaultNavigationTimeout(60000);
      await deniedTab.goto(`${webUrl}/login`, { waitUntil: "networkidle2" });
      await deniedTab.evaluate(() => localStorage.clear());
      await login(deniedTab, tenantA.email, tenantA.password);
      // Tras el login real el token queda en localStorage y NO se toca al
      // navegar: la negacion se certifica con sesion autentica, no anonima.
      let deniedResponseStatus = null;
      let deniedResponseUrl = null;
      // El guard de la vista ampliada puede responder antes de montar el
      // componente, por lo que puede no existir peticion de reporte desde la
      // pestana: el 403 real se certifica ademas contra la API con el mismo
      // token del usuario web.
      const deniedPageResponse = deniedTab.waitForResponse((response) => response.request().method() === "GET"
        && response.url().includes("/api/v1/transport-pyg/report"), { timeout: 20000 });
      deniedPageResponse.catch(() => undefined);
      const deniedNavigation = deniedTab.goto(`${webUrl}${EXPANDED_PATH}?placa=${V1_PLATE}&periodo=${PERIOD}`, { waitUntil: "domcontentloaded" }).catch(() => null);
      const observed = await deniedPageResponse.catch(() => null);
      if (observed) {
        deniedResponseStatus = observed.status();
        deniedResponseUrl = observed.url();
      }
      await deniedNavigation;
      await deniedTab.waitForFunction(() => /Acceso no autorizado|No fue posible leer|no tiene permisos/.test(document.body.innerText), { timeout: 45000 });
      const deniedText = await deniedTab.$eval("body", (body) => body.innerText).catch(() => "");
      const deniedSession = await deniedTab.evaluate(() => Boolean(localStorage.getItem("token")));
      const deniedSidebar = await readSidebarState(deniedTab);
      const deniedLayout = await deniedTab.evaluate(() => ({
        statement: [...document.querySelectorAll("table")].length,
        guard: document.body.innerText.includes("Acceso no autorizado"),
        heading: [...document.querySelectorAll("h2")].map((node) => node.textContent.trim())
      }));
      check("browser_expanded_access_denied_without_accounting_read",
        deniedSession === true
          && deniedLayout.guard === true
          && deniedSidebar.present === false
          && deniedLayout.statement === 0
          && /no tiene permisos/.test(deniedText)
          && (deniedResponseStatus === null || deniedResponseStatus === 403),
        { page_response_status: deniedResponseStatus, page_response_url: deniedResponseUrl, api_status: deniedReport.status, session_token_present: deniedSession, sidebar: deniedSidebar, layout: deniedLayout });
      // Con el rol denegado activo, una pestana autenticada nueva (login real
      // tras limpiar storage una sola vez) debe mostrar el guard literal del
      // RouteAccessGuard sin tabla y sin aside. Se certifica ANTES de restaurar
      // los permisos full.
      await deniedTab.goto(`${webUrl}/login`, { waitUntil: "networkidle2" });
      await deniedTab.evaluate(() => localStorage.clear());
      await login(deniedTab, tenantA.email, tenantA.password);
      const popupDeniedNavigation = deniedTab.goto(`${webUrl}${EXPANDED_PATH}?placa=${V1_PLATE}&periodo=${PERIOD}`, { waitUntil: "domcontentloaded" }).catch(() => null);
      // El guard puede responder sin consulta de modulo (no hay lectura que
      // negar en red): se espera el texto literal del guard, no un 403.
      await popupDeniedNavigation;
      await deniedTab.waitForFunction(() => /Acceso no autorizado/.test(document.body.innerText), { timeout: 45000 });
      const tabDeniedState = await deniedTab.evaluate(() => ({
        guard: document.body.innerText.includes("Acceso no autorizado"),
        noPermisos: document.body.innerText.includes("no tiene permisos"),
        tables: [...document.querySelectorAll("table")].length,
        statementHeading: [...document.querySelectorAll("h2")].some((node) => /^PYG /.test((node.textContent || "").trim()))
      }));
      const tabDeniedSidebar = await readSidebarState(deniedTab);
      check("browser_expanded_guard_denies_tab_session_without_table",
        tabDeniedState.guard === true
          && tabDeniedState.noPermisos === true
          && tabDeniedState.tables === 0
          && tabDeniedState.statementHeading === false
          && tabDeniedSidebar.present === false,
        { state: tabDeniedState, sidebar: tabDeniedSidebar });
      await applyPermissionsAndRelogin(tenantA, "CERT_PYG_ROLE", FULL_PERMISSIONS());
      await deniedTab.close().catch(() => undefined);
    } catch (error) {
      // Diagnostico del popup ANTES del finally que lo cierre: si la fase
      // ampliada falla se conserva captura, texto y URL de la pestaña nueva.
      if (expanded) {
        try {
          const snapshot = await snapshotBrowserState(expanded, `diag-expanded-failure-${browserPhase}`);
          browserDiagnostics.snapshots.push(snapshot);
          browserDiagnostics.expanded_failure_url = snapshot.url;
        } catch (snapshotError) {
          browserDiagnostics.expanded_snapshot_error = String(snapshotError?.message || snapshotError);
        }
      }
      throw error;
    } finally {
      await closeExpanded(expanded);
      expanded = null;
    }

    check("screenshots_captured", ["accounting_drill", "single_vehicle", "config_ledger_only", "config_saved", "stale_guard", "expanded_vehicle", "expanded_second_plate"].every((key) => screenshots[key] && fs.existsSync(path.join(root, screenshots[key])) && fs.statSync(path.join(root, screenshots[key])).size > 0), { screenshots });
    check("expanded_fullscreen_branch_recorded", fullscreenBranches.length === 1 && ["native_fullscreen", "ui_fallback"].includes(fullscreenBranches[0].branch), { fullscreen: fullscreenBranches });
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
    accounts: Object.fromEntries(Object.entries(accounts).map(([key, row]) => [key, row?.code])),
    cash: cash.code,
    vehicles: { v1: V1_PLATE, v2: V2_PLATE },
    documents: docs.length + 1,
    expanded_window: {
      route: EXPANDED_PATH,
      fullscreen_branch: fullscreenBranches[0] || null,
      screenshots: Object.fromEntries(Object.entries(screenshots).filter(([key]) => key.startsWith("expanded_")))
    },
    screenshots,
    browser_diagnostics: browserDiagnostics
  };
}

function writeEvidence(status, payload, sources) {
  const evidence = {
    version: 2,
    certification: "transport-pyg-ledger-only-browser-local",
    status: checks.some((item) => !item.ok) ? "failed" : status,
    browser_coverage_completed: status === "passed" && checks.every((item) => item.ok) && checks.some((item) => item.name === "browser_web_server_available" && item.ok)
      && checks.some((item) => item.name === "screenshots_captured" && item.ok)
      && checks.some((item) => item.name === "browser_expanded_opened_from_real_click_with_expected_query" && item.ok)
      && checks.some((item) => item.name === "browser_expanded_back_restores_sidebar_on_normal_route" && item.ok)
      && checks.some((item) => item.name === "browser_expanded_access_denied_without_accounting_read" && item.ok)
      && checks.some((item) => item.name === "expanded_fullscreen_branch_recorded" && item.ok),
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
      "API parcheada corriendo en LOCAL_API_URL (default http://127.0.0.1:3219).",
      "Web parcheada compilada corriendo en LOCAL_WEB_URL (default http://127.0.0.1:3011).",
      "Google Chrome en la ruta estandar o CHROME_BIN.",
      "Registro permite nuevos tenants aislados; ejecutar desde la raiz del repositorio.",
      "La ventana ampliada se abre con click real sobre el enlace nativo; si Chrome no expone la pestana emergente por CDP el script se bloquea (no hay sustituto simulado).",
      "El 403 real de acceso denegado se certifica contra la API; si el guard de la vista ampliada responde antes de montar el lector, no se exige una segunda peticion desde la pestana.",
      "Este script no inicia ni detiene servidores ni aplica migraciones ni toca esquemas remotos."
    ],
    checks,
    browser_diagnostics: { console: consoleLogs, page_errors: pageErrors, failed_requests: failedRequests, dialogs, observed_requests: observedRequests },
    ...payload
  };
  fs.mkdirSync(evidenceDir, { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`);
  // Salida por stdout SIEMPRE loopback (API/web/database locales); nunca rutas ni
  // hosts remotos.
  const loopbackOnly = [apiUrl, webUrl].every((value) => LOOPBACK.has(new URL(value).hostname)) && evidence.database === "loopback";
  if (!loopbackOnly) throw new Error("BLOQUEADO: la evidencia solo puede publicarse desde entornos loopback.");
  if (evidence.status !== "passed") process.exitCode = 1;
  console.log(JSON.stringify(evidence));
}

main()
  .then((payload) => writeEvidence("passed", payload, collectSources()))
  .catch(async (error) => {
    await db.$disconnect().catch(() => undefined);
    const sources = (() => { try { return collectSources(); } catch { return {}; } })();
    const diagnostics = error?.browserDiagnostics || { console: consoleLogs, page_errors: pageErrors, failed_requests: failedRequests, dialogs, observed_requests: observedRequests, snapshots: [] };
    const failureCheckpoint = error?.failureCheckpoint || null;
    const browserStarted = Boolean(failureCheckpoint && failureCheckpoint !== "web_availability");
    writeEvidence(browserStarted ? "failed" : "pending", {
      error: String(error?.stack || error),
      failure_checkpoint: error?.failureCheckpoint || null,
      screenshots,
      browser_diagnostics: diagnostics
    }, sources);
  });
