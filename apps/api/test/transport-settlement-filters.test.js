const test = require('node:test');
const assert = require('node:assert/strict');
const { settlementDateRange } = require('../src/modules/transport/settlement-filters');
test('service calendar range includes full last day and supports open bounds', () => {
  const range = settlementDateRange({ date_from: '2026-10-01', date_to: '2026-10-21' });
  assert.equal(range.gte.toISOString(), '2026-10-01T00:00:00.000Z');
  assert.equal(range.lt.toISOString(), '2026-10-22T00:00:00.000Z');
  assert.equal(settlementDateRange({ date_to: '2026-12-31' }).lt.toISOString(), '2027-01-01T00:00:00.000Z');
  assert.equal(settlementDateRange({}), null);
});
test('impossible dates and inverted ranges are rejected rather than broadening history', () => {
  for (const query of [{ date_from: '2026-02-30' }, { date_to: 'invalid' }, { date_from: ['2026-10-01'] }, { date_from: '2026-10-22', date_to: '2026-10-21' }]) assert.throws(() => settlementDateRange(query), { code: 'TMS_SETTLEMENT_DATE_FILTER', statusCode: 400 });
});
