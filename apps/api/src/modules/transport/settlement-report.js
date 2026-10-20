const prisma = require('../../core/prisma');
const { fail } = require('./settlement-engine');

async function settlementReportData(tenantId, id) {
  if (!tenantId) fail(401, 'TMS_TENANT_REQUIRED', 'Empresa requerida.');
  return prisma.runWithTenant(tenantId, async () => {
    const pkg = await prisma.transportSettlementPackage.findFirst({ where: { id: Number(id), tenant_id: String(tenantId) }, include: { items: { orderBy: { id: 'asc' } }, accountings: true, adjustments: true, period: true } });
    if (!pkg) fail(404, 'TMS_SETTLEMENT_NOT_FOUND', 'La liquidación no existe en la empresa.');
    if (pkg.status !== 'liquidada') fail(409, 'TMS_SETTLEMENT_PDF_NOT_LIQUIDATED', 'El formato para facturar está disponible cuando la liquidación está liquidada.');
    const company = await prisma.tenant.findUnique({ where: { id: String(tenantId) }, select: { name: true, tax_id: true, country: true } });
    const annexes = [];
    const byKey = new Map();
    const items = [];
    for (const item of pkg.items) {
      const criteria = [];
      const entries = item.metadata?.charge_criteria || [{ concept: item.rate_code || 'Flete histórico', rate_card_id: item.rate_card_id, rate_version: item.rate_version, rate_snapshot: item.metadata?.report_rate_snapshot || item.calculation_trace?.snapshot, quantity: Number(item.quantity), unit_value: Number(item.rate_unit_value ?? (Number(item.calculated_amount) / (Number(item.quantity) || 1))), support: item.observation || '' }];
      for (const entry of entries) {
        const snapshot = entry.rate_snapshot || {};
        const key = `${entry.rate_card_id || snapshot.rate_card_id}:${entry.rate_version || snapshot.rate_version}:${JSON.stringify(snapshot.metrics || {})}`;
        let annex = byKey.get(key);
        if (!annex) {
          let definition = snapshot.definition;
          if (!definition && (entry.rate_card_id || snapshot.rate_card_id)) definition = await prisma.transportRateCard.findFirst({ where: { tenant_id: String(tenantId), id: Number(entry.rate_card_id || snapshot.rate_card_id), version: Number(entry.rate_version || snapshot.rate_version || 1) } });
          annex = { id: `A${annexes.length + 1}`, code: entry.rate_code || snapshot.rate_code || item.rate_code || 'Histórico', version: entry.rate_version || snapshot.rate_version || item.rate_version, unit_value: Number(entry.unit_value || 0), metrics: snapshot.metrics || entry.metrics || {}, definition: definition ? JSON.parse(JSON.stringify(definition)) : null, provenance: snapshot.definition ? (snapshot.freeze_stage === 'liquidation' ? 'Versión conservada al liquidar el paquete' : 'Versión conservada al asignar el tarifario') : definition ? 'Versión original disponible en el maestro' : 'La versión histórica completa no está disponible; se conservan únicamente los valores liquidados.' };
          byKey.set(key, annex); annexes.push(annex);
        }
        criteria.push({ ...entry, annex_id: annex.id });
      }
      items.push({ ...item, criteria });
    }
    return JSON.parse(JSON.stringify({ company, package: { ...pkg, items }, annexes }));
  });
}

function reportWebOrigin(value = process.env.PDF_WEB_ORIGIN || 'http://127.0.0.1:3001') {
  let origin;
  try { origin = new URL(value); } catch { fail(503, 'TMS_PDF_ORIGIN_INVALID', 'Origen interno PDF inválido.'); }
  const internal = ['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname) || origin.hostname.endsWith('.railway.internal');
  if (!internal || !['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) fail(503, 'TMS_PDF_ORIGIN_INVALID', 'El generador debe usar el servidor web interno.');
  return origin;
}

let generating = false;
async function settlementReportPdf(tenantId, id) {
  const data = await settlementReportData(tenantId, id);
  if (generating) fail(503, 'TMS_PDF_BUSY', 'Se está generando otro formato. Intenta nuevamente.');
  generating = true;
  let browser;
  try {
    const fs = require('node:fs');
    const candidates = [process.env.PDF_BROWSER_EXECUTABLE, 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/chromium', '/usr/bin/google-chrome'].filter(Boolean);
    const executablePath = candidates.find(candidate => fs.existsSync(candidate));
    if (!executablePath) fail(503, 'TMS_PDF_BROWSER_UNAVAILABLE', 'El generador PDF no tiene un navegador disponible.');
    const origin = reportWebOrigin();
    const puppeteer = await import('puppeteer-core');
    browser = await puppeteer.launch({ executablePath, headless: true, args: ['--disable-dev-shm-usage'] });
    const page = await browser.newPage();
    await page.evaluateOnNewDocument(() => { localStorage.setItem("apex_theme", "light"); });
    await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "light" }]);
    await page.setViewport({ width: 1600, height: 1100, deviceScaleFactor: 1 });
    await page.setRequestInterception(true);
    page.on('request', request => {
      const url = new URL(request.url());
      if (url.origin === origin.origin && url.pathname === '/__apex_settlement_pdf') return void request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(data), headers: { 'Cache-Control': 'no-store' } });
      if (url.origin === origin.origin || url.protocol === 'data:' || url.hostname.endsWith('.tile.openstreetmap.org') || url.hostname === 'tile.openstreetmap.org') return void request.continue();
      return void request.abort();
    });
    await page.goto(`${origin.origin}/print/transport-settlement`, { waitUntil: 'networkidle0', timeout: 90000 });
    await page.waitForSelector('[data-pdf-ready="true"]', { timeout: 60000 });
    await page.evaluate(() => document.fonts.ready);
    const stages = await page.$$('[data-rate-capture]');
    for (const stage of stages) {
      await stage.waitForSelector("[data-cost-panel=route]", { timeout: 60000 });
      const image = await stage.screenshot({ type: 'jpeg', quality: 90 });
      await stage.evaluate((element, base64) => { const img = document.createElement('img'); img.src = `data:image/jpeg;base64,${base64}`; img.alt = 'Captura de la etapa 4 del tarifario'; img.className = 'rate-capture-image'; element.replaceWith(img); }, Buffer.from(image).toString('base64'));
    }
    await page.evaluate(async () => { await Promise.all(Array.from(document.images).map(image => image.decode().catch(() => undefined))); const report = document.querySelector('.settlement-print'); if (report) document.body.replaceChildren(report); });
    const bytes = await page.pdf({ printBackground: true, preferCSSPageSize: true, displayHeaderFooter: true, headerTemplate: '<span></span>', footerTemplate: '<div style="width:100%;font-size:8px;text-align:center;color:#536575">APEXOS · Soporte de liquidación · <span class="pageNumber"></span> / <span class="totalPages"></span></div>', margin: { top: '14mm', bottom: '16mm', left: '14mm', right: '14mm' } });
    return { buffer: Buffer.from(bytes), fileName: `${data.package.code}-soporte-facturacion.pdf` };
  } finally { try { if (browser) await browser.close(); } finally { generating = false; } }
}
module.exports = { settlementReportData, settlementReportPdf, reportWebOrigin };
