const fs = require("node:fs");
const path = require("node:path");

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const apiUrl = String(arg("api-url", "http://localhost:3000")).replace(/\/$/, "");
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(apiUrl)) throw new Error("La certificacion TMS local solo permite localhost o 127.0.0.1.");

const email = process.env.LOCAL_TMS_EMAIL || "demo@apex.local";
const password = process.env.LOCAL_TMS_PASSWORD || "test1234";
const runId = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
const output = path.resolve(arg("output", `tmp/transport-demo-${runId}.json`));
const evidence = { certification: "transport-demo-local", environment: "LOCAL_DESARROLLO", run_id: runId, api_url: apiUrl, status: "running", checks: [], created: {} };

function check(name, passed, detail = {}) {
  evidence.checks.push({ name, status: passed ? "passed" : "failed", detail });
  if (!passed) throw new Error(`Fallo la comprobacion ${name}`);
}

async function request(url, options = {}) {
  const response = await fetch(`${apiUrl}${url}`, { ...options, headers: { "content-type": "application/json", ...(options.headers || {}) } });
  const text = await response.text();
  let body = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
  return { ok: response.ok, status: response.status, body };
}

function fromNow(hours) { return new Date(Date.now() + hours * 3600000).toISOString(); }

async function main() {
  let headers;
  try {
    const health = await request("/health");
    check("api_health", health.ok && health.body.status === "OK", { status: health.status });
    const anonymous = await request("/api/v1/transport/control-tower");
    check("authentication_required", anonymous.status === 401, { status: anonymous.status });
    const login = await request("/api/v1/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
    check("local_admin_login", login.ok && Boolean(login.body.token), { status: login.status });
    headers = { authorization: `Bearer ${login.body.token}` };

    const carrier = await request("/api/v1/transport/carriers", { method: "POST", headers, body: JSON.stringify({ code: `QA-CAR-${runId}`, legal_name: `Transportadora local ${runId}`, tax_id: `TAX-${runId}`, status: "activo", service_levels: ["normal"], operating_zones: ["local"], vehicle_types: ["camion"] }) });
    check("carrier_created", carrier.status === 201 && Boolean(carrier.body.id), { status: carrier.status }); evidence.created.carrier_id = carrier.body.id;

    const origin = await request("/api/v1/transport/origins", { method: "POST", headers, body: JSON.stringify({ code: `QA-ORI-${runId}`, name: `Centro local ${runId}`, address: "Carrera local 10", city: "Bogota", country: "CO", latitude: 4.65, longitude: -74.1, operation_start: "06:00", operation_end: "22:00", service_minutes: 45 }) });
    check("georeferenced_origin_created", origin.status === 201 && origin.body.latitude === 4.65, { status: origin.status }); evidence.created.origin_id = origin.body.id;

    const driver = await request("/api/v1/transport/drivers", { method: "POST", headers, body: JSON.stringify({ code: `QA-CON-${runId}`, document: `DOC-${runId}`, name: `Conductor local ${runId}`, carrier_id: carrier.body.id, license_number: `LIC-${runId}`, license_category: "C2", license_expires_at: fromNow(24 * 365), status: "disponible" }) });
    check("driver_created", driver.status === 201 && driver.body.carrier_id === carrier.body.id, { status: driver.status }); evidence.created.driver_id = driver.body.id;

    const point = await request("/api/v1/transport/delivery-points", { method: "POST", headers, body: JSON.stringify({ code: `QA-PTO-${runId}`, name: `Destino local ${runId}`, address: "Calle local 100", city: "Bogota", country: "CO", latitude: 4.711, longitude: -74.0721, window_start: "08:00", window_end: "17:00", service_minutes: 30, geofence_radius_m: 150 }) });
    check("delivery_point_created", point.status === 201 && point.body.latitude === 4.711, { status: point.status }); evidence.created.delivery_point_id = point.body.id;

    const rate = await request("/api/v1/transport/rate-cards", { method: "POST", headers, body: JSON.stringify({ code: `QA-TAR-${runId}`, name: `Tarifa certificacion ${runId}`, carrier_id: carrier.body.id, origin_id: origin.body.id, destination_city: "Bogota", service_level: "normal", vehicle_type: "camion", valid_from: fromNow(-24), valid_to: fromNow(24 * 365), currency: "COP", base_rate: 500000, minimum_charge: 600000, price_per_km: 2500, price_per_kg: 25, price_per_m3: 1000, price_per_stop: 50000, fuel_surcharge_pct: 10, tolls_flat: 30000, status: "activa" }) });
    check("rate_v1_activated", rate.status === 201 && rate.body.status === "activa" && rate.body.version === 1, { status: rate.status, version: rate.body.version }); evidence.created.rate_card_v1_id = rate.body.id;
    const rateV2 = await request(`/api/v1/transport/rate-cards/${rate.body.id}/versions`, { method: "POST", headers, body: JSON.stringify({ code: rate.body.code, name: rate.body.name, carrier_id: carrier.body.id, origin_id: origin.body.id, destination_city: "Bogota", service_level: "normal", vehicle_type: "camion", valid_from: fromNow(-24), valid_to: fromNow(24 * 365), currency: "COP", base_rate: 510000, minimum_charge: 600000, price_per_km: 2500, price_per_kg: 25, price_per_m3: 1000, price_per_stop: 50000, fuel_surcharge_pct: 10, tolls_flat: 30000, status: "activa" }) });
    check("rate_v2_published_and_v1_replaced", rateV2.status === 201 && rateV2.body.status === "activa" && rateV2.body.version === 2, { status: rateV2.status, version: rateV2.body.version }); evidence.created.rate_card_id = rateV2.body.id;

    const vehiclePayload = { plate: `Q${runId.slice(-6)}`, type: "camion", brand: "APEX DEMO", metadata: {cargo_space:{length:6,width:2.4,height:2.4,max_weight:5000}}, ownership_type: "tercero", base_site: "Local", linked_company: carrier.body.legal_name, status: "activo", capacity_value: 5, capacity_unit: "ton", volume_available: 30, soat_issued_at: fromNow(-24), soat_expires: fromNow(24 * 365), technical_review_issued_at: fromNow(-24), technical_review_expires: fromNow(24 * 365) };
    const vehicle = await request("/api/v1/transport/vehicles", { method: "POST", headers, body: JSON.stringify(vehiclePayload) });
    check("eligible_vehicle_created", vehicle.ok && vehicle.body.master_status === "apto_documentalmente", { status: vehicle.status, master_status: vehicle.body.master_status }); evidence.created.vehicle_id = vehicle.body.id;

    const incomplete = await request("/api/v1/transport/needs", { method: "POST", headers, body: JSON.stringify({ code: `QA-INC-${runId}`, source_type: "certificacion", origin_id: origin.body.id, origin_name: origin.body.name, delivery_point_id: point.body.id, available_at: fromNow(1), due_at: fromNow(8), weight_kg: 0, volume_m3: 0, pallets: 0, packages: 1, currency: "COP" }) });
    check("incomplete_need_visible", incomplete.status === 201 && incomplete.body.status === "incompleta" && incomplete.body.validation_errors.includes("peso_faltante"), { status: incomplete.status, validation_errors: incomplete.body.validation_errors }); evidence.created.incomplete_need_id = incomplete.body.id;

    const need = await request("/api/v1/transport/needs", { method: "POST", headers, body: JSON.stringify({ code: `QA-NEC-${runId}`, source_type: "pedido_erp", source_reference: `P-${runId}`, origin_id: origin.body.id, origin_name: origin.body.name, delivery_point_id: point.body.id, available_at: fromNow(1), due_at: fromNow(8), priority: "alta", service_level: "normal", required_vehicle_type: "camion", weight_kg: 1200, volume_m3: 8, pallets: 3, packages: 24, cargo_value: 4500000, currency: "COP", lines: [{ sku: "QA-SKU", description: "Carga demostrativa", metadata: {packing:{length:0.6,width:0.4,height:0.4,weight:50,rotation:"upright",stackable:true,max_top_load:150}}, quantity: 24, unit: "UND", weight_kg: 1200, volume_m3: 8, pallets: 3 }] }) });
    check("complete_need_created", need.status === 201 && need.body.status === "pendiente" && need.body.validation_errors.length === 0, { status: need.status }); evidence.created.need_id = need.body.id;

    const evaluation = await request("/api/v1/transport/planning/evaluate", { method: "POST", headers, body: JSON.stringify({ origin_id: origin.body.id, need_ids: [need.body.id], vehicle_id: vehicle.body.id, vehicle_type: "camion", service_level: "normal", strategy: "balanced" }) });
    check("route_capacity_and_rate_evaluated", evaluation.ok && evaluation.body.capacity.feasible === true && evaluation.body.route.distance_km > 0 && evaluation.body.quotes[0].rate_card_id === rateV2.body.id && evaluation.body.quotes[0].rate_version === 2, { status: evaluation.status, distance_km: evaluation.body.route?.distance_km, quotes: evaluation.body.quotes?.length });

    const committed = await request("/api/v1/transport/planning/commit", { method: "POST", headers, body: JSON.stringify({ code: `QA-VIA-${runId}`, origin_id: origin.body.id, need_ids: [need.body.id], vehicle_id: vehicle.body.id, vehicle_type: "camion", service_level: "normal", strategy: "balanced", rate_card_id: rateV2.body.id, planned_departure: fromNow(2), planned_arrival: fromNow(8) }) });
    const trip = { status: committed.status, body: committed.body.trip || {} };
    check("optimized_trip_committed", committed.status === 201 && trip.body.status === "planificado" && trip.body.stops.length === 1 && Number(trip.body.total_weight_kg) === 1200 && Number(trip.body.planned_distance_km) > 0, { status: committed.status, estimated_cost: trip.body.estimated_cost }); evidence.created.trip_id = trip.body.id; evidence.created.stop_id = trip.body.stops[0].id;

    for (const [suffix, quantity, length, width, height, weight, maxTop] of [["BEBIDAS",40,0.4,0.3,0.3,12,60],["ELECTRO",8,0.8,0.6,1.2,45,0],["INSUMOS",18,0.6,0.4,0.5,20,80]]) {
      const extra=await request("/api/v1/transport/needs", {method:"POST",headers,body:JSON.stringify({code:`DEMO-${suffix}-${runId}`,source_type:"demo_local",origin_id:origin.body.id,origin_name:origin.body.name,delivery_point_id:point.body.id,available_at:fromNow(1),due_at:fromNow(12),weight_kg:quantity*weight,volume_m3:quantity*length*width*height,packages:quantity,service_level:"normal",required_vehicle_type:"camion",lines:[{sku:suffix,description:suffix,quantity,weight_kg:quantity*weight,volume_m3:quantity*length*width*height,metadata:{packing:{length,width,height,weight,rotation:"upright",stackable:maxTop>0,max_top_load:maxTop}}}]})});
      check(`demo_${suffix}`,extra.status===201,{status:extra.status});
    }
    const profile=await request("/api/v1/transport/packing/profiles",{method:"POST",headers,body:JSON.stringify({id:"furgon-demo-5t",name:"Furgón seco · 5 toneladas",container:{length:6,width:2.4,height:2.4,max_weight:5000}})});
    check("demo_profile",profile.ok,{status:profile.status});
    evidence.status="passed";evidence.purpose="Reusable local demo. Masters, orders and planned trip intentionally kept active.";
  } catch (error) {
    evidence.status = "failed";
    evidence.error = error.message;
    throw error;
  } finally {
    evidence.finished_at = new Date().toISOString();
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, JSON.stringify(evidence, null, 2));
    console.log(`Evidencia TMS local: ${output}`);
  }
}

main().catch((error) => { console.error(`CERTIFICACION TMS LOCAL BLOQUEADA: ${error.message}`); process.exitCode = 1; });
