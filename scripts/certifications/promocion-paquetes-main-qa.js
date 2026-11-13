#!/usr/bin/env node
/* Certificacion QA de la promocion por paquetes a main (cambio promocion-paquetes-main-20261113).
 *
 * Que mide: el ambiente QA desplegado (API Railway de QA + Supabase de QA) responde, con una
 * cuenta de la empresa modelo NYVORA, todas las lecturas de los modulos que toca la promocion:
 * capa visual (hubs servidos por el API), transporte con sedes/planes/tarifario/liquidacion,
 * PYG por vehiculo, cajas menores, contabilidad, talento humano, inventario, compras, ventas,
 * servicios, administracion y proyectos. Tambien mide los rechazos que no deben relajarse:
 * peticion sin token = 401 y credencial invalida = 401.
 *
 * Huella sobre los datos: crea un usuario efimero nyvora.qa.promotion.<run>@internal.apexos.local
 * con un rol propio de la corrida y lo desactiva al terminar. No escribe documentos, no crea
 * asientos, no mueve inventario y no toca produccion: aborta si el API no es el host de QA.
 *
 * Uso:
 *   node scripts/certifications/promocion-paquetes-main-qa.js --env-file=config/qa.env \
 *     --expected-commit=6589af8e \
 *     --output=docs/qa/evidence/promocion-paquetes-main-20261113/qa-nyvora-certification.json
 */
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const loadEnv = require("../load-env");

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) continue;
    const separator = item.indexOf("=");
    if (separator > 2) {
      args[item.slice(2, separator)] = item.slice(separator + 1);
      continue;
    }
    const key = item.slice(2);
    args[key] = argv[index + 1] && !argv[index + 1].startsWith("--") ? argv[++index] : true;
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
loadEnv(args["env-file"] || "config/qa.env");

const apiUrl = String(args["api-url"] || process.env.QA_API_URL || "https://apexos-api-qa-production.up.railway.app").replace(/\/$/, "");
const expectedCommit = String(args["expected-commit"] || process.env.QA_EXPECTED_API_COMMIT || "").toLowerCase();
const runId = String(args["run-id"] || new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14));
const outputPath = path.resolve(args.output || `docs/qa/evidence/promocion-paquetes-main-20261113/qa-nyvora-certification-${runId}.json`);
const password = `Nyvora-QA-${crypto.randomBytes(12).toString("base64url")}#26`;
const email = `nyvora.qa.promotion.${runId.toLowerCase()}@internal.apexos.local`;
const roleName = "NYVORA QA Promocion Paquetes";

const ENDPOINTS = [
  ["salud", "/health"],
  ["sesion", "/api/v1/auth/me"],
  ["administracion", "/api/v1/admin/roles"],
  ["administracion", "/api/v1/admin/users"],
  ["administracion", "/api/v1/admin/user-master-data"],
  ["inventario", "/api/v1/inventory/items"],
  ["inventario", "/api/v1/inventory/families"],
  ["inventario", "/api/v1/inventory/warehouses"],
  ["inventario", "/api/v1/inventory/locations"],
  ["inventario", "/api/v1/inventory/costs"],
  ["compras", "/api/v1/purchases/suppliers"],
  ["compras", "/api/v1/purchases/orders"],
  ["compras", "/api/v1/purchases/vmi-alerts"],
  ["ventas", "/api/v1/sales/customers"],
  ["ventas", "/api/v1/sales/orders"],
  ["ventas", "/api/v1/sales/invoices"],
  ["facturacion", "/api/v1/invoicing/invoices"],
  ["cartera", "/api/v1/accounts-receivable/documents"],
  ["cartera", "/api/v1/accounts-receivable/reports/aging"],
  ["cartera", "/api/v1/accounts-receivable/retentions"],
  ["contabilidad", "/api/v1/accounting/accounts"],
  ["contabilidad", "/api/v1/accounting/periods"],
  ["contabilidad", "/api/v1/accounting/organization-tree"],
  ["contabilidad", "/api/v1/accounting/document-masters"],
  ["contabilidad", "/api/v1/accounting/vat-masters"],
  ["contabilidad", "/api/v1/accounting/payable-accounts"],
  ["contabilidad", "/api/v1/accounting/documents"],
  ["contabilidad", "/api/v1/accounting/balance-sheet"],
  ["contabilidad", "/api/v1/accounting/reports/balance-sheet"],
  ["contabilidad", "/api/v1/accounting/reports/trial-balance"],
  ["contabilidad", "/api/v1/accounting/reports/taxes?period=2026-11"],
  ["contabilidad", "/api/v1/accounting/reports/receivables"],
  ["contabilidad", "/api/v1/accounting/reports/payables"],
  ["contabilidad", "/api/v1/accounting/income-statement?period=2026-11"],
  ["proyectos", "/api/v1/projects"],
  ["proyectos", "/api/v1/projects/operational-center"],
  ["servicios", "/api/v1/services/orders?limit=20"],
  ["servicios", "/api/v1/services/technicians"],
  ["servicios", "/api/v1/services/service-types"],
  ["servicios", "/api/v1/services/service-stores"],
  ["servicios", "/api/v1/services/satisfaction-questions"],
  ["servicios", "/api/v1/services/references"],
  ["talento-humano", "/api/v1/hr/employees"],
  ["talento-humano", "/api/v1/hr/schedules"],
  ["talento-humano", "/api/v1/hr/routes"],
  ["talento-humano", "/api/v1/hr/routes/event-summaries"],
  ["talento-humano", "/api/v1/hr/routes/preop/template"],
  ["talento-humano", "/api/v1/hr/routes/preop/metrics"],
  ["talento-humano", "/api/v1/hr/gps/active"],
  ["talento-humano", "/api/v1/hr/activity-types"],
  ["talento-humano", "/api/v1/hr/attendance?date=2026-11-12"],
  ["talento-humano", "/api/v1/hr/workdays?date=2026-11-12"],
  ["talento-humano", "/api/v1/hr/payroll/config"],
  ["talento-humano", "/api/v1/hr/payroll"],
  ["talento-humano", "/api/v1/hr/operations-map?date=2026-11-12&minutes=30&footprint_days=30"],
  ["transporte", "/api/v1/transport/sedes"],
  ["transporte", "/api/v1/transport/plans"],
  ["transporte", "/api/v1/transport/rate-cards"],
  ["transporte", "/api/v1/transport/carriers"],
  ["transporte", "/api/v1/transport/drivers"],
  ["transporte", "/api/v1/transport/delivery-points"],
  ["transporte", "/api/v1/transport/vehicles"],
  ["transporte", "/api/v1/transport/vehicles/metrics/dashboard"],
  ["transporte", "/api/v1/transport/vehicle-accounting-structure"],
  ["transporte", "/api/v1/transport/route-places"],
  ["transporte", "/api/v1/transport/config"],
  ["transporte", "/api/v1/transport/control-tower"],
  ["transporte", "/api/v1/transport/monitoring/fleet"],
  ["transporte", "/api/v1/transport/monitoring/live"],
  ["transporte", "/api/v1/transport/pod/stats"],
  ["transporte", "/api/v1/transport/packing/workbench"],
  ["transporte", "/api/v1/transport/planning/workbench"],
  ["transporte", "/api/v1/transport/route-intelligence/status"],
  ["transporte", "/api/v1/transport/settlement-packages"],
  ["transporte", "/api/v1/transport/settlement-periods"],
  ["transporte", "/api/v1/transport/settlement-types"],
  ["transporte", "/api/v1/transport/settlement-destinations"],
  ["transporte", "/api/v1/transport/settlement-customers"],
  ["transporte", "/api/v1/transport/settlement-import/catalogs"],
  ["transporte", "/api/v1/transport/settlement-accounting-options"],
  ["transporte", "/api/v1/transport/settlement-rate-options"],
  ["transporte", "/api/v1/transport/settlement-vehicle-consolidation"],
  ["transporte", "/api/v1/transport/settlement-control-tower"],
  ["transporte-pyg", "/api/v1/transport-pyg/concepts"],
  ["transporte-pyg", "/api/v1/transport-pyg/config"],
  ["transporte-pyg", "/api/v1/transport-pyg/account-configuration"],
  ["transporte-pyg", "/api/v1/transport-pyg/budgets?period=2026-11"],
  ["transporte-pyg", "/api/v1/transport-pyg/mapping"],
  ["transporte-pyg", "/api/v1/transport-pyg/source-concepts"],
  ["cajas-menores", "/api/v1/petty-cash/boxes"],
  ["cajas-menores", "/api/v1/petty-cash/concepts"],
  ["cajas-menores", "/api/v1/petty-cash/vouchers"],
  ["cajas-menores", "/api/v1/petty-cash/advances"],
  ["cajas-menores", "/api/v1/petty-cash/reports/summary"],
  ["cajas-menores", "/api/v1/petty-cash/reports/boxes-ranking"],
  ["cajas-menores", "/api/v1/petty-cash/reports/detail"]
];

const PERMISSIONS = [
  "accounting",
  "admin",
  "hr",
  "payroll",
  "time_tracking",
  "inventory",
  "services",
  "purchases",
  "sales",
  "transport",
  "invoicing",
  "accounts-receivable",
  "projects",
  "apex-heart"
];

const EXTRA_ACTIONS = {
  transport: ["import", "account_settlements"]
};

// NYVORA en QA no tiene M-22 (Administracion) licenciado en su tenant. La denegacion canonica
// por licencia se mide como contrato: 403 MODULO_NO_HABILITADO del modulo admin.
const EXPECTED_DENIALS = {
  "/api/v1/admin/roles": { status: 403, code: "MODULO_NO_HABILITADO", module: "admin" },
  "/api/v1/admin/users": { status: 403, code: "MODULO_NO_HABILITADO", module: "admin" },
  "/api/v1/admin/user-master-data": { status: 403, code: "MODULO_NO_HABILITADO", module: "admin" }
};

function shape(body) {
  if (Array.isArray(body)) return { type: "array", count: body.length };
  if (body && typeof body === "object") return { type: "object", keys: Object.keys(body).slice(0, 10) };
  return { type: typeof body };
}

function assertQa() {
  if (!apiUrl.includes("apexos-api-qa-production.up.railway.app") || apiUrl.includes("-prod-production")) {
    throw new Error(`El API no es el servicio QA autorizado: ${apiUrl}`);
  }
  const expectedRef = String(process.env.EXPECTED_SUPABASE_PROJECT_REF || "").trim();
  if (!expectedRef) throw new Error("EXPECTED_SUPABASE_PROJECT_REF es obligatorio para confirmar que la base es QA.");
  if (!String(process.env.DATABASE_URL || "").includes(expectedRef)) {
    throw new Error("DATABASE_URL no corresponde al proyecto Supabase de QA.");
  }
  if (String(process.env.TARGET_ENV || "").toLowerCase() === "production") {
    throw new Error("TARGET_ENV=production: este certificador solo corre en QA.");
  }
}

async function request(endpoint, token, method = "GET", body) {
  const started = Date.now();
  const response = await fetch(`${apiUrl}${endpoint}`, {
    method,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(35000)
  });
  const text = await response.text();
  let parsed = text;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    // El estado sigue siendo la fuente de verdad para respuestas no JSON.
  }
  const code = parsed && typeof parsed === "object" ? parsed.code || null : null;
  const details = parsed && typeof parsed === "object" && parsed.details && typeof parsed.details === "object" ? parsed.details : {};
  return {
    endpoint,
    status: response.status,
    ok: response.ok,
    code,
    module: details.module || null,
    latency_ms: Date.now() - started,
    shape: shape(parsed),
    ...(response.ok ? {} : { detail: String(typeof parsed === "string" ? parsed : JSON.stringify(parsed)).slice(0, 300) })
  };
}

async function main() {
  assertQa();
  const prisma = require("../../apps/api/src/core/prisma");
  let bcrypt;
  try {
    bcrypt = require("bcrypt");
  } catch {
    bcrypt = require("../../apps/api/node_modules/bcrypt");
  }

  const tenant = await prisma.tenant.findFirst({ where: { name: { equals: "NYVORA", mode: "insensitive" }, active: true } });
  if (!tenant) throw new Error("Tenant NYVORA no encontrado en QA.");

  const role = await prisma.role.upsert({
    where: { tenant_id_name: { tenant_id: tenant.id, name: roleName } },
    update: { description: "Rol de la corrida de certificacion de la promocion por paquetes" },
    create: { tenant_id: tenant.id, name: roleName, description: "Rol de la corrida de certificacion de la promocion por paquetes" }
  });
  await prisma.permission.deleteMany({ where: { role_id: role.id } });
  await prisma.permission.createMany({
    data: [
      ...PERMISSIONS.flatMap((module) => ["read", "write", "approve", "export"].map((action) => ({ role_id: role.id, module, action }))),
      ...Object.entries(EXTRA_ACTIONS).flatMap(([module, actions]) => actions.map((action) => ({ role_id: role.id, module, action })))
    ],
    skipDuplicates: true
  });

  const user = await prisma.user.upsert({
    where: { tenant_id_email: { tenant_id: tenant.id, email } },
    update: { name: `NYVORA Promocion Paquetes ${runId}`, password: await bcrypt.hash(password, 12), role_id: role.id, active: true },
    create: { tenant_id: tenant.id, name: `NYVORA Promocion Paquetes ${runId}`, email, password: await bcrypt.hash(password, 12), role_id: role.id, active: true, preferences: { source: "promocion_paquetes_main_qa", run_id: runId } }
  });

  const result = {
    ok: false,
    change_id: "promocion-paquetes-main-20261113",
    environment: "QA",
    company: "NYVORA",
    tenant_id: tenant.id,
    run_id: runId,
    api_url: apiUrl,
    expected_commit: expectedCommit || null,
    commit: "",
    certification_user_id: user.id,
    certification_user_deactivated: false,
    checks: [],
    failures: [],
    negatives: []
  };

  try {
    const health = await fetch(`${apiUrl}/health`, { signal: AbortSignal.timeout(15000) }).then((response) => response.json());
    result.commit = String(health.commit || "");
    if (expectedCommit && !result.commit.toLowerCase().startsWith(expectedCommit.slice(0, 12))) {
      throw new Error(`El commit desplegado (${result.commit}) no es el esperado (${expectedCommit}).`);
    }
    const loginResponse = await fetch(`${apiUrl}/api/v1/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
      signal: AbortSignal.timeout(20000)
    });
    const loginBody = await loginResponse.text();
    if (!loginResponse.ok) throw new Error(`Login NYVORA fallo con HTTP ${loginResponse.status}: ${loginBody.slice(0, 200)}`);
    const login = JSON.parse(loginBody);
    const token = login.token || login.access_token;
    if (!token) throw new Error("Login NYVORA sin token.");

    for (const [group, endpoint] of ENDPOINTS) {
      const check = await request(endpoint, token);
      const expected = EXPECTED_DENIALS[endpoint];
      if (expected) {
        check.expected = expected;
        check.ok = check.status === expected.status && check.code === expected.code && check.module === expected.module;
      }
      result.checks.push({ group, ...check });
    }
    result.failures = result.checks.filter((check) => !check.ok);

    const anonymous = await request("/api/v1/services/orders?limit=1", null);
    result.negatives.push({ name: "sin_token_401", status: anonymous.status, ok: anonymous.status === 401 });
    const badLogin = await request("/api/v1/auth/login", null, "POST", { email: "nyvora.qa.promotion.invalid@internal.apexos.local", password: "credencial-invalida" });
    result.negatives.push({ name: "credencial_invalida_401", status: badLogin.status, ok: badLogin.status === 401 });
    const negativesOk = result.negatives.every((item) => item.ok);

    result.ok = result.failures.length === 0 && negativesOk;
  } finally {
    await prisma.user.update({ where: { id: user.id }, data: { active: false } });
    result.certification_user_deactivated = true;
    result.groups = [...new Set(ENDPOINTS.map(([group]) => group))].map((group) => ({
      group,
      checks: result.checks.filter((check) => check.group === group).length,
      failures: result.checks.filter((check) => check.group === group && !check.ok).length
    }));
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
    await prisma.$disconnect();
  }

  console.log(JSON.stringify({
    ok: result.ok,
    environment: result.environment,
    company: result.company,
    commit: result.commit,
    checks: result.checks.length,
    groups: result.groups.length,
    negatives: result.negatives,
    failures: result.failures.map((failure) => ({ endpoint: failure.endpoint, status: failure.status, detail: failure.detail })),
    user_deactivated: result.certification_user_deactivated,
    output: outputPath
  }, null, 2));
  if (!result.ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`[promocion-paquetes-main-qa] ${error.message}`);
  process.exitCode = 1;
});
