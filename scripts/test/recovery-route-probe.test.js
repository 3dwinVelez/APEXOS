const test = require('node:test');
const assert = require('node:assert/strict');
const { routes, loadRouteHelper, probe } = require('../security/recovery-route-probe');

for (const route of routes) {
  for (const key of ['sb_secret_fake_for_test', 'legacy-service-jwt-for-test']) {
    test(`${route.file}: privileged request authenticates with selected service credential`, async () => {
      const config = { url: 'https://example.invalid', anonKey: 'public-key-for-test', serviceRoleKey: key };
      let captured;
      const fake = async (url, options) => {
        captured = options;
        const accepts = options.headers.apikey === key && options.headers.Authorization === `Bearer ${key}`;
        return new Response(JSON.stringify(accepts ? [{ id: 'test-only' }] : { message: 'Invalid JWT' }), { status: accepts ? 200 : 401 });
      };
      await loadRouteHelper(route, config, fake)('/rest/v1/companies?select=id&limit=1');
      assert.equal(captured.headers.apikey, key);
    });
  }
}

test('public reads retain public credential; user requests retain their own session token', async () => {
  const config = { url: 'https://example.invalid', anonKey: 'public-key-for-test', serviceRoleKey: 'sb_secret_test' };
  let captured;
  const fake = async (url, options) => { captured = options; return new Response('[]', { status: 200 }); };
  await loadRouteHelper(routes[0], config, fake, 'supabasePublicRead')('/rest/v1/companies');
  assert.equal(captured.headers.apikey, config.anonKey);
  assert.equal(captured.headers.Authorization, `Bearer ${config.anonKey}`);
  await loadRouteHelper(routes[2], config, fake, 'supabaseUserRequest')('/rest/v1/companies', 'Bearer user-session-for-test');
  assert.equal(captured.headers.apikey, config.anonKey);
  assert.equal(captured.headers.Authorization, 'Bearer user-session-for-test');
  await assert.rejects(() => loadRouteHelper(routes[2], config, fake, 'supabaseUserRequest')('/rest/v1/companies', ''));
});

test('rejects a production target before transmitting QA credential', async () => {
  let calls = 0;
  await assert.rejects(() => probe({ SUPABASE_URL: 'https://jzbwzmkidfthknsohhnr.supabase.co', APP_ENV: 'production' }, async () => { calls++; }));
  assert.equal(calls, 0);
});
