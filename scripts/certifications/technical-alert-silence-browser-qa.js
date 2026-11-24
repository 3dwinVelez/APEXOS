// Certificacion QA en navegador de "el fallo tecnico no es ventana".
//
// Mide contra el ambiente real desplegado de QA, con usuarios efimeros de la empresa modelo
// NYVORA y de un tenant distinto, las dos mitades de la promesa del brief:
//   1) el camino feliz con datos reales: las pantallas montan, responden y no pintan tarjetas, y
//   2) la tormenta inyectada (500, 429 y red cortada) sobre ESA MISMA sesion: la pantalla sigue
//      viva y sin tarjetas, y el intento de registro si llega a la API.
// El autocontrol es obligatorio: si la tormenta no toco la pagina, la ausencia de ventanas no
// acredita nada. A diferencia del certificador local, aqui los checks se acumulan y el proceso
// termina con codigo distinto de cero al final, porque esta misma corrida se usa para medir el
// "antes" sobre un build que todavia no trae el arreglo.
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
const OUT = path.resolve(ROOT, String(args.output || path.join("docs", "qa", "evidence", "technical-alert-silence-20261118", "qa")));
const EXPECTED_COMMIT = String(args["expected-commit"] || "");
const RUN_ID = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
const PASSWORD = `Qa-Sil-${crypto.randomBytes(6).toString("hex")}#26`;
const NAV_TIMEOUT = Number(args["nav-timeout-ms"] || 90_000);
const SETTLE_MS = Number(args["settle-ms"] || 8_000);

// `static: true` declara la pantalla que se arma con maestros ya guardados en almacenamiento
// local: no dispara peticiones propias y por eso no se le puede exigir tormenta medida, igual que
// en el certificador local. La ausencia de ventanas SI se le exige.
const SCREENS = [
  // Las cabeceras de rutas no son las mismas en las tres ramas: `desarrollo`/`main` dicen
  // "Asignar horarios" / "Consulta de horarios" y `develop` dice "Horarios y mallas" /
  // "Programación de jornadas" (blobs 2e95b48c vs dff6265f, medido el 2026-11-19). El marcador
  // tiene que discriminar "la pantalla se monto" de "cayo al guard o al cascaron del shell", no
  // que version del arbol esta servida: se aceptan las cuatro leyendas.
  { name: "rutas", route: "/dashboard/talento-humano/rutas", mounted: ["Asignar horarios", "Consulta de horarios", "Horarios y mallas", "Programación de jornadas"] },
  { name: "mapa", route: "/dashboard/talento-humano/mapa", mounted: ["Mapa en vivo de rutas y marcaciones", "CONTROL OPERATIVO GPS"] },
  { name: "servicios", route: "/dashboard/servicios", mounted: ["CENTRO OPERATIVO DE SERVICIOS", "Órdenes listas para gestionar"] },
  { name: "monitoreo", route: "/dashboard/transporte/monitoreo", mounted: ["Monitoreo en vivo", "Cargando monitoreo TMS"] },
  // "Bienvenido, <usuario> · <empresa>" es el bloque propio del lobby: medido en la corrida de QA,
  // aparece en las 12 visitas al dashboard de las tres identidades y en ninguna otra pantalla.
  // "Sesion activa" no sirve como marcador porque es chrome del shell y esta en todas las rutas.
  { name: "home", route: "/dashboard", mounted: ["Mis módulos", "Acciones frecuentes", "Bienvenido"], static: true }
];

const TECHNICAL_MARKERS = [
  "Fallo tecnico detectado", "Fallo técnico detectado", "Operacion interrumpida", "Operación interrumpida",
  "Se detecto un fallo", "Se detectó un fallo", "Ruta: /api/v1", "Estado: 500", "Estado: 429",
  "ERROR_INTERNO", "RATE_LIMIT_EXCEEDED", '"error":', "request_id", "platform-logs", "Failed to fetch", "API no disponible"
];

const STORMS = {
  tormenta_500: { kind: "status", status: 500, body: { error: "Error interno del servidor", code: "ERROR_INTERNO", request_id: `qa-silence-500-${RUN_ID}` } },
  tormenta_429: { kind: "status", status: 429, body: { error: "Demasiadas solicitudes en un minuto", code: "RATE_LIMIT_EXCEEDED", request_id: `qa-silence-429-${RUN_ID}` } },
  red_cortada: { kind: "abort" }
};

const RESUL = {
  format: "apexos-technical-alert-silence-qa-v1",
  started_at: new Date().toISOString(),
  environment: "QA",
  api_url: API_URL,
  frontend_url: FRONTEND,
  run_id: RUN_ID,
  deployed_commit: "",
  expected_commit: EXPECTED_COMMIT,
  model_company: "NYVORA",
  users: [],
  scenarios: {},
  checks: []
};

function check(name, ok, payload = {}) {
  RESUL.checks.push({ name, ok: Boolean(ok), ...(Object.keys(payload).length ? { payload } : {}) });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${Object.keys(payload).length ? ` ${JSON.stringify(payload).slice(0, 300)}` : ""}`);
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

// El script solo corre contra QA: la barrera es la misma de los otros certificadores de ambiente.
function assertQaTarget() {
  const env = [process.env.APP_ENV, process.env.TARGET_ENV].map((value) => String(value || "").trim().toLowerCase());
  if (!env.includes("qa")) throw new Error("La certificacion solo puede ejecutarse con configuracion QA (APP_ENV/TARGET_ENV = qa).");
  const expectedRef = String(process.env.EXPECTED_SUPABASE_PROJECT_REF || "").trim();
  const url = String(process.env.DATABASE_URL || "");
  if (!expectedRef) throw new Error("EXPECTED_SUPABASE_PROJECT_REF es obligatorio: esta certificacion crea usuarios en la empresa modelo.");
  if (!url.includes(expectedRef)) throw new Error(`DATABASE_URL no pertenece al project ref esperado (${expectedRef}); se aborta sin conectar.`);
  if (!/qa/i.test(API_URL)) throw new Error(`El API objetivo no parece QA: ${API_URL}`);
}

async function nyvoraTenant(prisma) {
  const direct = await prisma.tenant.findFirst({ where: { name: { contains: "NYVORA", mode: "insensitive" } } });
  if (direct) return direct;
  const companies = await prisma.$queryRawUnsafe("select id,name,legal_name from public.companies order by name").catch(() => []);
  const company = companies.find((item) => String(item.name || "").toLowerCase().includes("nyvora") || String(item.legal_name || "").toLowerCase().includes("nyvora"));
  if (!company) throw new Error("No existe la empresa modelo NYVORA en QA.");
  const tenant = await prisma.tenant.findFirst({ where: { config: { path: ["company_id"], equals: String(company.id) } } });
  if (!tenant) throw new Error("No existe tenant operativo de NYVORA en QA.");
  return tenant;
}

// El tenant forastero tiene que ser una empresa REAL y distinta, no un fixture de validacion:
// los tenants "QA-*" nacen sin `config.company_id` y heredan datos de siembra que aun mencionan
// a NYVORA, lo que convertiria el control de aislamiento en una prueba mal planteada.
async function otherTenant(prisma, admin, excludeId) {
  const companies = await prisma.$queryRawUnsafe("select id,name from public.companies order by name").catch(() => []);
  const companyNameById = new Map(companies.map((item) => [String(item.id), String(item.name || "")]));
  const candidates = (await prisma.tenant.findMany({ where: { id: { not: excludeId }, active: true }, take: 60, orderBy: { name: "asc" } }))
    .filter((tenant) => !/nyvora/i.test(String(tenant.name || "")));
  const conEmpresa = candidates.filter((tenant) => {
    const name = companyNameById.get(String((tenant.config || {}).company_id || "")) || "";
    return name && !/nyvora/i.test(name);
  });
  const ordered = [...conEmpresa, ...candidates.filter((tenant) => !conEmpresa.includes(tenant))];
  for (const tenant of ordered) {
    let roles = [];
    try { roles = await admin.listRoles(tenant.id, {}, "APEX_ADMIN"); } catch { roles = []; }
    if (!roles.length) roles = await prisma.role.findMany({ where: { tenant_id: tenant.id }, take: 4 }).catch(() => []);
    if (roles.length) {
      const company = companyNameById.get(String((tenant.config || {}).company_id || "")) || "";
      return { tenant, roles, company };
    }
  }
  throw new Error("No hay un segundo tenant con roles para medir el aislamiento en QA.");
}

async function provisionUser(admin, tenant, role, suffix, document) {
  // Dominio neutro: si el correo del fixture dice "@nyvora.test", el control de aislamiento del
  // tenant forastero mide el andamio del propio certificador (la cabecera pinta el correo) y no
  // los datos de la empresa.
  const email = `qa.silence.${suffix}.${RUN_ID}@silence-qa.test`;
  const user = await admin.createUser(tenant.id, {
    name: `Silence ${suffix}`,
    first_names: "Silence",
    last_names: suffix,
    email,
    password: PASSWORD,
    role_id: role.id,
    company: tenant.name,
    document,
    code: `QA-SIL-${suffix.toUpperCase()}-${RUN_ID}`,
    department: "QA",
    position: "Usuario de certificacion",
    operational_classification: "administrativo",
    require_password_change: false
  }, null, "APEX_ADMIN");
  RESUL.users.push({ email, tenant: tenant.name, role: role.name });
  return { ...user, email, tenantId: tenant.id };
}

// La promesa vive en el bundle que QA sirve, no en el commit del API. Se lee el HTML publicado,
// se bajan los chunks y se comprueba el par de tokens que separa las dos versiones: el canal
// `apex:diagnostic` (solo con el arreglo) y el canal `apex:alert` (el que este cambio retira).
async function bundleSignals() {
  const html = await fetch(`${FRONTEND}/login`, { signal: AbortSignal.timeout(60_000) }).then((response) => response.text()).catch(() => "");
  const chunks = [...new Set((html.match(/\/_next\/static\/chunks\/[A-Za-z0-9._~@-]+\.js/g) || []))].slice(0, 120);
  const senales = { chunks_leidos: 0, diagnostic: [], alert: [], tamano_bytes: 0 };
  for (const chunk of chunks) {
    const body = await fetch(`${FRONTEND}${chunk}`, { signal: AbortSignal.timeout(60_000) }).then((response) => response.text()).catch(() => "");
    if (!body) continue;
    senales.chunks_leidos += 1;
    senales.tamano_bytes += body.length;
    if (body.includes("apex:diagnostic")) senales.diagnostic.push(chunk);
    if (body.includes("apex:alert")) senales.alert.push(chunk);
  }
  return senales;
}

async function main() {
  assertQaTarget();
  fs.mkdirSync(OUT, { recursive: true });

  const salud = await apiJson("/health");
  RESUL.deployed_commit = String(salud.payload?.commit || "");
  check("api_qa_responde_health", salud.status === 200 && salud.payload?.status === "OK", { status: salud.status, commit: RESUL.deployed_commit });
  if (EXPECTED_COMMIT) {
    check("build_desplegado_es_el_evaluado", RESUL.deployed_commit.startsWith(EXPECTED_COMMIT.replace(/^v/, "")), {
      deployed: RESUL.deployed_commit, expected: EXPECTED_COMMIT
    });
  }

  const bundle = await bundleSignals();
  RESUL.bundle_desplegado = bundle;
  check("qa_sirve_un_bundle_leyable", bundle.chunks_leidos > 0, { chunks_leidos: bundle.chunks_leidos, bytes: bundle.tamano_bytes });
  check("el_bundle_desplegado_trae_el_canal_de_diagnostico", bundle.diagnostic.length > 0, { chunks: bundle.diagnostic.slice(0, 3) });
  check("el_bundle_desplegado_ya_no_dispara_apex_alert", bundle.alert.length === 0, { chunks_con_apex_alert: bundle.alert.slice(0, 3) });

  const prisma = require("../../apps/api/src/core/prisma");
  const admin = require("../../apps/api/src/modules/admin/service");
  const tenant = await nyvoraTenant(prisma);
  RESUL.tenant = { id: tenant.id, name: tenant.name };

  const roles = await admin.listRoles(tenant.id, {}, "APEX_ADMIN");
  const privileged = roles.find((item) => /Administrador de empresa/i.test(item.name)) || roles.find((item) => /admin/i.test(item.name));
  const limited = roles.find((item) => /Empleado/i.test(item.name)) || roles[roles.length - 1];
  if (!privileged || !limited) throw new Error(`NYVORA no tiene los dos roles necesarios: ${roles.map((item) => item.name).join(", ")}`);
  const outside = await otherTenant(prisma, admin, tenant.id);

  const administrador = await provisionUser(admin, tenant, privileged, "admin", `QSA${RUN_ID}`);
  const limitado = await provisionUser(admin, tenant, limited, "limit", `QSL${RUN_ID}`);
  // Para el forastero se busca una session valida de otra empresa, no un superadministrador: el
  // control de aislamiento no necesita levantar un APEX_ADMIN efimero dentro de un tenant real.
  const rolForastero = outside.roles.find((item) => /Empleado|Auxiliar|Analista|Operario|Comercial/i.test(item.name))
    || outside.roles.find((item) => !/APEX_ADMIN|Administrador de empresa|superadmin/i.test(item.name) && item.metadata?.role_type !== "superadmin")
    || outside.roles[outside.roles.length - 1];
  const forastero = await provisionUser(admin, outside.tenant, rolForastero, "other", `QSO${RUN_ID}`);
  RESUL.control_aislamiento = {
    nyvora_tenant: tenant.name,
    otro_tenant: outside.tenant.name,
    otro_tenant_empresa: outside.company || "(tenant sin company_id)",
    otro_tenant_rol: rolForastero && rolForastero.name
  };

  const identidades = [
    { clave: "nyvora_admin", usuario: administrador },
    { clave: "nyvora_limitado", usuario: limitado },
    { clave: "otro_tenant", usuario: forastero }
  ];

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

  // Ventanilla nativa del navegador (alert/confirm/prompt). Sin oyente, Chrome headless la descarta
  // en silencio y "cero ventanas" lo daria igual un arnes roto: por eso la corrida exige primero el
  // control positivo, que se provoca una ventanilla propia con prefijo ARNES: y se pone roja si no la ve.
  const dialogs = [];
  page.on("dialog", async (dialog) => {
    dialogs.push({ type: dialog.type(), message: String(dialog.message() || "").slice(0, 300), at: new Date().toISOString() });
    await dialog.dismiss().catch(() => undefined);
  });
  const realDialogs = () => dialogs.filter((entry) => !/^ARNES:/.test(entry.message));

  const seen = { telemetry: [], telemetry_status: {}, api: [], failed: [], aborted: [], writes: [] };
  let storm = null;
  const CORS_HEADERS = {
    "Access-Control-Allow-Origin": FRONTEND,
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "authorization, content-type, x-request-id, x-csrf-token",
    "Access-Control-Max-Age": "600"
  };
  const apiOrigin = new URL(API_URL).origin;
  const respond = (request, payload) => request.respond({
    status: payload.status,
    contentType: "application/json",
    body: payload.body,
    headers: { ...CORS_HEADERS, ...(payload.headers || {}) }
  });

  await page.setRequestInterception(true);
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.origin !== apiOrigin) return void request.continue();
    const pathname = url.pathname;
    if (request.method() === "OPTIONS") {
      return void respond(request, {
        status: 204,
        body: "",
        headers: { "Access-Control-Allow-Headers": request.headers()["access-control-request-headers"] || CORS_HEADERS["Access-Control-Allow-Headers"] }
      });
    }
    // Cualquier metodo distinto de GET es un intento de escritura. La validacion en linea promete no
    // tocar la red cuando el formulario esta mal, y aqui se mide que de verdad no salio ningun POST.
    if (request.method() !== "GET") seen.writes.push(`${request.method()} ${pathname}`);
    // La telemetria de fallos SIEMPRE pasa a la API real: registrar el fallo es la otra mitad de la
    // promesa y aqui se mide el codigo que de verdad devuelve QA, no uno fabricado.
    if (pathname.startsWith("/api/v1/admin/platform-logs")) {
      seen.telemetry.push(pathname);
      return void request.continue();
    }
    if (pathname.startsWith("/api/v1/auth/")) return void request.continue();
    if (!storm) {
      seen.api.push(pathname);
      return void request.continue();
    }
    if (storm.kind === "abort") {
      seen.aborted.push(pathname);
      return void request.abort("failed");
    }
    seen.failed.push(pathname);
    return void respond(request, { status: storm.status, body: JSON.stringify(storm.body) });
  });

  // No basta con que el intento de registro salga del navegador: en QA se mide el codigo que la
  // API de verdad devuelve, porque "el fallo queda registrado" es la otra mitad de la promesa.
  page.on("response", (response) => {
    let url;
    try { url = new URL(response.url()); } catch { return; }
    if (url.origin !== apiOrigin || !url.pathname.startsWith("/api/v1/admin/platform-logs")) return;
    const code = String(response.status());
    seen.telemetry_status[code] = (seen.telemetry_status[code] || 0) + 1;
  });

  async function readSurface() {
    return page.evaluate((markers) => {
      const overlayCards = [...document.querySelectorAll(".platform-alert")];
      const bodyText = (document.body.innerText || "").slice(0, 8000);
      const technicalFound = markers.filter((marker) => bodyText.includes(marker));
      const inlineAlerts = [...document.querySelectorAll('[role="alert"]')]
        .filter((node) => !node.closest(".platform-alert"))
        .map((node) => (node.textContent || "").trim().slice(0, 220))
        .filter(Boolean);
      return {
        url: location.pathname,
        overlayCards: overlayCards.length,
        overlayText: overlayCards.map((node) => (node.textContent || "").trim().slice(0, 220)),
        inlineAlerts,
        invalidFields: document.querySelectorAll('[aria-invalid="true"]').length,
        technicalFound,
        bodyText
      };
    }, TECHNICAL_MARKERS);
  }

  // Pulsar por el texto del boton, no por posicion: el alta de empleados cambia de layout entre
  // temas y entre las versiones de QA, y un click ciego daria un verde que no toco nada.
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

  async function login(usuario) {
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

  async function visit(definition) {
    const before = { api: seen.api.length, failed: seen.failed.length, aborted: seen.aborted.length, telemetry: seen.telemetry.length };
    const startedAt = Date.now();
    await page.goto(`${FRONTEND}${definition.route}`, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT });
    await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
    const surface = await readSurface();
    return {
      ...surface,
      ms: Date.now() - startedAt,
      dataRequests: seen.api.length - before.api + seen.failed.length - before.failed + seen.aborted.length - before.aborted,
      stormRequests: seen.failed.length - before.failed + seen.aborted.length - before.aborted,
      telemetryPosts: seen.telemetry.length - before.telemetry,
      denied: surface.bodyText.includes("Acceso no autorizado"),
      mounted: definition.mounted.some((marker) => surface.bodyText.includes(marker))
    };
  }

  try {
    for (const identidad of identidades) {
      storm = null;
      const accesoMs = await login(identidad.usuario);
      check(`${identidad.clave}_login_real_en_qa`, accesoMs > 0 && page.url().includes("/dashboard"), { ms: accesoMs });

      // 1) Camino feliz con datos reales: la pantalla debe montar y no puede tener tarjetas.
      const feliz = [];
      for (const definition of SCREENS) {
        const surface = await visit(definition);
        feliz.push({ pantalla: definition.name, ...surface });
        check(`${identidad.clave}_feliz_${definition.name}_sin_tarjetas`, surface.overlayCards === 0 && surface.technicalFound.length === 0, {
          overlayCards: surface.overlayCards, technicalFound: surface.technicalFound, overlayText: surface.overlayText.slice(0, 2)
        });
      }
      RESUL.scenarios[`feliz_${identidad.clave}`] = feliz;

      // 2) Tormentas sobre la misma sesion real.
      //    La promesa central (cero ventanas tecnicas) se exige SIEMPRE y a cualquier rol. Lo que
      //    cambia por rol es el autocontrol de la inyeccion: una pantalla que el RBAC niega no
      //    dispara peticiones por diseno, y una pantalla estatica se arma desde almacenamiento
      //    local. Exigirles tormenta medida seria castigar un permisos-correcto, no un fallo.
      for (const [nombre, rule] of Object.entries(STORMS)) {
        storm = rule;
        const medidas = [];
        for (const definition of SCREENS) {
          const surface = await visit(definition);
          medidas.push({ pantalla: definition.name, ...surface });
          const tormentaEsperada = definition.static !== true && !surface.denied;
          check(`${identidad.clave}_${nombre}_${definition.name}_tormenta_real`, !tormentaEsperada || surface.stormRequests > 0, {
            solicitudes_fallidas: surface.stormRequests, esperada: tormentaEsperada, denied: surface.denied, statica: definition.static === true
          });
          check(`${identidad.clave}_${nombre}_${definition.name}_sin_tarjetas`, surface.overlayCards === 0 && surface.technicalFound.length === 0, {
            overlayCards: surface.overlayCards, technicalFound: surface.technicalFound, overlayText: surface.overlayText.slice(0, 2), snippet: surface.bodyText.slice(0, 180)
          });
          if (surface.denied) {
            // El guard de acceso es estado honesto y ademas debe estar limpio de detalle tecnico.
            check(`${identidad.clave}_${nombre}_${definition.name}_guard_honesto_sin_ventana`, surface.overlayCards === 0 && surface.technicalFound.length === 0, {
              overlayCards: surface.overlayCards, overlayText: surface.overlayText.slice(0, 2)
            });
          } else {
            check(`${identidad.clave}_${nombre}_${definition.name}_pantalla_viva`, surface.mounted, {
              mounted: surface.mounted, snippet: surface.bodyText.slice(0, 180)
            });
          }
        }
        RESUL.scenarios[`${nombre}_${identidad.clave}`] = medidas;
      }
      storm = null;

      // 3) RBAC visible: el rol limitado y el usuario de otro tenant reciben estado, no ventana.
      const estado = await visit({ name: "rutas", route: "/dashboard/talento-humano/rutas", mounted: [] });
      check(`${identidad.clave}_rbac_sin_ventana`, estado.overlayCards === 0 && estado.technicalFound.length === 0, {
        denied: estado.denied, overlayText: estado.overlayText.slice(0, 2)
      });
      if (identidad.clave === "otro_tenant") {
        const texto = estado.bodyText.slice(0, 6000);
        const posicion = texto.search(/NYVORA/i);
        check("otro_tenant_no_ve_a_nyvora", posicion === -1, posicion === -1
          ? { empresa: outside.company || outside.tenant.name }
          : {
            contexto: texto.slice(Math.max(0, posicion - 140), posicion + 140).replace(/\s+/g, " "),
            empresa: outside.company || outside.tenant.name
          });
      }

      // 4) El alta de empleados: el motivo tiene que leerse en el campo, no en una ventanilla del
      //    navegador, y un formulario mal ni siquiera debe tocar la red. Se mide solo con el rol que
      //    ve el maestro (Administrador de empresa de NYVORA); con la tormenta apagada, para que el
      //    rojo que salga sea del build desplegado y no de una inyeccion del arnes.
      if (identidad.clave === "nyvora_admin") {
        const controlAntes = dialogs.length;
        await page.evaluate(() => window.alert("ARNES: control de ventanillas nativas en QA"));
        await new Promise((resolve) => setTimeout(resolve, 400));
        check("el_arnes_detecta_una_ventanilla_nativa",
          dialogs.length === controlAntes + 1 && /^ARNES:/.test(dialogs[dialogs.length - 1].message),
          { registradas: dialogs.length });

        await page.goto(`${FRONTEND}/dashboard/talento-humano/empleados`, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT });
        await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
        const ventanaAntes = realDialogs().length;
        const trazasAntes = dialogs.length;
        const escriturasAntes = seen.writes.length;
        const abierto = await clickByText("Nuevo empleado");
        await new Promise((resolve) => setTimeout(resolve, 1500));
        const enviado = await clickByText("Crear empleado");
        await new Promise((resolve) => setTimeout(resolve, 2000));
        const formulario = await readSurface();
        RESUL.scenarios.validacion_empleados = {
          abierto, enviado, inlineAlerts: formulario.inlineAlerts,
          invalidFields: formulario.invalidFields, escrituras: seen.writes.slice(escriturasAntes)
        };
        check("nyvora_admin_validacion_pantalla_montada", abierto && enviado && /Primer nombre/i.test(formulario.bodyText), {
          abierto, enviado, snippet: formulario.bodyText.slice(0, 160)
        });
        check("nyvora_admin_validacion_motivo_en_el_campo",
          /documento es obligatorio/i.test(formulario.inlineAlerts.join(" ")) || /nombres y apellidos/i.test(formulario.inlineAlerts.join(" ")),
          { inline: formulario.inlineAlerts.slice(0, 4) });
        check("nyvora_admin_validacion_campo_marcado_como_invalido", formulario.invalidFields >= 1, {
          invalidFields: formulario.invalidFields
        });
        check("nyvora_admin_validacion_sin_ventanilla_nativa", realDialogs().length === ventanaAntes, {
          dialogs: dialogs.slice(trazasAntes)
        });
        check("nyvora_admin_validacion_sin_escritura_a_la_api", seen.writes.length === escriturasAntes, {
          escrituras: seen.writes.slice(escriturasAntes).slice(0, 4)
        });
        check("nyvora_admin_validacion_sin_tarjeta_flotante", formulario.overlayCards === 0 && formulario.technicalFound.length === 0, {
          overlayCards: formulario.overlayCards, technicalFound: formulario.technicalFound
        });
        await page.screenshot({ path: path.join(OUT, "qa-validacion-empleados.png") }).catch(() => undefined);
      }

      await page.evaluate(() => window.localStorage.clear());
      await page.goto(`${FRONTEND}/login`, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT }).catch(() => undefined);
      await new Promise((resolve) => setTimeout(resolve, 1200));
    }

    // El registro del fallo es la otra mitad: los intentos de telemetria salen del navegador y se
    // mide el codigo que QA devuelve de verdad (401/403 es deuda declarada, no se maquilla).
    const telemetria = await apiJson("/api/v1/admin/platform-logs/client", {
      method: "POST",
      body: { source: "certificador-qa", message: `sonda ${RUN_ID}`, context: { route: "/dashboard/talento-humano/rutas", status: 500 } }
    });
    const registradas = Object.entries(seen.telemetry_status)
      .filter(([code]) => code.startsWith("2"))
      .reduce((total, [, count]) => total + count, 0);
    RESUL.telemetria = { intentos_navegador: seen.telemetry.length, codigos_en_navegador: seen.telemetry_status, registradas };
    RESUL.telemetria_sin_token = { intentos_navegador: seen.telemetry.length, status_sonda: telemetria.status };
    check("el_navegador_intento_registrar_los_fallos", seen.telemetry.length >= 1, { intentos: seen.telemetry.length });
    check("los_fallos_quedan_registrados_en_qa", registradas >= 1, { registradas, codigos: seen.telemetry_status });

    // La boca publica: el visitante sin sesion ya no puede quedarse sin registro. Se manda un payload
    // hostil —`tenant_id` y `user_email` de OTRA empresa en el cuerpo— y se exige que el servicio los
    // ignore: si algo se escribe, es en el buzon del despliegue y en ninguna otra parte. La sonda se
    // borra despues de leerla; no se deja basura tecnica en el expediente de nadie.
    const buzon = String(process.env.APEXOS_TELEMETRY_TENANT_ID || "").trim();
    const sonda = `sonda publica ${RUN_ID}`;
    const publica = await apiJson("/api/v1/public/telemetry/client-logs", {
      method: "POST",
      body: {
        message: sonda, route: "/login", method: "POST", status_code: 500, code: "ERROR_INTERNO",
        request_id: `qa-silence-public-${RUN_ID}`, metadata: { href: "/login", provider: "certificador-qa" },
        tenant_id: outside.tenant.id, user_email: "arnes@no-debe-escribir.example"
      }
    });
    RESUL.telemetria_publica = { status: publica.status, payload: publica.payload, buzon_configurado: Boolean(buzon) };
    check("la_boca_publica_existe_en_qa", publica.status === 202, { status: publica.status, cuerpo: publica.text.slice(0, 160) });
    check("la_boca_publica_responde_honesto", publica.status === 202 && typeof (publica.payload || {}).recorded === "boolean", {
      payload: publica.payload
    });
    if ((publica.payload || {}).recorded) {
      const filas = buzon ? await prisma.runWithTenant(buzon, () => prisma.auditLog.findMany({
        where: { module: "platform_logs" }, orderBy: { timestamp: "desc" }, take: 40
      })).catch(() => []) : [];
      const mia = filas.find((fila) => String((fila.new_value || {}).message || "") === sonda);
      check("el_reporte_anonimo_queda_en_el_buzon", Boolean(mia), { encontrada: Boolean(mia), buzon: buzon.slice(0, 8) });
      check("el_reporte_anonimo_no_usa_el_tenant_del_cuerpo", !mia || String(mia.tenant_id) !== String(outside.tenant.id), {
        tenant_fila: mia ? String(mia.tenant_id).slice(0, 8) : "(sin fila)", tenant_del_cuerpo: String(outside.tenant.id).slice(0, 8)
      });
      if (mia) await prisma.runWithTenant(buzon, () => prisma.auditLog.delete({ where: { id: mia.id } })).catch(() => undefined);
      RESUL.telemetria_publica.limpieza = mia ? "la fila de la sonda se elimino del buzon" : "no habia fila que eliminar";
    } else {
      check("el_buzon_publico_pide_configuracion_sin_fingir_exito", (publica.payload || {}).reason === "BUZON_TELEMETRIA_NO_CONFIGURADO", {
        payload: publica.payload
      });
    }
    await page.screenshot({ path: path.join(OUT, "qa-sesion-final.png") }).catch(() => undefined);
  } finally {
    await browser.close().catch(() => undefined);
    for (const usuario of identidades.map((item) => item.usuario)) {
      await admin.setUserActive(usuario.tenantId, usuario.id, false).catch(() => undefined);
    }
    RESUL.cuenta_efimera_desactivada = true;
    writeEvidence();
    await prisma.$disconnect().catch(() => undefined);
  }

  const malos = RESUL.checks.filter((item) => !item.ok);
  console.log(`VEREDICTO QA ${RESUL.verdict.passed}/${RESUL.verdict.total} · evidencia en ${OUT}`);
  if (malos.length) {
    console.error(`CERTIFICACION QA CON ${malos.length} FALLOS: ${malos.map((item) => item.name).join(", ").slice(0, 900)}`);
    process.exitCode = 1;
    return;
  }
  console.log(`CERTIFICACION QA APROBADA: el fallo tecnico no es ventana en ${RESUL.tenant.name} ni en ${RESUL.control_aislamiento.otro_tenant}`);
}

main().catch((error) => {
  RESUL.status = "failed";
  RESUL.error = { message: String((error && error.message) || error), stack: String((error && error.stack) || "").split("\n").slice(0, 6).join("\n") };
  writeEvidence();
  console.error(`CERTIFICACION QA ABORTADA: ${RESUL.error.message}`);
  process.exitCode = 1;
});
