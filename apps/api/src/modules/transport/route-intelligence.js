const GOOGLE_ROUTES_ENDPOINT = "https://routes.googleapis.com/directions/v2:computeRoutes";
const GOOGLE_ROUTES_FIELD_MASK = [
  "routes.distanceMeters",
  "routes.duration",
  "routes.staticDuration",
  "routes.polyline.encodedPolyline",
  "routes.travelAdvisory.speedReadingIntervals",
  "routes.localizedValues",
].join(",");
const GOOGLE_ROUTES_ENV_VARS = ["GOOGLE_ROUTES_API_KEY", "GOOGLE_MAPS_API_KEY", "GOOGLE_MAPS_ROUTES_API_KEY"];
const GOOGLE_ROUTES_WAYPOINT_LIMIT = 25;

function routesApiKey() {
  return process.env.GOOGLE_ROUTES_API_KEY || process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_ROUTES_API_KEY || "";
}

function googleRoutesError(status) {
  if (status === 400) return "Google Routes rechazo la solicitud (400): revisa coordenadas, hora de salida o cantidad de paradas.";
  if (status === 403) return "Google Routes rechazo la clave (403): confirma que la clave exista, tenga la Routes API habilitada y que sus restricciones permitan este servidor.";
  if (status === 429) return "Google Routes reporto cuota agotada (429): revisa el presupuesto o el limite de solicitudes de la clave.";
  return `Google Routes respondio ${status}.`;
}

function statusForHttpError(status) {
  if (status === 403) return "invalid_key";
  if (status === 429) return "quota_exceeded";
  return "unavailable";
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

function waypointsFromLegs(legs = []) {
  const points = [];
  for (let index = 0; index < legs.length - 1; index += 1) {
    const point = coordinateFromLegPoint(legs[index]?.to_coordinate);
    if (point) points.push(point);
  }
  return points
    .filter((point, index) => index === 0 || point.latitude !== points[index - 1].latitude || point.longitude !== points[index - 1].longitude)
    .slice(0, GOOGLE_ROUTES_WAYPOINT_LIMIT);
}

function safeDepartureTime(departureTime) {
  const fallback = () => new Date(Date.now() + 5 * 60 * 1000);
  const parsed = departureTime ? new Date(departureTime) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) return fallback();
  const minTime = Date.now() - 7 * 24 * 3600 * 1000 + 60 * 1000;
  const maxTime = Date.now() + 100 * 24 * 3600 * 1000 - 60 * 1000;
  const time = parsed.getTime();
  if (time < minTime || time > maxTime) return fallback();
  return parsed;
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

function trafficSegments(route) {
  return (route?.travelAdvisory?.speedReadingIntervals || []).map((item) => {
    const speed = item.speed || "SPEED_UNSPECIFIED";
    return {
      start_index: Number(item.startPolylinePointIndex || 0),
      end_index: Number(item.endPolylinePointIndex || item.startPolylinePointIndex || 0),
      speed,
      label: speed === "TRAFFIC_JAM" ? "Congestion alta" : speed === "SLOW" ? "Trafico lento" : speed === "NORMAL" ? "Flujo normal" : "Sin lectura",
      severity: speed === "TRAFFIC_JAM" ? "alta" : speed === "SLOW" ? "media" : speed === "NORMAL" ? "baja" : "sin_lectura",
    };
  });
}

function routeNotes({ level, delayMinutes, index }) {
  const pros = [];
  const cons = [];
  const tags = [];
  if (index === 0) pros.push("Ruta sugerida por el proveedor para la hora de salida.");
  else pros.push("Alternativa vial disponible para comparar antes de confirmar.");
  if (level === "bajo") pros.push("Lectura de trafico favorable en los segmentos reportados.");
  if (level === "medio") {
    tags.push("trafico medio");
    cons.push("Presenta tramos lentos; revisar ETA antes de despachar.");
  }
  if (level === "alto") {
    tags.push("congestion alta");
    cons.push("Tiene congestion relevante frente a una operacion normal.");
  }
  if (delayMinutes && delayMinutes >= 10) {
    tags.push("demora por trafico");
    cons.push(`Demora estimada de ${delayMinutes} min frente a flujo libre.`);
  }
  tags.push("obras/accidentes sin reporte oficial");
  return { pros, cons, tags };
}

function mapGoogleRoute(route, index) {
  const durationSeconds = secondsFromGoogleDuration(route.duration);
  const staticSeconds = secondsFromGoogleDuration(route.staticDuration);
  const delayMinutes = durationSeconds != null && staticSeconds != null ? Math.max(0, Math.round((durationSeconds - staticSeconds) / 60)) : null;
  const level = trafficLevel(route);
  const notes = routeNotes({ level, delayMinutes, index });
  return {
    rank: index + 1,
    distance_km: route.distanceMeters == null ? null : Number((Number(route.distanceMeters) / 1000).toFixed(2)),
    duration_minutes: durationSeconds == null ? null : Math.max(1, Math.round(durationSeconds / 60)),
    static_duration_minutes: staticSeconds == null ? null : Math.max(1, Math.round(staticSeconds / 60)),
    delay_minutes: delayMinutes,
    traffic_level: level,
    traffic_segments: trafficSegments(route),
    pros: notes.pros,
    cons: notes.cons,
    issue_tags: notes.tags,
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

  const intermediates = waypointsFromLegs(legs).map((location) => ({ location: { latLng: location } }));
  const departure = safeDepartureTime(departureTime);
  const body = {
    origin: { location: { latLng: origin } },
    destination: { location: { latLng: destination } },
    travelMode: "DRIVE",
    routingPreference: "TRAFFIC_AWARE_OPTIMAL",
    extraComputations: ["TRAFFIC_ON_POLYLINE"],
    computeAlternativeRoutes: true,
    languageCode: "es-CO",
    units: "METRIC",
    departureTime: departure.toISOString(),
  };
  if (intermediates.length) body.intermediates = intermediates;

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
      return {
        provider: "google_routes",
        status: statusForHttpError(response.status),
        traffic_available: false,
        routes: [],
        message: googleRoutesError(response.status),
      };
    }
    const payload = await response.json();
    const routes = (payload.routes || []).slice(0, 4).map(mapGoogleRoute).filter((route) => route.polyline);
    return {
      provider: "google_routes",
      status: routes.length ? "configured" : "empty",
      traffic_available: routes.some((route) => route.traffic_level !== "sin_lectura"),
      waypoints_used: intermediates.length,
      routes,
      message: routes.length ? "Rutas y trafico calculados con Google Routes desde backend." : "Google Routes no devolvio rutas utilizables.",
    };
  } catch {
    return { provider: "google_routes", status: "unavailable", traffic_available: false, routes: [], message: "Google Routes no estuvo disponible dentro del tiempo esperado." };
  }
}

function routeIntelligenceConfig() {
  const envVar = GOOGLE_ROUTES_ENV_VARS.find((name) => (process.env[name] || "").trim());
  return {
    provider: "google_routes",
    configured: Boolean(envVar),
    env_var: envVar || null,
    waypoints_limit: GOOGLE_ROUTES_WAYPOINT_LIMIT,
    security_notes: [
      "La clave viaja solo en el header X-Goog-Api-Key del backend y nunca se devuelve al cliente.",
      "Restringe la clave en Google Cloud a la Routes API y, si es posible, a las IPs del servidor.",
    ],
  };
}

async function connectionStatus({ probe } = {}) {
  const config = routeIntelligenceConfig();
  if (!probe) return { ...config, probe: { status: "not_run", message: "Usa ?probe=1 para validar la clave contra Google Routes." } };
  if (!config.configured) {
    return { ...config, probe: { status: "not_configured", message: "Define GOOGLE_ROUTES_API_KEY en el .env del backend para habilitar rutas y trafico real." } };
  }
  try {
    const response = await fetch(GOOGLE_ROUTES_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": routesApiKey(),
        "X-Goog-FieldMask": "routes.distanceMeters",
      },
      body: JSON.stringify({
        origin: { location: { latLng: { latitude: 4.65, longitude: -74.1 } } },
        destination: { location: { latLng: { latitude: 4.67, longitude: -74.05 } } },
        travelMode: "DRIVE",
        routingPreference: "TRAFFIC_AWARE_OPTIMAL",
      }),
      signal: AbortSignal.timeout(6000),
    });
    if (response.ok) {
      return { ...config, probe: { status: "ok", message: "Google Routes respondio correctamente: la clave esta habilitada y acepta este servidor." } };
    }
    return { ...config, probe: { status: statusForHttpError(response.status), http_status: response.status, message: googleRoutesError(response.status) } };
  } catch {
    return { ...config, probe: { status: "unavailable", message: "Google Routes no respondio dentro del tiempo esperado; revisa la salida a internet del servidor." } };
  }
}

module.exports = { enrichRouteWithGoogle, connectionStatus, routeIntelligenceConfig, waypointsFromLegs, safeDepartureTime };
