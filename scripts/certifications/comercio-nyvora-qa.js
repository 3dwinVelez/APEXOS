/* Certificacion de EMPRESA MODELO NYVORA del modulo Comercio (M-30) en el ambiente QA liberado.
 *
 * Que celda cubre y por que las otras no la cubren:
 *   - comercio-module-catalog-qa.js mide el CATALOGO (que la fila exista y se pueda activar).
 *   - comercio-develop-remote.js mide el MODULO con empresas efimeras propias.
 *   - Ninguna certifica el flujo con los datos controlados de la empresa modelo NYVORA, que es
 *     la compuerta que la politica exige antes de promover a main: "un rol autorizado, un rol
 *     sin el permiso especial y un usuario de otro tenant".
 *
 * Que se mide aqui, contra la API desplegada en Railway y la base de Supabase de QA:
 *   1. La licencia de la empresa modelo: public.modules -> company_modules(NYVORA)=enabled y
 *      el espejo Tenant.active_modules contiene "comercio".
 *   2. Rol AUTORIZADO (comercio:read|write|approve, no administrativo): configuracion de la
 *      vitrina, tema propio persistido en preferences_json y visible en el catalogo publico,
 *      banner y foto reales en el bucket comercio-assets, producto, cliente, venta en efectivo
 *      con reversa de inventario y anuracion.
 *   3. Rol SIN EL PERMISO ESPECIAL (solo lectura) de la MISMA empresa: lee, y cada escritura y
 *      la anuracion salen 403 con el codigo de negocio PERMISO_DENEGADO. El rechazo se mide.
 *   4. Usuario de OTRO tenant: los documentos de NYVORA no existen para el (404 con codigo de
 *      negocio, nunca 403: un 403 revelaria que el id existe en otra empresa) y su listado no
 *      trae filas de NYVORA.
 *   5. Empresa SIN licencia M-30: 403 MODULO_NO_HABILITADO en lectura y en escritura.
 *   6. Sin sesion: 401 TOKEN_INVALIDO; vitrina publica inexistente: 404 CATALOG_NOT_FOUND.
 *   7. Limpieza verificada: las 15 tablas de Comercio de NYVORA vuelven a la linea base medida
 *      al iniciar (cero) y no quedan usuarios, roles, permisos, sesiones, tenants efimeros ni
 *      objetos en el bucket de la corrida.
 *
 * Huella: en NYVORA solo escribe datos sinteticos etiquetados con el RUN_ID y los borra por id
 * exacto al terminar (nunca por tenant_id, para no tocar lo que otro proceso tuviera). Las dos
 * empresas efimeras son propias y se destruyen. NO toca produccion: aborta si la URL de API no
 * es exactamente el host HTTPS de QA en Railway.
 *
 * Uso:
 *   node scripts/certifications/comercio-nyvora-qa.js --env-file=config/qa.env \
 *     --output=docs/qa/evidence/comercio-main-20261108/nyvora-certification.json
 *
 * Las credenciales salen de config/qa.env (gitignore). Ningun correo, contrasena, token ni
 * clave se escribe en la evidencia: la corrida registra ids numericos y codigos de negocio.
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
  console.error("BLOQUEADO: esta certificacion de empresa modelo solo corre contra la API de QA en Railway (HTTPS).");
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
const NYVORA_COMPANY = String(args["nyvora-company"] || "5f713e65-a3c1-414b-9260-a411a5a2e2bd");
const BUCKET = "comercio-assets";
const COMERCIO_TABLES = [
  "comercio_promotion_sends", "comercio_promotion_products", "comercio_promotion_categories",
  "comercio_promotions", "comercio_payments", "comercio_installments", "comercio_credits",
  "comercio_sale_items", "comercio_sales", "comercio_purchases", "comercio_expenses",
  "comercio_stock_movements", "comercio_settings", "comercio_products", "comercio_customers"
];
const REQUEST_TIMEOUT_MS = Number(args["request-timeout-ms"] || 45000);
const OUTPUT = path.resolve(String(args.output || "docs/qa/evidence/comercio-main-20261108/nyvora-certification.json"));
const RUN_ID = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
const CAB = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" };

const result = {
  change_id: "comercio-main-20261108",
  certification: "comercio-nyvora-model-company-qa",
  environment: "QA",
  branch_under_test: "develop",
  api_url: API_URL,
  supabase_project: SUPABASE_URL.replace(/^https:\/\//, "").split(".")[0],
  api_commit: "unknown",
  expected_commit: EXPECTED_COMMIT.slice(0, 12),
  model_company: { name: "NYVORA", tenant_id: NYVORA_TENANT, company_id: NYVORA_COMPANY },
  generated_at: new Date().toISOString(),
  scope: {
    capability: "Comercio (M-30) con datos controlados de la empresa modelo NYVORA en el ambiente liberado: licencia de plataforma, rol autorizado, rol sin el permiso especial, usuario de otro tenant, empresa sin licencia, vitrina publica tematizada, bucket real y anuracion con reversa de inventario.",
    sujetos: {
      rol_autorizado: "comercio:read + comercio:write + comercio:approve (rol no administrativo creado por la corrida)",
      rol_sin_permiso_especial: "comercio:read solamente (escribir el tema, dar alta y anular deben salir 403 PERMISO_DENEGADO)",
      usuario_de_otro_tenant: "empresa efimera con M-30 habilitado, duena de sus propios documentos",
      empresa_sin_licencia: "empresa efimera sin M-30 en Tenant.active_modules"
    }
  },
  fixtures: { run_id: RUN_ID, ephemeral_tenants: [], users: [], roles: [], permissions: [], nyvora_rows: [] },
  storage: { bucket: BUCKET, objects_created: [], objects_left: null },
  baseline_nyvora: {},
  checks: [],
  status: "running"
};

let blocking = true;
function check(name, ok, detail = {}) {
  result.checks.push({ name, ok: Boolean(ok), blocking, detail });
  console.error(`[nyvora] ${String(result.checks.length).padStart(2, "0")} ${ok ? "OK  " : "FALLA"} ${name}`);
  if (!ok && blocking) throw new Error(`Fallo de certificacion: ${name} ${JSON.stringify(detail).slice(0, 240)}`);
}
// La limpieza se registra pero no puede tapar el fallo que provoco la abortada.
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
  let res;
  try {
    res = await fetch(`${API_URL}${url}`, { method, headers, ...(payload ? { body: payload } : {}), signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch (error) {
    statuses.push(0);
    return { status: 0, payload: { message: String(error).slice(0, 160) }, latency_ms: Date.now() - started };
  }
  const text = await res.text().catch(() => "");
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { message: text.slice(0, 300) }; }
  statuses.push(res.status);
  return { status: res.status, payload: json, latency_ms: Date.now() - started };
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

// --- PNG valido en memoria: la prueba del bucket no puede depender de un asset del repo -----
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
async function originObjectStatus(objectPath) {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${objectPath}`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  }).catch(() => null);
  return res ? res.status : 0;
}
async function storageDeleteObject(objectPath) {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${objectPath}`, {
    method: "DELETE", headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  }).catch(() => null);
  return res ? res.status : 0;
}

// --- Aprovisionamiento ----------------------------------------------------------------------
// El login del API autentica contra la tabla Prisma User con bcrypt. Los dos roles de NYVORA se
// crean explicitamente con sus permisos (no se usa el rol administrativo) para que el rechazo
// por permiso se mida y no se infiera del catalogo.
async function createRole(tenantId, name, permissions) {
  const role = await supabase("/rest/v1/Role", {
    method: "POST",
    body: [{ tenant_id: tenantId, name, description: `certificacion-nyvora-${RUN_ID}`, is_system: false, metadata: {} }]
  });
  const roleId = Array.isArray(role.payload) ? role.payload[0]?.id : null;
  if (!roleId) throw new Error(`No se pudo crear el rol ${name}: ${role.status} ${JSON.stringify(role.payload).slice(0, 200)}`);
  result.fixtures.roles.push(roleId);
  if (permissions.length) {
    const perms = await supabase("/rest/v1/Permission", {
      method: "POST",
      body: permissions.map(([module, action]) => ({ role_id: roleId, module, action }))
    });
    if (perms.status >= 300) throw new Error(`No se pudieron crear los permisos de ${name}: ${perms.status} ${JSON.stringify(perms.payload).slice(0, 200)}`);
    const listed = await supabase(`/rest/v1/Permission?select=id&role_id=eq.${roleId}`);
    for (const row of listed.payload || []) result.fixtures.permissions.push(row.id);
  }
  return roleId;
}

async function createUser(tenantId, roleId, tag) {
  const now = new Date().toISOString();
  const email = `nyvora.m30.${tag.toLowerCase()}.${RUN_ID}@certificacion.qa`;
  const password = `Nyvora-M30-${crypto.randomBytes(6).toString("hex")}#26`;
  const hash = await bcrypt.hash(password, 12);
  const user = await supabase("/rest/v1/User", {
    method: "POST",
    body: [{ tenant_id: tenantId, name: `Certificacion Comercio ${tag} ${RUN_ID}`, email, password: hash, role_id: roleId, active: true, authorization_version: 1, preferences: {}, created_at: now, updated_at: now }]
  });
  const userId = Array.isArray(user.payload) ? user.payload[0]?.id : null;
  if (!userId) throw new Error(`No se pudo crear el usuario ${tag}: ${user.status} ${JSON.stringify(user.payload).slice(0, 200)}`);
  result.fixtures.users.push(userId);
  return { id: userId, email, password };
}

async function provisionTenant(tag, modules) {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const res = await supabase("/rest/v1/Tenant", {
    method: "POST",
    body: [{
      id, name: `Certificacion Comercio ${tag} ${RUN_ID}`, industry: "company", plan: "seed",
      active_modules: modules, config: {}, timezone: "America/Bogota", currency: "COP",
      country: "CO", active: true, created_at: now, updated_at: now, authorization_version: 1
    }]
  });
  if (res.status >= 300 || !res.payload?.[0]?.id) {
    throw new Error(`No se pudo crear la empresa efimera ${tag}: ${res.status} ${JSON.stringify(res.payload).slice(0, 200)}`);
  }
  result.fixtures.ephemeral_tenants.push(id);
  // role_id 1 es el administrativo global: mismo patrón que comercio-develop-remote.js.
  return { id, ...(await createUser(id, 1, tag)) };
}

async function login(fixture) {
  const res = await capture("/api/v1/auth/login", { method: "POST", body: { email: fixture.email, password: fixture.password } });
  if (res.status !== 200 || !res.payload?.token) {
    throw new Error(`Login fallido (${fixture.name || ""}): ${res.status} ${JSON.stringify(res.payload).slice(0, 160)}`);
  }
  return { token: res.payload.token, tenantId: res.payload.tenant?.id || null };
}

async function tableRows(table, tenantId) {
  const res = await supabase(`/rest/v1/${table}?select=id&tenant_id=eq.${encodeURIComponent(tenantId)}`);
  return Array.isArray(res.payload) ? res.payload : null;
}

async function main() {
  // --- 0. El ambiente bajo prueba es el codigo promocionado ----------------------------------
  const health = await fetch(`${API_URL}/health`, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) }).then((r) => r.json());
  const commit = String(health.commit ?? health.build?.commit ?? "");
  result.api_commit = commit;
  check("el_api_desplegado_es_el_commit_esperado", commit.startsWith(EXPECTED_COMMIT.slice(0, 12)), {
    commit, esperado: EXPECTED_COMMIT, modulos: Array.isArray(health.modules) ? health.modules.length : null
  });

  // --- 1. La licencia de la empresa modelo, en las dos tablas que la sostienen ---------------
  const modulo = await supabase("/rest/v1/modules?code=eq.comercio&select=id,code,name,route,is_active,sort_order");
  const fila = Array.isArray(modulo.payload) ? modulo.payload[0] : null;
  check("el_catalogo_de_plataforma_tiene_una_fila_comercio", Boolean(fila) && fila.route === "/dashboard/comercio" && fila.is_active === true, {
    filas: Array.isArray(modulo.payload) ? modulo.payload.length : 0, route: fila?.route, activo: fila?.is_active
  });
  const licencia = await supabase(`/rest/v1/company_modules?module_id=eq.${fila.id}&company_id=eq.${NYVORA_COMPANY}&select=enabled,source`);
  check("company_modules_habilita_comercio_para_nyvora", licencia.payload?.[0]?.enabled === true, {
    enabled: licencia.payload?.[0]?.enabled, source: licencia.payload?.[0]?.source
  });
  const tenantRow = await supabase(`/rest/v1/Tenant?select=name,active,active_modules&id=eq.${NYVORA_TENANT}`);
  const activeModules = tenantRow.payload?.[0]?.active_modules || [];
  check("la_empresa_modelo_tiene_la_licencia_espejada_en_su_tenant", activeModules.includes("comercio") && tenantRow.payload?.[0]?.active === true, {
    tenant: tenantRow.payload?.[0]?.name, modulos: activeModules.length, contiene_comercio: activeModules.includes("comercio")
  });

  // --- 2. Linea base de NYVORA antes de escribir ---------------------------------------------
  for (const table of COMERCIO_TABLES) {
    const rows = await tableRows(table, NYVORA_TENANT);
    result.baseline_nyvora[table] = rows ? rows.length : -1;
  }
  check("la_empresa_modelo_arranca_sin_documents_de_comercio", Object.values(result.baseline_nyvora).every((n) => n === 0), result.baseline_nyvora);

  // --- 3. Los sujetos de la compuerta ---------------------------------------------------------
  const rolAutorizadoId = await createRole(NYVORA_TENANT, `Cert M-30 Autorizado ${RUN_ID}`, [["comercio", "read"], ["comercio", "write"], ["comercio", "approve"]]);
  const rolLimitadoId = await createRole(NYVORA_TENANT, `Cert M-30 Solo Lectura ${RUN_ID}`, [["comercio", "read"]]);
  const autorizado = await createUser(NYVORA_TENANT, rolAutorizadoId, "AUTORIZADO");
  const limitado = await createUser(NYVORA_TENANT, rolLimitadoId, "SOLOLECTURA");
  const ajeno = await provisionTenant("AJENO", ["comercio", "dashboard"]);
  const sinLicencia = await provisionTenant("SINLIC", ["administracion", "dashboard"]);

  const sesionAutorizado = await login(autorizado);
  const sesionLimitado = await login(limitado);
  const sesionAjeno = await login(ajeno);
  const sesionSinLicencia = await login(sinLicencia);
  check("las_sesiones_de_la_empresa_modelo_son_de_nyvora", sesionAutorizado.tenantId === NYVORA_TENANT && sesionLimitado.tenantId === NYVORA_TENANT, {
    autorizado: sesionAutorizado.tenantId === NYVORA_TENANT, limitado: sesionLimitado.tenantId === NYVORA_TENANT
  });
  const tAutorizado = sesionAutorizado.token;
  const tLimitado = sesionLimitado.token;
  const tAjeno = sesionAjeno.token;
  const tSinLicencia = sesionSinLicencia.token;

  // --- 4. Configuracion de la vitrina de la empresa modelo -----------------------------------
  const settingsLeidos = await capture("/api/v1/comercio/settings", { token: tAutorizado });
  check("el_rol_autorizado_lee_la_configuracion_de_nyvora", settingsLeidos.status === 200, {
    status: settingsLeidos.status, code: codeOf(settingsLeidos.payload)
  });
  const alta = await capture("/api/v1/comercio/settings", { token: tAutorizado, method: "PUT", body: {
    store_name: `Despensa Nyvora Certificacion ${RUN_ID}`, currency: "cop", catalog_enabled: true, catalog_tagline: "Certificacion de empresa modelo en el ambiente liberado"
  } });
  check("la_empresa_modelo_configura_su_vitrina_publica", alta.status === 200 && alta.payload?.catalog_enabled === true && /^[a-z0-9]{4,32}$/.test(String(alta.payload?.catalog_code || "")), {
    status: alta.status, code: codeOf(alta.payload), habilitado: alta.payload?.catalog_enabled
  });
  const codigoVitrina = String(alta.payload?.catalog_code || "");
  const filaSettings = await supabase(`/rest/v1/comercio_settings?select=id,tenant_id,catalog_code,store_name&tenant_id=eq.${NYVORA_TENANT}`);
  const settingsId = filaSettings.payload?.[0]?.id;
  if (settingsId) result.fixtures.nyvora_rows.push({ table: "comercio_settings", id: settingsId });
  check("la_configuracion_es_una_fila_propia_de_nyvora", filaSettings.payload?.length === 1 && filaSettings.payload[0].tenant_id === NYVORA_TENANT, {
    filas: filaSettings.payload?.length, codigo: filaSettings.payload?.[0]?.catalog_code
  });

  const sinSesion = await capture("/api/v1/comercio/dashboard");
  check("la_superficie_privada_sin_sesion_es_401", sinSesion.status === 401 && codeOf(sinSesion.payload) === "TOKEN_INVALIDO", {
    status: sinSesion.status, code: codeOf(sinSesion.payload)
  });

  // --- 5. Tema propio, persistido y publicado --------------------------------------------------
  const temaNuevo = {
    accent: "#1d4ed8", base: "#0b1220", promo: "#be123c", surface_tint: "suave", surface_depth: "media",
    background_pattern: "cuadricula", corner_radius: "redondo", banner_scrim: "medio",
    headline: `Vitrina Nyvora ${RUN_ID}`, subhead: "Certificacion de empresa modelo en el ambiente liberado"
  };
  const writeTema = await capture("/api/v1/comercio/settings/storefront/theme", { token: tAutorizado, method: "PUT", body: temaNuevo });
  check("el_rol_autorizado_guarda_el_tema_de_la_vitrina", writeTema.status === 200 && writeTema.payload?.theme?.accent === "#1d4ed8", {
    status: writeTema.status, code: codeOf(writeTema.payload), accent: writeTema.payload?.theme?.accent
  });
  const persistido = await supabase(`/rest/v1/comercio_settings?select=preferences_json&tenant_id=eq.${NYVORA_TENANT}`);
  check("el_tema_persiste_en_la_base_de_qa", JSON.stringify(persistido.payload?.[0]?.preferences_json || {}).includes("1d4ed8"), {
    preferences: JSON.stringify(persistido.payload?.[0]?.preferences_json || {}).slice(0, 160)
  });
  const publico = await capture(`/api/v1/public/comercio/catalog/${codigoVitrina}`);
  check("el_tema_de_nyvora_llega_al_catalogo_publico", publico.status === 200 && publico.payload?.theme?.accent === "#1d4ed8" && publico.payload?.theme?.headline === temaNuevo.headline, {
    status: publico.status, accent: publico.payload?.theme?.accent
  });
  const publicoInexistente = await capture("/api/v1/public/comercio/catalog/zzz999");
  check("la_vitrina_publica_inexistente_da_404_con_codigo", publicoInexistente.status === 404 && codeOf(publicoInexistente.payload) === "CATALOG_NOT_FOUND", {
    status: publicoInexistente.status, code: codeOf(publicoInexistente.payload)
  });

  // --- 6. El permiso especial negado al rol de solo lectura (rechazo medido) ------------------
  const lecturaLimitada = await capture("/api/v1/comercio/settings", { token: tLimitado });
  check("el_rol_sin_el_permiso_especial_si_lee", lecturaLimitada.status === 200, { status: lecturaLimitada.status, code: codeOf(lecturaLimitada.payload) });
  const temaDenegado = await capture("/api/v1/comercio/settings/storefront/theme", { token: tLimitado, method: "PUT", body: { accent: "#ff0000" } });
  check("el_rol_sin_el_permiso_especial_no_puede_escribir_el_tema", temaDenegado.status === 403 && codeOf(temaDenegado.payload) === "PERMISO_DENEGADO", {
    status: temaDenegado.status, code: codeOf(temaDenegado.payload)
  });
  // Body valido a proposito: Fastify valida el JSON antes del preHandler, asi que un body
  // incompleto daria 400 y la gate mediria AJV en lugar de medir el permiso.
  const productoDenegado = await capture("/api/v1/comercio/products", { token: tLimitado, method: "POST", body: {
    name: `Inyectado ${RUN_ID}`, unit: "unidad", price: 1, cost: 1
  } });
  check("el_rol_sin_el_permiso_especial_no_puede_dar_alta_a_productos", productoDenegado.status === 403 && codeOf(productoDenegado.payload) === "PERMISO_DENEGADO", {
    status: productoDenegado.status, code: codeOf(productoDenegado.payload)
  });
  const trasNegativa = await supabase(`/rest/v1/comercio_settings?select=preferences_json&tenant_id=eq.${NYVORA_TENANT}`);
  check("la_negativa_de_permiso_no_persistio_nada", !JSON.stringify(trasNegativa.payload?.[0]?.preferences_json || {}).includes("ff0000"), {
    preferences: JSON.stringify(trasNegativa.payload?.[0]?.preferences_json || {}).slice(0, 120)
  });

  // --- 7. Documentos reales de la empresa modelo ----------------------------------------------
  const producto = await capture("/api/v1/comercio/products", { token: tAutorizado, method: "POST", body: {
    name: `Cafe Nyvora Certificacion ${RUN_ID}`, category: "Despensa", unit: "unidad", price: 12000, cost: 7000,
    stock: 20, min_stock: 5, catalog_featured: true, notes: "Dato sintetico de certificacion de empresa modelo"
  } });
  check("la_empresa_modelo_alta_un_producto", producto.status === 201 && /^P-\d{4}$/.test(String(producto.payload?.code || "")) && producto.payload?.stock === 20, {
    status: producto.status, code: producto.payload?.code, stock: producto.payload?.stock
  });
  const productoId = producto.payload?.id;
  if (productoId) result.fixtures.nyvora_rows.push({ table: "comercio_products", id: productoId });
  const reabierto = await capture(`/api/v1/comercio/products/${productoId}`, { token: tAutorizado });
  check("el_producto_se_reabre_con_los_mismos_datos", reabierto.status === 200 && reabierto.payload?.name === producto.payload?.name && reabierto.payload?.price === 12000, {
    status: reabierto.status, precio: reabierto.payload?.price
  });
  const editado = await capture(`/api/v1/comercio/products/${productoId}`, { token: tAutorizado, method: "PUT", body: { price: 13500 } });
  const trasEditar = await capture(`/api/v1/comercio/products/${productoId}`, { token: tAutorizado });
  check("la_edicion_del_producto_persiste", editado.status === 200 && trasEditar.payload?.price === 13500, {
    status: editado.status, price: trasEditar.payload?.price
  });
  const foto = await uploadImage(`/api/v1/comercio/products/${productoId}/photo`, tAutorizado, buildPng(600, 600, [29, 78, 216]), "image/png", "foto-cert.png");
  check("la_foto_del_producto_sube_al_bucket_real", foto.status === 201 && /^https?:\/\//.test(String(foto.payload?.photo_url || "")), {
    status: foto.status, code: codeOf(foto.payload)
  });
  const ficha = await capture(`/api/v1/comercio/products/${productoId}`, { token: tAutorizado });
  const rutaFoto = objectPathFromPublicUrl(ficha.payload?.photo_url);
  if (rutaFoto) result.storage.objects_created.push(rutaFoto);
  check("la_ficha_expone_la_url_publica_del_bucket", ficha.status === 200 && ficha.payload?.has_photo === true && String(ficha.payload?.photo_url || "").includes(`/storage/v1/object/public/${BUCKET}/`), {
    has_photo: ficha.payload?.has_photo, url: String(ficha.payload?.photo_url || "").slice(0, 120)
  });
  const lecturaFoto = await fetch(String(ficha.payload?.photo_url || "about:blank"), { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) }).catch(() => null);
  check("la_foto_se_lee_sin_credenciales", lecturaFoto?.status === 200, { status: lecturaFoto?.status ?? null });

  const banner = await uploadImage("/api/v1/comercio/settings/storefront/banner", tAutorizado, buildPng(1200, 400, [29, 78, 216]), "image/png", "banner-cert.png");
  check("el_banner_de_nyvora_se_sube_y_devuelve_url_publica", banner.status === 201 && String(banner.payload?.theme?.banner_url || "").includes(`/storage/v1/object/public/${BUCKET}/`), {
    status: banner.status, code: codeOf(banner.payload)
  });
  const rutaBanner = objectPathFromPublicUrl(banner.payload?.theme?.banner_url);
  if (rutaBanner) result.storage.objects_created.push(rutaBanner);
  const publicoConBanner = await capture(`/api/v1/public/comercio/catalog/${codigoVitrina}`);
  check("el_banner_de_nyvora_se_ve_en_la_vitrina_publica", publicoConBanner.payload?.theme?.banner_url === banner.payload?.theme?.banner_url, {
    expuesto: String(publicoConBanner.payload?.theme?.banner_url || "").slice(0, 120)
  });
  const bannerFalso = await uploadImage("/api/v1/comercio/settings/storefront/banner", tAutorizado, Buffer.from("<svg onload=alert(1)>"), "image/png", "banner-falso.png");
  check("rechaza_un_banner_que_no_es_imagen", bannerFalso.status === 415, { status: bannerFalso.status, code: codeOf(bannerFalso.payload) });

  // --- 8. Venta, mostrador y anuracion con reversa --------------------------------------------
  const cliente = await capture("/api/v1/comercio/customers", { token: tAutorizado, method: "POST", body: {
    name: `Cliente Nyvora Certificacion ${RUN_ID}`, document: `CC-${RUN_ID}`, phone: "3001234567", active: true
  } });
  check("la_empresa_modelo_alta_un_cliente", cliente.status === 201 && /^C-\d{4}$/.test(String(cliente.payload?.code || "")), { status: cliente.status, code: cliente.payload?.code });
  const clienteId = cliente.payload?.id;
  if (clienteId) result.fixtures.nyvora_rows.push({ table: "comercio_customers", id: clienteId });

  const vitrinaConProducto = await capture(`/api/v1/public/comercio/catalog/${codigoVitrina}`);
  const articulo = (vitrinaConProducto.payload?.items || []).find((item) => item.code === producto.payload?.code) || {};
  check("la_vitrina_publica_muestra_el_producto_con_su_precio", articulo.price === 13500 && articulo.base_price === 13500, {
    price: articulo.price, base_price: articulo.base_price
  });
  check("la_vitrina_publica_no_revela_el_costo", !/"cost"/.test(JSON.stringify(articulo)), { claves: Object.keys(articulo) });

  const venta = await capture("/api/v1/comercio/sales", { token: tAutorizado, method: "POST", body: {
    items: [{ product_id: productoId, quantity: 2 }], payment_type: "cash", method: "Efectivo", note: `Venta de certificacion ${RUN_ID}`
  } });
  check("la_empresa_modelo_registra_una_venta", venta.status === 201 && venta.payload?.total === 27000 && /^V-\d{6}$/.test(String(venta.payload?.full_number || "")), {
    status: venta.status, total: venta.payload?.total, numero: venta.payload?.full_number, code: codeOf(venta.payload)
  });
  const ventaId = venta.payload?.id;
  if (ventaId) result.fixtures.nyvora_rows.push({ table: "comercio_sales", id: ventaId });
  const stockTrasVenta = await capture(`/api/v1/comercio/products/${productoId}`, { token: tAutorizado });
  check("la_venta_descuenta_el_inventario", stockTrasVenta.payload?.stock === 18, { stock: stockTrasVenta.payload?.stock });

  const dashboard = await capture("/api/v1/comercio/dashboard", { token: tAutorizado });
  check("el_dashboard_de_nyvora_cuenta_su_propia_venta", dashboard.status === 200 && JSON.stringify(dashboard.payload?.recent_sales || []).includes(String(venta.payload?.full_number)), {
    status: dashboard.status, ventas_recientes: (dashboard.payload?.recent_sales || []).length
  });

  const anularSinAprobar = await capture(`/api/v1/comercio/sales/${ventaId}/void`, { token: tLimitado, method: "POST", body: { reason: "no deberia poder" } });
  check("el_rol_sin_aprobacion_no_puede_anular", anularSinAprobar.status === 403 && codeOf(anularSinAprobar.payload) === "PERMISO_DENEGADO", {
    status: anularSinAprobar.status, code: codeOf(anularSinAprobar.payload)
  });
  const anulado = await capture(`/api/v1/comercio/sales/${ventaId}/void`, { token: tAutorizado, method: "POST", body: { reason: `Anulacion de certificacion ${RUN_ID}` } });
  check("el_rol_autorizado_anula_la_venta", [200, 201].includes(anulado.status) && anulado.payload?.status === "voided", {
    status: anulado.status, estado: anulado.payload?.status, code: codeOf(anulado.payload)
  });
  const stockTrasAnular = await capture(`/api/v1/comercio/products/${productoId}`, { token: tAutorizado });
  check("la_anulacion_reversa_el_inventario", stockTrasAnular.payload?.stock === 20, { stock: stockTrasAnular.payload?.stock });

  // --- 9. Usuario de OTRO tenant ---------------------------------------------------------------
  const ajenoProducto = await capture(`/api/v1/comercio/products/${productoId}`, { token: tAjeno });
  check("otro_tenant_no_ve_el_producto_de_nyvora", ajenoProducto.status === 404 && codeOf(ajenoProducto.payload) === "PRODUCT_NOT_FOUND", {
    status: ajenoProducto.status, code: codeOf(ajenoProducto.payload)
  });
  const ajenoVenta = await capture(`/api/v1/comercio/sales/${ventaId}`, { token: tAjeno });
  check("otro_tenant_no_ve_la_venta_de_nyvora", ajenoVenta.status === 404 && codeOf(ajenoVenta.payload) === "SALE_NOT_FOUND", {
    status: ajenoVenta.status, code: codeOf(ajenoVenta.payload)
  });
  const listaAjena = await capture("/api/v1/comercio/products?limit=100", { token: tAjeno });
  const filasAjenas = listaAjena.payload?.items || listaAjena.payload?.rows || [];
  check("el_listado_del_otro_tenant_no_contiene_filas_de_nyvora", listaAjena.status === 200 && !JSON.stringify(filasAjenas).includes(String(producto.payload?.code)), {
    status: listaAjena.status, filas: filasAjenas.length
  });
  const settingsAjenos = await capture("/api/v1/comercio/settings", { token: tAjeno });
  check("el_otro_tenant_tiene_su_propia_configuracion", settingsAjenos.status === 200 && settingsAjenos.payload?.catalog_code !== codigoVitrina, {
    ajeno: settingsAjenos.payload?.catalog_code ? "con_codigo" : "sin_codigo", nyvora: codigoVitrina.slice(0, 8)
  });

  // --- 10. Empresa SIN la licencia M-30 --------------------------------------------------------
  const settingsSinLicencia = await capture("/api/v1/comercio/settings", { token: tSinLicencia });
  check("la_empresa_sin_licencia_no_lee", settingsSinLicencia.status === 403 && codeOf(settingsSinLicencia.payload) === "MODULO_NO_HABILITADO", {
    status: settingsSinLicencia.status, code: codeOf(settingsSinLicencia.payload)
  });
  const sinLicenciaFila = await supabase(`/rest/v1/comercio_settings?select=id&tenant_id=eq.${sinLicencia.id}`);
  check("la_empresa_sin_licencia_ni_siquiera_tiene_fila_de_configuracion", (sinLicenciaFila.payload || []).length === 0, {
    filas: (sinLicenciaFila.payload || []).length
  });
  const productoSinLicencia = await capture("/api/v1/comercio/products", { token: tSinLicencia, method: "POST", body: {
    name: `Inyectado SINLIC ${RUN_ID}`, unit: "unidad", price: 1, cost: 1
  } });
  check("la_empresa_sin_licencia_no_escribe", productoSinLicencia.status === 403 && codeOf(productoSinLicencia.payload) === "MODULO_NO_HABILITADO", {
    status: productoSinLicencia.status, code: codeOf(productoSinLicencia.payload)
  });

  // --- 11. Limpieza ----------------------------------------------------------------------------
  await limpiar();

  const sobrantesNyvora = [];
  for (const table of COMERCIO_TABLES) {
    const rows = await tableRows(table, NYVORA_TENANT);
    if ((rows || []).length !== result.baseline_nyvora[table]) sobrantesNyvora.push(`${table}=${rows === null ? "error" : rows.length}`);
  }
  note("nyvora_vuelve_a_su_linea_base_de_documents", sobrantesNyvora.length === 0, { sobrantes: sobrantesNyvora });

  const objetosVivos = [];
  for (const ruta of result.storage.objects_created) {
    if (await originObjectStatus(ruta) === 200) objetosVivos.push(ruta);
  }
  result.storage.objects_left = objetosVivos.length;
  note("ningun_objeto_de_la_corrida_sigue_en_el_origen_del_bucket", objetosVivos.length === 0, { quedaron: objetosVivos });

  const residuoUsuarios = await supabase(`/rest/v1/User?select=id&name=like.Certificacion Comercio*${RUN_ID}*`);
  note("ningun_usuario_efimero_sobrevive", (residuoUsuarios.payload || []).length === 0, { quedaron: (residuoUsuarios.payload || []).length });
  const residuoRoles = await supabase(`/rest/v1/Role?select=id&description=eq.certificacion-nyvora-${RUN_ID}`);
  note("ningun_rol_efimero_sobrevive", (residuoRoles.payload || []).length === 0, { quedaron: (residuoRoles.payload || []).length });
  const residuoTenants = await supabase(`/rest/v1/Tenant?select=id&name=like.Certificacion Comercio*${RUN_ID}*`);
  note("ninguna_empresa_efimera_sobrevive", (residuoTenants.payload || []).length === 0, { quedaron: (residuoTenants.payload || []).length });

  const conteo = statuses.reduce((acc, s) => { acc[s] = (acc[s] || 0) + 1; return acc; }, {});
  result.summary = {
    total_checks: result.checks.length,
    fallidos: result.checks.filter((c) => c.ok === false).map((c) => c.name),
    codigos_http: conteo,
    sin_5xx: !Object.keys(conteo).some((s) => Number(s) >= 500)
  };
  result.status = result.summary.fallidos.length === 0 && result.summary.sin_5xx ? "passed" : "failed";
}

// Borrado por id exacto: la empresa modelo puede tener otros documentos en paralelo y un
// DELETE por tenant_id los destruiria. Primero los hijos, despues los padres.
async function limpiar() {
  const ventaId = (result.fixtures.nyvora_rows.find((r) => r.table === "comercio_sales") || {}).id;
  const productoId = (result.fixtures.nyvora_rows.find((r) => r.table === "comercio_products") || {}).id;
  if (ventaId) {
    await supabase(`/rest/v1/comercio_sale_items?sale_id=eq.${ventaId}`, { method: "DELETE" }).catch(() => null);
    await supabase(`/rest/v1/comercio_credits?sale_id=eq.${ventaId}`, { method: "DELETE" }).catch(() => null);
  }
  if (productoId) {
    await supabase(`/rest/v1/comercio_stock_movements?product_id=eq.${productoId}`, { method: "DELETE" }).catch(() => null);
    await supabase(`/rest/v1/comercio_promotion_products?product_id=eq.${productoId}`, { method: "DELETE" }).catch(() => null);
  }
  for (const ruta of result.storage.objects_created) await storageDeleteObject(ruta).catch(() => 0);
  for (const row of [...result.fixtures.nyvora_rows].reverse()) {
    await supabase(`/rest/v1/${row.table}?id=eq.${row.id}`, { method: "DELETE" }).catch(() => null);
  }
  for (const userId of result.fixtures.users) {
    await supabase(`/rest/v1/AuthorizationSession?select=id&user_id=eq.${userId}`, { method: "DELETE" }).catch(() => null);
    await supabase(`/rest/v1/User?id=eq.${userId}`, { method: "DELETE" }).catch(() => null);
  }
  for (const permissionId of result.fixtures.permissions) {
    await supabase(`/rest/v1/Permission?id=eq.${permissionId}`, { method: "DELETE" }).catch(() => null);
  }
  for (const roleId of result.fixtures.roles) {
    await supabase(`/rest/v1/Permission?role_id=eq.${roleId}`, { method: "DELETE" }).catch(() => null);
    await supabase(`/rest/v1/Role?id=eq.${roleId}`, { method: "DELETE" }).catch(() => null);
  }
  for (const tenantId of result.fixtures.ephemeral_tenants) {
    for (const table of COMERCIO_TABLES) {
      await supabase(`/rest/v1/${table}?tenant_id=eq.${encodeURIComponent(tenantId)}`, { method: "DELETE" }).catch(() => null);
    }
    await supabase(`/rest/v1/User?tenant_id=eq.${tenantId}`, { method: "DELETE" }).catch(() => null);
    await supabase(`/rest/v1/Role?tenant_id=eq.${tenantId}`, { method: "DELETE" }).catch(() => null);
    await supabase(`/rest/v1/Tenant?id=eq.${tenantId}`, { method: "DELETE" }).catch(() => null);
  }
}

async function finish(error) {
  if (error) {
    result.status = "failed";
    result.error = String(error.message || error).slice(0, 400);
  }
  // La limpieza se intenta siempre, incluso con la corrida abortada: dejar usuarios o
  // documentos en la empresa modelo contamina la siguiente corrida y el ambiente compartido.
  await limpiar().catch(() => null);
  if (error) {
    result.summary = {
      total_checks: result.checks.length,
      fallidos: result.checks.filter((c) => c.ok === false).map((c) => c.name),
      codigos_http: statuses.reduce((a, s) => { a[s] = (a[s] || 0) + 1; return a; }, {})
    };
  }
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  console.log(`CERTIFICATION_${String(result.status).toUpperCase()} checks=${result.checks.length} fallidos=${JSON.stringify((result.summary || {}).fallidos || [])}`);
  console.log(`evidencia=${path.relative(ROOT, OUTPUT).replace(/\\/g, "/")}`);
  process.exit(result.status === "passed" ? 0 : 1);
}

main().then(() => finish(), (error) => finish(error));
