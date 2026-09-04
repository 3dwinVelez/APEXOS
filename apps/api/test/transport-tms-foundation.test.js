const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { assertTripTransition, needValidationErrors, vehicleCapacityKg, optimizeStopOrder, calculateRateQuote, TRIP_TRANSITIONS } = require("../src/modules/transport/tms-service");

test("la maquina de estados TMS permite solo el flujo operativo controlado", () => {
  assert.deepEqual(TRIP_TRANSITIONS.planificado, ["ofertado", "asignado", "cancelado"]);
  assert.doesNotThrow(() => assertTripTransition("asignado", "en_cargue"));
  assert.doesNotThrow(() => assertTripTransition("entregado", "cerrado"));
  assert.throws(() => assertTripTransition("planificado", "cerrado"), (error) => error.code === "TMS_INVALID_TRIP_TRANSITION" && error.statusCode === 409);
  assert.throws(() => assertTripTransition("cerrado", "en_transito"), /No se permite/);
});

test("una necesidad incompleta hace visibles sus problemas logisticos", () => {
  assert.deepEqual(needValidationErrors({ weight_kg: 0, volume_m3: 0 }, { latitude: null, longitude: null, window_start: null, window_end: null }), [
    "peso_faltante", "volumen_faltante", "coordenadas_destino_faltantes", "ventana_entrega_faltante"
  ]);
  assert.deepEqual(needValidationErrors({ weight_kg: 250, volume_m3: 3 }, { latitude: 6.2, longitude: -75.5, window_start: "08:00", window_end: "11:00" }), []);
});

test("la capacidad vehicular se normaliza a kilogramos", () => {
  assert.equal(vehicleCapacityKg({ capacity_value: 4.5, capacity_unit: "ton" }), 4500);
  assert.equal(vehicleCapacityKg({ capacity_value: 1200, capacity_unit: "kg" }), 1200);
});

test("el planeador secuencia por proximidad y conserva el detalle de los tramos", () => {
  const origin = { name: "Centro", latitude: 4.65, longitude: -74.1 };
  const far = { id: 2, delivery_point: { name: "Lejano", latitude: 4.9, longitude: -74.3 } };
  const near = { id: 1, delivery_point: { name: "Cercano", latitude: 4.66, longitude: -74.11 } };
  const route = optimizeStopOrder(origin, [far, near], { road_factor: 1.2 });
  assert.deepEqual(route.ordered.map((need) => need.id), [1, 2]);
  assert.equal(route.legs.length, 2);
  assert.ok(route.distance_km > 0);
});

test("el tarifario calcula componentes, combustible y cobro minimo", () => {
  const quote = calculateRateQuote({ id: 7, code: "NAC", version: 2, currency: "COP", base_rate: 100, minimum_charge: 300, price_per_km: 2, price_per_kg: 0.5, price_per_m3: 10, price_per_stop: 5, fuel_surcharge_pct: 10, tolls_flat: 20, priority: 1 }, { distance_km: 10, weight_kg: 100, volume_m3: 2, stop_count: 2 });
  assert.equal(quote.components.fuel, 22);
  assert.equal(quote.total, 300);
  assert.equal(quote.minimum_applied, true);
});

test("el esquema y la migracion contienen la cadena TMS auditable", () => {
  const schema = fs.readFileSync(path.resolve(__dirname, "../prisma/schema.prisma"), "utf8");
  const migration = fs.readFileSync(path.resolve(__dirname, "../prisma/migrations/20260904120000_transport_tms_foundation/migration.sql"), "utf8");
  for (const model of ["TransportCarrier", "TransportDriver", "TransportOrigin", "TransportDeliveryPoint", "TransportRateCard", "TransportNeed", "TransportTrip", "TransportStop", "TransportTripEvent", "TransportDeliveryAttempt", "TransportPod", "TransportSettlement"]) {
    assert.match(schema, new RegExp(`model ${model}\\s+\\{`));
    if (!["TransportOrigin", "TransportRateCard"].includes(model)) assert.match(migration, new RegExp(`CREATE TABLE "${model}"`));
  }
  const planningMigration = fs.readFileSync(path.resolve(__dirname, "../prisma/migrations/20260904160000_transport_tms_planning/migration.sql"), "utf8");
  assert.match(planningMigration, /CREATE TABLE "TransportOrigin"/);
  assert.match(planningMigration, /CREATE TABLE "TransportRateCard"/);
  assert.match(schema, /estimated_cost\s+Decimal/);
  assert.match(schema, /committed_cost\s+Decimal/);
  assert.match(schema, /actual_cost\s+Decimal/);
  assert.match(schema, /@@unique\(\[tenant_id, code\]\)/);
});

test("las rutas TMS se registran y exigen autenticacion", async () => {
  process.env.NODE_ENV = "test";
  process.env.REDIS_DISABLED = "true";
  process.env.DISABLE_REDIS = "true";
  process.env.JWT_SECRET ||= "transport-tms-foundation-test-secret-32-characters";
  const build = require("../server");
  const app = await build();
  try {
    await app.ready();
    for (const request of [
      { method: "GET", url: "/api/v1/transport/control-tower" },
      { method: "GET", url: "/api/v1/transport/carriers" },
      { method: "GET", url: "/api/v1/transport/delivery-points" },
      { method: "GET", url: "/api/v1/transport/origins" },
      { method: "GET", url: "/api/v1/transport/rate-cards" },
      { method: "GET", url: "/api/v1/transport/planning/workbench" },
      { method: "POST", url: "/api/v1/transport/planning/evaluate", payload: { origin_id: 1, need_ids: [1] } },
      { method: "GET", url: "/api/v1/transport/needs" },
      { method: "GET", url: "/api/v1/transport/trips" },
      { method: "POST", url: "/api/v1/transport/trips/1/transition", payload: { status: "en_cargue" } }
    ]) {
      const response = await app.inject(request);
      assert.notEqual(response.statusCode, 404, `${request.url} debe estar registrada`);
      assert.equal(response.statusCode, 401, `${request.url} debe exigir autenticacion`);
    }
  } finally {
    await app.close();
  }
});
