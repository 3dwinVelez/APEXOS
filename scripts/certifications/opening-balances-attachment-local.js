/* Local-only reproduction runner for the opening-balances attachment incident.
 * Requires a migrated loopback PostgreSQL, a patched local API, and the user-provided
 * workbook path in OPENING_ATTACHMENT_PATH. The workbook is read-only and never copied to disk.
 */
const crypto = require("node:crypto");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "../..");
const MODULE_ROOTS = ["node_modules", "apps/api/node_modules", "apps/web/node_modules"]
  .map((dir) => path.join(ROOT, dir))
  .filter((dir) => fs.existsSync(dir));
process.env.NODE_PATH = [...MODULE_ROOTS, process.env.NODE_PATH].filter(Boolean).join(path.delimiter);
Module._initPaths();

const ExcelJS = require("exceljs");
const { PrismaClient } = require("@prisma/client");

const EVIDENCE_REL = "docs/qa/evidence/opening-balances-attachment-20261021/reproduction.json";
const OUTPUT = path.resolve(ROOT, EVIDENCE_REL);
const SERVICE_REL = "apps/api/src/modules/accounting/service.js";
const SCRIPT_REL = "scripts/certifications/opening-balances-attachment-local.js";
const HEADER_ROW = 4;
const DATA_ROW = 5;
const REQUIRED_HEADERS = ["fecha_corte", "cuenta", "centro_costo", "sucursal", "saldo"];
const PARTY_HEADER = "tercero";
const INT_MAX = 2147483647;
const STANDARD_CHART_MIN = 2502;
const SOCIETY_CODE = "ATTACH-SOC";
const LOOPBACK = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

const checks = [];
let phase = "startup";
let gitSnapshot = null;
let attachmentInfo = null;
let legacyInfo = null;
let originalInfo = null;
let balancedInfo = null;
let persistenceInfo = null;

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}
function relative(file) {
  return path.relative(ROOT, file).replace(/\\/g, "/");
}
function fail(name) {
  const error = new Error(name);
  error.name = "CertificationError";
  error.safe = true;
  error.check = name;
  throw error;
}
function check(name, ok, detail = {}) {
  checks.push({ name, ok: Boolean(ok), detail });
  if (!ok) fail(name);
}

function git(args) {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
}
function gitDiagnostics() {
  const topLevel = git(["rev-parse", "--show-toplevel"]);
  const branch = git(["branch", "--show-current"]);
  const status = git(["status", "--short"]);
  const remotes = git(["remote", "-v"]);
  const rootMatches = fs.realpathSync(topLevel).toLowerCase() === fs.realpathSync(ROOT).toLowerCase();
  gitSnapshot = {
    branch,
    commit: git(["rev-parse", "HEAD"]),
    dirty_entries: status ? status.split(/\r?\n/).filter(Boolean).length : 0,
    status_before: status
  };
  check("git_root_matches_repository", rootMatches, { matches: rootMatches });
  check("git_branch_is_desarrollo", branch === "desarrollo", { branch });
  check("git_four_diagnostics_completed", typeof topLevel === "string" && typeof status === "string" && typeof remotes === "string", { dirty_entries: gitSnapshot.dirty_entries });
  return gitSnapshot;
}

function loopbackHttpUrl(name, raw) {
  let parsed = null;
  try { parsed = new URL(raw); } catch { parsed = null; }
  if (!parsed || parsed.protocol !== "http:" || !LOOPBACK.has(parsed.hostname)) {
    fail(`${name}_must_be_loopback_http`);
  }
  if (parsed.username || parsed.password) fail(`${name}_must_not_embed_credentials`);
  return String(raw).replace(/\/+$/, "");
}
function loopbackDatabaseUrl(raw) {
  if (!raw) fail("database_url_required");
  let parsed = null;
  try { parsed = new URL(raw); } catch { parsed = null; }
  if (!parsed || !/^postgres(ql)?:$/.test(parsed.protocol) || !LOOPBACK.has(parsed.hostname)) {
    fail("database_url_must_be_loopback_postgres");
  }
  return raw;
}

function loadAttachment() {
  const raw = String(process.env.OPENING_ATTACHMENT_PATH || "").trim();
  if (!raw) fail("opening_attachment_path_required");
  if (!/\.xlsx$/i.test(raw)) fail("opening_attachment_must_be_xlsx");
  const file = path.resolve(raw);
  let stat = null;
  try { stat = fs.statSync(file); } catch { stat = null; }
  if (!stat || !stat.isFile()) fail("opening_attachment_not_found");
  const buffer = fs.readFileSync(file);
  if (!buffer.length) fail("opening_attachment_empty");
  return { file, buffer, bytes: buffer.length, sha256: sha256(buffer) };
}

function normalizeHeader(value) {
  return String(value ?? "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "_");
}
function selectSheet(workbook) {
  const sheet = workbook.worksheets.find((candidate) => normalizeHeader(candidate.name) === "saldos_iniciales") || workbook.worksheets[0];
  if (!sheet) fail("attachment_has_no_worksheets");
  return sheet;
}
function headerColumnMap(sheet) {
  const columns = new Map();
  sheet.getRow(HEADER_ROW).values.slice(1).forEach((value, index) => {
    const header = normalizeHeader(value);
    if (header && !columns.has(header)) columns.set(header, index + 1);
  });
  return columns;
}
function cellIsEmpty(value) {
  if (value === null || value === undefined) return true;
  if (value instanceof Date) return false;
  if (typeof value === "object") {
    if (Array.isArray(value.richText)) return value.richText.every((part) => !String(part.text || "").trim());
    if ("text" in value) return String(value.text || "").trim() === "";
    if ("result" in value) return cellIsEmpty(value.result);
    return false;
  }
  return String(value).trim() === "";
}
function cellText(value) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    if (Array.isArray(value.richText)) return value.richText.map((part) => String(part.text || "")).join("").trim();
    if ("text" in value) return String(value.text || "").trim();
    if ("result" in value) return cellText(value.result);
  }
  return String(value).trim();
}
function parseCents(value) {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) fail("attachment_saldo_invalid");
    return Math.round(value * 100);
  }
  if (value && typeof value === "object" && "result" in value) return parseCents(value.result);
  const raw = String(value ?? "").trim().replace(/\s/g, "").replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(",", ".");
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(raw)) fail("attachment_saldo_invalid");
  const cents = Math.round(Number(raw) * 100);
  if (!Number.isSafeInteger(cents)) fail("attachment_saldo_out_of_range");
  return cents;
}
function inferDate(value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(Math.round((value - 25569) * 86400000));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (value && typeof value === "object" && "result" in value) return inferDate(value.result);
  const raw = cellText(value);
  if (!raw) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/.exec(raw);
  if (iso) {
    const date = new Date(`${iso[1]}-${iso[2]}-${iso[3]}T00:00:00.000Z`);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const dayFirst = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(raw);
  if (dayFirst) {
    const date = new Date(Date.UTC(Number(dayFirst[3]), Number(dayFirst[2]) - 1, Number(dayFirst[1])));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
function collectDataRows(sheet, columns) {
  const rows = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber <= HEADER_ROW) return;
    const values = {};
    for (const [header, column] of columns) values[header] = row.getCell(column).value;
    if (Object.values(values).some((value) => !cellIsEmpty(value))) rows.push({ rowNumber, values });
  });
  return rows;
}

async function parseAttachment(buffer) {
  const workbook = new ExcelJS.Workbook();
  try { await workbook.xlsx.load(buffer); } catch { fail("attachment_unreadable_workbook"); }
  const sheet = selectSheet(workbook);
  const rawHeaders = sheet.getRow(HEADER_ROW).values.slice(1).map(normalizeHeader).filter(Boolean);
  const duplicateHeaders = rawHeaders.filter((header, index) => rawHeaders.indexOf(header) !== index);
  check("attachment_headers_unique", duplicateHeaders.length === 0, { duplicates: duplicateHeaders.length });
  const columns = headerColumnMap(sheet);
  const required = [...REQUIRED_HEADERS, PARTY_HEADER];
  const missing = required.filter((header) => !columns.has(header));
  check("attachment_headers_complete", missing.length === 0, { required: required.length, missing: missing.length });

  const data = collectDataRows(sheet, columns);
  check("attachment_single_data_row_at_row_5", data.length === 1 && data[0].rowNumber === DATA_ROW, { rows: data.length, first_row: data[0]?.rowNumber ?? null });

  const values = data[0].values;
  const date = inferDate(values.fecha_corte);
  const account = cellText(values.cuenta);
  const branch = cellText(values.sucursal);
  const center = cellText(values.centro_costo);
  const party = cellText(values[PARTY_HEADER]);
  const cents = parseCents(values.saldo);
  check("attachment_date_inferred", Boolean(date), { inferred: Boolean(date) });
  check("attachment_identifiers_inferred", Boolean(account) && Boolean(branch) && Boolean(center), { account: Boolean(account), branch: Boolean(branch), center: Boolean(center) });
  check("attachment_party_present", Boolean(party), { present: Boolean(party) });
  check("attachment_saldo_nonzero", cents !== 0, { nonzero: cents !== 0 });

  return { sheetName: sheet.name, columnCount: columns.size, rowCount: data.length, row: values, date, account, branch, center, party, cents };
}

async function registerTenant(apiUrl) {
  const suffix = crypto.randomBytes(5).toString("hex");
  const response = await fetch(`${apiUrl}/api/v1/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(60000),
    body: JSON.stringify({
      company_name: `Opening Attachment ${suffix}`,
      industry: "qa",
      email: `opening-attachment-${suffix}@apexos.local`,
      password: `Attach-${suffix}-9!`,
      name: "Opening Attachment Admin",
      country: "CO",
      timezone: "America/Bogota",
      currency: "COP",
      plan: "crown"
    })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) fail("registration_failed");
  const token = body.token;
  const tenantId = body.tenant?.id || body.user?.tenant_id;
  if (!token || !tenantId) fail("registration_missing_token_or_tenant");
  check("tenant_registered_via_local_api", true, { status: response.status });
  return { token, tenantId: String(tenantId) };
}

async function ensureStandardChart(db, apiUrl, token, tenantId) {
  let accounts = await db.account.count({ where: { tenant_id: tenantId } });
  let initialized = false;
  if (accounts < STANDARD_CHART_MIN) {
    const response = await fetch(`${apiUrl}/api/v1/accounting/chart/init`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(120000),
      body: JSON.stringify({ country: "CO" })
    });
    await response.text().catch(() => "");
    if (![200, 201].includes(response.status)) fail("chart_initialization_failed");
    initialized = true;
    accounts = await db.account.count({ where: { tenant_id: tenantId } });
  }
  check("standard_chart_ready", accounts >= STANDARD_CHART_MIN, { accounts, initialized });
}

async function configureOrganizationTree(apiUrl, token, branch, center) {
  const units = [
    { type: "society", code: SOCIETY_CODE, name: "Sociedad adjunto QA" },
    { type: "branch", code: branch, name: "Sucursal adjunto QA", society_code: SOCIETY_CODE },
    { type: "cost_center", code: center, name: "Centro adjunto QA", society_code: SOCIETY_CODE, branch_code: branch }
  ];
  const statuses = [];
  for (const unit of units) {
    const response = await fetch(`${apiUrl}/api/v1/accounting/organization-tree`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(30000),
      body: JSON.stringify(unit)
    });
    await response.text().catch(() => "");
    statuses.push(response.status);
    if (![200, 201].includes(response.status)) fail("organization_tree_configuration_failed");
  }
  check("organization_tree_configured", statuses.length === 3, { statuses });
}

async function seedLeafAccount(db, tenantId, code) {
  const exact = await db.account.findFirst({ where: { tenant_id: tenantId, code } });
  if (exact) {
    const account = await db.account.update({ where: { id: exact.id }, data: { active: true, allows_tx: true } });
    return { account, created: false, parentFound: Boolean(account.parent_id) };
  }
  const prefixes = [...new Set([1, 2, 4, 6, 8, 10].filter((length) => length < code.length).map((length) => code.slice(0, length)))];
  const parents = prefixes.length
    ? await db.account.findMany({ where: { tenant_id: tenantId, code: { in: prefixes }, active: true } })
    : [];
  const parent = parents
    .filter((candidate) => code.startsWith(candidate.code))
    .sort((left, right) => (right.code.length - left.code.length) || ((right.level || 0) - (left.level || 0)))[0];
  if (!parent) fail("suitable_account_parent_not_found");
  const account = await db.account.create({
    data: {
      tenant_id: tenantId,
      code,
      name: "Cuenta saldos adjuntos",
      type: parent.type,
      parent_id: parent.id,
      level: (parent.level || 1) + 1,
      active: true,
      allows_tx: true
    }
  });
  return { account, created: true, parentFound: true };
}

async function seedParty(db, tenantId, taxId) {
  const existing = await db.party.findFirst({ where: { tenant_id: tenantId, tax_id: taxId } });
  if (existing) return db.party.update({ where: { id: existing.id }, data: { active: true } });
  return db.party.create({ data: { tenant_id: tenantId, type: "supplier", name: "Tercero adjunto QA", tax_id: taxId, active: true } });
}

async function counts(db, tenantId) {
  const [documents, ledger] = await Promise.all([
    db.cntCabdoc.count({ where: { tenant_id: tenantId } }),
    db.ledgerEntry.count({ where: { tenant_id: tenantId } })
  ]);
  return { documents, ledger };
}

async function validateOpening(apiUrl, token, buffer) {
  const form = new FormData();
  form.append("file", new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), "opening-balances-attachment.xlsx");
  const response = await fetch(`${apiUrl}/api/v1/accounting/opening-balances/validate`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
    signal: AbortSignal.timeout(120000)
  });
  const body = await response.json().catch(() => ({}));
  const message = [body.error, body.message].filter((value) => typeof value === "string").join(" ");
  return { status: response.status, code: body.code || null, message, body };
}

function sameCellValue(left, right) {
  if (left instanceof Date || right instanceof Date) {
    const leftTime = left instanceof Date ? left.getTime() : new Date(String(left)).getTime();
    const rightTime = right instanceof Date ? right.getTime() : new Date(String(right)).getTime();
    return Number.isFinite(leftTime) && leftTime === rightTime;
  }
  return String(left ?? "") === String(right ?? "");
}
async function verifyBalancedCopy(buffer, parsed) {
  const workbook = new ExcelJS.Workbook();
  try { await workbook.xlsx.load(buffer); } catch { fail("balanced_copy_unreadable"); }
  const sheet = selectSheet(workbook);
  const columns = headerColumnMap(sheet);
  const data = collectDataRows(sheet, columns);
  const rowsOk = data.length === 2 && data[0].rowNumber === DATA_ROW && data[1].rowNumber === DATA_ROW + 1;
  const datePreserved = rowsOk && sameCellValue(sheet.getCell(6, columns.get("fecha_corte")).value, parsed.row.fecha_corte);
  const identifiersPreserved = rowsOk && ["cuenta", "sucursal", "centro_costo", PARTY_HEADER]
    .every((header) => sameCellValue(sheet.getCell(6, columns.get(header)).value, sheet.getCell(5, columns.get(header)).value));
  const saldoValue = Number(sheet.getCell(6, columns.get("saldo")).value);
  const oppositeCents = Number.isFinite(saldoValue) && Math.round(saldoValue * 100) === -parsed.cents;
  check("balanced_copy_verified_in_memory", rowsOk && datePreserved && identifiersPreserved && oppositeCents, {
    rows: data.length,
    date_preserved: datePreserved,
    identifiers_preserved: identifiersPreserved,
    opposite_cents: oppositeCents
  });
}
async function buildBalancedCopy(buffer, parsed) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = selectSheet(workbook);
  const columns = headerColumnMap(sheet);
  for (const [header, column] of columns) {
    const target = sheet.getCell(DATA_ROW + 1, column);
    target.value = sheet.getCell(DATA_ROW, column).value;
    target.numFmt = sheet.getCell(DATA_ROW, column).numFmt || target.numFmt;
    if (header === PARTY_HEADER) target.numFmt = "@";
  }
  const saldoColumn = columns.get("saldo");
  sheet.getCell(DATA_ROW + 1, saldoColumn).value = -(parsed.cents / 100);
  sheet.getCell(DATA_ROW + 1, saldoColumn).numFmt = sheet.getCell(DATA_ROW, saldoColumn).numFmt || "#,##0.00";
  sheet.getCell(DATA_ROW + 1, columns.get("fecha_corte")).numFmt = sheet.getCell(DATA_ROW, columns.get("fecha_corte")).numFmt || "yyyy-mm-dd";
  const balanced = Buffer.from(await workbook.xlsx.writeBuffer());
  await verifyBalancedCopy(balanced, parsed);
  return balanced;
}

function hashSource(rel) {
  try {
    const buffer = fs.readFileSync(path.join(ROOT, rel));
    return { path: rel, bytes: buffer.length, sha256: sha256(buffer) };
  } catch {
    return { path: rel, bytes: null, sha256: null };
  }
}
function collectSources() {
  return { service: hashSource(SERVICE_REL), script: hashSource(SCRIPT_REL) };
}
function safeError(error) {
  return {
    error_class: String(error?.constructor?.name || "Error"),
    failed_check: error && error.safe === true ? String(error.check || "") : null
  };
}

function writeEvidence(status, payload = {}) {
  const evidence = {
    version: 2,
    certification: "opening-balances-attachment-local",
    status,
    scope: "LOCALONLY",
    local_only: true,
    generated_at: new Date().toISOString(),
    last_phase: phase,
    git: gitSnapshot ? { branch: gitSnapshot.branch, commit: gitSnapshot.commit, dirty_entries: gitSnapshot.dirty_entries } : null,
    attachment: attachmentInfo,
    legacy_reproduction: legacyInfo,
    original_validation: originalInfo,
    balanced_validation: balancedInfo,
    persistence: persistenceInfo,
    sources: collectSources(),
    checks,
    ...payload
  };
  try {
    fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
    fs.writeFileSync(OUTPUT, `${JSON.stringify(evidence, null, 2)}\n`);
    if (status !== "passed" || checks.some((item) => !item.ok)) process.exitCode = 1;
    console.log(JSON.stringify({
      status: evidence.status,
      scope: evidence.scope,
      evidence: relative(OUTPUT),
      checks: checks.length,
      passed: checks.filter((item) => item.ok).length,
      failed: checks.filter((item) => !item.ok).length
    }));
  } catch (error) {
    process.exitCode = 1;
    console.log(JSON.stringify({ status: "failed", scope: "LOCALONLY", evidence_written: false, error_class: safeError(error).error_class }));
  }
}

async function main() {
  phase = "git_diagnostics";
  gitDiagnostics();

  phase = "environment_guards";
  const databaseUrl = loopbackDatabaseUrl(String(process.env.DATABASE_URL || ""));
  check("database_url_loopback_guard", true, { loopback: true });
  const apiUrl = loopbackHttpUrl("local_api_url", process.env.LOCAL_API_URL || "http://127.0.0.1:3215");
  check("local_api_url_loopback_guard", true, { loopback: true });

  phase = "attachment_read";
  const attachment = loadAttachment();
  attachmentInfo = { bytes: attachment.bytes, sha256: attachment.sha256, rows: null, data_row: DATA_ROW, sha256_unchanged: null };
  check("attachment_read_local", true, { bytes: attachment.bytes });
  const parsed = await parseAttachment(attachment.buffer);
  attachmentInfo.rows = parsed.rowCount;

  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    await db.$connect();

    phase = "registration";
    const registration = await registerTenant(apiUrl);
    const tenant = await db.tenant.findUnique({ where: { id: registration.tenantId } });
    check("registered_tenant_visible_in_local_database", Boolean(tenant), { found: Boolean(tenant) });

    phase = "chart";
    await ensureStandardChart(db, apiUrl, registration.token, registration.tenantId);

    phase = "organization_tree";
    await configureOrganizationTree(apiUrl, registration.token, parsed.branch, parsed.center);

    phase = "account_seed";
    const accountSeed = await seedLeafAccount(db, registration.tenantId, parsed.account);
    check("transactional_leaf_account_ready", accountSeed.account.active === true && accountSeed.account.allows_tx === true && (accountSeed.created ? accountSeed.parentFound : true), {
      created: accountSeed.created,
      parent_found: accountSeed.parentFound,
      active: accountSeed.account.active,
      allows_tx: accountSeed.account.allows_tx
    });

    phase = "party_seed";
    const party = await seedParty(db, registration.tenantId, parsed.party);
    check("party_seeded_active_exact_tax_id", party.active === true && party.tax_id === parsed.party, { active: party.active, exact_tax_id: party.tax_id === parsed.party });
    const exactPartyMatches = await db.party.count({ where: { tenant_id: registration.tenantId, tax_id: parsed.party, active: true } });
    check("party_exact_tax_id_unique_for_tenant", exactPartyMatches === 1, { matches: exactPartyMatches });

    phase = "counts_before";
    const before = await counts(db, registration.tenantId);
    check("validation_start_counts_zero", before.documents === 0 && before.ledger === 0, { documents: before.documents, ledger: before.ledger });

    phase = "legacy_query";
    const numericPartyId = Number(parsed.party);
    const rangeByValue = Number.isFinite(numericPartyId) && numericPartyId > INT_MAX;
    let legacyThrew = false;
    let legacyErrorClass = null;
    try {
      await db.party.findFirst({ where: { id: numericPartyId, tenant_id: registration.tenantId } });
    } catch (error) {
      legacyThrew = true;
      legacyErrorClass = String(error?.constructor?.name || "Error");
    }
    legacyInfo = { query_threw: legacyThrew, error_class: legacyErrorClass, range_exceeded: rangeByValue };
    check("legacy_query_reproduces_prisma_range_error", legacyThrew && rangeByValue && String(legacyErrorClass).includes("Prisma"), legacyInfo);

    phase = "original_validation";
    const totalDifference = Math.abs(parsed.cents) / 100;
    const original = await validateOpening(apiUrl, registration.token, attachment.buffer);
    const controlled422 = original.status === 422 && original.code === "OPENING_BALANCE_UNBALANCED";
    originalInfo = { status: original.status, code: original.code, total_difference: totalDifference, controlled_422: controlled422, not_500: original.status !== 500 };
    check("original_validation_not_500", original.status !== 500, { status: original.status });
    check("original_validation_controlled_422", controlled422, { status: original.status, code: original.code });
    const differenceMatches = original.message.includes(totalDifference.toFixed(2));
    check("original_difference_matches_sheet_total", differenceMatches, { total_difference: totalDifference, message_matches: differenceMatches });

    phase = "balanced_copy";
    const balancedBuffer = await buildBalancedCopy(attachment.buffer, parsed);

    phase = "balanced_validation";
    const balanced = await validateOpening(apiUrl, registration.token, balancedBuffer);
    const balancedBody = balanced.body || {};
    const balancedLines = Array.isArray(balancedBody.lines) ? balancedBody.lines : [];
    const totalsPresent = Boolean(balancedBody.totals) && typeof balancedBody.totals === "object";
    const debit = totalsPresent ? Number(balancedBody.totals.debit) : null;
    const credit = totalsPresent ? Number(balancedBody.totals.credit) : null;
    const fileHashMatches = balancedBody.file_hash === sha256(balancedBuffer);
    balancedInfo = {
      status: balanced.status,
      valid: balancedBody.valid === true,
      lines: balancedLines.length,
      totals: { debit: Number.isFinite(debit) ? debit : null, credit: Number.isFinite(credit) ? credit : null },
      file_hash_matches: fileHashMatches
    };
    check("balanced_validation_200_valid", balanced.status === 200 && balancedBody.valid === true, { status: balanced.status, valid: balancedBody.valid === true });
    check("balanced_validation_file_hash", fileHashMatches, { file_hash_matches: fileHashMatches });
    check("balanced_totals_net_zero", totalsPresent && debit === 0 && credit === 0, { debit: balancedInfo.totals.debit, credit: balancedInfo.totals.credit, totals_present: totalsPresent });
    const exactPartyOnLines = balancedLines.every((line) => line.party_id === party.id && String(line.party_tax_id) === parsed.party);
    check("balanced_exact_tax_id_resolved", exactPartyOnLines && balanced.status === 200 && balancedBody.valid === true, {
      status: balanced.status,
      lines: balancedLines.length,
      resolution: "exact_tax_id"
    });

    phase = "counts_after";
    const after = await counts(db, registration.tenantId);
    persistenceInfo = {
      documents_before: before.documents,
      documents_after: after.documents,
      ledger_before: before.ledger,
      ledger_after: after.ledger,
      zero_after: after.documents === 0 && after.ledger === 0
    };
    check("validation_writes_no_documents_or_ledger", after.documents === 0 && after.ledger === 0, { documents: after.documents, ledger: after.ledger });

    phase = "attachment_integrity";
    const finalBuffer = fs.readFileSync(attachment.file);
    const finalSha256 = sha256(finalBuffer);
    attachmentInfo.sha256_unchanged = finalSha256 === attachment.sha256;
    check("source_attachment_sha256_unchanged", finalSha256 === attachment.sha256 && finalBuffer.equals(attachment.buffer), {
      sha256_unchanged: finalSha256 === attachment.sha256,
      bytes_unchanged: finalBuffer.length === attachment.bytes
    });

    phase = "worktree_integrity";
    const statusAfter = git(["status", "--short"]);
    const beforeLines = new Set(gitSnapshot.status_before ? gitSnapshot.status_before.split(/\r?\n/).filter(Boolean) : []);
    const newEntries = (statusAfter ? statusAfter.split(/\r?\n/).filter(Boolean) : []).filter((line) => !beforeLines.has(line) && !line.includes(EVIDENCE_REL));
    check("unrelated_worktree_preserved", newEntries.length === 0, { new_entries: newEntries.length });

    phase = "sources";
    const sources = collectSources();
    check("service_and_script_hashes_collected", Boolean(sources.service.sha256 && sources.script.sha256), {
      service: Boolean(sources.service.sha256),
      script: Boolean(sources.script.sha256)
    });
  } finally {
    await db.$disconnect().catch(() => undefined);
  }
}

main()
  .then(() => writeEvidence("passed"))
  .catch((error) => {
    writeEvidence("failed", { error: safeError(error) });
    process.exitCode = 1;
  });
