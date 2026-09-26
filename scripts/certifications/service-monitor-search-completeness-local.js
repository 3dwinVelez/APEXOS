const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "../..");
const outputArg = process.argv.find((value) => value.startsWith("--output="));
const output = path.resolve(root, outputArg?.slice("--output=".length) || "docs/qa/evidence/service-monitor-search-completeness-20260926/local-certification.json");
const checks = [];

function check(name, passed, detail) {
  checks.push({ name, status: passed ? "passed" : "failed", detail });
}

function run(name, command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", shell: process.platform === "win32" && /\.cmd$/i.test(command) });
  check(name, result.status === 0, {
    command: [command, ...args].join(" "),
    exit_code: result.status,
    stdout_tail: String(result.stdout || "").slice(-4000),
    stderr_tail: String(result.stderr || "").slice(-4000)
  });
}

const routePath = path.join(root, "apps/web/app/api/services/monitor-orders/route.ts");
const pagePath = path.join(root, "apps/web/app/dashboard/servicios/page.tsx");
const route = fs.readFileSync(routePath, "utf8");
const page = fs.readFileSync(pagePath, "utf8");

check("server_side_search_and_pagination", /Prefer: "count=exact"/.test(route) && /next_offset/.test(route) && /metadata->>customer_document/.test(route), { route: path.relative(root, routePath) });
check("configurable_date_range", /date_from/.test(route) && /date_to/.test(route) && /Rango de fecha programada/.test(page), { route: path.relative(root, routePath), page: path.relative(root, pagePath) });
check("invalid_session_denied", /if \(!userId\).*401/.test(route), { expected: "401 before service-role data access" });
check("membership_and_role_denied", /if \(!memberships\.length\).*403/.test(route) && /!scope\.authorized/.test(route), { expected: "403 without membership or operational role" });
check("cross_tenant_company_rejected", /membershipCompanyIds\.includes\(requestedCompanyId\)/.test(route) && !/fallbackCompanies/.test(route), { expected: "requested company must belong to authenticated user" });
check("related_data_is_bounded_and_visible", /MAX_RELATED_PAGES/.test(route) && /warnings/.test(route) && /La consulta devolvio advertencias/.test(page), { expected: "bounded pagination with visible partial-data signal" });
check("errors_are_sanitized", /SERVICE_MONITOR_UNAVAILABLE/.test(route) && !/body\?\.message \|\| body\?\.error_description/.test(route), { expected: "generic client error" });

run("monitor_and_adjacent_regression", process.execPath, ["--test", "test/service-monitor-live-refresh.test.mjs", "test/service-order-edit-modal-responsive.test.mjs", "test/service-order-special-edit.test.mjs", "test/service-order-detail-contract-normalization.test.mjs"], path.join(root, "apps/web"));
run("web_typecheck", process.platform === "win32" ? "npm.cmd" : "npm", ["run", "typecheck"], path.join(root, "apps/web"));

const result = {
  change_id: "service-monitor-search-completeness-20260926",
  certification: "service-monitor-search-completeness-local",
  generated_at: new Date().toISOString(),
  branch: "desarrollo",
  commit: spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).stdout.trim(),
  checks,
  summary: {
    passed: checks.filter((item) => item.status === "passed").length,
    failed: checks.filter((item) => item.status === "failed").length
  },
  status: checks.every((item) => item.status === "passed") ? "passed" : "failed"
};

fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ output: path.relative(root, output), status: result.status, summary: result.summary }));
if (result.status !== "passed") process.exit(1);
