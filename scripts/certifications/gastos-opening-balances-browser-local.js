/* Versioned browser certification for the requested UI flows.
 * Uses a real Chromium page and the local API/database; no request interception or mocked APIs.
 * Prerequisites: local API and web running, DATABASE_URL pointing to localhost, demo seed applied.
 */
process.env.NODE_ENV = "test";
process.env.REDIS_DISABLED = "true";
process.env.DISABLE_REDIS = "true";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");
const ExcelJS = require("exceljs");
const bcrypt = require("bcrypt");
const puppeteer = require("puppeteer-core");
const { PrismaClient } = require("@prisma/client");

const root = path.resolve(__dirname, "../..");
const databaseUrl = String(process.env.DATABASE_URL || "");
if (!/^postgres(?:ql)?:\/\/[^@\s]+@(localhost|127\.0\.0\.1)(:\d+)?\//.test(databaseUrl)) {
  throw new Error("BLOQUEADO: DATABASE_URL debe apuntar a PostgreSQL local.");
}
const apiUrl = process.env.LOCAL_API_URL || "http://127.0.0.1:3213";
const webUrl = process.env.LOCAL_WEB_URL || "http://127.0.0.1:3001";
const output = path.resolve(process.env.BROWSER_EVIDENCE_PATH || "docs/qa/evidence/gastos-saldos-iniciales-20261014/browser-certification-local.json");
const browserPath = process.env.CHROME_BIN || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const suffix = crypto.randomBytes(5).toString("hex");
const checks = [];
const db = new PrismaClient();

function check(name, ok, detail = {}) {
  checks.push({ name, ok: Boolean(ok), detail });
  assert.ok(ok, `${name}: ${JSON.stringify(detail)}`);
}

async function waitForServer(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error(`${url} respondió ${response.status}`);
}

async function seedFixture() {
  const adminEmail = `browser-admin-${suffix}@apexos.local`;
  const adminPassword = `Browser-${suffix}!`;
  const registrationResponse = await fetch(`${apiUrl}/api/v1/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ company_name: `Browser E2E ${suffix}`, industry: "qa", email: adminEmail, password: adminPassword, name: "Browser E2E Admin", country: "CO", timezone: "America/Bogota", currency: "COP", plan: "crown" }),
  });
  const registration = await registrationResponse.json().catch(() => ({}));
  if (!registrationResponse.ok) throw new Error(`Registro tenant E2E fallo ${registrationResponse.status}: ${JSON.stringify(registration).slice(0, 240)}`);
  const tenantId = registration.tenant?.id || registration.user?.tenant_id;
  const tenant = await db.tenant.findUnique({ where: { id: String(tenantId) } });
  if (!tenant) throw new Error("El registro E2E no devolvio un tenant valido.");
  const accountData = [
    ["5195", "Gasto E2E caja", "expense"],
    ["1105", "Caja E2E", "asset"],
    ["1330", "Anticipo E2E", "asset"],
    ["2408", "IVA E2E", "asset"],
    ["1305", "Clientes E2E", "asset"],
    ["3105", "Capital E2E", "equity"]
  ];
  for (const [code, name, type] of accountData) {
    await db.account.upsert({ where: { tenant_id_code: { tenant_id: tenant.id, code } }, update: { active: true, allows_tx: true }, create: { tenant_id: tenant.id, code, name, type, active: true, allows_tx: true } });
  }
  let party = await db.party.findFirst({ where: { tenant_id: tenant.id, name: "Proveedor E2E" } });
  if (!party) party = await db.party.create({ data: { tenant_id: tenant.id, type: "supplier", name: "Proveedor E2E", active: true } });
  const box = await db.pettyCashBox.upsert({ where: { tenant_id_code: { tenant_id: tenant.id, code: `E2E-${suffix}` } }, update: { active: true }, create: { tenant_id: tenant.id, code: `E2E-${suffix}`, name: "Caja browser E2E", account_code: "1105", advance_account_code: "1330", custodian_party_id: party.id, monthly_limit: 2000000, require_advance: false, block_unliquidated_advance: false, active: true } });
  const concept = await db.pettyCashConcept.upsert({ where: { tenant_id_code: { tenant_id: tenant.id, code: `E2E-C-${suffix}` } }, update: { active: true }, create: { tenant_id: tenant.id, code: `E2E-C-${suffix}`, name: "Gasto browser E2E", account_code: "5195", default_vat_code: "COMPRAS-19", requires_supplier: true, requires_invoice_reference: true, active: true } });
  const limitedRole = await db.role.create({ data: { tenant_id: tenant.id, name: `E2E_LIMITED_${suffix}`, is_system: false } });
  const limitedEmail = `limited-${suffix}@apex.local`;
  await db.user.create({ data: { tenant_id: tenant.id, name: "Limited E2E", email: limitedEmail, password: await bcrypt.hash("limited-e2e", 4), role_id: limitedRole.id, active: true } });
  const config = tenant.config && typeof tenant.config === "object" ? tenant.config : {};
  await db.tenant.update({ where: { id: tenant.id }, data: { active_modules: Array.from(new Set([...(tenant.active_modules || []), "M-07", "M-29"])), config: { ...config, accounting: { ...(config.accounting || {}), organization_tree: { societies: [{ code: `SOC-${suffix}`, name: "Sociedad E2E", active: true }], branches: [{ code: `BR-${suffix}`, name: "Sucursal E2E", society_code: `SOC-${suffix}`, active: true }], cost_centers: [{ code: `CC-${suffix}`, name: "Centro E2E", society_code: `SOC-${suffix}`, branch_code: `BR-${suffix}`, active: true }] } } } } });
  return { tenantId: tenant.id, partyId: party.id, boxId: box.id, boxCode: box.code, conceptId: concept.id, society: `SOC-${suffix}`, branch: `BR-${suffix}`, costCenter: `CC-${suffix}`, limitedEmail, adminEmail, adminPassword };
}

async function login(page, email = "demo@apex.local", password = "test1234") {
  let loginResponse = null;
  page.on("response", async (response) => {
    if (response.request().method() !== "POST" || !response.url().endsWith("/api/v1/auth/login")) return;
    const detail = { status: response.status() };
    if (response.status() >= 400) {
      const body = await response.json().catch(() => ({}));
      if (typeof body.code === "string") detail.code = body.code.slice(0, 80);
      if (typeof body.error === "string") detail.error = body.error.slice(0, 120);
    }
    loginResponse = detail;
  });
  await page.goto(`${webUrl}/login`, { waitUntil: "networkidle2" });
  await page.waitForSelector('input[name="email"]', { visible: true, timeout: 45000 });
  await page.waitForSelector('input[name="password"]', { visible: true, timeout: 45000 });
  await page.waitForSelector('form button[type="submit"]', { visible: true, timeout: 45000 });
  await page.waitForFunction(() => {
    const form = document.querySelector("form");
    return Boolean(form && Object.keys(form).some((key) => key.startsWith("__reactProps$") && typeof form[key]?.onSubmit === "function"));
  }, { timeout: 45000 });
  for (const selector of ['input[name="email"]', 'input[name="password"]']) {
    await page.click(selector, { clickCount: 3 });
    await page.keyboard.down("Control");
    await page.keyboard.press("A");
    await page.keyboard.up("Control");
    await page.keyboard.press("Backspace");
  }
  await page.type('input[name="email"]', email);
  await page.type('input[name="password"]', password);
  await page.click('form button[type="submit"]');
  try {
    await page.waitForFunction(() => !location.pathname.endsWith("/login"), { timeout: 45000 });
  } catch (error) {
    const diagnostic = await page.evaluate(() => ({
      path: location.pathname,
      text: document.body.innerText.slice(0, 240),
      emailSet: Boolean(document.querySelector('input[name="email"]')?.value),
    }));
    throw new Error(`login_timeout ${JSON.stringify({ ...diagnostic, passwordLength: password.length, response: loginResponse })}`, { cause: error });
  }
  check("browser_login_real", true, { path: await page.evaluate(() => location.pathname) });
}

async function certifyDeniedPermissions(browser, fixture) {
  const context = await browser.createBrowserContext();
  const denied = await context.newPage();
  denied.setDefaultTimeout(15000);
  await login(denied, fixture.limitedEmail, "limited-e2e");
  await denied.goto(`${webUrl}/dashboard/gastos-menores/gastos`, { waitUntil: "networkidle2" });
  await denied.waitForFunction(() => document.body.innerText.includes("Acceso no autorizado"), { timeout: 45000 });
  check("browser_denied_role_visible", (await denied.$eval("body", (body) => body.innerText)).includes("Acceso no autorizado"), { email: fixture.limitedEmail });
  await context.close();
}

async function certifyGastos(page, fixture) {
  console.error("[browser-cert] gastos:list");
  await page.goto(`${webUrl}/dashboard/gastos-menores/gastos`, { waitUntil: "networkidle2" });
  await page.reload({ waitUntil: "networkidle2" });
  await page.waitForFunction(() => {
    const text = document.body.innerText;
    return Boolean(document.querySelector('h1'))
      && text.includes("Registro de gastos de caja")
      && !text.includes("Validando permisos")
      && Boolean(document.querySelector('a[href="/dashboard/gastos-menores/gastos/nuevo"]'));
  }, { timeout: 45000 });
  const before = await page.$eval("body", (body) => body.innerText);
  check("gastos_list_page_loaded", before.includes("Registro de gastos de caja"), { path: await page.evaluate(() => location.pathname), text: before.slice(0, 180) });
  await page.click('a[href="/dashboard/gastos-menores/gastos/nuevo"]');
  await page.waitForFunction(() => location.pathname.endsWith("/gastos/nuevo"));
  await page.waitForFunction(() => {
    const text = document.body.innerText;
    return text.includes("Digitar gastos de caja") && !text.includes("Validando permisos");
  }, { timeout: 45000 });
  await page.waitForSelector('select[aria-label="Concepto línea 1"]', { visible: true, timeout: 45000 });
  await page.select('select[aria-label="Caja de trabajo"]', String(fixture.boxId));
  await page.waitForFunction((boxId) => document.querySelector('select[aria-label="Caja de trabajo"]')?.value === String(boxId), {}, fixture.boxId);
  await page.waitForFunction((boxCode) => document.body.innerText.includes(`Caja ${boxCode} - Caja browser E2E`), {}, fixture.boxCode);
  check("gastos_box_fixture_selected", true, { boxId: fixture.boxId, boxCode: fixture.boxCode });
  await page.select('select[aria-label="Concepto línea 1"]', String(fixture.conceptId));
  await page.type('input[aria-label="Descripción línea 1"]', "Gasto browser E2E");
  await page.type('input[aria-label="Base línea 1"]', "12500");
  await page.select('select[aria-label="IVA línea 1"]', "COMPRAS-19");
  await page.select('select[aria-label="Proveedor línea 1"]', String(fixture.partyId));
  await page.type('input[aria-label="Factura línea 1"]', `E2E-${suffix}`);
  await page.select('select[aria-label="Centro de costo línea 1"]', fixture.costCenter);
  await page.click('button[type="submit"]');
  console.error("[browser-cert] gastos:submitted");
  await page.waitForFunction(() => document.body.innerText.includes("contabilizado") || document.body.innerText.includes("Contabilizado"), { timeout: 20000 });
  check("gastos_ui_save_success", true);
  await page.goto(`${webUrl}/dashboard/gastos-menores/gastos`, { waitUntil: "networkidle2" });
  await page.waitForFunction(() => document.body.innerText.includes("GM-"), { timeout: 15000 });
  const text = await page.$eval("body", (body) => body.innerText);
  check("gastos_list_reflects_saved_document", text.includes("GM-"));
  const persisted = await db.pettyCashVoucher.findFirst({ where: { tenant_id: fixture.tenantId, box_id: fixture.boxId }, orderBy: { id: "desc" }, include: { lines: true } });
  console.error("[browser-cert] gastos:db", persisted?.full_number || "none");
  check("gastos_list_exact_document_survives_reload", Boolean(persisted) && text.includes(persisted.full_number), { voucher: persisted?.full_number });
  check("gastos_db_persisted", Boolean(persisted) && persisted.lines.length === 1, { voucher: persisted?.full_number, lines: persisted?.lines.length });
  return persisted;
}

async function refreshOrganizationFixture(page, fixture) {
  const result = await page.evaluate(async (value) => {
    const token = localStorage.getItem("token");
    const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
    const society = await fetch(`${value.apiUrl}/api/v1/accounting/organization-tree`, { method: "POST", headers, body: JSON.stringify({ type: "society", code: value.society, name: "Sociedad E2E" }) });
    const branch = await fetch(`${value.apiUrl}/api/v1/accounting/organization-tree`, { method: "POST", headers, body: JSON.stringify({ type: "branch", code: value.branch, name: "Sucursal E2E", society_code: value.society }) });
    const center = await fetch(`${value.apiUrl}/api/v1/accounting/organization-tree`, { method: "POST", headers, body: JSON.stringify({ type: "cost_center", code: value.costCenter, name: "Centro E2E", society_code: value.society, branch_code: value.branch }) });
    return { society: society.status, branch: branch.status, center: center.status };
  }, { ...fixture, apiUrl });
  check("opening_balances_org_fixture_real_api", result.society === 201 && result.branch === 201 && result.center === 201, result);
}

async function certifyOpeningBalances(page, fixture) {
  console.error("[browser-cert] opening:page");
  page.on("response", async (response) => {
    if (response.status() >= 400) console.error("[browser-cert] http-error", response.status(), response.url());
    if (response.url().includes("opening-balances/validate") && response.status() >= 400) console.error("[browser-cert] opening:validation-response", response.status(), await response.text().catch(() => ""));
  });
  await page.goto(`${webUrl}/dashboard/contabilidad/importar-saldos-iniciales`, { waitUntil: "networkidle2" });
  await page.reload({ waitUntil: "networkidle2" });
  await page.waitForFunction(() => {
    const text = document.body.innerText;
    return text.includes("Importar saldos iniciales") && !text.includes("Validando permisos");
  }, { timeout: 45000 });
  check("opening_balances_page_loaded", (await page.$eval("body", (body) => body.innerText)).includes("Importar saldos iniciales"));
  const downloadDir = path.join(require("node:os").tmpdir(), `apex-e2e-download-${suffix}`);
  fs.mkdirSync(downloadDir, { recursive: true });
  const client = await page.target().createCDPSession();
  await client.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: downloadDir });
  await page.evaluate(() => [...document.querySelectorAll("button")].find((button) => button.textContent.includes("Descargar Excel"))?.click());
  const downloaded = path.join(downloadDir, "plantilla-saldos-iniciales.xlsx");
  for (let attempt = 0; attempt < 30 && !fs.existsSync(downloaded); attempt += 1) await new Promise((resolve) => setTimeout(resolve, 200));
  check("opening_balances_template_downloaded", fs.existsSync(downloaded), { file: downloaded });
  const filled = new ExcelJS.Workbook();
  await filled.xlsx.readFile(downloaded);
  const sheet = filled.worksheets[0];
  sheet.addRow(["2026-01-31", "1305", fixture.costCenter, fixture.branch, "1000", ""]);
  sheet.addRow(["2026-01-31", "3105", fixture.costCenter, fixture.branch, "-1000", ""]);
  const filePath = path.join(downloadDir, `filled-${suffix}.xlsx`);
  await filled.xlsx.writeFile(filePath);
  const input = await page.$('input[type="file"]');
  await input.uploadFile(filePath);
  console.error("[browser-cert] opening:file");
  let validateButton = null;
  for (const button of await page.$$('button')) {
    if ((await button.evaluate((node) => node.textContent || "")).includes("Validar plantilla")) { validateButton = button; break; }
  }
  if (!validateButton) throw new Error("No se encontró el botón Validar plantilla");
  await validateButton.click();
  console.error("[browser-cert] opening:validate-clicked");
  await page.waitForFunction(() => document.body.innerText.includes("Validación correcta"), { timeout: 20000 });
  console.error("[browser-cert] opening:preview");
  check("opening_balances_ui_preview_success", true);
  page.once("dialog", (dialog) => dialog.accept());
  await page.evaluate(() => [...document.querySelectorAll("button")].find((button) => button.textContent.includes("Confirmar contabilización"))?.click());
  await page.waitForFunction(() => document.body.innerText.includes("Saldos contabilizados"), { timeout: 20000 });
  console.error("[browser-cert] opening:posted");
  check("opening_balances_ui_post_success", true);
  const postedText = await page.$eval("body", (body) => body.innerText);
  const documentNumber = postedText.match(/AJ-\d+/)?.[0];
  check("opening_balances_exact_document_visible", Boolean(documentNumber), { document: documentNumber });
  await page.goto(`${webUrl}/dashboard/contabilidad/asientos`, { waitUntil: "networkidle2" });
  await page.reload({ waitUntil: "networkidle2" });
  await page.waitForFunction((number) => document.body.innerText.includes(number), { timeout: 45000 }, documentNumber);
  check("opening_balances_ledger_route_survives_reload", (await page.$eval("body", (body) => body.innerText)).includes(documentNumber), { route: await page.evaluate(() => location.pathname), document: documentNumber });
  const document = await db.cntCabdoc.findFirst({ where: { tenant_id: fixture.tenantId, full_number: documentNumber }, include: { lines: true } });
  const debit = Number(document?.total_debit || 0); const credit = Number(document?.total_credit || 0);
  check("opening_balances_db_persisted", Boolean(document) && document.lines.length === 2 && debit === credit, { document: documentNumber, lines: document?.lines.length, debit, credit });
  fs.rmSync(downloadDir, { recursive: true, force: true });
}

async function main() {
  await waitForServer(`${apiUrl}/health`);
  await waitForServer(webUrl);
  const fixture = await seedFixture();
  const browser = await puppeteer.launch({ executablePath: browserPath, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const page = await browser.newPage();
  page.setDefaultTimeout(15000);
  try {
    await login(page, fixture.adminEmail, fixture.adminPassword);
    await certifyGastos(page, fixture);
    await refreshOrganizationFixture(page, fixture);
    await certifyOpeningBalances(page, fixture);
    await certifyDeniedPermissions(browser, fixture);
  } finally { await browser.close(); await db.$disconnect(); }
  const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  const { adminPassword: _adminPassword, ...safeFixture } = fixture;
  const evidence = { version: 2, certification: "gastos-opening-balances-browser-local", status: "passed", generated_at: new Date().toISOString(), commit, api_url: apiUrl, web_url: webUrl, browser: browserPath, fixture: safeFixture, checks };
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(JSON.stringify(evidence));
}

main().catch(async (error) => { await db.$disconnect().catch(() => undefined); const failure = { version: 2, certification: "gastos-opening-balances-browser-local", status: "failed", generated_at: new Date().toISOString(), error: String(error?.stack || error), checks }; fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, `${JSON.stringify(failure, null, 2)}\n`); console.error(JSON.stringify(failure)); process.exitCode = 1; });
