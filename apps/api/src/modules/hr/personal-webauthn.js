// Huella PROPIA de cada empleado para marcar jornada desde el navegador (WebAuthn).
//
// La marcacion web exige DOS pruebas:
//  1. El ROSTRO: la selfie se compara con el rostro registrado (face-identity.js).
//  2. La HUELLA: cada empleado registra, con su usuario, una llave de acceso WebAuthn
//     (ES256) en el celular; cada marcacion va firmada con esa llave tras la huella.
//
// Limite que debe quedar claro: el lector del telefono acepta cualquier huella inscrita
// en el y no dice de quien es. En un celular compartido la huella prueba que la marcacion
// salio de ese celular con la llave de ese usuario; QUIEN marco lo prueba el rostro.
//
// El reto firmado es sha256 del mensaje canonico (sin pedir reto al servidor), asi que la
// marcacion se firma SIN SENAL y se envia despues. Orden en el celular: PRIMERO la huella
// (firma usuario, tipo, hora, idempotencia y llave) y DESPUES la selfie; por eso la selfie
// no va en la firma: la valida el rostro registrado (face-identity.js).
// Funciones puras, sin base de datos: hr/service.js las conecta con Prisma.
const crypto = require("node:crypto");
const { publicKeyFrom } = require("./mobile-identity");
const shared = require("./shared-device-identity");

const PERSONAL_KEY_ALGORITHM = "WEBAUTHN_ES256";

function fail(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

const sha256 = (data) => crypto.createHash("sha256").update(data).digest();

// Firma WebAuthn: ECDSA-SHA256 (DER) sobre authenticatorData || sha256(clientDataJSON).
function signatureValid({ authRaw, clientRaw, publicKey, signature }) {
  try {
    return crypto.verify("sha256", Buffer.concat([authRaw, sha256(clientRaw)]), { key: publicKeyFrom(publicKey), dsaEncoding: "der" }, shared.b64urlToBuffer(signature));
  } catch {
    return false;
  }
}

// Registro de la llave propia. Mismas verificaciones que el celular del camion, sin placa.
function verifyPersonalRegistration({ input = {}, tenantId, user, secret, allowedOrigins, allowedRpIds, now = new Date() }) {
  if (!user?.id) throw fail(401, "NO_AUTENTICADO", "Sesion requerida para registrar la huella.");
  const rpId = String(input.rp_id || "").trim().toLowerCase();
  const credentialId = String(input.credential_id || "").trim();
  if (!/^[A-Za-z0-9_-]{16,1024}$/.test(credentialId)) throw fail(400, "WEBAUTHN_CREDENCIAL_INVALIDA", "La credencial de la huella es invalida.");
  if (Number(input.public_key_algorithm) !== shared.COSE_ALG_ES256) {
    throw fail(400, "WEBAUTHN_ALGORITMO_NO_SOPORTADO", "El celular debe usar una llave ES256 (P-256).");
  }
  publicKeyFrom(input.public_key);
  const { data: clientData } = shared.parseClientData(input.client_data_json);
  if (clientData.type !== "webauthn.create") throw fail(400, "WEBAUTHN_TIPO_INVALIDO", "Los datos no corresponden a un registro.");
  shared.checkRegistrationChallenge(clientData.challenge, { tenantId, userId: user.id, secret, now });
  const authData = shared.parseAuthenticatorData(shared.b64urlToBuffer(input.authenticator_data));
  shared.assertOriginAndRp({ clientData, authData, rpId, allowedOrigins, allowedRpIds });
  return {
    credential_id: credentialId,
    public_key: String(input.public_key),
    key_algorithm: PERSONAL_KEY_ALGORITHM,
    sign_count: authData.signCount,
    rp_id: rpId,
    device_label: String(input.device_label || "").trim().slice(0, 120) || null
  };
}

// Cadena firmada. La web movil (src/services/webauthn.ts) arma EXACTAMENTE esta cadena.
function personalPunchMessage({ userId, type, punchedAt, idempotencyKey, credentialId }) {
  return ["apexos-web-punch", "v2", String(userId), String(type), String(punchedAt), String(idempotencyKey), String(credentialId)].join("|");
}

// Verifica la firma de la huella de una marcacion. Lanza si es invalida (manipulacion).
function verifyPersonalAssertion({ credential, user, input = {}, allowedOrigins, allowedRpIds, now = new Date() }) {
  const webauthn = input.metadata?.webauthn && typeof input.metadata.webauthn === "object" ? input.metadata.webauthn : null;
  if (!webauthn?.signature || !webauthn.authenticator_data || !webauthn.client_data_json) {
    throw fail(403, "HUELLA_REQUERIDA", "La marcacion debe venir firmada con tu huella.");
  }
  if (!credential || credential.active === false || String(webauthn.credential_id || "") !== credential.credential_id) {
    throw fail(403, "HUELLA_NO_REGISTRADA", "La huella no corresponde a una llave registrada para tu usuario.");
  }
  const message = personalPunchMessage({
    userId: user?.id,
    type: input.type,
    punchedAt: input.punched_at,
    idempotencyKey: input.idempotency_key,
    credentialId: credential.credential_id
  });
  const { raw: clientRaw, data: clientData } = shared.parseClientData(webauthn.client_data_json);
  if (clientData.type !== "webauthn.get") throw fail(400, "WEBAUTHN_TIPO_INVALIDO", "Los datos no corresponden a una firma de marcacion.");
  if (clientData.challenge !== shared.challengeForMessage(message)) {
    throw fail(403, "FIRMA_NO_CORRESPONDE", "La firma de la huella no corresponde a esta marcacion (usuario, hora o tipo cambiaron).");
  }
  const authRaw = shared.b64urlToBuffer(webauthn.authenticator_data);
  const authData = shared.parseAuthenticatorData(authRaw);
  shared.assertOriginAndRp({ clientData, authData, rpId: credential.rp_id, allowedOrigins, allowedRpIds });
  if (!signatureValid({ authRaw, clientRaw, publicKey: credential.public_key, signature: webauthn.signature })) {
    throw fail(403, "FIRMA_BIOMETRICA_INVALIDA", "No fue posible comprobar tu huella en esta marcacion.");
  }
  const stored = Number(credential.sign_count || 0);
  return {
    sign_count: Math.max(stored, authData.signCount),
    fingerprint: {
      status: "verificada",
      method: PERSONAL_KEY_ALGORITHM,
      credential_id: credential.credential_id,
      verified_at: now.toISOString(),
      ...(authData.signCount !== 0 && authData.signCount <= stored ? { sign_count_regression: true } : {})
    }
  };
}

// ---------------------------------------------------------------- ingreso con huella
// Entrar a la app con la huella registrada en el celular, sin correo ni clave. Usa la
// MISMA llave que firma las marcaciones. El reto es un token HMAC de UN SOLO USO
// (empresa, usuario, vencimiento y proposito "login"): no hay tabla de retos.
// Limite: el lector del celular acepta cualquier huella inscrita en el. En un celular
// compartido la huella prueba el celular y la llave del usuario, no la persona; por eso
// marcar jornada exige ademas el rostro.
const LOGIN_CHALLENGE_TTL_MS = 2 * 60 * 1000;
// Retos ya usados hasta que vencen (por instancia del servidor). Junto con el
// vencimiento de 2 minutos impide reenviar una firma capturada.
const usedLoginNonces = new Map();

function loginError(code = "HUELLA_INGRESO_INVALIDO") {
  return fail(401, code, "No fue posible entrar con tu huella. Entra con tu correo y clave.");
}

function loginMac(payload, secret) {
  return shared.bufferToB64url(crypto.createHmac("sha256", secret).update(payload).digest());
}

function issueLoginChallenge({ tenantId, userId, secret, now = new Date() }) {
  if (!secret) throw fail(500, "CONFIGURACION_INCOMPLETA", "Falta la llave del servidor para firmar el reto.");
  const t = String(tenantId ?? "").trim();
  const u = Number(userId);
  if (!t || !Number.isInteger(u) || u <= 0) throw fail(400, "HUELLA_INGRESO_DATOS", "Faltan la empresa o el usuario de la huella.");
  const payload = shared.bufferToB64url(Buffer.from(JSON.stringify({
    p: "login",
    t,
    u,
    e: now.getTime() + LOGIN_CHALLENGE_TTL_MS,
    n: shared.bufferToB64url(crypto.randomBytes(16))
  })));
  // El navegador firma los BYTES del reto; se entregan como base64url.
  return { challenge: shared.bufferToB64url(Buffer.from(`${payload}.${loginMac(payload, secret)}`, "utf8")), expires_in_seconds: LOGIN_CHALLENGE_TTL_MS / 1000 };
}

// Valida y CONSUME el reto. Devuelve la empresa y el usuario que firmo el servidor.
function consumeLoginChallenge(challengeB64url, { secret, now = new Date() }) {
  const token = shared.b64urlToBuffer(String(challengeB64url || "")).toString("utf8");
  const [payload, mac] = token.split(".");
  const expected = payload && secret ? loginMac(payload, secret) : "";
  const macOk = Boolean(mac) && mac.length === expected.length && crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected));
  if (!macOk) throw loginError("HUELLA_RETO_INVALIDO");
  let data;
  try {
    data = JSON.parse(shared.b64urlToBuffer(payload).toString("utf8"));
  } catch {
    throw loginError("HUELLA_RETO_INVALIDO");
  }
  if (data.p !== "login" || !data.t || !Number.isInteger(data.u) || !data.n) throw loginError("HUELLA_RETO_INVALIDO");
  const nowMs = now.getTime();
  if (nowMs > Number(data.e)) throw loginError("HUELLA_RETO_VENCIDO");
  for (const [nonce, expires] of usedLoginNonces) if (expires < nowMs) usedLoginNonces.delete(nonce);
  if (usedLoginNonces.has(data.n)) throw loginError("HUELLA_RETO_USADO");
  usedLoginNonces.set(data.n, Number(data.e));
  return { tenantId: String(data.t), userId: Number(data.u) };
}

// Verifica la firma de ingreso. Cualquier falla responde 401 con el mismo mensaje.
function verifyLoginAssertion({ credential, userId, input = {}, allowedOrigins, allowedRpIds }) {
  if (!credential || credential.active === false || Number(credential.user_id) !== Number(userId) || String(input.credential_id || "") !== credential.credential_id) {
    throw loginError("HUELLA_NO_REGISTRADA");
  }
  if (!input.signature || !input.authenticator_data || !input.client_data_json) throw loginError();
  let clientRaw;
  let authRaw;
  let authData;
  try {
    const parsed = shared.parseClientData(input.client_data_json);
    clientRaw = parsed.raw;
    if (parsed.data.type !== "webauthn.get" || parsed.data.challenge !== String(input.challenge || "")) throw loginError("HUELLA_RETO_NO_CORRESPONDE");
    authRaw = shared.b64urlToBuffer(input.authenticator_data);
    authData = shared.parseAuthenticatorData(authRaw);
    shared.assertOriginAndRp({ clientData: parsed.data, authData, rpId: credential.rp_id, allowedOrigins, allowedRpIds });
  } catch (error) {
    throw error.statusCode === 401 ? error : loginError(error.code);
  }
  if (!signatureValid({ authRaw, clientRaw, publicKey: credential.public_key, signature: input.signature })) throw loginError("FIRMA_BIOMETRICA_INVALIDA");
  const stored = Number(credential.sign_count || 0);
  // Contador que no avanza = posible llave clonada (si el celular lleva contador).
  if (authData.signCount !== 0 && authData.signCount <= stored) throw loginError("HUELLA_CONTADOR_INVALIDO");
  return { sign_count: Math.max(stored, authData.signCount) };
}

module.exports = {
  PERSONAL_KEY_ALGORITHM,
  verifyPersonalRegistration,
  personalPunchMessage,
  verifyPersonalAssertion,
  issueLoginChallenge,
  consumeLoginChallenge,
  verifyLoginAssertion
};
