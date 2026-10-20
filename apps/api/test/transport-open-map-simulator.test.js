const test = require('node:test');
const assert = require('node:assert/strict');
const maps = require('../src/modules/transport/open-map-simulator');
const saved = { node: process.env.NODE_ENV, db: process.env.DATABASE_URL, railway: process.env.RAILWAY_ENVIRONMENT_NAME, local: process.env.TRANSPORT_OPEN_MAPS_LOCAL, fetch: global.fetch };
test.beforeEach(() => { process.env.NODE_ENV = 'development'; process.env.DATABASE_URL = 'postgres://local@localhost/test'; delete process.env.RAILWAY_ENVIRONMENT_NAME; delete process.env.TRANSPORT_OPEN_MAPS_LOCAL; });
test.afterEach(() => { global.fetch = saved.fetch; for (const [key, value] of Object.entries({ NODE_ENV: saved.node, DATABASE_URL: saved.db, RAILWAY_ENVIRONMENT_NAME: saved.railway, TRANSPORT_OPEN_MAPS_LOCAL: saved.local })) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } });
test('public demo providers are disabled in production and remote QA', async () => {
  global.fetch = () => { throw new Error('network must not run'); };
  process.env.NODE_ENV = 'production'; assert.equal(await maps.route({}), null);
  process.env.NODE_ENV = 'development'; process.env.DATABASE_URL = 'postgres://db.example/test'; assert.equal(maps.enabled(), false);
  process.env.DATABASE_URL = 'postgres://localhost:fake@db.example/test'; assert.equal(maps.enabled(), false);
  process.env.DATABASE_URL = 'postgres://local@localhost/test'; process.env.RAILWAY_ENVIRONMENT_NAME = 'QA'; assert.equal(maps.enabled(), false);
});
test('Photon maps valid Colombian candidates, caches search and sends no tenant metadata', async () => {
  let calls = 0;
  global.fetch = async url => { calls++; assert.equal(url.origin, 'https://photon.komoot.io'); assert.equal(url.searchParams.get('bbox'), '-79,-5,-66,13'); return { ok: true, json: async () => ({ features: [{ properties: { name: 'Bello', state: 'Antioquia', country: 'Colombia' }, geometry: { coordinates: [-75.55, 6.33] } }, { properties: { name: 'Invalid' }, geometry: { coordinates: [null, null] } }] }) }; };
  const first = await maps.places('Bello test'); const second = await maps.places('Bello test');
  assert.equal(calls, 1); assert.equal(first.candidates.length, 1); assert.equal(first.candidates[0].source, 'photon'); assert.equal(first, second);
});
test('OSRM returns road distance, geometry and actual return segment without labels or tenant IDs', async () => {
  global.fetch = async url => { assert.ok(url.startsWith('https://router.project-osrm.org/route/v1/driving/-75.5,6.2;-75.4,6.3;-75.3,6.4;-75.5,6.2?')); assert.ok(!url.includes('private')); return { ok: true, json: async () => ({ code: 'Ok', routes: [{ distance: 48600, duration: 4320, geometry: 'encoded' }] }) }; };
  const route = await maps.route({ origin: { latitude: 6.2, longitude: -75.5, label: 'private' }, destination: { latitude: 6.4, longitude: -75.3 }, intermediates: [{ latitude: 6.3, longitude: -75.4 }], round_trip: true });
  assert.equal(route.source, 'osrm'); assert.equal(route.distance_km, 48.6); assert.equal(route.duration_minutes, 72); assert.equal(route.polyline, 'encoded'); assert.equal(route.traffic_level, 'sin_lectura');
});
test('null and out-of-range coordinates never leave the server', async () => {
  global.fetch = () => { throw new Error('network must not run'); };
  assert.equal(await maps.route({ origin: { latitude: null, longitude: 0 }, destination: { latitude: 6, longitude: 7 } }), null);
  assert.equal(await maps.route({ origin: { latitude: 91, longitude: 0 }, destination: { latitude: 6, longitude: 7 } }), null);
});
test('upstream error is not cached as a successful route', async () => {
  let calls = 0;
  global.fetch = async () => { calls++; return { ok: false }; };
  const input = { origin: { latitude: 5, longitude: -74 }, destination: { latitude: 5.1, longitude: -74.1 } };
  await assert.rejects(maps.route(input)); await assert.rejects(maps.route(input)); assert.equal(calls, 2);
});
