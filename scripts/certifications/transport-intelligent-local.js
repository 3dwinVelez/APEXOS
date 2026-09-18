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
const output = path.resolve(arg("output", `tmp/transport-intelligent-${runId}/evidence.json`));
const evidence = { certification: "transport-intelligent-local", environment: "LOCAL_DESARROLLO", run_id: runId, api_url: apiUrl, status: "running", checks: [], created: {} };

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

async function securityFixtures() {
  require("../load-env")();
  const database = new URL(process.env.DATABASE_URL);
  if (!["localhost", "127.0.0.1"].includes(database.hostname)) throw new Error("Solo base local permitida.");
  const { PrismaClient } = require("@prisma/client"); const db = new PrismaClient();
  const bcrypt = require("bcrypt"), localPassword = require("node:crypto").randomBytes(18).toString("hex");
  const contexts = {};
  try {
    const demo = await db.user.findFirstOrThrow({ where: { email } });
    const other = await db.tenant.create({ data: { name: `TMS isolation ${runId}`, industry: "logistics", plan: "crown", active_modules: Array.from({length:28},(_,i)=>`M-${String(i+1).padStart(2,"0")}`) } });
    for (const [name, tenantId, actions] of [["reader", demo.tenant_id, ["read"]], ["operator", demo.tenant_id, ["read", "write"]], ["other", other.id, ["read", "write", "approve"]]]) {
      const role = await db.role.create({ data: { tenant_id: tenantId, name: `TMS-${name}-${runId}`, permissions: { create: actions.map(action => ({module:"transport",action})) } } });
      const user = await db.user.create({ data: { tenant_id: tenantId, name: `TMS ${name}`, email: `${name}-${runId}@apex.local`, role_id: role.id, password: await bcrypt.hash(localPassword, 10) } });
      const response = await request("/api/v1/auth/login", {method:"POST",body:JSON.stringify({email:user.email,password:localPassword})});
      check(`login_${name}`,response.ok && Boolean(response.body.token),{status:response.status});contexts[name]={authorization:`Bearer ${response.body.token}`};
    }
  } finally { await db.$disconnect(); }
  return contexts;
}
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

    const security = await securityFixtures();
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

    const vehiclePayload = { plate: `Q${runId.slice(-6)}`, type: "camion", brand: "APEX QA", ownership_type: "tercero", base_site: "Local", linked_company: carrier.body.legal_name, status: "activo", capacity_value: 5, capacity_unit: "ton", volume_available: 30, soat_issued_at: fromNow(-24), soat_expires: fromNow(24 * 365), technical_review_issued_at: fromNow(-24), technical_review_expires: fromNow(24 * 365) };
    const vehicle = await request("/api/v1/transport/vehicles", { method: "POST", headers, body: JSON.stringify(vehiclePayload) });
    check("eligible_vehicle_created", vehicle.ok && vehicle.body.master_status === "apto_documentalmente", { status: vehicle.status, master_status: vehicle.body.master_status }); evidence.created.vehicle_id = vehicle.body.id;

    const incomplete = await request("/api/v1/transport/needs", { method: "POST", headers, body: JSON.stringify({ code: `QA-INC-${runId}`, source_type: "certificacion", origin_id: origin.body.id, origin_name: origin.body.name, delivery_point_id: point.body.id, available_at: fromNow(1), due_at: fromNow(8), weight_kg: 0, volume_m3: 0, pallets: 0, packages: 1, currency: "COP" }) });
    check("incomplete_need_visible", incomplete.status === 201 && incomplete.body.status === "incompleta" && incomplete.body.validation_errors.includes("peso_faltante"), { status: incomplete.status, validation_errors: incomplete.body.validation_errors }); evidence.created.incomplete_need_id = incomplete.body.id;

    const need = await request("/api/v1/transport/needs", { method: "POST", headers, body: JSON.stringify({ code: `QA-NEC-${runId}`, source_type: "pedido_erp", source_reference: `P-${runId}`, origin_id: origin.body.id, origin_name: origin.body.name, delivery_point_id: point.body.id, available_at: fromNow(1), due_at: fromNow(8), priority: "alta", service_level: "normal", required_vehicle_type: "camion", weight_kg: 1200, volume_m3: 8, pallets: 3, packages: 24, cargo_value: 4500000, currency: "COP", lines: [{ sku: "QA-SKU", description: "Carga certificacion", quantity: 24, unit: "UND", weight_kg: 1200, volume_m3: 8, pallets: 3 }] }) });
    check("complete_need_created", need.status === 201 && need.body.status === "pendiente" && need.body.validation_errors.length === 0, { status: need.status }); evidence.created.need_id = need.body.id;

    const evaluation = await request("/api/v1/transport/planning/evaluate", { method: "POST", headers, body: JSON.stringify({ origin_id: origin.body.id, need_ids: [need.body.id], vehicle_id: vehicle.body.id, vehicle_type: "camion", service_level: "normal", strategy: "balanced" }) });
    check("route_capacity_and_rate_evaluated", evaluation.ok && evaluation.body.capacity.feasible === true && evaluation.body.route.distance_km > 0 && evaluation.body.quotes[0].rate_card_id === rateV2.body.id && evaluation.body.quotes[0].rate_version === 2, { status: evaluation.status, distance_km: evaluation.body.route?.distance_km, quotes: evaluation.body.quotes?.length });

    const committed = await request("/api/v1/transport/planning/commit", { method: "POST", headers, body: JSON.stringify({ code: `QA-VIA-${runId}`, origin_id: origin.body.id, need_ids: [need.body.id], vehicle_id: vehicle.body.id, vehicle_type: "camion", service_level: "normal", strategy: "balanced", rate_card_id: rateV2.body.id, planned_departure: fromNow(2), planned_arrival: fromNow(8) }) });
    const trip = { status: committed.status, body: committed.body.trip || {} };
    check("optimized_trip_committed", committed.status === 201 && trip.body.status === "planificado" && trip.body.stops.length === 1 && Number(trip.body.total_weight_kg) === 1200 && Number(trip.body.planned_distance_km) > 0, { status: committed.status, estimated_cost: trip.body.estimated_cost }); evidence.created.trip_id = trip.body.id; evidence.created.stop_id = trip.body.stops[0].id;

    const assigned = await request(`/api/v1/transport/trips/${trip.body.id}/assign`, { method: "POST", headers, body: JSON.stringify({ carrier_id: carrier.body.id, vehicle_id: vehicle.body.id, driver_id: driver.body.id, committed_cost: 720000, reason: "Certificacion local" }) });
    check("trip_assigned", assigned.ok && assigned.body.status === "asignado" && assigned.body.vehicle_plate === vehicle.body.plate, { status: assigned.status });

    const packingInput = { container: {length:6,width:2.4,height:2.4,max_weight:5000}, vehicle_id: vehicle.body.id, need_ids: [need.body.id], items: [{id:`${need.body.id}:${need.body.lines[0].id}`,length:0.6,width:0.4,height:0.4,weight:50,rotation:"upright",stackable:true,max_top_load:150}] };
    const packing = await request("/api/v1/transport/packing/evaluate", {method:"POST",headers,body:JSON.stringify(packingInput)});
    check("packing_orders_real_quantity",packing.ok && packing.body.feasible && packing.body.placements.length===24 && packing.body.total_weight===1200,{status:packing.status,units:packing.body.placements?.length});
    const savedPacking=await request(`/api/v1/transport/trips/${trip.body.id}/packing`,{method:"POST",headers,body:JSON.stringify(packingInput)});
    check("packing_saved_with_fingerprint",savedPacking.ok && Boolean(savedPacking.body.fingerprint),{status:savedPacking.status});
    const profile=await request("/api/v1/transport/packing/profiles",{method:"POST",headers,body:JSON.stringify({id:`qa-${runId}`,name:`Furgon ${runId}`,container:packingInput.container})});
    check("packing_profile_saved",profile.ok,{status:profile.status});
    const denied=await request("/api/v1/transport/packing/evaluate",{method:"POST",headers:security.reader,body:JSON.stringify(packingInput)});
    check("readonly_cannot_pack",denied.status===403,{status:denied.status});
    const foreign=await request(`/api/v1/transport/trips/${trip.body.id}`,{headers:security.other});
    check("tenant_trip_isolation",[403,404].includes(foreign.status),{status:foreign.status});
    const foreignPacking=await request("/api/v1/transport/packing/evaluate",{method:"POST",headers:security.other,body:JSON.stringify(packingInput)});
    check("tenant_packing_isolation",[403,404].includes(foreignPacking.status),{status:foreignPacking.status});
    const additionalNeed=await request("/api/v1/transport/needs",{method:"POST",headers,body:JSON.stringify({code:`CONCURRENT-${runId}`,source_type:"certificacion",origin_id:origin.body.id,origin_name:origin.body.name,delivery_point_id:point.body.id,available_at:fromNow(1),due_at:fromNow(8),weight_kg:100,volume_m3:1})});
    check("concurrency_need_created",additionalNeed.status===201,{status:additionalNeed.status});
    const race=await Promise.all([1,2].map(i=>request("/api/v1/transport/trips",{method:"POST",headers,body:JSON.stringify({code:`RACE-${runId}-${i}`,origin_name:origin.body.name,origin_id:origin.body.id,need_ids:[additionalNeed.body.id]})})));
    check("concurrent_planning_one_winner",race.filter(r=>r.status===201).length===1 && race.filter(r=>r.status===409).length===1,{statuses:race.map(r=>r.status)});
    const secondTrip=race.find(r=>r.status===201).body;
    const doubleAssigned=await request(`/api/v1/transport/trips/${secondTrip.id}/assign`,{method:"POST",headers,body:JSON.stringify({vehicle_id:vehicle.body.id,driver_id:driver.body.id})});
    check("resource_double_booking_blocked",doubleAssigned.status===409,{status:doubleAssigned.status});
    await request(`/api/v1/transport/trips/${secondTrip.id}/transition`,{method:"POST",headers,body:JSON.stringify({status:"cancelado"})});
    for (const status of ["en_cargue", "despachado", "en_transito"]) {
      const transitioned = await request(`/api/v1/transport/trips/${trip.body.id}/transition`, { method: "POST", headers, body: JSON.stringify({ status }) });
      check(`trip_transition_${status}`, transitioned.ok && transitioned.body.status === status, { status: transitioned.status });
    }
    const invalidClose = await request(`/api/v1/transport/trips/${trip.body.id}/transition`, { method: "POST", headers, body: JSON.stringify({ status: "cerrado" }) });
    check("invalid_transition_blocked", invalidClose.status === 409, { status: invalidClose.status, code: invalidClose.body.code });

    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
    const form = new FormData(); form.append("file", new Blob([png], { type: "image/png" }), "delivery.png");
    const uploadResponse = await fetch(`${apiUrl}/api/v1/transport/trips/${trip.body.id}/stops/${trip.body.stops[0].id}/evidence`, { method: "POST", headers, body: form });
    const uploaded = await uploadResponse.json();
    check("real_evidence_uploaded", uploadResponse.status === 201 && Boolean(uploaded.storage_reference), { status: uploadResponse.status });
    const invalidEvidence=await request(`/api/v1/transport/trips/${trip.body.id}/stops/${trip.body.stops[0].id}/attempts`,{method:"POST",headers,body:JSON.stringify({result:"completa",pod:{receiver_name:"Certificador",signature:"tms-evidence/not-real/sign.png",photos:["tms-evidence/not-real/photo.png"]}})});
    check("fake_pod_rejected",[403,422].includes(invalidEvidence.status),{status:invalidEvidence.status});
    const localView=await request(`/api/v1/transport/evidence/view?reference=${encodeURIComponent(uploaded.storage_reference)}`,{headers});
    check("real_pod_readable",localView.ok && Boolean(localView.body.content_base64 || localView.body.url),{status:localView.status});
    const foreignEvidence=await request(`/api/v1/transport/evidence/view?reference=${encodeURIComponent(uploaded.storage_reference)}`,{headers:security.other});
    check("tenant_evidence_isolation",foreignEvidence.status===403,{status:foreignEvidence.status});
    const partial=await request(`/api/v1/transport/trips/${trip.body.id}/stops/${trip.body.stops[0].id}/attempts`,{method:"POST",headers,body:JSON.stringify({result:"parcial",delivered_lines:[{sku:"QA-SKU",quantity:10}],additional_cost:25000,recoverable:true,pod:{receiver_name:"Receptor parcial",signature:uploaded.storage_reference,photos:[uploaded.storage_reference]}})});
    check("partial_delivery_recorded",partial.status===201,{status:partial.status});
    const premature=await request(`/api/v1/transport/trips/${trip.body.id}/transition`,{method:"POST",headers,body:JSON.stringify({status:"entregado"})});
    check("partial_blocks_delivery_close",premature.status===409,{status:premature.status});
    const attempt = await request(`/api/v1/transport/trips/${trip.body.id}/stops/${trip.body.stops[0].id}/attempts`, { method: "POST", headers, body: JSON.stringify({ result: "completa", delivered_lines: [{ sku: "QA-SKU", quantity: 24 }], additional_cost: 0, recoverable: false, pod: { received_at: fromNow(7), receiver_name: "Receptor certificacion", receiver_document: "QA-REC", latitude: 4.711, longitude: -74.0721, signature: uploaded.storage_reference, photos: [uploaded.storage_reference] } }) });
    check("delivery_and_pod_recorded", attempt.status === 201 && attempt.body.result === "completa" && Boolean(attempt.body.pod?.id), { status: attempt.status }); evidence.created.attempt_id = attempt.body.id; evidence.created.pod_id = attempt.body.pod?.id;

    const delivered = await request(`/api/v1/transport/trips/${trip.body.id}/transition`, { method: "POST", headers, body: JSON.stringify({ status: "entregado" }) });
    check("trip_delivered", delivered.ok && delivered.body.status === "entregado", { status: delivered.status });

    const preview=await request(`/api/v1/transport/trips/${trip.body.id}/settlement-preview`,{headers});
    check("automatic_settlement_includes_novelties",preview.ok && preview.body.total===745000 && preview.body.recoverable===25000,{total:preview.body.total,recoverable:preview.body.recoverable});
    const invalidMoney=await request(`/api/v1/transport/trips/${trip.body.id}/settlements`,{method:"POST",headers,body:JSON.stringify({code:`NEG-${runId}`,lines:[{concept:"FLETE_BASE",quantity:2,unit_rate:100,total:-999}]})});
    check("negative_settlement_rejected",invalidMoney.status===400,{status:invalidMoney.status});
    const invalidCurrency=await request(`/api/v1/transport/trips/${trip.body.id}/settlements`,{method:"POST",headers,body:JSON.stringify({code:`USD-${runId}`,currency:"USD"})});
    check("currency_mismatch_rejected",invalidCurrency.status===400,{status:invalidCurrency.status});
    const settlement = await request(`/api/v1/transport/trips/${trip.body.id}/settlements`, {method:"POST",headers,body:JSON.stringify({code:`QA-LIQ-${runId}`,currency:"COP"})});
    check("settlement_created",settlement.status===201 && Number(settlement.body.liquidated_cost)===745000,{status:settlement.status});evidence.created.settlement_id=settlement.body.id;
    const duplicate=await request(`/api/v1/transport/trips/${trip.body.id}/settlements`,{method:"POST",headers,body:JSON.stringify({code:`DUP-${runId}`})});
    check("duplicate_settlement_rejected",duplicate.status===409,{status:duplicate.status});
    const forbiddenApproval=await request(`/api/v1/transport/settlements/${settlement.body.id}/approve`,{method:"POST",headers:security.operator,body:"{}"});
    check("operator_cannot_approve",forbiddenApproval.status===403,{status:forbiddenApproval.status});
    const approved = await request(`/api/v1/transport/settlements/${settlement.body.id}/approve`, { method: "POST", headers, body: "{}" });
    check("settlement_approved", approved.ok && approved.body.status === "aprobada", { status: approved.status });
    const closed = await request(`/api/v1/transport/trips/${trip.body.id}/transition`, { method: "POST", headers, body: JSON.stringify({ status: "cerrado" }) });
    check("trip_closed_with_traceability", closed.ok && closed.body.status === "cerrado" && Number(closed.body.actual_cost) === 745000 && closed.body.events.some((event) => event.event_type === "LIQUIDACION_APROBADA"), { status: closed.status, events: closed.body.events?.length });

    const closedSettlement=await request(`/api/v1/transport/trips/${trip.body.id}/settlements`,{method:"POST",headers,body:JSON.stringify({code:`CLOSED-${runId}`})});
    check("closed_trip_financial_immutable",closedSettlement.status===409,{status:closedSettlement.status});
    const persisted=await request(`/api/v1/transport/trips/${trip.body.id}`,{headers});
    check("packing_and_partial_trace_preserved",persisted.ok && Boolean(persisted.body.metadata?.packing?.fingerprint) && persisted.body.stops[0].attempts.length===2 && persisted.body.stops[0].attempts[1].delivered_lines[0].quantity===14,{status:persisted.status});
    await request(`/api/v1/transport/vehicles/${vehicle.body.id}`, { method: "PUT", headers, body: JSON.stringify({ ...vehiclePayload, status: "retirado", reason: "Cierre certificacion local" }) });
    await request(`/api/v1/transport/drivers/${driver.body.id}`, { method: "PUT", headers, body: JSON.stringify({ code: driver.body.code, document: driver.body.document, name: driver.body.name, carrier_id: carrier.body.id, status: "inactivo" }) });
    await request(`/api/v1/transport/carriers/${carrier.body.id}`, { method: "PUT", headers, body: JSON.stringify({ code: carrier.body.code, legal_name: carrier.body.legal_name, status: "inactivo" }) });
    await request(`/api/v1/transport/delivery-points/${point.body.id}`, { method: "PUT", headers, body: JSON.stringify({ code: point.body.code, name: point.body.name, address: point.body.address, city: point.body.city, country: point.body.country, latitude: point.body.latitude, longitude: point.body.longitude, window_start: point.body.window_start, window_end: point.body.window_end, active: false }) });
    await request(`/api/v1/transport/rate-cards/${rateV2.body.id}/deactivate`, { method: "POST", headers, body: "{}" });
    await request(`/api/v1/transport/origins/${origin.body.id}`, { method: "PUT", headers, body: JSON.stringify({ code: origin.body.code, name: origin.body.name, address: origin.body.address, city: origin.body.city, country: origin.body.country, latitude: origin.body.latitude, longitude: origin.body.longitude, active: false }) });
    evidence.cleanup = "masters_and_rate_inactivated_and_vehicle_retired; transactional_trace_preserved";
    evidence.status = "passed";
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
