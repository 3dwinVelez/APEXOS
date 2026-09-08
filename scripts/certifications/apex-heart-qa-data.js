require("../load-env")();
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");

const supabaseUrl = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
const serviceKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "");
const webUrl = String(process.env.QA_WEB_URL || "https://apexos-web-qa-production.up.railway.app").replace(/\/$/, "");
const email = String(process.env.QA_APEX_HEART_ADMIN_EMAIL || "admin@apexos.qa");
const outputArg = process.argv.find((arg) => arg.startsWith("--output="));
const output = path.resolve(outputArg ? outputArg.slice(9) : "reports/qa/apex-heart-qa-data.json");

async function json(response, name) { const body = await response.json(); assert.ok(response.ok, `${name}: HTTP ${response.status} ${JSON.stringify(body).slice(0, 300)}`); return body; }
async function main() {
  assert.ok(supabaseUrl.includes("jbirkghkekuifgfsgquq.supabase.co") && serviceKey, "Se requiere la conexión Supabase QA esperada.");
  const generated = await json(await fetch(`${supabaseUrl}/auth/v1/admin/generate_link`, { method: "POST", headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "content-type": "application/json" }, body: JSON.stringify({ type: "magiclink", email }) }), "generate_link");
  const hashedToken = generated.hashed_token || generated.properties?.hashed_token;
  const session = await json(await fetch(`${supabaseUrl}/auth/v1/verify`, { method: "POST", headers: { apikey: serviceKey, "content-type": "application/json" }, body: JSON.stringify({ type: "magiclink", token_hash: hashedToken }) }), "verify");
  assert.ok(session.access_token, "Supabase no entregó sesión QA.");
  const month = Math.min(new Date().getUTCMonth() + 1, 12), to = `2026-${String(month).padStart(2, "0")}-30`;
  const dashboard = await json(await fetch(`${webUrl}/api/v1/apex-heart/dashboard?from=2026-01-01&to=${to}&limit=100`, { headers: { authorization: `Bearer ${session.access_token}` } }), "dashboard");
  const datasets = { products: dashboard.products?.length, categories: dashboard.categories?.length, monthly: dashboard.monthly?.length, purchase_trend: dashboard.purchase_trend?.length, receivable_aging: dashboard.receivable_aging?.length, payable_aging: dashboard.payable_aging?.length, inventory_health: dashboard.inventory_health?.length, inventory_trend: dashboard.inventory_trend?.length, invoice_details: dashboard.invoice_details?.length, alerts: dashboard.computed_alerts?.length };
  const checks = {
    commercial_history: dashboard.data_status?.invoices >= month * 5 && datasets.monthly === month,
    purchasing_history: dashboard.data_status?.payables >= month && datasets.purchase_trend === month,
    inventory_history: dashboard.data_status?.inventory_snapshots >= month * 36 && datasets.inventory_trend === month && datasets.inventory_health === 4,
    portfolio_context: datasets.receivable_aging === 5 && datasets.payable_aging === 5,
    product_context: datasets.products >= 36 && datasets.categories >= 6 && datasets.invoice_details >= 250,
    active_metrics: dashboard.metrics?.revenue > 0 && dashboard.metrics?.gross_profit > 0 && dashboard.metrics?.inventory_value > 0 && dashboard.metrics?.purchases > 0
  };
  for (const [name, passed] of Object.entries(checks)) assert.ok(passed, `${name} no alcanzó cobertura: ${JSON.stringify({ datasets, data_status: dashboard.data_status })}`);
  const result = { certification: "apex-heart-qa-ytd-data", version: 1, status: "passed", generated_at: new Date().toISOString(), environment: "QA develop", tenant: "Cliente Piloto QA", period: { from: "2026-01-01", to }, checks: Object.entries(checks).map(([name]) => ({ name, status: "passed" })), data_status: dashboard.data_status, datasets, metrics: dashboard.metrics };
  fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result, null, 2));
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
