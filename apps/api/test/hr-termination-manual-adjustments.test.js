const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fortnight } = require('../src/modules/hr/terminationManualAdjustments');
test('manual settlement dates derive the actual fortnight across month and year boundaries', () => {
  assert.deepEqual(fortnight('2026-11-15'), { start: '2026-11-01', end: '2026-11-15', key: 'quincena:2026-11-01:2026-11-15' });
  assert.equal(fortnight('2026-11-16').key, 'quincena:2026-11-16:2026-11-30');
  assert.equal(fortnight('2026-12-31').key, 'quincena:2026-12-16:2026-12-31');
  assert.equal(fortnight('2028-02-29').key, 'quincena:2028-02-16:2028-02-29');
});
