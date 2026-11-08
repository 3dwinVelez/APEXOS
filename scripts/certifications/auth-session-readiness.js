const assert = require("node:assert/strict");

const apiUrl = String(process.env.CERT_API_URL || "").replace(/\/$/, "");
const email = process.env.CERT_LOGIN_EMAIL;
const password = process.env.CERT_LOGIN_PASSWORD;
const expectedCommit = process.env.CERT_EXPECTED_COMMIT;
const environment = process.env.CERT_ENVIRONMENT || "unknown";
// Fase 0 mide; Fase 2 enciende este flag cuando la revocación surte efecto.
const requireRevocation = String(process.env.CERT_REQUIRE_REVOCATION || "").toLowerCase() === "true";

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
  return { response, body, text };
}

async function expectOk(path, options = {}) {
  const result = await request(path, options);
  if (!result.response.ok) {
    throw new Error(`${options.method || "GET"} ${path}: ${result.response.status} ${result.text.slice(0, 240)}`);
  }
  return result.body;
}

async function expectRejected(path, options, label, allowed = [401, 403]) {
  const result = await request(path, options);
  const status = result.response.status;
  if (status >= 200 && status < 300) {
    throw new Error(`RECHAZO FALTANTE [${label}]: ${options.method || "GET"} ${path} devolvio ${status}; se esperaba ${allowed.join("/")}`);
  }
  if (!allowed.includes(status)) {
    throw new Error(`RECHAZO INESPERADO [${label}]: ${options.method || "GET"} ${path} devolvio ${status}; se esperaba ${allowed.join("/")}`);
  }
  return status;
}

function base64url(value) {
  return Buffer.from(value).toString("base64url");
}

function forgeNoneToken() {
  const header = base64url(JSON.stringify({ alg: "none", typ: "JWT" }));
  const body = base64url(JSON.stringify({ id: 1, tenant_id: 1, exp: Math.floor(Date.now() / 1000) + 3600 }));
  return `${header}.${body}.`;
}

function forgeWrongSecretToken() {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64url(JSON.stringify({ id: 1, tenant_id: 1, exp: Math.floor(Date.now() / 1000) + 3600 }));
  const encoded = `${header}.${body}`;
  const signature = require("node:crypto")
    .createHmac("sha256", "secreto-de-prueba-que-no-es-el-real-123456")
    .update(encoded)
    .digest("base64url");
  return `${encoded}.${signature}`;
}

function tamperSignature(token) {
  const parts = token.split(".");
  if (parts.length !== 3) return `${token}tampered`;
  const sig = parts[2];
  const flipped = sig.endsWith("A") ? `${sig.slice(0, -1)}B` : `${sig.slice(0, -1)}A`;
  return `${parts[0]}.${parts[1]}.${flipped}`;
}

async function main() {
  const health = await expectOk("/health");
  assert.equal(health.status, "OK");
  assert.equal(health.commit, expectedCommit.slice(0, 12));

  const login = await expectOk("/api/v1/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  const token = login.token || login.access_token;
  assert.ok(token, "El login no retorno un token de sesion");

  const auth = { authorization: `Bearer ${token}` };
  const me = await expectOk("/api/v1/auth/me", { headers: auth });
  assert.ok(me.id || me.user?.id, "La sesion no retorno una identidad autenticada");
  await expectOk("/api/v1/services/orders", { headers: auth });

  // Pruebas de rechazo: hoy no existen y son la razon por la que este gate no podia fallar.
  const rejections = {};
  rejections.sin_token = await expectRejected("/api/v1/auth/me", {}, "sin token");
  rejections.token_basura = await expectRejected("/api/v1/auth/me", { headers: { authorization: "Bearer no-es-un-jwt" } }, "token basura");
  rejections.alg_none = await expectRejected("/api/v1/auth/me", { headers: { authorization: `Bearer ${forgeNoneToken()}` } }, "alg none");
  rejections.clave_incorrecta = await expectRejected("/api/v1/auth/me", { headers: { authorization: `Bearer ${forgeWrongSecretToken()}` } }, "firma con clave incorrecta");
  rejections.firma_alterada = await expectRejected("/api/v1/auth/me", { headers: { authorization: `Bearer ${tamperSignature(token)}` } }, "firma alterada");

  // Revocacion: medir en Fase 0, exigir en Fase 2 con CERT_REQUIRE_REVOCATION=true.
  let revocation = { measured: false, enforced: null };
  try {
    await expectOk("/api/v1/auth/logout", { method: "POST", headers: auth });
    const afterLogout = await request("/api/v1/auth/me", { headers: auth });
    revocation = { measured: true, enforced: afterLogout.response.status === 401 };
    if (requireRevocation && !revocation.enforced) {
      throw new Error(`RECHAZO FALTANTE [revocacion]: el token sigue valido tras logout (${afterLogout.response.status}). Activar AUTHORIZATION_VERSION_ENFORCEMENT_ENABLED.`);
    }
  } catch (error) {
    if (requireRevocation) throw error;
    revocation = { measured: false, enforced: null, error: String(error.message || error).slice(0, 160) };
  }

  console.log(JSON.stringify({
    ok: true,
    environment,
    commit: health.commit,
    health: health.status,
    login: "passed",
    authenticated_query: "passed",
    session: Object.keys(rejections).length === 5 ? "passed" : "failed",
    rejections,
    revocation,
    revocation_required: requireRevocation
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
