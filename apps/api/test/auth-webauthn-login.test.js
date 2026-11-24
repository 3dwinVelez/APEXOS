const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");

// Ingreso a la web movil con la huella registrada en Marcar jornada (WebAuthn).
// Autenticador simulado: llaves P-256 reales y el formato del estandar.

process.env.DISABLE_REDIS = "true";
process.env.JWT_SECRET = "secreto-de-prueba-con-mas-de-24-caracteres";

const jwt = require("../src/security/jwt");
const personal = require("../src/modules/hr/personal-webauthn");

const RP_ID = "movil.apexos.test";
const ORIGIN = "https://movil.apexos.test";
const CONFIG = { allowedOrigins: [ORIGIN], allowedRpIds: [RP_ID] };
const SECRET = process.env.JWT_SECRET;
const TENANT = "empresa-a";
const USER_ID = 7;
const NOW = new Date("2026-11-22T14:00:00.000Z");
const sha = (b) => crypto.createHash("sha256").update(b).digest();
const b64url = (b) => Buffer.from(b).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

function authenticator() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  return { privateKey, publicKey: publicKey.export({ format: "der", type: "spki" }).toString("base64"), credentialId: b64url(crypto.randomBytes(32)) };
}

function credential(key, extra = {}) {
  return { id: 1, tenant_id: TENANT, employee_id: 222, user_id: USER_ID, credential_id: key.credentialId, public_key: key.publicKey, sign_count: 0, rp_id: RP_ID, active: true, ...extra };
}

// Lo que envia la web movil: reto del servidor firmado con la huella.
function assertion(key, challenge, o = {}) {
  const cd = Buffer.from(JSON.stringify({ type: o.type || "webauthn.get", challenge: o.signedChallenge || challenge, origin: o.origin || ORIGIN, crossOrigin: false }), "utf8");
  const count = Buffer.alloc(4);
  count.writeUInt32BE(o.count ?? 0);
  const ad = Buffer.concat([sha(Buffer.from(o.rpId || RP_ID, "utf8")), Buffer.from([o.flags ?? 0x05]), count]);
  const signer = o.signer || key;
  return {
    challenge,
    credential_id: o.credentialId || key.credentialId,
    authenticator_data: b64url(ad),
    client_data_json: b64url(cd),
    signature: b64url(crypto.sign("sha256", Buffer.concat([ad, sha(cd)]), { key: signer.privateKey, dsaEncoding: "der" }))
  };
}

const issue = (o = {}) => personal.issueLoginChallenge({ tenantId: TENANT, userId: USER_ID, secret: SECRET, now: NOW, ...o }).challenge;
const rejects = (fn, code) => assert.throws(fn, (e) => e.statusCode === 401 && e.code === code, `debia fallar con ${code}`);

// ------------------------------------------------------------------ funciones puras

test("el reto de ingreso lleva empresa y usuario y es de un solo uso", () => {
  const challenge = issue();
  assert.deepEqual(personal.consumeLoginChallenge(challenge, { secret: SECRET, now: NOW }), { tenantId: TENANT, userId: USER_ID });
  rejects(() => personal.consumeLoginChallenge(challenge, { secret: SECRET, now: NOW }), "HUELLA_RETO_USADO");
});

test("reto vencido, alterado o de registro no sirve para entrar", () => {
  rejects(() => personal.consumeLoginChallenge(issue(), { secret: SECRET, now: new Date(NOW.getTime() + 3 * 60 * 1000) }), "HUELLA_RETO_VENCIDO");
  rejects(() => personal.consumeLoginChallenge(issue(), { secret: "otra-llave", now: NOW }), "HUELLA_RETO_INVALIDO");
  const token = Buffer.from(issue(), "base64url").toString("utf8");
  const [payload, mac] = token.split(".");
  const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  const forged = b64url(Buffer.from(`${b64url(Buffer.from(JSON.stringify({ ...data, u: 99 })))}.${mac}`));
  rejects(() => personal.consumeLoginChallenge(forged, { secret: SECRET, now: NOW }), "HUELLA_RETO_INVALIDO");
  const shared = require("../src/modules/hr/shared-device-identity");
  const registration = shared.issueRegistrationChallenge({ tenantId: TENANT, userId: USER_ID, secret: SECRET, now: NOW }).challenge;
  rejects(() => personal.consumeLoginChallenge(registration, { secret: SECRET, now: NOW }), "HUELLA_RETO_INVALIDO");
});

test("firma de ingreso valida con la llave del usuario", () => {
  const key = authenticator();
  const r = personal.verifyLoginAssertion({ credential: credential(key, { sign_count: 3 }), userId: USER_ID, input: assertion(key, issue(), { count: 4 }), ...CONFIG });
  assert.equal(r.sign_count, 4);
});

test("firma de otra llave, de otro usuario, otro reto u origen ajeno se rechaza", () => {
  const key = authenticator();
  const verify = (input, cred = credential(key), userId = USER_ID) => personal.verifyLoginAssertion({ credential: cred, userId, input, ...CONFIG });
  rejects(() => verify(assertion(key, issue(), { signer: authenticator() })), "FIRMA_BIOMETRICA_INVALIDA");
  rejects(() => verify(assertion(key, issue()), credential(key), 99), "HUELLA_NO_REGISTRADA");
  rejects(() => verify(assertion(key, issue()), credential(key, { active: false })), "HUELLA_NO_REGISTRADA");
  rejects(() => verify(assertion(key, issue()), null), "HUELLA_NO_REGISTRADA");
  rejects(() => verify(assertion(key, issue(), { signedChallenge: issue() })), "HUELLA_RETO_NO_CORRESPONDE");
  rejects(() => verify(assertion(key, issue(), { type: "webauthn.create" })), "HUELLA_RETO_NO_CORRESPONDE");
  rejects(() => verify(assertion(key, issue(), { origin: "https://evil.example" })), "WEBAUTHN_ORIGEN_NO_PERMITIDO");
  rejects(() => verify(assertion(key, issue(), { flags: 0x01 })), "HUELLA_NO_VERIFICADA");
  rejects(() => verify(assertion(key, issue(), { count: 2 }), credential(key, { sign_count: 5 })), "HUELLA_CONTADOR_INVALIDO");
});

// ------------------------------------------------------------------ servicio de auth

function loadAuth(state) {
  const paths = {
    prisma: require.resolve("../src/core/prisma"),
    queues: require.resolve("../src/fabric/queues"),
    accounting: require.resolve("../src/modules/accounting/service"),
    service: require.resolve("../src/modules/auth/service"),
    authState: require.resolve("../src/security/authorizationState")
  };
  const previous = Object.fromEntries(Object.entries(paths).map(([k, p]) => [k, require.cache[p]]));
  const prisma = {
    user: {
      async findFirst({ where }) {
        const u = state.user;
        return u && u.id === where.id && u.tenant_id === where.tenant_id ? u : null;
      },
      async update({ data }) { Object.assign(state.user, data); return state.user; }
    },
    tenant: { async findUnique() { return state.tenant; } },
    hrWebauthnCredential: {
      async findFirst({ where }) {
        return state.creds.find((c) => c.tenant_id === where.tenant_id && c.credential_id === where.credential_id && c.active === where.active) || null;
      },
      async update({ data }) { state.credUpdates.push(data); return {}; }
    },
    authorizationSession: {
      async create({ data }) { const row = { id: `session-${state.sessions.length + 1}`, revoked_at: null, ...data }; state.sessions.push(row); return row; }
    }
  };
  require.cache[paths.prisma] = { id: paths.prisma, filename: paths.prisma, loaded: true, exports: prisma };
  require.cache[paths.queues] = { id: paths.queues, filename: paths.queues, loaded: true, exports: { brainQueue: { add: async () => ({}) }, auditQueue: { add: async () => ({}) } } };
  require.cache[paths.accounting] = { id: paths.accounting, filename: paths.accounting, loaded: true, exports: { initChartOfAccounts: async () => undefined } };
  delete require.cache[paths.service];
  delete require.cache[paths.authState];
  return {
    service: require(paths.service),
    restore() {
      for (const [k, p] of Object.entries(paths)) {
        if (previous[k]) require.cache[p] = previous[k];
        else delete require.cache[p];
      }
    }
  };
}

function authState(key, user = {}) {
  return {
    user: { id: USER_ID, name: "Tecnico Demo", email: "tecnico@apexos.local", tenant_id: TENANT, active: true, authorization_version: 1, role: { id: 2, name: "Tecnico", permissions: [] }, ...user },
    tenant: { id: TENANT, name: "Empresa A", active: true, authorization_version: 1, active_modules: [], config: {} },
    creds: [credential(key)],
    credUpdates: [],
    sessions: []
  };
}

async function withEnv(fn, env = { WEBAUTHN_ORIGINS: ORIGIN, WEBAUTHN_RP_IDS: RP_ID }) {
  const prev = { WEBAUTHN_ORIGINS: process.env.WEBAUTHN_ORIGINS, WEBAUTHN_RP_IDS: process.env.WEBAUTHN_RP_IDS };
  for (const [k, v] of Object.entries(env)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
  try {
    return await fn();
  } finally {
    for (const [k, v] of Object.entries(prev)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
}

test("servicio: entrar con la huella devuelve la misma sesion que el correo y la clave", () => withEnv(async () => {
  const key = authenticator();
  const state = authState(key);
  const loaded = loadAuth(state);
  try {
    const { challenge } = await loaded.service.fingerprintChallenge({ tenant_id: TENANT, user_id: USER_ID });
    const r = await loaded.service.fingerprintLogin(assertion(key, challenge), {}, { ip: "10.0.0.1" });
    assert.equal(r.user.id, USER_ID);
    assert.equal(r.user.email, "tecnico@apexos.local");
    assert.equal(jwt.verify(r.token).sid, "session-1");
    assert.equal(jwt.verify(r.refresh).type, "refresh");
    assert.ok(state.user.last_login instanceof Date);
    assert.equal(state.credUpdates.length, 1);
  } finally {
    loaded.restore();
  }
}));

test("servicio: usuario desactivado o llave de otra empresa no entra", () => withEnv(async () => {
  const key = authenticator();
  for (const state of [authState(key, { active: false }), { ...authState(key), creds: [credential(key, { tenant_id: "empresa-b" })] }]) {
    const loaded = loadAuth(state);
    try {
      const { challenge } = await loaded.service.fingerprintChallenge({ tenant_id: TENANT, user_id: USER_ID });
      await assert.rejects(() => loaded.service.fingerprintLogin(assertion(key, challenge), {}, { ip: "10.0.0.2" }), (e) => e.statusCode === 401);
      assert.equal(state.sessions.length, 0);
    } finally {
      loaded.restore();
    }
  }
}));

test("servicio: sin WEBAUTHN_ORIGINS / WEBAUTHN_RP_IDS el ingreso con huella responde 503", () => withEnv(async () => {
  const loaded = loadAuth(authState(authenticator()));
  try {
    await assert.rejects(() => loaded.service.fingerprintChallenge({ tenant_id: TENANT, user_id: USER_ID }), (e) => e.statusCode === 503 && e.code === "WEBAUTHN_NO_CONFIGURADO");
  } finally {
    loaded.restore();
  }
}, { WEBAUTHN_ORIGINS: undefined, WEBAUTHN_RP_IDS: undefined }));
