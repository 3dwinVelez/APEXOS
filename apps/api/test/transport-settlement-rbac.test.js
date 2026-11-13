const test = require('node:test');
const assert = require('node:assert/strict');
const prismaPath = require.resolve('../src/core/prisma');
require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: {} };
const { requirePermission } = require('../src/middleware/rbac');
function request(actions) { return { tenant: { active_modules: ['M-14'] }, user: { role: { name: 'Operador de prueba', metadata: { scope: 'company' }, permissions: actions.map(action => ({ module: 'transport', action })) } }, params: {}, query: {}, body: {} }; }
function reply() { return { statusCode: 200, code(value) { this.statusCode = value; return this; }, send(value) { this.payload = value; return value; } }; }
test('crear y preparar exige escritura; lectura no habilita mutaciones', async () => {
  const denied = reply(); await requirePermission('transport', 'write')(request(['read']), denied); assert.equal(denied.statusCode, 403);
  const allowed = reply(); await requirePermission('transport', 'write')(request(['read', 'write']), allowed); assert.equal(allowed.statusCode, 200);
});
const actions = ['approve_settlements', 'account_settlements', 'liquidate_settlements'];
for (const required of actions) {
  test(`${required} exige su concesion individual`, async () => {
    for (const granted of [...actions, 'approve', 'write', 'read']) {
      const response = reply();
      await requirePermission('transport', required)(request([granted]), response);
      assert.equal(response.statusCode, granted === required ? 200 : 403, `${granted} -> ${required}`);
    }
    const disabled = request([required]); disabled.tenant.active_modules = ['M-01'];
    const denied = reply(); await requirePermission('transport', required)(disabled, denied);
    assert.equal(denied.statusCode, 403);
  });
}
test('las tres rutas exigen el permiso de su etapa', () => {
  const source = require('node:fs').readFileSync(require('node:path').join(__dirname, '../src/modules/transport/routes.js'), 'utf8');
  for (const [route, action] of [['decision', actions[0]], ['account', actions[1]], ['close', actions[2]]]) {
    const line = source.split('\n').find(line => line.includes(`settlement-packages/:id/${route}"`));
    assert.ok(line.includes(`requirePermission("transport", "${action}")`));
  }
});
