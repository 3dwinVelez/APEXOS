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
  await db.pettyCashBox.upsert({ where: { tenant_id_code: { tenant_id: tenant.id, code: `E2E-A-${suffix}` } }, update: { active: true, name: "Caja browser E2E" }, create: { tenant_id: tenant.id, code: `E2E-A-${suffix}`, name: "Caja browser E2E", account_code: "1105", advance_account_code: "1330", custodian_party_id: party.id, monthly_limit: 2000000, require_advance: false, block_unliquidated_advance: false, active: true } });
  const requiredBox = await db.pettyCashBox.upsert({ where: { tenant_id_code: { tenant_id: tenant.id, code: `E2E-R-${suffix}` } }, update: { active: true, require_advance: true }, create: { tenant_id: tenant.id, code: `E2E-R-${suffix}`, name: "Caja anticipo browser E2E", account_code: "1105", advance_account_code: "1330", custodian_party_id: party.id, monthly_limit: 2000000, require_advance: true, block_unliquidated_advance: false, active: true } });
  const advanceNumber = 800000 + (Number.parseInt(suffix.slice(0, 6), 16) % 99999);
  const requiredAdvance = await db.pettyCashAdvance.upsert({
    where: { tenant_id_document_type_number: { tenant_id: tenant.id, document_type: "APC", number: advanceNumber } },
    update: { box_id: requiredBox.id, status: "open", amount: 500000, balance: 500000, applied_total: 0 },
    create: { tenant_id: tenant.id, box_id: requiredBox.id, document_type: "APC", number: advanceNumber, full_number: `APC-${String(advanceNumber).padStart(6, "0")}`, date: new Date(), custodian_party_id: party.id, amount: 500000, balance: 500000, applied_total: 0, status: "open", description: "Anticipo browser E2E" }
  });
  const concept = await db.pettyCashConcept.upsert({ where: { tenant_id_code: { tenant_id: tenant.id, code: `E2E-C-${suffix}` } }, update: { active: true }, create: { tenant_id: tenant.id, code: `E2E-C-${suffix}`, name: "Gasto browser E2E", account_code: "5195", default_vat_code: "COMPRAS-19", requires_supplier: true, requires_invoice_reference: true, active: true } });
  const limitedRole = await db.role.create({ data: { tenant_id: tenant.id, name: `E2E_LIMITED_${suffix}`, is_system: false } });
  const limitedEmail = `limited-${suffix}@apex.local`;
  await db.user.create({ data: { tenant_id: tenant.id, name: "Limited E2E", email: limitedEmail, password: await bcrypt.hash("limited-e2e", 4), role_id: limitedRole.id, active: true } });
  const config = tenant.config && typeof tenant.config === "object" ? tenant.config : {};
  await db.tenant.update({ where: { id: tenant.id }, data: { active_modules: Array.from(new Set([...(tenant.active_modules || []), "M-07", "M-29"])), config: { ...config, accounting: { ...(config.accounting || {}), organization_tree: { societies: [{ code: `SOC-${suffix}`, name: "Sociedad E2E", active: true }], branches: [{ code: `BR-${suffix}`, name: "Sucursal E2E", society_code: `SOC-${suffix}`, active: true }], cost_centers: [{ code: `CC-${suffix}`, name: "Centro E2E", society_code: `SOC-${suffix}`, branch_code: `BR-${suffix}`, active: true }] } } } } });
  return { tenantId: tenant.id, partyId: party.id, boxId: box.id, boxCode: box.code, ambiguousBoxName: "Caja browser E2E", requiredBoxId: requiredBox.id, requiredBoxCode: requiredBox.code, requiredAdvanceId: requiredAdvance.id, requiredAdvanceNumber: requiredAdvance.full_number, conceptId: concept.id, society: `SOC-${suffix}`, branch: `BR-${suffix}`, costCenter: `CC-${suffix}`, limitedEmail, adminEmail, adminPassword };
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

async function replaceFocusedText(page, text) {
  await page.keyboard.down("Control");
  await page.keyboard.press("A");
  await page.keyboard.up("Control");
  await page.keyboard.press("Backspace");
  if (text) await page.keyboard.type(text);
}

async function certifyLookupKeyboardFlow(page, ariaLabel, query, expectedText, options = {}) {
  const inputSelector = `input[role="combobox"][aria-label="${ariaLabel}"]`;
  const nativeSelector = `select[aria-label="${ariaLabel}"]`;
  check(`${options.key || ariaLabel}_uses_real_lookup_input`, Boolean(await page.$(inputSelector)) && !(await page.$(nativeSelector)), { ariaLabel });
  const input = await page.$(inputSelector);
  if (!input) throw new Error(`No se encontro el lookup ${ariaLabel}`);
  await input.click();
  await replaceFocusedText(page, "");
  await page.keyboard.press("Enter");
  const dialogSelector = `[role="dialog"][aria-label="Buscar ${ariaLabel}"]`;
  await page.waitForSelector(dialogSelector, { visible: true, timeout: 10000 });
  check(`${options.key || ariaLabel}_empty_enter_opens_lookup`, true, { ariaLabel });
  const emptyEnterFocus = await page.$eval(`input[aria-label="Filtro ${ariaLabel}"]`, (node) => document.activeElement === node);
  check(`${options.key || ariaLabel}_empty_enter_focus_filter`, emptyEnterFocus);
  await page.keyboard.press("Escape");
  await page.waitForFunction((selector) => !document.querySelector(selector), {}, dialogSelector);
  const focusReturned = await page.$eval(inputSelector, (node) => document.activeElement === node);
  check(`${options.key || ariaLabel}_escape_returns_focus`, focusReturned);

  const searchButton = `button[aria-label="Buscar ${ariaLabel}"]`;
  await page.click(searchButton);
  await page.waitForSelector(dialogSelector, { visible: true, timeout: 10000 });
  const filterSelector = `input[aria-label="Filtro ${ariaLabel}"]`;
  await page.click(filterSelector);
  await replaceFocusedText(page, query);
  await page.waitForFunction((selector) => document.querySelectorAll(`${selector} [role="option"]`).length > 0, {}, dialogSelector);
  await page.keyboard.press("Enter");
  await page.waitForFunction(({ selector, expected }) => document.querySelector(selector)?.value.includes(expected), {}, { selector: inputSelector, expected: expectedText });
  check(`${options.key || ariaLabel}_filter_enter_picks_option`, true, { query, expectedText });
  if (options.invalid) {
    let postCount = 0;
    const onRequest = (request) => { if (request.method() === "POST") postCount += 1; };
    page.on("request", onRequest);
    await input.click();
    await replaceFocusedText(page, options.invalid);
    await page.keyboard.press("Enter");
    await new Promise((resolve) => setTimeout(resolve, 300));
    page.off("request", onRequest);
    const body = await page.$eval("body", (node) => node.innerText);
    const visibleText = await page.$eval(inputSelector, (node) => node.value);
    check(`${options.key || ariaLabel}_invalid_no_post_and_clears_id`, postCount === 0 && body.includes("No encontramos") && visibleText === options.invalid, { postCount, invalid: options.invalid, visibleText });
    await input.click();
    await replaceFocusedText(page, "");
    await page.keyboard.press("Tab");
    await page.click(searchButton);
    await page.waitForSelector(dialogSelector, { visible: true, timeout: 10000 });
    await page.click(filterSelector);
    await replaceFocusedText(page, query);
    await page.waitForFunction((selector) => document.querySelectorAll(`${selector} [role="option"]`).length > 0, {}, dialogSelector);
    await page.keyboard.press("Enter");
    await page.waitForFunction(({ selector, expected }) => document.querySelector(selector)?.value.includes(expected), {}, { selector: inputSelector, expected: expectedText });
    check(`${options.key || ariaLabel}_invalid_reselect_restores_valid_id`, true, { expectedText });
  }
  if (options.ambiguous) {
    let postCount = 0;
    const onRequest = (request) => { if (request.method() === "POST") postCount += 1; };
    page.on("request", onRequest);
    await input.click();
    await replaceFocusedText(page, options.ambiguous);
    await page.keyboard.press("Enter");
    await new Promise((resolve) => setTimeout(resolve, 300));
    page.off("request", onRequest);
    const body = await page.$eval("body", (node) => node.innerText);
    const visibleText = await page.$eval(inputSelector, (node) => node.value);
    check(`${options.key || ariaLabel}_ambiguous_name_rejected_without_post`, postCount === 0 && body.includes("No encontramos") && visibleText === options.ambiguous, { postCount, ambiguous: options.ambiguous, visibleText });
    await input.click();
    await replaceFocusedText(page, "");
    await page.keyboard.press("Tab");
    await page.click(searchButton);
    await page.waitForSelector(dialogSelector, { visible: true, timeout: 10000 });
    await page.click(filterSelector);
    await replaceFocusedText(page, query);
    await page.waitForFunction((selector) => document.querySelectorAll(`${selector} [role="option"]`).length > 0, {}, dialogSelector);
    await page.keyboard.press("Enter");
    await page.waitForFunction(({ selector, expected }) => document.querySelector(selector)?.value.includes(expected), {}, { selector: inputSelector, expected: expectedText });
    check(`${options.key || ariaLabel}_ambiguous_reselect_restores_valid_id`, true, { expectedText });
  }
  return inputSelector;
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
  await page.waitForSelector('input[role="combobox"][aria-label="Concepto línea 1"]', { visible: true, timeout: 45000 });
  await certifyLookupKeyboardFlow(page, "Caja de trabajo", fixture.boxCode, fixture.boxCode, { key: "box", invalid: "CAJA_INVALIDA_E2E", ambiguous: fixture.ambiguousBoxName });
  await page.waitForFunction((boxCode) => document.body.innerText.includes(`Caja ${boxCode} - Caja browser E2E`), {}, fixture.boxCode);
  check("gastos_box_fixture_selected", true, { boxId: fixture.boxId, boxCode: fixture.boxCode });
  const boxNextFocus = await page.$eval("body", () => {
    const active = document.activeElement;
    return { type: active?.getAttribute("type") || "", ariaLabel: active?.getAttribute("aria-label") || "" };
  });
  check("gastos_box_lookup_enter_advances_focus", boxNextFocus.type === "date" || boxNextFocus.ariaLabel === "Anticipo del comprobante" || boxNextFocus.ariaLabel === "Concepto línea 1", boxNextFocus);
  await certifyLookupKeyboardFlow(page, "Concepto línea 1", "Gasto browser E2E", "Gasto browser E2E", { key: "concept", invalid: "CONCEPTO_INVALIDO_E2E" });
  await page.waitForSelector('input[role="combobox"][aria-label="Concepto línea 2"]', { visible: true, timeout: 10000 });
  check("gastos_lookup_adds_next_empty_row", true);
  const invalidRow = await page.$('input[role="combobox"][aria-label="Concepto línea 2"]');
  await invalidRow.click();
  await replaceFocusedText(page, "CONCEPTO_FILA_INVALIDA_E2E");
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => document.body.innerText.includes("No encontramos el concepto"));
  await page.click('button[aria-label="Quitar línea 2"]');
  await page.waitForFunction(() => !document.querySelector('input[role="combobox"][aria-label="Concepto línea 2"]'));
  check("gastos_remove_invalid_row_clears_lookup_error_and_last_row", !(await page.$('input[role="combobox"][aria-label="Concepto línea 2"]')) && !(await page.$eval("body", (node) => node.innerText.includes("No encontramos el concepto"))));
  await certifyLookupKeyboardFlow(page, "Concepto línea 1", "Gasto browser E2E", "Gasto browser E2E", { key: "concept_reuse" });
  await page.waitForSelector('input[role="combobox"][aria-label="Concepto línea 2"]', { visible: true, timeout: 10000 });
  check("gastos_new_row_reused_after_invalid_row_removal", true);
  await page.type('input[aria-label="Descripción línea 1"]', "Gasto browser E2E");
  await page.type('input[aria-label="Base línea 1"]', "12500");
  await certifyLookupKeyboardFlow(page, "IVA línea 1", "COMPRAS-19", "COMPRAS-19", { key: "vat" });
  const vatInput = await page.$('input[role="combobox"][aria-label="IVA línea 1"]');
  await vatInput.click();
  await replaceFocusedText(page, "");
  await page.keyboard.press("Tab");
  check("vat_optional_lookup_clears_on_blur", !(await page.$eval('input[role="combobox"][aria-label="IVA línea 1"]', (node) => node.value)));
  await certifyLookupKeyboardFlow(page, "IVA línea 1", "COMPRAS-19", "COMPRAS-19", { key: "vat_reselect" });
  await certifyLookupKeyboardFlow(page, "Proveedor línea 1", "Proveedor E2E", "Proveedor E2E", { key: "supplier" });
  await page.type('input[aria-label="Factura línea 1"]', `E2E-${suffix}`);
  await certifyLookupKeyboardFlow(page, "Centro de costo línea 1", fixture.costCenter, fixture.costCenter, { key: "cost_center" });
  await certifyLookupKeyboardFlow(page, "Caja de trabajo", fixture.requiredBoxCode, fixture.requiredBoxCode, { key: "required_box" });
  const requiredAdvanceInput = 'input[role="combobox"][aria-label="Anticipo del comprobante"]';
  check("required_advance_box_starts_empty", await page.$eval(requiredAdvanceInput, (node) => node.value.includes("Seleccione el anticipo vigente")));
  const requiredAdvanceSubmit = await page.$('button[type="submit"]');
  const requiredAdvanceSubmitDisabled = await requiredAdvanceSubmit.evaluate((node) => node.disabled);
  const requiredAdvanceHelperVisible = await page.$eval("body", (node) => node.innerText.includes("Anticipo (obligatorio)"));
  const requiredAdvancePlaceholderVisible = await page.$eval(requiredAdvanceInput, (node) => node.value.includes("Seleccione el anticipo vigente"));
  let requiredBoxPostCount = 0;
  const onRequiredBoxRequest = (request) => { if (request.method() === "POST") requiredBoxPostCount += 1; };
  page.on("request", onRequiredBoxRequest);
  await requiredAdvanceSubmit.click();
  await new Promise((resolve) => setTimeout(resolve, 300));
  page.off("request", onRequiredBoxRequest);
  check("required_advance_empty_disables_submit_and_shows_helper", requiredAdvanceSubmitDisabled && requiredAdvanceHelperVisible && requiredAdvancePlaceholderVisible && requiredBoxPostCount === 0, { requiredAdvanceSubmitDisabled, requiredAdvanceHelperVisible, requiredAdvancePlaceholderVisible, requiredBoxPostCount });
  await certifyLookupKeyboardFlow(page, "Anticipo del comprobante", fixture.requiredAdvanceNumber, fixture.requiredAdvanceNumber, { key: "required_advance" });
  await certifyLookupKeyboardFlow(page, "Caja de trabajo", fixture.boxCode, fixture.boxCode, { key: "cash_box_reset" });
  check("changing_box_clears_advance_id_and_error", await page.$eval(requiredAdvanceInput, (node) => node.value.includes("Sin anticipo")), { cashBox: fixture.boxCode, requiredBox: fixture.requiredBoxCode });
  check("gastos_advance_scope_is_empty_for_cash_box", await page.$eval(requiredAdvanceInput, (node) => node.value.includes("Sin anticipo")), { boxId: fixture.boxId });
  const submitDiagnostics = await page.$eval("form", (form) => ({
    checkValidity: form.checkValidity(),
    submitDisabled: Boolean(form.querySelector('button[type="submit"]')?.disabled),
    invalidRequired: Array.from(form.querySelectorAll("input:required")).filter((node) => !node.checkValidity()).map((node) => ({ ariaLabel: node.getAttribute("aria-label"), value: node.value })),
    text: form.innerText.slice(-500)
  }));
  await page.screenshot({ path: path.join(path.dirname(output), "browser-certification-form-before-submit.png"), fullPage: true });
  console.error("[browser-cert] gastos:before-submit", JSON.stringify(submitDiagnostics));
  const submitTarget = await page.$eval("form", (form) => {
    const button = form.querySelector('button[type="submit"]');
    const rect = button?.getBoundingClientRect();
    const pointTarget = rect ? document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2) : null;
    window.__browserCertSubmitTrace = [];
    for (const eventName of ["pointerdown", "click", "submit"]) {
      document.addEventListener(eventName, (event) => window.__browserCertSubmitTrace.push({ event: eventName, target: event.target?.tagName || "", targetType: event.target?.getAttribute?.("type") || "" }), true);
    }
    return {
      formTag: form.tagName,
      buttonFormMatches: button?.form === form,
      buttonType: button?.getAttribute("type"),
      buttonDisabled: Boolean(button?.disabled),
      rect: rect ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height } : null,
      pointTarget: pointTarget ? { tag: pointTarget.tagName, type: pointTarget.getAttribute("type"), ariaLabel: pointTarget.getAttribute("aria-label") } : null
    };
  });
  await page.click('button[type="submit"]');
  console.error("[browser-cert] gastos:submitted");
  await new Promise((resolve) => setTimeout(resolve, 500));
  const afterSubmitText = await page.$eval("form", (form) => form.innerText.slice(-500));
  const submitTrace = await page.evaluate(() => ({ events: window.__browserCertSubmitTrace || [] }));
  await page.screenshot({ path: path.join(path.dirname(output), "browser-certification-form-after-submit.png"), fullPage: true });
  console.error("[browser-cert] gastos:submit-target", JSON.stringify(submitTarget));
  console.error("[browser-cert] gastos:after-submit", JSON.stringify({ text: afterSubmitText, submitTrace }));
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
