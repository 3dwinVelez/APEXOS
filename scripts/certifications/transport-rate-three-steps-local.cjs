// Creates and versions one clearly identified QA tariff, exclusively on localhost.
const { apiBase, webBase } = require('./local-certification-env.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const puppeteer = require('puppeteer-core');
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'apex-rate-three-steps-'));
const code = `QA-3STEP-${Date.now()}`;
const checks = [];
const check = (name, result) => { assert.ok(result, name); checks.push(name); };
async function main() {
  const session = await (await fetch(apiBase + '/api/v1/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: process.env.LOCAL_TMS_EMAIL || 'demo@apex.local', password: process.env.LOCAL_TMS_PASSWORD || 'test1234' }) })).json();
  assert.ok(session.token);
  const headers = { authorization: `Bearer ${session.token}` };
  const list = async () => (await (await fetch(apiBase + '/api/v1/transport/rate-cards?include_inactive=true&limit=500', { headers })).json()).filter(row => row.code === code);
  const browser = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 1000 });
    await page.setRequestInterception(true);
    page.on('request', request => { const url = new URL(request.url()); if (['http:', 'https:'].includes(url.protocol) && !['localhost', '127.0.0.1'].includes(url.hostname)) request.abort(); else if (url.pathname.startsWith('/api/v1/')) request.continue({ url: apiBase + url.pathname + url.search }); else if (['http:', 'https:'].includes(url.protocol) && ![apiBase, webBase].includes(url.origin)) request.abort(); else request.continue(); });
    await page.goto(webBase + '/login', { waitUntil: 'domcontentloaded' });
    await page.evaluate(data => { const values = { token: data.token, auth_provider: 'local', user_email: data.user.email, role_name: data.user.role, apexos_company_role: data.user.role, apexos_company_id: data.tenant.company_id || data.tenant.id, tenant_active_modules: JSON.stringify(data.tenant.active_modules), role_permissions: JSON.stringify(data.user.role_permissions || []), role_metadata: JSON.stringify(data.user.role_metadata || {}), apex_theme: 'dark' }; for (const [key, value] of Object.entries(values)) localStorage.setItem(key, value); }, session);
    await page.goto(webBase + '/dashboard/transporte/tarifas', { waitUntil: 'networkidle2' });
    async function click(text) { await page.waitForFunction(t=>[...document.querySelectorAll('button')].some(n=>n.getClientRects().length&&!n.disabled&&n.textContent.trim()===t),{timeout:30000},text); for (const button of await page.$$('button')) if (await button.evaluate((node, text) => node.textContent.trim() === text, text)) { await button.click(); return; } throw new Error(`Missing button ${text}`); }
    async function fill(name, value) { await page.$eval(`input[name="${name}"]`, (node, value) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(node, value); node.dispatchEvent(new Event('input', { bubbles: true })); }, value); }
    async function step(number) {
      await page.waitForFunction(number => document.querySelector('[role=dialog]')?.textContent.includes(`Paso ${number} de 3`), {}, number);
      check(`step ${number}: three entries, no geographical step`, await page.$eval('[role=dialog]', node => node.querySelectorAll('ol > li').length === 3 && !node.textContent.includes('Ámbito geográfico')));
    }
    await click('Nuevo tarifario'); await step(1);
    check('identification required', await page.$eval('[role=dialog] button[type=submit]', node => node.disabled));
    await fill('code', code); await fill('name', 'QA local: asistente de tres etapas');
    await click('Siguiente'); await step(2);
    check('transport step requires dates', await page.$eval('[role=dialog] button[type=submit]', node => node.disabled));
    await fill('valid_from', '2026-01-01'); await fill('valid_to', '2027-12-31');
    await page.screenshot({ path: path.join(output, 'transport-desktop.png') });
    await page.setViewport({ width: 390, height: 844 }); await page.screenshot({ path: path.join(output, 'transport-mobile.png') });
    await click('Siguiente'); await step(3); await page.waitForSelector('[data-cost-panel=summary]');
    await page.screenshot({ path: path.join(output, 'cost-mobile.png') }); await page.setViewport({ width: 1440, height: 1000 });
    await fill('base_rate', '85000');
    await click('Atrás'); await step(2);
    check('back preserves validity', await page.$eval('input[name=valid_to]', node => node.value === '2027-12-31'));
    await click('Atrás'); await step(1);
    check('back preserves identification', await page.$eval('input[name=code]', (node, code) => node.value === code, code));
    await click('Siguiente'); await step(2); await click('Siguiente'); await step(3);
    check('cost preserved after navigation', await page.$eval('input[name=base_rate]', node => node.value === '85000'));
    await page.screenshot({ path: path.join(output, 'cost-desktop.png') });
    await click('Crear y activar'); await page.waitForSelector('[role=dialog]', { hidden: true, timeout: 30000 });
    const first = (await list()).find(row => row.version === 1);
    check('created through full UI flow', first?.status === 'activa' && Number(first.base_rate) === 85000);
    check('new tariff has no geographical restriction', !first.destination_department && !first.destination_city && !first.destination_municipality);
    await page.waitForFunction(code => [...document.querySelectorAll('tr')].some(node => node.textContent.includes(code)), {}, code);
    for (const row of await page.$$('tr')) { if (await row.evaluate((node, code) => node.textContent.includes(code), code)) { await (await row.$('button[aria-label="Editar tarifario"]')).click(); break; } }
    await step(1); check('edit keeps code locked', await page.$eval('input[name=code]', node => node.disabled));
    await click('Siguiente'); await step(2); await click('Siguiente'); await step(3);
    check('edit reopens saved cost', await page.$eval('input[name=base_rate]', node => node.value === '85000'));
    await fill('base_rate', '90000'); await click('Guardar como nueva version');
    await page.waitForSelector('[role=dialog]', { hidden: true, timeout: 30000 });
    const versions = await list();
    check('published tariff is preserved', versions.some(row => row.version === 1 && Number(row.base_rate) === 85000));
    check('edit creates version with updated cost', versions.some(row => row.version === 2 && row.status === 'borrador' && Number(row.base_rate) === 90000));
    fs.writeFileSync(path.join(output, 'evidence.json'), JSON.stringify({ status: 'passed', code, checks, created: versions.map(row => ({ id: row.id, version: row.version, status: row.status })) }, null, 2));
    console.log(JSON.stringify({ status: 'passed', code, checks: checks.length, artifacts: output }, null, 2));
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); console.log({ code, output }); process.exitCode = 1; });
