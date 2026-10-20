// Full workflow against the real API and a disposable PostgreSQL database. No remote URL accepted.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");
const root = path.resolve(__dirname, "../..");
const database = "transport_income_cert_" + crypto.randomBytes(5).toString("hex");
const output = path.resolve(process.argv[2] || ".tmp/transport-income-accounting-local.json");
const checks = [];
function docker(args, input) { return execFileSync("docker", ["exec", "-i", "infra-postgres-1", ...args], { input, encoding: "utf8", maxBuffer: 30 * 1024 * 1024 }).trim(); }
function sql(query, db = database) { return docker(["psql", "-X", "-q", "-U", "apex", "-d", db, "-v", "ON_ERROR_STOP=1", "-At"], query); }
function check(name, ok, detail = {}) { checks.push({ name, passed: Boolean(ok), detail }); assert.ok(ok, name + " " + JSON.stringify(detail)); console.log("PASS " + name); }
let app, prisma;
async function main() {
  const schema = docker(["pg_dump", "-U", "apex", "-d", "apexos", "--schema-only", "--no-owner", "--no-acl"]);
  sql(`create database "${database}";`, "postgres"); sql(schema);
  const foundation = fs.readFileSync(path.join(root, "supabase/migrations/20260517143000_init_qa_saas_foundation.sql"), "utf8");
  for (const table of ["plans", "companies"]) sql(foundation.match(new RegExp("create table if not exists public\\." + table + " \\([\\s\\S]*?\\n\\);", "i"))[0]);
  sql(fs.readFileSync(path.join(root, "supabase/migrations/20261020173515_standard_chart_piloto.sql"), "utf8"));
  const scj = 'cbbf3627-4336-4f23-95c6-1077414bcd17';
  sql(`insert into "Tenant"(id,name,updated_at,config) values('${scj}','SCJ',now(),'{"accounting":{"organization_tree":{"societies":[{"code":"SOC-01","active":true}],"branches":[{"code":"200720","society_code":"SOC-01","active":true}],"cost_centers":[{"code":"MANUAL","name":"Preservado","branch_code":"200720","society_code":"SOC-01"}]}}}');
    insert into "Vehicle"(tenant_id,plate,base_site,metadata,updated_at) select '${scj}','SCJ'||lpad(i::text,3,'0'),'CEDI CALDAS','{"custom":"preserved"}'::jsonb,now() from generate_series(1,17) i;`);
  const scjBefore = sql(`select md5(string_agg(id::text||plate||base_site,',' order by id)) from "Vehicle" where tenant_id='${scj}';`);
  const backfillSql = fs.readFileSync(path.join(root, "scripts/data-migrations/20261020-scj-vehicle-cost-centers.sql"), "utf8");
  sql(backfillSql);
  check("scj_backfill_exact_vehicle_centers", sql(`select count(*) from "Vehicle" where tenant_id='${scj}' and cost_center=plate and metadata->>'accounting_branch_code'='200720' and metadata->>'custom'='preserved';`) === "17");
  check("scj_backfill_preserves_vehicle_identity_and_operating_sites", scjBefore === sql(`select md5(string_agg(id::text||plate||base_site,',' order by id)) from "Vehicle" where tenant_id='${scj}';`));
  const treeAfter = sql(`select config->'accounting'->'organization_tree' from "Tenant" where id='${scj}';`);
  check("scj_backfill_preserves_manual_centers", JSON.parse(treeAfter).cost_centers.some(row => row.code === "MANUAL" && row.name === "Preservado"));
  sql(backfillSql);
  check("scj_backfill_idempotent_and_audited", treeAfter === sql(`select config->'accounting'->'organization_tree' from "Tenant" where id='${scj}';`) && sql(`select count(*) from "AuditLog" where tenant_id='${scj}';`) === "17");
  const password = docker(["printenv", "POSTGRES_PASSWORD"]);
  Object.assign(process.env, { DATABASE_URL: `postgresql://apex:${encodeURIComponent(password)}@127.0.0.1:55432/${database}`, NODE_ENV: "test", JWT_SECRET: crypto.randomBytes(32).toString("hex"), DISABLE_REDIS: "true", REDIS_DISABLED: "true", DISABLE_BACKGROUND_WORKERS: "true" });
  app = await require(path.join(root, "apps/api/server"))(); await app.ready();
  prisma = require(path.join(root, "apps/api/src/core/prisma"));
  const call = async (method, url, token, payload) => {
    const response = await app.inject({ method, url: "/api/v1" + url, headers: token ? { authorization: "Bearer " + token } : {}, ...(payload ? { payload } : {}) });
    return { status: response.statusCode, body: response.json() };
  };
  async function register(label) {
    const r = await call("POST", "/auth/register", null, { company_name: label, name: "Income cert", email: label + "@apex.local", password: "Local-Income-Cert-2026!", country: "CO", industry: "generic", plan: "crown" });
    assert.ok(r.status < 300, JSON.stringify(r.body)); return { tenant: r.body.user.tenant_id, token: r.body.token || r.body.access_token };
  }
  const a = await register(database), b = await register(database + "b");
  const own = fn => prisma.runWithTenant(a.tenant, fn);
  for (const data of [{ type: "branch", society_code: "SOC-01", code: "200720", name: "Principal" }, { type: "branch", society_code: "SOC-01", code: "OTHER", name: "Other" }]) {
    const r = await call("POST", "/accounting/organization-tree", a.token, data); check("create_branch_" + data.code, r.status >= 200 && r.status < 300, r);
  }
  const vehicleInput = { plate: "INC123", type: "camion", brand: "Cert", ownership_type: "propio", base_site: "CEDI CALDAS", accounting_branch_code: "200720" };
  const invalidVehicle = await call("POST", "/transport/vehicles", a.token, { ...vehicleInput, plate: "BAD123", accounting_branch_code: "MISSING" });
  check("vehicle_and_center_rollback_when_branch_invalid", invalidVehicle.status === 422 && await own(() => prisma.vehicle.count({ where: { plate: "BAD123" } })) === 0, invalidVehicle);
  const created = await call("POST", "/transport/vehicles", a.token, vehicleInput);
  check("vehicle_created_with_real_cost_center", created.status < 300 && created.body.cost_center === "INC123", created);
  const vehicle = created.body;
  let tree = (await call("GET", "/accounting/organization-tree", a.token)).body;
  check("center_visible_under_company_branch", tree.cost_centers.some(row => row.code === "INC123" && row.vehicle_id === vehicle.id && row.branch_code === "200720"));
  check("physical_site_preserved", vehicle.base_site === "CEDI CALDAS");
  check("cross_tenant_vehicle_denied", (await call("GET", `/transport/vehicles/${vehicle.id}`, b.token)).status >= 400);
  check("managed_center_cannot_be_deleted", (await call("DELETE", "/accounting/organization-tree/cost_center/INC123", a.token)).status >= 400);
  const sync = await call("POST", "/transport/vehicles/accounting-centers/synchronize", a.token, { branch_code: "200720" });
  check("existing_centers_sync_is_idempotent", sync.status >= 200 && sync.status < 300 && sync.body.synchronized === 1, sync);
  const moved = await call("PUT", `/transport/vehicles/${vehicle.id}`, a.token, { ...vehicleInput, accounting_branch_code: "OTHER" });
  check("moving_existing_center_to_other_branch_denied", moved.status === 422, moved);
  const customers = await own(async () => Promise.all(["First", "Second"].map((name, i) => prisma.party.create({ data: { type: "customer", name, tax_id: "90000" + i } }))));
  const rate = await own(() => prisma.transportRateCard.create({ data: { code: "CERT-INCOME", name: "Cert income", status: "activa", valid_from: new Date("2020-01-01"), valid_to: new Date("2099-01-01"), base_rate: 100, currency: "COP" } }));
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Bogota" }).format(new Date());
  const items = customers.map((customer, i) => ({ customer_id: customer.id, guide_reference: "INC-GUIDE-" + i, service_date: today, charge_criteria: [{ rate_card_id: rate.id, rate_version: 1, concept: "Flete", quantity: 1, unit_value: 100, support: "Soporte local " + i }] }));
  let pkg = (await call("POST", "/transport/settlement-packages", a.token, { vehicle_id: vehicle.id, items })).body;
  check("create_package_with_customers_and_tariff", Boolean(pkg.id) && pkg.items?.length === 2, pkg);
  for (const action of ["validate", "precalculate", "submit", "decision"]) {
    const r = await call("POST", `/transport/settlement-packages/${pkg.id}/${action}`, a.token, { version: pkg.version, ...(action === "decision" ? { decision: "aprobada" } : {}) });
    check("workflow_" + action, r.status >= 200 && r.status < 300, r); pkg = r.body;
  }
  const accountRows = await own(() => prisma.account.findMany({ where: { active: true, allows_tx: true } }));
  const income = accountRows.find(row => row.type === "income"), debtor = accountRows.find(row => row.type === "asset" && row.code.startsWith("1305"));
  assert.ok(income && debtor);
  const payload = { income_account_code: income.code, receivable_account_code: debtor.code, posting_date: today, due_date: today, version: pkg.version };
  const count = () => own(() => prisma.cntCabdoc.count());
  const baseline = await count();
  await call("PATCH", `/accounting/periods/${today.slice(0, 7)}`, a.token, { status: "closed" });
  const closedPeriod = await call("POST", `/transport/settlement-packages/${pkg.id}/account`, a.token, payload);
  check("closed_period_blocks_all_postings", closedPeriod.status === 423 && await count() === baseline, closedPeriod);
  await call("PATCH", `/accounting/periods/${today.slice(0, 7)}`, a.token, { status: "open" });
  const wrong = await call("POST", `/transport/settlement-packages/${pkg.id}/account`, a.token, { ...payload, income_account_code: debtor.code });
  check("non_income_account_denied_without_documents", wrong.status === 422 && await count() === baseline, wrong);
  await own(() => prisma.party.update({ where: { id: customers[1].id }, data: { active: false } }));
  const failed = await call("POST", `/transport/settlement-packages/${pkg.id}/account`, a.token, payload);
  check("second_customer_failure_rolls_back_first_document", failed.status >= 400 && await count() === baseline && await own(() => prisma.cxcCabdoc.count()) === 0, failed);
  check("failed_posting_preserves_customer_balance", (await own(() => prisma.party.findFirst({ where: { id: customers[0].id } }))).receivable_balance === 0);
  await own(() => prisma.party.update({ where: { id: customers[1].id }, data: { active: true } }));
  const posted = await call("POST", `/transport/settlement-packages/${pkg.id}/account`, a.token, payload);
  check("accounting_creates_lt_documents_and_receivables", posted.status >= 200 && posted.status < 300 && posted.body.accounting?.payload?.documents?.length === 2, posted);
  const documents = posted.body.accounting.payload.documents;
  check("own_numbering_without_gaps_after_failed_transaction", documents[0].number === "LT-000001" && documents[1].number === "LT-000002", documents);
  const cnt = await own(() => prisma.cntCabdoc.findMany({ where: { document_type: "LT" }, include: { lines: true } }));
  check("balanced_documents_post_debtor_and_income_to_vehicle", cnt.length === 2 && cnt.every(doc => Number(doc.total_debit) === 100 && Number(doc.total_credit) === 100 && doc.lines.every(line => line.cost_center_code === "INC123" && line.branch_code === "200720") && doc.lines.some(line => line.account_code === income.code && Number(line.credit) === 100) && doc.lines.some(line => line.account_code === debtor.code && Number(line.debit) === 100)));
  check("ledger_entries_created", await own(() => prisma.ledgerEntry.count()) === 4);
  check("customer_receivable_balances_updated", (await own(() => prisma.party.findMany({ where: { id: { in: customers.map(row => row.id) } } }))).every(row => row.receivable_balance === 100));
  const retries = await Promise.all([1, 2, 3].map(() => call("POST", `/transport/settlement-packages/${pkg.id}/account`, a.token, { ...payload, idempotency_key: "retry-another-key" })));
  check("concurrent_retries_do_not_duplicate_any_ledger_or_receivable", retries.every(r => r.status >= 200 && r.status < 300 && r.body.idempotent_replay) && await count() === baseline + 2 && await own(() => prisma.ledgerEntry.count()) === 4);
  check("cross_tenant_posting_denied", (await call("POST", `/transport/settlement-packages/${pkg.id}/account`, b.token, payload)).status >= 400);
  const closed = await call("POST", `/transport/settlement-packages/${pkg.id}/close`, a.token, { version: posted.body.version });
  check("liquidation_closes_without_duplicate_posting", closed.status >= 200 && closed.status < 300 && closed.body.status === "liquidada" && await count() === baseline + 2, closed);
  const report = await require(path.join(root, "apps/api/src/modules/transport-pyg/service")).getReport(a.tenant, { period: today.slice(0, 7) });
  check("vehicle_pyg_income_not_counted_twice", report.corporate.income_actual === 200, report.corporate);
  const statement = await call("GET", `/accounting/income-statement?period=${today.slice(0, 7)}`, a.token);
  check("income_statement_reflects_posted_revenue", statement.status === 200 && statement.body.income?.total === 200, statement);
  check("liquidated_package_keeps_terminal_state", (await call("POST", `/transport/settlement-packages/${pkg.id}/close`, a.token, { status: "reversada", reference: "Intento", version: closed.body.version })).status === 409);
  let reversePkg = (await call("POST", "/transport/settlement-packages", a.token, { vehicle_id: vehicle.id, items: items.map(item => ({ ...item, guide_reference: item.guide_reference + "-REV" })) })).body;
  for (const action of ["validate", "precalculate", "submit", "decision"]) {
    const r = await call("POST", `/transport/settlement-packages/${reversePkg.id}/${action}`, a.token, { version: reversePkg.version, ...(action === "decision" ? { decision: "aprobada" } : {}) });
    check("reversal_fixture_" + action, r.status >= 200 && r.status < 300, r); reversePkg = r.body;
  }
  reversePkg = (await call("POST", `/transport/settlement-packages/${reversePkg.id}/account`, a.token, { ...payload, version: reversePkg.version })).body;
  const appliedDocument = reversePkg.accounting.payload.documents[0].receivable_document_id;
  await own(() => prisma.cxcCabdoc.update({ where: { id: appliedDocument }, data: { applied_total: 10, balance: 90 } }));
  const beforeBlockedReversal = await count();
  const appliedReversal = await call("POST", `/transport/settlement-packages/${reversePkg.id}/close`, a.token, { status: "reversada", reference: "Intento con cartera aplicada", version: reversePkg.version });
  check("applied_receivable_blocks_reversal_without_partial_credit_notes", appliedReversal.status === 422 && await count() === beforeBlockedReversal, appliedReversal);
  await own(() => prisma.cxcCabdoc.update({ where: { id: appliedDocument }, data: { applied_total: 0, balance: 100 } }));
  const reversal = await call("POST", `/transport/settlement-packages/${reversePkg.id}/close`, a.token, { status: "reversada", reference: "Correccion certificada", version: reversePkg.version });
  check("formal_reversal_posts_credit_notes_and_reverses_receivables", reversal.status >= 200 && reversal.status < 300 && reversal.body.status === "reversada" && await own(() => prisma.cntCabdoc.count({ where: { document_type: "NCV" } })) === 2 && (await own(() => prisma.party.findMany({ where: { id: { in: customers.map(row => row.id) } } }))).every(row => row.receivable_balance === 100), reversal);
  const reversedReport = await call("GET", `/accounting/income-statement?period=${today.slice(0, 7)}`, a.token);
  check("reversal_removes_only_reversed_revenue_from_financial_reports", reversedReport.body.income?.total === 200, reversedReport);
  // A real principal loses the permission; JWT cannot retain authorization after RBAC changes.
  sql(`update "Role" set name='CERT_VIEWER' where tenant_id='${a.tenant}'; update "Permission" set module='transport',action='read' where role_id=(select role_id from "User" where tenant_id='${a.tenant}' limit 1);`);
  check("read_only_user_cannot_post_income", (await call("POST", `/transport/settlement-packages/${pkg.id}/account`, a.token, payload)).status === 403);
  check("read_only_user_cannot_bulk_assign_cost_centers", (await call("POST", "/transport/vehicles/accounting-centers/synchronize", a.token, { branch_code: "200720" })).status === 403);
  check("posting_account_options_require_accounting_capability", (await call("GET", "/transport/settlement-accounting-options", a.token)).status === 403);
  const transportTree = await call("GET", "/transport/vehicle-accounting-structure", a.token);
  check("transport_reader_can_choose_own_branch_without_accounting_permission", transportTree.status === 200 && transportTree.body.cost_centers.length === 1 && transportTree.body.cost_centers[0].vehicle_id === vehicle.id, transportTree);
  check("anonymous_posting_denied", (await call("POST", `/transport/settlement-packages/${pkg.id}/account`, null, payload)).status === 401);
}
main().then(() => finish("passed")).catch(error => { console.error(error.message); return finish("failed", error.message); });
async function finish(status, error) {
  if (app) await app.close(); if (prisma) await prisma.$disconnect();
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const sources = ["apps/api/src/modules/accounting/service.js", "apps/api/src/modules/transport/service.js", "apps/api/src/modules/transport/routes.js", "apps/api/src/modules/transport/settlement-service.js", "apps/api/src/modules/transport/settlement-posting.js", "apps/api/src/modules/transport/vehicle-accounting.js", "scripts/data-migrations/20261020-scj-vehicle-cost-centers.sql", "scripts/certifications/transport-income-accounting-local.js"];
  fs.writeFileSync(output, JSON.stringify({ status, environment: "LOCAL", database, tested_at: new Date().toISOString(), commit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), source_sha256: Object.fromEntries(sources.map(file => [file, crypto.createHash("sha256").update(fs.readFileSync(path.join(root, file))).digest("hex")])), checks, ...(error ? { error } : {}) }, null, 2));
  process.exit(status === "passed" ? 0 : 1);
}
