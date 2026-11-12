// Certificacion navegador de la capa visual homologada.
// Se ejecuta contra un build aislado del commit candidato; jamas escribe en la base:
// toda peticion de escritura se intercepta y solo se registra su payload.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const puppeteer = require("puppeteer-core");

const root = path.resolve(__dirname, "../..");
const evidenceDir = path.resolve(
  process.env.CERT_EVIDENCE_DIR || path.join(root, "docs/qa/evidence/homologacion-visual-candidate-20261112")
);
const commit = String(process.env.CERT_COMMIT || "").trim();
assert.match(commit, /^[a-f0-9]{7,40}$/i, "CERT_COMMIT must be the evaluated commit SHA");

function loopbackOrigin(value, label) {
  const message = `${label} must be a loopback http origin on an explicit port other than 3000/3001/54320`;
  assert.ok(typeof value === "string" && !/\s/.test(value), message);
  const match = /^http:\/\/(localhost|127\.0\.0\.1):([1-9][0-9]{0,4})\/?$/.exec(value);
  assert.ok(match && Number(match[2]) <= 65535 && ![3000, 3001, 54320].includes(Number(match[2])), message);
  return new URL(value).origin;
}

const webBase = loopbackOrigin(process.env.CERT_WEB_URL, "CERT_WEB_URL");
const label = String(process.env.CERT_EVIDENCE_LABEL || "candidate").replace(/[^a-z0-9-]/gi, "");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function browserPath() {
  for (const candidate of [
    process.env.CHROME_PATH,
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Google/Chrome/Application/chrome.exe"
  ]) if (candidate && fs.existsSync(candidate)) return candidate;
  throw new Error("No local Chromium browser found");
}

// El tenant demo local tiene licenciados M-01..M-28, M-30, AI-CORE, apex_heart y reportes.
// M-29 (Gastos Menores) no esta activo: su hub se certifica en el estado denegado canonico,
// que es identico en develop y en desarrollo y no depende de esta intervencion.
const HUBS = [
  ["lobby", "/dashboard", "allowed"],
  ["inventario", "/dashboard/inventario", "allowed"],
  ["compras", "/dashboard/compras", "allowed"],
  ["ventas", "/dashboard/ventas", "allowed"],
  ["gestion-comercial", "/dashboard/gestion-comercial", "allowed"],
  ["comercio", "/dashboard/comercio", "allowed"],
  ["contabilidad", "/dashboard/contabilidad", "allowed"],
  ["transporte", "/dashboard/transporte", "allowed"],
  ["talento-humano", "/dashboard/talento-humano", "allowed"],
  ["servicios", "/dashboard/servicios", "allowed"],
  ["reportes", "/dashboard/reportes", "allowed"],
  ["administracion", "/dashboard/administracion", "allowed"],
  ["gastos-menores", "/dashboard/gastos-menores", "documented_denied"]
];

// El tenant demo local no tiene clientes ni asesores comerciales: esos maestros se sustituyen
// por juegos controlados. Los productos de inventario y las familias si salen del API real.
const FIXTURES = {
  customers: { match: "/api/v1/sales/customers", body: { customers: [{ id: 987654, name: "PRUEBA HOMOLOGACION" }] } },
  commercialCustomers: {
    match: "/api/v1/commercial-management/customers",
    body: [{ id: 111, code: "PRUEBA-01", legal_name: "PRUEBA HOMOLOGACION", advisor_id: 222, city: "Bogota" }]
  },
  advisors: { match: "/api/v1/commercial-management/advisors", body: [{ id: 222, code: "ASE-01", name: "Asesor Prueba" }] },
  zones: { match: "/api/v1/commercial-management/zones", body: [{ id: 333, code: "Z-01", name: "Zona Prueba" }] },
  reasons: {
    match: "/api/v1/commercial-management/visit-reasons",
    body: [{ id: 444, code: "M-01", name: "Visita comercial de prueba" }]
  },
  results: { match: "/api/v1/commercial-management/visit-results", body: [] },
  settings: { match: "/api/v1/commercial-management/settings", body: { default_visit_duration_minutes: 60 } }
};

const evidence = {
  commit,
  environment: "LOCAL",
  status: "running",
  web_base: webBase,
  started_at: new Date().toISOString(),
  fixtures: Object.fromEntries(Object.entries(FIXTURES).map(([key, value]) => [key, value.match])),
  writes_intercepted: true,
  checks: [],
  screenshots: [],
  payloads: {},
  writes_intercepted: [],
  console_errors: []
};

function check(name, passed, detail) {
  evidence.checks.push({ name, status: passed ? "passed" : "failed", detail });
  assert.ok(passed, `${name}: ${JSON.stringify(detail)}`);
}

async function waitFor(page, fn, timeout = 30000, argument) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try { if (await page.evaluate(fn, argument)) return true; } catch { /* navegando */ }
    await sleep(200);
  }
  return false;
}

async function main() {
  fs.mkdirSync(evidenceDir, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: browserPath(), headless: "new", args: ["--no-sandbox", "--disable-gpu"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 960 });
  // La cache HTTP y el service worker devolverian maestros de sesiones anteriores y ocultarian
  // las respuestas controladas; la certificacion siempre lee del origen.
  if (typeof page.setBypassServiceWorker === "function") await page.setBypassServiceWorker(true);
  const cdp = typeof page.createCDPSession === "function" ? await page.createCDPSession() : await page.target().createCDPSession();
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  const writes = [];
  let mode = "real";

  await page.setRequestInterception(true);
  page.on("request", (request) => {
    const url = request.url();
    const method = request.method();
    const json = (body) => request.respond({ status: 200, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    if (url.endsWith("/favicon.ico")) return request.respond({ status: 204, body: "" });
    if (method === "GET" && url.includes("/api/v1/")) {
      const fixture = Object.values(FIXTURES).find((rule) => url.includes(rule.match));
      if (fixture) return json(mode === "empty-masters" && fixture === FIXTURES.customers ? { customers: [] } : fixture.body);
      return request.continue();
    }
    if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
      // La autenticacion viaja real: interceptarla dejaria la sesion sin token valido.
      if (url.includes("/api/v1/auth/")) return request.continue();
      writes.push({ method, path: url.split("/api/v1")[1] || url, body: request.postData() || "" });
      evidence.writes_intercepted.push({ method, path: url.split("/api/v1")[1] || url, body: request.postData() || "" });
      if (/\/sales\/orders$/.test(url)) return json({ number: "PRUEBA-VISUAL-0001" });
      if (/\/commercial-management\/visits\/check-availability$/.test(url)) return json({ available: true });
      if (/\/commercial-management\/visits$/.test(url)) return json({ id: 999999 });
      return json({});
    }
    return request.continue();
  });
  page.on("console", (message) => {
    if (message.type() === "error") evidence.console_errors.push(`${message.text()}`.slice(0, 300));
  });
  page.on("pageerror", (error) => evidence.console_errors.push(`pageerror: ${error.message}`.slice(0, 300)));
  evidence.http_errors = [];
  page.on("response", (response) => {
    if (response.status() < 400 || response.url().endsWith("/favicon.ico")) return;
    evidence.http_errors.push(`${response.status()} ${response.request().method()} ${response.url().split("/api/v1")[1] || response.url()}`);
  });

  async function login() {
    for (let attempt = 1; attempt <= 4; attempt++) {
      await page.goto(`${webBase}/login`, { waitUntil: "domcontentloaded" }).catch(() => {});
      await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); }).catch(() => {});
      await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
      if (!(await waitFor(page, () => Boolean(document.querySelector('input[name="email"]')), 30000))) continue;
      await page.type('input[name="email"]', process.env.LOCAL_TMS_EMAIL || "demo@apex.local");
      await page.type('input[name="password"]', process.env.LOCAL_TMS_PASSWORD || "test1234");
      await page.click('button[type="submit"]');
      const left = await waitFor(page, () => location.pathname !== "/login", 40000);
      const shell = await waitFor(page, () => Boolean(document.querySelector("aside")), 45000);
      if (left && shell) return true;
    }
    return false;
  }

  async function gotoRoute(route) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      await page.goto(`${webBase}${route}`, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
      await waitFor(page, () => {
        const text = document.body.innerText;
        return !text.includes("Validando perfil de acceso") && !text.includes("Validando permisos");
      }, 30000);
      // El guard resuelve permisos tras hidratar y su contexto de rol tiene un tiempo propio;
      // una navegacion demasiado seguida puede leer el estado intermedio como denegado.
      await sleep(attempt === 1 ? 1200 : 2500);
      if (!(await page.evaluate(() => document.body.innerText.includes("Acceso no autorizado")))) break;
    }
    await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {});
  }

  async function metrics() {
    return page.evaluate(() => {
      const text = document.body.innerText;
      return {
        path: location.pathname,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        visibleSelects: document.querySelectorAll("select:not(.sr-only)").length,
        comboboxes: document.querySelectorAll('input[role="combobox"]').length,
        formSelects: document.querySelectorAll("main form select:not(.sr-only)").length,
        formComboboxes: document.querySelectorAll('main form input[role="combobox"]').length,
        h1: (document.querySelector("h1") || {}).innerText || "",
        denied: text.includes("Acceso no autorizado"),
        broken: text.includes("Algo salió mal") || text.includes("Application error") || text.includes("Validando perfil de acceso") || text.includes("Validando permisos")
      };
    });
  }

  async function shot(name) {
    const file = path.join(evidenceDir, `${label}-${name}.png`);
    await page.screenshot({ path: file, fullPage: false });
    evidence.screenshots.push(path.relative(root, file).replace(/\\/g, "/"));
  }

  async function setTheme(theme) {
    await page.evaluate((dark) => { document.documentElement.classList.toggle("dark", dark); localStorage.setItem("apex_theme", dark ? "dark" : "light"); }, theme === "dark");
  }

  async function pick(index, filter) {
    const inputs = await page.$$('input[role="combobox"]');
    assert.ok(inputs[index], `combobox ${index} is missing`);
    await inputs[index].click();
    await sleep(250);
    if (filter) await page.keyboard.type(filter, { delay: 25 });
    await sleep(400);
    const opened = await page.evaluate(() => Boolean(document.querySelector('[role="listbox"]')));
    const options = await page.evaluate(() => [...document.querySelectorAll('[role="option"]')].map((node) => node.textContent.trim()));
    await page.keyboard.press("Enter");
    await sleep(350);
    return { opened, options };
  }

  try {
    check("login por la interfaz real", await login(), { webBase });
    await sleep(2500);

    for (const width of [1440, 980]) {
      for (const [name, route, access] of HUBS) {
        await page.setViewport({ width, height: 960, deviceScaleFactor: 1 });
        await setTheme("light");
        await gotoRoute(route);
        const state = await metrics();
        const coherent = access === "allowed"
          ? !state.denied && state.h1.trim().length > 0
          : state.denied ? state.h1.includes("Acceso no autorizado") : state.h1.trim().length > 0;
        check(`${name} ${width} acceso coherente (${access})`, coherent, state);
        check(`${name} ${width} sin desbordamiento`, state.overflow <= 0, state);
        check(`${name} ${width} sin pantalla rota`, !state.broken, state);
        await shot(`${name}-desktop-${width}`);
      }
    }

    // Nueva orden de venta: dos SearchSelect sobre el contrato real del select nativo.
    await page.setViewport({ width: 1440, height: 960, deviceScaleFactor: 1 });
    await setTheme("light");
    await gotoRoute("/dashboard/ventas/ordenes/nueva");
    let state = await metrics();
    check("nueva-ov sin select nativo visible en el formulario", state.formSelects === 0, state);
    check("nueva-ov expone dos combobox", state.formComboboxes === 2, state);
    const customer = await pick(0, "PRUEBA");
    check("nueva-ov abre listbox de clientes", customer.opened && customer.options.some((text) => text.includes("PRUEBA HOMOLOGACION")), customer);
    const afterCustomer = await page.evaluate(() => [...document.querySelectorAll("select.sr-only")].map((node) => node.value));
    check("nueva-ov escribe el valor en el select nativo", afterCustomer[0] === "987654", afterCustomer);
    const item = await pick(1, "RAW");
    check("nueva-ov abre listbox de productos del API real", item.opened && item.options.some((text) => text.includes("RAW")), item);
    await shot("nueva-ov-desktop-1440");
    writes.length = 0;
    await page.click('button[type="submit"]');
    await sleep(1500);
    const order = writes.find((entry) => /\/sales\/orders$/.test(entry.path));
    check("nueva-ov publica la orden", Boolean(order), writes);
    const body = JSON.parse(order.body);
    check("nueva-ov conserva el contrato del payload", ["customer_id", "lines"].every((key) => key in body) && body.lines.length === 1
      && ["item_id", "qty", "unit_price"].every((key) => key in body.lines[0]), body);
    evidence.payloads.sales_order = body;

    await setTheme("dark");
    await gotoRoute("/dashboard/ventas/ordenes/nueva");
    state = await metrics();
    check("nueva-ov tema oscuro sin desbordamiento", state.overflow <= 0 && !state.broken, state);
    await shot("nueva-ov-dark-1440");

    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    await setTheme("light");
    await gotoRoute("/dashboard/ventas/ordenes/nueva");
    state = await metrics();
    check("nueva-ov movil sin desbordamiento", state.overflow <= 0 && !state.broken && state.formSelects === 0, state);
    await shot("nueva-ov-mobile-390");

    // Escenario negativo: maestros vacios no rompen la pantalla ni disparan escrituras.
    mode = "empty-masters";
    await page.setViewport({ width: 1440, height: 960, deviceScaleFactor: 1 });
    await gotoRoute("/dashboard/ventas/ordenes/nueva");
    const empty = await pick(0, "");
    check("nueva-ov sin clientes solo ofrece el marcador vacio", empty.opened
      && empty.options.length <= 1 && !empty.options.some((text) => text.includes("PRUEBA")), empty);
    writes.length = 0;
    await page.evaluate(() => document.querySelector('button[type="submit"]')?.click());
    await sleep(1200);
    const blocked = await page.evaluate(() => ({
      disabled: Boolean(document.querySelector('button[type="submit"]')?.disabled),
      alert: [...document.querySelectorAll('[role="alert"]')].map((node) => node.textContent.trim())
    }));
    check("nueva-ov sin clientes no escribe la orden", writes.length === 0 && (blocked.disabled || blocked.alert.length > 0), { writes, blocked });
    await shot("nueva-ov-empty-masters-1440");
    mode = "real";

    // Agendar visita: un SearchSelect dentro del dialogo del flujo real.
    await gotoRoute("/dashboard/gestion-comercial/agenda?crear=1");
    await waitFor(page, () => Boolean(document.querySelector('[role="dialog"]')), 20000);
    await sleep(900);
    const dialog = await page.$('[role="dialog"]');
    check("agendar-visita abre el dialogo", Boolean(dialog), null);
    const dialogState = await dialog.evaluate((node) => ({
      comboboxes: node.querySelectorAll('input[role="combobox"]').length,
      visibleSelects: node.querySelectorAll("select:not(.sr-only)").length
    }));
    check("agendar-visita usa SearchSelect sin select nativo", dialogState.comboboxes >= 1 && dialogState.visibleSelects === 0, dialogState);
    const input = await dialog.$('input[role="combobox"]');
    await input.click();
    await sleep(300);
    await page.keyboard.type("PRUEBA", { delay: 25 });
    await sleep(400);
    const visitOptions = await page.evaluate(() => [...document.querySelectorAll('[role="option"]')].map((node) => node.textContent.trim()));
    check("agendar-visita lista clientes controlados", visitOptions.some((text) => text.includes("PRUEBA HOMOLOGACION")), visitOptions);
    await page.keyboard.press("Enter");
    await sleep(600);
    await shot("agendar-visita-modal-1440");

    // Nuevo producto: el arreglo de esta ronda es de textos y densidad, no de selector.
    await gotoRoute("/dashboard/inventario/productos/nuevo");
    state = await metrics();
    check("nuevo-producto sin pantalla rota", !state.broken, state);
    await shot("nuevo-producto-desktop-1440");
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    await gotoRoute("/dashboard/inventario/productos/nuevo");
    state = await metrics();
    check("nuevo-producto movil sin desbordamiento", state.overflow <= 0 && !state.broken, state);
    await shot("nuevo-producto-mobile-390");

    check("consola sin errores", evidence.console_errors.length === 0, evidence.console_errors.slice(0, 10));
    evidence.status = "passed";
  } catch (error) {
    evidence.status = "failed";
    evidence.error = error instanceof Error ? error.message : String(error);
    throw error;
  } finally {
    evidence.finished_at = new Date().toISOString();
    evidence.writes_observed = evidence.writes_intercepted;
    fs.writeFileSync(path.join(evidenceDir, `${label}-certification.json`), JSON.stringify(evidence, null, 2));
    await browser.close().catch(() => {});
  }
}

main()
  .then(() => {
    const passed = evidence.checks.filter((item) => item.status === "passed").length;
    console.log(JSON.stringify({ status: evidence.status, commit, checks: evidence.checks.length, passed, evidence: path.relative(root, evidenceDir) }));
  })
  .catch((error) => {
    console.error(evidence.status, error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
