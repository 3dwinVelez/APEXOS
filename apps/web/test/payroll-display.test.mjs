import test from 'node:test';
import assert from 'node:assert/strict';
import { payrollDisplayRows, payrollDisplayTotals, payrollHours } from '../lib/payrollDisplay.ts';

test('negative deductions without time remain visible and contribute to net totals', () => {
  const rows = [
    { days_worked: 3, ordinary_hours: 15.7, overtime_hrs: .3, gross: 305501, deductions: 22447, net: 283054 },
    { gross: 0, deductions: 80000, net: -80000 },
    { gross: 0, deductions: 0, net: 0 }
  ];
  const visible = payrollDisplayRows(rows);
  assert.equal(visible.length, 2);
  assert.deepEqual(payrollDisplayTotals(visible), { days: 3, ordinaryHours: 15.7, overtimeHours: .3, gross: 305501, deductions: 102447, net: 203054, negativeCount: 1 });
  assert.equal(payrollDisplayTotals(visible.filter(row => row.net < 0)).net, -80000);
});

test('decimal hours display as hours and minutes with carry', () => {
  assert.equal(payrollHours(.3), '0:18');
  assert.equal(payrollHours(15.7), '15:42');
  assert.equal(payrollHours(1.999), '2:00');
  assert.equal(payrollHours(undefined), '0:00');
  assert.equal(payrollHours(123.5), '123:30');
});

test('empty periods have zero totals and legacy time fields remain visible', () => {
  assert.equal(payrollDisplayTotals([]).net, 0);
  const rows = payrollDisplayRows([{ source_summary: { days_worked: 1, ordinary_hours: 8 }, gross: 0, deductions: 0, net: 0 }]);
  assert.equal(rows.length, 1);
  assert.equal(payrollDisplayTotals(rows).ordinaryHours, 8);
});
