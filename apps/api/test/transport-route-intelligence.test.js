const test = require("node:test");
const assert = require("node:assert/strict");

const { enrichRouteWithGoogle } = require("../src/modules/transport/route-intelligence");

const legs = [
  {
    from_coordinate: { latitude: 4.676, longitude: -74.116 },
    to_coordinate: { latitude: 4.711, longitude: -74.072 },
  },
];

function restoreEnv(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

test("Google Routes queda como proveedor opcional cuando no hay credencial backend", async () => {
  const previousGoogleRoutesKey = process.env.GOOGLE_ROUTES_API_KEY;
  const previousGoogleMapsKey = process.env.GOOGLE_MAPS_API_KEY;
  const previousGoogleMapsRoutesKey = process.env.GOOGLE_MAPS_ROUTES_API_KEY;
  delete process.env.GOOGLE_ROUTES_API_KEY;
  delete process.env.GOOGLE_MAPS_API_KEY;
  delete process.env.GOOGLE_MAPS_ROUTES_API_KEY;

  try {
    const result = await enrichRouteWithGoogle({ legs });
    assert.equal(result.provider, "google_routes");
    assert.equal(result.status, "not_configured");
    assert.equal(result.traffic_available, false);
    assert.deepEqual(result.routes, []);
  } finally {
    restoreEnv("GOOGLE_ROUTES_API_KEY", previousGoogleRoutesKey);
    restoreEnv("GOOGLE_MAPS_API_KEY", previousGoogleMapsKey);
    restoreEnv("GOOGLE_MAPS_ROUTES_API_KEY", previousGoogleMapsRoutesKey);
  }
});

test("Google Routes se consulta desde backend sin exponer la API key en la respuesta", async (t) => {
  const previousKey = process.env.GOOGLE_ROUTES_API_KEY;
  process.env.GOOGLE_ROUTES_API_KEY = "test-secret-key";

  t.mock.method(global, "fetch", async (url, options = {}) => {
    assert.equal(url, "https://routes.googleapis.com/directions/v2:computeRoutes");
    assert.equal(options.method, "POST");
    assert.equal(options.headers["X-Goog-Api-Key"], "test-secret-key");
    assert.match(options.headers["X-Goog-FieldMask"], /routes\.polyline\.encodedPolyline/);
    const body = JSON.parse(options.body);
    assert.equal(body.routingPreference, "TRAFFIC_AWARE_OPTIMAL");
    assert.equal(body.computeAlternativeRoutes, true);
    return {
      ok: true,
      json: async () => ({
        routes: [
          {
            distanceMeters: 9770,
            duration: "780s",
            staticDuration: "600s",
            polyline: { encodedPolyline: "_p~iF~ps|U_ulLnnqC_mqNvxq`@" },
            travelAdvisory: { speedReadingIntervals: [{ speed: "SLOW" }] },
          },
        ],
      }),
    };
  });

  try {
    const result = await enrichRouteWithGoogle({ legs, departureTime: "2026-10-02T18:00:00Z" });
    assert.equal(result.status, "configured");
    assert.equal(result.traffic_available, true);
    assert.equal(result.routes[0].distance_km, 9.77);
    assert.equal(result.routes[0].duration_minutes, 13);
    assert.equal(result.routes[0].delay_minutes, 3);
    assert.equal(result.routes[0].traffic_level, "medio");
    assert.equal(JSON.stringify(result).includes("test-secret-key"), false);
  } finally {
    restoreEnv("GOOGLE_ROUTES_API_KEY", previousKey);
  }
});
