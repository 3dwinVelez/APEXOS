// Certificacion QA en navegador del rediseno de "Horarios y mallas" (2026-11-26).
//
// Corre contra el portal de QA ya desplegado, con una cuenta efimera de la empresa modelo NYVORA, y
// exige la superficie nueva sobre el binario servido: la linea de tiempo es la vista por defecto, el
// eje 06:00-22:00 esta dibujado con su matematica, pulsar la franja abre el detalle, la tabla abre el
// mismo detalle con sus acciones detras del menu, el tema se pinta desde "Mi cuenta" y en 390 px la
// franja se toca y la ventana ocupa el ancho.
//
// La pata es de SOLO LECTURA sobre el dato de la empresa: todo metodo distinto de GET que no sea el
// login o la telemetria queda registrado y pone roja la corrida. Los checks se acumulan (no revienta
// el primero) para que un rojo diga cuanto se cayo, y toda pata que exige una ausencia o un conteo
// trae su control positivo: si el censo no puede ver, su cero no prueba que no habia nada.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const assert = require("node:assert/strict");

function argsFrom(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) continue;
    result[value.slice(2)] = argv[index + 1] && !argv[index + 1].startsWith("--") ? argv[++index] : true;
  }
  return result;
}

const args = argsFrom(process.argv.slice(2));
const ROOT = path.resolve(__dirname, "..", "..");
require("../load-env")(path.resolve(ROOT, String(args["env-file"] || "config/qa.env")));

const API_URL = String(args["api-url"] || "https://apexos-api-qa-production.up.railway.app").replace(/\/$/, "");
const FRONTEND = String(args.frontend || process.env.FRONTEND_URL || "https://apexos-web-qa-production.up.railway.app").replace(/\/$/, "");
const SCREEN = "/dashboard/talento-humano/rutas";
const OUT = path.resolve(ROOT, String(args.output || path.join("docs", "qa", "evidence", "rediseno-horarios-mallas-20261126", "qa-desplegado")));
const RUN_ID = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
const PASSWORD = `Qa-Tl-${crypto.randomBytes(6).toString("hex")}#26`;
const NAV_TIMEOUT = Number(args["nav-timeout-ms"] || 120_000);
const SETTLE_MS = Number(args["settle-ms"] || 6_000);
// Literales que solo existen en el arbol rediseñado: si QA no los sirve, la corrida no es del candidato.
const MARKERS = ["Línea de tiempo", "Abrir detalle del horario", "Filtrar por fecha", "Modo de vista del listado"];

const RESUL = {
  format: "apexos-hr-schedule-timeline-qa-v1",
  started_at: new Date().toISOString(),
  status: "running",
  environment: "QA",
  api_url: API_URL,
  frontend_url: FRONTEND,
  run_id: RUN_ID,
  deployed_api_commit: "",
  tenant: "",
  usuarios: [],
  artefacto_servido: {},
  eleccion_de_fecha: {},
  medidas: {},
  // Patas que QA no permite medir hoy (la empresa modelo no tiene el dato) se declaran, no se aprueban.
  no_medibles: [],
  checks: []
};

function skip(name, why) {
  RESUL.no_medibles.push({ name, why });
  console.log(`SIN DENOMINADOR ${name} · ${why}`);
}

function check(name, ok, payload = {}) {
  RESUL.checks.push({ name, ok: Boolean(ok), ...(Object.keys(payload).length ? { payload } : {}) });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${Object.keys(payload).length ? ` ${JSON.stringify(payload).slice(0, 260)}` : ""}`);
}

function writeEvidence() {
  fs.mkdirSync(OUT, { recursive: true });
  RESUL.verdict = {
    passed: RESUL.checks.filter((item) => item.ok).length,
    failed: RESUL.checks.filter((item) => !item.ok).length,
    total: RESUL.checks.length,
    sin_denominador: RESUL.no_medibles.length
  };
  RESUL.finished_at = new Date().toISOString();
  const file = path.join(OUT, "certification.json");
  // Nunca se destruye una corrida anterior: puede ser la unica prueba de un rojo.
  if (fs.existsSync(file)) fs.copyFileSync(file, path.join(OUT, `certification-prev-${RUN_ID}.json`));
  fs.writeFileSync(file, JSON.stringify(RESUL, null, 2));
}

async function apiJson(pathname, { token = "", method = "GET", body } = {}) {
  const response = await fetch(`${API_URL}${pathname}`, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const text = await response.text();
  let payload = {};
  try { payload = text ? JSON.parse(text) : {}; } catch { payload = {}; }
  return { status: response.status, payload, text };
}

// El instrumento solo puede apuntar a QA: la barrera es la misma de los otros certificadores de ambiente.
function assertQaTarget() {
  const env = [process.env.APP_ENV, process.env.TARGET_ENV].map((value) => String(value || "").trim().toLowerCase());
  if (!env.includes("qa")) throw new Error("La certificacion solo puede ejecutarse con configuracion QA (APP_ENV/TARGET_ENV = qa).");
  const expectedRef = String(process.env.EXPECTED_SUPABASE_PROJECT_REF || "").trim();
  const url = String(process.env.DATABASE_URL || "");
  if (!expectedRef) throw new Error("EXPECTED_SUPABASE_PROJECT_REF es obligatorio: esta certificacion crea una cuenta efimera en la empresa modelo.");
  if (!url.includes(expectedRef)) throw new Error(`DATABASE_URL no pertenece al project ref esperado (${expectedRef}); se aborta sin conectar.`);
  if (!/qa/i.test(API_URL) || !/qa/i.test(FRONTEND)) throw new Error(`Los host objetivos no parecen QA: ${API_URL} · ${FRONTEND}`);
}

async function provisionAdmin(prisma, admin) {
  // "NYVORA" matchea tambien el tenant de control de aislamiento que se sembró para otras corridas.
  // Se prefiere la empresa operativa: es la que tiene jornadas y marcaciones reales que mostrar.
  const candidatos = await prisma.tenant.findMany({ where: { name: { contains: "NYVORA", mode: "insensitive" } }, select: { id: true, name: true, active: true } });
  if (!candidatos.length) throw new Error("No existe la empresa modelo NYVORA en QA.");
  const preferida = candidatos.find((t) => !/isolation|control|qa[- ]/i.test(t.name)) || candidatos[0];
  const tenant = await prisma.tenant.findUnique({ where: { id: preferida.id } });
  RESUL.tenant_candidatos = candidatos.map((t) => t.name);
  const roles = await admin.listRoles(tenant.id, {}, "APEX_ADMIN");
  const role = roles.find((item) => /Administrador de empresa/i.test(item.name)) || roles.find((item) => /admin/i.test(item.name));
  if (!role) throw new Error(`NYVORA no tiene rol administrable: ${roles.map((item) => item.name).join(", ")}`);
  const email = `qa.timeline.admin.${RUN_ID}@timeline-qa.test`;
  const user = await admin.createUser(tenant.id, {
    name: `Timeline ${RUN_ID}`,
    first_names: "Timeline",
    last_names: "QA",
    email,
    password: PASSWORD,
    role_id: role.id,
    company: tenant.name,
    document: `QAT${RUN_ID}`,
    code: `QA-TL-${RUN_ID}`,
    department: "QA",
    position: "Usuario de certificacion",
    operational_classification: "administrativo",
    require_password_change: false
  }, null, "APEX_ADMIN");
  RESUL.tenant = tenant.name;
  RESUL.usuarios.push({ email, tenant: tenant.name, role: role.name });
  return { ...user, email, tenantId: tenant.id };
}

// Anclaje por artefacto: el bundle del portal no embebe el commit, asi que lo que separa el candidato
// de lo anterior es el literal del rediseño dentro del chunk que la propia pantalla referencia.
async function servedArtifact() {
  const html = await fetch(`${FRONTEND}${SCREEN}`, { signal: AbortSignal.timeout(90_000) }).then((response) => response.text()).catch(() => "");
  const srcs = [...new Set((html.match(/\/_next\/static\/[^"' ]+\.js/g) || []))];
  const census = {};
  let bytes = 0;
  let chunks = 0;
  for (const src of srcs) {
    const body = await fetch(`${FRONTEND}${src}`, { signal: AbortSignal.timeout(90_000) }).then((response) => response.text()).catch(() => "");
    if (!body) continue;
    chunks += 1;
    bytes += body.length;
    for (const marker of MARKERS) {
      const hits = body.split(marker).length - 1;
      if (hits) (census[marker] = census[marker] || []).push({ chunk: path.basename(src), hits, bytes: body.length });
    }
  }
  return { http_ok: html.length > 0, html_bytes: html.length, rutas_referenciadas: srcs.length, chunks_leidos: chunks, bytes, census };
}

// Se pasa como funcion a page.evaluate: tiene que ser autocontenida (sin closures del nodo).
function probeFranja() {
  const ratio = (fg, bg) => {
    const lum = (value) => {
      const [r, g, b] = value.match(/\d+/g).slice(0, 3).map((part) => {
        const channel = Number(part) / 255;
        return channel <= 0.03928 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const a = lum(fg), c = lum(bg);
    return (Math.max(a, c) + 0.05) / (Math.min(a, c) + 0.05);
  };
  const blend = (front, back) => {
    const f = front.match(/[\d.]+/g).map(Number), b = back.match(/[\d.]+/g).map(Number), a = f.length > 3 ? f[3] : 1;
    return "rgb(" + f.slice(0, 3).map((value, index) => Math.round(value * a + b[index] * (1 - a))).join(" ") + ")";
  };
  const track = document.querySelector('[data-schedule-view="timeline"] li[data-route-id] > div:last-child');
  const bar = track && track.querySelector("button");
  if (!bar) return { error: "no hay franja en pantalla" };
  const barStyle = getComputedStyle(bar), trackStyle = getComputedStyle(track), bodyStyle = getComputedStyle(document.body);
  const barBg = blend(barStyle.backgroundColor, trackStyle.backgroundColor);
  const ink = getComputedStyle(bar.querySelector("span")).color;
  return {
    page: bodyStyle.backgroundColor,
    track: blend(trackStyle.backgroundColor, bodyStyle.backgroundColor),
    barBg,
    ink,
    tactil: Math.round(bar.getBoundingClientRect().height),
    contraste: +ratio(ink, barBg).toFixed(2)
  };
}

async function main() {
  assertQaTarget();
  fs.mkdirSync(OUT, { recursive: true });

  const salud = await apiJson("/health");
  RESUL.deployed_api_commit = String(salud.payload?.commit || "");
  check("api_qa_responde_health", salud.status === 200 && salud.payload?.status === "OK", { status: salud.status, commit: RESUL.deployed_api_commit });

  const artefacto = await servedArtifact();
  RESUL.artefacto_servido = artefacto;
  check("qa_sirve_la_pantalla", artefacto.http_ok && artefacto.chunks_leidos > 0, { chunks: artefacto.chunks_leidos, bytes: artefacto.bytes });
  check("el_artefacto_servido_trae_la_linea_de_tiempo", (artefacto.census["Línea de tiempo"] || []).length > 0, { chunks: artefacto.census["Línea de tiempo"] || [] });
  check("el_artefacto_servido_trae_el_acceso_desde_la_franja", (artefacto.census["Abrir detalle del horario"] || []).length > 0, { chunks: artefacto.census["Abrir detalle del horario"] || [] });
  check("el_artefacto_servido_trae_el_filtro_de_fecha", (artefacto.census["Filtrar por fecha"] || []).length > 0, { chunks: artefacto.census["Filtrar por fecha"] || [] });
  check("el_artefacto_servido_trae_el_grupo_de_vistas", (artefacto.census["Modo de vista del listado"] || []).length > 0, { chunks: artefacto.census["Modo de vista del listado"] || [] });

  const prisma = require("../../apps/api/src/core/prisma");
  const admin = require("../../apps/api/src/modules/admin/service");
  const usuario = await provisionAdmin(prisma, admin);

  const puppeteer = require("puppeteer-core");
  const executablePath = [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
  ].find((file) => fs.existsSync(file));
  assert.ok(executablePath, "no hay Chrome ni Edge instalados para certificar en navegador");
  const browser = await puppeteer.launch({ executablePath, headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage();
  page.setDefaultTimeout(NAV_TIMEOUT);
  await page.setViewport({ width: 1440, height: 900 });

  const apiOrigin = new URL(API_URL).origin;
  const writes = [];
  const serverErrors = [];
  await page.setRequestInterception(true);
  page.on("request", (request) => {
    let url;
    try { url = new URL(request.url()); } catch { return void request.continue(); }
    if (url.origin !== apiOrigin) return void request.continue();
    // El preflight de CORS no es una escritura: pregunta antes de mandar, no toca el dato.
    const lectura = request.method() === "GET" || request.method() === "OPTIONS";
    const sesionOTelemetria = url.pathname.startsWith("/api/v1/auth/") || url.pathname.startsWith("/api/v1/admin/platform-logs");
    if (!lectura && !sesionOTelemetria) writes.push(`${request.method()} ${url.pathname}`);
    return void request.continue();
  });
  page.on("response", (response) => {
    let url;
    try { url = new URL(response.url()); } catch { return; }
    if (url.origin !== apiOrigin) return;
    if (response.status() >= 500) serverErrors.push(`${response.status()} ${url.pathname}`);
  });

  // Ventanilla nativa del navegador: sin oyente Chrome headless la descarta en silencio, asi que la
  // corrida exige primero su control positivo antes de creer en el "cero ventanas".
  const dialogs = [];
  page.on("dialog", async (dialog) => {
    dialogs.push({ type: dialog.type(), message: String(dialog.message() || "").slice(0, 200) });
    await dialog.dismiss().catch(() => undefined);
  });
  const realDialogs = () => dialogs.filter((entry) => !/^ARNES:/.test(entry.message));

  async function login() {
    await page.goto(`${FRONTEND}/login`, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT });
    await page.waitForSelector('input[type="email"], input[autocomplete="email"], input[name="email"], input[autocomplete="username"]', { timeout: NAV_TIMEOUT });
    const email = await page.$('input[type="email"], input[autocomplete="email"], input[name="email"], input[autocomplete="username"]');
    const password = await page.$('input[type="password"]');
    if (!email || !password) throw new Error("El login de QA no expone correo y contrasena.");
    await email.type(usuario.email, { delay: 8 });
    await password.type(PASSWORD, { delay: 8 });
    const submit = await page.$('button[type="submit"]');
    if (!submit) throw new Error("El login de QA no tiene boton de acceso.");
    const startedAt = Date.now();
    await submit.click();
    await page.waitForFunction(() => location.pathname.startsWith("/dashboard"), { timeout: NAV_TIMEOUT });
    return Date.now() - startedAt;
  }

  // Input controlado por React: hay que escribir por el setter nativo y disparar el evento, o el estado
  // interno no se entera y la pantalla sigue filtrada por el dia de hoy.
  async function setDate(fecha) {
    return page.evaluate((value) => {
      const el = document.querySelector('input[aria-label="Filtrar por fecha"]');
      if (!el) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      setter.call(el, value);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return el.value === value;
    }, fecha);
  }

  // La fecha que se mide no se adivia: se elige entre las que de verdad tienen jornadas y, dentro de
  // esas, la de mas movimientos, para que ninguna asercion de presencia sea verde por vacio.
  async function chooseDate() {
    return page.evaluate(async (apiUrl) => {
      const token = localStorage.getItem("token") || "";
      const head = { Authorization: `Bearer ${token}` };
      const leido = await fetch(`${apiUrl}/api/v1/hr/routes?limit=200`, { headers: head }).then((r) => r.json()).catch(() => null);
      const rows = Array.isArray(leido) ? leido : ((leido && (leido.routes || leido.data || leido.items)) || []);
      const dayOf = (value) => {
        if (!value) return "";
        if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
        const d = new Date(value);
        if (Number.isNaN(d.getTime())) return "";
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      };
      const porDia = new Map();
      for (const row of rows) {
        const key = dayOf(row.date);
        if (key) porDia.set(key, (porDia.get(key) || 0) + 1);
      }
      const ranking = [...porDia.entries()].sort((a, b) => b[1] - a[1] || b[0].localeCompare(a[0])).slice(0, 6);
      const puntuadas = [];
      const jornadas = [];
      for (const [fecha, rutas] of ranking) {
        const resumen = await fetch(`${apiUrl}/api/v1/hr/routes/event-summaries?date=${fecha}`, { headers: head }).then((r) => r.json()).catch(() => null);
        const lista = (resumen && resumen.routes) || [];
        const marcas = lista.reduce((total, r) => total + (Number(r.punch_count) || 0), 0);
        const evidencias = lista.reduce((total, r) => total + (Number(r.evidence_count) || 0), 0);
        puntuadas.push({ fecha, rutas, marcas, evidencias, puntaje: marcas + evidencias + rutas });
        // Cada jornada del dia, con lo que su monitor promete mostrar: sin personas ni evidencia no hay
        // ventana que medir, y eso se declara en lugar de pasarse verde por vacio.
        const porId = new Map(lista.map((r) => [String(r.route_id), r]));
        for (const row of rows) {
          if (dayOf(row.date) !== fecha) continue;
          const s = porId.get(String(row.id)) || {};
          const personas = (row.employee_names && row.employee_names.length) || (row.employees && row.employees.length) || row.assigned_count || 0;
          jornadas.push({
            fecha, id: String(row.id), personas,
            marcas: Number(s.punch_count) || 0,
            evidencias: Number(s.evidence_count) || 0,
            puntaje: (Number(s.evidence_count) || 0) + (Number(s.punch_count) || 0) + (personas ? 1 : 0)
          });
        }
      }
      puntuadas.sort((a, b) => b.puntaje - a.puntaje || b.fecha.localeCompare(a.fecha));
      jornadas.sort((a, b) => b.puntaje - a.puntaje || b.fecha.localeCompare(a.fecha));
      // La pantalla pinta UN dia: la jornada medida tiene que salir de ese mismo dia, si no el arnes
      // busca una fila que nunca existio en el eje (medido en la corrida 2: id 402 era de otra fecha).
      const dia = (puntuadas[0] || {}).fecha || "";
      const jornadas_dia = jornadas.filter((j) => j.fecha === dia);
      const hoy = dayOf(new Date());
      return { total_jornas: rows.length, hoy, jornadas_hoy: porDia.get(hoy) || 0, candidatas: puntuadas.slice(0, 6), elegida: puntuadas[0] || null, mejor_jornada: jornadas_dia[0] || null, jornadas_del_dia: jornadas_dia.slice(0, 12) };
    }, API_URL);
  }

  // Cambiar de tamano con isMobile recarga la vista y el filtro de fecha vuelve a hoy. En QA hoy no
  // tiene jornadas (medido: 0), asi que despues de cada recarga hay que fijar otra vez la fecha medida
  // o el selector de la franja espera para siempre.
  async function asegurarListado(fecha) {
    await page.waitForSelector('input[aria-label="Filtrar por fecha"]', { timeout: NAV_TIMEOUT }).catch(() => undefined);
    const enEje = await page.evaluate(() => document.querySelectorAll('[data-schedule-view="timeline"] li[data-route-id]').length);
    const yaFijada = await page.evaluate((value) => {
      const el = document.querySelector('input[aria-label="Filtrar por fecha"]');
      return Boolean(el) && el.value === value;
    }, fecha);
    if (enEje > 0 && yaFijada) return { filas: enEje, recargo: false };
    await setDate(fecha);
    await page.waitForFunction((value) => {
      const el = document.querySelector('input[aria-label="Filtrar por fecha"]');
      return Boolean(el) && el.value === value && document.querySelectorAll('[data-schedule-view="timeline"] li[data-route-id]').length > 0;
    }, { timeout: NAV_TIMEOUT }, fecha).catch(() => undefined);
    return { filas: await page.evaluate(() => document.querySelectorAll('[data-schedule-view="timeline"] li[data-route-id]').length), recargo: true };
  }

  // Estado del documento en el tamano de telefono. La marca vive en `window`: si la lectura siguiente
  // no la ve, el navegador recargo (el recargo de setViewport es asincrono y puede aterrizar despues
  // de que el arnes fijo la fecha).
  async function leerEstadoTelefono() {
    return page.evaluate((marca) => {
      const recargo = window.__apexTelefonoProbe !== marca;
      window.__apexTelefonoProbe = marca;
      const el = document.querySelector('input[aria-label="Filtrar por fecha"]');
      return {
        recargo,
        valor_fecha: el ? el.value : "",
        filas: document.querySelectorAll('[data-schedule-view="timeline"] li[data-route-id]').length,
        eje: Boolean(document.querySelector('[data-schedule-view="timeline"]')),
        aviso_vacio: (document.body.innerText || "").includes("No hay horarios con estos filtros")
      };
    }, `${RESUL.run_id}:telefono`);
  }

  // El eje solo se pinta cuando el listado trae jornadas, asi que medir el layout movil sin jornadas
  // no mide el layout: mide el vacio (corrida del 27-11: el arnes conto 23 filas y cuatro checks
  // despues salieron en 0 px porque la recarga del cambio de dispositivo se impuso despues y el
  // filtro volvio a hoy). Se re-fija la fecha hasta ver jornadas con la fecha medida y que se
  // mantengan; si no se logra, el denominador queda rojo y las patas de layout se declaran sin
  // denominador en lugar de aprobarse o acusar a la pantalla con una lista vacia.
  async function estabilizarTelefono(fecha, intentos = 6) {
    const lectura = [];
    let recargas = 0;
    for (let intento = 1; intento <= intentos; intento++) {
      await page.waitForSelector('input[aria-label="Filtrar por fecha"]', { timeout: NAV_TIMEOUT }).catch(() => undefined);
      const estado = await leerEstadoTelefono();
      if (estado.recargo) recargas += 1;
      lectura.push({ ...estado, intento });
      if (estado.filas > 0 && estado.valor_fecha === fecha) {
        await new Promise((resolve) => setTimeout(resolve, 1_200));
        const estable = await leerEstadoTelefono();
        if (estable.recargo) recargas += 1;
        lectura.push({ ...estable, intento, control: "estabilidad" });
        if (!estable.recargo && estable.filas > 0 && estable.valor_fecha === fecha) {
          return { filas: estable.filas, valor_fecha: estable.valor_fecha, intentos: intento, recargas, lectura };
        }
      }
      await setDate(fecha);
      await new Promise((resolve) => setTimeout(resolve, 1_500));
    }
    const ultimo = lectura[lectura.length - 1] || {};
    return { filas: ultimo.filas || 0, valor_fecha: ultimo.valor_fecha || "", intentos, recargas, lectura };
  }

  // El control de tema vive en "Mi cuenta" (ModalFrame), no en la pantalla: abrirlo, pulsar y cerrarlo
  // es el unico camino que tiene quien opera, y es el que se le exige al tablero.
  // Corrida 3: el paso reventaba la corrida entera. Ahora devuelve su diagnostico (disparador visto,
  // dialogos abiertos, botones del grupo) y la pata que no pueda medirse se declara, no se finge.
  async function censoCuenta() {
    return page.evaluate(() => {
      const porTexto = [...document.querySelectorAll("button")]
        .filter((n) => (n.textContent || "").trim() === "Mi cuenta")
        .map((n) => ({ aria: n.getAttribute("aria-label") || "", visible: n.getBoundingClientRect().width > 0 }));
      return {
        disparador: [...document.querySelectorAll('button[aria-label="Mi cuenta"]')].map((n) => ({ visible: n.getBoundingClientRect().width > 0 })),
        por_texto: porTexto,
        dialogos: [...document.querySelectorAll('[role="dialog"]')].map((d) => String(d.getAttribute("aria-label") || d.querySelector("h2")?.textContent || "").trim()),
        tema: [...document.querySelectorAll('[aria-label="Tema de la plataforma"] button')].map((n) => (n.textContent || "").trim())
      };
    });
  }

  async function aplicarTema(opcion) {
    const proceso = { opcion, intentos: [] };
    for (let intento = 1; intento <= 3; intento++) {
      await page.keyboard.press("Escape").catch(() => undefined);
      await new Promise((resolve) => setTimeout(resolve, 350));
      proceso.intentos.push(await censoCuenta());
      const abierto = await page.evaluate(() => Boolean(document.querySelector('[aria-label="Tema de la plataforma"]')));
      if (!abierto) {
        await page.evaluate(() => {
          const b = document.querySelector('button[aria-label="Mi cuenta"]')
            || [...document.querySelectorAll("button")].find((n) => (n.textContent || "").trim() === "Mi cuenta");
          b?.click();
        });
        const abrio = await page.waitForFunction(() => Boolean(document.querySelector('[aria-label="Tema de la plataforma"]')), { timeout: 15_000 })
          .then(() => true).catch(() => false);
        proceso.intentos[intento - 1].abrio = abrio;
        if (!abrio) continue;
      }
      // El censo del grupo se lee CON el modal abierto: leido antes siempre sale vacio y el control
      // se pondria rojo sobre una pantalla que si funciona (medido en la corrida 4).
      proceso.grupo = await page.evaluate(() => [...document.querySelectorAll('[aria-label="Tema de la plataforma"] button')]
        .map((n) => ({ texto: (n.textContent || "").trim(), presionado: n.getAttribute("aria-pressed") })));
      const pulsado = await page.evaluate((texto) => {
        const b = [...document.querySelectorAll('[aria-label="Tema de la plataforma"] button')]
          .find((n) => (n.textContent || "").trim() === texto);
        if (!b) return false;
        b.click();
        return true;
      }, opcion);
      proceso.intentos[intento - 1].pulsado = pulsado;
      if (!pulsado) continue;
      await new Promise((resolve) => setTimeout(resolve, 900));
      proceso.presionado = await page.evaluate((texto) => [...document.querySelectorAll('[aria-label="Tema de la plataforma"] button')]
        .find((n) => (n.textContent || "").trim() === texto)?.getAttribute("aria-pressed") ?? null, opcion);
      proceso.dark = await page.evaluate(() => document.documentElement.classList.contains("dark"));
      proceso.guardado = await page.evaluate(() => localStorage.getItem("apex_theme"));
      await page.evaluate(() => document.querySelector('[role="dialog"] button[aria-label="Cerrar"]')?.click());
      await page.waitForFunction(() => !document.querySelector('[aria-label="Tema de la plataforma"]'), { timeout: NAV_TIMEOUT }).catch(() => undefined);
      proceso.exito = true;
      return proceso;
    }
    proceso.exito = false;
    return proceso;
  }

  try {
    const accesoMs = await login();
    check("login_real_en_qa", accesoMs > 0 && page.url().includes("/dashboard"), { ms: accesoMs });

    await page.goto(`${FRONTEND}${SCREEN}`, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT });
    await page.waitForSelector('button[aria-pressed]', { timeout: NAV_TIMEOUT });
    await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));

    // 1) La vista por defecto se mide ANTES de tocar el filtro: es el estado inicial del tablero.
    const porDefecto = await page.evaluate(() => ({
      botones: [...document.querySelectorAll('button[aria-pressed]')]
        .map((n) => ({ texto: (n.textContent || "").trim(), presionado: n.getAttribute("aria-pressed") }))
        .filter((b) => ["Línea de tiempo", "Tabla"].includes(b.texto)),
      filasTabla: document.querySelectorAll("tr[data-route-id]").length,
      grupo: Boolean(document.querySelector('[role="group"][aria-label="Modo de vista del listado"]')),
      avisoVacia: /no hay|sin horarios|Sin jornadas|Programación de jornadas/i.test((document.body.innerText || "").slice(0, 6000))
    }));
    check("el_selector_de_vista_existe_en_la_barra_de_filtros", porDefecto.grupo && porDefecto.botones.length === 2, porDefecto.botones);
    check("la_vista_por_defecto_es_linea_de_tiempo",
      porDefecto.botones.some((b) => b.texto === "Línea de tiempo" && b.presionado === "true") &&
      porDefecto.botones.some((b) => b.texto === "Tabla" && b.presionado === "false") &&
      porDefecto.filasTabla === 0, porDefecto);

    const seleccion = await chooseDate();
    RESUL.eleccion_de_fecha = seleccion;
    check("qa_tiene_jornadas_que_medir", seleccion.total_jornas > 0 && Boolean(seleccion.elegida), {
      total_jornas: seleccion.total_jornas, hoy: seleccion.hoy, jornadas_hoy: seleccion.jornadas_hoy, candidatas: (seleccion.candidatas || []).slice(0, 3)
    });
    check("el_filtro_de_fecha_vive_en_la_barra", await page.evaluate(() => Boolean(document.querySelector('input[aria-label="Filtrar por fecha"]'))));
    if (seleccion.elegida) {
      await setDate(seleccion.elegida.fecha);
      await page.waitForFunction((fecha) => {
        const el = document.querySelector('input[aria-label="Filtrar por fecha"]');
        return Boolean(el) && el.value === fecha && Boolean(document.querySelector('[data-schedule-view="timeline"] li[data-route-id]'));
      }, { timeout: NAV_TIMEOUT }, seleccion.elegida.fecha).catch(() => undefined);
    }
    check("la_fecha_en_pantalla_es_la_fecha_medida", await page.evaluate((fecha) => {
      const el = document.querySelector('input[aria-label="Filtrar por fecha"]');
      return Boolean(el) && Boolean(fecha) && el.value === fecha;
    }, (seleccion.elegida || {}).fecha || ""), { fecha: (seleccion.elegida || {}).fecha });

    const filas = await page.evaluate(() => document.querySelectorAll('[data-schedule-view="timeline"] li[data-route-id]').length);
    check("el_listado_pinta_filas_en_la_fecha_medida", filas > 0, { filas, fecha: (seleccion.elegida || {}).fecha, jornada_espera: seleccion.jornadas_hoy });
    check("tras_fijar_la_fecha_sigue_sin_haber_tabla", await page.evaluate(() => document.querySelectorAll("tr[data-route-id]").length === 0));

    const indicadores = await page.evaluate(() => {
      const rejillas = [...document.querySelectorAll('[class*="auto-fit"]')];
      const grid = rejillas.find((g) => g.children.length >= 6) || rejillas[0];
      if (!grid) return { rejillas: 0, tarjetas: 0, topes: 0, ancho: 0 };
      const cajas = [...grid.children].map((n) => Math.round(n.getBoundingClientRect().top));
      const ancho = Math.min(...[...grid.children].map((n) => Math.round(n.getBoundingClientRect().width)));
      return { rejillas: rejillas.length, tarjetas: grid.children.length, topes: new Set(cajas).size, ancho };
    });
    check("los_seis_indicadores_caben_en_una_sola_fila_de_escritorio",
      indicadores.tarjetas >= 6 && indicadores.topes === 1 && indicadores.ancho < 400, indicadores);

    const eje = await page.evaluate(() => {
      const zona = document.querySelector('[data-schedule-view="timeline"] .overflow-x-auto');
      const marcas = [...(zona ? zona.querySelectorAll('[aria-hidden="true"] span') : [])]
        .map((n) => (n.textContent || "").trim())
        .filter((t) => /^\d{2}:00$/.test(t));
      return { unicas: [...new Set(marcas)].sort(), total: new Set(marcas).size };
    });
    // El eje cubre dieciseis horas y se etiqueta de dos en dos: TIMELINE_TICK_HOURS son nueve marcas
    // (06, 08, ... , 22). Se mide la cantidad y no la suposicion: el contrato estatico del mismo arbol
    // declara este arreglo y aqui se comprueba que el navegador lo pinto.
    check("el_eje_va_de_0600_a_2200_con_nueve_marcas_de_dos_en_dos",
      eje.total === 9 && eje.unicas[0] === "06:00" && eje.unicas[eje.total - 1] === "22:00", eje);

    const franjas = await page.evaluate(() => {
      const fran = [...document.querySelectorAll('[data-schedule-view="timeline"] li[data-route-id] > div:last-child > button')];
      const nombres = [...document.querySelectorAll('[data-schedule-view="timeline"] li[data-route-id] > div:first-child > button')];
      const datos = fran.map((b) => ({
        left: parseFloat(b.style.left), width: parseFloat(b.style.width),
        alto: Math.round(b.getBoundingClientRect().height),
        aria: b.getAttribute("aria-label") || "", titulo: b.getAttribute("title") || ""
      }));
      const desborda = datos.filter((d) => !Number.isFinite(d.left) || !Number.isFinite(d.width) || d.left < -0.5 || d.left + d.width > 100.5);
      const puntos = document.querySelectorAll('[data-schedule-view="timeline"] li[data-route-id] > div:first-child span[aria-hidden="true"].rounded-full').length;
      return {
        filas: document.querySelectorAll('[data-schedule-view="timeline"] li[data-route-id]').length,
        franjas: fran.length,
        sinFranja: document.querySelectorAll('[data-schedule-view="timeline"] li[data-route-id] > div:last-child > span').length,
        accesibles: datos.filter((d) => /^Abrir detalle del horario /.test(d.aria)).length,
        nombresAccesibles: nombres.filter((b) => /^Abrir detalle del horario /.test(b.getAttribute("aria-label") || "")).length,
        puntos, desbordan: desborda.length, muestra: datos.slice(0, 3)
      };
    });
    check("cada_franja_tiene_posicion_y_ancho_dentro_del_eje",
      franjas.franjas > 0 && franjas.desbordan === 0 && franjas.muestra.every((d) => d.width > 0),
      { franjas: franjas.franjas, desbordan: franjas.desbordan, muestra: franjas.muestra });
    check("la_franja_y_el_nombre_de_la_jornada_son_botones_accesibles",
      franjas.franjas > 0 && franjas.accesibles === franjas.franjas && franjas.nombresAccesibles === franjas.filas,
      { filas: franjas.filas, franjas: franjas.franjas, accesibles: franjas.accesibles, nombres: franjas.nombresAccesibles });
    check("cada_fila_pinta_su_punto_de_estado", franjas.puntos >= franjas.filas && franjas.filas > 0, { puntos: franjas.puntos, filas: franjas.filas });
    await page.screenshot({ path: path.join(OUT, "qa-1-linea-de-tiempo.png") }).catch(() => undefined);

    // 2) Autocontrol del censo: tiene que ver lo que se inyecta y no ver lo que no esta.
    const inyeccion = await page.evaluate(() => {
      const lista = document.querySelector('[data-schedule-view="timeline"] ol');
      const antes = document.querySelectorAll('[data-schedule-view="timeline"] li[data-route-id]').length;
      const falso = document.createElement("li");
      falso.setAttribute("data-route-id", "ARNES-INYECTADO");
      lista.appendChild(falso);
      const despues = document.querySelectorAll('[data-schedule-view="timeline"] li[data-route-id]').length;
      const fantasma = document.querySelectorAll('[data-schedule-view="cronometrada"] li[data-route-id]').length;
      falso.remove();
      return { antes, despues, fantasma, despuesDeRetirar: document.querySelectorAll('[data-schedule-view="timeline"] li[data-route-id]').length };
    });
    check("el_arnes_ve_lo_que_se_inyecta_y_nada_lo_que_no_esta",
      inyeccion.despues === inyeccion.antes + 1 && inyeccion.fantasma === 0 && inyeccion.despuesDeRetirar === inyeccion.antes, inyeccion);

    // 3) Abrir el detalle pulsando la franja.
    const ventanasAntes = dialogs.length;
    await page.evaluate(() => window.alert("ARNES: control de ventanillas nativas en QA"));
    await new Promise((resolve) => setTimeout(resolve, 400));
    check("el_arnes_detecta_una_ventanilla_nativa",
      dialogs.length === ventanasAntes + 1 && /^ARNES:/.test(dialogs[dialogs.length - 1].message), { registradas: dialogs.length });

    // Se mide la jornada que de verdad tiene personas o evidencia contada por la API: una ventana de un
    // horario vacio daria verde a las patas de contenido sin haber mostrado nada.
    const candidatas = (seleccion.jornadas_del_dia || []).filter((j) => j.puntaje > 0);
    const ids = candidatas.map((j) => j.id);
    const escriturasAntes = writes.length;
    const apertura = await page.evaluate((buscados) => {
      const barras = [...document.querySelectorAll('[data-schedule-view="timeline"] li[data-route-id] > div:last-child > button')]
        .filter((n) => /^Abrir detalle del horario /.test(n.getAttribute("aria-label") || "") && n.getBoundingClientRect().width > 0);
      let bar = null;
      let fila_buscada = "";
      for (const id of buscados) {
        const raiz = document.querySelector(`[data-schedule-view="timeline"] li[data-route-id="${id}"]`);
        const candidata = raiz && [...raiz.querySelectorAll("div:last-child > button")]
          .find((n) => /^Abrir detalle del horario /.test(n.getAttribute("aria-label") || "") && n.getBoundingClientRect().width > 0);
        if (candidata) { bar = candidata; fila_buscada = id; break; }
      }
      if (!bar) {
        return {
          pulsado: false, aria: "", fila_buscada: buscados[0] || "", buscados,
          filas_en_eje: document.querySelectorAll('[data-schedule-view="timeline"] li[data-route-id]').length,
          ids_en_eje: [...document.querySelectorAll('[data-schedule-view="timeline"] li[data-route-id]')].slice(0, 12)
            .map((li) => li.getAttribute("data-route-id"))
        };
      }
      const aria = bar.getAttribute("aria-label");
      const fila = bar.closest("li").getAttribute("data-route-id");
      bar.click();
      return { pulsado: true, aria, fila_buscada, fila_pulsada: fila, por_descarte: !buscados.includes(fila), total_barras: barras.length };
    }, ids);
    const elegidaReal = (seleccion.jornadas_del_dia || []).find((j) => j.id === apertura.fila_pulsada) || (candidatas[0] || {});
    const personas = Number(elegidaReal.personas) || 0;
    const evidencias_api = Number(elegidaReal.evidencias) || 0;
    RESUL.jornada_medida = apertura.pulsado ? elegidaReal : (seleccion.mejor_jornada || null);
    await page.waitForFunction(() => Boolean(document.querySelector('[aria-label="Monitor de horario"]')), { timeout: NAV_TIMEOUT }).catch(() => undefined);
    await page.waitForFunction(() => {
      const dialog = document.querySelector('[aria-label="Monitor de horario"]');
      if (!dialog) return false;
      return dialog.querySelectorAll("img").length > 0 || /Sin evidencia/i.test(dialog.textContent || "");
    }, { timeout: 30_000 }).catch(() => undefined);
    const ventana = { abierta: false, tiles: [], metricas: [], imagenes: 0, decodificadas: 0, trazabilidad: false, pasos: "", sinEvidencia: false, desenfoque: "", role: "", ariaModal: "", titulo: "", ...(await page.evaluate(() => {
      const dialog = document.querySelector('[aria-label="Monitor de horario"]');
      if (!dialog) return { abierta: false };
      // textContent, no innerText: las etiquetas del header estan en mayusculas por CSS y el filtro
      // tendria que comparar contra el texto real del DOM.
      const texto = (dialog.textContent || "").replace(/\s+/g, " ").slice(0, 8000);
      const tiles = [...dialog.querySelectorAll("header .grid > div")].map((n) => String(n.querySelector("p")?.textContent || "").trim());
      const imgs = [...dialog.querySelectorAll("img")];
      const estilo = getComputedStyle(dialog.parentElement);
      return {
        abierta: true,
        role: dialog.getAttribute("role"),
        ariaModal: dialog.getAttribute("aria-modal"),
        trazabilidad: /Trazabilidad cronol/i.test(texto),
        pasos: (([...dialog.querySelectorAll("p")].map((p) => String(p.textContent || "").replace(/\s+/g, " ").trim())
          .find((t) => /^\d+ de \d+ pasos/.test(t)) || "")),
        tiles,
        metricas: ["Marcaciones", "Actividades", "Evidencias", "En vivo"].filter((label) => tiles.includes(label)),
        imagenes: imgs.length,
        decodificadas: imgs.filter((i) => i.naturalWidth > 0).length,
        sinEvidencia: /Sin evidencia fot[o]gr[aá]fica/i.test(texto),
        desenfoque: estilo.backdropFilter || estilo.webkitBackdropFilter || "",
        titulo: String(dialog.querySelector("h2")?.textContent || "").trim()
      };
    })) };
    check("pulsar_la_franja_abre_la_ventana_de_detalle",
      apertura.pulsado && ventana.abierta === true && ventana.role === "dialog" && ventana.ariaModal === "true",
      { aria: apertura.aria, fila_buscada: apertura.fila_buscada, fila_pulsada: apertura.fila_pulsada, ids_en_eje: apertura.ids_en_eje, filas_en_eje: apertura.filas_en_eje, role: ventana.role, ariaModal: ventana.ariaModal });
    check("la_ventana_trae_su_tira_de_metricas", ventana.abierta === true && ventana.metricas.length === 4, { tiles: ventana.tiles, metricas: ventana.metricas });
    check("la_ventana_muestra_la_traza_cronologica_del_equipo", ventana.trazabilidad === true, { trazabilidad: ventana.trazabilidad });
    if (personas > 0) {
      check("la_ventana_pasa_el_progreso_de_los_cuatro_pasos_de_la_persona", /\d+ de 4 pasos/.test(ventana.pasos || ""), { personas, pasos: ventana.pasos });
    } else {
      skip("la_ventana_pasa_el_progreso_de_los_cuatro_pasos_de_la_persona",
        `ninguna jornada de ${RESUL.tenant} en ${(seleccion.elegida || {}).fecha} tiene personas asignadas (jornada: ${apertura.fila_pulsada || apertura.fila_buscada || "ninguna"})`);
    }
    if (evidencias_api > 0) {
      check("la_evidencia_contada_por_la_api_llega_decodificada_a_la_ventana",
        ventana.imagenes > 0 && ventana.decodificadas === ventana.imagenes,
        { contadas_por_api: evidencias_api, imagenes: ventana.imagenes, decodificadas: ventana.decodificadas });
    } else {
      check("la_ventana_declara_que_no_hay_evidencia", ventana.imagenes === 0 && ventana.sinEvidencia === true,
        { imagenes: ventana.imagenes, sin_evidencia: ventana.sinEvidencia });
      skip("la_evidencia_contada_por_la_api_llega_decodificada_a_la_ventana",
        `la API no conto evidencias en la fecha medida (${(seleccion.elegida || {}).fecha})`);
    }
    check("la_ventana_es_un_flotante_desenfocado", /blur\(/.test(ventana.desenfoque || ""), { backdrop_filter: ventana.desenfoque });
    RESUL.medidas.ventana_desde_franja = ventana;
    await page.screenshot({ path: path.join(OUT, "qa-2-ventana-desde-franja.png") }).catch(() => undefined);
    check("abrir_la_ventana_no_escribio_nada", writes.length === escriturasAntes, { escrituras: writes.slice(escriturasAntes) });

    await page.evaluate(() => document.querySelector('button[aria-label="Cerrar monitor"]')?.click());
    await page.waitForFunction(() => !document.querySelector('[role="dialog"]'), { timeout: NAV_TIMEOUT }).catch(() => undefined);
    check("cerrar_la_ventana_devuelve_al_listado", await page.evaluate(() =>
      !document.querySelector('[aria-label="Monitor de horario"]') && Boolean(document.querySelector('[data-schedule-view="timeline"]'))));

    // 4) Tabla: el mismo detalle por la fila y las acciones detras del menu.
    await page.evaluate(() => [...document.querySelectorAll("button")].find((n) => (n.textContent || "").trim() === "Tabla")?.click());
    await page.waitForSelector("tr[data-route-id]", { timeout: NAV_TIMEOUT });
    await new Promise((resolve) => setTimeout(resolve, 800));
    const tabla = await page.evaluate(() => {
      const filas = [...document.querySelectorAll("tr[data-route-id]")];
      const visible = (txt) => [...document.querySelectorAll("button")].some((b) => (b.textContent || "").trim() === txt && b.getBoundingClientRect().width > 0);
      return {
        filas: filas.length,
        menus: filas.filter((f) => f.querySelector('button[aria-label^="Mas acciones"]')).length,
        puntos: filas.filter((f) => f.querySelector('span[aria-hidden="true"].rounded-full')).length,
        abrir: filas.filter((f) => [...f.querySelectorAll("button")].some((b) => (b.textContent || "").trim() === "Abrir")).length,
        editarVisible: visible("Editar"),
        clonarVisible: visible("Clonar"),
        ejeApagado: !document.querySelector('[data-schedule-view="timeline"]'),
        presionado: [...document.querySelectorAll('button[aria-pressed]')]
          .map((n) => ({ texto: (n.textContent || "").trim(), presionado: n.getAttribute("aria-pressed") }))
          .filter((b) => ["Línea de tiempo", "Tabla"].includes(b.texto))
      };
    });
    check("alternar_a_tabla_apaga_la_linea_de_tiempo", tabla.ejeApagado && tabla.presionado.every((b) => b.presionado === (b.texto === "Tabla" ? "true" : "false")), tabla.presionado);
    check("la_tabla_pinta_filas_con_punto_de_estado_y_su_menu",
      tabla.filas > 0 && tabla.menus === tabla.filas && tabla.puntos >= tabla.filas, { filas: tabla.filas, menus: tabla.menus, puntos: tabla.puntos });
    check("las_acciones_no_estan_a_la_vista_hasta_abrir_el_menu", tabla.editarVisible === false && tabla.clonarVisible === false,
      { editarVisible: tabla.editarVisible, clonarVisible: tabla.clonarVisible, abrir: tabla.abrir });
    await page.screenshot({ path: path.join(OUT, "qa-3-tabla.png") }).catch(() => undefined);

    const filaId = await page.evaluate(() => document.querySelector("tr[data-route-id]")?.getAttribute("data-route-id") || "");
    await page.evaluate(() => document.querySelector("tr[data-route-id]")?.click());
    await page.waitForFunction(() => Boolean(document.querySelector('[aria-label="Monitor de horario"]')), { timeout: NAV_TIMEOUT }).catch(() => undefined);
    const desdeFila = await page.evaluate(() => {
      const dialog = document.querySelector('[aria-label="Monitor de horario"]');
      return { abierta: Boolean(dialog), titulo: String(dialog?.querySelector("h2")?.textContent || "").trim() };
    });
    check("la_fila_completa_abre_el_mismo_detalle", desdeFila.abierta === true && desdeFila.titulo.length > 0, { fila_id: filaId, ...desdeFila });
    await page.evaluate(() => document.querySelector('button[aria-label="Cerrar monitor"]')?.click());
    await page.waitForFunction(() => !document.querySelector('[role="dialog"]'), { timeout: NAV_TIMEOUT }).catch(() => undefined);

    await page.evaluate(() => document.querySelector('tr[data-route-id] button[aria-label^="Mas acciones"]')?.click());
    await page.waitForFunction(() => [...document.querySelectorAll("tr[data-route-id] button")].some((n) => (n.textContent || "").trim() === "Editar"), { timeout: NAV_TIMEOUT }).catch(() => undefined);
    const menu = await page.evaluate(() => ({
      expandido: document.querySelector('tr[data-route-id] button[aria-label^="Mas acciones"]')?.getAttribute("aria-expanded"),
      editar: [...document.querySelectorAll("tr[data-route-id] button")].some((n) => (n.textContent || "").trim() === "Editar"),
      clonar: [...document.querySelectorAll("tr[data-route-id] button")].some((n) => (n.textContent || "").trim() === "Clonar")
    }));
    check("el_menu_de_la_fila_revela_editar_y_clonar", menu.expandido === "true" && menu.editar && menu.clonar, menu);
    await page.screenshot({ path: path.join(OUT, "qa-4-menu-fila.png") }).catch(() => undefined);
    await page.evaluate(() => document.querySelector('tr[data-route-id] button[aria-label^="Mas acciones"]')?.click());

    // 5) Contraste y tema: se fijan LOS DOS desde el control de la app. Dejar el primero a merced del
    //    estado inicial es lo que hacia medir "claro" sobre un tablero ya oscuro (medido en la corrida 1:
    //    el portal arranca en oscuro y el par claro/oscuro salia identico, y el verde de "tema oscuro"
    //    era el estado por defecto, no el pulso del boton).
    await page.evaluate(() => [...document.querySelectorAll("button")].find((n) => (n.textContent || "").trim() === "Línea de tiempo")?.click());
    const fechaMedida = (seleccion.elegida || {}).fecha || "";
    const temaClaro = await aplicarTema("Claro");
    RESUL.medidas.control_tema_claro = temaClaro;
    check("el_control_de_cuenta_expone_el_grupo_de_tema",
      temaClaro.exito === true && (temaClaro.grupo || []).map((b) => b.texto).join(",") === "Claro,Oscuro,Sistema",
      { grupo: temaClaro.grupo, presionado: temaClaro.presionado, intentos: temaClaro.intentos.map((i) => ({ abrio: i.abrio ?? true, disparador: i.disparador.length, por_texto: i.por_texto.length, dialogos: i.dialogos })) });
    const esClaro = await page.evaluate(() => ({ dark: document.documentElement.classList.contains("dark"), guardado: localStorage.getItem("apex_theme") }));
    check("el_control_de_tema_deja_la_plataforma_en_claro", esClaro.dark === false, esClaro);
    const recargoClaro = await asegurarListado(fechaMedida);
    const claro = await page.evaluate(probeFranja).catch(() => ({ fallo: "la pista no pinto franjas" }));
    RESUL.medidas.tema_claro = { ...claro, recargo_de_la_vista: recargoClaro.recargo };
    if (esClaro.dark === false) {
      check("la_franja_pinta_en_tema_claro_con_contraste_AA", claro.contraste >= 4.5, { contraste: claro.contraste, tinta: claro.ink, fondo: claro.barBg });
    } else {
      skip("la_franja_pinta_en_tema_claro_con_contraste_AA",
        `el control de la app no dejo la plataforma en claro (dark=${esClaro.dark}, guardado=${esClaro.guardado}); medir contraste sobre el tema oscuro seria mentir`);
    }

    const temaOscuro = await aplicarTema("Oscuro");
    RESUL.medidas.control_tema_oscuro = temaOscuro;
    const recargoOscuro = await asegurarListado(fechaMedida);
    const oscuro = await page.evaluate(probeFranja).catch(() => ({ fallo: "la pista no pinto franjas" }));
    RESUL.medidas.tema_oscuro = { ...oscuro, recargo_de_la_vista: recargoOscuro.recargo };
    check("el_tema_oscuro_se_aplica_desde_mi_cuenta", temaOscuro.exito === true && await page.evaluate(() => document.documentElement.classList.contains("dark")) === true, {
      exito_del_control: temaOscuro.exito, guardado: temaOscuro.guardado, fondo_claro: claro.page, fondo_oscuro: oscuro.page
    });
    if (esClaro.dark === false && temaOscuro.exito === true) {
      check("el_tema_cambia_de_verdad_fondo_pista_y_tinta",
        Boolean(oscuro.page) && claro.page !== oscuro.page && claro.track !== oscuro.track && claro.ink !== oscuro.ink,
        { fondo: [claro.page, oscuro.page], pista: [claro.track, oscuro.track], tinta: [claro.ink, oscuro.ink] });
      check("la_etiqueta_de_la_franja_conserva_AA_en_los_dos_temas",
        claro.contraste >= 4.5 && oscuro.contraste >= 4.5, { claro: claro.contraste, oscuro: oscuro.contraste });
    } else {
      skip("el_tema_cambia_de_verdad_fondo_pista_y_tinta",
        `el par claro/oscuro no pudo formarse en QA (claro dark=${esClaro.dark}, control oscuro ${temaOscuro.exito ? "ok" : "no abrio el modal"})`);
      skip("la_etiqueta_de_la_franja_conserva_AA_en_los_dos_temas", "mismo motivo: no se lograron los dos temas desde el control de la app");
    }
    await page.screenshot({ path: path.join(OUT, "qa-5-tema-oscuro.png") }).catch(() => undefined);
    await aplicarTema("Claro");

    // 6) Telefono. El cambio de dispositivo recarga la vista y el filtro vuelve a hoy: la recarga puede
    //    aterrizar DESPUES de que el arnes fije la fecha, y el eje solo se pinta con jornadas. Primero
    //    se estabiliza el documento con la fecha medida y se exige ese denominador; solo entonces las
    //    cuatro patas de layout acusan a la pantalla (corrida del 27-11: conto 23 filas, midio 0 px y
    //    reporto como defecto del tablero una lista vacia).
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true });
    // Si el denominador movil falla hay que decir por que: se escuchan las respuestas del listado de
    // jornadas durante el tramo de telefono (un 4xx o un payload vacio se ven aqui, no en el censo).
    const respuestasMoviles = [];
    const oirListadoMovil = (response) => {
      try {
        const url = new URL(response.url());
        if (url.origin !== apiOrigin || !url.pathname.startsWith("/api/v1/hr/routes")) return;
        const cabeceras = response.headers() || {};
        respuestasMoviles.push({ estado: response.status(), consulta: url.search.slice(0, 60), bytes: Number(cabeceras["content-length"] || 0) });
      } catch { /* un oyente que revienta no puede tumbar la corrida */ }
    };
    page.on("response", oirListadoMovil);
    const telefonoEstable = await estabilizarTelefono(fechaMedida);
    RESUL.medidas.estabilizacion_telefono = telefonoEstable;
    const conJornadas = telefonoEstable.filas > 0 && telefonoEstable.valor_fecha === fechaMedida;
    check("en_390px_el_listado_trae_jornadas_de_la_fecha_medida", conJornadas, {
      filas: telefonoEstable.filas, valor_fecha: telefonoEstable.valor_fecha, fecha_medida: fechaMedida,
      intentos: telefonoEstable.intentos, recargas: telefonoEstable.recargas,
      rutas_api: respuestasMoviles.slice(-4), aviso_vacio: (telefonoEstable.lectura.slice(-1)[0] || {}).aviso_vacio,
      lectura: telefonoEstable.lectura.slice(-3)
    });
    const exigirTelefono = (nombre, ok, payload) => (conJornadas
      ? check(nombre, ok, payload)
      : skip(nombre, `el recargo movil no dejo jornadas con la fecha medida (${telefonoEstable.filas} filas, filtro "${telefonoEstable.valor_fecha}", ${telefonoEstable.recargas} recargas)`));
    if (conJornadas) {
      await page.waitForSelector('[data-schedule-view="timeline"] li[data-route-id] > div:last-child > button', { visible: true, timeout: NAV_TIMEOUT }).catch(() => undefined);
      await new Promise((resolve) => setTimeout(resolve, 700));
    }
    const telefono = await page.evaluate(() => {
      const pista = document.querySelector('[data-schedule-view="timeline"] .overflow-x-auto');
      const rejillas = [...document.querySelectorAll('[class*="auto-fit"]')];
      const grid = rejillas.find((g) => g.children.length >= 6) || rejillas[0];
      const bar = document.querySelector('[data-schedule-view="timeline"] li[data-route-id] > div:last-child > button');
      const topes = grid ? [...new Set([...grid.children].map((n) => Math.round(n.getBoundingClientRect().top)))] : [];
      return {
        filas: document.querySelectorAll('[data-schedule-view="timeline"] li[data-route-id]').length,
        scroll_horizontal: pista ? pista.scrollWidth > pista.clientWidth : false,
        desborde_pista: pista ? pista.scrollWidth - pista.clientWidth : 0,
        tarjetas: grid ? grid.children.length : 0,
        filas_de_indicadores: topes.length,
        tactil: bar ? Math.round(bar.getBoundingClientRect().height) : 0,
        desborde_pagina: document.documentElement.scrollWidth - window.innerWidth
      };
    });
    exigirTelefono("en_390px_los_indicadores_se_apilan", telefono.tarjetas >= 6 && telefono.filas_de_indicadores >= 2, telefono);
    exigirTelefono("en_390px_la_pista_desborda_con_scroll_horizontal", telefono.scroll_horizontal, { desborde_px: telefono.desborde_pista, filas: telefono.filas });
    exigirTelefono("en_390px_la_franja_se_toca_con_al_menos_40px", telefono.tactil >= 40, { tactil_px: telefono.tactil, filas: telefono.filas });
    exigirTelefono("en_390px_no_aparece_un_scroll_horizontal_de_pagina", telefono.desborde_pagina <= 1, { desborde_px: telefono.desborde_pagina, filas: telefono.filas });
    await page.screenshot({ path: path.join(OUT, "qa-6-telefono.png") }).catch(() => undefined);

    const pulsoMovil = conJornadas ? await page.evaluate((id) => {
      const raiz = id ? document.querySelector(`[data-schedule-view="timeline"] li[data-route-id="${id}"]`) : document.querySelector('[data-schedule-view="timeline"]');
      const bar = raiz && [...raiz.querySelectorAll("div:last-child > button")].find((n) => n.getBoundingClientRect().width > 0);
      if (!bar) return false;
      bar.click();
      return true;
    }, apertura.fila_pulsada || "") : false;
    exigirTelefono("en_390px_la_franja_tambien_abre_la_ventana", pulsoMovil === true, { jornada: apertura.fila_pulsada || "la primera con franja", filas: telefono.filas });
    await page.waitForSelector('[aria-label="Monitor de horario"]', { timeout: NAV_TIMEOUT }).catch(() => undefined);
    const ventanaMovil = await page.evaluate(() => {
      const dialog = document.querySelector('[aria-label="Monitor de horario"]');
      if (!dialog) return { abierta: false, ancho: 0, vw: window.innerWidth, metricas: 0 };
      const caja = dialog.getBoundingClientRect();
      return { abierta: true, ancho: Math.round(caja.width), vw: window.innerWidth, metricas: dialog.querySelectorAll("header .grid > div").length };
    });
    exigirTelefono("en_390px_la_ventana_ocupa_todo_el_ancho", ventanaMovil.ancho >= ventanaMovil.vw - 1, ventanaMovil);
    RESUL.medidas.telefono = { ...telefono, ventana: ventanaMovil };
    await page.screenshot({ path: path.join(OUT, "qa-7-ventana-telefono.png") }).catch(() => undefined);
    try { page.off("response", oirListadoMovil); } catch { /* el oyente muere con la pagina si la version no expone off */ }


    // 7) Higiene de la pantalla nueva: no trajo ventanillas, ni tarjetas tecnicas, ni escrituras.
    check("cero_ventanas_nativas_de_la_app", realDialogs().length === 0, { dialogs: realDialogs().slice(0, 3) });
    check("cero_respuestas_5xx_en_la_sesion", serverErrors.length === 0, { errores: serverErrors.slice(0, 5) });
    check("toda_la_corrida_fue_de_solo_lectura", writes.length === 0, { escrituras: writes.slice(0, 5) });
    const tarjetas = await page.evaluate(() => ({
      marcadores: ["Fallo tecnico detectado", "Fallo técnico detectado", "Estado: 500", "request_id"].filter((m) => (document.body.innerText || "").includes(m)),
      overlay: document.querySelectorAll(".platform-alert").length
    }));
    check("cero_tarjetas_de_fallo_tecnico", tarjetas.marcadores.length === 0 && tarjetas.overlay === 0, tarjetas);
  } finally {
    await browser.close().catch(() => undefined);
    await admin.setUserActive(usuario.tenantId, usuario.id, false).catch(() => undefined);
    RESUL.cuenta_efimera_desactivada = true;
    writeEvidence();
    await prisma.$disconnect().catch(() => undefined);
  }

  const malos = RESUL.checks.filter((item) => !item.ok);
  RESUL.status = malos.length ? "failed" : "passed";
  writeEvidence();
  console.log(`VEREDICTO QA ${RESUL.verdict.passed}/${RESUL.verdict.total} · evidencia en ${OUT}`);
  if (malos.length) {
    console.error(`CERTIFICACION QA CON ${malos.length} FALLOS: ${malos.map((item) => item.name).join(", ").slice(0, 900)}`);
    process.exitCode = 1;
    return;
  }
  console.log(`CERTIFICACION QA APROBADA: la linea de tiempo de Horarios y mallas esta servida en ${RESUL.tenant}`);
}

main().catch((error) => {
  RESUL.status = "failed";
  RESUL.error = { message: String((error && error.message) || error), stack: String((error && error.stack) || "").split("\n").slice(0, 6).join("\n") };
  writeEvidence();
  console.error(`CERTIFICACION QA ABORTADA: ${RESUL.error.message}`);
  process.exitCode = 1;
});
