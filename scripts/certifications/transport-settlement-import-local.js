// Functional certification: real local PostgreSQL, API, permissions and accounting entries.
const fs = require("node:fs"), path = require("node:path"), os = require("node:os"), crypto = require("node:crypto");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const root = path.resolve(__dirname, "../..");
require("../load-env")(path.join(root, ".env"));
if (!["localhost", "127.0.0.1"].includes(new URL(process.env.DATABASE_URL).hostname)) throw Error("Certificación restringida a PostgreSQL local.");
Object.assign(process.env, { NODE_ENV: "test", DISABLE_REDIS: "true", REDIS_DISABLED: "true", DISABLE_BACKGROUND_WORKERS: "true", JWT_SECRET: crypto.randomBytes(32).toString("hex") });
const output = fs.mkdtempSync(path.join(os.tmpdir(), "apex-settlement-import-"));
const run = crypto.randomBytes(5).toString("hex"), password = "Local-Import-Cert-2026!";
const checks = [];
function check(name, ok, detail) { checks.push({ name, passed: Boolean(ok), ...(detail ? { detail } : {}) }); assert.ok(ok, `${name}: ${JSON.stringify(detail || {})}`); console.log("PASS", name); }
let app, db, base;
async function call(token, route, method = "GET", body) {
  const response = await fetch(base + "/api/v1" + route, { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { "content-type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(40000) });
  return { status: response.status, body: await response.json() };
}
async function upload(token, action, bytes, previewHash) {
  const form = new FormData(); form.append("file", new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), "Liquidaciones.xlsx");
  const response = await fetch(base + "/api/v1/transport/settlement-import/" + action + (previewHash ? "?preview_hash=" + previewHash : ""), { method: "POST", headers: token ? { authorization: `Bearer ${token}` } : {}, body: form, signal: AbortSignal.timeout(45000) });
  return { status: response.status, body: await response.json() };
}
async function main() {
  app = await require(path.join(root, "apps/api/server"))();
  await app.listen({ port: 0, host: "127.0.0.1" }); base = app.server.address(); base = `http://127.0.0.1:${base.port}`;
  db = require(path.join(root, "apps/api/src/core/prisma"));
  const bcrypt = require("bcrypt");
  const hash = await bcrypt.hash(password, 10);
  const register = async label => {
    // Fixture setup only. Existing local chart initialization is not part of import.
    const tenant = await db.tenant.create({ data: { name: label, plan: "crown", active_modules: ["M-14", "M-07", "M-22"] } });
    await db.runWithTenant(tenant.id, async () => {
      const role = await db.role.create({ data: { name: "APEX_ADMIN", is_system: true, permissions: { create: [{ module: "*", action: "*" }] } } });
      await db.user.create({ data: { name: "QA carga masiva", email: label + "@apex.local", password: hash, role_id: role.id } });
      await db.account.createMany({ data: [{ tenant_id: tenant.id, code: "130505", name: "Cartera QA", type: "asset", allows_tx: true }, { tenant_id: tenant.id, code: "414505", name: "Ingreso transporte QA", type: "income", allows_tx: true }] });
    });
    await db.subscription.create({ data: { tenant_id: tenant.id, plan: "crown", price_monthly: 0, trial_ends: new Date(Date.now() + 14 * 86400000) } });
    const response = await call(null, "/auth/login", "POST", { email: label + "@apex.local", password });
    assert.equal(response.status, 200); return { token: response.body.token, tenant: tenant.id };
  };
  const a = await register("import-" + run), b = await register("import-other-" + run);
  const own = fn => db.runWithTenant(a.tenant, fn);
  const tree = { societies: [{ code: "SOC-BULK", name: "Sociedad de prueba", active: true }], branches: [{ code: "BR-OTHER", name: "Otra sucursal activa", society_code: "SOC-BULK", active: true }, { code: "BR-BULK", name: "Sucursal de prueba", society_code: "SOC-BULK", active: true }], cost_centers: [] };
  await db.tenant.update({ where: { id: a.tenant }, data: { config: { accounting: { organization_tree: tree } } } });
  async function user(label, actions, metadata = {}) {
    const record = await own(async () => {
      const role = await db.role.create({ data: { name: `Import ${label}`, metadata, permissions: { create: actions.map(action => ({ module: "transport", action })) } } });
      return db.user.create({ data: { name: "QA " + label, email: `import-${run}-${label}@apex.local`, password: hash, role_id: role.id } });
    });
    const login = await call(null, "/auth/login", "POST", { email: record.email, password });
    assert.equal(login.status, 200); return { ...login.body, token: login.body.token };
  }
  const operator = await user("operator", ["read", "write", "import", "approve_settlements"]);
  const importer = await user("importer", ["read", "write", "import"]);
  const approver = await user("approver", ["read", "approve_settlements"]);
  const accountant = await user("accountant", ["read", "account_settlements"]);
  const viewer = await user("viewer", ["read"]);
  const scoped = await user("scoped", ["read", "write", "import", "approve_settlements"], { scopes: { cost_centers: ["BULK01"] } });
  const vehicles = [];
  for (const plate of ["BULK01", "BULK02"]) {
    const result = await call(a.token, "/transport/vehicles", "POST", { plate, type: "camion", brand: "QA", ownership_type: "propio", base_site: "CEDI QA", accounting_branch_code: "BR-BULK" });
    check("vehicle_" + plate, result.status < 300 && result.body.cost_center === plate, { status: result.status, code: result.body.code }); vehicles.push(result.body);
  }
  // Reproduce centres created before vehicle_id/accounting_branch_code existed.
  const legacyConfig = (await db.tenant.findUnique({ where: { id: a.tenant } })).config;
  for (const center of legacyConfig.accounting.organization_tree.cost_centers) { delete center.vehicle_id; if (center.code === "BULK02") center.code = "BULK 02"; }
  await db.tenant.update({ where: { id: a.tenant }, data: { config: legacyConfig } });
  await own(() => db.vehicle.updateMany({ where: { id: { in: vehicles.map(vehicle => vehicle.id) } }, data: { metadata: {}, cost_center: "" } }));
  const customers = await own(() => Promise.all([1, 2].map(index => db.party.create({ data: { type: "customer", name: "QA Import " + index, tax_id: "900" + run + index } }))));
  const destinations = await own(() => Promise.all(customers.map((customer, index) => db.transportDeliveryPoint.create({ data: { code: "STORE" + index, name: "Tienda QA " + index, address: "Calle QA", city: "Bogotá", customer_party_id: customer.id } }))));
  const rate = await own(() => db.transportRateCard.create({ data: { code: "BULK-RATE", name: "Flete QA", status: "activa", valid_from: new Date("2020-01-01"), valid_to: new Date("2099-01-01"), currency: "COP", base_rate: 1000 } }));
  await own(() => db.transportSettlementType.create({ data: { code: "TRANSPORTADOR", name: "Transporte", requires_reinforced_approval: true, documentary_policy: "alerta" } }));
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Bogota" }).format(new Date());
  const format = require(path.join(root, "apps/api/src/modules/transport/settlement-import-format.json"));
  const { compatibleWorkbook } = require(path.join(root, "apps/api/src/modules/transport/settlement-import"));
  const ExcelJS = require("exceljs");
  async function workbook(rows) {
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(await compatibleWorkbook(fs.readFileSync(path.join(root, "apps/web/public/plantillas/Plantilla_Liquidaciones_Transporte.xlsx"))));
    const sheet = book.getWorksheet(format.sheet); rows.forEach((row, index) => { sheet.getRow(index + 2).values = row; });
    return Buffer.from(await book.xlsx.writeBuffer());
  }
  const line = (pack, doc, vehicle, customer, quantity) => [pack, doc, vehicle, vehicle, customers[customer].tax_id, today, destinations[customer].code, rate.code, 1, quantity, "Soporte QA " + doc, "Carga QA " + run];
  const rows = [line("P1-" + run, "D11-" + run, "BULK01", 0, 2), line("P1-" + run, "D12-" + run, "BULK01", 1, 1), line("P2-" + run, "D21-" + run, "BULK02", 0, 3)];
  const bytes = await workbook(rows);
  fs.writeFileSync(path.join(output, "functional-fixture.xlsx"), bytes);
  const counts = () => own(async () => ({ packages: await db.transportSettlementPackage.count(), items: await db.transportSettlementItem.count(), approvals: await db.transportSettlementApproval.count(), documents: await db.cntCabdoc.count(), audit: await db.auditLog.count({ where: { entity: "TransportSettlementPackage" } }) }));
  check("anonymous_upload_denied", (await upload(null, "validate", bytes)).status === 401);
  check("reader_upload_denied", (await upload(viewer.token, "validate", bytes)).status === 403);
  const scopePreview = await upload(scoped.token, "validate", bytes);
  check("role_scope_checked_inside_workbook", scopePreview.status === 200 && !scopePreview.body.valid && scopePreview.body.errors.some(error => error.code === "TMS_IMPORT_ROLE_SCOPE"));
  const badCenter = rows.map(row => [...row]); badCenter[2][3] = "WRONG";
  const invalid = await upload(operator.token, "validate", await workbook(badCenter));
  check("wrong_center_has_row_error_without_writes", invalid.body.valid === false && invalid.body.errors.some(row => row.row === 4 && row.code === "TMS_IMPORT_CENTER") && (await counts()).packages === 0);
  const foreign = await upload(b.token, "validate", bytes);
  check("cross_tenant_references_not_resolved", foreign.status === 200 && !foreign.body.valid);
  let preview = await upload(operator.token, "validate", bytes);
  check("preview_calculates_all_packages_and_centers", preview.status === 200 && preview.body.valid && preview.body.packages.length === 2 && preview.body.packages.reduce((sum, row) => sum + row.total, 0) === 6000 && preview.body.packages.every(row => row.center.branch_code === "BR-BULK" && row.center.society_code === "SOC-BULK"), preview.body.errors);
  await own(() => db.transportRateCard.update({ where: { id: rate.id }, data: { base_rate: 1100 } }));
  check("stale_pricing_preview_denied", (await upload(operator.token, "commit", bytes, preview.body.preview_hash)).status === 409 && (await counts()).packages === 0);
  await own(() => db.transportRateCard.update({ where: { id: rate.id }, data: { base_rate: 1000 } }));
  await own(() => db.transportSettlementType.updateMany({ where: { code: "TRANSPORTADOR" }, data: { documentary_policy: "bloqueo", required_documents: ["poliza"] } }));
  const beforeBlocked = await counts();
  const blocked = await upload(operator.token, "commit", bytes, preview.body.preview_hash);
  check("documentary_block_rolls_back_packages_items_and_audit", blocked.status === 409 && JSON.stringify(await counts()) === JSON.stringify(beforeBlocked), { status: blocked.status, code: blocked.body.code });
  await own(() => db.transportSettlementType.updateMany({ where: { code: "TRANSPORTADOR" }, data: { documentary_policy: "alerta", required_documents: [] } }));
  const commits = await Promise.all([upload(operator.token, "commit", bytes, preview.body.preview_hash), upload(operator.token, "commit", bytes, preview.body.preview_hash)]);
  check("concurrent_imports_create_once", commits.every(result => result.status === 200 && result.body.valid) && (await counts()).packages === 2 && (await counts()).items === 3, commits.map(result => ({ status: result.status, code: result.body.code })));
  let packages = commits[0].body.packages;
  check("imports_stop_at_review_without_fake_approvals", packages.every(pkg => pkg.status === "en_revision") && (await counts()).approvals === 0 && (await counts()).documents === 0);
  const selection = () => packages.map(pkg => ({ id: pkg.id, version: pkg.version }));
  check("import_only_role_cannot_approve", (await call(importer.token, "/transport/settlement-import/approve", "POST", { packages: selection() })).status === 403);
  check("import_only_role_cannot_account", (await call(importer.token, "/transport/settlement-import/account", "POST", { packages: selection(), income_account_code: "1", receivable_account_code: "1", posting_date: today, due_date: today })).status === 403);
  const self = await call(operator.token, "/transport/settlement-import/approve", "POST", { packages: selection() });
  check("reinforced_approval_requires_different_person", self.body.results.every(row => !row.success && row.code === "TMS_SETTLEMENT_SEGREGATION_VIOLATION") && (await counts()).approvals === 0);
  const stale = await call(approver.token, "/transport/settlement-import/approve", "POST", { packages: selection().map(row => ({ ...row, version: 0 })) });
  check("stale_versions_cannot_approve", stale.body.results.every(row => !row.success && row.code === "TMS_SETTLEMENT_VERSION_CONFLICT"));
  const options = (await call(accountant.token, "/transport/settlement-accounting-options")).body;
  const account = { income_account_code: options.income_accounts[0].code, receivable_account_code: options.receivable_accounts[0].code, posting_date: today, due_date: today };
  const early = await call(accountant.token, "/transport/settlement-import/account", "POST", { packages: selection(), ...account });
  check("posting_before_approval_denied", early.body.results.every(row => !row.success) && (await counts()).documents === 0);
  const approvals = await call(approver.token, "/transport/settlement-import/approve", "POST", { packages: selection() });
  check("independent_actor_approves_with_audit", approvals.body.results.every(row => row.success && row.package.status === "aprobada") && (await counts()).approvals === 2);
  packages = approvals.body.results.map(row => row.package);
  await call(approver.token, "/transport/settlement-import/approve", "POST", { packages: selection() });
  check("approval_retry_does_not_duplicate_decisions", (await counts()).approvals === 2);
  const tenant = await db.tenant.findUnique({ where: { id: a.tenant } });
  const modified = JSON.parse(JSON.stringify(tenant.config));
  const driftCenter = modified.accounting.organization_tree.cost_centers.find(center => center.code === "BULK 02");
  driftCenter.vehicle_id = vehicles[1].id; driftCenter.code = "WRONG-CENTER";
  await db.tenant.update({ where: { id: a.tenant }, data: { config: modified } });
  const drift = await call(accountant.token, `/transport/settlement-packages/${packages[1].id}/account`, "POST", { version: packages[1].version, ...account });
  check("ordinary_posting_also_rejects_changed_import_center", drift.status === 422 && drift.body.code === "TMS_IMPORT_CENTER_CHANGED" && (await counts()).documents === 0, { status: drift.status, code: drift.body.code });
  await db.tenant.update({ where: { id: a.tenant }, data: { config: tenant.config } });
  const wrongAccount = await call(accountant.token, "/transport/settlement-import/account", "POST", { packages: selection(), ...account, income_account_code: account.receivable_account_code });
  check("invalid_accounts_create_no_documents", wrongAccount.body.results.every(row => !row.success) && (await counts()).documents === 0);
  await call(a.token, `/accounting/periods/${today.slice(0, 7)}`, "PATCH", { status: "closed" });
  const closed = await call(accountant.token, "/transport/settlement-import/account", "POST", { packages: selection(), ...account });
  check("closed_accounting_period_blocks_posting", closed.body.results.every(row => !row.success) && (await counts()).documents === 0);
  await call(a.token, `/accounting/periods/${today.slice(0, 7)}`, "PATCH", { status: "open" });
  const posted = await call(accountant.token, "/transport/settlement-import/account", "POST", { packages: selection(), ...account });
  check("bulk_posting_creates_accounted_packages", posted.body.results.every(row => row.success && row.package.status === "contabilizada"), posted.body.results.map(row => ({ success: row.success, code: row.code, message: row.message })));
  const docs = await own(() => db.cntCabdoc.findMany({ include: { lines: true } }));
  check("three_balanced_documents_in_exact_vehicle_centers", docs.length === 3 && docs.every(doc => Number(doc.total_debit) === Number(doc.total_credit)) && docs.reduce((sum, doc) => sum + Number(doc.total_debit), 0) === 6000 && posted.body.results.every(result => result.package.accounting.payload.documents.every(link => {
    const doc = docs.find(doc => doc.id === link.accounting_document_id), center = result.package.metadata.settlement_import.center;
    return doc && doc.society_code === center.society_code && doc.lines.every(line => line.cost_center_code === center.code && line.branch_code === center.branch_code);
  })));
  check("receivables_and_ledger_created", await own(() => db.cxcCabdoc.count()) === 3 && await own(() => db.ledgerEntry.count()) === 6);
  const balances = await own(() => db.party.findMany({ where: { id: { in: customers.map(customer => customer.id) } } }));
  check("customer_balances_match_their_own_services", Number(balances.find(customer => customer.id === customers[0].id).receivable_balance) === 5000 && Number(balances.find(customer => customer.id === customers[1].id).receivable_balance) === 1000);
  await call(accountant.token, "/transport/settlement-import/account", "POST", { packages: selection(), ...account });
  check("posting_retry_creates_no_duplicates", (await counts()).documents === 3);
  const other = await call(b.token, "/transport/settlement-import/account", "POST", { packages: selection(), ...account });
  check("foreign_tenant_cannot_post_known_package_ids", other.body.results.every(row => !row.success) && (await counts()).documents === 3);
  const replay = await upload(operator.token, "commit", bytes, preview.body.preview_hash);
  check("file_replay_after_accounting_returns_original_packages", replay.body.packages.every(pkg => pkg.idempotent_replay && packages.some(original => original.id === pkg.id)) && (await counts()).packages === 2);
  await own(() => db.transportRateCard.update({ where: { id: rate.id }, data: { status: "inactiva" } }));
  const retiredRateReplay = await upload(operator.token, "validate", bytes);
  check("exact_replay_keeps_historical_tariff_even_after_retirement", retiredRateReplay.body.valid && retiredRateReplay.body.packages.every(pkg => pkg.existing_id));
  await own(() => db.transportRateCard.update({ where: { id: rate.id }, data: { status: "activa" } }));
  const changedRows = rows.map(row => [...row]); changedRows[0][9] = 9;
  const changed = await upload(operator.token, "validate", await workbook(changedRows));
  check("same_external_reference_cannot_change_content", !changed.body.valid && changed.body.errors.some(row => row.code === "TMS_IMPORT_REFERENCE_USED"));
  // Browser proof uses a separate document reference and the same real role tokens.
  const browserBytes = await workbook([line("UI-" + run, "UI-DOC-" + run, "BULK01", 0, 1)]);
  fs.writeFileSync(path.join(output, "browser-fixture.xlsx"), browserBytes);
  await require("./transport-settlement-import-browser.cjs")({ base, output, operator, approver, accountant, account, file: path.join(output, "browser-fixture.xlsx"), reference: "UI-" + run, check });
  const capacityRows = Array.from({ length: 200 }, (_, index) => line(`LOAD-${run}-${index % 30}`, `LOAD-DOC-${run}-${index}`, index % 30 % 2 ? "BULK02" : "BULK01", index % 2, 1));
  const capacityBytes = await workbook(capacityRows);
  const capacityPreview = await upload(operator.token, "validate", capacityBytes);
  check("capacity_preview_200_rows_30_packages", capacityPreview.body.valid && capacityPreview.body.packages.length === 30, capacityPreview.body.errors);
  const started = Date.now();
  const capacity = await upload(operator.token, "commit", capacityBytes, capacityPreview.body.preview_hash);
  check("capacity_commit_is_atomic_and_within_transaction_budget", capacity.status === 200 && capacity.body.valid && capacity.body.packages.length === 30 && capacity.body.packages.reduce((sum, pkg) => sum + pkg.items.length, 0) === 200 && capacity.body.packages.every(pkg => pkg.status === "en_revision"), { status: capacity.status, elapsed_ms: Date.now() - started, code: capacity.body.code });
  return { tenant: a.tenant, other_tenant: b.tenant, packages: packages.map(pkg => ({ id: pkg.id, code: pkg.code })), references: rows.map(row => row[0]) };
}
main().then(result => finish("passed", result)).catch(error => { console.error(error.stack); finish("failed", { error: error.message }); });
async function finish(status, detail) {
  detail.vehicle_accounting_sha256 = crypto.createHash("sha256").update(fs.readFileSync(path.join(root, "apps/api/src/modules/transport/vehicle-accounting.js"))).digest("hex");
  if (app) await app.close(); if (db) await db.$disconnect();
  const sources = ["apps/api/src/modules/transport/settlement-import.js", "apps/api/src/modules/transport/settlement-service.js", "apps/api/src/modules/transport/settlement-posting.js", "apps/api/src/modules/transport/routes.js", "apps/web/components/transport/SettlementBulkImport.tsx", "apps/web/public/plantillas/Plantilla_Liquidaciones_Transporte.xlsx"];
  fs.writeFileSync(path.join(output, "evidence.json"), JSON.stringify({ status, environment: "LOCAL_DESARROLLO", head: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), source_sha256: Object.fromEntries(sources.map(file => [file, crypto.createHash("sha256").update(fs.readFileSync(path.join(root, file))).digest("hex")])), checks, ...detail }, null, 2));
  console.log(JSON.stringify({ status, checks: checks.length, artifacts: output })); process.exitCode = status === "passed" ? 0 : 1;
}
