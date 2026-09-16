#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const EXPECTED_QA_REF = "jbirkghkekuifgfsgquq";
const outputPath = path.resolve(process.argv[2] || "database-security-hardening-qa.json");

function required(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const config = {
  supabaseUrl: required("NEXT_PUBLIC_SUPABASE_URL").replace(/\/$/, ""),
  anonKey: required("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  serviceKey: required("SUPABASE_SERVICE_ROLE_KEY"),
  adminEmail: required("QA_SUPABASE_ADMIN_EMAIL"),
  adminPassword: required("QA_SUPABASE_ADMIN_PASSWORD"),
  tenantEmail: required("QA_SUPABASE_SCJ_EMAIL"),
  tenantPassword: required("QA_SUPABASE_SCJ_PASSWORD"),
  apiUrl: required("QA_API_URL").replace(/\/$/, ""),
  webUrl: required("QA_WEB_URL").replace(/\/$/, "")
};

if (!config.supabaseUrl.includes(EXPECTED_QA_REF)) {
  throw new Error(`Refusing non-QA Supabase target; expected ${EXPECTED_QA_REF}`);
}

const checks = [];
function record(name, passed, detail) {
  checks.push({ name, status: passed ? "passed" : "failed", detail });
  console.log(`[${passed ? "PASS" : "FAIL"}] ${name}: ${detail}`);
}

async function jsonRequest(url, options = {}) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(20_000) });
  const body = await response.json().catch(() => null);
  return { response, body };
}

async function login(email, password) {
  return jsonRequest(`${config.supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: config.anonKey, "content-type": "application/json" },
    body: JSON.stringify({ email, password })
  });
}

async function rest(pathname, key, token = key) {
  return jsonRequest(`${config.supabaseUrl}/rest/v1/${pathname}`, {
    headers: { apikey: key, authorization: `Bearer ${token}` }
  });
}

async function burst(name, url, options = {}, count = 50) {
  const started = Date.now();
  const statuses = await Promise.all(Array.from({ length: count }, async () => {
    try {
      const response = await fetch(url, { ...options, signal: AbortSignal.timeout(20_000) });
      return response.status;
    } catch {
      return 0;
    }
  }));
  const success = statuses.filter((status) => status >= 200 && status < 400).length;
  record(name, success === count, `${success}/${count} successful in ${Date.now() - started} ms`);
}

async function main() {
  const [adminLogin, tenantLogin] = await Promise.all([
    login(config.adminEmail, config.adminPassword),
    login(config.tenantEmail, config.tenantPassword)
  ]);
  record("admin_login", adminLogin.response.status === 200 && Boolean(adminLogin.body?.access_token), `HTTP ${adminLogin.response.status}`);
  record("tenant_login", tenantLogin.response.status === 200 && Boolean(tenantLogin.body?.access_token), `HTTP ${tenantLogin.response.status}`);

  const adminCompanies = await rest("v_user_companies?select=*", config.anonKey, adminLogin.body?.access_token);
  const tenantCompanies = await rest("v_user_companies?select=*", config.anonKey, tenantLogin.body?.access_token);
  record("admin_company_visibility", adminCompanies.response.ok && Array.isArray(adminCompanies.body) && adminCompanies.body.length > 0, `rows=${Array.isArray(adminCompanies.body) ? adminCompanies.body.length : "error"}`);
  record("tenant_company_visibility", tenantCompanies.response.ok && Array.isArray(tenantCompanies.body) && tenantCompanies.body.length === 1, `rows=${Array.isArray(tenantCompanies.body) ? tenantCompanies.body.length : "error"}`);

  const allCompanies = await rest("companies?select=id&limit=20", config.serviceKey);
  const ownIds = new Set((Array.isArray(tenantCompanies.body) ? tenantCompanies.body : []).map((row) => row.company_id || row.id).filter(Boolean));
  const other = (Array.isArray(allCompanies.body) ? allCompanies.body : []).find((row) => !ownIds.has(row.id));
  record("cross_tenant_fixture", Boolean(other), other ? "control company found" : "control company unavailable");

  if (other) {
    const negativePaths = [
      ["cross_tenant_companies", `companies?select=id&id=eq.${encodeURIComponent(other.id)}`],
      ["cross_tenant_company_users", `company_users?select=id&company_id=eq.${encodeURIComponent(other.id)}`],
      ["cross_tenant_service_orders", `service_orders?select=id&company_id=eq.${encodeURIComponent(other.id)}&limit=5`]
    ];
    for (const [name, pathname] of negativePaths) {
      const result = await rest(pathname, config.anonKey, tenantLogin.body?.access_token);
      const rows = Array.isArray(result.body) ? result.body.length : -1;
      record(name, result.response.ok && rows === 0, `HTTP ${result.response.status}; rows=${rows}`);
    }
  }

  const anonymous = await rest("v_user_companies?select=*", config.anonKey);
  record("anonymous_company_visibility", anonymous.response.ok && Array.isArray(anonymous.body) && anonymous.body.length === 0, `HTTP ${anonymous.response.status}; rows=${Array.isArray(anonymous.body) ? anonymous.body.length : "error"}`);

  await Promise.all([
    burst("api_health_burst", `${config.apiUrl}/health`),
    burst("web_login_burst", `${config.webUrl}/login`),
    burst("supabase_auth_burst", `${config.supabaseUrl}/auth/v1/health`, { headers: { apikey: config.anonKey } })
  ]);

  const failed = checks.filter((check) => check.status !== "passed");
  const report = {
    generated_at: new Date().toISOString(),
    environment: "QA",
    project_ref: EXPECTED_QA_REF,
    destructive_operations: false,
    summary: { passed: checks.length - failed.length, failed: failed.length },
    checks
  };
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`[REPORT] ${outputPath}`);
  if (failed.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`[FAIL] ${error.message}`);
  process.exitCode = 1;
});
