const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { enrichRouteWithGoogle, connectionStatus, routeIntelligenceConfig, waypointsFromLegs, safeDepartureTime } = require("../src/modules/transport/route-intelligence");

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
    assert.deepEqual(body.extraComputations, ["TRAFFIC_ON_POLYLINE"]);
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
            travelAdvisory: { speedReadingIntervals: [{ startPolylinePointIndex: 0, endPolylinePointIndex: 2, speed: "SLOW" }] },
          },
          { distanceMeters: 10400, duration: "900s", staticDuration: "720s", polyline: { encodedPolyline: "_p~iF~ps|U_ulLnnqC_mqNvxq`@" }, travelAdvisory: { speedReadingIntervals: [{ startPolylinePointIndex: 1, endPolylinePointIndex: 3, speed: "TRAFFIC_JAM" }] } },
          { distanceMeters: 11200, duration: "840s", staticDuration: "820s", polyline: { encodedPolyline: "_p~iF~ps|U_ulLnnqC_mqNvxq`@" }, travelAdvisory: { speedReadingIntervals: [{ startPolylinePointIndex: 0, endPolylinePointIndex: 3, speed: "NORMAL" }] } },
          { distanceMeters: 12100, duration: "960s", staticDuration: "900s", polyline: { encodedPolyline: "_p~iF~ps|U_ulLnnqC_mqNvxq`@" }, travelAdvisory: { speedReadingIntervals: [] } },
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
    assert.equal(result.routes.length, 4);
    assert.equal(result.routes[0].traffic_segments[0].label, "Trafico lento");
    assert.equal(result.routes[1].traffic_level, "alto");
    assert.ok(result.routes[1].issue_tags.includes("congestion alta"));
    assert.equal(JSON.stringify(result).includes("test-secret-key"), false);
  } finally {
    restoreEnv("GOOGLE_ROUTES_API_KEY", previousKey);
  }
});

test("las paradas intermedias del plan viajan como waypoints de Google Routes", async (t) => {
  const previousKey = process.env.GOOGLE_ROUTES_API_KEY;
  process.env.GOOGLE_ROUTES_API_KEY = "test-secret-key";
  let capturedBody = null;

  t.mock.method(global, "fetch", async (url, options = {}) => {
    capturedBody = JSON.parse(options.body);
    return { ok: true, json: async () => ({ routes: [{ distanceMeters: 9770, duration: "780s", staticDuration: "600s", polyline: { encodedPolyline: "_p~iF~ps|U_ulLnnqC_mqNvxq`@" }, travelAdvisory: { speedReadingIntervals: [] } }] }) };
  });

  const multiStopLegs = [
    { from_coordinate: { latitude: 4.676, longitude: -74.116 }, to_coordinate: { latitude: 4.711, longitude: -74.072 } },
    { from_coordinate: { latitude: 4.711, longitude: -74.072 }, to_coordinate: { latitude: 4.731, longitude: -74.032 } },
    { from_coordinate: { latitude: 4.731, longitude: -74.032 }, to_coordinate: { latitude: 4.751, longitude: -74.012 } },
  ];

  try {
    const result = await enrichRouteWithGoogle({ legs: multiStopLegs });
    assert.equal(capturedBody.intermediates.length, 2);
    assert.deepEqual(capturedBody.intermediates[0], { location: { latLng: { latitude: 4.711, longitude: -74.072 } } });
    assert.deepEqual(capturedBody.intermediates[1], { location: { latLng: { latitude: 4.731, longitude: -74.032 } } });
    assert.equal(result.waypoints_used, 2);
    assert.equal(JSON.stringify(result).includes("test-secret-key"), false);
  } finally {
    restoreEnv("GOOGLE_ROUTES_API_KEY", previousKey);
  }
});

test("waypoints deduplica paradas consecutivas repetidas y respeta el limite de Google", () => {
  const repeated = [
    { from_coordinate: { latitude: 4.676, longitude: -74.116 }, to_coordinate: { latitude: 4.711, longitude: -74.072 } },
    { from_coordinate: { latitude: 4.711, longitude: -74.072 }, to_coordinate: { latitude: 4.711, longitude: -74.072 } },
    { from_coordinate: { latitude: 4.711, longitude: -74.072 }, to_coordinate: { latitude: 4.751, longitude: -74.012 } },
  ];
  assert.equal(waypointsFromLegs(repeated).length, 1);
  const many = Array.from({ length: 40 }, (_, index) => ({
    from_coordinate: { latitude: 4 + index / 100, longitude: -74 },
    to_coordinate: { latitude: 4 + (index + 1) / 100, longitude: -74 },
  }));
  assert.equal(waypointsFromLegs(many).length, 25);
  assert.deepEqual(waypointsFromLegs(legs), []);
});

test("la hora de salida fuera del rango de Google se reemplaza por una hora segura", () => {
  const tooOld = safeDepartureTime("2020-01-01T00:00:00Z");
  assert.ok(tooOld.getTime() > Date.now());
  const tooFar = safeDepartureTime("2100-01-01T00:00:00Z");
  assert.ok(tooFar.getTime() <= Date.now() + 101 * 24 * 3600 * 1000);
  const valid = safeDepartureTime(new Date(Date.now() + 3600 * 1000).toISOString());
  assert.ok(Math.abs(valid.getTime() - (Date.now() + 3600 * 1000)) < 5000);
  assert.ok(safeDepartureTime("no-fecha").getTime() > Date.now());
});

test("errores HTTP de Google se mapean a estados accionables sin filtrar la clave", async (t) => {
  const previousKey = process.env.GOOGLE_ROUTES_API_KEY;
  process.env.GOOGLE_ROUTES_API_KEY = "test-secret-key";
  const cases = [
    { status: 403, expected: "invalid_key", fragment: "403" },
    { status: 429, expected: "quota_exceeded", fragment: "429" },
    { status: 503, expected: "unavailable", fragment: "503" },
  ];

  for (const testCase of cases) {
    t.mock.method(global, "fetch", async () => ({ ok: false, status: testCase.status }));
    const result = await enrichRouteWithGoogle({ legs });
    assert.equal(result.status, testCase.expected);
    assert.ok(result.message.includes(testCase.fragment));
    assert.equal(result.traffic_available, false);
    assert.deepEqual(result.routes, []);
    t.mock.restoreAll();
  }

  try {
    assert.equal(JSON.stringify(cases).includes("test-secret-key"), false);
  } finally {
    restoreEnv("GOOGLE_ROUTES_API_KEY", previousKey);
  }
});

test("el diagnostico de conexion se expone como endpoint protegido del modulo transporte", () => {
  const routesSource = fs.readFileSync(path.join(__dirname, "../src/modules/transport/routes.js"), "utf8");
  assert.match(routesSource, /\/transport\/route-intelligence\/status/);
  assert.match(routesSource, /connectionStatus\(\{ probe \}\)/);
  const endpointLine = routesSource.split(/\r?\n/).find((line) => line.includes("/transport/route-intelligence/status"));
  assert.match(endpointLine, /requirePermission\("transport", "read"\)/);
});

test("el diagnostico de conexion reporta configuracion sin exponer la clave", async (t) => {
  const previousKey = process.env.GOOGLE_ROUTES_API_KEY;
  const previousMapsKey = process.env.GOOGLE_MAPS_API_KEY;
  const previousMapsRoutesKey = process.env.GOOGLE_MAPS_ROUTES_API_KEY;
  delete process.env.GOOGLE_ROUTES_API_KEY;
  delete process.env.GOOGLE_MAPS_API_KEY;
  delete process.env.GOOGLE_MAPS_ROUTES_API_KEY;

  try {
    const idle = await connectionStatus();
    assert.equal(idle.configured, false);
    assert.equal(idle.env_var, null);
    assert.equal(idle.probe.status, "not_run");
    assert.equal(JSON.stringify(idle).includes("test-secret-key"), false);

    const notConfiguredProbe = await connectionStatus({ probe: true });
    assert.equal(notConfiguredProbe.probe.status, "not_configured");

    process.env.GOOGLE_ROUTES_API_KEY = "test-secret-key";
    const config = routeIntelligenceConfig();
    assert.equal(config.configured, true);
    assert.equal(config.env_var, "GOOGLE_ROUTES_API_KEY");

    t.mock.method(global, "fetch", async (url, options = {}) => {
      assert.equal(url, "https://routes.googleapis.com/directions/v2:computeRoutes");
      assert.equal(options.headers["X-Goog-Api-Key"], "test-secret-key");
      assert.equal(options.headers["X-Goog-FieldMask"], "routes.distanceMeters");
      return { ok: true, json: async () => ({ routes: [{ distanceMeters: 5000 }] }) };
    });
    const okProbe = await connectionStatus({ probe: true });
    assert.equal(okProbe.configured, true);
    assert.equal(okProbe.probe.status, "ok");
    assert.equal(JSON.stringify(okProbe).includes("test-secret-key"), false);
    t.mock.restoreAll();

    t.mock.method(global, "fetch", async () => ({ ok: false, status: 403 }));
    const rejectedProbe = await connectionStatus({ probe: true });
    assert.equal(rejectedProbe.probe.status, "invalid_key");
    assert.equal(rejectedProbe.probe.http_status, 403);
    assert.ok(rejectedProbe.probe.message.includes("403"));
    assert.equal(JSON.stringify(rejectedProbe).includes("test-secret-key"), false);
  } finally {
    restoreEnv("GOOGLE_ROUTES_API_KEY", previousKey);
    restoreEnv("GOOGLE_MAPS_API_KEY", previousMapsKey);
    restoreEnv("GOOGLE_MAPS_ROUTES_API_KEY", previousMapsRoutesKey);
  }
});
