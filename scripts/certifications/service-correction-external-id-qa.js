const assert = require("node:assert/strict");
const crypto = require("node:crypto");

const apiUrl = String(process.env.QA_API_URL || "https://apexos-api-qa-production.up.railway.app").replace(/\/$/, "");
const email = process.env.QA_LOGIN_EMAIL;
const password = process.env.QA_LOGIN_PASSWORD;
const expectedCommit = process.env.QA_EXPECTED_COMMIT;
if (!email || !password || !expectedCommit) throw new Error("QA_LOGIN_EMAIL, QA_LOGIN_PASSWORD y QA_EXPECTED_COMMIT son obligatorios");

let token = "";
const runId = `qa-external-correction-${Date.now()}`;
const externalOrderId = crypto.randomUUID();

async function request(path, options = {}, expectedStatus = 200) {
  const hasBody = options.body !== undefined && options.body !== null;
  const response = await fetch(`${apiUrl}${path}`, {
    ...options,
    headers: { ...(hasBody ? { "content-type": "application/json" } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}), ...(options.headers || {}) }
  });
  const text = await response.text();
  assert.equal(response.status, expectedStatus, `${options.method || "GET"} ${path}: ${response.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

async function main() {
  const health = await request("/health");
  assert.equal(health.commit, expectedCommit.slice(0, 12));
  const login = await request("/api/v1/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
  token = login.token || login.access_token;
  assert.ok(token);

  const references = await request("/api/v1/services/references?active=true");
  const technicians = await request("/api/v1/services/technicians");
  const types = await request("/api/v1/services/service-types");
  assert.ok(technicians.length, "QA requiere al menos un tecnico activo");
  let certificationReference = null;
  if (!references.length) {
    certificationReference = await request("/api/v1/services/references", {
      method: "POST",
      body: JSON.stringify({ code: runId, name: "Referencia temporal correccion UUID", category: "CERTIFICACION", active: true })
    });
    references.push(certificationReference);
  }

  const created = await request("/api/v1/services/orders", {
    method: "POST",
    body: JSON.stringify({
      reference_id: references[0].id,
      technician_id: technicians[0].id,
      service_type: types[0]?.code || "montaje",
      customer_name: "Certificacion correccion UUID",
      customer_document: String(Date.now()),
      customer_address: "Direccion QA controlada",
      customer_phone: "3000000000",
      scheduled_date: new Date().toISOString(),
      notes: `${runId}-before`,
      metadata: { external_order_id: externalOrderId, certification_run: runId },
      items: [{ reference_id: references[0].id, service_type: types[0]?.code || "montaje", quantity: 1 }]
    })
  });

  const correction = await request(`/api/v1/services/orders/${externalOrderId}/corrections`, {
    method: "POST",
    body: JSON.stringify({
      reason_code: "DATA_ENTRY_ERROR",
      description: "Certificacion de correccion para una orden vinculada por UUID externo",
      confirmed: true,
      expected_version: created.version,
      idempotency_key: runId,
      changes: [{ type: "FIELD_UPDATED", field: "notes", value: `${runId}-after` }]
    })
  });
  assert.equal(correction.order_id, created.id);

  const applied = await request(`/api/v1/services/orders/${externalOrderId}/corrections/${correction.id}/apply`, { method: "POST" });
  assert.equal(applied.status, "APPLIED");
  const reopened = await request(`/api/v1/services/orders/${created.id}`);
  assert.equal(reopened.notes, `${runId}-after`);
  assert.equal(reopened.administratively_modified, true);

  const authenticatedToken = token;
  token = "";
  await request(`/api/v1/services/orders/${externalOrderId}/corrections`, { method: "GET" }, 401);
  token = authenticatedToken;
  if (certificationReference) {
    await request(`/api/v1/services/references/${certificationReference.id}`, {
      method: "PUT",
      body: JSON.stringify({ code: certificationReference.code, name: certificationReference.name, category: "CERTIFICACION", active: false })
    });
  }

  console.log(JSON.stringify({
    ok: true,
    environment: "QA",
    commit: health.commit,
    run_id: runId,
    local_order_id: created.id,
    external_order_id: externalOrderId,
    correction_id: correction.id,
    correction_created: "passed",
    correction_applied: "passed",
    persistence: "passed",
    unauthorized_blocked: true
  }, null, 2));
}

main().catch((error) => { console.error(error); process.exit(1); });
