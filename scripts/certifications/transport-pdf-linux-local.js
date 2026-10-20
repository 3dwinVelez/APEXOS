// API real en Docker con sandbox Chromium y frontend local. Solo base de desarrollo.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
require('../load-env')(path.resolve('.env'));
const database = new URL(process.env.DATABASE_URL);
if (!['localhost', '127.0.0.1'].includes(database.hostname)) throw Error('Solo base local');
const db = require('../../apps/api/src/core/prisma');
const name = `apexos-pdf-cert-${Date.now()}`;
const webPort = process.env.LOCAL_PDF_WEB_PORT || '3001';
if (!['3001', '3002'].includes(webPort)) throw Error('Solo puertos locales de certificacion');
const result = { status: 'running', environment: 'LOCAL_DOCKER', checks: [] };
const check = (name, ok, detail) => { result.checks.push({ name, status: ok ? 'passed' : 'failed', ...(detail ? { detail } : {}) }); if (!ok) throw Error(name); };
function docker(args, env) { const r = spawnSync('docker', args, { encoding: 'utf8', env: env || process.env, timeout: 120000 }); if (r.status !== 0) throw Error((r.stderr || 'docker failed').slice(-2000)); return r.stdout.trim(); }
let started = false;
(async () => {
  try {
    const user = await db.user.findFirstOrThrow({ where: { email: process.env.LOCAL_TMS_EMAIL || 'demo@apex.local' } });
    const rows = await db.transportSettlementPackage.findMany({ where: { tenant_id: user.tenant_id, status: 'liquidada', accounted_total: 525000 }, include: { items: true }, orderBy: { id: 'desc' }, take: 10 });
    const pkg = rows.find(row => row.items.length === 2 && row.items.every(item => item.metadata?.charge_criteria?.[0]?.rate_snapshot?.definition));
    check('two_tariff_liquidated_fixture', Boolean(pkg));
    database.hostname = 'host.docker.internal';
    const env = { ...process.env, DATABASE_URL: database.toString(), DIRECT_URL: database.toString(), DISABLE_REDIS: 'true', PDF_WEB_ORIGIN: `http://web-qa.railway.internal:${webPort}`, NODE_ENV: 'development', PORT: '3000' };
    const args = ['run', '--pull=never', '-d', '--init', '--name', name, '--security-opt', `seccomp=${path.resolve('infra/pdf-renderer/seccomp.json')}`, '--add-host', 'web-qa.railway.internal:host-gateway', '-p', '127.0.0.1:3230:3000'];
    for (const key of ['DATABASE_URL', 'DIRECT_URL', 'DISABLE_REDIS', 'PDF_WEB_ORIGIN', 'NODE_ENV', 'PORT', 'JWT_SECRET']) if (env[key]) args.push('-e', key);
    args.push('apexos-transport-qa-local');
    docker(args, env); started = true;
    let healthy = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      try { healthy = (await fetch('http://127.0.0.1:3230/health')).ok; } catch { /* startup */ }
      if (healthy) break;
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    check('linux_api_ready', healthy);
    const login = await fetch('http://127.0.0.1:3230/api/v1/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: user.email, password: process.env.LOCAL_TMS_PASSWORD || 'test1234' }) });
    const session = await login.json();
    check('linux_real_login', login.status === 200 && Boolean(session.token));
    const url = `http://127.0.0.1:3230/api/v1/transport/settlement-packages/${pkg.id}/invoice-pdf`;
    check('linux_pdf_anonymous_denied', (await fetch(url)).status === 401);
    const pdf = await fetch(url, { headers: { authorization: `Bearer ${session.token}` }, signal: AbortSignal.timeout(180000) });
    const bytes = Buffer.from(await pdf.arrayBuffer());
    check('linux_full_liquidation_pdf', pdf.status === 200 && bytes.subarray(0, 5).toString() === '%PDF-' && bytes.length > 10000, { status: pdf.status, bytes: bytes.length, ...(pdf.ok ? {} : { error: bytes.toString().slice(0, 500) }) });
    check('linux_attachment_no_cache', pdf.headers.get('content-type').includes('application/pdf') && pdf.headers.get('cache-control') === 'no-store');
    fs.writeFileSync(process.argv[2].replace(/\.json$/, '.pdf'), bytes);
    result.status = 'passed'; result.package_code = pkg.code;
  } catch (error) { result.status = 'failed'; result.error = error.message; process.exitCode = 1; }
  finally {
    if (started) {
      const logs = spawnSync('docker', ['logs', name], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
      fs.writeFileSync(process.argv[2].replace(/\.json$/, '.container.log'), (logs.stdout || '') + (logs.stderr || ''));
      docker(['rm', '-f', name]);
    }
    await db.$disconnect(); fs.writeFileSync(process.argv[2], JSON.stringify(result, null, 2)); console.log(JSON.stringify(result));
  }
})();
