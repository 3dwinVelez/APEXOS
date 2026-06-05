#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const startedAt = new Date();
const batch = `QA-HR-SVC-${startedAt.toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}`;
const reportDir = path.join(ROOT, "reports", "qa");
const reportPath = path.join(reportDir, `${batch}.md`);
const reportJsonPath = path.join(reportDir, `${batch}.json`);
const tinyPng = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || process.env[match[1]] !== undefined) continue;
    process.env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, "");
  }
}

loadEnv(path.join(ROOT, ".env"));
loadEnv(path.join(ROOT, "apps", "api", ".env"));
loadEnv(path.join(ROOT, "apps", "web", ".env.local"));

const config = {
  apiUrl: (process.env.QA_API_URL || process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:3021").replace(/\/$/, ""),
  supabaseUrl: (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "").replace(/\/$/, ""),
  supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
};

const report = {
  batch,
  started_at: startedAt.toISOString(),
  apiUrl: config.apiUrl,
  supabaseUrl: config.supabaseUrl,
  summary: { passed: 0, failed: 0, warning: 0 },
  results: [],
  created: []
};

function add(area, name, status, detail = {}) {
  report.summary[status] += 1;
  report.results.push({ area, name, status, detail });
  const prefix = status === "passed" ? "OK" : status === "failed" ? "FAIL" : "WARN";
  console.log(`[${prefix}] ${area} - ${name}${detail.message ? `: ${detail.message}` : ""}`);
}

function authHeaders(token) {
  return { authorization: `Bearer ${token}` };
}

async function requestJson(url, options = {}, expected = [200, 201]) {
  const headers = { ...(options.headers || {}) };
  if (options.body !== undefined && !headers["content-type"]) headers["content-type"] = "application/json";
  const response = await fetch(url, { ...options, headers });
  const contentType = response.headers.get("content-type") || "";
  const body = contentType.includes("json") ? await response.json().catch(() => null) : await response.text().catch(() => "");
  if (!expected.includes(response.status)) {
    const error = new Error(`HTTP ${response.status}`);
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return { status: response.status, body };
}

async function apiStep(area, name, method, endpoint, token, body, expected = [200, 201]) {
  try {
    const result = await requestJson(`${config.apiUrl}/api/v1${endpoint}`, {
      method,
      headers: authHeaders(token),
      body: body === undefined ? undefined : JSON.stringify(body)
    }, expected);
    add(area, name, "passed", { endpoint, status: result.status });
    return result.body;
  } catch (error) {
    add(area, name, "failed", { endpoint, status: error.status, body: error.body, message: error.message });
    return null;
  }
}

async function registerScenario() {
  const email = `${batch.toLowerCase()}@apexos.local`;
  const password = `ApexQA-${batch}!`;
  const result = await requestJson(`${config.apiUrl}/api/v1/auth/register`, {
    method: "POST",
    body: JSON.stringify({
      company_name: `QA HR Servicios ${batch}`,
      industry: "qa-stress",
      email,
      password,
      name: `QA Stress ${batch}`,
      country: "CO",
      timezone: "America/Bogota",
      currency: "COP",
      plan: "crown"
    })
  });
  report.created.push({ type: "tenant", id: result.body.tenant?.id, name: result.body.tenant?.name });
  report.created.push({ type: "user", id: result.body.user?.id, email });
  add("setup", "Tenant tecnico API", "passed", { email, tenant_id: result.body.tenant?.id });
  return result.body.token;
}

function scenarioTime(index, offsetMinutes = 0) {
  const date = new Date(startedAt.getTime() + index * 60000 + offsetMinutes * 60000);
  return date.toISOString();
}

async function validateSupabaseMapContract() {
  if (!config.supabaseUrl || !config.supabaseKey) {
    add("supabase-map", "Contrato REST time_punches.vehicle_plate", "warning", { message: "Sin credenciales Supabase para validar REST" });
    return;
  }
  try {
    const url = `${config.supabaseUrl}/rest/v1/time_punches?select=id,employee_id,user_name,punch_type,punched_at,route_id,vehicle_id,vehicle_plate,latitude,longitude,accuracy_meters,extra_minutes,extra_reason,extra_detail,extra_evidence,metadata&order=punched_at.desc&limit=5`;
    const res = await requestJson(url, {
      method: "GET",
      headers: { apikey: config.supabaseKey, authorization: `Bearer ${config.supabaseKey}` }
    }, [200, 206]);
    add("supabase-map", "Contrato REST time_punches.vehicle_plate", "passed", { rows: Array.isArray(res.body) ? res.body.length : 0 });
  } catch (error) {
    add("supabase-map", "Contrato REST time_punches.vehicle_plate", "failed", { status: error.status, body: error.body, message: error.message });
  }
}

async function runHrScenarios(token) {
  const activityType = await apiStep("talento-humano", "Crear tipo actividad base", "POST", "/hr/activity-types", token, {
    name: `Actividad ${batch}`,
    description: "Validacion lineal QA",
    active: true,
    sort_order: 1,
    metadata: { batch }
  });

  for (let i = 1; i <= 10; i++) {
    const plate = `HR${String(i).padStart(3, "0")}`;
    const userName = `Operativo ${i} ${batch}`;
    const employee = await apiStep("talento-humano", `Escenario ${i}: crear empleado`, "POST", "/hr/employees", token, {
      name: userName,
      code: `EMP-${batch.slice(-6)}-${i}`,
      document: `QA${batch.slice(-6)}${i}`,
      user_type: i % 3 === 0 ? "conductor" : "operativo",
      position: i % 3 === 0 ? "Conductor QA" : "Tecnico QA",
      department: i % 2 === 0 ? "Servicios" : "Operaciones",
      salary_base: 1500000 + i * 10000,
      company: "QA",
      labor_status: "active",
      legacy: { batch, scenario: i }
    });

    await apiStep("talento-humano", `Escenario ${i}: crear vehiculo`, "POST", "/transport/vehicles", token, {
      plate,
      type: i % 2 === 0 ? "truck" : "van",
      brand: i % 2 === 0 ? "Chevrolet" : "Renault",
      ownership_type: "own",
      base_site: "QA",
      status: "active",
      mileage: 1000 + i,
      authorized_driver_id: employee?.id,
      authorized_driver_name: userName,
      metadata: { batch, scenario: i }
    });

    await apiStep("talento-humano", `Escenario ${i}: GPS`, "POST", "/hr/gps/ping", token, {
      employee_id: employee?.id,
      user_name: userName,
      vehicle_plate: plate,
      latitude: 6.24 + i / 1000,
      longitude: -75.57 - i / 1000,
      accuracy_meters: 5 + i,
      source: i % 2 === 0 ? "mobile" : "work_activity",
      captured_at: scenarioTime(i),
      metadata: { batch, scenario: i }
    });

    await apiStep("talento-humano", `Escenario ${i}: entrada`, "POST", "/hr/time-punches", token, {
      employee_id: employee?.id,
      user_name: userName,
      type: "entrada",
      punched_at: scenarioTime(i, 1),
      latitude: 6.24 + i / 1000,
      longitude: -75.57 - i / 1000,
      accuracy_meters: 6,
      vehicle_plate: plate,
      metadata: { batch, scenario: i, stress: true }
    });

    if (i % 2 === 0) {
      await apiStep("talento-humano", `Escenario ${i}: inicio almuerzo`, "POST", "/hr/time-punches", token, {
        employee_id: employee?.id,
        user_name: userName,
        type: "inicio_almuerzo",
        punched_at: scenarioTime(i, 180),
        latitude: 6.245,
        longitude: -75.575,
        vehicle_plate: plate,
        metadata: { batch, scenario: i }
      });
      await apiStep("talento-humano", `Escenario ${i}: fin almuerzo`, "POST", "/hr/time-punches", token, {
        employee_id: employee?.id,
        user_name: userName,
        type: "fin_almuerzo",
        punched_at: scenarioTime(i, 220),
        latitude: 6.245,
        longitude: -75.575,
        vehicle_plate: plate,
        metadata: { batch, scenario: i }
      });
    }

    await apiStep("talento-humano", `Escenario ${i}: actividad con foto`, "POST", "/hr/work-activities", token, {
      employee_id: employee?.id,
      activity_type_id: activityType?.id,
      occurred_at: scenarioTime(i, 30),
      latitude: 6.24 + i / 1000,
      longitude: -75.57 - i / 1000,
      accuracy_meters: 8,
      approximate_address: `Direccion QA ${i}`,
      observation: `Actividad QA escenario ${i}`,
      vehicle_plate: plate,
      metadata: { batch, scenario: i },
      photo: { base64: tinyPng, name: `actividad-${i}.png`, type: "image/png", size: 68 }
    });

    if (i % 4 === 0) {
      await apiStep("talento-humano", `Escenario ${i}: salida con extra`, "POST", "/hr/time-punches", token, {
        employee_id: employee?.id,
        user_name: userName,
        type: "salida",
        punched_at: scenarioTime(i, 600),
        latitude: 6.25,
        longitude: -75.58,
        vehicle_plate: plate,
        extra_reason: "Operacion extendida QA",
        extra_detail: "Carga de estres validada",
        extra_evidence: { base64: tinyPng, name: `extra-${i}.png`, type: "image/png", size: 68 },
        metadata: { batch, scenario: i }
      });
    }
  }

  await apiStep("talento-humano", "Consultar empleados", "GET", "/hr/employees", token);
  await apiStep("talento-humano", "Consultar asistencia", "GET", "/hr/attendance", token);
  await apiStep("talento-humano", "Consultar mapa operaciones", "GET", "/hr/operations-map", token);
}

async function addServicePhoto(token, orderId, type, i) {
  return apiStep("servicios", `Escenario ${i}: foto ${type}`, "POST", `/services/orders/${orderId}/photos`, token, {
    type,
    base64_data: tinyPng,
    file_name: `${type}-${i}.png`,
    mime_type: "image/png",
    size_bytes: 68,
    metadata: { batch, scenario: i }
  });
}

async function runServiceScenarios(token) {
  for (let i = 1; i <= 10; i++) {
    const reference = await apiStep("servicios", `Escenario ${i}: crear referencia`, "POST", "/services/references", token, {
      code: `SVC-${batch.slice(-6)}-${i}`,
      name: `Referencia Servicio QA ${i}`,
      category: i % 2 === 0 ? "Mantenimiento" : "Instalacion",
      estimated_minutes: 30 + i * 5,
      brand: "QA",
      model: `M-${i}`,
      active: true,
      parts: [{ name: `Pieza QA ${i}`, quantity: i, unit: "und", description: "Parte de validacion" }],
      metadata: { batch, scenario: i }
    });

    const order = await apiStep("servicios", `Escenario ${i}: crear orden`, "POST", "/services/orders", token, {
      reference_id: reference?.id,
      service_type: i % 3 === 0 ? "garantia" : "montaje",
      customer_name: `Cliente QA ${i}`,
      customer_address: `Calle ${i} # ${10 + i}-QA`,
      customer_phone: `30000000${String(i).padStart(2, "0")}`,
      invoice_number: `FAC-${batch.slice(-6)}-${i}`,
      scheduled_date: new Date(startedAt.getTime() + i * 86400000).toISOString(),
      notes: `Orden de servicio QA ${i}`,
      metadata: { batch, scenario: i }
    });

    await apiStep("servicios", `Escenario ${i}: iniciar orden`, "PATCH", `/services/orders/${order?.id}/start`, token, {
      latitude: 6.24 + i / 1000,
      longitude: -75.57 - i / 1000,
      accuracy_meters: 7,
      metadata: { batch, scenario: i }
    });

    await addServicePhoto(token, order?.id, "producto_abierto", i);
    await addServicePhoto(token, order?.id, "producto_cerrado", i);
    await addServicePhoto(token, order?.id, "cliente", i);
    await addServicePhoto(token, order?.id, "firma_cliente", i);

    if (i % 5 === 0) {
      await addServicePhoto(token, order?.id, "no_ejecutada", i);
      await apiStep("servicios", `Escenario ${i}: cierre no ejecutado`, "PATCH", `/services/orders/${order?.id}/close-not-executed`, token, {
        latitude: 6.24,
        longitude: -75.57,
        accuracy_meters: 9,
        no_execution_reason: "Cliente no disponible en visita QA",
        metadata: { batch, scenario: i }
      });
    } else {
      await apiStep("servicios", `Escenario ${i}: inspeccion`, "PATCH", `/services/orders/${order?.id}/inspection`, token, {
        decision: i % 4 === 0 ? "requiere_ajuste" : "armable",
        items: [{ part_id: reference?.parts?.[0]?.id || 1, name: `Pieza QA ${i}`, quantity: 1, unit: "und", status: i % 4 === 0 ? "ajuste" : "ok", comment: "Validado QA" }],
        metadata: { batch, scenario: i }
      });
      await apiStep("servicios", `Escenario ${i}: ejecucion`, "PATCH", `/services/orders/${order?.id}/execution`, token, {});
      await apiStep("servicios", `Escenario ${i}: cierre ejecutado`, "PATCH", `/services/orders/${order?.id}/close`, token, {
        latitude: 6.25,
        longitude: -75.58,
        accuracy_meters: 8,
        metadata: { batch, scenario: i }
      });
    }

    await apiStep("servicios", `Escenario ${i}: consultar fotos`, "GET", `/services/orders/${order?.id}/photos`, token);
    await apiStep("servicios", `Escenario ${i}: descargar PDF`, "GET", `/services/orders/${order?.id}/report-pdf`, token);
  }

  await apiStep("servicios", "Consultar ordenes", "GET", "/services/orders", token);
  await apiStep("servicios", "Consultar referencias", "GET", "/services/references", token);
}

function writeReport() {
  fs.mkdirSync(reportDir, { recursive: true });
  report.finished_at = new Date().toISOString();
  fs.writeFileSync(reportJsonPath, JSON.stringify(report, null, 2));
  const findings = report.results.filter((item) => item.status !== "passed");
  const md = [
    `# HR + Servicios Linear Stress - ${batch}`,
    "",
    `- API: ${config.apiUrl}`,
    `- Supabase: ${config.supabaseUrl}`,
    `- Summary: ${report.summary.passed} OK, ${report.summary.failed} FAIL, ${report.summary.warning} WARN`,
    "",
    "## Findings",
    ...(findings.length ? findings.map((item) => `- [${item.status.toUpperCase()}] ${item.area} - ${item.name}: ${item.detail?.message || item.detail?.status || ""}`) : ["- Sin hallazgos bloqueantes."]),
    "",
    "## Results",
    ...report.results.map((item) => `- [${item.status.toUpperCase()}] ${item.area} - ${item.name}`)
  ].join("\n");
  fs.writeFileSync(reportPath, md);
  console.log(`Report MD: ${reportPath}`);
  console.log(`Report JSON: ${reportJsonPath}`);
}

(async () => {
  try {
    if (!config.apiUrl) throw new Error("QA_API_URL no configurada");
    await requestJson(`${config.apiUrl}/health`, { method: "GET" });
    add("preflight", "API health", "passed", { apiUrl: config.apiUrl });
    await validateSupabaseMapContract();
    const token = await registerScenario();
    await runHrScenarios(token);
    await runServiceScenarios(token);
  } catch (error) {
    add("fatal", "Ejecucion del stress", "failed", { message: error.message, body: error.body });
  } finally {
    writeReport();
  }
  process.exit(report.summary.failed ? 1 : 0);
})();
