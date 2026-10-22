// Real local UI, read-only forms. Never saves a tariff, package or plan.
const { apiBase, webBase } = require('./local-certification-env.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const puppeteer = require('puppeteer-core');
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'apex-transport-theme-'));
const evidence = { head: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), working_tree: true, environment: 'LOCAL_DESARROLLO', status: 'running', checks: [], screenshots: [] };
function check(name, result, detail) { evidence.checks.push({ name, status: result ? 'passed' : 'failed', detail }); assert.ok(result, name); }
async function main() {
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1000 });
  await page.setRequestInterception(true);
  page.on('request', request => {
    const url = new URL(request.url());
    if (['http:', 'https:'].includes(url.protocol) && !['localhost', '127.0.0.1'].includes(url.hostname)) request.abort();
    else if (url.pathname.startsWith('/api/v1/')) request.continue({ url: apiBase + url.pathname + url.search });
    else if (['http:', 'https:'].includes(url.protocol) && ![apiBase, webBase].includes(url.origin)) request.abort();
    else request.continue();
  });
  const click = async text => { await page.waitForFunction(t=>[...document.querySelectorAll('button')].some(n=>n.getClientRects().length&&!n.disabled&&n.textContent.trim()===t),{timeout:30000},text); const buttons = await page.$$('button'); for (const button of buttons) { if ((await button.evaluate(node => node.textContent.trim())) === text) { await button.click(); return; } } throw new Error(`Button not found: ${text}`); };
  async function theme(value) {
    await page.evaluate(value => { document.documentElement.classList.toggle('dark', value === 'dark'); document.documentElement.dataset.theme = value; localStorage.setItem('apex_theme', value); }, value);
    await page.waitForFunction(value => getComputedStyle(document.documentElement).colorScheme === value, {}, value);
    await page.evaluate(() => Promise.all(document.getAnimations().filter(animation => animation instanceof CSSTransition).map(animation => animation.finished.catch(() => {}))));
  }
  async function colors(selector) {
    return page.$eval(selector, node => { const css = getComputedStyle(node), root = getComputedStyle(document.documentElement); const color = token => `rgb(${root.getPropertyValue(token).trim().split(/\s+/).join(', ')})`; const ancestors = []; for (let parent = node.parentElement; parent; parent = parent.parentElement) ancestors.push([parent.tagName, getComputedStyle(parent).colorScheme]); return { background: css.backgroundColor, color: css.color, scheme: css.colorScheme, surface: color('--surface'), strong: color('--text-strong'), muted: color('--surface-muted'), ancestors }; });
  }
  async function snapshot(name) { const file = path.join(output, `${name}.png`); await page.screenshot({ path: file }); evidence.screenshots.push(file); }
  try {
    const response = await fetch(apiBase + '/api/v1/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: process.env.LOCAL_TMS_EMAIL || 'demo@apex.local', password: process.env.LOCAL_TMS_PASSWORD || 'test1234' }) });
    assert.equal(response.status, 200, 'local login');
    const session = await response.json();
    await page.goto(webBase + '/login', { waitUntil: 'domcontentloaded' });
    await page.evaluate(data => {
      const values = { token: data.token, auth_provider: 'local', user_email: data.user.email, role_name: data.user.role, apexos_company_role: data.user.role, apexos_company_id: data.tenant.company_id || data.tenant.id, tenant_active_modules: JSON.stringify(data.tenant.active_modules), role_permissions: JSON.stringify(data.user.role_permissions || []), role_metadata: JSON.stringify(data.user.role_metadata || {}) };
      for (const [key, value] of Object.entries(values)) localStorage.setItem(key, value);
    }, session);
    const routes = ['', '/flota', '/ordenes', '/operacion', '/planeacion', '/tarifas', '/liquidaciones', '/cubicaje', '/monitoreo', '/pod', '/pyg', '/notificaciones', '/configuracion', '/maestros'];
    for (const route of process.argv.includes('--dialogs-only') ? [] : routes) {
      console.log('Checking local theme', route || '/');
      await page.goto(`${webBase}/dashboard/transporte${route}`, { waitUntil: 'networkidle2', timeout: 60000 });
      if (route === '/pyg' || route === '/maestros') {
        check(`${route} retains central module redirect`, page.url().endsWith(route === '/pyg' ? '/dashboard/contabilidad/pyg' : '/dashboard/administracion'));
        continue;
      }
      await page.waitForSelector('.transport-workspace');
      check(`${route || '/'} authenticated`, !page.url().includes('/login'));
      for (const value of ['dark', 'light']) {
        await theme(value);
        const workspace = await colors('.transport-workspace');
        check(`${route || '/'} ${value}: inherited foreground`, workspace.color === workspace.strong, workspace);
        check(`${route || '/'} ${value}: inherited color scheme`, workspace.scheme === value);
      }
    }
    await page.goto(webBase + '/dashboard/transporte/liquidaciones', { waitUntil: 'networkidle2' });
    await click('Nuevo paquete'); await page.waitForSelector('[role=dialog]');
    for (const value of ['dark', 'light', 'dark']) {
      await theme(value);
      const dialog = await colors('[role=dialog]');
      check(`settlement ${value}: themed dialog`, dialog.background === dialog.surface && dialog.scheme === value, dialog);
      const field = await page.$('[role=dialog] input[role=combobox]');
      await field.focus(); await page.keyboard.press('Enter'); await page.waitForSelector('[role=listbox]');
      const list = await colors('[role=listbox]');
      check(`settlement ${value}: portal matches dialog`, list.background === dialog.background && list.scheme === value, list);
      await snapshot(`settlement-${value}`); await page.keyboard.press('Escape');
    }
    await page.setViewport({ width: 390, height: 844 });
    await snapshot('settlement-mobile-dark');
    await theme('light'); await snapshot('settlement-mobile-light');
    await page.setViewport({ width: 1440, height: 1000 });
    await page.goto(webBase + '/dashboard/transporte/tarifas', { waitUntil: 'networkidle2' });
    await click('Nuevo tarifario'); await page.waitForSelector('[role=dialog]');
    await page.type('input[name=code]', 'LOCAL-THEME-UNSAVED');
    await page.type('input[name=name]', 'Validación visual sin guardar');
    await click('Siguiente');
    await page.waitForSelector('input[name=valid_from]');
    await page.$eval('input[name=valid_from]', node => { const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; setter.call(node, '2026-01-01'); node.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.$eval('input[name=valid_to]', node => { const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; setter.call(node, '2027-12-31'); node.dispatchEvent(new Event('input', { bubbles: true })); });
    await click('Siguiente'); await page.waitForSelector('[data-cost-panel=summary]');
    for (const value of ['dark', 'light', 'dark']) {
      await theme(value);
      const dialog = await colors('[role=dialog]');
      check(`tariff ${value}: inherited palette`, dialog.background === dialog.surface && dialog.color === dialog.strong && dialog.scheme === value, dialog);
      const summary = await colors('[data-cost-panel=summary]');
      check(`tariff ${value}: themed summary`, summary.background === summary.muted && summary.color === summary.strong, summary);
      const title = await colors('[data-cost-panel=summary] > p');
      check(`tariff ${value}: readable summary title`, title.color === summary.strong, title);
      await snapshot(`tariff-${value}`);
    }
    await page.setViewport({ width: 390, height: 844 }); await snapshot('tariff-mobile-dark');
    await theme('light'); await snapshot('tariff-mobile-light');
    evidence.status = 'passed';
  } catch (error) { evidence.status = 'failed'; evidence.error = error.message; await snapshot('failure'); process.exitCode = 1; }
  finally { await browser.close(); fs.writeFileSync(path.join(output, 'evidence.json'), JSON.stringify(evidence, null, 2)); console.log(JSON.stringify({ status: evidence.status, checks: evidence.checks.length, error: evidence.error, artifacts: output }, null, 2)); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
