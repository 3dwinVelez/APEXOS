const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { parseEnv, configurationFailures, certifyReadiness, assertPrivateOutput } = require('../security/recovery-readiness');

const fixture = () => ({
  APP_ENV: 'qa', TARGET_ENV: 'qa', SUPABASE_URL: 'https://jbirkghkekuifgfsgquq.supabase.co',
  NEXT_PUBLIC_SUPABASE_URL: 'https://jbirkghkekuifgfsgquq.supabase.co',
  NEXT_PUBLIC_API_URL: 'https://apexos-api-qa-production.up.railway.app',
  FRONTEND_URL: 'https://apexos-web-qa-production.up.railway.app',
  DATABASE_URL: 'postgresql://postgres.jbirkghkekuifgfsgquq:test-only@aws-0-us-east-2.pooler.supabase.com:6543/postgres',
  SUPABASE_SERVICE_ROLE_KEY: 'test-only-secret'
});

test('rejects QA database pointed locally before transmitting any secret', async () => {
  const env = { ...fixture(), DATABASE_URL: 'postgresql://postgres:test@localhost:5432/postgres' };
  let calls = 0;
  const result = await certifyReadiness('qa', env, async () => { calls++; });
  assert.equal(calls, 0);
  assert.equal(result.readiness_passed, false);
  assert.ok(result.checks[0].failures.includes('database_target_mismatch'));
});

test('rejects cross-environment URL and pooler identity', () => {
  assert.ok(configurationFailures('qa', { ...fixture(), SUPABASE_URL: 'https://jzbwzmkidfthknsohhnr.supabase.co' }).includes('supabase_project_mismatch'));
  assert.ok(configurationFailures('qa', { ...fixture(), DATABASE_URL: 'postgresql://postgres.jzbwzmkidfthknsohhnr:x@aws-0-us-east-2.pooler.supabase.com:6543/postgres' }).includes('database_target_mismatch'));
});

test('never sends privileged key to web/API and forbids redirect credential forwarding', async () => {
  const calls = [];
  const result = await certifyReadiness('qa', fixture(), async (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify({ status: 'OK', commit: '123456789abc' }), { status: 200 });
  });
  assert.equal(calls.length, 4);
  for (const call of calls) {
    assert.equal(call.options.method, 'GET');
    assert.equal(call.options.redirect, 'error');
    if (!call.url.includes('.supabase.co/')) assert.equal(call.options.headers, undefined);
  }
  assert.equal(result.readiness_passed, true);
  assert.equal(result.complete_certification, false);
  assert.equal(result.promotion_authorized, false);
});

test('redacts provider exceptions and never reports response bodies or secrets', async () => {
  const env = fixture();
  const result = await certifyReadiness('qa', env, async () => { throw new Error(`provider echoed ${env.SUPABASE_SERVICE_ROLE_KEY}`); });
  assert.equal(result.readiness_passed, false);
  assert.ok(!JSON.stringify(result).includes(env.SUPABASE_SERVICE_ROLE_KEY));
});

test('HTTP failures and invalid health fail readiness', async () => {
  const result = await certifyReadiness('qa', fixture(), async url => new Response(JSON.stringify({ status: 'FAILED' }), { status: url.includes('/bucket') ? 401 : 200 }));
  assert.equal(result.readiness_passed, false);
  assert.equal(result.checks.find(c => c.name === 'api_health').status, 'failed');
  assert.equal(result.checks.find(c => c.name === 'supabase_storage_access').http_status, 401);
});

test('keeps evidence outside repository and parses quoted env values', () => {
  assert.throws(() => assertPrivateOutput(path.resolve(__dirname, 'evidence.json')));
  assert.doesNotThrow(() => assertPrivateOutput(path.resolve(__dirname, '../../../private-evidence.json')));
  assert.deepEqual(parseEnv('# ignored\nA="a=b"\nB=\'value\'\n'), { A: 'a=b', B: 'value' });
});
