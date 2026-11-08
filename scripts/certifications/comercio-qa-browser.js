/* Certificacion de NAVEGADOR del modulo Comercio (M-30) sobre el build desplegado en QA.
 *
 * Que celda cubre y por que las otras no la cubren:
 *   - comercio-ux-local.js y comercio-storefront-theme-local.js miden la interfaz con la pila
 *     local (Next dev + API del puesto). Ciertan el canditado, no el ambiente liberado.
 *   - comercio-develop-remote.js y comercio-nyvora-qa.js miden la API y el bucket de QA con
 *     sesiones propias, pero nunca abren un navegador: no prueban que el build desplegado
 *     pinte el modulo, que la licencia se vea en el menu ni que la CSP de la web liberada
 *     deje cargar las imagenes del almacn.
 *
 * Que se mide aqui (Chromium real contra https://apexos-web-qa-production.up.railway.app):
 *   1. La sesin autenticada de la empresa modelo NYVORA abre el panel y el MENU muestra
 *      Comercio (la celda que la politica pidi como confirmacin visual de la licencia).
 *   2. Las once rutas del panel cargan con su encabezado real y sin ninguna respuesta 5xx.
 *   3. La vitrina pblica se pinta con el tema del tenant (fondo y acento leidos como pixeles
 *      computados, con su contraste WCAG), muestra el titular, el producto con su precio y
 *      las imagenes del bucket cargadas desde el navegador (naturalWidth > 0).
 *   4. El modo claro del mismo tenant se pinta claro: la vitrina no se queda en el default.
 *   5. En mvil la vitrina no desborda en horizontal.
 *   6. Sin sesin, /dashboard/comercio devuelve al login.
 *   7. Consola limpia de errores de producto, y limpieza verificada por id exacto.
 *
 * Huella: una empresa modelo ya existente (NYVORA) recibe datos sintticos etiquetados con el
 * RUN_ID que la propia corrida borra por id exacto (nunca por tenant_id). El usuario y el rol
 * son efimeros y se destruyen. Las credenciales del navegador se generan en memoria y NUNCA se
 * escriben en la evidencia. Aborta si alguna URL no es exactamente el host HTTPS de QA.
 *
 * Uso:
 *   npm run certify:comercio-browser:qa
 * que equivale a:
 *   node scripts/certifications/comercio-qa-browser.js --env-file=config/qa.env \
 *     --output=docs/qa/evidence/comercio-main-20261108/comercio-qa-browser.json
 */
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const zlib = require("node:zlib");

const ROOT = path.resolve(__dirname, "..", "..");
function loadBcrypt() {
  try { return require("bcrypt"); } catch { return require(path.join(ROOT, "apps/api/node_modules/bcrypt")); }
}
const bcrypt = loadBcrypt();
const puppeteer = require("puppeteer-core");

function argsFrom(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const v = argv[i];
    if (!v.startsWith("--")) continue;
    out[v.slice(2)] = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true;
  }
  return out;
}
const args = argsFrom(process.argv.slice(2));
require("../load-env")(path.resolve(String(args["env-file"] || "config/qa.env")));

const API_URL = String(args["api-url"] || process.env.QA_API_URL || "https://apexos-api-qa-production.up.railway.app").replace(/\/$/, "");
const WEB_URL = String(args["web-url"] || process.env.QA_WEB_URL || "https://apexos-web-qa-production.up.railway.app").replace(/\/$/, "");
if (!/^https:\/\/apexos-api-qa-production\.up\.railway\.app$/.test(API_URL) || !/^https:\/\/apexos-web-qa-production\.up\.railway\.app$/.test(WEB_URL)) {
  console.error("BLOQUEADO: esta certificacion de navegador solo corre contra los hosts HTTPS de QA en Railway.");
  process.exit(1);
}
const SUPABASE_URL = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("BLOQUEADO: se requieren SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY (config/qa.env).");
  process.exit(1);
}

const EXPECTED_COMMIT = String(args["expected-commit"] || "2cb064e2a896");
const NYVORA_TENANT = String(args["nyvora-tenant"] || "1d162ffd-bd27-4855-8141-b015388265fc");
const BUCKET = "comercio-assets";
const COMERCIO_TABLES = [
  "comercio_promotion_sends", "comercio_promotion_products", "comercio_promotion_categories",
  "comercio_promotions", "comercio_payments", "comercio_installments", "comercio_credits",
  "comercio_sale_items", "comercio_sales", "comercio_purchases", "comercio_expenses",
  "comercio_stock_movements", "comercio_settings", "comercio_products", "comercio_customers"
];
const RUTAS = [
  { slug: "comercio", url: "/dashboard/comercio", encabezado: "Comercio" },
  { slug: "productos", url: "/dashboard/comercio/productos", encabezado: "Productos" },
  { slug: "vender", url: "/dashboard/comercio/vender", encabezado: "Vender" },
  { slug: "ventas", url: "/dashboard/comercio/ventas", encabezado: "Ventas" },
  { slug: "clientes", url: "/dashboard/comercio/clientes", encabezado: "Clientes" },
  { slug: "cartera", url: "/dashboard/comercio/cartera", encabezado: "Cartera" },
  { slug: "compras", url: "/dashboard/comercio/compras", encabezado: "Compras de mercancia" },
  { slug: "gastos", url: "/dashboard/comercio/gastos", encabezado: "Ingresos y egresos" },
  { slug: "promociones", url: "/dashboard/comercio/promociones", encabezado: "Promociones" },
  { slug: "reportes", url: "/dashboard/comercio/reportes", encabezado: "Reportes" },
  { slug: "configuracion", url: "/dashboard/comercio/configuracion", encabezado: "Configuracion del comercio" }
];
const NAV_TIMEOUT_MS = Number(args["nav-timeout-ms"] || 120000);
const REQUEST_TIMEOUT_MS = Number(args["request-timeout-ms"] || 45000);
const OUTPUT = path.resolve(String(args.output || "docs/qa/evidence/comercio-main-20261108/comercio-qa-browser.json"));
const EVIDENCE_DIR = path.dirname(OUTPUT);
const SHOT_DIR = path.join(EVIDENCE_DIR, "browser");
const RUN_ID = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
const CAB = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" };

const result = {
  change_id: "comercio-main-20261108",
  certification: "comercio-browser-qa-deployed",
  environment: "QA",
  branch_under_test: "develop",
  api_url: API_URL,
  web_url: WEB_URL,
  supabase_project: SUPABASE_URL.replace(/^https:\/\//, "").split(".")[0],
  api_commit: "unknown",
  expected_commit: EXPECTED_COMMIT.slice(0, 12),
  model_company: { name: "NYVORA", tenant_id: NYVORA_TENANT },
  generated_at: new Date().toISOString(),
  viewport: { escritorio: { width: 1440, height: 900 }, movil: { width: 390, height: 844 } },
  scope: {
    capability: "Build desplegado en QA: sesin autenticada de la empresa modelo, men del shell con Comercio, las once rutas del panel sin 5xx, vitrina pblica pintada con el tema del tenant (oscuro y claro), imgenes reales del bucket, mvil sin desborde y bloqueo de la superficie privada sin sesin.",
    exclusion_de_consola_declarada: "El login de la web intenta primero Supabase y, al fallar, usa la API propia del producto. El 4xx de ese intento (/auth/v1/token) y el favicon ausente son el probes del propio producto, no un error: se registran en consola_descartada por URL y solo cuentan como falla los recursos del build que no estan declarados. Los 'Failed to load resource' de consola se llevan aparte porque su texto no trae URL: la URL se mide en la red."
  },
  fixtures: { run_id: RUN_ID, users: [], roles: [], permissions: [], nyvora_rows: [] },
  storage: { bucket: BUCKET, objects_created: [], objects_left: null },
  baseline_nyvora: {},
  rutas: [],
  consola: { errores: [], descartados: [], recursos: [], recursos_descartados: [], recursos_consola: [] },
  red: { cinco_xx: [], comercio: [], storage: [], total_peticiones: 0 },
  capturas: [],
  checks: [],
  limpiaza_ejecutada: false,
  status: "running"
};

let blocking = true;
function check(name, ok, detail = {}) {
  result.checks.push({ name, ok: Boolean(ok), blocking, detail });
  console.error(`[browser] ${String(result.checks.length).padStart(2, "0")} ${ok ? "OK  " : "FALLA"} ${name}`);
  if (!ok && blocking) throw new Error(`Fallo de certificacion: ${name} ${JSON.stringify(detail).slice(0, 240)}`);
}
function note(name, ok, detail = {}) {
  blocking = false;
  try { check(name, ok, detail); } finally { blocking = true; }
}

async function capture(url, { token, method = "GET", body, form } = {}) {
  const headers = { accept: "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  const payload = form || (body !== undefined ? JSON.stringify(body) : null);
  if (body !== undefined && !form) headers["content-type"] = "application/json";
  const res = await fetch(`${API_URL}${url}`, {
    method, headers, ...(payload ? { body: payload } : {}), signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  }).catch((error) => ({ status: 0, payload: null, message: String(error).slice(0, 160) }));
  if (res.status === 0) return { status: 0, payload: { message: res.message } };
  const text = await res.text().catch(() => "");
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { message: text.slice(0, 300) }; }
  return { status: res.status, payload: json };
}

async function supabase(pathname, { method = "GET", body } = {}) {
  const headers = { ...CAB };
  if (method === "POST" || method === "PATCH") headers.Prefer = "return=representation";
  const res = await fetch(`${SUPABASE_URL}${pathname}`, {
    method, headers, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });
  const text = await res.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = text; }
  return { status: res.status, payload };
}

function codeOf(payload) {
  return String(payload?.code ?? payload?.error?.code ?? "");
}

// --- PNG valido en memoria, sin depender de un asset del repo --------------------------------
function crc32(buffer) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256).map((_, n) => {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      return c;
    });
  }
  let crc = -1;
  for (const byte of buffer) crc = (crc >>> 8) ^ table[(crc ^ byte) & 0xff];
  return (crc ^ -1) >>> 0;
}
function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}
function buildPng(width, height, [r, g, b]) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 2;
  const rows = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y += 1) {
    const offset = y * (1 + width * 3);
    rows[offset] = 0;
    for (let x = 0; x < width; x += 1) {
      const p = offset + 1 + x * 3;
      rows[p] = (r + x) & 0xff;
      rows[p + 1] = g;
      rows[p + 2] = (b + y) & 0xff;
    }
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", zlib.deflateSync(rows, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0))
  ]);
}
async function uploadImage(url, token, bytes, mime = "image/png", filename = "certificacion.png") {
  const form = new FormData();
  form.append("file", new Blob([bytes], { type: mime }), filename);
  return capture(url, { token, method: "POST", form });
}
function objectPathFromPublicUrl(url) {
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  const index = String(url || "").indexOf(marker);
  return index === -1 ? "" : decodeURIComponent(url.slice(index + marker.length));
}
async function storageDeleteObject(objectPath) {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${objectPath}`, {
    method: "DELETE", headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  }).catch(() => null);
  return res ? res.status : 0;
}

// --- Aprovisionamiento -------------------------------------------------------------------------
async function createRole(tenantId, name, permissions) {
  const role = await supabase("/rest/v1/Role", {
    method: "POST",
    body: [{ tenant_id: tenantId, name, description: `certificacion-browser-${RUN_ID}`, is_system: false, metadata: {} }]
  });
  const roleId = Array.isArray(role.payload) ? role.payload[0]?.id : null;
  if (!roleId) throw new Error(`No se pudo crear el rol ${name}: ${role.status} ${JSON.stringify(role.payload).slice(0, 200)}`);
  result.fixtures.roles.push(roleId);
  const perms = await supabase("/rest/v1/Permission", {
    method: "POST",
    body: permissions.map(([module, action]) => ({ role_id: roleId, module, action }))
  });
  if (perms.status >= 300) throw new Error(`No se pudieron crear los permisos: ${perms.status} ${JSON.stringify(perms.payload).slice(0, 200)}`);
  const listed = await supabase(`/rest/v1/Permission?select=id&role_id=eq.${roleId}`);
  for (const row of listed.payload || []) result.fixtures.permissions.push(row.id);
  return roleId;
}

async function createUser(tenantId, roleId) {
  const now = new Date().toISOString();
  const email = `nyvora.m30.browser.${RUN_ID}@certificacion.qa`;
  const password = `Nyvora-Browser-${crypto.randomBytes(6).toString("hex")}#26`;
  const hash = await bcrypt.hash(password, 12);
  const user = await supabase("/rest/v1/User", {
    method: "POST",
    body: [{ tenant_id: tenantId, name: `Certificacion Comercio Navegador ${RUN_ID}`, email, password: hash, role_id: roleId, active: true, authorization_version: 1, preferences: {}, created_at: now, updated_at: now }]
  });
  const userId = Array.isArray(user.payload) ? user.payload[0]?.id : null;
  if (!userId) throw new Error(`No se pudo crear el usuario: ${user.status} ${JSON.stringify(user.payload).slice(0, 200)}`);
  result.fixtures.users.push(userId);
  return { id: userId, email, password };
}

async function tableRows(table, tenantId) {
  const res = await supabase(`/rest/v1/${table}?select=id&tenant_id=eq.${encodeURIComponent(tenantId)}`);
  return Array.isArray(res.payload) ? res.payload : null;
}

async function limpiar() {
  if (result.limpiaza_ejecutada) return;
  result.limpiaza_ejecutada = true;
  for (const fila of result.fixtures.nyvora_rows.slice().reverse()) {
    if (fila.table === "comercio_products") {
      await supabase(`/rest/v1/comercio_sale_items?product_id=eq.${fila.id}`, { method: "DELETE" }).catch(() => null);
      await supabase(`/rest/v1/comercio_stock_movements?product_id=eq.${fila.id}`, { method: "DELETE" }).catch(() => null);
      await supabase(`/rest/v1/comercio_promotion_products?product_id=eq.${fila.id}`, { method: "DELETE" }).catch(() => null);
    }
    await supabase(`/rest/v1/${fila.table}?id=eq.${fila.id}`, { method: "DELETE" }).catch(() => null);
  }
  for (const ruta of result.storage.objects_created) await storageDeleteObject(ruta).catch(() => null);
  for (const userId of result.fixtures.users) {
    await supabase(`/rest/v1/AuthorizationSession?select=id&user_id=eq.${userId}`, { method: "DELETE" }).catch(() => null);
    await supabase(`/rest/v1/User?id=eq.${userId}`, { method: "DELETE" }).catch(() => null);
  }
  if (result.fixtures.permissions.length) {
    await supabase(`/rest/v1/Permission?id=eq.${result.fixtures.permissions.join(",id=eq.")}`, { method: "DELETE" }).catch(() => null);
  }
  for (const roleId of result.fixtures.roles) {
    await supabase(`/rest/v1/Permission?role_id=eq.${roleId}`, { method: "DELETE" }).catch(() => null);
    await supabase(`/rest/v1/Role?id=eq.${roleId}`, { method: "DELETE" }).catch(() => null);
  }
}

// --- Lecturas dentro del navegador --------------------------------------------------------------
// page.evaluate serializa solo esta funcion: los ayudantes tienen que vivir aqui dentro.
const MEDIR_VITRINA = () => {
  const parsear = (crudo) => {
    const m = /rgba?\(([^)]+)\)/.exec(String(crudo || ""));
    if (!m) return null;
    const partes = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
    return { r: partes[0], g: partes[1], b: partes[2], a: partes.length > 3 ? partes[3] : 1 };
  };
  const luminosidad = ({ r, g, b }) => {
    const canal = (crudo) => { const c = crudo / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
  };
  const razon = (a, b) => {
    const la = luminosidad(a), lb = luminosidad(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  };
  const raiz = document.querySelector(".sf-root");
  if (!raiz) return { presente: false, url: location.href };
  const fondo = parsear(getComputedStyle(raiz).backgroundColor);
  const boton = raiz.querySelector(".sf-btn-accent-solid, .sf-btn-accent");
  const colorBoton = boton ? parsear(getComputedStyle(boton).backgroundColor) : null;
  const tintaBoton = boton ? parsear(getComputedStyle(boton).color) : null;
  const imagenes = Array.from(raiz.querySelectorAll("img")).map((img) => ({
    src: img.currentSrc || img.src || "", completa: img.complete, ancho: img.naturalWidth, alto: img.naturalHeight
  }));
  return {
    presente: true,
    url: location.href,
    fondo,
    luminosidadFondo: fondo ? Number(luminosidad(fondo).toFixed(4)) : null,
    colorBoton,
    tintaBoton,
    contrasteBoton: colorBoton && tintaBoton ? Number(razon(colorBoton, tintaBoton).toFixed(2)) : null,
    titular: String((raiz.querySelector("h1") || {}).textContent || "").trim(),
    texto: (document.body.innerText || "").slice(0, 200000),
    desborde: document.documentElement.scrollWidth - window.innerWidth,
    anchoVisual: window.innerWidth,
    anchoDocumento: document.documentElement.scrollWidth,
    imagenes
  };
};

async function capturar(page, nombre) {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const destino = path.join(SHOT_DIR, nombre);
  for (let intento = 0; intento < 3; intento += 1) {
    try { fs.rmSync(destino, { force: true }); } catch { /* todavia no existe */ }
    try {
      await page.screenshot({ path: destino, fullPage: false });
      result.capturas.push(path.relative(ROOT, destino).replace(/\\/g, "/"));
      return true;
    } catch (error) {
      if (intento === 2) { console.error(`[browser] captura ${nombre} no escribio: ${String(error).slice(0, 120)}`); return false; }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  return false;
}

async function esperarH1(page, esperado, timeout = 30000) {
  // Comparacion sin signos de puntuacion ni tildes: el encabezado real lleva tildes
  // ("Configuración") y el arnés declara su expectativa en ASCII.
  const normalizar = (v) => String(v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
  try {
    await page.waitForFunction(
      (texto) => {
        const limpiar = (v) => String(v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
        const h1 = document.querySelector("main h1, h1");
        return Boolean(h1 && limpiar(h1.textContent) === limpiar(texto));
      },
      { timeout, polling: 250 },
      esperado
    );
    return { ok: true };
  } catch {
    const visto = await page.evaluate(() => String((document.querySelector("main h1, h1") || {}).textContent || "").trim()).catch(() => "");
    return { ok: false, visto: normalizar(visto), esperado: normalizar(esperado) };
  }
}

async function main() {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });

  // --- 0. El ambiente bajo prueba es el codigo promocionado -----------------------------------
  const health = await fetch(`${API_URL}/health`, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
    .then((res) => res.json()).catch(() => null);
  const commit = String(health?.commit ?? health?.build?.commit ?? "");
  result.api_commit = commit;
  check("el_api_desplegado_es_el_commit_esperado", commit.startsWith(EXPECTED_COMMIT.slice(0, 12)), {
    commit, esperado: EXPECTED_COMMIT
  });
  const portada = await fetch(WEB_URL, { redirect: "follow", signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) }).catch(() => null);
  check("la_web_desplegada_responde", portada?.status === 200, { status: portada?.status ?? null, url: WEB_URL });

  // --- 1. La corrida prepara la empresa modelo con datos propios -------------------------------
  for (const table of COMERCIO_TABLES) {
    const rows = await tableRows(table, NYVORA_TENANT);
    result.baseline_nyvora[table] = rows ? rows.length : -1;
  }
  check("la_empresa_modelo_arranca_sin_documents_de_comercio", Object.values(result.baseline_nyvora).every((n) => n === 0), result.baseline_nyvora);

  const rolId = await createRole(NYVORA_TENANT, `Cert M-30 Navegador ${RUN_ID}`, [["comercio", "read"], ["comercio", "write"]]);
  const usuario = await createUser(NYVORA_TENANT, rolId);
  const ingreso = await capture("/api/v1/auth/login", { method: "POST", body: { email: usuario.email, password: usuario.password } });
  check("el_api_autentica_al_usuario_de_la_corrida", ingreso.status === 200 && Boolean(ingreso.payload?.token), {
    status: ingreso.status, code: codeOf(ingreso.payload)
  });
  const token = ingreso.payload.token;

  const settings = await capture("/api/v1/comercio/settings", { token, method: "PUT", body: {
    store_name: `Despensa Nyvora Navegador ${RUN_ID}`, currency: "cop", catalog_enabled: true,
    catalog_tagline: "Certificacion de navegador del ambiente liberado"
  } });
  const codigoVitrina = String(settings.payload?.catalog_code || "");
  check("la_vitrina_publica_queda_habilitada", settings.status === 200 && /^[a-z0-9]{4,32}$/.test(codigoVitrina), {
    status: settings.status, habilitado: settings.payload?.catalog_enabled
  });
  const filaSettings = await supabase(`/rest/v1/comercio_settings?select=id&tenant_id=eq.${NYVORA_TENANT}`);
  for (const fila of filaSettings.payload || []) result.fixtures.nyvora_rows.push({ table: "comercio_settings", id: fila.id });

  const temaOscuro = {
    accent: "#1d4ed8", base: "#0b1220", promo: "#be123c", surface_tint: "suave", surface_depth: "media",
    background_pattern: "ninguno", corner_radius: "suave", banner_scrim: "medio",
    headline: `Vitrina oscura ${RUN_ID}`, subhead: "Leida en Chromium contra el build desplegado"
  };
  const temaClaro = { accent: "#0e7490", base: "#f8fafc", promo: "#be123c", surface_tint: "neutro", surface_depth: "plana", headline: `Vitrina clara ${RUN_ID}` };
  const grabarTema = (tema) => capture("/api/v1/comercio/settings/storefront/theme", { token, method: "PUT", body: tema });

  const producto = await capture("/api/v1/comercio/products", { token, method: "POST", body: {
    name: `Cafe Nyvora Navegador ${RUN_ID}`, category: "Despensa", unit: "unidad", price: 12000, cost: 7000,
    stock: 20, min_stock: 5, catalog_featured: true, notes: "Dato sintetico de certificacion de navegador"
  } });
  const productoId = producto.payload?.id;
  check("la_corrida_prepara_un_producto_en_la_empresa_modelo", producto.status === 201 && Boolean(productoId), {
    status: producto.status, code: producto.payload?.code
  });
  if (productoId) result.fixtures.nyvora_rows.push({ table: "comercio_products", id: productoId });

  const foto = await uploadImage(`/api/v1/comercio/products/${productoId}/photo`, token, buildPng(600, 600, [245, 158, 11]), "image/png", "foto-browser.png");
  // La subida responde con URL FIRMADA; la que el navegador va a pedir es la PUBLICA de la
  // ficha, y la que hay que borrar al final es la ruta del objeto detras de esa URL.
  const ficha = await capture(`/api/v1/comercio/products/${productoId}`, { token });
  const urlFoto = String(ficha.payload?.photo_url || "");
  const rutaFoto = objectPathFromPublicUrl(urlFoto);
  if (rutaFoto) result.storage.objects_created.push(rutaFoto);
  check("la_corrida_deja_un_producto_con_foto_en_el_bucket", foto.status === 201 && urlFoto.startsWith(`${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/`), {
    subida: foto.status, url: urlFoto.slice(0, 120)
  });
  const tema = await grabarTema(temaOscuro);
  check("la_corrida_deja_el_tema_oscuro_del_tenant", tema.status === 200 && tema.payload?.theme?.accent === temaOscuro.accent, {
    status: tema.status, code: codeOf(tema.payload)
  });

  // --- 2. Chromium real contra el build desplegado --------------------------------------------
  const browser = await puppeteer.launch({
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
    executablePath: process.env.CHROME_BIN || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    headless: true
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ ...result.viewport.escritorio, deviceScaleFactor: 1 });
    page.on("console", (mensaje) => {
      if (mensaje.type() !== "error") return;
      const texto = String(mensaje.text() || "");
      // "Failed to load resource" es el eco de una respuesta HTTP: esa parte se cuenta en la
      // celda de recursos (que si trae URL). Aqui solo quedan los errores de JavaScript, que
      // son los que realmente dicen que el build del ambiente se rompio.
      if (/failed to load resource/i.test(texto)) { result.consola.recursos_consola.push(texto.slice(0, 160)); return; }
      // El intento de Supabase que la propia pagina hace antes de usar su API: se registra
      // aparte para que la celda de consola no se lea como un verde comprado.
      if (/\/auth\/v1\/token|supabase\/auth\/v1/.test(texto)) { result.consola.descartados.push(texto.slice(0, 160)); return; }
      if (/favicon/i.test(texto)) { result.consola.descartados.push(texto.slice(0, 160)); return; }
      result.consola.errores.push(texto.slice(0, 240));
    });
    page.on("pageerror", (error) => result.consola.errores.push(String(error?.message || error).slice(0, 240)));
    page.on("response", (respuesta) => {
      const url = respuesta.url();
      const estado = respuesta.status();
      // "Failed to load resource" en consola NO trae la URL en el texto: la URL solo se
      // consigue aqui, y sin ella la celda de consola seria inculparable.
      if (estado >= 400) {
        const ruta = url.replace(API_URL, "[API]").replace(SUPABASE_URL, "[SUPABASE]").slice(0, 180);
        const descartable = /\/auth\/v1\/token|supabase\/auth\/v1|favicon/i.test(url);
        (descartable ? result.consola.recursos_descartados : result.consola.recursos).push({ estado, ruta });
      }
      if (/\/storage\/v1\/object\/public\//.test(url)) {
        result.red.storage.push({ estado: respuesta.status(), ruta: decodeURIComponent(url.replace(SUPABASE_URL, "")).slice(0, 160) });
      }
      if (!url.startsWith(API_URL)) return;
      result.red.total_peticiones += 1;
      if (/\/comercio\//.test(url)) {
        result.red.comercio.push({ estado: respuesta.status(), ruta: url.replace(API_URL, "").slice(0, 120) });
      }
      if (respuesta.status() >= 500) result.red.cinco_xx.push({ status: respuesta.status(), url: url.slice(0, 160) });
    });

    await page.goto(`${WEB_URL}/login`, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });
    await page.waitForSelector('input[autocomplete="email"]', { visible: true, timeout: NAV_TIMEOUT_MS });
    await page.click('input[autocomplete="email"]');
    await page.type('input[autocomplete="email"]', usuario.email);
    await page.click('input[autocomplete="current-password"]');
    await page.type('input[autocomplete="current-password"]', usuario.password);
    await page.evaluate(() => {
      const form = document.querySelector('input[autocomplete="email"]')?.form;
      if (form) form.requestSubmit();
    });
    try {
      await page.waitForFunction(() => location.pathname.startsWith("/dashboard"), { timeout: NAV_TIMEOUT_MS, polling: 300 });
    } catch { /* se declara en la celda */ }
    const proveedor = await page.evaluate(() => ({
      ruta: location.pathname, auth_provider: localStorage.getItem("auth_provider") || "", role: localStorage.getItem("role_name") || ""
    })).catch(() => ({}));
    check("la_sesion_de_la_empresa_modelo_abre_el_panel", String(proveedor.ruta || "").startsWith("/dashboard"), {
      ruta: proveedor.ruta, auth_provider: proveedor.auth_provider
    });

    await page.waitForFunction(
      () => Boolean(document.querySelector('a[href="/dashboard/comercio"]')),
      { timeout: NAV_TIMEOUT_MS, polling: 300 }
    ).catch(() => null);
    const enlaceMenu = await page.evaluate(() => {
      const enlace = document.querySelector('a[href="/dashboard/comercio"]');
      if (!enlace) return { presente: false };
      const caja = enlace.getBoundingClientRect();
      return {
        presente: true,
        visible: Boolean(enlace.offsetParent) && caja.width > 0 && caja.height > 0,
        texto: String(enlace.textContent || "").trim(),
        ruta: enlace.getAttribute("href")
      };
    });
    check("el_menu_del_panel_muestra_comercio", enlaceMenu.presente && enlaceMenu.visible && /comercio/i.test(enlaceMenu.texto), enlaceMenu);
    await capturar(page, "01-panel-portada-menu.png");

    // Las once rutas del modulo, con su encabezado real leido del DOM pintado.
    for (const ruta of RUTAS) {
      await page.goto(`${WEB_URL}${ruta.url}`, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS }).catch(() => null);
      const leido = await esperarH1(page, ruta.encabezado);
      result.rutas.push({ url: ruta.url, esperado: ruta.encabezado, ...leido });
    }
    const rutasMal = result.rutas.filter((ruta) => !ruta.ok);
    check("las_once_rutas_del_panel_muestran_su_encabezado", rutasMal.length === 0 && result.rutas.length === RUTAS.length, {
      total: result.rutas.length, fallidas: rutasMal.map((ruta) => ({ url: ruta.url, visto: String(ruta.visto || "").slice(0, 60) }))
    });
    check("ninguna_ruta_del_panel_devuelve_5xx", result.red.cinco_xx.length === 0, {
      peticiones_api: result.red.total_peticiones, cinco_xx: result.red.cinco_xx.slice(0, 4)
    });

    await page.goto(`${WEB_URL}/dashboard/comercio/productos`, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS }).catch(() => null);
    await esperarH1(page, "Productos");
    // El listado llega en GET /comercio/products despues del render inicial: se espera la fila,
    // no un tiempo fijo, y si no llega se entrega el diagnostico (respuesta de la red y texto).
    const inicioFila = Date.now();
    const filaProducto = await page.waitForFunction(
      (nombre) => (document.body.innerText || "").includes(nombre),
      { timeout: NAV_TIMEOUT_MS, polling: 300 }, `Cafe Nyvora Navegador ${RUN_ID}`
    ).then(() => true).catch(() => false);
    const msHastaLaFila = Date.now() - inicioFila;
    const detalleFila = filaProducto
      ? { ms_hasta_la_fila: msHastaLaFila }
      : await page.evaluate((diagnostico) => ({
        ms_hasta_la_fila: diagnostico.ms,
        conteo: String(document.querySelector("#conteo-resultados")?.textContent || "").trim(),
        encabezado: String(document.querySelector("h1")?.textContent || "").trim(),
        estado_tabla: /Aún no tienes productos|Ningún producto con estos filtros|Cargando/i.test(document.body.innerText || ""),
        cuerpo: String(document.body.innerText || "").replace(/\s+/g, " ").slice(0, 300),
        comercio_api: diagnostico.red.slice(-8)
      }), { ms: msHastaLaFila, red: result.red.comercio.slice() });
    check("la_ruta_de_productos_muestra_el_producto_de_la_corrida", filaProducto === true, detalleFila);

    await page.goto(`${WEB_URL}/dashboard/comercio/configuracion`, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS }).catch(() => null);
    await esperarH1(page, "Configuracin del comercio");
    const fichaApariencia = await page.evaluate(() => {
      const texto = document.body.innerText || "";
      return { tiene_apariencia: texto.includes("Apariencia"), tiene_vitrina: /vitrina/i.test(texto) };
    });
    check("la_configuracion_expone_la_apariencia_de_la_vitrina", fichaApariencia.tiene_apariencia && fichaApariencia.tiene_vitrina, fichaApariencia);
    await capturar(page, "02-panel-configuracion-apariencia.png");

    // --- 3. La vitrina publica, pintada con el tema del tenant --------------------------------
    const urlVitrina = `${WEB_URL}/tienda/${codigoVitrina}`;
    await page.goto(urlVitrina, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS }).catch(() => null);
    await page.waitForFunction(() => Boolean(document.querySelector(".sf-root")), { timeout: NAV_TIMEOUT_MS, polling: 300 }).catch(() => null);
    const vitrinaOscura = await page.evaluate(MEDIR_VITRINA);
    check("la_vitrina_publica_se_pinta_con_el_fondo_del_tenant", vitrinaOscura.presente
      && vitrinaOscura.fondo?.r === 11 && vitrinaOscura.fondo?.g === 18 && vitrinaOscura.fondo?.b === 32, {
      fondo: vitrinaOscura.fondo, luminosidad: vitrinaOscura.luminosidadFondo, url: vitrinaOscura.url
    });
    check("el_acento_del_boton_de_la_vitrina_es_el_del_tema", vitrinaOscura.colorBoton
      && vitrinaOscura.colorBoton.r === 29 && vitrinaOscura.colorBoton.g === 78 && vitrinaOscura.colorBoton.b === 216, {
      colorBoton: vitrinaOscura.colorBoton, tintaBoton: vitrinaOscura.tintaBoton
    });
    check("la_tinta_del_boton_publico_es_legible_sobre_el_acento", Number(vitrinaOscura.contrasteBoton) >= 4.5, {
      contraste: vitrinaOscura.contrasteBoton
    });
    check("el_titular_del_tenant_se_ve_en_la_vitrina", String(vitrinaOscura.texto || "").includes(temaOscuro.headline), {
      titular: vitrinaOscura.titular, buscado: temaOscuro.headline
    });
    const productoEnVitrina = await page.evaluate((nombre) => {
      const texto = document.body.innerText || "";
      return { nombre: texto.includes(nombre), precio: /12[.\s]000/.test(texto) };
    }, `Cafe Nyvora Navegador ${RUN_ID}`);
    check("el_producto_de_la_corrida_se_ve_con_su_precio", productoEnVitrina.nombre && productoEnVitrina.precio, productoEnVitrina);
    // La tarjeta del producto usa loading="lazy": primero hay de llevarla al viewport, como
    // haria cualquier visitante, y solo entonces se mide el pixel que devolvio el bucket.
    const imgLocalizada = await page.evaluate((ruta) => {
      const img = Array.from(document.querySelectorAll(".sf-root img"))
        .find((elemento) => decodeURIComponent(elemento.currentSrc || elemento.src || "").includes(ruta));
      if (!img) return { presente: false, src: "" };
      img.scrollIntoView({ block: "center" });
      return { presente: true, src: decodeURIComponent(img.currentSrc || img.src || "").slice(0, 180) };
    }, rutaFoto);
    const fotoCargada = imgLocalizada.presente
      ? await page.waitForFunction(
        (ruta) => {
          const img = Array.from(document.querySelectorAll(".sf-root img"))
            .find((elemento) => decodeURIComponent(elemento.currentSrc || elemento.src || "").includes(ruta));
          return Boolean(img) && img.complete && img.naturalWidth > 0 && img.naturalHeight > 0;
        },
        { timeout: 30000, polling: 250 }, rutaFoto
      ).then(() => true).catch(() => false)
      : false;
    const fotoPintada = await page.evaluate((ruta) => {
      const img = Array.from(document.querySelectorAll(".sf-root img"))
        .find((elemento) => decodeURIComponent(elemento.currentSrc || elemento.src || "").includes(ruta));
      return img ? { completa: img.complete, ancho: img.naturalWidth, alto: img.naturalHeight } : null;
    }, rutaFoto);
    check("la_foto_del_producto_se_pinta_desde_el_bucket", fotoCargada && fotoPintada?.ancho > 0, {
      foto: fotoPintada,
      ruta_objeto: rutaFoto,
      src_navegador: imgLocalizada.src,
      storage_http: result.red.storage.filter((item) => item.ruta.includes(BUCKET)).slice(-4)
    });
    await capturar(page, "03-vitrina-tema-oscuro.png");

    // --- 4. El mismo tenant en modo claro ------------------------------------------------------
    const temaClaroGuardado = await grabarTema(temaClaro);
    check("la_corrida_cambia_el_tema_a_claro", temaClaroGuardado.status === 200 && temaClaroGuardado.payload?.theme?.base === temaClaro.base, {
      status: temaClaroGuardado.status, base: temaClaroGuardado.payload?.theme?.base
    });
    await page.goto(`${urlVitrina}?claro=${RUN_ID}`, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS }).catch(() => null);
    await page.waitForFunction(() => Boolean(document.querySelector(".sf-root")), { timeout: NAV_TIMEOUT_MS, polling: 300 }).catch(() => null);
    const vitrinaClara = await page.evaluate(MEDIR_VITRINA);
    check("la_vitrina_clara_pinta_el_fondo_claro_del_tenant", vitrinaClara.presente
      && vitrinaClara.fondo?.r === 248 && vitrinaClara.fondo?.g === 250 && vitrinaClara.fondo?.b === 252, {
      fondo: vitrinaClara.fondo, luminosidad: vitrinaClara.luminosidadFondo
    });
    check("el_acento_claro_sigue_al_tema_y_se_contra_su_tinta", Number(vitrinaClara.contrasteBoton) >= 4.5
      && vitrinaClara.colorBoton?.r === 14 && vitrinaClara.colorBoton?.g === 116 && vitrinaClara.colorBoton?.b === 144, {
      colorBoton: vitrinaClara.colorBoton, contraste: vitrinaClara.contrasteBoton
    });
    await capturar(page, "04-vitrina-tema-claro.png");

    // --- 5. Movil ---------------------------------------------------------------------------------
    await page.setViewport({ ...result.viewport.movil, deviceScaleFactor: 1 });
    await page.goto(`${urlVitrina}?movil=${RUN_ID}`, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS }).catch(() => null);
    await page.waitForFunction(() => Boolean(document.querySelector(".sf-root")), { timeout: NAV_TIMEOUT_MS, polling: 300 }).catch(() => null);
    const vitrinaMovil = await page.evaluate(MEDIR_VITRINA);
    check("la_vitrina_no_desborda_en_movil", vitrinaMovil.presente && vitrinaMovil.desborde <= 2, {
      desborde: vitrinaMovil.desborde, ancho_visual: vitrinaMovil.anchoVisual, ancho_documento: vitrinaMovil.anchoDocumento
    });
    await capturar(page, "05-vitrina-movil.png");
    await page.setViewport({ ...result.viewport.escritorio, deviceScaleFactor: 1 });

    // --- 6. La superficie privada sin sesin: se mide que no filtre datos -----------------------
    // El shell no redirige al login: sin permisos en el almacenamiento, cada pantalla del
    // Comercio resuelve su propio bloqueo. Lo que tiene que certificar es que el visitante
    // annimo no ve ni un dato del tenant y que ninguna lectura del mdulo le respondi 2xx.
    const sesion = await browser.createBrowserContext();
    const paginaAnonima = await sesion.newPage();
    await paginaAnonima.setViewport({ ...result.viewport.escritorio, deviceScaleFactor: 1 });
    const llamadasAnonimas = [];
    paginaAnonima.on("response", (respuesta) => {
      const url = respuesta.url();
      if (!url.startsWith(API_URL) || !/\/comercio\//.test(url)) return;
      llamadasAnonimas.push({ estado: respuesta.status(), ruta: url.replace(API_URL, "").slice(0, 120) });
    });
    await paginaAnonima.goto(`${WEB_URL}/dashboard/comercio`, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS }).catch(() => null);
    const bloqueoLeido = await paginaAnonima.waitForFunction(() => {
      // El shell contesta "Acceso no autorizado" y la pantalla del mdulo "Comercio no
      // disponible para este perfil": se acepta cualquiera de las dos, porque las dos son
      // el bloqueo real del producto, no una pantalla de carga que se lea como verde.
      const texto = document.body.innerText || "";
      return !localStorage.getItem("token")
        && /acceso no autorizado|no disponible para este perfil|no tiene permisos/i.test(texto);
    }, { timeout: NAV_TIMEOUT_MS, polling: 300 }).then(() => true).catch(() => false);
    const lecturaAnonima = await paginaAnonima.evaluate((nombre) => ({
      ruta: location.pathname,
      encabezado: String(document.querySelector("main h1")?.textContent || document.querySelector("h1")?.textContent || "").trim(),
      tiene_token: Boolean(localStorage.getItem("token")),
      dato_del_tenant_visible: (document.body.innerText || "").includes(nombre),
      texto: String((document.querySelector("main") || document.body).innerText || "").replace(/\s+/g, " ").slice(0, 320)
    }), `Cafe Nyvora Navegador ${RUN_ID}`).catch(() => ({}));
    const lecturasOk = llamadasAnonimas.filter((llamada) => llamada.estado >= 200 && llamada.estado < 300);
    check("el_panel_de_comercio_sin_sesion_no_muestra_un_dato_del_tenant", lecturaAnonima.dato_del_tenant_visible === false
      && lecturaAnonima.tiene_token === false && lecturasOk.length === 0, {
      ruta: lecturaAnonima.ruta, encabezado: lecturaAnonima.encabezado,
      peticiones_comercio: llamadasAnonimas.slice(0, 6), lecturas_2xx_sin_token: lecturasOk.length
    });
    check("el_panel_sin_sesion_explica_el_bloqueo_de_acceso", bloqueoLeido === true && /no autorizado|no disponible|no tiene permisos/i.test(lecturaAnonima.texto || ""), {
      ruta: lecturaAnonima.ruta, encabezado: lecturaAnonima.encabezado, visto: lecturaAnonima.texto
    });
    await sesion.close().catch(() => null);

    check("la_consola_no_registra_errores_de_javascript_del_producto", result.consola.errores.length === 0, {
      errores: result.consola.errores.slice(0, 6), descartados: result.consola.descartados.slice(0, 3)
    });
    check("ningun_recurso_de_la_web_falla_sin_explicacion_declarada", result.consola.recursos.length === 0, {
      recursos: result.consola.recursos.slice(0, 8),
      descartados_por_declaracion: result.consola.recursos_descartados.slice(0, 6),
      ecos_de_consola: result.consola.recursos_consola.length
    });
    check("ninguna_peticion_del_recorrido_completo_devuelve_5xx", result.red.cinco_xx.length === 0, {
      peticiones_api: result.red.total_peticiones, cinco_xx: result.red.cinco_xx.slice(0, 4)
    });
  } finally {
    await browser.close().catch(() => null);
  }

  // --- 7. Limpieza verificada -------------------------------------------------------------------
  await limpiar();
  const sobrantes = [];
  for (const table of COMERCIO_TABLES) {
    const rows = await tableRows(table, NYVORA_TENANT);
    if ((rows || []).length !== result.baseline_nyvora[table]) sobrantes.push(`${table}=${rows === null ? "error" : rows.length}`);
  }
  note("nyvora_vuelve_a_su_linea_base_de_documents", sobrantes.length === 0, { sobrantes });
  // El listado de Storage acepta el cuerpo como OBJETO ({prefix, limit}); con el array
  // [ {...} ] el endpoint responde 400 y la celda de residuos se leeria como residuo cero.
  const inventario = await supabase(`/storage/v1/object/list/${BUCKET}`, {
    method: "POST", body: { prefix: `${NYVORA_TENANT}/`, limit: 500 }
  }).catch(() => null);
  const carpetas = Array.isArray(inventario?.payload) ? inventario.payload.length : -1;
  note("el_inventario_del_bucket_de_la_empresa_modelo_queda_vacio", carpetas === 0, {
    carpetas, estado: inventario?.status, entradas: Array.isArray(inventario?.payload) ? inventario.payload.slice(0, 5).map((item) => item.name) : []
  });
  const usuariosVivos = await supabase(`/rest/v1/User?select=id&email=like.*nyvora.m30.browser.*`);
  note("ningun_usuario_efimero_sobrevive", (usuariosVivos.payload || []).length === 0, { filas: (usuariosVivos.payload || []).length });
  const rolesVivos = await supabase(`/rest/v1/Role?select=id&name=like.${encodeURIComponent(`Cert M-30 Navegador ${RUN_ID}`)}`);
  note("ningun_rol_efimero_sobrevive", (rolesVivos.payload || []).length === 0, { filas: (rolesVivos.payload || []).length });

  const fallidos = result.checks.filter((c) => !c.ok).map((c) => c.name);
  result.status = fallidos.length ? "failed" : "passed";
  result.summary = {
    total_checks: result.checks.length,
    fallidos,
    rutas: result.rutas.length,
    capturas: result.capturas.length,
    errores_de_consola: result.consola.errores.length,
    recursos_con_falla: result.consola.recursos.length,
    peticiones_api: result.red.total_peticiones
  };
  await finish(null);
}

async function finish(error) {
  result.status = result.status === "passed" ? "passed" : "failed";
  if (error) {
    result.status = "failed";
    result.error = String(error?.message || error).slice(0, 400);
  }
  try { await limpiar(); } catch { /* la limpieza ya se registra como nota */ }
  result.finished_at = new Date().toISOString();
  if (!result.summary) {
    result.summary = {
      total_checks: result.checks.length,
      fallidos: result.checks.filter((c) => !c.ok).map((c) => c.name),
      rutas: result.rutas.length,
      capturas: result.capturas.length,
      errores_de_consola: result.consola.errores.length,
      recursos_con_falla: result.consola.recursos.length,
      peticiones_api: result.red.total_peticiones
    };
  }
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  fs.writeFileSync(OUTPUT, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  console.error(error ? `CERTIFICATION_FAILED ${result.error}` : `${result.status === "passed" ? "CERTIFICATION_PASSED" : "CERTIFICATION_FAILED"} checks=${result.checks.length} fallidos=${JSON.stringify(result.checks.filter((c) => !c.ok).map((c) => c.name))}`);
  console.error(`evidencia=${path.relative(ROOT, OUTPUT).replace(/\\/g, "/")}`);
  process.exit(result.status === "passed" && !error ? 0 : 1);
}

main().catch(finish);
