// Identidad de las marcaciones hechas desde el CELULAR COMPARTIDO de un camion.
//
// Un camion tiene un celular que usan dos empleados (conductor y auxiliar). El
// lector de huella del telefono acepta cualquier huella inscrita y no dice de
// quien es, asi que la huella sola no distingue a los dos. Este modulo ata cada
// marcacion a dos pruebas que si se verifican en el servidor:
//
//  1. El CELULAR: se registra con una llave de acceso WebAuthn (ES256) creada en
//     el chip del telefono y desbloqueada con la huella. Cada marcacion llega
//     firmada con esa llave: prueba que salio de ESE celular autorizado.
//  2. La PERSONA: la selfie de cada marcacion. La firma cubre el sha256 de la
//     selfie, asi que la foto no se puede cambiar despues.
//
// El reto que firma WebAuthn es el sha256 del mensaje canonico de la marcacion
// (mismo esquema que la firma de la app movil): no hace falta pedir un reto al
// servidor, y por eso la marcacion se puede firmar SIN SENAL y enviarse despues.
//
// Funciones puras, sin base de datos: hr/service.js las conecta con Prisma.
const crypto = require("node:crypto");
const { publicKeyFrom, normalizeSelfie } = require("./mobile-identity");

const SHARED_DEVICE_SOURCE = "apexos-web-camion";
const SHARED_KEY_ALGORITHM = "WEBAUTHN_ES256";
const COSE_ALG_ES256 = -7;
const REGISTRATION_CHALLENGE_TTL_MS = 5 * 60 * 1000;
// La selfie del navegador pesa mas que la que optimiza la app nativa; mismo tope
// que la marcacion web (webIdentity en mobile-identity.js).
const MAX_SHARED_SELFIE_BYTES = 2 * 1024 * 1024;
const FLAG_USER_PRESENT = 0x01;
const FLAG_USER_VERIFIED = 0x04;

function fail(statusCode, code, message, details) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  if (details) error.details = details;
  return error;
}

function b64urlToBuffer(value) {
  const s = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(s + "=".repeat((4 - (s.length % 4)) % 4), "base64");
}

function bufferToB64url(buffer) {
  return Buffer.from(buffer).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const sha256 = (data) => crypto.createHash("sha256").update(data).digest();

function cleanDeviceId(value) {
  const deviceId = String(value || "").trim();
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(deviceId)) {
    throw fail(400, "DISPOSITIVO_INVALIDO", "El identificador del celular es invalido.");
  }
  return deviceId;
}

function cleanPlate(value) {
  const plate = String(value || "").toUpperCase().replace(/\s+/g, "");
  if (!/^[A-Z0-9-]{3,12}$/.test(plate)) throw fail(400, "PLACA_INVALIDA", "La placa del vehiculo es invalida.");
  return plate;
}

function normalizeList(value) {
  return String(value || "").split(",").map((v) => v.trim()).filter(Boolean);
}

// Lee los datos fijos de authenticatorData (W3C WebAuthn, seccion 6.1):
// rpIdHash (32 bytes) | flags (1) | signCount (4, big endian) | ...
function parseAuthenticatorData(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 37) {
    throw fail(400, "WEBAUTHN_DATOS_INVALIDOS", "Los datos del autenticador estan incompletos.");
  }
  const flags = buffer[32];
  return {
    rpIdHash: buffer.subarray(0, 32),
    flags,
    userPresent: (flags & FLAG_USER_PRESENT) !== 0,
    userVerified: (flags & FLAG_USER_VERIFIED) !== 0,
    signCount: buffer.readUInt32BE(33)
  };
}

function parseClientData(b64url) {
  const raw = b64urlToBuffer(b64url);
  try {
    return { raw, data: JSON.parse(raw.toString("utf8")) };
  } catch {
    throw fail(400, "WEBAUTHN_DATOS_INVALIDOS", "Los datos del cliente WebAuthn no son validos.");
  }
}

function assertOriginAndRp({ clientData, authData, rpId, allowedOrigins, allowedRpIds }) {
  if (!allowedOrigins.includes(String(clientData.origin || ""))) {
    throw fail(403, "WEBAUTHN_ORIGEN_NO_PERMITIDO", "La marcacion viene de un sitio no autorizado.", { origin: clientData.origin || null });
  }
  if (!allowedRpIds.includes(rpId)) {
    throw fail(403, "WEBAUTHN_RP_NO_PERMITIDO", "El dominio del registro no esta autorizado.");
  }
  if (!authData.rpIdHash.equals(sha256(Buffer.from(rpId, "utf8")))) {
    throw fail(403, "WEBAUTHN_RP_NO_COINCIDE", "La firma no corresponde al dominio registrado.");
  }
  if (!authData.userPresent || !authData.userVerified) {
    throw fail(403, "HUELLA_NO_VERIFICADA", "El celular no confirmo la huella del usuario.");
  }
}

// ---------------------------------------------------------------- reto de registro
// Sin tabla: el reto es un token firmado con HMAC (tenant, usuario, vencimiento).
function issueRegistrationChallenge({ tenantId, userId, secret, now = new Date() }) {
  if (!secret) throw fail(500, "CONFIGURACION_INCOMPLETA", "Falta la llave del servidor para firmar el reto.");
  const payload = bufferToB64url(Buffer.from(JSON.stringify({
    t: String(tenantId),
    u: Number(userId),
    e: now.getTime() + REGISTRATION_CHALLENGE_TTL_MS,
    n: bufferToB64url(crypto.randomBytes(16))
  })));
  const mac = bufferToB64url(crypto.createHmac("sha256", secret).update(payload).digest());
  // El navegador firma los BYTES del reto; se entregan como base64url.
  return { challenge: bufferToB64url(Buffer.from(`${payload}.${mac}`, "utf8")), expires_in_seconds: REGISTRATION_CHALLENGE_TTL_MS / 1000 };
}

function checkRegistrationChallenge(challengeB64url, { tenantId, userId, secret, now = new Date() }) {
  const token = b64urlToBuffer(challengeB64url).toString("utf8");
  const [payload, mac] = token.split(".");
  const expected = payload ? bufferToB64url(crypto.createHmac("sha256", secret).update(payload).digest()) : "";
  const macOk = Boolean(mac) && mac.length === expected.length && crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected));
  if (!macOk) throw fail(400, "WEBAUTHN_RETO_INVALIDO", "El reto de registro no es valido.");
  let data;
  try {
    data = JSON.parse(b64urlToBuffer(payload).toString("utf8"));
  } catch {
    throw fail(400, "WEBAUTHN_RETO_INVALIDO", "El reto de registro no es valido.");
  }
  if (data.t !== String(tenantId) || data.u !== Number(userId)) {
    throw fail(403, "WEBAUTHN_RETO_AJENO", "El reto de registro pertenece a otra sesion.");
  }
  if (now.getTime() > Number(data.e)) throw fail(400, "WEBAUTHN_RETO_VENCIDO", "El reto de registro vencio. Intenta de nuevo.");
}

// ---------------------------------------------------------------- registro
// El navegador entrega la llave publica ya en SPKI (response.getPublicKey()) y los
// datos del autenticador (getAuthenticatorData()): no hace falta decodificar CBOR.
function verifyRegistration({ input = {}, tenantId, user, secret, allowedOrigins, allowedRpIds, now = new Date() }) {
  if (!user?.id) throw fail(401, "NO_AUTENTICADO", "Sesion requerida para registrar el celular.");
  const deviceId = cleanDeviceId(input.device_id);
  const vehiclePlate = cleanPlate(input.vehicle_plate);
  const rpId = String(input.rp_id || "").trim().toLowerCase();
  const credentialId = String(input.credential_id || "").trim();
  if (!/^[A-Za-z0-9_-]{16,1024}$/.test(credentialId)) throw fail(400, "WEBAUTHN_CREDENCIAL_INVALIDA", "La credencial del celular es invalida.");
  if (Number(input.public_key_algorithm) !== COSE_ALG_ES256) {
    throw fail(400, "WEBAUTHN_ALGORITMO_NO_SOPORTADO", "El celular debe usar una llave ES256 (P-256).");
  }
  publicKeyFrom(input.public_key);

  const { data: clientData } = parseClientData(input.client_data_json);
  if (clientData.type !== "webauthn.create") throw fail(400, "WEBAUTHN_TIPO_INVALIDO", "Los datos no corresponden a un registro.");
  checkRegistrationChallenge(clientData.challenge, { tenantId, userId: user.id, secret, now });
  const authData = parseAuthenticatorData(b64urlToBuffer(input.authenticator_data));
  assertOriginAndRp({ clientData, authData, rpId, allowedOrigins, allowedRpIds });

  return {
    device_id: deviceId,
    credential_id: credentialId,
    public_key: String(input.public_key),
    key_algorithm: SHARED_KEY_ALGORITHM,
    sign_count: authData.signCount,
    rp_id: rpId,
    vehicle_plate: vehiclePlate,
    label: String(input.label || "").trim().slice(0, 80) || null,
    device_model: String(input.device_model || "").trim().slice(0, 120) || null
  };
}

// ---------------------------------------------------------------- marcacion
// Cadena firmada. La web movil (apexos-web-movil/src/modules/attendance/crew.ts)
// arma exactamente esta misma cadena: cualquier cambio rompe la verificacion.
function crewPunchMessage({ employeeId, type, punchedAt, idempotencyKey, deviceId, photoSha256 }) {
  return ["apexos-crew-punch", "v1", String(employeeId), String(type), String(punchedAt), String(idempotencyKey), String(deviceId), String(photoSha256)].join("|");
}

const challengeForMessage = (message) => bufferToB64url(sha256(Buffer.from(message, "utf8")));

function verifyCrewAssertion({ device, employeeId, input = {}, allowedOrigins, allowedRpIds, now = new Date() }) {
  if (!device || device.active === false) {
    throw fail(403, "CELULAR_NO_REGISTRADO", "Este celular no esta registrado o fue revocado. Pide a talento humano que lo registre.");
  }
  const metadata = input.metadata || {};
  const identity = metadata.identity && typeof metadata.identity === "object" ? metadata.identity : null;
  if (!identity?.signature || !identity.authenticator_data || !identity.client_data_json) {
    throw fail(403, "IDENTIDAD_REQUERIDA", "La marcacion del camion debe venir firmada con la huella del celular.");
  }
  if (String(identity.device_id || "") !== device.device_id || String(identity.credential_id || "") !== device.credential_id) {
    throw fail(403, "CELULAR_NO_COINCIDE", "La firma no corresponde al celular registrado del camion.");
  }
  // En el celular compartido la selfie es la prueba de QUIEN marco: obligatoria siempre.
  const photo = input.identity_photo && typeof input.identity_photo === "object" ? input.identity_photo : null;
  if (!photo?.base64 && !photo?.base64_data) {
    throw fail(400, "SELFIE_REQUERIDA", "Toma la selfie de la persona que marca.");
  }
  const selfie = normalizeSelfie(photo, { maxBytes: MAX_SHARED_SELFIE_BYTES });

  const message = crewPunchMessage({
    employeeId,
    type: input.type,
    punchedAt: input.punched_at,
    idempotencyKey: input.idempotency_key,
    deviceId: device.device_id,
    photoSha256: selfie.sha256
  });
  const { raw: clientRaw, data: clientData } = parseClientData(identity.client_data_json);
  if (clientData.type !== "webauthn.get") throw fail(400, "WEBAUTHN_TIPO_INVALIDO", "Los datos no corresponden a una firma de marcacion.");
  if (clientData.challenge !== challengeForMessage(message)) {
    throw fail(403, "FIRMA_NO_CORRESPONDE", "La firma no corresponde a esta marcacion (empleado, hora, tipo o selfie cambiaron).");
  }
  const authRaw = b64urlToBuffer(identity.authenticator_data);
  const authData = parseAuthenticatorData(authRaw);
  assertOriginAndRp({ clientData, authData, rpId: device.rp_id, allowedOrigins, allowedRpIds });

  // WebAuthn firma authenticatorData || sha256(clientDataJSON), ES256 en DER.
  const signed = Buffer.concat([authRaw, sha256(clientRaw)]);
  let valid = false;
  try {
    valid = crypto.verify("sha256", signed, { key: publicKeyFrom(device.public_key), dsaEncoding: "der" }, b64urlToBuffer(identity.signature));
  } catch {
    valid = false;
  }
  if (!valid) throw fail(403, "FIRMA_BIOMETRICA_INVALIDA", "No fue posible comprobar la huella del celular del camion.");

  // Muchos autenticadores de plataforma reportan siempre 0. Un contador que no
  // avanza se deja SENALADO para auditoria en vez de bloquear: el reintento de una
  // marcacion encolada repite su misma firma y no debe perderse.
  const stored = Number(device.sign_count || 0);
  const signCountRegression = authData.signCount !== 0 && authData.signCount <= stored;

  return {
    sign_count: Math.max(stored, authData.signCount),
    metadata: {
      identity_verification: {
        status: "device_verified",
        method: SHARED_KEY_ALGORITHM,
        channel: "shared_device",
        device_id: device.device_id,
        vehicle_plate: device.vehicle_plate,
        verified_at: now.toISOString(),
        // Lo que prueba y lo que no, a la vista del supervisor.
        proves: "celular_autorizado",
        person_evidence: "selfie",
        ...(signCountRegression ? { sign_count_regression: true } : {})
      },
      identity_photo: selfie.stored
    }
  };
}

function webauthnConfig(env = process.env) {
  return {
    allowedOrigins: normalizeList(env.WEBAUTHN_ORIGINS),
    allowedRpIds: normalizeList(env.WEBAUTHN_RP_IDS).map((v) => v.toLowerCase())
  };
}

module.exports = {
  SHARED_DEVICE_SOURCE,
  SHARED_KEY_ALGORITHM,
  COSE_ALG_ES256,
  b64urlToBuffer,
  bufferToB64url,
  cleanPlate,
  parseAuthenticatorData,
  issueRegistrationChallenge,
  checkRegistrationChallenge,
  verifyRegistration,
  crewPunchMessage,
  challengeForMessage,
  verifyCrewAssertion,
  webauthnConfig,
  // Reutilizados por personal-webauthn.js (huella propia de cada empleado).
  parseClientData,
  assertOriginAndRp
};
