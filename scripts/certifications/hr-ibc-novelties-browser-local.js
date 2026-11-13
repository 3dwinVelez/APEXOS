/* Versioned local E2E certification for Colombia IBC/novedades/PILA.
 * Requires real Chromium, local API, local web and local PostgreSQL.
 * It deliberately does not mock/intercept requests, reset data, migrate, or delete.
 */
process.env.NODE_ENV = "test";
process.env.REDIS_DISABLED = "true";
process.env.DISABLE_REDIS = "true";
process.env.DATABASE_URL ||= "postgresql://apexuser@127.0.0.1:55439/apex_test";
const localDatabaseUrl = new URL(process.env.DATABASE_URL);
if (!['127.0.0.1', 'localhost'].includes(localDatabaseUrl.hostname) || localDatabaseUrl.port !== '55439' || localDatabaseUrl.pathname !== '/apex_test') {
  throw new Error('IBC E2E requires local PostgreSQL apex_test on port 55439');
}

const assert = require("node:assert/strict");
const child = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const bcrypt = require("bcrypt");
const puppeteer = require(path.resolve(__dirname, "../../apps/api/node_modules/puppeteer-core"));
const { PrismaClient } = require("@prisma/client");

const apiUrl = process.env.LOCAL_API_URL || "http://127.0.0.1:3214";
const webUrl = process.env.LOCAL_WEB_URL || "http://127.0.0.1:3002";
const browserPath = process.env.CHROME_BIN || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const evidenceDir = path.resolve(process.env.IBC_EVIDENCE_DIR || "docs/qa/evidence/hr-ibc-novelties-20261015");
const evidencePath = path.join(evidenceDir, "hr-ibc-novelties-browser-local.json");
const suffix = crypto.randomBytes(5).toString("hex");
const db = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
const checks = [];
const candidatePaths = (process.env.IBC_CANDIDATE_PATHS || [
  "apps/api/src/modules/hr/schema.js",
  "apps/api/src/modules/hr/service.js",
  "apps/api/src/modules/hr/socialContributionSegments.js",
  "apps/api/test/hr-payroll-social-contributions-bulk.test.js",
  "apps/api/test/hr-social-contribution-segments.test.js",
  "apps/web/app/dashboard/talento-humano/aportes-sociales/page.tsx",
  "apps/web/app/dashboard/talento-humano/configuracion-laboral/page.tsx",
  "apps/web/app/dashboard/talento-humano/empleados/page.tsx",
  "apps/web/app/dashboard/talento-humano/nomina/page.tsx",
  "apps/web/test/hr-workday-novelties-ui.test.mjs",
  "apps/web/test/ibc-nomina-ui.test.mjs",
  "docs/project/IBC_NOMINA_COLOMBIA_CONOCIMIENTO.md",
  "scripts/certifications/hr-ibc-novelties-browser-local.js"
].join(",")).split(",").map((value) => value.trim()).filter(Boolean);

function safe(value) { return JSON.stringify(value, (_key, item) => typeof item === "bigint" ? item.toString() : item); }
function check(name, ok, detail = {}) { checks.push({ name, ok: Boolean(ok), detail }); assert.ok(ok, `${name}: ${safe(detail)}`); }
function local(value, name) { const parsed = new URL(value); check(`${name}_localhost`, ["127.0.0.1", "localhost"].includes(parsed.hostname) && ["http:", "https:"].includes(parsed.protocol), { value }); }
local(apiUrl, "api"); local(webUrl, "web");
function sourceIdentity(apiHealth) {
  const head = child.execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const tracked = Object.fromEntries(candidatePaths.map((file) => {
    try { child.execFileSync("git", ["ls-files", "--error-unmatch", "--", file], { stdio: "ignore" }); return [file, true]; }
    catch { return [file, false]; }
  }));
  const fingerprints = Object.fromEntries(candidatePaths.map((file) => {
    try { return [file, child.execFileSync("git", ["hash-object", "--", file], { encoding: "utf8" }).trim()]; }
    catch { return [file, null]; }
  }));
  const status = child.execFileSync("git", ["status", "--short", "--", ...candidatePaths], { encoding: "utf8" }).trim();
  const scopedClean = Object.values(tracked).every(Boolean) && !status;
  const healthMatchesHead = typeof apiHealth?.commit === "string" && head.startsWith(apiHealth.commit);
  return { candidate_paths: candidatePaths, candidate_source_clean: scopedClean, candidate_status: status, source_fingerprints: fingerprints, certified_commit: scopedClean && healthMatchesHead ? head : null, source_state: scopedClean && healthMatchesHead ? "certified_commit" : "working_tree", commit: head, working_tree_dirty: child.execFileSync("git", ["status", "--short"], { encoding: "utf8" }).trim().length > 0 };
}

async function waitFor(url) { const response = await fetch(url, { signal: AbortSignal.timeout(5000) }); if (!response.ok) throw new Error(`${url} ${response.status}`); }
async function readHealth() {
  const response = await fetch(`${apiUrl}/health`, { signal: AbortSignal.timeout(5000) });
  const body = await response.json().catch(() => ({}));
  check("api_health_identity", response.status === 200 && typeof body.commit === "string" && body.commit && body.commit !== "unknown", { status: response.status, commit: body.commit, version: body.version });
  return body;
}
async function authJson(url, options) {
  let lastError;
  for (let attempt = 0; attempt < 7; attempt += 1) {
    try {
      const response = await fetch(url, options);
      const body = await response.json().catch(() => ({}));
      if (response.status !== 429 || attempt === 6) return { response, body };
    } catch (error) {
      lastError = error;
      if (attempt === 6) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  throw lastError || new Error(`auth request failed: ${url}`);
}
async function register(label) {
  const email = `ibc-${label}-${suffix}@example.test`;
  const password = `Ibc-${suffix}!`;
  const { response, body } = await authJson(`${apiUrl}/api/v1/auth/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ company_name: `IBC E2E ${label} ${suffix}`, industry: "qa", email, password, name: `IBC ${label}`, country: "CO", timezone: "America/Bogota", currency: "COP", plan: "crown" }) });
  // The local auth route is deliberately rate limited. If another local run
  // consumed that quota, bootstrap an equivalent real tenant/user fixture in
  // PostgreSQL and authenticate through the normal login route.
  if (!response.ok && response.status === 429) {
    const tenant = await db.tenant.create({ data: { name: `IBC E2E ${label} ${suffix}`, industry: "qa", country: "CO", timezone: "America/Bogota", currency: "COP", plan: "crown", active_modules: Array.from({ length: 27 }, (_item, index) => `M-${String(index + 1).padStart(2, "0")}`) } });
    const role = await db.role.create({ data: { tenant_id: tenant.id, name: "APEX_ADMIN", description: "Local IBC E2E administrator", is_system: true, permissions: { create: [{ module: "*", action: "*" }] } } });
    await db.user.create({ data: { tenant_id: tenant.id, name: `IBC ${label}`, email, password: await bcrypt.hash(password, 12), role_id: role.id, active: true } });
    await db.subscription.create({ data: { tenant_id: tenant.id, plan: "crown", price_monthly: 0, trial_ends: new Date(Date.now() + 14 * 86400000) } });
    return { email, password, tenantId: tenant.id };
  }
  if (!response.ok) throw new Error(`register ${response.status}: ${safe(body)}`);
  return { email, password, tenantId: body.tenant?.id || body.user?.tenant_id };
}
async function tokenFor(fixture) {
  const { response, body } = await authJson(`${apiUrl}/api/v1/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: fixture.email, password: fixture.password }) });
  if (!response.ok) throw new Error(`login ${response.status}: ${safe(body)}`);
  return body.token || body.access_token || body.session?.access_token;
}
async function api(token, route, options = {}) {
  for (let attempt = 0; attempt < 18; attempt += 1) {
    const response = await fetch(`${apiUrl}${route}`, { ...options, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(options.headers || {}) }, body: options.body && typeof options.body !== "string" ? JSON.stringify(options.body) : options.body });
    const body = await response.json().catch(() => ({}));
    if (response.status !== 429 || attempt === 17) return { status: response.status, body };
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
}
async function browserLogin(page, fixture) {
  await page.goto(`${webUrl}/login`, { waitUntil: "networkidle2" });
  await page.type('input[name="email"]', fixture.email); await page.type('input[name="password"]', fixture.password); await page.click('form button[type="submit"]');
  await page.waitForFunction(() => !location.pathname.endsWith("/login"), { timeout: 45000 });
  check("real_browser_login", true, { path: await page.evaluate(() => location.pathname) });
}
async function setFormField(page, labelText, value, occurrence = -1) {
  await page.evaluate(({ labelText: text, value: next, occurrence: wanted }) => {
    const labels = [...document.querySelectorAll("label")].filter((item) => item.textContent?.trim().startsWith(text));
    const direct = text === "Tipo" ? document.querySelector('[data-testid="ibc-novelty-type"]') : text === "Empleado" ? document.querySelector('[data-testid="ibc-adjustment-employee"]') : null;
    const label = labels[wanted < 0 ? labels.length - 1 : wanted];
    const directField = direct;
    if (!label) throw new Error(`label_not_found:${text};path=${location.pathname};labels=${labels.map((item) => item.textContent?.trim()).join("|")};body=${document.body.innerText.slice(0, 300)}`);
    const field = directField || label.querySelector("input,select");
    if (!field) throw new Error(`field_not_found:${text}`);
    const prototype = field instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    setter?.call(field, next);
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.dispatchEvent(new Event("change", { bubbles: true }));
  }, { labelText, value, occurrence });
}
async function consultPeriodInBrowser(page, start, end) {
  await setFormField(page, "Tipo periodo", "mes");
  await setFormField(page, "Fecha inicio", start);
  await setFormField(page, "Fecha fin", end);
  await page.evaluate(() => [...document.querySelectorAll("button")].find((button) => button.textContent?.includes("Consultar periodo"))?.click());
  await page.waitForFunction(() => document.body.innerText.includes("Ajustes manuales, licencias y vacaciones"), { timeout: 30000 });
}
async function createAdjustmentInBrowser(page, employeeId, payload) {
  await page.waitForFunction((id) => [...document.querySelector('[data-testid="ibc-adjustment-employee"]')?.options || []].some((option) => option.value === String(id)), { timeout: 30000 }, employeeId);
  const selectedEmployee = await page.select('[data-testid="ibc-adjustment-employee"]', String(employeeId));
  if (!selectedEmployee.length) throw new Error(`employee_option_not_selected:${employeeId}`);
  await page.select('[data-testid="ibc-novelty-type"]', payload.uiType);
  if (payload.uiType !== "vacaciones_compensadas") {
    await setFormField(page, "Fecha inicio novedad", payload.date_start);
    await setFormField(page, "Fecha fin novedad", payload.date_end);
  }
  if (payload.uiType !== "vacaciones_compensadas" && payload.days != null) await setFormField(page, "Dias novedad", String(payload.days));
  if (payload.uiType === "vacaciones_compensadas") {
    await setFormField(page, "Fecha reconocimiento", payload.date_start);
    await setFormField(page, "Soporte documental", payload.documentSupport || `cash://${suffix}`);
  }
  if (payload.reference) {
    await setFormField(page, "IBC histórico congelado al inicio", String(payload.reference.amount));
    await setFormField(page, "Periodo del IBC reportado", payload.reference.period);
    await setFormField(page, "Fecha de captura", payload.reference.capturedAt);
    await setFormField(page, "Soporte / origen del IBC", payload.reference.support);
    await setFormField(page, "Origen de referencia", payload.reference.source || "manual_reported_pila");
    await setFormField(page, "ID planilla / atestación", payload.reference.id || `PILA-${suffix}`);
    await setFormField(page, "Clave de continuidad", payload.reference.continuity);
  }
  if (payload.lrPolicy) await setFormField(page, "Política ARL licencia remunerada", payload.lrPolicy);
  if (payload.slnCause) await setFormField(page, "Causal SLN", payload.slnCause);
  if (payload.recognizedValue != null) await setFormField(page, payload.uiType === "vacaciones_compensadas" ? "Valor reconocido para parafiscales" : "Valor reconocido del segmento", String(payload.recognizedValue));
  if (payload.advanceObligation) await setFormField(page, "Obligación del anticipo", payload.advanceObligation);
  if (payload.advancePeriod) await setFormField(page, "Período de obligación", payload.advancePeriod);
  if (payload.advanceSupport) await setFormField(page, "Soporte de retención", payload.advanceSupport);
  if (payload.advanceHealth != null) await setFormField(page, "Retención anticipada salud", String(payload.advanceHealth));
  if (payload.advancePension != null) await setFormField(page, "Retención anticipada pensión", String(payload.advancePension));
  const addButton = '[data-testid="ibc-add-adjustment"]';
  await page.waitForFunction((selector) => { const button = document.querySelector(selector); return Boolean(button && !button.disabled); }, { timeout: 30000 }, addButton);
  if (await page.$eval(addButton, (button) => Boolean(button.disabled))) {
    const formState = await page.evaluate(() => [...document.querySelectorAll("input,select,textarea")].map((field) => ({
      testid: field.getAttribute("data-testid"), name: field.getAttribute("name"), type: field.getAttribute("type"),
      value: field.value, required: field.required, disabled: field.disabled, validity: field.validity?.valid,
    })).filter((field) => field.required || field.value));
    throw new Error(`button_disabled:Agregar ajuste;form=${JSON.stringify(formState)}`);
  }
  let adjustmentResponse;
  let adjustmentBody = {};
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const responsePromise = page.waitForResponse((response) => response.url().includes("/api/v1/talento-humano/nomina/ajustes") && response.request().method() === "POST", { timeout: 30000 });
    if (attempt > 0) await page.waitForFunction((selector) => { const button = document.querySelector(selector); return Boolean(button && !button.disabled); }, { timeout: 30000 }, addButton);
    await page.click(addButton);
    adjustmentResponse = await responsePromise;
    adjustmentBody = await adjustmentResponse.json().catch(() => ({}));
    if (adjustmentResponse.status() !== 429 || attempt === 2) break;
    await new Promise((resolve) => setTimeout(resolve, 35000));
  }
  check(`browser_adjustment_post_${payload.uiType}`, [200, 201].includes(adjustmentResponse.status()) && Boolean(adjustmentBody.id), { status: adjustmentResponse.status(), body: adjustmentBody });
  await new Promise((resolve) => setTimeout(resolve, 500));
  const persisted = await page.evaluate(async (periodKey) => {
    const token = localStorage.getItem("token") || localStorage.getItem("access_token");
    const response = await fetch(`/api/v1/talento-humano/nomina/ajustes?period_key=${encodeURIComponent(periodKey)}`, { headers: { Authorization: `Bearer ${token}` } });
    return { status: response.status, body: await response.json().catch(() => ({})) };
  }, payload.period_key);
  const rows = Array.isArray(persisted.body) ? persisted.body : persisted.body?.data || persisted.body?.adjustments || [];
  const row = rows.find((item) => Number(item.employee_id) === Number(employeeId));
  check(`browser_adjustment_${payload.uiType}`, persisted.status === 200 && Boolean(row), { employeeId, period: payload.period_key, status: persisted.status, row, body: persisted.body });
  return row;
}
async function liquidatePeriodInBrowser(page, periodKey) {
  await page.waitForFunction((key) => {
    const button = [...document.querySelectorAll("button")].find((item) => /Liquidar nomina/i.test(item.textContent || ""));
    return Boolean(button && !button.disabled && document.body.innerText.includes(key));
  }, { timeout: 30000 }, periodKey);
  let clicked = false;
  let response;
  let body = {};
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const responsePromise = page.waitForResponse((item) => item.url().includes("/api/v1/talento-humano/nomina/liquidaciones") && item.request().method() === "POST", { timeout: 60000 });
    if (attempt > 0) await page.waitForFunction((key) => { const button = [...document.querySelectorAll("button")].find((item) => /Liquidar nomina/i.test(item.textContent || "")); return Boolean(button && !button.disabled && document.body.innerText.includes(key)); }, { timeout: 30000 }, periodKey);
    clicked = await page.evaluate(() => { const button = [...document.querySelectorAll("button")].find((item) => /Liquidar nomina/i.test(item.textContent || "")); if (!button || button.disabled) return false; button.click(); return true; });
    if (!clicked) throw new Error(`liquidation_button_not_clickable:${periodKey}`);
    response = await responsePromise;
    body = await response.json().catch(() => ({}));
    if (response.status() !== 429 || attempt === 2) break;
    await new Promise((resolve) => setTimeout(resolve, 35000));
  }
  check("browser_liquidate_period", clicked, {});
  check(`browser_liquidation_post_${periodKey}`, [200, 201].includes(response.status()), { status: response.status(), body });
  const persisted = await page.evaluate(async (key) => {
    const token = localStorage.getItem("token") || localStorage.getItem("access_token");
    for (let attempt = 0; attempt < 18; attempt += 1) {
      const result = await fetch(`/api/v1/talento-humano/nomina/liquidaciones?period_key=${encodeURIComponent(key)}`, { headers: { Authorization: `Bearer ${token}` } });
      const body = await result.json().catch(() => ({}));
      if (result.status !== 429 || attempt === 17) return { status: result.status, body };
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }, periodKey);
  const rows = Array.isArray(persisted.body) ? persisted.body : persisted.body?.data || persisted.body?.documents || [];
  check(`browser_liquidation_db_${periodKey}`, persisted.status === 200 && rows.length > 0, { status: persisted.status, rows: rows.length });
}
async function browserApi(page, route, body) {
  return page.evaluate(async ({ base, route: pathName, body: payload }) => {
    const token = localStorage.getItem("token") || localStorage.getItem("access_token");
    const response = await fetch(`${base}${pathName}`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(payload) });
    return { status: response.status, body: await response.json().catch(() => ({})) };
  }, { base: apiUrl, route, body });
}

async function seed(fixture) {
  const tenant = await db.tenant.findUnique({ where: { id: fixture.tenantId } });
  await db.tenant.update({ where: { id: fixture.tenantId }, data: { active_modules: Array.from({ length: 27 }, (_item, index) => `M-${String(index + 1).padStart(2, "0")}`), config: { ...(tenant?.config || {}), country: "CO", payroll: { ibc_engine: "segments-v1" } } } });
  const employee = await db.employee.create({ data: { tenant_id: fixture.tenantId, code: `IBC-${suffix}`, position: "Analista IBC", department: "QA", salary_base: 3000000, hire_date: new Date("2025-01-01"), metadata: { name: `Empleado IBC ${suffix}`, document: `IBC${suffix}`, document_type: "CC", social_security: { arl_risk_class: 1 } } } });
  const workdayDates = [];
  for (const [month, count, firstDay] of [["2026-01", 20, 1], ["2026-02", 15, 1], ["2026-03", 30, 1], ["2026-04", 20, 1], ["2026-05", 24, 1], ["2026-06", 25, 6]]) {
    for (let day = firstDay; day < firstDay + count; day += 1) {
      const date = new Date(`${month}-${String(day).padStart(2, "0")}T12:00:00.000Z`);
      if (date.getUTCDay() === 0) continue;
      workdayDates.push({ tenant_id: fixture.tenantId, employee_id: employee.id, date, total_minutes: 480, ordinary_day_minutes: 480, entry_at: new Date(`${month}-${String(day).padStart(2, "0")}T08:00:00.000Z`), exit_at: new Date(`${month}-${String(day).padStart(2, "0")}T17:00:00.000Z`) });
    }
  }
  await db.processedWorkday.createMany({ data: workdayDates, skipDuplicates: true });
  const restDates = ["2026-01-04", "2026-01-11", "2026-01-18", "2026-02-01", "2026-02-08", "2026-02-15", "2026-03-01", "2026-03-08", "2026-03-15", "2026-03-22", "2026-03-29", "2026-04-05", "2026-04-12", "2026-04-19", "2026-05-03", "2026-05-10", "2026-05-17", "2026-05-24", "2026-06-07", "2026-06-14", "2026-06-21", "2026-06-28"];
  await db.timeRoute.createMany({ data: restDates.map((date) => ({ tenant_id: fixture.tenantId, date: new Date(`${date}T12:00:00.000Z`), employees: [employee.code], kind: "descanso", status: "active" })), skipDuplicates: true });
  const entities = [
    ["EPS", `EPS-${suffix}`, "EPS IBC"], ["PENSION", `PEN-${suffix}`, "Pension IBC"], ["ARL", `ARL-${suffix}`, "ARL IBC"], ["CAJA_COMPENSACION", `CCF-${suffix}`, "Caja IBC"]
  ];
  const entityIds = {};
  for (const [type, code, name] of entities) {
    const rows = await db.$queryRaw`INSERT INTO th_entidades_laborales (tenant_id, entity_type, internal_code, nit, legal_name, official_code, active, valid_from) VALUES (${fixture.tenantId}, ${type}, ${code}, ${`900${suffix.slice(0, 6)}`}, ${name}, ${code}, true, DATE '2025-01-01') RETURNING id`;
    entityIds[type] = rows[0].id;
    await db.$executeRaw`INSERT INTO th_empleado_afiliaciones (tenant_id, employee_id, entity_type, entity_id, valid_from, status) VALUES (${fixture.tenantId}, ${employee.id}, ${type}, ${rows[0].id}, DATE '2025-01-01', 'activa')`;
  }
  const params = [
    ["SMMLV", 1750905, "money", {}],
    ["DED_SALUD", 4, "percent", { category: "deduction", basis: "ibc", social_contribution: true, payer: "employee" }],
    ["DED_PENSION", 4, "percent", { category: "deduction", basis: "ibc", social_contribution: true, payer: "employee" }],
    ["APORTE_SALUD", 8.5, "percent", { category: "deduction", basis: "ibc", social_contribution: true, payer: "employer" }],
    ["APORTE_PENSION", 12, "percent", { category: "deduction", basis: "ibc", social_contribution: true, payer: "employer" }],
    ["APORTE_ARL_RIESGO_1", 0.522, "percent", { category: "deduction", basis: "ibc", social_contribution: true, payer: "employer", entity_type: "ARL" }],
    ["APORTE_CAJA", 4, "percent", { category: "deduction", basis: "ibc", social_contribution: true, payer: "employer", entity_type: "CAJA_COMPENSACION" }],
    ["APORTE_SENA", 2, "percent", { category: "deduction", basis: "ibc", social_contribution: true, payer: "employer", entity_type: "SENA" }],
    ["APORTE_ICBF", 3, "percent", { category: "deduction", basis: "ibc", social_contribution: true, payer: "employer", entity_type: "ICBF" }]
  ];
  for (const [code, value, unit, metadata] of params) await db.$executeRaw`INSERT INTO th_parametros_laborales (tenant_id, country, code, name, value, unit, valid_from, priority, active, metadata) VALUES (${fixture.tenantId}, 'CO', ${code}, ${code}, ${value}, ${unit}, DATE '2025-01-01', 100, true, ${JSON.stringify(metadata)}::jsonb) ON CONFLICT DO NOTHING`;
  fixture.employee = employee; fixture.entityIds = entityIds;
  const limitedRole = await db.role.create({ data: { tenant_id: fixture.tenantId, name: `IBC_READ_ONLY_${suffix}`, is_system: false } });
  await db.permission.create({ data: { role_id: limitedRole.id, module: "hr", action: "read" } });
  fixture.limitedEmail = `ibc-read-${fixture.tenantId}-${suffix}@example.test`;
  fixture.limitedPassword = `Read-${suffix}!`;
  await db.user.create({ data: { tenant_id: fixture.tenantId, name: "IBC Read Only", email: fixture.limitedEmail, password: await bcrypt.hash(fixture.limitedPassword, 4), role_id: limitedRole.id, active: true } });
  return fixture;
}

async function preview(token, start, end, periodKey) {
  const payroll = await api(token, "/api/v1/talento-humano/nomina/preview", { method: "POST", body: { fecha_inicio: start, fecha_fin: end, period_type: "mes", period_key: periodKey } });
  check(`payroll_preview_${periodKey}`, payroll.status < 300, { status: payroll.status });
  const social = await api(token, "/api/v1/talento-humano/aportes-sociales/preview", { method: "POST", body: { fecha_inicio: start, fecha_fin: end, period_type: "mes", period_key: periodKey } });
  check(`social_preview_${periodKey}`, social.status < 300, { status: social.status, body: social.body });
  return { payroll: payroll.body, social: social.body?.document || social.body };
}
function findEmployee(document, employeeId) { return (document?.employees || document?.documents || []).find((row) => Number(row.employee_id) === Number(employeeId)) || document?.documents?.[0]; }
function findPayrollLine(employee, code) {
  const candidates = [employee, employee?.document, employee?.detail, employee?.payroll, employee?.data, employee?.document?.document];
  for (const candidate of candidates) {
    const lines = candidate?.lines || candidate?.detail?.lines || candidate?.payroll_lines || [];
    const found = Array.isArray(lines) && lines.find((line) => String(line.code || line.concept_code || "") === code);
    if (found) return found;
  }
  return undefined;
}

async function certify(fixture, other, page) {
  const token = await tokenFor(fixture);
  const otherToken = await tokenFor(other);
  await page.goto(`${webUrl}/dashboard/talento-humano/nomina`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector('input', { visible: true, timeout: 30000 });
  await page.waitForFunction(() => document.body.innerText.includes("Tipo periodo") || document.body.innerText.includes("Ajustes manuales"), { timeout: 60000 });
  const periodA = "mes:2026-01-01:2026-01-30";
  await consultPeriodInBrowser(page, "2026-01-01", "2026-01-30");
  await createAdjustmentInBrowser(page, fixture.employee.id, { period_key: periodA, uiType: "vacaciones_disfrutadas", date_start: "2026-01-21", date_end: "2026-01-30", days: 10, recognizedValue: 900000, reference: { amount: 2400000, period: "2025-12", capturedAt: "2026-01-01", support: `planilla://${suffix}/vac`, continuity: `vac-${suffix}`, source: "manual_reported_pila", id: `PILA-${suffix}-A` } });
  await liquidatePeriodInBrowser(page, periodA);
  const a = await preview(token, "2026-01-01", "2026-01-30", periodA);
  const aEmployee = findEmployee(a.social, fixture.employee.id);
  check("case_A_total_ibc_exact", Number(a.social?.total_ibc) === 2800000, { total_ibc: a.social?.total_ibc, segment_result: a.social?.employees?.[0]?.segment_result, source: a.social?.lines?.[0]?.metadata?.source });
  check("case_A_employee_exact", Number(a.social?.total_employee) === 224000, { total_employee: a.social?.total_employee, employee: aEmployee });
  const aArlLines = (a.social?.lines || []).filter((line) => line.entity_type === "ARL");
  check("case_A_arl_work_only", aArlLines.length === 1 && Number(aArlLines[0]?.ibc) === 2000000, { arl: aArlLines });

  const periodB = "mes:2026-02-01:2026-02-28";
  await consultPeriodInBrowser(page, "2026-02-01", "2026-02-28");
  await createAdjustmentInBrowser(page, fixture.employee.id, { period_key: periodB, uiType: "sln", slnCause: "suspension_disciplinaria", date_start: "2026-02-16", date_end: "2026-02-28", days: 15, recognizedValue: 0, reference: { amount: 3000000, period: "2026-01", capturedAt: "2026-02-01", support: `planilla://${suffix}/sln`, continuity: `sln-${suffix}`, source: "manual_reported_pila", id: `PILA-${suffix}-B` } });
  await liquidatePeriodInBrowser(page, periodB);
  const b = await preview(token, "2026-02-01", "2026-02-28", periodB);
  check("case_B_employee_exact", Number(b.social?.total_employee) === 120000, { total_employee: b.social?.total_employee });
  const bSegmentResult = b.social?.segment_result || b.social?.document?.segment_result || b.social?.employees?.[0]?.segment_result;
  const bEnginePeriod = bSegmentResult?.period || b.social?.period;
  const bReportedDays = bSegmentResult?.segments?.reduce((sum, segment) => sum + Number(segment.days || segment.daysReportBySubsystem?.salud || 0), 0);
  check("case_B_normalized_30", Number(bEnginePeriod?.normalizedDays) === 30 && Number(bReportedDays) === 30, { period: bEnginePeriod, reportedDays: bReportedDays, social: b.social });

  const periodC = "mes:2026-03-01:2026-03-30";
  await consultPeriodInBrowser(page, "2026-03-01", "2026-03-30");
  await createAdjustmentInBrowser(page, fixture.employee.id, { period_key: periodC, uiType: "vacaciones_compensadas", date_start: "2026-03-30", date_end: "2026-03-30", days: 0, recognizedValue: 1000000, documentSupport: `cash://${suffix}/c` });
  await liquidatePeriodInBrowser(page, periodC);
  const c = await preview(token, "2026-03-01", "2026-03-30", periodC);
  check("case_C_total_ibc_exact", Number(c.social?.total_ibc) === 3000000, { total_ibc: c.social?.total_ibc });
  check("case_C_parafiscal_exact", (c.social?.lines || []).some((line) => Number(line.ibc) === 4000000 && ["CAJA_COMPENSACION", "SENA", "ICBF"].includes(line.entity_type)), { lines: c.social?.lines });

  const periodE = "mes:2026-04-01:2026-04-30";
  await consultPeriodInBrowser(page, "2026-04-01", "2026-04-30");
  const eAdjustment = await createAdjustmentInBrowser(page, fixture.employee.id, { period_key: periodE, uiType: "licencia_remunerada", date_start: "2026-04-21", date_end: "2026-04-30", days: 10, recognizedValue: 1000000, lrPolicy: "no_cotiza", reference: { amount: 3000000, period: "2026-03", capturedAt: "2026-04-01", support: `planilla://${suffix}/lr`, continuity: `lr-${suffix}`, source: "manual_reported_pila", id: `PILA-${suffix}-E` } });
  await liquidatePeriodInBrowser(page, periodE);
  const e = await preview(token, "2026-04-01", "2026-04-30", periodE);
  const eSegment = e.social?.employees?.[0]?.segment_result;
  const eArlLines = (e.social?.lines || []).filter((line) => line.entity_type === "ARL");
  check("case_E_lr_ibc_employee_exact", Number(e.social?.total_ibc) === 3000000 && Number(e.social?.total_employee) === 240000, { total_ibc: e.social?.total_ibc, total_employee: e.social?.total_employee });
  check("case_E_lr_arl_work_only", eArlLines.length === 1 && Number(eArlLines[0]?.ibc) === 2000000, { arl: eArlLines });
  const eLrSegment = eSegment?.segments?.find((segment) => segment.type === "LICENCIA_REMUNERADA");
  check("case_E_lr_policy_and_pila", eAdjustment?.metadata?.lr_arl_policy === "no_cotiza" && eLrSegment?.pila_code === "L" && Number(eLrSegment?.ibcAfter?.arl) === 0 && Number(eLrSegment?.daysContributing?.arl) === 0, { adjustment: eAdjustment, segment: eLrSegment });
  check("case_E_lr_parafiscal_exact", (e.social?.lines || []).some((line) => ["CAJA_COMPENSACION", "SENA", "ICBF"].includes(line.entity_type) && Number(line.ibc) === 3000000), { lines: e.social?.lines });

  await consultPeriodInBrowser(page, "2026-04-01", "2026-04-30");
  await setFormField(page, "Empleado", String(fixture.employee.id));
  await setFormField(page, "Tipo", "vacaciones_disfrutadas");
  await setFormField(page, "Fecha inicio novedad", "2026-04-01");
  await setFormField(page, "Fecha fin novedad", "2026-04-02");
  await setFormField(page, "Dias novedad", "2");
  const unsupportedWithoutReference = await page.evaluate(() => {
    const button = [...document.querySelectorAll("button")].find((item) => item.textContent?.includes("Agregar ajuste"));
    return { disabled: Boolean(button?.disabled), text: document.body.innerText };
  });
  check("historical_reference_without_support_blocked_in_browser", unsupportedWithoutReference.disabled === true, unsupportedWithoutReference);

  const periodD = "mes:2026-05-25:2026-06-05";
  const periodDMay = "mes:2026-05-01:2026-05-30";
  const periodDJune = "mes:2026-06-01:2026-06-30";
  await consultPeriodInBrowser(page, "2026-05-25", "2026-06-05");
  const dAdjustment = await createAdjustmentInBrowser(page, fixture.employee.id, { period_key: periodD, uiType: "vacaciones_disfrutadas", date_start: "2026-05-25", date_end: "2026-06-05", days: 11, recognizedValue: 880000, advanceObligation: "VACACIONES_SALUD", advancePeriod: periodDJune, advanceSupport: `retencion://${suffix}/d`, advanceHealth: 80000, advancePension: 80000, reference: { amount: 2400000, period: "2026-04", capturedAt: "2026-05-01", support: `planilla://${suffix}/d`, continuity: `cross-${suffix}` } });
  await consultPeriodInBrowser(page, "2026-05-01", "2026-05-30");
  await liquidatePeriodInBrowser(page, periodDMay);
  await consultPeriodInBrowser(page, "2026-06-01", "2026-06-30");
  await liquidatePeriodInBrowser(page, periodDJune);
  const dMay = await preview(token, "2026-05-01", "2026-05-30", periodDMay);
  const dJune = await preview(token, "2026-06-01", "2026-06-30", periodDJune);
  const dAgain = await preview(token, "2026-06-01", "2026-06-30", periodDJune);
  const dMaySegment = dMay.social?.employees?.[0]?.segment_result?.segments?.find((segment) => segment.type === "VAC_DISFRUTADAS");
  const dJuneSegment = dJune.social?.employees?.[0]?.segment_result?.segments?.find((segment) => segment.type === "VAC_DISFRUTADAS");
  const dAgainSegment = dAgain.social?.employees?.[0]?.segment_result?.segments?.find((segment) => segment.type === "VAC_DISFRUTADAS");
  check("case_D_cross_month_ibs_and_reference", Number(dMay.social?.total_ibc) === 2880000 && Number(dJune.social?.total_ibc) === 2900000 && Number(dMaySegment?.recognized) === 480000 && Number(dJuneSegment?.recognized) === 400000 && Number(dMaySegment?.reference?.monthlyAmount) === 2400000 && dMaySegment?.reference?.sourcePeriod === "2026-04" && Number(dJuneSegment?.reference?.monthlyAmount) === 2400000 && dJuneSegment?.reference?.sourcePeriod === "2026-04" && Number(dAgainSegment?.reference?.monthlyAmount) === 2400000, { may: dMaySegment, june: dJuneSegment, repeated: dAgainSegment, mayIbc: dMay.social?.total_ibc, juneIbc: dJune.social?.total_ibc });
  const dMayTotals = dMay.social?.employees?.[0]?.segment_result?.totals || {};
  const dJuneTotals = dJune.social?.employees?.[0]?.segment_result?.totals || {};
  const dAgainTotals = dAgain.social?.employees?.[0]?.segment_result?.totals || {};
  const dMayPayroll = findEmployee(dMay.payroll?.document || dMay.payroll, fixture.employee.id);
  const dJunePayroll = findEmployee(dJune.payroll?.document || dJune.payroll, fixture.employee.id);
  const dAgainPayroll = findEmployee(dAgain.payroll?.document || dAgain.payroll, fixture.employee.id);
  const dJunePayrollTotals = dJunePayroll?.source_summary?.ibc_segment_totals?.retentionsApplied || {};
  const dAgainPayrollTotals = dAgainPayroll?.source_summary?.ibc_segment_totals?.retentionsApplied || {};
  const dMaySalud = findPayrollLine(dMayPayroll, "DED_SALUD");
  const dJuneSalud = findPayrollLine(dJunePayroll, "DED_SALUD");
  const dJunePension = findPayrollLine(dJunePayroll, "DED_PENSION");
  const dAgainSalud = findPayrollLine(dAgainPayroll, "DED_SALUD");
  check("case_D_advance_same_period_once", Number(dMayTotals.retentionsApplied?.salud || 0) === 0 && Number(dJunePayrollTotals.salud || 0) === 80000 && Number(dJunePayrollTotals.pension || 0) === 80000 && Number(dAgainPayrollTotals.salud || 0) === 80000 && Number(dAgainPayrollTotals.pension || 0) === 80000, { socialMay: dMayTotals.retentionsApplied, payrollJune: dJunePayrollTotals, payrollRepeated: dAgainPayrollTotals });
  check("case_D_payroll_deductions_exact", Number(dMaySalud?.amount || 0) === -115200 && Number(dJuneSalud?.amount || 0) === -36000 && Number(dJunePension?.amount || 0) === -36000 && Number(dAgainSalud?.amount || 0) === -36000, { may: dMaySalud, juneSalud: dJuneSalud, junePension: dJunePension, repeated: dAgainSalud });
  const duplicateMetadata = { ...(dAdjustment?.metadata || {}), date_start: "2026-07-01", date_end: "2026-07-01", original_event_start: "2026-07-01", original_event_end: "2026-07-01", reference_source: "manual_reported_pila", reported_pila_id: `PILA-${suffix}-D2`, document_support: `planilla://${suffix}/d2`, frozen_historical_reference: { monthlyAmount: 2400000, sourcePeriod: "2026-04", capturedAt: "2026-05-01" }, advance_obligation_id: "VACACIONES_SALUD", advance_period: periodDJune, advance_support: `retencion://${suffix}/d2`, advance_retention_health: 80000, advance_retention_pension: 80000 };
  const duplicateAdvance = await api(token, "/api/v1/talento-humano/nomina/ajustes", { method: "POST", body: { employee_id: fixture.employee.id, period_key: "mes:2026-07-01:2026-07-30", adjustment_type: "vacaciones_disfrutadas", concept_code: "VACACIONES", amount: 880000, date_start: "2026-07-01", date_end: "2026-07-01", ibc_reference_amount: 2400000, ibc_reference_period: "2026-04", ibc_reference_captured_at: "2026-05-01", metadata: duplicateMetadata } });
  check("case_D_duplicate_advance_rejected", duplicateAdvance.status === 409 && duplicateAdvance.body?.code === "ANTICIPO_RETENCION_DUPLICADA", { status: duplicateAdvance.status, body: duplicateAdvance.body });
  const changedContinuityMetadata = { ...(dAdjustment?.metadata || {}), date_start: "2026-07-10", date_end: "2026-07-10", original_event_start: "2026-07-10", original_event_end: "2026-07-10", recognized_value: 80000, frozen_historical_reference: { monthlyAmount: 2500000, sourcePeriod: "2026-06", capturedAt: "2026-07-01" }, advance_obligation_id: undefined, advance_period: undefined, advance_support: undefined, advance_retentions: undefined };
  const changedContinuity = await api(token, "/api/v1/talento-humano/nomina/ajustes", { method: "POST", body: { employee_id: fixture.employee.id, period_key: "mes:2026-07-01:2026-07-30", adjustment_type: "vacaciones_disfrutadas", concept_code: "VACACIONES", amount: 80000, date_start: "2026-07-10", date_end: "2026-07-10", ibc_reference_amount: 2500000, ibc_reference_period: "2026-06", ibc_reference_captured_at: "2026-07-01", metadata: changedContinuityMetadata } });
  check("case_D_reference_change_same_continuity_rejected", changedContinuity.status === 409 && changedContinuity.body?.code === "IBC_REFERENCIA_INMUTABLE", { status: changedContinuity.status, body: changedContinuity.body });

  const invalidReference = await api(token, "/api/v1/talento-humano/nomina/ajustes", { method: "POST", body: { employee_id: fixture.employee.id, period_key: periodA, adjustment_type: "vacaciones", concept_code: "VACACIONES", date_start: "2026-01-01", date_end: "2026-01-02", days: 2, metadata: {} } });
  check("historical_reference_without_support_rejected", [400, 409, 422].includes(invalidReference.status), { status: invalidReference.status, body: invalidReference.body });

  const tenantLeak = await api(otherToken, `/api/v1/talento-humano/nomina/ajustes?period_key=${encodeURIComponent(periodA)}`);
  check("tenant_isolation_adjustments", tenantLeak.status === 200 && !JSON.stringify(tenantLeak.body).includes(fixture.employee.id) && !JSON.stringify(tenantLeak.body).includes(`IBC-${suffix}`), { status: tenantLeak.status, employeeId: fixture.employee.id });
  const limitedToken = await tokenFor({ email: fixture.limitedEmail, password: fixture.limitedPassword });
  const forbiddenWrite = await api(limitedToken, "/api/v1/talento-humano/aportes-sociales/documentos", { method: "POST", body: { fecha_inicio: "2026-01-01", fecha_fin: "2026-01-30", period_type: "mes", period_key: periodA } });
  check("rbac_payroll_write_denied", forbiddenWrite.status === 403, { status: forbiddenWrite.status, body: forbiddenWrite.body });
  await page.goto(`${webUrl}/dashboard/talento-humano/nomina`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForFunction(() => document.body?.innerText?.includes("Página cargada: talento humano · nomina") || document.body?.innerText?.includes("Nomina"), { timeout: 30000 });
  const payrollBody = await page.$eval("body", (node) => node.innerText);
  check("real_browser_payroll_page", page.url().endsWith("/dashboard/talento-humano/nomina") && (payrollBody.includes("Página cargada: talento humano · nomina") || payrollBody.includes("Nomina")), { url: page.url(), hasPayrollHeading: payrollBody.includes("Página cargada: talento humano · nomina") || payrollBody.includes("Nomina") });
}

async function main() {
  const apiHealth = await readHealth(); await waitFor(webUrl);
  const a = await seed(await register("a")); const b = await seed(await register("b"));
  const browser = await puppeteer.launch({ executablePath: browserPath, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(30000);
    const browserDiagnostics = [];
    page.on("console", (message) => { if (["error", "warning"].includes(message.type())) browserDiagnostics.push({ type: `console:${message.type()}`, text: message.text().slice(0, 500) }); });
    page.on("pageerror", (error) => browserDiagnostics.push({ type: "pageerror", text: String(error).slice(0, 500) }));
    page.on("requestfailed", (request) => browserDiagnostics.push({ type: "requestfailed", url: request.url().replace(/([?&](?:token|access_token|password)=)[^&]+/gi, "$1<redacted>"), failure: request.failure()?.errorText }));
    page.on("framenavigated", (frame) => { if (frame === page.mainFrame()) browserDiagnostics.push({ type: "navigation", url: frame.url() }); });
    try { await browserLogin(page, a); await certify(a, b, page); }
    catch (error) {
      const diagnosticsPath = path.join(evidenceDir, "browser-diagnostics.json");
      const screenshotPath = path.join(evidenceDir, "browser-failure.png");
      fs.mkdirSync(evidenceDir, { recursive: true });
      await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => undefined);
      fs.writeFileSync(diagnosticsPath, `${safe({ url: await page.url(), body: (await page.evaluate(() => document.body?.innerText || "").catch(() => "")).slice(0, 12000), browserDiagnostics })}\n`);
      error.message = `${error.message}; diagnostics=${diagnosticsPath}; screenshot=${screenshotPath}`;
      throw error;
    }
    const evidence = { version: 1, certification: "hr-ibc-novelties-browser-local", status: "passed", generated_at: new Date().toISOString(), ...sourceIdentity(apiHealth), api_health_commit: apiHealth.commit, api_health_version: apiHealth.version, api_url: apiUrl, web_url: webUrl, tenant_ids: [a.tenantId, b.tenantId], checks };
    fs.mkdirSync(evidenceDir, { recursive: true }); fs.writeFileSync(evidencePath, `${safe(evidence)}\n`); console.log(safe(evidence));
  } finally { await browser.close(); await db.$disconnect(); }
}
main().catch(async (error) => { await db.$disconnect().catch(() => undefined); const evidence = { version: 1, certification: "hr-ibc-novelties-browser-local", status: "failed", generated_at: new Date().toISOString(), error: String(error?.stack || error), checks }; fs.mkdirSync(evidenceDir, { recursive: true }); fs.writeFileSync(evidencePath, `${safe(evidence)}\n`); console.error(safe(evidence)); process.exitCode = 1; });
