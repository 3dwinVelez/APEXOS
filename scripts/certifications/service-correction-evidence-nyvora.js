const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { bootstrapNyvoraFixture } = require("./fixtures/nyvora-service-correction");

const apiUrl = String(process.env.QA_API_URL || "https://apexos-api-qa-production.up.railway.app").replace(/\/$/, "");
const supabaseUrl = String(process.env.QA_SUPABASE_URL || "").replace(/\/$/, "");
const expectedCommit = process.env.QA_EXPECTED_COMMIT;
const environment = String(process.env.CERTIFICATION_ENVIRONMENT || "QA").toUpperCase();
let credentials = {
  authorized: [process.env.QA_LOGIN_EMAIL, process.env.QA_LOGIN_PASSWORD],
  limited: [process.env.QA_LIMITED_LOGIN_EMAIL, process.env.QA_LIMITED_LOGIN_PASSWORD],
  otherTenant: [process.env.QA_OTHER_TENANT_LOGIN_EMAIL, process.env.QA_OTHER_TENANT_LOGIN_PASSWORD]
};
if (!expectedCommit || !supabaseUrl) throw new Error("QA_EXPECTED_COMMIT y QA_SUPABASE_URL son obligatorios");

const runId = `nyvora-correction-evidence-${Date.now()}`;
const externalOrderId = crypto.randomUUID();
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");

async function raw(path, options = {}) {
  return fetch(`${apiUrl}${path}`, options);
}

async function json(path, options = {}, expectedStatus = 200) {
  const response = await raw(path, options);
  const text = await response.text();
  assert.equal(response.status, expectedStatus, `${options.method || "GET"} ${path}: ${response.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

async function login([email, password]) {
  const response = await json("/api/v1/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  const token = response.token || response.access_token;
  assert.ok(token, `No se obtuvo token para ${email}`);
  return token;
}

function auth(token, body) {
  return {
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    headers: { authorization: `Bearer ${token}`, ...(body === undefined ? {} : { "content-type": "application/json" }) }
  };
}

function tenantId(session) {
  return session?.tenant_id || session?.user?.tenant_id || session?.tenant?.id || null;
}

async function main() {
  let fixture = null;
  if (String(process.env.CONFIRM_NYVORA_FIXTURE || "").toLowerCase() === "true") {
    fixture = await bootstrapNyvoraFixture();
    credentials = fixture.credentials;
  }
  if (Object.values(credentials).some(([email, secret]) => !email || !secret)) {
    throw new Error("Credenciales authorized/limited/other-tenant son obligatorias cuando no se habilita el fixture Nyvora");
  }
  const health = await json("/health");
  assert.equal(health.commit, expectedCommit.slice(0, 12), `${environment} no ejecuta el commit certificado`);

  const authorizedToken = await login(credentials.authorized);
  const limitedToken = await login(credentials.limited);
  const otherTenantToken = await login(credentials.otherTenant);
  const session = await json("/api/v1/auth/me", auth(authorizedToken));
  const limitedSession = await json("/api/v1/auth/me", auth(limitedToken));
  const otherTenantSession = await json("/api/v1/auth/me", auth(otherTenantToken));
  assert.ok(tenantId(session), "La sesion autorizada no informa tenant");
  assert.equal(tenantId(limitedSession), tenantId(session), "El rol limitado no pertenece al tenant Nyvora certificado");
  assert.notEqual(tenantId(otherTenantSession), tenantId(session), "El usuario de aislamiento debe pertenecer a otro tenant");
  if (fixture) assert.equal(tenantId(session), fixture.tenant.id, "La sesion autorizada no pertenece a la empresa modelo Nyvora");

  const references = await json("/api/v1/services/references?active=true", auth(authorizedToken));
  const technicians = await json("/api/v1/services/technicians", auth(authorizedToken));
  const types = await json("/api/v1/services/service-types", auth(authorizedToken));
  assert.ok(references.length && technicians.length, "Nyvora requiere referencia y tecnico activos");

  const created = await json("/api/v1/services/orders", {
    method: "POST",
    ...auth(authorizedToken, {
      reference_id: references[0].id,
      technician_id: technicians[0].id,
      service_type: types[0]?.code || "montaje",
      customer_name: "Certificacion Nyvora",
      customer_document: String(Date.now()),
      customer_address: "Direccion QA controlada",
      customer_phone: "3000000000",
      scheduled_date: new Date().toISOString(),
      notes: runId,
      metadata: { external_order_id: externalOrderId, certification_run: runId },
      items: [{ reference_id: references[0].id, service_type: types[0]?.code || "montaje", quantity: 1 }]
    })
  });

  await json(`/api/v1/services/orders/${externalOrderId}/corrections`, { method: "POST", ...auth(limitedToken, {
    reason_code: "MISSING_EVIDENCE", description: "Intento negativo sin permiso administrativo", confirmed: true,
    expected_version: created.version, changes: [{ type: "EVIDENCE_ADDED", value: "administrative_support" }]
  }) }, 403);
  const crossTenant = await raw(`/api/v1/services/orders/${externalOrderId}/corrections`, { method: "GET", ...auth(otherTenantToken) });
  assert.ok([403, 404].includes(crossTenant.status), `El acceso cruzado respondio ${crossTenant.status}`);

  const correction = await json(`/api/v1/services/orders/${externalOrderId}/corrections`, {
    method: "POST",
    ...auth(authorizedToken, {
      reason_code: "MISSING_EVIDENCE",
      description: "Certificacion Nyvora de evidencia administrativa por UUID externo",
      confirmed: true,
      expected_version: created.version,
      idempotency_key: runId,
      changes: [{ type: "EVIDENCE_ADDED", value: "administrative_support" }]
    })
  });
  assert.equal(correction.order_id, created.id);

  const authorization = await json(`/api/v1/services/orders/${externalOrderId}/corrections/evidence-upload-authorizations`, {
    method: "POST",
    ...auth(authorizedToken, { mime_type: "image/png", size_bytes: png.length, purpose: "administrative_support", client_upload_id: `${runId}:png` })
  });
  const uploadUrl = authorization.signed_upload_url.startsWith("http")
    ? authorization.signed_upload_url
    : `${supabaseUrl}${authorization.signed_upload_url.startsWith("/object/") ? "/storage/v1" : ""}${authorization.signed_upload_url}`;
  const uploaded = await fetch(uploadUrl, { method: "PUT", headers: { "content-type": "image/png", "x-upsert": "false" }, body: png });
  assert.ok(uploaded.ok, `Storage rechazo la evidencia: ${uploaded.status} ${(await uploaded.text()).slice(0, 200)}`);

  const confirmed = await json(`/api/v1/services/corrections/evidence-upload-authorizations/${authorization.authorization_id}/confirm`, { method: "POST", ...auth(authorizedToken) });
  assert.equal(confirmed.status, "validated");
  const attached = await json(`/api/v1/services/orders/${externalOrderId}/corrections/${correction.id}/evidence`, {
    method: "POST",
    ...auth(authorizedToken, { authorization_id: authorization.authorization_id, type: "administrative_support" })
  });
  assert.equal(attached.correction?.status, "APPLIED");
  assert.equal(attached.evidence?.metadata?.authorization_id, authorization.authorization_id);

  const persisted = await json(`/api/v1/services/orders/${created.id}`, auth(authorizedToken));
  const photos = Array.isArray(persisted.photos) ? persisted.photos : [];
  assert.ok(photos.some((photo) => photo.metadata?.authorization_id === authorization.authorization_id), "La evidencia no quedo persistida en la orden");

  console.log(JSON.stringify({
    ok: true,
    environment,
    model_company: "NYVORA",
    commit: health.commit,
    run_id: runId,
    order_id: created.id,
    external_order_id: externalOrderId,
    correction_id: correction.id,
    authorization_id: authorization.authorization_id,
    fixture: fixture ? { tenant: fixture.tenant, isolation_tenant: fixture.isolationTenant, reference: fixture.reference, users: fixture.visibleUsers } : null,
    checks: {
      authorized_role_full_flow: "passed",
      limited_role_blocked: "passed",
      other_tenant_blocked: "passed",
      binary_validation: "passed",
      evidence_persistence: "passed"
    }
  }, null, 2));
}

main().catch((error) => { console.error(error); process.exit(1); });
