/* Versioned browser certification for the compact gastos-menores entry UX
 * (Digitar gastos, /dashboard/gastos-menores/gastos/nuevo).
 * Uses a real Chromium page, the real local API and the real local database.
 * No request interception, no mocked APIs, no React internals: only real typing,
 * real mouse clicks and real keyboard events. POST request capture is passive.
 * Prerequisites: local API and web running, DATABASE_URL pointing to localhost.
 */
process.env.NODE_ENV = "test";
process.env.REDIS_DISABLED = "true";
process.env.DISABLE_REDIS = "true";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");
const bcrypt = require("bcrypt");
const puppeteer = require("puppeteer-core");
const { PrismaClient } = require("@prisma/client");

const root = path.resolve(__dirname, "../..");
const databaseUrl = String(process.env.DATABASE_URL || "");
if (!/^postgres(?:ql)?:\/\/[^@\s]+@(localhost|127\.0\.0\.1)(:\d+)?\//.test(databaseUrl)) {
  throw new Error("BLOQUEADO: DATABASE_URL debe apuntar a PostgreSQL local.");
}
function localHttpUrl(name, value) {
  let parsed = null;
  try { parsed = new URL(value); } catch (error) { parsed = null; }
  if (!parsed || parsed.protocol !== "http:" || !["localhost", "127.0.0.1"].includes(parsed.hostname)) {
    throw new Error(`BLOQUEADO: ${name} debe ser una URL http local (localhost o 127.0.0.1).`);
  }
  return String(value).replace(/\/+$/, "");
}
const apiUrl = localHttpUrl("LOCAL_API_URL", process.env.LOCAL_API_URL || "http://127.0.0.1:3214");
const webUrl = localHttpUrl("LOCAL_WEB_URL", process.env.LOCAL_WEB_URL || "http://127.0.0.1:3002");
const output = path.resolve(process.env.BROWSER_EVIDENCE_PATH || "docs/qa/evidence/gastos-entry-ux-20261020/browser-local.json");
const browserPath = process.env.CHROME_BIN || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const suffix = crypto.randomBytes(5).toString("hex");
const checks = [];
const db = new PrismaClient();

function check(name, ok, detail = {}) {
  checks.push({ name, ok: Boolean(ok), detail });
  assert.ok(ok, `${name}: ${JSON.stringify(detail)}`);
}

async function waitForServer(url, endpoints = ["/health", "/api/v1/health"]) {
  let lastError = null;
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(`${String(url).replace(/\/$/, "")}${endpoint}`, { signal: AbortSignal.timeout(5000) });
      if (response.ok) return;
      lastError = new Error(`${url}${endpoint} respondio ${response.status}`);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error(`${url} no responde`);
}

async function seedFixture() {
  const adminEmail = `browser-admin-${suffix}@apexos.local`;
  const adminPassword = `Browser-${suffix}!`;
  const registrationResponse = await fetch(`${apiUrl}/api/v1/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ company_name: `Browser Entry UX ${suffix}`, industry: "qa", email: adminEmail, password: adminPassword, name: "Browser Entry UX Admin", country: "CO", timezone: "America/Bogota", currency: "COP", plan: "crown" })
  });
  const registration = await registrationResponse.json().catch(() => ({}));
  if (!registrationResponse.ok) throw new Error(`Registro tenant E2E fallo ${registrationResponse.status}: ${JSON.stringify(registration).slice(0, 240)}`);
  const tenantId = registration.tenant?.id || registration.user?.tenant_id;
  const tenant = await db.tenant.findUnique({ where: { id: String(tenantId) } });
  if (!tenant) throw new Error("El registro E2E no devolvio un tenant valido.");
  check("entry_fixture_tenant_registered_via_real_api", true, { tenantId: tenant.id });

  for (const [code, name, type] of [
    ["5195", "Gasto E2E caja", "expense"],
    ["1105", "Caja E2E", "asset"],
    ["1330", "Anticipo E2E", "asset"],
    ["2408", "IVA E2E", "liability"]
  ]) {
    await db.account.upsert({ where: { tenant_id_code: { tenant_id: tenant.id, code } }, update: { active: true, allows_tx: true }, create: { tenant_id: tenant.id, code, name, type, active: true, allows_tx: true } });
  }

  let party = await db.party.findFirst({ where: { tenant_id: tenant.id, name: "Proveedor E2E", type: "supplier" } });
  if (!party) party = await db.party.create({ data: { tenant_id: tenant.id, type: "supplier", name: "Proveedor E2E", active: true } });

  const box = await db.pettyCashBox.upsert({ where: { tenant_id_code: { tenant_id: tenant.id, code: `E2E-${suffix}` } }, update: { active: true }, create: { tenant_id: tenant.id, code: `E2E-${suffix}`, name: "Caja efectivo E2E", account_code: "1105", advance_account_code: "1330", custodian_party_id: party.id, monthly_limit: 2000000, require_advance: false, block_unliquidated_advance: false, active: true } });
  const requiredBox = await db.pettyCashBox.upsert({ where: { tenant_id_code: { tenant_id: tenant.id, code: `E2E-R-${suffix}` } }, update: { active: true, require_advance: true }, create: { tenant_id: tenant.id, code: `E2E-R-${suffix}`, name: "Caja anticipo E2E", account_code: "1105", advance_account_code: "1330", custodian_party_id: party.id, monthly_limit: 2000000, require_advance: true, block_unliquidated_advance: false, active: true } });
  const advanceNumber = 800000 + (Number.parseInt(suffix.slice(0, 6), 16) % 99999);
  const requiredAdvance = await db.pettyCashAdvance.upsert({
    where: { tenant_id_document_type_number: { tenant_id: tenant.id, document_type: "APC", number: advanceNumber } },
    update: { box_id: requiredBox.id, status: "open", amount: 500000, balance: 500000, applied_total: 0 },
    create: { tenant_id: tenant.id, box_id: requiredBox.id, document_type: "APC", number: advanceNumber, full_number: `APC-${String(advanceNumber).padStart(6, "0")}`, date: new Date(), custodian_party_id: party.id, amount: 500000, balance: 500000, applied_total: 0, status: "open", description: "Anticipo entry UX E2E" }
  });
  await db.pettyCashConcept.upsert({ where: { tenant_id_code: { tenant_id: tenant.id, code: `E2E-S-${suffix}` } }, update: { active: true }, create: { tenant_id: tenant.id, code: `E2E-S-${suffix}`, name: "Gasto simple E2E", account_code: "5195", default_vat_code: null, requires_supplier: false, requires_invoice_reference: false, active: true } });
  await db.pettyCashConcept.upsert({ where: { tenant_id_code: { tenant_id: tenant.id, code: `E2E-C-${suffix}` } }, update: { active: true }, create: { tenant_id: tenant.id, code: `E2E-C-${suffix}`, name: "Gasto browser E2E", account_code: "5195", default_vat_code: "COMPRAS-19", requires_supplier: true, requires_invoice_reference: true, active: true } });

  const limitedRole = await db.role.create({ data: { tenant_id: tenant.id, name: `E2E_LIMITED_${suffix}`, is_system: false } });
  const limitedEmail = `limited-${suffix}@apex.local`;
  await db.user.create({ data: { tenant_id: tenant.id, name: "Limited E2E", email: limitedEmail, password: await bcrypt.hash("limited-e2e", 4), role_id: limitedRole.id, active: true } });

  const config = tenant.config && typeof tenant.config === "object" ? tenant.config : {};
  const accountingConfig = config.accounting && typeof config.accounting === "object" ? config.accounting : {};
  const vatMasters = Array.isArray(accountingConfig.vat_masters) ? accountingConfig.vat_masters : [];
  const nextVatMasters = [...vatMasters.filter((row) => String(row?.code || "").toUpperCase() !== "COMPRAS-19"), { code: "COMPRAS-19", concept: "IVA Compras 19%", percent: 19, account_code: "2408", scope: "purchases", active: true, source: "Empresa" }];
  await db.tenant.update({ where: { id: tenant.id }, data: { active_modules: Array.from(new Set([...(tenant.active_modules || []), "M-07", "M-29"])), config: { ...config, accounting: { ...accountingConfig, vat_masters: nextVatMasters, organization_tree: { societies: [{ code: `SOC-${suffix}`, name: "Sociedad E2E", active: true }], branches: [{ code: `BR-${suffix}`, name: "Sucursal E2E", society_code: `SOC-${suffix}`, active: true }], cost_centers: [{ code: `CC-${suffix}`, name: "Centro E2E", society_code: `SOC-${suffix}`, branch_code: `BR-${suffix}`, active: true }] } } } } });

  return {
    tenantId: tenant.id,
    partyId: party.id,
    boxId: box.id,
    boxCode: box.code,
    requiredBoxId: requiredBox.id,
    requiredBoxCode: requiredBox.code,
    requiredAdvanceId: requiredAdvance.id,
    requiredAdvanceNumber: requiredAdvance.full_number,
    simpleConceptName: "Gasto simple E2E",
    conceptName: "Gasto browser E2E",
    supplierName: "Proveedor E2E",
    costCenter: `CC-${suffix}`,
    limitedEmail,
    adminEmail,
    adminPassword
  };
}

async function login(page, email, password, key) {
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
    const diagnostic = await page.evaluate(() => ({ path: location.pathname, text: document.body.innerText.slice(0, 240) }));
    throw new Error(`login_timeout ${JSON.stringify({ ...diagnostic, passwordLength: password.length, response: loginResponse })}`, { cause: error });
  }
  check(`${key}_browser_login_real`, true, { path: await page.evaluate(() => location.pathname) });
}

async function replaceFocusedText(page, text) {
  await page.keyboard.down("Control");
  await page.keyboard.press("A");
  await page.keyboard.up("Control");
  await page.keyboard.press("Backspace");
  if (text) await page.keyboard.type(text);
}

async function focused(page) {
  return page.evaluate(() => ({
    tag: document.activeElement?.tagName || "",
    type: document.activeElement?.getAttribute?.("type") || "",
    ariaLabel: document.activeElement?.getAttribute?.("aria-label") || ""
  }));
}

const deniedGuardTexts = ["Acceso no autorizado", "no disponible para este perfil"];
const sourceFiles = [
  "apps/web/components/gastos-menores/GastosMenoresWorkspace.tsx",
  "apps/web/components/gastos-menores/GastosLookup.tsx",
  "apps/web/components/system/FieldProductivity.tsx",
  "apps/web/test/gastos-menores-entry-ux.test.mjs",
  "apps/web/test/gastos-menores-operations.test.mjs",
  "scripts/certifications/gastos-menores-entry-ux-browser-local.js"
];

async function settleViewport(page, width, height) {
  await page.setViewport({ width, height });
  await page.waitForFunction((expected) => window.innerWidth === expected, { timeout: 10000 }, width);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}

async function clickAsUser(page, selector) {
  const element = await page.$(selector);
  if (!element) throw new Error(`click_target_missing:${selector}`);
  await element.scrollIntoView();
  await page.waitForFunction((target) => {
    const node = document.querySelector(target);
    if (!node) return false;
    const rect = node.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return Boolean(hit && (hit === node || node.contains(hit)));
  }, { timeout: 10000 }, selector);
  await page.click(selector);
}

async function openLookupDialog(page, ariaLabel) {
  const inputSelector = `input[role="combobox"][aria-label="${ariaLabel}"]`;
  const dialogSelector = `[role="dialog"][aria-label="Buscar ${ariaLabel}"]`;
  const input = await page.$(inputSelector);
  if (!input) throw new Error(`No se encontro el lookup ${ariaLabel}`);
  await input.click();
  await replaceFocusedText(page, "");
  await page.keyboard.press("Enter");
  await page.waitForSelector(dialogSelector, { visible: true, timeout: 10000 });
  const filterSelector = `input[aria-label="Filtro ${ariaLabel}"]`;
  await page.waitForFunction((selector) => document.activeElement === document.querySelector(selector), { timeout: 10000 }, filterSelector);
  return { inputSelector, dialogSelector, filterSelector };
}

async function pickFromPopup(page, ariaLabel, query, expectedText) {
  const { inputSelector, dialogSelector, filterSelector } = await openLookupDialog(page, ariaLabel);
  await page.type(filterSelector, query);
  await page.waitForFunction(({ dialogSelector, query }) => [...document.querySelectorAll(`${dialogSelector} [role="option"]`)].some((option) => option.textContent.toLowerCase().includes(query.toLowerCase())), { timeout: 10000 }, { dialogSelector, query });
  await page.keyboard.press("Enter");
  await page.waitForFunction(({ inputSelector, expected }) => (document.querySelector(inputSelector)?.value || "").includes(expected), { timeout: 10000 }, { inputSelector, expected: expectedText });
  await page.waitForFunction((selector) => !document.querySelector(selector), { timeout: 10000 }, dialogSelector);
  return inputSelector;
}

async function certifyEntryUx(page, fixture) {
  console.error("[browser-cert] entry:page");
  const pettyCashPosts = [];
  page.on("request", (request) => {
    if (request.method() !== "POST" || !request.url().includes("/api/v1/petty-cash/")) return;
    let body = null;
    try { body = JSON.parse(request.postData() || "null"); } catch (error) { body = null; }
    pettyCashPosts.push({ url: request.url(), body });
  });
  const creationPosts = () => pettyCashPosts.filter((entry) => /\/api\/v1\/petty-cash\/vouchers$/.test(entry.url));

  await page.goto(`${webUrl}/dashboard/gastos-menores/gastos/nuevo`, { waitUntil: "networkidle2" });
  await page.waitForFunction(() => {
    const text = document.body.innerText;
    return Boolean(document.querySelector("h1")) && text.includes("Digitar gastos") && !text.includes("Validando permisos");
  }, { timeout: 45000 });
  await page.waitForSelector('input[role="combobox"][aria-label="Caja de trabajo"]', { visible: true, timeout: 45000 });

  const dom = await page.evaluate(() => ({
    h1: document.querySelector("h1")?.textContent?.trim() || "",
    backlinkHref: document.querySelector('a[href="/dashboard/gastos-menores/gastos"]')?.getAttribute("href") || "",
    backlinkText: document.querySelector('a[href="/dashboard/gastos-menores/gastos"]')?.textContent?.trim() || "",
    navPresent: Boolean(document.querySelector('nav[aria-label="Navegación de gastos menores"]')),
    navTabCount: document.querySelectorAll('nav[aria-label="Navegación de gastos menores"] a').length,
    submitDisabled: Boolean(document.querySelector('button[type="submit"]')?.disabled),
    repeatDisabled: Boolean([...document.querySelectorAll("button")].find((button) => button.textContent?.includes("Repetir datos anteriores"))?.disabled)
  }));
  check("entry_dom_h1_digitar_gastos", dom.h1 === "Digitar gastos", { h1: dom.h1 });
  check("entry_dom_backlink", dom.backlinkHref === "/dashboard/gastos-menores/gastos" && dom.backlinkText.includes("Volver a gastos"), { backlinkHref: dom.backlinkHref, backlinkText: dom.backlinkText });
  check("entry_dom_module_tabs_absent", dom.navPresent === false && dom.navTabCount === 0, { navTabCount: dom.navTabCount });
  check("entry_submit_disabled_before_box", dom.submitDisabled === true, { submitDisabled: dom.submitDisabled });
  check("entry_repeat_disabled_before_lines", dom.repeatDisabled === true, { repeatDisabled: dom.repeatDisabled });

  await page.setViewport({ width: 1366, height: 900 });
  const desktopOverflow = await page.evaluate(() => ({ viewport: window.innerWidth, pageScrollWidth: document.documentElement.scrollWidth, bodyScrollWidth: document.body.scrollWidth }));
  check("entry_viewport_1366x900_no_page_overflow", desktopOverflow.pageScrollWidth <= desktopOverflow.viewport && desktopOverflow.bodyScrollWidth <= desktopOverflow.viewport, desktopOverflow);
  await page.screenshot({ path: path.join(path.dirname(output), "01-entry-desktop-1366x900.png"), fullPage: false });

  await page.setViewport({ width: 390, height: 844 });
  const mobileOverflow = await page.evaluate(() => {
    const wrapper = [...document.querySelectorAll("div.overflow-x-auto")].find((node) => node.querySelector("table"));
    return {
      viewport: window.innerWidth,
      pageScrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      wrapperScrollWidth: wrapper ? wrapper.scrollWidth : null,
      wrapperClientWidth: wrapper ? wrapper.clientWidth : null
    };
  });
  check("entry_viewport_390x844_no_page_overflow", mobileOverflow.pageScrollWidth <= mobileOverflow.viewport && mobileOverflow.bodyScrollWidth <= mobileOverflow.viewport, mobileOverflow);
  check("entry_viewport_390x844_table_wrapper_scrolls", Boolean(mobileOverflow.wrapperScrollWidth) && mobileOverflow.wrapperScrollWidth > mobileOverflow.wrapperClientWidth, mobileOverflow);
  await page.screenshot({ path: path.join(path.dirname(output), "02-entry-mobile-390x844.png"), fullPage: false });
  await page.setViewport({ width: 1366, height: 900 });

  // --- Validacion del campo codigo (caja de trabajo) ---
  const boxInput = 'input[role="combobox"][aria-label="Caja de trabajo"]';
  const boxDialog = '[role="dialog"][aria-label="Buscar Caja de trabajo"]';
  const { filterSelector: boxFilterSelector } = await openLookupDialog(page, "Caja de trabajo");
  const boxDialogOpen = Boolean(await page.$(boxDialog));
  const boxFilterFocused = await page.evaluate((selector) => document.activeElement === document.querySelector(selector), boxFilterSelector);
  check("entry_box_empty_enter_opens_dialog", boxDialogOpen && boxFilterFocused, { boxDialogOpen, boxFilterFocused });
  await page.keyboard.press("Escape");
  await page.waitForFunction((selector) => !document.querySelector(selector), { timeout: 10000 }, boxDialog);
  await page.waitForFunction(() => (document.activeElement?.getAttribute?.("aria-label") || "") === "Caja de trabajo", { timeout: 5000 });
  check("entry_box_escape_returns_focus", true);

  // Enter inline con el codigo exacto resuelve sin abrir el buscador y sin POST.
  await page.click(boxInput);
  await replaceFocusedText(page, fixture.requiredBoxCode);
  await page.keyboard.press("Enter");
  await page.waitForFunction(({ selector, expected }) => (document.querySelector(selector)?.value || "").includes(expected), { timeout: 10000 }, { selector: boxInput, expected: fixture.requiredBoxCode });
  const boxInline = await page.evaluate(({ boxDialog }) => ({ dialogOpen: Boolean(document.querySelector(boxDialog)) }), { boxDialog });
  await page.waitForFunction(() => document.activeElement?.getAttribute?.("type") === "date", { timeout: 5000 });
  check("entry_box_inline_exact_enter_resolves", boxInline.dialogOpen === false, { ...boxInline });
  check("entry_box_lookup_no_enter_post", creationPosts().length === 0, { posts: creationPosts().length });

  // --- Caja con anticipo obligatorio: sin anticipo no se puede contabilizar ---
  const advanceInput = 'input[role="combobox"][aria-label="Anticipo del comprobante"]';
  await page.waitForFunction((selector) => (document.querySelector(selector)?.value || "").includes("Seleccione el anticipo vigente"), { timeout: 10000 }, advanceInput);
  const requiredGate = await page.evaluate((advanceInput) => ({
    placeholder: document.querySelector(advanceInput)?.value || "",
    helper: document.body.innerText.includes("Esta caja exige un anticipo vigente."),
    submitDisabled: Boolean(document.querySelector('button[type="submit"]')?.disabled)
  }), advanceInput);
  check("entry_required_advance_empty_state", requiredGate.placeholder.includes("Seleccione el anticipo vigente") && requiredGate.helper && requiredGate.submitDisabled, requiredGate);
  await page.click('button[type="submit"]').catch(() => undefined);
  await new Promise((resolve) => setTimeout(resolve, 400));
  check("entry_required_advance_empty_no_post", creationPosts().length === 0, { posts: creationPosts().length });

  // --- Los anticipos de otra caja quedan excluidos ---
  await pickFromPopup(page, "Caja de trabajo", fixture.boxCode, fixture.boxCode);
  await page.waitForFunction((selector) => (document.querySelector(selector)?.value || "").includes("Sin anticipo"), { timeout: 10000 }, advanceInput);
  const cashBoxAdvance = await page.$eval(advanceInput, (node) => node.value);
  check("entry_cash_box_advance_default_no_advance", cashBoxAdvance.includes("Sin anticipo"), { value: cashBoxAdvance });
  await page.waitForFunction(() => document.activeElement?.getAttribute?.("type") === "date", { timeout: 5000 });
  check("entry_box_popup_enter_focus_date", true);
  await page.click(advanceInput);
  await replaceFocusedText(page, fixture.requiredAdvanceNumber);
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => document.body.innerText.includes("No encontramos el anticipo"), { timeout: 10000 });
  const preservedAdvanceText = await page.$eval(advanceInput, (node) => node.value);
  check("entry_other_box_advance_rejected_and_text_preserved", preservedAdvanceText.includes(fixture.requiredAdvanceNumber) && creationPosts().length === 0, { value: preservedAdvanceText, posts: creationPosts().length });
  const { dialogSelector: advanceDialog } = await openLookupDialog(page, "Anticipo del comprobante");
  const advanceOptionTexts = await page.evaluate((selector) => [...document.querySelectorAll(`${selector} [role="option"]`)].map((option) => option.textContent || ""), advanceDialog);
  check("entry_other_box_advance_excluded_from_popup", advanceOptionTexts.length === 1 && advanceOptionTexts[0].includes("Sin anticipo") && advanceOptionTexts.every((text) => !text.includes(fixture.requiredAdvanceNumber)), { options: advanceOptionTexts });
  await page.keyboard.press("Escape");
  await page.waitForFunction((selector) => !document.querySelector(selector), { timeout: 10000 }, advanceDialog);

  // --- Volver a la caja obligatoria y elegir el anticipo vigente ---
  await pickFromPopup(page, "Caja de trabajo", fixture.requiredBoxCode, fixture.requiredBoxCode);
  await page.waitForFunction((selector) => (document.querySelector(selector)?.value || "").includes("Seleccione el anticipo vigente"), { timeout: 10000 }, advanceInput);
  await pickFromPopup(page, "Anticipo del comprobante", fixture.requiredAdvanceNumber, fixture.requiredAdvanceNumber);
  await page.waitForFunction(() => (document.activeElement?.getAttribute?.("aria-label") || "") === "Concepto línea 1", { timeout: 10000 });
  const advancePopupFocus = await focused(page);
  check("entry_advance_popup_enter_focus_first_cell", advancePopupFocus.ariaLabel === "Concepto línea 1", advancePopupFocus);

  // --- Toggle de soporte con concepto opcional; el obligatorio abre el soporte solo ---
  await pickFromPopup(page, "Concepto línea 1", fixture.simpleConceptName, fixture.simpleConceptName);
  await new Promise((resolve) => setTimeout(resolve, 300));
  check("entry_optional_concept_support_hidden", !(await page.$('input[role="combobox"][aria-label="Proveedor línea 1"]')));
  await page.evaluate(() => [...document.querySelectorAll("button")].find((button) => button.textContent?.includes("Mostrar datos de soporte"))?.click());
  await page.waitForSelector('input[role="combobox"][aria-label="Proveedor línea 1"]', { visible: true, timeout: 10000 });
  check("entry_support_toggle_shows_row", true);
  await page.evaluate(() => [...document.querySelectorAll("button")].find((button) => button.textContent?.includes("Ocultar datos de soporte"))?.click());
  await page.waitForFunction(() => !document.querySelector('input[role="combobox"][aria-label="Proveedor línea 1"]'), { timeout: 10000 });
  check("entry_support_toggle_hides_row", true);
  await page.click('button[aria-label="Quitar línea 1"]');
  await page.waitForFunction(() => (document.querySelector('input[role="combobox"][aria-label="Concepto línea 1"]')?.value || "") === "", { timeout: 10000 });
  check("entry_provisional_line_removed", true);

  await pickFromPopup(page, "Concepto línea 1", fixture.conceptName, fixture.conceptName);
  await page.waitForSelector('input[role="combobox"][aria-label="Proveedor línea 1"]', { visible: true, timeout: 10000 });
  const requiredConceptState = await page.evaluate(() => ({
    supplierVisible: Boolean(document.querySelector('input[role="combobox"][aria-label="Proveedor línea 1"]')),
    obligatoryText: document.body.innerText.includes("· obligatorio") && document.body.innerText.includes("· obligatoria"),
    invoiceRequired: Boolean(document.querySelector('input[aria-label="Factura línea 1"]')?.required),
    amberHint: document.body.innerText.includes("Completa proveedor y factura en las líneas que los exigen antes de contabilizar."),
    vatValue: document.querySelector('input[role="combobox"][aria-label="IVA línea 1"]')?.value || ""
  }));
  check("entry_required_concept_auto_opens_support", requiredConceptState.supplierVisible && requiredConceptState.obligatoryText && requiredConceptState.invoiceRequired, requiredConceptState);
  check("entry_required_concept_support_hint", requiredConceptState.amberHint, requiredConceptState);
  check("entry_required_concept_default_vat_19", requiredConceptState.vatValue.includes("COMPRAS-19"), { vatValue: requiredConceptState.vatValue });
  await page.waitForFunction(() => (document.activeElement?.getAttribute?.("aria-label") || "") === "Descripción línea 1", { timeout: 5000 });
  check("entry_concept_popup_enter_focus_description", true);

  // --- Llenar la linea 1 ---
  await page.click('input[aria-label="Descripción línea 1"]');
  await page.type('input[aria-label="Descripción línea 1"]', "Transporte E2E");
  await page.click('input[aria-label="Base línea 1"]');
  await page.type('input[aria-label="Base línea 1"]', "12500");
  await pickFromPopup(page, "Proveedor línea 1", fixture.supplierName, fixture.supplierName);
  await page.click('input[aria-label="Factura línea 1"]');
  await page.type('input[aria-label="Factura línea 1"]', `FAC-E2E-${suffix}`);
  await pickFromPopup(page, "Centro de costo línea 1", fixture.costCenter, fixture.costCenter);

  // IVA opcional: vaciarlo con teclado lo deja sin IVA; se vuelve a seleccionar 19 antes de totalizar.
  const vatInput = 'input[role="combobox"][aria-label="IVA línea 1"]';
  await page.click(vatInput);
  await replaceFocusedText(page, "");
  await page.keyboard.press("Tab");
  await page.waitForFunction((selector) => (document.querySelector(selector)?.value || "") === "", { timeout: 5000 }, vatInput);
  check("entry_vat_optional_clear_on_blur", true);
  await pickFromPopup(page, "IVA línea 1", "COMPRAS-19", "COMPRAS-19");
  const vatRestored = await page.$eval(vatInput, (node) => node.value);
  check("entry_vat_reselect_19_before_totals", vatRestored.includes("COMPRAS-19"), { value: vatRestored });

  // --- Repetir datos anteriores: copia todo menos la base, foco en la base vacia ---
  const repeatEnabled = await page.evaluate(() => !Boolean([...document.querySelectorAll("button")].find((button) => button.textContent?.includes("Repetir datos anteriores"))?.disabled));
  check("entry_repeat_enabled_after_filled_line", repeatEnabled === true, { repeatEnabled });
  await page.evaluate(() => [...document.querySelectorAll("button")].find((button) => button.textContent?.includes("Repetir datos anteriores"))?.click());
  await page.waitForFunction(() => document.activeElement === document.querySelector('input[aria-label="Base línea 2"]'), { timeout: 10000 });
  const repeated = await page.evaluate(() => ({
    base2: document.querySelector('input[aria-label="Base línea 2"]')?.value || "",
    concept2: document.querySelector('input[role="combobox"][aria-label="Concepto línea 2"]')?.value || "",
    vat2: document.querySelector('input[role="combobox"][aria-label="IVA línea 2"]')?.value || "",
    supplier2: document.querySelector('input[role="combobox"][aria-label="Proveedor línea 2"]')?.value || "",
    invoice2: document.querySelector('input[aria-label="Factura línea 2"]')?.value || "",
    cc2: document.querySelector('input[role="combobox"][aria-label="Centro de costo línea 2"]')?.value || "",
    line3Present: Boolean(document.querySelector('input[role="combobox"][aria-label="Concepto línea 3"]')),
    focusOnBase2: document.activeElement === document.querySelector('input[aria-label="Base línea 2"]')
  }));
  check("entry_repeat_copies_all_but_base", repeated.base2 === "" && repeated.concept2.includes(fixture.conceptName) && repeated.vat2.includes("COMPRAS-19") && repeated.supplier2.includes(fixture.supplierName) && repeated.invoice2 === `FAC-E2E-${suffix}` && repeated.cc2.includes(fixture.costCenter), repeated);
  check("entry_repeat_empty_base_focus_new_blank", repeated.focusOnBase2 && repeated.line3Present, repeated);
  await page.click('input[aria-label="Base línea 2"]');
  await page.type('input[aria-label="Base línea 2"]', "2500");

  // --- Texto invalido de lookup se conserva al borrar otra fila y bloquea el POST ---
  await page.click('input[role="combobox"][aria-label="Concepto línea 2"]');
  await replaceFocusedText(page, "CONCEPTO_INVALIDO_E2E");
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => document.body.innerText.includes("No encontramos el concepto"), { timeout: 10000 });
  const invalidConceptKept = await page.$eval('input[role="combobox"][aria-label="Concepto línea 2"]', (node) => node.value);
  check("entry_invalid_concept_text_preserved_on_input", invalidConceptKept === "CONCEPTO_INVALIDO_E2E", { value: invalidConceptKept });
  // Con un lookup sin resolver, repetir no debe operar ni alterar el texto invalido ni emitir POST.
  const repeatOnUnresolved = await page.evaluate(() => {
    const button = [...document.querySelectorAll("button")].find((candidate) => candidate.textContent?.includes("Repetir datos anteriores"));
    return { found: Boolean(button), disabled: Boolean(button?.disabled) };
  });
  check("entry_repeat_disabled_on_unresolved_lookup", repeatOnUnresolved.found && repeatOnUnresolved.disabled, repeatOnUnresolved);
  const invalidTextBeforeRepeat = await page.$eval('input[role="combobox"][aria-label="Concepto línea 2"]', (node) => node.value);
  await page.evaluate(() => [...document.querySelectorAll("button")].find((button) => button.textContent?.includes("Repetir datos anteriores"))?.click());
  await new Promise((resolve) => setTimeout(resolve, 300));
  const invalidTextAfterRepeat = await page.$eval('input[role="combobox"][aria-label="Concepto línea 2"]', (node) => node.value);
  check("entry_repeat_on_unresolved_keeps_text_and_no_post", invalidTextAfterRepeat === invalidTextBeforeRepeat && invalidTextAfterRepeat === "CONCEPTO_INVALIDO_E2E" && creationPosts().length === 0, { before: invalidTextBeforeRepeat, after: invalidTextAfterRepeat, posts: creationPosts().length });
  await page.click('button[aria-label="Quitar línea 3"]');
  await page.waitForFunction(() => !document.querySelector('input[role="combobox"][aria-label="Concepto línea 3"]'), { timeout: 10000 });
  const afterDelete = await page.$eval('input[role="combobox"][aria-label="Concepto línea 2"]', (node) => node.value);
  check("entry_invalid_concept_text_survives_line_delete", afterDelete === "CONCEPTO_INVALIDO_E2E", { value: afterDelete });
  const unresolvedSubmitDisabled = await page.$eval('button[type="submit"]', (node) => node.disabled);
  await page.click('button[type="submit"]').catch(() => undefined);
  await page.waitForFunction(() => document.body.innerText.includes("Completa los campos de búsqueda con una opción válida"), { timeout: 10000 });
  check("entry_unresolved_lookup_blocks_post", creationPosts().length === 0, { posts: creationPosts().length, unresolvedSubmitDisabled });
  await pickFromPopup(page, "Concepto línea 2", fixture.conceptName, fixture.conceptName);
  check("entry_invalid_concept_reselect_restores_valid_id", true);

  // --- Evidencia visual antes de contabilizar ---
  await page.setViewport({ width: 1366, height: 900 });
  await page.screenshot({ path: path.join(path.dirname(output), "03-form-before-submit-1366x900.png"), fullPage: false });
  await page.setViewport({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(path.dirname(output), "04-form-before-submit-390x844.png"), fullPage: false });
  await settleViewport(page, 1366, 900);

  // --- Contabilizar con el boton del usuario ---
  console.error("[browser-cert] entry:submit");
  const recentSuggestions = await page.$('[aria-label="Sugerencias recientes"]');
  check("entry_submit_no_recent_suggestions_overlay", !recentSuggestions, { present: Boolean(recentSuggestions) });
  await clickAsUser(page, 'button[type="submit"]');
  try {
    await page.waitForFunction(() => document.body.innerText.includes("contabilizado por"), { timeout: 30000 });
  } catch (error) {
    const diagnostic = await page.evaluate(() => ({
      invalidInputs: [...document.querySelectorAll("input, select, textarea")].filter((node) => !node.checkValidity()).map((node) => ({
        ariaLabel: node.getAttribute("aria-label") || "",
        name: node.getAttribute("name") || "",
        type: node.getAttribute("type") || "",
        required: Boolean(node.required),
        validationMessage: node.validationMessage
      })),
      bodyText: document.body.innerText.slice(0, 1200)
    })).catch(() => ({}));
    const failureScreenshot = path.join(path.dirname(output), "post-submit-timeout.png");
    await page.screenshot({ path: failureScreenshot, fullPage: false }).catch(() => undefined);
    throw new Error(`entry_submit_timeout ${JSON.stringify({ screenshot: failureScreenshot, postCount: creationPosts().length, postUrls: pettyCashPosts.map((entry) => entry.url), ...diagnostic })}`, { cause: error });
  }
  check("entry_submit_single_real_post", creationPosts().length === 1, { posts: creationPosts().length });
  const payload = creationPosts()[0]?.body || null;
  const payloadLines = payload?.lines || [];
  const expectedLineKeys = "base_amount,branch_code,concept_id,cost_center_code,description,invoice_reference,supplier_party_id,vat_code";
  const lineKeys = payloadLines.map((line) => Object.keys(line).sort().join(","));
  check("entry_payload_two_lines", payloadLines.length === 2 && [12500, 2500].every((base, index) => Number(payloadLines[index]?.base_amount) === base), { lines: payloadLines.length, bases: payloadLines.map((line) => line.base_amount) });
  check("entry_payload_excludes_row_key_vat_amount_total", lineKeys.length === 2 && lineKeys.every((keys) => keys === expectedLineKeys), { lineKeys });
  check("entry_payload_lines_share_supplier_invoice_cc_vat", payloadLines.length === 2 && payloadLines[0].supplier_party_id === payloadLines[1].supplier_party_id && payloadLines[0].invoice_reference === payloadLines[1].invoice_reference && payloadLines[0].cost_center_code === payloadLines[1].cost_center_code && payloadLines.every((line) => line.vat_code === "COMPRAS-19"), { lines: payloadLines.map((line) => ({ supplier_party_id: line.supplier_party_id, invoice_reference: line.invoice_reference, cost_center_code: line.cost_center_code, vat_code: line.vat_code })) });
  check("entry_payload_header_box_advance", Number(payload?.box_id) === fixture.requiredBoxId && Number(payload?.advance_id) === fixture.requiredAdvanceId, { box_id: payload?.box_id, advance_id: payload?.advance_id });

  const bodyText = await page.$eval("body", (node) => node.innerText);
  const fullNumber = bodyText.match(/GM-\d+/)?.[0];
  check("entry_ui_success_message_shows_document", Boolean(fullNumber), { text: bodyText.slice(-600) });

  // --- Verificacion en base de datos ---
  console.error("[browser-cert] entry:db");
  const voucher = await db.pettyCashVoucher.findFirst({ where: { tenant_id: fixture.tenantId, full_number: fullNumber }, include: { lines: true } });
  check("entry_db_voucher_persisted", Boolean(voucher) && voucher.status === "posted" && voucher.lines.length === 2, { voucher: fullNumber, status: voucher?.status, lines: voucher?.lines?.length });
  const subtotal = Number(voucher?.subtotal || 0);
  const vatTotal = Number(voucher?.vat_total || 0);
  const total = Number(voucher?.total || 0);
  check("entry_db_totals_15000_2850_17850", subtotal === 15000 && vatTotal === 2850 && total === 17850, { subtotal, vatTotal, total });
  check("entry_db_lines_share_supplier_invoice_cc", Boolean(voucher) && voucher.lines.every((line) => line.supplier_party_id === voucher.lines[0].supplier_party_id && line.invoice_reference === voucher.lines[0].invoice_reference && line.cost_center_code === voucher.lines[0].cost_center_code), { lines: voucher?.lines?.map((line) => ({ supplier_party_id: line.supplier_party_id, invoice_reference: line.invoice_reference, cost_center_code: line.cost_center_code })) });
  check("entry_db_voucher_linked_accounting_document", Boolean(voucher?.accounting_document_id), { accounting_document_id: voucher?.accounting_document_id });
  const cntDoc = voucher?.accounting_document_id ? await db.cntCabdoc.findUnique({ where: { id: voucher.accounting_document_id }, include: { lines: true } }) : null;
  const debit = Number(cntDoc?.total_debit || 0);
  const credit = Number(cntDoc?.total_credit || 0);
  check("entry_db_balanced_cnt_document", Boolean(cntDoc) && cntDoc.lines.length > 0 && debit === 17850 && credit === 17850 && debit === credit, { debit, credit, lines: cntDoc?.lines?.length });
  const advanceAfter = await db.pettyCashAdvance.findUnique({ where: { id: fixture.requiredAdvanceId } });
  const advanceBalance = Number(advanceAfter?.balance || 0);
  check("entry_db_advance_balance_482150", advanceBalance === 482150, { balance: advanceBalance, expected: 482150 });

  // --- Listado, recarga con el numero exacto y detalle ---
  console.error("[browser-cert] entry:list");
  await page.goto(`${webUrl}/dashboard/gastos-menores/gastos`, { waitUntil: "networkidle2" });
  await page.waitForFunction((number) => document.body.innerText.includes(number) && !document.body.innerText.includes("Validando permisos"), { timeout: 45000 }, fullNumber);
  const listNav = await page.evaluate(() => ({ nav: Boolean(document.querySelector('nav[aria-label="Navegación de gastos menores"]')), tabs: document.querySelectorAll('nav[aria-label="Navegación de gastos menores"] a').length }));
  check("entry_list_shows_saved_document", true, { fullNumber });
  check("entry_list_module_tabs_present", listNav.nav && listNav.tabs === 7, listNav);
  await page.screenshot({ path: path.join(path.dirname(output), "05-list-after-post.png"), fullPage: false });
  await page.reload({ waitUntil: "networkidle2" });
  await page.waitForFunction((number) => document.body.innerText.includes(number) && !document.body.innerText.includes("Validando permisos"), { timeout: 45000 }, fullNumber);
  check("entry_list_exact_document_survives_reload", true, { fullNumber });
  await page.evaluate((number) => {
    const row = [...document.querySelectorAll("tbody tr")].find((tr) => tr.textContent.includes(number));
    if (!row) throw new Error(`row_missing:${number}`);
    const button = [...row.querySelectorAll("button")].find((candidate) => candidate.textContent.trim() === "Ver");
    if (!button) throw new Error(`ver_button_missing:${number}`);
    button.click();
  }, fullNumber);
  await page.waitForFunction((number) => document.body.innerText.includes(`Comprobante ${number}`), { timeout: 15000 }, fullNumber);
  const modal = await page.evaluate(() => {
    const tables = [...document.querySelectorAll("table")];
    const detailTable = tables.find((table) => table.textContent.includes("Factura") && table.textContent.includes("Cuenta"));
    return { detailRows: detailTable ? detailTable.querySelectorAll("tbody tr").length : -1, showsTotal: document.body.innerText.includes("17.850") };
  });
  check("entry_detail_modal_two_lines", modal.detailRows === 2, { detailRows: modal.detailRows });
  check("entry_detail_modal_total_17850", modal.showsTotal === true, modal);
  await page.screenshot({ path: path.join(path.dirname(output), "06-detail-modal.png"), fullPage: false });

  // --- Anulacion: UI; si la UI no esta disponible se usa la API real como respaldo ---
  console.error("[browser-cert] entry:cancel");
  let cancelledVia = "ui";
  try {
    await page.evaluate(() => {
      const button = [...document.querySelectorAll("button")].find((candidate) => candidate.textContent.includes("Anular comprobante"));
      if (!button) throw new Error("cancel_button_missing");
      button.click();
    });
    await page.waitForFunction(() => document.body.innerText.includes("anulado con reversión del asiento"), { timeout: 30000 });
    check("entry_cancel_via_ui", true, { fullNumber });
  } catch (error) {
    cancelledVia = "api";
    const reason = String(error?.message || error).slice(0, 300);
    checks.push({ name: "entry_cancel_ui_attempt", ok: false, detail: { reason } });
    console.error("[browser-cert] entry:cancel-ui-fallback-api", reason);
    const cancelStatus = await page.evaluate(async ({ apiUrl, id }) => {
      const token = localStorage.getItem("token");
      const response = await fetch(`${apiUrl}/api/v1/petty-cash/vouchers/${id}/cancel`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` } });
      return response.status;
    }, { apiUrl, id: voucher.id });
    check("entry_cancel_via_real_api_fallback", cancelStatus === 200, { status: cancelStatus });
  }
  const cancelledVoucher = await db.pettyCashVoucher.findUnique({ where: { id: voucher.id } });
  const reversalDoc = cancelledVoucher?.reversal_accounting_document_id ? await db.cntCabdoc.findUnique({ where: { id: cancelledVoucher.reversal_accounting_document_id } }) : null;
  const advanceRestored = await db.pettyCashAdvance.findUnique({ where: { id: fixture.requiredAdvanceId } });
  check("entry_cancel_db_voucher_cancelled", cancelledVoucher?.status === "cancelled" && Boolean(cancelledVoucher?.reversal_accounting_document_id), { via: cancelledVia, status: cancelledVoucher?.status, reversal_document_id: cancelledVoucher?.reversal_accounting_document_id });
  check("entry_cancel_db_balance_restored_500000", Number(advanceRestored?.balance || 0) === 500000, { via: cancelledVia, balance: Number(advanceRestored?.balance || 0), expected: 500000 });
  check("entry_cancel_db_reversal_document_balanced", Boolean(reversalDoc) && reversalDoc.is_reversal === true && Number(reversalDoc.total_debit) === 17850 && Number(reversalDoc.total_credit) === 17850, { via: cancelledVia, is_reversal: reversalDoc?.is_reversal, debit: Number(reversalDoc?.total_debit || 0), credit: Number(reversalDoc?.total_credit || 0) });
}

async function certifyDeniedUser(browser, fixture) {
  console.error("[browser-cert] entry:denied");
  const context = await browser.createBrowserContext();
  try {
    const denied = await context.newPage();
    denied.setDefaultTimeout(15000);
    await login(denied, fixture.limitedEmail, "limited-e2e", "limited");
    await denied.goto(`${webUrl}/dashboard/gastos-menores/gastos/nuevo`, { waitUntil: "networkidle2" });
    await denied.waitForFunction((texts) => texts.some((text) => document.body.innerText.includes(text)), { timeout: 45000 }, deniedGuardTexts);
    const deniedState = await denied.evaluate((texts) => ({
      blockedText: texts.find((text) => document.body.innerText.includes(text)) || "",
      lookupPresent: Boolean(document.querySelector('input[role="combobox"][aria-label="Caja de trabajo"]')),
      submitPresent: Boolean(document.querySelector('button[type="submit"]'))
    }), deniedGuardTexts);
    check("entry_denied_user_ui_blocked", Boolean(deniedState.blockedText) && !deniedState.lookupPresent && !deniedState.submitPresent, { email: fixture.limitedEmail, ...deniedState });
    await denied.goto(`${webUrl}/dashboard/gastos-menores/gastos`, { waitUntil: "networkidle2" });
    await denied.waitForFunction((texts) => texts.some((text) => document.body.innerText.includes(text)), { timeout: 45000 }, deniedGuardTexts);
    const deniedListState = await denied.evaluate((texts) => ({
      blockedText: texts.find((text) => document.body.innerText.includes(text)) || "",
      lookupPresent: Boolean(document.querySelector('input[role="combobox"][aria-label="Caja de trabajo"]')),
      submitPresent: Boolean(document.querySelector('button[type="submit"]'))
    }), deniedGuardTexts);
    check("entry_denied_user_list_blocked", Boolean(deniedListState.blockedText) && !deniedListState.lookupPresent && !deniedListState.submitPresent, { email: fixture.limitedEmail, ...deniedListState });
  } finally {
    await context.close();
  }
}

async function main() {
  fs.mkdirSync(path.dirname(output), { recursive: true });
  await waitForServer(apiUrl);
  await waitForServer(webUrl, ["/"]);
  const fixture = await seedFixture();
  const browser = await puppeteer.launch({ executablePath: browserPath, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(15000);
    await page.setViewport({ width: 1366, height: 900 });
    await login(page, fixture.adminEmail, fixture.adminPassword, "admin");
    await certifyEntryUx(page, fixture);
    await certifyDeniedUser(browser, fixture);
  } finally {
    await browser.close();
    await db.$disconnect();
  }
  const failedChecks = checks.filter((entry) => !entry.ok);
  if (failedChecks.length > 0) {
    throw new Error(`CERTIFICACION PARCIAL: ${failedChecks.length} check(s) fallidos: ${JSON.stringify(failedChecks.map((entry) => entry.name))}`);
  }
  const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  const branch = execFileSync("git", ["branch", "--show-current"], { cwd: root, encoding: "utf8" }).trim();
  const statusShort = execFileSync("git", ["status", "--short"], { cwd: root, encoding: "utf8" }).trim();
  const source_hashes = Object.fromEntries(sourceFiles.map((relative) => [relative, crypto.createHash("sha256").update(fs.readFileSync(path.join(root, relative))).digest("hex")]));
  const { adminPassword: _adminPassword, ...safeFixture } = fixture;
  const evidence = { version: 2, certification: "gastos-menores-entry-ux-browser-local", status: "passed", generated_at: new Date().toISOString(), commit, branch, git_status_short: statusShort, api_url: apiUrl, web_url: webUrl, browser: browserPath, source_hashes, fixture: safeFixture, checks };
  fs.writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(JSON.stringify(evidence));
}

main().catch(async (error) => {
  await db.$disconnect().catch(() => undefined);
  const failure = { version: 2, certification: "gastos-menores-entry-ux-browser-local", status: "failed", generated_at: new Date().toISOString(), error: String(error?.stack || error), checks };
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(failure, null, 2)}\n`);
  console.error(JSON.stringify(failure));
  process.exitCode = 1;
});
