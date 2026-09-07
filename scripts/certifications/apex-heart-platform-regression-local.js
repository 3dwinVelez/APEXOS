const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

async function main() {
  const outputArg = process.argv.find((arg) => arg.startsWith("--output="));
  const output = path.resolve(outputArg ? outputArg.slice(9) : "docs/qa/evidence/apex-heart-20260906/platform-regression.json");
  const build = require("../../apps/api/server");
  const app = await build();
  try {
    const login = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { email: "demo@apex.local", password: "test1234" } });
    assert.equal(login.statusCode, 200);
    const headers = { authorization: `Bearer ${login.json().token}` };
    const checks = [];
    for (const [name, url] of [["session", "/api/v1/auth/me"], ["inventory", "/api/v1/inventory/items?limit=5"], ["purchases", "/api/v1/purchases/orders?limit=5"], ["sales", "/api/v1/sales/invoices?limit=5"], ["receivables", "/api/v1/accounts-receivable/documents?limit=5"], ["accounting", "/api/v1/accounting/accounts?limit=5"]]) {
      const response = await app.inject({ method: "GET", url, headers });
      assert.ok(response.statusCode >= 200 && response.statusCode < 300, `${name}: HTTP ${response.statusCode}`);
      checks.push({ name, status: "passed", http_status: response.statusCode });
    }
    const unauthorized = await app.inject({ method: "GET", url: "/api/v1/apex-heart/dashboard" });
    assert.equal(unauthorized.statusCode, 401);
    checks.push({ name: "unauthenticated_access", status: "passed", http_status: 401 });
    const result = { certification: "apex-heart-platform-regression-local", version: 1, status: "passed", generated_at: new Date().toISOString(), commit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), environment: "local-isolated-qa", checks };
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await app.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
