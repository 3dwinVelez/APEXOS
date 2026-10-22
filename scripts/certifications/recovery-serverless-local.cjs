const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { parseEnv, assertPrivateOutput } = require('../security/recovery-readiness');

async function main() {
  const output = assertPrivateOutput(process.argv[2]);
  const account = JSON.parse(fs.readFileSync(0, 'utf8'));
  const env = parseEnv(fs.readFileSync(path.resolve(__dirname, '../../config/local.env'), 'utf8'));
  const database = new URL(env.DATABASE_URL);
  if (!['localhost', '127.0.0.1'].includes(database.hostname)) throw new Error('Local database required');
  Object.assign(process.env, env, { VERCEL: '1', DISABLE_REDIS: 'true', REDIS_DISABLED: 'true', NODE_ENV: 'production' });
  // Bootstrap diagnostics are not certification output; never persist provider bodies.
  console.log = () => {};
  const handler = require('../../apps/api/server');
  const server = http.createServer(handler);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const report = { timestamp: new Date().toISOString(), scope: 'real_local_api_through_vercel_node_handler', remote_changed: false, other_roles_used: false, deployed_certification: false, checks: [] };
  async function call(name, endpoint, options = {}) {
    try {
      const response = await fetch(`${base}${endpoint}`, { ...options, redirect: 'error', signal: AbortSignal.timeout(20000) });
      const body = await response.json();
      report.checks.push({ name, http_status: response.status, passed: response.ok });
      return body;
    } catch { report.checks.push({ name, passed: false }); return {}; }
  }
  await call('health', '/health');
  const login = await call('login', '/api/v1/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(account) });
  if (login.token && login.refresh) {
    for (const [name, endpoint] of [['session', 'auth/me'], ['services', 'services/orders?limit=1'], ['hr', 'hr/employees?limit=1'], ['inventory', 'inventory/items?limit=1'], ['accounting', 'accounting/accounts?limit=1']]) {
      await call(name, `/api/v1/${endpoint}`, { headers: { authorization: `Bearer ${login.token}` } });
    }
    const renewed = await call('refresh', '/api/v1/auth/refresh', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ refresh: login.refresh }) });
    if (renewed.token) await call('renewed_session', '/api/v1/auth/me', { headers: { authorization: `Bearer ${renewed.token}` } });
    else report.checks.push({ name: 'renewed_token', passed: false });
  } else report.checks.push({ name: 'session_tokens', passed: false });
  report.passed = report.checks.every(check => check.passed);
  fs.writeFileSync(output, JSON.stringify(report, null, 2));
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
  process.exit(report.passed ? 0 : 1);
}
main().catch(() => { process.stderr.write('Local serverless certification failed; no credentials logged.\n'); process.exit(1); });
