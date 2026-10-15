/* Versioned local certification for Payroll/Accounting master integration.
 * Real Chromium + local API + local PostgreSQL. No request interception,
 * mocks, migrations, resets, remote writes, or cleanup deletes.
 * Prerequisites: API on 127.0.0.1:3214 and web on 127.0.0.1:3002.
 */
process.env.NODE_ENV = "test";
process.env.REDIS_DISABLED = "true";
process.env.DISABLE_REDIS = "true";
process.env.DATABASE_URL ||= "postgresql://apexuser@127.0.0.1:55439/apex_test";

const assert = require("node:assert/strict");
const path = require("node:path");
const crypto = require("node:crypto");
const fs = require("node:fs");
const bcrypt = require("bcrypt");
const puppeteer = require("puppeteer-core");
const { PrismaClient } = require("@prisma/client");

const apiUrl = process.env.LOCAL_API_URL || "http://127.0.0.1:3214";
const webUrl = process.env.LOCAL_WEB_URL || "http://127.0.0.1:3002";
const browserPath = process.env.CHROME_BIN || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const output = path.resolve(process.env.BROWSER_EVIDENCE_PATH || "docs/qa/evidence/payroll-accounting-masters-browser-local.json");
const suffix = crypto.randomBytes(5).toString("hex");
const db = new PrismaClient();
const checks = [];
const screenshots = [];

function jsonSafe(value, space = 0) {
  return JSON.stringify(value, (_key, item) => typeof item === "bigint" ? item.toString() : item, space);
}

function assertLocalUrl(value, name) {
  const parsed = new URL(value);
  if (!/^https?:$/.test(parsed.protocol) || !["127.0.0.1", "localhost"].includes(parsed.hostname)) throw new Error(`${name} debe apuntar a localhost/127.0.0.1`);
}
assertLocalUrl(apiUrl, "LOCAL_API_URL");
assertLocalUrl(webUrl, "LOCAL_WEB_URL");

function check(name, ok, detail = {}) {
  checks.push({ name, ok: Boolean(ok), detail });
  assert.ok(ok, `${name}: ${jsonSafe(detail)}`);
}

async function waitForServer(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error(`${url} respondió ${response.status}`);
}

async function assertApiCommitMarker() {
  const expected = require("node:child_process").execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const response = await fetch(`${apiUrl}/health`, { signal: AbortSignal.timeout(10000) });
  const body = await response.json().catch(() => ({}));
  check("api_health_ok_and_commit_marker", response.status === 200 && body.status === "OK" && String(body.commit || "").startsWith(expected.slice(0, 12)), { status: response.status, health_commit: body.commit, expected_prefix: expected.slice(0, 12) });
}

async function register(email, password, name) {
  const response = await fetch(`${apiUrl}/api/v1/auth/register`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ company_name: `Payroll E2E ${suffix} ${name}`, industry: "qa", email, password, name, country: "CO", timezone: "America/Bogota", currency: "COP", plan: "crown" })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`register ${response.status}: ${JSON.stringify(body).slice(0, 400)}`);
  return { ...body, tenantId: body.tenant?.id || body.user?.tenant_id };
}

async function loginToken(email, password) {
  const response = await fetch(`${apiUrl}/api/v1/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`login ${response.status}: ${JSON.stringify(body).slice(0, 400)}`);
  return body.token || body.access_token || body.session?.access_token;
}

async function apiJson(token, route, options = {}) {
  const response = await fetch(`${apiUrl}${route}`, {
    ...options,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(options.headers || {}) },
    body: options.body && typeof options.body !== "string" ? JSON.stringify(options.body) : options.body
  });
  const body = await response.json().catch(() => ({}));
  return { status: response.status, body };
}

async function seedTenant(adminEmail, adminPassword, label) {
  const registration = await register(adminEmail, adminPassword, label);
  const tenantId = String(registration.tenantId);
  const tenant = await db.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) throw new Error(`tenant not found ${tenantId}`);
  const labelKey = String(label).replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  const tree = {
    societies: [{ code: `SOC-${labelKey}-${suffix}`, name: `Sociedad Nómina E2E ${label}`, active: true }],
    branches: [{ code: `BR-${labelKey}-${suffix}`, name: `Sucursal Nómina E2E ${label}`, society_code: `SOC-${labelKey}-${suffix}`, active: true }, { code: `BRX-${labelKey}-${suffix}`, name: `Sucursal Incorrecta E2E ${label}`, society_code: `SOC-${labelKey}-${suffix}`, active: true }],
    cost_centers: [{ code: `CC-${labelKey}-${suffix}`, name: `Centro Nómina E2E ${label}`, society_code: `SOC-${labelKey}-${suffix}`, branch_code: `BR-${labelKey}-${suffix}`, active: true }, { code: `CCX-${labelKey}-${suffix}`, name: `Centro Incorrecto E2E ${label}`, society_code: `SOC-${labelKey}-${suffix}`, branch_code: `BRX-${labelKey}-${suffix}`, active: true }]
  };
  await db.tenant.update({ where: { id: tenantId }, data: { active_modules: ["M-07", "M-17", "accounting", "hr", "payroll"], config: { ...(tenant.config || {}), accounting: { ...((tenant.config || {}).accounting || {}), organization_tree: tree } } } });
  const party = await db.party.create({ data: { tenant_id: tenantId, type: "supplier", name: `EPS Party ${suffix}`, legal_name: `EPS Party ${suffix} SAS`, tax_id: `900${suffix.replace(/[^0-9]/g, "0").slice(0, 6)}`, tax_type: "NIT", email: `eps-${suffix}@example.test`, phone: "3001234567", address: "Calle E2E", city: "Bogota", metadata: { document_type: "NIT", verification_digit: "7", trade_name: `EPS E2E ${suffix}`, role_flags: { supplier: true } }, active: true } });
  await db.party.createMany({ data: Array.from({ length: 505 }, (_, index) => ({ tenant_id: tenantId, type: "supplier", name: `AAA filler ${suffix} ${String(index).padStart(3, "0")}`, legal_name: `AAA filler ${suffix} ${index}`, tax_id: `FILLER${suffix}${index}`, active: true })) });
  const tailParty = await db.party.create({ data: { tenant_id: tenantId, type: "supplier", name: `ZZZ lookup tail ${suffix}`, legal_name: `ZZZ lookup tail ${suffix}`, tax_id: `TAIL${suffix}`, tax_type: "NIT", active: true } });
  const hrRole = await db.role.create({ data: { tenant_id: tenantId, name: `E2E_HR_ONLY_${suffix}`, is_system: false } });
  await db.permission.createMany({ data: [{ role_id: hrRole.id, module: "hr", action: "read" }, { role_id: hrRole.id, module: "hr", action: "write" }, { role_id: hrRole.id, module: "payroll", action: "read" }, { role_id: hrRole.id, module: "payroll", action: "write" }] });
  const limitedEmail = `hr-only-${suffix}@example.test`;
  await db.user.create({ data: { tenant_id: tenantId, name: "HR Only E2E", email: limitedEmail, password: await bcrypt.hash("hr-only-e2e", 4), role_id: hrRole.id, active: true } });
  return { tenantId, tree, partyId: party.id, party, tailPartyId: tailParty.id, tailParty, adminEmail, adminPassword, limitedEmail, limitedPassword: "hr-only-e2e" };
}

async function seedLegacyEmployee(fixture) {
  return db.employee.create({ data: { tenant_id: fixture.tenantId, code: `LEG-${suffix}`, position: "Legado", department: "QA", salary_base: 1, hire_date: new Date("2025-01-01"), metadata: { name: "Empleado Legado", document: `LEG${suffix}`, document_type: "CC", cost_center: "LEGACY-TEXT" } } });
}

async function browserLogin(page, email, password) {
  await page.goto(`${webUrl}/login`, { waitUntil: "networkidle2" });
  await page.waitForSelector('input[name="email"]', { visible: true, timeout: 45000 });
  await page.type('input[name="email"]', email);
  await page.type('input[name="password"]', password);
  await page.click('form button[type="submit"]');
  await page.waitForFunction(() => !location.pathname.endsWith("/login"), { timeout: 45000 });
  check("browser_login_real", true, { email, path: await page.evaluate(() => location.pathname) });
}

async function browserApi(page, route, options = {}) {
  return page.evaluate(async ({ apiUrl: base, route: pathName, options: opts }) => {
    const token = localStorage.getItem("token") || localStorage.getItem("access_token");
    const response = await fetch(`${base}${pathName}`, { ...opts, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(opts.headers || {}) }, body: opts.body && typeof opts.body !== "string" ? JSON.stringify(opts.body) : opts.body });
    return { status: response.status, body: await response.json().catch(() => ({})) };
  }, { apiUrl, route, options });
}

async function setLabelValue(page, labelText, value) {
  await page.evaluate(({ labelText: text, value: next }) => {
    const label = [...document.querySelectorAll("label")].find((item) => item.textContent?.trim().startsWith(text));
    if (!label) throw new Error(`label_not_found:${text}`);
    const field = label.querySelector("input,select");
    if (!field) throw new Error(`field_not_found:${text}`);
    const setter = Object.getOwnPropertyDescriptor(field instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype, "value")?.set;
    setter?.call(field, next);
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.dispatchEvent(new Event("change", { bubbles: true }));
  }, { labelText, value });
}

async function certifyOrganization(page, fixture, forbiddenFixture) {
  await page.goto(`${webUrl}/dashboard/contabilidad/estructura`, { waitUntil: "networkidle2" });
  await page.waitForFunction((codes) => codes.every((code) => document.body.innerText.includes(code)), {}, [fixture.tree.societies[0].code, fixture.tree.branches[0].code, fixture.tree.cost_centers[0].code]);
  const bodyText = await page.$eval("body", (node) => node.innerText);
  const forbiddenCodes = forbiddenFixture ? [forbiddenFixture.tree.societies[0].code, forbiddenFixture.tree.branches[0].code, forbiddenFixture.tree.cost_centers[0].code] : [];
  check("organization_tree_real_ui", forbiddenCodes.every((code) => !bodyText.includes(code)), { codes: [fixture.tree.societies[0].code, fixture.tree.branches[0].code, fixture.tree.cost_centers[0].code], forbidden_codes: forbiddenCodes });
}

async function certifyEmployee(page, fixture, token) {
  await page.goto(`${webUrl}/dashboard/talento-humano/empleados`, { waitUntil: "networkidle2" });
  await page.waitForFunction(() => document.body.innerText.includes("Maestro de empleados"));
  await page.evaluate(() => {
    const button = [...document.querySelectorAll("button")].find((b) => b.textContent?.includes("Nuevo empleado"));
    if (!button) throw new Error("button_not_found:Nuevo empleado");
    button.click();
  });
  await page.waitForFunction(() => document.body.innerText.includes("Nuevo empleado"));
  await setLabelValue(page, "Primer nombre", "Empleado");
  await setLabelValue(page, "Primer apellido", `E2E${suffix}`);
  await setLabelValue(page, "Tipo documento", "CC");
  await setLabelValue(page, "Numero documento", `10${suffix.replace(/[^0-9]/g, "0").slice(0, 8)}`);
  await setLabelValue(page, "Cargo", "Analista E2E");
  await setLabelValue(page, "Sociedad contable", fixture.tree.societies[0].code);
  await setLabelValue(page, "Sucursal contable", fixture.tree.branches[0].code);
  await setLabelValue(page, "Centro de costos contable", fixture.tree.cost_centers[0].code);
  await setLabelValue(page, "Fecha de ingreso", "2026-01-01");
  await setLabelValue(page, "Salario mensual", "2500000");
  const employeeScreenshot = path.join(path.dirname(output), "payroll-employee-selection.png");
  await page.screenshot({ path: employeeScreenshot, fullPage: true });
  screenshots.push(employeeScreenshot);
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent?.includes("Crear empleado"))?.click());
  await page.waitForFunction(() => {
    const dialog = document.querySelector('[role="dialog"]');
    return Boolean(dialog && !dialog.innerText.includes("Nuevo empleado") && dialog.innerText.includes("Empleado guardado correctamente"));
  }, { timeout: 30000 });
  const employee = await db.employee.findFirst({ where: { tenant_id: fixture.tenantId, code: { startsWith: "EMP-" } }, orderBy: { id: "desc" } });
  check("employee_ui_persisted", Boolean(employee), { employee_id: employee?.id });
  check("employee_organization_metadata_persisted", employee?.metadata?.accounting?.branch_code === fixture.tree.branches[0].code && employee?.metadata?.accounting?.cost_center_code === fixture.tree.cost_centers[0].code, { metadata: employee?.metadata?.accounting });
  const contract = employee ? await db.$queryRaw`SELECT * FROM th_empleado_contratos WHERE tenant_id = ${fixture.tenantId} AND employee_id = ${employee.id} ORDER BY id DESC LIMIT 1` : [];
  check("employee_contract_foundation_persisted", contract.length > 0, { employee_id: employee?.id });
  const beforeContract = contract[0];
  const addendum = employee ? await apiJson(token, `/api/v1/talento-humano/empleados/${employee.id}/contratos/otrosi`, { method: "POST", body: { valid_from: "2026-02-01", contract_type: "indefinite", salary_base: 2750000, society_code: fixture.tree.societies[0].code, branch_code: fixture.tree.branches[1].code, cost_center_code: fixture.tree.cost_centers[1].code, reason: "Reasignación E2E" } }) : { status: 0, body: {} };
  check("employee_addendum_valid_assignment", addendum.status < 300, { status: addendum.status, body: addendum.body });
  const history = employee ? await db.$queryRaw`SELECT * FROM th_empleado_contratos WHERE tenant_id = ${fixture.tenantId} AND employee_id = ${employee.id} ORDER BY valid_from ASC, id ASC` : [];
  check("employee_addendum_history_has_new_contract", history.length >= 2, { count: history.length });
  check("employee_addendum_preserves_previous_contract", Boolean(beforeContract) && history.some((row) => Number(row.id) === Number(beforeContract.id) && Number(row.salary_base) === Number(beforeContract.salary_base) && row.branch_code === beforeContract.branch_code), { before: beforeContract, history: history.map((row) => ({ id: row.id, salary_base: row.salary_base, branch_code: row.branch_code })) });
  check("employee_addendum_new_assignment_persisted", history.some((row) => row.valid_from?.toISOString?.().slice(0, 10) === "2026-02-01" && row.branch_code === fixture.tree.branches[1].code && row.cost_center_code === fixture.tree.cost_centers[1].code), { history: history.map((row) => ({ valid_from: row.valid_from, branch_code: row.branch_code, cost_center_code: row.cost_center_code })) });
  const invalidAddendum = employee ? await apiJson(token, `/api/v1/talento-humano/empleados/${employee.id}/contratos/otrosi`, { method: "POST", body: { valid_from: "2026-03-01", contract_type: "indefinite", salary_base: 2800000, society_code: fixture.tree.societies[0].code, branch_code: fixture.tree.branches[0].code, cost_center_code: fixture.tree.cost_centers[1].code, reason: "Asignación inválida E2E" } }) : { status: 0, body: {} };
  check("employee_addendum_invalid_assignment_rejected", invalidAddendum.status === 422, { status: invalidAddendum.status, body: invalidAddendum.body });
  const retired = employee ? await apiJson(token, `/api/v1/talento-humano/empleados/${employee.id}`, { method: "PATCH", body: { active: false, end_date: "2026-02-28" } }) : { status: 0, body: {} };
  check("employee_retirement_for_rehire_succeeds", retired.status < 300, { status: retired.status, body: retired.body });
  const rehire = employee ? await apiJson(token, `/api/v1/talento-humano/empleados/${employee.id}/recontratar`, { method: "POST", body: { new_hire_date: "2026-03-01", contract_type: "indefinite", salary_base: 2850000, society_code: fixture.tree.societies[0].code, branch_code: fixture.tree.branches[0].code, cost_center_code: fixture.tree.cost_centers[0].code, reason: "Recontratación E2E" } }) : { status: 0, body: {} };
  check("employee_rehire_valid_assignment_succeeds", rehire.status < 300, { status: rehire.status, body: rehire.body });
  const rehireHistory = employee ? await db.$queryRaw`SELECT * FROM th_empleado_contratos WHERE tenant_id = ${fixture.tenantId} AND employee_id = ${employee.id} ORDER BY valid_from ASC, id ASC` : [];
  check("employee_rehire_history_and_metadata_persisted", rehireHistory.length >= 3 && rehireHistory.at(-1)?.reason === "recontratacion" && rehireHistory.at(-1)?.branch_code === fixture.tree.branches[0].code, { count: rehireHistory.length, last: rehireHistory.at(-1) });
  const employeeAfterRehire = employee ? await db.employee.findUnique({ where: { id: employee.id } }) : null;
  check("employee_rehire_reactivates_employee", employeeAfterRehire?.active === true && employeeAfterRehire?.metadata?.accounting?.branch_code === fixture.tree.branches[0].code, { active: employeeAfterRehire?.active, accounting: employeeAfterRehire?.metadata?.accounting });
  return employee;
}

async function certifyEntity(page, fixture) {
  await page.goto(`${webUrl}/dashboard/talento-humano/entidades`, { waitUntil: "networkidle2" });
  await page.waitForFunction(() => document.body.innerText.includes("Entidades laborales") || document.body.innerText.includes("Nueva entidad"));
  const partyCountBefore = await db.party.count({ where: { tenant_id: fixture.tenantId } });
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent?.includes("Nueva entidad"))?.click());
  await page.waitForFunction(() => document.body.innerText.includes("Nueva entidad"));
  const party = fixture.party;
  const partyName = party.legal_name || party.name;
  const partySearch = 'input[aria-label="Buscar tercero contable"]';
  await page.click(partySearch);
  await page.type(partySearch, `${party.tax_id}-${party.metadata.verification_digit}`);
  const select = 'select[aria-label="Seleccionar tercero contable"]';
  await page.waitForFunction(({ selector, partyId }) => [...document.querySelectorAll(`${selector} option`)].some((option) => option.value === String(partyId)), {}, { selector: select, partyId: party.id });
  await page.select(select, String(party.id));
  await page.waitForFunction(({ name, legalName, verificationDigit }) => {
    const fieldValue = (labelText) => [...document.querySelectorAll("label")].find((label) => label.textContent?.trim().startsWith(labelText))?.querySelector("input")?.value;
    return document.querySelector('input[aria-label="NIT de la entidad laboral"]')?.value && fieldValue("Digito verificacion") === verificationDigit && fieldValue("Razon social") === legalName && document.body.innerText.includes(name);
  }, {}, { name: partyName, legalName: party.legal_name, verificationDigit: party.metadata.verification_digit });
  check("entity_party_lookup_and_prefill_ui", true, { party_id: party.id, party_name: partyName, legal_name: party.legal_name, verification_digit: party.metadata.verification_digit });
  const entityPrefillScreenshot = path.join(path.dirname(output), "payroll-entity-prefill.png");
  await page.screenshot({ path: entityPrefillScreenshot, fullPage: true });
  screenshots.push(entityPrefillScreenshot);
  await setLabelValue(page, "Tipo", "EPS");
  await setLabelValue(page, "Codigo oficial", `EPS-${suffix}`);
  await page.evaluate(() => {
    const button = [...document.querySelectorAll("button")].find((b) => b.textContent?.includes("Guardar"));
    if (!button) throw new Error("button_not_found:Guardar");
    button.click();
  });
  await page.waitForFunction(() => !document.querySelector('select[aria-label="Seleccionar tercero contable"]'), { timeout: 30000 });
  const entityPersistScreenshot = path.join(path.dirname(output), "payroll-entity-persisted.png");
  await page.screenshot({ path: entityPersistScreenshot, fullPage: true });
  screenshots.push(entityPersistScreenshot);
  const rows = await db.$queryRaw`SELECT * FROM th_entidades_laborales WHERE tenant_id = ${fixture.tenantId} ORDER BY id DESC LIMIT 1`;
  check("labor_entity_party_reference_persisted", rows[0]?.accounting_party_id === party.id, { row: rows[0] });
  check("labor_entity_common_snapshot_persisted", rows[0]?.nit === party.tax_id && rows[0]?.legal_name === party.legal_name, { row: rows[0] });
  const partyCountAfter = await db.party.count({ where: { tenant_id: fixture.tenantId } });
  check("labor_entity_does_not_duplicate_party", partyCountAfter === partyCountBefore, { party_count_before: partyCountBefore, party_count_after: partyCountAfter });
  return rows[0];
}

async function certifyApiValidation(fixture, token, otherFixture) {
  const wrongBranch = await apiJson(token, "/api/v1/talento-humano/empleados", { method: "POST", body: { name: `Wrong ${suffix}`, document: `WRONG${suffix}`, document_type: "CC", position: "QA", department: "QA", salary_base: 1, hire_date: "2026-01-01", society_code: fixture.tree.societies[0].code, branch_code: otherFixture.tree.branches[0].code, cost_center_code: fixture.tree.cost_centers[0].code } });
  check("employee_wrong_branch_rejected", wrongBranch.status === 422, { status: wrongBranch.status, body: wrongBranch.body });
  const foreignParty = await apiJson(token, "/api/v1/talento-humano/entidades", { method: "POST", body: { entity_type: "EPS", nit: otherFixture.party.tax_id, legal_name: "Foreign", accounting_party_id: otherFixture.partyId } });
  check("entity_foreign_party_rejected", foreignParty.status === 404, { status: foreignParty.status, body: foreignParty.body });
  const mismatch = await apiJson(token, "/api/v1/talento-humano/entidades", { method: "POST", body: { entity_type: "EPS", nit: `${fixture.party.tax_id}-8`, legal_name: "Mismatch", accounting_party_id: fixture.partyId } });
  check("entity_mismatched_nit_rejected", mismatch.status === 422, { status: mismatch.status, body: mismatch.body });
  const inactive = await db.party.update({ where: { id: fixture.partyId }, data: { active: false } });
  const inactiveResult = await apiJson(token, "/api/v1/talento-humano/entidades", { method: "POST", body: { entity_type: "EPS", nit: inactive.tax_id, legal_name: "Inactive", accounting_party_id: inactive.id } });
  check("entity_inactive_party_rejected", inactiveResult.status === 404, { status: inactiveResult.status, body: inactiveResult.body });
  await db.party.update({ where: { id: fixture.partyId }, data: { active: true } });
}

async function certifyHrOnly(page, fixture) {
  await browserLogin(page, fixture.limitedEmail, fixture.limitedPassword);
  const candidates = await browserApi(page, `/api/v1/talento-humano/entidades/terceros?search=${encodeURIComponent(fixture.party.tax_id)}`);
  check("hr_only_party_lookup_allowed", candidates.status === 200 && Array.isArray(candidates.body) && candidates.body.some((row) => row.id === fixture.partyId), { status: candidates.status });
  const organization = await browserApi(page, "/api/v1/talento-humano/empleados/organization-options");
  check("hr_only_organization_lookup_allowed", organization.status === 200 && organization.body?.societies?.length > 0 && organization.body?.branches?.length > 0, { status: organization.status });
  const tail = await browserApi(page, `/api/v1/talento-humano/entidades/terceros?search=${encodeURIComponent(fixture.tailParty.tax_id)}`);
  check("hr_party_lookup_searches_beyond_first_page", tail.status === 200 && Array.isArray(tail.body) && tail.body.some((row) => row.id === fixture.tailPartyId), { status: tail.status, rows: Array.isArray(tail.body) ? tail.body.length : null });
  const accounting = await browserApi(page, "/api/v1/accounting/third-parties?limit=1");
  check("hr_only_accounting_read_denied", accounting.status === 403, { status: accounting.status, body: accounting.body });
  await page.goto(`${webUrl}/dashboard/talento-humano/entidades`, { waitUntil: "networkidle2" });
  check("hr_only_entities_page_visible", (await page.$eval("body", (node) => node.innerText)).includes("Entidad laboral"), {});
}

async function main() {
  await waitForServer(`${apiUrl}/health`);
  await waitForServer(webUrl);
  await assertApiCommitMarker();
  const fixture = await seedTenant(`admin-a-${suffix}@example.test`, `Admin-${suffix}!`, "Tenant A");
  const other = await seedTenant(`admin-b-${suffix}@example.test`, `AdminB-${suffix}!`, "Tenant B");
  const legacy = await seedLegacyEmployee(fixture);
  const token = await loginToken(fixture.adminEmail, fixture.adminPassword);
  const browser = await puppeteer.launch({ executablePath: browserPath, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(20000);
    await browserLogin(page, fixture.adminEmail, fixture.adminPassword);
    await certifyOrganization(page, fixture, other);
    await certifyEmployee(page, fixture, token);
    await certifyEntity(page, fixture);
    await certifyApiValidation(fixture, token, other);
    const patchLegacy = await apiJson(token, `/api/v1/talento-humano/empleados/${legacy.id}`, { method: "PATCH", body: { name: "Empleado Legado Conservado" } });
    check("legacy_employee_patch_succeeds_without_org_assignment", patchLegacy.status < 300, { status: patchLegacy.status });
    const legacyAfter = await db.employee.findUnique({ where: { id: legacy.id } });
    check("legacy_employee_org_metadata_preserved", legacyAfter?.metadata?.cost_center === "LEGACY-TEXT" && !legacyAfter?.metadata?.accounting, { metadata: legacyAfter?.metadata });
    const limited = await browser.newPage();
    await certifyHrOnly(limited, fixture);
    await limited.close();
  } finally {
    await browser.close();
    await db.$disconnect();
  }
  const evidence = { version: 1, certification: "payroll-accounting-masters-browser-local", status: "passed", generated_at: new Date().toISOString(), commit: require("node:child_process").execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), api_url: apiUrl, web_url: webUrl, fixture: { tenant_id: fixture.tenantId, other_tenant_id: other.tenantId, party_id: fixture.partyId }, screenshots, checks };
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${jsonSafe(evidence, 2)}\n`);
  console.log(jsonSafe(evidence));
}

main().catch(async (error) => {
  await db.$disconnect().catch(() => undefined);
  const evidence = { version: 1, certification: "payroll-accounting-masters-browser-local", status: "failed", generated_at: new Date().toISOString(), error: String(error?.stack || error), checks };
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${jsonSafe(evidence)}\n`);
  console.error(jsonSafe(evidence));
  process.exitCode = 1;
});
