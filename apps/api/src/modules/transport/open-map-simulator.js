// Public OpenStreetMap providers for local development only. Google remains the
// production integration. Never forward tenant IDs, site IDs, labels or credentials.
const PHOTON = 'https://photon.komoot.io/api/';
const OSRM = 'https://router.project-osrm.org/route/v1/driving/';
const cache = new Map();
const pending = new Map();
function enabled() {
  if (process.env.TRANSPORT_OPEN_MAPS_LOCAL === 'false' || process.env.NODE_ENV !== 'development' || process.env.RAILWAY_ENVIRONMENT_NAME) return false;
  try { return ['localhost', '127.0.0.1', 'postgres'].includes(new URL(process.env.DATABASE_URL || '').hostname); } catch { return false; }
}
function coordinate(point) {
  return point?.latitude != null && point?.longitude != null && Number.isFinite(Number(point.latitude)) && Number.isFinite(Number(point.longitude)) && Math.abs(Number(point.latitude)) <= 90 && Math.abs(Number(point.longitude)) <= 180;
}
async function cached(key, run) {
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;
  if (pending.has(key)) return pending.get(key);
  const task = run().then(value => {
    if (cache.size >= 100) cache.delete(cache.keys().next().value);
    cache.set(key, { value, expires: Date.now() + 300000 });
    return value;
  }).finally(() => pending.delete(key));
  pending.set(key, task);
  return task;
}
async function places(query) {
  if (!enabled()) return { candidates: [], configured: false };
  query = String(query || '').trim().slice(0, 200);
  if (query.length < 3) return { candidates: [], configured: false };
  return cached(`place:${query.toLowerCase()}`, async () => {
    const url = new URL(PHOTON);
    url.search = new URLSearchParams({ q: query.slice(0, 200), limit: '5', bbox: '-79,-5,-66,13' }).toString();
    const response = await fetch(url, { signal: AbortSignal.timeout(6000), redirect: 'error' });
    if (!response.ok) throw new Error('OPEN_MAP_PLACES_UNAVAILABLE');
    const body = await response.json();
    const candidates = (body.features || []).map(feature => {
      const p = feature.properties || {};
      const latitude = feature.geometry?.coordinates?.[1];
      const longitude = feature.geometry?.coordinates?.[0];
      const name = p.name || [p.street, p.housenumber].filter(Boolean).join(' ');
      return { label: [...new Set([name, p.city || p.county, p.state, p.country].filter(Boolean))].join(', '), latitude, longitude, source: 'photon' };
    }).filter(p => coordinate(p) && p.label && p.latitude >= -5 && p.latitude <= 13 && p.longitude >= -79 && p.longitude <= -66);
    return { candidates, configured: false, provider: 'photon', external_available: true };
  });
}
async function route({ origin, destination, intermediates = [], round_trip = false }) {
  if (!enabled()) return null;
  const points = [origin, ...intermediates, destination];
  if (points.length > 27 || !points.every(coordinate)) return null;
  // Return via the actual road network; do not multiply the outbound leg.
  if (round_trip) points.push(origin);
  const coords = points.map(p => `${Number(p.longitude)},${Number(p.latitude)}`).join(';');
  return cached(`route:${coords}`, async () => {
    const response = await fetch(`${OSRM}${coords}?overview=full&geometries=polyline&steps=false`, { signal: AbortSignal.timeout(6000), redirect: 'error' });
    if (!response.ok) throw new Error('OPEN_MAP_ROUTE_UNAVAILABLE');
    const body = await response.json();
    const r = body.routes?.[0];
    if (body.code !== 'Ok' || !r || !Number.isFinite(r.distance) || !Number.isFinite(r.duration) || !r.geometry) throw new Error('OPEN_MAP_ROUTE_EMPTY');
    return { distance_km: Number((r.distance / 1000).toFixed(2)), duration_minutes: Math.max(1, Math.round(r.duration / 60)), source: 'osrm', polyline: r.geometry, traffic_level: 'sin_lectura', waypoints_used: intermediates.length, message: 'Recorrido vial calculado con OSRM / OpenStreetMap. Tiempo estimado sin tráfico en vivo.' };
  });
}
module.exports = { enabled, places, route };
