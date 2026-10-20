/* Local live certification for the tenant-scoped PUC tree.
 * Requires DATABASE_URL on localhost, a running local API, and --catalog pointing to the
 * versioned proposal JSON. It never calls a remote host and never seeds eight-digit auxiliaries.
 */
process.env.DISABLE_REDIS = "true";
process.env.REDIS_DISABLED = "true";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const bcrypt = require("bcrypt");
const { PrismaClient } = require("@prisma/client");

const args = {};
for (let index = 2; index < process.argv.length; index += 1) {
  const value = process.argv[index];
  if (!value.startsWith("--")) continue;
  args[value.slice(2)] = process.argv[index + 1] && !process.argv[index + 1].startsWith("--") ? process.argv[++index] : true;
}
const databaseUrl = String(process.env.DATABASE_URL || "");
if (!/^postgres(?:ql)?:\/\/[^@\s]+@(localhost|127\.0\.0\.1)(:\d+)?\//.test(databaseUrl)) throw new Error("BLOQUEADO: DATABASE_URL debe ser local");
const apiUrl = String(args["api-url"] || process.env.LOCAL_API_URL || "http://127.0.0.1:3213").replace(/\/$/, "");
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(apiUrl)) throw new Error("BLOQUEADO: api-url debe ser local");
const catalogPath = path.resolve(String(args.catalog || ""));
if (!fs.existsSync(catalogPath)) throw new Error(`Falta catalogo: ${catalogPath}`);
const output = path.resolve(String(args.output || "docs/qa/evidence/accounting-puc-tree-20261014/local-certification.json"));
const webUrl = String(args["web-url"] || process.env.LOCAL_WEB_URL || "http://127.0.0.1:3002").replace(/\/$/, "");
const db = new PrismaClient();
const suffix = crypto.randomBytes(5).toString("hex");
const checks = [];
function check(name, ok, detail = {}) { checks.push({ name, ok: Boolean(ok), detail }); assert.ok(ok, `${name}: ${JSON.stringify(detail)}`); }
async function call(url, { token, method = "GET", body } = {}) {
  const response = await fetch(`${apiUrl}${url}`, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { "content-type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const payload = await response.json().catch(() => ({}));
  return { status: response.status, payload };
}
function mapType(code) { return ({ 1: "asset", 2: "liability", 3: "equity", 4: "income", 5: "expense", 6: "cost", 7: "cost", 8: "order", 9: "order" })[code[0]]; }
function loadCatalog() {
  const source = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
  const records = Array.isArray(source) ? source : source.records || [];
  check("catalog_record_count", records.length === 2502, { count: records.length });
  check("catalog_has_no_auxiliary_seed", records.every((row) => String(row.code).length <= 6), { max_code_length: Math.max(...records.map((row) => String(row.code).length)) });
  return records.map((row) => ({ code: String(row.code), name: String(row.name), parent_code: row.parent_code || null, level: Number(row.level), type: row.type || mapType(String(row.code)), allows_tx: false, active: true }));
}
async function register(label) {
  const email = `puc-${label}-${suffix}@apex.local`;
  const password = `Puc-${suffix}-Q!`;
  const result = await call("/api/v1/auth/register", { method: "POST", body: { company_name: `PUC E2E ${label} ${suffix}`, industry: "qa", email, password, name: `PUC ${label}`, country: "CO", timezone: "America/Bogota", currency: "COP", plan: "crown" } });
  check(`${label}_tenant_registered`, result.status === 201 || result.status === 200, { status: result.status });
  const token = result.payload.token || result.payload.access_token;
  if (token) return { email, password, token, tenantId: result.payload.tenant?.id || result.payload.user?.tenant_id };
  const login = await call("/api/v1/auth/login", { method: "POST", body: { email, password } });
  check(`${label}_login`, login.status === 200 && Boolean(login.payload.token || login.payload.access_token), { status: login.status });
  return { email, password, token: login.payload.token || login.payload.access_token, tenantId: login.payload.user?.tenant_id };
}
async function main() {
  const catalog = loadCatalog();
  const primary = await register("primary");
  const customSeed = [
    ["130505HEART", "Caja HEART", "asset"],
    ["220505HEART", "Proveedor HEART", "liability"],
    ["5290", "Aportes SENA", "expense"],
    ["5320", "Arrendamientos", "expense"],
    ["5360", "Servicios publicos", "expense"]
  ];
  for (const [code, name, type] of customSeed) {
    await db.account.upsert({ where: { tenant_id_code: { tenant_id: primary.tenantId, code } }, update: { name, type, parent_id: null, level: code.length > 6 ? 5 : 3, active: true, allows_tx: true }, create: { tenant_id: primary.tenantId, code, name, type, parent_id: null, level: code.length > 6 ? 5 : 3, active: true, allows_tx: true } });
  }
  const preview = await call("/api/v1/accounting/chart/tree/preview", { token: primary.token, method: "POST", body: { catalog } });
  // New tenants already contain the frozen standard, including 220505 and HEART.
  // The five explicit fixture changes above must still be repaired by tree/apply.
  check("preview_real", preview.status === 200 && preview.payload.total_catalog_entries === 2502 && preview.payload.custom_links?.length === 6 && preview.payload.custom_parent_creates?.length === 0 && preview.payload.creates?.length === 0 && preview.payload.repairs?.length === 5, { status: preview.status, creates: preview.payload.creates?.length, repairs: preview.payload.repairs?.length, custom_links: preview.payload.custom_links?.length, custom_parent_creates: preview.payload.custom_parent_creates?.length, conflicts: preview.payload.conflicts?.length });
  const applied = await call("/api/v1/accounting/chart/tree/apply", { token: primary.token, method: "POST", body: { catalog } });
  check("apply_real", applied.status === 200 && applied.payload.applied?.created === 0 && applied.payload.applied?.repaired === 5, { status: applied.status, applied: applied.payload.applied });
  const second = await call("/api/v1/accounting/chart/tree/apply", { token: primary.token, method: "POST", body: { catalog } });
  check("apply_idempotent", second.status === 200 && second.payload.applied.created === 0 && second.payload.applied.repaired === 0, { status: second.status, applied: second.payload.applied });
  const accounts = await call("/api/v1/accounting/accounts?limit=1000", { token: primary.token });
  const rows = Array.isArray(accounts.payload) ? accounts.payload : accounts.payload.data || [];
  const dbRows = await db.account.findMany({ where: { tenant_id: primary.tenantId }, orderBy: { code: "asc" } });
  check("catalog_persisted", dbRows.length >= 2508, { api_count: rows.length, db_count: dbRows.length });
  const persisted = new Map(dbRows.map((row) => [String(row.code), row]));
  const byCode = new Map(rows.map((row) => [String(row.code), row]));
  check("parent_links_persisted", catalog.every((row) => !row.parent_code || persisted.get(row.code)?.parent_id === persisted.get(row.parent_code)?.id), { count: dbRows.length });
  check("custom_parent_links_persisted", customSeed.every(([code]) => { const row = persisted.get(code); const parentCode = code.length > 6 ? code.slice(0, 6) : code.slice(0, 2); return row?.parent_id === persisted.get(parentCode)?.id; }), { custom: customSeed.map(([code]) => code) });
  const customCodes = new Set(customSeed.map(([code]) => code));
  check("no_automatic_auxiliaries", dbRows.every((row) => String(row.code).length <= 6 || customCodes.has(String(row.code))), { max: Math.max(...dbRows.map((row) => String(row.code).length)), seeded_custom: [...customCodes] });
  const sub = catalog.find((row) => row.code.length === 6);
  const parent = persisted.get(sub.code);
  const auxiliary = await call("/api/v1/accounting/accounts", { token: primary.token, method: "POST", body: { code: `${sub.code}01`, name: "Auxiliar QA PUC", type: sub.type, parent_code: sub.code, allows_tx: true, active: true } });
  check("manual_auxiliary_eight_digits", auxiliary.status === 201 && auxiliary.payload.level === 5, { status: auxiliary.status, code: auxiliary.payload.code });
  const invalidParent = await call("/api/v1/accounting/accounts", { token: primary.token, method: "POST", body: { code: `${sub.code}02`, name: "Auxiliar invalido", type: sub.type, parent_id: persisted.get(sub.code.slice(0, 4)).id, allows_tx: true, active: true } });
  check("invalid_auxiliary_parent_rejected", invalidParent.status === 422, { status: invalidParent.status, code: invalidParent.payload.code });
  const mismatchedType = await call("/api/v1/accounting/accounts", { token: primary.token, method: "POST", body: { code: `${sub.code}03`, name: "Auxiliar naturaleza invalida", type: sub.type === "asset" ? "expense" : "asset", parent_code: sub.code, allows_tx: true, active: true } });
  check("auxiliary_type_mismatch_rejected", mismatchedType.status === 422, { status: mismatchedType.status, code: mismatchedType.payload.code });
  const other = await register("other");
  const crossTenant = await call("/api/v1/accounting/accounts", { token: other.token, method: "POST", body: { code: `${sub.code}04`, name: "Auxiliar cruzado", type: sub.type, parent_id: parent.id, allows_tx: true, active: true } });
  check("cross_tenant_auxiliary_rejected", crossTenant.status === 422, { status: crossTenant.status, code: crossTenant.payload.code });
  const limitedRole = await db.role.create({ data: { tenant_id: primary.tenantId, name: `PUC_LIMITED_${suffix}`, is_system: false } });
  const limited = await db.user.create({ data: { tenant_id: primary.tenantId, name: "PUC limited", email: `puc-limited-${suffix}@apex.local`, password: await bcrypt.hash("Puc-limited-1!", 4), role_id: limitedRole.id, active: true } });
  const limitedLogin = await call("/api/v1/auth/login", { method: "POST", body: { email: limited.email, password: "Puc-limited-1!" } });
  const denied = await call("/api/v1/accounting/chart/tree/apply", { token: limitedLogin.payload.token || limitedLogin.payload.access_token, method: "POST", body: { catalog: catalog.slice(0, 9) } });
  check("unauthorized_apply_rejected", denied.status === 403, { status: denied.status });
  const report = { certification: "accounting-puc-tree-local", environment: "LOCAL", api_url: apiUrl, generated_at: new Date().toISOString(), catalog: { source: catalogPath, records: catalog.length }, checks, status: "passed" };
  fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
  await db.$disconnect();
  console.log(JSON.stringify(report, null, 2));
}
main().catch(async (error) => { try { await db.$disconnect(); } catch {} console.error(error.stack || error); process.exit(1); });
