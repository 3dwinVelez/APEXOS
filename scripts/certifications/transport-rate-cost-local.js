// Certificación HTTP real, restringida a desarrollo local. No sustituye la revisión visual.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const base = process.env.LOCAL_RATE_API_URL || 'http://localhost:3000';
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(base)) throw new Error('Solo API local');
const output = process.argv[2];
if (!output) throw new Error('Indica ruta de evidencia fuera de archivos versionados');
const result = { commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), working_tree: true, environment: 'LOCAL_DESARROLLO', checks: [], status: 'running' };
let token;
async function request(url, method = 'GET', body, anonymous = false) {
  const res = await fetch(base + '/api/v1' + url, { method, signal: AbortSignal.timeout(30000), headers: { 'content-type': 'application/json', ...(!anonymous && token ? { authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: res.status, body: await res.json() };
}
function check(name, ok, detail = {}) { result.checks.push({ name, status: ok ? 'passed' : 'failed', detail }); if (!ok) throw new Error(name); }
(async () => {
  try {
    const anon = await request('/transport/route-simulator', 'POST', { origin: { latitude: 6.2442, longitude: -75.5812 }, destination: { latitude: 6.3373, longitude: -75.5579 } }, true);
    check('simulator_requires_auth', anon.status === 401, { status: anon.status });
    const login = await request('/auth/login', 'POST', { email: process.env.LOCAL_TMS_EMAIL || 'demo@apex.local', password: process.env.LOCAL_TMS_PASSWORD || 'test1234' });
    check('local_login', login.status === 200 && Boolean(login.body.token)); token = login.body.token;
    const places = await request('/transport/route-places?term=Medellin');
    check('places_live', places.status === 200 && Array.isArray(places.body.places), { google_configured: places.body.google_configured, count: places.body.places?.length });
    const route = await request('/transport/route-simulator', 'POST', { origin: { latitude: 6.2442, longitude: -75.5812 }, destination: { latitude: 6.3373, longitude: -75.5579 }, intermediates: [{ latitude: 6.348, longitude: -75.508 }], round_trip: false });
    check('route_live', route.status === 200 && ['osrm', 'google'].includes(route.body.source) && Boolean(route.body.polyline) && route.body.distance_km > 0 && route.body.duration_minutes > 0, { source: route.body.source, google_status: route.body.google_status, distance_km: route.body.distance_km });
    const code = `QA-COST-FLOW-${Date.now()}`; result.code = code;
    const payload = { code, name: 'Certificación local diseñador de costos', valid_from: '2026-01-01', valid_to: '2027-12-31', currency: 'COP', base_rate: 85000, price_per_stop: 12000, status: 'borrador', metadata: { applies_to: 'flota_propia', tariff_method: 'fijo', stops_included: 1, simulation: { distance_km: route.body.distance_km, duration_minutes: route.body.duration_minutes, source: route.body.source, origin_label: 'Medellín', origin_latitude: 6.2442, origin_longitude: -75.5812, destination_label: 'Bello', destination_latitude: 6.3373, destination_longitude: -75.5579 } } };
    const saved = await request('/transport/rate-cards', 'POST', payload);
    check('draft_created', saved.status === 201 && saved.body.status === 'borrador'); result.created_id = saved.body.id;
    const updated = await request(`/transport/rate-cards/${saved.body.id}`, 'PUT', { ...payload, metadata: { ...payload.metadata, load_unload_flat: 15000, other_costs_amount: 5000, fuel_mode: 'estimated', fuel_estimated_cost: 73480 } });
    check('draft_updated', updated.status === 200 && Number(updated.body.metadata?.fuel_estimated_cost) === 73480);
    const listed = await request('/transport/rate-cards?include_inactive=true&limit=500');
    const reopened = listed.body.find?.(r => r.id === saved.body.id);
    check('reopened_values', Number(reopened?.base_rate) === 85000 && reopened?.metadata?.simulation?.distance_km === route.body.distance_km && reopened?.metadata?.other_costs_amount === 5000);
    const version = await request(`/transport/rate-cards/${saved.body.id}/versions`, 'POST', { ...payload, base_rate: 90000 });
    check('new_version_preserves_original', version.status === 201 && version.body.version === saved.body.version + 1 && version.body.id !== saved.body.id);
    result.version_id = version.body.id;
    result.status = 'passed';
    result.road_provider = route.body.source;
    result.google_real = route.body.source === 'google' ? 'passed' : 'not_applicable_local_open_maps';
    result.browser_visual_certification = 'pending';
  } catch (error) { result.status = 'failed'; result.error = error.message; process.exitCode = 1; }
  finally { fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true }); fs.writeFileSync(output, JSON.stringify(result, null, 2)); console.log(JSON.stringify(result, null, 2)); }
})();
