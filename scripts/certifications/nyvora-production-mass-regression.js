#!/usr/bin/env node

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const bcrypt = require("bcrypt");
const loadEnv = require("../load-env");

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) continue;
    const key = item.slice(2);
    args[key] = argv[index + 1] && !argv[index + 1].startsWith("--") ? argv[++index] : true;
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
loadEnv(args["env-file"] || "config/production.env");

const prisma = require("../../apps/api/src/core/prisma");
const apiUrl = String(args["api-url"] || process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "");
const runId = String(args["run-id"] || new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14));
const outputPath = path.resolve(args.output || `docs/audits/NYVORA_PRODUCTION_MASS_REGRESSION_${runId}.json`);
const password = `Nyvora-Mass-${crypto.randomBytes(12).toString("base64url")}#26`;
const email = `nyvora.mass.cert.${runId.toLowerCase()}@internal.apexos.local`;

const endpoints = [
  "/api/v1/auth/me",
  "/api/v1/admin/roles",
  "/api/v1/admin/users",
  "/api/v1/admin/user-master-data",
  "/api/v1/inventory/items",
  "/api/v1/inventory/families",
  "/api/v1/inventory/warehouses",
  "/api/v1/inventory/locations",
  "/api/v1/inventory/costs",
  "/api/v1/purchases/suppliers",
  "/api/v1/purchases/orders",
  "/api/v1/purchases/orders/open",
  "/api/v1/purchases/vmi-alerts",
  "/api/v1/sales/customers",
  "/api/v1/sales/orders",
  "/api/v1/sales/invoices",
  "/api/v1/sales/reports/by-customer?date_from=2026-01-01&date_to=2026-12-31",
  "/api/v1/sales/reports/by-item?date_from=2026-01-01&date_to=2026-12-31",
  "/api/v1/sales/reports/by-date?date_from=2026-01-01&date_to=2026-12-31",
  "/api/v1/sales/reports/detail?date_from=2026-01-01&date_to=2026-12-31",
  "/api/v1/invoicing/invoices",
  "/api/v1/accounts-receivable/documents",
  "/api/v1/accounts-receivable/reports/aging",
  "/api/v1/accounts-receivable/retentions",
  "/api/v1/accounting/accounts",
  "/api/v1/accounting/balance-sheet",
  "/api/v1/accounting/reports/balance-sheet",
  "/api/v1/accounting/income-statement?period=2026-08",
  "/api/v1/accounting/reports/income-statement?period=2026-08",
  "/api/v1/accounting/reports/trial-balance",
  "/api/v1/accounting/reports/taxes?period=2026-08",
  "/api/v1/accounting/reports/receivables",
  "/api/v1/accounting/reports/payables",
  "/api/v1/accounting/periods",
  "/api/v1/accounting/organization-tree",
  "/api/v1/accounting/document-masters",
  "/api/v1/accounting/vat-masters",
  "/api/v1/accounting/payable-accounts",
  "/api/v1/accounting/documents",
  "/api/v1/accounting/payables/documents",
  "/api/v1/accounting/payables/open-invoices",
  "/api/v1/projects",
  "/api/v1/projects/operational-center",
  "/api/v1/services/orders?limit=200",
  "/api/v1/services/technicians",
  "/api/v1/services/service-types",
  "/api/v1/services/service-stores",
  "/api/v1/services/satisfaction-questions",
  "/api/v1/services/references",
  "/api/v1/hr/schedules",
  "/api/v1/hr/employees?active=true",
  "/api/v1/hr/routes",
  "/api/v1/hr/routes/event-summaries",
  "/api/v1/hr/routes/preop/template",
  "/api/v1/hr/routes/preop/metrics",
  "/api/v1/hr/operations-map?date=2026-08-13&minutes=30&footprint_days=30",
  "/api/v1/hr/gps/active",
  "/api/v1/hr/gps/history",
  "/api/v1/hr/activity-types",
  "/api/v1/hr/attendance?date=2026-08-13",
  "/api/v1/hr/workdays?date=2026-08-13",
  "/api/v1/hr/payroll/config",
  "/api/v1/hr/payroll",
  "/api/v1/transport/vehicles",
  "/api/v1/transport/vehicles/metrics/dashboard",
  "/api/v1/brain/events",
  "/api/v1/brain/ecosystem",
  "/api/v1/brain/insights",
  "/api/v1/brain/mentor"
];

const expectedValidationErrors = {
  "/api/v1/purchases/orders/open": { status: 400, code: "REQUIRED_SUPPLIER" },
  "/api/v1/accounting/payables/open-invoices": { status: 400, code: "REQUIRED_SUPPLIER" }
};

function assertProduction() {
  if (String(process.env.TARGET_ENV || "").toLowerCase() !== "production") {
    throw new Error("TARGET_ENV debe ser production.");
  }
  if (!String(process.env.DATABASE_URL || "").includes("jzbwzmkidfthknsohhnr")) {
    throw new Error("DATABASE_URL no corresponde a produccion.");
  }
  if (!apiUrl.includes("apexos-api-prod-production.up.railway.app")) {
    throw new Error("El API no corresponde al servicio productivo autorizado.");
  }
}

function responseShape(body) {
  if (Array.isArray(body)) return { type: "array", count: body.length };
  if (body && typeof body === "object") return { type: "object", keys: Object.keys(body).slice(0, 12) };
  return { type: typeof body };
}

async function request(endpoint, token) {
  const started = Date.now();
  const response = await fetch(`${apiUrl}${endpoint}`, {
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(35000)
  });
  const text = await response.text();
  let body = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // The status remains authoritative for non-JSON endpoints.
  }
  const expectedError = expectedValidationErrors[endpoint];
  const contractOk = expectedError
    ? response.status === expectedError.status && body && typeof body === "object" && body.code === expectedError.code
    : response.ok;
  return {
    endpoint,
    status: response.status,
    ok: contractOk,
    expected: expectedError || { status: 200 },
    latency_ms: Date.now() - started,
    shape: responseShape(body),
    ...(contractOk ? {} : { detail: String(typeof body === "string" ? body : JSON.stringify(body)).slice(0, 500) })
  };
}

async function main() {
  assertProduction();
  const tenant = await prisma.tenant.findFirst({ where: { name: { contains: "NYVORA", mode: "insensitive" }, active: true } });
  if (!tenant) throw new Error("Tenant Nyvora no encontrado.");
  const role = await prisma.role.findUnique({ where: { tenant_id_name: { tenant_id: tenant.id, name: "APEX_ADMIN" } } });
  if (!role) throw new Error("Rol APEX_ADMIN de Nyvora no encontrado.");

  const user = await prisma.user.upsert({
    where: { tenant_id_email: { tenant_id: tenant.id, email } },
    update: { password: await bcrypt.hash(password, 12), role_id: role.id, active: true },
    create: { tenant_id: tenant.id, name: `Nyvora Mass Certificate ${runId}`, email, password: await bcrypt.hash(password, 12), role_id: role.id, active: true, preferences: { source: "nyvora_production_mass_regression", run_id: runId } }
  });

  const result = { ok: false, environment: "production", company: "NYVORA", run_id: runId, commit: "", checks: [], failures: [], certification_user_id: user.id, certification_user_deactivated: false };
  try {
    const health = await fetch(`${apiUrl}/health`, { signal: AbortSignal.timeout(15000) }).then((response) => response.json());
    result.commit = String(health.commit || "");
    const loginResponse = await fetch(`${apiUrl}/api/v1/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
      signal: AbortSignal.timeout(20000)
    });
    const login = await loginResponse.json();
    if (!loginResponse.ok || !login.token) throw new Error(`Login certificado fallo con HTTP ${loginResponse.status}.`);
    for (const endpoint of endpoints) result.checks.push(await request(endpoint, login.token));
    result.failures = result.checks.filter((check) => !check.ok);
    result.ok = result.failures.length === 0;
  } finally {
    await prisma.user.update({ where: { id: user.id }, data: { active: false } });
    result.certification_user_deactivated = true;
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
  }

  console.log(JSON.stringify({ ok: result.ok, run_id: runId, commit: result.commit, checks: result.checks.length, failures: result.failures, output: outputPath, certification_user_deactivated: result.certification_user_deactivated }, null, 2));
  if (!result.ok) process.exitCode = 1;
}

main().catch(async (error) => {
  console.error(`[nyvora-production-mass-regression] ${error.message}`);
  process.exitCode = 1;
}).finally(async () => {
  await prisma.$disconnect();
});
