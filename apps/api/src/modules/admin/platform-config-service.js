// Configuracion tecnica de la plataforma, administrada desde Administracion APEX.
// Vive en su propia tabla (y no en Tenant.config) porque el valor se necesita ANTES de resolver
// empresa: la pantalla de acceso es publica y previa al login. Cada despliegue tiene su base, asi
// que la fila vale para el ambiente que la guarda. La allowlist de claves es la que evita que esta
// tabla se convierta en un almacen generico donde cualquiera cuele preferencias sin contrato.
const prisma = require("../../core/prisma");

const MOBILE_APP_URL_KEY = "mobile_app.url";
const FALLBACK_MOBILE_APP_URL = "https://appapexos-production.up.railway.app";
const WRITABLE_KEYS = new Set([MOBILE_APP_URL_KEY]);
const READ_CACHE_MS = 20000;

let readCache = { at: 0, url: null, source: null };

function appError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function environmentLabel() {
  const declared = [process.env.EXPECTED_ENVIRONMENT, process.env.APP_ENV, process.env.TARGET_ENV]
    .map((value) => String(value || "").trim().toLowerCase())
    .find(Boolean);
  if (declared === "production" || declared === "prod" || declared === "produccion") return "produccion";
  if (declared === "qa") return "qa";
  if (declared) return declared;
  return String(process.env.NODE_ENV || "").toLowerCase() === "test" ? "pruebas" : "local";
}

// Estricta: es la que usa la escritura administrada. Un https sin host real, con credenciales o con
// fragmento no es una app instalable, y guardarlo convertiria el boton del acceso en un enlace roto.
// El unico http admitido es el de bucle invertido: sirve para probar la app en el propio puesto y no
// puede alcanzarse desde el boton de un usuario real.
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

function normalizeMobileAppUrl(raw) {
  const candidate = String(raw ?? "").trim().replace(/\/+$/, "");
  if (!candidate) throw appError(400, "URL_APP_MOVIL_VACIA", "Escribe la direccion completa de la app movil.");
  let parsed;
  try {
    parsed = new URL(candidate);
  } catch {
    throw appError(400, "URL_APP_MOVIL_INVALIDA", "La direccion debe escribirse completa, por ejemplo https://app.midominio.co");
  }
  const loopback = LOOPBACK_HOSTS.has(parsed.hostname);
  if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && loopback)) {
    throw appError(400, "URL_APP_MOVIL_NO_HTTPS", "La direccion de la app debe usar https: un http queda rechazado por el acceso, salvo localhost del propio puesto.");
  }
  if (!parsed.hostname) throw appError(400, "URL_APP_MOVIL_INVALIDA", "La direccion no tiene dominio.");
  if (!loopback && !parsed.hostname.includes(".")) {
    throw appError(400, "URL_APP_MOVIL_SIN_DOMINIO", "El dominio de la app debe ser un nombre completo (con punto).");
  }
  if (parsed.username || parsed.password) {
    throw appError(400, "URL_APP_MOVIL_CON_CREDENCIALES", "La direccion no puede llevar usuario ni clave.");
  }
  if (parsed.hash) throw appError(400, "URL_APP_MOVIL_CON_FRAGMENTO", "La direccion no puede llevar # en la cola.");
  if (candidate.length > 300) throw appError(400, "URL_APP_MOVIL_TROP_LARGA", "La direccion es demasiado larga.");
  return candidate;
}

// Tolerante: es la que usa la lectura. Un valor guardado torcido (o una base sin la tabla todavia)
// no puede dejar el acceso sin boton: se devuelve el destino quemado y ya esta.
function pickUsableUrl(stored) {
  try {
    return normalizeMobileAppUrl(stored);
  } catch {
    return null;
  }
}

async function readStoredUrl() {
  const row = await prisma.platformSetting.findUnique({ where: { key: MOBILE_APP_URL_KEY } });
  const value = row && row.value && typeof row.value === "object" && !Array.isArray(row.value) ? row.value.url : null;
  return { row, stored: pickUsableUrl(value) };
}

function cachedNow() {
  return readCache.url && Date.now() - readCache.at < READ_CACHE_MS ? readCache : null;
}

// Lectura publica (sin sesion): solo la URL, nada de quien la cambió ni del ambiente.
async function getPublicMobileApp() {
  const cached = cachedNow();
  if (cached) return { url: cached.url };
  try {
    const { stored } = await readStoredUrl();
    const resolved = stored || FALLBACK_MOBILE_APP_URL;
    readCache = { at: Date.now(), url: resolved, source: stored ? "base" : "respaldo" };
    return { url: resolved };
  } catch {
    // Base inaccesible: el acceso sigue ofreciendo el destino conocido en vez de fallar.
    return { url: FALLBACK_MOBILE_APP_URL };
  }
}

async function getMobileAppConfig() {
  // La lectura de administracion NO usa la cache: quien administra tiene que ver el valor de este
  // ambiente con su fecha y su autor. Mostrar un valor de hace 20 segundos (o "sin cambios" porque
  // la cache no guarda la fila) es exactamente el tipo de mentira que hace tocar el ambiente equivocado.
  let read;
  try {
    read = await readStoredUrl();
  } catch (error) {
    if (error && (error.code === "P2021" || /platform_settings/.test(String(error.message)))) {
      throw appError(503, "CONFIGURACION_PLATAFORMA_NO_INSTALADA", "La tabla platform_settings no existe en este ambiente: hay que aplicar la migracion 20261125183000_platform_settings antes de administrar el enlace.");
    }
    throw error;
  }
  const url = read.stored || FALLBACK_MOBILE_APP_URL;
  const source = read.stored ? "base" : "respaldo";
  readCache = { at: Date.now(), url, source };
  return {
    url,
    source,
    environment: environmentLabel(),
    fallback_url: FALLBACK_MOBILE_APP_URL,
    updated_at: read.row ? read.row.updated_at : null,
    updated_by: read.row ? read.row.updated_by : null,
    cache_ms: READ_CACHE_MS
  };
}

// El enlace lo sigue leyendo cualquier administrador del ambiente, pero solo lo escribe el
// superadministrador de APEXOS: es un valor que se le muestra a TODO el mundo antes de entrar, y un
// administrador de empresa que lo cambiara estaria redirigiendo el acceso de otros tenants a un
// destino propio. El rol grueso (admin_empresa / admin:write) no alcanza.
function requirePlatformAdmin(user) {
  const role = user?.role;
  const name = String(role?.name || "").trim().toUpperCase();
  const roleType = String(role?.metadata?.role_type || "").trim().toLowerCase();
  if (name === "APEX_ADMIN" || roleType === "superadmin") return;
  throw appError(403, "PLATAFORMA_SOLO_SUPERADMIN", "El enlace de la app se administra solo desde un superadministrador de APEXOS: es publico y afecta a todas las empresas de este ambiente.");
}

// El token NO lleva el correo: server.js arma request.user desde las claims (id, tenant_id, role),
// y validateAuthorization solo le agrega el rol y las versiones. Sin esta lectura la pantalla mostraria
// "Quien lo cambio: 12", un numero que nadie reconoce cuando hay que llamar a esa persona. Guardar el
// enlace es un evento raro y de un solo actor: el viaje extra a la base cuesta menos que una autoria
// inservible. Si la fila no esta (cuenta retirada) se escribe el id y la auditoria sigue mandando.
async function actorLabel(user) {
  const directo = String(user?.email || "").trim();
  if (directo) return directo;
  const nombre = String(user?.name || "").trim();
  const id = Number(user?.id);
  if (Number.isInteger(id)) {
    try {
      const fila = await prisma.user.findUnique({ where: { id }, select: { email: true, name: true } });
      const correo = String(fila?.email || "").trim();
      if (correo) return correo;
      if (nombre) return nombre;
    } catch {
      // Autoria no es motivo para perder un guardado valido: se conserva lo unico que se tiene.
    }
  }
  return nombre || (Number.isInteger(id) ? String(id) : null);
}

async function saveMobileAppConfig(tenantId, user, input = {}) {
  requirePlatformAdmin(user);
  const url = normalizeMobileAppUrl(input.url);
  const actorId = user?.id ?? null;
  // En la columna de autoria viaja el correo, no el id: quien abre la pantalla tiene que reconocer
  // a la persona. El AuditLog si guarda el id numerico, que es lo que exige su esquema.
  const actorLabelValue = await actorLabel(user);
  const previous = await readStoredUrl();
  const data = { value: { url }, updated_by: actorLabelValue };
  const row = await prisma.platformSetting.upsert({
    where: { key: MOBILE_APP_URL_KEY },
    create: { key: MOBILE_APP_URL_KEY, ...data },
    update: data
  });
  // El AuditLog exige tenant: se escribe en el de quien administra, que es el unico contexto
  // disponible y es lo que hace atribuible el cambio. El valor en si es de plataforma.
  await prisma.auditLog.create({
    data: {
      tenant_id: String(tenantId || "plataforma"),
      user_id: Number.isInteger(Number(actorId)) ? Number(actorId) : null,
      action: "platform.mobile_app.url.updated",
      module: "admin",
      entity: "PlatformSetting",
      entity_id: MOBILE_APP_URL_KEY,
      old_value: { url: previous.stored || FALLBACK_MOBILE_APP_URL, source: previous.stored ? "base" : "respaldo" },
      new_value: { url }
    }
  });
  readCache = { at: 0, url: null, source: null };
  return {
    ok: true,
    url,
    environment: environmentLabel(),
    updated_at: row.updated_at,
    restaurada: url === FALLBACK_MOBILE_APP_URL
  };
}

module.exports = {
  MOBILE_APP_URL_KEY,
  FALLBACK_MOBILE_APP_URL,
  normalizeMobileAppUrl,
  pickUsableUrl,
  environmentLabel,
  getPublicMobileApp,
  getMobileAppConfig,
  saveMobileAppConfig,
  // La cache es el unico estado del modulo: sin este boton de reinicio, dos pruebas seguidas se
  // leen entre si y una URL vieja sale verde donde deberia fallar.
  __resetCache() {
    readCache = { at: 0, url: null, source: null };
  }
};
