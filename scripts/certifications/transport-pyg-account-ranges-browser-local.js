/* Certificacion local completa del PYG por vehiculo con fuente contable
 * (rangos PUC inclusivos y exclusiones puntuales configurables). Chrome real,
 * API local real y Prisma local real. Sin interceptar peticiones, sin mocks
 * de React y sin tocar entornos QA.
 *
 * Cubre: GET/PUT /transport-pyg/account-configuration (propuesta del Excel,
 * validaciones, persistencia, aislamiento y RBAC), el reporte contable por
 * vehiculo (asignacion por centro/placa, subtotales, sin clasificar, bloque
 * SIN VEHICULO, reconciliacion, presupuesto desde PYG Contable, drill de
 * nombres) y la fase de navegador (configuracion, guardado, persistencia,
 * concepto nuevo con rango/exclusion, solo lectura, fuente operativa intacta
 * y selector Contable PUC preservado).
 *
 * Prerequisitos: PostgreSQL loopback migrado, API parcheada en LOCAL_API_URL
 * (default http://127.0.0.1:3215), web parcheada compilada en LOCAL_WEB_URL
 * (default http://127.0.0.1:3004), Chrome instalado y DATABASE_URL loopback
 * exportado. Ejecutar desde la raiz del repositorio. No inicia ni detiene
 * servidores ni aplica migraciones.
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
const apiUrl = loopbackUrl("LOCAL_API_URL", process.env.LOCAL_API_URL || "http://127.0.0.1:3215");
const webUrl = loopbackUrl("LOCAL_WEB_URL", process.env.LOCAL_WEB_URL || "http://127.0.0.1:3004");
const output = path.resolve(root, process.env.BROWSER_EVIDENCE_PATH || "docs/qa/evidence/transport-pyg-account-ranges-20261024/browser-local.json");
const evidenceDir = path.dirname(output);
const browserPath = process.env.CHROME_BIN || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const suffix = crypto.randomBytes(5).toString("hex");
const checks = [];
const db = new PrismaClient();

const SOCIETY = "SOC-PYG";
const B1 = "NORTE";
const C1 = "CC-NORTE-1";
const PERIOD = "2026-10";
const V1_PLATE = "RVQ101";
const V2_PLATE = "RVQ102";

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
  api_account_config: "apps/api/src/modules/transport-pyg/account-config.js",
  api_account_engine: "apps/api/src/modules/transport-pyg/account-engine.js",
  api_account_config_service: "apps/api/src/modules/transport-pyg/account-config-service.js",
  api_service: "apps/api/src/modules/transport-pyg/service.js",
  api_routes: "apps/api/src/modules/transport-pyg/routes.js",
  api_schema: "apps/api/src/modules/transport-pyg/schema.js",
  api_engine: "apps/api/src/modules/transport-pyg/engine.js",
  api_unit_test: "apps/api/test/transport-pyg-account-ranges.test.js",
  web_api_client: "apps/web/lib/api.ts",
  web_config_lib: "apps/web/lib/transport-pyg-account-config.ts",
  web_config_component: "apps/web/components/transport-pyg/TransportPygAccountConfig.tsx",
  web_pyg_page: "apps/web/app/dashboard/contabilidad/pyg/page.tsx",
  web_unit_test: "apps/web/test/transport-pyg-account-config.test.mjs",
  script: "scripts/certifications/transport-pyg-account-ranges-browser-local.js",
  docs: "docs/qa/certifications/transport-pyg-account-ranges-20261024.md"
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
  const password = `Pyg-Ranges-${suffix}9!`;
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
  // Toda cuenta existente se respeta tal cual: nunca se altera su padre, su
  // clase ni si permite movimientos.
  if (existing) return existing;
  if (accountDepth(code) < 1) throw new Error(`account_${code}_not_puc_code`);
  if (parentCode !== accountParentCode(code)) throw new Error(`account_${code}_invalid_parent_${parentCode}`);
  // La cadena completa (1 -> 2 -> 4 -> 6 -> 8) se asegura antes de crear la
  // cuenta: la API exige que el auxiliar cuelgue de su subcuenta activa y el
  // catalogo real no incluye todas las subcuentas (p. ej. 5410 no existe).
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
  // Carrera entre el POST y una creacion concurrente: si la cuenta ya existe
  // se reutiliza; cualquier otro error se propaga con el codigo de la API.
  const raced = await db.account.findFirst({ where: { tenant_id: tenantId, code } });
  if (raced) return raced;
  throw new Error(`account_${code}_failed status=${result.status} code=${result.body?.code || ""} message=${result.body?.message || ""}`.trim());
}

// El reporte contable solo lee cuentas de resultado (clases 4-7), pero el
// documento contable exige una contrapartida que permita movimientos: se busca
// una cuenta de caja/banco transaccional real y, si no existe, ensureAccount
// asegura la cadena 11 -> 1105 -> 110505 por id antes del auxiliar 11050501.
// Nunca se altera una cuenta del plan.
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

// requirePermission resuelve el rol en cada peticion (no viaja en el JWT), asi
// que el cambio de permisos aplica en la siguiente llamada. El nombre nunca es
// APEX_ADMIN ni un alias administrativo porque requirePermission permite el
// bypass a esos roles y ocultaria el 403 de solo lectura.
async function setRolePermissions(tenantId, email, name, entries) {
  const user = await db.user.findFirst({ where: { tenant_id: tenantId, email } });
  if (!user?.role_id) throw new Error(`role_not_found_for_${email}`);
  await db.role.update({ where: { id: user.role_id }, data: { name, metadata: {} } });
  await db.permission.deleteMany({ where: { role_id: user.role_id } });
  for (const entry of entries) {
    await db.permission.create({ data: { role_id: user.role_id, module: entry.module, action: entry.action } });
  }
  // Mismo cache de tenant que invalida la API tras guardar permisos: sin esto la
  // jerarquia del rol puede seguir exponiendo los permisos anteriores.
  const { invalidateTenantCache } = require(path.join(root, "apps/api/src/core/tenantCache.js"));
  await invalidateTenantCache(tenantId);
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
    if (!url.includes("/api/v1/transport-pyg/")) return;
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
        rangos_puc: matches("Rangos PUC · Estructura contable del PYG por vehículo"),
        fuente_contable: matches("FUENTE: ESTRUCTURA CONTABLE"),
        fuente_operativa: matches("FUENTE: OPERATIVA HISTÓRICA"),
        sin_vehiculo: matches("Sin vehículo / sin asignar"),
        reconciliacion: matches("Reconciliación con el libro"),
        solo_lectura: matches("Consulta de solo lectura"),
        chart_removed: !matches("Producción vs. costo por placa")
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

async function ensureVehicleReportPeriod(page, period) {
  // La vista por vehiculo pertenece al nav de tabs (el que contiene
  // Consolidado), no al selector del encabezado ni al primer overflow-x-auto.
  await page.waitForFunction(() => [...document.querySelectorAll("nav")].some((node) => node.className.includes("overflow-x-auto")
    && ["Consolidado", "Por vehículo"].every((wanted) => [...node.querySelectorAll("button")].some((button) => (button.textContent || "").trim() === wanted && !button.disabled))), { timeout: 30000 });
  const current = await page.evaluate(() => {
    const input = [...document.querySelectorAll('input[type="month"]')].find((node) => {
      const box = node.getBoundingClientRect();
      return box.width > 0 && box.height > 0;
    });
    return input ? input.value : null;
  });
  if (!current) throw new Error("month_input_missing_in_vehicle_view");
  if (current === period) return;
  const pending = page.waitForResponse((response) => response.url().includes("/api/v1/transport-pyg/report") && new URL(response.url()).searchParams.get("period") === period && response.request().method() === "GET", { timeout: 60000 });
  await page.evaluate((next) => {
    const input = [...document.querySelectorAll('input[type="month"]')].find((node) => {
      const box = node.getBoundingClientRect();
      return box.width > 0 && box.height > 0;
    });
    if (!input) throw new Error("month_input_not_found");
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    setter.call(input, next);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, period);
  await pending;
}

// Tabla de estado (StatementTable): la cabecera "Cumplimiento" la distingue de
// la matriz. El label primario de la fila excluye los badges hermanos
// (SIN MAPEAR, PENDIENTE, etc.) que ensucian el texto del td.
async function readStatementTables(page) {
  return page.evaluate(() => {
    const headerMatcher = (table) => [...table.querySelectorAll("thead th")].some((th) => (th.textContent || "").trim().toLowerCase() === "cumplimiento");
    const primaryLabel = (cell) => {
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

// ---------------------------------------------------------------- payloads de configuracion

function proposalConcepts() {
  return accountConfigModule.cloneProposal().concepts;
}

function invalidPayload(kind) {
  const base = proposalConcepts();
  if (kind === "inverted_range") {
    const concepts = JSON.parse(JSON.stringify(base));
    concepts.find((concept) => concept.code === "INGRESOS").ranges = [{ start: "41999999", end: "41450101" }];
    return { source: "accounting", concepts };
  }
  if (kind === "duplicate_code") {
    const concepts = JSON.parse(JSON.stringify(base));
    concepts.push({ ...JSON.parse(JSON.stringify(base.find((concept) => concept.code === "INGRESOS"))), order: 27 });
    return { source: "accounting", concepts };
  }
  if (kind === "overlap") {
    const concepts = JSON.parse(JSON.stringify(base));
    concepts.push({ code: "INGRESOS_EXTRA", name: "INGRESOS EXTRA", section: "ingresos", kind: "income", order: 27, ranges: [{ start: "41900000", end: "41999999" }], exclusions: [] });
    return { source: "accounting", concepts };
  }
  if (kind === "subtotal_ranges") {
    const concepts = JSON.parse(JSON.stringify(base));
    concepts.find((concept) => concept.code === "TOTAL_INGRESOS").ranges = [{ start: "52050601", end: "52050601" }];
    return { source: "accounting", concepts };
  }
  if (kind === "exclusion_outside") {
    const concepts = JSON.parse(JSON.stringify(base));
    concepts.find((concept) => concept.code === "INGRESOS").exclusions = [{ start: "52050601", end: "52050601" }];
    return { source: "accounting", concepts };
  }
  if (kind === "empty_concepts") return { source: "accounting", concepts: [] };
  if (kind === "bad_source") return { source: "bogus", concepts: [] };
  throw new Error(`unknown_invalid_payload:${kind}`);
}

// Configuracion personalizada: INGRESOS con exclusion de 41450501 y concepto
// nuevo INGRESOS_SERVICIO (desambiguacion por exclusion, sin solape efectivo).
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
  const tenantA = await registerTenant("pyg-rng-a");
  const tenantB = await registerTenant("pyg-rng-b");
  await setRolePermissions(tenantA.tenantId, tenantA.email, "CERT_PYG_ROLE", FULL_PERMISSIONS());
  await setRolePermissions(tenantB.tenantId, tenantB.email, "CERT_PYG_ROLE_B", FULL_PERMISSIONS());

  const accountCount = await db.account.count({ where: { tenant_id: tenantA.tenantId } });
  check("fixture_standard_chart_initialized", accountCount >= 2500, { accounts: accountCount });

  await seedOrganization(tenantA.token, tenantA.tenantId);
  const party = await db.party.create({ data: { tenant_id: tenantA.tenantId, type: "customer", name: "Cliente PYG QA", active: true } });

  // Cuentas exactas del flujo (8 digitos). ensureAccount asegura la cadena PUC
  // completa por prefijo (54 -> 5405 -> 541005 -> 54100501) antes de crear. El
  // catalogo versionado incluye 54 y 5405, pero no 5410 ni 541005: la
  // subcuenta del impuesto se crea bajo 5405 y hereda su naturaleza expense.
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
    // El grupo 541005 es agrupacion puede existir sin movimientos; los 8
    // auxiliares, incluido 54100501, deben ser transaccionales y activos.
    const transactional = key === "tax_group" ? account.active === true : account.active === true && account.allows_tx === true;
    if (!transactional) throw new Error(`fixture_${key}_not_${key === "tax_group" ? "active" : "transactional"}_${account.code}`);
  }
  const accountById = (id, tenantId) => db.account.findFirst({ where: { tenant_id: tenantId, id } });
  // El padre se resuelve siempre por id: un parent_id nulo o inexistente deja
  // la cadena incompleta y el check falla.
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
  // Los padres heredados del bootstrap del tenant (p. ej. 5105 y 5205 de 4
  // digitos) se preservan tal cual: pueden tener allows_tx = true y esa
  // condicion es correcta para el repositorio, por eso la cadena solo exige
  // que el padre exista, que su codigo sea el prefijo exacto y que este activo.
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

  // ---------------------------------------------------------------- GET/PUT account-configuration
  const configGet1 = await apiCall("GET", "/transport-pyg/account-configuration", tenantA.token);
  const proposal = configGet1.body?.proposal;
  check("config_get_operational_default_with_proposal",
    configGet1.status === 200
      && configGet1.body?.source === "operational"
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

  // Validaciones del PUT: el HTTP demuestra el rechazo cableado; los codigos
  // especificos se verifican contra el validador puro (mismo codigo del server).
  const validationCases = [
    { kind: "inverted_range", codes: ["RANGE_INVERTED"] },
    { kind: "duplicate_code", codes: ["CONCEPT_CODE_DUPLICATE"] },
    { kind: "overlap", codes: ["CONCEPT_OVERLAP"] },
    { kind: "subtotal_ranges", codes: ["SUBTOTAL_WITH_RANGES"] },
    { kind: "exclusion_outside", codes: ["EXCLUSION_OUTSIDE_RANGE"] },
    { kind: "empty_concepts", codes: ["CONCEPTS_REQUIRED"] }
  ];
  for (const item of validationCases) {
    const payload = invalidPayload(item.kind);
    const httpResult = await apiCall("PUT", "/transport-pyg/account-configuration", tenantA.token, payload);
    const validated = accountConfigModule.validateAccountConfig(payload);
    const codes = (validated.errors || []).map((error) => error.code);
    check(`config_put_rejects_${item.kind}`,
      httpResult.status === 400
        && httpResult.body?.code === "PYG_ACCOUNT_CONFIG_INVALID"
        && item.codes.every((code) => codes.includes(code)),
      { status: httpResult.status, code: httpResult.body?.code, codes });
  }
  const badSourceHttp = await apiCall("PUT", "/transport-pyg/account-configuration", tenantA.token, invalidPayload("bad_source"));
  const badSourceValidated = accountConfigModule.validateAccountConfig(invalidPayload("bad_source"));
  check("config_put_rejects_bad_source",
    badSourceHttp.status === 400
      && badSourceValidated.errors.some((error) => error.code === "SOURCE_INVALID"),
    { status: badSourceHttp.status, code: badSourceHttp.body?.code, codes: badSourceValidated.errors.map((error) => error.code) });

  const configBeforeCustomPut = await db.tenant.findUnique({ where: { id: tenantA.tenantId }, select: { config: true } });
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

  // ---------------------------------------------------------------- documentos y presupuesto
  const docs = [
    { date: "2026-10-05", text: "Ingreso placa RVQ101", lines: [docLine(accounts.income_service.code, B1, V1_PLATE, "credit", 2500000, party.id, "Ingreso servicio"), docLine(cash.code, B1, V1_PLATE, "debit", 2500000, party.id, "Caja contrapartida")] },
    { date: "2026-10-06", text: "Ingreso centro sin vehiculo", lines: [docLine(accounts.income_service.code, B1, C1, "credit", 1000000, party.id, "Ingreso servicio centro"), docLine(cash.code, B1, C1, "debit", 1000000, party.id, "Caja contrapartida")] },
    { date: "2026-10-07", text: "Sueldos RVQ101", lines: [docLine(accounts.expense_personal.code, B1, V1_PLATE, "debit", 800000, party.id, "Sueldos"), docLine(cash.code, B1, V1_PLATE, "credit", 800000, party.id, "Caja contrapartida")] },
    { date: "2026-10-08", text: "Combustible RVQ101", lines: [docLine(accounts.expense_fuel.code, B1, V1_PLATE, "debit", 300000, party.id, "Combustible"), docLine(cash.code, B1, V1_PLATE, "credit", 300000, party.id, "Caja contrapartida")] },
    { date: "2026-10-09", text: "Mantenimiento RVQ102", lines: [docLine(accounts.expense_maintenance.code, B1, V2_PLATE, "debit", 150000, party.id, "Mantenimiento"), docLine(cash.code, B1, V2_PLATE, "credit", 150000, party.id, "Caja contrapartida")] },
    { date: "2026-10-10", text: "Impuesto simple RVQ101", lines: [docLine(accounts.tax_simple.code, B1, V1_PLATE, "debit", 100000, party.id, "Impuesto regimen simple"), docLine(cash.code, B1, V1_PLATE, "credit", 100000, party.id, "Caja contrapartida")] },
    { date: "2026-10-11", text: "Ingreso no operativo RVQ102", lines: [docLine(accounts.income_noop.code, B1, V2_PLATE, "credit", 50000, party.id, "Ingreso no operativo"), docLine(cash.code, B1, V2_PLATE, "debit", 50000, party.id, "Caja contrapartida")] },
    { date: "2026-10-12", text: "Gasto sin clasificar RVQ101", lines: [docLine(accounts.expense_unclassified.code, B1, V1_PLATE, "debit", 40000, party.id, "Gasto sin clasificar"), docLine(cash.code, B1, V1_PLATE, "credit", 40000, party.id, "Caja contrapartida")] },
    { date: "2026-10-13", text: "Ingreso sin clasificar centro", lines: [docLine(accounts.income_unclassified.code, B1, C1, "credit", 25000, party.id, "Ingreso sin clasificar"), docLine(cash.code, B1, C1, "debit", 25000, party.id, "Caja contrapartida")] },
    { date: "2026-10-14", text: "Ingreso placa RVQ102", lines: [docLine(accounts.income_service.code, B1, V2_PLATE, "credit", 400000, party.id, "Ingreso servicio"), docLine(cash.code, B1, V2_PLATE, "debit", 400000, party.id, "Caja contrapartida")] },
    { date: "2026-10-15", text: "Combustible RVQ102", lines: [docLine(accounts.expense_fuel.code, B1, V2_PLATE, "debit", 120000, party.id, "Combustible"), docLine(cash.code, B1, V2_PLATE, "credit", 120000, party.id, "Caja contrapartida")] }
  ];
  for (const doc of docs) {
    await postDocument(tenantA.token, { posting_date: doc.date, header_text: doc.text, lines: doc.lines });
  }
  check("fixture_documents_posted_via_canonical_api", true, { count: docs.length });

  // Presupuesto desde el almacen PYG Contable (cuenta/sucursal/centro): misma
  // fuente que usa el reporte contable; nunca el presupuesto operativo.
  const budgetPut = await apiCall("PUT", "/accounting/reports/pyg-interactive/budgets", tenantA.token, {
    period: PERIOD,
    rows: [
      { account_id: accounts.income_service.id, branch_code: B1, cost_center_code: V1_PLATE, amount: 2000000 },
      { account_id: accounts.expense_fuel.id, branch_code: B1, cost_center_code: V1_PLATE, amount: 300000 },
      { account_id: accounts.expense_personal.id, branch_code: B1, cost_center_code: V1_PLATE, amount: 400000 }
    ]
  });
  check("fixture_pyg_budgets_put_via_canonical_api", budgetPut.status === 200, { status: budgetPut.status });

  // ---------------------------------------------------------------- reporte contable por vehiculo
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
      && rowOf(v2, "INGRESOS_SERVICIO")?.budget_coverage === "none"
      && corporateRow("INGRESOS_SERVICIO")?.budget === 2000000
      && corporateRow("INGRESOS_SERVICIO")?.budget_coverage === "partial"
      && corporateRow("COMBUSTIBLE")?.budget === 300000
      && corporateRow("COMBUSTIBLE")?.budget_coverage === "partial",
    { v1_ingresos: rowOf(v1, "INGRESOS_SERVICIO"), v2_ingresos: rowOf(v2, "INGRESOS_SERVICIO"), corporate_ingresos: corporateRow("INGRESOS_SERVICIO"), corporate_combustible: corporateRow("COMBUSTIBLE") });

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

  check("accounting_report_pending_and_informational_rows",
    corporateRow("CREDITOS")?.pending === true && corporateRow("CREDITOS")?.pending_message === "Pendiente de asociar cuenta"
      && corporateRow("AVERIAS")?.pending === true
      && corporateRow("DEPRECIACION")?.pending === true && corporateRow("DEPRECIACION")?.informational === true
      && corporateRow("TOTAL_INGRESOS")?.children?.length === 0
      && corporateRow("UTILIDAD_NETA")?.pending === undefined,
    { creditos: corporateRow("CREDITOS"), depreciacion: corporateRow("DEPRECIACION") });

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

  const corporateRowCodes = corporate.rows.map((row) => row.code);
  check("accounting_report_ordered_rows_stable_tie",
    corporateRowCodes[0] === "INGRESOS" && corporateRowCodes[1] === "INGRESOS_SERVICIO" && corporateRowCodes.includes("TOTAL_INGRESOS"),
    { first_rows: corporateRowCodes.slice(0, 6) });

  // ---------------------------------------------------------------- RBAC y aislamiento
  await setRolePermissions(tenantA.tenantId, tenantA.email, "CERT_PYG_READER", READER_PERMISSIONS());
  const rbacPut = await apiCall("PUT", "/transport-pyg/account-configuration", tenantA.token, { source: "accounting", concepts: proposalConcepts() });
  const rbacGet = await apiCall("GET", "/transport-pyg/account-configuration", tenantA.token);
  const rbacReport = await apiCall("GET", `/transport-pyg/report?period=${PERIOD}`, tenantA.token);
  check("read_only_role_config_put_403_get_200",
    rbacPut.status === 403 && rbacPut.body?.code === "PERMISO_DENEGADO" && rbacGet.status === 200 && rbacReport.status === 200,
    { put: rbacPut.status, get: rbacGet.status, report: rbacReport.status, code: rbacPut.body?.code });
  await setRolePermissions(tenantA.tenantId, tenantA.email, "CERT_PYG_ROLE", FULL_PERMISSIONS());
  // El JWT puede portar una copia del rol; tras cambiar permisos se vuelve a
  // iniciar sesion para certificar contra el rol vigente del servidor.
  tenantA.token = (await apiCall("POST", "/auth/login", null, { email: tenantA.email, password: tenantA.password })).body?.token || tenantA.token;

  const configB1 = await apiCall("GET", "/transport-pyg/account-configuration", tenantB.token);
  const reportB1 = await apiCall("GET", `/transport-pyg/report?period=${PERIOD}`, tenantB.token);
  check("cross_company_config_and_report_isolated",
    configB1.status === 200 && configB1.body?.has_config === false && configB1.body?.source === "operational"
      && reportB1.status === 200 && reportB1.body?.source === "operational" && ["operational", "none"].includes(reportB1.body?.report_source)
      && (reportB1.body?.vehicles || []).length === 0,
    { config: configB1.body && { has_config: configB1.body.has_config, source: configB1.body.source }, report_source: reportB1.body?.source, vehicles: reportB1.body?.vehicles?.length });
  const putB = await apiCall("PUT", "/transport-pyg/account-configuration", tenantB.token, { source: "accounting", concepts: [proposalConcepts()[0]] });
  const configAAfterB = await apiCall("GET", "/transport-pyg/account-configuration", tenantA.token);
  check("cross_company_config_writes_stay_scoped",
    putB.status === 200
      && configAAfterB.body?.config?.concepts?.length === 27
      && configAAfterB.body?.config?.concepts?.some((concept) => concept.code === "INGRESOS_SERVICIO"),
    { put_b: putB.status, config_a_concepts: configAAfterB.body?.config?.concepts?.length });
  await apiCall("PUT", "/transport-pyg/account-configuration", tenantB.token, { source: "operational", concepts: [] });

  // ---------------------------------------------------------------- fase de navegador real
  // La web se espera inmediatamente antes de lanzar Chrome: los checks de API
  // corren aunque la web este apagada y, si no responde, la fase falla con
  // evidencia FAILED. La cobertura de navegador nunca se omite.
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

    // Selector Contable PUC preservado y vista por vehiculo con fuente contable.
    browserPhase = "pyg_contable_selector";
    await page.goto(`${webUrl}/dashboard/contabilidad/pyg`, { waitUntil: "networkidle2" });
    await page.waitForFunction(() => document.body.innerText.includes("Matriz interactiva"), { timeout: 45000 });
    check("browser_contable_puc_selector_intact", true, {});
    await clickButton(page, "Por vehículo");
    await page.waitForFunction(() => document.body.innerText.includes("PYG corporativo"), { timeout: 60000 });
    await ensureVehicleReportPeriod(page, PERIOD);
    await page.waitForFunction(() => document.body.innerText.includes("Sin vehículo / sin asignar"), { timeout: 45000 });

    const accountingBodyText = await page.$eval("body", (body) => body.innerText);
    const rechartsCount = await page.evaluate(() => document.querySelectorAll(".recharts-wrapper").length);
    const navPresupuestos = await page.evaluate(() => [...document.querySelectorAll("nav button")].some((button) => (button.textContent || "").trim() === "Presupuestos"));
    check("browser_accounting_report_markers_and_chart_removed",
      accountingBodyText.includes("Reconciliación con el libro")
        && accountingBodyText.includes("aviso(s) del PYG por vehículo")
        && accountingBodyText.includes("Configurar Rangos PUC")
        && !accountingBodyText.includes("Producción vs. costo por placa")
        && rechartsCount === 0,
      { recharts: rechartsCount });
    check("browser_accounting_source_hides_budget_tab", navPresupuestos === false, { presupuestos_tab: navPresupuestos });

    // Valores consolidados reales en el DOM (tabla con cabecera Cumplimiento).
    let tables = await readStatementTables(page);
    const corpIngresosServicio = statementRow(tables, 0, "INGRESOS SERVICIO ESPECIAL");
    const corpNeta = statementRow(tables, 0, "UTILIDAD NETA");
    const corpSinClasificarIngreso = statementRow(tables, 0, "INGRESOS SIN CLASIFICAR");
    const corpSinClasificarGasto = statementRow(tables, 0, "GASTOS SIN CLASIFICAR");
    const corpCreditos = statementRow(tables, 0, "CREDITOS");
    const corpDepreciacion = statementRow(tables, 0, "DEPRECIACION");
    const unassignedIngresos = statementRow(tables, 1, "INGRESOS SERVICIO ESPECIAL");
    check("browser_consolidated_dom_values",
      parseRegionalAmount(corpIngresosServicio?.actual, 3900000).ok
        && parseRegionalAmount(corpNeta?.actual, 2465000).ok
        && parseRegionalAmount(corpSinClasificarIngreso?.actual, 25000).ok
        && parseRegionalAmount(corpSinClasificarGasto?.actual, 40000).ok
        && parseRegionalAmount(corpIngresosServicio?.budget, 2000000).ok
        && String(corpSinClasificarIngreso?.rowText || "").includes("SIN MAPEAR")
        && String(corpCreditos?.rowText || "").includes("PENDIENTE")
        && String(corpDepreciacion?.rowText || "").includes("INFORMATIVA")
        && parseRegionalAmount(unassignedIngresos?.actual, 1000000).ok,
      { corp_ingresos: corpIngresosServicio, corp_neta: corpNeta, sin_clasificar_ingreso: corpSinClasificarIngreso, sin_clasificar_gasto: corpSinClasificarGasto, creditos: corpCreditos?.rowText, depreciacion: corpDepreciacion?.rowText, unassigned_ingresos: unassignedIngresos });

    // Drill concepto > cuenta > centro: solo nombres visibles, codigos en tooltip.
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

    // Vista por vehiculo con chip del bloque sin vehiculo.
    browserPhase = "pyg_vehicle_selector";
    await clickTab(page, "Consolidado");
    await page.waitForFunction(() => document.body.innerText.includes("PYG corporativo"), { timeout: 45000 });
    await page.screenshot({ path: shot("pyg-accounting-consolidated"), fullPage: false });
    screenshots.accounting_consolidated = relative(shot("pyg-accounting-consolidated"));
    await clickTab(page, "Por vehículo");
    // La vista por vehiculo lista las placas de la flota (botones/etiquetas),
    // no la matriz: basta esperar a que la placa objetivo aparezca.
    await page.waitForFunction((plate) => document.body.innerText.includes(plate), { timeout: 30000 }, V2_PLATE);
    await clickButton(page, "Sin vehículo / sin asignar");
    await page.waitForFunction(() => document.body.innerText.includes("Centros de costo sin placa asignada"), { timeout: 30000 });
    const unassignedTables = await readStatementTables(page);
    const unassignedStatementIngresos = statementRow(unassignedTables, 0, "INGRESOS SERVICIO ESPECIAL");
    check("browser_unassigned_chip_shows_block_statement",
      parseRegionalAmount(unassignedStatementIngresos?.actual, 1000000).ok,
      { row: unassignedStatementIngresos });
    await page.screenshot({ path: shot("pyg-unassigned-block"), fullPage: false });
    screenshots.unassigned_block = relative(shot("pyg-unassigned-block"));

    // Configuracion: primero se abre en la vista por vehiculo (unico lugar con
    // el selector de mes) para asegurar el periodo del reporte antes de seguir;
    // luego se edita y guarda.
    browserPhase = "pyg_config_proposal";
    await clickTab(page, "Por vehículo");
    await ensureVehicleReportPeriod(page, PERIOD);
    await clickTab(page, "Configuración");
    await page.waitForFunction(() => document.body.innerText.includes("Rangos PUC · Estructura contable del PYG por vehículo"), { timeout: 30000 });
    const configReference = await apiCall("GET", "/transport-pyg/account-configuration", tenantA.token);
    const configText1 = await page.$eval("body", (body) => body.innerText);
    check("browser_config_editor_accounting_badges",
      configText1.includes(configReference.body?.source === "accounting" ? "FUENTE: ESTRUCTURA CONTABLE" : "FUENTE: OPERATIVA HISTÓRICA")
        && configText1.includes("SUBTOTAL PROTEGIDO")
        && configText1.includes("Usar estructura del Excel")
        && configText1.includes("Orden")
        && configText1.includes("PENDIENTE DE ASOCIAR CUENTA"),
      { source: configReference.body?.source });
    await page.screenshot({ path: shot("pyg-config-editor"), fullPage: false });
    screenshots.config_editor = relative(shot("pyg-config-editor"));

    await clickButton(page, "Usar estructura del Excel");
    await page.waitForFunction(() => document.body.innerText.includes("Propuesta del Excel cargada en el borrador"), { timeout: 15000 });
    check("browser_config_excel_proposal_confirm_dialog", dialogs.some((dialog) => dialog.message.includes("estructura del Excel")), { dialogs: dialogs.map((dialog) => dialog.message) });

    await setConceptField(page, "INGRESOS", "Nombre", "INGRESOS DEL SERVICIO");
    await setConceptField(page, "INGRESOS", "Orden", "2");
    const proposalSaveResponse = page.waitForResponse((response) => response.url().includes("/api/v1/transport-pyg/account-configuration") && response.request().method() === "PUT", { timeout: 30000 });
    const reportAfterSaveResponse = page.waitForResponse((response) => response.url().includes("/api/v1/transport-pyg/report") && response.request().method() === "GET", { timeout: 60000 });
    await clickButton(page, "Guardar cambios");
    const proposalSave = await proposalSaveResponse;
    await reportAfterSaveResponse;
    await page.waitForFunction(() => document.body.innerText.includes("Estructura contable guardada"), { timeout: 15000 });
    check("browser_config_proposal_save_put_200", proposalSave.status() === 200, { status: proposalSave.status() });
    await page.screenshot({ path: shot("pyg-config-saved"), fullPage: false });
    screenshots.config_saved = relative(shot("pyg-config-saved"));

    // Persistencia tras recarga: el reporte usa el nombre editado y el editor
    // conserva nombre/orden guardados.
    browserPhase = "pyg_config_persistence";
    await page.reload({ waitUntil: "networkidle2" });
    await page.waitForFunction(() => document.body.innerText.includes("Matriz interactiva"), { timeout: 45000 });
    await clickButton(page, "Por vehículo");
    await page.waitForFunction(() => document.body.innerText.includes("PYG corporativo"), { timeout: 60000 });
    await ensureVehicleReportPeriod(page, PERIOD);
    await page.waitForFunction(() => document.body.innerText.includes("INGRESOS DEL SERVICIO"), { timeout: 45000 });
    tables = await readStatementTables(page);
    const renamedIngresos = statementRow(tables, 0, "INGRESOS DEL SERVICIO");
    check("browser_report_reflects_saved_name", parseRegionalAmount(renamedIngresos?.actual, 3900000).ok, { row: renamedIngresos });
    await clickTab(page, "Configuración");
    await page.waitForFunction(() => document.body.innerText.includes("Rangos PUC · Estructura contable del PYG por vehículo"), { timeout: 30000 });
    check("browser_config_persisted_name_and_order",
      await conceptFieldValue(page, "INGRESOS", "Nombre") === "INGRESOS DEL SERVICIO"
        && await conceptFieldValue(page, "INGRESOS", "Orden") === "2",
      { name: await conceptFieldValue(page, "INGRESOS", "Nombre"), order: await conceptFieldValue(page, "INGRESOS", "Orden") });

    // Concepto nuevo con rango + exclusion desde la UI, guardado y verificado
    // en el reporte recargado.
    browserPhase = "pyg_config_new_concept";
    await clickButton(page, "Crear concepto");
    await page.waitForFunction(() => [...document.querySelectorAll("article")].some((node) => [...node.querySelectorAll("input")].some((input) => String(input.value || "").startsWith("NUEVO_CONCEPTO_"))), { timeout: 15000 });
    const newConceptCode = await page.evaluate(() => {
      const articles = [...document.querySelectorAll("article")];
      const article = articles.find((node) => [...node.querySelectorAll("input")].some((input) => String(input.value || "").startsWith("NUEVO_CONCEPTO_")));
      if (!article) return null;
      const codeInput = [...article.querySelectorAll("label")].find((node) => (node.firstChild?.textContent || "").trim() === "Código")?.querySelector("input");
      return codeInput ? codeInput.value : null;
    });
    check("browser_config_new_concept_created", Boolean(newConceptCode), { code: newConceptCode });
    await setConceptField(page, newConceptCode, "Código", "GASTO_WEB_QA");
    await setConceptField(page, "GASTO_WEB_QA", "Nombre", "Gasto web QA");
    await setConceptField(page, "GASTO_WEB_QA", "Orden", "27");
    await clickInConcept(page, "GASTO_WEB_QA", "Añadir rango");
    await setRangeField(page, "GASTO_WEB_QA", "Inicio del rango 1", "52953502");
    await setRangeField(page, "GASTO_WEB_QA", "Fin del rango 1", "52953503");
    await clickInConcept(page, "GASTO_WEB_QA", "Añadir exclusión");
    await setRangeField(page, "GASTO_WEB_QA", "Inicio de la exclusión 1", "52953503");
    await setRangeField(page, "GASTO_WEB_QA", "Fin de la exclusión 1", "52953503");
    const newConceptSaveResponse = page.waitForResponse((response) => response.url().includes("/api/v1/transport-pyg/account-configuration") && response.request().method() === "PUT", { timeout: 30000 });
    const reportAfterConceptResponse = page.waitForResponse((response) => response.url().includes("/api/v1/transport-pyg/report") && response.request().method() === "GET", { timeout: 60000 });
    await clickButton(page, "Guardar cambios");
    const newConceptSave = await newConceptSaveResponse;
    await reportAfterConceptResponse;
    await page.waitForFunction(() => document.body.innerText.includes("Estructura contable guardada"), { timeout: 15000 });
    check("browser_config_new_concept_save_put_200", newConceptSave.status() === 200, { status: newConceptSave.status() });
    await page.screenshot({ path: shot("pyg-config-created-concept"), fullPage: false });
    screenshots.config_created_concept = relative(shot("pyg-config-created-concept"));

    const configGetAfterBrowser = await apiCall("GET", "/transport-pyg/account-configuration", tenantA.token);
    const savedNewConcept = (configGetAfterBrowser.body?.config?.concepts || []).find((concept) => concept.code === "GASTO_WEB_QA");
    check("browser_config_new_concept_persisted_with_range_and_exclusion",
      savedNewConcept?.name === "Gasto web QA"
        && savedNewConcept?.order === 27
        && savedNewConcept?.ranges?.[0]?.start === "52953502"
        && savedNewConcept?.ranges?.[0]?.end === "52953503"
        && savedNewConcept?.exclusions?.[0]?.start === "52953503"
        && savedNewConcept?.exclusions?.[0]?.end === "52953503",
      { concept: savedNewConcept });

    await page.reload({ waitUntil: "networkidle2" });
    await page.waitForFunction(() => document.body.innerText.includes("Matriz interactiva"), { timeout: 45000 });
    await clickButton(page, "Por vehículo");
    await page.waitForFunction(() => document.body.innerText.includes("PYG corporativo"), { timeout: 60000 });
    await ensureVehicleReportPeriod(page, PERIOD);
    await page.waitForFunction(() => document.body.innerText.includes("Gasto web QA"), { timeout: 45000 });
    tables = await readStatementTables(page);
    const newConceptRow = statementRow(tables, 0, "Gasto web QA");
    check("browser_new_concept_visible_in_report_zero",
      parseRegionalAmount(newConceptRow?.actual, 0).ok && !String(newConceptRow?.rowText || "").includes("PENDIENTE"),
      { row: newConceptRow });

    // Rol de solo lectura: editor sin acciones de escritura.
    browserPhase = "pyg_read_only";
    await setRolePermissions(tenantA.tenantId, tenantA.email, "CERT_PYG_READER", READER_PERMISSIONS());
    await page.evaluate(() => localStorage.clear());
    await login(page, tenantA.email, tenantA.password);
    await page.goto(`${webUrl}/dashboard/contabilidad/pyg`, { waitUntil: "networkidle2" });
    await page.waitForFunction(() => document.body.innerText.includes("Matriz interactiva"), { timeout: 45000 });
    await clickButton(page, "Por vehículo");
    await page.waitForFunction(() => document.body.innerText.includes("PYG corporativo"), { timeout: 60000 });
    await clickTab(page, "Configuración");
    await page.waitForFunction(() => document.body.innerText.includes("Rangos PUC · Estructura contable del PYG por vehículo"), { timeout: 30000 });
    const readOnlyText = await page.$eval("body", (body) => body.innerText);
    check("browser_readonly_config_no_write_actions",
      readOnlyText.includes("Consulta de solo lectura")
        && !readOnlyText.includes("Usar estructura del Excel")
        && !readOnlyText.includes("Crear concepto")
        && readOnlyText.includes("FUENTE: ESTRUCTURA CONTABLE"),
      {});
    await page.screenshot({ path: shot("pyg-config-readonly"), fullPage: false });
    screenshots.config_readonly = relative(shot("pyg-config-readonly"));

    // Regreso a la fuente operativa desde la UI. La UI conserva los conceptos
    // guardados al volver a operativo (fuente "operational" + conceptos) y
    // rechaza el volcado si el borrador tiene cambios sin guardar, por eso se
    // guarda antes. Primero se confirma el estado operativo real (pestaña
    // Presupuestos visible y boton legado en el consolidado) y al final la
    // configuracion, para no leer el editor antes de que cargue el reporte.
    browserPhase = "pyg_restore_operational";
    await setRolePermissions(tenantA.tenantId, tenantA.email, "CERT_PYG_ROLE", FULL_PERMISSIONS());
    await page.evaluate(() => localStorage.clear());
    await login(page, tenantA.email, tenantA.password);
    await page.goto(`${webUrl}/dashboard/contabilidad/pyg`, { waitUntil: "networkidle2" });
    await page.waitForFunction(() => document.body.innerText.includes("Matriz interactiva"), { timeout: 45000 });
    await clickButton(page, "Por vehículo");
    await page.waitForFunction(() => document.body.innerText.includes("PYG corporativo"), { timeout: 60000 });
    await clickTab(page, "Configuración");
    await page.waitForFunction(() => document.body.innerText.includes("Rangos PUC · Estructura contable del PYG por vehículo"), { timeout: 30000 });
    // "Guardar configuración" pertenece a la vista de impuesto/tarifa y no toca
    // los rangos; se pulsa antes y se espera su aviso para que "Guardar"/"Guardar
    // cambios" del editor sea el unico boton con ese texto.
    const tariffNotice = page.waitForFunction(() => document.body.innerText.includes("Configuración guardada."), { timeout: 30000 });
    await clickButton(page, "Guardar configuración");
    await tariffNotice;
    const saveBeforeRestoreResponse = page.waitForResponse((response) => response.url().includes("/api/v1/transport-pyg/account-configuration") && response.request().method() === "PUT", { timeout: 30000 });
    await clickButton(page, "Guardar");
    const saveBeforeRestore = await saveBeforeRestoreResponse;
    await page.waitForFunction(() => document.body.innerText.includes("Estructura contable guardada"), { timeout: 15000 });
    check("browser_save_draft_before_operational_restore", saveBeforeRestore.status() === 200, { status: saveBeforeRestore.status() });
    await page.waitForFunction(() => {
      const buttons = [...document.querySelectorAll("button")];
      const save = buttons.find((button) => (button.textContent || "").trim() === "Guardar");
      return Boolean(save && !save.disabled && !document.body.innerText.includes("error(es)"));
    }, { timeout: 30000 });
    const restoreResponse = page.waitForResponse((response) => response.url().includes("/api/v1/transport-pyg/account-configuration") && response.request().method() === "PUT", { timeout: 30000 });
    const reportAfterRestoreResponse = page.waitForResponse((response) => response.url().includes("/api/v1/transport-pyg/report") && response.request().method() === "GET", { timeout: 60000 });
    await clickButton(page, "Volver a fuente operativa");
    const restore = await restoreResponse;
    const restoreBody = await restore.json().catch(() => ({}));
    await reportAfterRestoreResponse;
    await page.waitForFunction(() => document.body.innerText.includes("Fuente operativa histórica restaurada; los rangos PUC guardados se conservan para cuando vuelvas a usar la estructura contable."), { timeout: 15000 });
    check("browser_restore_operational_put_200",
      restore.status() === 200 && restoreBody?.source === "operational"
        && dialogs.some((dialog) => dialog.message.includes("fuente operativa histórica")),
      { status: restore.status(), source: restoreBody?.source, dialogs: dialogs.map((dialog) => dialog.message) });
    await page.reload({ waitUntil: "networkidle2" });
    await page.waitForFunction(() => document.body.innerText.includes("Matriz interactiva"), { timeout: 45000 });
    await clickButton(page, "Por vehículo");
    await page.waitForFunction(() => document.body.innerText.includes("PYG corporativo"), { timeout: 60000 });
    await ensureVehicleReportPeriod(page, PERIOD);
    const navPresupuestosBack = await page.evaluate(() => [...document.querySelectorAll("nav button")].some((button) => (button.textContent || "").trim() === "Presupuestos"));
    const operationalConsolidatedText = await page.$eval("body", (body) => body.innerText);
    check("browser_operational_consolidated_config_button",
      navPresupuestosBack === true
        && operationalConsolidatedText.includes("Ajustar tarifa de impuesto y mapeo de conceptos"),
      { presupuestos_tab: navPresupuestosBack });
    await clickTab(page, "Configuración");
    await page.waitForFunction(() => document.body.innerText.includes("FUENTE: OPERATIVA HISTÓRICA"), { timeout: 30000 });
    const operationalText = await page.$eval("body", (body) => body.innerText);
    check("browser_operational_source_legacy_intact",
      operationalText.includes("FUENTE: OPERATIVA HISTÓRICA")
        && operationalText.includes("Mapeo de conceptos de caja menor"),
      { legacy_mapping: operationalText.includes("Mapeo de conceptos de caja menor") });
    await page.screenshot({ path: shot("pyg-operational-restored"), fullPage: false });
    screenshots.operational_restored = relative(shot("pyg-operational-restored"));

    const configAfterRestore = await apiCall("GET", "/transport-pyg/account-configuration", tenantA.token);
    const reportAfterRestore = await apiCall("GET", `/transport-pyg/report?period=${PERIOD}`, tenantA.token);
    const restoredConcept = (configAfterRestore.body?.config?.concepts || []).find((concept) => concept.code === "GASTO_WEB_QA");
    check("api_operational_restored_verified",
      configAfterRestore.body?.has_config === false
        && configAfterRestore.body?.source === "operational"
        && restoredConcept?.ranges?.[0]?.start === "52953502"
        && reportAfterRestore.body?.source === "operational"
        && ["operational", "none"].includes(reportAfterRestore.body?.report_source),
      { has_config: configAfterRestore.body?.has_config, source: configAfterRestore.body?.source, restored_concept: restoredConcept || null, report_source: reportAfterRestore.body?.report_source });

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
    accounts: Object.fromEntries(Object.entries(accounts).map(([key, row]) => [key, row?.code])),
    cash: cash.code,
    vehicles: { v1: V1_PLATE, v2: V2_PLATE },
    documents: docs.length,
    screenshots,
    browser_diagnostics: browserDiagnostics
  };
}

function writeEvidence(status, payload, sources) {
  const evidence = {
    version: 2,
    certification: "transport-pyg-account-ranges-browser-local",
    status: checks.some((item) => !item.ok) ? "failed" : status,
    browser_coverage_completed: checks.some((item) => item.name === "browser_web_server_available" && item.ok)
      && checks.some((item) => item.name === "screenshots_captured" && item.ok),
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
    // Un fallo iniciado en la fase de navegador es FAILED. Un fallo anterior al
    // navegador (p. ej. fixture o API) es PENDING: la cobertura de navegador
    // aun no se ejecuto. Nunca se reporta PASSED.
    const failureCheckpoint = error?.failureCheckpoint || null;
    const browserStarted = Boolean(failureCheckpoint && failureCheckpoint !== "web_availability");
    writeEvidence(browserStarted ? "failed" : "pending", {
      error: String(error?.stack || error),
      failure_checkpoint: error?.failureCheckpoint || null,
      screenshots,
      browser_diagnostics: diagnostics
    }, sources);
  });
