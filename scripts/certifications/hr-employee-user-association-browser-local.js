// Real browser, real local API and database; no mocked responses.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawn, execFileSync } = require('node:child_process');
module.exports = async function ({ origin, token, document, selectable, check, db, tenantId, exercise, pagePath = '/dashboard/talento-humano/empleados', artifactName = 'hr-employee-user-association' }) {
  assert.ok(/^http:\/\/127\.0\.0\.1:\d+$/.test(origin));
  const root = path.resolve(__dirname, '../..');
  const nextEnvPath = path.join(root, 'apps/web/next-env.d.ts');
  const tsconfigPath = path.join(root, 'apps/web/tsconfig.json');
  const previousNextEnv = fs.readFileSync(nextEnvPath, 'utf8');
  const previousIncludes = JSON.parse(fs.readFileSync(tsconfigPath, 'utf8')).include || [];
  assert.ok(/^[a-z0-9-]+$/.test(artifactName));
  const output = path.join(root, '.local', artifactName);
  fs.mkdirSync(output, { recursive: true });
  const out = fs.openSync(path.join(output, 'next.log'), 'w');
  const web = spawn(process.execPath, [path.join(root, 'node_modules/next/dist/bin/next'), 'dev', '--webpack', '-H', '127.0.0.1', '-p', '3317'], {
    cwd: path.join(root, 'apps/web'), windowsHide: true, stdio: ['ignore', out, out],
    env: { ...process.env, NODE_ENV: 'development', NEXT_PUBLIC_API_URL: origin, NEXT_PUBLIC_WS_URL: origin.replace('http:', 'ws:'), NEXT_DIST_DIR: '.next-hr-user-association' }
  });
  let browser;
  try {
    const url = 'http://127.0.0.1:3317';
    const deadline = Date.now() + 180000;
    while (true) {
      try { if ((await fetch(url + '/login', { signal: AbortSignal.timeout(3000) })).status < 500) break; } catch {}
      if (Date.now() > deadline) throw Error('Frontend local no disponible');
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    const puppeteer = require('puppeteer-core');
    const executablePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(file => fs.existsSync(file));
    browser = await puppeteer.launch({ executablePath, headless: true });
    const page = await browser.newPage();
    page.setDefaultTimeout(90000);
    await page.setViewport({ width: 1500, height: 1100 });
    await page.setBypassServiceWorker(true);
    await page.evaluateOnNewDocument(value => { localStorage.setItem('token', value); localStorage.setItem('apex_last_activity', String(Date.now())); localStorage.setItem('apex_theme', 'light'); }, token);
    await page.setRequestInterception(true);
    page.on('request', request => {
      const host = new URL(request.url()).hostname;
      if (host && !['127.0.0.1', 'localhost'].includes(host)) return void request.abort();
      void request.continue();
    });
    page.on('dialog', dialog => dialog.dismiss());
    async function button(text) {
      await page.waitForFunction(text => [...document.querySelectorAll('button')].some(node => node.textContent.trim() === text && !node.disabled), {}, text);
      await page.evaluate(text => [...document.querySelectorAll('button')].find(node => node.textContent.trim() === text).click(), text);
    }
    async function field(label, value, select = false) {
      const handle = await page.evaluateHandle(label => [...document.querySelectorAll('[role="dialog"] label')].find(node => node.textContent.trim().startsWith(label))?.querySelector('input,select'), label);
      const element = handle.asElement();
      assert.ok(element, `Campo ${label}`);
      if (select) await element.select(value);
      else {
        await element.click();
        await page.keyboard.down('Control'); await page.keyboard.press('KeyA'); await page.keyboard.up('Control');
        await element.type(value, { delay: 25 });
      }
      assert.equal(await element.evaluate(node => node.value), value, `Valor ingresado en ${label}`);
      await handle.dispose();
    }
    await page.goto(url + pagePath, { waitUntil: 'domcontentloaded', timeout: 180000 });
    if (exercise) { await exercise(page, output); return; }
    const countBefore = await db.employee.count({ where: { tenant_id: tenantId } });
    await check('browser document finds existing user and opens original labor record without duplicate', async () => {
      await button('Nuevo empleado');
      await field('Numero documento', document);
      await page.waitForFunction(() => document.body.innerText.includes('Documento coincidente'));
      await page.screenshot({ path: path.join(output, 'document-match.png') });
      await button('Abrir ficha existente');
      await page.waitForFunction(() => document.querySelector('h2')?.textContent === 'Editar empleado');
      assert.ok(await page.$('section[aria-label="Asociacion de usuario APEX"]'));
      assert.equal(await db.employee.count({ where: { tenant_id: tenantId } }), countBefore);
    });
    await page.click('button[aria-label="Cerrar"]');
    await check('browser creates and persists employee with selected user and no email field', async () => {
      await button('Nuevo empleado');
      await field('Primer nombre', 'Prueba'); await field('Primer apellido', 'Vinculo');
      await field('Numero documento', '987654330');
      await field('Sociedad contable', 'SOC', true); await field('Sucursal contable', 'BR', true); await field('Centro de costos contable', 'CC', true);
      await field('Salario mensual', '1500000');
      await field('Buscar usuario por nombre o correo', selectable.name);
      await button('Seleccionar usuario');
      await page.waitForFunction(() => document.body.innerText.includes('Se asociara al guardar'));
      await page.screenshot({ path: path.join(output, 'selected-user.png') });
      const savedResponse = page.waitForResponse(response => response.url().endsWith('/api/v1/talento-humano/empleados') && response.request().method() === 'POST');
      await button('Crear empleado');
      const response = await savedResponse;
      assert.equal(JSON.parse(response.request().postData()).salary_base, 1500000, 'Salario enviado por el formulario');
      assert.equal(response.status(), 200, await response.text());
      const saved = await response.json();
      assert.equal(saved.user.id, selectable.id);
      const stored = await db.employee.findFirstOrThrow({ where: { tenant_id: tenantId, id: saved.id } });
      assert.equal(stored.user_id, selectable.id);
      assert.equal(Number(stored.salary_base), 1500000);
      assert.equal(await db.employee.count({ where: { tenant_id: tenantId } }), countBefore + 1);
      await page.screenshot({ path: path.join(output, 'saved-user.png') });
    });
  } finally {
    if (browser) await browser.close();
    if (process.platform === 'win32' && web.pid) {
      try { execFileSync('taskkill', ['/PID', String(web.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true }); } catch {}
    } else web.kill();
    fs.closeSync(out);
    if (fs.readFileSync(nextEnvPath, 'utf8').includes('.next-hr-user-association')) fs.writeFileSync(nextEnvPath, previousNextEnv);
    const config = JSON.parse(fs.readFileSync(tsconfigPath, 'utf8'));
    const includes = config.include.filter(item => !item.includes('.next-hr-user-association/') || previousIncludes.includes(item));
    if (includes.length !== config.include.length) fs.writeFileSync(tsconfigPath, JSON.stringify({ ...config, include: includes }, null, 2) + '\n');
  }
};
