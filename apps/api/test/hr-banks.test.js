const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeBank, mergedBanks } = require('../src/modules/hr/banks');
test('national code retains leading zeros and SWIFT is normalized independently', () => {
  assert.deepEqual(normalizeBank({ code:'007', name:' Bancolombia ', swift:'colocobm' }), { code:'007', name:'Bancolombia', swift:'COLOCOBM', active:true });
  for (const code of ['7', '1007', 'COLOCOBM']) assert.throws(() => normalizeBank({ code, name:'Bank' }));
  assert.throws(() => normalizeBank({ code:'007', name:'Bank', swift:'12345678' }));
});
test('tenant override can deactivate a default without mutating another company', () => {
  const override = { code:'007', name:'Tenant bank', swift:'', active:false };
  assert.equal(mergedBanks({ hr_banks:{ '007':override } }).find(row => row.code==='007').active, false);
  assert.equal(mergedBanks().find(row => row.code==='007').active, true);
});
