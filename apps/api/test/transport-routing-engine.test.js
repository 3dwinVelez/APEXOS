const test = require("node:test");
const assert = require("node:assert/strict");
const { planWithOsrm, planRoadRoute } = require("../src/modules/transport/routing-engine");

const origin = { name: "Bogotá", latitude: 4.65, longitude: -74.1 };
const needs = [
  { id: 10, delivery_point: { name: "Medellín", latitude: 6.2442, longitude: -75.5812 } },
  { id: 20, delivery_point: { name: "Cali", latitude: 3.4516, longitude: -76.532 } },
];

test("OSRM entrega geometría vial y conserva el orden optimizado", async (t) => {
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });
  global.fetch = async (url) => {
    assert.match(String(url), /trip\/v1\/driving\/-74\.1,4\.65;-75\.5812,6\.2442;-76\.532,3\.4516/);
    assert.match(String(url), /geometries=geojson/);
    return { ok: true, json: async () => ({ code: "Ok", waypoints: [{ waypoint_index: 0 }, { waypoint_index: 2 }, { waypoint_index: 1 }], trips: [{ distance: 920000, duration: 65000, geometry: { type: "LineString", coordinates: [[-74.1, 4.65], [-76.532, 3.4516], [-75.5812, 6.2442]] }, legs: [{ distance: 460000, duration: 32000 }, { distance: 460000, duration: 33000 }] }] }) };
  };
  const result = await planWithOsrm(origin, needs);
  assert.equal(result.engine, "osrm");
  assert.deepEqual(result.ordered.map((need) => need.id), [20, 10]);
  assert.equal(result.distance_km, 920);
  assert.equal(result.geometry.type, "LineString");
  assert.equal(result.legs[0].need_id, 20);
});

test("una caída del direccionador activa fallback explícito", async (t) => {
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });
  global.fetch = async () => { throw new Error("timeout"); };
  const fallback = (_origin, rows) => ({ ordered: rows, legs: [], distance_km: 100, road_factor: 1.2 });
  const result = await planRoadRoute(origin, needs, {}, fallback);
  assert.equal(result.engine, "geodesic_fallback");
  assert.equal(result.geometry, null);
  assert.equal(result.routing_warning, "timeout");
});
