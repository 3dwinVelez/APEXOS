// Certificacion REMOTA del modulo Transporte en DEVELOP (QA) con el USUARIO ADMIN REAL del ambiente.
//
// Inicia sesion como el administrador real de QA via Supabase Auth (password grant), consume la API
// desplegada en Railway (rama develop) con el Bearer de Supabase y POBLA datos reales en la
// herramienta: maestros TMS (transportador, conductor, punto de entrega, origen, vehiculo, tarifa),
// un pedido/necesidad, un plan de despacho y un viaje ejecutado hasta despachado. Al finalizar
// verifica la reporteria (torre de control, flota, metricas) y DEJA los datos activos en el tenant
// piloto QA para inspeccion en la interfaz.
//
// No toca produccion: aborta si la URL de API no es el host HTTPS de QA en Railway. La contrasena del
// administrador se toma de QA_ADMIN_PASSWORD (variable de entorno); nunca se escribe en el repo.

const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

function argsFrom(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const v = argv[i];
    if (!v.startsWith("--")) continue;
    out[v.slice(2)] = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true;
  }
  return out;
}
const args = argsFrom(process.argv.slice(2));
require("../load-env")(path.resolve(String(args["env-file"] || "config/qa.env")));

const API_URL = String(args["api-url"] || process.env.QA_API_URL || "https://apexos-api-qa-production.up.railway.app").replace(/\/$/, "");
if (!/^https:\/\/apexos-api-qa-production\.up\.railway\.app$/.test(API_URL)) {
  console.error("BLOQUEADO: la certificacion remota solo corre contra la API de QA en Railway (HTTPS).");
  process.exit(1);
}
const SUPABASE_URL = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
const ANON_KEY = String(process.env.SUPABASE_ANON_KEY || "");
const ADMIN_EMAIL = String(process.env.QA_ADMIN_EMAIL || "admin@apexos.qa");
const ADMIN_PASSWORD = String(process.env.QA_ADMIN_PASSWORD || "");
if (!SUPABASE_URL || !ANON_KEY) {
  console.error("BLOQUEADO: se requiere SUPABASE_URL y SUPABASE_ANON_KEY (config/qa.env).");
  process.exit(1);
}
if (!ADMIN_PASSWORD) {
  console.error("BLOQUEADO: define QA_ADMIN_PASSWORD (contrasena del administrador real de QA) antes de ejecutar.");
  process.exit(1);
}

const EXPECTED_COMMIT = String(args["expected-commit"] || process.env.EXPECTED_COMMIT || "");
const COMPANY_ID = String(args["company-id"] || "c56bc5df-c807-4deb-83f8-fbb4751be613"); // Cliente Piloto QA
const REQUEST_TIMEOUT_MS = Number(args["request-timeout-ms"] || 30000);
const OUTPUT = path.resolve(String(args.output || "docs/qa/evidence/transport-module-20261011/develop-admin-certification.json"));
const RUN_ID = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);

function dateFromToday(days) {
  const value = new Date();
  value.setUTCHours(12, 0, 0, 0);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
const TODAY = dateFromToday(0);

const result = {
  change_id: "transport-module-admin-20261011",
  certification: "transport-module-develop-admin",
  environment: "QA",
  target_environment: "develop",
  api_url: API_URL,
  supabase_url: SUPABASE_URL,
  api_commit: "unknown",
  expected_commit: EXPECTED_COMMIT ? EXPECTED_COMMIT.slice(0, 12) : "unset",
  generated_at: new Date().toISOString(),
  admin: { email: ADMIN_EMAIL, auth: "supabase-password-grant" },
  tenant: { company_id: COMPANY_ID, name: "Cliente Piloto QA" },
  scope: {
    capability: "Transporte end-to-end en develop con el administrador real de QA: maestros TMS, pedido/necesidad, plan de despacho y viaje ejecutado, con reporteria de torre de control y flota, poblando datos reales visibles en la herramienta.",
    proven_by_live_execution: [
      "Sesion del administrador real de QA via Supabase Auth consumiendo la API con el Bearer de Supabase",
      "Maestros TMS persistidos: transportador, conductor, punto de entrega, origen, vehiculo y tarifa",
      "Pedido/necesidad y plan de despacho creados y asociados",
      "Viaje creado, asignado (vehiculo + conductor) y transicionado a en_cargue y despachado",
      "Reporteria: torre de control, monitoring de flota, metricas de vehiculos y simulacion de tarifa",
      "Los datos quedan activos en el tenant piloto QA para inspeccion en la interfaz"
    ]
  },
  checks: [],
  status: "running"
};

function check(name, ok, detail = {}) {
  result.checks.push({ name, ok: Boolean(ok), detail });
  console.error(`[cert] ${String(result.checks.length).padStart(2, "0")} ${ok ? "OK  " : "FALLA"} ${name}`);
  if (!ok) throw new Error(`Fallo de certificacion: ${name}`);
}

let TOKEN = "";
async function capture(pathname, { method = "GET", body, auth = true } = {}) {
  const started = Date.now();
  let status = 0;
  let payload = {};
  let transportError = null;
  try {
    const res = await fetch(`${API_URL}${pathname}`, {
      method,
      headers: { ...(auth && TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
    status = res.status;
    payload = await res.json().catch(() => ({}));
  } catch (error) {
    transportError = error.message;
  }
  return { status, payload, transportError, latency_ms: Date.now() - started };
}

async function supabaseLogin() {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });
  const payload = await res.json().catch(() => ({}));
  return { status: res.status, payload };
}

async function main() {
  try {
    const health = await capture("/health", { auth: false });
    result.api_commit = health.payload?.commit || "unknown";
    check("develop_health", health.status === 200 && health.payload?.status === "OK", { status: health.status, commit: result.api_commit });
    if (EXPECTED_COMMIT) check("develop_commit_matches_candidate", result.api_commit === EXPECTED_COMMIT.slice(0, 12), { commit: result.api_commit, expected: EXPECTED_COMMIT.slice(0, 12) });

    const anon = await capture("/api/v1/transport/vehicles", { auth: false });
    check("anonymous_blocked_401", anon.status === 401, { status: anon.status });

    const login = await supabaseLogin();
    check("admin_supabase_login", login.status === 200 && Boolean(login.payload?.access_token), { status: login.status, error: login.payload?.error_description || login.payload?.msg });
    TOKEN = login.payload.access_token;

    const me = await capture("/api/v1/auth/me");
    check("admin_tenant_resolved", me.status === 200 && me.payload?.user?.email === ADMIN_EMAIL && me.payload?.tenant?.id === COMPANY_ID, { status: me.status, tenant: me.payload?.tenant?.id });

    // ---- Maestros TMS (datos reales, se dejan activos) ----
    const carrier = await capture("/api/v1/transport/carriers", { method: "POST", body: { code: `TMS-TR-${RUN_ID}`, legal_name: `Transportes QA ${RUN_ID}`, trade_name: "Transportes QA", tax_id: `900${RUN_ID.slice(-6)}`, phone: "3000000000", email: "transporte.qa@apexos.qa", status: "activo", service_levels: ["estandar"], operating_zones: ["Bogota"], vehicle_types: ["camioneta"] } });
    check("carrier_created", carrier.status === 201 && Boolean(carrier.payload.id), { status: carrier.status, id: carrier.payload.id });
    const carrierId = carrier.payload.id;

    const driver = await capture("/api/v1/transport/drivers", { method: "POST", body: { code: `TMS-CON-${RUN_ID}`, document: `CC${RUN_ID.slice(-6)}`, name: "Conductor QA Certificacion", phone: "3011111111", carrier_id: carrierId, license_number: `LIC-${RUN_ID}`, license_category: "C2", license_expires_at: dateFromToday(200), status: "disponible" } });
    check("driver_created", driver.status === 201 && Boolean(driver.payload.id) && driver.payload.status === "disponible", { status: driver.status, id: driver.payload.id, driver_status: driver.payload.status });
    const driverId = driver.payload.id;

    const deliveryPoint = await capture("/api/v1/transport/delivery-points", { method: "POST", body: { code: `TMS-PE-${RUN_ID}`, name: `Punto entrega QA ${RUN_ID}`, address: "Calle 100 # 10-20", city: "Bogota", department: "Cundinamarca", country: "CO", latitude: 4.7, longitude: -74.05, window_start: "08:00", window_end: "17:00", active: true } });
    check("delivery_point_created", deliveryPoint.status === 201 && Boolean(deliveryPoint.payload.id), { status: deliveryPoint.status, id: deliveryPoint.payload.id });
    const deliveryPointId = deliveryPoint.payload.id;

    const origin = await capture("/api/v1/transport/origins", { method: "POST", body: { code: `TMS-OR-${RUN_ID}`, name: `Bodega Central QA ${RUN_ID}`, address: "Carrera 50 # 20-30", city: "Bogota", department: "Cundinamarca", country: "CO", latitude: 4.65, longitude: -74.1, active: true } });
    check("origin_created", origin.status === 201 && Boolean(origin.payload.id), { status: origin.status, id: origin.payload.id });
    const originId = origin.payload.id;

    const vehiclePayload = {
      plate: `T${RUN_ID.slice(-6)}`,
      type: "camioneta",
      brand: "APEX QA",
      line: "Certificable",
      ownership_type: "propio",
      legal_owner: "NYVORA QA",
      base_site: "QA Transporte",
      status: "activo",
      vin_chassis: `QA-${RUN_ID}-${randomUUID().slice(0, 8)}`,
      capacity_value: 1000,
      capacity_unit: "kg",
      soat_issued_at: dateFromToday(-30),
      soat_expires: dateFromToday(335),
      technical_review_issued_at: dateFromToday(-30),
      technical_review_expires: dateFromToday(335),
      notes: `Poblado por certificacion admin ${RUN_ID}`
    };
    const vehicle = await capture("/api/v1/transport/vehicles", { method: "POST", body: vehiclePayload });
    check("vehicle_created", [200, 201].includes(vehicle.status) && Boolean(vehicle.payload.id) && vehicle.payload.plate === vehiclePayload.plate.toUpperCase(), { status: vehicle.status, id: vehicle.payload.id, plate: vehicle.payload.plate });
    const vehicleId = vehicle.payload.id;

    const rateCard = await capture("/api/v1/transport/rate-cards", { method: "POST", body: { code: `TMS-TA-${RUN_ID}`, name: `Tarifa QA ${RUN_ID}`, carrier_id: carrierId, origin_city: "Bogota", destination_city: "Bogota", valid_from: dateFromToday(-1), valid_to: dateFromToday(90), currency: "COP", base_rate: 80000, minimum_charge: 60000, price_per_kg: 200, price_per_stop: 5000, status: "activa", active: true } });
    check("rate_card_created", rateCard.status === 201 && Boolean(rateCard.payload.id), { status: rateCard.status, id: rateCard.payload.id });
    const rateCardId = rateCard.payload.id;

    // ---- Pedido/necesidad, plan de despacho y viaje ----
    const need = await capture("/api/v1/transport/needs", { method: "POST", body: { code: `TMS-PED-${RUN_ID}`, source_type: "manual", origin_name: `Bodega Central QA ${RUN_ID}`, origin_id: originId, delivery_point_id: deliveryPointId, available_at: `${TODAY}T08:00:00.000Z`, due_at: `${TODAY}T18:00:00.000Z`, priority: "normal", service_level: "estandar", weight_kg: 120, volume_m3: 1.5, packages: 3, currency: "COP" } });
    check("need_created", need.status === 201 && Boolean(need.payload.id) && need.payload.status === "pendiente", { status: need.status, id: need.payload.id, need_status: need.payload.status, validation_errors: need.payload.validation_errors });
    const needId = need.payload.id;

    const plan = await capture("/api/v1/transport/plans", { method: "POST", body: { code: `TMS-PLAN-${RUN_ID}`, name: `Plan despacho QA ${RUN_ID}`, origin_id: originId, due_date: TODAY, notes: `Poblado por certificacion admin ${RUN_ID}` } });
    check("plan_created", plan.status === 201 && Boolean(plan.payload.id), { status: plan.status, id: plan.payload.id });
    const planId = plan.payload.id;

    const planNeeds = await capture(`/api/v1/transport/plans/${planId}/needs`, { method: "POST", body: { need_ids: [needId] } });
    check("plan_needs_added", planNeeds.status === 201 || planNeeds.status === 200, { status: planNeeds.status, code: planNeeds.payload?.code, message: planNeeds.payload?.message, detailPayload: planNeeds.payload?.detail });

    const planReady = await capture(`/api/v1/transport/plans/${planId}`, { method: "PUT", body: { status: "listo" } });
    check("plan_marked_ready", planReady.status === 200 && planReady.payload.status === "listo", { status: planReady.status, plan_status: planReady.payload.status });

    const trip = await capture("/api/v1/transport/trips", { method: "POST", body: { code: `TMS-VIA-${RUN_ID}`, origin_id: originId, origin_name: `Bodega Central QA ${RUN_ID}`, need_ids: [needId], service_level: "estandar", currency: "COP" } });
    check("trip_created", trip.status === 201 && Boolean(trip.payload.id) && trip.payload.status === "planificado", { status: trip.status, id: trip.payload.id, trip_status: trip.payload.status });
    const tripId = trip.payload.id;

    const assigned = await capture(`/api/v1/transport/trips/${tripId}/assign`, { method: "POST", body: { carrier_id: carrierId, vehicle_id: vehicleId, driver_id: driverId, committed_cost: 90000, reason: "Asignacion de certificacion" } });
    check("trip_assigned", assigned.status === 200 && assigned.payload.status === "asignado" && assigned.payload.vehicle_id === vehicleId && assigned.payload.driver_id === driverId, { status: assigned.status, code: assigned.payload?.code, message: assigned.payload?.message, trip_status: assigned.payload.status });

    const toLoading = await capture(`/api/v1/transport/trips/${tripId}/transition`, { method: "POST", body: { status: "en_cargue" } });
    check("trip_in_loading", toLoading.status === 200 && toLoading.payload.status === "en_cargue", { status: toLoading.status, trip_status: toLoading.payload.status });

    const dispatched = await capture(`/api/v1/transport/trips/${tripId}/transition`, { method: "POST", body: { status: "despachado" } });
    check("trip_dispatched", dispatched.status === 200 && dispatched.payload.status === "despachado" && Boolean(dispatched.payload.actual_departure), { status: dispatched.status, trip_status: dispatched.payload.status });

    const badTransition = await capture(`/api/v1/transport/trips/${tripId}/transition`, { method: "POST", body: { status: "planificado" } });
    check("trip_invalid_transition_blocked", badTransition.status === 409, { status: badTransition.status });

    // ---- Reporteria sobre los datos poblados ----
    const tripList = await capture("/api/v1/transport/trips?include_planned=true");
    check("trip_list_includes_created", tripList.status === 200 && Array.isArray(tripList.payload) && tripList.payload.some((t) => t.id === tripId), { status: tripList.status, total: Array.isArray(tripList.payload) ? tripList.payload.length : null });

    const vehicles = await capture("/api/v1/transport/vehicles");
    check("vehicle_list_includes_created", vehicles.status === 200 && Array.isArray(vehicles.payload) && vehicles.payload.some((v) => String(v.id) === String(vehicleId)), { status: vehicles.status });

    const planning = await capture(`/api/v1/transport/vehicles/planning/${encodeURIComponent(vehiclePayload.plate.toUpperCase())}`);
    check("vehicle_planning_contract", planning.status === 200 && planning.payload.plate === vehiclePayload.plate.toUpperCase() && typeof planning.payload.can_start_route === "boolean", { status: planning.status, can_start_route: planning.payload.can_start_route });

    const metrics = await capture("/api/v1/transport/vehicles/metrics/dashboard");
    check("vehicle_dashboard_metrics", metrics.status === 200 && Array.isArray(metrics.payload.vehicles) && metrics.payload.vehicles.some((v) => String(v.id) === String(vehicleId)), { status: metrics.status });

    const tower = await capture("/api/v1/transport/control-tower");
    check("control_tower_reports_execution", tower.status === 200 && typeof tower.payload?.in_execution === "number" && tower.payload.in_execution >= 1 && tower.payload.total >= 1, { status: tower.status, in_execution: tower.payload?.in_execution, total: tower.payload?.total });

    const fleet = await capture("/api/v1/transport/monitoring/fleet");
    check("fleet_monitoring_ok", fleet.status === 200, { status: fleet.status });

    const simulate = await capture("/api/v1/transport/rates/simulate", { method: "POST", body: { carrier_id: carrierId, service_date: TODAY, origin_city: "Bogota", destination_city: "Bogota", quantity: 1, weight_kg: 120, volume_m3: 1.5, stop_count: 1 } });
    check("rate_simulation_ok", simulate.status === 200 && simulate.payload && typeof simulate.payload === "object", { status: simulate.status });

    const cargos = await capture("/api/v1/transport/carriers");
    check("carrier_list_includes_created", cargos.status === 200 && Array.isArray(cargos.payload) && cargos.payload.some((c) => String(c.id) === String(carrierId)), { status: cargos.status });

    result.fixture = { company_id: COMPANY_ID, carrier_id: carrierId, driver_id: driverId, delivery_point_id: deliveryPointId, origin_id: originId, vehicle_id: vehicleId, rate_card_id: rateCardId, need_id: needId, plan_id: planId, trip_id: tripId, note: "Datos dejados activos en el tenant piloto QA para inspeccion en la interfaz" };
    result.status = "passed";
    result.checks_passed = result.checks.filter((c) => c.ok).length;
    result.checks_total = result.checks.length;
  } catch (error) {
    result.status = "failed";
    result.error = error.message;
    console.error("[cert] ERROR:", error.message);
  } finally {
    fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
    result.finished_at = new Date().toISOString();
    fs.writeFileSync(OUTPUT, JSON.stringify(result, null, 2));
    console.error(`[cert] evidencia: ${path.relative(path.resolve(__dirname, "..", ".."), OUTPUT)} status=${result.status} (${result.checks.filter((c) => c.ok).length}/${result.checks.length})`);
    process.exit(result.status === "passed" ? 0 : 1);
  }
}

main();
