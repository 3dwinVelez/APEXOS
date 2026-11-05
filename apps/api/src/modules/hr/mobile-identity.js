// Identidad del empleado en las marcaciones de la app movil.
//
// Un telefono Android no le dice a ninguna app DE QUIEN es la huella: solo que
// "alguna huella inscrita en este equipo" coincidio. Por eso la huella sola no
// identifica a nadie. Este modulo ata la marcacion a un par de cosas que si se
// pueden verificar en el servidor:
//
//  1. Registro: la app genera una llave EC P-256 en el chip seguro del
//     telefono (Android Keystore), usable solo tras una huella valida y que se
//     INVALIDA si alguien inscribe una huella nueva en el equipo. La llave
//     publica queda en la ficha del empleado junto con el id del telefono.
//  2. Cada marcacion llega firmada con esa llave e incluye una selfie; la
//     firma cubre el hash de la selfie, asi que no se puede cambiar la foto.
//
// Limite que conviene tener claro: las huellas que YA estaban inscritas en el
// telefono al registrarse siguen sirviendo. La selfie es lo que le permite al
// supervisor ver quien marco de verdad.
//
// Aqui no hay acceso a base de datos: todo son funciones puras para poder
// probarlas sin infraestructura. hr/service.js las conecta con Prisma.
const crypto = require("node:crypto");
const { assertSafeFile } = require("../../security/policy");

const MOBILE_SOURCE = "apexos-movil";
const KEY_ALGORITHM = "EC_P256_SHA256";
const ENROLL_CLOCK_SKEW_MS = 10 * 60 * 1000;
// La app reduce la selfie a ~20 KB; el tope deja margen sin aceptar fotos de
// camara completas que inflarian cada fila de marcacion.
const MAX_IDENTITY_PHOTO_BYTES = 300 * 1024;
const IDENTITY_PHOTO_TYPES = new Set(["image/jpeg", "image/png"]);
const HISTORY_LIMIT = 20;

function fail(statusCode, code, message, details) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  if (details) error.details = details;
  return error;
}

function cleanDeviceId(value) {
  const deviceId = String(value || "").trim();
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(deviceId)) {
    throw fail(400, "DISPOSITIVO_INVALIDO", "El identificador del telefono es invalido.");
  }
  return deviceId;
}

function publicKeyFrom(base64) {
  let key;
  try {
    key = crypto.createPublicKey({ key: Buffer.from(String(base64 || ""), "base64"), format: "der", type: "spki" });
  } catch {
    throw fail(400, "LLAVE_BIOMETRICA_INVALIDA", "La llave del telefono no es valida.");
  }
  const details = key.asymmetricKeyDetails || {};
  if (key.asymmetricKeyType !== "ec" || details.namedCurve !== "prime256v1") {
    throw fail(400, "LLAVE_BIOMETRICA_INVALIDA", "La llave del telefono debe ser EC P-256.");
  }
  return key;
}

function verifySignature(publicKeyBase64, message, signatureBase64) {
  const signature = Buffer.from(String(signatureBase64 || ""), "base64");
  if (!signature.length) return false;
  try {
    // Android firma con SHA256withECDSA y entrega la firma en DER.
    return crypto.verify("sha256", Buffer.from(message, "utf8"), { key: publicKeyFrom(publicKeyBase64), dsaEncoding: "der" }, signature);
  } catch {
    return false;
  }
}

// Mensajes firmados. La app (lib/services/device_identity.dart) arma
// exactamente estas cadenas: cualquier cambio aqui rompe la verificacion.
function enrollmentMessage({ userId, deviceId, signedAt }) {
  return ["apexos-enroll", "v1", String(userId), deviceId, signedAt].join("|");
}

function punchMessage({ userId, type, punchedAt, idempotencyKey, deviceId, photoSha256 }) {
  return ["apexos-punch", "v1", String(userId), type, punchedAt, idempotencyKey, deviceId, photoSha256].join("|");
}

function enrollmentOf(employee) {
  const record = employee?.metadata?.mobile_biometric;
  return record && typeof record === "object" && record.public_key && record.device_id ? record : null;
}

// Lo que ve el propio empleado o el supervisor: nunca la llave.
function publicEnrollment(employee) {
  const record = enrollmentOf(employee);
  if (!record) return { enrolled: false };
  return {
    enrolled: true,
    device_id: record.device_id,
    platform: record.platform || null,
    device_model: record.device_model || null,
    enrolled_at: record.enrolled_at || null
  };
}

// Valida una solicitud de registro y devuelve el registro a guardar.
//
// Solo se puede registrar si el empleado no tiene telefono registrado. Volver
// a registrar exige que un supervisor restablezca: si la llave se invalido es
// porque alguien inscribio una huella nueva en el telefono, que es justo el
// caso que hay que poner frente a una persona.
function buildEnrollment({ employee, user, input = {}, now = new Date() }) {
  if (enrollmentOf(employee)) {
    throw fail(409, "BIOMETRIA_YA_REGISTRADA", "Tu usuario ya tiene un telefono registrado. Pide a tu supervisor que restablezca el registro.", publicEnrollment(employee));
  }
  if (!user?.id) throw fail(401, "NO_AUTENTICADO", "Sesion requerida para registrar la huella.");
  const deviceId = cleanDeviceId(input.device_id);
  publicKeyFrom(input.public_key);
  const signedAt = String(input.signed_at || "");
  const signedAtMs = Date.parse(signedAt);
  if (!Number.isFinite(signedAtMs) || Math.abs(now.getTime() - signedAtMs) > ENROLL_CLOCK_SKEW_MS) {
    throw fail(400, "REGISTRO_VENCIDO", "La fecha del registro no coincide con la del servidor. Revisa la hora del telefono.");
  }
  const message = enrollmentMessage({ userId: user.id, deviceId, signedAt });
  if (!verifySignature(input.public_key, message, input.signature)) {
    throw fail(403, "FIRMA_BIOMETRICA_INVALIDA", "No fue posible comprobar la huella del registro.");
  }
  return {
    device_id: deviceId,
    public_key: String(input.public_key),
    key_algorithm: KEY_ALGORITHM,
    platform: String(input.platform || "").slice(0, 40) || null,
    device_model: String(input.device_model || "").slice(0, 120) || null,
    enrolled_at: now.toISOString(),
    enrolled_by_user_id: user.id
  };
}

// Metadata del empleado tras restablecer: el registro pasa al historial.
function resetEnrollmentMetadata(metadata = {}, { user, now = new Date(), reason = "" } = {}) {
  const current = metadata.mobile_biometric;
  const history = Array.isArray(metadata.mobile_biometric_history) ? metadata.mobile_biometric_history : [];
  const next = { ...metadata };
  delete next.mobile_biometric;
  if (current && typeof current === "object") {
    const { public_key: _publicKey, ...withoutKey } = current;
    next.mobile_biometric_history = [
      ...history,
      { ...withoutKey, reset_at: now.toISOString(), reset_by_user_id: user?.id || null, reset_reason: String(reason || "").slice(0, 200) || null }
    ].slice(-HISTORY_LIMIT);
  }
  return next;
}

function photoBytes(photo) {
  const raw = String(photo.base64 || photo.base64_data || "");
  const payload = raw.includes(",") ? raw.slice(raw.indexOf(",") + 1) : raw;
  return Buffer.from(payload, "base64");
}

// Verifica la identidad de una marcacion propia.
//
// Devuelve la metadata a agregar a la marcacion. Lanza si la marcacion viene
// de la app y no trae lo necesario: registro, telefono correcto, selfie y
// firma valida. Las marcaciones de la web no traen nada de esto y quedan
// marcadas como no verificadas, para que el supervisor sepa distinguirlas.
function verifyPunchIdentity({ employee, user, input = {}, now = new Date() }) {
  const metadata = input.metadata || {};
  if (metadata.source !== MOBILE_SOURCE) {
    return { identity_verification: { status: "not_verified", channel: "web" } };
  }
  const record = enrollmentOf(employee);
  if (!record) {
    throw fail(403, "BIOMETRIA_NO_REGISTRADA", "Registra tu huella en la app antes de marcar. Si ya la registraste, actualiza la app.");
  }
  const identity = metadata.identity && typeof metadata.identity === "object" ? metadata.identity : null;
  if (!identity?.signature) {
    throw fail(403, "IDENTIDAD_REQUERIDA", "Esta version de la app ya no puede marcar. Actualiza APEXOS.");
  }
  if (String(identity.device_id || "") !== record.device_id) {
    throw fail(403, "DISPOSITIVO_NO_REGISTRADO", "Este telefono no es el registrado para tu usuario. Marca desde tu telefono o pide a tu supervisor que restablezca el registro.");
  }
  const photo = metadata.identity_photo && typeof metadata.identity_photo === "object" ? metadata.identity_photo : null;
  if (!photo?.base64) {
    throw fail(400, "SELFIE_REQUERIDA", "La marcacion desde la app requiere la foto de tu rostro.");
  }
  const type = String(photo.type || "").toLowerCase();
  if (!IDENTITY_PHOTO_TYPES.has(type)) throw fail(400, "SELFIE_INVALIDA", "La foto de la marcacion debe ser JPEG o PNG.");
  const bytes = photoBytes(photo);
  assertSafeFile({ base64_data: photo.base64, mime_type: type, file_size: bytes.length, file_name: photo.name }, { maxBytes: MAX_IDENTITY_PHOTO_BYTES });
  const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
  const message = punchMessage({
    userId: user?.id,
    type: String(input.type || ""),
    punchedAt: String(input.punched_at || ""),
    idempotencyKey: String(input.idempotency_key || ""),
    deviceId: record.device_id,
    photoSha256: sha256
  });
  if (!verifySignature(record.public_key, message, identity.signature)) {
    throw fail(403, "FIRMA_BIOMETRICA_INVALIDA", "No fue posible comprobar la huella de esta marcacion.");
  }
  const base64 = String(photo.base64);
  return {
    identity_verification: {
      status: "verified",
      method: KEY_ALGORITHM,
      channel: "mobile",
      device_id: record.device_id,
      enrolled_at: record.enrolled_at || null,
      verified_at: now.toISOString(),
      signature: String(identity.signature)
    },
    identity_photo: {
      name: String(photo.name || "selfie.jpg").slice(0, 120),
      type,
      size: bytes.length,
      sha256,
      // Siempre como data URL: es lo que pintan las pantallas de la web.
      base64_data: base64.startsWith("data:") ? base64 : `data:${type};base64,${base64}`
    }
  };
}

// Quita de la marcacion lo que no debe viajar en listados: el contenido de la
// selfie (se pide aparte) y la firma cruda que manda la app.
function publicPunchMetadata(metadata = {}) {
  if (!metadata || typeof metadata !== "object") return metadata;
  const { identity: _identity, identity_photo: photo, ...rest } = metadata;
  if (!photo || typeof photo !== "object") return rest;
  const { base64_data: base64, base64: _raw, ...photoRest } = photo;
  return { ...rest, identity_photo: { ...photoRest, has_base64_data: Boolean(base64) } };
}

// Selfie de una marcacion en el formato de evidencias del monitor.
function identityEvidenceOf(punch) {
  const photo = punch?.metadata?.identity_photo;
  if (!photo || typeof photo !== "object" || !photo.base64_data) return null;
  return {
    evidence_type: "identity_selfie",
    file_name: photo.name || `selfie-${punch.id}.jpg`,
    mime_type: photo.type || "image/jpeg",
    file_size: photo.size || null,
    base64_data: photo.base64_data
  };
}

module.exports = {
  MOBILE_SOURCE,
  KEY_ALGORITHM,
  MAX_IDENTITY_PHOTO_BYTES,
  enrollmentMessage,
  punchMessage,
  enrollmentOf,
  publicEnrollment,
  buildEnrollment,
  resetEnrollmentMetadata,
  verifyPunchIdentity,
  publicPunchMetadata,
  identityEvidenceOf
};
