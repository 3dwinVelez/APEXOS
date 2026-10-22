const test = require('node:test');
const assert = require('node:assert/strict');
const { buildQaVariables, validateQaDeployment } = require('../security/recovery-vercel-qa.cjs');
const qa = {
  APP_ENV: 'qa', TARGET_ENV: 'qa', SUPABASE_URL: 'https://jbirkghkekuifgfsgquq.supabase.co',
  NEXT_PUBLIC_SUPABASE_URL: 'https://jbirkghkekuifgfsgquq.supabase.co',
  NEXT_PUBLIC_API_URL: 'https://apexos-api-qa-production.up.railway.app',
  FRONTEND_URL: 'https://apexos-web-qa-production.up.railway.app',
  DATABASE_URL: 'postgresql://postgres.jbirkghkekuifgfsgquq:test-only@aws-1-us-east-2.pooler.supabase.com:5432/postgres',
  SUPABASE_ANON_KEY: 'public-test-only'
};
test('builds separate QA configuration and refuses production or foreign database', () => {
  const values = buildQaVariables(qa, 'sb_secret_test', 'x'.repeat(64));
  assert.equal(values.APP_ENV, 'qa');
  assert.equal(values.SUPABASE_URL, qa.SUPABASE_URL);
  assert.throws(() => buildQaVariables({ ...qa, APP_ENV: 'production' }, 'sb_secret_test', 'x'.repeat(64)));
  assert.throws(() => buildQaVariables({ ...qa, DATABASE_URL: 'postgresql://localhost/postgres' }, 'sb_secret_test', 'x'.repeat(64)));
});
test('only accepts existing develop previews', () => {
  const preview = { url: 'test.vercel.app', target: null, meta: { githubCommitRef: 'develop', githubCommitSha: '807f7930afff' } };
  assert.equal(validateQaDeployment(preview), preview);
  assert.throws(() => validateQaDeployment({ ...preview, target: 'production' }));
  assert.throws(() => validateQaDeployment({ ...preview, meta: { ...preview.meta, githubCommitRef: 'main' } }));
});
