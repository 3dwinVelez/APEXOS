const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../src/core/prisma');

test('consume promesas diferidas dentro del contexto de empresa aunque el consumidor espere afuera', async () => {
  const deferred = { then(resolve) { resolve(db.currentTenantId()); } };
  const pending = db.runWithTenant('company-a', () => deferred);
  assert.equal(db.currentTenantId(), undefined);
  assert.equal(await pending, 'company-a');
});

test('promesas diferidas concurrentes no comparten el contexto de empresa', async () => {
  const query = tenant => db.runWithTenant(tenant, () => ({ then(resolve) { setImmediate(() => resolve(db.currentTenantId())); } }));
  assert.deepEqual(await Promise.all([query('a'), query('b')]), ['a', 'b']);
  assert.equal(db.currentTenantId(), undefined);
});
