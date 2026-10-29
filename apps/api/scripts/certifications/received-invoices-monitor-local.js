/*
 * Certificacion LOCAL del flujo unificado de facturas recibidas:
 * una carpeta monitoreada (XML + PDF hermano y ZIP) entra por el mismo motor
 * de la bandeja y sus datos extraidos se consultan en la pestana Monitor, desde
 * donde se abre el PDF autenticado, la factura completa y la asignacion de
 * centro de costo.
 *
 * Requiere la API local y el frontend en modo desarrollo ya levantados y la
 * infraestructura local (Postgres/MinIO). No arranca servidores ni modifica
 * infraestructura.
 *
 * Uso: node scripts/certifications/received-invoices-monitor-local.js
 */
process.env.NODE_ENV = "test";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const JSZip = require("jszip");

const API = path.resolve(__dirname, "../..");
const ROOT = path.resolve(API, "../..");
require("../../src/core/loadEnv")(path.join(ROOT, ".env"));

const bcrypt = require(require.resolve("bcrypt", { paths: [ROOT, API] }));
const { PrismaClient } = require("@prisma/client");
const puppeteer = (() => {
  try {
    return require(path.join(API, "node_modules/puppeteer-core"));
  } catch {
    return require("puppeteer-core");
  }
})();
const { syncFolder } = require("../../src/modules/mailbox/invoice-folder-sync");
const { buildInvoiceXml, buildInvoicePdf } = require("../../test/fixtures/received-invoices/demo-archive");

const args = (() => {
  const out = {};
  for (let i = 0; i < process.argv.length; i += 1) {
    const value = process.argv[i];
    if (!value.startsWith("--")) continue;
    out[value.slice(2)] = process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[++i] : true;
  }
  return out;
})();

const CHROME = String(args.chrome || process.env.CHROME_BIN || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe");
const API_URL = String(args.api || process.env.CERT_API_URL || "http://127.0.0.1:3000");
const WEB_URL = String(args.web || process.env.CERT_WEB_URL || "http://127.0.0.1:3001");
const evidenceDir = path.resolve(args.output || path.join(ROOT, "docs/qa/evidence/received-invoices-monitor-20261028"));
const shotDir = path.join(evidenceDir, "screenshots");

const suffix = crypto.randomBytes(5).toString("hex");
const tenantId = `monitor-invoices-${suffix}`;
const email = `monitor-facturas-${suffix}@cert.local`;
const password = "CertMonitor#2026";
const responsibleName = "Analista de Costos Monitor";
const INVOICE_A = "FV-MON-000901";
const INVOICE_B = "FV-MON-000902";
const INVOICE_REPAIRED = "FV-MON-REPARADA";
const COST_CENTER = "CC-MON-901";

const checks = [];
const consoleErrors = [];
const environmentNoise = [];
const badApiResponses = [];
const documentResponses = [];
const db = new PrismaClient();
let browser = null;
let folder = null;
let seeded = null;

function check(name, ok, details = {}) {
  checks.push({ ...details, name, status: ok ? "passed" : "failed" });
  if (!ok) throw new Error(`Certificacion del monitor fallida: ${name}`);
}

async function reachable(url) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (response.status < 500) return true;
    } catch {
      // La API o el frontend pueden reiniciarse mientras corre la certificacion.
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  return false;
}

async function seed() {
  const config = {
    accounting: {
      organization_tree: {
        societies: [{ code: "SOC-01", name: "Sociedad monitor", active: true, tenant_id: tenantId }],
        branches: [{ code: "BR-MON", name: "Sucursal monitor", active: true, society_code: "SOC-01" }],
        cost_centers: [{
          code: COST_CENTER,
          name: "Centro certificado monitor",
          active: true,
          branch_code: "BR-MON",
          society_code: "SOC-01"
        }]
      }
    }
  };
  await db.tenant.create({
    data: { id: tenantId, name: "Monitor facturas recibidas", active_modules: ["M-07"], config, country: "CO", currency: "COP" }
  });
  const role = await db.role.create({ data: { tenant_id: tenantId, name: "APEX_ADMIN", is_system: true } });
  const hash = await bcrypt.hash(password, 12);
  const leader = await db.user.create({ data: { tenant_id: tenantId, name: "Lider de Facturas Monitor", email, password: hash, role_id: role.id } });
  const responsible = await db.user.create({ data: { tenant_id: tenantId, name: responsibleName, email: `costos-${suffix}@cert.local`, password: hash, role_id: role.id } });
  return { leaderId: leader.id, responsibleId: responsible.id };
}

async function cleanup() {
  const tables = [
    "receivedInvoiceDocument", "receivedInvoiceAssignment", "receivedInvoiceChangeLog",
    "invoiceProcessingError", "receivedInvoice", "invoiceProcessedEmail",
    "invoiceSupplier", "invoiceRecipient", "invoiceMailConfig"
  ];
  for (const model of tables) await db[model].deleteMany({ where: { tenant_id: tenantId } }).catch(() => {});
  await db.user.deleteMany({ where: { tenant_id: tenantId } }).catch(() => {});
  await db.role.deleteMany({ where: { tenant_id: tenantId } }).catch(() => {});
  await db.tenant.deleteMany({ where: { id: tenantId } }).catch(() => {});
}

function hexCufe(seedText) {
  return crypto.createHash("sha384").update(seedText).digest("hex");
}

function monitorInvoice(options, seedText) {
  return {
    number: options.number,
    cufe: hexCufe(seedText),
    issueDate: "2026-10-27",
    issuerTaxId: options.issuerTaxId,
    issuerName: options.issuerName,
    receiverTaxId: "901555777",
    receiverName: "Comercializadora Aurora SAS",
    subtotal: options.subtotal,
    iva: options.iva,
    total: options.total
  };
}

async function prepareFolder() {
  folder = fs.mkdtempSync(path.join(os.tmpdir(), "apexos-monitor-folder-"));
  const invoiceA = monitorInvoice({ number: INVOICE_A, issuerTaxId: "900123456", issuerName: "Distribuciones Andinas SAS", subtotal: 500000, iva: 95000, total: 595000 }, INVOICE_A);
  const invoiceB = monitorInvoice({ number: INVOICE_B, issuerTaxId: "901777333", issuerName: "Insumos del Pacifico SAS", subtotal: 300000, iva: 57000, total: 357000 }, INVOICE_B);

  fs.writeFileSync(path.join(folder, `${INVOICE_A}.xml`), buildInvoiceXml(invoiceA));
  fs.writeFileSync(path.join(folder, `${INVOICE_A}.pdf`), buildInvoicePdf(invoiceA));
  fs.writeFileSync(path.join(folder, `${INVOICE_A}.txt`), "no es un documento fiscal");

  const zip = new JSZip();
  zip.file(`${INVOICE_B}.xml`, buildInvoiceXml(invoiceB));
  zip.file(`${INVOICE_B}.pdf`, buildInvoicePdf(invoiceB));
  fs.writeFileSync(path.join(folder, "lote-octubre.zip"), await zip.generateAsync({ type: "nodebuffer" }));

  return { invoiceA, invoiceB };
}

async function shot(page, name, fullPage = true) {
  const file = path.join(shotDir, `${name}.png`);
  try {
    await page.screenshot({ path: file, fullPage });
  } catch {
    await page.screenshot({ path: file });
  }
}

// Chrome no compone el visor PDF en capturas fullPage; se centra el visor y se
// captura el viewport para que el PDF quede en la evidencia.
async function shotViewport(page, name) {
  await page.evaluate(() => document.querySelector('section[aria-label="Visor de documentos"]')?.scrollIntoView({ block: "center" }));
  await new Promise((resolve) => setTimeout(resolve, 600));
  await page.screenshot({ path: path.join(shotDir, `${name}.png`), fullPage: false });
}

async function loginThroughUi(page) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    await page.goto(`${WEB_URL}/login`, { waitUntil: "networkidle2" }).catch(() => {});
    await page.waitForSelector('input[name="email"]', { timeout: 90000 });
    // El formulario tiene method="post": si se envia antes de hidratar, el navegador
    // hace un POST nativo y nunca llega al panel. Se espera la hidratacion y se reintenta.
    await new Promise((resolve) => setTimeout(resolve, 1200));
    await page.click('input[name="email"]', { clickCount: 3 });
    await page.keyboard.press("Backspace");
    await page.type('input[name="email"]', email, { delay: 20 });
    await page.click('input[name="password"]', { clickCount: 3 });
    await page.keyboard.press("Backspace");
    await page.type('input[name="password"]', password, { delay: 20 });
    await page.click('button[type="submit"]');
    try {
      await page.waitForFunction(() => location.pathname.startsWith("/dashboard"), { timeout: 20000 });
      return;
    } catch {
      const body = await page.evaluate(() => document.body.innerText).catch(() => "");
      console.log(`Intento de login ${attempt} sin exito: ${body.slice(0, 160).replace(/\s+/g, " ")}`);
    }
  }
  throw new Error("No fue posible iniciar sesion por la pantalla real tras 3 intentos.");
}

async function waitText(page, text, timeout = 45000) {
  await page.waitForFunction(
    (needle) => document.body && document.body.innerText.includes(needle),
    { timeout },
    text
  );
}

async function controlByLabel(page, labelText) {
  const handle = await page.evaluateHandle((needle) => {
    const label = [...document.querySelectorAll("label")]
      .find((item) => item.querySelector("span")?.textContent?.trim() === needle);
    return label?.querySelector('input[role="combobox"]') || label?.querySelector("input, textarea, select") || null;
  }, labelText);
  const element = handle.asElement();
  if (!element) throw new Error(`No se encontro el control "${labelText}".`);
  return element;
}

async function controlByAria(page, ariaLabel) {
  const handle = await page.evaluateHandle((needle) => document.querySelector(`input[aria-label="${needle}"]`), ariaLabel);
  const element = handle.asElement();
  if (!element) throw new Error(`No se encontro el control "${ariaLabel}".`);
  return element;
}

async function searchCombobox(page, element, query, optionNeedle) {
  await element.click({ clickCount: 3 });
  await page.keyboard.press("Backspace");
  await page.waitForFunction(() => Boolean(document.querySelector('[role="listbox"]')), { timeout: 30000 });
  await element.type(query, { delay: 20 });
  await page.waitForFunction((needle) => [...document.querySelectorAll('[role="option"]')]
    .some((option) => option.innerText.includes(needle)), { timeout: 30000 }, optionNeedle);
  const matches = await page.evaluate(() => [...document.querySelectorAll('[role="option"]')]
    .map((option) => option.innerText.trim()));
  const picked = await page.evaluate((needle) => {
    const option = [...document.querySelectorAll('[role="option"]')]
      .find((item) => item.innerText.includes(needle));
    option?.click();
    return Boolean(option);
  }, optionNeedle);
  if (!picked) throw new Error(`No se pudo elegir la opcion "${optionNeedle}".`);
  return matches;
}

async function openMonitorTab(page) {
  const tab = await page.evaluateHandle(() => [...document.querySelectorAll('nav[aria-label="Secciones del módulo"] button')]
    .find((button) => button.textContent?.trim() === "Monitor") || null);
  const element = tab.asElement();
  if (!element) throw new Error("No se encontro la pestana Monitor.");
  await element.click();
  await waitText(page, "Monitor de extracción");
}

async function monitorRowText(page, number) {
  return page.evaluate((needle) => {
    const row = [...document.querySelectorAll('section[aria-label="Monitor de facturas extraídas"] table tbody tr')]
      .find((item) => item.innerText.includes(needle));
    return row ? row.innerText.replace(/\t/g, " | ") : "";
  }, number);
}

async function main() {
  const started = new Date().toISOString();
  const results = {
    suite: "received-invoices-monitor",
    mode: args.headed ? "headed" : "headless",
    executed_at: started,
    tenant_id: tenantId,
    api: API_URL,
    web: WEB_URL,
    total: 0,
    passed: 0,
    failed: 0,
    checks,
    screenshots: [],
    console_errors: consoleErrors,
    environment_noise: environmentNoise,
    bad_api_responses: badApiResponses,
    document_responses: documentResponses,
    pipeline: null,
    database: null
  };

  fs.mkdirSync(shotDir, { recursive: true });
  const apiUp = await reachable(`${API_URL}/health`);
  const webUp = await reachable(`${WEB_URL}/login`);
  check("La API local y el frontend estan disponibles", apiUp && webUp, { apiUp, webUp });

  seeded = await seed();
  check("El tenant de certificacion tiene lider y responsable activos", Boolean(seeded.leaderId && seeded.responsibleId));

  const { invoiceA } = await prepareFolder();

  // A. La carpeta entra por el mismo motor de la bandeja (documentos, auditoria, dedupe).
  const firstRun = await syncFolder({ config: { tenantId, folder } });
  check("La carpeta procesa XML con PDF hermano y ZIP por la tuberia unificada",
    firstRun.scanned === 2 && firstRun.inserted === 2 && firstRun.duplicates === 0 && firstRun.failed.length === 0,
    { firstRun });

  const secondRun = await syncFolder({ config: { tenantId, folder } });
  check("Una segunda corrida de la carpeta no duplica facturas",
    secondRun.scanned === 2 && secondRun.inserted === 0 && secondRun.duplicates === 2 && secondRun.failed.length === 0,
    { secondRun });

  const invoices = await db.receivedInvoice.findMany({
    where: { tenant_id: tenantId },
    include: { documents: true, email: true },
    orderBy: { id: "asc" }
  });
  const byNumber = new Map(invoices.map((invoice) => [invoice.full_number, invoice]));
  const storedA = byNumber.get(INVOICE_A);
  const storedB = byNumber.get(INVOICE_B);
  check("La tuberia unificada conserva las dos facturas con XML y PDF",
    invoices.length === 2 && storedA && storedB
    && storedA.documents.length === 2 && storedB.documents.length === 2
    && storedA.documents.some((item) => item.document_type === "xml")
    && storedA.documents.some((item) => item.document_type === "pdf")
    && storedB.documents.some((item) => item.document_type === "xml")
    && storedB.documents.some((item) => item.document_type === "pdf"),
    { invoices: invoices.map((invoice) => ({ number: invoice.full_number, documents: invoice.documents.map((item) => item.document_type) })) });

  const metadataOk = [storedA, storedB].every((invoice) => (
    Array.isArray(invoice.extraction_metadata?.iva_percents)
    && invoice.extraction_metadata.iva_percents.includes(19)
    && invoice.extraction_metadata?.cufe_validation?.valid === true
    && invoice.processing_status === "pending_assignment"
    && invoice.needs_review === false
  ));
  check("La extraccion guarda IVA 19%, CUFE valido y deja las facturas pendientes de asignacion", metadataOk, {
    metadata: [storedA, storedB].map((invoice) => ({
      number: invoice.full_number,
      iva_percents: invoice.extraction_metadata?.iva_percents,
      cufe_valid: invoice.extraction_metadata?.cufe_validation?.valid,
      status: invoice.processing_status,
      needs_review: invoice.needs_review
    }))
  });

  const provenanceOk = [storedA, storedB].every((invoice) => (
    invoice.email?.source === "folder"
    && String(invoice.email?.message_key || "").startsWith("folder:")
    && invoice.dedupe_key === `cufe:${String(invoice.cufe).toLowerCase()}`
  ));
  check("Las filas conservan el origen de carpeta y la clave de deduplicacion del motor", provenanceOk, {
    provenance: [storedA, storedB].map((invoice) => ({ number: invoice.full_number, source: invoice.email?.source, message_key: invoice.email?.message_key }))
  });

  results.pipeline = {
    first_run: firstRun,
    second_run: secondRun,
    invoices: invoices.map((invoice) => ({ id: invoice.id, number: invoice.full_number, status: invoice.processing_status, documents: invoice.documents.length }))
  };

  // B. El monitor muestra los datos extraidos.
  browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: !args.headed,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"]
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1000 });
  page.setDefaultTimeout(60000);
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    // Ruido del entorno local: Supabase local no configurado, socket de colaboracion
    // en otro origen y favicon ausente. No proviene del modulo de facturas.
    if (/localhost:54321/.test(text) || /collaboration\/live/.test(text) || /status of 404 \(Not Found\)/.test(text)) environmentNoise.push(text);
    else consoleErrors.push(text);
  });
  page.on("pageerror", (error) => consoleErrors.push(String(error.message || error)));
  page.on("response", (response) => {
    const url = response.url();
    if (response.status() >= 400 && url.includes("/api/v1/")) badApiResponses.push({ url, status: response.status() });
    if (url.includes("/documents/") && url.endsWith("/file")) documentResponses.push({ url, status: response.status(), contentType: response.headers()["content-type"] || "" });
  });

  await loginThroughUi(page);
  await page.goto(`${WEB_URL}/dashboard/contabilidad/facturas-recibidas`, { waitUntil: "networkidle2" });
  await waitText(page, "Facturas electrónicas recibidas");
  await openMonitorTab(page);
  await page.waitForFunction((needle) => [...document.querySelectorAll("table tbody tr")]
    .some((row) => row.innerText.includes(needle)), { timeout: 60000 }, INVOICE_A);
  await shot(page, "01-monitor-extraccion");

  const rowA = await monitorRowText(page, INVOICE_A);
  const monitorText = await page.evaluate(() => document.querySelector('section[aria-label="Monitor de facturas extraídas"]')?.innerText || "");
  check("El monitor muestra IVA 19% y CUFE valido de la factura extraida",
    rowA.includes("19%") && rowA.includes("Válido") && rowA.includes("Distribuciones Andinas SAS") && rowA.includes("595.000"),
    { rowA });
  check("El monitor muestra NIT emisor/receptor y el centro de costo pendiente",
    rowA.includes("900123456") && rowA.includes("901555777") && rowA.includes("Sin asignar"),
    { rowA });
  check("El resumen del monitor cuenta las dos facturas con CUFE validado",
    /2\s+con CUFE validado/.test(monitorText) && /2\s+con PDF/.test(monitorText),
    { monitorText });

  // C. Contrato del endpoint que alimenta la vista.
  const contract = await page.evaluate(async ({ apiUrl, number }) => {
    const token = localStorage.getItem("token");
    const response = await fetch(`${apiUrl}/api/v1/accounting/received-invoices?number=${encodeURIComponent(number)}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    return { status: response.status, body: await response.json() };
  }, { apiUrl: API_URL, number: INVOICE_A });
  const contractRow = contract.body?.data?.[0];
  check("El listado de la API entrega IVA, CUFE, receptor y metadatos al monitor",
    contract.status === 200 && contractRow
    && contractRow.full_number === INVOICE_A
    && Number(contractRow.iva) === 95000
    && contractRow.receiver_tax_id === "901555777"
    && contractRow.extraction_metadata?.iva_percents?.includes(19)
    && contractRow.extraction_metadata?.cufe_validation?.valid === true,
    { status: contract.status, row: contractRow && { number: contractRow.full_number, iva: contractRow.iva, receiver: contractRow.receiver_tax_id, metadata: contractRow.extraction_metadata } });

  // D. Abrir el PDF desde el monitor.
  const pdfResponsePromise = page.waitForResponse(
    (response) => response.url().includes("/documents/") && response.url().endsWith("/file") && response.request().method() === "GET",
    { timeout: 60000 }
  );
  await page.click(`button[aria-label="Ver PDF de ${INVOICE_A}"]`);
  const pdfResponse = await pdfResponsePromise;
  await page.waitForFunction((number) => {
    const frame = document.querySelector(`iframe[title="PDF de la factura ${number}"]`);
    return Boolean(frame && frame.getAttribute("src")?.startsWith("blob:"));
  }, { timeout: 60000 }, INVOICE_A);
  const pdfState = await page.evaluate((number) => {
    const frame = document.querySelector(`iframe[title="PDF de la factura ${number}"]`);
    return { src: frame?.getAttribute("src"), height: frame?.getBoundingClientRect().height || 0 };
  }, INVOICE_A);
  check("El monitor abre el PDF autenticado de la factura",
    pdfResponse.status() === 200 && /application\/pdf/.test(pdfResponse.headers()["content-type"] || "")
    && pdfState.src?.startsWith("blob:") && pdfState.height > 100,
    { pdfStatus: pdfResponse.status(), contentType: pdfResponse.headers()["content-type"], pdfState });
  await page.evaluate(() => document.querySelector("iframe")?.scrollIntoView({ block: "center" }));
  await new Promise((resolve) => setTimeout(resolve, 2500));
  await shot(page, "02-monitor-pdf", false);
  await page.evaluate(() => {
    const button = [...document.querySelectorAll('[role="dialog"] button')].find((item) => item.innerText.trim() === "Cerrar");
    button?.click();
  });
  await page.waitForFunction(() => !document.querySelector('[role="dialog"]'), { timeout: 30000 });

  // D1. El buzon declara el intervalo en segundos y la API publica el mismo valor.
  const mailConfig = await page.evaluate(async ({ apiUrl }) => {
    const token = localStorage.getItem("token");
    const response = await fetch(`${apiUrl}/api/v1/accounting/received-invoices/mail-config`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    return { status: response.status, body: await response.json().catch(() => null) };
  }, { apiUrl: API_URL });
  await page.evaluate(() => {
    const button = [...document.querySelectorAll("button")].find((item) => item.innerText.trim() === "Buzón IMAP");
    button?.scrollIntoView({ block: "center" });
    button?.click();
  });
  await waitText(page, "Buzón IMAP de facturas");
  await page.waitForFunction(() => Boolean(document.querySelector('[role="dialog"] input[type="number"]')), { timeout: 30000 });
  const pollingField = await page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]');
    const label = [...(dialog?.querySelectorAll("label") || [])]
      .find((item) => item.querySelector("span")?.textContent?.trim() === "Intervalo (segundos)");
    const input = label?.querySelector("input");
    return {
      value: input?.value || null,
      min: input?.getAttribute("min") || null,
      max: input?.getAttribute("max") || null,
      text: label?.innerText || ""
    };
  });
  const mailConfigValue = mailConfig.body?.polling_seconds;
  check("El buzon configura el intervalo en segundos y la API devuelve el mismo valor",
    mailConfig.status === 200
    && Number(mailConfigValue) >= 10
    && pollingField.value === String(mailConfigValue)
    && pollingField.min === "10" && pollingField.max === "3600"
    && /cada 30 s/.test(pollingField.text),
    { http_status: mailConfig.status, polling_seconds: mailConfigValue, pollingField, body: mailConfig.body });
  await shot(page, "02b-monitor-buzon-segundos", false);
  await page.evaluate(() => {
    const button = [...document.querySelectorAll('[role="dialog"] button')].find((item) => item.innerText.trim() === "Cerrar");
    button?.click();
  });
  await page.waitForFunction(() => !document.querySelector('[role="dialog"]'), { timeout: 30000 });

  // E. La unica via al detalle es el hipervinculo del numero de factura; la
  // asignacion se realiza en el formulario unico del detalle y el monitor la refleja.
  await page.evaluate((number) => {
    const link = [...document.querySelectorAll(`a[aria-label="Abrir factura ${number}"]`)]
      .find((item) => item.getBoundingClientRect().width > 0);
    link?.scrollIntoView({ block: "center" });
    link?.click();
  }, INVOICE_A);
  await page.waitForFunction(() => /\/facturas-recibidas\/\d+$/.test(new URL(location.href).pathname), { timeout: 90000 });
  await waitText(page, "Datos fiscales");
  await page.waitForFunction(() => Boolean(document.querySelector('input[aria-label="Buscar responsable"]')), { timeout: 60000 });
  const responsibleInput = await controlByAria(page, "Buscar responsable");
  try {
    await searchCombobox(page, responsibleInput, responsibleName, responsibleName);
  } catch (error) {
    const diagnostics = await page.evaluate(() => {
      const input = document.querySelector('input[aria-label="Buscar responsable"]');
      const list = document.querySelector('[role="listbox"]');
      return {
        url: location.href,
        input: input ? { value: input.value, disabled: input.disabled, expanded: input.getAttribute("aria-expanded") } : null,
        listText: list ? list.innerText : null,
        options: [...document.querySelectorAll('[role="option"]')].map((option) => option.innerText.trim()),
        body: document.body.innerText.slice(0, 2500)
      };
    });
    fs.writeFileSync(path.join(evidenceDir, "assign-diagnostics.json"), JSON.stringify(diagnostics, null, 2));
    await shot(page, "03a-diagnostico-responsable", false);
    throw error;
  }
  await page.waitForFunction((name) => document.body.innerText.includes(name), { timeout: 30000 }, responsibleName);
  const centerMatches = await searchCombobox(page, await controlByLabel(page, "Centro de costo"), "certificado", COST_CENTER);
  const centerField = await page.evaluate(() => {
    const label = [...document.querySelectorAll("label")]
      .find((item) => item.querySelector("span")?.textContent?.trim() === "Centro de costo");
    const select = label?.querySelector("select");
    const input = label?.querySelector('input[role="combobox"]');
    return {
      value: select?.value || null,
      display: input?.value || null,
      role: input?.getAttribute("role") || null,
      options: select ? [...select.options].map((option) => ({ value: option.value, text: option.textContent })) : []
    };
  });
  check("El buscador inteligente del detalle filtra los centros de costo de la estructura",
    centerField.role === "combobox"
    && centerMatches.length === 1
    && centerMatches[0].includes("Centro certificado monitor"),
    { centerMatches, centerField });
  check("El buscador inteligente asigna el centro de costo real del maestro",
    centerField.value === COST_CENTER
    && String(centerField.display || "").includes(COST_CENTER)
    && String(centerField.display || "").includes("Centro certificado monitor")
    && centerField.options.some((option) => option.value === COST_CENTER && option.text.includes("Centro certificado monitor")),
    centerField);
  await shot(page, "03-detalle-centro-costo", false);
  await page.waitForFunction(() => {
    const button = [...document.querySelectorAll("button")].find((item) => item.innerText.trim() === "Asignar");
    return Boolean(button && !button.disabled);
  }, { timeout: 30000 });
  await page.evaluate(() => {
    const button = [...document.querySelectorAll("button")].find((item) => item.innerText.trim() === "Asignar");
    button?.click();
  });
  await waitText(page, `Factura asignada a ${responsibleName}.`);
  await page.evaluate(() => document.querySelector('a[href="/dashboard/contabilidad/facturas-recibidas?tab=monitor"]')?.click());
  await page.waitForFunction(() => /\/facturas-recibidas$/.test(new URL(location.href).pathname)
    && new URL(location.href).searchParams.get("tab") === "monitor", { timeout: 90000 });
  await waitText(page, "Monitor de extracción");
  await page.waitForFunction(({ number, costCenter, name }) => {
    const row = [...document.querySelectorAll('section[aria-label="Monitor de facturas extraídas"] table tbody tr')]
      .find((item) => item.innerText.includes(number));
    return Boolean(row && row.innerText.includes(costCenter) && row.innerText.includes(name));
  }, { timeout: 60000 }, { number: INVOICE_A, costCenter: COST_CENTER, name: responsibleName });
  const assignedRow = await monitorRowText(page, INVOICE_A);
  check("La asignacion hecha en el detalle deja centro de costo y responsable visibles en el monitor",
    assignedRow.includes(COST_CENTER) && assignedRow.includes(responsibleName) && assignedRow.includes("Asignada"),
    { assignedRow });
  await shot(page, "03-monitor-asignada");

  // E1. La API publica el maestro de la estructura y rechaza codigos que no existen.
  // La peticion invalida se hace desde Node para que el rechazo esperado no cuente
  // como error de consola ni como respuesta fallida del modulo en la sesion.
  const token = await page.evaluate(() => localStorage.getItem("token"));
  const detailResponse = await fetch(`${API_URL}/api/v1/accounting/received-invoices/${contractRow.id}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });
  const detailBody = await detailResponse.json();
  const rejectedResponse = await fetch(`${API_URL}/api/v1/accounting/received-invoices/${contractRow.id}`, {
    method: "PATCH",
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), "Content-Type": "application/json" },
    body: JSON.stringify({ cost_center: "CC-FUERA-DE-ESTRUCTURA" })
  });
  const centerContract = {
    status: detailResponse.status,
    centers: detailBody.cost_centers || [],
    rejectedStatus: rejectedResponse.status,
    rejectedBody: await rejectedResponse.json()
  };
  check("La API publica el maestro de centros de costo y rechaza codigos fuera de la estructura",
    centerContract.status === 200
    && centerContract.centers.some((item) => item.code === COST_CENTER && item.branch_name === "Sucursal monitor")
    && centerContract.rejectedStatus === 422
    && centerContract.rejectedBody?.code === "INVOICE_COST_CENTER_INVALID",
    centerContract);

  // E2. El filtro por centro de costo del monitor acepta el codigo compacto.
  const costCenterFilter = await controlByAria(page, "Centro de costo");
  await costCenterFilter.click({ clickCount: 3 });
  await page.keyboard.press("Backspace");
  await costCenterFilter.type("ccmon901", { delay: 20 });
  await page.evaluate(() => {
    const button = [...document.querySelectorAll("button")].find((item) => item.innerText.includes("Aplicar filtros"));
    button?.click();
  });
  await page.waitForFunction(({ number, other, costCenter }) => {
    const rows = [...document.querySelectorAll('section[aria-label="Monitor de facturas extraídas"] table tbody tr')];
    return rows.length === 1 && rows[0].innerText.includes(number) && rows[0].innerText.includes(costCenter)
      && !rows[0].innerText.includes(other);
  }, { timeout: 60000 }, { number: INVOICE_A, other: INVOICE_B, costCenter: COST_CENTER });
  const filteredContract = await fetch(`${API_URL}/api/v1/accounting/received-invoices?cost_center=ccmon901`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });
  const filteredBody = await filteredContract.json();
  check("El filtro por centro de costo compacta el codigo y deja solo las facturas asignadas",
    filteredContract.status === 200
    && filteredBody.meta?.total === 1
    && filteredBody.data?.[0]?.full_number === INVOICE_A
    && filteredBody.data?.[0]?.cost_center === COST_CENTER,
    { status: filteredContract.status, total: filteredBody.meta?.total, rows: filteredBody.data?.map((row) => ({ number: row.full_number, cost_center: row.cost_center })) });
  await shot(page, "03b-monitor-filtro-centro-costo");
  await page.evaluate(() => {
    const button = [...document.querySelectorAll("button")].find((item) => item.innerText.trim() === "Limpiar");
    button?.click();
  });
  await page.waitForFunction((other) => [...document.querySelectorAll("table tbody tr")]
    .some((row) => row.innerText.includes(other)), { timeout: 60000 }, INVOICE_B);

  // F. Abrir la factura completa desde el monitor.
  const detailPdfResponsePromise = page.waitForResponse(
    (response) => response.url().includes("/documents/") && response.url().endsWith("/file") && response.request().method() === "GET",
    { timeout: 90000 }
  );
  await page.evaluate((number) => {
    const link = [...document.querySelectorAll(`a[aria-label="Abrir factura ${number}"]`)]
      .find((item) => item.getBoundingClientRect().width > 0);
    link?.click();
  }, INVOICE_A);
  await page.waitForFunction(() => /\/facturas-recibidas\/\d+$/.test(new URL(location.href).pathname), { timeout: 90000 });
  await waitText(page, "Datos fiscales");
  const detailPdfResponse = await detailPdfResponsePromise;
  await page.waitForFunction((number) => {
    const frame = document.querySelector(`iframe[title="PDF de la factura ${number}"]`);
    return Boolean(frame && frame.getAttribute("src")?.startsWith("blob:") && frame.getBoundingClientRect().height > 300);
  }, { timeout: 90000 }, INVOICE_A);
  const detailViewer = await page.evaluate(() => {
    const section = document.querySelector('section[aria-label="Visor de documentos"]');
    const frame = section?.querySelector('iframe[title^="PDF de la factura"]');
    return {
      text: section?.innerText || "",
      width: frame?.getBoundingClientRect().width || 0,
      height: frame?.getBoundingClientRect().height || 0
    };
  });
  check("El visor de la factura abre el PDF autenticado por defecto",
    detailPdfResponse.status() === 200
    && String(detailPdfResponse.headers()["content-type"] || "").includes("application/pdf")
    && detailViewer.width > 300 && detailViewer.height > 300
    && !detailViewer.text.includes("Sin documentos almacenados")
    && !detailViewer.text.includes("Selecciona un documento"),
    { status: detailPdfResponse.status(), contentType: detailPdfResponse.headers()["content-type"], viewer: detailViewer });
  const detailText = await page.evaluate(() => document.body.innerText);
  const detailCostCenter = await page.evaluate(() => {
    const label = [...document.querySelectorAll("label")]
      .find((item) => item.querySelector("span")?.textContent?.trim() === "Centro de costo");
    const input = label?.querySelector('input[role="combobox"]');
    return {
      value: label?.querySelector("select")?.value || null,
      display: input?.value || null,
      role: input?.getAttribute("role") || null
    };
  });
  check("La factura abierta desde el monitor conserva emisor, CUFE y centro de costo del maestro",
    detailText.includes(INVOICE_A) && detailText.includes(invoiceA.cufe)
    && detailText.includes("Distribuciones Andinas SAS")
    && detailCostCenter.value === COST_CENTER && detailCostCenter.role === "combobox"
    && String(detailCostCenter.display || "").includes("Centro certificado monitor"),
    { detailCostCenter, url: page.url() });
  await shot(page, "04-factura-desde-monitor");
  await shotViewport(page, "05-visor-pdf-factura");

  // F1. La pestana XML muestra el contenido extraido, no un panel vacio.
  await page.evaluate(() => {
    const tab = [...document.querySelectorAll('[role="tab"]')].find((item) => item.innerText.includes("XML"));
    tab?.click();
  });
  await page.waitForFunction(() => {
    const pre = document.querySelector('section[aria-label="Visor de documentos"] pre');
    return Boolean(pre && pre.innerText.length > 200 && pre.innerText.includes("<"));
  }, { timeout: 60000 });
  const xmlPreview = await page.evaluate(() => document.querySelector('section[aria-label="Visor de documentos"] pre')?.innerText || "");
  check("El visor muestra el XML extraido al seleccionar su pestana", xmlPreview.length > 200 && xmlPreview.includes("Invoice"), { length: xmlPreview.length });

  // F2. Factura heredada sin documentos: estado vacio claro y sin reproceso posible.
  const legacy = await db.receivedInvoice.create({
    data: {
      tenant_id: tenantId,
      full_number: "FV-MON-LEGADO",
      invoice_number: "FV-MON-LEGADO",
      cufe: hexCufe("FV-MON-LEGADO"),
      issuer_name: "Proveedor heredado sin archivos SAS",
      issuer_tax_id: "900999888",
      receiver_name: "Comercializadora Aurora SAS",
      receiver_tax_id: "901555777",
      subtotal: 100000,
      total: 100000,
      currency: "COP",
      processing_status: "pending_assignment",
      dedupe_key: `cufe:${hexCufe("FV-MON-LEGADO")}`,
      issue_date: new Date("2026-10-27T12:00:00.000Z"),
      extraction_metadata: { iva_percents: [], cufe_validation: { valid: true } }
    }
  });
  await page.goto(`${WEB_URL}/dashboard/contabilidad/facturas-recibidas/${legacy.id}`, { waitUntil: "networkidle2" });
  await waitText(page, "Datos fiscales");
  await waitText(page, "Sin documentos almacenados");
  const legacyViewer = await page.evaluate(() => {
    const section = document.querySelector('section[aria-label="Visor de documentos"]');
    const reprocess = [...document.querySelectorAll("button")].find((button) => button.innerText.includes("Reprocesar ZIP"));
    return {
      text: section?.innerText || "",
      reprocessDisabled: Boolean(reprocess?.disabled),
      hasMonitorLink: Boolean([...document.querySelectorAll("a")].find((link) => link.innerText.includes("Ir al monitor")))
    };
  });
  check("La factura sin documentos explica el estado y no ofrece reproceso sin ZIP",
    legacyViewer.text.includes("Sin documentos almacenados")
    && !legacyViewer.text.includes("Selecciona un documento")
    && legacyViewer.reprocessDisabled
    && legacyViewer.hasMonitorLink,
    legacyViewer);
  await shot(page, "06-factura-sin-documentos");

  // F3. Factura heredada sin documentos: al reencontrar su XML y PDF en la
  // carpeta se vinculan los documentos a la fila existente, sin duplicarla.
  const repairFolder = fs.mkdtempSync(path.join(os.tmpdir(), "apexos-repair-folder-"));
  const repaired = monitorInvoice({
    number: INVOICE_REPAIRED,
    issuerTaxId: "900999777",
    issuerName: "Proveedor heredado recuperado SAS",
    subtotal: 176470,
    iva: 33530,
    total: 210000
  }, INVOICE_REPAIRED);
  const legacyRow = await db.receivedInvoice.create({
    data: {
      tenant_id: tenantId,
      full_number: INVOICE_REPAIRED,
      invoice_number: INVOICE_REPAIRED,
      cufe: repaired.cufe,
      issuer_name: repaired.issuerName,
      issuer_tax_id: repaired.issuerTaxId,
      receiver_name: repaired.receiverName,
      receiver_tax_id: repaired.receiverTaxId,
      subtotal: repaired.subtotal,
      iva: repaired.iva,
      total: repaired.total,
      currency: "COP",
      processing_status: "pending_assignment",
      dedupe_key: `cufe:${repaired.cufe}`,
      issue_date: new Date("2026-10-27T12:00:00.000Z"),
      extraction_metadata: { iva_percents: [19], cufe_validation: { valid: true } }
    }
  });
  fs.writeFileSync(path.join(repairFolder, `${INVOICE_REPAIRED}.xml`), buildInvoiceXml(repaired));
  fs.writeFileSync(path.join(repairFolder, `${INVOICE_REPAIRED}.pdf`), buildInvoicePdf(repaired));

  const repairRun = await syncFolder({ config: { tenantId, folder: repairFolder } });
  const repairedRow = await db.receivedInvoice.findUnique({ where: { id: legacyRow.id }, include: { documents: true } });
  check("La carpeta vincula XML y PDF a una factura heredada sin crear duplicados",
    repairRun.scanned === 1 && repairRun.inserted === 0 && repairRun.completed === 1 && repairRun.duplicates === 0
    && repairedRow.documents.length === 2
    && repairedRow.pdf_available && repairedRow.xml_available
    && Boolean(repairedRow.source_archive) && Boolean(repairedRow.email_id),
    { repairRun, documents: repairedRow.documents.map((item) => item.document_type) });

  const attachedLog = await db.receivedInvoiceChangeLog.findFirst({
    where: { invoice_id: legacyRow.id, action: "documents_attached" }
  });
  const repairRerun = await syncFolder({ config: { tenantId, folder: repairFolder } });
  const documentsAfterRerun = await db.receivedInvoiceDocument.count({ where: { invoice_id: legacyRow.id } });
  const repairedCount = await db.receivedInvoice.count({ where: { tenant_id: tenantId, full_number: INVOICE_REPAIRED } });
  check("El completado de documentos es idempotente y queda auditado",
    Boolean(attachedLog) && repairRerun.completed === 0 && repairRerun.inserted === 0
    && repairRerun.duplicates === 1 && documentsAfterRerun === 2 && repairedCount === 1,
    { repairRerun, documentsAfterRerun, repairedCount, audit: attachedLog?.action || null });

  await page.goto(`${WEB_URL}/dashboard/contabilidad/facturas-recibidas/${legacyRow.id}`, { waitUntil: "networkidle2" });
  await waitText(page, "Datos fiscales");
  await page.waitForFunction((number) => {
    const frame = document.querySelector(`iframe[title="PDF de la factura ${number}"]`);
    return Boolean(frame && frame.getAttribute("src")?.startsWith("blob:") && frame.getBoundingClientRect().height > 300);
  }, { timeout: 90000 }, INVOICE_REPAIRED);
  const repairedViewer = await page.evaluate(() => {
    const section = document.querySelector('section[aria-label="Visor de documentos"]');
    const frame = section?.querySelector('iframe[title^="PDF de la factura"]');
    return {
      text: section?.innerText || "",
      tabs: [...document.querySelectorAll('[role="tab"]')].map((tab) => tab.innerText.trim()),
      frameHeight: frame?.getBoundingClientRect().height || 0
    };
  });
  check("La factura reparada previsualiza su PDF en el visor",
    !repairedViewer.text.includes("Sin documentos almacenados")
    && repairedViewer.tabs.some((tab) => tab.includes("XML"))
    && repairedViewer.tabs.some((tab) => tab.includes("PDF"))
    && repairedViewer.frameHeight > 300,
    repairedViewer);
  await shotViewport(page, "07-factura-reparada");
  results.repair = { invoice_id: legacyRow.id, run: repairRun, rerun: repairRerun, documents: documentsAfterRerun };

  // G. Auditoria persistida de la asignacion.
  const refreshed = await db.receivedInvoice.findUnique({ where: { id: storedA.id } });
  const history = await db.receivedInvoiceAssignment.findMany({ where: { invoice_id: storedA.id } });
  const changeLog = await db.receivedInvoiceChangeLog.findFirst({
    where: { invoice_id: storedA.id, action: "assigned" },
    orderBy: { id: "desc" }
  });
  check("La asignacion queda auditada con responsable, centro de costo y sin segmento heredado",
    refreshed.cost_center === COST_CENTER
    && refreshed.segment === null
    && refreshed.responsible_name === responsibleName
    && history.length === 1
    && changeLog?.changes?.cost_center === COST_CENTER,
    {
      cost_center: refreshed.cost_center,
      segment: refreshed.segment,
      responsible: refreshed.responsible_name,
      history: history.length,
      change_log: changeLog?.changes || null
    });
  results.database = {
    invoice_id: storedA.id,
    cost_center: refreshed.cost_center,
    segment: refreshed.segment,
    responsible: refreshed.responsible_name,
    assignment_history: history.length,
    change_log_cost_center: changeLog?.changes?.cost_center || null
  };

  check("La sesion no registro errores de consola propios del modulo", consoleErrors.length === 0, { consoleErrors, environmentNoise });
  check("Ninguna llamada del modulo respondio con error durante la sesion", badApiResponses.length === 0, { badApiResponses });

  results.total = checks.length;
  results.passed = checks.filter((item) => item.status === "passed").length;
  results.failed = checks.filter((item) => item.status === "failed").length;
  results.screenshots = fs.readdirSync(shotDir).map((name) => path.join(shotDir, name));
  results.finished_at = new Date().toISOString();
  fs.writeFileSync(path.join(evidenceDir, "monitor-certification.json"), JSON.stringify(results, null, 2));
  console.log(`Certificacion monitor facturas recibidas: ${results.passed}/${results.total} verificaciones, ${results.failed} fallidas.`);
  console.log(`Evidencia: ${path.relative(ROOT, path.join(evidenceDir, "monitor-certification.json"))}`);
}

main()
  .catch((error) => {
    console.error(error);
    const results = {
      suite: "received-invoices-monitor",
      tenant_id: tenantId,
      total: checks.length,
      passed: checks.filter((item) => item.status === "passed").length,
      failed: checks.filter((item) => item.status === "failed").length,
      error: String(error && error.message || error),
      checks,
      console_errors: consoleErrors,
      environment_noise: environmentNoise,
      bad_api_responses: badApiResponses,
      document_responses: documentResponses
    };
    fs.mkdirSync(evidenceDir, { recursive: true });
    fs.writeFileSync(path.join(evidenceDir, "monitor-certification.json"), JSON.stringify(results, null, 2));
    process.exitCode = 1;
  })
  .finally(async () => {
    if (browser) await browser.close().catch(() => {});
    await cleanup();
    if (folder) fs.rmSync(folder, { recursive: true, force: true });
    await db.$disconnect().catch(() => {});
  });
