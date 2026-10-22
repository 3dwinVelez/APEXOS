const fs = require('node:fs');
const path = require('node:path');
const { parseEnv, assertPrivateOutput } = require('../security/recovery-readiness');
async function main() {
  const output = assertPrivateOutput(process.argv[2]);
  const input = JSON.parse(fs.readFileSync(0, 'utf8'));
  const qaEnv = parseEnv(fs.readFileSync(path.resolve(__dirname, '../../config/qa.env'), 'utf8'));
  if (qaEnv.SUPABASE_URL !== 'https://jbirkghkekuifgfsgquq.supabase.co') throw new Error('QA project mismatch');
  const report = { timestamp: new Date().toISOString(), scope: 'operational_access_using_only_user_supplied_accounts', other_roles_used: false, tenant_isolation_certified: false, complete_incident_certification: false, environments: [] };
  for (const environment of ['local', 'qa']) {
    const account = input[environment];
    if (!account?.email || !account?.password) throw new Error('Both supplied accounts are required');
    const api = environment === 'local' ? 'http://127.0.0.1:3000' : 'https://apexos-api-qa-production.up.railway.app';
    const web = environment === 'local' ? 'http://localhost:3001' : 'https://apexos-web-qa-production.up.railway.app';
    const checks = [];
    const result = { environment, checks };
    const call = async (name, url, options = {}, readJson = false) => {
      try {
        const response = await fetch(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(20000) });
        const body = readJson ? await response.json() : null;
        if (!readJson) await response.body?.cancel();
        checks.push({ name, http_status: response.status, status: response.ok ? 'passed' : 'failed' });
        return { response, body };
      } catch { checks.push({ name, status: 'failed', reason: 'request_or_response_failed' }); return null; }
    };
    const health = await call('health', `${api}/health`, {}, true);
    if (/^[a-f0-9]{7,40}$/i.test(health?.body?.commit || '')) result.commit = health.body.commit;
    await call('web_login_page', `${web}/login`);
    const authBase = environment === 'local' ? api : qaEnv.SUPABASE_URL;
    const authHeaders = { 'content-type': 'application/json', ...(environment === 'qa' ? { apikey: qaEnv.SUPABASE_ANON_KEY } : {}) };
    const login = await call('login', `${authBase}${environment === 'qa' ? '/auth/v1/token?grant_type=password' : '/api/v1/auth/login'}`, { method: 'POST', headers: authHeaders, body: JSON.stringify(account) }, true);
    let token = login?.body?.token || login?.body?.access_token;
    const refresh = login?.body?.refresh || login?.body?.refresh_token;
    if (token && refresh) {
      for (const [name, endpoint] of [['session', '/api/v1/auth/me'], ['services', '/api/v1/services/orders?limit=1'], ['hr', '/api/v1/hr/employees?limit=1'], ['inventory', '/api/v1/inventory/items?limit=1'], ['accounting', '/api/v1/accounting/accounts?limit=1']]) await call(name, `${api}${endpoint}`, { headers: { authorization: `Bearer ${token}` } });
      const renewed = await call('refresh', `${authBase}${environment === 'qa' ? '/auth/v1/token?grant_type=refresh_token' : '/api/v1/auth/refresh'}`, { method: 'POST', headers: authHeaders, body: JSON.stringify(environment === 'qa' ? { refresh_token: refresh } : { refresh }) }, true);
      token = renewed?.body?.token || renewed?.body?.access_token;
      if (token) await call('renewed_session', `${api}/api/v1/auth/me`, { headers: { authorization: `Bearer ${token}` } });
      else checks.push({ name: 'renewed_token', status: 'failed' });
      if (environment === 'qa' && token) {
        // Record the adjacent WEB flow separately: do not conceal the known monitor failure.
        const monitor = await call('web_service_monitor', `${web}/api/services/monitor-orders?limit=1`, { headers: { authorization: `Bearer ${token}` } });
        result.web_monitor_passed = Boolean(monitor?.response?.ok);
      }
    } else checks.push({ name: 'session_tokens', status: 'failed' });
    result.operational_access_passed = checks.filter(item => item.name !== 'web_service_monitor').every(item => item.status === 'passed');
    result.all_checked_flows_passed = checks.every(item => item.status === 'passed');
    report.environments.push(result);
  }
  report.operational_access_passed = report.environments.every(item => item.operational_access_passed);
  report.all_checked_flows_passed = report.environments.every(item => item.all_checked_flows_passed);
  fs.writeFileSync(output, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.all_checked_flows_passed ? 0 : 1;
}
main().catch(() => { console.error('Access certification failed. No account credential, token or provider response was logged.'); process.exitCode = 1; });
