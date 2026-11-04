// Local persistence certification; refuses remote databases. No migrations or remote writes.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
require('../load-env')(path.resolve('.env'));
if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(process.env.DATABASE_URL).hostname)) throw Error('Solo base local');
process.env.DISABLE_REDIS = 'true';
process.env.WORKERS_DISABLED = 'true';
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = randomUUID() + randomUUID();
const db = require('../../apps/api/src/core/prisma');
const hr = require('../../apps/api/src/modules/hr/service');
const admin = require('../../apps/api/src/modules/admin/service');
const checks = [];
let app;
const output = process.argv.find(arg => arg.startsWith('--output='))?.slice(9);
const result = { environment: 'LOCAL', source_branch: 'desarrollo', commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), started_at: new Date().toISOString(), checks, status: 'running' };
async function check(name, fn) { await fn(); checks.push(name); console.log('PASS ' + name); }
(async () => {
  try {
    const run = randomUUID();
    const config = { accounting: { organization_tree: {
      societies: [{ code: 'SOC', active: true }],
      branches: [{ code: 'BR', society_code: 'SOC', active: true }],
      cost_centers: [{ code: 'CC', society_code: 'SOC', branch_code: 'BR', active: true }]
    } } };
    const tenant = await db.tenant.create({ data: { name: `QA employee-user ${run}`, config } });
    const other = await db.tenant.create({ data: { name: `QA employee-user isolation ${run}`, config } });
    const role = await db.role.create({ data: { tenant_id: tenant.id, name: `QA employee-user ${run}` } });
    const email = `qa-${run}@example.invalid`;
    const employeeInput = { name: 'QA Empleado', document: '987654321', document_type: 'CC', email, salary_base: 2500000, hire_date: '2026-01-01', branch_code: 'BR', cost_center_code: 'CC' };
    const userInput = { role_id: role.id, name: 'QA Usuario', document: employeeInput.document, document_type: 'CC', email, company: 'QA', password: `Qa!9${randomUUID()}` };
    let employee, user;
    await check('employee without user remains unlinked', async () => {
      employee = await hr.createEmployee(tenant.id, employeeInput);
      assert.equal(employee.user_id, null);
    });
    await check('user creation reuses employee and preserves payroll and history', async () => {
      const historyBefore = await db.$queryRaw`SELECT id FROM th_empleado_contratos WHERE tenant_id = ${tenant.id} AND employee_id = ${employee.id}`;
      user = await admin.createUser(tenant.id, userInput);
      const stored = await db.employee.findFirstOrThrow({ where: { tenant_id: tenant.id, id: employee.id } });
      assert.equal(stored.user_id, user.id);
      assert.equal(Number(stored.salary_base), employeeInput.salary_base);
      assert.equal(stored.metadata.name, employeeInput.name);
      assert.equal(stored.metadata.accounting.cost_center_code, 'CC');
      assert.equal(await db.employee.count({ where: { tenant_id: tenant.id } }), 1);
      assert.deepEqual(await db.$queryRaw`SELECT id FROM th_empleado_contratos WHERE tenant_id = ${tenant.id} AND employee_id = ${employee.id}`, historyBefore);
    });
    await check('occupied employee rejects a second user atomically', async () => {
      await assert.rejects(admin.createUser(tenant.id, { ...userInput, email: `second-${email}` }), error => error.statusCode === 409);
      assert.equal(await db.user.count({ where: { tenant_id: tenant.id } }), 1);
    });
    await check('same identity in another tenant does not link across tenants', async () => {
      const foreign = await hr.createEmployee(other.id, employeeInput);
      assert.equal(foreign.user_id, null);
    });
    await check('employee creation links a preexisting user without a labor record', async () => {
      const linkedEmail = `bare-${email}`;
      const bare = await db.user.create({ data: { tenant_id: tenant.id, email: linkedEmail, name: 'QA bare', password: 'unusable-local-fixture' } });
      const created = await hr.createEmployee(tenant.id, { ...employeeInput, document: '987654322', email: linkedEmail.toUpperCase() });
      assert.equal(created.user_id, bare.id);
      assert.equal(created.user.id, bare.id);
    });
    await check('editing an unlinked employee links an existing user', async () => {
      const editEmail = `edit-${email}`;
      const bare = await db.user.create({ data: { tenant_id: tenant.id, email: editEmail, name: 'QA edit', password: 'unusable-local-fixture' } });
      const created = await hr.createEmployee(tenant.id, { ...employeeInput, document: '987654323', email: '' });
      const updated = await hr.updateEmployee(tenant.id, created.id, { email: editEmail });
      assert.equal(updated.user_id, bare.id);
    });
    await check('contradictory documents fail without creating a user', async () => {
      const conflictEmail = `conflict-${email}`;
      await hr.createEmployee(tenant.id, { ...employeeInput, document: '987654324', email: conflictEmail });
      await assert.rejects(admin.createUser(tenant.id, { ...userInput, document: '000123', email: conflictEmail }), error => error.statusCode === 409);
      assert.equal(await db.user.count({ where: { tenant_id: tenant.id, email: conflictEmail } }), 0);
    });
    await check('authenticated HTTP flow persists links, exposes them on read and enforces RBAC', async () => {
      const bcrypt = require('bcrypt');
      const httpTenant = await db.tenant.create({ data: { name: `QA employee-user HTTP ${run}`, active_modules: ['M-17', 'M-22'], config } });
      const adminRole = await db.role.create({ data: { tenant_id: httpTenant.id, name: 'QA employee-user HTTP admin', metadata: { role_type: 'admin_empresa' }, permissions: { create: [{ module: 'admin', action: 'write' }, { module: 'hr', action: 'write' }, { module: 'hr', action: 'read' }] } } });
      const readRole = await db.role.create({ data: { tenant_id: httpTenant.id, name: 'QA employee-user HTTP readonly', permissions: { create: [{ module: 'hr', action: 'read' }] } } });
      const password = `Qa!9${randomUUID()}`;
      const hash = await bcrypt.hash(password, 10);
      const actor = await db.user.create({ data: { tenant_id: httpTenant.id, name: 'QA HTTP admin', email: `admin-${email}`, password: hash, role_id: adminRole.id } });
      const reader = await db.user.create({ data: { tenant_id: httpTenant.id, name: 'QA HTTP reader', email: `reader-${email}`, password: hash, role_id: readRole.id } });
      app = await require('../../apps/api/server')();
      const origin = await app.listen({ host: '127.0.0.1', port: 0 });
      async function call(method, route, payload, token) {
        const response = await fetch(origin + '/api/v1' + route, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, ...(payload ? { body: JSON.stringify(payload) } : {}), signal: AbortSignal.timeout(30000) });
        return { status: response.status, body: await response.json() };
      }
      const login = await call('POST', '/auth/login', { email: actor.email, password });
      assert.equal(login.status, 200, JSON.stringify(login.body));
      const token = login.body.token;
      const readerLogin = await call('POST', '/auth/login', { email: reader.email, password });
      assert.equal(readerLogin.status, 200);
      const payload = { ...employeeInput, email: `http-${email}` };
      assert.equal((await call('POST', '/talento-humano/empleados', payload)).status, 401);
      assert.equal((await call('POST', '/talento-humano/empleados', payload, readerLogin.body.token)).status, 403);
      const created = await call('POST', '/talento-humano/empleados', payload, token);
      assert.equal(created.status, 200, JSON.stringify(created.body));
      assert.equal(created.body.user_id, null);
      const linked = await call('POST', '/admin/users', { ...userInput, role_id: readRole.id, email: payload.email }, token);
      assert.equal(linked.status, 201, JSON.stringify(linked.body));
      assert.equal(linked.body.employee_id, created.body.id);
      const stored = await db.employee.findFirstOrThrow({ where: { tenant_id: httpTenant.id, id: created.body.id } });
      assert.equal(stored.user_id, linked.body.id);
      assert.equal(Number(stored.salary_base), employeeInput.salary_base);
      const listed = await call('GET', '/talento-humano/empleados', null, token);
      assert.equal(listed.status, 200);
      const rows = Array.isArray(listed.body) ? listed.body : listed.body.data || listed.body.items;
      assert.equal(rows.find(row => row.id === created.body.id).user.id, linked.body.id);
      const conflict = await call('POST', '/admin/users', { ...userInput, role_id: readRole.id, email: `occupied-${email}` }, token);
      assert.equal(conflict.status, 409, JSON.stringify(conflict.body));
      assert.equal(await db.employee.count({ where: { tenant_id: httpTenant.id } }), 1);
      const bare = await db.user.create({ data: { tenant_id: httpTenant.id, name: 'QA HTTP bare', email: `http-bare-${email}`, password: hash, role_id: readRole.id } });
      const auto = await call('POST', '/talento-humano/empleados', { ...payload, document: '987654329', email: bare.email }, token);
      assert.equal(auto.status, 200, JSON.stringify(auto.body));
      assert.equal(auto.body.user.id, bare.id);
      const current = await call('GET', '/hr/self', null, (await call('POST', '/auth/login', { email: bare.email, password })).body.token);
      assert.equal(current.status, 200, JSON.stringify(current.body));
      assert.equal(current.body.id, auto.body.id);
      assert.equal(await db.employee.count({ where: { tenant_id: httpTenant.id } }), 2);
    });
    result.status = 'passed';
    result.scope = 'real local HTTP, authentication, authorization, service and PostgreSQL persistence';
    console.log(JSON.stringify(result));
    // Synthetic fixtures remain isolated in the two QA tenants for inspection.
  } catch (error) { console.error(error.message); result.status = 'failed'; result.error = error.message; process.exitCode = 1; }
  finally {
    result.finished_at = new Date().toISOString();
    if (output) { fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true }); fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n'); }
    if (app) await app.close();
    await db.$disconnect();
    process.exit(process.exitCode || 0);
  }
})();
