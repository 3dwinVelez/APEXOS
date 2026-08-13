const assert = require("node:assert/strict");

const apiUrl = String(process.env.QA_API_URL || "https://apexos-api-qa-production.up.railway.app").replace(/\/$/, "");
const email = process.env.QA_LOGIN_EMAIL;
const password = process.env.QA_LOGIN_PASSWORD;
const expectedCommit = process.env.QA_EXPECTED_COMMIT;
if (!email || !password || !expectedCommit) throw new Error("QA_LOGIN_EMAIL, QA_LOGIN_PASSWORD y QA_EXPECTED_COMMIT son obligatorios");

let token = "";
const runId = `qa-edit-${Date.now()}`;

async function request(path, options = {}) {
  const response = await fetch(`${apiUrl}${path}`, {
    ...options,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}), ...(options.headers || {}) }
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${options.method || "GET"} ${path}: ${response.status} ${text.slice(0, 240)}`);
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
  const stores = await request("/api/v1/services/service-stores");
  for (const [name, value] of Object.entries({ references, technicians, types, stores })) {
    assert.ok(Array.isArray(value), `${name} debe conservar el contrato de arreglo`);
  }
  assert.ok(technicians.length > 0, "QA requiere al menos un tecnico activo");
  let certificationReference = null;
  if (!references.length) {
    certificationReference = await request("/api/v1/services/references", {
      method: "POST",
      body: JSON.stringify({ code: runId, name: "Referencia temporal certificacion edicion", category: "CERTIFICACION", active: true })
    });
    references.push(certificationReference);
  }

  const created = await request("/api/v1/services/orders", {
    method: "POST",
    body: JSON.stringify({
      technician_id: technicians[0].id,
      reference_id: references[0].id,
      service_type: types[0]?.code || "montaje",
      customer_name: "Certificacion edicion APEXOS",
      customer_document: String(Date.now()),
      customer_address: "Direccion QA controlada",
      customer_phone: "3000000000",
      scheduled_date: new Date().toISOString(),
      notes: `${runId}-original`,
      items: [{ reference_id: references[0].id, service_type: types[0]?.code || "montaje", quantity: 1, observation: "Solicitud certificada" }]
    })
  });
  const before = await request(`/api/v1/services/orders/${created.id}`);
  const originalStatus = before.status;
  const originalItems = before.items.length;
  const updated = await request(`/api/v1/services/orders/${created.id}`, {
    method: "PUT",
    body: JSON.stringify({
      customer_name: before.customer_name,
      customer_phone: before.customer_phone,
      customer_address: before.customer_address,
      notes: `${runId}-updated`,
      reference_id: before.reference_id,
      service_type: before.service_type,
      technician_id: before.technician_id || before.technician_employee_id,
      scheduled_date: before.scheduled_date,
      items: before.items.map((item) => ({ reference_id: item.reference_id, service_type: item.service_type, quantity: 1, observation: item.observation || "" })),
      metadata: { ...(before.metadata || {}), certification_run: runId }
    })
  });
  const reopened = await request(`/api/v1/services/orders/${created.id}`);
  assert.equal(updated.notes, `${runId}-updated`);
  assert.equal(reopened.notes, `${runId}-updated`);
  assert.equal(reopened.status, originalStatus, "La edicion no debe cambiar el estado operativo");
  assert.equal(reopened.items.length, originalItems, "La edicion no debe perder solicitudes");
  if (certificationReference) {
    await request(`/api/v1/services/references/${certificationReference.id}`, {
      method: "PUT",
      body: JSON.stringify({ code: certificationReference.code, name: certificationReference.name, category: "CERTIFICACION", active: false })
    });
  }
  console.log(JSON.stringify({ ok: true, environment: "QA", commit: health.commit, run_id: runId, order_id: created.id, open: "passed", edit: "passed", reopen: "passed", status_preserved: true, items_preserved: true }, null, 2));
}

main().catch((error) => { console.error(error); process.exit(1); });
