// Read-only local PDF regression using an already liquidated package.
const { apiBase, webBase } = require('./local-certification-env.cjs');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const assert = require('node:assert/strict');
const puppeteer = require('puppeteer-core');
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'apex-transport-print-theme-'));
const checks = [];
async function main() {
  const login = await fetch(apiBase + '/api/v1/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: process.env.LOCAL_TMS_EMAIL || 'demo@apex.local', password: process.env.LOCAL_TMS_PASSWORD || 'test1234' }) });
  assert.equal(login.status, 200);
  const session = await login.json();
  const headers = { authorization: `Bearer ${session.token}` };
  const packages = await (await fetch(apiBase + '/api/v1/transport/settlement-packages', { headers })).json();
  const pkg = packages.find(row => row.status === 'liquidada');
  assert.ok(pkg, 'requires an existing liquidated local package');
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  const guardRequest = request => {
    const url = new URL(request.url());
    const http = ['http:', 'https:'].includes(url.protocol);
    const local = ['localhost', '127.0.0.1'].includes(url.hostname);
    if (http && !local && (request.method() !== 'GET' || /\/rest\/v1|\/auth\/v1/.test(url.pathname))) request.abort();
    else if (local && url.pathname.startsWith('/api/v1/')) request.continue({ url: apiBase + url.pathname + url.search });
    else if (http && local && ![apiBase, webBase].includes(url.origin)) request.abort();
    else request.continue();
  };
  try {
    for (const theme of ['light', 'dark']) {
      const context = await browser.createBrowserContext();
      const page = await context.newPage();
      await page.setViewport({ width: 1600, height: 1100 });
      await page.evaluateOnNewDocument(({ token, theme }) => { localStorage.setItem('token', token); localStorage.setItem('auth_provider', 'local'); localStorage.setItem('apex_theme', theme); }, { token: session.token, theme });
      await page.setRequestInterception(true);
      page.on('request', guardRequest);
      await page.goto(`${webBase}/print/transport-settlement?id=${pkg.id}`, { waitUntil: 'networkidle2', timeout: 60000 });
      await page.waitForFunction(() => document.querySelector('[data-pdf-ready=true]') || document.querySelector('[role=alert]'), { timeout: 120000 });
      assert.ok(await page.$('[data-pdf-ready=true]'), await page.$eval('body', node => node.querySelector('[role=alert]')?.textContent || 'Print not ready'));
      assert.ok(await page.evaluate(() => !document.documentElement.classList.contains('dark') && getComputedStyle(document.documentElement).colorScheme === 'light'));
      checks.push(`${theme}: print document uses light scheme`);
      assert.equal(await page.evaluate(() => localStorage.getItem('apex_theme')), theme);
      checks.push(`${theme}: stored dashboard preference preserved`);
      const images = await page.$$eval('.rate-capture-image', nodes => nodes.map(node => ({ src: node.src, width: node.naturalWidth })));
      assert.ok(images.length && images.every(image => image.width >= 1500));
      checks.push(`${theme}: captured real annexes`);
      for (let i = 0; i < images.length; i++) fs.writeFileSync(path.join(output, `${theme}-annex-${i + 1}.jpg`), Buffer.from(images[i].src.split(',')[1], 'base64'));
      await page.pdf({ path: path.join(output, `${theme}.pdf`), printBackground: true, preferCSSPageSize: true });
      checks.push(`${theme}: PDF generated`);
      // A separate dashboard tab must retain its original appearance.
      const dashboard = await context.newPage();
      await dashboard.setRequestInterception(true);
      dashboard.on('request', guardRequest);
      await dashboard.goto(webBase + '/login', { waitUntil: 'networkidle2' });
      // El arranque del tema es un efecto del cliente: se espera a que la preferencia guardada este aplicada antes de auditar.
      await dashboard.waitForFunction(expected => document.documentElement.dataset.theme === expected, { timeout: 60000 }, theme);
      assert.equal(await dashboard.evaluate(() => document.documentElement.classList.contains('dark')), theme === 'dark');
      checks.push(`${theme}: other tab keeps original theme`);
      await context.close();
    }
    fs.writeFileSync(path.join(output, 'evidence.json'), JSON.stringify({ status: 'passed', package_id: pkg.id, package_code: pkg.code, checks, maps: 'public GET requests allowed; remote backend requests and writes blocked' }, null, 2));
    console.log(JSON.stringify({ status: 'passed', checks, artifacts: output }, null, 2));
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); console.log('Artifacts:', output); process.exitCode = 1; });
