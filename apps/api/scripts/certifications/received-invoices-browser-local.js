/*
 * Certificacion LOCAL en navegador del modulo de recepcion y asignacion de
 * facturas electronicas. Cierra el hueco que deja la certificacion HTTP:
 * un usuario real entra por la pantalla de login, carga un ZIP con facturas
 * XML/PDF, verifica los campos extraidos, abre ambos documentos en el visor,
 * asigna responsable y aprueba desde una sola pantalla.
 *
 * Requiere la API local (config/local.env) y el frontend en modo desarrollo
 * ya levantados. No arranca servidores ni modifica infraestructura.
 *
 * Uso: node apps/api/scripts/certifications/received-invoices-browser-local.js
 */
process.env.NODE_ENV = "test";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const API = path.resolve(__dirname, "../..");
const ROOT = path.resolve(API, "../..");
require("../../src/core/loadEnv")(path.join(ROOT, ".env"));

const bcrypt = require(require.resolve("bcrypt", { paths: [ROOT, API] }));
const { PrismaClient } = require("@prisma/client");
const puppeteer = require(path.join(API, "node_modules/puppeteer-core"));

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
const evidenceDir = path.resolve(args.output || path.join(ROOT, "docs/qa/evidence/received-invoices-20261028/browser"));
const shotDir = path.join(evidenceDir, "screenshots");
const demoZip = args.zip ? path.resolve(args.zip) : path.join(ROOT, "docs/qa/evidence/received-invoices-20261028/demo-facturas.zip");

const suffix = crypto.randomBytes(5).toString("hex");
const tenantId = `invoices-ui-${suffix}`;
const email = `ui-facturas-${suffix}@cert.local`;
const password = "CertUi#2026facturas";
const leaderName = "Lider de Facturas UI";
const responsibleName = "Analista de Cuentas UI";

const checks = [];
const consoleErrors = [];
const environmentNoise = [];
const documentResponses = [];
const badApiResponses = [];
const writeRequests = [];
const db = new PrismaClient();
let browser = null;

function check(name, ok, details = {}) {
  checks.push({ ...details, name, status: ok ? "passed" : "failed" });
  if (!ok) throw new Error(`Certificacion de navegador fallida: ${name}`);
}

async function reachable(url) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (response.status < 500) return true;
    } catch {
      // El servidor de desarrollo puede reiniciarse mientras corre la certificacion.
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  return false;
}

async function seed() {
  const config = { accounting: { organization_tree: { societies: [], branches: [], cost_centers: [] } } };
  await db.tenant.create({
    data: { id: tenantId, name: "UI facturas recibidas", active_modules: ["M-07"], config, country: "CO", currency: "COP" }
  });
  const role = await db.role.create({ data: { tenant_id: tenantId, name: "APEX_ADMIN", is_system: true } });
  const hash = await bcrypt.hash(password, 12);
  const leader = await db.user.create({ data: { tenant_id: tenantId, name: leaderName, email, password: hash, role_id: role.id } });
  await db.user.create({ data: { tenant_id: tenantId, name: responsibleName, email: `responsable-${suffix}@cert.local`, password: hash, role_id: role.id } });
  return { leaderId: leader.id };
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

async function shot(page, name, fullPage = true) {
  const file = path.join(shotDir, `${name}.png`);
  try {
    await page.screenshot({ path: file, fullPage });
  } catch {
    await page.screenshot({ path: file });
  }
}

// Chrome no compone el visor PDF (iframe fuera de proceso) en capturas fullPage;
// se enfoca el visor y se captura el viewport para que el PDF quede en la evidencia.
async function shotViewport(page, name) {
  await page.evaluate(() => document.querySelector("iframe")?.scrollIntoView({ block: "center" }));
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

async function clickButton(page, text) {
  const handle = await page.evaluateHandle((needle) => [...document.querySelectorAll("button")]
    .find((button) => button.innerText.replace(/\s+/g, " ").trim().includes(needle)) || null, text);
  const element = handle.asElement();
  if (!element) throw new Error(`No se encontro el boton "${text}".`);
  await element.evaluate((button) => button.scrollIntoView({ block: "center" }));
  await element.click();
}

async function controlByLabel(page, labelText) {
  const handle = await page.evaluateHandle((needle) => {
    const label = [...document.querySelectorAll("label")]
      .find((item) => item.querySelector("span")?.textContent?.trim() === needle);
    return label?.querySelector("input, textarea, select") || null;
  }, labelText);
  const element = handle.asElement();
  if (!element) throw new Error(`No se encontro el control "${labelText}".`);
  return element;
}

async function typeByLabel(page, labelText, value) {
  const element = await controlByLabel(page, labelText);
  await element.evaluate((node) => node.scrollIntoView({ block: "center" }));
  await element.click({ clickCount: 3 });
  await page.keyboard.press("Backspace");
  await element.type(value, { delay: 12 });
}

async function selectByLabel(page, labelText, optionValue) {
  const element = await controlByLabel(page, labelText);
  await element.select(optionValue);
}

async function main() {
  const started = new Date().toISOString();
  const results = { suite: "received-invoices-browser", mode: args.headed ? "headed" : "headless", executed_at: started, tenant_id: tenantId, api: API_URL, web: WEB_URL, total: 0, passed: 0, failed: 0, checks, screenshots: [], console_errors: consoleErrors, environment_noise: environmentNoise, bad_api_responses: badApiResponses, write_requests: writeRequests, document_responses: documentResponses };

  fs.mkdirSync(shotDir, { recursive: true });
  assert.ok(fs.existsSync(demoZip), `Falta el ZIP de demostracion: ${demoZip}`);
  const apiUp = await reachable(`${API_URL}/health`);
  const webUp = await reachable(`${WEB_URL}/login`);
  check("La API local y el frontend estan disponibles", apiUp && webUp, { apiUp, webUp });

  const users = await seed();
  check("El tenant de demostracion tiene un lider contable activo", Boolean(users.leaderId));

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
  page.on("request", (request) => {
    const url = request.url();
    if (url.includes("/api/v1/accounting/received-invoices") && ["POST", "PATCH", "PUT"].includes(request.method())) {
      writeRequests.push(`${request.method()} ${new URL(url).pathname}`);
    }
  });
  page.on("response", (response) => {
    const url = response.url();
    if (response.status() >= 400 && url.includes("/api/v1/")) badApiResponses.push({ url, status: response.status() });
    if (url.includes("/documents/") && url.endsWith("/file")) documentResponses.push({ url, status: response.status(), contentType: response.headers()["content-type"] || "" });
  });

  const demoZipFilename = path.basename(demoZip);

  // A. Login real por la pantalla de acceso.
  await loginThroughUi(page);
  await shot(page, "01-login");
  check("El lider inicia sesion por la pantalla real de acceso", page.url().includes("/dashboard"), { url: page.url() });

  // B. Navegacion desde Contabilidad hasta la bandeja.
  await page.goto(`${WEB_URL}/dashboard/contabilidad`, { waitUntil: "domcontentloaded" });
  await waitText(page, "Facturas recibidas");
  await page.evaluate(() => {
    const card = [...document.querySelectorAll("a")].find((item) => item.innerText.includes("Facturas recibidas"));
    card?.scrollIntoView({ block: "center" });
    card?.click();
  });
  await page.waitForFunction(() => location.pathname.includes("/facturas-recibidas"), { timeout: 60000 });
  await waitText(page, "Facturas electrónicas recibidas");
  check("La funcion esta ubicada dentro de Contabilidad y abre desde su portafolio", page.url().endsWith("/dashboard/contabilidad/facturas-recibidas"), { url: page.url() });
  const navActive = await page.evaluate(() => {
    const link = [...document.querySelectorAll('nav[aria-label="Navegación de contabilidad"] a')]
      .find((item) => item.textContent?.includes("Facturas recibidas"));
    return Boolean(link && link.className.includes("text-apex"));
  });
  check("La navegacion de Contabilidad marca la seccion activa", navActive);

  // C. Carga del ZIP por la interfaz.
  await clickButton(page, "Cargar ZIP");
  await page.waitForSelector('input[type="file"]', { timeout: 30000 });
  const fileInput = await page.$('input[type="file"]');
  await fileInput.uploadFile(demoZip);
  await page.waitForFunction(() => {
    const input = document.querySelector('input[type="file"]');
    return input && input.files && input.files.length === 1;
  }, { timeout: 30000 });
  await clickButton(page, "Procesar ZIP");
  await waitText(page, "ZIP procesado:", 90000);
  await page.waitForFunction(() => !document.querySelector('input[type="file"]'), { timeout: 30000 });
  await page.waitForFunction(() => [...document.querySelectorAll("table tbody tr")]
    .some((row) => row.innerText.includes("FV-2026-000123")), { timeout: 60000 });
  await page.waitForFunction(() => {
    const card = [...document.querySelectorAll('section[aria-label="Indicadores de facturas recibidas"] article')]
      .find((item) => /recibidas/i.test(item.innerText));
    return Boolean(card && card.innerText.split("\n").some((line) => line.trim() === "2"));
  }, { timeout: 30000 });
  const uploadMessage = await page.evaluate(() => document.body.innerText.match(/ZIP procesado:[^\n]*/)?.[0] || "");
  check("El ZIP con dos facturas XML/PDF se procesa desde el navegador", /2 creada\(s\), 0 duplicada\(s\), 0 con error/.test(uploadMessage), { uploadMessage, file: demoZipFilename });
  await shot(page, "02-bandeja-dos-facturas");

  // D. La bandeja completa los campos fiscales en la tabla.
  const rows = await page.$$eval("table tbody tr", (items) => items.map((row) => row.innerText.replace(/\t/g, " | ")));
  const first = rows.find((row) => row.includes("FV-2026-000123")) || "";
  const second = rows.find((row) => row.includes("FV-2026-000124")) || "";
  check("La bandeja muestra numero, proveedor, NIT, fechas y total de cada factura",
    first.includes("Distribuciones Andinas SAS") && first.includes("900123456") && first.includes("20/10/2026") && /\$?\s?1\.190\.000/.test(first)
    && second.includes("Insumos del Pacifico SAS") && second.includes("901777333") && /\$?\s?2\.856\.000/.test(second), { rows });
  const kpis = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('section[aria-label="Indicadores de facturas recibidas"] article')];
    return cards.map((card) => {
      const lines = card.innerText.split("\n").map((line) => line.trim()).filter(Boolean);
      return { label: lines[0]?.toLowerCase(), value: lines[1] };
    });
  });
  const receivedKpi = kpis.find((item) => item.label === "recibidas");
  const pendingKpi = kpis.find((item) => item.label === "pendientes de asignación");
  check("Los indicadores reflejan las dos facturas recibidas y pendientes", receivedKpi?.value === "2" && pendingKpi?.value === "2", { kpis });

  // E. Filtro por numero y apertura del detalle.
  await typeByLabel(page, "Número de factura", "FV-2026-000123");
  await clickButton(page, "Aplicar filtros");
  await page.waitForFunction(() => {
    const rows = [...document.querySelectorAll("table tbody tr")];
    return rows.length === 1 && rows[0].innerText.includes("FV-2026-000123");
  }, { timeout: 30000 });
  const filteredRow = await page.$eval("table tbody tr", (row) => row.innerText);
  check("El filtro por numero deja solo la factura buscada", filteredRow.includes("FV-2026-000123") && !filteredRow.includes("FV-2026-000124"), { filteredRow });
  await page.evaluate(() => {
    const link = [...document.querySelectorAll("table tbody tr a")].find((item) => item.innerText.includes("FV-2026-000123"));
    link?.click();
  });
  await page.waitForFunction(() => /\/facturas-recibidas\/\d+$/.test(location.pathname), { timeout: 60000 });
  await waitText(page, "Datos fiscales");
  await page.waitForFunction(() => document.body.innerText.includes("CUFE / CUDE"), { timeout: 60000 });

  // F. Datos fiscales extraidos del XML y comparacion con el PDF.
  const detailText = await page.evaluate(() => document.body.innerText);
  const fiscalOk = detailText.includes("3f1c9a2b7d4e6f8a1c3b5d7e9f0a2c4b6d8e0f1a3c5b7d9e1f3a5c7b9d0e2f4a")
    && detailText.includes("Distribuciones Andinas SAS")
    && detailText.includes("900123456")
    && detailText.includes("901555777")
    && /1\.000\.000/.test(detailText)
    && /190\.000/.test(detailText)
    && /1\.190\.000/.test(detailText);
  check("El detalle completa CUFE, emisor, receptor, subtotal, IVA y total desde el XML", fiscalOk);
  check("La comparacion XML/PDF no reporta diferencias en la factura conciliada", !detailText.includes("requiere revisión"), {});

  // G. Visor: XML en texto y PDF en iframe, ambos descargados con autenticacion.
  await shot(page, "03-detalle-fiscal");
  await clickButton(page, "XML ·");
  await page.waitForFunction(() => {
    const pre = document.querySelector("pre");
    return Boolean(pre && pre.innerText.includes("3f1c9a2b7d4e6f8a1c3b5d7e9f0a2c4b6d8e0f1a3c5b7d9e1f3a5c7b9d0e2f4a"));
  }, { timeout: 60000 });
  check("El visor muestra el XML original con su CUFE", true);
  await clickButton(page, "PDF ·");
  await page.waitForFunction(() => {
    const frame = document.querySelector("iframe");
    return Boolean(frame && frame.getAttribute("src")?.startsWith("blob:") && frame.getAttribute("src")?.includes("#page=1&zoom=100"));
  }, { timeout: 60000 });
  await page.waitForFunction(() => !document.querySelector("pre"), { timeout: 30000 });
  await new Promise((resolve) => setTimeout(resolve, 1500));
  const pdfFrame = await page.$eval("iframe", (frame) => frame.getAttribute("src"));
  const pdfState = await page.evaluate(() => {
    const frame = document.querySelector("iframe");
    const doc = frame?.contentDocument;
    return {
      src: frame?.getAttribute("src"),
      contentType: doc?.contentType || null,
      embedded: Boolean(doc?.querySelector("embed")),
      height: frame?.getBoundingClientRect().height || 0
    };
  });
  check("El visor enmarca el PDF original con paginacion y zoom permitidos por la CSP", pdfFrame.includes("#page=1&zoom=100") && pdfState.height > 100, { pdfState });
  check("El PDF se carga dentro del visor y no lo bloquea la politica de seguridad", pdfState.contentType === "application/pdf" || pdfState.embedded, { pdfState });
  check("El visor alterna de XML a PDF sin mezclar contenidos", pdfState.contentType === "application/pdf", { pdfState });
  const pdfServe = documentResponses.find((item) => item.status === 200 && /application\/pdf/.test(item.contentType));
  check("La API entrega el PDF autenticado como application/pdf para el visor", Boolean(pdfServe), { pdfServe, documentResponses });
  const paging = await page.evaluate(() => ({
    prevDisabled: Boolean(document.querySelector('button[aria-label="Página anterior"]')?.disabled),
    nextDisabled: Boolean(document.querySelector('button[aria-label="Página siguiente"]')?.disabled)
  }));
  check("El visor desactiva la navegacion de paginas cuando el PDF tiene una sola", paging.prevDisabled && paging.nextDisabled, { paging });
  await page.click('button[aria-label="Acercar"]');
  await page.waitForFunction(() => document.querySelector("iframe")?.getAttribute("src")?.includes("zoom=125"), { timeout: 30000 });
  const zoomState = await page.evaluate(() => ({
    label: document.body.innerText.includes("125%"),
    src: document.querySelector("iframe")?.getAttribute("src")
  }));
  check("El control de zoom aplica el porcentaje sobre el PDF", zoomState.label && Boolean(zoomState.src?.includes("zoom=125")), { zoomState });
  await page.click('button[aria-label="Alejar"]');
  await page.waitForFunction(() => document.querySelector("iframe")?.getAttribute("src")?.includes("zoom=100"), { timeout: 30000 });
  await shotViewport(page, "04-detalle-visor-pdf");
  check("Ambos documentos se descargan autenticados desde la API",
    documentResponses.some((item) => item.status === 200 && item.url.includes("/documents/")) && documentResponses.filter((item) => item.status === 200).length >= 2,
    { documentResponses });

  // H. Datos administrativos editables con historial.
  await typeByLabel(page, "Grupo / área", "Contabilidad");
  await typeByLabel(page, "Centro de costo", "CC-001");
  await typeByLabel(page, "Observaciones", "Factura validada contra la orden de compra OC-4471.");
  await clickButton(page, "Guardar");
  await waitText(page, "Datos administrativos guardados con trazabilidad de cambios.");
  check("Los datos administrativos se guardan y confirman en pantalla", true);

  // I. Asignacion desde la misma pantalla.
  const search = await page.$('input[aria-label="Buscar responsable"]');
  await search.click();
  await search.type(responsibleName, { delay: 20 });
  await page.waitForFunction((name) => [...document.querySelectorAll("button")].some((button) => button.innerText.includes(name)), { timeout: 30000 }, responsibleName);
  await page.evaluate((name) => {
    const button = [...document.querySelectorAll("button")].find((item) => item.innerText.includes(name));
    button?.click();
  }, responsibleName);
  await selectByLabel(page, "Segmento", "Contable");
  await typeByLabel(page, "Detalle de la asignación", "Revisar y registrar en el periodo octubre 2026.");
  await clickButton(page, "Asignar");
  await waitText(page, `Factura asignada a ${responsibleName}.`);
  await page.waitForFunction((name) => document.body.innerText.includes(`Responsable actual: ${name}`), { timeout: 30000 }, responsibleName);
  const assignedText = await page.evaluate(() => document.body.innerText);
  check("La asignacion deja responsable, segmento y estado visibles en la misma pantalla",
    assignedText.includes(`Responsable actual: ${responsibleName}`) && assignedText.includes("Asignación realizada") && assignedText.includes("Contable"), {});
  await shot(page, "05-detalle-asignada");

  // J. Aprobacion del lider con auditoria.
  page.once("dialog", (dialog) => { void dialog.accept(); });
  await clickButton(page, "Aprobar");
  await waitText(page, "Factura aprobada por el líder.");
  await page.waitForFunction(() => document.body.innerText.includes("Aprobada por el líder"), { timeout: 30000 });
  const approvedText = await page.evaluate(() => document.body.innerText);
  check("La aprobacion del lider deja la factura procesada y auditada",
    approvedText.includes("Procesada") && approvedText.includes("Aprobada por el líder"), {});
  check("La pantalla envia una sola asignacion y una sola aprobacion",
    writeRequests.filter((item) => item.endsWith("/assign")).length === 1
    && writeRequests.filter((item) => item.endsWith("/approve")).length === 1, { writeRequests });
  await shot(page, "06-detalle-aprobada");

  // K. La bandeja refleja el resultado final.
  await page.evaluate(() => {
    const link = [...document.querySelectorAll('nav[aria-label="Navegación de contabilidad"] a')]
      .find((item) => item.textContent?.includes("Facturas recibidas"));
    link?.click();
  });
  await page.waitForFunction(() => /\/facturas-recibidas$/.test(new URL(location.href).pathname), { timeout: 90000 });
  await waitText(page, "Facturas electrónicas recibidas");
  await page.waitForFunction(() => [...document.querySelectorAll("table tbody tr")]
    .some((row) => row.innerText.includes("FV-2026-000123") && row.innerText.includes("Procesada")), { timeout: 60000 });
  const finalRow = await page.$$eval("table tbody tr", (items) => items.map((row) => row.innerText).find((row) => row.includes("FV-2026-000123")) || "");
  check("La bandeja refleja responsable, estado procesado y asignacion final",
    finalRow.includes("Distribuciones Andinas SAS") && finalRow.includes(responsibleName) && finalRow.includes("Procesada") && finalRow.includes("Asignada"), { finalRow });
  await shot(page, "07-bandeja-final");

  check("La sesion completa no registro errores de consola propios del modulo", consoleErrors.length === 0, { consoleErrors, environmentNoise });
  check("Ninguna llamada del modulo respondio con error durante la sesion", badApiResponses.length === 0, { badApiResponses });

  results.total = checks.length;
  results.passed = checks.filter((item) => item.status === "passed").length;
  results.failed = checks.filter((item) => item.status === "failed").length;
  results.screenshots = fs.readdirSync(shotDir).map((name) => path.join(shotDir, name));
  results.finished_at = new Date().toISOString();
  fs.writeFileSync(path.join(evidenceDir, "browser-certification.json"), JSON.stringify(results, null, 2));
  console.log(`Certificacion de navegador facturas recibidas: ${results.passed}/${results.total} verificaciones, ${results.failed} fallidas.`);
  console.log(`Evidencia: ${path.relative(ROOT, path.join(evidenceDir, "browser-certification.json"))}`);
}

main()
  .catch((error) => {
    console.error(error);
    const results = {
      suite: "received-invoices-browser", tenant_id: tenantId, total: checks.length,
      passed: checks.filter((item) => item.status === "passed").length,
      failed: checks.filter((item) => item.status === "failed").length,
      error: String(error && error.message || error),
      checks, console_errors: consoleErrors, environment_noise: environmentNoise,
      bad_api_responses: badApiResponses, write_requests: writeRequests, document_responses: documentResponses
    };
    fs.mkdirSync(evidenceDir, { recursive: true });
    fs.writeFileSync(path.join(evidenceDir, "browser-certification.json"), JSON.stringify(results, null, 2));
    process.exitCode = 1;
  })
  .finally(async () => {
    if (browser) await browser.close().catch(() => {});
    await cleanup();
    await db.$disconnect().catch(() => {});
  });
