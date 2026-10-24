/* Certificacion LOCAL versionada del flujo de saldos iniciales por lote (volumen 142 + adjunto).
 *
 * Sin mocks de resolucion: API loopback + PostgreSQL loopback + Chromium (si LOCAL_WEB_URL esta definido).
 * Registra DOS tenants reales via /auth/register (contador reinicia al cargar codigo antes de correr).
 *   tenant 1: flujo 142 real (validar + contabilizar + duplicado), reproduccion del adjunto y browser.
 *   tenant 2: aislamiento (cuenta extranjera registrada en el tenant 2, validada desde el tenant 1).
 *
 * Mide el numero de consultas real con core/performanceContext.runPerformanceContext + prisma.runWithTenant
 * sobre prepareOpeningBalanceRows del fixture 142 parseado. Imprime SOLO queryCount/duration (nunca SQL).
 */
process.env.NODE_ENV = "test";
if (!process.env.REDIS_URL) process.env.REDIS_URL = "redis://127.0.0.1:6379";
process.env.REDIS_DISABLED = "true";
process.env.DISABLE_REDIS = "true";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Module = require("node:module");
const { execFileSync } = require("node:child_process");

const root = path.resolve(__dirname, "../..");
const moduleRoots = ["node_modules", "apps/api/node_modules", "apps/web/node_modules"]
  .map((dir) => path.join(root, dir))
  .filter((dir) => fs.existsSync(dir));
process.env.NODE_PATH = [...moduleRoots, process.env.NODE_PATH].filter(Boolean).join(path.delimiter);
Module._initPaths();

const ExcelJS = require("exceljs");
const { PrismaClient } = require("@prisma/client");

const accountingService = require(path.join(root, "apps/api/src/modules/accounting/service.js"));
const prismaCore = require(path.join(root, "apps/api/src/core/prisma.js"));
const performanceContext = require(path.join(root, "apps/api/src/core/performanceContext.js"));

const LOOPBACK = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
function loopbackUrl(name, value) {
  let parsed = null;
  try { parsed = new URL(value); } catch { parsed = null; }
  if (!parsed || parsed.protocol !== "http:" || !LOOPBACK.has(parsed.hostname)) {
    throw new Error(`BLOQUEADO: ${name} debe ser una URL HTTP loopback.`);
  }
  return String(value).replace(/\/+$/, "");
}
function loopbackDb(raw) {
  let parsed = null;
  try { parsed = new URL(raw); } catch { parsed = null; }
  if (!parsed || !/^postgres(ql)?:$/.test(parsed.protocol) || !LOOPBACK.has(parsed.hostname)) {
    throw new Error("BLOQUEADO: DATABASE_URL debe apuntar a PostgreSQL loopback local.");
  }
  return raw;
}

const databaseUrl = loopbackDb(String(process.env.DATABASE_URL || ""));
const apiUrl = loopbackUrl("LOCAL_API_URL", process.env.LOCAL_API_URL || "http://127.0.0.1:3218");
const webUrl = process.env.LOCAL_WEB_URL ? loopbackUrl("LOCAL_WEB_URL", process.env.LOCAL_WEB_URL) : null;
const attachmentPath = process.env.OPENING_ATTACHMENT_PATH || "";
const output = path.resolve(root, process.env.VOLUME_EVIDENCE_PATH || "docs/qa/evidence/opening-balances-volume-20261023/volume-local.json");
const evidenceDir = path.dirname(output);
fs.mkdirSync(evidenceDir, { recursive: true });
const SOURCE_FILES = {
  api_service: "apps/api/src/modules/accounting/service.js",
  api_unit: "apps/api/test/accounting-opening-balances.test.js",
  volume_runner: "scripts/certifications/opening-balances-volume-local.js",
  nit_browser_runner: "scripts/certifications/opening-balances-nit-browser-local.js"
};

const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
const suffix = crypto.randomBytes(5).toString("hex");
const checks = [];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const SOCIETY = "SOC-VOL";
const BRANCH = "SUC-VOL";
const COST_CENTERS = Array.from({ length: 9 }, (_, index) => `CC-VOL-${String(index + 1).padStart(2, "0")}`);
const EXACT_NIT = "900255181";
const DATE_STR = "2026-01-31";
const SECOND_DATE = "2026-02-28";
// Cuentas hoja transaccionales (auxiliares), evitando los codigos de grupo del chart estandar.
const DEBIT_CODES = ["130505D1", "130505D2", "130505D3", "130505D4", "130505D5", "130505D6", "130505D7", "130505D8", "130505D9"];
const CREDIT_CODES = ["220505C1", "220505C2", "220505C3", "220505C4", "220505C5", "220505C6", "220505C7", "220505C8", "220505C9"];
const VOLUME_ROWS = 142;

function check(name, ok, detail = {}) {
  checks.push({ name, ok: Boolean(ok), detail });
  assert.ok(ok, `${name}: ${JSON.stringify(detail)}`);
}
function sha256(buffer) { return crypto.createHash("sha256").update(buffer).digest("hex"); }
function relative(file) { return path.relative(root, file).replace(/\\/g, "/"); }

function collectSources() {
  const sources = {};
  for (const [key, file] of Object.entries(SOURCE_FILES)) {
    try {
      const buffer = fs.readFileSync(path.join(root, file));
      sources[key] = { path: file, bytes: buffer.length, sha256: sha256(buffer) };
    } catch {
      sources[key] = { path: file, error: "unreadable" };
    }
  }
  return sources;
}

async function waitForServer(url, endpoints) {
  let lastError = null;
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(`${url}${endpoint}`, { signal: AbortSignal.timeout(5000) });
      if (response.ok) return;
      lastError = new Error(`${url}${endpoint} -> ${response.status}`);
    } catch (error) { lastError = error; }
  }
  throw lastError || new Error(`${url} no responde`);
}

function gitDiagnostics() {
  const topLevel = execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd: root, encoding: "utf8" }).trim();
  const branch = execFileSync("git", ["branch", "--show-current"], { cwd: root, encoding: "utf8" }).trim();
  const status = execFileSync("git", ["status", "--short"], { cwd: root, encoding: "utf8" });
  const remotes = execFileSync("git", ["remote", "-v"], { cwd: root, encoding: "utf8" }).trim();
  check("git_root_matches", fs.realpathSync(topLevel).toLowerCase() === fs.realpathSync(root).toLowerCase(), { topLevel });
  check("git_branch_desarrollo", branch === "desarrollo", { branch });
  check("git_four_diagnostics", [topLevel, branch, status, remotes].every((value) => typeof value === "string"), { dirty: status.split(/\r?\n/).filter(Boolean).length });
  return { commit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim() };
}

async function registerTenant(cfg) {
  const email = `${cfg.prefix}-${suffix}@apexos.local`;
  const password = `Volume-${suffix}9!`;
  const response = await fetch(`${apiUrl}/api/v1/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(90000),
    body: JSON.stringify({ company_name: `${cfg.prefix} ${suffix}`, industry: "qa", email, password, name: `${cfg.prefix} Admin`, country: "CO", timezone: "America/Bogota", currency: "COP", plan: "crown" })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`register_failed ${response.status} ${body.code || ""}`);
  const token = body.token;
  const tenantId = body.tenant?.id || body.user?.tenant_id;
  if (!token || !tenantId) throw new Error("register_missing_token_or_tenant");
  check(`${cfg.check}_registered_via_local_api`, true, { tenant_id: String(tenantId) });
  return { token, tenantId: String(tenantId), email, password };
}

async function configureOrg(token) {
  const units = [
    { type: "society", code: SOCIETY, name: "Sociedad volumen QA" },
    { type: "branch", code: BRANCH, name: "Sucursal volumen QA", society_code: SOCIETY },
    ...COST_CENTERS.map((code) => ({ type: "cost_center", code, name: `Centro ${code}`, society_code: SOCIETY, branch_code: BRANCH }))
  ];
  for (const unit of units) {
    const response = await fetch(`${apiUrl}/api/v1/accounting/organization-tree`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(30000),
      body: JSON.stringify(unit)
    });
    await response.text().catch(() => "");
    if (![200, 201].includes(response.status)) throw new Error(`org_tree_${unit.type}_failed ${response.status}`);
  }
  check("organization_tree_configured", true, { society: SOCIETY, branch: BRANCH, centers: COST_CENTERS.length });
}

async function seedAccounts(tenantId) {
  const parents = {};
  for (const code of ["130505", "1305", "220505", "2205"]) {
    parents[code] = await db.account.findFirst({ where: { tenant_id: tenantId, code } });
  }
  const debitParent = parents["130505"] || parents["1305"];
  const creditParent = parents["220505"] || parents["2205"];
  check("standard_chart_debit_credit_parents", Boolean(debitParent) && Boolean(creditParent), { debit_parent: debitParent?.code, credit_parent: creditParent?.code });

  const specs = [];
  for (const code of DEBIT_CODES) specs.push({ code, type: debitParent.type || "asset", parent: debitParent });
  for (const code of CREDIT_CODES) specs.push({ code, type: creditParent.type || "liability", parent: creditParent });

  const created = [];
  for (const spec of specs) {
    const data = { name: `Cuenta volumen ${spec.code}`, type: spec.type, parent_id: spec.parent?.id || null, level: spec.parent ? (spec.parent.level || 1) + 1 : 5, active: true, allows_tx: true };
    const existing = await db.account.findFirst({ where: { tenant_id: tenantId, code: spec.code } });
    created.push(existing ? await db.account.update({ where: { id: existing.id }, data: { active: true, allows_tx: true } }) : await db.account.create({ data: { tenant_id: tenantId, code: spec.code, ...data } }));
  }
  const uniqueCodes = [...new Set(created.map((account) => account.code))];
  check("18_accounts_seeded_transactional", uniqueCodes.length === 18 && created.every((account) => account.active === true && account.allows_tx === true), { accounts: uniqueCodes.length });
  return uniqueCodes;
}

async function seedParties(tenantId) {
  const exact = await db.party.create({ data: { tenant_id: tenantId, type: "customer", name: "Cliente NIT exacto volumen", tax_id: EXACT_NIT, active: true } });
  const legacy = await db.party.create({ data: { tenant_id: tenantId, type: "customer", name: "Cliente legacy numerico", tax_id: null, active: true } });
  const collisionTarget = await db.party.create({ data: { tenant_id: tenantId, type: "customer", name: "Colision target", tax_id: null, active: true } });
  const collisionNit = await db.party.create({ data: { tenant_id: tenantId, type: "customer", name: "Colision NIT", tax_id: String(collisionTarget.id), active: true } });
  check("parties_seeded", exact.tax_id === EXACT_NIT && legacy.tax_id === null && collisionNit.tax_id === String(collisionTarget.id), {
    exact_party_id: exact.id,
    legacy_party_id: legacy.id,
    collision_target_id: collisionTarget.id,
    collision_nit_party_id: collisionNit.id
  });
  return { exactPartyId: exact.id, legacyPartyId: legacy.id, collisionTargetId: collisionTarget.id, collisionNitPartyId: collisionNit.id };
}

function buildRows(accountCodes, dateStr, partyNit) {
  // 142 tuplas unicas: para la pareja k (0..70) debit/credit usan cuentas distintas y centro rotado.
  const rows = [];
  for (let k = 0; k < 71; k += 1) {
    const debitCode = DEBIT_CODES[k % 9];
    const creditCode = CREDIT_CODES[k % 9];
    const center = COST_CENTERS[(Math.floor(k / 9) + (k % 9)) % 9];
    const amount = 1000 + k;
    rows.push({ fecha_corte: dateStr, cuenta: debitCode, centro_costo: center, sucursal: BRANCH, saldo: amount, tercero: partyNit });
    rows.push({ fecha_corte: dateStr, cuenta: creditCode, centro_costo: center, sucursal: BRANCH, saldo: -amount, tercero: partyNit });
  }
  return rows;
}

async function writeFixture(rows, suffixTag) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Saldos iniciales");
  sheet.addRow(["Plantilla"]); sheet.addRow(["volumen 142 sintetico"]); sheet.addRow([""]);
  sheet.addRow(["fecha_corte", "cuenta", "centro_costo", "sucursal", "saldo", "tercero"]);
  rows.forEach((row) => sheet.addRow([row.fecha_corte, row.cuenta, row.centro_costo, row.sucursal, row.saldo, row.tercero]));
  const buffer = await workbook.xlsx.writeBuffer();
  const file = path.join(os.tmpdir(), `opening-volume-${suffixTag}.xlsx`);
  fs.writeFileSync(file, buffer);
  return { buffer, file, filename: `opening-volume-${suffixTag}.xlsx`, sha256: sha256(buffer) };
}

async function apiValidate(buffer, filename, token) {
  const form = new FormData();
  form.append("file", new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), filename);
  const started = process.hrtime.bigint();
  const response = await fetch(`${apiUrl}/api/v1/accounting/opening-balances/validate`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(120000),
    body: form
  });
  const ms = Number(process.hrtime.bigint() - started) / 1e6;
  return { status: response.status, ms, body: await response.json().catch(() => ({})) };
}
async function apiPost(buffer, filename, token) {
  const form = new FormData();
  form.append("file", new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), filename);
  const started = process.hrtime.bigint();
  const response = await fetch(`${apiUrl}/api/v1/accounting/opening-balances`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(120000),
    body: form
  });
  const ms = Number(process.hrtime.bigint() - started) / 1e6;
  return { status: response.status, ms, body: await response.json().catch(() => ({})) };
}

async function counts(tenantId) {
  const [docs, ledger] = await Promise.all([
    db.cntCabdoc.count({ where: { tenant_id: tenantId } }),
    db.ledgerEntry.count({ where: { tenant_id: tenantId } })
  ]);
  return { docs, ledger };
}

// Mide el numero de consultas reales de prepareOpeningBalanceRows sobre el fixture 142 parseado.
async function measureQueryCount(rows, tenantId) {
  const parsed = rows.map((row, index) => ({ ...row, excel_row: index + 5 }));
  let result = null;
  let context = null;
  await performanceContext.runPerformanceContext({}, async () => {
    await prismaCore.runWithTenant(tenantId, async () => {
      result = await accountingService.prepareOpeningBalanceRows(prismaCore, tenantId, parsed);
    });
    context = performanceContext.currentPerformanceContext();
  });
  return { queryCount: context ? context.queryCount : -1, queryTotalMs: context ? Number(context.queryTotalMs.toFixed(2)) : -1, preparedLines: result ? result.lines.length : -1 };
}

async function reproduceAttachment(token) {
  if (!attachmentPath) {
    check("attachment_reproduced_422_single_date", false, { reason: "OPENING_ATTACHMENT_PATH no definido" });
    return { skipped: true };
  }
  const stat = fs.statSync(attachmentPath);
  const buffer = fs.readFileSync(attachmentPath);
  const before = sha256(buffer);
  const result = await apiValidate(buffer, "saldos_iniciales_ejecutado_julio_2026.xlsx", token);
  const after = sha256(fs.readFileSync(attachmentPath));
  check("attachment_read_only_sha256_unchanged", before === after && stat.size === fs.statSync(attachmentPath).size, { sha256_unchanged: before === after });

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const dates = new Set();
  workbook.worksheets[0].eachRow((sheetRow, rowNumber) => {
    if (rowNumber <= 4) return;
    const value = sheetRow.getCell(1).value;
    let date = null;
    if (value instanceof Date) date = value;
    else if (value && typeof value === "object" && "result" in value && value.result instanceof Date) date = value.result;
    else if (value) { const d = new Date(String(value)); if (!Number.isNaN(d.getTime())) date = d; }
    if (date) dates.add(date.toISOString().slice(0, 10));
  });
  const distinctDates = [...dates];
  check("attachment_has_two_distinct_dates", distinctDates.length === 2, { dates: distinctDates });
  check("attachment_rejected_422_single_date", result.status === 422 && result.body.code === "OPENING_BALANCE_SINGLE_DATE", { status: result.status, code: result.body.code });
  check("attachment_rejected_no_500", result.status !== 500, { status: result.status });
  return { status: result.status, code: result.body.code, dates: distinctDates, latency_ms: Number(result.ms.toFixed(2)) };
}

async function login(page, email, password) {
  const pending = page.waitForResponse((response) => new URL(response.url()).pathname.endsWith("/api/v1/auth/login") && response.request().method() === "POST", { timeout: 45000 });
  await page.goto(`${webUrl}/login`, { waitUntil: "networkidle2" });
  for (const selector of ['input[name="email"]', 'input[name="password"]']) {
    await page.waitForSelector(selector, { visible: true, timeout: 45000 });
  }
  const ensureEmail = async () => {
    const sel = await page.evaluate(() => {
      const inputs = [...document.querySelectorAll("input")];
      const email = inputs.find((node) => (node.name || "").toLowerCase().includes("email") || (node.type || "").toLowerCase() === "email");
      const password = inputs.find((node) => (node.name || "").toLowerCase().includes("password") || (node.type || "").toLowerCase() === "password");
      return { email: email ? (email.name || email.type || "email") : null, password: password ? (password.name || password.type || "password") : null };
    });
    return sel;
  };
  const fields = await ensureEmail();
  const emailTarget = `input[name="${fields.email}"]`;
  const passwordTarget = `input[name="${fields.password}"]`;
  await page.click(emailTarget, { clickCount: 3 });
  await page.type(emailTarget, email);
  await page.click(passwordTarget, { clickCount: 3 });
  await page.type(passwordTarget, password);
  await page.click('form button[type="submit"]');
  try {
    const response = await pending;
    await page.waitForFunction(() => !location.pathname.endsWith("/login"), { timeout: 45000 });
    return response.status();
  } catch (error) {
    throw new Error(`login_failed: ${error.message}`);
  }
}

async function uploadValidUi(page, file) {
  await page.waitForFunction(() => {
    const input = document.querySelector('input[type="file"]');
    return Boolean(input && !input.disabled);
  }, { timeout: 20000 });
  const [chooser] = await Promise.all([page.waitForFileChooser({ timeout: 20000 }), page.click('input[type="file"]')]);
  await chooser.accept([file]);
  await page.waitForFunction(() => document.querySelector('input[type="file"]')?.files?.length === 1, { timeout: 20000 });
}
async function clickButton(page, label) {
  await page.waitForFunction((text) => [...document.querySelectorAll("button")].some((button) => (button.textContent || "").includes(text) && !button.disabled), { timeout: 20000 }, label);
  for (const button of await page.$$("button")) {
    const state = await button.evaluate((node) => ({ text: node.textContent || "", disabled: Boolean(node.disabled) }));
    if (state.text.includes(label) && !state.disabled) { await button.scrollIntoView(); await button.click(); return; }
  }
  throw new Error(`button_not_found:${label}`);
}

function safeError(error) {
  return { error_class: String(error?.constructor?.name || "Error"), message: String(error?.message || "").slice(0, 300) };
}
function writeEvidence(status, payload) {
  const evidence = {
    version: 2,
    certification: "opening-balances-volume-local",
    status: checks.some((item) => !item.ok) ? "failed" : status,
    scope: "local_api_prisma_browser_volume_and_attachment",
    generated_at: new Date().toISOString(),
    commit: payload.git?.commit || null,
    api_url: apiUrl,
    web_url: webUrl,
    database: "loopback",
    checks,
    ...payload
  };
  fs.mkdirSync(evidenceDir, { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`);
  if (evidence.status !== "passed") process.exitCode = 1;
  console.log(JSON.stringify({ certification: evidence.certification, status: evidence.status, evidence: relative(output), checks: checks.length, passed: checks.filter((c) => c.ok).length, failed: checks.filter((c) => !c.ok).length }));
}

async function main() {
  let git = null;
  let tenantId = null;
  let tenant2Id = null;
  try {
    git = gitDiagnostics();
    await waitForServer(apiUrl, ["/health", "/api/v1/health"]);
    await db.$connect();

    // --- Regla 4: segundo tenant (aislamiento + rol read-only via DB) NO se usa register extra; se registra 1 y 1 ---
    const t1 = await registerTenant({ prefix: "VolumeMain", check: "main_tenant" });
    tenantId = t1.tenantId;
    const t2 = await registerTenant({ prefix: "VolumeForeign", check: "foreign_tenant" });
    tenant2Id = t2.tenantId;
    check("two_tenants_registered", tenantId !== tenant2Id, { t1: tenantId, t2: tenant2Id });

    await configureOrg(t1.token);
    const accountCodes = await seedAccounts(tenantId);
    const parties = await seedParties(tenantId);

    const before = await counts(tenantId);
    check("volume_flow_starts_without_ledger", before.docs === 0 && before.ledger === 0, before);

    // Estados: legacy id numerico.
    const legacyRows = buildRows(accountCodes, DATE_STR, EXACT_NIT);
    const fixture = await writeFixture(legacyRows, suffix);

    // Validacion 142.
    const validation = await apiValidate(fixture.buffer, fixture.filename, t1.token);
    const totals = validation.body.totals || {};
    check("volume_validation_200_valid", validation.status === 200 && validation.body.valid === true, { status: validation.status, valid: validation.body.valid });
    check("volume_validation_exact_142_lines", Array.isArray(validation.body.lines) && validation.body.lines.length === VOLUME_ROWS, { lines: validation.body.lines?.length });
    check("volume_validation_balanced_totals", Number(totals.debit) === Number(totals.credit) && Number(totals.debit) > 0, { debit: totals.debit, credit: totals.credit });
    check("volume_validation_under_20s", validation.ms < 20000, { latency_ms: Number(validation.ms.toFixed(2)) });

    // Medición de consultas reales sobre el fixture parsed (loopback DB).
    const measurement = await measureQueryCount(legacyRows, tenantId);
    check("prepare_query_count_between_2_and_8", measurement.queryCount >= 2 && measurement.queryCount <= 8, { queryCount: measurement.queryCount, queryTotalMs: measurement.queryTotalMs });
    check("prepare_lines_exact_142", measurement.preparedLines === VOLUME_ROWS, { preparedLines: measurement.preparedLines });

    // Post real.
    const posting = await apiPost(fixture.buffer, fixture.filename, t1.token);
    const documentNumber = posting.body.accounting_document?.full_number;
    check("volume_post_201", posting.status === 201 && Boolean(documentNumber), { status: posting.status, document: documentNumber });
    check("volume_post_under_20s", posting.ms < 20000, { latency_ms: Number(posting.ms.toFixed(2)) });

    const document = documentNumber ? await db.cntCabdoc.findFirst({ where: { tenant_id: tenantId, full_number: documentNumber }, include: { lines: { orderBy: { line_no: "asc" } } } }) : null;
    const lines = document?.lines || [];
    check("volume_document_posted", Boolean(document) && document.status === "posted" && document.society_code === SOCIETY, { society: document?.society_code });
    check("volume_document_exact_142_lines", lines.length === VOLUME_ROWS, { lines: lines.length });
    check("volume_document_all_party_nit", lines.length === VOLUME_ROWS && lines.every((line) => line.party_tax_id === EXACT_NIT && line.party_id === parties.exactPartyId), { party_nit: EXACT_NIT, all_match: lines.every((line) => line.party_tax_id === EXACT_NIT) });

    const ledgerIds = lines.map((line) => line.ledger_entry_id).filter(Boolean);
    const ledger = await db.ledgerEntry.findMany({ where: { tenant_id: tenantId, id: { in: ledgerIds } } });
    check("volume_ledger_exact_142_balanced", ledger.length === VOLUME_ROWS && ledger.reduce((sum, entry) => sum + entry.debit, 0) === ledger.reduce((sum, entry) => sum + entry.credit, 0), { entries: ledger.length });

    const after = await counts(tenantId);
    check("volume_post_persisted_142_ledger", after.docs === 1 && after.ledger === VOLUME_ROWS, { after });

    // Duplicado.
    const duplicate = await apiPost(fixture.buffer, fixture.filename, t1.token);
    check("volume_duplicate_post_409", duplicate.status === 409 && duplicate.body.code === "OPENING_BALANCES_ALREADY_POSTED", { status: duplicate.status, code: duplicate.body.code });
    const afterDup = await counts(tenantId);
    check("volume_duplicate_no_extra_document", afterDup.docs === 1 && afterDup.ledger === VOLUME_ROWS, { afterDup });

    // --- NIT/collision regla 2: comprobar debit con party esperado y credit null por account_code ---
    async function twoLineFixture(debitParty, creditParty) {
      const wb = new ExcelJS.Workbook();
      const sh = wb.addWorksheet("Saldos iniciales");
      sh.addRow(["Plantilla"]); sh.addRow(["nit"]); sh.addRow([""]);
      sh.addRow(["fecha_corte", "cuenta", "centro_costo", "sucursal", "saldo", "tercero"]);
      sh.addRow([new Date(`${DATE_STR}T00:00:00.000Z`), DEBIT_CODES[0], COST_CENTERS[0], BRANCH, 1000, debitParty]);
      sh.addRow([new Date(`${DATE_STR}T00:00:00.000Z`), CREDIT_CODES[0], COST_CENTERS[0], BRANCH, -1000, creditParty]);
      return wb.xlsx.writeBuffer();
    }
    const nitBuffer = await twoLineFixture(EXACT_NIT, "");
    const nitResult = await apiValidate(nitBuffer, "nit.xlsx", t1.token);
    const nitLines = nitResult.body.lines || [];
    const nitDebit = nitLines.find((line) => line.account_code === DEBIT_CODES[0]);
    const nitCredit = nitLines.find((line) => line.account_code === CREDIT_CODES[0]);
    check("nit_exact_debit_resolved_credit_null", nitResult.status === 200 && nitResult.body.valid === true && nitDebit?.party_id === parties.exactPartyId && nitDebit?.party_tax_id === EXACT_NIT && nitCredit?.party_tax_id === null, { status: nitResult.status, debit_party_id: nitDebit?.party_id, credit_party_tax_id: nitCredit?.party_tax_id });

    const collisionBuffer = await twoLineFixture(String(parties.collisionTargetId), "");
    const collisionResult = await apiValidate(collisionBuffer, "collision.xlsx", t1.token);
    const collisionLines = collisionResult.body.lines || [];
    const collisionDebit = collisionLines.find((line) => line.account_code === DEBIT_CODES[0]);
    const collisionCredit = collisionLines.find((line) => line.account_code === CREDIT_CODES[0]);
    check("numeric_nit_collision_prefers_tax_id_credit_null", collisionResult.status === 200 && collisionResult.body.valid === true && collisionDebit?.party_id === parties.collisionNitPartyId && collisionDebit?.party_tax_id === String(parties.collisionTargetId) && collisionCredit?.party_tax_id === null, { status: collisionResult.status, debit_party_id: collisionDebit?.party_id, credit_party_tax_id: collisionCredit?.party_tax_id });

    // --- Regla 4: aislamiento (cuenta extranjera en tenant2) y rol read-only ---
    const foreignAccount = await db.account.create({ data: { tenant_id: tenant2Id, code: "1305AJENA", name: "Cuenta ajena volumen", type: "asset", active: true, allows_tx: true } });
    const foreignBuffer = await (async () => {
      const wb = new ExcelJS.Workbook();
      const sh = wb.addWorksheet("Saldos iniciales");
      sh.addRow(["Plantilla"]); sh.addRow([""]); sh.addRow([""]);
      sh.addRow(["fecha_corte", "cuenta", "centro_costo", "sucursal", "saldo", "tercero"]);
      sh.addRow([new Date(`${DATE_STR}T00:00:00.000Z`), "1305AJENA", COST_CENTERS[0], BRANCH, 1000, ""]);
      sh.addRow([new Date(`${DATE_STR}T00:00:00.000Z`), CREDIT_CODES[0], COST_CENTERS[0], BRANCH, -1000, ""]);
      return wb.xlsx.writeBuffer();
    })();
    // tenant2 no tiene org tree configurado -> branch/center no encontrará; usamos la cuenta ajena para aislar cuenta.
    const foreignResult = await apiValidate(foreignBuffer, "foreign.xlsx", t1.token);
    check("foreign_tenant_account_rejected", foreignResult.status === 404 && foreignResult.body.code === "OPENING_BALANCE_ACCOUNT_NOT_FOUND", { status: foreignResult.status, code: foreignResult.body.code });

    // Reproduccion del adjunto.
    const attachment = await reproduceAttachment(t1.token);

    // --- Browser completo ---
    let browser = null;
    let browserPayload = { skipped: true };
    if (webUrl) {
      try {
        const puppeteer = require("puppeteer-core");
        const browserPath = process.env.CHROME_BIN || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
        if (!fs.existsSync(browserPath)) throw new Error(`CHROME_BIN no existe: ${browserPath}`);
        await waitForServer(webUrl, ["/"]);
        browser = await puppeteer.launch({ executablePath: browserPath, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"] });
        const page = await browser.newPage();
        page.setDefaultTimeout(20000);
        page.setDefaultNavigationTimeout(60000);

        // 1) Adjunto -> mensaje single date claro, sin posting.
        if (attachmentPath) {
          const attachStatus = await login(page, t1.email, t1.password);
          check("browser_login_real_flow", attachStatus === 200, { status: attachStatus });
          await page.goto(`${webUrl}/dashboard/contabilidad/importar-saldos-iniciales`, { waitUntil: "networkidle2" });
          await uploadValidUi(page, attachmentPath);
          await clickButton(page, "Validar plantilla");
          // El rerender borra el alert previo: se espera el mensaje exacto del API antes de leerlo.
          await page.waitForFunction(() => {
            const alert = document.querySelector('[role="alert"]');
            return Boolean(alert && alert.innerText.toLowerCase().includes("una sola fecha"));
          }, { timeout: 45000 });
          const attachText = await page.$eval('[role="alert"]', (alert) => alert.innerText);
          check("browser_attachment_single_date_message", attachText.toLowerCase().includes("una sola fecha"), { alert: attachText.slice(0, 200) });
          await page.screenshot({ path: path.join(evidenceDir, "opening-volume-error.png"), fullPage: true });
        }

        // 2) Fixture valido 142 con fecha distinta (segundo archivo con hash unico).
        const secondFixture = await writeFixture(buildRows(accountCodes, SECOND_DATE, EXACT_NIT), suffix);
        await page.reload({ waitUntil: "networkidle2" });
        await page.goto(`${webUrl}/dashboard/contabilidad/importar-saldos-iniciales`, { waitUntil: "networkidle2" });
        await uploadValidUi(page, secondFixture.file);
        const validPending = page.waitForResponse((response) => new URL(response.url()).pathname.endsWith("/api/v1/accounting/opening-balances/validate") && response.request().method() === "POST", { timeout: 60000 });
        await clickButton(page, "Validar plantilla");
        const validResponse = await validPending;
        const validBody = await validResponse.json().catch(() => ({}));
        check("browser_volume_preview_142", validResponse.status() === 200 && validBody.valid === true && (validBody.lines || []).length === VOLUME_ROWS, { status: validResponse.status(), lines: validBody.lines?.length });
        await page.screenshot({ path: path.join(evidenceDir, "opening-volume-desktop.png"), fullPage: true });

        // 3) Confirmar dialogo + post 201 + banner.
        const postPending = page.waitForResponse((response) => new URL(response.url()).pathname.endsWith("/api/v1/accounting/opening-balances") && response.request().method() === "POST", { timeout: 60000 });
        let dialogAccepted = false;
        page.once("dialog", async (dialog) => { dialogAccepted = true; await dialog.accept(); });
        await clickButton(page, "Confirmar contabilización");
        const postResponse = await postPending;
        const postBody = await postResponse.json().catch(() => ({}));
        check("browser_confirm_dialog_accepted", dialogAccepted, { accepted: dialogAccepted });
        check("browser_post_201", postResponse.status() === 201 && Boolean(postBody.accounting_document?.full_number), { status: postResponse.status(), document: postBody.accounting_document?.full_number });
        await page.waitForFunction(() => document.body.innerText.includes("Saldos contabilizados"), { timeout: 60000 });
        await page.screenshot({ path: path.join(evidenceDir, "opening-volume-posted.png"), fullPage: true });

        const secondDocNumber = postBody.accounting_document?.full_number;
        const secondDoc = secondDocNumber ? await db.cntCabdoc.findFirst({ where: { tenant_id: tenantId, full_number: secondDocNumber }, include: { lines: true } }) : null;
        check("browser_volume_posted_142_balanced", Boolean(secondDoc) && (secondDoc.lines || []).length === VOLUME_ROWS, { document: secondDocNumber, lines: secondDoc?.lines?.length });

        const afterBrowser = await counts(tenantId);
        check("browser_volume_no_extra_document", afterBrowser.docs === 2, { afterBrowser });

        browserPayload = { done: true, document: secondDocNumber };
      } catch (error) {
        check("browser_flow", false, { reason: safeError(error).message });
        browserPayload = { done: false, reason: safeError(error).message };
      } finally {
        if (browser) await browser.close().catch(() => undefined);
      }
    } else {
      check("browser_flow", false, { reason: "LOCAL_WEB_URL no definido" });
    }

    return {
      sources: collectSources(),
      git,
      fixture: { rows: VOLUME_ROWS, accounts: accountCodes.length, centers: COST_CENTERS.length },
      latencies: { validate_ms: Number(validation.ms.toFixed(2)), post_ms: Number(posting.ms.toFixed(2)) },
      queries: { prepare_query_count: measurement.queryCount, prepare_query_total_ms: measurement.queryTotalMs },
      document: documentNumber,
      parties: { exact_party_id: parties.exactPartyId, legacy_party_id: parties.legacyPartyId, collision_target_id: parties.collisionTargetId, collision_nit_party_id: parties.collisionNitPartyId },
      foreign_account_id: foreignAccount.id,
      attachment: attachment || { skipped: true },
      browser: browserPayload
    };
  } finally {
    await prismaCore.$disconnect().catch(() => undefined);
    await db.$disconnect().catch(() => undefined);
  }
}

main()
  .then((payload) => writeEvidence("passed", payload))
  .catch((error) => writeEvidence("failed", { error: safeError(error), sources: collectSources() }));
