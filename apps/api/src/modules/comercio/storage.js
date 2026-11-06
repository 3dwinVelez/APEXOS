// Comercio - almacenamiento de fotografias y banners en el almacén de objetos.
// El archivo nunca toca disco y la URL publica la produce el servidor. Dos conductores,
// elegidos de forma EXPLICITA (leccion de transport/tms-evidence-storage.js: en desarrollo
// no hay caida implicita de un almacen a otro):
//   · supabase (default, es el que usa la nube) -> REST crudo con clave de servicio.
//   · minio  (COMERCIO_STORAGE_DRIVER=minio)    -> el MinIO del compose local, que es el
//     unico almacen que existe cuando todavia no se levanto el stack local de Supabase.
// Bucket dedicado "comercio-assets": el modulo Comercio no comparte contenedores con
// adjuntos de otros modulos.
const crypto = require("node:crypto");
const { detectFileMime } = require("../../security/fileSignature");
const { dimensions } = require("../services/evidenceUploads");

const BUCKET = "comercio-assets";
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_DIMENSION = 4096;
const SIGNED_URL_TTL_SECONDS = 600;
// Un almacen colgado no puede dejar la peticion del usuario esperando indefinidamente.
const STORAGE_TIMEOUT_MS = 15000;
const DRIVERS = ["supabase", "minio"];
const LOCAL_HOSTS = ["localhost", "127.0.0.1", "::1"];
// Solo imagenes: la foto de producto no es un documento.
const ALLOWED_MIME = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp"
};

function supabaseConfig() {
  const url = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw storageUnconfigured("Supabase Storage (SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY)");
  }
  return { url, key };
}

function storageUnconfigured(what) {
  return Object.assign(new Error(`Almacenamiento de imagenes de Comercio no configurado: faltan ${what}.`), { statusCode: 503, code: "ALMACENAMIENTO_NO_CONFIGURADO" });
}

// Un host de base de datos local es la unica senal de que estamos en el puesto de
// desarrollo: MinIO puede crear su bucket y abrir la lectura anonima el solo. Contra un
// MinIO externo el bucket y su politica los pone el operador, y si faltan se dice.
function isLocalEndpoint(host) {
  return LOCAL_HOSTS.includes(String(host || "").replace(/^\[|\]$/g, ""));
}

function minioConfig() {
  const endPoint = String(process.env.MINIO_ENDPOINT || "").trim();
  const accessKey = process.env.MINIO_ACCESS_KEY;
  const secretKey = process.env.MINIO_SECRET_KEY;
  if (!endPoint || !accessKey || !secretKey) {
    throw storageUnconfigured("MINIO_ENDPOINT, MINIO_ACCESS_KEY y MINIO_SECRET_KEY");
  }
  const port = Number(process.env.MINIO_PORT || 9000);
  const useSSL = String(process.env.MINIO_USE_SSL || "false").toLowerCase() === "true";
  const publicBase = String(process.env.COMERCIO_STORAGE_PUBLIC_URL || `${useSSL ? "https" : "http"}://${endPoint}:${port}`).replace(/\/+$/, "");
  return { endPoint, port, accessKey, secretKey, useSSL, publicBase, local: isLocalEndpoint(endPoint) };
}

function storageDriver() {
  const explicit = String(process.env.COMERCIO_STORAGE_DRIVER || "").trim().toLowerCase();
  if (!explicit) return "supabase";
  if (!DRIVERS.includes(explicit)) {
    throw Object.assign(new Error(`COMERCIO_STORAGE_DRIVER="${explicit}" no existe. Valores admitidos: ${DRIVERS.join(" o ")}.`), { statusCode: 503, code: "ALMACENAMIENTO_DRIVER_INVALIDO" });
  }
  return explicit;
}

let minioClientCache = null;
function minioClient() {
  const config = minioConfig();
  if (!minioClientCache) {
    const Minio = require("minio");
    minioClientCache = new Minio.Client({
      endPoint: config.endPoint,
      port: config.port,
      useSSL: config.useSSL,
      accessKey: config.accessKey,
      secretKey: config.secretKey
    });
  }
  return minioClientCache;
}

function storageError(cause) {
  const code = String(cause?.code || "");
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") {
    return Object.assign(new Error("El almacén de imágenes no se resuelve desde este ambiente (DNS). Revisa la URL del almacén."), { statusCode: 502, code: "ALMACEN_NO_RESPONDE", cause });
  }
  if (code === "ECONNREFUSED" || code === "ECONNRESET" || code === "EPIPE") {
    return Object.assign(new Error("El almacén de imágenes no responde: está apagado o la URL apunta a otro lado. Sube el almacén local o corrige su configuración."), { statusCode: 502, code: "ALMACEN_NO_RESPONDE", cause });
  }
  if (code === "ETIMEDOUT" || cause?.name === "AbortError" || cause?.name === "TimeoutError") {
    return Object.assign(new Error(`El almacén de imágenes tardó más de ${Math.round(STORAGE_TIMEOUT_MS / 1000)}s en responder.`), { statusCode: 502, code: "ALMACEN_NO_RESPONDE", cause });
  }
  // Buckets inexistentes y credenciales malas llegan como errores del cliente S3/HTTP:
  // el usuario no puede arreglarlos, pero el operador necesita leer cual fue.
  return Object.assign(new Error(`El almacén de imágenes rechazó la operación: ${String(cause?.message || cause).slice(0, 180)}`), { statusCode: 502, code: "ALMACEN_NO_RESPONDE", cause });
}

// Acota el tiempo que el usuario espera; si el almacén cuelga, la peticion responde.
function withTimeout(promise, label) {
  let timer;
  const guard = new Promise((resolve, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error(`${label} excedio ${STORAGE_TIMEOUT_MS}ms`), { code: "ETIMEDOUT" })), STORAGE_TIMEOUT_MS);
  });
  const work = typeof promise?.then === "function" ? promise : Promise.resolve(promise);
  // El trabajo huérfano no debe quedar como rejection sin manejar cuando gana el reloj.
  work.catch(() => {});
  return Promise.race([work, guard]).finally(() => clearTimeout(timer));
}

function serviceHeaders(contentType) {
  const { key } = supabaseConfig();
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    ...(contentType ? { "Content-Type": contentType } : {})
  };
}

function sanitizeSegment(value) {
  return String(value || "").trim().replace(/[^a-zA-Z0-9_-]/g, "");
}

function objectKey({ tenantId, productId, extension }) {
  const tenant = sanitizeSegment(tenantId);
  const product = sanitizeSegment(productId);
  if (!tenant || !product) {
    throw Object.assign(new Error("Identificador de empresa o producto invalido."), { statusCode: 400 });
  }
  const ext = Object.values(ALLOWED_MIME).includes(extension) ? extension : "bin";
  return `${tenant}/comercio/products/${product}/${crypto.randomUUID()}.${ext}`;
}

// Banner de la vitrina publica: un objeto por tenant dentro de su propia carpeta.
// La fecha en la clave deja historial legible si un dia se guardaran varios.
function storefrontObjectKey({ tenantId, extension }) {
  const tenant = sanitizeSegment(tenantId);
  if (!tenant) throw Object.assign(new Error("Identificador de empresa invalido."), { statusCode: 400 });
  const ext = Object.values(ALLOWED_MIME).includes(extension) ? extension : "bin";
  return `${tenant}/comercio/storefront/banner-${Date.now()}-${crypto.randomUUID()}.${ext}`;
}

function validateProductImage(bytes, declaredMime) {
  if (!bytes?.length) throw Object.assign(new Error("El archivo esta vacio."), { statusCode: 400 });
  if (bytes.length > MAX_BYTES) throw Object.assign(new Error("La foto supera el limite de 5 MB."), { statusCode: 413 });
  const mime = detectFileMime(bytes);
  if (!mime || !ALLOWED_MIME[mime]) {
    throw Object.assign(new Error("Formato no permitido. Usa una imagen PNG, JPEG o WEBP."), { statusCode: 415 });
  }
  const declared = String(declaredMime || "").toLowerCase().split(";")[0].trim();
  if (declared && declared !== "application/octet-stream" && declared !== mime) {
    throw Object.assign(new Error("El contenido del archivo no coincide con el tipo declarado."), { statusCode: 415 });
  }
  const size = dimensions(bytes, mime);
  if (!size || size.width < 1 || size.height < 1) {
    throw Object.assign(new Error("La imagen esta truncada o no es decodificable."), { statusCode: 415 });
  }
  if (size.width > MAX_DIMENSION || size.height > MAX_DIMENSION) {
    throw Object.assign(new Error("Las dimensiones de la imagen exceden el limite permitido."), { statusCode: 413 });
  }
  return {
    mime,
    extension: ALLOWED_MIME[mime],
    checksum_sha256: crypto.createHash("sha256").update(bytes).digest("hex")
  };
}

async function storageRequest(path, options = {}) {
  const { url } = supabaseConfig();
  const contentType = options.contentType || (options.body === undefined ? undefined : "application/json");
  let response;
  try {
    response = await fetch(`${url}/storage/v1${path}`, {
      ...options,
      headers: { ...serviceHeaders(contentType), ...(options.headers || {}) },
      signal: AbortSignal.timeout(STORAGE_TIMEOUT_MS)
    });
  } catch (cause) {
    // Sin este manejo, un ECONNREFUSED del almacen llegaba al handler global como
    // TypeError sin statusCode y el usuario veia "Error interno" (500) sin causa.
    throw storageError(cause);
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw Object.assign(new Error(`Storage rechazo la operacion (${response.status}). ${detail.slice(0, 160)}`), { statusCode: 502, code: "ALMACEN_RECHAZO" });
  }
  return response;
}

// El bucket de la vitrina se sirve con lectura anonima: la pagina publica del cliente
// no puede depender de una URL firmada que caduca a los 10 minutos.
const PUBLIC_READ_POLICY = JSON.stringify({
  Version: "2012-10-17",
  Statement: [{ Effect: "Allow", Principal: { AWS: ["*"] }, Action: ["s3:GetObject"], Resource: [`arn:aws:s3:::${BUCKET}/*`] }]
});

let minioBucketReady = false;
async function ensureMinioBucket() {
  if (minioBucketReady) return;
  const config = minioConfig();
  const client = minioClient();
  const exists = await withTimeout(client.bucketExists(BUCKET), "MinIO bucketExists").catch((cause) => { throw storageError(cause); });
  if (exists) {
    minioBucketReady = true;
    return;
  }
  if (!config.local) {
    throw Object.assign(new Error(`El bucket "${BUCKET}" no existe en el almacén. Créalo con lectura pública antes de subir banners.`), { statusCode: 503, code: "ALMACEN_BUCKET_FALTA" });
  }
  // Solo en el MinIO del puesto de desarrollo: el bucket nace con la lectura anonima que
  // exige la vitrina publica, para que el primer banner no quede con imagen rota.
  try {
    await withTimeout(client.makeBucket(BUCKET, ""), "MinIO makeBucket");
    await withTimeout(client.setBucketPolicy(BUCKET, PUBLIC_READ_POLICY), "MinIO setBucketPolicy");
  } catch (cause) {
    throw storageError(cause);
  }
  minioBucketReady = true;
}

function minioObjectPath(storagePath) {
  return String(storagePath || "").slice(BUCKET.length + 1);
}

async function uploadProductPhoto({ objectPath, bytes, contentType }) {
  if (storageDriver() === "minio") {
    await ensureMinioBucket();
    try {
      await withTimeout(minioClient().putObject(BUCKET, objectPath, bytes, bytes.length, { "Content-Type": contentType }), `MinIO put ${objectPath}`);
    } catch (cause) {
      throw storageError(cause);
    }
    return `${BUCKET}/${objectPath}`;
  }
  await storageRequest(`/object/${BUCKET}/${objectPath}`, {
    method: "POST",
    headers: { "x-upsert": "false" },
    contentType,
    body: bytes
  });
  return `${BUCKET}/${objectPath}`;
}

async function removeProductPhoto(storagePath) {
  const path = String(storagePath || "");
  if (!path.startsWith(`${BUCKET}/`)) return false;
  const objectPath = minioObjectPath(path);
  // Best effort: si el objeto ya no existe, la desactivacion del producto no debe fallar.
  if (storageDriver() === "minio") {
    await withTimeout(minioClient().removeObject(BUCKET, objectPath), `MinIO remove ${objectPath}`).catch(() => false);
    return true;
  }
  await storageRequest(`/object/${BUCKET}/${objectPath}`, { method: "DELETE" }).catch(() => false);
  return true;
}

// URL publica y estatica: la vitrina publica del cliente no puede depender de URLs
// firmadas con TTL de 10 min. Exige que el bucket comercio-assets sea PUBLICO (en Supabase
// es un paso de infra; en el MinIO local lo abre ensureMinioBucket la primera vez).
// Una ruta que empieza en "/" es un asset del sitio (apps/web/public), como el catalogo
// demo con fotografia ya recortada: se devuelve tal cual para el origen web.
// Es la ruta de LECTURA de la vitrina: nunca lanza, devuelve null y la pagina pinta el
// degradado del tema en lugar del cartel.
function publicViewUrl(storagePath) {
  const path = String(storagePath || "");
  if (path.startsWith("/")) return path;
  if (!path.startsWith(`${BUCKET}/`)) return null;
  const objectPath = minioObjectPath(path);
  let driver;
  let base;
  try {
    driver = storageDriver();
    base = driver === "minio" ? minioConfig().publicBase : supabaseConfig().url;
  } catch {
    return null;
  }
  if (driver === "minio") return `${base}/${BUCKET}/${objectPath}`;
  return `${base}/storage/v1/object/public/${BUCKET}/${objectPath}`;
}

async function signedViewUrl(storagePath, expiresIn = SIGNED_URL_TTL_SECONDS) {
  const path = String(storagePath || "");
  // Asset del sitio: no hay objeto que firmar, la ruta ya es accesible desde el web.
  if (path.startsWith("/")) return path;
  if (!path.startsWith(`${BUCKET}/`)) {
    throw Object.assign(new Error("El producto no tiene una fotografia almacenada."), { statusCode: 404 });
  }
  const objectPath = minioObjectPath(path);
  if (storageDriver() === "minio") {
    try {
      const value = await withTimeout(minioClient().presignedGetObject(BUCKET, objectPath, Math.round(expiresIn)), `MinIO presign ${objectPath}`);
      // MinIO firma contra su endpoint interno; si la vitrina ve el almacen por otro
      // origen (COMERCIO_STORAGE_PUBLIC_URL) se reescribe el prefijo.
      const config = minioConfig();
      const internal = `${config.useSSL ? "https" : "http"}://${config.endPoint}:${config.port}`;
      return String(value).startsWith(internal) ? `${config.publicBase}${value.slice(internal.length)}` : String(value);
    } catch (cause) {
      throw cause?.statusCode ? cause : storageError(cause);
    }
  }
  const { url } = supabaseConfig();
  const response = await storageRequest(`/object/sign/${BUCKET}/${objectPath}`, {
    method: "POST",
    body: JSON.stringify({ expiresIn })
  });
  const signed = await response.json().catch(() => ({}));
  const value = String(signed.signedURL || signed.signedUrl || signed.url || "");
  if (!value) throw Object.assign(new Error("Storage no devolvio una URL firmada."), { statusCode: 502, code: "ALMACEN_RECHAZO" });
  if (/^https?:\/\//i.test(value)) return value;
  return value.startsWith("/object/") ? `${url}/storage/v1${value}` : `${url}/storage/v1/${value.replace(/^\/+/, "")}`;
}

// Validacion de arranque del almacen elegido: la usan las rutas que van a escribir
// (upload y generacion) para fallar temprano con 503 en lugar de gastar un ciclo del
// proveedor de imagenes contra un almacen que no esta.
function storageConfig() {
  return storageDriver() === "minio" ? minioConfig() : supabaseConfig();
}

module.exports = {
  BUCKET,
  MAX_BYTES,
  MAX_DIMENSION,
  SIGNED_URL_TTL_SECONDS,
  STORAGE_TIMEOUT_MS,
  storageDriver,
  storageConfig,
  objectKey,
  storefrontObjectKey,
  validateProductImage,
  uploadProductPhoto,
  removeProductPhoto,
  signedViewUrl,
  publicViewUrl
};
