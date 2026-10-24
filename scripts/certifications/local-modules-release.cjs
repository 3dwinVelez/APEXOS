// Complete local release certification. Real writes use isolated synthetic tenants.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { spawnSync, execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const { certEnv, target, waitForLocalAppOrigin } = require('./local-certification-env.cjs');
assert.ok(['localhost', '127.0.0.1'].includes(new URL(certEnv.DATABASE_URL).hostname), 'LOCAL_DATABASE_REQUIRED');
const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
assert.equal(execFileSync('git', ['diff', '--name-only', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), '', 'Commit tracked changes before certification');
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'apex-modules-release-'));
const scripts = [
  'inventory-purchases-write-local.cjs',
  'transport-settlement-import-local.js',
  'inventory-modern-ui-local.cjs',
  'inventory-guided-workflows-local.cjs',
  'inventory-redundancy-local.cjs',
  'purchases-modern-ui-local.cjs',
  'purchases-reports-local.cjs',
  'purchases-operator-readability-local.cjs',
  'transport-search-select-local.cjs',
  'transport-theme-local.cjs',
  'transport-print-theme-local.cjs',
  'transport-rate-three-steps-local.cjs',
  'transport-vehicle-consolidation-local.cjs',
  'release-local-regression.cjs'
];
const evidence = { environment: 'LOCAL', target, head, status: 'running', started_at: new Date().toISOString(), results: [] };
async function runCertifiers() {
  for (const script of scripts) {
    const scriptPath = path.join(__dirname, script);
    const log = path.join(output, script + '.log');
    // `next dev` se autocierra bajo presion de memoria en esta maquina; un certificador lanzado contra un
    // puerto muerto solo produce ERR_CONNECTION_REFUSED. Se espera el arranque (acotado) y, si no revive,
    // se registra como fallo de AMBIENTE para no confundirlo con un fallo funcional del candidato.
    const dead = [];
    for (const origin of [target.api.origin, target.web.origin]) {
      if (!await waitForLocalAppOrigin(origin, { timeout: 180000 })) dead.push(origin);
    }
    if (dead.length) {
      evidence.status = 'environment_failed';
      evidence.environment_failures = [{ script: path.relative(root, scriptPath).replaceAll('\\', '/'), dead_origins: dead }];
      fs.writeFileSync(path.join(output, 'evidence.json'), JSON.stringify(evidence, null, 2));
      console.log(JSON.stringify(evidence.environment_failures));
      return;
    }
    const fd = fs.openSync(log, 'w');
    console.log('RUN', script);
    const args = script === 'transport-search-select-local.cjs' ? ['--app'] : [];
    const result = spawnSync(process.execPath, [scriptPath, ...args], { cwd: root, env: certEnv, stdio: ['ignore', fd, fd], timeout: 1200000 });
    fs.closeSync(fd);
    const row = { script: path.relative(root, scriptPath).replaceAll('\\', '/'), sha256: crypto.createHash('sha256').update(fs.readFileSync(scriptPath)).digest('hex'), status: result.status === 0 ? 'passed' : 'failed', log, log_sha256: crypto.createHash('sha256').update(fs.readFileSync(log)).digest('hex') };
    evidence.results.push(row);
    fs.writeFileSync(path.join(output, 'evidence.json'), JSON.stringify(evidence, null, 2));
    console.log(JSON.stringify(row));
    if (result.status !== 0) { evidence.status = 'failed'; return; }
  }
  evidence.status = evidence.results.length === scripts.length ? 'passed' : 'failed';
}

runCertifiers().then(() => {
  assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), head, 'Candidate changed during certification');
  assert.equal(execFileSync('git', ['diff', '--name-only', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), '', 'Tracked source changed during certification');
  evidence.finished_at = new Date().toISOString();
  fs.writeFileSync(path.join(output, 'evidence.json'), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify({ status: evidence.status, head, artifacts: output }));
  process.exitCode = evidence.status === 'passed' ? 0 : 1;
}).catch(error => { console.error(error.stack); process.exitCode = 1; });
