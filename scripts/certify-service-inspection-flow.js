const API_URL = process.env.API_URL || "http://127.0.0.1:3000";
const EMAIL = process.env.APEX_CERT_EMAIL || "demo@apex.local";
const PASSWORD = process.env.APEX_CERT_PASSWORD || "test1234";

const tinyPng =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";

async function request(path, options = {}, token) {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`${options.method || "GET"} ${path} failed ${response.status}: ${text}`);
  }
  return body;
}

async function login() {
  const result = await request("/api/v1/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: EMAIL, password: PASSWORD })
  });
  return result.token || result.access_token;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

async function setup(token) {
  const [references, technicians, serviceTypes] = await Promise.all([
    request("/api/v1/services/references?active=true&limit=20", {}, token),
    request("/api/v1/services/technicians", {}, token),
    request("/api/v1/services/service-types", {}, token)
  ]);
  const reference = references[0];
  const technician = technicians[0];
  const serviceType = (serviceTypes.find((item) => item.active !== false) || serviceTypes[0] || { code: "montaje" }).code;
  if (!reference?.id) throw new Error("No hay referencias activas para certificar el flujo.");
  if (!technician?.id) throw new Error("No hay tecnicos activos para certificar el flujo.");
  if (!reference.parts?.length) throw new Error(`La referencia ${reference.code} no tiene piezas para certificar inspeccion.`);
  return { reference, technician, serviceType };
}

async function createOrder(token, setupData, suffix) {
  return request("/api/v1/services/orders", {
    method: "POST",
    body: JSON.stringify({
      reference_id: Number(setupData.reference.id),
      technician_id: Number(setupData.technician.id),
      service_type: setupData.serviceType,
      customer_name: `Cliente Certificacion ${suffix}`,
      customer_document: `900${Date.now().toString().slice(-7)}`,
      customer_address: `Direccion QA ${suffix}`,
      customer_phone: "3005550000",
      invoice_number: `CERT-${suffix}-${Date.now()}`,
      scheduled_date: today(),
      notes: "Orden generada por certificacion automatica del flujo de inspeccion."
    })
  }, token);
}

async function uploadPhoto(token, orderId, type, metadata = {}) {
  return request(`/api/v1/services/orders/${orderId}/photos`, {
    method: "POST",
    body: JSON.stringify({
      type,
      base64_data: tinyPng,
      size_bytes: 95,
      mime_type: "image/png",
      file_name: `${type}-${orderId}.png`,
      metadata
    })
  }, token);
}

async function startWithoutGps(token, orderId) {
  return request(`/api/v1/services/orders/${orderId}/start`, {
    method: "PATCH",
    body: JSON.stringify({
      metadata: {
        start_without_gps: true,
        start_method: "certification_manual_confirmation"
      }
    })
  }, token);
}

async function certifyReportSupport(token, orderId, expectedDecision) {
  const report = await request(`/api/v1/services/orders/${orderId}/report`, {}, token);
  const inspection = report.order?.metadata?.inspection;
  const photos = report.photos || report.order?.photos || [];
  const hasPieceEvidence = photos.some((photo) => photo.type === "pieza_averiada" && photo.metadata?.part_id);
  if (inspection?.decision !== expectedDecision) {
    throw new Error(`El reporte no conserva la decision ${expectedDecision} para la orden ${orderId}.`);
  }
  if (!hasPieceEvidence) {
    throw new Error(`El reporte no expone evidencia fotografica de pieza para la orden ${orderId}.`);
  }
  return {
    inspection_decision: inspection.decision,
    report_piece_evidence: true
  };
}

async function certifyArmableWithPiece(token, setupData) {
  const order = await createOrder(token, setupData, "ARMABLE");
  await startWithoutGps(token, order.id);
  const part = setupData.reference.parts[0];
  await uploadPhoto(token, order.id, "pieza_averiada", {
    part_id: part.id,
    part_name: part.name,
    status: "averiada",
    comment: "Defecto menor certificado; se corrige y permite armado.",
    action: "revision"
  });
  await request(`/api/v1/services/orders/${order.id}/inspection`, {
    method: "PATCH",
    body: JSON.stringify({
      decision: "armable",
      items: setupData.reference.parts.map((item, index) => ({
        part_id: Number(item.id),
        name: item.name,
        quantity: Number(item.quantity || 1),
        unit: item.unit || "und",
        status: index === 0 ? "averiada" : "ok",
        comment: index === 0 ? "Defecto menor certificado; se corrige y permite armado." : "",
        action: index === 0 ? "revision" : "ninguna",
        supplier_name: ""
      })),
      metadata: { source: "certification", inspection_method: "three_decision_buttons" }
    })
  }, token);
  const execution = await request(`/api/v1/services/orders/${order.id}/execution`, { method: "PATCH", body: JSON.stringify({}) }, token);
  const report = await certifyReportSupport(token, order.id, "armable");
  return {
    order: execution.number,
    status: execution.status,
    decision: execution.metadata?.inspection?.decision,
    piece_issues: execution.metadata?.inspection?.problem_count,
    start_without_gps: execution.metadata?.start_without_gps === true,
    ...report
  };
}

async function certifyNotArmable(token, setupData) {
  const order = await createOrder(token, setupData, "NOARMABLE");
  await startWithoutGps(token, order.id);
  const part = setupData.reference.parts[0];
  await uploadPhoto(token, order.id, "pieza_averiada", {
    part_id: part.id,
    part_name: part.name,
    status: "faltante",
    comment: "Pieza critica faltante; no permite armado.",
    action: "cambio"
  });
  await request(`/api/v1/services/orders/${order.id}/inspection`, {
    method: "PATCH",
    body: JSON.stringify({
      decision: "no_armable",
      items: setupData.reference.parts.map((item, index) => ({
        part_id: Number(item.id),
        name: item.name,
        quantity: Number(item.quantity || 1),
        unit: item.unit || "und",
        status: index === 0 ? "faltante" : "ok",
        comment: index === 0 ? "Pieza critica faltante; no permite armado." : "",
        action: index === 0 ? "cambio" : "ninguna",
        supplier_name: "Proveedor QA"
      })),
      metadata: { source: "certification", inspection_method: "three_decision_buttons" }
    })
  }, token);
  await uploadPhoto(token, order.id, "no_ejecutada", { reason: "No armable por pieza critica faltante." });
  await uploadPhoto(token, order.id, "firma_cliente", { reason: "No armable por pieza critica faltante.", evidence_kind: "customer_signature" });
  const closed = await request(`/api/v1/services/orders/${order.id}/close-not-executed`, {
    method: "PATCH",
    body: JSON.stringify({
      no_execution_reason: "No armable por pieza critica faltante.",
      metadata: { closure_source: "certification_no_armable" }
    })
  }, token);
  const report = await certifyReportSupport(token, order.id, "no_armable");
  return {
    order: closed.number,
    status: closed.status,
    decision: closed.metadata?.inspection?.decision,
    reason: closed.no_execution_reason,
    start_without_gps: closed.metadata?.start_without_gps === true,
    ...report
  };
}

async function main() {
  const token = await login();
  const setupData = await setup(token);
  const armable = await certifyArmableWithPiece(token, setupData);
  const notArmable = await certifyNotArmable(token, setupData);
  console.log(JSON.stringify({ status: "ok", armable, not_armable: notArmable }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
