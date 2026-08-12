const crypto = require("crypto");
const { decodeBase64Prefix, detectFileMime } = require("./fileSignature");

const SENSITIVE_KEYS = new Set([
  "password",
  "pas",
  "contrasena",
  "token",
  "refresh",
  "authorization",
  "base64",
  "base64_data",
  "digital_signature",
  "signature",
  "cert_password"
]);

const ALLOWED_FILE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "video/mp4",
  "video/webm"
]);

const MAX_EVIDENCE_BYTES = Number(process.env.MAX_EVIDENCE_BYTES || 12 * 1024 * 1024);
const MAX_DOCUMENT_BYTES = Number(process.env.MAX_DOCUMENT_BYTES || 20 * 1024 * 1024);

function sha256(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function redactSensitive(value, depth = 0) {
  if (depth > 8) return "[MaxDepth]";
  if (Array.isArray(value)) return value.map((item) => redactSensitive(item, depth + 1));
  if (!isPlainObject(value)) return value;

  return Object.fromEntries(Object.entries(value).map(([key, item]) => {
    const normalizedKey = key.toLowerCase();
    if (SENSITIVE_KEYS.has(normalizedKey) || normalizedKey.includes("password") || normalizedKey.includes("token")) {
      return [key, item ? "[REDACTED]" : item];
    }
    if (typeof item === "string" && item.startsWith("data:") && item.includes(";base64,")) {
      return [key, `[BASE64:${sha256(item).slice(0, 12)}]`];
    }
    return [key, redactSensitive(item, depth + 1)];
  }));
}

function assertPasswordPolicy(password) {
  const value = String(password || "");
  if (value.length < 8) {
    const error = new Error("La contrasena debe tener minimo 8 caracteres.");
    error.statusCode = 400;
    throw error;
  }
  if (!/[A-Za-z]/.test(value) || !/[0-9]/.test(value)) {
    const error = new Error("La contrasena debe combinar letras y numeros.");
    error.statusCode = 400;
    throw error;
  }
}

function normalizeFileName(fileName = "archivo") {
  const clean = String(fileName)
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  return clean.slice(0, 140) || "archivo";
}

function assertSafeFile(input = {}, options = {}) {
  const mimeType = String(input.mime_type || input.type || "").toLowerCase();
  const fileSize = Number(input.file_size || input.size_bytes || input.size || 0);
  const base64 = input.base64_data || input.base64;
  const maxBytes = options.maxBytes || MAX_EVIDENCE_BYTES;

  if (fileSize < 0 || (base64 && !fileSize)) {
    const error = new Error("El archivo esta vacio o su tamano es invalido.");
    error.statusCode = 400;
    throw error;
  }
  if (mimeType && !ALLOWED_FILE_MIME_TYPES.has(mimeType)) {
    const error = new Error("Tipo de archivo no permitido.");
    error.statusCode = 400;
    throw error;
  }
  if (fileSize && fileSize > maxBytes) {
    const error = new Error("El archivo supera el tamano maximo permitido.");
    error.statusCode = 400;
    throw error;
  }
  if (base64) {
    const detectedMime = detectFileMime(decodeBase64Prefix(base64));
    if (!detectedMime || detectedMime !== mimeType) {
      const error = new Error("El contenido del archivo no coincide con el formato declarado.");
      error.statusCode = 400;
      throw error;
    }
  }
}

function secureStoragePath({ tenantId, module, entity, entityId, fileName }) {
  const safeName = normalizeFileName(fileName);
  const safeEntityId = String(entityId || "general").replace(/[^a-zA-Z0-9_-]/g, "");
  return `company/${tenantId}/${module}/${entity}/${safeEntityId}/${Date.now()}-${safeName}`;
}

module.exports = {
  MAX_DOCUMENT_BYTES,
  MAX_EVIDENCE_BYTES,
  assertPasswordPolicy,
  assertSafeFile,
  normalizeFileName,
  redactSensitive,
  secureStoragePath
};
