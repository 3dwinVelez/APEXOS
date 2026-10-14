#!/usr/bin/env node

/* Real Fastify + Prisma local flow. No mocks, Supabase calls, or remote writes. */
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const rootArg = process.argv.find((arg) => arg.startsWith("--root="));
const expectedArg = process.argv.find((arg) => arg.startsWith("--expected-commit="));
const outputArg = process.argv.find((arg) => arg.startsWith("--output="));
const root = path.resolve(rootArg ? rootArg.slice(7) : path.resolve(__dirname, "../.."));
const expectedCommit = expectedArg?.slice(18) || "";
const output = outputArg ? path.resolve(outputArg.slice(9)) : null;
const databaseUrl = String(process.env.DATABASE_URL || "");

function git(args) { return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim(); }
function localDb() {
  if (!databaseUrl) throw new Error("DATABASE_URL debe proporcionarse explicitamente");
  const url = new URL(databaseUrl);
  assert.ok(["localhost", "127.0.0.1"].includes(url.hostname), "DATABASE_URL debe apuntar a PostgreSQL local");
}
function body(response) {
  try { return response.json(); } catch { return null; }
}
function pickRow(value, predicate) {
  if (Array.isArray(value)) return value.find(predicate) || value[0];
  if (Array.isArray(value?.items)) return value.items.find(predicate) || value.items[0];
  if (Array.isArray(value?.data)) return value.data.find(predicate) || value.data[0];
  return value?.data || value;
}
async function main() {
  localDb();
  const commit = git(["rev-parse", "HEAD"]);
  assert.ok(expectedCommit && commit === expectedCommit, `SHA candidato incorrecto: ${commit} != ${expectedCommit}`);
  process.env.NODE_ENV = "test";
  process.env.DISABLE_REDIS = "true";
  process.env.REDIS_DISABLED = "true";
  process.env.RAILWAY_GIT_COMMIT_SHA = commit;
  const build = require(path.join(root, "apps/api/server.js"));
  const prisma = require(path.join(root, "apps/api/src/core/prisma.js"));
  const app = await build();
  const run = [];
  const suffix = `${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
  async function request(method, url, token, payload, expected = [200, 201]) {
    const response = await app.inject({ method, url, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(payload ? { "content-type": "application/json" } : {}) }, payload: payload ? JSON.stringify(payload) : undefined });
    const parsed = body(response);
    const ok = expected.includes(response.statusCode);
    run.push({ method, url, status: response.statusCode, ok });
    assert.ok(ok, `${method} ${url} -> ${response.statusCode}: ${JSON.stringify(parsed).slice(0, 300)}`);
    return parsed;
  }
  async function register(label) {
    const email = `protected-${label}-${suffix}@apexos.local`;
    const password = `Protected-${suffix}!`;
    const result = await request("POST", "/api/v1/auth/register", null, { company_name: `Protected ${label} ${suffix}`, industry: "qa", email, password, name: `Protected ${label}`, country: "CO", timezone: "America/Bogota", currency: "COP", plan: "crown" });
    return { ...result, email, password, token: result.token };
  }
  try {
    const health = await request("GET", "/health", null, undefined);
    assert.equal(health.commit, commit.slice(0, 12), "health no corresponde al candidato cargado");
    const first = await register("primary");
    const second = await register("other-tenant");
    assert.ok(first.token && second.token, "registro debe devolver token local");
    const me = await request("GET", "/api/v1/auth/me", first.token);
    assert.equal(me.tenant_id || me.tenant?.id, first.tenant?.id, "sesion no conserva tenant");

    await request("POST", "/api/v1/accounting/chart/init", first.token, { country: "CO" });
    await request("POST", "/api/v1/accounting/organization-tree", first.token, { type: "society", code: "SOC-01", name: "Sociedad protected", active: true });
    await request("POST", "/api/v1/accounting/organization-tree", first.token, { type: "branch", code: "BR-QA", name: "Sucursal protected", society_code: "SOC-01", active: true });
    await request("POST", "/api/v1/accounting/organization-tree", first.token, { type: "cost_center", code: "CC-QA", name: "Centro protected", society_code: "SOC-01", branch_code: "BR-QA", active: true });
    const accounts = await request("GET", "/api/v1/accounting/accounts", first.token);
    assert.ok(Array.isArray(accounts) || Array.isArray(accounts?.data), "cuentas contables deben ser una coleccion");

    const familyCode = `FAM-${suffix}`;
    const itemCodeRange = `8${Date.now().toString().slice(-5)}`;
    const family = await request("POST", "/api/v1/inventory/families", first.token, { code: familyCode, name: "Familia protected", society_code: "SOC-01", branch_code: "BR-QA", code_start: `${itemCodeRange}00`, code_end: `${itemCodeRange}99`, active: true, accounting: { goods_receipt_account_code: "1435", gr_ir_account_code: "2205", sales_cost_account_code: "5105", sales_revenue_account_code: "4135", return_revenue_account_code: "4135", manual_in_account_code: "1435", manual_out_account_code: "5195", active: true } });
    const familyRow = pickRow(family, (row) => row?.code === familyCode);
    const warehouse = await request("POST", "/api/v1/inventory/warehouses", first.token, { code: `WH-${suffix}`, name: "Bodega protected", address: "Local", city: "Medellin", country: "CO", society_code: "SOC-01", branch_code: "BR-QA", cost_center_code: "CC-QA", warehouse_type: "owned", active: true, metadata: { protected_regression: suffix } });
    const warehouseRow = pickRow(warehouse, (row) => row?.code === `WH-${suffix}`);
    const itemCode = `${itemCodeRange}01`;
    const item = await request("POST", "/api/v1/inventory/items", first.token, { code: itemCode, name: "Producto protected", type: "product", unit: "UND", family_code: familyRow.code || familyCode, society_code: "SOC-01", branch_code: "BR-QA", costing_method: "weighted_average", unit_cost: 12000, unit_price: 18000, tax_rate: 19, stock_min: 0, stock_max: 20, metadata: { protected_regression: suffix } });
    const itemRow = pickRow(item, (row) => row?.code === itemCode);
    const supplier = await request("POST", "/api/v1/purchases/suppliers", first.token, { name: "Proveedor protected", tax_id: `901${Date.now().toString().slice(-6)}`, tax_type: "company", email: `supplier-${suffix}@apexos.local`, city: "Medellin", country: "CO", credit_days: 30, metadata: { protected_regression: suffix } });
    const supplierRow = pickRow(supplier, (row) => row?.name === "Proveedor protected");
    const po = await request("POST", "/api/v1/purchases/orders", first.token, { supplier_id: supplierRow.id, warehouse_id: warehouseRow.id, expected_at: new Date(Date.now() + 86400000).toISOString(), notes: "Protected regression", currency: "COP", payment_terms: "30D", lines: [{ item_id: itemRow.id, qty: 2, unit_cost: 12000, unit: "UND", tax_rate: 19, notes: "Protected" }] });
    await request("POST", `/api/v1/purchases/orders/${po.id}/approve`, first.token, {});
    const locations = await request("GET", "/api/v1/inventory/locations", first.token);
    const location = (locations?.data || locations).find((row) => Number(row.place_id) === Number(warehouseRow.id));
    assert.ok(location?.id, "orden debe tener ubicacion de recepcion");
    await request("POST", `/api/v1/purchases/orders/${po.id}/receive`, first.token, { received_lines: [{ line_id: po.lines?.[0]?.id, qty_received: 1, location_id: location.id }], notes: "Protected receipt" });
    const kardex = await request("GET", `/api/v1/inventory/kardex/${itemRow.id}`, first.token);
    assert.ok(kardex, "kardex debe responder tras recepcion");

    const otherItems = await request("GET", "/api/v1/inventory/items", second.token);
    const otherRows = otherItems?.data || otherItems;
    assert.ok(!otherRows.some((row) => row.code === itemCode), "otro tenant no debe ver el producto");
    const anonymous = await app.inject({ method: "GET", url: "/api/v1/inventory/items" });
    assert.equal(anonymous.statusCode, 401, "endpoint protegido debe rechazar anonimo");
    run.push({ method: "GET", url: "/api/v1/inventory/items", status: anonymous.statusCode, ok: true });
    const result = { certification: "protected-flows-http-local", version: 1, certification_role: "local_e2e_support", environment: "LOCAL", status: "passed", commit, database_host: new URL(databaseUrl).hostname, checks: run, limitations: ["No sustituye navegador QA ni qa-full-system-validation con Supabase.", "No ejecuta migraciones remotas."] };
    if (output) { fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`); }
    console.log(JSON.stringify(result, null, 2));
  } finally { await app.close(); await prisma.$disconnect(); }
}
main().catch((error) => { console.error(JSON.stringify({ certification: "protected-flows-http-local", status: "failed", error: String(error.stack || error) })); process.exitCode = 1; });
