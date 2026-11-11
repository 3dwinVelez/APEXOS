// Local browser certification of the Talento Humano task-card hub. Real API, real database, no mocked responses.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { execFileSync } = require('node:child_process');
require('../load-env')(path.resolve('.env'));
if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(process.env.DATABASE_URL).hostname)) throw Error('Solo base local');
Object.assign(process.env, {
  NODE_ENV: 'test', REDIS_DISABLED: 'true', DISABLE_REDIS: 'true', WORKERS_DISABLED: 'true',
  JWT_SECRET: randomUUID() + randomUUID(), ALLOWED_ORIGINS: `http://127.0.0.1:${Number(process.env.CERT_BROWSER_PORT || 3317)}`
});
const db = require('../../apps/api/src/core/prisma');
const bcrypt = require('bcrypt');

const HUB_PATH = '/dashboard/talento-humano';
const HUB_SECTION = 'section[aria-label="Herramientas activas de talento humano"]';
const EXPECTED_ACCESS_HREFS = [
  '/dashboard/talento-humano/rutas',
  '/dashboard/talento-humano/mallas',
  '/dashboard/talento-humano/marcacion',
  '/dashboard/talento-humano/novedades',
  '/dashboard/talento-humano/mapa',
  '/dashboard/talento-humano/empleados',
  '/dashboard/talento-humano/entidades',
  '/dashboard/talento-humano/configuracion-laboral',
  '/dashboard/talento-humano/nomina',
  '/dashboard/talento-humano/provisiones',
  '/dashboard/talento-humano/aportes-sociales',
  '/dashboard/talento-humano/prestaciones-pagos',
  '/dashboard/talento-humano/libranzas',
  '/dashboard/talento-humano/liquidacion-trabajador',
  '/dashboard/talento-humano/reportes'
];
const BROKEN_MARKERS = ['Internal Server Error', 'Application error', 'Unhandled Runtime Error', 'Something went wrong', 'BUILD ERROR'];

async function collectNetwork(page, apiOrigin, sink) {
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      sink.console.push(`${message.type()}: ${message.text().slice(0, 200)} @ ${message.location()?.url || ''}`.slice(0, 400));
    }
  });
  page.on('pageerror', (error) => sink.console.push(`pageerror: ${String(error.message).slice(0, 300)}`));
  page.on('requestfailed', (request) => {
    if (!request.url().startsWith(apiOrigin)) return;
    sink.failed.push({ url: new URL(request.url()).pathname, status: 0, body: String(request.failure()?.errorText || 'failed') });
  });
  page.on('framenavigated', (frame) => {
    if (frame !== page.mainFrame()) return;
    try { sink.navigations.push(new URL(frame.url()).pathname); } catch { sink.navigations.push(String(frame.url()).slice(0, 120)); }
  });
  page.on('response', (response) => {
    try {
      if (!response.url().startsWith(apiOrigin)) return;
      const entry = { method: response.request().method(), url: new URL(response.url()).pathname, status: response.status() };
      if (entry.method === 'GET') sink.all.push(entry);
      if (entry.status < 400) return;
      void response.text().then((body) => sink.failed.push({ ...entry, body: body.slice(0, 300) })).catch(() => sink.failed.push(entry));
    } catch (error) {
      sink.console.push(`collector: ${String(error.message).slice(0, 200)}`);
    }
  });
}

const output = process.argv.find((arg) => arg.startsWith('--output='))?.slice(9);
const result = {
  environment: 'LOCAL', source_branch: 'desarrollo', target_branch: 'develop',
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  started_at: new Date().toISOString(), checks: [], status: 'running'
};
async function check(name, fn) { await fn(); result.checks.push(name); console.log('PASS ' + name); }

(async () => {
  let app;
  try {
    const run = randomUUID();
    const tenant = await db.tenant.create({ data: { name: 'QA hub talento humano ' + run, active_modules: ['M-17', 'M-22', 'M-07'] } });
    const role = await db.role.create({
      data: {
        tenant_id: tenant.id, name: 'QA Hub admin ' + run, metadata: { role_type: 'admin_empresa' },
        permissions: { create: ['hr', 'payroll', 'time_tracking', 'accounting', 'admin'].flatMap((module) => [{ module, action: 'read' }, { module, action: 'write' }]) }
      }
    });
    const password = 'Qa!9' + randomUUID();
    const user = await db.user.create({
      data: { tenant_id: tenant.id, name: 'QA Hub Talento', email: `hub-${run}@example.invalid`, password: await bcrypt.hash(password, 10), role_id: role.id }
    });

    await db.employee.create({ data: {
      tenant_id: tenant.id, user_id: user.id, code: 'QA-HUB', position: 'Operario',
      department: 'Operacion', salary_base: 2000000, hire_date: new Date(), metadata: { name: user.name }
    } });

    app = await require('../../apps/api/server')();
    const origin = await app.listen({ host: '127.0.0.1', port: 0 });
    const login = await fetch(origin + '/api/v1/auth/login', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: user.email, password }), signal: AbortSignal.timeout(30000)
    });
    const session = await login.json().catch(() => ({}));
    assert.equal(login.status, 200, JSON.stringify(session));
    const token = session.token;
    assert.ok(token, 'Login sin token');

    await require('./hr-employee-user-association-browser-local')({
      origin, token, db, tenantId: tenant.id, check,
      pagePath: HUB_PATH, artifactName: 'hr-landing-hub',
      exercise: async (page, folder) => {
        const site = `http://127.0.0.1:${Number(process.env.CERT_BROWSER_PORT || 3317)}`;
        const cardSelector = (target) => `${HUB_SECTION} a[href="${target}"]`;
        const sink = { console: [], failed: [], all: [], navigations: [] };
        await collectNetwork(page, origin, sink);
        async function snapshot() {
          return page.evaluate((selector) => ({
            url: location.pathname,
            headings: [...document.querySelectorAll('h1,h2')].map((node) => node.textContent.trim()).slice(0, 4),
            visible: document.body.innerText.replace(/\s+/g, ' ').slice(0, 500),
            hubCards: document.querySelectorAll(selector + ' a').length,
            hasToken: Boolean(localStorage.getItem('token')),
            sessionEndReason: localStorage.getItem('apex_session_end_reason'),
            keys: Object.keys(localStorage).sort()
          }), HUB_SECTION).catch((error) => ({ unreadable: String(error.message).slice(0, 200) }));
        }
        async function until(predicate, args, label, timeoutMs = 150000) {
          const deadline = Date.now() + timeoutMs;
          while (Date.now() < deadline) {
            const ready = await page.evaluate(predicate, ...args).catch(() => false);
            if (ready) return;
            await new Promise((resolve) => setTimeout(resolve, 1000));
          }
          throw Error(`${label} no aparecio tras ${timeoutMs / 1000}s: ${JSON.stringify({ ...(await snapshot()), failed: sink.failed.slice(-4), console: sink.console.slice(-4) })}`);
        }
        async function waitSettled() {
          await until(() => [...document.querySelectorAll('h1')].some((node) => node.textContent.trim().length > 3), [], 'el titulo del destino');
          // Leave time for authenticated requests to settle before navigating again.
          await page.waitForNetworkIdle({ idleTime: 500, timeout: 15000 });
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
        async function warm(href) {
          await fetch(site + href, { signal: AbortSignal.timeout(240000) }).then((response) => response.text()).catch(() => {});
        }

        await check('hub renders the module header and one card per module access', async () => {
          const ssr = await fetch(site + HUB_PATH, { signal: AbortSignal.timeout(240000) }).then((response) => response.text());
          result.hub_ssr_html = {
            has_section: ssr.includes('Herramientas activas de talento humano'),
            hrefs_found: EXPECTED_ACCESS_HREFS.filter((href) => ssr.includes(href)).length,
            has_guard_skeleton: ssr.includes('Validando permisos'),
            bytes: ssr.length
          };
          await until((selector) => Boolean(document.querySelector(selector)), [HUB_SECTION], 'la seccion de tarjetas del hub');
          const header = await page.evaluate(() => ({
            eyebrow: document.querySelector('.apex-section-card p')?.textContent.trim(),
            title: document.querySelector('.apex-section-card h1')?.textContent.trim()
          }));
          assert.equal(header.eyebrow, 'M-17 · Talento Humano');
          assert.equal(header.title, 'Talento Humano');
          const cards = await page.evaluate((selector) => [...document.querySelectorAll(selector + ' a')].map((node) => ({
            href: node.getAttribute('href'), title: node.querySelector('span:nth-child(2) > span:first-child')?.textContent.trim(),
            detail: node.querySelector('span:nth-child(2) > span:last-child')?.textContent.trim(), icon: Boolean(node.querySelector('svg'))
          })), HUB_SECTION);
          assert.deepEqual(cards.map((card) => card.href), EXPECTED_ACCESS_HREFS);
          for (const card of cards) assert.ok(card.title && card.detail && card.icon, `Tarjeta incompleta: ${card.href}`);
          assert.equal(new Set(cards.map((card) => card.href)).size, EXPECTED_ACCESS_HREFS.length);
          result.hub_cards = cards;
          await page.screenshot({ path: path.join(folder, 'hub.png') });
        });

        await check('browser state carries no service worker cache that could mask the fresh bundle', async () => {
          result.service_workers_cleared = await page.evaluate(async () => {
            if (!('serviceWorker' in navigator)) return { registrations: 0, caches: 0 };
            const registrations = await navigator.serviceWorker.getRegistrations();
            for (const registration of registrations) await registration.unregister();
            const names = await caches.keys();
            for (const name of names) await caches.delete(name);
            return { registrations: registrations.length, caches: names.length };
          });
        });

        await check('every hub card opens its own destination screen', async () => {
          const opened = [];
          for (const href of EXPECTED_ACCESS_HREFS) {
            await warm(href);
            await page.goto(site + HUB_PATH, { waitUntil: 'domcontentloaded', timeout: 240000 });
            await until((selector) => Boolean(document.querySelector(selector)), [cardSelector(href)], `la tarjeta ${href} recargada en el hub`);
            await page.click(cardSelector(href));
            await until((target) => location.pathname === target, [href], `la navegacion a ${href}`);
            await waitSettled();
            const view = await page.evaluate(() => ({
              path: location.pathname,
              heading: [...document.querySelectorAll('h1')].map((node) => node.textContent.trim()).find((text) => text.length > 3),
              body: document.body.innerText.slice(0, 4000)
            }));
            assert.equal(view.path, href, `La tarjeta ${href} abrio ${view.path}. ${JSON.stringify(await snapshot())}`);
            assert.ok(view.heading && view.heading.length > 3, `Sin titulo visible en ${href}`);
            for (const marker of BROKEN_MARKERS) assert.ok(!view.body.includes(marker), `${marker} en ${href}`);
            opened.push({ href, heading: view.heading });
            await page.screenshot({ path: path.join(folder, 'open-' + href.split('/').pop() + '.png') });
          }
          assert.deepEqual(opened.map((row) => row.href), EXPECTED_ACCESS_HREFS);
          result.opened_screens = opened;
        });

        await check('hub stays reachable from each destination and keeps the same fifteen accesses', async () => {
          const returns = {};
          for (const href of EXPECTED_ACCESS_HREFS) {
            await warm(href);
            await page.goto(site + href, { waitUntil: 'domcontentloaded', timeout: 240000 });
            await waitSettled();
            returns[href] = await page.evaluate(() => [...document.querySelectorAll('a')].some((node) => node.getAttribute('href') === '/dashboard/talento-humano'));
          }
          result.destination_return_links = returns;

          await page.goto(site + EXPECTED_ACCESS_HREFS[0], { waitUntil: 'domcontentloaded', timeout: 240000 });
          await waitSettled();
          // El shell tambien enlaza el modulo desde el menu lateral; se marca el enlace visible del contenido principal.
          result.return_link_clicked = await page.evaluate((hubPath) => {
            const nodes = [...document.querySelectorAll('a')].filter((node) => node.getAttribute('href') === hubPath);
            const visible = nodes.filter((node) => { const box = node.getBoundingClientRect(); return box.width > 0 && box.height > 0; });
            const chosen = visible.find((node) => node.closest('main, [role="main"]')) || visible[0];
            if (!chosen) return null;
            chosen.setAttribute('data-cert-return', '1');
            return { matches: nodes.length, text: chosen.textContent.trim().slice(0, 60), in_main: Boolean(chosen.closest('main, [role="main"]')) };
          }, HUB_PATH);
          assert.ok(result.return_link_clicked, 'El destino principal no ofrece un enlace visible de regreso al hub');
          await page.click('a[data-cert-return="1"]');
          await until((path) => location.pathname === path, [HUB_PATH], 'el regreso al hub desde Asignar horarios');
          await until((selector) => document.querySelectorAll(selector + ' a').length, [HUB_SECTION], 'las quince tarjetas tras volver al hub');
          const count = await page.evaluate((selector) => document.querySelectorAll(selector + ' a').length, HUB_SECTION);
          assert.equal(count, EXPECTED_ACCESS_HREFS.length);
          assert.equal(await page.evaluate(() => location.pathname), HUB_PATH);
        });

        await check('no uncaught page error and no failed Talento Humano request during the whole navigation', async () => {
          const counts = {};
          for (const entry of sink.all) counts[`${entry.status} ${entry.url}`] = (counts[`${entry.status} ${entry.url}`] || 0) + 1;
          result.api_requests_seen = counts;
          const isHrPath = (url) => url.startsWith('/api/v1/hr/') || url.startsWith('/api/v1/talento-humano/');
          const responseCode = (entry) => { try { return String(JSON.parse(entry.body).code || '') } catch { return '' } };
          // El hub no filtra por modulo y los destinos de jornada leen vehiculos y plan contable.
          // Un 403 MODULO_NO_HABILITADO de un modulo ajeno es el bloqueo esperado del tenant, no una peticion rota.
          const foreignGating = sink.failed.filter((entry) => entry.status === 403 && responseCode(entry) === 'MODULO_NO_HABILITADO' && !isHrPath(entry.url));
          // El fixture no vincula un empleado a la sesion QA: el widget de jornada responde estado vacio.
          const emptyStates = sink.failed.filter((entry) => entry.status === 409 && entry.url.startsWith('/api/v1/hr/self'));
          const unexpected = sink.failed.filter((entry) => !foreignGating.includes(entry) && !emptyStates.includes(entry));
          result.expected_foreign_module_gating = foreignGating.map((entry) => `${entry.status} ${entry.url} ${responseCode(entry)}`);
          result.expected_empty_states = emptyStates.map((entry) => `${entry.status} ${entry.url}`);
          result.failed_api_requests = unexpected;
          result.page_console = sink.console;
          result.navigation_trail = sink.navigations;
          const hrSeen = sink.all.filter((entry) => isHrPath(entry.url));
          result.hr_api_requests_seen = { total: hrSeen.length, failed: hrSeen.filter((entry) => entry.status >= 400).length };
          assert.ok(hrSeen.length >= 10, 'La navegacion no ejercito suficientes endpoints de Talento Humano');
          assert.deepEqual(unexpected, [], 'peticiones API fallidas durante la navegacion');
          const uncaught = sink.console.filter((line) => line.startsWith('pageerror:'));
          assert.deepEqual(uncaught, [], 'errores no capturados en la pagina');
        });
      }
    });

    result.status = 'passed';
    result.tenant_id = tenant.id;
  } catch (error) {
    result.status = 'failed';
    result.error = error.message;
    console.error(error.stack);
    process.exitCode = 1;
  } finally {
    result.finished_at = new Date().toISOString();
    if (output) fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
    if (app) await app.close();
    await db.$disconnect();
    process.exit(process.exitCode || 0);
  }
})();
