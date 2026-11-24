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
const measurements = [];
let databaseCreated = false;
function docker(args, input) { return execFileSync("docker", ["exec", "-i", "infra-postgres-1", ...args], { input, encoding: "utf8", maxBuffer: 30 * 1024 * 1024 }).trim(); }
function sql(query, db = database) { return docker(["psql", "-X", "-q", "-U", "apex", "-d", db, "-v", "ON_ERROR_STOP=1", "-At"], query); }
function check(name, ok) { checks.push({ name, passed: Boolean(ok) }); assert.ok(ok, name); console.log("PASS " + name); }
let app, prisma;
async function main() {
  const schema = docker(["pg_dump", "-U", "apex", "-d", "apexos", "--schema-only", "--no-owner", "--no-acl"]);
  sql(`create database "${database}";`, "postgres");
  databaseCreated = true;
  sql(schema);
  const foundation = fs.readFileSync(path.join(root, "supabase/migrations/20260517143000_init_qa_saas_foundation.sql"), "utf8");
  for (const table of ["plans", "companies"]) sql(foundation.match(new RegExp("create table if not exists public\\." + table + " \\([\\s\\S]*?\\n\\);", "i"))[0]);
  sql(fs.readFileSync(path.join(root, "supabase/migrations/20261020173515_standard_chart_piloto.sql"), "utf8"));
  const password = docker(["printenv", "POSTGRES_PASSWORD"]);
  const databaseUrl = `postgresql://apex:${encodeURIComponent(password)}@127.0.0.1:55432/${database}`;
  Object.assign(process.env, { DATABASE_URL: databaseUrl, DIRECT_URL: databaseUrl, NODE_ENV: "test", JWT_SECRET: crypto.randomBytes(32).toString("hex"), DISABLE_REDIS: "true", REDIS_DISABLED: "true", DISABLE_BACKGROUND_WORKERS: "true" });
  app = await require(path.join(root, "apps/api/server"))(); await app.ready();
  prisma = require(path.join(root, "apps/api/src/core/prisma"));
  let measuredCalls = null;
  const pygModels = new Set(["TransportPygConcept", "TransportPygSourceMap", "TransportPygBudget", "TransportPygConfig"]);
  prisma.$use(async (params, next) => {
    if (measuredCalls && pygModels.has(params.model)) measuredCalls.push({ model: params.model, action: params.action });
    return next(params);
  });
  const call = async (method, url, token, payload) => {
    const r = await app.inject({ method, url: "/api/v1" + url, headers: token ? { authorization: "Bearer " + token } : {}, ...(payload ? { payload } : {}) });
    return { status: r.statusCode, body: r.json() };
  };
  const measuredRead = async (url, token, scenario) => {
    measuredCalls = [];
    const started = performance.now();
    try {
      const response = await call("GET", "/transport-pyg/" + url, token);
      const mutations = measuredCalls.filter(row => !["findFirst", "findMany", "count", "aggregate", "groupBy"].includes(row.action));
      measurements.push({ scenario, endpoint: url, duration_ms: Math.round((performance.now() - started) * 100) / 100, delegates: measuredCalls.length, mutations: mutations.length });
      check(scenario + "_returns_200", response.status === 200);
      check(scenario + "_no_catalog_dml", mutations.length === 0);
      if (url === "concepts" || url === "mapping") check(scenario + "_one_catalog_read", measuredCalls.length === 1 && measuredCalls[0].action === "findMany");
      return response.body;
    } finally {
      measuredCalls = null;
    }
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
  const emptyCounts = await own(async () => [await prisma.transportPygConcept.count(), await prisma.transportPygSourceMap.count()]);
  check("empty_catalog_fixture", emptyCounts.every(count => count === 0));
  const concepts = await measuredRead("concepts", a.token, "empty_concepts");
  const mapping = await measuredRead("mapping", a.token, "empty_mapping");
  check("empty_catalog_has_virtual_defaults", concepts.length === 23 && mapping.rows.length === 11);
  for (const url of ["report?period=2026-10", "budgets?period=2026-10", "config", "source-concepts"]) {
    await measuredRead(url, a.token, "empty_" + url.split("?")[0]);
  }
  const afterCounts = await own(async () => [await prisma.transportPygConcept.count(), await prisma.transportPygSourceMap.count()]);
  check("reads_leave_persisted_catalog_empty", afterCounts.every(count => count === 0));
  await own(async () => {
    await prisma.transportPygConcept.create({ data: { code: "INGRESOS", name: "Nombre propio", section: "Ingresos", kind: "income", display_order: 1, active: true } });
    await prisma.transportPygConcept.create({ data: { code: "HONORARIOS_CONTABLES_SST", name: "Oculto", section: "Gastos", kind: "expense", display_order: 5, active: false } });
  });
  const ownConcepts = await measuredRead("concepts", a.token, "custom_concepts");
  check("custom_concept_name_preserved", ownConcepts.find(row => row.code === "INGRESOS")?.name === "Nombre propio");
  check("inactive_concept_not_resurrected", !ownConcepts.some(row => row.code === "HONORARIOS_CONTABLES_SST"));
  const otherConcepts = await measuredRead("concepts", b.token, "other_company_concepts");
  check("custom_concepts_isolated", otherConcepts.find(row => row.code === "INGRESOS")?.name !== "Nombre propio");
  check("virtual_mapping_can_be_disabled", (await call("PUT", "/transport-pyg/mapping", a.token, { rows: [{ source_type: "petty_cash_concept", source_code: "COMBUSTIBLE", pyg_concept_code: "" }] })).status === 200);
  const disabled = await measuredRead("mapping", a.token, "disabled_mapping");
  check("disabled_mapping_remains_empty", disabled.rows.some(row => row.source_code === "COMBUSTIBLE" && row.pyg_concept_code === "" && row.active === false));
  const otherMapping = await measuredRead("mapping", b.token, "other_company_mapping");
  check("disabled_mapping_isolated", otherMapping.rows.some(row => row.source_code === "COMBUSTIBLE" && row.pyg_concept_code === "COMBUSTIBLE" && row.active === true));
  check("disabled_mapping_can_be_reactivated", (await call("PUT", "/transport-pyg/mapping", a.token, { rows: [{ source_type: "petty_cash_concept", source_code: "COMBUSTIBLE", pyg_concept_code: "COMBUSTIBLE", active: true }] })).status === 200);
  const reactivated = await measuredRead("mapping", a.token, "reactivated_mapping");
  check("reactivated_mapping_persisted", reactivated.rows.some(row => row.source_code === "COMBUSTIBLE" && row.pyg_concept_code === "COMBUSTIBLE" && row.active === true));
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
  check("redirect_precedes_client_module_guard", fs.readFileSync(path.join(root, "apps/web/next.config.ts"), "utf8").includes('source: "/dashboard/transporte/pyg", destination: "/dashboard/contabilidad/pyg"'));
  check("transport_card_removed", !fs.readFileSync(path.join(root, "apps/web/app/dashboard/transporte/page.tsx"), "utf8").includes("/transporte/pyg"));
}
main().then(() => finish("passed")).catch(e => { console.error(e.message); return finish("failed", e.message); });
async function finish(status, error) {
  for (const close of [() => app?.close(), () => prisma?.$disconnect()]) {
    try { await close(); } catch { status = "failed"; error = "La certificacion no pudo cerrar una conexion local."; }
  }
  let databaseRemoved = false;
  if (databaseCreated) {
    try {
      sql(`drop database "${database}";`, "postgres");
      databaseRemoved = true;
    } catch { status = "failed"; error = "La base desechable no pudo retirarse despues de cerrar las conexiones."; }
  }
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const safeError = error && [process.env.DATABASE_URL, process.env.DIRECT_URL, process.env.JWT_SECRET].filter(Boolean).reduce((message, value) => message.replaceAll(value, "[REDACTED]"), error);
  fs.writeFileSync(output, JSON.stringify({ status, environment: "LOCAL", scope: "real_fastify_prisma_disposable_postgresql", source: "working_tree", database: "disposable_schema_only", database_removed: databaseRemoved, commit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), tested_at: new Date().toISOString(), checks, measurements, ...(safeError ? { error: safeError } : {}) }, null, 2));
  process.exit(status === "passed" ? 0 : 1);
}
