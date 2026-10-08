// Ejemplos de liquidacion de transporte para la torre (solo local).
//
// Idempotente: usa codigos fijos (DEMO-*, LIQ-2026-00x, SEM-2026-3x) y omite lo ya existente,
// de modo que se puede re-ejecutar tras cada cambio sin duplicar datos. Recorre el workflow
// completo de la spec RB-01..RB-12 con un usuario demo: borrador -> validando -> preliquidada
// -> ajuste -> en revision -> aprobada -> contabilizada -> liquidada, mas un paquete con
// novedad bloqueante (tarifa inexistente) y un borrador. Al final verifica la consolidacion
// de ingresos por vehiculo, que es la vista que alimenta la torre contable.
const fs = require("node:fs");
const path = require("node:path");

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const apiUrl = String(arg("api-url", "http://localhost:3000")).replace(/\/$/, "");
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(apiUrl)) throw new Error("La carga de ejemplos de liquidacion solo permite localhost o 127.0.0.1.");

const email = process.env.LOCAL_TMS_EMAIL || "demo@apex.local";
const password = process.env.LOCAL_TMS_PASSWORD || "test1234";
const runId = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
const output = path.resolve(arg("output", `tmp/transport-settlement-demo-${runId}.json`));
const evidence = { certification: "transport-settlement-demo-local", environment: "LOCAL_DESARROLLO", run_id: runId, api_url: apiUrl, status: "running", checks: [], created: {}, skipped: [] };

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

const near = (a, b) => Math.abs(Number(a) - Number(b)) < 0.011;

async function main() {
  let headers;
  try {
    const health = await request("/health");
    check("api_health", health.ok && health.body.status === "OK", { status: health.status });
    const anonymous = await request("/api/v1/transport/settlement-control-tower");
    check("authentication_required", anonymous.status === 401, { status: anonymous.status });
    const login = await request("/api/v1/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
    check("local_admin_login", login.ok && Boolean(login.body.token), { status: login.status });
    headers = { authorization: `Bearer ${login.body.token}` };

    // ---- Maestros base (idempotentes por codigo fijo) ----
    const carriersList = await request("/api/v1/transport/carriers", { headers });
    check("carriers_list", carriersList.ok && Array.isArray(carriersList.body), { status: carriersList.status });
    async function ensureCarrier(code, payload) {
      const existing = carriersList.body.find((row) => row.code === code);
      if (existing) { evidence.skipped.push(`carrier:${code}`); return existing; }
      const created = await request("/api/v1/transport/carriers", { method: "POST", headers, body: JSON.stringify({ code, status: "activo", ...payload }) });
      check(`carrier_${code}`, created.status === 201 && Boolean(created.body.id), { status: created.status, error: created.body?.message });
      return created.body;
    }
    const carrierA = await ensureCarrier("DEMO-AND", { legal_name: "TRANSPORTES ANDINOS S.A.S", tax_id: "900123456-7", email: "operaciones@andinos.demo", phone: "+57 601 555 0101" });
    const carrierB = await ensureCarrier("DEMO-CAR", { legal_name: "CARGA EXPRESS DEL CARIBE", tax_id: "900765432-1", email: "planeacion@caribeexpress.demo", phone: "+57 305 555 0202" });
    const carrierC = await ensureCarrier("DEMO-FLT", { legal_name: "FLOTA PROPIA URBANA", tax_id: "901234567-8" });

    const rateList = await request("/api/v1/transport/rate-cards", { headers });
    check("rate_cards_list", rateList.ok && Array.isArray(rateList.body), { status: rateList.status });
    async function ensureRate(code, payload) {
      const existing = rateList.body.find((row) => row.code === code);
      if (existing) { evidence.skipped.push(`rate:${code}`); return existing; }
      const created = await request("/api/v1/transport/rate-cards", { method: "POST", headers, body: JSON.stringify({ code, status: "activa", currency: "COP", ...payload }) });
      check(`rate_${code}`, created.status === 201 && created.body.status === "activa", { status: created.status, error: created.body?.message });
      return created.body;
    }
    const window2026 = { valid_from: "2026-01-01", valid_to: "2026-12-31", vehicle_type: "camion", service_level: "normal" };
    await ensureRate("DEMO-AND-2026", { name: "Tarifa nacional 2026 · Andinos", carrier_id: carrierA.id, base_rate: 450000, minimum_charge: 520000, price_per_km: 3200, price_per_kg: 45, price_per_m3: 42000, price_per_stop: 38000, fuel_surcharge_pct: 8, tolls_flat: 26000, ...window2026 });
    await ensureRate("DEMO-CAR-2026", { name: "Tarifa costa 2026 · Caribe Express", carrier_id: carrierB.id, base_rate: 520000, minimum_charge: 610000, price_per_km: 3600, price_per_kg: 50, price_per_m3: 45000, price_per_stop: 42000, fuel_surcharge_pct: 9, tolls_flat: 31000, ...window2026 });
    // La flota propia (DEMO-FLT) queda a proposito sin tarifa: eso produce la novedad tarifa_inexistente.

    const typeList = await request("/api/v1/transport/settlement-types", { headers });
    check("settlement_types_list", typeList.ok && Array.isArray(typeList.body), { status: typeList.status });
    if (!typeList.body.find((row) => row.code === "FLETE_URBANO")) {
      const created = await request("/api/v1/transport/settlement-types", { method: "POST", headers, body: JSON.stringify({ code: "FLETE_URBANO", name: "Flete urbano", description: "Reparto urbano de ultima milla con politica de alerta.", documentary_policy: "alerta", requires_reinforced_approval: false, required_documents: ["Factura", "Manifiesto"] }) });
      check("settlement_type_FLETE_URBANO", created.status === 201 && created.body.code === "FLETE_URBANO", { status: created.status, error: created.body?.message });
    } else evidence.skipped.push("type:FLETE_URBANO");

    const periodList = await request("/api/v1/transport/settlement-periods", { headers });
    check("settlement_periods_list", periodList.ok && Array.isArray(periodList.body), { status: periodList.status });
    async function ensurePeriod(code, name, start, end) {
      const existing = periodList.body.find((row) => row.code === code);
      if (existing) { evidence.skipped.push(`period:${code}`); return existing; }
      const created = await request("/api/v1/transport/settlement-periods", { method: "POST", headers, body: JSON.stringify({ code, name, start_date: start, end_date: end }) });
      check(`period_${code}`, created.status === 201 && Boolean(created.body.id), { status: created.status, error: created.body?.message });
      return created.body;
    }
    const week39 = await ensurePeriod("SEM-2026-39", "Semana 39 · 28 sep al 04 oct 2026", "2026-09-28", "2026-10-04");
    const week40 = await ensurePeriod("SEM-2026-40", "Semana 40 · 05 al 11 oct 2026", "2026-10-05", "2026-10-11");

    // ---- Paquetes de ejemplo ----
    const packageList = await request("/api/v1/transport/settlement-packages?limit=300", { headers });
    check("settlement_packages_list", packageList.ok && Array.isArray(packageList.body), { status: packageList.status });
    const packageExists = (code) => packageList.body.some((row) => row.code === code);

    async function createPackage(code, carrier, period, typeCode, observation) {
      const created = await request("/api/v1/transport/settlement-packages", { method: "POST", headers, body: JSON.stringify({ code, carrier_id: carrier.id, period_id: period.id, type_code: typeCode, currency: "COP", observation }) });
      check(`package_${code}_created`, created.status === 201 && created.body.status === "borrador", { status: created.status, error: created.body?.message });
      return created.body;
    }
    async function post(pkg, suffix, payload, name, expect) {
      const response = await request(`/api/v1/transport/settlement-packages/${pkg.id}/${suffix}`, { method: "POST", headers, body: JSON.stringify(payload) });
      check(name, response.ok && expect(response.body), { status: response.status, error: response.body?.message });
      return response.body;
    }

    const item = (extra) => ({ base_type: "viaje", quantity: 1, unit: "VIAJE", stop_count: 1, vehicle_type: "camion", service_level: "normal", ...extra });

    // LIQ-2026-001 · Andinos · semana 39 · ciclo completo hasta liquidada (con ajuste y contabilizacion).
    if (packageExists("LIQ-2026-001")) evidence.skipped.push("package:LIQ-2026-001");
    else {
      let pkg = await createPackage("LIQ-2026-001", carrierA, week39, "TRANSPORTADOR", "Cierre semanal de rutas nacionales.");
      let body = await post(pkg, "items", { version: pkg.version, items: [
        item({ guide_reference: "GUI-10041", service: "Flete nacional", route_description: "Bogota → Medellin", origin_name: "Bodega Norte Bogota", destination_name: "Centro de distribucion Medellin", destination_city: "Bogota", vehicle_plate: "WGY-482", distance_km: 120, weight_kg: 3500, volume_m3: 9, stop_count: 3, service_date: "2026-09-29", reported_value: 1850000 }),
        item({ guide_reference: "GUI-10042", service: "Flete nacional", route_description: "Bogota → Ibague", origin_name: "Bodega Norte Bogota", destination_name: "Planta Ibague", destination_city: "Bogota", vehicle_plate: "WGY-482", distance_km: 210, weight_kg: 5200, volume_m3: 12, stop_count: 1, service_date: "2026-09-30", reported_value: 2400000 })
      ] }, "liq001_items", (b) => b.items?.length === 2);
      body = await post(body, "validate", { version: body.version }, "liq001_validated", (b) => b.status === "validando");
      body = await post(body, "precalculate", { version: body.version }, "liq001_precalculated", (b) => b.status === "preliquidada" && Number(b.calculated_total) > 0);
      const firstItem = body.items[0];
      body = await post(body, "adjustments", { item_id: firstItem.id, delta: -80000, reason: "Descuento de flete por viaje compartido", version: body.version }, "liq001_adjusted", (b) => b.adjustment.delta === -80000 && near(b.adjusted_total, b.calculated_total - 80000));
      body = await post(body, "submit", { version: body.version }, "liq001_submitted", (b) => b.status === "en_revision");
      body = await post(body, "decision", { decision: "aprobada", comment: "Cierre semanal verificado contra manifiestos.", version: body.version }, "liq001_approved", (b) => b.status === "aprobada" && near(b.approved_total, b.adjusted_total));
      body = await post(body, "account", { reference: "CB-2026-00123", accounting_period: "2026-10", payload: { payment_date: "2026-10-08", voucher: "CE-45871" } }, "liq001_accounted", (b) => b.status === "contabilizada" && b.idempotent_replay === false);
      body = await post(body, "close", { version: body.version }, "liq001_closed", (b) => b.status === "liquidada");
      evidence.created["LIQ-2026-001"] = { id: body.id, status: body.status, calculated_total: body.calculated_total, adjusted_total: body.adjusted_total, approved_total: body.approved_total, accounted_total: body.accounted_total };
    }

    // LIQ-2026-002 · Caribe Express · semana 39 · preliquidada lista para ajustes.
    if (packageExists("LIQ-2026-002")) evidence.skipped.push("package:LIQ-2026-002");
    else {
      let pkg = await createPackage("LIQ-2026-002", carrierB, week39, "TRANSPORTADOR", "Rutas urbanas de cierre de mes.");
      let body = await post(pkg, "items", { version: pkg.version, items: [
        item({ guide_reference: "GUI-20011", service: "Flete urbano", route_description: "Barranquilla → Soledad", origin_name: "CEDI Caribe", destination_name: "Deposito Soledad", destination_city: "Barranquilla", vehicle_plate: "SZX-119", vehicle_type: "furgon", distance_km: 68, weight_kg: 1800, volume_m3: 6, stop_count: 2, service_date: "2026-09-28", reported_value: 720000 }),
        item({ guide_reference: "GUI-20012", service: "Flete urbano", route_description: "Barranquilla → Malambo", origin_name: "CEDI Caribe", destination_name: "Tienda Malambo", destination_city: "Barranquilla", vehicle_plate: "SZX-119", vehicle_type: "furgon", distance_km: 95, weight_kg: 2400, volume_m3: 7.5, stop_count: 1, service_date: "2026-09-30", reported_value: 910000 })
      ] }, "liq002_items", (b) => b.items?.length === 2);
      body = await post(body, "validate", { version: body.version }, "liq002_validated", (b) => b.status === "validando");
      body = await post(body, "precalculate", { version: body.version }, "liq002_precalculated", (b) => b.status === "preliquidada" && Number(b.adjusted_total) > 0);
      evidence.created["LIQ-2026-002"] = { id: body.id, status: body.status, calculated_total: body.calculated_total, adjusted_total: body.adjusted_total };
    }

    // LIQ-2026-003 · Flota propia sin tarifa · semana 40 · con novedad bloqueante (tarifa inexistente).
    if (packageExists("LIQ-2026-003")) evidence.skipped.push("package:LIQ-2026-003");
    else {
      let pkg = await createPackage("LIQ-2026-003", carrierC, week40, "TRANSPORTADOR", "Reparto propio; tarifa pendiente de cargue.");
      let body = await post(pkg, "items", { version: pkg.version, items: [
        item({ guide_reference: "GUI-30021", service: "Reparto propio", route_description: "Bogota → Chia", origin_name: "Bodega Norte Bogota", destination_name: "Punto Chia", destination_city: "Bogota", vehicle_plate: "TKL-907", distance_km: 52, weight_kg: 2100, volume_m3: 8, stop_count: 2, service_date: "2026-10-05", reported_value: 640000 })
      ] }, "liq003_items", (b) => b.items?.length === 1);
      body = await post(body, "validate", { version: body.version }, "liq003_validated", (b) => b.status === "validando");
      body = await post(body, "precalculate", { version: body.version }, "liq003_rate_novedad", (b) => b.status === "con_novedad" && b.issues?.some((issue) => issue.category === "tarifa_inexistente" && issue.blocking));
      evidence.created["LIQ-2026-003"] = { id: body.id, status: body.status, issues: (body.issues || []).map((issue) => issue.category) };
    }

    // LIQ-2026-004 · Andinos · semana 40 · aprobada, pendiente de contabilizacion.
    if (packageExists("LIQ-2026-004")) evidence.skipped.push("package:LIQ-2026-004");
    else {
      let pkg = await createPackage("LIQ-2026-004", carrierA, week40, "TRANSPORTADOR", "Semana en curso; aprobada pendiente de contabilidad.");
      let body = await post(pkg, "items", { version: pkg.version, items: [
        item({ guide_reference: "GUI-10051", service: "Flete nacional", route_description: "Bogota → Villavicencio", origin_name: "Bodega Norte Bogota", destination_name: "Centro logístico Villavicencio", destination_city: "Bogota", vehicle_plate: "WGY-482", distance_km: 145, weight_kg: 4100, volume_m3: 10, stop_count: 2, service_date: "2026-10-06", reported_value: 1320000 })
      ] }, "liq004_items", (b) => b.items?.length === 1);
      body = await post(body, "validate", { version: body.version }, "liq004_validated", (b) => b.status === "validando");
      body = await post(body, "precalculate", { version: body.version }, "liq004_precalculated", (b) => b.status === "preliquidada" && Number(b.adjusted_total) > 0);
      body = await post(body, "submit", { version: body.version }, "liq004_submitted", (b) => b.status === "en_revision");
      body = await post(body, "decision", { decision: "aprobada", comment: "Ruta recurrente sin novedades.", version: body.version }, "liq004_approved", (b) => b.status === "aprobada" && Number(b.approved_total) > 0);
      evidence.created["LIQ-2026-004"] = { id: body.id, status: body.status, approved_total: body.approved_total };
    }

    // LIQ-2026-005 · Caribe Express · semana 40 · borrador con tipo personalizado (Flete urbano).
    if (packageExists("LIQ-2026-005")) evidence.skipped.push("package:LIQ-2026-005");
    else {
      let pkg = await createPackage("LIQ-2026-005", carrierB, week40, "FLETE_URBANO", "Borrador para demostrar tipos personalizados y captura.");
      let body = await post(pkg, "items", { version: pkg.version, items: [
        item({ guide_reference: "GUI-20021", service: "Ultima milla", route_description: "Barranquilla → Puerto Colombia", origin_name: "CEDI Caribe", destination_name: "Tienda Puerto Colombia", destination_city: "Barranquilla", vehicle_plate: "SZX-119", vehicle_type: "furgon", distance_km: 44, weight_kg: 950, volume_m3: 3, stop_count: 1, service_date: "2026-10-07", reported_value: 380000 })
      ] }, "liq005_items", (b) => b.items?.length === 1);
      evidence.created["LIQ-2026-005"] = { id: body.id, status: body.status };
    }

    // ---- Consolidacion por vehiculo (vista contable de la torre) ----
    const consolidation = await request("/api/v1/transport/settlement-vehicle-consolidation", { headers });
    check("vehicle_consolidation", consolidation.ok && consolidation.body.totals.vehicle_count >= 3, { status: consolidation.status, vehicles: consolidation.body.totals?.vehicle_count });
    const plates = (consolidation.body.vehicles || []).map((vehicle) => vehicle.vehicle_plate);
    check("consolidation_plates", ["WGY-482", "SZX-119", "TKL-907"].every((plate) => plates.includes(plate)), { plates });
    const wgy = (consolidation.body.vehicles || []).find((vehicle) => vehicle.vehicle_plate === "WGY-482");
    check("consolidation_wgy_multipackage", Boolean(wgy) && wgy.packages.length === 2 && wgy.guide_count >= 3 && Number(wgy.adjusted_total) > 0, { packages: wgy?.packages?.map((pkg) => pkg.code), guide_count: wgy?.guide_count, adjusted_total: wgy?.adjusted_total });
    evidence.created.consolidation = { vehicles: consolidation.body.totals.vehicle_count, lines: consolidation.body.totals.line_count, guides: consolidation.body.totals.guide_count, adjusted_total: consolidation.body.totals.adjusted_total, approved_total: consolidation.body.totals.approved_total };

    evidence.status = "passed";
    evidence.purpose = "Ejemplos de liquidacion idempotentes para la torre: ciclo completo liquidada, preliquidada, con novedad por tarifa inexistente, aprobada pendiente de contabilidad y borrador con tipo personalizado.";
  } catch (error) {
    evidence.status = "failed";
    evidence.error = error.message;
    throw error;
  } finally {
    evidence.finished_at = new Date().toISOString();
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, JSON.stringify(evidence, null, 2));
    console.log(`Evidencia ejemplos de liquidacion: ${output}`);
  }
}

main().catch((error) => { console.error(`CARGA DE EJEMPLOS DE LIQUIDACION BLOQUEADA: ${error.message}`); process.exitCode = 1; });
