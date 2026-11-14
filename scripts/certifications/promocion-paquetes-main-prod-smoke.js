#!/usr/bin/env node
/* Smoke de solo lectura de la promocion por paquetes a main sobre PRODUCCION (cambio
 * promocion-paquetes-main-20261113).
 *
 * Que mide: el API productivo desplegado desde main responde, con la cuenta real de la empresa
 * modelo NYVORA, todas las lecturas de los modulos que toca la promocion. No crea usuarios, no
 * escribe documentos, no mueve inventario y no ejecuta ningun metodo distinto de GET, salvo el
 * POST /api/v1/auth/login necesario para obtener la sesion.
 *
 * Credenciales: se leen de PROD_NYVORA_EMAIL y PROD_NYVORA_PASSWORD. Nunca se imprimen, nunca se
 * escriben en el JSON de evidencia y nunca se pasan por argumento de linea de comandos.
 *
 * Autenticacion: la cuenta real de NYVORA vive en Supabase Auth (es la ruta que usa la web
 * productiva antes de caer al login local). El smoke pide el access token a GoTrue y lo usa como
 * Bearer contra el API, que valida tokens de Supabase en fastify.authenticate. Solo si Supabase
 * Auth no esta configurado se intenta el login local del API.
 *
 * Licencia de modulos: NYVORA no tiene habilitado gastos_menores (M-29) en su portafolio, pero el
 * API no aplica esa licencia a las lecturas: el gate es de permisos y la limitacion vive en
 * `active_modules` y en la curaduria del lobby. El smoke mide esas lecturas como 200 y lo declara;
 * no se inventa una denegacion que el codigo no produce.
 *
 * Uso:
 *   PROD_NYVORA_EMAIL=... PROD_NYVORA_PASSWORD=... \
 *   node scripts/certifications/promocion-paquetes-main-prod-smoke.js \
 *     --env-file=config/production.env --expected-commit=c8e5e67c \
 *     --output=docs/qa/evidence/promocion-paquetes-main-20261113/prod-nyvora-certification.json
 */
const fs = require("node:fs");
const path = require("node:path");
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
loadEnv(args["env-file"] || "config/production.env");

const apiUrl = String(args["api-url"] || "https://apexos-api-prod-production.up.railway.app").replace(/\/$/, "");
const expectedCommit = String(args["expected-commit"] || "").toLowerCase();
const runId = String(args["run-id"] || new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14));
const outputPath = path.resolve(args.output || `docs/qa/evidence/promocion-paquetes-main-20261113/prod-nyvora-certification-${runId}.json`);
const email = String(process.env.PROD_NYVORA_EMAIL || "").trim();
const password = String(process.env.PROD_NYVORA_PASSWORD || "");

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

// Presupuesto de lectura: `transport-pyg/concepts` y `mapping` siembran el catalogo concepto por
// concepto en cada peticion y en produccion tardan ~40 s; el corte se fija por encima de esa
// medicion para distinguir "lento y correcto" (se declara) de "no responde" (falla).
const READ_TIMEOUT_MS = Number(process.env.PROD_SMOKE_TIMEOUT_MS || 90000);

function shape(body) {
  if (Array.isArray(body)) return { type: "array", count: body.length };
  if (body && typeof body === "object") return { type: "object", keys: Object.keys(body).slice(0, 10) };
  return { type: typeof body };
}

function assertProduction() {
  if (!apiUrl.includes("apexos-api-prod-production.up.railway.app") || apiUrl.includes("-qa-production")) {
    throw new Error(`El API no es el servicio productivo autorizado: ${apiUrl}`);
  }
  if (String(process.env.TARGET_ENV || "").toLowerCase() !== "production") {
    throw new Error("TARGET_ENV debe ser production: este smoke certifica el despliegue productivo.");
  }
  if (!email || !password) {
    throw new Error("PROD_NYVORA_EMAIL y PROD_NYVORA_PASSWORD son obligatorios; no se aceptan por argumento.");
  }
}

async function request(endpoint, token, method = "GET", body) {
  const started = Date.now();
  let response;
  try {
    response = await fetch(`${apiUrl}${endpoint}`, {
      method,
      headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { "content-type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(READ_TIMEOUT_MS)
    });
  } catch (error) {
    return { endpoint, status: 0, ok: false, code: error.name || "RED", latency_ms: Date.now() - started, shape: { type: "none" }, detail: String(error.message || error).slice(0, 200) };
  }
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

async function supabaseLogin() {
  const url = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
  const anonKey = String(process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "");
  if (!url || !anonKey) return null;
  const response = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anonKey, "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
    signal: AbortSignal.timeout(25000)
  });
  const text = await response.text();
  if (!response.ok) {
    const error = new Error(`Supabase Auth rechazo la cuenta NYVORA con HTTP ${response.status}: ${text.slice(0, 200)}`);
    error.statusCode = response.status;
    throw error;
  }
  const parsed = JSON.parse(text);
  if (!parsed.access_token) throw new Error("Supabase Auth no devolvio access_token.");
  return {
    provider: "supabase",
    token: parsed.access_token,
    user_id: parsed.user?.id || null,
    email: parsed.user?.email || null
  };
}

async function localLogin() {
  const response = await fetch(`${apiUrl}/api/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
    signal: AbortSignal.timeout(20000)
  });
  const text = await response.text();
  if (!response.ok) {
    const error = new Error(`Login local del API rechazo la cuenta NYVORA con HTTP ${response.status}: ${text.slice(0, 200)}`);
    error.statusCode = response.status;
    throw error;
  }
  const parsed = JSON.parse(text);
  const token = parsed.token || parsed.access_token;
  if (!token) throw new Error("Login local del API sin token.");
  return {
    provider: "local",
    token,
    user_id: parsed.user?.id || parsed.user_id || null,
    tenant_id: parsed.tenant?.id || parsed.tenant_id || null,
    email: parsed.user?.email || null
  };
}

async function main() {
  assertProduction();
  const result = {
    ok: false,
    change_id: "promocion-paquetes-main-20261113",
    environment: "PRODUCTION",
    company: "NYVORA",
    api_url: apiUrl,
    read_only: true,
    write_methods_executed: ["POST {SUPABASE_URL}/auth/v1/token (login GoTrue)", "POST /api/v1/auth/login (solo negativo de credencial invalida)"],
    generated_at: new Date().toISOString(),
    run_id: runId,
    expected_commit: expectedCommit || null,
    commit: "",
    checks: [],
    failures: [],
    negatives: []
  };

  const healthResponse = await fetch(`${apiUrl}/health`, { signal: AbortSignal.timeout(15000) });
  if (!healthResponse.ok) throw new Error(`/health respondio HTTP ${healthResponse.status}`);
  const health = await healthResponse.json();
  result.commit = String(health.commit || "");
  result.modules = typeof health.modules === "number" ? health.modules : Array.isArray(health.modules) ? health.modules.length : null;
  if (expectedCommit && !result.commit.toLowerCase().startsWith(expectedCommit.slice(0, 12))) {
    throw new Error(`El commit desplegado (${result.commit}) no es el esperado (${expectedCommit}).`);
  }

  let session = await supabaseLogin();
  if (!session) session = await localLogin();
  result.login = {
    ok: Boolean(session.token),
    provider: session.provider,
    user_id: session.user_id,
    tenant_id: session.tenant_id || null,
    email_masked: String(session.email || email).replace(/^(.).*(@.*)$/, "$1***$2")
  };
  const token = session.token;

  let slowest = null;
  for (const [group, endpoint] of ENDPOINTS) {
    const check = await request(endpoint, token);
    result.checks.push({ group, ...check });
    if (!slowest || check.latency_ms > slowest.latency_ms) slowest = { endpoint, latency_ms: check.latency_ms };
    console.log(`[prod-smoke] ${group} ${endpoint} -> ${check.status} (${check.latency_ms} ms)`);
  }
  result.slowest = slowest;
  result.failures = result.checks.filter((check) => !check.ok);

  const anonymous = await request("/api/v1/services/orders?limit=1", null);
  result.negatives.push({ name: "sin_token_401", status: anonymous.status, ok: anonymous.status === 401 });
  const badLogin = await request("/api/v1/auth/login", null, "POST", { email: "nyvora.smoke.invalid@internal.apexos.local", password: "credencial-invalida" });
  result.negatives.push({ name: "credencial_invalida_401", status: badLogin.status, ok: badLogin.status === 401 });
  const negativesOk = result.negatives.every((item) => item.ok);

  result.groups = [...new Set(ENDPOINTS.map(([group]) => group))].map((group) => ({
    group,
    checks: result.checks.filter((check) => check.group === group).length,
    failures: result.checks.filter((check) => check.group === group && !check.ok).length
  }));
  result.ok = result.failures.length === 0 && negativesOk;

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);

  console.log(JSON.stringify({
    ok: result.ok,
    environment: result.environment,
    company: result.company,
    commit: result.commit,
    modules: result.modules,
    login: result.login,
    checks: result.checks.length,
    groups: result.groups.length,
    slowest: result.slowest,
    negatives: result.negatives,
    failures: result.failures.map((failure) => ({ endpoint: failure.endpoint, status: failure.status, detail: failure.detail })),
    output: outputPath
  }, null, 2));
  if (!result.ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`[promocion-paquetes-main-prod-smoke] ${error.message}`);
  process.exitCode = 1;
});
