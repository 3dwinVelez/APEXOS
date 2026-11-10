// Creates a disposable, empty-schema copy of the local Docker DB; never writes to the source DB or cloud.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const certificate = process.argv.find(arg => arg.startsWith('--certificate='))?.slice(14) || 'hr-employee-user-link-local.js';
if (!['hr-employee-user-link-local.js', 'hr-punch-mobile-evidence-local.js', 'hr-landing-hub-local.js', 'hr-payroll-markings-local.js', 'hr-marking-existing-employee-local.js'].includes(certificate)) throw Error('Unsupported certification script');
const outputDirectories = {
  'hr-marking-existing-employee-local.js': 'hr-marking-existing-employee',
  'hr-payroll-markings-local.js': 'hr-payroll-markings',
  'hr-punch-mobile-evidence-local.js': 'hr-punch-mobile-evidence',
  'hr-landing-hub-local.js': 'hr-landing-hub'
};
const output = path.join(root, '.local', outputDirectories[certificate] || 'hr-employee-user-association');
fs.mkdirSync(output, { recursive: true });
const database = `apexos_cert_hr_assoc_${Date.now()}`;
if (!/^apexos_cert_hr_assoc_\d+$/.test(database)) throw Error('Unsafe certification database name');
const container = 'infra-postgres-1';
const docker = args => execFileSync('docker', args, { maxBuffer: 32 * 1024 * 1024, windowsHide: true });
const password = docker(['exec', container, 'printenv', 'POSTGRES_PASSWORD']).toString().trim();
const schema = docker(['exec', container, 'pg_dump', '-U', 'apex', '-d', 'apexos', '--schema-only', '--no-owner', '--no-privileges']);
docker(['exec', container, 'createdb', '-U', 'apex', database]);
function apply(input) {
  const result = spawnSync('docker', ['exec', '-i', container, 'psql', '-U', 'apex', '-d', database, '-v', 'ON_ERROR_STOP=1'], { input, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, windowsHide: true });
  if (result.status !== 0) throw Error('Isolated database schema preparation failed: ' + result.stderr.slice(-1500));
}
apply(schema);
const hasSedes = docker(['exec', container, 'psql', '-U', 'apex', '-d', database, '-Atc', "SELECT to_regclass('public.sedes') IS NOT NULL"]).toString().trim() === 't';
if (!hasSedes) {
  // The legacy local schema already removed tariff-origin fields. Only the reviewed
  // Sede rename/nullability fixture is needed; never replay unrelated destructive hunks.
  const migration = fs.readFileSync(path.join(root, 'apps/api/prisma/migrations/20261016123000_sedes_replace_origins/migration.sql'), 'utf8');
  apply(migration.split('-- 3.')[0]);
}
const hasRouteKind = docker(['exec', container, 'psql', '-U', 'apex', '-d', database, '-Atc', "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'TimeRoute' AND column_name = 'kind')"]).toString().trim() === 't';
if (!hasRouteKind) apply(fs.readFileSync(path.join(root, 'apps/api/prisma/migrations/20260919110000_time_route_kind_descanso/migration.sql')));
const localUrl = `postgresql://apex:${encodeURIComponent(password)}@127.0.0.1:55432/${database}`;
const log = fs.openSync(path.join(output, 'certification.log'), 'w');
const result = spawnSync(process.execPath, [path.join(__dirname, certificate), '--output=' + path.join(output, 'certification.json')], {
  cwd: root, env: { ...process.env, DATABASE_URL: localUrl, DIRECT_URL: localUrl, REDIS_DISABLED: 'true', DISABLE_REDIS: 'true', NODE_ENV: 'test', HR_ASSOCIATION_BROWSER: '1' },
  stdio: ['ignore', log, log], windowsHide: true, timeout: Number(process.env.CERT_TIMEOUT_MS || 600000)
});
fs.closeSync(log);
const requests = new Map();
const failures = [];
for (const line of fs.readFileSync(path.join(output, 'certification.log'), 'utf8').split(/\r?\n/)) {
  try { const row = JSON.parse(line); if (row.req) requests.set(row.reqId, row.req.url); if (row.res?.statusCode >= 500) failures.push({ path: requests.get(row.reqId), status: row.res.statusCode }); } catch {}
}
const status = result.status === 0 && failures.length === 0 ? 'passed' : 'failed';
fs.writeFileSync(path.join(output, 'isolated-certification.json'), JSON.stringify({ status, environment: 'LOCAL', database, source_database_modified: false, fixture_schema_hunks: [hasSedes ? null : '20261016123000_sedes_replace_origins: sections 1-2 only', hasRouteKind ? null : '20260919110000_time_route_kind_descanso'].filter(Boolean), exit_code: result.status, unexpected_5xx: failures, checked_at: new Date().toISOString() }, null, 2) + '\n');
console.log(JSON.stringify({ status, database, exit_code: result.status, unexpected_5xx: failures }));
process.exit(status === 'passed' ? 0 : 1);
