/* Real local certification: ExcelJS -> Fastify HTTP multipart -> Prisma/PostgreSQL ledger. */
process.env.NODE_ENV = "test";
process.env.DISABLE_BACKGROUND_WORKERS = "true";
process.env.REDIS_DISABLED = "true";
process.env.REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";
process.env.JWT_SECRET = process.env.JWT_SECRET || "opening-balances-certification-secret-2026";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const ExcelJS = require("exceljs");
const { PrismaClient } = require("@prisma/client");
const { sign } = require("../../src/security/jwt");
const build = require("../../server");

const db = new PrismaClient();
const suffix = crypto.randomBytes(5).toString("hex");
const tenantId = `opening-cert-${suffix}`;
const tenant2Id = `opening-cert-other-${suffix}`;
const evidencePath = process.env.OPENING_BALANCES_EVIDENCE_PATH || path.resolve(__dirname, "../../../../docs/qa/evidence/gastos-saldos-iniciales-20261014/opening-balances-local.json");
const checks = [];

function check(name, status, details = {}) {
  checks.push({ name, status, ...details });
}

function multipart(buffer, filename = "saldos.xlsx") {
  const boundary = `----apex-opening-${suffix}`;
  const head = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n`;
  return { body: Buffer.concat([Buffer.from(head), buffer, Buffer.from(`\r\n--${boundary}--\r\n`)]), contentType: `multipart/form-data; boundary=${boundary}` };
}

async function workbook(rows) {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet("Saldos iniciales");
  sheet.addRow(["Plantilla"]); sheet.addRow([""]); sheet.addRow([""]);
  sheet.addRow(["fecha_corte", "cuenta", "centro_costo", "sucursal", "saldo", "tercero"]);
  rows.forEach((row) => sheet.addRow(row));
  return book.xlsx.writeBuffer();
}

function auth(tenant = tenantId, userId = 1) {
  return `Bearer ${sign({ id: userId, tenant_id: tenant, role: { name: "APEX_ADMIN", permissions: [{ module: "accounting", action: "*" }] } })}`;
}

async function inject(app, url, buffer, token = auth()) {
  const form = multipart(buffer);
  return app.inject({ method: "POST", url, headers: { authorization: token, "content-type": form.contentType }, payload: form.body });
}

async function seed() {
  const config = { accounting: { organization_tree: { societies: [{ code: "SOC-CERT", name: "Sociedad certificacion", active: true }], branches: [{ code: "BR-CERT", name: "Sucursal certificacion", society_code: "SOC-CERT", active: true }, { code: "BR-CERT-2", name: "Sucursal certificacion 2", society_code: "SOC-CERT", active: true }], cost_centers: [{ code: "CC-CERT", name: "Centro certificacion", society_code: "SOC-CERT", branch_code: "BR-CERT", active: true }, { code: "CC-CERT-2", name: "Centro certificacion 2", society_code: "SOC-CERT", branch_code: "BR-CERT-2", active: true }] } } };
  await db.tenant.createMany({ data: [
    { id: tenantId, name: "Cert opening balances", active_modules: ["M-07"], config, country: "CO", currency: "COP" },
    { id: tenant2Id, name: "Cert other tenant", active_modules: ["M-07"], config: {}, country: "CO", currency: "COP" }
  ] });
  const role = await db.role.create({ data: { tenant_id: tenantId, name: "APEX_ADMIN", is_system: true } });
  const role2 = await db.role.create({ data: { tenant_id: tenant2Id, name: "APEX_ADMIN", is_system: true } });
  const user = await db.user.create({ data: { tenant_id: tenantId, name: "Opening cert", email: `${suffix}@cert.local`, password: "unused", role_id: role.id } });
  const user2 = await db.user.create({ data: { tenant_id: tenant2Id, name: "Opening cert other", email: `other-${suffix}@cert.local`, password: "unused", role_id: role2.id } });
  await db.account.createMany({ data: [
    { tenant_id: tenantId, code: "1305", name: "Clientes", type: "asset", allows_tx: true, active: true },
    { tenant_id: tenantId, code: "3105", name: "Capital", type: "equity", allows_tx: true, active: true }
  ] });
  return { userId: user.id, otherUserId: user2.id };
}

async function cleanup() {
  await db.cntCuedoc.deleteMany({ where: { tenant_id: { in: [tenantId, tenant2Id] } } });
  await db.cntCabdoc.deleteMany({ where: { tenant_id: { in: [tenantId, tenant2Id] } } });
  await db.ledgerEntry.deleteMany({ where: { tenant_id: { in: [tenantId, tenant2Id] } } });
  await db.account.deleteMany({ where: { tenant_id: { in: [tenantId, tenant2Id] } } });
  await db.user.deleteMany({ where: { tenant_id: { in: [tenantId, tenant2Id] } } });
  await db.permission.deleteMany({ where: { role: { tenant_id: { in: [tenantId, tenant2Id] } } } });
  await db.role.deleteMany({ where: { tenant_id: { in: [tenantId, tenant2Id] } } });
  await db.tenant.deleteMany({ where: { id: { in: [tenantId, tenant2Id] } } });
}

async function main() {
  const { userId, otherUserId } = await seed();
  const app = await build();
  await app.ready();
  try {
    const valid = await workbook([["2026-01-31", "1305", "CC-CERT", "BR-CERT", "1.234,56", ""], ["2026-01-31", "3105", "CC-CERT", "BR-CERT", "-1234.56", ""], ["2026-01-31", "1305", "CC-CERT-2", "BR-CERT-2", "500.25", ""], ["2026-01-31", "3105", "CC-CERT-2", "BR-CERT-2", "-500.25", ""]]);
    const preview = await inject(app, "/api/v1/accounting/opening-balances/validate", valid, auth(tenantId, userId));
    assert.equal(preview.statusCode, 200, preview.body);
    assert.equal(JSON.parse(preview.body).totals.debit, 1734.81);
    assert.equal(JSON.parse(preview.body).totals.credit, 1734.81);
    check("balanced_multidimension_preview", "passed", { status_code: preview.statusCode, lines: JSON.parse(preview.body).totals.lines });

    const invalid = await workbook([["2026-01-31", "1305", "CC-CERT", "BR-CERT", "100", ""], ["2026-01-31", "3105", "CC-CERT", "BR-CERT", "-99", ""]]);
    const unbalancedResponse = await inject(app, "/api/v1/accounting/opening-balances/validate", invalid, auth(tenantId, userId));
    assert.equal(unbalancedResponse.statusCode, 422);
    check("rejects_unbalanced_file", "passed", { status_code: unbalancedResponse.statusCode });
    const tenantResponse = await inject(app, "/api/v1/accounting/opening-balances/validate", valid, auth(tenant2Id, otherUserId));
    assert.ok([404, 422].includes(tenantResponse.statusCode));
    check("tenant_isolation", "passed", { status_code: tenantResponse.statusCode });

    const closedResponse = await app.inject({ method: "PATCH", url: "/api/v1/accounting/periods/2026-01", headers: { authorization: auth(tenantId, userId), "content-type": "application/json" }, payload: JSON.stringify({ status: "closed" }) });
    assert.equal(closedResponse.statusCode, 200, closedResponse.body);
    const closedValidation = await inject(app, "/api/v1/accounting/opening-balances/validate", valid, auth(tenantId, userId));
    assert.equal(closedValidation.statusCode, 423);
    check("rejects_closed_period", "passed", { status_code: closedValidation.statusCode });
    const openResponse = await app.inject({ method: "PATCH", url: "/api/v1/accounting/periods/2026-01", headers: { authorization: auth(tenantId, userId), "content-type": "application/json" }, payload: JSON.stringify({ status: "open" }) });
    assert.equal(openResponse.statusCode, 200, openResponse.body);

    const [first, second] = await Promise.all([inject(app, "/api/v1/accounting/opening-balances", valid, auth(tenantId, userId)), inject(app, "/api/v1/accounting/opening-balances", valid, auth(tenantId, userId))]);
    assert.deepEqual([first.statusCode, second.statusCode].sort((a, b) => a - b), [201, 409]);
    check("concurrent_idempotency", "passed", { status_codes: [first.statusCode, second.statusCode].sort((a, b) => a - b) });
    const posted = await db.cntCabdoc.findFirst({ where: { tenant_id: tenantId, reference: { startsWith: "SI-" } }, include: { lines: true } });
    assert.ok(posted); assert.equal(posted.lines.length, 4); assert.equal(posted.total_debit, posted.total_credit);
    assert.deepEqual(posted.lines.map((line) => `${line.branch_code}/${line.cost_center_code}`).sort(), ["BR-CERT-2/CC-CERT-2", "BR-CERT-2/CC-CERT-2", "BR-CERT/CC-CERT", "BR-CERT/CC-CERT"]);
    assert.ok(posted.lines.filter((line) => line.account_code === "1305").every((line) => line.party_id === null));
    assert.ok(posted.lines.every((line) => Number.isInteger(line.ledger_entry_id) && line.ledger_entry_id > 0));
    const ledgerCount = await db.ledgerEntry.count({ where: { tenant_id: tenantId, period: "2026-01" } });
    assert.equal(ledgerCount, 4);
    const gitCommit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
    const evidence = {
      ok: true,
      certification: "accounting-opening-balances-local",
      runtime: { database_host: new URL(process.env.DATABASE_URL).host, node: process.version, commit: gitCommit },
      fixture: { tenant_id: tenantId, period: "2026-01", society: "SOC-CERT", dimensions: { branches: 2, cost_centers: 2 }, lines: posted.lines.length, ledger_entries: ledgerCount },
      checks,
      summary: { checks: checks.length, passed: checks.filter((item) => item.status === "passed").length, rejected_cases: checks.filter((item) => item.name.startsWith("rejects_") || item.name === "tenant_isolation").length },
      result: { document: posted.full_number, total_debit: posted.total_debit, total_credit: posted.total_credit, persisted_dimensions: true, optional_party_1305: true, ledger_links: posted.lines.length }
    };
    fs.mkdirSync(path.dirname(evidencePath), { recursive: true });
    fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
    console.log(JSON.stringify(evidence));
  } finally { await app.close(); }
}

main().then(async () => {
  await cleanup().catch(() => undefined);
  await db.$disconnect();
}).catch(async (error) => {
  console.error(error);
  await cleanup().catch(() => undefined);
  await db.$disconnect();
  process.exitCode = 1;
});
