const fs = require("node:fs");
const path = require("node:path");

function loadEnv(file) {
  for (const line of fs.readFileSync(path.resolve(file), "utf8").split(/\r?\n/)) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*=/.test(line)) continue;
    const index = line.indexOf("=");
    if (!process.env[line.slice(0, index)]) process.env[line.slice(0, index)] = line.slice(index + 1).replace(/^"|"$/g, "");
  }
}

function credentials(file) {
  const result = [];
  for (const line of fs.readFileSync(path.resolve(file), "utf8").split(/\r?\n/)) {
    const match = line.match(/^(NYVORA_REAL_[A-Z]+)=(.+)$/);
    if (!match) continue;
    const [email, password, label] = match[2].split("|");
    if (email && password) result.push({ profile: match[1].replace("NYVORA_REAL_", "").toLowerCase(), email, password, label });
  }
  return result;
}

async function request(url, { apiKey, token = apiKey, method = "GET", body } = {}) {
  const response = await fetch(url, {
    method,
    headers: { apikey: apiKey, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body == null ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20_000)
  });
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: response.status, ok: response.ok, data };
}

async function main() {
  loadEnv(process.argv[2] || "config/production.env");
  const users = process.env.QA_SUPABASE_SCJ_EMAIL && process.env.QA_SUPABASE_SCJ_PASSWORD
    ? [{ profile: "control_company_admin", email: process.env.QA_SUPABASE_SCJ_EMAIL, password: process.env.QA_SUPABASE_SCJ_PASSWORD }]
    : credentials(process.argv[3] || "config/nyvora-real-test-credentials.env");
  const base = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
  const anon = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!base || !anon || !service || !users.length) throw new Error("Configuración incompleta.");

  const companies = await request(`${base}/rest/v1/companies?select=id,name&limit=20`, { apiKey: service });
  if (!companies.ok || !Array.isArray(companies.data)) throw new Error("No fue posible obtener empresas de control.");
  const results = [];

  for (const user of users) {
    const login = await request(`${base}/auth/v1/token?grant_type=password`, {
      apiKey: anon,
      method: "POST",
      body: { email: user.email, password: user.password }
    });
    if (!login.ok || !login.data?.access_token) {
      results.push({ profile: user.profile, check: "login", expected: 200, obtained: login.status, passed: false });
      continue;
    }
    const token = login.data.access_token;
    const memberships = await request(`${base}/rest/v1/v_user_companies?select=company_id,company_name,role_name`, { apiKey: anon, token });
    const ownIds = new Set((Array.isArray(memberships.data) ? memberships.data : []).map((row) => row.company_id));
    const other = companies.data.find((company) => !ownIds.has(company.id));
    results.push({ profile: user.profile, check: "own_company_select", expected: "one_or_more", obtained: ownIds.size, passed: memberships.ok && ownIds.size > 0 });
    if (!other) {
      results.push({ profile: user.profile, check: "cross_company_control", expected: "available", obtained: "missing", passed: false });
      continue;
    }
    const checks = [
      ["companies_cross_select", `${base}/rest/v1/companies?select=id&id=eq.${encodeURIComponent(other.id)}`],
      ["company_users_cross_select", `${base}/rest/v1/company_users?select=id&company_id=eq.${encodeURIComponent(other.id)}`],
      ["services_cross_select", `${base}/rest/v1/service_orders?select=id&company_id=eq.${encodeURIComponent(other.id)}&limit=5`],
      ["evidence_cross_select", `${base}/rest/v1/service_evidence?select=id,service_orders!inner(company_id)&service_orders.company_id=eq.${encodeURIComponent(other.id)}&limit=5`]
    ];
    for (const [check, url] of checks) {
      const response = await request(url, { apiKey: anon, token });
      const rows = Array.isArray(response.data) ? response.data.length : null;
      results.push({ profile: user.profile, check, expected: 0, obtained: rows ?? response.status, passed: response.ok && rows === 0 });
    }
    const storage = await request(`${base}/storage/v1/object/list/service-images`, {
      apiKey: anon,
      token,
      method: "POST",
      body: { prefix: `${other.id}/`, limit: 10, offset: 0 }
    });
    const storageRows = Array.isArray(storage.data) ? storage.data.length : null;
    results.push({ profile: user.profile, check: "storage_cross_list", expected: 0, obtained: storageRows ?? storage.status, passed: storage.ok && storageRows === 0 });
  }

  const output = path.resolve(`reports/security/rls-isolation-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify({ generated_at: new Date().toISOString(), environment: "production-read-only", results }, null, 2)}\n`);
  const failures = results.filter((item) => !item.passed);
  console.log(`[rls-isolation] checks=${results.length} failures=${failures.length} report=${output}`);
  if (failures.length) {
    for (const failure of failures) console.error(`[rls-isolation] failed profile=${failure.profile} check=${failure.check} obtained=${failure.obtained}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`[rls-isolation] ${error.message}`);
  process.exitCode = 1;
});
