// Certificacion LOCAL en navegador real: el boton «Descarga nuestra app» de la PANTALLA DE ACCESO
// lleva primero a la mini-guia y desde alli a la app movil.
//
// Que queda probado aqui y no antes: el acceso —la pantalla con la que un usuario de celular ya se
// cruza— ofrece "Descarga nuestra app" SIN sesion iniciada, y el boton NO es un enlace directo a la
// app ni un intento de entrar: abre primero una guia con los cuatro pasos de Chrome (tres puntos,
// Instalar app, crear acceso directo) y despues decide segun el aparato: en celular ofrece el enlace
// vivo a la app; en computador avisa que el servicio es exclusivo para celulares y entrega el enlace
// para llevarlo al telefono. El MANDAR AL PC DIRECTO A LA APP ERA EL DEFECTO: el servicio (repo
// aparte `AppApexos`) rechaza el escritorio y no deja instalar, asi que el boton lo llevaba a un
// callejon sin salida.
//
// El 2026-11-25 el dueno corrigio la montura: "lo pusiste en donde no era... va en el inicio de
// sesion, no cuando se inicia sesion". Por eso este arnes mide las DOS caras: que el acceso monte la
// banda sin credenciales y que el tablero, con session y modulos, NO la monte. La ausencia se certifya
// en el DOM servido, no en el fuente: borrar el import y dejar el texto viejo es el defecto inverso.
//
// El arnes mide en dos viewports distintos con su agente de navegador real, no simulando componentes:
// la deteccion lee navigator.userAgent, y esa es justamente la capa que puede fallar. No se levanta
// API ni base de datos: en el tablero el contexto de tenant se siembra en el almacenamiento del
// navegador y todas las peticiones /api/v1 las responde el propio arnes.
//
// Chequeos:
//  A. el acceso pinta sin sesion (control positivo de la pagina: formulario, correo y clave visibles,
//     token ausente del almacenamiento) y la banda aparece con los campos vacios.
//  B. la banda vive FUERA del formulario: el boton no es de envio, pulsarlo no manda el login a la API
//     y la URL sigue siendo /login.
//  C. el boton abre la guia: sin abrir, los marcadores de la guia NO estan en pantalla (control de
//     contraste: si el arnes viera la guia siempre, todo lo de abajo seria verde por ceguera).
//  D. movil: los cuatro pasos con su copy real, la salida de "ya instale", sin el aviso de escritorio,
//     y el enlace a la app con href exacto, target _blank y rel noopener.
//  E. escritorio: el aviso de exclusividad como contenido (role note, no ventanilla), cero enlaces a la
//     app en el documento, boton de copiar y el enlace escrito en un parrafo seleccionable.
//  F. escritorio: "Copiar enlace" dos patas. Con el portapapeles real del entorno headless (que suele
//     rechazar) se exige honestidad: reporta una de las dos salidas y no abre ventanilla. Con un
//     portapapeles grabador se afirma lo que el ambiente no deja afirmar: que la cadena copiada es LA
//     URL DE LA APP y que el aviso de exito existe.
//  G. Escape cierra la guia (contrato de ModalFrame).
//  H. los cuatro cruces dispositivo x tema pintan la guia y quedan capturados; el color de calculo de
//     la banda debe ser distinto entre claro y oscuro, si no "ambos temas" no afirma nada.
//  I. el tablero, con session y modulos habilitados, NO ofrece la descarga: cero banda, cero enlace a
//     la app y cero nodo #app-install-title en el DOM servido.
//  J. el destino quemado en la libreria responde vivo (200) y es la app movil, no una pagina de error.
//  K. cero ventanillas nativas, cero errores de pagina, cero errores de consola y cero peticiones
//     rotas salvo el /favicon.ico que el portal no sirve; los ERR_ABORTED se registran aparte y se
//     compensan afirmando que el acceso si pinta su formulario.
//
// Sale con codigo distinto de cero ante cualquier comprobacion fallida o parcial.

const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { spawn, execFileSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..", "..");
const WEB = path.join(ROOT, "apps", "web");
const PORT = Number(process.env.CERT_BROWSER_PORT || 3347);
const ARTIFACT = process.env.CERT_ARTIFACT || "app-install-acceso-20261125";
const OUT = path.join(ROOT, "docs", "qa", "evidence", ARTIFACT);
const BASE = `http://127.0.0.1:${PORT}`;
const NAV_TIMEOUT = 90_000;
const keepOpen = process.argv.slice(2).includes("--keep-open");

// El arnes no copia la URL ni el copy: los lee de la misma libreria que pinta la pantalla. Un cambio
// de texto obliga a re-medir y no deja una certificacion verde afirmando un copy que ya no existe.
const libSource = fs.readFileSync(path.join(WEB, "lib", "mobileAppInstall.ts"), "utf8");
function libString(name) {
  const found = libSource.match(new RegExp(`${name}: "((?:[^"\\\\]|\\\\.)*)"`));
  assert.ok(found, `falta la cadena ${name} en apps/web/lib/mobileAppInstall.ts: el arnes perdio su fuente`);
  return JSON.parse(`"${found[1]}"`);
}
const urlMatch = libSource.match(/MOBILE_APP_FALLBACK_URL = "([^"]+)"/);
assert.ok(urlMatch, "falta la URL quemada de la app en la libreria");
const APP_URL = urlMatch[1];
const LABELS = {
  bandAction: libString("bandAction"),
  guideTitle: libString("guideTitle"),
  openApp: libString("openApp"),
  copyLink: libString("copyLink"),
  installedHint: libString("installedHint"),
  desktopNotice: libString("desktopNotice"),
  copied: libString("copied"),
  copyBlocked: libString("copyBlocked")
};
const STEP_LABELS = [...libSource.matchAll(/\blabel: "((?:[^"\\]|\\.)*)"/g)].map((found) => JSON.parse(`"${found[1]}"`));
assert.ok(STEP_LABELS.length >= 4, `la libreria declara ${STEP_LABELS.length} pasos, se esperan los cuatro del flujo de Chrome`);
// La frase que el propio servicio de la app usa para rechazar el escritorio: se busca por su nucleo,
// no por la cadena completa, para que una reescritura de estilo no apague el chequeo.
const DESKITO_MARKER = "exclusiva para celulares";

// Censo con URL: "Failed to load resource" no dice qual, asi que el filtro se compara contra las
// peticiones rotas reales. Unica exencion con nombre: el navegador pide /favicon.ico y el portal no
// sirve ese archivo (no hay favicon.ico en apps/web/public ni app), es previo a esta intervencion y
// no es una ruta del contrato. Los ERR_ABORTED no son fallas: el propio arnes navega entre escenarios
// y cancela imagenes en vuelo; que el acceso si pinta su formulario se afirma aparte.
const EXEMPT_HTTP_FAILURES = ["/favicon.ico"];

const ANDROID_UA = "Mozilla/5.0 (Linux; Android 14; SM-A155G Build/UP1A.231005.007) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.6668.100 Mobile Safari/537.36";
const DESKTOP_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.6668.100 Safari/537.36";

// El tablero ya no ofrece la descarga, y para certificar su ausencia hay que llegar a el: con sesion y
// modulos habilitados es como el lobby renderiza de verdad. Un tablero vacio por falta de contexto
// esconderia la banda por otro motivo y el assert de ausencia serait verde por ceguera.
const SESSION = {
  tenant: { id: "cert-app-tenant", active_modules: ["talento_humano", "transporte", "inventario", "compras", "ventas", "servicios"] },
  user: {
    role: "APEX_ADMIN",
    role_metadata: { role_type: "admin", role_scope: "company" },
    role_permissions: [{ module: "hr", action: "read" }, { module: "transport", action: "read" }, { module: "inventory", action: "read" }]
  }
};

// Cuatro cruces dispositivo x tema, sin dimension de modulos: la banda del acceso no depende del
// contexto de tenant, y ese fue justamente el motivo de la correccion del dueno.
const ESCENARIOS = [
  { name: "acceso-movil-claro", device: "movil", theme: "light" },
  { name: "acceso-movil-oscuro", device: "movil", theme: "dark" },
  { name: "acceso-escritorio-claro", device: "escritorio", theme: "light" },
  { name: "acceso-escritorio-oscuro", device: "escritorio", theme: "dark" }
];

const RESUL = {
  format: "apexos-app-install-acceso-v1",
  started_at: new Date().toISOString(),
  base: BASE,
  artifact: ARTIFACT,
  app_url: APP_URL,
  escenarios: {},
  checks: []
};

function check(name, ok, payload = {}) {
  RESUL.checks.push({ name, ok: Boolean(ok), ...(Object.keys(payload).length ? { payload } : {}) });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${Object.keys(payload).length ? ` ${JSON.stringify(payload)}` : ""}`);
  if (!ok) throw new Error(`Check fallido: ${name}`);
}

function softCheck(name, ok, payload = {}) {
  RESUL.checks.push({ name, ok: Boolean(ok), ...(Object.keys(payload).length ? { payload } : {}) });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${Object.keys(payload).length ? ` ${JSON.stringify(payload)}` : ""}`);
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
    throw new Error("PREREQUITO: apps/web/.next/BUILD_ID no existe. Ejecuta `npm --workspace apps/web run build` antes que `next start`.");
  }
  RESUL.build_id = fs.readFileSync(path.join(WEB, ".next", "BUILD_ID"), "utf8").trim();
  RESUL.frontend_served_by = "next start (produccion)";
  fs.mkdirSync(OUT, { recursive: true });
  const logHandle = fs.openSync(path.join(OUT, "next-start.log"), "w");
  const web = spawn(process.execPath, [path.join(ROOT, "node_modules", "next", "dist", "bin", "next"), "start", "-p", String(PORT), "-H", "127.0.0.1"], {
    cwd: WEB,
    windowsHide: true,
    stdio: ["ignore", logHandle, logHandle],
    env: { ...process.env, NODE_ENV: "production" }
  });

  let browser;
  let session = SESSION;
  const dialogs = [];
  const consoleErrors = [];
  const httpFailures = [];
  const canceled = [];
  const pageErrors = [];
  // Censo de envios del formulario: la banda esta pegada al pie del acceso, y un boton que heredara
  // `type="submit"` o un <a> dentro del <form> dispararia el login al pulsarlo. Se cuenta el viaje real
  // a la API, no el atributo del boton: es lo unico que prueba que el usuario no quedo intentando entrar.
  const loginAttempts = [];
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
    await page.setBypassServiceWorker(true);

    // El portapapeles solo se concede en origen seguro con permiso: 127.0.0.1 lo es. Si el grant no
    // esta disponible, el chequeo E lo declara en el payload en vez de fingir un verde.
    let clipboardGranted = false;
    try {
      await browser.defaultBrowserContext().overridePermissions(BASE, ["clipboard-read", "clipboard-write"]);
      clipboardGranted = true;
    } catch (error) {
      RESUL.clipboard_permission_grant = `no disponible: ${error.message}`;
    }

    await page.setRequestInterception(true);
    const CORS_HEADERS = {
      "Access-Control-Allow-Origin": BASE,
      "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
      "Access-Control-Allow-Headers": "authorization, content-type, x-request-id, x-company-id",
      "Access-Control-Max-Age": "600"
    };
    page.on("request", (request) => {
      const url = new URL(request.url());
      const pathname = url.pathname;
      if (pathname.startsWith("/api/v1/") || pathname.startsWith("/api/public/")) {
        if (/\/auth\/(login|token)/.test(pathname)) loginAttempts.push({ method: request.method(), url: request.url() });
        if (request.method() === "OPTIONS") {
          return void request.respond({ status: 204, headers: { ...CORS_HEADERS, "Access-Control-Allow-Headers": request.headers()["access-control-request-headers"] || CORS_HEADERS["Access-Control-Allow-Headers"] }, body: "" });
        }
        if (pathname === "/api/v1/auth/me") {
          return void request.respond({ status: 200, contentType: "application/json", headers: CORS_HEADERS, body: JSON.stringify(session) });
        }
        return void request.respond({ status: 200, contentType: "application/json", headers: CORS_HEADERS, body: "{}" });
      }
      if (url.hostname !== "127.0.0.1" && url.hostname !== "localhost") return void request.abort("blockedbyclient");
      return void request.continue();
    });

    // El texto "Failed to load resource" no trae la URL: sin censo de respuestas el filtro de consola
    // seria ciego o tendria que perdonar todo. Se registra el origen exacto de cada 4xx/5xx.
    page.on("response", (response) => {
      const status = response.status();
      if (status >= 400) httpFailures.push({ status, url: response.url() });
    });
    page.on("requestfailed", (request) => {
      const reason = String(request.failure()?.errorText || "");
      if (/ERR_ABORTED|ERR_BLOCKED_BY_CLIENT/.test(reason)) canceled.push({ url: request.url(), reason });
      else httpFailures.push({ status: "failed", url: request.url(), reason });
    });
    page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
    page.on("pageerror", (error) => pageErrors.push(String((error && error.message) || error)));
    // Sin oyente, Chrome headless descarta la ventanilla en silencio y "cero ventanas" daria verde un
    // arnes roto. El prefijo ARNES: marca la ventanilla provocada a proposito por el propio arnes.
    page.on("dialog", async (dialog) => {
      dialogs.push({ type: dialog.type(), message: String(dialog.message() || "").slice(0, 300) });
      await dialog.dismiss().catch(() => undefined);
    });
    const realDialogs = () => dialogs.filter((entry) => !/^ARNES:/.test(entry.message));

    async function waitForText(needle, timeout = 45_000) {
      const until = Date.now() + timeout;
      for (;;) {
        const found = await page.evaluate((text) => (document.body.innerText || "").includes(text), needle).catch(() => false);
        if (found) return true;
        if (Date.now() > until) return false;
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    }

    async function configureViewport(device) {
      if (device === "movil") {
        await page.setUserAgent(ANDROID_UA);
        await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
      } else {
        await page.setUserAgent(DESKTOP_UA);
        await page.setViewport({ width: 1366, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false });
      }
    }

    // El acceso se certifica SIN sesion: es la pantalla anterior al login. Se limpia el almacenamiento
    // y se recarga para que el script del tema vea la bandera; si quedara un token de un escenario
    // anterior, la banda pintaria en un acceso ya autenticado y el arnes mediria otra cosa.
    async function prepararAcceso({ theme }) {
      await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT });
      await page.evaluate((bandera) => {
        localStorage.clear();
        sessionStorage.clear();
        localStorage.setItem("apex_theme", bandera);
      }, theme);
      await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT });
    }

    // La ausencia en el tablero solo significa algo si el tablero renderiza su contenido: con sesion y
    // modulos el lobby pinta "Mis módulos"; si viniera vacio, no haber banda no probaria nada.
    async function prepararTablero({ theme }) {
      session = SESSION;
      await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT });
      await page.evaluate((bandera, contexto) => {
        localStorage.clear();
        localStorage.setItem("token", "cert.appinstall.token");
        localStorage.setItem("refresh", "cert.appinstall.refresh");
        localStorage.setItem("auth_provider", "local");
        localStorage.setItem("user_email", "edwin@apex.local");
        localStorage.setItem("apex_last_activity", String(Date.now()));
        localStorage.setItem("apexos_company_id", contexto.tenant.id);
        localStorage.setItem("apexos_company_name", "Empresa de certificación");
        localStorage.setItem("role_name", contexto.user.role);
        localStorage.setItem("tenant_active_modules", JSON.stringify(contexto.tenant.active_modules));
        localStorage.setItem("apex_theme", bandera);
      }, theme, session);
      await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT });
    }

    // Estado del acceso ANTES de abrir la guia: prueba que la banda vive en la pantalla sin sesion,
    // fuera del formulario y dentro de la columna fija del panel (el motivo del rediseño apilado).
    async function medirAcceso() {
      return page.evaluate((needles) => {
        const painted = (node) => {
          if (!node) return false;
          const rect = node.getBoundingClientRect();
          const style = getComputedStyle(node);
          return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
        };
        const banda = document.getElementById("app-install-title")?.closest("section") || null;
        const boton = [...document.querySelectorAll("button")].find((node) => (node.innerText || node.textContent || "").includes(needles.bandAction)) || null;
        const campo = (nombre) => document.querySelector(`input[name="${nombre}"]`);
        const email = campo("email");
        const clave = campo("password");
        const rect = boton ? boton.getBoundingClientRect() : null;
        return {
          url: location.pathname,
          tiene_token: Boolean(localStorage.getItem("token")),
          banda_en_document: Boolean(banda),
          banda_pintada: painted(banda),
          banda_dentro_del_formulario: Boolean(banda?.closest("form")),
          banda_despues_del_formulario: (() => {
            const form = document.querySelector("form");
            return Boolean(form && banda && (form.compareDocumentPosition(banda) & Node.DOCUMENT_POSITION_FOLLOWING) === Node.DOCUMENT_POSITION_FOLLOWING);
          })(),
          boton_type: boton ? (boton.getAttribute("type") || "submit") : "",
          boton_ancho: rect ? Math.round(rect.width) : 0,
          banda_ancho: banda ? Math.round(banda.getBoundingClientRect().width) : 0,
          banda_cabe_en_la_ventana: rect ? rect.right <= window.innerWidth + 1 && rect.left >= -1 : false,
          desborde_horizontal: Math.max(document.documentElement.scrollWidth, document.body ? document.body.scrollWidth : 0) - window.innerWidth,
          email_pintado: painted(email),
          clave_pintada: painted(clave),
          email_vacio: email ? email.value === "" : false,
          formulario_presente: Boolean(document.querySelector("form")),
          guia_ya_abierta: (document.body.innerText || "").includes(needles.guideTitle)
        };
      }, { bandAction: LABELS.bandAction, guideTitle: LABELS.guideTitle });
    }

    // Ausencia en el tablero: la retirada se certifya sobre el DOM servido con sesion, no sobre el
    // fuente. Se exige ademas que el lobby este realmente pintando sus modulos, si no el cero banda
    // podria deberse a una pantalla vacia por contexto y no a la correccion.
    async function medirTablero() {
      return page.evaluate((needles) => {
        const texto = document.body.innerText || "";
        return {
          url: location.pathname,
          banda: texto.includes(needles.bandAction),
          nodos_titulo: document.querySelectorAll("#app-install-title").length,
          enlaces_a_la_app: [...document.querySelectorAll("a")].filter((node) => (node.getAttribute("href") || "").startsWith(needles.appUrl)).length,
          modulos_pintados: texto.includes("Mis módulos"),
          tiles: document.querySelectorAll("#mis-modulos a").length,
          acciones: texto.includes("Acciones frecuentes")
        };
      }, { bandAction: LABELS.bandAction, appUrl: APP_URL });
    }

    async function readDialog() {
      return page.evaluate((needles) => {
        const dialog = document.querySelector('[role="dialog"]');
        const toApp = [...document.querySelectorAll("a")].filter((node) => (node.getAttribute("href") || "").startsWith(needles.appUrl));
        const dialogAnchor = dialog ? [...dialog.querySelectorAll("a")].find((node) => (node.getAttribute("href") || "").startsWith(needles.appUrl)) : null;
        const copyButton = dialog ? [...dialog.querySelectorAll("button")].find((node) => (node.innerText || "").includes(needles.copyLink)) : null;
        const live = dialog ? dialog.querySelector('[aria-live="polite"]') : null;
        const painted = (node) => {
          if (!node) return false;
          const rect = node.getBoundingClientRect();
          const style = getComputedStyle(node);
          return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
        };
        const text = dialog ? (dialog.innerText || "") : "";
        return {
          present: Boolean(dialog),
          painted: painted(dialog),
          text: text.slice(0, 4000),
          stepCount: dialog ? dialog.querySelectorAll("ol > li").length : 0,
          anchorsToApp: toApp.length,
          anchorHref: dialogAnchor ? dialogAnchor.href : "",
          anchorTarget: dialogAnchor ? dialogAnchor.target : "",
          anchorRel: dialogAnchor ? dialogAnchor.rel : "",
          hasCopyButton: Boolean(copyButton),
          hasNote: Boolean(dialog?.querySelector('[role="note"]')),
          feedback: live ? (live.innerText || "").trim() : "",
          bodyHasBand: (document.body.innerText || "").includes(needles.bandAction),
          bandBackground: (() => {
            const titulo = document.getElementById("app-install-title");
            const banda = titulo?.closest("section");
            return banda ? getComputedStyle(banda).backgroundColor : "";
          })()
        };
      }, { appUrl: APP_URL, copyLink: LABELS.copyLink, bandAction: LABELS.bandAction });
    }

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

    // Puerta de hidratacion. `/login` es una pagina estatica: la banda esta en el HTML servido antes de
    // que React haya enganado sus oyentes, y un clic ahi no abre nada. El arnes anterior llegaba al
    // lobby despues de una visita previa al acceso, que calentaba los chunk; montada la banda en el
    // propio acceso, el primer escenario movia el clic sobre una pagina todavia sorda y la guia nunca
    // aparecia (el rojo decia "la guia no abre" sobre un portal sano). La puerta no duerme: prueba que
    // la pagina responde a un clic real pulsando el revelador de contrasena del propio formulario y
    // leyendo el tipo del campo, y devuelve el estado. Si en 12 s no responde, el escenario se declara
    // rojo con ESA causa, que es lo que un usuario veria.
    async function esperarHidratacion() {
      // Cada vuelta vuelve a pulsar hasta que el campo cambie: un clic perdido antes de hidratar no se
      // re-intenta solo, y leer el tipo en el mismo tick seria leer siempre el valor viejo (React
      // actualiza despues del handler). El estado que se afirma es el observado, no el deseo.
      const revelar = () => page.evaluate(() => {
        const campo = document.querySelector('input[name="password"]');
        const tipo = campo ? campo.type : "";
        if (tipo === "text") return { tipo };
        const boton = [...document.querySelectorAll("button")].find((node) => (node.getAttribute("aria-label") || "").includes("Mostrar contraseña"));
        if (!boton) return { tipo, motivo: "el acceso no tiene revelador de contrasena" };
        boton.click();
        return { tipo, pedido: true };
      });
      const desde = Date.now();
      for (;;) {
        const estado = await revelar();
        if (estado.tipo === "text") break;
        if (estado.motivo) return { hidratado: false, motivo: estado.motivo };
        if (Date.now() - desde > 15_000) return { hidratado: false, motivo: "el revelador nunca cambio el campo: la pagina no hidrato", intentos: Math.round((Date.now() - desde) / 250) };
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      const ms = Date.now() - desde;
      const ocultar = () => page.evaluate(() => {
        const campo = document.querySelector('input[name="password"]');
        const tipo = campo ? campo.type : "";
        if (tipo === "password") return { tipo };
        const boton = [...document.querySelectorAll("button")].find((node) => (node.getAttribute("aria-label") || "").includes("Ocultar contraseña"));
        if (!boton) return { tipo, motivo: "no hay boton para ocultar" };
        boton.click();
        return { tipo, pedido: true };
      });
      const hasta = Date.now();
      for (;;) {
        const estado = await ocultar();
        if (estado.tipo === "password") return { hidratado: true, ms };
        if (Date.now() - hasta > 10_000) return { hidratado: false, motivo: "hidrato pero la puerta dejo la contrasena a la vista", tipo: estado.tipo };
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    }

    for (const escenario of ESCENARIOS) {
      await configureViewport(escenario.device);
      await prepararAcceso(escenario);
      const acceso = await medirAcceso();
      RESUL.escenarios[escenario.name] = {
        device: escenario.device,
        theme: escenario.theme,
        url: acceso.url,
        acceso_sin_sesion: { tiene_token: acceso.tiene_token, formulario_presente: acceso.formulario_presente },
        banda: {
          pintada: acceso.banda_pintada,
          dentro_del_formulario: acceso.banda_dentro_del_formulario,
          boton_type: acceso.boton_type,
          boton_ancho: acceso.boton_ancho,
          banda_ancho: acceso.banda_ancho,
          cabe_en_la_ventana: acceso.banda_cabe_en_la_ventana
        }
      };

      // Control positivo de la pagina: si el acceso no pinta su formulario, la banda podria estar en
      // cualquier otra pantalla y el arnes estaria afirmando el montaje en el sitio equivocado.
      softCheck(`${escenario.name}::el_acceso_pinta_su_formulario`, acceso.formulario_presente === true && acceso.email_pintado === true && acceso.clave_pintada === true, { correo: acceso.email_pintado, clave: acceso.clave_pintada });
      softCheck(`${escenario.name}::la_banda_vive_sin_sesion`, acceso.tiene_token === false, { token: acceso.tiene_token });
      const bandVisible = await waitForText(LABELS.bandAction);
      softCheck(`${escenario.name}::banda_visible`, bandVisible);
      // La banda se apila en la columna de 28rem: tiene que caber sin desbordar la ventana ni obligar
      // al acceso a moverse de lado. En el movil (390 px) es donde el layout viejo se aplastaba.
      softCheck(`${escenario.name}::la_banda_cabe_en_la_columna`, acceso.banda_cabe_en_la_ventana === true && acceso.desborde_horizontal <= 1, { ancho_boton: acceso.boton_ancho, ancho_banda: acceso.banda_ancho, desborde: acceso.desborde_horizontal });
      // El boton de la guia no puede ser de envio: vive pegado al pie del formulario y un `type` implicito
      // intentaria entrar cada vez que alguien quiere descargar la app.
      softCheck(`${escenario.name}::la_banda_fuera_del_formulario`, acceso.banda_dentro_del_formulario === false && acceso.banda_despues_del_formulario === true, { dentro: acceso.banda_dentro_del_formulario, despues: acceso.banda_despues_del_formulario });
      softCheck(`${escenario.name}::el_boton_no_es_de_envio`, acceso.boton_type === "button", { type: acceso.boton_type });
      softCheck(`${escenario.name}::los_campos_nacen_vacios`, acceso.email_vacio === true, { email: acceso.email_vacio });

      // Puerta antes del clic: sin ella el primer escenario pulsa sobre una pagina que aun no escucha.
      const viva = await esperarHidratacion();
      RESUL.escenarios[escenario.name].hidratacion = viva;
      softCheck(`${escenario.name}::el_acceso_responde_a_un_clic_real`, viva.hidratado === true, viva);

      // Control de contraste del arnes: antes de pulsar, la guia no puede estar en pantalla. Si este
      // assert pasara sin haber pulsado nada, todo lo que sigue estaria midiendo el cascaron.
      const antesDeAbrir = await page.evaluate((title) => (document.body.innerText || "").includes(title), LABELS.guideTitle);
      softCheck(`${escenario.name}::guia_cerrada_antes_del_clic`, antesDeAbrir === false, { tituloPresente: antesDeAbrir });

      const clicked = await clickByText(LABELS.bandAction);
      softCheck(`${escenario.name}::boton_abre_la_guia`, clicked);
      const opened = await waitForText(LABELS.guideTitle);
      softCheck(`${escenario.name}::guia_abre`, opened);
      // El clic abrio la guia y no una sesion: seguimos en /login, el formulario no viajo a la API y
      // no aparecio un token. Es el defecto que la montura pegada al pie del acceso invita a cometer.
      const despuesDelClic = await page.evaluate(() => ({ url: location.pathname, token: Boolean(localStorage.getItem("token")) }));
      softCheck(`${escenario.name}::el_clic_no_intentara_entrar`, despuesDelClic.url === "/login" && despuesDelClic.token === false && loginAttempts.length === 0, { url: despuesDelClic.url, token: despuesDelClic.token, envios: loginAttempts.length });
      const surface = await readDialog();
      Object.assign(RESUL.escenarios[escenario.name], {
        painted: surface.painted,
        band_background: surface.bandBackground,
        stepCount: surface.stepCount,
        anchorsToApp: surface.anchorsToApp,
        hasCopyButton: surface.hasCopyButton,
        hasNote: surface.hasNote,
        banda_detras_del_dialogo: surface.bodyHasBand,
        text: surface.text
      });

      softCheck(`${escenario.name}::dialogo_pintado_en_pantalla`, surface.painted === true);
      for (const step of STEP_LABELS) softCheck(`${escenario.name}::paso_${step.slice(0, 18)}`, surface.text.includes(step), { paso: step });
      softCheck(`${escenario.name}::guia_nombra_los_tres_puntos`, /tres puntos/i.test(surface.text));
      softCheck(`${escenario.name}::guia_nombra_el_acceso_directo`, /acceso directo/i.test(surface.text));

      if (escenario.device === "movil") {
        softCheck(`${escenario.name}::sin_aviso_de_escritorio`, surface.text.includes(DESKITO_MARKER) === false, { aviso: surface.text.includes(DESKITO_MARKER) });
        softCheck(`${escenario.name}::enlace_exacto_a_la_app`, surface.anchorHref === `${APP_URL}/`, { href: surface.anchorHref });
        softCheck(`${escenario.name}::enlace_abre_pestananueva`, surface.anchorTarget === "_blank", { target: surface.anchorTarget });
        softCheck(`${escenario.name}::enlace_sin_exponer_la_ventana`, /(^|\s)noopener(\s|$)/.test(surface.anchorRel), { rel: surface.anchorRel });
        softCheck(`${escenario.name}::sin_boton_de_copiado`, surface.hasCopyButton === false, "en el celular la accion es abrir, no copiar");
        // La miniguia tiene que cerrar el circulo: despues de instalar se entra con el mismo correo.
        softCheck(`${escenario.name}::dice_como_entrar_despues_de_instalar`, surface.text.includes(LABELS.installedHint), { trozo: surface.text.slice(-160) });
      } else {
        softCheck(`${escenario.name}::aviso_de_exclusividad`, surface.text.includes(DESKITO_MARKER), { trozo: surface.text.slice(0, 160) });
        softCheck(`${escenario.name}::cero_enlaces_a_la_app_en_el_documento`, surface.anchorsToApp === 0, { encontrados: surface.anchorsToApp });
        softCheck(`${escenario.name}::boton_de_copiado_presente`, surface.hasCopyButton === true);
        softCheck(`${escenario.name}::enlace_escrito_para_copiarlo_a_mano`, surface.text.includes(APP_URL), "si el portapapeles esta bloqueado el usuario necesita ver el enlace");
        softCheck(`${escenario.name}::el_aviso_es_contenido_no_un_alerta`, surface.hasNote === true);
        // El enlace se ofrece para seleccionarlo a mano si el portapapeles esta bloqueado: tiene que
        // existir un parrafo con la URL exacta como unico texto, si no no hay nada que arrastrar.
        const seleccionable = await page.evaluate((needle) => {
          const parrafos = [...document.querySelectorAll('[role="dialog"] p')].filter((node) => (node.innerText || "").trim() === needle);
          return { encontrados: parrafos.length, ancho: parrafos[0] ? Math.round(parrafos[0].getBoundingClientRect().width) : 0 };
        }, APP_URL);
        softCheck(`${escenario.name}::el_enlace_es_un_parrafo_seleccionable`, seleccionable.encontrados === 1, seleccionable);
        if (escenario.name === "acceso-escritorio-claro") {
          // Pata 1, con el portapapeles que el entorno de verdad ofrece. En Chrome headless el
          // writeText puede rechazar aun con el permiso concedido: aqui no se exige exito, se exige
          // honestidad (el dialogo reporta una de las dos salidas reales y no abre ventanilla).
          const dialogosAntes = dialogs.length;
          const pressed = await clickByText(LABELS.copyLink);
          softCheck("acceso-escritorio-claro::copiar_pulsado", pressed);
          await new Promise((resolve) => setTimeout(resolve, 900));
          const after = await readDialog();
          RESUL.escenarios["acceso-escritorio-claro"].clipboard_permission_granted = clipboardGranted;
          RESUL.escenarios["acceso-escritorio-claro"].copiado_en_ambiente_real = after.feedback;
          softCheck("acceso-escritorio-claro::el_copiado_reporta_sin_mentir", [LABELS.copied, LABELS.copyBlocked].includes(after.feedback), { feedback: after.feedback, permiso: clipboardGranted });
          softCheck("acceso-escritorio-claro::el_copiado_no_abre_ventanilla", dialogs.length === dialogosAntes, { nuevas: dialogs.slice(dialogosAntes) });
          softCheck("acceso-escritorio-claro::el_dialogo_sigue_vivo_despues_del_copiado", after.present === true);

          // Pata 2, con un portapapeles grabador. Es lo unico que permite afirmar, en una maquina sin
          // portapapeles usable, QUE se copia la URL de la app (no otra cadena) y que el aviso de
          // exito existe y se pinta cuando el navegador acepta. Si el componente copiara otro texto,
          // este chequeo se cae: el assert no puede estar verde por ceguera.
          const armado = await page.evaluate((needle) => {
            window.__arnesCopiado = [];
            Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (texto) => { window.__arnesCopiado.push(String(texto)); } } });
            const boton = [...document.querySelectorAll('[role="dialog"] button')].find((node) => (node.innerText || "").includes(needle));
            if (!boton) return false;
            boton.click();
            return true;
          }, LABELS.copyLink);
          softCheck("acceso-escritorio-claro::portapapeles_grabador_armado", armado === true);
          await new Promise((resolve) => setTimeout(resolve, 900));
          const grabado = await page.evaluate(() => window.__arnesCopiado || []);
          const exito = await readDialog();
          RESUL.escenarios["acceso-escritorio-claro"].copiado_con_grabador = { grabado, feedback: exito.feedback };
          softCheck("acceso-escritorio-claro::copia_exactamente_la_url_de_la_app", grabado.length === 1 && grabado[0] === APP_URL, { grabado });
          softCheck("acceso-escritorio-claro::avisa_exito_cuando_el_navegador_acepta", exito.feedback === LABELS.copied, { feedback: exito.feedback });
          await page.evaluate(() => { delete navigator.clipboard; delete window.__arnesCopiado; });
        }
      }

      // La guia es un portal: el acceso sigue detras, con su banda pintada. Si el modal se montara
      // reemplazando la pantalla, el usuario perderia el formulario al cerrar.
      softCheck(`${escenario.name}::el_acceso_sigue_detras_de_la_guia`, surface.bodyHasBand === true && surface.present === true);

      // Captura CON la guia abierta: la evidencia que el dueno necesita es el diálogo, y si se toma
      // despues de Escape quedaria fotografiado el acceso de siempre.
      await page.screenshot({ path: path.join(OUT, `${escenario.name}-guia.png`), fullPage: false });
      await page.keyboard.press("Escape");
      await new Promise((resolve) => setTimeout(resolve, 600));
      const closed = await page.evaluate(() => Boolean(document.querySelector('[role="dialog"]')));
      softCheck(`${escenario.name}::escape_cierra_la_guia`, closed === false, { sigueAbierta: closed });
      // La captura del acceso tiene que mostrar la banda: en el panel derecho queda bajo el pie del
      // formulario y sin desplazamiento la evidencia fotografiaria un acceso que no demuestra nada.
      await page.evaluate(() => document.getElementById("app-install-title")?.scrollIntoView({ block: "center" }));
      await new Promise((resolve) => setTimeout(resolve, 500));
      await page.screenshot({ path: path.join(OUT, `${escenario.name}-banda.png`), fullPage: false });
    }

    // I. El tablero, con sesion y modulos, NO ofrece la descarga. La ausencia se mide sobre el DOM
    // servido despues de construir el lobby (los modulos pintan), no sobre el fuente: si quedara un
    // segundo montaje, o si el lobby viniera vacio por contexto, este bloque lo distingue.
    await configureViewport("escritorio");
    await prepararTablero({ theme: "light" });
    const listo = await waitForText("Mis módulos", 30_000);
    softCheck("tablero_renderiza_sus_modulos", listo);
    const tablero = await medirTablero();
    RESUL.tablero_sin_banda = tablero;
    softCheck("el_tablero_no_ofrece_la_banda", tablero.banda === false && tablero.nodos_titulo === 0, { banda: tablero.banda, nodos: tablero.nodos_titulo });
    softCheck("el_tablero_no_enlaza_a_la_app", tablero.enlaces_a_la_app === 0, { enlaces: tablero.enlaces_a_la_app });
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await new Promise((resolve) => setTimeout(resolve, 500));
    await page.screenshot({ path: path.join(OUT, "tablero-sin-banda.png"), fullPage: false });

    // El eje del tema tiene que poder caerse: si la banda pintara identica en claro y en oscuro, las
    // cuatro capturas serian la misma foto y "ambos temas" no estaria afirmando nada.
    for (const [claro, oscuro] of [["acceso-movil-claro", "acceso-movil-oscuro"], ["acceso-escritorio-claro", "acceso-escritorio-oscuro"]]) {
      const fondoClaro = RESUL.escenarios[claro]?.band_background;
      const fondoOscuro = RESUL.escenarios[oscuro]?.band_background;
      softCheck(`tema_${claro}_distinto_de_${oscuro}`, Boolean(fondoClaro) && Boolean(fondoOscuro) && fondoClaro !== fondoOscuro, { claro: fondoClaro, oscuro: fondoOscuro });
    }

    // H. el destino quemado en la libreria existe y es la app movil. Un enlace verde en el DOM pero
    // muerto en la red es exactamente el defecto que el dueno no puede distinguir de uno vivo.
    try {
      const probe = await fetch(APP_URL, { signal: AbortSignal.timeout(25_000), redirect: "follow" });
      const html = await probe.text();
      softCheck("destino_app_responde", probe.status === 200, { status: probe.status });
      softCheck("destino_app_es_la_app_movil", /APEXOS Web M/.test(html) && /manifest/.test(html), { trozo: html.slice(0, 160).replace(/\s+/g, " ") });
      RESUL.destino_app = { status: probe.status, bytes: html.length, title: (html.match(/<title>([^<]*)<\/title>/) || [])[1] || "" };
    } catch (error) {
      softCheck("destino_app_responde", false, { error: error.message });
    }

    softCheck("cero_ventanillas_nativas", realDialogs().length === 0, { vistas: realDialogs().slice(0, 5) });
    softCheck("cero_errores_de_pagina", pageErrors.length === 0, { errores: pageErrors.slice(0, 6) });
    // Censo con URL: "Failed to load resource" no dice qual, asi que el filtro de consola se compara
    // contra las peticiones rotas reales y perdonar algo queda escrito en EXEMPT_HTTP_FAILURES.
    const fallasHttp = httpFailures.filter((fallo) => !EXEMPT_HTTP_FAILURES.some((needle) => String(fallo.url).includes(needle)));
    softCheck("cero_peticiones_rotas", fallasHttp.length === 0, { fallas: fallasHttp.slice(0, 10) });
    const enlacesRotos = consoleErrors.filter((texto) => /Failed to load resource/.test(texto));
    const erroresDeConsola = consoleErrors.filter((texto) => !/Failed to load resource/.test(texto));
    softCheck("cero_errores_de_consola", erroresDeConsola.length === 0, { errores: erroresDeConsola.slice(0, 8) });
    RESUL.runtime = {
      page_errors: pageErrors.slice(0, 12),
      console_errors: consoleErrors.slice(0, 20),
      http_failures: httpFailures.slice(0, 20),
      canceled_requests: canceled.length,
      canceled_sample: canceled.slice(0, 6),
      console_resource_messages: enlacesRotos.length,
      exempt_http_failures: EXEMPT_HTTP_FAILURES,
      native_dialogs: realDialogs().slice(0, 10),
      clipboard_permission_granted: clipboardGranted
    };
    RESUL.como_reproducir = `npm --workspace apps/web run build && npm run certify:app-install:local`;
    try { RESUL.git_head = String(execFileSync("git", ["-C", ROOT, "rev-parse", "HEAD"], { encoding: "utf8" })).trim(); } catch { RESUL.git_head = "no disponible"; }
    writeEvidence();
    const failed = RESUL.checks.filter((item) => !item.ok).length;
    console.log(`VEREDICTO ${RESUL.verdict.passed}/${RESUL.verdict.total} · ${failed} rojos · evidencia en ${OUT}`);
    if (failed) throw new Error(`${failed} comprobaciones fallidas`);
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
