#!/usr/bin/env node
/*
 * Full QA validation for APEXOS/NYVORA.
 *
 * This script is intentionally strict and diagnostic:
 * - It refuses to run destructive operations.
 * - It refuses to use a Supabase project different from the known QA project
 *   unless QA_ALLOW_ANY_SUPABASE=true is provided.
 * - It creates isolated Prisma/API test data under a timestamped QA tenant.
 * - It does not delete existing QA data.
 * - It does not print secrets.
 */

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const QA_SUPABASE_REF = "jbirkghkekuifgfsgquq";
const startedAt = new Date();
const batch = `QA-FULL-${startedAt.toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}`;
const reportDir = path.join(ROOT, "reports", "qa");
const reportJsonPath = path.join(reportDir, `${batch}.json`);
const reportMdPath = path.join(reportDir, `${batch}.md`);

const modules = [
  "accounting",
  "purchases",
  "inventory",
  "payroll",
  "hr",
  "services",
  "transport",
  "projects",
  "admin"
];
const actions = ["read", "write", "approve", "export", "import"];
const numericBatch = startedAt.toISOString().replace(/\D/g, "").slice(-10);
const inventoryRangePrefix = `7${numericBatch.slice(-5)}`;
const inventoryCodeStart = `${inventoryRangePrefix}00`;
const inventoryCodeEnd = `${inventoryRangePrefix}99`;
const inventoryItemCode = `${inventoryRangePrefix}01`;

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  const raw = fs.readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const key = match[1];
    if (process.env[key] !== undefined) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadDotEnv(path.join(ROOT, ".env"));
loadDotEnv(path.join(ROOT, "apps", "api", ".env"));
loadDotEnv(path.join(ROOT, "apps", "web", ".env.local"));

const config = {
  apiUrl: (process.env.QA_API_URL || process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:3010").replace(/\/$/, ""),
  webUrl: (process.env.QA_WEB_URL || "http://127.0.0.1:3001").replace(/\/$/, ""),
  supabaseUrl: (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "").replace(/\/$/, ""),
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "",
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  databaseUrl: process.env.DATABASE_URL || "",
  adminEmail: process.env.QA_SUPABASE_ADMIN_EMAIL || "admin@apexos.qa",
  adminPassword: process.env.QA_SUPABASE_ADMIN_PASSWORD || "ApexOS-QA-Admin-2026!",
  scjEmail: process.env.QA_SUPABASE_SCJ_EMAIL || "scj@apexos.qa",
  scjPassword: process.env.QA_SUPABASE_SCJ_PASSWORD || "ApexOS-QA-SCJ-2026!"
};

if (config.databaseUrl && config.databaseUrl.includes("supabase.com") && !/[?&]sslmode=/.test(config.databaseUrl)) {
  const separator = config.databaseUrl.includes("?") ? "&" : "?";
  process.env.DATABASE_URL = `${config.databaseUrl}${separator}sslmode=require`;
  config.databaseUrl = process.env.DATABASE_URL;
}

const report = {
  batch,
  started_at: startedAt.toISOString(),
  config: {
    apiUrl: config.apiUrl,
    webUrl: config.webUrl,
    supabaseUrl: config.supabaseUrl,
    databaseUrlHost: redactDatabaseHost(config.databaseUrl),
    hasAnonKey: Boolean(config.supabaseAnonKey),
    hasServiceRoleKey: Boolean(config.supabaseServiceRoleKey)
  },
  summary: { passed: 0, failed: 0, blocked: 0, warning: 0 },
  results: [],
  created: [],
  findings: []
};

function redactDatabaseHost(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.hostname}:${parsed.port || ""}/${parsed.pathname.replace(/^\//, "")}`;
  } catch {
    return url ? "invalid-url" : "missing";
  }
}

function addResult(area, name, status, detail = {}, severity = "medium") {
  report.summary[status] += 1;
  const item = { area, name, status, severity, detail };
  report.results.push(item);
  const icon = status === "passed" ? "OK" : status === "failed" ? "FAIL" : status === "blocked" ? "BLOCKED" : "WARN";
  console.log(`[${icon}] ${area} - ${name}${detail.message ? `: ${detail.message}` : ""}`);
  if (status !== "passed") report.findings.push(item);
  return item;
}

function requiredEnv() {
  if (!config.supabaseUrl) addResult("preflight", "NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL", "failed", { message: "Supabase URL no configurada" }, "critical");
  if (!config.supabaseAnonKey) addResult("preflight", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "failed", { message: "Anon key no configurada" }, "critical");
  if (!config.supabaseServiceRoleKey) addResult("preflight", "SUPABASE_SERVICE_ROLE_KEY", "blocked", { message: "Sin service role no se pueden auditar vistas globales ni semillas controladas" }, "high");
  if (!config.databaseUrl) addResult("preflight", "DATABASE_URL", "failed", { message: "DATABASE_URL no configurada" }, "critical");
  if (config.supabaseUrl && !config.supabaseUrl.includes(QA_SUPABASE_REF) && process.env.QA_ALLOW_ANY_SUPABASE !== "true") {
    addResult("preflight", "QA Supabase guard", "failed", {
      message: `La URL no apunta al proyecto QA esperado ${QA_SUPABASE_REF}. Use QA_ALLOW_ANY_SUPABASE=true solo si entiende el riesgo.`
    }, "critical");
  }
  if (report.results.some((result) => result.area === "preflight" && result.status === "failed")) {
    throw new Error("Preflight failed. Aborting QA validation.");
  }
}

async function requestJson(url, options = {}, expected = [200]) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers || {})
    }
  });
  const contentType = response.headers.get("content-type") || "";
  let body;
  if (contentType.includes("application/json")) {
    body = await response.json().catch(() => null);
  } else {
    body = await response.text().catch(() => "");
  }
  const ok = expected.includes(response.status);
  if (!ok) {
    const error = new Error(`HTTP ${response.status}`);
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return { status: response.status, body, headers: response.headers };
}

async function supabaseAuthLogin(email, password) {
  return requestJson(`${config.supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: config.supabaseAnonKey,
      authorization: `Bearer ${config.supabaseAnonKey}`
    },
    body: JSON.stringify({ email, password })
  });
}

async function supabaseRest(pathname, token, useServiceRole = false) {
  const key = useServiceRole ? config.supabaseServiceRoleKey : config.supabaseAnonKey;
  return requestJson(`${config.supabaseUrl}/rest/v1/${pathname}`, {
    method: "GET",
    headers: {
      apikey: key,
      authorization: `Bearer ${useServiceRole ? config.supabaseServiceRoleKey : token}`,
      prefer: "count=exact"
    }
  }, [200, 206]);
}

async function validateSupabase() {
  let adminSession = null;
  let scjSession = null;

  try {
    const login = await supabaseAuthLogin(config.adminEmail, config.adminPassword);
    adminSession = login.body;
    addResult("supabase-auth", "Login admin global QA", "passed", { email: config.adminEmail });
  } catch (error) {
    addResult("supabase-auth", "Login admin global QA", "failed", { message: `No autentica admin Supabase (${error.status || error.message})` }, "critical");
  }

  try {
    const login = await supabaseAuthLogin(config.scjEmail, config.scjPassword);
    scjSession = login.body;
    addResult("supabase-auth", "Login admin empresa SCJ QA", "passed", { email: config.scjEmail });
  } catch (error) {
    addResult("supabase-auth", "Login admin empresa SCJ QA", "failed", { message: `No autentica SCJ Supabase (${error.status || error.message})` }, "critical");
  }

  if (adminSession?.access_token) {
    try {
      const companies = await supabaseRest("v_platform_companies?select=*", adminSession.access_token);
      const count = Array.isArray(companies.body) ? companies.body.length : 0;
      addResult("supabase-rls", "Admin global ve empresas plataforma", count > 0 ? "passed" : "failed", { count, message: count > 0 ? undefined : "La vista no retorna empresas" }, "high");
    } catch (error) {
      addResult("supabase-rls", "Admin global ve empresas plataforma", "failed", { message: `Falla vista v_platform_companies (${error.status || error.message})`, body: sanitize(error.body) }, "critical");
    }
  }

  if (scjSession?.access_token) {
    try {
      const companies = await supabaseRest("v_user_companies?select=*", scjSession.access_token);
      const count = Array.isArray(companies.body) ? companies.body.length : 0;
      addResult("supabase-rls", "SCJ ve su empresa", count === 1 ? "passed" : "failed", { count, companies: simplifyRows(companies.body, ["company_name", "company_code", "role_name"]) }, "high");
    } catch (error) {
      addResult("supabase-rls", "SCJ ve su empresa", "failed", { message: `Falla vista v_user_companies (${error.status || error.message})`, body: sanitize(error.body) }, "critical");
    }

    try {
      const modulesResult = await supabaseRest("v_company_module_status?select=module_code,enabled&enabled=eq.true", scjSession.access_token);
      const enabled = Array.isArray(modulesResult.body) ? modulesResult.body.map((row) => row.module_code).sort() : [];
      const required = ["servicios", "talento_humano", "transporte", "administracion_apex", "inventario", "compras", "contabilidad"];
      const missing = required.filter((code) => !enabled.includes(code));
      addResult("supabase-permissions", "Modulos SCJ activos", missing.length ? "failed" : "passed", { enabled, missing }, "high");
    } catch (error) {
      addResult("supabase-permissions", "Modulos SCJ activos", "failed", { message: `No se pudo leer v_company_module_status (${error.status || error.message})`, body: sanitize(error.body) }, "high");
    }
  }

  if (config.supabaseServiceRoleKey) {
    const tables = [
      "companies",
      "company_users",
      "modules",
      "company_modules",
      "employees",
      "vehicles",
      "service_orders",
      "service_evidence",
      "Project",
      "time_punches",
      "gps_pings"
    ];
    for (const table of tables) {
      try {
        await supabaseRest(`${table}?select=*&limit=1`, config.supabaseServiceRoleKey, true);
        addResult("supabase-schema", `Tabla/vista accesible: ${table}`, "passed");
      } catch (error) {
        addResult("supabase-schema", `Tabla/vista accesible: ${table}`, "warning", { message: `No accesible por REST (${error.status || error.message})` }, "medium");
      }
    }
  }

  return { adminSession, scjSession };
}

async function validateRuntimeHealth() {
  let apiHealthy = false;
  try {
    const health = await requestJson(`${config.apiUrl}/health`, { method: "GET" });
    apiHealthy = health.body?.status === "OK";
    addResult("api-runtime", "Health API local", apiHealthy ? "passed" : "failed", { body: health.body }, "critical");
  } catch (error) {
    addResult("api-runtime", "Health API local", "blocked", { message: `API no responde en ${config.apiUrl}/health (${error.status || error.message})` }, "critical");
  }

  try {
    const login = await requestJson(`${config.webUrl}/login`, { method: "GET", headers: { accept: "text/html" } }, [200]);
    const html = String(login.body || "");
    addResult("web-runtime", "Login frontend local", html.includes("Entrar") || html.includes("__next") ? "passed" : "warning", { status: login.status }, "medium");
  } catch (error) {
    addResult("web-runtime", "Login frontend local", "blocked", { message: `Web no responde en ${config.webUrl}/login (${error.status || error.message})` }, "high");
  }
  return { apiHealthy };
}

async function validateFrontendRoutes() {
  const appDir = path.join(ROOT, "apps", "web", "app");
  const routes = [];

  function discoverRoutes(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) discoverRoutes(fullPath);
      if (!entry.isFile() || entry.name !== "page.tsx") continue;

      const relativeDirectory = path.relative(appDir, path.dirname(fullPath));
      const segments = relativeDirectory ? relativeDirectory.split(path.sep) : [];
      if (segments.includes("api") || segments.some((segment) => segment.startsWith("[") && segment.endsWith("]"))) continue;
      routes.push(segments.length ? `/${segments.join("/")}` : "/");
    }
  }

  discoverRoutes(appDir);
  routes.sort();
  addResult("frontend-routes", "Cobertura de ventanas estaticas", "passed", { routes: routes.length });

  for (const route of routes) {
    try {
      const res = await requestJson(`${config.webUrl}${route}`, { method: "GET", headers: { accept: "text/html" } }, [200, 307, 308]);
      addResult("frontend-routes", route, "passed", { status: res.status });
    } catch (error) {
      addResult("frontend-routes", route, "failed", { message: `Ruta no responde (${error.status || error.message})` }, route.includes("login") ? "critical" : "high");
    }
  }
}

async function validateSchemaAlignment() {
  if (!config.supabaseServiceRoleKey) {
    addResult("db-prisma", "Tablas Prisma esperadas via REST", "blocked", { message: "Requiere service role" }, "high");
    return;
  }
  const expectedTables = [
    "Tenant", "User", "Role", "Permission", "Account", "Item", "inv_families",
    "inv_family_accounting", "inv_product_costs", "Party", "cxp_cabdoc",
    "cxp_cuedoc", "cnt_cabdoc", "cnt_cuedoc", "Payroll", "Employee", "Vehicle",
    "ServiceOrder", "ServicePhoto", "Project"
  ];

  const missing = [];
  for (const table of expectedTables) {
    try {
      await supabaseRest(`${table}?select=*&limit=1`, config.supabaseServiceRoleKey, true);
    } catch (error) {
      missing.push(table);
    }
  }
  addResult("db-prisma", "Tablas Prisma esperadas via REST", missing.length ? "failed" : "passed", { expected: expectedTables.length, missing }, "critical");
}

async function ensureApiScenario() {
  const password = `ApexQA-${batch}!`;
  const email = `${batch.toLowerCase()}@apexos.local`;
  const domain = `${batch.toLowerCase()}.qa.local`;
  const register = await requestJson(`${config.apiUrl}/api/v1/auth/register`, {
    method: "POST",
    body: JSON.stringify({
      company_name: `QA Full Validation ${batch}`,
      industry: "qa-validation",
      email,
      password,
      name: `QA Full Validator ${batch}`,
      country: "CO",
      timezone: "America/Bogota",
      currency: "COP",
      plan: "crown"
    })
  }, [201, 200]);

  const tenant = register.body?.tenant || {};
  const user = register.body?.user || {};
  report.created.push({ type: "Tenant", id: tenant.id, name: tenant.name, domain });
  report.created.push({ type: "User", id: user.id, email, tenant_id: tenant.id, password_note: "Generated only for this QA scenario" });
  addResult("scenario-seed", "Tenant/usuario API QA", "passed", { tenant_id: tenant.id, email });
  return { tenant, user, email, password, token: register.body?.token };
}

async function apiLogin(email, password) {
  const res = await requestJson(`${config.apiUrl}/api/v1/auth/login`, {
    method: "POST",
    body: JSON.stringify({ email, password })
  });
  return res.body;
}

function authHeaders(token) {
  return { authorization: `Bearer ${token}` };
}

function pickCreatedRow(result, predicate) {
  if (!result) return null;
  if (Array.isArray(result)) return result.find(predicate) || result[0] || null;
  if (Array.isArray(result.items)) return result.items.find(predicate) || result.items[0] || null;
  if (Array.isArray(result.data)) return result.data.find(predicate) || result.data[0] || null;
  return result;
}

async function apiStep(name, method, endpoint, token, body, expected = [200, 201]) {
  try {
    const res = await requestJson(`${config.apiUrl}/api/v1${endpoint}`, {
      method,
      headers: authHeaders(token),
      body: body === undefined ? undefined : JSON.stringify(body)
    }, expected);
    addResult("api-flow", name, "passed", { endpoint, status: res.status });
    return res.body;
  } catch (error) {
    addResult("api-flow", name, "failed", { endpoint, status: error.status, body: sanitize(error.body), message: error.message }, "high");
    return null;
  }
}

async function validateApiAuthSeparation(scjSession) {
  try {
    await apiLogin(config.adminEmail, config.adminPassword);
    addResult("auth-architecture", "Admin Supabase tambien autentica en API Prisma", "warning", { message: "La doble autenticacion esta alineada para admin, revisar si es intencional" }, "medium");
  } catch (error) {
    addResult("auth-architecture", "Admin Supabase no autentica en API Prisma", "warning", { message: "Frontend usa Supabase Auth, API usa usuarios Prisma. Riesgo de permisos partidos.", status: error.status || 401 }, "high");
  }

  if (scjSession?.access_token) {
    try {
      await requestJson(`${config.apiUrl}/api/v1/projects`, {
        method: "GET",
        headers: authHeaders(scjSession.access_token)
      }, [200]);
      addResult("auth-architecture", "Token Supabase sirve contra API Prisma", "warning", { message: "Si esto no fue disenado, revisar boundary de JWT" }, "medium");
    } catch (error) {
      addResult("auth-architecture", "Token Supabase no sirve contra API Prisma", "failed", {
        message: "Los modulos API/Prisma no aceptan JWT Supabase; el flujo web Supabase puede quedar desconectado de endpoints API.",
        status: error.status
      }, "high");
    }
  }
}

async function validateApiScenario(scjSession) {
  await validateApiAuthSeparation(scjSession);

  let scenario;
  try {
    scenario = await ensureApiScenario();
  } catch (error) {
    addResult("scenario-seed", "Tenant/usuario API QA", "failed", { message: error.message, status: error.status, body: sanitize(error.body) }, "critical");
    return;
  }

  let auth = scenario.token ? { token: scenario.token, user: scenario.user, tenant: scenario.tenant } : null;
  try {
    auth = auth || await apiLogin(scenario.email, scenario.password);
    addResult("api-auth", "Login usuario tecnico Prisma", "passed", { email: scenario.email, tenant_id: scenario.tenant.id });
  } catch (error) {
    addResult("api-auth", "Login usuario tecnico Prisma", "failed", { message: `No autentica usuario seed (${error.status || error.message})`, body: sanitize(error.body) }, "critical");
    return;
  }

  const token = auth.token;
  await apiStep("Auth me", "GET", "/auth/me", token);

  await apiStep("Inicializar plan de cuentas", "POST", "/accounting/chart/init", token, { country: "CO" });
  await apiStep("Crear sucursal contable QA", "POST", "/accounting/organization-tree", token, { type: "branch", code: "BR-QA", name: "Sucursal QA Validacion", society_code: "SOC-01", active: true });
  await apiStep("Crear centro de costo QA", "POST", "/accounting/organization-tree", token, { type: "cost_center", code: "CC-QA", name: "Centro Costo QA", society_code: "SOC-01", branch_code: "BR-QA", active: true });
  await apiStep("Consultar estructura contable", "GET", "/accounting/organization-tree", token);
  await apiStep("Consultar cuentas contables", "GET", "/accounting/accounts", token);

  const familyCode = `FAM-${batch.slice(-6)}`;
  const familyResult = await apiStep("Crear familia inventario", "POST", "/inventory/families", token, {
    code: familyCode,
    name: "Familia QA Validacion",
    society_code: "SOC-01",
    branch_code: "BR-QA",
    code_start: inventoryCodeStart,
    code_end: inventoryCodeEnd,
    active: true,
    accounting: {
      goods_receipt_account_code: "1435",
      gr_ir_account_code: "2205",
      sales_cost_account_code: "5105",
      sales_revenue_account_code: "4135",
      return_revenue_account_code: "4135",
      manual_in_account_code: "1435",
      manual_out_account_code: "5195",
      active: true
    }
  });
  const family = pickCreatedRow(familyResult, (row) => row?.code === familyCode);
  await apiStep("Consultar familias inventario", "GET", "/inventory/families", token);

  const warehouseCode = `WH-${batch.slice(-6)}`;
  const warehouseResult = await apiStep("Crear bodega", "POST", "/inventory/warehouses", token, {
    code: warehouseCode,
    name: "Bodega QA Validacion",
    address: "Calle QA 123",
    city: "Medellin",
    country: "CO",
    society_code: "SOC-01",
    branch_code: "BR-QA",
    cost_center_code: "CC-QA",
    warehouse_type: "owned",
    active: true,
    metadata: { qa_batch: batch }
  });
  const warehouse = pickCreatedRow(warehouseResult, (row) => row?.code === warehouseCode);
  await apiStep("Consultar bodegas", "GET", "/inventory/warehouses", token);
  const locationsResult = await apiStep("Consultar ubicaciones bodega", "GET", "/inventory/locations", token);
  const warehouseLocation = pickCreatedRow(locationsResult, (row) => Number(row?.place_id) === Number(warehouse?.id));

  const item = await apiStep("Crear producto inventario", "POST", "/inventory/items", token, {
    code: inventoryItemCode,
    name: "Producto QA Validacion",
    type: "product",
    unit: "UND",
    family_code: family?.code || familyCode,
    society_code: "SOC-01",
    branch_code: "BR-QA",
    costing_method: "weighted_average",
    unit_cost: 12000,
    unit_price: 18000,
    tax_rate: 19,
    stock_min: 2,
    stock_max: 20,
    metadata: { qa_batch: batch }
  });
  await apiStep("Consultar productos", "GET", "/inventory/items", token);

  const supplier = await apiStep("Crear proveedor", "POST", "/purchases/suppliers", token, {
    name: "Proveedor QA Validacion SAS",
    tax_id: `900${batch.slice(-6)}`,
    tax_type: "company",
    email: `proveedor.${batch.toLowerCase()}@example.com`,
    city: "Medellin",
    country: "CO",
    credit_days: 30,
    metadata: { qa_batch: batch }
  });
  await apiStep("Consultar proveedores", "GET", "/purchases/suppliers", token);

  const po = await apiStep("Crear orden de compra", "POST", "/purchases/orders", token, {
    supplier_id: supplier?.id,
    warehouse_id: warehouse?.id,
    expected_at: new Date(Date.now() + 86400000).toISOString(),
    notes: `Orden QA ${batch}`,
    currency: "COP",
    payment_terms: "30D",
    lines: [{
      item_id: item?.id,
      qty: 3,
      unit_cost: 12000,
      unit: "UND",
      tax_rate: 19,
      notes: "Linea QA"
    }]
  });
  await apiStep("Consultar ordenes compra", "GET", "/purchases/orders", token);
  if (po?.id) {
    await apiStep("Aprobar orden de compra", "POST", `/purchases/orders/${po.id}/approve`, token, {});
    await apiStep("Recibir orden de compra", "POST", `/purchases/orders/${po.id}/receive`, token, {
      received_lines: [{
        line_id: po.lines?.[0]?.id,
        qty_received: 1,
        location_id: warehouseLocation?.id
      }],
      notes: `Recepcion QA ${batch}`
    }, [200, 201]);
  }
  if (item?.id) {
    await apiStep("Consultar kardex producto", "GET", `/inventory/kardex/${item.id}`, token);
    await apiStep("Consultar costos inventario", "GET", "/inventory/costs", token);
  }

  await apiStep("Config nomina GET", "GET", "/hr/payroll/config", token);
  await apiStep("Config nomina PUT", "PUT", "/hr/payroll/config", token, {
    minimum_wage: 1300000,
    transport_allowance: 162000,
    overtime: { daytime: 1.25, nighttime: 1.75 },
    qa_batch: batch
  });

  const employee = await apiStep("Crear empleado operativo", "POST", "/hr/employees", token, {
    name: "Operativo QA Validacion",
    code: `EMP-${batch.slice(-6)}`,
    document: `CC${batch.slice(-6)}`,
    user_type: "operativo",
    position: "Tecnico QA",
    department: "Operaciones",
    salary_base: 1500000,
    company: "QA",
    labor_status: "active",
    legacy: { qa_batch: batch }
  });
  await apiStep("Consultar empleados", "GET", "/hr/employees", token);
  const roles = await apiStep("Consultar roles administrativos", "GET", "/admin/roles", token);
  const technicianRole = pickCreatedRow(roles, (role) => role.name === "Tecnico");
  await apiStep("Crear tecnico asignable", "POST", "/admin/users", token, {
    profile_kind: "tecnico",
    user_kind: "tecnico",
    name: "Tecnico QA Servicios",
    first_names: "Tecnico QA",
    last_names: "Servicios",
    email: `tecnico.${batch.toLowerCase()}@apex.local`,
    password: "ApexQa2026!",
    role_id: technicianRole?.id,
    document: `TEC-${batch.slice(-8)}`,
    position: "Tecnico de servicios",
    department: "Servicios",
    user_status: "activo",
    operational_classification: "tecnico",
    engagement_type: "contratista",
    contract_type: "service",
    can_receive_services: true
  });

  const vehicle = await apiStep("Crear vehiculo", "POST", "/transport/vehicles", token, {
    plate: `QA${batch.slice(-3)}`,
    type: "van",
    brand: "Renault",
    ownership_type: "own",
    base_site: "BR-QA",
    status: "active",
    mileage: 1000,
    authorized_driver_id: employee?.id,
    authorized_driver_name: employee?.name || "Operativo QA Validacion",
    metadata: { qa_batch: batch }
  });
  await apiStep("Consultar vehiculos", "GET", "/transport/vehicles", token);

  const reference = await apiStep("Crear referencia servicio", "POST", "/services/references", token, {
    code: `REF-${batch.slice(-6)}`,
    name: "Referencia QA Validacion",
    category: "Mantenimiento",
    estimated_minutes: 45,
    brand: "QA",
    model: "2026",
    active: true,
    parts: [{ name: "Filtro QA", quantity: 1, unit: "UND", description: "Parte QA" }],
    metadata: { qa_batch: batch }
  });
  await apiStep("Consultar referencias servicio", "GET", "/services/references", token);
  const technicians = await apiStep("Consultar tecnicos servicio", "GET", "/services/technicians", token);
  const serviceTechnician = pickCreatedRow(technicians, () => true);

  const serviceOrder = await apiStep("Crear orden de servicio", "POST", "/services/orders", token, {
    reference_id: reference?.id,
    technician_id: serviceTechnician?.id,
    service_type: "mantenimiento",
    customer_name: "Cliente QA Validacion",
    customer_document: numericBatch,
    customer_address: "Carrera QA 45",
    customer_phone: "3000000000",
    invoice_number: `FAC-${batch.slice(-8)}`,
    scheduled_date: new Date(Date.now() + 86400000).toISOString(),
    cedi_delivery_date: new Date().toISOString(),
    notes: "Orden generada por validacion completa",
    metadata: { qa_batch: batch, vehicle_id: vehicle?.id }
  });
  if (serviceOrder?.id) {
    await apiStep("Iniciar servicio", "PATCH", `/services/orders/${serviceOrder.id}/start`, token, { latitude: 6.2442, longitude: -75.5812, accuracy_meters: 8 });
    await apiStep("Agregar foto servicio", "POST", `/services/orders/${serviceOrder.id}/photos`, token, {
      type: "before",
      base64_data: tinyPngBase64(),
      size_bytes: 68,
      mime_type: "image/png",
      file_name: `${batch}-evidencia.png`,
      metadata: { qa_batch: batch }
    });
    await apiStep("Consultar fotos servicio", "GET", `/services/orders/${serviceOrder.id}/photos`, token);
    await apiStep("Descargar PDF servicio", "GET", `/services/orders/${serviceOrder.id}/report-pdf`, token);
  }
  await apiStep("Consultar ordenes servicio", "GET", "/services/orders", token);

  const project = await apiStep("Crear proyecto", "POST", "/projects", token, {
    code: `PRJ-${batch.slice(-6)}`,
    name: "Proyecto QA Validacion",
    objective: "Validar flujo operativo de extremo a extremo",
    status: "active",
    priority: "high",
    owner_id: scenario.user.id,
    owner_name: scenario.user.name,
    metadata: { qa_batch: batch }
  });
  if (project?.id) {
    await apiStep("Crear compromiso proyecto", "POST", `/projects/${project.id}/commitments`, token, {
      title: "Compromiso QA",
      responsible_id: scenario.user.id,
      responsible_name: scenario.user.name,
      priority: "high",
      status: "open",
      metadata: { qa_batch: batch }
    });
  }
  await apiStep("Consultar proyectos", "GET", "/projects", token);

  const activityType = await apiStep("Crear tipo actividad", "POST", "/hr/activity-types", token, {
    name: `Actividad QA ${batch.slice(-6)}`,
    description: "Tipo de actividad generado por validacion",
    active: true,
    sort_order: 99,
    metadata: { qa_batch: batch }
  });
  await apiStep("Registrar GPS", "POST", "/hr/gps/ping", token, {
    employee_id: employee?.id,
    user_name: employee?.name || "Operativo QA Validacion",
    vehicle_plate: vehicle?.plate,
    latitude: 6.2442,
    longitude: -75.5812,
    accuracy_meters: 8,
    source: "qa-script",
    captured_at: new Date().toISOString(),
    metadata: { qa_batch: batch }
  });
  await apiStep("Registrar marcacion", "POST", "/hr/time-punches", token, {
    employee_id: employee?.id,
    user_name: employee?.name || "Operativo QA Validacion",
    type: "entrada",
    latitude: 6.2442,
    longitude: -75.5812,
    accuracy_meters: 8,
    vehicle_plate: vehicle?.plate,
    metadata: { qa_batch: batch }
  });
  if (activityType?.id) {
    await apiStep("Registrar actividad operativa con foto", "POST", "/hr/work-activities", token, {
      activity_type_id: activityType.id,
      employee_id: employee?.id,
      occurred_at: new Date().toISOString(),
      latitude: 6.2442,
      longitude: -75.5812,
      accuracy_meters: 8,
      observation: "Actividad generada por validacion QA",
      vehicle_plate: vehicle?.plate,
      metadata: { qa_batch: batch },
      photo: { base64: tinyPngBase64(), name: `${batch}-actividad.png`, type: "image/png", size: 68 }
    });
  }
  await apiStep("Consultar mapa operaciones", "GET", "/hr/operations-map", token);
}

function tinyPngBase64() {
  return "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";
}

function sanitize(value) {
  if (value === null || value === undefined) return value;
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text
    .replace(/Bearer\s+[A-Za-z0-9._-]+/g, "Bearer [REDACTED]")
    .replace(/eyJ[A-Za-z0-9._-]+/g, "[JWT_REDACTED]")
    .slice(0, 1000);
}

function simplifyRows(rows, keys) {
  if (!Array.isArray(rows)) return rows;
  return rows.slice(0, 5).map((row) => Object.fromEntries(keys.map((key) => [key, row[key]])));
}

async function saveReport() {
  report.finished_at = new Date().toISOString();
  fs.mkdirSync(reportDir, { recursive: true });
  fs.writeFileSync(reportJsonPath, JSON.stringify(report, null, 2));
  const lines = [];
  lines.push(`# QA Full System Validation - ${batch}`);
  lines.push("");
  lines.push(`- Started: ${report.started_at}`);
  lines.push(`- Finished: ${report.finished_at}`);
  lines.push(`- API: ${report.config.apiUrl}`);
  lines.push(`- Web: ${report.config.webUrl}`);
  lines.push(`- Supabase: ${report.config.supabaseUrl}`);
  lines.push(`- Summary: ${report.summary.passed} OK, ${report.summary.failed} FAIL, ${report.summary.blocked} BLOCKED, ${report.summary.warning} WARN`);
  lines.push("");
  lines.push("## Created QA Data");
  for (const item of report.created) lines.push(`- ${item.type}: ${item.name || item.email || item.id} (${item.id || item.domain || ""})`);
  lines.push("");
  lines.push("## Findings");
  if (!report.findings.length) lines.push("- No findings.");
  for (const finding of report.findings) {
    lines.push(`- [${finding.status.toUpperCase()}][${finding.severity}] ${finding.area} - ${finding.name}: ${finding.detail?.message || JSON.stringify(finding.detail)}`);
  }
  lines.push("");
  lines.push("## Results");
  for (const result of report.results) {
    lines.push(`- [${result.status.toUpperCase()}] ${result.area} - ${result.name}`);
  }
  fs.writeFileSync(reportMdPath, lines.join("\n"));
  console.log(`\nReport JSON: ${reportJsonPath}`);
  console.log(`Report MD: ${reportMdPath}`);
}

async function main() {
  requiredEnv();
  addResult("preflight", "Variables minimas QA", "passed");
  try {
    const runtime = await validateRuntimeHealth();
    await validateSchemaAlignment();
    const { scjSession } = await validateSupabase();
    await validateFrontendRoutes();
    if (runtime.apiHealthy) {
      await validateApiScenario(scjSession);
    } else {
      addResult("api-flow", "Escenarios API/Prisma end-to-end", "blocked", { message: "No se ejecutan porque /health no esta OK" }, "critical");
    }
  } finally {
    await saveReport();
  }

  if (report.summary.failed > 0 || report.summary.blocked > 0) {
    process.exitCode = 2;
  }
}

main().catch(async (error) => {
  addResult("runner", "Ejecucion general", "failed", { message: error.message, stack: process.env.QA_VERBOSE === "true" ? error.stack : undefined }, "critical");
  await saveReport();
  process.exitCode = 2;
});
