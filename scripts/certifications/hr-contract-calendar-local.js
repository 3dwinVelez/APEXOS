const assert = require('node:assert/strict'), fs = require('fs'), path = require('path'), { randomUUID } = require('node:crypto');
require('../load-env')();
if (!['127.0.0.1', 'localhost'].includes(new URL(process.env.DATABASE_URL).hostname))
    throw Error('Local database required');
Object.assign(process.env, { NODE_ENV: 'test', REDIS_DISABLED: 'true', DISABLE_REDIS: 'true', JWT_SECRET: randomUUID() + randomUUID(), ALLOWED_ORIGINS: 'http://127.0.0.1:' + (process.env.CERT_BROWSER_PORT || 3317) });
const db = require('../../apps/api/src/core/prisma'), bcrypt = require('bcrypt');
let app;
const result = { status: 'running', environment: 'LOCAL', started_at: new Date().toISOString(), checks: [] };
const output = process.argv.find(a => a.startsWith('--output='))?.slice(9);
async function check(name, fn) { await fn(); result.checks.push(name); console.log('PASS ' + name); }
(async () => {
    try {
        const password = 'Qa!9' + randomUUID(), hash = await bcrypt.hash(password, 10);
        async function actor(label, perms) { const tenant = await db.tenant.create({ data: { name: 'CERT calendar ' + label, active_modules: ['M-17', 'M-22'], config: { accounting: { organization_tree: { societies: [{ code: 'SOC', active: true }], branches: [{ code: 'BR', society_code: 'SOC', active: true }], cost_centers: [{ code: 'CC', society_code: 'SOC', branch_code: 'BR', active: true }] } } } } }); const role = await db.role.create({ data: { tenant_id: tenant.id, name: 'QA calendar', metadata: { role_type: 'admin_empresa' }, permissions: { create: perms.map(([module, action]) => ({ module, action })) } } }); const user = await db.user.create({ data: { tenant_id: tenant.id, name: 'QA calendar', email: randomUUID() + '@example.invalid', password: hash, role_id: role.id } }); return { tenant, user }; }
        const own = await actor('own', [['hr', 'read'], ['hr', 'write'], ['payroll', 'read'], ['payroll', 'write'], ['admin', 'read']]), other = await actor('foreign', [['hr', 'read'], ['hr', 'write']]);
        const deniedRole = await db.role.create({ data: { tenant_id: own.tenant.id, name: 'Read only calendar', permissions: { create: [{ module: 'hr', action: 'read' }] } } });
        const deniedUser = await db.user.create({ data: { tenant_id: own.tenant.id, role_id: deniedRole.id, name: 'Read only', email: randomUUID() + '@example.invalid', password: hash } });
        app = await require('../../apps/api/server')();
        const origin = await app.listen({ host: '127.0.0.1', port: 0 });
        async function call(route, token, method = 'GET', body) { const r = await fetch(origin + '/api/v1' + route, { method, headers: { ...(token ? { authorization: 'Bearer ' + token } : {}), 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(45000) }); return { status: r.status, body: await r.json() }; }
        async function login(user) { const r = await call('/auth/login', null, 'POST', { email: user.email, password }); assert.equal(r.status, 200, JSON.stringify(r.body)); return r.body.token; }
        const token = await login(own.user), foreignToken = await login(other.user), deniedToken = await login(deniedUser);
        let sequence = 0;
        async function broken(label) { const employee = await db.employee.create({ data: { tenant_id: own.tenant.id, code: 'CAL-' + sequence++, position: 'QA', department: 'QA', hire_date: new Date('2026-11-01T00:00:00Z'), salary_base: 2000000, contract_type: 'indefinite', metadata: { name: label, document: String(9900000000 + sequence) } } }); const rows = await db.$queryRaw `INSERT INTO th_empleado_contratos(tenant_id,employee_id,continuity_group_id,contract_type,status,reason,valid_from,salary_base,metadata) VALUES(${own.tenant.id},${employee.id},${randomUUID()},'indefinite','activo','ingreso','2026-10-31'::date,2000000,'{"seeded_from_employee_master":true}'::jsonb) RETURNING id`; return { employee, contractId: Number(rows[0].id) }; }
        const endpoint = x => '/talento-humano/empleados/' + x.employee.id + '/contratos/corregir-fecha-inicial';
        const payload = (x, apply = false) => ({ contract_id: x.contractId, expected_start: '2026-10-31', expected_hire_date: '2026-11-01', apply });
        const contract = async (x) => (await db.$queryRaw `SELECT valid_from::text AS valid_from,metadata FROM th_empleado_contratos WHERE tenant_id=${own.tenant.id} AND id=${x.contractId}`)[0];
        await check('new hires keep first-of-month and year boundaries in master, contract and contract API', async () => { for (const [index, day] of ['2026-11-01', '2026-01-01', '2024-02-29'].entries()) {
            const r = await call('/talento-humano/empleados', token, 'POST', { name: 'CERT new ' + day, document: String(8800000000 + index), document_type: 'CC', hire_date: day, salary_base: 2000000, contract_type: index === 0 ? 'fixed' : 'indefinite', ...(index === 0 ? { end_date: '2026-11-30' } : {}), society_code: 'SOC', branch_code: 'BR', cost_center_code: 'CC' });
            assert.equal(r.status, 200, JSON.stringify(r.body));
            assert.equal(r.body.hire_date.slice(0, 10), day);
            const c = await call('/talento-humano/empleados/' + r.body.id + '/contratos', token);
            assert.equal(c.status, 200);
            assert.equal(c.body[0].valid_from.slice(0, 10), day);
            if (index === 0)
                assert.equal(c.body[0].valid_to.slice(0, 10), '2026-11-30');
            const raw = await db.$queryRaw `SELECT valid_from::text AS day FROM th_empleado_contratos WHERE tenant_id=${own.tenant.id} AND employee_id=${r.body.id}`;
            assert.equal(raw[0].day, day);
        } });
        await check('default hire date follows Bogota today; amendments and rehires preserve their explicit calendar date', async () => {
            const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
            const created = await call('/talento-humano/empleados', token, 'POST', { name: 'CERT default date', document: '8810000000', document_type: 'CC', salary_base: 2000000, society_code: 'SOC', branch_code: 'BR', cost_center_code: 'CC' });
            assert.equal(created.status, 200, JSON.stringify(created.body));
            assert.equal(created.body.hire_date.slice(0, 10), today);
            const foundation = await call('/talento-humano/empleados/' + created.body.id + '/contratos', token);
            assert.equal(foundation.body[0].valid_from.slice(0, 10), today);
            const salaryHistory = await call('/talento-humano/empleados/' + created.body.id + '/salarios', token);
            assert.equal(salaryHistory.status, 200);
            assert.equal(salaryHistory.body[0].valid_from.slice(0, 10), today);
            const base = await call('/talento-humano/empleados', token, 'POST', { name: 'CERT amendment date', document: '8810000001', document_type: 'CC', hire_date: '2026-01-01', salary_base: 2000000, society_code: 'SOC', branch_code: 'BR', cost_center_code: 'CC' });
            assert.equal(base.status, 200);
            const amendment = await call('/talento-humano/empleados/' + base.body.id + '/contratos/otrosi', token, 'POST', { valid_from: '2026-02-01T00:00:00.000Z', contract_type: 'indefinite', salary_base: 2100000 });
            assert.equal(amendment.status, 200, JSON.stringify(amendment.body));
            const amended = await call('/talento-humano/empleados/' + base.body.id + '/contratos', token);
            assert.equal(amended.body[0].valid_from.slice(0, 10), '2026-02-01');
            assert.equal(amended.body[1].valid_to.slice(0, 10), '2026-01-31');
            const retired = await db.employee.create({ data: { tenant_id: own.tenant.id, code: 'CAL-REHIRE', active: false, position: 'QA', department: 'QA', salary_base: 2000000, hire_date: new Date('2025-11-01T00:00:00Z'), end_date: new Date('2025-11-30T00:00:00Z'), metadata: { name: 'CERT rehire' } } });
            const rehire = await call('/talento-humano/empleados/' + retired.id + '/recontratar', token, 'POST', { new_hire_date: '2026-11-01T00:00:00.000Z', contract_type: 'indefinite', salary_base: 2000000, society_code: 'SOC', branch_code: 'BR', cost_center_code: 'CC' });
            assert.equal(rehire.status, 200, JSON.stringify(rehire.body));
            const rehired = await call('/talento-humano/empleados/' + retired.id + '/contratos', token);
            assert.equal(rehired.body[0].valid_from.slice(0, 10), '2026-11-01');
            assert.equal(rehired.body[0].valid_to, null);
        });
        const affected = [];
        for (let i = 0; i < 21; i++)
            affected.push(await broken('CERT calendar existing ' + String(i).padStart(2, '0')));
        await check('preview is read only and repair of 21 seeded contracts is audited and idempotent without duplicates', async () => { const count = await db.employee.count({ where: { tenant_id: own.tenant.id } }); for (const x of affected) {
            const preview = await call(endpoint(x), token, 'POST', payload(x));
            assert.equal(preview.status, 200, JSON.stringify(preview.body));
            assert.equal(preview.body.dry_run, true);
            assert.equal((await contract(x)).valid_from, '2026-10-31');
            const repaired = await call(endpoint(x), token, 'POST', payload(x, true));
            assert.equal(repaired.status, 200, JSON.stringify(repaired.body));
            assert.equal(repaired.body.changed, true);
            const saved = await contract(x);
            assert.equal(saved.valid_from, '2026-11-01');
            assert.equal(saved.metadata.calendar_date_repair.actor_id, own.user.id);
            const again = await call(endpoint(x), token, 'POST', payload(x, true));
            assert.equal(again.status, 200);
            assert.equal(again.body.changed, false);
            assert.deepEqual((await contract(x)).metadata, saved.metadata);
        } assert.equal(await db.employee.count({ where: { tenant_id: own.tenant.id } }), count); result.repaired_contracts = 21; });
        await check('authentication, write permission, tenant isolation and stale expected values prevent repair', async () => { const x = await broken('CERT protected'); assert.equal((await call(endpoint(x), null, 'POST', payload(x, true))).status, 401); assert.equal((await call(endpoint(x), deniedToken, 'POST', payload(x, true))).status, 403); assert.equal((await call(endpoint(x), foreignToken, 'POST', payload(x, true))).status, 404); assert.equal((await call(endpoint(x), token, 'POST', { ...payload(x, true), expected_hire_date: '2026-11-02' })).status, 409); assert.equal((await call(endpoint(x), token, 'POST', { ...payload(x, true), expected_start: '2026-10-30' })).status, 409); assert.equal((await contract(x)).valid_from, '2026-10-31'); });
        await check('amendments, financial movements and concurrent payroll transactions block repair', async () => { const used = await broken('CERT used'); await db.payroll.create({ data: { tenant_id: own.tenant.id, employee_id: used.employee.id, period: 'CERT', days_worked: 0, gross: 1, deductions: 0, net: 1, employer_cost: 0, detail: {} } }); const denied = await call(endpoint(used), token, 'POST', payload(used, true)); assert.equal(denied.status, 409); assert.equal(denied.body.code, 'REPARACION_CONTRATO_CON_MOVIMIENTOS'); const amended = await broken('CERT amended'); await db.$executeRaw `INSERT INTO th_empleado_contratos(tenant_id,employee_id,continuity_group_id,contract_type,status,reason,valid_from,salary_base) VALUES(${own.tenant.id},${amended.employee.id},${randomUUID()},'indefinite','cerrado','otrosi','2026-11-10'::date,2000000)`; assert.equal((await call(endpoint(amended), token, 'POST', payload(amended, true))).status, 409); const busy = await broken('CERT busy'); let release, ready; const gate = new Promise(r => release = r), locked = new Promise(r => ready = r); const transaction = db.$transaction(async (tx) => { await tx.$executeRaw `SELECT pg_advisory_xact_lock(hashtext(${own.tenant.id}),7418)`; ready(); await gate; }, { timeout: 15000 }); await locked; try {
            const r = await call(endpoint(busy), token, 'POST', payload(busy, true));
            assert.equal(r.status, 409);
            assert.equal(r.body.code, 'REPARACION_CONTRATO_OCUPADA');
        }
        finally {
            release();
            await transaction;
        } for (const x of [used, amended, busy])
            assert.equal((await contract(x)).valid_from, '2026-10-31'); });
        await check('versioned batch runner previews the complete plan, verifies tenant and replays safely', async () => { const folder = path.resolve('.local/hr-contract-calendar'); fs.mkdirSync(folder, { recursive: true }); const file = path.join(folder, 'fixture-plan.json'), report = path.join(folder, 'batch.json'); fs.writeFileSync(file, JSON.stringify({ tenant_id: own.tenant.id, employees: affected.map(x => ({ employee_id: x.employee.id, contract_id: x.contractId, expected_start: '2026-10-31', expected_hire_date: '2026-11-01' })) })); await new Promise((resolve, reject) => { const child = require('node:child_process').spawn(process.execPath, [path.resolve('scripts/repair-hr-contract-calendar.js'), '--api-url=' + origin, '--plan=' + file, '--output=' + report, '--apply'], { env: { ...process.env, HR_CONTRACT_REPAIR_TOKEN: token }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }); let stderr = ''; child.stderr.on('data', b => stderr += b); const timer = setTimeout(() => { child.kill(); reject(Error('Batch timed out')); }, 90000); child.on('error', reject); child.on('close', code => { clearTimeout(timer); code === 0 ? resolve() : reject(Error('Batch failed ' + stderr.slice(-500))); }); }); const saved = JSON.parse(fs.readFileSync(report)); assert.equal(saved.status, 'passed'); assert.equal(saved.previews.length, 21); assert.equal(saved.results.length, 21); assert.ok(saved.results.every(row => row.changed === false)); });
        await check('real employee dialog shows the corrected calendar date and retains it after reload', async () => { await require('./hr-employee-user-association-browser-local')({ origin, token, pagePath: '/dashboard/talento-humano/empleados', artifactName: 'hr-contract-calendar', exercise: async (page, folder) => { async function open() { await page.waitForFunction(() => [...document.querySelectorAll('tbody tr')].some(r => r.innerText.includes('CERT calendar existing 00'))); await page.evaluate(() => [...document.querySelectorAll('tbody tr')].find(r => r.innerText.includes('CERT calendar existing 00')).querySelector('button[title^="Ver"]').click()); await page.waitForFunction(() => [...document.querySelectorAll('[role="dialog"] section')].some(s => s.innerText.includes('Historial contractual') && s.querySelector('tbody')?.innerText.includes('2026-11-01'))); const text = await page.evaluate(() => [...document.querySelectorAll('[role="dialog"] section')].find(s => s.innerText.includes('Historial contractual'))?.querySelector('tbody').innerText); assert.ok(!text.includes('2026-10-31')); } await open(); await page.screenshot({ path: path.join(folder, 'corrected-contract.png'), fullPage: true }); await page.reload({ waitUntil: 'domcontentloaded' }); await open(); await page.screenshot({ path: path.join(folder, 'corrected-contract-reload.png'), fullPage: true }); } }); });
        result.status = 'passed';
    }
    catch (error) {
        result.status = 'failed';
        result.error = error.stack;
        console.error(error.stack);
        process.exitCode = 1;
    }
    finally {
        result.finished_at = new Date().toISOString();
        if (output)
            fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
        if (app)
            await app.close();
        await db.$disconnect();
        console.log(JSON.stringify(result));
        process.exit(process.exitCode || 0);
    }
})();
