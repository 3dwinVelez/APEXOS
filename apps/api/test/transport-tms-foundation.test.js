const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { assertTripTransition, needValidationErrors, vehicleCapacityKg, optimizeStopOrder, calculateRateQuote, gpsPositionData, parseCsv, calculateLiveStatus, validatePodInput, validateAttemptInput, TRIP_TRANSITIONS } = require("../src/modules/transport/tms-service");
const { validateEvidence } = require("../src/modules/transport/tms-evidence-storage");

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

test("el tracking movil normaliza posiciones y rechaza coordenadas o tiempos imposibles", () => {
  const row = gpsPositionData({ client_event_id: "evt-1", recorded_at: "2026-09-04T15:00:00.000Z", latitude: 6.2442, longitude: -75.5812, speed_kph: 32, battery_pct: 81 }, { trip_id: 7, driver_id: 3, device_id: "phone-3" });
  assert.equal(row.trip_id, 7);
  assert.equal(row.device_id, "phone-3");
  assert.equal(row.speed_kph, 32);
  assert.throws(() => gpsPositionData({ client_event_id: "bad", recorded_at: "2026-09-04T15:00:00.000Z", latitude: 95, longitude: -75 }, { trip_id: 7, device_id: "phone" }), (error) => error.code === "TMS_INVALID_LATITUDE");
  assert.throws(() => gpsPositionData({ client_event_id: "future", recorded_at: "2099-01-01T00:00:00.000Z", latitude: 6, longitude: -75 }, { trip_id: 7, device_id: "phone" }), (error) => error.code === "TMS_GPS_FUTURE_TIMESTAMP");
});

test("la importacion CSV respeta encabezados y valores entre comillas", () => {
  const rows = parseCsv('code,origin_code,delivery_point_code,available_at,due_at,weight_kg,volume_m3,source_reference\nORD-1,ORI-1,PTO-1,2026-09-05T08:00:00Z,2026-09-05T17:00:00Z,120,2.5,"PED,001"');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].row, 2);
  assert.equal(rows[0].data.source_reference, "PED,001");
});

test("el monitoreo calcula ETA, geocerca y alertas de telemetria", () => {
  const trip = { stops: [{ id: 1, status: "pendiente", latitude: 6.245, longitude: -75.58, delivery_point: { geofence_radius_m: 200 } }] };
  const live = calculateLiveStatus(trip, { latitude: 6.244, longitude: -75.581, recorded_at: "2026-09-04T15:00:00Z", speed_kph: 30, accuracy_m: 20, battery_pct: 10, is_mocked: true }, new Date("2026-09-04T15:01:00Z"));
  assert.equal(live.signal_status, "activa"); assert.equal(live.inside_geofence, true); assert.ok(live.eta_minutes >= 0);
  assert.deepEqual(live.alerts.map((alert) => alert.code).sort(), ["BATERIA_BAJA", "GPS_SIMULADO"]);
});
test("Turf detecta geocercas poligonales y desvios del corredor", () => { const trip = { metadata: { route_coordinates: [[-75.58, 6.245], [-75.57, 6.25]], corridor_radius_m: 200 }, stops: [{ id: 1, status: "pendiente", latitude: 6.25, longitude: -75.57, metadata: { geofence_geojson: { type: "Polygon", coordinates: [[[-75.6, 6.2], [-75.5, 6.2], [-75.5, 6.3], [-75.6, 6.3], [-75.6, 6.2]]] } }, delivery_point: { geofence_radius_m: 150 } }] }; const live = calculateLiveStatus(trip, { latitude: 6.27, longitude: -75.54, recorded_at: "2026-09-04T15:00:00Z", speed_kph: 30 }, new Date("2026-09-04T15:01:00Z")); assert.equal(live.spatial_engine, "turf"); assert.equal(live.inside_geofence, true); assert.equal(live.off_route, true); assert.ok(live.route_deviation_m > 200); assert.ok(live.alerts.some((alert) => alert.code === "DESVIO_DE_RUTA")); });
test("POD exige evidencias seguras y controla cantidades parciales", () => { const need = { lines: [{ sku: "SKU-1", quantity: 5 }] }; assert.doesNotThrow(() => validatePodInput({ result: "parcial", delivered_lines: [{ sku: "SKU-1", quantity: 3 }], pod: { receiver_name: "Ana", signature: "tms-evidence/acme/firma.png", photos: ["tms-evidence/acme/foto.jpg"] } }, need, {})); assert.throws(() => validatePodInput({ result: "completa", pod: { receiver_name: "Ana", photos: ["data:image/png;base64,abc"] } }, need, {}), (error) => error.code === "TMS_POD_SIGNATURE_REQUIRED" || error.code === "TMS_POD_UNSAFE_EVIDENCE"); assert.throws(() => validatePodInput({ result: "parcial", delivered_lines: [{ sku: "SKU-1", quantity: 8 }], pod: { receiver_name: "Ana", signature: "tms-evidence/acme/firma.png", photos: ["tms-evidence/acme/foto.jpg"] } }, need, {}), (error) => error.code === "TMS_INVALID_PARTIAL_QUANTITY"); });
test("la carga POD inspecciona contenido, dimensiones y MIME", async () => { const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64"); assert.deepEqual(await validateEvidence(png, "image/png"), { mime: "image/png", extension: "png", width: 1, height: 1, checksum_sha256: require("node:crypto").createHash("sha256").update(png).digest("hex") }); await assert.rejects(validateEvidence(png, "image/jpeg"), (error) => error.statusCode === 415); const truncated = png.subarray(0, 24); await assert.rejects(validateEvidence(truncated, "image/png"), (error) => error.statusCode === 422); });
test("las novedades exigen causa, responsable, evidencia y reintento futuro", () => { const valid = { result: "rechazada", cause_code: "CLIENTE_NO_RECIBE", responsible: "cliente", evidence: ["tms-evidence/acme/novedad.jpg"], next_attempt_at: new Date(Date.now() + 3600000).toISOString() }; assert.doesNotThrow(() => validateAttemptInput(valid)); assert.throws(() => validateAttemptInput({ ...valid, evidence: [] }), (error) => error.code === "TMS_NOVELTY_EVIDENCE_REQUIRED"); assert.throws(() => validateAttemptInput({ ...valid, next_attempt_at: new Date(Date.now() - 1000).toISOString() }), (error) => error.code === "TMS_RETRY_DATE_INVALID"); });

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
  const trackingMigration = fs.readFileSync(path.resolve(__dirname, "../prisma/migrations/20260904180000_transport_tms_live_tracking/migration.sql"), "utf8");
  assert.match(schema, /model TransportGpsPosition\s+\{/);
  assert.match(schema, /@@unique\(\[tenant_id, device_id, client_event_id\]\)/);
  assert.match(trackingMigration, /CREATE TABLE "TransportGpsPosition"/);
  assert.match(trackingMigration, /"recorded_at" DESC/);
  const configurationMigration = fs.readFileSync(path.resolve(__dirname, "../prisma/migrations/20260904190000_transport_tms_configuration/migration.sql"), "utf8");
  assert.match(schema, /model TransportTmsConfig\s+\{/);
  assert.match(configurationMigration, /CREATE TABLE "TransportTmsConfig"/);
  const notificationMigration = fs.readFileSync(path.resolve(__dirname, "../prisma/migrations/20260904200000_transport_tms_notifications/migration.sql"), "utf8");
  assert.match(schema, /model TransportNotification\s+\{/); assert.match(notificationMigration, /CREATE TABLE "TransportNotification"/);
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
      { method: "GET", url: "/api/v1/transport/monitoring/live" },
      { method: "GET", url: "/api/v1/transport/monitoring/fleet" },
      { method: "GET", url: "/api/v1/transport/notifications" },
      { method: "GET", url: "/api/v1/transport/pod" }, { method: "GET", url: "/api/v1/transport/pod/stats" }, { method: "GET", url: "/api/v1/transport/pod/1" },
      { method: "POST", url: "/api/v1/transport/trips/1/stops/1/evidence" },
      { method: "GET", url: "/api/v1/transport/evidence/view?reference=tms-evidence/acme/test.png" },
      { method: "POST", url: "/api/v1/transport/notifications/send", payload: { channel: "email", event_type: "MANUAL", recipient: "qa@example.com", body: "Prueba" } },
      { method: "GET", url: "/api/v1/transport/config" },
      { method: "PUT", url: "/api/v1/transport/config/mobile", payload: { tracking_enabled: true } },
      { method: "GET", url: "/api/v1/transport/carriers" },
      { method: "GET", url: "/api/v1/transport/delivery-points" },
      { method: "GET", url: "/api/v1/transport/origins" },
      { method: "GET", url: "/api/v1/transport/rate-cards" },
      { method: "GET", url: "/api/v1/transport/planning/workbench" },
      { method: "POST", url: "/api/v1/transport/planning/evaluate", payload: { origin_id: 1, need_ids: [1] } },
      { method: "GET", url: "/api/v1/transport/needs" },
      { method: "GET", url: "/api/v1/transport/trips" },
      { method: "GET", url: "/api/v1/transport/orders" },
      { method: "GET", url: "/api/v1/transport/orders/1" },
      { method: "POST", url: "/api/v1/transport/orders/import", payload: { csv: "code\nORD-1" } },
      { method: "GET", url: "/api/v1/transport/orders/1/tracking" },
      { method: "GET", url: "/api/v1/transport/orders/1/pod" },
      { method: "GET", url: "/api/v1/transport/trips/1/tracking" },
      { method: "POST", url: "/api/v1/transport/mobile/gps/batch", payload: { trip_id: 1, device_id: "test", positions: [{ client_event_id: "1", recorded_at: "2026-09-04T15:00:00Z", latitude: 6.2, longitude: -75.5 }] } },
      { method: "POST", url: "/api/v1/transport/trips/1/stops/1/arrive", payload: {} },
      { method: "POST", url: "/api/v1/transport/trips/1/stops/1/depart", payload: {} },
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
