const assert = require("node:assert/strict");

const apiUrl = String(process.env.QA_API_URL || "https://apexos-api-qa-production.up.railway.app").replace(/\/$/, "");
const email = process.env.QA_LOGIN_EMAIL;
const password = process.env.QA_LOGIN_PASSWORD;
const expectedCommit = process.env.QA_EXPECTED_COMMIT;
if (!email || !password || !expectedCommit) throw new Error("QA_LOGIN_EMAIL, QA_LOGIN_PASSWORD y QA_EXPECTED_COMMIT son obligatorios");

async function call(path, token) {
  const response = await fetch(`${apiUrl}${path}`, { headers: token ? { authorization: `Bearer ${token}` } : {} });
  const text = await response.text();
  if (!response.ok) throw new Error(`GET ${path}: ${response.status} ${text.slice(0, 180)}`);
  return text ? JSON.parse(text) : null;
}

async function main() {
  const health = await call("/health");
  assert.equal(health.commit, expectedCommit.slice(0, 12));
  const loginResponse = await fetch(`${apiUrl}/api/v1/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }) });
  assert.equal(loginResponse.status, 200);
  const login = await loginResponse.json();
  const token = login.token || login.access_token;
  assert.ok(token);
  const checks = [
    ["session", "/api/v1/auth/me"],
    ["services_orders", "/api/v1/services/orders?limit=5"],
    ["services_references", "/api/v1/services/references?active=true"],
    ["hr_employees", "/api/v1/hr/employees?limit=5"],
    ["inventory_items", "/api/v1/inventory/items?limit=5"],
    ["accounting_accounts", "/api/v1/accounting/accounts?limit=5"]
  ];
  const passed = [];
  for (const [name, path] of checks) {
    await call(path, token);
    passed.push(name);
  }
  const unauthorized = await fetch(`${apiUrl}/api/v1/services/orders?limit=1`);
  assert.equal(unauthorized.status, 401);
  console.log(JSON.stringify({ ok: true, environment: "QA", commit: health.commit, checks: passed, unauthorized_blocked: true }, null, 2));
}

main().catch((error) => { console.error(error); process.exit(1); });
