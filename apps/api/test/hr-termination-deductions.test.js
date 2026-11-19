const { test } = require('node:test');
const assert = require('node:assert/strict');
const { terminationDeductions } = require('../src/modules/hr/terminationDeductions');
const loans = [1, 2, 3].map(id => ({ id, mode: 'cuotas', balance_amount: 1000, concept_code: 'LOAN', concept_name: 'Libranza' }));
test('salary capacity is shared across loans and never spends more than authorized available net', () => {
  const r = terminationDeductions({ loans, authorizations: loans.map(({id}) => ({ id, support: 'Autorización firmada' })), salaryNet: 3000, benefits: 5000, available: 8000 });
  assert.deepEqual(r.audit.map(x => x.deducted), [1000, 500, 0]);
  assert.equal(r.audit[1].balance_after, 500);
});
test('no written final authorization means no deduction, including a perpetual charge', () => {
  const r = terminationDeductions({ loans: [...loans, { id: 4, mode: 'perpetua', balance_amount: 1000 }], authorizations: [{ id: 4, support: 'Signed' }], salaryNet: 3000, benefits: 5000, available: 8000 });
  assert.equal(r.lines.length, 0);
});
test('benefits require separate legal support and their budget cannot be spent twice', () => {
  const args = { loans, salaryNet: 0, benefits: 3000, available: 3000 };
  const authorizations = loans.map(({id}) => ({ id, support: 'Signed', benefits_percent: 50 }));
  assert.equal(terminationDeductions({ ...args, authorizations }).lines.length, 0);
  const r = terminationDeductions({ ...args, authorizations: authorizations.map(x => ({ ...x, legal_support: 'Reviewed scope' })) });
  assert.deepEqual(r.audit.map(x => x.deducted), [1000, 500, 0]);
});
test('full balance can be paid within reviewed authorization, otherwise cash availability limits it', () => {
  const args = { loans: [loans[0]], authorizations: [{ id: 1, support: 'Signed', benefits_percent: 100, legal_support: 'Review' }], salaryNet: 0, benefits: 2000 };
  assert.equal(terminationDeductions({ ...args, available: 2000 }).audit[0].balance_after, 0);
  assert.equal(terminationDeductions({ ...args, available: 300 }).audit[0].deducted, 300);
  assert.throws(() => terminationDeductions({ ...args, available: 2000, authorizations: [{ id: 1, support: 'x', benefits_percent: 101 }] }));
});
