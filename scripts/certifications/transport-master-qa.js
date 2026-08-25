const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) continue;
    args[item.slice(2)] = argv[index + 1] && !argv[index + 1].startsWith("--") ? argv[++index] : true;
  }
  return args;
}

function required(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`${name} es obligatorio.`);
  return value;
}

function assertQaUrl(name, value) {
  const parsed = new URL(value);
  if (String(process.env.TARGET_ENV || "").toLowerCase() !== "qa") throw new Error("TARGET_ENV debe ser qa.");
  if (parsed.protocol !== "https:") throw new Error(`${name} debe usar HTTPS.`);
  const explicitlyQaHost = /(^|[.-])qa([.-]|$)/i.test(parsed.hostname);
  if (/jzbwzmkidfthknsohhnr/i.test(value) || (/prod|production/i.test(value) && !explicitlyQaHost)) {
    throw new Error(`${name} parece productiva; certificacion cancelada.`);
  }
  return value.replace(/\/$/, "");
}

async function request(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let body = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text.slice(0, 300) }; }
  return { status: response.status, ok: response.ok, body };
}

async function login(supabaseUrl, anonKey, email, password) {
  return request(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
}

function authHeaders(token) {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

function dateFromToday(days) {
  const value = new Date();
  value.setUTCHours(12, 0, 0, 0);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function vehiclePayload(runId, overrides = {}) {
  return {
    plate: `T${runId.slice(-6)}`,
    type: "camioneta",
    brand: "APEX QA",
    line: "Certificable",
    ownership_type: "propio",
    legal_owner: "NYVORA QA",
    base_site: "QA Transporte",
    status: "activo",
    vin_chassis: `QA-${runId}-${randomUUID().slice(0, 8)}`,
    capacity_value: 1000,
    capacity_unit: "kg",
    soat_issued_at: dateFromToday(-30),
    soat_expires: dateFromToday(335),
    technical_review_issued_at: dateFromToday(-30),
    technical_review_expires: dateFromToday(335),
    notes: `Certificacion Transporte ${runId}`,
    ...overrides
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args["env-file"]) require("../load-env")(String(args["env-file"]));

  const apiUrl = assertQaUrl("QA_API_URL", required("QA_API_URL"));
  const supabaseUrl = assertQaUrl("QA_SUPABASE_URL", required("QA_SUPABASE_URL"));
  const anonKey = required("QA_SUPABASE_ANON_KEY");
  const expectedCommit = required("QA_EXPECTED_COMMIT");
  const runId = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const outputPath = path.resolve(String(args.output || `transport-master-qa-${runId}.json`));
  const evidence = {
    certification: "transport-master-qa",
    environment: "QA",
    expected_commit: expectedCommit,
    checks: [],
    cleanup: "not_started",
    certified_at: new Date().toISOString()
  };
  let adminToken = "";
  let createdId = "";
  let primaryPayload = vehiclePayload(runId);

  const check = (name, ok, detail = {}) => {
    evidence.checks.push({ name, status: ok ? "passed" : "failed", detail });
    if (!ok) throw new Error(`${name} fallo.`);
  };

  try {
    const health = await request(`${apiUrl}/health`);
    check("deployed_commit", health.ok && String(health.body.commit || "").startsWith(expectedCommit), { status: health.status, commit: health.body.commit || "missing" });

    const adminLogin = await login(supabaseUrl, anonKey, required("QA_TRANSPORT_ADMIN_EMAIL"), required("QA_TRANSPORT_ADMIN_PASSWORD"));
    check("admin_login", adminLogin.ok && Boolean(adminLogin.body.access_token), { status: adminLogin.status });
    adminToken = adminLogin.body.access_token;
    const adminHeaders = authHeaders(adminToken);

    const readonlyLogin = await login(supabaseUrl, anonKey, required("QA_TRANSPORT_READONLY_EMAIL"), required("QA_TRANSPORT_READONLY_PASSWORD"));
    check("readonly_login", readonlyLogin.ok && Boolean(readonlyLogin.body.access_token), { status: readonlyLogin.status });
    const readonlyHeaders = authHeaders(readonlyLogin.body.access_token);

    const otherTenantLogin = await login(supabaseUrl, anonKey, required("QA_OTHER_TENANT_EMAIL"), required("QA_OTHER_TENANT_PASSWORD"));
    check("other_tenant_login", otherTenantLogin.ok && Boolean(otherTenantLogin.body.access_token), { status: otherTenantLogin.status });
    const otherTenantHeaders = authHeaders(otherTenantLogin.body.access_token);

    const unauthenticated = await request(`${apiUrl}/api/v1/transport/vehicles`);
    check("authentication_required", unauthenticated.status === 401, { status: unauthenticated.status });

    const readonlyList = await request(`${apiUrl}/api/v1/transport/vehicles`, { headers: readonlyHeaders });
    check("readonly_can_list", readonlyList.ok && Array.isArray(readonlyList.body), { status: readonlyList.status });

    const created = await request(`${apiUrl}/api/v1/transport/vehicles`, { method: "POST", headers: adminHeaders, body: JSON.stringify(primaryPayload) });
    check("vehicle_created_and_plate_normalized", created.ok && Boolean(created.body.id) && created.body.plate === primaryPayload.plate.toUpperCase().replace(/\s+/g, ""), { status: created.status, id: created.body.id || null, plate: created.body.plate || null });
    createdId = String(created.body.id);

    const readonlyWrite = await request(`${apiUrl}/api/v1/transport/vehicles`, { method: "POST", headers: readonlyHeaders, body: JSON.stringify(vehiclePayload(`${runId}R`, { plate: `R${runId.slice(-6)}` })) });
    check("readonly_write_denied", readonlyWrite.status === 403, { status: readonlyWrite.status });

    const missingRequired = await request(`${apiUrl}/api/v1/transport/vehicles`, { method: "POST", headers: adminHeaders, body: JSON.stringify({ plate: `M${runId.slice(-6)}` }) });
    check("required_fields_rejected", [400, 422].includes(missingRequired.status), { status: missingRequired.status });

    const invalidDates = await request(`${apiUrl}/api/v1/transport/vehicles`, {
      method: "POST", headers: adminHeaders,
      body: JSON.stringify(vehiclePayload(`${runId}D`, { plate: `D${runId.slice(-6)}`, soat_issued_at: dateFromToday(30), soat_expires: dateFromToday(1) }))
    });
    check("inconsistent_dates_rejected", invalidDates.status === 400, { status: invalidDates.status });

    const duplicateVin = await request(`${apiUrl}/api/v1/transport/vehicles`, {
      method: "POST", headers: adminHeaders,
      body: JSON.stringify(vehiclePayload(`${runId}V`, { plate: `V${runId.slice(-6)}`, vin_chassis: primaryPayload.vin_chassis }))
    });
    check("duplicate_vin_rejected", duplicateVin.status === 409, { status: duplicateVin.status });

    primaryPayload = { ...primaryPayload, base_site: "QA Transporte Actualizada", reason: "Certificacion de edicion" };
    const updated = await request(`${apiUrl}/api/v1/transport/vehicles/${createdId}`, { method: "PUT", headers: adminHeaders, body: JSON.stringify(primaryPayload) });
    check("vehicle_updated", updated.ok && updated.body.base_site === primaryPayload.base_site, { status: updated.status });

    const pngBase64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
    const documentPayload = { document_type: "soat", file_name: `soat-${runId}.png`, base64_data: pngBase64, mime_type: "image/png", file_size: 68, issued_at: dateFromToday(-30), expires_at: dateFromToday(335), observations: "Evidencia QA certificable" };
    const documentOne = await request(`${apiUrl}/api/v1/transport/vehicles/${createdId}/documents`, { method: "POST", headers: adminHeaders, body: JSON.stringify(documentPayload) });
    check("document_uploaded", documentOne.ok && documentOne.body.version === 1, { status: documentOne.status, version: documentOne.body.version || null });
    const documentTwo = await request(`${apiUrl}/api/v1/transport/vehicles/${createdId}/documents`, { method: "POST", headers: adminHeaders, body: JSON.stringify({ ...documentPayload, file_name: `soat-${runId}-v2.png` }) });
    check("document_versioned", documentTwo.ok && documentTwo.body.version === 2, { status: documentTwo.status, version: documentTwo.body.version || null });

    const detail = await request(`${apiUrl}/api/v1/transport/vehicles/${createdId}`, { headers: adminHeaders });
    const actions = Array.isArray(detail.body.audit_logs) ? detail.body.audit_logs.map((item) => item.action) : [];
    check("detail_documents_and_audit", detail.ok && detail.body.documents?.length >= 2 && actions.includes("created") && actions.includes("updated") && actions.includes("document_uploaded"), { status: detail.status, documents: detail.body.documents?.length || 0, actions });

    const planning = await request(`${apiUrl}/api/v1/transport/vehicles/planning/${encodeURIComponent(primaryPayload.plate)}`, { headers: adminHeaders });
    check("planning_contract", planning.ok && planning.body.plate === primaryPayload.plate && typeof planning.body.can_start_route === "boolean" && planning.body.base_site === primaryPayload.base_site, { status: planning.status, can_start_route: planning.body.can_start_route });

    const metrics = await request(`${apiUrl}/api/v1/transport/vehicles/metrics/dashboard`, { headers: adminHeaders });
    check("dashboard_metrics_include_vehicle", metrics.ok && Array.isArray(metrics.body.vehicles) && metrics.body.vehicles.some((item) => String(item.id) === createdId), { status: metrics.status, total: metrics.body.total || 0 });

    const isolated = await request(`${apiUrl}/api/v1/transport/vehicles/${createdId}`, { headers: otherTenantHeaders });
    check("cross_tenant_detail_denied", [403, 404].includes(isolated.status), { status: isolated.status });

    primaryPayload = { ...primaryPayload, status: "retirado", reason: "Cierre controlado de certificacion" };
    const retired = await request(`${apiUrl}/api/v1/transport/vehicles/${createdId}`, { method: "PUT", headers: adminHeaders, body: JSON.stringify(primaryPayload) });
    check("vehicle_soft_retired", retired.ok && retired.body.master_status === "retirado", { status: retired.status, master_status: retired.body.master_status || null });
    evidence.cleanup = "temporary_vehicle_soft_retired";

    const defaultList = await request(`${apiUrl}/api/v1/transport/vehicles`, { headers: adminHeaders });
    check("retired_excluded_by_default", defaultList.ok && !defaultList.body.some((item) => String(item.id) === createdId), { status: defaultList.status });
    const retiredList = await request(`${apiUrl}/api/v1/transport/vehicles?include_retired=true`, { headers: adminHeaders });
    check("retired_available_for_filter", retiredList.ok && retiredList.body.some((item) => String(item.id) === createdId && item.master_status === "retirado"), { status: retiredList.status });
  } finally {
    if (adminToken && createdId && evidence.cleanup !== "temporary_vehicle_soft_retired") {
      const cleanup = await request(`${apiUrl}/api/v1/transport/vehicles/${createdId}`, {
        method: "PUT",
        headers: authHeaders(adminToken),
        body: JSON.stringify({ ...primaryPayload, status: "retirado", reason: "Limpieza automatica de certificacion" })
      });
      evidence.cleanup = cleanup.ok ? "temporary_vehicle_soft_retired_in_finally" : `cleanup_failed_http_${cleanup.status}`;
    }
    evidence.status = evidence.checks.every((item) => item.status === "passed") && !String(evidence.cleanup).startsWith("cleanup_failed") ? "passed" : "failed";
    evidence.test_record = { vehicle_id: createdId || null, plate: primaryPayload.plate, credentials_recorded: false };
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  }

  if (evidence.status !== "passed") throw new Error(`Certificacion QA incompleta. Evidencia: ${outputPath}`);
  console.log(`CERTIFICACION TRANSPORTE QA COMPLETA: ${outputPath}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`CERTIFICACION TRANSPORTE QA BLOQUEADA: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { assertQaUrl, dateFromToday, vehiclePayload };
