const assert = require('node:assert/strict');
const fs = require('node:fs');
const { randomUUID } = require('node:crypto');
const bcrypt = require('bcrypt');
assert.match(new URL(process.env.DATABASE_URL).hostname, /^(localhost|127\.0\.0\.1)$/);
process.env.JWT_SECRET = randomUUID() + randomUUID();
process.env.ALLOWED_ORIGINS = 'http://127.0.0.1:' + (process.env.CERT_BROWSER_PORT || 3317);
const db = require('../../apps/api/src/core/prisma');
const output = process.argv.find(arg => arg.startsWith('--output='))?.slice(9);
const checks = [];
let app;

async function certify() {
  const tenant = await db.tenant.create({ data: { name: 'QA document search', active_modules: ['M-17', 'M-22'] } });
  const foreign = await db.tenant.create({ data: { name: 'QA other company' } });
  const role = await db.role.create({ data: {
    tenant_id: tenant.id, name: 'QA Payroll', metadata: { role_type: 'admin_empresa' },
    permissions: { create: [{ module: 'hr', action: 'read' }, { module: 'payroll', action: 'read' }] }
  } });
  const password = randomUUID() + 'Qa!9';
  const user = await db.user.create({ data: {
    tenant_id: tenant.id, role_id: role.id, name: 'QA Search User', email: randomUUID() + '@example.invalid',
    password: await bcrypt.hash(password, 10)
  } });
  function employee(company, name, document, active = true) {
    return db.employee.create({ data: {
      tenant_id: company.id, code: name, position: 'Operario', department: 'Operaciones', active,
      salary_base: 2000000, hire_date: new Date('2025-01-01T05:00:00Z'), contract_type: 'fixed',
      metadata: { name, document, document_type: 'CC' }
    } });
  }
  const prefix = await employee(tenant, 'QA Prefijo', '76543210');
  const target = await employee(tenant, 'QA Coincidencia', '7.654-321');
  await employee(tenant, 'QA Inactivo', '7654321', false);
  await employee(foreign, 'QA Ajeno', '7654321');

  app = await require('../../apps/api/server')();
  const origin = await app.listen({ host: '127.0.0.1', port: 0 });
  const login = await fetch(origin + '/api/v1/auth/login', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: user.email, password })
  });
  assert.equal(login.status, 200);
  const { token } = await login.json();
  assert.ok(token);
  const search = origin + '/api/v1/talento-humano/empleados?document_search=7.654-321';
  assert.equal((await fetch(search)).status, 401);
  const response = await fetch(search, { headers: { authorization: 'Bearer ' + token } });
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).map(row => row.id), [target.id, prefix.id]);
  checks.push('document matching prioritizes exact results and excludes inactive and foreign employees');

  await require('./hr-employee-user-association-browser-local')({
    origin, token, pagePath: '/dashboard/talento-humano/liquidacion-trabajador',
    artifactName: 'hr-termination-document-search',
    exercise: async (page, folder) => {
      const field = '#termination-employee-document';
      await page.waitForSelector(field);
      await page.type(field, '7.654-321');
      await page.waitForFunction(() => document.querySelectorAll('ul[aria-label="Empleados encontrados"] button').length === 2);
      await page.click('ul[aria-label="Empleados encontrados"] button');
      const contract = await page.evaluate(() => [...document.querySelectorAll('label')].find(el => el.textContent.startsWith('Tipo contrato')).querySelector('select').value);
      assert.equal(contract, 'fixed');
      const previewButton = () => page.evaluateHandle(() => [...document.querySelectorAll('button')].find(el => /Prueba|Simular/i.test(el.textContent)));
      const preview = (await previewButton()).asElement();
      assert.ok(preview);
      const pending = page.waitForResponse(res => res.url().endsWith('/liquidacion-trabajador/preview') && res.request().method() === 'POST');
      await preview.click();
      const result = await pending;
      assert.equal(Number(JSON.parse(result.request().postData()).employee_id), target.id);
      assert.equal(result.status(), 200, await result.text());
      assert.equal((await result.json()).document.employee_id, target.id);
      await page.waitForFunction(() => document.body.innerText.includes('Liquidacion de prueba calculada.'));
      await page.screenshot({ path: require('node:path').join(folder, 'selected-preview.png') });
      await page.type(field, '9');
      assert.equal(await preview.evaluate(el => el.disabled), true);
      checks.push('browser searches, selects, previews the correct employee and clears selection after editing');
    }
  });
}

certify().then(() => {
  const result = { status: 'passed', checks, finished_at: new Date().toISOString() };
  if (output) fs.writeFileSync(output, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
}).catch(error => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  if (app) await app.close();
  await db.$disconnect();
});
