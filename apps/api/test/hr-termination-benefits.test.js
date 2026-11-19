const { test } = require('node:test');
const assert = require('node:assert/strict');
const { calculateTerminationBenefits, commercialDays } = require('../src/modules/hr/terminationBenefits');
const args = { start: '2025-01-01', end: '2026-11-10', salaryFor: () => 3000000 };
test('severance and interest reset by year; prima resets each semester, vacation accrues cumulatively', () => {
  assert.equal(commercialDays('2025-01-01', '2025-12-31'), 360);
  assert.equal(commercialDays('2026-07-01', '2026-11-10'), 130);
  const r = calculateTerminationBenefits(args);
  assert.deepEqual(r.filter(x => x.code === 'CESANTIAS').map(x => x.accrued_amount), [3000000, 2583333.33]);
  assert.equal(r.filter(x => x.code === 'PRIMA_SERVICIOS').length, 4);
  assert.equal(r.find(x => x.code === 'INTERESES_CESANTIAS' && x.end === '2025-12-31').accrued_amount, 360000);
});
test('previous annual/semester payments offset only their own windows', () => {
  const balances = [ { concept_code: 'CESANTIAS', date_start: '2025-01-01', date_end: '2025-12-31', paid_amount: 3000000 }, { concept_code: 'PRIMA_SERVICIOS', date_start: '2026-01-01', date_end: '2026-06-30', paid_amount: 1500000 } ];
  const r = calculateTerminationBenefits({ ...args, balances });
  assert.equal(r.find(x => x.code === 'CESANTIAS' && x.end === '2025-12-31').amount, 0);
  assert.equal(r.find(x => x.code === 'CESANTIAS' && x.end === '2026-11-10').amount, 2583333.33);
  assert.equal(r.find(x => x.code === 'PRIMA_SERVICIOS' && x.end === '2026-06-30').amount, 0);
});
test('manual salary bonus affects bases, non salary bonus does not; overtime is excluded from vacation base', () => {
  const metadata = { date_start: '2026-11-01', date_end: '2026-11-10' };
  const r = calculateTerminationBenefits({ start: metadata.date_start, end: metadata.date_end, salaryFor: () => 3000000, lines: [
    { code: 'SALARIO_BASICO', amount: 1000000, salary_constitutive: true, metadata },
    { code: 'BONO_MANUAL', amount: 100000, salary_constitutive: true, metadata },
    { code: 'BONIFICACION_NO_SALARIAL', amount: 500000, salary_constitutive: false, metadata },
    { code: 'HED', amount: 50000, salary_constitutive: true, metadata }
  ] });
  assert.equal(r.find(x => x.code === 'CESANTIAS').base, 3450000);
  assert.equal(r.find(x => x.code === 'VACACIONES').base, 3300000);
});
