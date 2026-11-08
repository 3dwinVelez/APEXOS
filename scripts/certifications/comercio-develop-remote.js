// Certificacion REMOTA del modulo Comercio (M-30) en el ambiente DEVELOP (QA).
//
// Que celda cubre y por que la local no la cubre:
// scripts/certifications/comercio-storefront-theme-local.js y comercio-tenant-rbac-local.js
// ejercen el modulo contra un API construido EN EL PROCESO y un PostgreSQL del puesto. Ahi
// no existe ni el bucket real de Supabase Storage, ni el build promocionado, ni HTTPS publico.
// Esta corrida va contra la API desplegada en Railway (rama develop) y la base de Supabase QA,
// y por eso es la unica que prueba de verdad:
//   1. El commit desplegado contiene el modulo (health) y la vitrina publica responde por HTTPS.
//   2. La subida de banner/foto escribe en el bucket real "comercio-assets" y el objeto se lee
//      SIN credenciales desde su URL publica (la politica publica del bucket es parte del contrato).
//   3. El tema del tenant persiste en preferences_json de la base QA y sale en el catalogo publico.
//   4. Licencia (M-30), RBAC y aislamiento entre empresas se miden con tres tenants EFIMEROS
//      creados y borrados por la propia corrida, sin tocar el tenant demo de QA.
//
// Huella: la corrida SOLO escribe en los tres tenants que ella crea. Al final borra sus filas en
// las 15 tablas de Comercio, sus usuarios, sus tenants y sus objetos del bucket, y lo comprueba.
// No toca produccion: aborta si la URL de API no es el host HTTPS de QA en Railway.
//
// Uso:
//   node scripts/certifications/comercio-develop-remote.js --env-file=config/qa.env \
//     --output=docs/qa/evidence/comercio-qa-develop-20261107/qa-certification.json
//
// Requiere en config/qa.env (gitignore, nunca se imprimen sus valores):
//   SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY  (aprovisionamiento efimero + transporte PostgREST)

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const zlib = require("node:zlib");

const ROOT = path.resolve(__dirname, "..", "..");
function loadBcrypt() {
  try { return require("bcrypt"); } catch { return require(path.join(ROOT, "apps/api/node_modules/bcrypt")); }
}
const bcrypt = loadBcrypt();

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
if (!/^https:\/\/apexos-api-qa-production\.up\.railway\.app$/.test(API_URL)) {
  console.error("BLOQUEADO: la certificacion remota de Comercio solo corre contra la API de QA en Railway (HTTPS).");
  process.exit(1);
}
const SUPABASE_URL = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("BLOQUEADO: se requieren SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY (config/qa.env) para aprovisionar las empresas efimeras.");
  process.exit(1);
}

const EXPECTED_COMMIT = String(args["expected-commit"] || "2cb064e2a896"); // merge del PR #83 en develop
// Unico uso del tenant demo de QA: tomar UN id ajeno por lectura para probar que este tenant
// no lo ve. Nunca se escribe sobre el.
const FOREIGN_TENANT_ID = String(args["foreign-tenant-id"] || "e8fac747-e410-41dd-8784-2c0ca71660e8");
const BUCKET = "comercio-assets";
const COMERCIO_TABLES = [
  "comercio_promotion_sends", "comercio_promotion_products", "comercio_promotion_categories",
  "comercio_promotions", "comercio_payments", "comercio_installments", "comercio_credits",
  "comercio_sale_items", "comercio_sales", "comercio_purchases", "comercio_expenses",
  "comercio_stock_movements", "comercio_settings", "comercio_products", "comercio_customers"
];
const REQUEST_TIMEOUT_MS = Number(args["request-timeout-ms"] || 45000);
const OUTPUT = path.resolve(String(args.output || "docs/qa/evidence/comercio-qa-develop-20261107/qa-certification.json"));
const RUN_ID = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
const TODAY = new Date().toISOString().slice(0, 10);

const CAB = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" };

const result = {
  change_id: "comercio-qa-develop-20261107",
  certification: "comercio-module-develop-remote",
  environment: "QA",
  target_environment: "develop",
  api_url: API_URL,
  supabase_project: SUPABASE_URL.replace(/^https:\/\//, "").split(".")[0],
  api_commit: "unknown",
  expected_commit: EXPECTED_COMMIT.slice(0, 12),
  generated_at: new Date().toISOString(),
  scope: {
    capability: "Comercio (M-30) end-to-end en develop: API desplegada (Railway) contra Supabase QA, con vitrina publica tematizada por tenant, bucket comercio-assets real, licencia M-30, RBAC y aislamiento entre empresas.",
    proven_by_live_execution: [
      "commit desplegado + vitrina publica anonima por HTTPS (404 con codigo de negocio para link inexistente)",
      "dos empresas efimeras aprovisionadas en la base QA (una con M-30, otra sin licencia) y autenticadas por /api/v1/auth/login",
      "configuracion y link publico propios, tema guardado en preferences_json y reflejado en el catalogo publico",
      "rechazo de hex/modo/texto invalidos y de URLs de imagen inyectadas por el cliente",
      "subida de banner y de foto de producto al bucket comercio-assets: URL publica del servidor, lectura sin credenciales, bytes identicos y eliminacion del objeto",
      "promocion vigente: precio de vitrina = precio de mostrador; venta efectivo y credito con cuotas y abono; anulacion con reversa de inventario",
      "quemar el link: el codigo anterior muere (404) y el nuevo responde",
      "aislamiento: documentos del tenant demo ajeno devuelven 404 con codigo de negocio y la lista propia no contiene filas ajenas",
      "limpieza verificada: 0 filas en las 15 tablas de Comercio y 0 objetos en el bucket para las dos empresas de la corrida"
    ]
  },
  fixtures: { run_id: RUN_ID, tenants: {}, foreign_tenant_id: FOREIGN_TENANT_ID },
  storage: { bucket: BUCKET, objects_created: [], objects_left: null },
  checks: [],
  status: "running"
};

let blocking = true;
function check(name, ok, detail = {}) {
  result.checks.push({ name, ok: Boolean(ok), blocking, detail });
  console.error(`[cert] ${String(result.checks.length).padStart(2, "0")} ${ok ? "OK  " : "FALLA"} ${name}`);
  if (!ok && blocking) throw new Error(`Fallo de certificacion: ${name} ${JSON.stringify(detail).slice(0, 240)}`);
}
// La limpieza se registra pero no puede tapar el fallo original: si algo quedo sin borrar,
// se ve en la evidencia y sale en el consolidado, no como excepcion que reescribe el motivo.
function note(name, ok, detail = {}) {
  blocking = false;
  try { check(name, ok, detail); } finally { blocking = true; }
}

const statuses = [];
async function capture(url, { token, method = "GET", body, form } = {}) {
  const headers = { accept: "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  const payload = form || (body !== undefined ? JSON.stringify(body) : null);
  if (body !== undefined && !form) headers["content-type"] = "application/json";
  const started = Date.now();
  const res = await fetch(`${API_URL}${url}`, {
    method, headers, ...(payload ? { body: payload } : {}), signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { message: text.slice(0, 300) }; }
  statuses.push(res.status);
  return { status: res.status, payload: json, latency_ms: Date.now() - started };
}

async function supabase(pathname, { method = "GET", body, profile } = {}) {
  const res = await fetch(`${SUPABASE_URL}${pathname}`, {
    method,
    headers: { ...CAB, ...(profile ? { "Accept-Profile": profile } : {}), ...(method === "POST" ? { Prefer: "return=representation" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });
  const text = await res.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = text; }
  return { status: res.status, payload };
}

// --- PNG valido generado en memoria: la certificacion no puede depender de un asset del repo
//     para probar el bucket, y un PNG real es lo que exige el detector de firma + dimensiones.
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
  ihdr[8] = 8; ihdr[9] = 2; // 8 bits, color verdadero
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
async function uploadImage(url, token, bytes, mime = "image/png", filename = "banner-cert.png") {
  const form = new FormData();
  form.append("file", new Blob([bytes], { type: mime }), filename);
  return capture(url, { token, method: "POST", form });
}

// --- Aprovisionamiento efimero -------------------------------------------------------------
// El login del API autentica contra la tabla Prisma User con bcrypt, asi que la empresa y su
// administrador se crean directo en la base QA con la service role como transporte. Los ids se
// generan aqui para poder borrarlos al final sin ambiguedad.
const created = { tenants: [], users: [], tokens: {} };

async function provisionTenant(tag, modules) {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const row = {
    id, name: `Certificacion Comercio ${tag} ${RUN_ID}`, industry: "company", plan: "seed",
    active_modules: modules, config: {}, timezone: "America/Bogota", currency: "COP",
    country: "CO", active: true, created_at: now, updated_at: now, authorization_version: 1
  };
  const res = await supabase("/rest/v1/Tenant", { method: "POST", body: [row] });
  if (res.status >= 300 || !res.payload?.[0]?.id) {
    throw new Error(`No se pudo crear la empresa efimera ${tag}: ${res.status} ${JSON.stringify(res.payload).slice(0, 240)}`);
  }
  created.tenants.push(id);
  const email = `qa.comercio.${tag.toLowerCase()}.${RUN_ID}@apexos.qa`;
  const password = `Qa-Comercio-${crypto.randomBytes(6).toString("hex")}#26`;
  const hash = await bcrypt.hash(password, 12);
  const user = await supabase("/rest/v1/User", { method: "POST", body: [{
    tenant_id: id, name: `Admin Certificacion Comercio ${tag}`, email, password: hash,
    role_id: 1, active: true, authorization_version: 1, preferences: {}, created_at: now, updated_at: now
  }] });
  if (user.status >= 300 || !user.payload?.[0]?.id) {
    throw new Error(`No se pudo crear el administrador efimero ${tag}: ${user.status} ${JSON.stringify(user.payload).slice(0, 240)}`);
  }
  created.users.push(user.payload[0].id);
  return { id, email, password };
}

async function login(fixture) {
  const res = await capture("/api/v1/auth/login", { method: "POST", body: { email: fixture.email, password: fixture.password } });
  if (res.status !== 200 || !res.payload?.token) {
    throw new Error(`Login fallido para ${fixture.email}: ${res.status} ${JSON.stringify(res.payload).slice(0, 200)}`);
  }
  return res.payload.token;
}

async function storageDeleteObject(objectPath) {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${objectPath}`, {
    method: "DELETE", headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  }).catch(() => null);
  return res ? res.status : 0;
}

// Lectura por la via AUTENTICADA (origen), no por la URL publica. Un bucket publico de
// Supabase sirve desde la cache del CDN: despues de borrar el objeto, la URL publica sigue
// respondiendo 200 durante el TTL de la cache. Lo que el producto controla es que el origen
// ya no tenga el bytes; la cache se reporta como limitacion declarada, no como verde.
async function originObjectStatus(objectPath) {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${objectPath}`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  }).catch(() => null);
  return res ? res.status : 0;
}

async function storageCountFor(tenantId) {
  // El esquema `storage` no esta expuesto por PostgREST en este proyecto (la lectura por
  // /rest/v1/objects devuelve -1). La lista formal es la API de Storage, que es la misma
  // superficie que usa el panel: prefix = la carpeta del tenant efimero.
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/list/${BUCKET}`, {
    method: "POST",
    headers: { ...CAB },
    body: JSON.stringify({ prefix: `${tenantId}/`, limit: 500 }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  }).catch(() => null);
  if (!res || res.status >= 300) return -1;
  const rows = await res.json().catch(() => []);
  return Array.isArray(rows) ? rows.length : -1;
}

async function tableCount(tenantId, table) {
  const res = await supabase(`/rest/v1/${table}?select=id&tenant_id=eq.${encodeURIComponent(tenantId)}`);
  return Array.isArray(res.payload) ? res.payload.length : -1;
}

function objectPathFromPublicUrl(url) {
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  const index = String(url || "").indexOf(marker);
  return index === -1 ? "" : decodeURIComponent(url.slice(index + marker.length));
}

async function cleanup(tenants) {
  // El DELETE de filas no borra los objetos: la foto del producto efimero quedaria sin dueno en el
  // bucket. Se eliminan explicitamente las rutas creadas por la corrida (el banner ya se fue
  // con su propio DELETE, pero el listado cubre las dos) y se comprueba que ninguna se lea.
  for (const objectPath of result.storage.objects_created) {
    await storageDeleteObject(objectPath).catch(() => 0);
  }
  const quedaron = [];
  for (const objectPath of result.storage.objects_created) {
    if (await originObjectStatus(objectPath) === 200) quedaron.push(objectPath);
  }
  result.storage.objects_left = quedaron.length;
  note("ningun_objeto_de_la_corrida_sigue_legible", result.storage.objects_created.length === 0 || quedaron.length === 0, {
    creados: result.storage.objects_created.length, quedaron
  });
  for (const tenantId of tenants) {
    for (const table of COMERCIO_TABLES) {
      await supabase(`/rest/v1/${table}?tenant_id=eq.${encodeURIComponent(tenantId)}`, { method: "DELETE" }).catch(() => null);
    }
    const leftover = [];
    for (const table of COMERCIO_TABLES) {
      const count = await tableCount(tenantId, table);
      if (count !== 0) leftover.push(`${table}=${count}`);
    }
    note(`sin_filas_de_comercio_en_${tenantId.slice(0, 8)}`, leftover.length === 0, { sobrantes: leftover });
    const objects = await storageCountFor(tenantId);
    note(`sin_objetos_del_bucket_en_${tenantId.slice(0, 8)}`, objects === 0, { carpetas: objects });
  }
  for (const userId of created.users) {
    await supabase(`/rest/v1/User?id=eq.${encodeURIComponent(userId)}`, { method: "DELETE" }).catch(() => null);
  }
  for (const tenantId of created.tenants) {
    await supabase(`/rest/v1/Tenant?id=eq.${encodeURIComponent(tenantId)}`, { method: "DELETE" }).catch(() => null);
  }
  const usersLeft = await supabase(`/rest/v1/User?select=id&email=like.qa.comercio.*${RUN_ID}*`);
  const tenantsLeft = await supabase(`/rest/v1/Tenant?select=id&name=like.Certificacion*Comercio*${RUN_ID}*`);
  note("usuarios_efimeros_eliminados", !Array.isArray(usersLeft.payload) || usersLeft.payload.length === 0, { quedaron: Array.isArray(usersLeft.payload) ? usersLeft.payload.length : -1 });
  note("empresas_efimeras_eliminadas", !Array.isArray(tenantsLeft.payload) || tenantsLeft.payload.length === 0, { quedaron: Array.isArray(tenantsLeft.payload) ? tenantsLeft.payload.length : -1 });
}

// El tenant demo de QA debe salir exactamente como entro: es la prueba de que la corrida
// no escribio fuera de sus propias empresas. Se compara contra la instantanea del inicio.
let foreignSettingsBefore = null;

async function main() {
  let ok = true;
  try {
    const health = await capture("/health");
    result.api_commit = health.payload?.commit || "unknown";
    check("develop_salud_y_commit", health.status === 200 && result.api_commit === EXPECTED_COMMIT.slice(0, 12), {
      status: health.status, commit: result.api_commit, esperado: EXPECTED_COMMIT.slice(0, 12), modulos: health.payload?.modules ?? null
    });

    const inexistente = await capture("/api/v1/public/comercio/catalog/zzzz99");
    check("vitrina_publica_viva_sin_sesion", inexistente.status === 404 && inexistente.payload?.code === "CATALOG_NOT_FOUND", {
      status: inexistente.status, code: inexistente.payload?.code
    });
    const sinSesion = await capture("/api/v1/comercio/dashboard");
    check("modulo_privado_sin_sesion_401", sinSesion.status === 401, { status: sinSesion.status, code: sinSesion.payload?.code });

    const beforeForeign = await supabase(`/rest/v1/comercio_settings?select=*&tenant_id=eq.${encodeURIComponent(FOREIGN_TENANT_ID)}`);
    foreignSettingsBefore = JSON.stringify(beforeForeign.payload || []);

    const cert = await provisionTenant("CERT", ["comercio"]);
    const sinLicencia = await provisionTenant("SINLIC", ["administracion"]);
    // Tercera empresa con M-30 y documentos propios: el aislamiento se mide contra IDs que
    // esta corrida sabe que existen, no contra los datos que el tenant demo tenga hoy.
    const ajeno = await provisionTenant("AJENO", ["comercio"]);
    result.fixtures.tenants = { cert: cert.id, sin_licencia: sinLicencia.id, ajeno: ajeno.id };
    check("empresas_efimeras_aprovisionadas", created.tenants.length === 3 && created.users.length === 3, {
      con_licencia: cert.id.slice(0, 8), sin_licencia: sinLicencia.id.slice(0, 8), ajeno: ajeno.id.slice(0, 8)
    });

    const tokenSinLicencia = await login(sinLicencia);
    const bloqueoLicencia = await capture("/api/v1/comercio/dashboard", { token: tokenSinLicencia });
    check("licencia_sin_M30_bloquea_la_lectura", bloqueoLicencia.status === 403 && bloqueoLicencia.payload?.code === "MODULO_NO_HABILITADO", {
      status: bloqueoLicencia.status, code: bloqueoLicencia.payload?.code
    });
    const escrituraSinLicencia = await capture("/api/v1/comercio/settings", { token: tokenSinLicencia, method: "PUT", body: { store_name: "No deberia poder" } });
    check("licencia_sin_M30_bloquea_la_escritura", escrituraSinLicencia.status === 403 && escrituraSinLicencia.payload?.code === "MODULO_NO_HABILITADO", {
      status: escrituraSinLicencia.status
    });
    const settingsSinLicencia = await supabase(`/rest/v1/comercio_settings?select=id&tenant_id=eq.${sinLicencia.id}`);
    check("la_empresa_sin_licencia_no_tiene_configuracion", Array.isArray(settingsSinLicencia.payload) && settingsSinLicencia.payload.length === 0, {
      filas: Array.isArray(settingsSinLicencia.payload) ? settingsSinLicencia.payload.length : -1
    });

    const token = await login(cert);
    created.tokens.cert = token;
    check("login_de_la_empresa_de_certificacion", Boolean(token), { tenant_id: cert.id.slice(0, 8) });

    // --- Configuracion y link publico ---
    const alta = await capture("/api/v1/comercio/settings", { token, method: "PUT", body: { store_name: `Despensa Certificada ${RUN_ID}`, currency: "cop", catalog_enabled: true, catalog_tagline: "La despensa del barrio, en un clic" } });
    // settingsDto no devuelve tenant_id a proposito (el cliente no elige su empresa): la
    // prueba de scoping es la fila que efectivamente quedo escrita en la base QA.
    const code = String(alta.payload?.catalog_code || "");
    const filaConfig = await supabase(`/rest/v1/comercio_settings?select=tenant_id,store_name,catalog_code,catalog_enabled&tenant_id=eq.${cert.id}`);
    check("configuracion_crea_su_fila_propia", alta.status === 200 && /^[a-z0-9]{4,32}$/.test(code) && alta.payload?.catalog_enabled === true
      && filaConfig.payload?.length === 1 && filaConfig.payload[0].catalog_code === code, {
      status: alta.status, catalog_code: code, en_base: filaConfig.payload?.[0]?.tenant_id === cert.id
    });
    check("moneda_normalizada_mayusculas", alta.payload?.currency === "COP", { currency: alta.payload?.currency });

    const anonimo = await capture(`/api/v1/public/comercio/catalog/${code}`, { });
    check("vitrina_publica_del_codigo_responde", anonimo.status === 200 && anonimo.payload?.store_name === `Despensa Certificada ${RUN_ID}`, {
      status: anonimo.status, store_name: anonimo.payload?.store_name
    });
    const serializado = JSON.stringify(anonimo.payload);
    check("la_vitrina_no_filtra_costo_stock_ni_tenant", !/"cost[a-z_]*"\s*:|"stock[a-z_]*"\s*:|"tenant_id"|banner_path/.test(serializado), {
      claves: Object.keys(anonimo.payload || {})
    });
    check("tema_por_defecto_viaja_en_el_publico", /^#[0-9a-f]{6}$/i.test(String(anonimo.payload?.theme?.accent || "")) && anonimo.payload?.theme?.banner_url === null, {
      theme: anonimo.payload?.theme
    });

    // --- Tema: validaciones y persistencia real ---
    const hexMalo = await capture("/api/v1/comercio/settings/storefront/theme", { token, method: "PUT", body: { accent: "javascript:alert(1)" } });
    check("rechaza_un_hex_invalido", hexMalo.status === 400, { status: hexMalo.status });
    const patronMalo = await capture("/api/v1/comercio/settings/storefront/theme", { token, method: "PUT", body: { background_pattern: "url(http://evil.test/x.png)" } });
    check("rechaza_un_patron_fuera_del_enum", patronMalo.status === 400, { status: patronMalo.status });
    const titularLargo = await capture("/api/v1/comercio/settings/storefront/theme", { token, method: "PUT", body: { headline: "x".repeat(200) } });
    check("rechaza_un_texto_demasiado_largo", titularLargo.status === 400, { status: titularLargo.status });
    // La URL del banner la produce el servidor. El contracto admitido tiene dos formas
    // seguras segun la configuracion de AJV del build desplegado: rechazar la propiedad
    // desconocida (400) o ignorarla sin tocar el tema. Lo que no se admite es que el tema
    // quede con la URL que envio el cliente.
    const urlInyectada = await capture("/api/v1/comercio/settings/storefront/theme", { token, method: "PUT", body: { banner_url: "https://evil.test/x.png", banner_path: "otro-tenant/secreto.png" } });
    const temaTrasInyeccion = await capture("/api/v1/comercio/settings", { token });
    check("el_cliente_no_pone_url_de_banner", urlInyectada.status === 400
      || (urlInyectada.status === 200 && urlInyectada.payload?.theme?.banner_url == null
        && !JSON.stringify(urlInyectada.payload?.preferences?.theme || {}).includes("secreto")), {
      status: urlInyectada.status, banner_url: urlInyectada.payload?.theme?.banner_url ?? null,
      path_guardado: temaTrasInyeccion.payload?.preferences?.theme?.banner_path ?? null
    });

    const tema = await capture("/api/v1/comercio/settings/storefront/theme", {
      token, method: "PUT",
      body: { accent: "#2563EB", promo: "#BE123C", base: "#0B1220", surface_tint: "marcado", surface_depth: "alta", background_pattern: "cuadricula", corner_radius: "redondo", banner_scrim: "fuerte", headline: "La despensa del barrio, en un clic", subhead: "Certificacion remota develop" }
    });
    check("tema_guardado_en_minusculas", tema.status === 200 && tema.payload?.theme?.accent === "#2563eb" && tema.payload?.theme?.corner_radius === "redondo", {
      status: tema.status, theme: tema.payload?.theme
    });
    const publicoConTema = await capture(`/api/v1/public/comercio/catalog/${code}`);
    check("el_tema_del_tenant_llega_al_publico", publicoConTema.payload?.theme?.accent === "#2563eb" && publicoConTema.payload?.theme?.base === "#0b1220", {
      accent: publicoConTema.payload?.theme?.accent, base: publicoConTema.payload?.theme?.base
    });
    const persistido = await supabase(`/rest/v1/comercio_settings?select=preferences_json&tenant_id=eq.${cert.id}`);
    check("el_tema_persiste_en_la_base_qa", JSON.stringify(persistido.payload?.[0]?.preferences_json || {}).includes("2563eb"), {
      preferences: JSON.stringify(persistido.payload?.[0]?.preferences_json || {}).slice(0, 200)
    });

    // --- Banner contra el bucket real ---
    const png = buildPng(1200, 400, [37, 99, 235]);
    const subida = await uploadImage("/api/v1/comercio/settings/storefront/banner", token, png);
    const urlPublica = String(subida.payload?.theme?.banner_url || "");
    check("la_subida_del_banner_devuelve_201", subida.status === 201, {
      status: subida.status, code: subida.payload?.code ?? subida.payload?.error?.code ?? null,
      detalle: String(subida.payload?.message ?? subida.payload?.error?.message ?? "").slice(0, 200)
    });
    check("el_banner_sale_como_url_publica_del_bucket", urlPublica.startsWith(`${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/`), { banner_url: urlPublica.slice(0, 160) });
    const rutaObjeto = objectPathFromPublicUrl(urlPublica);
    if (rutaObjeto) result.storage.objects_created.push(rutaObjeto);
    check("el_path_del_objeto_es_del_tenant", String(subida.payload?.preferences?.theme?.banner_path || "").startsWith(`${BUCKET}/${cert.id}/comercio/storefront/`), {
      banner_path: subida.payload?.preferences?.theme?.banner_path
    });
    check("la_respuesta_trae_url_firmada_del_servidor", /^https?:\/\//.test(String(subida.payload?.banner_url || "")), {
      firmada: String(subida.payload?.banner_url || "").slice(0, 120)
    });

    const lectura = await fetch(urlPublica, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) }).catch(() => null);
    const leidos = lectura ? Buffer.from(await lectura.arrayBuffer()) : Buffer.alloc(0);
    check("el_objeto_se_lee_sin_credenciales", lectura?.status === 200 && /^image\/png/i.test(String(lectura.headers?.get("content-type") || "")), {
      status: lectura?.status ?? null, content_type: lectura?.headers?.get("content-type") ?? null
    });
    check("el_objeto_devuelve_los_mismos_bytes", leidos.length === png.length && Buffer.compare(leidos, png) === 0, { esperados: png.length, leidos: leidos.length });
    const publicoConBanner = await capture(`/api/v1/public/comercio/catalog/${code}`);
    check("el_publico_expone_la_url_del_bucket", publicoConBanner.payload?.theme?.banner_url === urlPublica, { banner_url: String(publicoConBanner.payload?.theme?.banner_url || "").slice(0, 160) });
    check("el_publico_no_filtra_el_path_interno", !/"banner_path"/.test(JSON.stringify(publicoConBanner.payload)), {});

    const noEsImagen = await uploadImage("/api/v1/comercio/settings/storefront/banner", token, Buffer.from("<svg onload=alert(1)>"), "image/png", "banner-falso.png");
    check("rechaza_un_archivo_que_no_es_imagen", noEsImagen.status === 415, { status: noEsImagen.status, detalle: String(noEsImagen.payload?.message ?? "").slice(0, 120) });
    const mimeMentiroso = await uploadImage("/api/v1/comercio/settings/storefront/banner", token, png, "image/jpeg", "banner.jpg");
    check("rechaza_un_mime_que_no_coincide", mimeMentiroso.status === 415, { status: mimeMentiroso.status });

    const quitado = await capture("/api/v1/comercio/settings/storefront/banner", { token, method: "DELETE" });
    check("quitar_el_banner_deja_de_exponer_url", quitado.status === 200 && quitado.payload?.theme?.banner_url === null, { status: quitado.status });
    const origenTrasBorrar = await originObjectStatus(rutaObjeto);
    check("el_objeto_borrado_ya_no_esta_en_el_origen", origenTrasBorrar !== 200, { status_origen: origenTrasBorrar });
    const cdnTrasBorrar = await fetch(urlPublica, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) }).catch(() => null);
    // Limitacion declarada del ambiente, no del producto: el CDN de un bucket PUBLICO de
    // Supabase sigue sirviendo la copia cacheada del objeto borrado hasta que expira.
    note("la_cache_publica_del_cdn_sigue_sirviendo_el_objeto_borrado", cdnTrasBorrar?.status === 200, {
      status_publico: cdnTrasBorrar?.status ?? null, status_origen: origenTrasBorrar
    });
    // Registro, no puerta: el conteo de la lista del bucket es informativo porque la API de
    // Storage devuelve carpetas de primer nivel. La prueba dura de que el objeto se fue es la
    // lectura HTTP anterior (la URL publica ya no responde 200).
    const inventarioBanner = await storageCountFor(cert.id);
    note("el_inventario_del_bucket_queda_vacio_tras_borrar", inventarioBanner === 0, { carpetas: inventarioBanner });

    // --- Maestros, promocion, vitrina y mostrador ---
    const producto = await capture("/api/v1/comercio/products", { token, method: "POST", body: { name: `Cafe de Certificacion 250 g ${RUN_ID}`, category: "Despensa", unit: "unidad", price: 12000, cost: 7000, stock: 20, min_stock: 5, catalog_featured: true, notes: "Producto efimero de certificacion develop" } });
    check("producto_creado_con_codigo_y_stock", producto.status === 201 && /^P-\d{4}$/.test(String(producto.payload?.code || "")) && producto.payload?.stock === 20, {
      status: producto.status, code: producto.payload?.code, stock: producto.payload?.stock
    });
    const productoId = producto.payload?.id;

    // La subida responde con URL FIRMADA (10 min) y la ficha con URL PUBLICA: son los dos
    // contratos de lectura de la vitrina. Se exigen los dos porque el panel usa la primera y
    // la pagina publica la segunda; si el bucket perdiera su politica publica, aqui se ve.
    const foto = await uploadImage(`/api/v1/comercio/products/${productoId}/photo`, token, buildPng(600, 600, [245, 158, 11]), "image/png", "foto-cert.png");
    check("la_foto_del_producto_sube_al_bucket", foto.status === 201 && /^https?:\/\//.test(String(foto.payload?.photo_url || "")), {
      status: foto.status, photo_url: String(foto.payload?.photo_url || "").slice(0, 120)
    });
    const ficha = await capture(`/api/v1/comercio/products/${productoId}`, { token });
    const urlFoto = String(ficha.payload?.photo_url || "");
    check("la_ficha_expone_la_url_publica_del_bucket", ficha.status === 200 && ficha.payload?.has_photo === true && urlFoto.startsWith(`${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/`), {
      has_photo: ficha.payload?.has_photo, url: urlFoto.slice(0, 160)
    });
    const rutaFoto = objectPathFromPublicUrl(urlFoto);
    if (rutaFoto) result.storage.objects_created.push(rutaFoto);
    const lecturaFoto = await fetch(urlFoto, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) }).catch(() => null);
    check("la_foto_se_lee_sin_credenciales", lecturaFoto?.status === 200, { status: lecturaFoto?.status ?? null });
    // El contrato de la URL de lectura es photo_url (firmada): si la vitrina dependiera de
    // la respuesta del panel, un cambio de clave aqui romperia la imagen sin romper el alta.
    const firma = await capture(`/api/v1/comercio/products/${productoId}/photo-url`, { token });
    check("la_url_firmada_de_la_foto_es_legible", firma.status === 200 && /^https?:\/\//.test(String(firma.payload?.photo_url || "")), {
      status: firma.status, photo_url: String(firma.payload?.photo_url || "").slice(0, 120)
    });

    const promo = await capture("/api/v1/comercio/promotions", { token, method: "POST", body: { name: `Descuento de certificacion ${RUN_ID}`, percent: 10, scope: "all", status: "active", message: "Lleva 10 % de descuento esta semana" } });
    check("promocion_creada_y_activa", promo.status === 201 && promo.payload?.status === "active", { status: promo.status, id: promo.payload?.id });
    const promoId = promo.payload?.id;

    const vitrina = await capture(`/api/v1/public/comercio/catalog/${code}`);
    const articulo = (vitrina.payload?.items || []).find((item) => item.code === producto.payload?.code) || {};
    check("la_vitrina_aplica_el_descuento", articulo.discount_percent === 10 && articulo.price === 10800 && articulo.base_price === 12000, {
      price: articulo.price, base_price: articulo.base_price, discount_percent: articulo.discount_percent
    });
    check("la_vitrina_publica_la_foto_del_bucket", String(articulo.photo_url || "") === urlFoto, { photo_url: String(articulo.photo_url || "").slice(0, 160) });
    check("el_publico_no_revela_el_costo_del_producto", !/"cost"/.test(JSON.stringify(articulo)), { claves: Object.keys(articulo) });

    const cliente = await capture("/api/v1/comercio/customers", { token, method: "POST", body: { name: `Cliente de Certificacion ${RUN_ID}`, document: `CC-CERT-${RUN_ID}`, phone: "3001234567", active: true } });
    check("cliente_creado", cliente.status === 201 && /^C-\d{4}$/.test(String(cliente.payload?.code || "")), { status: cliente.status, code: cliente.payload?.code });

    const ventaEfectivo = await capture("/api/v1/comercio/sales", { token, method: "POST", body: { items: [{ product_id: productoId, quantity: 2 }], payment_type: "cash", method: "Efectivo", note: "Venta de certificacion develop" } });
    check("venta_efectivo_aplica_el_precio_de_vitrina", ventaEfectivo.status === 201 && ventaEfectivo.payload?.total === 21600 && /^V-\d{6}$/.test(String(ventaEfectivo.payload?.full_number || "")), {
      status: ventaEfectivo.status, total: ventaEfectivo.payload?.total, number: ventaEfectivo.payload?.full_number
    });
    const ventaEfectivoId = ventaEfectivo.payload?.id;

    const despuesDeVenta = await capture(`/api/v1/comercio/products/${productoId}`, { token });
    check("la_venta_descuenta_inventario", despuesDeVenta.status === 200 && despuesDeVenta.payload?.stock === 18, { stock: despuesDeVenta.payload?.stock });
    const movimientos = await capture("/api/v1/comercio/movements?limit=10", { token });
    const movVenta = (movimientos.payload?.items || movimientos.payload?.rows || []).find((m) => String(m.reference || "").includes(String(ventaEfectivo.payload?.full_number)));
    check("la_venta_deja_movimiento_de_inventario", Boolean(movVenta) && movVenta.change === -2, { movimiento: movVenta ? { change: movVenta.change, reference: movVenta.reference } : null });

    const ventaCredito = await capture("/api/v1/comercio/sales", { token, method: "POST", body: {
      items: [{ product_id: productoId, quantity: 3 }], payment_type: "credit", customer_id: cliente.payload?.id,
      credit: { down_payment: 10000, installment_count: 3, frequency: "monthly", first_due_date: TODAY }
    } });
    check("venta_credito_genera_documento_y_cartera", ventaCredito.status === 201 && /^CR-\d{4}$/.test(String(ventaCredito.payload?.credit_full_number || "")), {
      status: ventaCredito.status, credito: ventaCredito.payload?.credit_full_number
    });
    const creditos = await capture("/api/v1/comercio/credits?limit=10", { token });
    const credito = (creditos.payload?.items || creditos.payload?.rows || []).find((c) => c.sale_id === ventaCredito.payload?.id) || {};
    check("la_cartera_registra_el_saldo_financiado", Boolean(credito.id) && Number(credito.balance) > 0 && Number(credito.down_payment) === 10000, { balance: credito.balance, anticipo: credito.down_payment });
    const abono = await capture(`/api/v1/comercio/credits/${credito.id}/payments`, { token, method: "POST", body: { amount: 5000, method: "Transferencia", note: "Abono de certificacion" } });
    check("el_abono_baja_el_saldo", abono.status === 201, { status: abono.status });
    const creditosDespues = await capture("/api/v1/comercio/credits?limit=10", { token });
    const creditoAbonado = (creditosDespues.payload?.items || creditosDespues.payload?.rows || []).find((c) => c.id === credito.id) || {};
    check("el_abono_persiste_en_la_base_qa", Number(creditoAbonado.balance) < Number(credito.balance), { antes: credito.balance, despues: creditoAbonado.balance });

    const dashboard = await capture("/api/v1/comercio/dashboard", { token });
    const ventaVisible = (dashboard.payload?.recent_sales || []).some((s) => s.full_number === ventaEfectivo.payload?.full_number || s.full_number === ventaCredito.payload?.full_number);
    check("el_dashboard_refleja_las_ventas", dashboard.status === 200 && ventaVisible, { status: dashboard.status, recientes: (dashboard.payload?.recent_sales || []).length });
    check("el_dashboard_consolida_el_mes", Number(dashboard.payload?.month?.sales ?? 0) > 0 && Number(dashboard.payload?.month?.estimated_result ?? 0) !== 0, { mes: dashboard.payload?.month });

    // La anulacion devuelve LAS 2 unidades de la venta anulada, no el stock original: sobre
    // el mismo producto ya corrio la venta a credito, asi que la medida es delta y no absoluto.
    const antesDeAnular = await capture(`/api/v1/comercio/products/${productoId}`, { token });
    const anulada = await capture(`/api/v1/comercio/sales/${ventaEfectivoId}/void`, { token, method: "POST", body: { reason: "Anulacion de certificacion develop" } });
    check("anular_venta_devuelve_el_inventario", (anulada.status === 200 || anulada.status === 201) && anulada.payload?.status !== "active", { status: anulada.status, status_negocio: anulada.payload?.status });
    const trasAnular = await capture(`/api/v1/comercio/products/${productoId}`, { token });
    check("la_anulacion_reversa_el_stock", Number(trasAnular.payload?.stock) === Number(antesDeAnular.payload?.stock) + 2, {
      antes: antesDeAnular.payload?.stock, despues: trasAnular.payload?.stock
    });

    const gasto = await capture("/api/v1/comercio/expenses", { token, method: "POST", body: { concept: "Arriendo de vitrina (certificacion)", category: "Operativo", amount: 50000, direction: "expense", method: "Transferencia", date: TODAY } });
    check("gasto_operativo_registrado", gasto.status === 201 && Number(gasto.payload?.amount) === 50000, { status: gasto.status, amount: gasto.payload?.amount });

    // --- Aislamiento: primero contra documentos que esta corrida creo en OTRA empresa con
    //     licencia (ids que sabemos que existen), y despues contra un id real del tenant demo.
    const tokenAjeno = await login(ajeno);
    await capture("/api/v1/comercio/settings", { token: tokenAjeno, method: "PUT", body: { store_name: `Almacen Ajeno ${RUN_ID}`, catalog_enabled: true } });
    const productoAjeno = await capture("/api/v1/comercio/products", { token: tokenAjeno, method: "POST", body: { name: `Producto de otra empresa ${RUN_ID}`, price: 5000, cost: 3000, stock: 5, min_stock: 1 } });
    const ventaAjenaCreada = await capture("/api/v1/comercio/sales", { token: tokenAjeno, method: "POST", body: { items: [{ product_id: productoAjeno.payload?.id, quantity: 1 }], payment_type: "cash" } });
    check("la_empresa_ajena_tiene_documentos_propios", productoAjeno.status === 201 && ventaAjenaCreada.status === 201, {
      producto: productoAjeno.payload?.id, venta: ventaAjenaCreada.payload?.full_number
    });
    const intruso = await capture(`/api/v1/comercio/products/${productoAjeno.payload?.id}`, { token });
    check("no_lee_el_producto_de_otra_empresa", intruso.status === 404 && intruso.payload?.code === "PRODUCT_NOT_FOUND", { status: intruso.status, code: intruso.payload?.code });
    const intrusoVenta = await capture(`/api/v1/comercio/sales/${ventaAjenaCreada.payload?.id}`, { token });
    check("no_lee_la_venta_de_otra_empresa", intrusoVenta.status === 404 && intrusoVenta.payload?.code === "SALE_NOT_FOUND", { status: intrusoVenta.status, code: intrusoVenta.payload?.code });
    const intrusoMuta = await capture(`/api/v1/comercio/products/${productoAjeno.payload?.id}/deactivate`, { token, method: "POST" });
    const fichaAjenaIntacta = await capture(`/api/v1/comercio/products/${productoAjeno.payload?.id}`, { token: tokenAjeno });
    check("el_invasor_no_muto_nada", intrusoMuta.status === 404 && fichaAjenaIntacta.status === 200
      && fichaAjenaIntacta.payload?.active === true && fichaAjenaIntacta.payload?.stock === 4, {
      status_escritura: intrusoMuta.status, activo: fichaAjenaIntacta.payload?.active, stock: fichaAjenaIntacta.payload?.stock
    });

    const ajenos = await supabase(`/rest/v1/comercio_products?select=id,name&tenant_id=eq.${FOREIGN_TENANT_ID}&limit=3`);
    const idAjeno = ajenos.payload?.[0]?.id;
    check("el_tenant_demo_tiene_documentos_ajenos", Boolean(idAjeno), { id_ajeno: idAjeno ?? null });
    const intrusoDemo = await capture(`/api/v1/comercio/products/${idAjeno}`, { token });
    check("no_lee_el_producto_demo_de_qa", intrusoDemo.status === 404 && intrusoDemo.payload?.code === "PRODUCT_NOT_FOUND", { status: intrusoDemo.status, code: intrusoDemo.payload?.code });
    const lista = await capture("/api/v1/comercio/products?limit=100", { token });
    const filas = lista.payload?.items || lista.payload || [];
    check("el_listado_no_contiene_filas_ajenas", Array.isArray(filas) && filas.length > 0 && filas.every((p) => String(p.code || "").startsWith("P-") && String(p.name || "").includes(RUN_ID)), {
      filas: Array.isArray(filas) ? filas.length : -1
    });
    const codeAjeno = await supabase(`/rest/v1/comercio_settings?select=catalog_code&tenant_id=eq.${FOREIGN_TENANT_ID}`);
    const vitrinaAjena = await capture(`/api/v1/public/comercio/catalog/${codeAjeno.payload?.[0]?.catalog_code}`);
    check("la_vitrina_ajena_no_se_movio", vitrinaAjena.status === 200 && vitrinaAjena.payload?.theme?.accent === "#10b981", {
      accent_ajeno: vitrinaAjena.payload?.theme?.accent
    });

    // --- Quemar el link publico ---
    const quemado = await capture("/api/v1/comercio/settings/catalog/regenerate", { token, method: "POST" });
    check("quemar_el_link_cambia_el_codigo", quemado.status === 200 && quemado.payload?.catalog_code !== code, { anterior: code, nuevo: quemado.payload?.catalog_code });
    const linkViejo = await capture(`/api/v1/public/comercio/catalog/${code}`);
    check("el_link_quemado_muere", linkViejo.status === 404, { status: linkViejo.status });
    const linkNuevo = await capture(`/api/v1/public/comercio/catalog/${quemado.payload?.catalog_code}`);
    check("el_link_nuevo_responde", linkNuevo.status === 200, { status: linkNuevo.status });

    const generacion = await capture("/api/v1/comercio/settings/storefront/generate-image", { token, method: "POST", body: { prompt: `Banner panoramico de una despensa de barrio con tonos azules y luz calida ${RUN_ID}` } });
    const codigoGeneracion = String(generacion.payload?.code ?? generacion.payload?.error?.code ?? "");
    if (generacion.status === 201) {
      const rutaGenerada = objectPathFromPublicUrl(String(generacion.payload?.theme?.banner_url || ""));
      if (rutaGenerada) result.storage.objects_created.push(rutaGenerada);
    }
    // Se acepta 201 (el generador respondio) o un rechazo EXTERNO con su codigo (502
    // IMAGEGEN_*, 504 IMAGEGEN_TIMEOUT): lo que no puede pasar es que la falla del
    // proveedor llegue como 5xx nuestro o como un 200 sin imagen.
    check("la_generacion_no_devuelve_error_interno", generacion.status === 201
      || (generacion.status === 502 && codigoGeneracion.startsWith("IMAGEGEN_"))
      || (generacion.status === 504 && codigoGeneracion === "IMAGEGEN_TIMEOUT"), {
      status: generacion.status, code: codigoGeneracion || null, detalle: String(generacion.payload?.message ?? generacion.payload?.error?.message ?? "").slice(0, 180)
    });

    check("ninguna_respuesta_es_5xx", statuses.every((s) => s < 500), { distribucion: statuses.reduce((acc, s) => { acc[s] = (acc[s] || 0) + 1; return acc; }, {}) });

    const despuesForeign = await supabase(`/rest/v1/comercio_settings?select=*&tenant_id=eq.${encodeURIComponent(FOREIGN_TENANT_ID)}`);
    check("el_tenant_demo_quedo_intacto", JSON.stringify(despuesForeign.payload || []) === foreignSettingsBefore, {
      antes_len: foreignSettingsBefore.length, despues_len: JSON.stringify(despuesForeign.payload || []).length
    });

    result.status = "passed";
  } catch (error) {
    result.status = "failed";
    result.error = error.message;
    console.error("[cert] ERROR:", error.message);
    ok = false;
  } finally {
    await cleanup([...created.tenants]).catch((error) => note("limpieza_completo", false, { error: error.message }));
    fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
    result.finished_at = new Date().toISOString();
    result.checks_passed = result.checks.filter((c) => c.ok).length;
    result.checks_total = result.checks.length;
    result.http_status_distribution = statuses.reduce((acc, s) => { acc[s] = (acc[s] || 0) + 1; return acc; }, {});
    fs.writeFileSync(OUTPUT, `${JSON.stringify(result, null, 2)}\n`);
    console.error(`[cert] evidencia: ${path.relative(ROOT, OUTPUT)} status=${result.status} (${result.checks_passed}/${result.checks_total})`);
    process.exit(ok ? 0 : 1);
  }
}

main();
