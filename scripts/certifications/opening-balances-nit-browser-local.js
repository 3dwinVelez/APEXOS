/* Local-only certification for opening-balances NIT resolution and UI date handling.
 * Real Chromium, real local API, real local Prisma data. No request interception,
 * no mocked APIs and no React state mutation.
 * Prerequisites: migrated loopback PostgreSQL, patched API on 3215, patched web on 3004,
 * Chrome installed, and NODE_PATH-capable Node. Run from the repository root.
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

const ExcelJS = require("exceljs");
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
const output = path.resolve(root, process.env.BROWSER_EVIDENCE_PATH || "docs/qa/evidence/opening-balances-error-20261020/browser-local.json");
const evidenceDir = path.dirname(output);
const browserPath = process.env.CHROME_BIN || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const suffix = crypto.randomBytes(5).toString("hex");
const checks = [];
const db = new PrismaClient();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const SOCIETY = "SOC-01";
const BRANCH = "001";
const COST_CENTER = "001-1";
const DEBIT_ACCOUNT = "130505HEART";
const CREDIT_ACCOUNT = "220505HEART";
const EXACT_NIT = "900255181";
const LONG_NIT = "900255181123456789";
const MISSING_NIT = "900255199";
const INACTIVE_NIT = "900255182";
const FOREIGN_NIT = "900255183";
const EXPECTED_DATE = "2025-12-31";
const SECOND_DATE = "2025-12-30";
const EDGE_DATE = "2025-12-29";
const REQUIRED_HEADERS = ["fecha_corte", "cuenta", "centro_costo", "sucursal", "saldo", "tercero"];
const SOURCE_FILES = {
  api_service: "apps/api/src/modules/accounting/service.js",
  web_page: "apps/web/app/dashboard/contabilidad/importar-saldos-iniciales/page.tsx",
  api_unit: "apps/api/test/accounting-opening-balances.test.js",
  web_unit: "apps/web/test/contabilidad-opening-balances.test.mjs",
  script: "scripts/certifications/opening-balances-nit-browser-local.js"
};
const successShot = path.join(evidenceDir, "opening-balances-nit-success.png");
const errorShot = path.join(evidenceDir, "opening-balances-nit-error.png");
const failureShot = path.join(evidenceDir, "opening-balances-nit-failure.png");
const screenshots = {};
const fixturesDir = path.join(evidenceDir, `fixtures-${suffix}`);
fs.mkdirSync(evidenceDir, { recursive: true });
fs.mkdirSync(fixturesDir, { recursive: true });

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

function normalize(value) {
  return String(value ?? "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "_");
}
function selectSheet(workbook) {
  const sheet = workbook.worksheets.find((candidate) => normalize(candidate.name) === "saldos_iniciales") || workbook.worksheets[0];
  if (!sheet) throw new Error("La plantilla no contiene hojas.");
  return sheet;
}
function columnsFor(sheet) {
  const columns = new Map();
  sheet.getRow(4).values.slice(1).forEach((value, index) => {
    const header = normalize(value);
    if (header) columns.set(header, index + 1);
  });
  const missing = REQUIRED_HEADERS.filter((header) => !columns.has(header));
  if (missing.length) throw new Error(`Faltan encabezados en la fila 4: ${missing.join(", ")}`);
  return columns;
}
function makeRows(date, debit, credit, tercero) {
  const base = { fecha_corte: date, centro_costo: COST_CENTER, sucursal: BRANCH, tercero };
  return [
    { ...base, cuenta: DEBIT_ACCOUNT, saldo: debit },
    { ...base, cuenta: CREDIT_ACCOUNT, saldo: credit }
  ];
}
async function buildFixture(templateBuffer, rows, filename, date) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(templateBuffer);
  const sheet = selectSheet(workbook);
  const columns = columnsFor(sheet);
  rows.forEach((values, index) => {
    for (const [header, value] of Object.entries(values)) {
      const cell = sheet.getCell(5 + index, columns.get(header));
      cell.value = value;
      if (header === "fecha_corte") cell.numFmt = "yyyy-mm-dd";
    }
  });
  const buffer = await workbook.xlsx.writeBuffer();
  const file = path.join(fixturesDir, filename);
  fs.writeFileSync(file, buffer);
  return { buffer, file, filename, date, rows, sha256: sha256(buffer) };
}
async function verifyFixture(fixture) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(fixture.buffer);
  const sheet = selectSheet(workbook);
  const columns = columnsFor(sheet);
  const headers = sheet.getRow(4).values.slice(1).map((value) => String(value ?? "").trim());
  assert.deepEqual(headers.slice(0, REQUIRED_HEADERS.length), REQUIRED_HEADERS);
  fixture.rows.forEach((expected, index) => {
    for (const [header, wanted] of Object.entries(expected)) {
      const actual = sheet.getCell(5 + index, columns.get(header)).value;
      if (header === "fecha_corte") {
        const actualDate = actual instanceof Date ? actual : new Date(actual);
        assert.ok(!Number.isNaN(actualDate.getTime()) && actualDate.toISOString().slice(0, 10) === fixture.date);
      } else if (header === "tercero" && wanted === null) {
        assert.ok(actual === null || String(actual).trim() === "");
      } else if (["cuenta", "centro_costo", "sucursal", "tercero"].includes(header)) {
        assert.equal(typeof actual, "string");
        assert.equal(actual, wanted);
      } else {
        assert.equal(actual, wanted);
      }
    }
  });
  return true;
}

async function seedFixture() {
  const email = `browser-openings-${suffix}@apexos.local`;
  const password = `Browser-${suffix}9!`;
  const response = await fetch(`${apiUrl}/api/v1/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(60000),
    body: JSON.stringify({ company_name: `Browser Opening ${suffix}`, industry: "qa", email, password, name: "Browser Opening Admin", country: "CO", timezone: "America/Bogota", currency: "COP", plan: "crown" })
  });
  const registration = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`register_failed status=${response.status} code=${registration.code || ""}`.trim());
  const token = registration.token;
  const tenantId = registration.tenant?.id || registration.user?.tenant_id;
  if (!token || !tenantId) throw new Error("register_missing_token_or_tenant");
  const tenant = await db.tenant.findUnique({ where: { id: String(tenantId) } });
  if (!tenant) throw new Error("register_returned_unknown_tenant");
  check("fixture_tenant_registered_via_local_api", true, { tenant_id: tenant.id });

  const accountCount = await db.account.count({ where: { tenant_id: tenant.id } });
  check("fixture_standard_chart_initialized", accountCount >= 2502, { accounts: accountCount });

  const orgStatuses = [];
  for (const unit of [
    { type: "society", code: SOCIETY, name: "Sociedad QA" },
    { type: "branch", code: BRANCH, name: "Sucursal QA", society_code: SOCIETY },
    { type: "cost_center", code: COST_CENTER, name: "Centro QA", society_code: SOCIETY, branch_code: BRANCH }
  ]) {
    const orgResponse = await fetch(`${apiUrl}/api/v1/accounting/organization-tree`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(30000),
      body: JSON.stringify(unit)
    });
    const body = await orgResponse.json().catch(() => ({}));
    if (![200, 201].includes(orgResponse.status)) throw new Error(`org_tree_${unit.type}_failed status=${orgResponse.status} code=${body.code || ""}`.trim());
    orgStatuses.push(orgResponse.status);
  }
  check("fixture_org_tree_configured_via_local_api", orgStatuses.every((status) => [200, 201].includes(status)), { society: SOCIETY, branch: BRANCH, cost_center: COST_CENTER });

  const parentDebit = await db.account.findFirst({ where: { tenant_id: tenant.id, code: "130505" } })
    || await db.account.findFirst({ where: { tenant_id: tenant.id, code: "1305" } });
  const parentCredit = await db.account.findFirst({ where: { tenant_id: tenant.id, code: "220505" } })
    || await db.account.findFirst({ where: { tenant_id: tenant.id, code: "2205" } });
  async function upsertAccount(code, name, type, parent) {
    const data = { name, type, parent_id: parent?.id || null, level: parent ? (parent.level || 1) + 1 : 5, active: true, allows_tx: true };
    return db.account.upsert({ where: { tenant_id_code: { tenant_id: tenant.id, code } }, update: data, create: { tenant_id: tenant.id, code, ...data } });
  }
  const debitAccount = await upsertAccount(DEBIT_ACCOUNT, "Caja HEART QA", "asset", parentDebit);
  const creditAccount = await upsertAccount(CREDIT_ACCOUNT, "Proveedores HEART QA", "liability", parentCredit);
  check("fixture_accounts_active_transactional", debitAccount.active && debitAccount.allows_tx && Boolean(debitAccount.parent_id) && creditAccount.active && creditAccount.allows_tx && Boolean(creditAccount.parent_id), { debit: DEBIT_ACCOUNT, credit: CREDIT_ACCOUNT, parent_debit: parentDebit?.code || null, parent_credit: parentCredit?.code || null });

  const exact = await db.party.create({ data: { tenant_id: tenant.id, type: "customer", name: "Cliente NIT exacto QA", tax_id: EXACT_NIT, active: true } });
  const longNit = await db.party.create({ data: { tenant_id: tenant.id, type: "supplier", name: "Proveedor NIT largo QA", tax_id: LONG_NIT, active: true } });
  const inactive = await db.party.create({ data: { tenant_id: tenant.id, type: "supplier", name: "Proveedor NIT inactivo QA", tax_id: INACTIVE_NIT, active: false } });
  const legacy = await db.party.create({ data: { tenant_id: tenant.id, type: "customer", name: "Cliente legado QA", tax_id: null, active: true } });
  const collisionTarget = await db.party.create({ data: { tenant_id: tenant.id, type: "customer", name: "Cliente colision id QA", tax_id: null, active: true } });
  const collisionNit = await db.party.create({ data: { tenant_id: tenant.id, type: "customer", name: "Cliente colision NIT QA", tax_id: String(collisionTarget.id), active: true } });
  const foreignTenant = await db.tenant.create({ data: { name: `Foreign Opening QA ${suffix}`, industry: "qa", country: "CO", timezone: "America/Bogota", currency: "COP" } });
  const foreign = await db.party.create({ data: { tenant_id: foreignTenant.id, type: "supplier", name: "Tercero ajeno QA", tax_id: FOREIGN_NIT, active: true } });
  check("fixture_parties_and_tenant_isolation_ready", exact.active && exact.tax_id === EXACT_NIT && longNit.tax_id === LONG_NIT && inactive.active === false && legacy.tax_id === null && collisionNit.tax_id === String(collisionTarget.id) && foreign.tenant_id === foreignTenant.id && foreign.tenant_id !== tenant.id, {
    exact_party_id: exact.id,
    long_party_id: longNit.id,
    inactive_party_id: inactive.id,
    legacy_party_id: legacy.id,
    collision_target_id: collisionTarget.id,
    collision_nit_party_id: collisionNit.id,
    foreign_tenant_id: foreignTenant.id,
    foreign_party_id: foreign.id
  });

  return {
    tenantId: tenant.id,
    token,
    email,
    password,
    exactPartyId: exact.id,
    longPartyId: longNit.id,
    inactivePartyId: inactive.id,
    legacyPartyId: legacy.id,
    collisionTargetId: collisionTarget.id,
    collisionNitId: collisionNit.id,
    foreignTenantId: foreignTenant.id,
    foreignPartyId: foreign.id
  };
}

async function counts(tenantId) {
  const [docs, ledger] = await Promise.all([
    db.cntCabdoc.count({ where: { tenant_id: tenantId } }),
    db.ledgerEntry.count({ where: { tenant_id: tenantId } })
  ]);
  return { docs, ledger };
}
async function apiValidate(file, token) {
  const form = new FormData();
  form.append("file", new Blob([file.buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), file.filename);
  const response = await fetch(`${apiUrl}/api/v1/accounting/opening-balances/validate`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(60000),
    body: form
  });
  return { status: response.status, body: await response.json().catch(() => ({})) };
}
async function certifyApiEdges(fixture, files) {
  const before = await counts(fixture.tenantId);
  check("api_edge_cases_start_without_ledger", before.docs === 0 && before.ledger === 0, before);
  const expectError = async (key, name) => {
    const result = await apiValidate(files[key], fixture.token);
    check(name, result.status >= 400 && result.status < 500 && result.body.code === "OPENING_BALANCE_PARTY_NOT_FOUND", { status: result.status, code: result.body.code });
  };
  await expectError("missing", "api_missing_party_controlled_4xx");
  await expectError("inactive", "api_inactive_party_controlled_4xx");
  await expectError("foreign", "api_foreign_tenant_party_controlled_4xx");
  await expectError("unknownLong", "api_unknown_long_nit_controlled_not_500");

  const collision = await apiValidate(files.collision, fixture.token);
  check("api_numeric_nit_collision_prefers_exact_tax_id", collision.status === 200 && collision.body.valid === true && (collision.body.lines || []).length === 2 && collision.body.lines.every((line) => line.party_id === fixture.collisionNitId && line.party_tax_id === String(fixture.collisionTargetId)), { status: collision.status, party_ids: (collision.body.lines || []).map((line) => line.party_id) });

  const legacy = await apiValidate(files.legacy, fixture.token);
  check("api_legacy_numeric_id_fallback", legacy.status === 200 && legacy.body.valid === true && (legacy.body.lines || []).length === 2 && legacy.body.lines.every((line) => line.party_id === fixture.legacyPartyId && line.party_tax_id === null), { status: legacy.status, party_ids: (legacy.body.lines || []).map((line) => line.party_id) });

  const long = await apiValidate(files.longNit, fixture.token);
  check("api_long_nit_exact_match", long.status === 200 && long.body.valid === true && (long.body.lines || []).length === 2 && long.body.lines.every((line) => line.party_id === fixture.longPartyId && line.party_tax_id === LONG_NIT), { status: long.status, party_ids: (long.body.lines || []).map((line) => line.party_id) });

  const after = await counts(fixture.tenantId);
  check("api_edge_cases_write_no_ledger", after.docs === before.docs && after.ledger === before.ledger, { before, after });
}

async function login(page, email, password) {
  const pending = page.waitForResponse((response) => new URL(response.url()).pathname.endsWith("/api/v1/auth/login") && response.request().method() === "POST", { timeout: 45000 });
  await page.goto(`${webUrl}/login`, { waitUntil: "networkidle2" });
  await page.waitForSelector('input[name="email"]', { visible: true, timeout: 45000 });
  await page.waitForSelector('input[name="password"]', { visible: true, timeout: 45000 });
  await page.waitForFunction(() => {
    const form = document.querySelector("form");
    return Boolean(form && Object.keys(form).some((key) => key.startsWith("__reactProps$") && typeof form[key]?.onSubmit === "function"));
  }, { timeout: 45000 });
  for (const selector of ['input[name="email"]', 'input[name="password"]']) {
    await page.click(selector, { clickCount: 3 });
    await page.keyboard.down("Control"); await page.keyboard.press("A"); await page.keyboard.up("Control"); await page.keyboard.press("Backspace");
  }
  await page.type('input[name="email"]', email);
  await page.type('input[name="password"]', password);
  await page.click('form button[type="submit"]');
  let response = null;
  try {
    response = await pending;
    await page.waitForFunction(() => !location.pathname.endsWith("/login"), { timeout: 45000 });
  } catch {
    throw new Error(`login_failed status=${response?.status() || "no_response"}`);
  }
  check("browser_login_real", response.status() === 200, { status: response.status() });
}
async function openOpeningPage(page) {
  await page.goto(`${webUrl}/dashboard/contabilidad/importar-saldos-iniciales`, { waitUntil: "networkidle2" });
  await page.waitForFunction(() => {
    const text = document.body.innerText;
    return text.includes("Importar saldos iniciales") && !text.includes("Validando permisos");
  }, { timeout: 45000 });
  check("opening_page_real_ui", true, { path: await page.evaluate(() => location.pathname) });
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
async function uploadFile(page, file) {
  await page.waitForFunction(() => {
    const input = document.querySelector('input[type="file"]');
    return Boolean(input && !input.disabled);
  }, { timeout: 20000 });
  const [chooser] = await Promise.all([page.waitForFileChooser({ timeout: 20000 }), page.click('input[type="file"]')]);
  await chooser.accept([file]);
  await page.waitForFunction(() => document.querySelector('input[type="file"]')?.files?.length === 1, { timeout: 20000 });
}
async function validateUi(page, file) {
  await uploadFile(page, file);
  const pending = page.waitForResponse((response) => new URL(response.url()).pathname.endsWith("/api/v1/accounting/opening-balances/validate") && response.request().method() === "POST", { timeout: 60000 });
  await clickButton(page, "Validar plantilla");
  const response = await pending;
  await page.waitForFunction(() => document.body.innerText.includes("Validación correcta") || Boolean(document.querySelector('[role="alert"]')), { timeout: 45000 });
  return response;
}
async function confirmUi(page) {
  const pending = page.waitForResponse((response) => new URL(response.url()).pathname.endsWith("/api/v1/accounting/opening-balances") && response.request().method() === "POST", { timeout: 60000 });
  const dialogPromise = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("confirm_dialog_not_shown")), 20000);
    page.once("dialog", async (dialog) => {
      clearTimeout(timer);
      const detail = { type: dialog.type(), message: dialog.message() };
      await dialog.accept();
      resolve(detail);
    });
  });
  await clickButton(page, "Confirmar contabilización");
  const [response, dialog] = await Promise.all([pending, dialogPromise]);
  return { response, dialog };
}
async function readPreviewRows(page) {
  await page.waitForFunction(() => document.querySelectorAll("tbody tr").length === 2, { timeout: 20000 });
  return page.$$eval("tbody tr", (rows) => rows.map((row) => [...row.querySelectorAll("td")].map((cell) => cell.textContent.trim())));
}
function checkPreviewRows(rows, tercero, amountText) {
  const ok = rows.length === 2
    && rows[0][1] === DEBIT_ACCOUNT && rows[1][1] === CREDIT_ACCOUNT
    && rows.every((row) => row[2] === BRANCH && row[3] === COST_CENTER && row[4] === tercero)
    && rows[0][5] === "Débito" && rows[1][5] === "Crédito"
    && rows.every((row) => row[6].includes(amountText));
  check("preview_rows_real_ui", ok, { tercero, rows });
}
function localResponse(response) { return LOOPBACK.has(new URL(response.url()).hostname); }

async function downloadTemplate(page) {
  const downloadDir = path.join(evidenceDir, `template-${suffix}`);
  fs.mkdirSync(downloadDir, { recursive: true });
  const cdp = await page.target().createCDPSession();
  await cdp.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: downloadDir });
  const pending = page.waitForResponse((response) => new URL(response.url()).pathname.endsWith("/api/v1/accounting/opening-balances/template") && response.request().method() === "GET", { timeout: 45000 });
  await clickButton(page, "Descargar Excel");
  const response = await pending;
  check("template_download_local_api", response.status() === 200 && localResponse(response), { status: response.status(), host: new URL(response.url()).hostname });
  let name = null;
  for (let attempt = 0; attempt < 100 && !name; attempt += 1) {
    name = fs.readdirSync(downloadDir).find((entry) => entry.endsWith(".xlsx") && !entry.endsWith(".crdownload")) || null;
    if (!name) await sleep(200);
  }
  check("template_downloaded_through_browser", Boolean(name), { directory: relative(downloadDir) });
  const file = path.join(downloadDir, name);
  const buffer = fs.readFileSync(file);
  check("template_downloaded_nonempty", buffer.length > 0, { bytes: buffer.length, sha256: sha256(buffer) });
  await cdp.detach().catch(() => undefined);
  return { file, buffer, sha256: sha256(buffer) };
}
async function inspectTemplate(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = selectSheet(workbook);
  const headers = sheet.getRow(4).values.slice(1).map((value) => String(value ?? "").trim()).filter(Boolean);
  check("template_row4_headers", JSON.stringify(headers.slice(0, REQUIRED_HEADERS.length)) === JSON.stringify(REQUIRED_HEADERS), { headers });
  const textColumns = [2, 3, 4, 6].map((column) => ({
    column,
    format: sheet.getColumn(column).numFmt,
    cells: [5, 6].map((row) => sheet.getCell(row, column).numFmt)
  }));
  check("template_text_columns_b_c_d_f", textColumns.every((entry) => entry.format === "@" || entry.cells.every((format) => format === "@")), { textColumns });
  return { sheetName: sheet.name, headers: headers.slice(0, REQUIRED_HEADERS.length) };
}
async function buildFixtures(templateBuffer, fixture) {
  const specs = {
    blankPreview: { filename: `blank-preview-${suffix}.xlsx`, date: EXPECTED_DATE, rows: makeRows(new Date(`${EXPECTED_DATE}T00:00:00.000Z`), 1000, -1000, null) },
    numericNit: { filename: `numeric-nit-${suffix}.xlsx`, date: EXPECTED_DATE, rows: makeRows(new Date(`${EXPECTED_DATE}T00:00:00.000Z`), 1000, -1000, EXACT_NIT) },
    blankImport: { filename: `blank-import-${suffix}.xlsx`, date: SECOND_DATE, rows: makeRows(new Date(`${SECOND_DATE}T00:00:00.000Z`), 2500, -2500, null) },
    missing: { filename: `missing-${suffix}.xlsx`, date: EDGE_DATE, rows: makeRows(new Date(`${EDGE_DATE}T00:00:00.000Z`), 500, -500, MISSING_NIT) },
    inactive: { filename: `inactive-${suffix}.xlsx`, date: EDGE_DATE, rows: makeRows(new Date(`${EDGE_DATE}T00:00:00.000Z`), 500, -500, INACTIVE_NIT) },
    foreign: { filename: `foreign-${suffix}.xlsx`, date: EDGE_DATE, rows: makeRows(new Date(`${EDGE_DATE}T00:00:00.000Z`), 500, -500, FOREIGN_NIT) },
    collision: { filename: `collision-${suffix}.xlsx`, date: EDGE_DATE, rows: makeRows(new Date(`${EDGE_DATE}T00:00:00.000Z`), 500, -500, String(fixture.collisionTargetId)) },
    legacy: { filename: `legacy-${suffix}.xlsx`, date: EDGE_DATE, rows: makeRows(new Date(`${EDGE_DATE}T00:00:00.000Z`), 500, -500, String(fixture.legacyPartyId)) },
    longNit: { filename: `long-nit-${suffix}.xlsx`, date: EDGE_DATE, rows: makeRows(new Date(`${EDGE_DATE}T00:00:00.000Z`), 500, -500, LONG_NIT) },
    unknownLong: { filename: `unknown-long-${suffix}.xlsx`, date: EDGE_DATE, rows: makeRows(new Date(`${EDGE_DATE}T00:00:00.000Z`), 500, -500, "999999999999999999") }
  };
  const files = {};
  for (const [key, spec] of Object.entries(specs)) {
    const built = await buildFixture(templateBuffer, spec.rows, spec.filename, spec.date);
    await verifyFixture(built);
    files[key] = built;
  }
  check("fixtures_built_and_verified", Object.keys(files).length === Object.keys(specs).length, { files: Object.keys(files) });
  return files;
}

async function certifyBrowser(page, fixture, files) {
  const before = await counts(fixture.tenantId);
  check("browser_flow_starts_without_ledger", before.docs === 0 && before.ledger === 0, before);

  const blankResponse = await validateUi(page, files.blankPreview.file);
  const blankBody = await blankResponse.json().catch(() => ({}));
  check("blank_party_preview_valid", blankResponse.status() === 200 && localResponse(blankResponse) && blankBody.valid === true && String(blankBody.posting_date).startsWith(EXPECTED_DATE) && (blankBody.lines || []).length === 2 && blankBody.lines.every((line) => line.party_id === null && line.party_tax_id === null), { status: blankResponse.status(), posting_date: blankBody.posting_date, lines: blankBody.lines?.length });
  const blankText = await page.$eval("body", (body) => body.innerText);
  check("blank_preview_ui_uses_utc_calendar", blankText.includes("31/12/2025") && !blankText.includes("30/12/2025"), { date_fragment: blankText.match(/Fecha[^\n]*/)?.[0] || "" });
  checkPreviewRows(await readPreviewRows(page), "--", "1.000");
  let after = await counts(fixture.tenantId);
  check("blank_preview_writes_no_ledger", after.docs === 0 && after.ledger === 0, after);

  const missingResponse = await validateUi(page, files.missing.file);
  const missingBody = await missingResponse.json().catch(() => ({}));
  await page.waitForFunction(() => document.body.innerText.toLowerCase().includes("tercero no encontrado"), { timeout: 30000 });
  await page.screenshot({ path: errorShot, fullPage: true });
  screenshots.error = relative(errorShot);
  check("missing_nit_ui_controlled_4xx", missingResponse.status() === 404 && missingBody.code === "OPENING_BALANCE_PARTY_NOT_FOUND", { status: missingResponse.status(), code: missingBody.code });
  after = await counts(fixture.tenantId);
  check("missing_nit_ui_writes_no_ledger", after.docs === 0 && after.ledger === 0, after);

  const numericResponse = await validateUi(page, files.numericNit.file);
  const numericBody = await numericResponse.json().catch(() => ({}));
  check("numeric_nit_preview_resolves_exact_party", numericResponse.status() === 200 && localResponse(numericResponse) && numericBody.valid === true && String(numericBody.posting_date).startsWith(EXPECTED_DATE) && (numericBody.lines || []).length === 2 && numericBody.lines.every((line) => line.party_id === fixture.exactPartyId && line.party_tax_id === EXACT_NIT), { status: numericResponse.status(), posting_date: numericBody.posting_date, party_ids: (numericBody.lines || []).map((line) => line.party_id) });
  check("numeric_nit_preview_ui_date", (await page.$eval("body", (body) => body.innerText)).includes("31/12/2025"));
  checkPreviewRows(await readPreviewRows(page), EXACT_NIT, "1.000");
  after = await counts(fixture.tenantId);
  check("numeric_nit_preview_writes_no_ledger", after.docs === 0 && after.ledger === 0, after);

  const confirmed = await confirmUi(page);
  check("confirm_uses_real_browser_dialog", confirmed.dialog.type === "confirm" && confirmed.dialog.message.includes("Confirmar saldos iniciales"), { type: confirmed.dialog.type, message: confirmed.dialog.message.slice(0, 140) });
  const postBody = await confirmed.response.json().catch(() => ({}));
  const documentNumber = postBody.accounting_document?.full_number;
  check("numeric_nit_post_ui_success", confirmed.response.status() === 201 && localResponse(confirmed.response) && Boolean(documentNumber), { status: confirmed.response.status(), document: documentNumber });
  await page.waitForFunction(() => document.body.innerText.includes("Saldos contabilizados en"), { timeout: 60000 });
  check("numeric_nit_post_visible_in_ui", (await page.$eval("body", (body) => body.innerText)).includes(documentNumber), { document: documentNumber });
  await page.screenshot({ path: successShot, fullPage: true });
  screenshots.success = relative(successShot);

  const document = await db.cntCabdoc.findFirst({ where: { tenant_id: fixture.tenantId, full_number: documentNumber }, include: { lines: { orderBy: { line_no: "asc" } } } });
  check("numeric_nit_document_posted", Boolean(document) && document.status === "posted" && document.society_code === SOCIETY && document.posting_date.toISOString().slice(0, 10) === EXPECTED_DATE && document.total_debit === 1000 && document.total_credit === 1000 && String(document.reference || "").startsWith("SI-"), { document: documentNumber, posting_date: document?.posting_date?.toISOString().slice(0, 10), debit: document?.total_debit, credit: document?.total_credit });
  const lines = document?.lines || [];
  check("numeric_nit_party_persisted_on_both_rows", lines.length === 2 && lines.every((line) => line.party_id === fixture.exactPartyId && line.party_tax_id === EXACT_NIT && line.branch_code === BRANCH && line.cost_center_code === COST_CENTER) && lines.reduce((sum, line) => sum + line.debit, 0) === 1000 && lines.reduce((sum, line) => sum + line.credit, 0) === 1000, { party_ids: lines.map((line) => line.party_id), tax_ids: lines.map((line) => line.party_tax_id) });
  const ledgerIds = lines.map((line) => line.ledger_entry_id).filter(Boolean);
  const ledger = await db.ledgerEntry.findMany({ where: { tenant_id: fixture.tenantId, id: { in: ledgerIds } } });
  check("numeric_nit_ledger_posted_balanced", ledger.length === 2 && ledger.reduce((sum, entry) => sum + entry.debit, 0) === 1000 && ledger.reduce((sum, entry) => sum + entry.credit, 0) === 1000 && ledger.every((entry) => entry.date.toISOString().slice(0, 10) === EXPECTED_DATE && entry.period === "2025-12" && entry.tenant_id === fixture.tenantId), { entries: ledger.map((entry) => ({ debit: entry.debit, credit: entry.credit, period: entry.period })) });
  after = await counts(fixture.tenantId);
  check("numeric_nit_post_counts", after.docs === 1 && after.ledger === 2, after);

  await page.reload({ waitUntil: "networkidle2" });
  await openOpeningPage(page);
  const duplicateValidate = await validateUi(page, files.numericNit.file);
  check("duplicate_file_still_validates", duplicateValidate.status() === 200, { status: duplicateValidate.status() });
  const duplicate = await confirmUi(page);
  const duplicateBody = await duplicate.response.json().catch(() => ({}));
  await page.waitForFunction(() => document.body.innerText.toLowerCase().includes("ya fue contabilizada"), { timeout: 30000 });
  await page.screenshot({ path: path.join(evidenceDir, "opening-balances-nit-duplicate.png"), fullPage: true });
  screenshots.duplicate = relative(path.join(evidenceDir, "opening-balances-nit-duplicate.png"));
  check("duplicate_post_blocked", duplicate.response.status() === 409 && duplicateBody.code === "OPENING_BALANCES_ALREADY_POSTED" && duplicate.dialog.type === "confirm", { status: duplicate.response.status(), code: duplicateBody.code });
  after = await counts(fixture.tenantId);
  check("duplicate_post_writes_no_extra_document", after.docs === 1 && after.ledger === 2, after);

  const blankImportResponse = await validateUi(page, files.blankImport.file);
  const blankImportBody = await blankImportResponse.json().catch(() => ({}));
  check("blank_party_import_preview_valid", blankImportResponse.status() === 200 && blankImportBody.valid === true && String(blankImportBody.posting_date).startsWith(SECOND_DATE) && (blankImportBody.lines || []).length === 2 && blankImportBody.lines.every((line) => line.party_id === null && line.party_tax_id === null), { status: blankImportResponse.status(), posting_date: blankImportBody.posting_date });
  check("blank_party_import_ui_utc_date", (await page.$eval("body", (body) => body.innerText)).includes("30/12/2025"));
  checkPreviewRows(await readPreviewRows(page), "--", "2.500");
  const blankConfirm = await confirmUi(page);
  const blankPostBody = await blankConfirm.response.json().catch(() => ({}));
  const blankDocumentNumber = blankPostBody.accounting_document?.full_number;
  await page.waitForFunction(() => document.body.innerText.includes("Saldos contabilizados en"), { timeout: 60000 });
  check("blank_party_import_posted", blankConfirm.response.status() === 201 && Boolean(blankDocumentNumber), { status: blankConfirm.response.status(), document: blankDocumentNumber });
  const blankDocument = await db.cntCabdoc.findFirst({ where: { tenant_id: fixture.tenantId, full_number: blankDocumentNumber }, include: { lines: true } });
  const blankLines = blankDocument?.lines || [];
  check("blank_party_null_persisted", Boolean(blankDocument) && blankDocument.status === "posted" && blankDocument.society_code === SOCIETY && blankDocument.posting_date.toISOString().slice(0, 10) === SECOND_DATE && blankLines.length === 2 && blankLines.every((line) => line.party_id === null && line.party_tax_id === null) && blankDocument.total_debit === 2500 && blankDocument.total_credit === 2500, { document: blankDocumentNumber, posting_date: blankDocument?.posting_date?.toISOString().slice(0, 10), party_ids: blankLines.map((line) => line.party_id) });
  const blankLedgerIds = blankLines.map((line) => line.ledger_entry_id).filter(Boolean);
  const blankLedger = await db.ledgerEntry.findMany({ where: { tenant_id: fixture.tenantId, id: { in: blankLedgerIds } } });
  check("blank_party_ledger_posted_balanced", blankLedger.length === 2 && blankLedger.reduce((sum, entry) => sum + entry.debit, 0) === 2500 && blankLedger.reduce((sum, entry) => sum + entry.credit, 0) === 2500 && blankLedger.every((entry) => entry.date.toISOString().slice(0, 10) === SECOND_DATE && entry.period === "2025-12"), { entries: blankLedger.map((entry) => ({ debit: entry.debit, credit: entry.credit, period: entry.period })) });
  after = await counts(fixture.tenantId);
  check("final_document_and_ledger_counts", after.docs === 2 && after.ledger === 4, after);
  check("screenshots_success_and_error_captured", [successShot, errorShot].every((file) => fs.existsSync(file) && fs.statSync(file).size > 0), { success: relative(successShot), error: relative(errorShot) });
}

function safeFixture(fixture) {
  return { tenant_id: fixture.tenantId, exact_nit: EXACT_NIT, long_nit: LONG_NIT, exact_party_id: fixture.exactPartyId, long_party_id: fixture.longPartyId, inactive_party_id: fixture.inactivePartyId, legacy_party_id: fixture.legacyPartyId, collision_target_id: fixture.collisionTargetId, collision_nit_party_id: fixture.collisionNitId, foreign_tenant_id: fixture.foreignTenantId, foreign_party_id: fixture.foreignPartyId };
}
function fixtureEvidence(files) {
  return Object.fromEntries(Object.entries(files).map(([key, file]) => [key, { file: relative(file.file), date: file.date, bytes: file.buffer.length, sha256: file.sha256 }]));
}
function commitHash() {
  try { return execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(); } catch { return null; }
}
function writeEvidence(status, payload, sources) {
  const evidence = {
    version: 2,
    certification: "opening-balances-nit-browser-local",
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
      "PostgreSQL loopback migrated; DATABASE_URL exported for this shell.",
      "Patched API running at LOCAL_API_URL (default http://127.0.0.1:3215).",
      "Patched web rebuilt and running at LOCAL_WEB_URL (default http://127.0.0.1:3004).",
      "Google Chrome at the standard path or CHROME_BIN.",
      "Registration rate limit allows one new tenant; run from the repository root."
    ],
    checks,
    ...payload
  };
  fs.mkdirSync(evidenceDir, { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`);
  if (evidence.status !== "passed") process.exitCode = 1;
  console.log(JSON.stringify(evidence));
}

async function main() {
  await waitForServer(apiUrl, ["/health", "/api/v1/health"]);
  await waitForServer(webUrl, ["/"]);
  if (!fs.existsSync(browserPath)) throw new Error(`PREREQUISITO: no existe Chrome en ${browserPath}`);
  const sources = collectSources();
  let browser = null;
  let page = null;
  try {
    await db.$connect();
    const fixture = await seedFixture();
    browser = await puppeteer.launch({ executablePath: browserPath, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"] });
    page = await browser.newPage();
    page.setDefaultTimeout(20000);
    page.setDefaultNavigationTimeout(60000);
    await page.emulateTimezone("America/Bogota");
    await login(page, fixture.email, fixture.password);
    const timezone = await page.evaluate(() => ({ zone: Intl.DateTimeFormat().resolvedOptions().timeZone, utcMidnightDay: new Date("2025-12-31T00:00:00.000Z").getDate() }));
    check("browser_timezone_proves_utc_date_bug", timezone.zone === "America/Bogota" && timezone.utcMidnightDay === 30, timezone);
    await openOpeningPage(page);
    const template = await downloadTemplate(page);
    template.headers = (await inspectTemplate(template.buffer)).headers;
    const files = await buildFixtures(template.buffer, fixture);
    await certifyApiEdges(fixture, files);
    await certifyBrowser(page, fixture, files);
    return {
      fixture: safeFixture(fixture),
      template: { file: relative(template.file), bytes: template.buffer.length, sha256: template.sha256, headers: template.headers },
      fixtures: fixtureEvidence(files),
      screenshots,
      sources
    };
  } catch (error) {
    if (page) {
      try { await page.screenshot({ path: failureShot, fullPage: true }); screenshots.failure = relative(failureShot); } catch { /* best effort */ }
    }
    throw Object.assign(error, { screenshots });
  } finally {
    if (browser) await browser.close().catch(() => undefined);
    await db.$disconnect().catch(() => undefined);
  }
}

main().then((payload) => writeEvidence("passed", payload, payload.sources)).catch((error) => {
  const sources = (() => { try { return collectSources(); } catch { return {}; } })();
  writeEvidence("failed", { error: String(error?.stack || error), screenshots: error?.screenshots || screenshots }, sources);
});
