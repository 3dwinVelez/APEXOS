const test = require('node:test');
const assert = require('node:assert/strict');
const { contractCalendarKey } = require('../src/modules/hr/contractCalendarDate');

test('calendar master dates retain their day when Prisma returns UTC midnight', () => {
  for (const day of ['2026-11-01', '2026-01-01', '2024-02-29', '2026-12-31']) {
    assert.equal(contractCalendarKey(new Date(day + 'T00:00:00Z')), day);
    assert.equal(contractCalendarKey(day), day);
    assert.equal(contractCalendarKey(day + 'T05:00:00Z'), day);
  }
});

test('invalid calendar dates fail instead of rolling into a different month', () => {
  for (const value of ['2026-02-29', '2026-02-31', '2026-13-01', '2026-00-01', '', 'not-a-date', new Date(NaN)]) {
    assert.throws(() => contractCalendarKey(value), error => error.statusCode === 400 && error.code === 'FECHA_CONTRACTUAL_INVALIDA');
  }
});

test('end dates and timestamp-shaped calendar inputs preserve the explicit calendar day', () => {
  assert.equal(contractCalendarKey('2026-11-30T00:00:00.000Z'), '2026-11-30');
  assert.equal(contractCalendarKey('2026-11-01T00:00:00-05:00'), '2026-11-01');
});
