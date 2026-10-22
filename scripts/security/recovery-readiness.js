const fs = require('node:fs');
const path = require('node:path');

const TARGETS = Object.freeze({
  qa: { ref: 'jbirkghkekuifgfsgquq', api: 'https://apexos-api-qa-production.up.railway.app', web: 'https://apexos-web-qa-production.up.railway.app' },
  production: { ref: 'jzbwzmkidfthknsohhnr', api: 'https://apexos-api-prod-production.up.railway.app', web: 'https://apexos-web-prod-production.up.railway.app' }
});

function parseEnv(text) {
  const result = {};
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    result[match[1]] = value;
  }
  return result;
}

function configurationFailures(environment, env) {
  const target = TARGETS[environment];
  if (!target) return ['unsupported_environment'];
  const failures = [];
  const supabaseUrl = `https://${target.ref}.supabase.co`;
  if (env.APP_ENV !== environment || env.TARGET_ENV !== environment) failures.push('environment_mismatch');
  if (env.SUPABASE_URL !== supabaseUrl || env.NEXT_PUBLIC_SUPABASE_URL !== supabaseUrl) failures.push('supabase_project_mismatch');
  if (env.NEXT_PUBLIC_API_URL !== target.api || env.FRONTEND_URL !== target.web) failures.push('consumer_url_mismatch');
  try {
    const database = new URL(env.DATABASE_URL);
    if (!['postgres:', 'postgresql:'].includes(database.protocol) ||
        !(database.hostname === `db.${target.ref}.supabase.co` ||
          (database.hostname.endsWith('.pooler.supabase.com') && decodeURIComponent(database.username) === `postgres.${target.ref}`))) {
      failures.push('database_target_mismatch');
    }
  } catch { failures.push('invalid_database_url'); }
  return failures;
}

async function certifyReadiness(environment, env, fetchImpl = fetch) {
  const checks = [];
  const report = {
    environment, timestamp: new Date().toISOString(), mode: 'read_only_readiness',
    complete_certification: false, promotion_authorized: false, checks,
    pending: ['credential_rotation', 'old_credential_revocation', 'database_application_connection', 'login', 'session_refresh', 'authorized_write', 'tenant_isolation', 'active_module_regression']
  };
  const failures = configurationFailures(environment, env);
  checks.push({ name: 'environment_configuration', status: failures.length ? 'failed' : 'passed', failures });
  const target = TARGETS[environment];
  // Fail closed before transmitting any credential to a mismatched environment.
  if (failures.length) return { ...report, readiness_passed: false };
  const request = async (name, url, headers, inspect) => {
    try {
      const response = await fetchImpl(url, { method: 'GET', redirect: 'error', headers, signal: AbortSignal.timeout(15000) });
      let passed = response.status === 200;
      if (passed && inspect) passed = await inspect(response);
      else await response.body?.cancel();
      checks.push({ name, status: passed ? 'passed' : 'failed', http_status: response.status });
    } catch {
      // Provider errors can contain URLs, credentials, tokens or personal data.
      checks.push({ name, status: 'failed', reason: 'request_or_response_failed' });
    }
  };
  await request('web_login_page', `${target.web}/login`);
  await request('api_health', `${target.api}/health`, undefined, async response => {
    const body = await response.json();
    if (typeof body.commit === 'string' && /^[0-9a-f]{7,40}$/i.test(body.commit)) report.api_commit = body.commit;
    return body.status === 'OK';
  });
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY;
  if (!key || /CHANGE_ME|^<.*>$/.test(key)) {
    checks.push({ name: 'supabase_privileged_access', status: 'failed', reason: 'missing_key' });
  } else {
    const headers = { apikey: key, Authorization: `Bearer ${key}` };
    const base = `https://${target.ref}.supabase.co`;
    await request('supabase_auth_admin', `${base}/auth/v1/admin/users?page=1&per_page=1`, headers);
    await request('supabase_storage_access', `${base}/storage/v1/bucket`, headers);
  }
  return { ...report, readiness_passed: checks.every(check => check.status === 'passed') };
}

function assertPrivateOutput(output, repository = path.resolve(__dirname, '../..')) {
  const absolute = path.resolve(output);
  const relative = path.relative(repository, absolute);
  if (!relative || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))) throw new Error('Evidence output must be outside the repository');
  return absolute;
}

async function main(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i += 2) options[argv[i]] = argv[i + 1];
  if (!TARGETS[options['--environment']] || !options['--env-file'] || !options['--output']) throw new Error('Required: --environment qa|production --env-file FILE --output PRIVATE_FILE');
  const output = assertPrivateOutput(options['--output']);
  const env = parseEnv(fs.readFileSync(options['--env-file'], 'utf8'));
  const report = await certifyReadiness(options['--environment'], env);
  // The caller supplies a pre-existing private directory; do not silently create one with default ACLs.
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.readiness_passed ? 0 : 1;
}

if (require.main === module) main(process.argv.slice(2)).catch(() => { console.error('Readiness failed; no provider response or credential was logged.'); process.exitCode = 1; });
module.exports = { parseEnv, configurationFailures, certifyReadiness, assertPrivateOutput };
