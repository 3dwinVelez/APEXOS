const GOOGLE_ROUTES_ENDPOINT = "https://routes.googleapis.com/directions/v2:computeRoutes";
const GOOGLE_ROUTES_FIELD_MASK = [
  "routes.distanceMeters",
  "routes.duration",
  "routes.staticDuration",
  "routes.polyline.encodedPolyline",
  "routes.travelAdvisory.speedReadingIntervals",
  "routes.localizedValues",
].join(",");

function routesApiKey() {
  return process.env.GOOGLE_ROUTES_API_KEY || process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_ROUTES_API_KEY || "";
}

function coordinateFromLegPoint(point) {
  const latitude = Number(point?.latitude);
  const longitude = Number(point?.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { latitude, longitude };
}

function endpointsFromLegs(legs = []) {
  const first = legs[0];
  const last = legs[legs.length - 1];
  return {
    origin: coordinateFromLegPoint(first?.from_coordinate),
    destination: coordinateFromLegPoint(last?.to_coordinate),
  };
}

function secondsFromGoogleDuration(value) {
  const match = String(value || "").match(/^(\d+(?:\.\d+)?)s$/);
  return match ? Number(match[1]) : null;
}

function trafficLevel(route) {
  const speeds = route?.travelAdvisory?.speedReadingIntervals?.map((item) => item.speed).filter(Boolean) || [];
  if (speeds.includes("TRAFFIC_JAM")) return "alto";
  if (speeds.includes("SLOW")) return "medio";
  if (speeds.includes("NORMAL")) return "bajo";
  const duration = secondsFromGoogleDuration(route?.duration);
  const staticDuration = secondsFromGoogleDuration(route?.staticDuration);
  if (duration && staticDuration && duration > staticDuration * 1.35) return "alto";
  if (duration && staticDuration && duration > staticDuration * 1.12) return "medio";
  return "sin_lectura";
}

function mapGoogleRoute(route, index) {
  const durationSeconds = secondsFromGoogleDuration(route.duration);
  const staticSeconds = secondsFromGoogleDuration(route.staticDuration);
  return {
    rank: index + 1,
    distance_km: route.distanceMeters == null ? null : Number((Number(route.distanceMeters) / 1000).toFixed(2)),
    duration_minutes: durationSeconds == null ? null : Math.max(1, Math.round(durationSeconds / 60)),
    static_duration_minutes: staticSeconds == null ? null : Math.max(1, Math.round(staticSeconds / 60)),
    delay_minutes: durationSeconds != null && staticSeconds != null ? Math.max(0, Math.round((durationSeconds - staticSeconds) / 60)) : null,
    traffic_level: trafficLevel(route),
    polyline: route.polyline?.encodedPolyline || null,
  };
}

async function enrichRouteWithGoogle({ legs, departureTime } = {}) {
  const { origin, destination } = endpointsFromLegs(legs);
  if (!origin || !destination) {
    return { provider: "google_routes", status: "invalid_coordinates", traffic_available: false, routes: [] };
  }

  const key = routesApiKey();
  if (!key) {
    return {
      provider: "google_routes",
      status: "not_configured",
      traffic_available: false,
      routes: [],
      message: "Configura GOOGLE_ROUTES_API_KEY o GOOGLE_MAPS_API_KEY en backend para usar trafico real.",
    };
  }

  const departure = departureTime ? new Date(departureTime) : new Date(Date.now() + 5 * 60 * 1000);
  const body = {
    origin: { location: { latLng: origin } },
    destination: { location: { latLng: destination } },
    travelMode: "DRIVE",
    routingPreference: "TRAFFIC_AWARE_OPTIMAL",
    computeAlternativeRoutes: true,
    languageCode: "es-CO",
    units: "METRIC",
    departureTime: Number.isNaN(departure.getTime()) ? new Date(Date.now() + 5 * 60 * 1000).toISOString() : departure.toISOString(),
  };

  try {
    const response = await fetch(GOOGLE_ROUTES_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": GOOGLE_ROUTES_FIELD_MASK,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(4500),
    });
    if (!response.ok) {
      return { provider: "google_routes", status: "unavailable", traffic_available: false, routes: [], message: `Google Routes respondio ${response.status}.` };
    }
    const payload = await response.json();
    const routes = (payload.routes || []).slice(0, 4).map(mapGoogleRoute).filter((route) => route.polyline);
    return {
      provider: "google_routes",
      status: routes.length ? "configured" : "empty",
      traffic_available: routes.some((route) => route.traffic_level !== "sin_lectura"),
      routes,
      message: routes.length ? "Rutas y trafico calculados con Google Routes desde backend." : "Google Routes no devolvio rutas utilizables.",
    };
  } catch {
    return { provider: "google_routes", status: "unavailable", traffic_available: false, routes: [], message: "Google Routes no estuvo disponible dentro del tiempo esperado." };
  }
}

module.exports = { enrichRouteWithGoogle };
