// Real Fastify/PostgreSQL certification. Disposable local database only; no remote credentials.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");
const root = path.resolve(__dirname, "../..");
const database = "accounting_pyg_cert_" + crypto.randomBytes(5).toString("hex");
const output = path.resolve(process.argv[2] || ".tmp/accounting-pyg-relocation-local.json");
const checks = [];
function docker(args, input) { return execFileSync("docker", ["exec", "-i", "infra-postgres-1", ...args], { input, encoding: "utf8", maxBuffer: 30 * 1024 * 1024 }).trim(); }
function sql(query, db = database) { return docker(["psql", "-X", "-q", "-U", "apex", "-d", db, "-v", "ON_ERROR_STOP=1", "-At"], query); }
function check(name, ok) { checks.push({ name, passed: Boolean(ok) }); assert.ok(ok, name); console.log("PASS " + name); }
let app, prisma;
async function main() {
  const schema = docker(["pg_dump", "-U", "apex", "-d", "apexos", "--schema-only", "--no-owner", "--no-acl"]);
  sql(`create database "${database}";`, "postgres"); sql(schema);
  const foundation = fs.readFileSync(path.join(root, "supabase/migrations/20260517143000_init_qa_saas_foundation.sql"), "utf8");
  for (const table of ["plans", "companies"]) sql(foundation.match(new RegExp("create table if not exists public\\." + table + " \\([\\s\\S]*?\\n\\);", "i"))[0]);
  sql(fs.readFileSync(path.join(root, "supabase/migrations/20261020173515_standard_chart_piloto.sql"), "utf8"));
  const password = docker(["printenv", "POSTGRES_PASSWORD"]);
  Object.assign(process.env, { DATABASE_URL: `postgresql://apex:${encodeURIComponent(password)}@127.0.0.1:55432/${database}`, NODE_ENV: "test", JWT_SECRET: crypto.randomBytes(32).toString("hex"), DISABLE_REDIS: "true", REDIS_DISABLED: "true", DISABLE_BACKGROUND_WORKERS: "true" });
  app = await require(path.join(root, "apps/api/server"))(); await app.ready();
  prisma = require(path.join(root, "apps/api/src/core/prisma"));
  const call = async (method, url, token, payload) => {
    const r = await app.inject({ method, url: "/api/v1" + url, headers: token ? { authorization: "Bearer " + token } : {}, ...(payload ? { payload } : {}) });
    return { status: r.statusCode, body: r.json() };
  };
  async function register(label) {
    const r = await call("POST", "/auth/register", null, { company_name: label, name: "PYG local", email: label + "@apex.local", password: "Local-Pyg-Cert-2026!", country: "CO", industry: "generic", plan: "crown" });
    assert.ok(r.status < 300, JSON.stringify(r.body));
    return { tenant: r.body.user.tenant_id, token: r.body.token || r.body.access_token };
  }
  const a = await register(database), b = await register(database + "b");
  const own = fn => prisma.runWithTenant(a.tenant, fn);
  const vehicle = await own(() => prisma.vehicle.create({ data: { plate: "PYG123", type: "camion" } }));
  await own(() => prisma.pettyCashConcept.create({ data: { code: "PYGFUEL", name: "Combustible certificado", account_code: "5105" } }));
  // Test persisted real inputs without recreating transport operations unrelated to this relocation.
  await own(async () => {
    const pkg = await prisma.transportSettlementPackage.create({ data: { code: "CERT-PYG", status: "aprobada", metadata: { accounting_period: "2026-10" } } });
    await prisma.transportSettlementItem.create({ data: { package_id: pkg.id, guide_reference: "PYG-GUIDE", vehicle_plate: vehicle.plate, service_date: new Date("2026-10-20"), calculated_amount: 1000, approved_amount: 1000 } });
  });
  const role = sql(`select role_id from "User" where tenant_id='${a.tenant}' limit 1;`);
  function permissions(module, actions) {
    sql(`update "Role" set name='CERT_PYG_ROLE' where id=${role}; delete from "Permission" where role_id=${role}; insert into "Permission"(role_id,module,action) values ${actions.map(action => `(${role},'${module}','${action}')`).join(",")};`);
  }
  permissions("accounting", ["read", "write"]);
  for (const url of ["concepts", "report?period=2026-10", "budgets?period=2026-10", "mapping", "config", "source-concepts"]) {
    check("accounting_only_reads_" + url, (await call("GET", "/transport-pyg/" + url, a.token)).status === 200);
  }
  const sources = await call("GET", "/transport-pyg/source-concepts", a.token);
  check("source_catalog_minimal_fields", sources.body.length === 1 && Object.keys(sources.body[0]).sort().join(",") === "active,code,id,name");
  check("accounting_does_not_gain_transport_access", (await call("GET", "/transport/vehicles", a.token)).status === 403);
  check("budget_saved", (await call("PUT", "/transport-pyg/budgets", a.token, { period: "2026-10", rows: [{ vehicle_id: vehicle.id, concept_code: "INGRESOS", amount: 2000 }] })).status === 200);
  check("mapping_saved", (await call("PUT", "/transport-pyg/mapping", a.token, { rows: [{ source_code: "PYGFUEL", pyg_concept_code: "COMBUSTIBLE", active: true }] })).status === 200);
  check("tax_saved", (await call("PUT", "/transport-pyg/config", a.token, { tax_percent: 2.5 })).status === 200);
  const report = (await call("GET", "/transport-pyg/report?period=2026-10", a.token)).body;
  const income = report.vehicles[0].rows.find(row => row.code === "INGRESOS");
  check("report_keeps_income_and_budget", report.vehicles[0].plate === "PYG123" && income.actual === 1000 && income.budget === 2000 && income.cump === 0.5);
  check("tax_persisted", report.tax_percent === 2.5);
  check("invalid_period_rejected", (await call("GET", "/transport-pyg/report?period=bad", a.token)).status === 400);
  const foreign = await call("PUT", "/transport-pyg/budgets", b.token, { period: "2026-10", rows: [{ vehicle_id: vehicle.id, concept_code: "INGRESOS", amount: 1 }] });
  check("cross_company_budget_denied", foreign.status === 404);
  const other = (await call("GET", "/transport-pyg/report?period=2026-10", b.token)).body;
  check("cross_company_report_isolated", other.vehicles.length === 0);
  check("cross_company_sources_isolated", (await call("GET", "/transport-pyg/source-concepts", b.token)).body.length === 0);
  check("accounting_audit_module", await own(() => prisma.auditLog.count({ where: { module: "accounting", entity: "TransportPygBudget" } })) === 1);
  permissions("accounting", ["read"]);
  for (const [url, body] of [["budgets", { period: "2026-10", rows: [{ vehicle_id: vehicle.id, concept_code: "INGRESOS", amount: 1 }] }], ["config", { tax_percent: 5 }], ["mapping", { rows: [{ source_code: "PYGFUEL", pyg_concept_code: "OTROS" }] }]]) {
    check("reader_cannot_write_" + url, (await call("PUT", "/transport-pyg/" + url, a.token, body)).status === 403);
  }
  permissions("transport", ["read", "write"]);
  for (const url of ["report?period=2026-10", "config", "source-concepts"]) check("transport_only_denied_" + url, (await call("GET", "/transport-pyg/" + url, a.token)).status === 403);
  check("anonymous_denied", (await call("GET", "/transport-pyg/report?period=2026-10")).status === 401);
  const page = fs.readFileSync(path.join(root, "apps/web/app/dashboard/contabilidad/pyg/page.tsx"), "utf8");
  check("page_uses_accounting_permissions_and_navigation", page.includes('hasStoredRolePermission("accounting", "write")') && page.includes("<ContabilidadNav />"));
  check("old_url_redirects", fs.readFileSync(path.join(root, "apps/web/app/dashboard/transporte/pyg/page.tsx"), "utf8").includes('redirect("/dashboard/contabilidad/pyg")'));
  check("transport_card_removed", !fs.readFileSync(path.join(root, "apps/web/app/dashboard/transporte/page.tsx"), "utf8").includes("/transporte/pyg"));
}
main().then(() => finish("passed")).catch(e => { console.error(e.message); return finish("failed", e.message); });
async function finish(status, error) {
  if (app) await app.close(); if (prisma) await prisma.$disconnect();
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify({ status, environment: "LOCAL", database, commit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), tested_at: new Date().toISOString(), checks, ...(error ? { error } : {}) }, null, 2));
  process.exit(status === "passed" ? 0 : 1);
}
