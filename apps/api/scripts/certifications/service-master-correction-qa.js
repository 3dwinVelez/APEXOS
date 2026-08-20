const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { bootstrapNyvoraFixture } = require("./fixtures/nyvora-service-correction");

// This certificate runs against the deployed API commit. It creates a clearly
// tagged QA order and leaves it cancelled so every mutation remains auditable.

const apiUrl = String(process.env.QA_API_URL || "https://apexos-api-qa-production.up.railway.app").replace(/\/$/, "");
const supabaseUrl = String(process.env.QA_SUPABASE_URL || "").replace(/\/$/, "");
const expectedCommit = String(process.env.QA_EXPECTED_COMMIT || "");
const environment = String(process.env.CERTIFICATION_ENVIRONMENT || "QA").toUpperCase();
let credentials = {
  authorized: [process.env.QA_LOGIN_EMAIL, process.env.QA_LOGIN_PASSWORD],
  limited: [process.env.QA_LIMITED_LOGIN_EMAIL, process.env.QA_LIMITED_LOGIN_PASSWORD],
  otherTenant: [process.env.QA_OTHER_TENANT_LOGIN_EMAIL, process.env.QA_OTHER_TENANT_LOGIN_PASSWORD]
};

if (!expectedCommit || !supabaseUrl) throw new Error("QA_EXPECTED_COMMIT y QA_SUPABASE_URL son obligatorios");

const runId = `service-master-correction-${Date.now()}`;
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

async function createAndApply(token, orderId, version, changes, description, idempotencySuffix) {
  const correction = await json(`/api/v1/services/orders/${orderId}/corrections`, {
    method: "POST",
    ...auth(token, {
      reason_code: "DATA_ENTRY_ERROR",
      description,
      confirmed: true,
      expected_version: version,
      idempotency_key: `${runId}:${idempotencySuffix}`,
      changes
    })
  });
  const applied = await json(`/api/v1/services/orders/${orderId}/corrections/${correction.id}/apply`, {
    method: "POST",
    ...auth(token)
  });
  assert.equal(applied.status, "APPLIED");
  return applied;
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
  assert.equal(tenantId(limitedSession), tenantId(session), "El rol limitado no pertenece al tenant certificado");
  assert.notEqual(tenantId(otherTenantSession), tenantId(session), "El control de aislamiento debe usar otro tenant");

  const references = await json("/api/v1/services/references?active=true", auth(authorizedToken));
  const technicians = await json("/api/v1/services/technicians", auth(authorizedToken));
  const types = await json("/api/v1/services/service-types", auth(authorizedToken));
  assert.ok(references.length && technicians.length, "La empresa de certificacion requiere referencia y tecnico activos");

  let order = await json("/api/v1/services/orders", {
    method: "POST",
    ...auth(authorizedToken, {
      reference_id: references[0].id,
      technician_id: technicians[0].id,
      service_type: types[0]?.code || "montaje",
      customer_name: "Certificacion correccion maestra",
      customer_document: String(Date.now()),
      customer_address: "Direccion QA controlada",
      customer_phone: "3000000000",
      scheduled_date: new Date().toISOString(),
      notes: `${runId}:original`,
      metadata: { external_order_id: externalOrderId, certification_run: runId },
      items: [{ reference_id: references[0].id, service_type: types[0]?.code || "montaje", quantity: 1 }]
    })
  });

  await json(`/api/v1/services/orders/${externalOrderId}/corrections`, {
    method: "POST",
    ...auth(limitedToken, {
      reason_code: "DATA_ENTRY_ERROR",
      description: "Intento negativo sin permiso de correccion maestra",
      confirmed: true,
      expected_version: order.version,
      changes: [{ type: "FIELD_UPDATED", field: "notes", value: `${runId}:blocked` }]
    })
  }, 403);
  const crossTenant = await raw(`/api/v1/services/orders/${externalOrderId}/corrections`, { method: "GET", ...auth(otherTenantToken) });
  assert.ok([403, 404].includes(crossTenant.status), `El acceso cruzado respondio ${crossTenant.status}`);

  const noOp = await raw(`/api/v1/services/orders/${externalOrderId}/corrections`, {
    method: "POST",
    ...auth(authorizedToken, {
      reason_code: "DATA_ENTRY_ERROR",
      description: "Control negativo de cambio sin diferencia real",
      confirmed: true,
      expected_version: order.version,
      changes: [{ type: "FIELD_UPDATED", field: "notes", value: order.notes }]
    })
  });
  const noOpBody = await noOp.json();
  assert.equal(noOp.status, 409, `El cambio sin efecto respondio ${noOp.status}`);
  assert.equal(noOpBody.code, "SERVICE_CORRECTION_NO_CHANGES");

  const editedNotes = `${runId}:edited-and-persisted`;
  await createAndApply(authorizedToken, externalOrderId, order.version, [{ type: "FIELD_UPDATED", field: "notes", value: editedNotes }], "Se corrige el dato y se verifica persistencia tras recarga", "field");
  order = await json(`/api/v1/services/orders/${order.id}`, auth(authorizedToken));
  assert.equal(order.notes, editedNotes);

  const observation = `${runId}: administrative observation persisted`;
  await createAndApply(authorizedToken, externalOrderId, order.version, [{ type: "OBSERVATION_ADDED", value: observation }], "Se anexa una novedad sin reemplazar las observaciones existentes", "observation");
  order = await json(`/api/v1/services/orders/${order.id}`, auth(authorizedToken));
  assert.ok((order.incidents || []).some((incident) => incident.description === observation), "La novedad no persistio tras recargar la orden");

  const partId = -Date.now();
  const piece = { part_id: partId, name: "Pieza controlada QA", quantity: 1, unit: "und", status: "faltante", comment: "Faltante detectado por certificacion", action: "solicitar_repuesto" };
  await createAndApply(authorizedToken, externalOrderId, order.version, [{ type: "PIECE_ISSUE_ADDED", value: piece }], "Se registra pieza faltante y se comprueba inspeccion y novedad", "piece");
  order = await json(`/api/v1/services/orders/${order.id}`, auth(authorizedToken));
  assert.ok((order.metadata?.inspection?.items || []).some((item) => String(item.part_id) === String(partId) && item.status === "faltante"), "La pieza no persistio en la inspeccion");
  assert.ok((order.incidents || []).some((incident) => String(incident.description || "").includes(piece.name)), "La pieza no genero la novedad esperada");

  const nextStatus = order.status === "revision" ? "pendiente" : "revision";
  await createAndApply(authorizedToken, externalOrderId, order.version, [{ type: "STATUS_CHANGED", value: nextStatus }], "Se cambia el estado y se comprueba la version actualizada", "status");
  order = await json(`/api/v1/services/orders/${order.id}`, auth(authorizedToken));
  assert.equal(order.status, nextStatus);

  const evidenceCorrection = await json(`/api/v1/services/orders/${externalOrderId}/corrections`, {
    method: "POST",
    ...auth(authorizedToken, {
      reason_code: "MISSING_EVIDENCE",
      description: "Se anexa soporte visual y se comprueba su persistencia",
      confirmed: true,
      expected_version: order.version,
      idempotency_key: `${runId}:evidence-add`,
      changes: [{ type: "EVIDENCE_ADDED", value: "administrative_support" }]
    })
  });
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
  const attached = await json(`/api/v1/services/orders/${externalOrderId}/corrections/${evidenceCorrection.id}/evidence`, {
    method: "POST",
    ...auth(authorizedToken, { authorization_id: authorization.authorization_id, type: "administrative_support" })
  });
  assert.equal(attached.correction?.status, "APPLIED");
  const evidenceId = attached.evidence?.id;
  assert.ok(evidenceId, "El alta no devolvio el identificador de evidencia");
  order = await json(`/api/v1/services/orders/${order.id}`, auth(authorizedToken));
  assert.ok((order.photos || []).some((photo) => photo.id === evidenceId && photo.active !== false), "La evidencia no persistio activa");

  await createAndApply(authorizedToken, externalOrderId, order.version, [{ type: "EVIDENCE_REMOVED", evidence_id: evidenceId }], "Se retira el soporte de la vista conservando trazabilidad", "evidence-remove");
  order = await json(`/api/v1/services/orders/${order.id}`, auth(authorizedToken));
  assert.ok(!(order.photos || []).some((photo) => photo.id === evidenceId && photo.active !== false), "La evidencia retirada sigue visible como activa");

  if (order.status !== "cancelada") {
    await createAndApply(authorizedToken, externalOrderId, order.version, [{ type: "STATUS_CHANGED", value: "cancelada" }], "Cierre controlado de la orden generada por certificacion", "cleanup-status");
    order = await json(`/api/v1/services/orders/${order.id}`, auth(authorizedToken));
  }
  assert.equal(order.status, "cancelada");

  const history = await json(`/api/v1/services/orders/${externalOrderId}/corrections`, auth(authorizedToken));
  const appliedHistory = history.filter((entry) => entry.status === "APPLIED");
  assert.ok(appliedHistory.length >= 6, "El historial no contiene todas las correcciones aplicadas");
  assert.ok(appliedHistory.some((entry) => (entry.changes || []).some((change) => change.old_value !== undefined && change.new_value !== undefined)), "El historial no conserva comparativos antes/despues");

  console.log(JSON.stringify({
    ok: true,
    environment,
    commit: health.commit,
    run_id: runId,
    order_id: order.id,
    external_order_id: externalOrderId,
    final_version: order.version,
    final_status: order.status,
    applied_corrections: appliedHistory.length,
    checks: {
      deployed_commit: "passed",
      authorized_field_edit_and_reload: "passed",
      observation_and_reload: "passed",
      piece_issue_and_reload: "passed",
      status_and_reload: "passed",
      evidence_add_validate_reload: "passed",
      evidence_soft_remove_reload: "passed",
      no_op_rejected: "passed",
      limited_role_blocked: "passed",
      other_tenant_blocked: "passed",
      audit_history_before_after: "passed"
    }
  }, null, 2));
}

main().catch((error) => { console.error(error); process.exit(1); });
