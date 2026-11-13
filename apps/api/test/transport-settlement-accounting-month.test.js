const test = require('node:test');
const assert = require('node:assert/strict');
const prismaPath = require.resolve('../src/core/prisma');
require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: {} };
const { currentAccountingMonth } = require('../src/modules/transport/settlement-service');
test('el mes contable cambia a medianoche de Colombia, no a medianoche UTC', () => {
  assert.equal(currentAccountingMonth(new Date('2026-11-01T04:59:59Z')), '2026-10');
  assert.equal(currentAccountingMonth(new Date('2026-11-01T05:00:00Z')), '2026-11');
  assert.equal(currentAccountingMonth(new Date('2027-01-01T04:59:59Z')), '2026-12');
  assert.equal(currentAccountingMonth(new Date('2027-01-01T05:00:00Z')), '2027-01');
});
