const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const E = require("../src/modules/transport/settlement-engine");
const RI = require("../src/modules/transport/route-intelligence");
const tms = require("../src/modules/transport/tms-service");

const rate = (over = {}) => ({ id: 1, code: "TAR-1", version: 2, carrier_id: 9, status: "activa", active: true, priority: 100, currency: "COP", valid_from: "2026-01-01T00:00:00.000Z", valid_to: "2026-12-31T00:00:00.000Z", base_rate: 500000, minimum_charge: 0, price_per_km: 2500, price_per_kg: 25, price_per_m3: 1000, price_per_stop: 50000, fuel_surcharge_pct: 10, tolls_flat: 30000, ...over });

// ---- Etapa 4: paradas adicionales (incluidas + extra) ----

test("tarifa fija 85000 con 2 paradas extra de 12000 totaliza 109000", () => {
  const r = rate({ base_rate: 85000, price_per_stop: 12000, price_per_km: 0, price_per_kg: 0, price_per_m3: 0, fuel_surcharge_pct: 0, tolls_flat: 0, metadata: { stops_included: 0 } });
  const calc = E.calculateItemAmount(r, { stop_count: 2 });
  assert.equal(calc.unit_amount, 109000);
  assert.equal(calc.components.stops, 24000);
  assert.equal(calc.minimum_applied, false);
});

test("las paradas incluidas no se cobran y el excedente se factura por unidad", () => {
  const r = rate({ base_rate: 100000, price_per_stop: 12000, price_per_km: 0, price_per_kg: 0, price_per_m3: 0, fuel_surcharge_pct: 0, tolls_flat: 0, metadata: { stops_included: 2 } });
  assert.equal(E.calculateItemAmount(r, { stop_count: 1 }).unit_amount, 100000);
  const three = E.calculateItemAmount(r, { stop_count: 3 });
  assert.equal(three.components.stops, 12000);
  assert.equal(three.unit_amount, 112000);
});

test("stop_count menor o igual a las incluidas nunca produce paradas negativas", () => {
  const r = rate({ metadata: { stops_included: 5 } });
  const calc = E.calculateItemAmount(r, { stop_count: 2 });
  assert.equal(calc.components.stops, 0);
  assert.equal(calc.unit_amount >= rate({ metadata: { stops_included: 5 } }).base_rate, true);
});

// ---- Etapa 4: costos adicionales (espera, cargue, otros) ----

test("tiempo de espera cobra solo los minutos que exceden los incluidos", () => {
  const r = rate({ metadata: { wait_time_included_min: 30, wait_time_rate_per_min: 5000 } });
  assert.equal(E.calculateItemAmount(r, { stop_count: 1, wait_minutes: 20 }).components.wait_time, undefined);
  const calc = E.calculateItemAmount(r, { stop_count: 1, wait_minutes: 50 });
  assert.equal(calc.components.wait_time, 100000);
});

test("cargue/descargue y otros costos se suman como componentes planos y auditan su etiqueta", () => {
  const r = rate({ metadata: { load_unload_flat: 40000, other_costs_amount: 15000, other_costs_label: "PeajeTAG" } });
  const calc = E.calculateItemAmount(r, { stop_count: 1 });
  assert.equal(calc.components.load_unload, 40000);
  assert.equal(calc.components.other_costs, 15000);
  assert.equal(calc.snapshot.other_costs_label, "PeajeTAG");
});

// ---- Etapa 4: combustible estimado reemplaza al recargo porcentual ----

test("combustible estimado reemplaza el recargo porcentual aunque la tarifa lo tenga configurado", () => {
  const r = rate({ fuel_surcharge_pct: 15, metadata: { fuel_mode: "estimated", fuel_estimated_cost: 75000 } });
  const calc = E.calculateItemAmount(r, { stop_count: 1 });
  assert.equal(calc.components.fuel, 75000);
  assert.equal(calc.snapshot.fuel_mode, "estimated");
  assert.equal(calc.snapshot.fuel_estimated_cost, 75000);
});

test("sin combustible estimado, el recargo porcentual sigue calculando sobre el subtotal ampliado", () => {
  const r = rate({ base_rate: 100000, price_per_km: 0, price_per_kg: 0, price_per_m3: 0, price_per_stop: 0, tolls_flat: 0, metadata: { load_unload_flat: 50000, wait_time_included_min: 0, wait_time_rate_per_min: 10000 } });
  const calc = E.calculateItemAmount(r, { stop_count: 1, wait_minutes: 10 });
  // subtotal: 100000 base + 100000 espera + 50000 cargue = 250000 -> recargo 10% = 25000
  assert.equal(calc.components.fuel, 25000);
  assert.equal(calc.unit_amount, 275000);
});

// ---- Compatibilidad: tarifas legacy sin metadata extra ----

test("tarifa sin metadata nueva conserva la aritmetica y la forma legacy", () => {
  const legacy = rate({});
  const calc = E.calculateItemAmount(legacy, { stop_count: 3, wait_minutes: 90 });
  // subtotal legacy: 500000 base + 3 x 50000 paradas + 30000 peajes = 680000 -> recargo 10% = 68000
  assert.equal(calc.components.stops, 150000);
  assert.equal(calc.components.wait_time, undefined);
  assert.equal(calc.components.load_unload, undefined);
  assert.equal(calc.components.other_costs, undefined);
  assert.equal(calc.components.fuel, 68000);
  assert.equal(calc.unit_amount, 748000);
  assert.equal("fuel_mode" in calc.snapshot, false);
});

test("metadata con valores negativos se acota a cero sin romper el calculo", () => {
  const r = rate({ metadata: { stops_included: -4, wait_time_included_min: -10, load_unload_flat: -50, fuel_estimated_cost: -1 } });
  const calc = E.calculateItemAmount(r, { stop_count: 2 });
  assert.equal(calc.components.stops, 100000);
  assert.equal(calc.components.fuel >= 0, true);
});

test("el cobro minimo aplica sobre el subtotal ampliado de la etapa 4", () => {
  const r = rate({ base_rate: 85000, minimum_charge: 200000, price_per_stop: 12000, fuel_surcharge_pct: 0, metadata: { stops_included: 0 } });
  const calc = E.calculateItemAmount(r, { stop_count: 2 });
  assert.equal(calc.unit_amount, 200000);
  assert.equal(calc.minimum_applied, true);
});

// ---- calculateRateQuote del TMS replica la misma semantica ----

test("calculateRateQuote del TMS factura paradas extra y combustible estimado igual que el motor", () => {
  const r = rate({ base_rate: 85000, minimum_charge: 0, price_per_stop: 12000, price_per_km: 0, price_per_kg: 0, price_per_m3: 0, fuel_surcharge_pct: 0, tolls_flat: 0, metadata: { stops_included: 1, fuel_mode: "estimated", fuel_estimated_cost: 60000 } });
  const quote = tms.calculateRateQuote(r, { stop_count: 3, wait_minutes: 0 });
  assert.equal(quote.components.stops, 24000); // 3 - 1 incluida = 2 extra
  assert.equal(quote.components.fuel, 60000);
  assert.equal(quote.total, 169000);
  assert.equal(quote.fuel_mode, "estimated");
});

// ---- route-intelligence: geocoding, merge y simulacion con respaldo ----

test("geocodeCandidates sin clave responde no configurado sin llamar a Google", () => {
  const saved = process.env.GOOGLE_ROUTES_API_KEY;
  delete process.env.GOOGLE_ROUTES_API_KEY;
  delete process.env.GOOGLE_MAPS_API_KEY;
  delete process.env.GOOGLE_MAPS_ROUTES_API_KEY;
  return RI.geocodeCandidates("Cra 10 Bogota").then((result) => {
    assert.equal(result.configured, false);
    assert.deepEqual(result.candidates, []);
    if (saved) process.env.GOOGLE_ROUTES_API_KEY = saved;
  });
});

test("geocodeCandidates parsea resultados OK de Google y filtra sin coordenadas", () => {
  process.env.GOOGLE_ROUTES_API_KEY = "test-key";
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ status: "OK", results: [
      { formatted_address: "Cra 10 #20-30, Bogota", geometry: { location: { lat: 4.65, lng: -74.1 } } },
      { formatted_address: "Sin coordenadas" }
    ] })
  });
  return RI.geocodeCandidates("Cra 10").then((result) => {
    globalThis.fetch = originalFetch;
    delete process.env.GOOGLE_ROUTES_API_KEY;
    assert.equal(result.configured, true);
    assert.equal(result.candidates.length, 1);
    assert.equal(result.candidates[0].source, "google");
    assert.equal(result.candidates[0].latitude, 4.65);
  });
});

test("mergePlaceCandidates prioriza internos y deduplica por coordenadas", () => {
  const internal = [{ label: "CEDI-BOG", latitude: 4.65, longitude: -74.1, source: "sede" }];
  const google = [{ label: "Cra 10, Bogota", latitude: 4.650001, longitude: -74.100001, source: "google" }, { label: "Otro", latitude: 6.2, longitude: -75.5, source: "google" }];
  const merged = RI.mergePlaceCandidates(internal, google);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].source, "sede");
  assert.equal(merged[1].label, "Otro");
});

test("simulateRoutePoints usa Google cuando responde y duplica ida y regreso", () => {
  process.env.GOOGLE_ROUTES_API_KEY = "test-key";
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ routes: [{ distanceMeters: 42000, duration: "2400s", staticDuration: "2350s", polyline: { encodedPolyline: "abc" } }] })
  });
  const origin = { latitude: 4.65, longitude: -74.1 };
  const destination = { latitude: 4.9, longitude: -74.0 };
  return RI.simulateRoutePoints({ origin, destination, intermediates: [{ latitude: 4.7, longitude: -74.05 }], round_trip: true }).then((result) => {
    globalThis.fetch = originalFetch;
    delete process.env.GOOGLE_ROUTES_API_KEY;
    assert.equal(result.source, "google");
    assert.equal(result.distance_km, 84);
    assert.equal(result.duration_minutes, 80);
    assert.equal(result.polyline, "abc");
  });
});

test("simulateRoutePoints sin clave cae a estimacion vial con factor y marca el estado", () => {
  delete process.env.GOOGLE_ROUTES_API_KEY;
  delete process.env.GOOGLE_MAPS_API_KEY;
  delete process.env.GOOGLE_MAPS_ROUTES_API_KEY;
  const origin = { latitude: 4.65, longitude: -74.1 };
  const destination = { latitude: 4.75, longitude: -74.05 };
  return RI.simulateRoutePoints({ origin, destination }).then((result) => {
    assert.equal(result.source, "estimate");
    assert.equal(result.distance_km > 10, true);
    assert.equal(result.duration_minutes >= 1, true);
    assert.equal(result.google_status, "not_configured");
    assert.match(result.message, /factor vial/);
  });
});

// ---- Registro de endpoints y esquema ----

test("las rutas del simulador y el autocompletado quedan registradas con permiso de lectura", () => {
  const root = path.join(__dirname, "..");
  const routesSource = fs.readFileSync(path.join(root, "src/modules/transport/routes.js"), "utf8");
  assert.match(routesSource, /fastify\.get\("\/transport\/route-places", \{ preHandler: requirePermission\("transport", "read"\) \}/);
  assert.match(routesSource, /fastify\.post\("\/transport\/route-simulator", \{ schema: tmsSchemas\.routeSimulatorSchema, preHandler: requirePermission\("transport", "read"\) \}/);
  const schemaSource = fs.readFileSync(path.join(root, "src/modules/transport/tms-schema.js"), "utf8");
  assert.match(schemaSource, /routeSimulatorSchema/);
  assert.match(schemaSource, /anyOf: \[\{ required: \["sede_id"\] \}/);
  assert.equal(typeof tms.searchRoutePlaces, "function");
  assert.equal(typeof tms.simulateRoute, "function");
});
