const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const { payrollPeriodError, assertPayrollPeriod } = require('../src/modules/hr/payrollPeriod');
const compiled = ts.transpileModule(fs.readFileSync(require('node:path').resolve(__dirname, '../../web/lib/payroll-period.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const web = { exports: {} }; new Function('exports', compiled)(web.exports);
for (const [type, start, end, valid] of [
  ['quincena', '2026-11-01', '2026-11-30', false],
  ['quincena', '2026-11-01', '2026-11-15', true],
  ['quincena', '2026-11-16', '2026-11-30', true],
  ['quincena', '2026-12-16', '2026-12-31', true],
  ['quincena', '2026-02-16', '2026-02-28', true],
  ['quincena', '2028-02-16', '2028-02-29', true],
  ['quincena', '2026-11-05', '2026-11-19', false],
  ['quincena', '2026-12-16', '2027-01-01', false],
  ['quincena', '2026-02-16', '2026-02-30', false],
  ['mes', '2026-11-01', '2026-11-30', true],
  ['mes', '2026-11-30', '2026-11-01', false],
  ['mes', '', '', false],
]) test(`${type} ${start} to ${end}: API and UI agree`, () => {
  const error = payrollPeriodError(type, start, end);
  assert.equal(!error, valid); assert.equal(web.exports.payrollPeriodError(type, start, end), error);
});
test('forged period key is rejected, internal termination may use the natural fortnight key', () => {
  const input = { fecha_inicio: '2026-11-03', fecha_fin: '2026-11-10', period_key: 'quincena:2026-11-01:2026-11-15' };
  assert.throws(() => assertPayrollPeriod(input), { statusCode: 400 });
  assert.doesNotThrow(() => assertPayrollPeriod(input, { partial: true }));
  assert.throws(() => assertPayrollPeriod({ fecha_inicio:'2026-11-01', fecha_fin:'2026-11-15', period_key:'mes:2026-11-01:2026-11-30' }), /clave/);
  assert.throws(() => assertPayrollPeriod({ ...input, fecha_fin:'2026-11-30' }, { partial: true }));
});
