const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const bcrypt = require("bcrypt");

async function main() {
  const outputArg = process.argv.find((arg) => arg.startsWith("--output="));
  const output = path.resolve(outputArg ? outputArg.slice(9) : "reports/qa/apex-heart-local-certification.json");
  const build = require("../../apps/api/server");
  const app = await build();
  const prisma = require("../../apps/api/src/core/prisma");
  const checks = [];
  let fixture = null;
  const check = (name, condition, detail) => { assert.ok(condition, `${name}: ${detail}`); checks.push({ name, status: "passed", detail }); };
  try {
    const login = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { email: "demo@apex.local", password: "test1234" } });
    check("authentication", login.statusCode === 200, `HTTP ${login.statusCode}`);
    const token = login.json().token;
    const headers = { authorization: `Bearer ${token}` };
    const demoUser = await prisma.user.findFirst({ where: { email: "demo@apex.local" } });
    const demoTenant = await prisma.tenant.findUnique({ where: { id: demoUser.tenant_id } });
    await prisma.apexHeartAlert.deleteMany({ where: { tenant_id: demoTenant.id } });
    await prisma.tenant.update({ where: { id: demoTenant.id }, data: { name: "NYVORA" } });
    const deniedRole = await prisma.role.create({ data: { tenant_id: demoTenant.id, name: `Sin Apex Heart ${Date.now()}` } });
    const deniedUser = await prisma.user.create({ data: { tenant_id: demoTenant.id, name: "QA sin permiso", email: `heart-denied-${Date.now()}@local.test`, password: await bcrypt.hash("test1234", 10), role_id: deniedRole.id } });
    const otherTenant = await prisma.tenant.create({ data: { name: `QA Tenant Aislado ${Date.now()}`, domain: `heart-${Date.now()}.local`, active_modules: ["M-28", "apex_heart"] } });
    const otherRole = await prisma.role.create({ data: { tenant_id: otherTenant.id, name: "APEX_ADMIN" } });
    await prisma.permission.createMany({ data: [{ role_id: otherRole.id, module: "apex-heart", action: "reports" }, { role_id: otherRole.id, module: "apex-heart", action: "configure" }] });
    const otherUser = await prisma.user.create({ data: { tenant_id: otherTenant.id, name: "QA otro tenant", email: `heart-other-${Date.now()}@local.test`, password: await bcrypt.hash("test1234", 10), role_id: otherRole.id } });
    fixture = { demoTenant, deniedRole, deniedUser, otherTenant, otherRole, otherUser };
    const dashboard = await app.inject({ method: "GET", url: "/api/v1/apex-heart/dashboard", headers });
    check("dashboard_endpoint", dashboard.statusCode === 200, `HTTP ${dashboard.statusCode}`);
    const body = dashboard.json();
    check("populated_metrics", body.metrics.revenue > 0 && body.metrics.inventory_value > 0 && body.metrics.gross_profit > 0, JSON.stringify({ revenue: body.metrics.revenue, inventory: body.metrics.inventory_value, profit: body.metrics.gross_profit }));
    check("abc_parity", body.products.length >= 6 && body.products.some((item) => item.abc_class === "A") && body.products.some((item) => item.abc_class === "C"), `${body.products.length} products`);
    check("management_contexts", body.categories.length >= 5 && body.monthly.length >= 12 && body.purchase_trend.length >= 12, `${body.categories.length} categories / ${body.monthly.length} sales months / ${body.purchase_trend.length} purchase months`);
    check("document_traceability", body.invoice_details.length >= 100 && body.invoice_details.every((line) => line.number && line.customer && line.product), `${body.invoice_details.length} invoice lines`);
    check("aging_analysis", body.receivable_aging.length === 5 && body.payable_aging.length === 5 && body.receivable_aging.reduce((sum, row) => sum + row.value, 0) > 0, "five receivable and payable aging buckets");
    check("inventory_analysis", body.inventory_health.length === 4 && body.inventory_trend.length >= 12, `${body.inventory_health.length} health bands / ${body.inventory_trend.length} months`);
    check("cash_cycle", Number.isFinite(body.metrics.cash_cycle_days) && Number.isFinite(body.metrics.cash_effort) && Number.isFinite(body.metrics.financing_cost), JSON.stringify({ days: body.metrics.cash_cycle_days, effort: body.metrics.cash_effort, cost: body.metrics.financing_cost }));
    check("configurable_rules", body.rules.length >= 6 && body.computed_alerts.length > 0, `${body.rules.length} rules / ${body.computed_alerts.length} active conditions`);
    const deniedLogin = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { email: deniedUser.email, password: "test1234" } });
    const deniedDashboard = await app.inject({ method: "GET", url: "/api/v1/apex-heart/dashboard", headers: { authorization: `Bearer ${deniedLogin.json().token}` } });
    check("permission_denied", deniedLogin.statusCode === 200 && deniedDashboard.statusCode === 403, `HTTP ${deniedDashboard.statusCode}`);
    const originalRate = body.config.annual_financing_rate;
    const config = await app.inject({ method: "PATCH", url: "/api/v1/apex-heart/config", headers, payload: { annual_financing_rate: 15.25 } });
    check("config_update", config.statusCode === 200 && config.json().annual_financing_rate === 15.25, `HTTP ${config.statusCode}`);
    const rule = body.rules[0];
    const updateRule = await app.inject({ method: "PUT", url: `/api/v1/apex-heart/alert-rules/${rule.id}`, headers, payload: { warning_threshold: rule.warning_threshold + 1, critical_threshold: rule.critical_threshold, enabled: true } });
    check("rule_update", updateRule.statusCode === 200 && updateRule.json().warning_threshold === rule.warning_threshold + 1, `HTTP ${updateRule.statusCode}`);
    const evaluated = await app.inject({ method: "POST", url: "/api/v1/apex-heart/alerts/evaluate", headers, payload: {} });
    check("alert_evaluation", evaluated.statusCode === 200 && evaluated.json().created_or_updated > 0, `HTTP ${evaluated.statusCode}`);
    const refreshed = await app.inject({ method: "GET", url: "/api/v1/apex-heart/dashboard?limit=100", headers });
    const openAlert = refreshed.json().alerts[0];
    check("persistent_alerts", Boolean(openAlert?.id), `${refreshed.json().alerts.length} open alerts`);
    const otherLogin = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { email: otherUser.email, password: "test1234" } });
    const crossTenant = await app.inject({ method: "POST", url: `/api/v1/apex-heart/alerts/${openAlert.id}/acknowledge`, headers: { authorization: `Bearer ${otherLogin.json().token}` } });
    check("tenant_isolation", otherLogin.statusCode === 200 && crossTenant.statusCode === 404, `HTTP ${crossTenant.statusCode}`);
    const acknowledged = await app.inject({ method: "POST", url: `/api/v1/apex-heart/alerts/${openAlert.id}/acknowledge`, headers });
    check("alert_acknowledgement", acknowledged.statusCode === 200 && acknowledged.json().status === "acknowledged", `HTTP ${acknowledged.statusCode}`);
    await app.inject({ method: "PATCH", url: "/api/v1/apex-heart/config", headers, payload: { annual_financing_rate: originalRate } });
    await app.inject({ method: "PUT", url: `/api/v1/apex-heart/alert-rules/${rule.id}`, headers, payload: { warning_threshold: rule.warning_threshold, critical_threshold: rule.critical_threshold, enabled: rule.enabled } });
    check("model_company", (await prisma.tenant.findUnique({ where: { id: demoTenant.id } })).name === "NYVORA", "NYVORA controlled fixture");
    const result = { certification: "apex-heart-local", version: 3, status: "passed", generated_at: new Date().toISOString(), commit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), environment: { type: "local-isolated-qa", database: new URL(process.env.DATABASE_URL).pathname.slice(1), node: process.version }, checks, summary: { metrics: body.metrics, products: body.products.length, categories: body.categories.length, invoice_lines: body.invoice_details.length, rules: body.rules.length } };
    fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
    console.log(JSON.stringify(result, null, 2));
  } finally {
    if (fixture) {
      await prisma.tenant.update({ where: { id: fixture.demoTenant.id }, data: { name: fixture.demoTenant.name } }).catch(() => undefined);
      await prisma.authorizationSession.deleteMany({ where: { user_id: { in: [fixture.deniedUser.id, fixture.otherUser.id] } } });
      await prisma.apexHeartAlert.deleteMany({ where: { tenant_id: fixture.otherTenant.id } });
      await prisma.apexHeartInventorySnapshot.deleteMany({ where: { tenant_id: fixture.otherTenant.id } });
      await prisma.$executeRaw`DELETE FROM "apex_heart_alert_rules" WHERE "tenant_id" = ${fixture.otherTenant.id}`;
      await prisma.$executeRaw`DELETE FROM "apex_heart_configs" WHERE "tenant_id" = ${fixture.otherTenant.id}`;
      await prisma.user.deleteMany({ where: { id: { in: [fixture.deniedUser.id, fixture.otherUser.id] } } });
      await prisma.permission.deleteMany({ where: { role_id: { in: [fixture.deniedRole.id, fixture.otherRole.id] } } });
      await prisma.role.deleteMany({ where: { id: { in: [fixture.deniedRole.id, fixture.otherRole.id] } } });
      await prisma.$executeRaw`DELETE FROM "Tenant" WHERE "id" = ${fixture.otherTenant.id}`;
    }
    await app.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
