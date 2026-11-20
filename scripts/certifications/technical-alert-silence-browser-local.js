// Certificacion LOCAL en navegador real: un fallo de la API no es una ventana para el cliente.
//
// Que queda probado aqui y no antes: la plataforma convertia cualquier 5xx, 429 o corte de red en
// una tarjeta flotante ("Fallo tecnico detectado") con la ruta, el codigo de estado y el detalle
// crudo del servidor. Un operario con la pantalla de horarios abierta veia la tarjeta volver cada
// pocos segundos hasta saturar la vista. Desde esta intervencion el fallo viaja a platform-logs y
// la pantalla muestra el estado real de sus datos; la tarjeta solo existe si soporte enciende el
// modo diagnostico en ese navegador.
//
// El estado se fabrica en la capa de red (peticion interceptada), no simulando componentes: es la
// unica forma de que la comprobacion pueda ponerse roja. No se levanta API ni base de datos; el
// origen quemado en el build (127.0.0.1:3000) esta deliberadamente apagado y ninguna peticion
// escapa del navegador.
//
// Chequeos:
//  A. tormenta 500 en rutas, mapa, servicios, monitoreo y home: cero tarjetas flotantes.
//  B. el texto tecnico (ruta, "Estado: 500", ERROR_INTERNO, JSON crudo) no aparece en pantalla.
//  C. cada fallo si queda registrado: el cliente POSTea platform-logs (el registro existe, la ventana no).
//  D. corte total de red (abort): las pantallas siguen vivas y sin tarjetas.
//  E. 429 en cascada: sin tarjetas y sin saturacion.
//  F. sesion vencida (401): el aviso honesto esta en el login, no en una ventana.
//  G. control positivo: con apexos_diagnostics=1 el detalle tecnico si se muestra, con presupuesto maximo.
//  H. tema oscuro: la misma ausencia de ventanas.
//  J. validacion de formulario en Empleados: el motivo vive en el campo y ninguna ventanilla nativa
//     del navegador (alert/confirm) se levanto en toda la corrida. El registrador tiene control propio.
//  I. contrato de codigo: el canal de alertas de usuario sigue retirado y la pantalla de Empleados
//     no usa ninguna ventanilla nativa (alert, confirm ni prompt).
//
// Sale con codigo distinto de cero ante cualquier comprobacion fallida o parcial.

const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { spawn, execFileSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..", "..");
const WEB = path.join(ROOT, "apps", "web");
const PORT = Number(process.env.CERT_BROWSER_PORT || 3323);
// La evidencia es aditiva: una corrida nueva no puede sobrescribir la que ya citan los manifiestos de
// una promoción cerrada. Por defecto el artefacto histórico; CERT_ARTIFACT abre una carpeta nueva.
const ARTIFACT = process.env.CERT_ARTIFACT || "technical-alert-silence-20261118";
const OUT = path.join(ROOT, "docs", "qa", "evidence", ARTIFACT);
const keepOpen = process.argv.slice(2).includes("--keep-open");
const BASE = `http://127.0.0.1:${PORT}`;
const NAV_TIMEOUT = 90_000;
const EMPLEADOS_ROUTE = "/dashboard/talento-humano/empleados";
const EMPLEADOS_SOURCE = path.join(WEB, "app", "dashboard", "talento-humano", "empleados", "page.tsx");

// El contexto que el guard de rutas exige para montar la pantalla. Sin active_modules el guard pinta
// "Acceso no autorizado" y la certificacion mediria el guard, no la capa de alertas.
const SESSION_CONTEXT = {
  tenant: { id: "cert-silence-tenant", active_modules: ["talento_humano", "servicios", "transporte", "inventario", "compras", "ventas"] },
  user: {
    role: "APEX_ADMIN",
    role_metadata: { role_type: "admin", role_scope: "company" },
    role_permissions: [
      { module: "hr", action: "read" }, { module: "hr", action: "write" },
      { module: "services", action: "read" }, { module: "transport", action: "read" },
      { module: "inventory", action: "read" }
    ]
  }
};

const SERVER_ERROR = { error: "Error interno del servidor", code: "ERROR_INTERNO", request_id: "cert-silence-500" };

const SCENARIOS = {
  tormenta_500: { kind: "status", status: 500, body: SERVER_ERROR },
  tormenta_429: { kind: "status", status: 429, body: { error: "Demasiadas solicitudes en un minuto", code: "RATE_LIMIT_EXCEEDED", request_id: "cert-silence-429" } },
  red_cortada: { kind: "abort" },
  sesion_vencida: { kind: "status", status: 500, body: SERVER_ERROR }
};

// Los marcadores son el texto real que la sonda dejo pintado con la tormenta puesta. Un marcador
// inventado haria que "pantalla_sigue_viva" midiera el cascaron del shell y no la pantalla.
const SCREENS = [
  // Las cabeceras de rutas no son las mismas en las tres ramas: `desarrollo`/`main` dicen
  // "Asignar horarios" / "Consulta de horarios" y `develop` dice "Horarios y mallas" /
  // "Programación de jornadas" (page.tsx:1100 y :1119, medido el 2026-11-19 en cada arbol). El
  // marcador tiene que discriminar "la pantalla se monto" de "cayo al guard o al cascaron del
  // shell", no que version del arbol esta servida: se aceptan las cuatro leyendas.
  { name: "rutas", route: "/dashboard/talento-humano/rutas", mounted: ["Asignar horarios", "Consulta de horarios", "Horarios y mallas", "Programación de jornadas"] },
  { name: "mapa", route: "/dashboard/talento-humano/mapa", mounted: ["Mapa en vivo de rutas y marcaciones", "CONTROL OPERATIVO GPS"] },
  { name: "servicios", route: "/dashboard/servicios", mounted: ["CENTRO OPERATIVO DE SERVICIOS", "Órdenes listas para gestionar"] },
  { name: "monitoreo", route: "/dashboard/transporte/monitoreo", mounted: ["Monitoreo en vivo", "Cargando monitoreo TMS"] },
  // El lobby se arma con maestros ya en almacenamiento local: no le toca peticion, asi que su
  // autocontrol de tormenta no puede exigirsela.
  { name: "home", route: "/dashboard", static: true, mounted: ["Mis módulos", "Acciones frecuentes"] }
];

// El vocabulario tecnico que antes llegaba a la vista. Ninguna de estas cadenas puede aparecer en
// el texto pintado cuando el modo diagnostico esta apagado (el estado por defecto de un cliente).
const TECHNICAL_MARKERS = [
  "Fallo tecnico detectado",
  "Fallo técnico detectado",
  "Operacion interrumpida",
  "Operación interrumpida",
  "Se detecto un fallo",
  "Se detectó un fallo",
  "Ruta: /api/v1",
  "Estado: 500",
  "Estado: 429",
  "ERROR_INTERNO",
  "RATE_LIMIT_EXCEEDED",
  '"error":',
  "request_id",
  "platform-logs",
  "Failed to fetch",
  "API no disponible"
];

const RESUL = {
  format: "apexos-technical-alert-silence-v1",
  started_at: new Date().toISOString(),
  base: BASE,
  artifact: ARTIFACT,
  scenarios: {},
  checks: []
};

function check(name, ok, payload = {}) {
  RESUL.checks.push({ name, ok: Boolean(ok), ...(Object.keys(payload).length ? { payload } : {}) });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${Object.keys(payload).length ? ` ${JSON.stringify(payload)}` : ""}`);
  if (!ok) throw new Error(`Check fallido: ${name}`);
}

function writeEvidence() {
  fs.mkdirSync(OUT, { recursive: true });
  RESUL.verdict = {
    passed: RESUL.checks.filter((item) => item.ok).length,
    failed: RESUL.checks.filter((item) => !item.ok).length,
    total: RESUL.checks.length
  };
  RESUL.finished_at = new Date().toISOString();
  fs.writeFileSync(path.join(OUT, "certification.json"), JSON.stringify(RESUL, null, 2));
}

async function main() {
  if (!fs.existsSync(path.join(WEB, ".next", "BUILD_ID"))) {
    throw new Error("PREREQUITO: apps/web/.next/BUILD_ID no existe. Ejecuta `npm run build` en apps/web antes que `next start`.");
  }
  RESUL.frontend_served_by = "next start (produccion)";
  RESUL.build_id = fs.readFileSync(path.join(WEB, ".next", "BUILD_ID"), "utf8").trim();
  fs.mkdirSync(OUT, { recursive: true });
  const logHandle = fs.openSync(path.join(OUT, "next-start.log"), "w");
  const web = spawn(process.execPath, [path.join(ROOT, "node_modules", "next", "dist", "bin", "next"), "start", "-p", String(PORT), "-H", "127.0.0.1"], {
    cwd: WEB,
    windowsHide: true,
    stdio: ["ignore", logHandle, logHandle],
    env: { ...process.env, NODE_ENV: "production" }
  });

  let browser;
  let scenario = "tormenta_500";
  const seen = { telemetry: [], failed: [], aborted: [] };
  try {
    const deadline = Date.now() + 120_000;
    for (;;) {
      try { if ((await fetch(`${BASE}/login`, { signal: AbortSignal.timeout(3000) })).status < 500) break; } catch {}
      if (Date.now() > deadline) throw new Error("El frontend de produccion no levanto en 120 s");
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    const puppeteer = require("puppeteer-core");
    const executablePath = [
      "C:/Program Files/Google/Chrome/Application/chrome.exe",
      "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
      "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
    ].find((file) => fs.existsSync(file));
    assert.ok(executablePath, "no hay Chrome ni Edge instalados para certificar en navegador");
    browser = await puppeteer.launch({ executablePath, headless: true });
    const page = await browser.newPage();
    page.setDefaultTimeout(NAV_TIMEOUT);
    await page.setViewport({ width: 1366, height: 900 });
    await page.setBypassServiceWorker(true);

    await page.setRequestInterception(true);
    // La API vive en otro origen (127.0.0.1:3000 quemado en el build) igual que en QA y Produccion.
    // Responder sin cabeceras CORS mata cada llamada en el preflight y el navegador pinta el guard
    // de acceso: la certificacion mediria el arnes y no la pantalla. Con CORS abierto el cliente si
    // llega al servidor fabricado y la tormenta de 500 es real.
    const CORS_HEADERS = {
      "Access-Control-Allow-Origin": BASE,
      "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
      "Access-Control-Allow-Headers": "authorization, content-type, x-request-id, x-csrf-token",
      "Access-Control-Max-Age": "600"
    };
    const respond = (request, payload) => request.respond({
      status: payload.status,
      contentType: "application/json",
      body: payload.body,
      headers: { ...CORS_HEADERS, ...(payload.headers || {}) }
    });
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (url.hostname !== "127.0.0.1" && url.hostname !== "localhost") return void request.abort();
      const pathname = url.pathname;
      if (!pathname.startsWith("/api/v1/")) {
        if (request.method() === "OPTIONS") return void respond(request, { status: 204, body: "" });
        return void request.continue();
      }
      if (request.method() === "OPTIONS") {
        return void respond(request, {
          status: 204,
          body: "",
          headers: { "Access-Control-Allow-Headers": request.headers()["access-control-request-headers"] || CORS_HEADERS["Access-Control-Allow-Headers"] }
        });
      }
      // El endpoint de telemetria responde siempre 200: si el registro de fallos fallara, la
      // certificacion mediria el arnes y no la promesa ("el fallo se registra, no se muestra").
      // Cubre las dos bocas: la autenticada (admin) y la publica para visitantes sin sesion.
      if (pathname.startsWith("/api/v1/admin/platform-logs") || pathname.startsWith("/api/v1/public/telemetry")) {
        seen.telemetry.push(pathname);
        return void respond(request, { status: 200, body: "{}" });
      }
      if (pathname === "/api/v1/auth/me") {
        if (scenario === "sesion_vencida") {
          return void respond(request, { status: 401, body: JSON.stringify({ error: "Token invalido o expirado" }) });
        }
        return void respond(request, { status: 200, body: JSON.stringify(SESSION_CONTEXT) });
      }
      const rule = SCENARIOS[scenario] || SCENARIOS.tormenta_500;
      if (rule.kind === "abort") {
        seen.aborted.push(pathname);
        return void request.abort("failed");
      }
      seen.failed.push(`${url.origin}${pathname}`);
      return void respond(request, { status: rule.status, body: JSON.stringify(rule.body) });
    });

    const consoleErrors = [];
    page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(String((error && error.message) || error)));

    // Ventanilla nativa del navegador (alert/confirm/prompt). Sin oyente, Chrome headless la descarta
    // en silencio y "cero ventanas" lo daria igual un arnes roto: por eso el control positivo de abajo.
    // El prefijo ARNES: marca la ventanilla provocada a proposito por el propio arnes.
    const dialogs = [];
    page.on("dialog", async (dialog) => {
      dialogs.push({ type: dialog.type(), message: String(dialog.message() || "").slice(0, 300), at: new Date().toISOString() });
      await dialog.dismiss().catch(() => undefined);
    });
    const realDialogs = () => dialogs.filter((entry) => !/^ARNES:/.test(entry.message));

    async function prepare({ theme = "light", withDiagnostics = false } = {}) {
      await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT });
      await page.evaluate((flags) => {
        localStorage.setItem("token", "cert.silence.token");
        localStorage.setItem("refresh", "cert.silence.refresh");
        localStorage.setItem("auth_provider", "local");
        localStorage.setItem("user_email", "cert.silence@apex.local");
        localStorage.setItem("apex_last_activity", String(Date.now()));
        localStorage.setItem("apexos_company_id", "cert-silence-tenant");
        localStorage.setItem("apexos_company_name", "Empresa de certificacion");
        localStorage.setItem("role_name", "APEX_ADMIN");
        localStorage.setItem("apex_theme", flags.theme);
        if (flags.diagnostics) localStorage.setItem("apexos_diagnostics", "1");
        else localStorage.removeItem("apexos_diagnostics");
      }, { theme, diagnostics: withDiagnostics });
    }

    async function readSurface() {
      return page.evaluate(() => {
        const overlayCards = [...document.querySelectorAll(".platform-alert")];
        const inlineAlerts = [...document.querySelectorAll('[role="alert"]')]
          .filter((node) => !node.closest(".platform-alert"))
          .map((node) => (node.textContent || "").trim().slice(0, 240))
          .filter(Boolean);
        const visibleTechnical = [...document.querySelectorAll("body *")].some((node) => {
          const own = Array.from(node.childNodes).filter((child) => child.nodeType === 3).map((child) => child.textContent).join(" ");
          return /Fallo t[eé]cnico detectado|Ruta: \/api\/v1|ERROR_INTERNO|"error":/.test(own);
        });
        return {
          url: location.pathname,
          overlayCards: overlayCards.length,
          overlayText: overlayCards.map((node) => (node.textContent || "").trim().slice(0, 200)),
          inlineAlerts,
          invalidFields: document.querySelectorAll('[aria-invalid="true"]').length,
          bodyText: (document.body.innerText || "").slice(0, 6000),
          mainText: ((document.querySelector("main") || document.querySelector("[role=main]"))?.innerText || "").slice(0, 6000),
          visibleTechnical
        };
      });
    }

    // Pulsar por texto, no por selector fragil: el arnes tiene que seguir encontrando el boton aunque
    // cambie la clase. Devuelve false si el boton no estaba, y el chequeo que lo llama lo reporta.
    async function clickByText(needle) {
      return page.evaluate((text) => {
        const hit = [...document.querySelectorAll("button")].find((node) => {
          const label = (node.innerText || node.textContent || "").trim();
          return label.includes(text) && !node.disabled && node.getClientRects().length > 0;
        });
        if (!hit) return false;
        hit.click();
        return true;
      }, needle);
    }

    async function visit(definition, settleMs = 7000) {
      const before = { failed: seen.failed.length, aborted: seen.aborted.length, telemetry: seen.telemetry.length };
      await page.goto(`${BASE}${definition.route}`, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT });
      // Se espera el ciclo de carga completo: la tormenta anterior reponia la tarjeta cada pocos
      // segundos, asi que una instantanea inmediata no probaria la ausencia.
      await new Promise((resolve) => setTimeout(resolve, settleMs));
      const surface = await readSurface();
      // Diagnostico del marcador (solo con CERT_MARCADOR_DIAG=1): donde aparece cada leyenda, en el
      // area de contenido o en el cascaron. Sirve para probar que el marcador discrimina pantalla y
      // no menu lateral.
      if (process.env.CERT_MARCADOR_DIAG) {
        const leyendas = [...new Set(SCREENS.flatMap((entry) => entry.mounted))];
        const diag = { url: surface.url, pantalla: definition.name, main_presente: surface.mainText.length > 0, leyendas: {} };
        for (const leyenda of leyendas) {
          diag.leyendas[leyenda] = {
            en_main: surface.mainText.includes(leyenda),
            en_body: surface.bodyText.includes(leyenda)
          };
        }
        const diagFile = path.join(OUT, "marker-diag.json");
        const acumulado = fs.existsSync(diagFile) ? JSON.parse(fs.readFileSync(diagFile, "utf8")) : [];
        acumulado.push(diag);
        fs.writeFileSync(diagFile, JSON.stringify(acumulado, null, 2));
      }
      // Autocontrol del arnes: si la pantalla no llego a pedir datos, no se estaba certificando un
      // fallo sino un guard de acceso o una portada vacia. Sin tormenta real, la ausencia de ventanas
      // no prueba nada.
      const dataRequests = seen.failed.length - before.failed + seen.aborted.length - before.aborted;
      const telemetryPosts = seen.telemetry.length - before.telemetry;
      // El marcador se busca en el area de contenido, no en todo el documento: el menu lateral y la
      // paleta de comandos tambien conocen los nombres de las funciones, y una leyenda capturada alli
      // afirmaria "pantalla montada" sobre el puro cascaron del shell. Si el arbol no marca <main>,
      // se retrocede al texto completo y la Retroceso queda declarada en mountedEn.
      const aguja = surface.mainText.length ? surface.mainText : surface.bodyText;
      return {
        ...surface,
        dataRequests,
        telemetryPosts,
        denied: surface.bodyText.includes("Acceso no autorizado"),
        mounted: definition.mounted.some((marker) => aguja.includes(marker)),
        mountedEn: surface.mainText.length ? "main" : "body",
        // El lobby queda exento: es un directorio de modulos y funciones, asi que nombrar otra pantalla
        // en su contenido es su trabajo, no una fuga del cascaron.
        leyendasAjenas: definition.static === true ? [] : SCREENS.filter((otro) => otro.name !== definition.name)
          .flatMap((otro) => otro.mounted.map((marker) => ({ pantalla: otro.name, marker })))
          .filter(({ marker }) => aguja.includes(marker))
      };
    }

    function surfaceVerdict(surface) {
      return {
        overlayCards: surface.overlayCards,
        technical: surface.visibleTechnical,
        marker: TECHNICAL_MARKERS.find((token) => surface.bodyText.includes(token)) || ""
      };
    }

    // A + B: tormenta de 500 en las cinco pantallas, en los dos temas.
    for (const theme of ["light", "dark"]) {
      scenario = "tormenta_500";
      await prepare({ theme });
      const results = {};
      for (const definition of SCREENS) {
        const surface = await visit(definition);
        const verdict = surfaceVerdict(surface);
        results[definition.name] = { ...verdict, mounted: surface.mounted, montado_en: surface.mountedEn, leyendas_ajenas: surface.leyendasAjenas, dataRequests: surface.dataRequests, telemetryPosts: surface.telemetryPosts, overlayText: surface.overlayText };
        check(`${definition.name}_${theme}_arnes_con_tormenta_real`, surface.dataRequests > 0 || definition.static === true, { dataRequests: surface.dataRequests, url: surface.url });
        check(`${definition.name}_${theme}_sin_guard_de_acceso`, !surface.denied, { url: surface.url });
        check(`${definition.name}_${theme}_sin_tarjeta_flotante`, surface.overlayCards === 0, { overlayCards: surface.overlayCards, overlayText: surface.overlayText });
        check(`${definition.name}_${theme}_sin_detalle_tecnico`, !verdict.technical && !verdict.marker, { marker: verdict.marker });
        check(`${definition.name}_${theme}_pantalla_sigue_viva`, surface.mounted, { url: surface.url, montado_en: surface.mountedEn, snippet: surface.bodyText.slice(0, 200) });
        await page.screenshot({ path: path.join(OUT, `${theme}-${definition.name}-500.png`) }).catch(() => undefined);
      }
      // Control de contraste del marcador: las leyendas se toleran entre ramas ("Asignar horarios" en
      // desarrollo/main, "Horarios y mallas" en develop), asi que lo que hay que vigilar es que la
      // leyenda sea propia de la pantalla y no un eco del menu lateral o de la paleta de comandos.
      // Si en una pantalla aparece la leyenda de otra, el marcador ya no afirma que esa pantalla se
      // monto y la corrida se pone roja en lugar de dar un verde hueco.
      const cruzadas = Object.entries(results).filter(([, value]) => (value.leyendas_ajenas || []).length > 0);
      check(`${theme}_marcador_discrimina_pantalla_no_cascaron`, cruzadas.length === 0, {
        violaciones: cruzadas.map(([name, value]) => ({ pantalla: name, leyendas: value.leyendas_ajenas }))
      });
      RESUL.scenarios[`tormenta_500_${theme}`] = { screens: results, telemetry_posts: seen.telemetry.length };
    }

    // C. el registro existe: el mismo recorrido deja decenas de fallos reportados a platform-logs.
    check("los_fallos_quedan_en_platform_logs", seen.telemetry.length >= 3, { posts: seen.telemetry.length, rutas: seen.failed.filter((route) => route.includes("/hr/")).slice(0, 6) });

    // D. corte total de red (peticiones abortadas): sin senal la pantalla tampoco grita.
    scenario = "red_cortada";
    await prepare({ theme: "light" });
    const abortedResults = {};
    for (const definition of SCREENS.slice(0, 4)) {
      const surface = await visit(definition);
      const verdict = surfaceVerdict(surface);
      abortedResults[definition.name] = verdict;
      check(`${definition.name}_corte_de_red_sin_tarjeta`, surface.overlayCards === 0 && !verdict.technical && !verdict.marker, { ...verdict });
    }
    RESUL.scenarios.red_cortada = { screens: abortedResults, aborted_requests: seen.aborted.length };

    // E. 429: el limite por tenant castiga el reintento agresivo y antes encadenaba tarjetas.
    scenario = "tormenta_429";
    await prepare({ theme: "light" });
    const rateResults = {};
    for (const definition of SCREENS.slice(0, 4)) {
      const surface = await visit(definition);
      const verdict = surfaceVerdict(surface);
      rateResults[definition.name] = verdict;
      check(`${definition.name}_429_sin_tarjeta`, surface.overlayCards === 0 && !verdict.technical && !verdict.marker, { ...verdict });
    }
    RESUL.scenarios.tormenta_429 = { screens: rateResults };

    // F. sesion vencida: el cliente cae al login y alli ve el motivo en el propio formulario.
    scenario = "sesion_vencida";
    await prepare({ theme: "light" });
    await page.goto(`${BASE}/dashboard/talento-humano/rutas`, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT });
    await new Promise((resolve) => setTimeout(resolve, 9000));
    const sessionSurface = await readSurface();
    check("sesion_vencida_sin_tarjeta_flotante", sessionSurface.overlayCards === 0, { overlayCards: sessionSurface.overlayCards, url: sessionSurface.url });
    await page.screenshot({ path: path.join(OUT, "06-sesion-vencida.png") }).catch(() => undefined);

    // El aviso honesto que reemplaza a la ventana: clearSession ya guardaba el motivo y el login lo lee.
    await page.evaluate(() => localStorage.setItem("apex_session_end_reason", "idle_timeout"));
    await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT });
    await new Promise((resolve) => setTimeout(resolve, 3000));
    const noticeSurface = await readSurface();
    check("login_lee_el_motivo_del_cierre", /inactividad/.test(noticeSurface.bodyText), { snippet: noticeSurface.bodyText.slice(0, 300) });
    check("aviso_de_sesion_no_es_una_ventana", noticeSurface.overlayCards === 0, { overlayCards: noticeSurface.overlayCards });
    await page.screenshot({ path: path.join(OUT, "07-login-aviso-sesion.png") }).catch(() => undefined);

    // G. control positivo: soporte enciende el modo diagnostico y ahi si ve el detalle, con tope
    //    incluso cuando el fallo se repite ciclo tras ciclo. Se muestrea durante la ventana completa
    //    porque cada tarjeta se cierra sola a los 9 s: una instantanea final contaria ceres.
    scenario = "tormenta_500";
    await prepare({ theme: "light", withDiagnostics: true });
    await page.goto(`${BASE}${SCREENS[0].route}`, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT });
    const samples = [];
    for (let step = 0; step < 20; step += 1) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const sample = await readSurface();
      samples.push({ at: step * 2, cards: sample.overlayCards, text: sample.overlayText });
    }
    const peak = samples.reduce((best, sample) => (sample.cards > best.cards ? sample : best), samples[0]);
    RESUL.scenarios.diagnostico_activado = { peak_cards: peak.cards, peak_text: peak.text, samples };
    check("modo_diagnostico_sigue_mostrando_el_detalle", peak.cards >= 1, { peak_text: peak.text });
    check("modo_diagnostico_respeta_el_presupuesto", samples.every((sample) => sample.cards <= 5), { max: peak.cards });
    check("el_detalle_tecnico_vive_en_el_canal_de_soporte", peak.text.join(" ").includes("Ruta: /api/v1"), { peak_text: peak.text });
    await page.screenshot({ path: path.join(OUT, "08-modo-diagnostico.png") }).catch(() => undefined);

    // J. validacion de formulario. Antes, vaciar el alta de un empleado y pulsar "Crear empleado"
    //    encadenaba hasta cuatro ventanillas nativas del navegador: la misma interrupcion que se retiro
    //    para el fallo tecnico, pero en el camino feliz. El motivo tiene que estar en el propio campo.
    //    Se corre con la tormenta de 500 puesta: quien valida con la API caida tampoco ve ventanas.
    const controlAntes = dialogs.length;
    await page.evaluate(() => window.alert("ARNES: control de ventanillas nativas"));
    await new Promise((resolve) => setTimeout(resolve, 400));
    check("el_arnes_detecta_una_ventanilla_nativa",
      dialogs.length === controlAntes + 1 && /^ARNES:/.test(dialogs[dialogs.length - 1].message),
      { registradas: dialogs.length });

    scenario = "tormenta_500";
    await prepare({ theme: "light" });
    await page.goto(`${BASE}${EMPLEADOS_ROUTE}`, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT });
    await new Promise((resolve) => setTimeout(resolve, 7000));
    const ventanasRealesAntesDelFormulario = realDialogs().length;
    const trazasAntesDelFormulario = dialogs.length;
    const opened = await clickByText("Nuevo empleado");
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const submitted = await clickByText("Crear empleado");
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const formSurface = await readSurface();
    const formReasons = formSurface.inlineAlerts.join(" | ");
    RESUL.scenarios.validacion_empleados = {
      opened,
      submitted,
      inline_alerts: formSurface.inlineAlerts,
      invalid_fields: formSurface.invalidFields,
      overlay_cards: formSurface.overlayCards,
      dialogs: dialogs.slice(trazasAntesDelFormulario)
    };
    check("validacion_empleados_flujo_completo", opened && submitted && /Numero documento/.test(formSurface.bodyText), {
      opened, submitted, snippet: formSurface.bodyText.slice(0, 300)
    });
    check("validacion_empleados_motivo_en_el_campo",
      /documento es obligatorio/i.test(formReasons) && /nombres y apellidos/i.test(formReasons),
      { inline: formSurface.inlineAlerts });
    check("validacion_empleados_campo_marcado_como_invalido", formSurface.invalidFields >= 2, { invalidFields: formSurface.invalidFields });
    check("validacion_empleados_sin_ventanilla_nativa", realDialogs().length === ventanasRealesAntesDelFormulario, {
      dialogs: dialogs.slice(trazasAntesDelFormulario)
    });
    check("validacion_empleados_sin_tarjeta_flotante", formSurface.overlayCards === 0 && !formSurface.visibleTechnical, {
      overlayCards: formSurface.overlayCards
    });
    await page.screenshot({ path: path.join(OUT, "09-validacion-empleados.png") }).catch(() => undefined);

    // K. toda la carrera, del primer click al ultimo, sin una sola ventanilla del navegador.
    check("cero_ventanillas_nativas_en_toda_la_corrida", realDialogs().length === 0, { dialogs: realDialogs().slice(0, 5) });

    // I. contrato de codigo: el canal de ventana de usuario no puede volver por descuido.
    const apiSource = fs.readFileSync(path.join(WEB, "lib", "api.ts"), "utf8");
    const alertsModule = fs.readFileSync(path.join(WEB, "lib", "platformAlerts.ts"), "utf8");
    const alertShell = fs.readFileSync(path.join(WEB, "components", "system", "PlatformAlerts.tsx"), "utf8");
    check("api_no_dispara_la_alerta_de_usuario", !/emitAppAlert|notifyPlatform\(/.test(apiSource));
    check("el_canal_apex_alert_esta_retirado", !/apex:alert/.test(alertsModule) && !/"apex:alert"/.test(alertShell));
    check("la_ventana_queda_detras_del_modo_diagnostico", /technicalDiagnosticsEnabled\(\)/.test(alertShell));
    // El barrido de la pantalla es de las tres ventanillas, no solo de alerta: el cierre de vigencia
    // pedía la fecha con `prompt` y restablecer la huella preguntaba con `confirm`. Y el barrido se
    // auto-verifica contra un fixture que sí las contiene: sin ese contraste el regex puede salir
    // verde para siempre sin afirmar nada (lo que ya costó dos controles podridos en esta familia).
    const sweepDialogs = (source) => [...source.matchAll(/(?:\bwindow\.|\bglobalThis\.)(alert|confirm|prompt)\s*\(/g)].map((entry) => entry[1]);
    check("el_barrido_del_arnes_detecta_las_ventanillas_que_dice_detectar",
      sweepDialogs('window.confirm("x"); globalThis.prompt("y");').join(",") === "confirm,prompt");
    const empleadosVentanillas = sweepDialogs(fs.readFileSync(EMPLEADOS_SOURCE, "utf8"));
    check("la_pantalla_de_empleados_no_usa_ventanillas_de_alerta",
      empleadosVentanillas.length === 0, { encontradas: empleadosVentanillas });

    RESUL.runtime = {
      page_errors: pageErrors.slice(0, 12),
      console_errors: consoleErrors.slice(0, 20),
      failed_requests: [...new Set(seen.failed)].slice(0, 40),
      aborted_requests: [...new Set(seen.aborted)].slice(0, 40),
      native_dialogs: realDialogs().slice(0, 10),
      telemetry_posts: seen.telemetry.length
    };
    writeEvidence();
    console.log(`VEREDICTO ${RESUL.verdict.passed}/${RESUL.verdict.total} · evidencia en ${OUT}`);
    if (!keepOpen) { await browser.close(); browser = null; }
  } catch (error) {
    RESUL.status = "failed";
    RESUL.error = { message: error.message, checks: RESUL.checks };
    writeEvidence();
    throw error;
  } finally {
    if (browser) await browser.close().catch(() => undefined);
    if (process.platform === "win32" && web.pid && web.exitCode === null) {
      try { execFileSync("taskkill", ["/PID", String(web.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true }); } catch {}
    } else web.kill();
    fs.closeSync(logHandle);
  }
}

main().catch((error) => { console.error(`BLOQUEO: ${error.message}`); process.exitCode = 1; });
