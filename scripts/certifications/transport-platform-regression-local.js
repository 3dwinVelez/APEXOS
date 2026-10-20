const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
require('../load-env')(path.resolve('.env'));
if (!['localhost', '127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname)) throw Error('Solo base local');
process.env.DISABLE_REDIS = 'true';
const result = { status: 'running', environment: 'LOCAL', commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), checks: [] };
let app;
(async () => {
  try {
    app = await require('../../apps/api/server')();
    await app.listen({ port: 3222, host: '127.0.0.1' });
    const base = 'http://127.0.0.1:3222';
    const check = (name, ok) => { result.checks.push({ name, status: ok ? 'passed' : 'failed' }); if (!ok) throw Error(name); };
    const login = await fetch(base + '/api/v1/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: process.env.LOCAL_TMS_EMAIL || 'demo@apex.local', password: process.env.LOCAL_TMS_PASSWORD || 'test1234' }) });
    const session = await login.json();
    check('session_login', login.status === 200 && Boolean(session.token));
    for (const [name, route] of Object.entries({ session: '/auth/me', services: '/services/orders?limit=5', references: '/services/references?active=true', hr: '/hr/employees?limit=5', inventory: '/inventory/items?limit=5', accounting: '/accounting/accounts?limit=5', roles: '/admin/roles', transport: '/transport/vehicles?limit=5' })) {
      const response = await fetch(base + '/api/v1' + route, { headers: { authorization: `Bearer ${session.token}` } });
      check(`${name}_authorized`, response.status === 200);
      const anon = await fetch(base + '/api/v1' + route);
      check(`${name}_anonymous_denied`, anon.status === 401);
    }
    result.status = 'passed';
  } catch (error) { result.status = 'failed'; result.error = error.message; process.exitCode = 1; }
  finally {
    if (app) await app.close();
    await require('../../apps/api/src/core/prisma').$disconnect();
    fs.writeFileSync(process.argv[2], JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
  }
})();
