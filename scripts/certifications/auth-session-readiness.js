const assert = require("node:assert/strict");

const apiUrl = String(process.env.CERT_API_URL || "").replace(/\/$/, "");
const email = process.env.CERT_LOGIN_EMAIL;
const password = process.env.CERT_LOGIN_PASSWORD;
const expectedCommit = process.env.CERT_EXPECTED_COMMIT;
const environment = process.env.CERT_ENVIRONMENT || "unknown";

if (!apiUrl || !email || !password || !expectedCommit) {
  throw new Error("CERT_API_URL, CERT_LOGIN_EMAIL, CERT_LOGIN_PASSWORD y CERT_EXPECTED_COMMIT son obligatorios");
}

async function request(path, options = {}) {
  const response = await fetch(`${apiUrl}${path}`, options);
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!response.ok) throw new Error(`${options.method || "GET"} ${path}: ${response.status} ${text.slice(0, 240)}`);
  return { response, body };
}

async function main() {
  const health = (await request("/health")).body;
  assert.equal(health.status, "OK");
  assert.equal(health.commit, expectedCommit.slice(0, 12));

  const login = (await request("/api/v1/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password })
  })).body;
  const token = login.token || login.access_token;
  assert.ok(token, "El login no retorno un token de sesion");

  const authenticatedHeaders = { authorization: `Bearer ${token}` };
  const me = (await request("/api/v1/auth/me", { headers: authenticatedHeaders })).body;
  assert.ok(me.id || me.user?.id, "La sesion no retorno una identidad autenticada");
  await request("/api/v1/services/orders", { headers: authenticatedHeaders });

  console.log(JSON.stringify({
    ok: true,
    environment,
    commit: health.commit,
    health: health.status,
    login: "passed",
    session: "passed",
    authenticated_query: "passed"
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
