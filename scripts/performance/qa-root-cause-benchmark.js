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
loadEnv(path.resolve(process.cwd(), "..", "..", ".env"));

const webUrl = (process.env.QA_WEB_URL || "https://apexos-web-qa-production.up.railway.app").replace(/\/$/, "");
const apiUrl = (process.env.QA_API_URL || "").replace(/\/$/, "");
const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "").replace(/\/$/, "");
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const scenarios = String(process.env.PERF_SCENARIOS || "1,10,50,100").split(",").map(Number).filter((value) => value > 0);

const screens = {
  login: "/login",
  dashboard: "/dashboard",
  users_roles: "/dashboard/administracion",
  services: "/dashboard/servicios",
  punches: "/dashboard/talento-humano/marcacion",
  vehicles: "/dashboard/transporte",
  projects: "/dashboard/proyectos",
  inventory: "/dashboard/inventario/stock",
  purchases: "/dashboard/compras/proveedores",
  accounting: "/dashboard/contabilidad/reportes",
  payroll: "/dashboard/talento-humano/nomina"
};

const percentile = (values, ratio) => values[Math.min(values.length - 1, Math.ceil(values.length * ratio) - 1)] || 0;

async function requestOnce(target) {
  const started = performance.now();
  try {
    const response = await fetch(target.url, {
      headers: target.headers || {},
      signal: AbortSignal.timeout(target.timeoutMs || 30_000)
    });
    const body = await response.arrayBuffer();
    return {
      durationMs: performance.now() - started,
      bytes: body.byteLength,
      ok: response.ok,
      status: response.status,
      serverTiming: response.headers.get("server-timing") || ""
    };
  } catch (error) {
    return { durationMs: performance.now() - started, bytes: 0, ok: false, status: 0, error: error.message };
  }
}

async function runTarget(target, concurrency) {
  const started = performance.now();
  const responses = await Promise.all(Array.from({ length: concurrency }, () => requestOnce(target)));
  const elapsedMs = performance.now() - started;
  const durations = responses.map((item) => item.durationMs).sort((a, b) => a - b);
  return {
    category: target.category,
    target: target.name,
    concurrency,
    requests: responses.length,
    avg_ms: Number((durations.reduce((sum, value) => sum + value, 0) / durations.length).toFixed(2)),
    p95_ms: Number(percentile(durations, 0.95).toFixed(2)),
    p99_ms: Number(percentile(durations, 0.99).toFixed(2)),
    avg_kb: Number((responses.reduce((sum, item) => sum + item.bytes, 0) / responses.length / 1024).toFixed(2)),
    requests_per_second: Number((responses.length / (elapsedMs / 1000)).toFixed(2)),
    errors: responses.filter((item) => !item.ok).length,
    statuses: Object.fromEntries([...new Set(responses.map((item) => item.status))].map((status) => [
      status,
      responses.filter((item) => item.status === status).length
    ])),
    server_timing: responses.find((item) => item.serverTiming)?.serverTiming || ""
  };
}

function targets() {
  const serviceHeaders = serviceRole ? { apikey: serviceRole, Authorization: `Bearer ${serviceRole}` } : {};
  const apiHeaders = process.env.QA_API_TOKEN ? { Authorization: `Bearer ${process.env.QA_API_TOKEN}` } : {};
  return [
    ...Object.entries(screens).map(([name, pathname]) => ({
      category: "frontend_document",
      name,
      url: `${webUrl}${pathname}`
    })),
    ...(apiUrl ? [
      { category: "api", name: "health", url: `${apiUrl}/health` },
      { category: "api", name: "users", url: `${apiUrl}/api/v1/admin/users?limit=100`, headers: apiHeaders },
      { category: "api", name: "roles", url: `${apiUrl}/api/v1/admin/roles?limit=100`, headers: apiHeaders },
      { category: "api", name: "services", url: `${apiUrl}/api/v1/services/orders?limit=100`, headers: apiHeaders },
      { category: "api", name: "inventory", url: `${apiUrl}/api/v1/inventory/items?limit=100`, headers: apiHeaders },
      { category: "api", name: "purchases", url: `${apiUrl}/api/v1/purchases/orders?limit=100`, headers: apiHeaders },
      { category: "api", name: "accounting", url: `${apiUrl}/api/v1/accounting/accounts?limit=100`, headers: apiHeaders }
    ] : []),
    ...(supabaseUrl && serviceRole ? [
      { category: "supabase_rest", name: "service_orders", url: `${supabaseUrl}/rest/v1/service_orders?select=id,number,status,created_at&order=created_at.desc&limit=100`, headers: serviceHeaders },
      { category: "supabase_rest", name: "service_evidence_metadata", url: `${supabaseUrl}/rest/v1/service_evidence?select=id,order_id,evidence_type,storage_path,mime_type,size_bytes,created_at&limit=100`, headers: serviceHeaders },
      { category: "supabase_rest", name: "employees", url: `${supabaseUrl}/rest/v1/employees?select=id,first_name,last_name,status,user_type&limit=100`, headers: serviceHeaders },
      { category: "supabase_rest", name: "vehicles", url: `${supabaseUrl}/rest/v1/vehicles?select=id,plate,status,created_at&limit=100`, headers: serviceHeaders },
      { category: "supabase_rest", name: "punches", url: `${supabaseUrl}/rest/v1/time_punches?select=id,employee_id,punch_type,punched_at&order=punched_at.desc&limit=200`, headers: serviceHeaders },
      { category: "supabase_rest", name: "gps", url: `${supabaseUrl}/rest/v1/gps_pings?select=id,employee_id,captured_at&order=captured_at.desc&limit=200`, headers: serviceHeaders }
    ] : [])
  ];
}

async function main() {
  const results = [];
  for (const concurrency of scenarios) {
    for (const target of targets()) {
      const result = await runTarget(target, concurrency);
      results.push(result);
      console.log(`[root-cause] ${result.category}/${result.target} c=${concurrency} avg=${result.avg_ms}ms p95=${result.p95_ms}ms kb=${result.avg_kb} errors=${result.errors}`);
    }
  }

  if (process.env.INCLUDE_HEAVY_EVIDENCE === "true" && supabaseUrl && serviceRole) {
    results.push(await runTarget({
      category: "supabase_rest_heavy",
      name: "service_evidence_with_file_url",
      url: `${supabaseUrl}/rest/v1/service_evidence?select=id,order_id,evidence_type,file_url,storage_path,mime_type,size_bytes,metadata,created_at&limit=100`,
      headers: { apikey: serviceRole, Authorization: `Bearer ${serviceRole}` },
      timeoutMs: 240_000
    }, 1));
  }

  const outputDir = path.resolve(process.cwd(), "reports", "performance");
  fs.mkdirSync(outputDir, { recursive: true });
  const output = path.join(outputDir, `qa-root-cause-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  fs.writeFileSync(output, JSON.stringify({
    generated_at: new Date().toISOString(),
    api_url_configured: Boolean(apiUrl),
    service_role_available: Boolean(serviceRole),
    scenarios,
    results
  }, null, 2));
  console.log(`[root-cause] report=${output}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
