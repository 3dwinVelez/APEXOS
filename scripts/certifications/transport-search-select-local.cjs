/* Local browser interaction certification. Synthetic fixtures; no API or database writes. */
const appEnv = process.argv.includes('--app') ? require('./local-certification-env.cjs') : null;
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ts = require('typescript');
const { webpack } = require('next/dist/compiled/webpack/webpack');
const puppeteer = require('puppeteer-core');
const root = path.resolve(__dirname, '../..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'apex-transport-search-'));
const checks = [];
const check = (name, result) => { assert.ok(result, name); checks.push(name); };
async function main() {
  const source = fs.readFileSync(path.join(root, 'apps/web/components/transport/TransportSearchSelect.tsx'), 'utf8');
  fs.writeFileSync(path.join(temp, 'control.js'), ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText);
  fs.writeFileSync(path.join(temp, 'entry.js'), `
    const React = require('react'); const { createRoot } = require('react-dom/client');
    const { TransportSearchSelect, matchesTransportOption } = require('./control');
    window.matchesTransportOption = matchesTransportOption;
    function App() {
      const [value, setValue] = React.useState('');
      return React.createElement('form', { onSubmit: e => { e.preventDefault(); window.submitted = new FormData(e.currentTarget).get('vehicle'); } },
        React.createElement('label', null, 'Vehículo requerido', React.createElement(TransportSearchSelect, { name: 'vehicle', required: true, value, className: 'w-full', onChange: e => { window.changes = (window.changes || 0) + 1; setValue(e.target.value); } },
          React.createElement('option', { value: '' }, 'Selecciona un vehículo'),
          React.createElement('option', { value: '1' }, 'Transportes Águila Norte'),
          React.createElement('option', { value: 'disabled', disabled: true }, 'No disponible'),
          React.createElement('option', { value: '2' }, 'ABC123 · Bogotá Centro'))),
        React.createElement('button', { type: 'submit' }, 'Guardar'),
        React.createElement('button', { type: 'reset' }, 'Restablecer'),
        React.createElement('button', { type: 'button', onClick: () => setValue('2') }, 'Valor externo'),
        React.createElement('button', { id: 'clear', type: 'button', onClick: () => setValue('') }, 'Vaciar'),
        React.createElement(TransportSearchSelect, { name: 'channel', 'aria-label': 'Canal', defaultValue: 'email' },
          React.createElement('option', { value: 'email' }, 'Correo'), React.createElement('option', { value: 'sms' }, 'SMS')));
    } createRoot(document.getElementById('root')).render(React.createElement(App));
  `);
  await new Promise((resolve, reject) => webpack({ mode: 'development', devtool: false, entry: path.join(temp, 'entry.js'), output: { path: temp, filename: 'bundle.js' }, resolve: { modules: [path.join(root, 'node_modules')] } }, (error, stats) => error || stats.hasErrors() ? reject(error || new Error(stats.toString())) : resolve()));
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  try {
    const page = await browser.newPage();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    for (const width of [1280, 390]) {
      await page.setViewport({ width, height: 800 });
      await page.setContent('<html><body><main style="width:90%;margin:auto"><div id="root"></div></main></body></html>');
      await page.evaluate(() => { window.changes = 0; window.submitted = undefined; });
      await page.addScriptTag({ path: path.join(temp, 'bundle.js') });
      await page.waitForSelector('input[role=combobox]');
      const input = await page.$('input[role=combobox]');
      await input.focus(); await page.keyboard.press('Enter');
      check(`${width}: Enter opens all options`, await page.$$eval('[role=option]', nodes => nodes.length === 4));
      await page.keyboard.type('tan');
      check(`${width}: initials ignore accents`, await page.$$eval('[role=option]', nodes => nodes.length === 1 && nodes[0].textContent.includes('Águila')));
      await page.keyboard.press('Enter');
      check(`${width}: selection updates controlled value and change once`, await page.evaluate(() => document.querySelector('select').value === '1' && window.changes === 1));
      await page.click('button[type=submit]');
      check(`${width}: FormData contains selected id`, await page.evaluate(() => window.submitted === '1'));
      await input.focus(); await page.keyboard.press('Enter'); await page.keyboard.type('zzzz');
      check(`${width}: empty result`, await page.$('[role=status]'));
      await page.keyboard.press('Escape');
      check(`${width}: Escape restores selected label`, await page.$eval('input', node => node.value.includes('Águila') && node.getAttribute('aria-expanded') === 'false'));
      await page.click('button[type=button]');
      check(`${width}: external value reflected`, await page.$eval('input', node => node.value.includes('ABC123')));
      await input.focus(); await page.keyboard.press('Enter'); await page.keyboard.type('bogota');
      await page.click('[role=option]');
      check(`${width}: mouse selection`, await page.$eval('input', node => node.value.includes('ABC123')));
      await input.focus(); await page.keyboard.press('Enter');
      const box = await page.$eval('[role=listbox]', node => { const r = node.getBoundingClientRect(); return { left: r.left, right: r.right, bottom: r.bottom }; });
      check(`${width}: list stays within viewport`, box.left >= 0 && box.right <= width && box.bottom <= 800);
      await page.screenshot({ path: path.join(temp, `search-${width}.png`) });
      await page.keyboard.press('Escape');
      await page.click('button[type=reset]');
      await page.waitForFunction(() => document.querySelector('input').value === document.querySelector('select').selectedOptions[0].text, { timeout: 3000 }).catch(async error => { console.log(await page.evaluate(() => ({ input: document.querySelector('input').value, select: document.querySelector('select').selectedOptions[0].text }))); throw error; });
      check(`${width}: reset reflects native form value`, true);
      check(`${width}: accessible caption`, await page.$eval('input', node => node.getAttribute('aria-label') === 'Vehículo requerido'));
      await page.click('#clear');
      await page.evaluate(() => { window.submitted = undefined; });
      await page.click('button[type=submit]');
      check(`${width}: required blocks empty submission and focuses search`, await page.evaluate(() => window.submitted === undefined && document.activeElement === document.querySelector('input') && document.querySelector('input').getAttribute('aria-expanded') === 'true'));
      await page.keyboard.press('Escape');
      const channel = await page.$('input[aria-label=Canal]');
      await channel.focus(); await page.keyboard.press('Enter'); await page.keyboard.type('sms'); await page.keyboard.press('Enter');
      check(`${width}: uncontrolled select preserves FormData`, await page.$eval('form', node => new FormData(node).get('channel') === 'sms'));
      await page.click('button[type=reset]');
      await page.waitForFunction(() => document.querySelector('input[aria-label=Canal]').value === 'Correo');
      check(`${width}: uncontrolled reset restores default`, true);
      await input.focus(); await page.keyboard.type('bogota');
      check(`${width}: typing directly replaces the selected caption`, await page.$$eval('[role=option]', nodes => nodes.length === 1 && nodes[0].textContent.includes('ABC123')));
      await page.keyboard.press('Enter');
      check(`${width}: direct keyboard search selects the actual value`, await page.$eval('select', node => node.value === '2'));
    }
    check('no browser errors', errors.length === 0);
    if (process.argv.includes('--app')) {
      const { apiBase, webBase } = appEnv;
      const app = await browser.newPage();
      await app.setRequestInterception(true);
      app.on('request', request => {
        const url = new URL(request.url());
        if (['http:', 'https:'].includes(url.protocol) && !['localhost', '127.0.0.1'].includes(url.hostname)) request.abort();
        else if (url.pathname.startsWith('/api/v1/')) request.continue({ url: apiBase + url.pathname + url.search });
        else if (['http:', 'https:'].includes(url.protocol) && ![apiBase, webBase].includes(url.origin)) request.abort();
        else request.continue();
      });
      await app.goto(webBase + '/login', { waitUntil: 'domcontentloaded' });
      const login = await fetch(apiBase + '/api/v1/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: process.env.LOCAL_TMS_EMAIL || 'demo@apex.local', password: process.env.LOCAL_TMS_PASSWORD || 'test1234' }) });
      assert.equal(login.status, 200, 'local API login');
      const session = await login.json();
      await app.evaluate(data => {
        localStorage.setItem('token', data.token);
        localStorage.setItem('auth_provider', 'local');
        localStorage.setItem('user_email', data.user.email);
        localStorage.setItem('role_name', data.user.role);
        localStorage.setItem('apexos_company_role', data.user.role);
        localStorage.setItem('apexos_company_id', data.tenant.company_id || data.tenant.id);
        localStorage.setItem('tenant_active_modules', JSON.stringify(data.tenant.active_modules));
        localStorage.setItem('role_permissions', JSON.stringify(data.user.role_permissions || []));
        localStorage.setItem('role_metadata', JSON.stringify(data.user.role_metadata || {}));
      }, session);
      for (const route of ['', '/ordenes', '/operacion', '/tarifas', '/liquidaciones', '/cubicaje', '/pod', '/notificaciones', '/configuracion']) {
        console.log('Checking local screen', route || '/');
        await app.goto(`${webBase}/dashboard/transporte${route}`, { waitUntil: 'networkidle2', timeout: 60000 });
        check(`local app ${route || '/'}: authenticated`, !app.url().includes('/login'));
        const plain = await app.$$eval('select:not([aria-hidden=true]):not([aria-label=Idioma])', nodes => nodes.map(node => ({ name: node.name, label: node.getAttribute('aria-label'), className: node.className })));
        if (plain.length) console.log('Plain selects', route || '/', plain);
        check(`local app ${route || '/'}: no plain visible selects`, plain.length === 0);
        const controls = await app.$$('input[role=combobox]');
        if (controls.length) {
          await controls[0].focus(); await app.keyboard.press('Enter');
          await app.waitForSelector('[role=listbox]');
          check(`local app ${route || '/'}: Enter opens options`, true);
          if (route === '/liquidaciones') await app.screenshot({ path: path.join(temp, 'liquidaciones-local.png') });
          await app.keyboard.press('Escape');
        }
      }
      await app.close();
    }
    console.log(JSON.stringify({ status: 'passed', fixtureOnly: !process.argv.includes('--app'), artifacts: temp, checks }, null, 2));
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
