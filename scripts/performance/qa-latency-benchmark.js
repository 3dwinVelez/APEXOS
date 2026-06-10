const fs = require("node:fs");
const path = require("node:path");

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
}

loadEnv(path.resolve(process.cwd(), ".env"));

const frontendUrl = (process.env.QA_WEB_URL || "https://apexos-web-qa-production.up.railway.app").replace(/\/$/, "");
const apiUrl = (process.env.QA_API_URL || "").replace(/\/$/, "");
const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "").replace(/\/$/, "");
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "";
const scenarios = String(process.env.PERF_SCENARIOS || "10,50,100").split(",").map(Number).filter((value) => value > 0);

const percentile = (values, value) => values[Math.min(values.length - 1, Math.ceil(values.length * value) - 1)] || 0;

async function login() {
  if (!supabaseUrl || !anonKey) return "";
  if (!process.env.QA_SUPABASE_SCJ_PASSWORD) {
    console.warn("[perf] QA_SUPABASE_SCJ_PASSWORD not configured; Supabase authenticated targets skipped.");
    return "";
  }
  const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      email: process.env.QA_SUPABASE_SCJ_EMAIL || "scj@apexos.qa",
      password: process.env.QA_SUPABASE_SCJ_PASSWORD
    })
  });
  if (!response.ok) throw new Error(`Supabase login failed: ${response.status}`);
  return (await response.json()).access_token;
}

async function requestOnce(target) {
  const started = performance.now();
  try {
    const response = await fetch(target.url, { headers: target.headers, signal: AbortSignal.timeout(20_000) });
    await response.arrayBuffer();
    return { duration: performance.now() - started, status: response.status, ok: response.ok };
  } catch (error) {
    return { duration: performance.now() - started, status: 0, ok: false, error: error.message };
  }
}

async function runScenario(target, concurrency) {
  const started = performance.now();
  const results = await Promise.all(Array.from({ length: concurrency }, () => requestOnce(target)));
  const elapsed = performance.now() - started;
  const durations = results.map((result) => result.duration).sort((a, b) => a - b);
  return {
    target: target.name,
    concurrency,
    requests: results.length,
    avg_ms: Number((durations.reduce((sum, value) => sum + value, 0) / durations.length).toFixed(2)),
    p95_ms: Number(percentile(durations, 0.95).toFixed(2)),
    p99_ms: Number(percentile(durations, 0.99).toFixed(2)),
    requests_per_second: Number((results.length / (elapsed / 1000)).toFixed(2)),
    errors: results.filter((result) => !result.ok).length,
    statuses: Object.fromEntries([...new Set(results.map((result) => result.status))].map((status) => [
      status,
      results.filter((result) => result.status === status).length
    ]))
  };
}

async function main() {
  const token = await login();
  const supabaseHeaders = token ? { apikey: anonKey, Authorization: `Bearer ${token}` } : {};
  const targets = [
    { name: "frontend_login", url: `${frontendUrl}/login`, headers: {} },
    { name: "frontend_dashboard", url: `${frontendUrl}/dashboard`, headers: {} },
    ...(apiUrl ? [{ name: "api_health", url: `${apiUrl}/health`, headers: {} }] : []),
    ...(supabaseUrl && token ? [
      { name: "supabase_user_companies", url: `${supabaseUrl}/rest/v1/v_user_companies?select=company_id,company_name,role&limit=5`, headers: supabaseHeaders },
      { name: "supabase_services", url: `${supabaseUrl}/rest/v1/service_orders?select=id,number,status,created_at&order=created_at.desc&limit=100`, headers: supabaseHeaders },
      { name: "supabase_employees", url: `${supabaseUrl}/rest/v1/employees?select=id,first_name,last_name,status,user_type&limit=100`, headers: supabaseHeaders },
      { name: "supabase_vehicles", url: `${supabaseUrl}/rest/v1/vehicles?select=id,plate,status,created_at&limit=100`, headers: supabaseHeaders },
      { name: "supabase_punches", url: `${supabaseUrl}/rest/v1/time_punches?select=id,employee_id,punch_type,punched_at&order=punched_at.desc&limit=200`, headers: supabaseHeaders },
      { name: "supabase_gps", url: `${supabaseUrl}/rest/v1/gps_pings?select=id,employee_id,captured_at&order=captured_at.desc&limit=200`, headers: supabaseHeaders }
    ] : [])
  ];

  const results = [];
  for (const concurrency of scenarios) {
    for (const target of targets) {
      const result = await runScenario(target, concurrency);
      results.push(result);
      console.log(`[perf] ${target.name} c=${concurrency} avg=${result.avg_ms}ms p95=${result.p95_ms}ms errors=${result.errors}`);
    }
  }

  const report = { generated_at: new Date().toISOString(), frontend_url: frontendUrl, api_url_configured: Boolean(apiUrl), scenarios, results };
  const outputDir = path.resolve(process.cwd(), "reports", "performance");
  fs.mkdirSync(outputDir, { recursive: true });
  const output = path.join(outputDir, `qa-latency-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  fs.writeFileSync(output, JSON.stringify(report, null, 2));
  console.log(`[perf] report=${output}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
