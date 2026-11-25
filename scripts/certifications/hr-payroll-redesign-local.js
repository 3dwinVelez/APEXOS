// Exact-candidate local certification. Runs real PostgreSQL/HTTP/Chrome flow and UI regressions.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const commit = process.argv.find(arg => arg.startsWith('--candidate-commit='))?.slice(19);
assert.match(commit || '', /^[a-f0-9]{40}$/);
const output = path.join(root, '.local/hr-payroll-redesign');
fs.mkdirSync(output, { recursive: true });
const result = { environment: 'LOCAL', commit, status: 'running', started_at: new Date().toISOString(), checks: [] };
function run(args, cwd, file) {
  const log = fs.openSync(path.join(output, file), 'w');
  try {
    const child = spawnSync(process.execPath, args, { cwd, windowsHide: true, timeout: 600000, stdio: ['ignore', log, log] });
    assert.equal(child.status, 0, `${file}: ${child.error?.message || 'see log'}`);
  } finally { fs.closeSync(log); }
}
try {
  run([path.join(__dirname, 'hr-employee-user-association-isolated-local.js'), '--certificate=hr-payroll-markings-local.js'], root, 'flow.log');
  const folder = path.join(root, '.local/hr-payroll-markings');
  result.functional = JSON.parse(fs.readFileSync(path.join(folder, 'certification.json')));
  result.isolation = JSON.parse(fs.readFileSync(path.join(folder, 'isolated-certification.json')));
  assert.equal(result.functional.status, 'passed');
  assert.equal(result.isolation.status, 'passed');
  result.checks.push('Real trial, save, feedback, reload, permissions, isolation and responsive presentation');
  const tests = ['payroll-display.test.mjs', 'ibc-nomina-ui.test.mjs', 'payroll-employee-entity-ui.test.mjs'];
  run(['--experimental-strip-types', '--test', ...tests.map(file => `test/${file}`)], path.join(root, 'apps/web'), 'regression.log');
  result.test_files = tests;
  result.checks.push('Negative net without hours, decimal-hour display, totals and existing IBC/entity UI contracts');
  result.status = 'passed';
} catch (error) {
  result.status = 'failed'; result.error = error.message; process.exitCode = 1;
} finally {
  result.finished_at = new Date().toISOString();
  fs.writeFileSync(path.join(output, 'certification.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result));
}
