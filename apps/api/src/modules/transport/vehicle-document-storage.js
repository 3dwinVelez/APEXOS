const crypto = require("node:crypto");
const { detectFileMime } = require("../../security/fileSignature");
const { dimensions } = require("../services/evidenceUploads");

const BUCKET = "vehicle-documents";
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_DIMENSION = 4096;
const SIGNED_URL_TTL_SECONDS = 600;
const ALLOWED_MIME = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp"
};

function storageConfig() {
  const url = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw Object.assign(new Error("Almacenamiento de adjuntos no configurado."), { statusCode: 503 });
  }
  return { url, key };
}

function serviceHeaders(contentType) {
  const { key } = storageConfig();
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    ...(contentType ? { "Content-Type": contentType } : {})
  };
}

function sanitizeSegment(value) {
  return String(value || "").trim().replace(/[^a-zA-Z0-9_-]/g, "");
}

function objectKey({ tenantId, vehicleId, extension }) {
  const tenant = sanitizeSegment(tenantId);
  const vehicle = sanitizeSegment(vehicleId);
  if (!tenant || !vehicle) {
    throw Object.assign(new Error("Identificador de empresa o vehiculo invalido."), { statusCode: 400 });
  }
  const ext = Object.values(ALLOWED_MIME).includes(extension) ? extension : "bin";
  return `${tenant}/vehicles/${vehicle}/${crypto.randomUUID()}.${ext}`;
}

function validateVehicleDocument(bytes, declaredMime) {
  if (!bytes?.length) throw Object.assign(new Error("El archivo esta vacio."), { statusCode: 400 });
  if (bytes.length > MAX_BYTES) throw Object.assign(new Error("El archivo supera el limite de 10 MB."), { statusCode: 413 });
  const mime = detectFileMime(bytes);
  if (!mime || !ALLOWED_MIME[mime]) {
    throw Object.assign(new Error("Formato no permitido. Adjunta un archivo PDF, PNG, JPEG o WEBP."), { statusCode: 415 });
  }
  const declared = String(declaredMime || "").toLowerCase().split(";")[0].trim();
  if (declared && declared !== "application/octet-stream" && declared !== mime) {
    throw Object.assign(new Error("El contenido del archivo no coincide con el tipo declarado."), { statusCode: 415 });
  }
  let width = null;
  let height = null;
  if (mime !== "application/pdf") {
    const size = dimensions(bytes, mime);
    if (!size || size.width < 1 || size.height < 1) {
      throw Object.assign(new Error("La imagen esta truncada o no es decodificable."), { statusCode: 415 });
    }
    if (size.width > MAX_DIMENSION || size.height > MAX_DIMENSION) {
      throw Object.assign(new Error("Las dimensiones de la imagen exceden el limite permitido."), { statusCode: 413 });
    }
    width = size.width;
    height = size.height;
  }
  return {
    mime,
    extension: ALLOWED_MIME[mime],
    checksum_sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
    width,
    height
  };
}

async function storageRequest(path, options = {}) {
  const { url } = storageConfig();
  const contentType = options.contentType || (options.body === undefined ? undefined : "application/json");
  const response = await fetch(`${url}/storage/v1${path}`, {
    ...options,
    headers: { ...serviceHeaders(contentType), ...(options.headers || {}) }
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw Object.assign(new Error(`Storage rechazo la operacion (${response.status}). ${detail.slice(0, 160)}`), { statusCode: 502 });
  }
  return response;
}

async function uploadVehicleDocument({ objectPath, bytes, contentType }) {
  await storageRequest(`/object/${BUCKET}/${objectPath}`, {
    method: "POST",
    headers: { "x-upsert": "false" },
    contentType,
    body: bytes
  });
  return `${BUCKET}/${objectPath}`;
}

async function signedViewUrl(storagePath, expiresIn = SIGNED_URL_TTL_SECONDS) {
  const path = String(storagePath || "");
  if (!path.startsWith(`${BUCKET}/`)) {
    throw Object.assign(new Error("El documento no tiene un archivo almacenado."), { statusCode: 404 });
  }
  const objectPath = path.slice(BUCKET.length + 1);
  const { url } = storageConfig();
  const response = await storageRequest(`/object/sign/${BUCKET}/${objectPath}`, {
    method: "POST",
    body: JSON.stringify({ expiresIn })
  });
  const signed = await response.json().catch(() => ({}));
  const value = String(signed.signedURL || signed.signedUrl || signed.url || "");
  if (!value) throw Object.assign(new Error("Storage no devolvio una URL firmada."), { statusCode: 502 });
  if (/^https?:\/\//i.test(value)) return value;
  return value.startsWith("/object/") ? `${url}/storage/v1${value}` : `${url}/storage/v1/${value.replace(/^\/+/, "")}`;
}

module.exports = {
  BUCKET,
  MAX_BYTES,
  MAX_DIMENSION,
  SIGNED_URL_TTL_SECONDS,
  storageConfig,
  objectKey,
  validateVehicleDocument,
  uploadVehicleDocument,
  signedViewUrl
};
