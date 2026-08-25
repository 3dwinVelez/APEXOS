const assert = require("node:assert/strict");
const { bootstrapNyvoraFixture } = require("./fixtures/nyvora-service-correction");

const apiUrl = String(process.env.QA_API_URL || "https://apexos-api-qa-production.up.railway.app").replace(/\/$/, "");
const webUrl = String(process.env.QA_WEB_URL || "https://apexos-web-qa-production.up.railway.app").replace(/\/$/, "");
const expectedCommit = String(process.env.QA_EXPECTED_COMMIT || "");
const environment = String(process.env.CERTIFICATION_ENVIRONMENT || "QA").toUpperCase();

if (!expectedCommit) throw new Error("QA_EXPECTED_COMMIT es obligatorio");
if (environment !== "QA") throw new Error("Esta certificacion solo puede ejecutarse en QA");
if (!apiUrl.includes("apexos-api-qa") || !webUrl.includes("apexos-web-qa")) {
  throw new Error("QA_API_URL y QA_WEB_URL deben apuntar al ambiente QA");
}

async function json(path, options = {}) {
  const response = await fetch(`${apiUrl}${path}`, options);
  const body = await response.text();
  if (!response.ok) throw new Error(`${options.method || "GET"} ${path}: ${response.status} ${body.slice(0, 180)}`);
  return body ? JSON.parse(body) : null;
}

async function login(credentials) {
  const payload = await json("/api/v1/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: credentials[0], password: credentials[1] })
  });
  const token = payload.token || payload.access_token;
  assert.ok(token, "El inicio de sesion QA no devolvio token");
  return token;
}

async function main() {
  const health = await json("/health");
  assert.equal(health.commit, expectedCommit.slice(0, 12), "El API QA no ejecuta el commit esperado");

  const fixture = await bootstrapNyvoraFixture();
  const authorizedToken = await login(fixture.credentials.authorized);
  const limitedToken = await login(fixture.credentials.limited);
  const authorizedHeaders = { authorization: `Bearer ${authorizedToken}` };
  const limitedHeaders = { authorization: `Bearer ${limitedToken}` };

  const authorizedSession = await json("/api/v1/auth/me", { headers: authorizedHeaders });
  const limitedSession = await json("/api/v1/auth/me", { headers: limitedHeaders });
  await json("/api/v1/hr/employees?limit=5", { headers: authorizedHeaders });
  assert.ok(authorizedSession.user || authorizedSession.id, "La sesion autorizada de Nyvora no es valida");
  assert.ok(limitedSession.user || limitedSession.id, "La sesion limitada de Nyvora no es valida");

  const unauthorized = await fetch(`${apiUrl}/api/v1/hr/employees?limit=1`);
  assert.equal(unauthorized.status, 401, "Talento Humano debe bloquear solicitudes sin sesion");

  const landingResponse = await fetch(`${webUrl}/dashboard/talento-humano?certification=${Date.now()}`, {
    headers: { "cache-control": "no-cache" }
  });
  assert.equal(landingResponse.status, 200, "La portada de Talento Humano no responde en QA");
  const html = await landingResponse.text();
  const labels = [
    "Mallas horarias",
    "Crear y asignar horarios",
    "Marcaciones y jornadas",
    "Monitor de jornada",
    "Reportes de tiempo",
    "Nómina",
    "Disponible próximamente"
  ];
  for (const label of labels) assert.ok(html.includes(label), `La portada QA no contiene: ${label}`);
  for (const route of ["rutas", "marcacion", "mapa", "reportes"]) {
    assert.ok(html.includes(`/dashboard/talento-humano/${route}`), `Falta el acceso QA a ${route}`);
  }
  const orderedLabels = ["Crear y asignar horarios", "Marcaciones y jornadas", "Monitor de jornada", "Reportes de tiempo"];
  const positions = orderedLabels.map((label) => html.indexOf(label));
  assert.ok(positions.every((position) => position >= 0), "No se encontraron todas las acciones ordenadas");
  assert.deepEqual([...positions].sort((a, b) => a - b), positions, "Las acciones no conservan el orden certificado");
  assert.ok(!html.includes("Gestionar vehículos"), "La portada volvio a mezclar Transporte dentro de Talento Humano");

  console.log(JSON.stringify({
    ok: true,
    environment,
    model_company: "NYVORA",
    commit: health.commit,
    checks: {
      deployed_api_commit: "passed",
      talent_landing_http: "passed",
      business_domain_grouping: "passed",
      journey_action_order: "passed",
      routes_visible: "passed",
      payroll_separated: "passed",
      transport_not_mixed: "passed",
      authorized_nyvora_session: "passed",
      limited_nyvora_session: "passed",
      unauthorized_hr_blocked: "passed"
    }
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
