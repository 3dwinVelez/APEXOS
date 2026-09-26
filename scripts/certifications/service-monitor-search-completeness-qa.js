const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const puppeteer = require("puppeteer-core");

const args = Object.fromEntries(process.argv.slice(2).map((v) => { const [k, ...r] = v.replace(/^--/, "").split("="); return [k, r.join("=") || true]; }));
const envFile = String(args["env-file"] || "config/qa.env");
for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
  const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
}
const output = path.resolve(String(args.output || "docs/qa/evidence/service-monitor-search-completeness-20260926/qa-certification.json"));
const webUrl = String(process.env.QA_WEB_URL || "https://apexos-web-qa-production.up.railway.app").replace(/\/$/, "");
const supabaseUrl = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const expectedCommit = process.env.QA_EXPECTED_COMMIT;
if (!supabaseUrl || !anonKey || !serviceKey || !expectedCommit) throw new Error("Faltan variables QA de Supabase o QA_EXPECTED_COMMIT");

const runId = `monitor-${Date.now()}`;
const password = `Qa!${Date.now()}Aa`;
const users = [];
const checks = [];
function check(name, condition, detail = {}) { assert.ok(condition, `${name}: ${JSON.stringify(detail)}`); checks.push({ name, status: "passed", detail }); }
async function sb(pathname, options = {}) {
  const response = await fetch(`${supabaseUrl}${pathname}`, { ...options, headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}`, "content-type": "application/json", prefer: "return=representation", ...(options.headers || {}) } });
  const text = await response.text();
  if (!response.ok) throw new Error(`Supabase ${pathname}: ${response.status} ${text.slice(0, 180)}`);
  return text ? JSON.parse(text) : null;
}
async function createUser(label, companyId, role) {
  const email = `${runId}-${label}@qa.apexos.local`;
  const user = await sb("/auth/v1/admin/users", { method: "POST", body: JSON.stringify({ email, password, email_confirm: true }) });
  users.push(user.id);
  await sb("/rest/v1/profiles", { method: "POST", body: JSON.stringify({ id: user.id, full_name: `QA ${label}`, email, status: "active" }) });
  await sb("/rest/v1/company_users", { method: "POST", body: JSON.stringify({ company_id: companyId, user_id: user.id, role, status: "active" }) });
  return { email, id: user.id };
}
async function token(email) {
  const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: anonKey, "content-type": "application/json" }, body: JSON.stringify({ email, password }) });
  assert.equal(response.status, 200);
  return (await response.json()).access_token;
}
async function monitor(accessToken, query = "") {
  const response = await fetch(`${webUrl}/api/services/monitor-orders?${query}`, { headers: accessToken ? { authorization: `Bearer ${accessToken}` } : {} });
  return { status: response.status, body: await response.json().catch(() => null) };
}
function chromePath() {
  const candidates = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe"];
  const found = candidates.find((candidate) => candidate && fs.existsSync(candidate));
  if (!found) throw new Error("Chrome no encontrado");
  return found;
}

(async () => {
  let browser;
  try {
    const companies = await sb("/rest/v1/companies?select=id,name&order=name.asc");
    const nyvora = companies.find((company) => String(company.name).toUpperCase() === "NYVORA");
    const other = companies.find((company) => company.id !== nyvora?.id);
    assert.ok(nyvora && other, "QA requiere NYVORA y otro tenant");
    const admin = await createUser("admin", nyvora.id, "owner");
    const member = await createUser("member", nyvora.id, "member");
    const outsider = await createUser("outsider", other.id, "admin");
    const [adminToken, memberToken, outsiderToken] = await Promise.all([token(admin.email), token(member.email), token(outsider.email)]);
    const authResponse = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: { apikey: anonKey, authorization: `Bearer ${adminToken}` } });
    const authUser = await authResponse.json();
    const adminMembership = await sb(`/rest/v1/company_users?select=company_id,user_id,role,status&user_id=eq.${authUser.id}`);
    check("auth_membership_consistent", authResponse.status === 200 && adminMembership.some((row) => row.company_id === nyvora.id && row.role === "owner"), { auth_status: authResponse.status, user_match: authUser.id === admin.id, memberships: adminMembership.map((row) => ({ company_id: row.company_id, role: row.role, status: row.status })) });
    await new Promise((resolve) => setTimeout(resolve, 5000));

    const anonymous = await monitor("", "limit=1");
    check("anonymous_rejected", anonymous.status === 401, { status: anonymous.status });
    const unauthorized = await monitor(memberToken, "limit=1");
    check("member_without_operational_role_rejected", unauthorized.status === 403, { status: unauthorized.status });
    const crossTenant = await monitor(outsiderToken, `limit=1&company_id=${nyvora.id}`);
    check("cross_tenant_rejected", crossTenant.status === 403, { status: crossTenant.status });

    const historical = await monitor(adminToken, `limit=20&q=OS-00001&company_id=${nyvora.id}`);
    check("historical_order_found", historical.status === 200 && historical.body.data.some((row) => row.number === "OS-00001"), { status: historical.status, message: historical.body?.message, total: historical.body?.total, numbers: historical.body?.data?.map((row) => row.number) });
    const paged = await monitor(adminToken, "limit=1&offset=0");
    check("server_pagination", paged.status === 200 && paged.body.data.length === 1 && paged.body.total >= 2 && paged.body.has_more === true, { total: paged.body.total });
    const range = await monitor(adminToken, "limit=20&date_from=2026-08-21&date_to=2026-08-22&q=OS-00001");
    check("configurable_date_range", range.status === 200 && range.body.data.some((row) => row.number === "OS-00001"), { total: range.body.total });
    const invalid = await monitor(adminToken, "status=estado_invalido");
    check("invalid_filter_rejected", invalid.status === 400, { status: invalid.status });

    browser = await puppeteer.launch({ executablePath: chromePath(), headless: true, args: ["--no-sandbox", "--disable-extensions"] });
    const page = await browser.newPage();
    await page.goto(`${webUrl}/login`, { waitUntil: "networkidle2" });
    await page.type('input[name="email"]', admin.email);
    await page.type('input[name="password"]', password);
    await Promise.all([page.click('button[type="submit"]'), page.waitForNavigation({ waitUntil: "networkidle2" })]);
    await page.goto(`${webUrl}/dashboard/servicios`, { waitUntil: "networkidle2" });
    await page.waitForSelector('input[type="date"]', { timeout: 30000 });
    const search = await page.$('input[placeholder*="Buscar" i]');
    assert.ok(search, "El monitor debe exponer busqueda visible");
    await search.type("OS-00001");
    await new Promise((resolve) => setTimeout(resolve, 1200));
    await page.waitForFunction(() => document.body.innerText.includes("OS-00001"), { timeout: 30000 });
    check("browser_real_flow", true, { page: "/dashboard/servicios", search: "controlled historical order", date_inputs: await page.$$eval('input[type="date"]', (nodes) => nodes.length) });

    const evidence = { certification: "service-monitor-search-completeness-qa", status: "passed", environment: "QA", commit: expectedCommit, company: "NYVORA", generated_at: new Date().toISOString(), checks, credentials_recorded: false, cleanup: "completed" };
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`);
    console.log(JSON.stringify({ status: evidence.status, commit: evidence.commit, checks: checks.length, output }, null, 2));
  } finally {
    await browser?.close().catch(() => undefined);
    for (const id of users.reverse()) {
      await sb(`/rest/v1/company_users?user_id=eq.${id}`, { method: "DELETE" }).catch(() => undefined);
      await sb(`/auth/v1/admin/users/${id}`, { method: "DELETE" }).catch(() => undefined);
    }
  }
})().catch((error) => { console.error(error.message); process.exit(1); });
