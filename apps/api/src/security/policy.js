const crypto = require("crypto");
const { decodeBase64Prefix, detectFileMime, inspectBase64Payload, isRasterImageMime } = require("./fileSignature");

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

// Clases de contenido admitidas por la validacion OPT-IN (`contentClass`). La evidencia de
// marcacion usa "image": un HEIC/AVIF de camara real es una foto legitima y un video o un
// PDF no, aunque el MIME declarado diga otra cosa. Sin esta opcion `assertSafeFile` sigue
// exigiendo igualdad exacta declarada === olida (Comercio y documentos de vehiculo).
const CONTENT_CLASSES = Object.freeze({
  image: {
    label: "imagen",
    accepts: (sniffedMime) => isRasterImageMime(sniffedMime),
    // Nunca se toleran aunque la firma las anuncie: no son raster decodificable o son SVG.
    refused_declared: ["text/html", "text/plain", "image/svg+xml"]
  }
});

// Motivo machine-readable del rechazo degradable: llega en `error.evidence_failure_code`
// para que la fila se marque degradada en lugar de perder la marcacion.
const EVIDENCE_FAILURE_CODES = Object.freeze({
  undecodable: "EVIDENCIA_INDECODIFICABLE",
  invalid_alphabet: "EVIDENCIA_ALFABETO_INVALIDO",
  too_small: "EVIDENCIA_MINIMA",
  declared_type: "EVIDENCIA_TIPO_DECLARADO_RECHAZADO",
  content_class: "EVIDENCIA_CLASE_RECHAZADA",
  size_mismatch: "EVIDENCIA_TAMANO_INVALIDO",
  oversize: "EVIDENCIA_SUPERA_LIMITE",
  not_decodable: "EVIDENCIA_NO_DECODIFICABLE",
  animated: "EVIDENCIA_MULTIPAGE"
});

// Rechazo duro: la clase no es negociable (video, PDF, texto, SVG). Un fallo de estos no
// degrada, se rechaza; la disponibilidad de la marcacion no se paga con aceptar basura.
function isHardContentRejection(failureCode) {
  return failureCode === EVIDENCE_FAILURE_CODES.content_class
    || failureCode === EVIDENCE_FAILURE_CODES.declared_type
    || failureCode === EVIDENCE_FAILURE_CODES.invalid_alphabet;
}

function evidenceFailure(statusCode, code, message, detail) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code || "VALIDACION";
  if (code) error.evidence_failure_code = code;
  if (detail) error.evidence_detail = detail;
  return error;
}

// El detalle del rechazo viaja SIEMPRE con el tope que disparó (`max_bytes`) y lo que midió
// el servidor (`byte_length`). Medido en produccion: los 4xx de la marcacion llegaban al
// cliente con `code` vacio y una frase generica, y un solo operario bloqueado acumulaba 16
// filas "400 (sin codigo) (sin detalle)" imposibles de distinguir de "secuencia incorrecta".
function oversizeFailure(fail, { maxBytes, message }) {
  return fail(
    EVIDENCE_FAILURE_CODES.oversize,
    `${message || "El archivo supera el tamano maximo permitido."} Limite: ${maxBytes} bytes.`
  );
}

// Validacion por clase para la evidencia de recursos humanos. Devuelve el veredicto en vez
// de lanzar, para que las dos compuertas (selfie y almacen) afirmen lo mismo.
//   options.contentClass  "image" | ausente (ausente = camino estricto de siempre)
//   options.maxBytes      tope REAL sobre los bytes decodificados
//   options.field         nombre del campo, viaja en el registro de auditoria
function validateEvidenceContent(input = {}, options = {}) {
  const field = String(options.field || "identity_photo");
  const raw = input.base64_data ?? input.base64 ?? input.payload;
  const declaredMime = String(input.mime_type || input.type || "").toLowerCase().split(";")[0].trim();
  const inspected = inspectBase64Payload(raw, { field });
  const detail = {
    field,
    declared_mime: declaredMime || null,
    sniffed_mime: inspected.sniffed_mime,
    byte_length: inspected.byte_length,
    sha256: inspected.sha256,
    normalization_applied: inspected.normalization_applied
  };
  // `fail` propaga el detalle arriba: quien degrada la fila y quien enriquece el registro
  // de auditoria leen exactamente las mismas claves.
  const fail = (code, message) => ({ ok: false, code, message, ...detail });

  if (!inspected.ok) {
    const code = inspected.decode_error === "alfabeto_invalido" || inspected.decode_error === "longitud_invalida"
      ? EVIDENCE_FAILURE_CODES.invalid_alphabet
      : EVIDENCE_FAILURE_CODES.undecodable;
    return fail(code, "El contenido del archivo no pudo decodificarse.");
  }
  if (inspected.byte_length < 32) {
    return fail(EVIDENCE_FAILURE_CODES.too_small, "El contenido del archivo es demasiado pequeno para ser un archivo valido.");
  }
  if (!declaredMime || declaredMime.startsWith("text/") || declaredMime === "image/svg+xml") {
    return fail(EVIDENCE_FAILURE_CODES.declared_type, "El tipo declarado no puede aceptarse como evidencia.");
  }
  const rule = CONTENT_CLASSES[options.contentClass];
  if (!rule) {
    // Sin clase declarada manda la igualdad estricta de siempre: el MIME declarado tiene
    // que coincidir con el olido (Comercio, documentos de vehiculo, servicios).
    if (inspected.sniffed_mime !== declaredMime) {
      return fail(EVIDENCE_FAILURE_CODES.content_class, "El contenido del archivo no coincide con el formato declarado.");
    }
    const strictMaxBytes = options.maxBytes || MAX_EVIDENCE_BYTES;
    if (inspected.byte_length > strictMaxBytes) {
      return oversizeFailure(fail, { maxBytes: strictMaxBytes });
    }
    return { ok: true, ...detail, mime: inspected.sniffed_mime, buffer: inspected.buffer, canonical: inspected.canonical };
  }
  if (rule.refused_declared.includes(declaredMime)) {
    return fail(EVIDENCE_FAILURE_CODES.declared_type, "El tipo declarado no puede aceptarse como evidencia.");
  }
  if (!rule.accepts(inspected.sniffed_mime)) {
    return fail(EVIDENCE_FAILURE_CODES.content_class, `El contenido del archivo no es una ${rule.label} permitida.`);
  }
  const maxBytes = options.maxBytes || MAX_EVIDENCE_BYTES;
  if (inspected.byte_length > maxBytes) {
    return oversizeFailure(fail, { maxBytes });
  }
  return { ok: true, ...detail, mime: inspected.sniffed_mime, buffer: inspected.buffer, canonical: inspected.canonical };
}

// Error de validacion de evidencia: conserva el codigo de negocio (`VALIDACION`) y ademas
// trae el motivo machine-readable y el detalle saneable para el registro de auditoria.
// `max_bytes`/`byte_length` salen del detalle cuando el rechazo fue por tamano: es lo unico
// que le dice a un administrador QUE tope se rompio sin abrir el codigo.
function evidenceFailureError(result) {
  return evidenceFailure(400, result?.code || "VALIDACION", result?.message || "La evidencia de la marcacion no pudo validarse.", {
    evidence_failure_code: result?.code || null,
    reason: result?.code || null,
    field: result?.field || null,
    declared_mime: result?.declared_mime ?? null,
    sniffed_mime: result?.sniffed_mime ?? null,
    byte_length: result?.byte_length ?? 0,
    max_bytes: result?.max_bytes ?? null,
    sha256: result?.sha256 || "",
    normalization_applied: result?.normalization_applied || []
  });
}

function assertSafeFile(input = {}, options = {}) {
  if (options.contentClass) {
    const result = validateEvidenceContent(input, options);
    if (!result.ok) throw evidenceFailureError(result);
    return result;
  }
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
  CONTENT_CLASSES,
  EVIDENCE_FAILURE_CODES,
  MAX_DOCUMENT_BYTES,
  MAX_EVIDENCE_BYTES,
  assertPasswordPolicy,
  assertSafeFile,
  evidenceFailure,
  evidenceFailureError,
  isHardContentRejection,
  normalizeFileName,
  redactSensitive,
  secureStoragePath,
  validateEvidenceContent
};
