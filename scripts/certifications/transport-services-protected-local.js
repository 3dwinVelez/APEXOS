// Regresion HTTP real de Servicios para el cambio compartido de contexto Prisma.
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { execFileSync } = require('node:child_process');
require('../load-env')(path.resolve('.env'));
if (!['localhost', '127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname)) throw Error('Solo base local');
process.env.DISABLE_REDIS = 'true';
const db = require('../../apps/api/src/core/prisma');
const bcrypt = require('bcrypt');
const result = { environment: 'LOCAL', commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), checks: [], status: 'running' };
const check = (name, ok, detail) => { result.checks.push({ name, status: ok ? 'passed' : 'failed', ...(detail ? { detail } : {}) }); if (!ok) throw Error(name); };
let app;
(async () => {
  try {
    const run = Date.now();
    const password = randomUUID();
    const hash = await bcrypt.hash(password, 10);
    const fixtures = [];
    for (const label of ['A', 'B']) {
      const tenant = await db.tenant.create({ data: { name: `QA Servicios protegido ${label} ${run}`, active_modules: ['M-26'] } });
      const own = await db.runWithTenant(tenant.id, async () => {
        const role = await db.role.create({ data: { name: 'QA Servicios autorizado', permissions: { create: [{ module: 'services', action: 'read' }, { module: 'services', action: 'write' }, { module: 'services.orders', action: 'edit_any_state' }] } } });
        const user = await db.user.create({ data: { name: 'QA Servicios', email: `qa-protected-${label.toLowerCase()}-${run}@apex.local`, password: hash, role_id: role.id } });
        const limitedRole = await db.role.create({ data: { name: 'QA Servicios lectura', permissions: { create: [{ module: 'services', action: 'read' }] } } });
        const limited = await db.user.create({ data: { name: 'QA lectura', email: `qa-protected-read-${label.toLowerCase()}-${run}@apex.local`, password: hash, role_id: limitedRole.id } });
        const techRole = await db.role.create({ data: { name: 'Tecnico', permissions: { create: [{ module: 'services', action: 'read' }, { module: 'services', action: 'write' }] } } });
        const techUser = await db.user.create({ data: { name: 'QA Tecnico', email: `qa-protected-tech-${label.toLowerCase()}-${run}@apex.local`, password: hash, role_id: techRole.id } });
        const technician = await db.employee.create({ data: { user_id: techUser.id, code: 'QA-PROTECTED', user_type: 'tecnico', position: 'Tecnico QA', department: 'QA', salary_base: 0, hire_date: new Date() } });
        const reference = await db.serviceReference.create({ data: { code: 'QA-PROTECTED', name: 'Referencia sintetica QA' } });
        return { tenant, user, limited, techUser, technician, reference };
      });
      fixtures.push(own);
    }
    app = await require('../../apps/api/server')();
    await app.listen({ port: 3224, host: '127.0.0.1' });
    async function call(token, route, method = 'GET', body) {
      const response = await fetch('http://127.0.0.1:3224/api/v1' + route, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
      return { status: response.status, body: await response.json() };
    }
    for (const fixture of fixtures) {
      for (const key of ['user', 'limited', 'techUser']) {
        const login = await call(null, '/auth/login', 'POST', { email: fixture[key].email, password });
        check(`login_${key}_${fixture === fixtures[0] ? 'A' : 'B'}`, login.status === 200 && Boolean(login.body.token));
        fixture[key + 'Token'] = login.body.token;
      }
    }
    const [own, other] = fixtures;
    const types = await call(own.userToken, '/services/service-types');
    check('service_types_available', types.status === 200 && types.body.some(row => row.active));
    const serviceType = types.body.find(row => row.active).code;
    for (const external of [false, true]) {
      const created = await call(own.userToken, '/services/orders', 'POST', { technician_id: own.technician.id, reference_id: own.reference.id, service_type: serviceType, customer_name: 'QA Cliente protegido', customer_document: String(run), customer_address: 'Direccion sintetica QA', customer_phone: '3000000000', scheduled_date: new Date().toISOString(), notes: 'Observacion inicial QA', metadata: external ? { external_order_id: randomUUID(), source: 'qa-external-regression' } : { source: 'qa-internal-regression' }, items: [{ reference_id: own.reference.id, service_type: serviceType, quantity: 1 }] });
      const label = external ? 'external' : 'internal';
      check(`${label}_order_created`, created.status === 200 && Boolean(created.body.id), { status: created.status });
      const route = `/services/orders/${created.body.id}`;
      check(`${label}_anonymous_denied`, (await call(null, route)).status === 401);
      check(`${label}_foreign_read_denied`, (await call(other.userToken, route)).status === 404);
      check(`${label}_foreign_start_denied`, (await call(other.userToken, route + '/start', 'PATCH', {})).status === 404);
      check(`${label}_limited_start_denied`, (await call(own.limitedToken, route + '/start', 'PATCH', {})).status === 403);
      const start = await call(own.techUserToken, route + '/start', 'PATCH', { latitude: 6.24, longitude: -75.58 });
      check(`${label}_assigned_technician_starts`, start.status === 200 && start.body.status === 'en_curso', { status: start.status });
      const reopened = await call(own.userToken, route);
      check(`${label}_start_persisted`, reopened.body.status === 'en_curso' && Boolean(reopened.body.started_at));
      const correctionInput = { reason_code: 'DATA_ENTRY_ERROR', description: 'Correccion sintetica de observacion para regresion de aislamiento', confirmed: true, expected_version: reopened.body.version, changes: [{ type: 'FIELD_UPDATED', field: 'notes', value: 'Observacion corregida QA' }] };
      check(`${label}_limited_correction_denied`, (await call(own.limitedToken, route + '/corrections', 'POST', correctionInput)).status === 403);
      check(`${label}_foreign_correction_denied`, (await call(other.userToken, route + '/corrections', 'POST', correctionInput)).status === 404);
      const correction = await call(own.userToken, route + '/corrections', 'POST', correctionInput);
      check(`${label}_correction_created`, correction.status === 200 || correction.status === 201, { status: correction.status });
      const applied = await call(own.userToken, route + `/corrections/${correction.body.id}/apply`, 'POST', {});
      check(`${label}_correction_applied`, applied.status === 200 && applied.body.status === 'APPLIED', { status: applied.status });
      const final = await call(own.userToken, route);
      check(`${label}_correction_persists_without_losing_items`, final.body.notes === 'Observacion corregida QA' && final.body.items.length === 1 && final.body.status === 'en_curso');
      const history = await call(own.userToken, route + '/corrections');
      check(`${label}_audit_preserved`, history.status === 200 && history.body.some(row => row.id === correction.body.id));
      check(`${label}_foreign_history_denied`, (await call(other.userToken, route + '/corrections')).status === 404);
    }
    result.status = 'passed';
  } catch (error) { result.status = 'failed'; result.error = error.message; process.exitCode = 1; }
  finally { if (app) await app.close(); await db.$disconnect(); fs.writeFileSync(process.argv[2], JSON.stringify(result, null, 2)); console.log(JSON.stringify(result)); }
})();
