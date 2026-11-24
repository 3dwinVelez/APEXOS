const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");

process.env.DISABLE_REDIS = "true";

const personal = require("../src/modules/hr/personal-webauthn");
const shared = require("../src/modules/hr/shared-device-identity");

// Huella propia de cada empleado (WebAuthn) para marcar desde el navegador, junto con
// el rostro. Autenticador simulado: llaves P-256 reales y el formato del estandar.

const RP_ID = "movil.apexos.test";
const ORIGIN = "https://movil.apexos.test";
const CONFIG = { allowedOrigins: [ORIGIN], allowedRpIds: [RP_ID] };
const SECRET = "secreto-de-prueba";
const TENANT = "tenant-qa";
const USER = { id: 7, email: "tecnico@apexos.local", role: { name: "Operario" } };
const NOW = new Date("2026-11-22T14:00:00.000Z");
// JPEG real (24x24, generado con sharp): la compuerta de evidencia de mobile-identity.js decodifica la selfie.
const JPEG = Buffer.from("/9j/2wBDAA0JCgsKCA0LCgsODg0PEyAVExISEyccHhcgLikxMC4pLSwzOko+MzZGNywtQFdBRkxOUlNSMj5aYVpQYEpRUk//2wBDAQ4ODhMREyYVFSZPNS01T09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0//wAARCAAYABgDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAT/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFgEBAQEAAAAAAAAAAAAAAAAAAAID/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AlAZrAAAAAAf/2Q==", "base64");
const sha = (b) => crypto.createHash("sha256").update(b).digest();
const b64url = (b) => Buffer.from(b).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

function authenticator() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  return { privateKey, publicKey: publicKey.export({ format: "der", type: "spki" }).toString("base64"), credentialId: b64url(crypto.randomBytes(32)) };
}
function authData({ rpId = RP_ID, flags = 0x05, count = 0 } = {}) {
  const c = Buffer.alloc(4);
  c.writeUInt32BE(count);
  return Buffer.concat([sha(Buffer.from(rpId, "utf8")), Buffer.from([flags]), c]);
}
const clientData = (type, challenge, origin = ORIGIN) => Buffer.from(JSON.stringify({ type, challenge, origin, crossOrigin: false }), "utf8");

function registration(key, extra = {}) {
  const { challenge } = shared.issueRegistrationChallenge({ tenantId: TENANT, userId: USER.id, secret: SECRET, now: NOW });
  return {
    credential_id: key.credentialId,
    public_key: key.publicKey,
    public_key_algorithm: -7,
    client_data_json: b64url(clientData("webauthn.create", challenge, extra.origin)),
    authenticator_data: b64url(authData({ flags: extra.flags ?? 0x45 })),
    rp_id: RP_ID
  };
}

function credential(key, extra = {}) {
  return { id: 1, tenant_id: TENANT, employee_id: 222, user_id: 7, credential_id: key.credentialId, public_key: key.publicKey, sign_count: 0, rp_id: RP_ID, active: true, ...extra };
}

// Marcacion firmada como lo hace la web movil.
function punch(key, o = {}) {
  const body = {
    user_name: "EMP-222",
    type: o.type || "entrada",
    punched_at: o.punchedAt || NOW.toISOString(),
    idempotency_key: o.idem || "uuid-web-0001",
    identity_photo: { base64: `data:image/jpeg;base64,${JPEG.toString("base64")}`, name: "selfie.jpg", type: "image/jpeg", size: JPEG.length },
    metadata: { source: "apexos-web-movil" }
  };
  const msg = personal.personalPunchMessage({
    userId: o.signedUser ?? USER.id,
    type: o.signedType || body.type,
    punchedAt: body.punched_at,
    idempotencyKey: o.signedIdem || body.idempotency_key,
    credentialId: key.credentialId
  });
  const cd = clientData("webauthn.get", shared.challengeForMessage(msg), o.origin);
  const ad = authData({ rpId: o.rpId, flags: o.flags ?? 0x05, count: o.count ?? 0 });
  const signer = o.signer || key;
  body.metadata.webauthn = {
    credential_id: key.credentialId,
    authenticator_data: b64url(ad),
    client_data_json: b64url(cd),
    signature: b64url(crypto.sign("sha256", Buffer.concat([ad, sha(cd)]), { key: signer.privateKey, dsaEncoding: "der" }))
  };
  return body;
}

const verify = (cred, body) =>
  personal.verifyPersonalAssertion({ credential: cred, user: USER, input: body, ...CONFIG, now: NOW });
const rejects = (fn, code) => assert.throws(fn, (e) => e.code === code, `debia fallar con ${code}`);

test("registro de la huella propia valido", () => {
  const key = authenticator();
  const rec = personal.verifyPersonalRegistration({ input: registration(key), tenantId: TENANT, user: USER, secret: SECRET, ...CONFIG, now: NOW });
  assert.equal(rec.credential_id, key.credentialId);
  assert.equal(rec.rp_id, RP_ID);
});

test("registro desde otro origen o sin huella verificada se rechaza", () => {
  const key = authenticator();
  rejects(() => personal.verifyPersonalRegistration({ input: registration(key, { origin: "https://evil.example" }), tenantId: TENANT, user: USER, secret: SECRET, ...CONFIG, now: NOW }), "WEBAUTHN_ORIGEN_NO_PERMITIDO");
  rejects(() => personal.verifyPersonalRegistration({ input: registration(key, { flags: 0x01 }), tenantId: TENANT, user: USER, secret: SECRET, ...CONFIG, now: NOW }), "HUELLA_NO_VERIFICADA");
  rejects(() => personal.verifyPersonalRegistration({ input: registration(key), tenantId: TENANT, user: { id: 99 }, secret: SECRET, ...CONFIG, now: NOW }), "WEBAUTHN_RETO_AJENO");
});

test("marcacion firmada con la huella propia queda verificada", () => {
  const key = authenticator();
  const r = verify(credential(key), punch(key));
  assert.equal(r.fingerprint.status, "verificada");
  assert.equal(r.fingerprint.credential_id, key.credentialId);
});

test("la firma (huella primero, sin selfie) no se reusa para otro usuario, tipo o identificador", () => {
  const key = authenticator();
  rejects(() => verify(credential(key), punch(key, { signedUser: 99 })), "FIRMA_NO_CORRESPONDE");
  rejects(() => verify(credential(key), punch(key, { type: "salida", signedType: "entrada" })), "FIRMA_NO_CORRESPONDE");
  rejects(() => verify(credential(key), punch(key, { idem: "uuid-otra-marcacion", signedIdem: "uuid-web-0001" })), "FIRMA_NO_CORRESPONDE");
});

test("el mensaje firmado es v2 y no incluye la selfie (se toma despues de la huella)", () => {
  const m = personal.personalPunchMessage({ userId: 7, type: "entrada", punchedAt: "2026-11-22T14:00:00.000Z", idempotencyKey: "uuid-web-0001", credentialId: "cred-abc_123-XYZ" });
  assert.equal(m, "apexos-web-punch|v2|7|entrada|2026-11-22T14:00:00.000Z|uuid-web-0001|cred-abc_123-XYZ");
});

test("firma de otra llave, llave revocada u origen ajeno se rechaza", () => {
  const key = authenticator();
  rejects(() => verify(credential(key), punch(key, { signer: authenticator() })), "FIRMA_BIOMETRICA_INVALIDA");
  rejects(() => verify(credential(key, { active: false }), punch(key)), "HUELLA_NO_REGISTRADA");
  rejects(() => verify(undefined, punch(key)), "HUELLA_NO_REGISTRADA");
  rejects(() => verify(credential(key), punch(key, { origin: "https://evil.example" })), "WEBAUTHN_ORIGEN_NO_PERMITIDO");
  rejects(() => verify(credential(key), punch(key, { flags: 0x01 })), "HUELLA_NO_VERIFICADA");
});

// ------------------------------------------------------------------ servicio

function loadHrService(fakePrisma) {
  const prismaPath = require.resolve("../src/core/prisma");
  const servicePath = require.resolve("../src/modules/hr/service");
  const prevP = require.cache[prismaPath];
  const prevS = require.cache[servicePath];
  require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: fakePrisma };
  delete require.cache[servicePath];
  return {
    service: require(servicePath),
    restore() {
      delete require.cache[servicePath];
      if (prevS) require.cache[servicePath] = prevS;
      if (prevP) require.cache[prismaPath] = prevP;
      else delete require.cache[prismaPath];
    }
  };
}

const employee = { id: 222, tenant_id: TENANT, user_id: 7, code: "EMP-222", user_type: "operario", active: true, metadata: { name: "Tecnico" }, user: { id: 7, name: "Tecnico", email: "tecnico@apexos.local" } };

function fakePrisma(capture, creds) {
  const tx = {
    employee: { findFirst: async () => employee },
    timeRoute: { findFirst: async () => null },
    routePreoperationalChecklist: { findFirst: async () => null },
    timePunch: { findFirst: async () => null, findMany: async () => [], create: async ({ data }) => { capture.punches.push(data); return { id: 91, ...data }; } },
    gpsPing: { create: async () => ({}) },
    workSession: { findFirst: async () => null, create: async () => ({}), update: async () => ({}) },
    $executeRaw: async () => {},
    $queryRaw: async (s) => (String(s?.join ? s.join("") : s).includes("pg_try_advisory_xact_lock") ? [{ acquired: true }] : [])
  };
  return {
    runWithTenant: (_t, cb) => cb(),
    $transaction: async (cb) => cb(tx),
    employee: { findFirst: async () => employee },
    hrWebauthnCredential: {
      findMany: async () => creds.filter((c) => c.active),
      update: async ({ data }) => { capture.credUpdates.push(data); return {}; }
    },
    hrFaceEnrollment: { findFirst: async () => null },
    timePunch: { findFirst: async () => null },
    workSession: { findFirst: async () => null },
    timeRoute: { findFirst: async () => null, findMany: async () => [] }
  };
}

function withEnv(fn) {
  const prev = { o: process.env.WEBAUTHN_ORIGINS, r: process.env.WEBAUTHN_RP_IDS };
  process.env.WEBAUTHN_ORIGINS = ORIGIN;
  process.env.WEBAUTHN_RP_IDS = RP_ID;
  return Promise.resolve(fn()).finally(() => {
    if (prev.o === undefined) delete process.env.WEBAUTHN_ORIGINS; else process.env.WEBAUTHN_ORIGINS = prev.o;
    if (prev.r === undefined) delete process.env.WEBAUTHN_RP_IDS; else process.env.WEBAUTHN_RP_IDS = prev.r;
  });
}

test("servicio: marcacion web con selfie + huella valida queda con fingerprint verificada", () => withEnv(async () => {
  const key = authenticator();
  const capture = { punches: [], credUpdates: [] };
  const loaded = loadHrService(fakePrisma(capture, [credential(key)]));
  try {
    const body = punch(key, { punchedAt: new Date().toISOString(), count: 4 });
    const r = await loaded.service.createOwnPunch(TENANT, USER, body);
    assert.equal(r.ok, true, JSON.stringify(r));
    const meta = capture.punches[0].metadata;
    assert.equal(meta.identity_verification.fingerprint.status, "verificada");
    assert.equal(meta.webauthn, undefined, "la firma cruda no se guarda");
    assert.equal(capture.credUpdates[0].sign_count, 4);
  } finally {
    loaded.restore();
  }
}));

test("servicio: firma de huella invalida RECHAZA la marcacion (manipulacion)", () => withEnv(async () => {
  const key = authenticator();
  const capture = { punches: [], credUpdates: [] };
  const loaded = loadHrService(fakePrisma(capture, [credential(key)]));
  try {
    const body = punch(key, { punchedAt: new Date().toISOString(), signer: authenticator() });
    await assert.rejects(loaded.service.createOwnPunch(TENANT, USER, body), (e) => e.code === "FIRMA_BIOMETRICA_INVALIDA");
    assert.equal(capture.punches.length, 0);
  } finally {
    loaded.restore();
  }
}));

test("servicio: con huella registrada pero sin presentarla, la marcacion queda SENALADA", () => withEnv(async () => {
  const key = authenticator();
  const capture = { punches: [], credUpdates: [] };
  const loaded = loadHrService(fakePrisma(capture, [credential(key)]));
  try {
    const body = punch(key, { punchedAt: new Date().toISOString() });
    delete body.metadata.webauthn;
    await loaded.service.createOwnPunch(TENANT, USER, body);
    assert.equal(capture.punches[0].metadata.identity_verification.fingerprint.status, "no_presentada");
  } finally {
    loaded.restore();
  }
}));
