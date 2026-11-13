// Humo remoto de la capa visual homologada sobre el build desplegado en QA.
// Solo lectura: inicia sesión real, recorre los hubs y abre el formulario de Nueva
// orden de venta sin enviarlo. No crea, modifica ni envía datos en la base de QA.
//
// Uso:
//   node scripts/certifications/visual-homologation-qa-smoke.cjs
//
// Variables opcionales: QA_SMOKE_EMAIL, QA_SMOKE_PASSWORD, QA_SMOKE_EVIDENCE_DIR,
// QA_WEB_URL, QA_API_URL, QA_EXPECTED_API_COMMIT.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const puppeteer = require("puppeteer-core");

const root = path.resolve(__dirname, "../..");
const webBase = String(process.env.QA_WEB_URL || "https://apexos-web-qa-production.up.railway.app").replace(/\/$/, "");
const apiBase = String(process.env.QA_API_URL || "https://apexos-api-qa-production.up.railway.app").replace(/\/$/, "");
const expectedApiCommit = String(process.env.QA_EXPECTED_API_COMMIT || "6589af8e").toLowerCase();
const email = process.env.QA_SMOKE_EMAIL || "demo@apex.local";
const password = process.env.QA_SMOKE_PASSWORD || "test1234";
const evidenceDir = path.resolve(
  process.env.QA_SMOKE_EVIDENCE_DIR || path.join(root, "docs/qa/evidence/capa-visual-completa-qa-20261113")
);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// El tenant demo de QA tiene M-01..M-26: Gestión Comercial (M-27), Comercio (M-30),
// Reportes (apex_heart) y Gastos Menores (M-29) quedan denegados por licenciamiento.
// La denegación canónica se registra, no se cuenta como fallo de esta intervención.
const ALLOWED_HUBS = [
  ["inventario", "/dashboard/inventario"],
  ["compras", "/dashboard/compras"],
  ["ventas", "/dashboard/ventas"],
  ["contabilidad", "/dashboard/contabilidad"],
  ["transporte", "/dashboard/transporte"],
  ["talento-humano", "/dashboard/talento-humano"],
  ["servicios", "/dashboard/servicios"],
  ["administracion", "/dashboard/administracion"]
];
const DENIED_HUBS = [
  ["gestion-comercial", "/dashboard/gestion-comercial", "M-27"],
  ["comercio", "/dashboard/comercio", "M-30"],
  ["reportes", "/dashboard/reportes", "apex_heart"],
  ["gastos-menores", "/dashboard/gastos-menores", "M-29"]
];
const SHOT_HUBS = new Set(["inventario", "ventas", "servicios"]);
// Curaduría del portafolio: estos slugs salieron de la oferta del lobby. Si
// reaparecen como tarjeta, el despliegue no trae la capa visual completa.
const RETIRED_SLUGS = [
  "punto-de-venta", "costos", "presupuestos", "produccion", "recetas", "calidad",
  "devoluciones", "comercio-exterior", "activos", "crm", "planeacion-demanda",
  "facturacion", "facturacion-electronica", "configuracion-inicial", "suscripciones",
  "tesoreria", "proyectos", "apex-control", "apex-ai", "cxc"
];

function browserPath() {
  for (const candidate of [
    process.env.CHROME_PATH,
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Google/Chrome/Application/chrome.exe"
  ]) if (candidate && fs.existsSync(candidate)) return candidate;
  throw new Error("No local Chromium browser found");
}

const evidence = {
  environment: "QA",
  status: "running",
  web_base: webBase,
  api_base: apiBase,
  started_at: new Date().toISOString(),
  checks: [],
  hubs: { allowed: {}, denied: {} },
  form: {},
  console_errors: [],
  http_errors: [],
  known_console_noise: [],
  screenshots: []
};

function check(name, passed, detail) {
  evidence.checks.push({ name, status: passed ? "passed" : "failed", detail });
  assert.ok(passed, `${name}: ${JSON.stringify(detail)}`);
}

async function main() {
  fs.mkdirSync(evidenceDir, { recursive: true });

  const healthResponse = await fetch(`${apiBase}/health`);
  const health = await healthResponse.json();
  check("api-health-200", healthResponse.status === 200, { status: healthResponse.status });
  check("api-commit-intacto", String(health.commit || "").toLowerCase().startsWith(expectedApiCommit), health.commit);

  const loginPage = await fetch(`${webBase}/login`);
  check("web-login-200", loginPage.status === 200, { status: loginPage.status });

  const browser = await puppeteer.launch({
    executablePath: browserPath(),
    headless: "new",
    args: ["--no-sandbox", "--disable-gpu"]
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 960 });

  let phase = "login";
  // Ruido preexistente del entorno QA, ajeno a la capa visual: el login intenta
  // Supabase primero (el usuario demo se autentica por API y ese intento devuelve
  // 400) y el sitio no publica /favicon.ico. Se registra aparte, no se silencia.
  const knownNoise = (entry, url) =>
    /favicon\.ico/i.test(String(url || "")) ||
    (entry.phase === "login" && /supabase\.co\/auth\/v1\/token/i.test(String(url || "")));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const entry = { phase, text: message.text(), location: message.location() };
    if (knownNoise(entry, message.location()?.url)) { evidence.known_console_noise.push(entry); return; }
    evidence.console_errors.push(entry);
  });
  page.on("pageerror", (error) => evidence.console_errors.push({ phase, text: String(error) }));
  page.on("response", (response) => {
    const status = response.status();
    if (status < 400) return;
    const url = response.url();
    const entry = { phase, status, url };
    if (knownNoise(entry, url)) { evidence.known_console_noise.push(entry); return; }
    evidence.http_errors.push(entry);
  });

  try {
    await page.goto(`${webBase}/login`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForSelector('input[placeholder="nombre@empresa.com"]', { timeout: 30000 });
    await page.type('input[placeholder="nombre@empresa.com"]', email, { delay: 20 });
    await page.type('input[placeholder="Ingresa tu contraseña"]', password, { delay: 20 });
    await Promise.all([
      page.waitForFunction(() => location.pathname.startsWith("/dashboard"), { timeout: 45000 }),
      page.click('button[type="submit"]')
    ]);
    phase = "lobby";
    await page.waitForFunction(() => Boolean(document.querySelector("h1")), { timeout: 30000 });
    const lobby = await page.evaluate(() => ({
      path: location.pathname,
      h1: document.querySelector("h1")?.textContent?.trim() || "",
      overflow: document.documentElement.scrollWidth - window.innerWidth
    }));
    evidence.hubs.allowed.lobby = lobby;
    check("login-real-y-lobby", lobby.path.startsWith("/dashboard") && lobby.h1.length > 0, lobby);
    await page.screenshot({ path: path.join(evidenceDir, "qa-lobby.png") });
    evidence.screenshots.push("qa-lobby.png");

    // Lobby V4: hero con la constelación cargada, tarjetas curadas con su glifo,
    // ninguna tarjeta retirada y sin el asistente flotante.
    await page.waitForFunction(() => {
      const img = document.querySelector(".apex-lobby-hero img");
      return Boolean(img && img.complete && img.naturalWidth > 0);
    }, { timeout: 30000 });
    const v4 = await page.evaluate(() => {
      const tiles = [...document.querySelectorAll(".apex-lobby-tile")];
      const hero = document.querySelector(".apex-lobby-hero img");
      return {
        tiles: tiles.length,
        glyphs: tiles.filter((tile) => tile.querySelector(".apex-lobby-tile-glyph")).length,
        hrefs: tiles.map((tile) => tile.getAttribute("href") || ""),
        heroSrc: hero ? `${hero.currentSrc || hero.getAttribute("src") || ""}` : "",
        heroLoaded: Boolean(hero && hero.complete && hero.naturalWidth > 0),
        assistantMascots: document.querySelectorAll(".apex-ai-mascot").length,
        assistantText: /\bAPEX AI\b/i.test(document.body.innerText || "")
      };
    });
    evidence.lobby_v4 = v4;
    check("lobby-v4-tarjetas-curadas", v4.tiles > 0 && v4.tiles <= 12, { tiles: v4.tiles });
    check("lobby-v4-un-glifo-por-tarjeta", v4.glyphs === v4.tiles, { glyphs: v4.glyphs, tiles: v4.tiles });
    check("lobby-v4-sin-retirados", v4.hrefs.every((href) => !RETIRED_SLUGS.some((slug) => href.includes(`/${slug}`))), v4.hrefs);
    check("lobby-v4-hero-cargado", v4.heroLoaded, { src: v4.heroSrc });
    check("lobby-v4-sin-asistente", v4.assistantMascots === 0 && !v4.assistantText, { mascots: v4.assistantMascots });

    // Tema oscuro: los tokens deben remapear la superficie de la tarjeta sin recargar.
    // El tema del navegador puede venir oscuro; se miden ambos estados y se restaura.
    const darkTheme = await page.evaluate(async () => {
      const root = document.documentElement;
      const tile = document.querySelector(".apex-lobby-tile");
      const frame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const hadDark = root.classList.contains("dark");
      root.classList.remove("dark");
      await frame();
      const withoutDark = tile ? getComputedStyle(tile).backgroundColor : "";
      root.classList.add("dark");
      await frame();
      const withDark = tile ? getComputedStyle(tile).backgroundColor : "";
      if (!hadDark) root.classList.remove("dark");
      return { withoutDark, withDark, startedInDark: hadDark };
    });
    evidence.lobby_v4_dark = darkTheme;
    check(
      "lobby-v4-tokens-oscuro",
      Boolean(darkTheme.withoutDark) && darkTheme.withoutDark !== darkTheme.withDark,
      darkTheme
    );

    for (const [name, route] of ALLOWED_HUBS) {
      phase = name;
      const response = await page.goto(`${webBase}${route}`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForFunction(() => Boolean(document.querySelector("h1")), { timeout: 45000 }).catch(() => {});
      const state = await page.evaluate(() => ({
        path: location.pathname,
        h1: document.querySelector("h1")?.textContent?.trim() || "",
        text: (document.body.innerText || "").slice(0, 400),
        overflow: document.documentElement.scrollWidth - window.innerWidth
      }));
      const status = response ? response.status() : 0;
      evidence.hubs.allowed[name] = { ...state, status };
      check(`hub-${name}`, status === 200 && state.h1.length > 0 && state.overflow <= 1, { status, ...state });
      if (SHOT_HUBS.has(name)) {
        await page.screenshot({ path: path.join(evidenceDir, `qa-${name}.png`) });
        evidence.screenshots.push(`qa-${name}.png`);
      }
    }

    for (const [name, route, moduleCode] of DENIED_HUBS) {
      phase = name;
      await page.goto(`${webBase}${route}`, { waitUntil: "domcontentloaded", timeout: 60000 });
      // La verificación de licencias es asíncrona: se espera a que el guard salga de
      // "checking" (h1 de denegación, redirección o contenido propio) antes de medir.
      await page.waitForFunction(
        (expected) =>
          location.pathname !== expected ||
          Boolean(document.querySelector("h1")) ||
          /acceso no autorizado|no tienes acceso|sin acceso/i.test(document.body.innerText || ""),
        { timeout: 30000 },
        route
      ).catch(() => {});
      const state = await page.evaluate(() => ({
        path: location.pathname,
        h1: document.querySelector("h1")?.textContent?.trim() || "",
        text: (document.body.innerText || "").slice(0, 400),
        checking: /validando permisos/i.test(document.body.innerText || "") && !document.querySelector("h1"),
        errorBoundary: /application error|unhandled runtime error/i.test(document.body.innerText || "")
      }));
      evidence.hubs.denied[name] = { ...state, module_code: moduleCode };
      check(`denegado-${name}-sin-error`, !state.errorBoundary && !state.checking, state);
    }

    phase = "nueva-orden";
    await page.goto(`${webBase}/dashboard/ventas/ordenes/nueva`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForSelector('[role="combobox"]', { timeout: 45000 });
    const form = await page.evaluate(() => {
      // La barra lateral conserva un select nativo de idioma; la medición de la
      // primitiva se acota al formulario para no confundirlo con ese control.
      const formEl = document.querySelector("form");
      const combobox = formEl?.querySelector('[role="combobox"]');
      const native = formEl?.querySelector('select[aria-hidden="true"]');
      return {
        path: location.pathname,
        h1: document.querySelector("h1")?.textContent?.trim() || "",
        comboboxes: formEl ? formEl.querySelectorAll('[role="combobox"]').length : 0,
        hiddenSelects: formEl ? formEl.querySelectorAll('select[aria-hidden="true"]').length : 0,
        visibleNativeSelects: formEl ? [...formEl.querySelectorAll("select")].filter((node) => {
          const style = getComputedStyle(node);
          return node.getAttribute("aria-hidden") !== "true" && style.display !== "none" && style.visibility !== "hidden";
        }).length : -1,
        overflow: document.documentElement.scrollWidth - window.innerWidth,
        comboboxLabel: combobox?.getAttribute("aria-label") || combobox?.getAttribute("placeholder") || ""
      };
    });
    evidence.form = form;
    check("nueva-orden-primitiva", form.comboboxes >= 2 && form.hiddenSelects >= 2, form);
    check("nueva-orden-sin-native-visible", form.visibleNativeSelects === 0, { visible: form.visibleNativeSelects });

    await page.click('[role="combobox"]');
    await page.waitForFunction(() => Boolean(document.querySelector('[role="listbox"]')), { timeout: 15000 });
    const listbox = await page.evaluate(() => ({
      options: document.querySelectorAll('[role="option"]').length,
      status: document.querySelector('[role="listbox"] [role="status"]')?.textContent?.trim() || ""
    }));
    evidence.form.listbox = listbox;
    check("listbox-abre", listbox.options > 0 || listbox.status.length > 0, listbox);
    await page.keyboard.type("a", { delay: 40 });
    await sleep(500);
    const typed = await page.evaluate(() => document.querySelector('[role="combobox"]')?.value || "");
    check("listbox-filtra", typed.length >= 1, { typed });
    await page.keyboard.press("Escape");
    await sleep(400);
    const closed = await page.evaluate(() => !document.querySelector('[role="listbox"]'));
    check("escape-cierra", closed, { closed });
    await page.screenshot({ path: path.join(evidenceDir, "qa-nueva-orden.png") });
    evidence.screenshots.push("qa-nueva-orden.png");

    const deniedPhases = new Set(DENIED_HUBS.map(([name]) => name));
    const relevantConsole = evidence.console_errors.filter((item) => !deniedPhases.has(item.phase));
    check("consola-sin-errores", relevantConsole.length === 0, relevantConsole);
    const relevantHttp = evidence.http_errors.filter((item) => !deniedPhases.has(item.phase));
    check("red-sin-errores", relevantHttp.length === 0, relevantHttp);

    evidence.status = "passed";
  } catch (error) {
    evidence.status = "failed";
    evidence.error = String(error && error.stack ? error.stack : error);
    throw error;
  } finally {
    evidence.finished_at = new Date().toISOString();
    await browser.close();
    fs.writeFileSync(path.join(evidenceDir, "smoke.json"), `${JSON.stringify(evidence, null, 2)}\n`);
  }

  console.log(`SMOKE QA VALIDO: ${evidence.checks.length} verificaciones, ${evidence.screenshots.length} capturas`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
