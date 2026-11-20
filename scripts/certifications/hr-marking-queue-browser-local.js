// Certificacion LOCAL en navegador real de la cola de marcacion y de la correccion del supervisor.
//
// Que queda probado aqui y no antes: `hr-marking-evidence-resilience-local.js` mide el contrato del
// API sobre HTTP. Este arnés abre Chromium contra el build de produccion del frontend (`next start`)
// y ejerce la otra mitad del dispositivo: la cola de `localStorage` con la evidencia inline tal como
// la dejaba la version anterior, el unico ciclo de sincronizacion, el self-heal de los elementos que
// esa version dejo bloqueados, el cierre visible de la marcacion que vencio la ventana de 24 h y la
// pantalla donde el supervisor registra la hora que falta. Nada se intercepta ni se simula: los
// 400/409/503 los produce el servidor Fastify real y las filas se leen de PostgreSQL.
//
// Escenarios de `docs/briefs/2026-11-19-marcacion-evidencia-resiliente.md` seccion 5:
//  2. PNG etiquetado `image/jpeg` encolado -> se guarda con el tipo olido y el hash de lo recibido.
//  3. HEIC real encolado -> la jornada se guarda y la evidencia queda degradada con su codigo.
//  6. Elemento BLOQUEADO por la foto (el incidente de produccion) -> al recargar se libera solo y la
//     hora entra degradada con su novedad; y una foto rechazada EN VUELO se despega en el mismo ciclo
//     sin perder la jornada. Ninguna de las dos se queda "por enviar" ni se cierra en silencio.
//  7. Marcacion que ya supera las 24 h -> deja de estar "por enviar": se CIERRA, se ve con su accion
//     y no bloquea lo que viene detras.
//  8. Concurrencia real: una conexion PostgreSQL independiente sostiene el advisory lock del ambito
//     de la marcacion; con una peticion en vuelo no sale una segunda y el 503 es propio, nunca 500.
//  10b. El supervisor registra desde la pantalla la hora que falta, la fila queda sellada, abre la
//     novedad de ajuste manual y el sello se ve en la trazabilidad.
//  Los avisos se miden en tema claro y en tema oscuro con la razon de contraste leida del
//  `getComputedStyle` realmente pintado (regla 22 de `equipo-apexos`).

const assert = require("node:assert/strict");
const child = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const args = (() => {
  const out = {};
  for (let i = 0; i < process.argv.length; i += 1) {
    const v = process.argv[i];
    if (!v.startsWith("--")) continue;
    out[v.slice(2)] = process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[++i] : true;
  }
  return out;
})();

const ROOT = path.resolve(__dirname, "..", "..");
require(path.join(ROOT, "scripts/load-env"))(path.resolve(ROOT, String(args["env-file"] || ".env")));

const DATABASE_URL = String(process.env.DATABASE_URL || "").trim();
if (!/^postgres(?:ql)?:\/\/[^@\s]+@(localhost|127\.0\.0\.1)(:\d+)?\//.test(DATABASE_URL)) {
  console.error("BLOQUEADO: esta certificacion solo corre contra PostgreSQL local. Define DATABASE_URL local.");
  process.exit(1);
}

const API = path.join(ROOT, "apps/api");
const WEB = path.join(ROOT, "apps/web");
const puppeteer = require(path.join(API, "node_modules/puppeteer-core"));
const prisma = require(path.join(API, "src/core/prisma"));
const admin = require(path.join(API, "src/modules/admin/service"));

const API_PORT = Number(args["api-port"] || 3226);
const WEB_PORT = Number(args["web-port"] || 3227);
const API_URL = `http://127.0.0.1:${API_PORT}`;
const WEB_URL = `http://127.0.0.1:${WEB_PORT}`;
const CHROME = String(args.chrome || process.env.CHROME_BIN || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe");
const ARTIFACT = "hr-marca-evidence-resilience-20261119";
// convencion del repo: `--output=docs/qa/evidence/<artefacto>/<archivo>.json`. Los demas artefactos
// de esta certificacion (capturas y JSON) viven en el directorio de ese archivo.
const OUTPUT = path.resolve(ROOT, String(args.output || path.join("docs", "qa", "evidence", ARTIFACT, "browser-certification.json")));
const EVIDENCE_DIR = path.resolve(ROOT, String(args["evidence-dir"] || path.dirname(OUTPUT)));
const LOG_DIR = path.resolve(ROOT, String(args["log-dir"] || path.join(require("node:os").tmpdir(), "apexos-cert-marca-queue-browser")));

const RUN_ID = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
const PASSWORD = `Qa-Mqb-${crypto.randomBytes(6).toString("hex")}#26`;
const CODE_PREFIX = "QA-MQB-";
const EMAIL_PREFIX = "qa.mqb.";
const HR_CODES = ["m-17", "talento-humano", "talento_humano", "hr"];
const OPERATING_OFFSET = "-05:00";
const MANUAL_ADJUSTMENT_NOVELTY_CODE = "AJUSTE_MANUAL_MARCACION";

// `contentionLockWaitMs` en apps/api/src/modules/hr/service.js: 15 s de presupuesto compartido.
const CONTENTION_DEADLINE_MS = 15_000;
// El lock del holder se sostiene `HOLD_EXTRA_MS` mas alla del presupuesto del cliente, medido desde
// que la marcacion esta EN VUELO. Antes era un `pg_sleep(19 s)` a ciegas desde que abria la
// transaccion, y los ~4 s que toma sembrar la cola y recargar la pagina se comian el margen: medido
// el 2026-11-19, la peticion espero 14,857 s, el lock se libero y respondio 200 sin llegar al 503.
const HOLD_EXTRA_MS = 4_000;
const HOLD_GATE_TIMEOUT_MS = 90_000;
// El tambo fijo de 12 s de la version anterior disparaba ciclos solapados: aqui se mide que no.
const OLD_FIXED_DRUMBEAT_MS = 12_000;
const NAV_TIMEOUT = 60_000;
const QUEUE_SETTLE_TIMEOUT_MS = Number(args["settle-timeout-ms"] || 240_000);

const QUEUE_KEY = "apexos_hr_mobile_pending_sync";

// Ruido conocido del ambiente del puesto, con su motivo declarado. No es un filtro de comodidad:
// cada patron es una dependencia que este arnes no levanta (el respaldo Supabase local del cliente y
// el websocket de colaboracion) y el navegador la reporta como error de consola por la misma politica
// CSP `connect-src 'self' https: wss:` que tambien protege Produccion. Se registran en
// `console_noise` y el resto sigue poniendo la compuerta roja: en las corridas 11 y 13 del 2026-11-19 la
// compuerta fallaba con estos dos tipos de mensaje, que es el control positivo de que el filtro
// no esta tapando un defecto del producto.
const NOISE_BENIGNA = [
  { pattern: /localhost:54321\/auth\/v1\/token/, reason: "respaldo Supabase local: sin servicio en la certificacion, bloqueado por CSP" },
  { pattern: /ws:\/\/localhost:3000\/collaboration\/live/, reason: "websockets de colaboracion: sin servicio en la certificacion, bloqueado por CSP" }
];
const noiseBenigna = (text) => NOISE_BENIGNA.find((item) => item.pattern.test(text)) || null;
const SELF_HEAL_KEY = "apexos_hr_mobile_self_heal_notice";
const PUNCH_SELF_PATH = "/api/v1/hr/self/time-punches";
const PUNCH_ADMIN_PATH = "/api/v1/hr/time-punches";

// Literales copiados de las pantallas y de `apps/web/lib/hrOfflineMarking.ts`. El check
// `literales_sin_deriva` los contrasta con el fuente: si la redaccion cambia, rompe la certificacion
// en vez de dejarla afirmando una frase que ya no existe.
const SENTENCES = {
  selfHealRelease: "Se recupero una marcacion que estaba bloqueada por la foto y se envio de nuevo sin ella. Revisa el aviso de la foto pendiente.",
  degradedMarking: "Tu hora quedo registrada. La foto no se pudo guardar y queda pendiente de revision de tu supervisor.",
  expiredEscalation: "Esta marcacion ya no se puede enviar porque paso el tiempo permitido. Pide a tu supervisor que registre la hora. No es una falla de la aplicacion.",
  closedCount: "marcacion(es) cerradas: no se van a enviar y no cuentan como pendientes. Tu hora la debe registrar un administrador.",
  degradedOnReport: "Evidencia degradada:",
  survivesOnReport: "La marcacion quedo registrada.",
  correctionPanel: "Registrar la hora que falta",
  correctionBadge: "Correccion administrativa",
  correctionSubmit: "Registrar la marcacion",
  salidaLabel: "Salida"
};

const dayBack = (days) => new Date(Date.now() - days * 86400000).toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
const instantAt = (day, clock) => `${day}T${clock}:00${OPERATING_OFFSET}`;
const sha256 = (buffer) => crypto.createHash("sha256").update(buffer).digest("hex");
// `startOfDay` del servicio (apps/api/src/modules/hr/service.js:71) devuelve medianoche de Bogota,
// que en UTC son las 05:00 del mismo dia: el ambito del advisory lock se arma con esa cadena exacta.
const lockScopeFor = (tenantId, employeeId, day, routeId = "") =>
  `${tenantId}:${employeeId}:${routeId || "sin-horario"}:${day}T05:00:00.000Z`;

const result = {
  change_id: "hr-marca-queue-browser-20261119",
  certification: "hr-marking-queue-browser-local",
  environment: "LOCAL",
  browser: "chrome-headless",
  frontend_served_by: "next start (build de produccion)",
  database_url_host: DATABASE_URL.replace(/\/\/[^@]*@/, "//***@"),
  api_url: API_URL,
  web_url: WEB_URL,
  generated_at: new Date().toISOString(),
  certified_commit: "unknown",
  scope: {
    defect:
      "El API ya devolvia el contrato de evidencia resiliente, pero la mitad del dispositivo no estaba medida en navegador: la cola perdia jornadas por un problema de foto, dejaba la marcacion vencida como 'por enviar' para siempre y podian salir dos ciclos simultaneos.",
    product_decision:
      "No se relaja ninguna regla: el alfabeto invalido, el PDF, el mp4 y el payload sobre el tope siguen rechazandose. Lo que se certifica en navegador es que el rechazo de la foto no se come la hora, que lo vencido se cierra a la vista con su accion y que hay un solo ciclo de sincronizacion.",
    proven_by_live_browser: [
      "login real por pantalla del operario y del supervisor contra el build de produccion",
      "criterio 2: PNG etiquetado image/jpeg encolado -> guardado con el tipo olido y el hash de lo recibido",
      "criterio 3: HEIC real encolado -> la jornada se guarda y la evidencia queda degradada con su codigo",
      "criterio 6: elemento bloqueado por la foto se libera solo al recargar, se reintenta sin foto, la hora entra y la foto sigue en el equipo",
      "criterio 7: marcacion diferida expirada se CIERRA, se ve con su accion y no queda por enviar",
      "criterio 8: con el advisory lock sostenido por otra conexion hay un solo POST en vuelo y el 503 es MARCACION_CONCURRENCIA_TEMPORAL",
      "criterio 10b: el supervisor registra desde la pantalla la hora que falta, queda sellada, abre la novedad y se ve en la trazabilidad",
      "la evidencia degradada aparece nombrada en el reporte del supervisor",
      "avisos legibles en tema claro y en tema oscuro con la razon de contraste medida en el navegador"
    ]
  },
  fixture: {},
  checks: [],
  observations: {},
  queue_snapshots: [],
  avisos_vistos: [],
  console_errors: [],
  console_noise: [],
  page_errors: [],
  network: [],
  status: "running"
};

function check(name, ok, detail = {}) {
  result.checks.push({ name, ok: Boolean(ok), detail });
  console.error(`[cert] ${String(result.checks.length).padStart(2, "0")} ${ok ? "OK  " : "FALLA"} ${name}`);
  if (!ok) throw new Error(`Fallo de certificacion: ${name} ${JSON.stringify(detail).slice(0, 900)}`);
}

// Ningun data URL de selfie ni cadena de conexion entra al JSON de evidencia.
function redact(value, depth = 0) {
  if (typeof value === "string") {
    if (value.length <= 120) return value;
    const kind = /^data:[^;]+;base64,/.test(value) ? "data-url" : "cadena";
    return `<${kind} de ${value.length} caracteres suprimida>`;
  }
  if (Array.isArray(value)) return depth > 4 ? `[${value.length} elementos]` : value.map((item) => redact(item, depth + 1));
  if (value && typeof value === "object") {
    if (depth > 4) return `{${Object.keys(value).length} claves}`;
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redact(item, depth + 1)]));
  }
  return value;
}

function loadSharp() {
  for (const candidate of [path.join(API, "node_modules/sharp"), path.join(ROOT, "node_modules/sharp"), "sharp"]) {
    try {
      return require(candidate);
    } catch {
      /* sigue buscando */
    }
  }
  return null;
}
const sharp = loadSharp();

async function capture(route, { token = "", method = "GET", body } = {}) {
  const started = Date.now();
  let status = 0;
  let payload = {};
  try {
    const response = await fetch(`${API_URL}${route}`, {
      method,
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(40_000)
    });
    status = response.status;
    payload = await response.json().catch(() => ({}));
  } catch (error) {
    payload = { transport_error: error.message };
  }
  return { status, payload, latency_ms: Date.now() - started };
}

async function login(email) {
  const response = await capture("/api/v1/auth/login", { method: "POST", body: { email, password: PASSWORD } });
  if (response.status !== 200 || !response.payload?.token) throw new Error(`Login fallo para ${email}: ${response.status} ${response.payload?.code || ""}`);
  return response.payload.token;
}

async function buildFixtures() {
  const jpeg = await sharp({ create: { width: 48, height: 48, channels: 3, background: { r: 180, g: 140, b: 110 } } }).jpeg({ quality: 90 }).toBuffer();
  const png = await sharp({ create: { width: 40, height: 40, channels: 3, background: { r: 9, g: 20, b: 40 } } }).png().toBuffer();
  // HEIC sintetica con marca mayor `heic`: contenedor HEIF legitimo que este build no decodifica.
  const heic = Buffer.concat([
    Buffer.from([0, 0, 0, 24]), Buffer.from("ftyp"), Buffer.from("heic"),
    Buffer.from([0, 0, 0, 24]), Buffer.from("heic"), Buffer.from("mif1"),
    Buffer.alloc(600, 11)
  ]);
  return { jpeg, png, heic };
}

async function waitForHttp(url, attempts = 90) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
      if (response.ok) return response.status;
    } catch {
      /* aun arrancando */
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`El servicio en ${url} no quedo disponible`);
}

function currentCommit() {
  try {
    return child.execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8", cwd: ROOT }).trim();
  } catch {
    return "unknown";
  }
}

// `certified_commit` es un SHA de HEAD y HEAD sigue intacto cuando el arnes esta editado sin
// commitear: el 2026-11-19 la evidencia decia `8e16a436` mientras el medidor de contraste que la
// produjo vivia solo en el arbol de trabajo. El SHA por si solo no distingue los dos casos, asi que
// la evidencia declara si el arbol estaba limpio al momento de la corrida.
function workingTreeState() {
  try {
    const paths = child.execFileSync("git", ["status", "--porcelain"], { encoding: "utf8", cwd: ROOT })
      .split(/\r?\n/).filter(Boolean);
    return { dirty: paths.length > 0, rutas_modificadas: paths.length };
  } catch {
    return { dirty: null, rutas_modificadas: null };
  }
}

// `next start` sirve lo que hay en `.next` sin comparar fuentes: con un artefacto viejo este arnes
// certificaria codigo que ya no esta en el repo (trampa medida el 2026-11-19). Si cualquier fuente
// del frontend es mas nueva que el ultimo manifiesto del build, se construye aqui y con el entorno
// con el que se va a servir.
const WEB_BUILD_MARKERS = [
  path.join(WEB, ".next", "BUILD_ID"),
  path.join(WEB, ".next", "prerender-manifest.json")
];
const WEB_BUILD_SOURCES = [
  path.join(WEB, "app"),
  path.join(WEB, "components"),
  path.join(WEB, "lib")
];
const BUILD_SKIP_TOKENS = new Set(["node_modules", ".next", ".next-dev", ".git", "standalone"]);

function newestMtime(target, depth = 0) {
  const stats = fs.statSync(target);
  if (stats.isFile()) return stats.mtimeMs;
  if (depth > 7) return 0;
  let newest = stats.mtimeMs;
  for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || BUILD_SKIP_TOKENS.has(entry.name)) continue;
    newest = Math.max(newest, newestMtime(path.join(target, entry.name), depth + 1));
  }
  return newest;
}

function newestMarkerMtime() {
  const existing = WEB_BUILD_MARKERS.filter((marker) => fs.existsSync(marker));
  if (!existing.length) return 0;
  return Math.max(...existing.map((marker) => fs.statSync(marker).mtimeMs));
}

function webArtifactIsFresh() {
  const markerAt = newestMarkerMtime();
  const stale = WEB_BUILD_SOURCES
    .filter((source) => fs.existsSync(source))
    .map((source) => ({ source: path.relative(ROOT, source), nuevo: newestMtime(source), marca: markerAt }))
    .filter((item) => item.nuevo > item.marca);
  return { fresh: stale.length === 0, obsoletos: stale.map((item) => item.source), marca_iso: markerAt ? new Date(markerAt).toISOString() : null };
}

function buildWeb({ stdio, env }) {
  const nextBin = [path.join(WEB, "node_modules/next/dist/bin/next"), path.join(ROOT, "node_modules/next/dist/bin/next")]
    .find((candidate) => fs.existsSync(candidate));
  if (!nextBin) throw new Error("PREREQUISITO: no se encontro el binario de next.");
  const built = child.spawnSync(process.execPath, [nextBin, "build"], { cwd: WEB, env, stdio });
  if (built.status !== 0) {
    throw new Error(`FALTA PRERREQUISITO: el build de produccion del frontend fallo (${built.status ?? "senal"}); `
      + "este arnes no puede certificar `next start` sobre un artefacto que no compila.");
  }
  return built.status;
}

// --- Ayudantes de navegador -------------------------------------------------------------------

async function clickButtonByText(page, label, { timeout = 30_000, screenshot = "", exact = false } = {}) {
  try {
    await page.waitForFunction((needle, useExact) => {
      const nodes = [...document.querySelectorAll("button")].filter((item) => (useExact
        ? (item.textContent || "").trim() === needle
        : (item.textContent || "").includes(needle)));
      return nodes.some((item) => !item.disabled);
    }, { timeout, polling: 400 }, label, exact);
  } catch {
    const seen = await page.evaluate(() => ({
      path: location.pathname,
      headline: (document.body.innerText || "").slice(0, 500),
      buttons: [...document.querySelectorAll("button")].map((item) => `${(item.textContent || "").trim().slice(0, 46)}${item.disabled ? " [deshabilitado]" : ""}`).slice(0, 40)
    })).catch(() => ({ path: "desconocido", headline: "", buttons: [] }));
    throw new Error(`no se habilito el boton "${label}" en ${timeout}ms: ${JSON.stringify(seen).slice(0, 1400)}`);
  }
  await page.evaluate((needle, useExact) => {
    const button = [...document.querySelectorAll("button")].find((item) => (useExact
      ? (item.textContent || "").trim() === needle
      : (item.textContent || "").includes(needle)) && !item.disabled);
    button.click();
  }, label, exact);
  if (screenshot) await screenshot_(page, screenshot);
}

async function hasButton(page, label, { exact = false } = {}) {
  return page.evaluate((needle, useExact) => [...document.querySelectorAll("button")].some((item) => (useExact
    ? (item.textContent || "").trim() === needle
    : (item.textContent || "").includes(needle))), label, exact);
}

// React controla el valor por estado: asignar `el.value` directo no dispara onChange. Se usa el
// setter nativo y se hacen bubbling los dos eventos que escucha React.
async function setInputByLabel(page, labelText, value) {
  const written = await page.evaluate(({ labelText, value }) => {
    const labels = [...document.querySelectorAll("label")].filter((label) => (label.textContent || "").trim().startsWith(labelText));
    const input = labels.map((label) => label.querySelector("input, textarea, select")).find(Boolean);
    if (!input) return { ok: false, reason: `no hay campo para "${labelText}"` };
    const proto = input.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(input, String(value));
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return { ok: true, value: input.value };
  }, { labelText, value });
  if (!written.ok) throw new Error(`no se pudo escribir "${labelText}": ${written.reason}`);
  return written;
}

// Escribir de a un caracter y soltar Enter: el filtro de empleado del reporte solo aplica en onKeyDown.
async function typeIntoLabel(page, labelText, value) {
  const focused = await page.evaluate((needle) => {
    const labels = [...document.querySelectorAll("label")].filter((label) => (label.textContent || "").trim().startsWith(needle));
    const input = labels.map((label) => label.querySelector("input")).find(Boolean);
    if (!input) return false;
    input.focus();
    return true;
  }, labelText);
  if (!focused) throw new Error(`no se pudo enfocar "${labelText}"`);
  await page.evaluate((needle) => {
    const labels = [...document.querySelectorAll("label")].filter((label) => (label.textContent || "").trim().startsWith(needle));
    const input = labels.map((label) => label.querySelector("input")).find(Boolean);
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, "");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }, labelText);
  await page.keyboard.type(String(value), { delay: 12 });
  await page.keyboard.press("Enter");
}

async function inputValueByLabel(page, labelText, inputType) {
  return page.evaluate(({ labelText, inputType }) => {
    const labels = [...document.querySelectorAll("label")].filter((label) => (label.textContent || "").trim().startsWith(labelText));
    const input = labels.map((label) => label.querySelector(inputType ? `input[type="${inputType}"]` : "input, textarea")).find(Boolean);
    return input ? String(input.value) : null;
  }, { labelText, inputType });
}

async function writeQueue(page, items) {
  await page.evaluate(({ key, payload }) => localStorage.setItem(key, JSON.stringify(payload)), { key: QUEUE_KEY, payload: items });
}

async function readQueue(page) {
  return page.evaluate((key) => {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }, QUEUE_KEY);
}

async function readStringList(page, key) {
  return page.evaluate((storageKey) => {
    try {
      const parsed = JSON.parse(localStorage.getItem(storageKey) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }, key);
}

async function bodyText(page) {
  return page.evaluate(() => document.body.innerText || "").catch(() => "");
}

async function screenshot_(page, name) {
  await page.screenshot({ path: path.join(EVIDENCE_DIR, name), fullPage: true }).catch(() => undefined);
}

// Razon de contraste WCAG 2.1 leida del color que el navegador realmente pinto.
async function measureContrast(page, matchText) {
  return page.evaluate((needle) => {
    const parse = (color) => {
      const match = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)/.exec(String(color || ""));
      if (!match) return null;
      return { r: Number(match[1]), g: Number(match[2]), b: Number(match[3]), a: match[4] === undefined ? 1 : Number(match[4]) };
    };
    const luminance = ({ r, g, b }) => {
      const channel = (value) => {
        const c = value / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
    };
    // Se mide el nodo MAS INTERNO y MAS AJUSTADO al texto, no el primero que lo contiene: en
    // document order un <div> contenedor aparece antes que su <p>, y medir el contenedor da la
    // tinta y el fondo del panel (242,245,247 sobre 15,23,32) en lugar de los del aviso. Medido
    // asi, el ratio del aviso quedaba verde sin haber mirado nunca el aviso.
    const conTexto = [...document.querySelectorAll("p, div, li, span, strong")].filter((node) => (node.textContent || "").includes(needle));
    const hojas = conTexto.filter((node) => !conTexto.some((otro) => otro !== node && node.contains(otro)));
    const candidate = hojas.sort((a, b) => (a.textContent || "").length - (b.textContent || "").length)[0] || null;
    if (!candidate) return { found: false, needle: String(needle).slice(0, 60) };
    const etiqueta = candidate.tagName.toLowerCase() + "." + String(candidate.className || "").split(/\s+/).filter(Boolean).slice(0, 4).join(".");
    const style = getComputedStyle(candidate);
    const fg = parse(style.color);
    // El fondo NO es el primer ancestro opaco: en modo oscuro el repo repinta las utilidades de
    // Tailwind con capas semitransparentes (`html.dark .bg-amber-50` = rgb(120 53 15 / 0.28) en
    // globals.css:1446), y saltarselas mide la tinta sobre el panel que hay DETRAS del aviso. El
    // navegador compone de atras hacia adelante, asi que se recorre la cadena guardando las capas
    // translucidas y se compositan sobre la base opaca mas cercana.
    const capas = [];
    let base = null;
    let node = candidate;
    while (node && !base) {
      const own = parse(getComputedStyle(node).backgroundColor);
      if (own) {
        if (own.a >= 0.999) base = own;
        else if (own.a > 0) capas.push(own);
      }
      node = node.parentElement;
    }
    if (!fg || !base) return { found: true, nodo: etiqueta, fg: style.color, bg: null, ratio: 0 };
    const mezcla = (capa, fondo) => ({
      r: Math.round(capa.a * capa.r + (1 - capa.a) * fondo.r),
      g: Math.round(capa.a * capa.g + (1 - capa.a) * fondo.g),
      b: Math.round(capa.a * capa.b + (1 - capa.a) * fondo.b)
    });
    const background = capas.reverse().reduce((fondo, capa) => mezcla(capa, fondo), base);
    const [light, dark] = [luminance(fg), luminance(background)].sort((left, right) => right - left);
    return {
      found: true,
      nodo: etiqueta,
      fg: style.color,
      bg: `rgb(${background.r}, ${background.g}, ${background.b})`,
      base_opaca: `rgb(${base.r}, ${base.g}, ${base.b})`,
      capas_translucidas: capas.length,
      ratio: Number(((light + 0.05) / (dark + 0.05)).toFixed(2)),
      font_size_px: Number.parseFloat(style.fontSize) || 0,
      font_weight: style.fontWeight
    };
  }, matchText);
}

async function setTheme(page, mode) {
  // Primero el control real (components/system/ThemeToggle.tsx); si la pantalla no lo monta, se
  // aplica el mismo mecanismo que usa el producto: clase `dark`, data-theme y localStorage.
  const clicked = await page.evaluate((label) => {
    const button = [...document.querySelectorAll("button")].find((item) => (item.getAttribute("aria-label") || "") === label);
    if (!button) return false;
    button.click();
    return true;
  }, mode === "dark" ? "Cambiar a modo oscuro" : "Cambiar a modo claro");
  if (!clicked) {
    await page.evaluate((value) => {
      localStorage.setItem("apex_theme", value);
      document.documentElement.classList.toggle("dark", value === "dark");
      document.documentElement.dataset.theme = value;
    }, mode);
  }
  await new Promise((resolve) => setTimeout(resolve, 450));
  const applied = await page.evaluate(() => ({
    dark: document.documentElement.classList.contains("dark"),
    data_theme: document.documentElement.dataset.theme || null,
    stored: localStorage.getItem("apex_theme") || null
  }));
  return { applied, via: clicked ? "control flotante" : "mecanismo del producto" };
}

// --- Corrida ----------------------------------------------------------------------------------

async function main() {
  let apiProcess = null;
  let webProcess = null;
  let browser = null;
  const cleanup = { tenantId: null, userIds: [], roleIds: [], employeeIds: [], routeIds: [] };
  // El 503 de la contencion es buscado y legitimo; cualquier otro 5xx o un P2028 detiene todo.
  const failures = { server_errors: [], p2028: [] };
  const punchWindows = [];
  const seenNotices = new Set();

  if (!fs.existsSync(CHROME)) throw new Error(`PREREQUISITO: no existe Chrome en ${CHROME}`);
  if (!sharp) throw new Error("PREREQUISITO: sharp no esta disponible; sin el no hay fixtures reales de evidencia");
  if (!fs.existsSync(path.join(WEB, ".next", "BUILD_ID"))) {
    throw new Error("PREREQUISITO: apps/web/.next/BUILD_ID no existe. Ejecuta el build de produccion de apps/web antes que `next start`.");
  }
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  fs.mkdirSync(LOG_DIR, { recursive: true });

  try {
    result.certified_commit = currentCommit();
    result.arbol_de_trabajo = workingTreeState();

    // El API hijo hereda DATABASE_URL: si el host esta caido, `/health` responde 500 y el arnes
    // cuelga en `waitForHttp` sin decir la causa. El puesto tiene dos puertos PostgreSQL activos
    // (5432 de Windows, 55432 del compose del repo) y el `.env` local apunta a 54320 muerto:
    // se comprueba la conexion ANTES de levantar nada y se nombra el host resuelto.
    try {
      await prisma.$queryRaw`SELECT 1 AS ok`;
    } catch (error) {
      const host = DATABASE_URL.replace(/\/\/[^@]*@/, "//").replace(/:[^:@]*@/, "@");
      throw new Error(`PREREQUISITO: no hay base de datos accesible en ${host} (${String(error.message).split("\n")[2] || error.message}). `
        + "El PostgreSQL local del compose del repo escucha en localhost:55432; exporta DATABASE_URL a ese host para esta corrida.");
    }
    result.database_url_host = DATABASE_URL.replace(/\/\/[^@]*@/, "//***@");

    // ---- Arranque: build fresco + API real + frontend servido desde ese build ----
    const freshness = webArtifactIsFresh();
    if (!freshness.fresh) {
      const buildLog = fs.openSync(path.join(LOG_DIR, "web-build.log"), "a");
      try {
        buildWeb({ stdio: ["ignore", buildLog, buildLog], env: { ...process.env, NEXT_PUBLIC_API_URL: "", NODE_ENV: "production" } });
      } finally {
        fs.closeSync(buildLog);
      }
    }
    result.frontend_build = { ...webArtifactIsFresh(), reconstruido: !freshness.fresh };
    apiProcess = child.spawn(process.execPath, ["server.js"], {
      cwd: API,
      env: {
        ...process.env,
        PORT: String(API_PORT),
        DISABLE_REDIS: "true",
        // El planificador del proceso certificado no debe cerrar jornadas ni procesar colas de fondo:
        // las filas que mide este arnes son las que escribe el navegador, nada mas.
        SCHEDULER_ENABLED: "false",
        LOG_LEVEL: "error"
      },
      stdio: ["ignore", fs.openSync(path.join(LOG_DIR, "api.log"), "a"), fs.openSync(path.join(LOG_DIR, "api.log"), "a")]
    });
    await waitForHttp(`${API_URL}/health`);
    const health = await fetch(`${API_URL}/health`, { signal: AbortSignal.timeout(5000) }).then((response) => response.json());
    check("api_health_ok", health?.status === "OK", { commit: health?.commit || null });

    const nextBin = [path.join(WEB, "node_modules/next/dist/bin/next"), path.join(ROOT, "node_modules/next/dist/bin/next")]
      .find((candidate) => fs.existsSync(candidate));
    if (!nextBin) throw new Error("PREREQUISITO: no se encontro el binario de next.");
    // NEXT_PUBLIC_API_URL vacio a proposito: el cliente debe ir al mismo origen y dejar que el proxy
    // `apps/web/app/api/v1/[...path]/route.ts` reenvie a la API. Con la URL horneada se certificaria
    // otro camino (y esa era justo una de las causas medidas del incidente).
    webProcess = child.spawn(process.execPath, [nextBin, "start", "-p", String(WEB_PORT), "-H", "127.0.0.1"], {
      cwd: WEB,
      env: { ...process.env, API_URL, NEXT_PUBLIC_API_URL: "", NODE_ENV: "production" },
      stdio: ["ignore", fs.openSync(path.join(LOG_DIR, "web.log"), "a"), fs.openSync(path.join(LOG_DIR, "web.log"), "a")]
    });
    await waitForHttp(`${WEB_URL}/login`);

    // La variable horneada que importa es `NEXT_PUBLIC_API_URL`: si el bundle trajera una URL, el
    // navegador hablaria directo con ese origen y el proxy del mismo origen (que es lo que se
    // certifica) no existiria en el camino. `127.0.0.1:3000` es otro dato horneado y no dice nada
    // de esta corrida: el patron busca la clave con valor no vacio.
    const buildId = fs.readFileSync(path.join(WEB, ".next", "BUILD_ID"), "utf8").trim();
    const bakedFiles = [];
    const scanBaked = (directory) => {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const full = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          scanBaked(full);
        } else if (entry.name.endsWith(".js")) {
          const source = fs.readFileSync(full, "utf8");
          const match = /NEXT_PUBLIC_API_URL:\s*"([^"]+)"/.exec(source);
          if (match) bakedFiles.push({ archivo: path.relative(ROOT, full), valor: match[1] });
        }
      }
    };
    scanBaked(path.join(WEB, ".next", "static"));
    check("web_sirve_el_build_de_produccion_sin_origen_horneado", Boolean(buildId) && bakedFiles.length === 0, {
      build_id: buildId, archivos_con_origen_horneado: bakedFiles.slice(0, 5), web_url: WEB_URL, frontend_build: result.frontend_build
    });

    // ---- Fixtures de base ----
    const FIX = await buildFixtures();
    const tenants = await prisma.tenant.findMany({ select: { id: true, name: true, active: true, active_modules: true } });
    const withHr = tenants.filter((tenant) => tenant.active !== false && (Array.isArray(tenant.active_modules) ? tenant.active_modules : [])
      .map((code) => String(code || "").trim().toLowerCase()).some((code) => HR_CODES.includes(code)));
    const tenant = withHr.find((item) => /puebla|operaciones/i.test(String(item.name || ""))) || withHr[0];
    if (!tenant) throw new Error("No hay tenant con modulo Talento Humano en la base local.");
    cleanup.tenantId = tenant.id;

    const supervisorRole = await admin.createRole(tenant.id, {
      name: `QA MarcaCola Supervisor ${RUN_ID}`,
      description: "Rol temporal de certificacion con hr:write para la correccion administrativa (se desactiva al final).",
      permissions: { talento_humano: { view: true, edit: true } }
    });
    const operarioRole = await admin.createRole(tenant.id, {
      name: `QA MarcaCola Operario ${RUN_ID}`,
      description: "Rol temporal de certificacion para el canal propio de marcacion (se desactiva al final).",
      permissions: { marcaciones: { view: true, create: true } }
    });
    cleanup.roleIds.push(supervisorRole.id, operarioRole.id);

    // `roleDto` devuelve los permisos en la forma amigable (`modulo: { view, edit }`); las filas
    // canonicas `hr:write` las arma el login, y es ahi donde se comprueba el permiso real.
    check("rol_del_supervisor_lleva_edicion_de_talento_humano", supervisorRole.permissions?.talento_humano?.edit === true, {
      talento_humano: supervisorRole.permissions?.talento_humano || null
    });

    const userShape = (label, roleId, slug, { canPunch = false } = {}) => ({
      name: `QA MarcaCola ${label} ${RUN_ID}`,
      first_names: "QA",
      last_names: `${label} ${RUN_ID}`,
      email: `${EMAIL_PREFIX}${slug}.${RUN_ID}@apex.test`,
      password: PASSWORD,
      role_id: roleId,
      company: "QA",
      document: `QAMQB${RUN_ID.slice(-12)}${slug}`,
      code: `${CODE_PREFIX}${slug}-${RUN_ID.slice(-10)}`.slice(0, 24),
      department: "QA",
      position: "Operario de certificacion",
      operational_classification: "operativo",
      can_punch_time: canPunch,
      can_be_assigned_routes: true,
      require_password_change: false
    });
    const supervisor = await admin.createUser(tenant.id, userShape("Supervisor", supervisorRole.id, "sup"));
    const operario = await admin.createUser(tenant.id, userShape("Operario", operarioRole.id, "ope", { canPunch: true }));
    cleanup.userIds.push(supervisor.id, operario.id);
    for (const user of [supervisor, operario]) if (user.employee_id) cleanup.employeeIds.push(user.employee_id);
    const ficha = operario.employee_id;
    check("fixture_ficha_del_operario", Number.isInteger(ficha) && ficha > 0, { operario_id: operario.id, ficha });

    const alias = String(operario.name || `${EMAIL_PREFIX}ope.${RUN_ID}`).trim();
    const supervisorEmail = `${EMAIL_PREFIX}sup.${RUN_ID}@apex.test`;
    const operarioEmail = `${EMAIL_PREFIX}ope.${RUN_ID}@apex.test`;

    const dayDescosido = dayBack(2);
    const dayStall = dayBack(3);
    const dayPng = dayBack(4);
    const dayHeic = dayBack(5);
    const daySelfHeal = dayBack(6);
    const dayCorrection = dayBack(7);
    const dayExpired = dayBack(8);

    const createRoute = async (day, label) => {
      const created = await prisma.runWithTenant(tenant.id, () => prisma.timeRoute.create({
        data: {
          tenant_id: tenant.id,
          date: new Date(`${day}T12:00:00.000Z`),
          employees: [alias],
          start_time: "06:00",
          end_time: "18:00",
          status: "active",
          kind: "trabajo",
          notes: `Horario temporal de certificacion ${label} (se elimina al terminar)`
        },
        select: { id: true, date: true, start_time: true, end_time: true }
      }));
      cleanup.routeIds.push(created.id);
      return created;
    };
    const expiredRoute = await createRoute(dayExpired, "ventana de 24 h vencida");
    const correctionRoute = await createRoute(dayCorrection, "prefijo de la hora autorizada");

    result.fixture = {
      tenant: { id: tenant.id, name: tenant.name },
      operario: { id: operario.id, email: operarioEmail, ficha },
      supervisor: { id: supervisor.id, email: supervisorEmail },
      dias: { contencion: dayStall, png: dayPng, heic: dayHeic, autorrecuperada: daySelfHeal, correccion: dayCorrection, vencida: dayExpired },
      horarios: { vencida: expiredRoute.id, correccion: correctionRoute.id },
      evidencia_bytes: { jpeg: FIX.jpeg.length, png: FIX.png.length, heic: FIX.heic.length }
    };

    // ---- Navegador ----
    browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 1200 });
    page.setDefaultTimeout(NAV_TIMEOUT);
    page.on("console", (message) => {
      if (message.type() !== "error") return;
      const text = String(message.text());
      // "Failed to load resource" es el eco del navegador ante cualquier HTTP >=400, ya registrado.
      if (/^Failed to load resource/i.test(text)) return;
      const benigna = noiseBenigna(text);
      if (benigna) {
        const clave = `${benigna.reason}|${text.slice(0, 160)}`;
        const vista = result.console_noise.find((item) => item.clave === clave);
        if (vista) vista.veces += 1;
        // 110 caracteres: por encima de ese largo el `redact` del JSON suprime la cadena y la
        // evidencia quedaria con el motivo pero sin el mensaje que se excluyo.
        else result.console_noise.push({ clave, motivo: benigna.reason, texto: text.slice(0, 110), veces: 1 });
        return;
      }
      result.console_errors.push(text.slice(0, 300));
    });
    page.on("pageerror", (error) => result.page_errors.push(String(error.message).slice(0, 300)));
    // Puerta del criterio 8: el holder arranca su cronometro cuando la marcacion contendida sale del
    // navegador, no cuando abre la transaccion (ver HOLD_EXTRA_MS).
    let stallSignal = null;
    const stallInFlight = new Promise((resolve) => { stallSignal = resolve; });
    const waitForStallInFlight = () => Promise.race([
      stallInFlight,
      new Promise((resolve) => { const timer = setTimeout(() => resolve(false), HOLD_GATE_TIMEOUT_MS); timer.unref?.(); })
    ]);
    page.on("request", (request) => {
      // Ningun listener puede lanzar: un error aqui mataria el proceso con los fixtures vivos.
      try {
        const url = new URL(request.url());
        if (request.method() !== "POST") return;
        if (url.pathname !== PUNCH_SELF_PATH && url.pathname !== PUNCH_ADMIN_PATH) return;
        const ventana = { path: url.pathname, started_at: Date.now() };
        // Se registra LA FORMA del payload, nunca sus bytes: sin esto un rojo de evidencia no se
        // puede atribuir (no se sabe si la foto salio, si viajo desprendida o con que codigo).
        try {
          const cuerpo = JSON.parse(request.postData() || "{}");
          ventana.dia = String(cuerpo.punched_at || "").slice(0, 10);
          ventana.foto_adjunta = Boolean(cuerpo.identity_photo?.base64 || cuerpo.identity_photo?.base64_data);
          ventana.declaracion = String(cuerpo.metadata?.evidence_status || "");
          ventana.codigo_declarado = String(cuerpo.metadata?.hr_novelty?.failure_code || "");
        } catch {
          /* payload no inspeccionable: la ventana sigue registrada */
        }
        punchWindows.push(ventana);
        if (url.pathname === PUNCH_SELF_PATH && ventana.dia === dayStall) stallSignal?.(ventana);
      } catch (error) {
        // El catch NO puede quedarse mudo: el 2026-11-19 una referencia rota del propio listener se
        // trago aqui la senal del criterio 8 y la corrida rojo decia "no hubo peticion en vuelo"
        // cuando las peticiones si salieron y el API contesto 503.
        result.page_errors.push(`ARNES listener de peticiones: ${String(error?.message || error).slice(0, 180)}`);
      }
    });
    page.on("requestfinished", (request) => {
      try {
        const url = new URL(request.url());
        if (url.pathname !== PUNCH_SELF_PATH && url.pathname !== PUNCH_ADMIN_PATH) return;
        const open = [...punchWindows].reverse().find((item) => item.path === url.pathname && item.ended_at === undefined);
        if (open) open.ended_at = Date.now();
      } catch {
        /* ignorado */
      }
    });
    page.on("response", (response) => {
      try {
        const url = new URL(response.url());
        if (!url.pathname.startsWith("/api/v1/")) return;
        const status = response.status();
        result.network.push({ method: response.request().method(), path: url.pathname, status });
        if (status >= 500) failures.server_errors.push({ path: url.pathname, status });
        if (status < 400) return;
        response.json().then((body) => {
          const open = [...punchWindows].reverse().find((item) => item.path === url.pathname && item.code === undefined);
          if (open) {
            open.code = String(body?.code || "");
            open.status = status;
          }
          if (JSON.stringify(body || {}).includes("P2028")) failures.p2028.push({ path: url.pathname, status });
        }).catch(() => undefined);
      } catch {
        /* respuesta sin cuerpo */
      }
    });

    await page.goto(`${WEB_URL}/login`, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT });
    await page.waitForSelector('input[name="email"]', { timeout: NAV_TIMEOUT });
    await page.type('input[name="email"]', operarioEmail);
    await page.type('input[name="password"]', PASSWORD);
    await page.click('form button[type="submit"]');
    await page.waitForFunction(() => !location.pathname.endsWith("/login"), { timeout: NAV_TIMEOUT });
    check("login_real_del_operario", true, { ruta: await page.evaluate(() => location.pathname) });

    // El literario de las pantallas no puede derivar sin que la certificacion se entere.
    const webSources = [
      path.join(WEB, "lib/hrOfflineMarking.ts"),
      path.join(WEB, "app/dashboard/talento-humano/marcacion/page.tsx"),
      path.join(WEB, "app/dashboard/talento-humano/reportes/page.tsx")
    ].map((file) => fs.readFileSync(file, "utf8")).join("\n");
    const literalesAusentes = Object.values(SENTENCES).filter((text) => !webSources.includes(text));
    check("literales_sin_deriva", literalesAusentes.length === 0, { ausentes: literalesAusentes });

    // Entrar una vez a la pantalla: el sembrado se hace sobre el almacenamiento de la misma
    // aplicacion y el ciclo de sincronizacion arranca al montar, no antes.
    await page.goto(`${WEB_URL}/dashboard/talento-humano/marcacion`, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT });
    await page.waitForFunction(() => document.body.innerText.length > 40, { timeout: NAV_TIMEOUT });

    // =========================================================================
    // Cola sembrada: la forma exacta que deja el cliente en el dispositivo.
    // La foto viaja inline en el payload (no externalizada a IndexedDB) porque
    // asi es como el incidente de produccion la guardo y asi es como el servidor
    // la rechaza; el arnes no escribe almacenes a mano: deja que la app los cree.
    // =========================================================================
    const jpegPhoto = { base64: FIX.jpeg.toString("base64"), type: "image/jpeg", name: "selfie.jpg", size: FIX.jpeg.length };
    const pngPhoto = { base64: FIX.png.toString("base64"), type: "image/jpeg", name: "selfie.jpg", size: FIX.png.length };
    const heicPhoto = { base64: FIX.heic.toString("base64"), type: "image/jpeg", name: "selfie.jpg", size: FIX.heic.length };
    const brokenPhoto = { base64: "no-es-base64-@@@!!!!", type: "image/jpeg", name: "selfie.jpg", size: 640 };

    const queuedItem = ({ tag, day, clock, photoShape, status = "queued", blockedCode = "", blockedReason = "", routeId = null }) => {
      const key = `qb-${RUN_ID}-${tag}`;
      const item = {
        id: `${Date.now()}-${tag}`,
        path: PUNCH_SELF_PATH,
        created_at: new Date(`${day}T${clock}:00${OPERATING_OFFSET}`).toISOString(),
        attempts: 0,
        label: "Inicio jornada",
        status,
        payload: {
          employee_id: ficha,
          user_name: alias,
          type: "entrada",
          punched_at: `${day}T${clock}:00${OPERATING_OFFSET}`,
          latitude: 6.2442,
          longitude: -75.5812,
          accuracy_meters: 9,
          idempotency_key: key,
          metadata: {
            source: "apexos-mobile",
            current_user_only: true,
            idempotency_key: key,
            gps_required: true,
            tracking_mode: "gps",
            offline: true
          },
          ...(photoShape ? { identity_photo: photoShape } : {})
        }
      };
      if (blockedCode) {
        item.blocked_code = blockedCode;
        item.blocked_reason = blockedReason;
      }
      if (routeId) {
        item.payload.route_id = routeId;
        item.payload.metadata.hr_route_sync = { route_id: routeId, synced_at: item.created_at };
      }
      return item;
    };

    const stalled = queuedItem({ tag: "cont", day: dayStall, clock: "06:00", photoShape: jpegPhoto });
    const conPng = queuedItem({ tag: "png", day: dayPng, clock: "06:10", photoShape: pngPhoto });
    const conHeic = queuedItem({ tag: "heic", day: dayHeic, clock: "06:20", photoShape: heicPhoto });
    // El incidente de produccion: la version anterior bloque el elemento por la foto y la hora
    // qued "por enviar" todo el dia. Se siembra tal como qued en ese dispositivo.
    const autorrecuperada = queuedItem({
      tag: "heal", day: daySelfHeal, clock: "06:30", photoShape: brokenPhoto,
      status: "blocked", blockedCode: "EVIDENCIA_ALFABETO_INVALIDO",
      blockedReason: "La foto de validacion no pudo procesarse. Contacte a su supervisor."
    });
    const vencida = queuedItem({ tag: "venc", day: dayExpired, clock: "06:00", photoShape: jpegPhoto, routeId: expiredRoute.id });
    // Foto con alfabeto invalido que el servidor rechaza EN EL ENVIO (no en el montaje): es la rama
    // retry_without_photo, la que produce el aviso de hora recuperada.
    const descosida = queuedItem({ tag: "desc", day: dayDescosido, clock: "05:50", photoShape: brokenPhoto });

    const seededQueue = [stalled, conPng, conHeic, autorrecuperada, vencida, descosida];
    check("cola_semada_con_la_forma_de_la_pantalla", true
      && seededQueue.length === 6
      && seededQueue.every((item) => item.path === PUNCH_SELF_PATH && item.payload.punched_at && item.payload.idempotency_key
        && Boolean(item.payload.identity_photo?.base64)), {
      items: seededQueue.map((item) => ({
        dia: String(item.payload.punched_at).slice(0, 10), estado: item.status, codigo: item.blocked_code || null,
        foto_en_almacen_local: Boolean(item.payload.identity_photo)
      }))
    });

    // ---- Criterio 8: concurrencia real sostenida desde otra conexion ----
    const stallScope = lockScopeFor(tenant.id, ficha, dayStall);
    let holderAcquired = false;
    let holderSettled = false;
    const holder = prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw`SELECT pg_try_advisory_xact_lock(hashtextextended(${stallScope}, 0)) AS acquired`;
      holderAcquired = rows?.[0]?.acquired === true;
      // Sin el lock no hay contencion que sostener, y si la marcacion nunca salio del navegador
      // tampoco: en ambos casos el holder se retira y el control positivo lo reporta rojo.
      if (!holderAcquired || !(await waitForStallInFlight())) return false;
      await tx.$executeRaw`SELECT pg_sleep(${(CONTENTION_DEADLINE_MS + HOLD_EXTRA_MS) / 1000}::double precision)`;
      return true;
    }, { maxWait: 5_000, timeout: HOLD_GATE_TIMEOUT_MS + CONTENTION_DEADLINE_MS + HOLD_EXTRA_MS + 60_000 })
      .then(() => { holderSettled = true; return true; })
      .catch(() => { holderSettled = true; return false; });

    await writeQueue(page, seededQueue);
    // El sembrado es parte de lo que se mide: si la cola no sobrevive a la escritura en el navegador,
    // cualquier rojo despues de este punto es del arnes y no del producto (regla 23).
    const leidoAlSembrar = await readQueue(page);
    check("cola_semada_leida_desde_el_navegador", leidoAlSembrar.length === seededQueue.length
      && leidoAlSembrar.every((item) => item.path === PUNCH_SELF_PATH && item.payload?.punched_at), {
      escritas: seededQueue.length, leidas: leidoAlSembrar.length,
      estados: leidoAlSembrar.map((item) => item.status || "queued")
    });
    await page.reload({ waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT });
    // El control positivo se mide con la marcacion ya en vuelo: afirma que ESTE arnes le sostiene el
    // lock al cliente mientras espera. Sin eso, un "no hubo 503" no se puede atribuir a nadie.
    const enVuelo = await waitForStallInFlight();
    check("lock_de_marcacion_sostenido_desde_otra_conexion", enVuelo !== false
      && holderAcquired === true && holderSettled === false, {
      ambito: stallScope, sostiene_ms: CONTENTION_DEADLINE_MS + HOLD_EXTRA_MS,
      peticion_en_vuelo: enVuelo !== false, adquirido: holderAcquired, asentado: holderSettled,
      // Distingue el "el navegador no mando nada" del "mando pero no le reconoci el dia": sin esta
      // lista, las dos se ven igual en la evidencia y la corrida cuesta diez minutos cada vez.
      ventanas_punch: punchWindows.map((ventana) => ventana.dia || "sin-dia")
    });
    const contentionDeadline = Date.now() + CONTENTION_DEADLINE_MS + 60_000;
    let stallSeen = null;
    while (Date.now() < contentionDeadline && !stallSeen) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      stallSeen = punchWindows.find((item) => item.code === "MARCACION_CONCURRENCIA_TEMPORAL") || null;
      const text = await bodyText(page);
      Object.values(SENTENCES).forEach((sentence) => { if (text.includes(sentence)) seenNotices.add(sentence); });
    }
    if (!stallSeen) {
      // Diagnostico del rojo: sin esto la certificacion dice "no hubo 503" y no de quien es la culpa.
      // Las cadenas se parten en lineas cortas porque `redact` suprime todo lo que pasa de 120 caracteres.
      const colaAlFallar = await readQueue(page);
      result.diagnostico_sin_contencion = {
        cola_actual: colaAlFallar.map((item) => ({
          estado: item.status || "queued", codigo: item.blocked_code || null, intentos: item.attempts,
          refs_del_item: item.evidence_refs || null,
          marcador: item.payload?.identity_photo || null,
          motivo: String(item.blocked_reason || "").slice(0, 105)
        })),
        peticiones_de_marcacion: punchWindows,
        rutas_vistas: [...new Set(result.network.map((entry) => `${entry.method} ${entry.path} ${entry.status}`))].slice(0, 25),
        texto_pantalla: (await bodyText(page)).split("\n").map((line) => line.slice(0, 100)).filter(Boolean).slice(0, 18)
      };
    }
    await holder;
    check("criterio8_la_contencion_devuelve_503_reintentable", Boolean(stallSeen), {
      codigo: stallSeen?.code || null, duracion_ms: stallSeen?.ended_at ? stallSeen.ended_at - stallSeen.started_at : null
    });

    // La cola tarda en asentarse: self-heal, reintentos con respaldo y el cierre de la vencida.
    // Se muestrea el texto cada 500 ms porque los avisos de `onUpdate` son transitorios: un ciclo
    // lento confirmaria el guardado en base pero no que el operario lo vio en pantalla.
    const settleStarted = Date.now();
    let snapshot = [];
    let screenText = "";
    for (;;) {
      snapshot = await readQueue(page);
      screenText = await bodyText(page);
      Object.values(SENTENCES).forEach((sentence) => { if (screenText.includes(sentence)) seenNotices.add(sentence); });
      const stillQueued = snapshot.filter((item) => !item.status || item.status === "queued");
      if (!stillQueued.length || Date.now() - settleStarted > QUEUE_SETTLE_TIMEOUT_MS) break;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    result.observations.settle_ms = Date.now() - settleStarted;
    result.avisos_vistos = [...seenNotices];
    result.queue_snapshots.push({ momento: "asentada", items: snapshot.map((item) => ({
      estado: item.status || "queued", codigo: item.blocked_code || null, intentos: item.attempts,
      evidencia_degradada: Boolean(item.evidence_degraded), novedad: item.escalated_novelty || null,
      dia: String(item.payload?.punched_at || "").slice(0, 10)
    })) });
    const byDay = (dia) => snapshot.find((item) => String(item.payload?.punched_at || "").slice(0, 10) === dia) || null;

    // ---- Criterio 8: medicion de ciclos ----
    const ordered = [...punchWindows].filter((item) => item.path === PUNCH_SELF_PATH).sort((left, right) => left.started_at - right.started_at);
    const overlaps = [];
    for (let i = 1; i < ordered.length; i += 1) {
      const previous = ordered[i - 1];
      if (previous.ended_at && ordered[i].started_at < previous.ended_at) {
        overlaps.push({ anterior_fin: previous.ended_at - previous.started_at, solapado_ms: previous.ended_at - ordered[i].started_at });
      }
    }
    result.observations.punch_requests = ordered.map((item) => ({
      inicio: new Date(item.started_at).toISOString(), duracion_ms: item.ended_at ? item.ended_at - item.started_at : null,
      estado: item.status || null, codigo: item.code || null, dia: item.dia || null, foto_adjunta: item.foto_adjunta ?? null,
      declaracion: item.declaracion || null, codigo_declarado: item.codigo_declarado || null
    }));
    check("criterio8_nunca_dos_ciclos_simultaneos", overlaps.length === 0, { peticiones: ordered.length, solapamientos: overlaps });
    check("criterio8_sin_amplificacion_de_peticiones", ordered.length <= seededQueue.length * 3, {
      peticiones: ordered.length, encoladas: seededQueue.length, limite: seededQueue.length * 3,
      detalle: result.observations.punch_requests
    });
    const esperaReal = ordered.find((item) => item.code === "MARCACION_CONCURRENCIA_TEMPORAL");
    const dentroDeLaEspera = esperaReal
      ? ordered.filter((item) => item.started_at > esperaReal.started_at && item.started_at < esperaReal.started_at + OLD_FIXED_DRUMBEAT_MS)
      : [];
    check("criterio8_mientras_hay_una_peticion_en_vuelo_no_sale_otra", Boolean(esperaReal)
      && dentroDeLaEspera.length === 0
      && esperaReal.ended_at - esperaReal.started_at >= CONTENTION_DEADLINE_MS - 2_000, {
      duracion_solicitud_ms: esperaReal ? esperaReal.ended_at - esperaReal.started_at : null,
      salidas_en_la_ventana_de_12s: dentroDeLaEspera.length, tambo_anterior_ms: OLD_FIXED_DRUMBEAT_MS
    });

    // ---- Lectura en base: ninguna jornada se perdio ----
    const punchRow = (day, type = "entrada") => {
      const from = new Date(`${day}T00:00:00${OPERATING_OFFSET}`);
      return prisma.runWithTenant(tenant.id, () => prisma.timePunch.findFirst({
        where: { tenant_id: tenant.id, employee_id: ficha, type, date: { gte: from, lt: new Date(from.getTime() + 86400000) } },
        orderBy: { punched_at: "desc" }
      }));
    };
    const rowPng = await punchRow(dayPng);
    const rowHeic = await punchRow(dayHeic);
    const rowHeal = await punchRow(daySelfHeal);
    const rowStall = await punchRow(dayStall);
    const rowVencida = await punchRow(dayExpired);
    const rowDescosida = await punchRow(dayDescosido);

    const pngMeta = rowPng?.metadata?.identity_photo || {};
    check("criterio2_png_etiquetado_jpeg_guardado_desde_la_cola", Boolean(rowPng) && pngMeta.evidence_status === "available"
      && pngMeta.type === "image/png" && pngMeta.sha256 === sha256(FIX.png), {
      marcacion: Boolean(rowPng), evidence_status: pngMeta.evidence_status || null, tipo: pngMeta.type || null,
      hash_coincide: pngMeta.sha256 === sha256(FIX.png)
    });

    const heicMeta = rowHeic?.metadata?.identity_photo || {};
    check("criterio3_heic_no_cuesta_la_jornada", Boolean(rowHeic) && heicMeta.evidence_status === "degraded"
      && String(heicMeta.evidence_failure_code || "").startsWith("EVIDENCIA_"), {
      marcacion: Boolean(rowHeic), evidence_status: heicMeta.evidence_status || null, codigo: heicMeta.evidence_failure_code || null
    });

    // ---- Criterio 6: el elemento bloqueado por la foto se libero solo al recargar ----
    const healedAvisos = await readStringList(page, SELF_HEAL_KEY);
    check("criterio6_self_heal_libera_el_elemento_bloqueado", healedAvisos.some((aviso) => String(aviso).includes(SENTENCES.selfHealRelease)), {
      avisos: healedAvisos.map((aviso) => String(aviso).slice(0, 120))
    });
    // Las dos ramas de la recuperacion: la del montaje (self-heal de lo que la version anterior
    // encolo bloqueado) y la del envio (la foto se despega cuando el servidor la rechaza en vuelo).
    // En ambas entra la hora, la fila queda degradada con su motivo y declara la novedad.
    const recuperada = (row) => {
      const meta = row?.metadata || {};
      return Boolean(row) && meta.evidence_status === "degraded"
        && String(meta.evidence_detached_reason || "").length > 10
        && !meta.identity_photo?.base64_data && Boolean(meta.hr_novelty);
    };
    check("criterio6_self_heal_envia_la_hora_degradada", recuperada(rowHeal), {
      marcacion: Boolean(rowHeal), evidence_status: rowHeal?.metadata?.evidence_status || null,
      codigo: rowHeal?.metadata?.hr_novelty?.failure_code || null
    });
    check("criterio6_la_hora_sobrevive_al_rechazo_de_la_foto", recuperada(rowDescosida), {
      marcacion: Boolean(rowDescosida), evidence_status: rowDescosida?.metadata?.evidence_status || null,
      motivo_del_desprendimiento: String(rowDescosida?.metadata?.evidence_detached_reason || "").slice(0, 90),
      novedad_declarada: Boolean(rowDescosida?.metadata?.hr_novelty)
    });
    // La hora salio del dispositivo y el item ya no esta en la cola: la foto se desprendio,
    // la jornada no. Que no quedaron bytes en la fila lo mide `ningun_rechazo...` abajo.
    check("criterio6_la_jornada_no_quedo_colgada_por_la_foto", byDay(daySelfHeal) === null && Boolean(rowHeal)
      && byDay(dayDescosido) === null && Boolean(rowDescosida), {
      item_self_heal_encolado: byDay(daySelfHeal) !== null, item_en_vuelo_encolado: byDay(dayDescosido) !== null,
      marcaciones_en_base: [Boolean(rowHeal), Boolean(rowDescosida)].filter(Boolean).length
    });
    check("criterio6_el_aviso_de_hora_recuperada_llega_a_pantalla", seenNotices.has(SENTENCES.degradedMarking)
      && seenNotices.has(SENTENCES.selfHealRelease), {
      avisos_vistos: [...seenNotices].map((text) => text.slice(0, 60))
    });

    // ---- Criterio 7: la vencida deja de estar "por enviar" ----
    const itemVencida = byDay(dayExpired);
    check("criterio7_la_vencida_se_cierra_con_su_codigo", itemVencida?.status === "closed"
      && itemVencida.blocked_code === "MARCACION_DIFERIDA_EXPIRADA", {
      estado: itemVencida?.status || "ausente", codigo: itemVencida?.blocked_code || null
    });
    check("criterio7_la_vencida_no_dejo_marcacion", !rowVencida, { fila_del_dia_vencido: Boolean(rowVencida) });
    check("criterio7_la_pantalla_nombra_la_salida", screenText.includes(SENTENCES.closedCount)
      && (screenText.includes(SENTENCES.expiredEscalation) || String(itemVencida?.blocked_reason || "").includes("supervisor")), {
      cuenta_cerradas: screenText.includes(SENTENCES.closedCount), aviso_escalado: screenText.includes(SENTENCES.expiredEscalation),
      motivo_en_la_fila: String(itemVencida?.blocked_reason || "").slice(0, 120)
    });
    check("criterio7_lo_cerrado_no_cuenta_como_pendiente", snapshot.filter((item) => !item.status || item.status === "queued").length === 0
      && byDay(dayExpired)?.status === "closed", {
      pendientes_restantes: snapshot.filter((item) => !item.status || item.status === "queued").length
    });
    // De las seis piezas sembradas, cinco son jornada que tenia que sobrevivir; la sexta vencio la
    // ventana de 24 h y por eso se cerro (criterio 7).
    check("las_cinco_jornadas_sobrevivieron", Boolean(rowPng && rowHeic && rowHeal && rowStall && rowDescosida), {
      png: Boolean(rowPng), heic: Boolean(rowHeic), autorrecuperada: Boolean(rowHeal), tras_la_contencion: Boolean(rowStall),
      desprendida_en_vuelo: Boolean(rowDescosida)
    });

    // El claro no se asume: la secuencia de la cola dejo el documento en el tema que traia el
    // ambiente, y llamar «claro» a esa lectura sin forzarlo mide la misma paleta dos veces. Se
    // fuerza y se comprueba aplicado, igual que en la pareja 03/04 de trazabilidad.
    const temaClaroCola = await setTheme(page, "light");
    await page.reload({ waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT });
    await page.waitForFunction((needle) => (document.body.innerText || "").includes(needle), { timeout: 30_000 }, SENTENCES.closedCount);
    await screenshot_(page, "01-cola-operario-tema-claro.png");
    const claroCierre = await measureContrast(page, SENTENCES.closedCount);

    // ---- Tema oscuro sobre la misma evidencia ----
    const temaOscuro = await setTheme(page, "dark");
    await page.reload({ waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT });
    await page.waitForFunction((needle) => (document.body.innerText || "").includes(needle), { timeout: 30_000 }, SENTENCES.closedCount);
    const textoOscuro = await bodyText(page);
    await screenshot_(page, "02-cola-operario-tema-oscuro.png");
    const oscuroCierre = await measureContrast(page, SENTENCES.closedCount);
    result.observations.tema = {
      aplicado_claro: temaClaroCola.applied, aplicado_oscuro: temaOscuro.applied, via: temaOscuro.via,
      claro: claroCierre, oscuro: oscuroCierre
    };

    check("tema_oscuro_aplicado_en_el_documento", temaOscuro.applied.dark === true && temaOscuro.applied.stored === "dark", temaOscuro.applied);
    // Mismo contrato que la pareja 03/04: los dos fondos tienen que ser distintos, porque el repo
    // repinta `bg-slate-50`/`text-slate-900` en `html.dark` (globals.css:1068 y :1087). Si la
    // lectura sale identica, el tema no se forzo y el check no puede aprobar legibilidad en claro.
    check("aviso_de_cierre_legible_en_claro_y_oscuro", claroCierre.found && oscuroCierre.found
      && claroCierre.ratio >= 4.5 && oscuroCierre.ratio >= 4.5
      && claroCierre.bg !== oscuroCierre.bg
      && temaClaroCola.applied.dark === false && temaOscuro.applied.dark === true, {
      claro: claroCierre, oscuro: oscuroCierre, temas: { claro: temaClaroCola.applied, oscuro: temaOscuro.applied }
    });
    check("el_aviso_sigue_visible_en_tema_oscuro", textoOscuro.includes(SENTENCES.closedCount), { caracteres: textoOscuro.length });

    // =========================================================================
    // Criterio 10b + evidencia degradada visible: el supervisor
    // =========================================================================
    // Antes de cambiar de usuario hay que tener la fila del dia que se va a corregir: la pantalla
    // solo ofrece el panel sobre una jornada que ya existe y le falta la salida.
    const tokenOpe = await login(operarioEmail);
    const siembraEntrada = await capture(PUNCH_SELF_PATH, {
      token: tokenOpe,
      method: "POST",
      body: {
        employee_id: ficha, user_name: alias, type: "entrada", punched_at: instantAt(dayCorrection, "06:05"),
        latitude: 6.2442, longitude: -75.5812, accuracy_meters: 9,
        identity_photo: jpegPhoto,
        idempotency_key: `qb-${RUN_ID}-corr-in`, metadata: { source: "certificacion-cola" }
      }
    });
    check("entrada_del_dia_a_corregir_registrada_por_el_canal_propio", siembraEntrada.status === 200, {
      estado: siembraEntrada.status, codigo: siembraEntrada.payload?.code || null
    });

    await page.evaluate(() => localStorage.clear());
    await page.goto(`${WEB_URL}/login`, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT });
    await page.waitForSelector('input[name="email"]', { timeout: NAV_TIMEOUT });
    await page.type('input[name="email"]', supervisorEmail);
    await page.type('input[name="password"]', PASSWORD);
    await page.click('form button[type="submit"]');
    await page.waitForFunction(() => !location.pathname.endsWith("/login"), { timeout: NAV_TIMEOUT });
    const permisosAlmacenados = await page.evaluate(() => localStorage.getItem("role_permissions") || "[]");
    const hrWriteAlmacenado = JSON.parse(permisosAlmacenados).some((row) => row?.module === "hr" && row?.action === "write");
    // La pantalla habilita el panel con `hasStoredRolePermission("hr","write")`, que lee estas mismas
    // filas canonicas que evalua el middleware: si el login no las publica, el boton no aparece y la
    // certificacion tiene que decirlo, no forzarlo.
    check("login_real_del_supervisor_con_hr_write_almacenado", hrWriteAlmacenado, {
      ruta: await page.evaluate(() => location.pathname), hr_write: hrWriteAlmacenado,
      modulos: [...new Set(JSON.parse(permisosAlmacenados).map((row) => `${row?.module}:${row?.action}`))].slice(0, 12)
    });

    const abrirJornada = async (day) => {
      await page.goto(`${WEB_URL}/dashboard/talento-humano/reportes`, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT });
      await page.waitForFunction(() => [...document.querySelectorAll("button")].some((item) => (item.textContent || "").includes("Operativo (jornadas)")), { timeout: NAV_TIMEOUT });
      await setInputByLabel(page, "Desde", day);
      await setInputByLabel(page, "Hasta", day);
      await typeIntoLabel(page, "Empleado", operario.document);
      await clickButtonByText(page, "Aplicar rango");
      await page.waitForFunction(() => [...document.querySelectorAll("button")].some((item) => (item.textContent || "").trim().endsWith("Ver")), { timeout: NAV_TIMEOUT });
      await clickButtonByText(page, "Ver");
      await page.waitForFunction(() => (document.body.innerText || "").includes("Trazabilidad cronologica"), { timeout: NAV_TIMEOUT });
    };

    await abrirJornada(dayHeic);
    const trazabilidadDegradada = await bodyText(page);
    const lineaDegradada = (trazabilidadDegradada.split("\n").find((line) => line.includes(SENTENCES.degradedOnReport)) || "").trim();
    check("criterio3_la_evidencia_degradada_aparece_nombrada_al_supervisor", trazabilidadDegradada.includes(SENTENCES.degradedOnReport)
      && trazabilidadDegradada.includes(SENTENCES.survivesOnReport), { linea: lineaDegradada.slice(0, 220) });
    // El tema se fuerza ANTES de cada lectura y su captura: la secuencia de la cola dejo el documento
    // en modo oscuro, asi que medir el estado claro sin volver a claro daba dos lecturas identicas
    // (16,48 en ambas) y dos PNG byte a byte iguales que el check aprobaba igual. Un control que no
    // puede distinguir los dos temas no certifica legibilidad, certifica que nadie lo miro.
    const temaClaro = await setTheme(page, "light");
    await abrirJornada(dayHeic);
    const degradadaClaro = await measureContrast(page, SENTENCES.degradedOnReport);
    await screenshot_(page, "03-trazabilidad-evidencia-degradada-claro.png");
    const temaOscuroTrazabilidad = await setTheme(page, "dark");
    await abrirJornada(dayHeic);
    const degradadaOscuro = await measureContrast(page, SENTENCES.degradedOnReport);
    await screenshot_(page, "04-trazabilidad-evidencia-degradada-oscuro.png");
    // La paleta del aviso SI cambia entre temas: el repo repinta las utilidades en
    // `html.dark .bg-amber-50` / `.text-amber-950` (globals.css:1446 y :1502). Por eso se exige
    // que el fondo medido sea distinto en cada lectura: es exactamente lo que habria delatado que
    // el «claro» nunca se forzo. Ademas se publica el tema aplicado en cada captura y el nodo
    // medido (`nodo`), para que el lector vea que el ratio es el del aviso y no el del panel.
    check("alerta_degradada_legible_en_claro_y_oscuro", degradadaClaro.found && degradadaOscuro.found
      && degradadaClaro.ratio >= 4.5 && degradadaOscuro.ratio >= 4.5
      && degradadaClaro.bg !== degradadaOscuro.bg
      && temaClaro.applied.dark === false && temaOscuroTrazabilidad.applied.dark === true, {
      claro: degradadaClaro, oscuro: degradadaOscuro,
      temas: { claro: temaClaro.applied, oscuro: temaOscuroTrazabilidad.applied }
    });
    await setTheme(page, "light");

    await abrirJornada(dayCorrection);
    const panelTexto = await bodyText(page);
    check("criterio10b_el_panel_de_correccion_es_visible_para_hr_write", panelTexto.includes(SENTENCES.correctionPanel), {
      botones_del_panel: await page.evaluate(() => {
        const encabezado = [...document.querySelectorAll("h4")].find((node) => (node.textContent || "").includes("Registrar la hora que falta"));
        const bloque = encabezado?.parentElement;
        return bloque ? [...bloque.querySelectorAll("button")].map((item) => (item.textContent || "").trim()) : [];
      })
    });
    await clickButtonByText(page, SENTENCES.salidaLabel, { exact: true });
    const horaPrefijada = await inputValueByLabel(page, "Hora de la marcacion", "time");
    check("criterio10b_la_pantalla_prefija_la_hora_del_horario", horaPrefijada === correctionRoute.end_time, {
      prefijada: horaPrefijada, horario: correctionRoute.end_time
    });
    const motivo = "La salida nunca llego al servidor; se registra la hora del horario asignado";
    await setInputByLabel(page, "Motivo de la correccion", motivo);
    await page.waitForFunction((needle) => [...document.querySelectorAll("button")].some((item) =>
      (item.textContent || "").includes(needle) && !item.disabled), { timeout: 20_000 }, SENTENCES.correctionSubmit);
    await screenshot_(page, "05-modal-registrar-salida.png");
    const adminPostsAntes = result.network.filter((entry) => entry.path === PUNCH_ADMIN_PATH).length;
    await clickButtonByText(page, SENTENCES.correctionSubmit);
    const esperaDesde = Date.now();
    let adminPost = null;
    while (Date.now() - esperaDesde < 40_000 && !adminPost) {
      await new Promise((resolve) => setTimeout(resolve, 300));
      adminPost = result.network.slice(adminPostsAntes).find((entry) => entry.path === PUNCH_ADMIN_PATH) || null;
    }
    check("criterio10b_el_guardado_sale_del_navegador_por_la_via_administrativa", Boolean(adminPost) && adminPost.status === 200, {
      estado: adminPost?.status || null
    });

    const salidaCorregida = await punchRow(dayCorrection, "salida");
    const sello = salidaCorregida?.metadata?.correccion_administrativa || {};
    check("criterio10b_la_fila_queda_sellada_con_autor_y_motivo", Boolean(salidaCorregida)
      && String(sello.motivo || "").trim() === motivo.trim()
      && String(sello.por || "") === String(supervisor.id)
      // El sello nombra lo que la escalera esperaba al momento de la correccion (service.js:3803),
      // no el tipo que se registro: asi el supervisor ve despues que el eslabon entro fuera de
      // orden, por quien y con que motivo.
      && /^(esperada:|en_orden$|jornada_completa$)/.test(String(sello.salto || ""))
      && !Number.isNaN(Date.parse(String(sello.en || ""))), {
      marcacion: Boolean(salidaCorregida), hora: salidaCorregida?.punched_at?.toISOString?.() || null,
      claves_del_sello: Object.keys(sello), autor: sello.por || null, salto: sello.salto || null
    });
    const novedad = await prisma.runWithTenant(tenant.id, async () => prisma.$queryRaw`
      SELECT metadata::text AS metadata FROM th_novedades_jornada
      WHERE tenant_id = ${tenant.id} AND employee_id = ${ficha} AND type_code = ${MANUAL_ADJUSTMENT_NOVELTY_CODE}
        AND date = ${dayCorrection}::date ORDER BY id DESC LIMIT 1`);
    const novedadMeta = novedad?.[0]?.metadata ? JSON.parse(novedad[0].metadata) : {};
    check("criterio10b_abre_la_novedad_de_ajuste_manual_con_su_autor", Boolean(novedad?.[0])
      && novedadMeta.source === "correccion_administrativa" && String(novedadMeta.corrected_by) === String(supervisor.id)
      && String(novedadMeta.reason || "").trim() === motivo.trim() && String(novedadMeta.detail || "").startsWith("escalera:"), {
      novedad: Boolean(novedad?.[0]), source: novedadMeta.source || null, corrected_by: novedadMeta.corrected_by || null,
      motivo_en_la_novedad: String(novedadMeta.reason || "").slice(0, 90), salto_en_la_novedad: novedadMeta.detail || null,
      supervisor_esperado: supervisor.id
    });

    await abrirJornada(dayCorrection);
    const trazabilidadFinal = await bodyText(page);
    check("criterio10b_el_sello_se_ve_en_la_trazabilidad", trazabilidadFinal.includes(SENTENCES.correctionBadge), {
      tiene_insignia: trazabilidadFinal.includes(SENTENCES.correctionBadge)
    });
    check("criterio10b_el_hueco_corregido_deja_de_ofrecerse", !(await hasButton(page, SENTENCES.salidaLabel, { exact: true })), {
      botones_restantes: await page.evaluate(() => {
        const encabezado = [...document.querySelectorAll("h4")].find((node) => (node.textContent || "").includes("Registrar la hora que falta"));
        const bloque = encabezado?.parentElement;
        return bloque ? [...bloque.querySelectorAll("button")].map((item) => (item.textContent || "").trim()) : [];
      })
    });
    await screenshot_(page, "06-trazabilidad-correccion-administrativa.png");

    // ---- Salud de la sesion ----
    check("cero_errores_de_consola", result.console_errors.length === 0, {
      errores: result.console_errors.slice(0, 8),
      excluidas_con_motivo: result.console_noise.map((item) => ({ motivo: item.motivo, veces: item.veces }))
    });
    check("cero_errores_de_pagina", result.page_errors.length === 0, { errores: result.page_errors.slice(0, 8) });
    check("cero_500_y_cero_P2028_en_toda_la_sesion", failures.server_errors.every((entry) => entry.status === 503 && entry.path === PUNCH_SELF_PATH)
      && failures.p2028.length === 0, { errores_servidor: failures.server_errors, p2028: failures.p2028 });
    check("ningun_rechazo_de_foto_almaceno_bytes", [rowHeic, rowHeal, rowDescosida].every((fila) => !fila?.metadata?.identity_photo?.base64_data), {
      filas_con_bytes: [rowHeic, rowHeal, rowDescosida].filter((fila) => fila?.metadata?.identity_photo?.base64_data).length
    });

    result.status = "passed";
    result.summary = {
      controles: result.checks.length,
      jornadas_almacenadas: [rowPng, rowHeic, rowHeal, rowStall, rowDescosida, salidaCorregida].filter(Boolean).length,
      cerradas_con_accion: snapshot.filter((item) => item.status === "closed").length,
      solicitudes_de_marcacion: ordered.length,
      solapamientos: overlaps.length,
      espera_de_contencion_ms: esperaReal ? esperaReal.ended_at - esperaReal.started_at : null
    };
  } catch (error) {
    result.status = "failed";
    result.error = { message: error.message, stack: error.stack, checks: result.checks.map((item) => ({ name: item.name, ok: item.ok })) };
    throw error;
  } finally {
    const summary = {
      marcaciones_eliminadas: 0, sesiones_eliminadas: 0, actividades_eliminadas: 0, jornadas_eliminadas: 0,
      novedades_eliminadas: 0, empleados_eliminados: 0, horarios_eliminados: 0,
      usuarios_desactivados: 0, roles_desactivados: 0, errores: []
    };
    if (cleanup.tenantId && cleanup.employeeIds.length) {
      await prisma.runWithTenant(cleanup.tenantId, async () => {
        const sessions = await prisma.workSession.findMany({ where: { tenant_id: cleanup.tenantId, employee_id: { in: cleanup.employeeIds } }, select: { id: true } }).catch(() => []);
        if (sessions.length) {
          summary.actividades_eliminadas = await prisma.workActivity.deleteMany({ where: { tenant_id: cleanup.tenantId, session_id: { in: sessions.map((item) => item.id) } } }).then((r) => r.count).catch(() => 0);
        }
        summary.sesiones_eliminadas = await prisma.workSession.deleteMany({ where: { tenant_id: cleanup.tenantId, employee_id: { in: cleanup.employeeIds } } }).then((r) => r.count).catch(() => 0);
        summary.marcaciones_eliminadas = await prisma.timePunch.deleteMany({ where: { tenant_id: cleanup.tenantId, employee_id: { in: cleanup.employeeIds } } }).then((r) => r.count).catch(() => 0);
        summary.jornadas_eliminadas = await prisma.processedWorkday.deleteMany({ where: { tenant_id: cleanup.tenantId, employee_id: { in: cleanup.employeeIds } } }).then((r) => r.count).catch(() => 0);
        for (const id of cleanup.employeeIds) {
          await prisma.$executeRaw`DELETE FROM th_novedades_jornada WHERE tenant_id = ${cleanup.tenantId} AND employee_id = ${id}`
            .then(() => { summary.novedades_eliminadas += 1; }).catch((error) => summary.errores.push(`novedades ${id}: ${error.message}`));
        }
        for (const id of cleanup.employeeIds) {
          await prisma.employee.delete({ where: { id } }).then(() => { summary.empleados_eliminados += 1; })
            .catch((error) => summary.errores.push(`empleado ${id}: ${error.message}`));
        }
      });
    }
    if (cleanup.tenantId && cleanup.routeIds.length) {
      summary.horarios_eliminados = await prisma.timeRoute.deleteMany({ where: { tenant_id: cleanup.tenantId, id: { in: cleanup.routeIds } } }).then((r) => r.count).catch(() => 0);
    }
    for (const id of cleanup.userIds) {
      await admin.setUserActive(cleanup.tenantId, id, false).then(() => { summary.usuarios_desactivados += 1; })
        .catch((error) => summary.errores.push(`usuario ${id}: ${error.message}`));
    }
    for (const id of cleanup.roleIds) {
      await admin.setRoleActive(cleanup.tenantId, id, false).then(() => { summary.roles_desactivados += 1; })
        .catch((error) => summary.errores.push(`rol ${id}: ${error.message}`));
    }
    result.cleanup = summary;
    result.finished_at = new Date().toISOString();
    try {
      fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
      fs.writeFileSync(OUTPUT, `${JSON.stringify(redact(result), (_key, value) => (typeof value === "bigint" ? value.toString() : value), 2)}\n`);
    } finally {
      if (browser) await browser.close().catch(() => undefined);
      if (webProcess) webProcess.kill();
      if (apiProcess) apiProcess.kill();
    }
  }
}

main()
  .then(() => console.log(`CERTIFICACION DE NAVEGADOR DE COLA Y CORRECCION APROBADA: ${result.checks.length} controles, status=${result.status}`))
  .catch((error) => { console.error(`CERTIFICACION BLOQUEADA: ${error.message}`); process.exitCode = 1; })
  .finally(() => {
    prisma.$disconnect();
    // Sin salida explicita el proceso queda con los temporizadores del fabric vivos.
    setTimeout(() => process.exit(process.exitCode || 0), 500);
  });
