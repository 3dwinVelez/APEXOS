// Navegador real: API local real, sin interceptar respuestas ni simular permisos.
const fs = require('node:fs');
module.exports = async function ({ base, token, packageId, draftId, foreignId, output, check }) {
  const puppeteer = await import('puppeteer-core');
  const executablePath = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find(file => fs.existsSync(file));
  if (!executablePath) throw Error('Navegador local requerido');
  const web = process.env.LOCAL_TMS_WEB || 'http://localhost:3001';
  if (!['http://localhost:3001', 'http://localhost:3002'].includes(web)) throw Error('Solo frontend local');
  const browser = await puppeteer.launch({ executablePath, headless: true });
  try {
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setViewport({ width: 1600, height: 1100 });
    await page.evaluateOnNewDocument(value => { localStorage.setItem('token', value); localStorage.setItem('apex_last_activity', String(Date.now())); localStorage.setItem('apex_theme', 'light'); }, token);
    // El build usa el puerto API habitual; reenviamos solo la conexion al API efimero certificado.
    await page.setRequestInterception(true);
    page.on('request', request => {
      const url = new URL(request.url());
      if (['localhost', '127.0.0.1'].includes(url.hostname) && url.pathname.startsWith('/api/v1/')) return void request.continue({ url: base.replace('/api/v1', '') + url.pathname + url.search });
      return void request.continue();
    });
    await page.goto(`${web}/print/transport-settlement?id=${packageId}`, { waitUntil: 'networkidle0', timeout: 120000 });
    await page.waitForSelector('[data-pdf-ready="true"]', { timeout: 120000 });
    check('browser_two_captured_stage_four_images', await page.$$eval('img.rate-capture-image', nodes => nodes.length === 2 && nodes.every(image => image.complete && image.naturalWidth > 1000)));
    check('browser_detail_and_frozen_total', await page.evaluate(() => document.body.innerText.includes('525.000') && document.body.innerText.includes('QA Tienda 1') && !document.body.innerText.includes('700.000')));
    await page.evaluate(() => { window.print = () => { document.documentElement.dataset.printDispatched = 'true'; }; });
    await page.click('.print-toolbar button');
    await page.waitForFunction(() => document.documentElement.dataset.printDispatched === 'true');
    check('browser_print_reauthorizes_and_dispatches', true);
    await page.pdf({ path: output, printBackground: true, preferCSSPageSize: true });
    check('browser_pdf_binary', fs.readFileSync(output).subarray(0, 5).toString() === '%PDF-');
    await page.screenshot({ path: output.replace(/\.pdf$/, '.png'), fullPage: true });
    for (const [label, id] of [['draft', draftId], ['foreign', foreignId]]) {
      await page.goto(`${web}/print/transport-settlement?id=${id}`, { waitUntil: 'networkidle0' });
      await page.waitForFunction(() => document.querySelector('[role="status"]')?.textContent !== 'Cargando liquidación…');
      check(`browser_${label}_cannot_print`, await page.$('[data-pdf-ready="true"]') === null && await page.$('.print-toolbar') === null);
    }
    await context.close();
    const anonymous = await browser.newPage();
    await anonymous.goto(`${web}/print/transport-settlement?id=${packageId}`, { waitUntil: 'networkidle0' });
    check('browser_anonymous_cannot_print', await anonymous.$('[data-pdf-ready="true"]') === null);
  } finally { await browser.close(); }
};
