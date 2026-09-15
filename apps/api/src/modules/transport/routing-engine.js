const DEFAULT_OSRM_URL = "https://router.project-osrm.org";

function coordinate(point) { return `${Number(point.longitude)},${Number(point.latitude)}`; }
function validGeometry(value) { return value?.type === "LineString" && Array.isArray(value.coordinates) && value.coordinates.length >= 2; }

async function planWithOsrm(origin, needs, options = {}) {
  const baseUrl = String(process.env.TMS_ROUTING_URL || DEFAULT_OSRM_URL).replace(/\/$/, "");
  const points = [origin, ...needs.map((need) => need.delivery_point)];
  const params = new URLSearchParams({ source: "first", roundtrip: options.return_to_origin ? "true" : "false", geometries: "geojson", overview: "full", steps: "false" });
  if (!options.return_to_origin) params.set("destination", "any");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.TMS_ROUTING_TIMEOUT_MS || 8000));
  let response;
  try {
    response = await fetch(`${baseUrl}/trip/v1/driving/${points.map(coordinate).join(";")}?${params}`, { signal: controller.signal, headers: { "user-agent": "APEXOS-Transport/2.0" } });
  } finally { clearTimeout(timeout); }
  if (!response.ok) throw new Error(`OSRM_HTTP_${response.status}`);
  const body = await response.json(); const trip = body.trips?.[0];
  if (body.code !== "Ok" || !trip || !validGeometry(trip.geometry)) throw new Error(`OSRM_${body.code || "INVALID_RESPONSE"}`);
  const ordered = needs.map((need, index) => ({ need, order: body.waypoints?.[index + 1]?.waypoint_index ?? index + 1 })).sort((a, b) => a.order - b.order).map((entry) => entry.need);
  const stops = [origin, ...ordered.map((need) => need.delivery_point), ...(options.return_to_origin ? [origin] : [])];
  const legs = (trip.legs || []).map((leg, index) => ({ sequence: index + 1, from: index === 0 ? origin.name : ordered[index - 1]?.delivery_point?.name || origin.name, to: index < ordered.length ? ordered[index].delivery_point.name : origin.name, need_id: index < ordered.length ? ordered[index].id : null, distance_km: Number((Number(leg.distance || 0) / 1000).toFixed(2)), duration_minutes: Math.ceil(Number(leg.duration || 0) / 60), from_coordinate: { latitude: Number(stops[index]?.latitude), longitude: Number(stops[index]?.longitude) }, to_coordinate: { latitude: Number(stops[index + 1]?.latitude), longitude: Number(stops[index + 1]?.longitude) } }));
  return { ordered, legs, distance_km: Number((Number(trip.distance) / 1000).toFixed(2)), duration_minutes: Math.ceil(Number(trip.duration) / 60), road_factor: null, engine: "osrm", profile: "driving", geometry: trip.geometry };
}

async function planRoadRoute(origin, needs, options, fallback) {
  try { return await planWithOsrm(origin, needs, options); }
  catch (error) { const route = fallback(origin, needs, options); return { ...route, engine: "geodesic_fallback", profile: "driving", geometry: null, routing_warning: error instanceof Error ? error.message : "ROUTING_UNAVAILABLE" }; }
}

module.exports = { DEFAULT_OSRM_URL, planWithOsrm, planRoadRoute, validGeometry };
