const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");

process.env.DISABLE_REDIS = "true";

const shared = require("../src/modules/hr/shared-device-identity");

// Celular compartido de un camion: llave WebAuthn ES256 del autenticador de
// plataforma. Este autenticador simulado arma authenticatorData y clientDataJSON
// exactamente como los entrega el navegador, y firma authData || sha256(clientData).

const RP_ID = "movil.apexos.test";
const ORIGIN = "https://movil.apexos.test";
const CONFIG = { allowedOrigins: [ORIGIN], allowedRpIds: [RP_ID] };
const SECRET = "secreto-de-prueba";
const TENANT = "tenant-qa";
const ADMIN = { id: 7, role: { name: "APEX_ADMIN" } };
const DEVICE_ID = "web-7b1c2d3e4f5a6b7c";
const NOW = new Date("2026-11-21T14:00:00.000Z");
// JPEG real (24x24, generado con sharp): la compuerta de evidencia de mobile-identity.js decodifica la selfie.
const JPEG = Buffer.from("/9j/2wBDAA0JCgsKCA0LCgsODg0PEyAVExISEyccHhcgLikxMC4pLSwzOko+MzZGNywtQFdBRkxOUlNSMj5aYVpQYEpRUk//2wBDAQ4ODhMREyYVFSZPNS01T09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0//wAARCAAYABgDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAT/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFgEBAQEAAAAAAAAAAAAAAAAAAAID/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AlAZrAAAAAAf/2Q==", "base64");
const JPEG_2 = Buffer.from("/9j/2wBDAA0JCgsKCA0LCgsODg0PEyAVExISEyccHhcgLikxMC4pLSwzOko+MzZGNywtQFdBRkxOUlNSMj5aYVpQYEpRUk//2wBDAQ4ODhMREyYVFSZPNS01T09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0//wAARCAAYABgDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFgEBAQEAAAAAAAAAAAAAAAAAAAQF/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AjANFIAAAAAA//9k=", "base64");

const sha256 = (data) => crypto.createHash("sha256").update(data).digest();
const b64url = (b) => Buffer.from(b).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

function authenticator() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  return {
    privateKey,
    publicKey: publicKey.export({ format: "der", type: "spki" }).toString("base64"),
    credentialId: b64url(crypto.randomBytes(32))
  };
}

function authData({ rpId = RP_ID, flags = 0x05, signCount = 0 } = {}) {
  const count = Buffer.alloc(4);
  count.writeUInt32BE(signCount);
  return Buffer.concat([sha256(Buffer.from(rpId, "utf8")), Buffer.from([flags]), count]);
}

function clientData(type, challenge, origin = ORIGIN) {
  return Buffer.from(JSON.stringify({ type, challenge, origin, crossOrigin: false }), "utf8");
}

function registrationInput(key, overrides = {}) {
  const { challenge } = shared.issueRegistrationChallenge({ tenantId: TENANT, userId: ADMIN.id, secret: SECRET, now: NOW });
  return {
    device_id: DEVICE_ID,
    credential_id: key.credentialId,
    public_key: key.publicKey,
    public_key_algorithm: -7,
    client_data_json: b64url(clientData("webauthn.create", overrides.challenge || challenge, overrides.origin)),
    authenticator_data: b64url(authData({ flags: overrides.flags ?? 0x45 })),
    rp_id: RP_ID,
    vehicle_plate: "xyz 987",
    label: "Camion 12",
    ...overrides.input
  };
}

function device(key, extra = {}) {
  return {
    id: 1,
    tenant_id: TENANT,
    device_id: DEVICE_ID,
    credential_id: key.credentialId,
    public_key: key.publicKey,
    sign_count: 0,
    rp_id: RP_ID,
    vehicle_plate: "XYZ987",
    active: true,
    ...extra
  };
}

// Marcacion firmada como lo hace la web movil.
function crewPunch(key, overrides = {}) {
  const selfie = overrides.selfie || JPEG;
  const body = {
    employee_id: overrides.employeeId ?? 463,
    type: overrides.type || "entrada",
    punched_at: overrides.punchedAt || NOW.toISOString(),
    idempotency_key: overrides.idempotencyKey || "uuid-crew-0001",
    identity_photo: { base64: `data:image/jpeg;base64,${selfie.toString("base64")}`, name: "selfie.jpg", type: "image/jpeg", size: selfie.length }
  };
  const message = shared.crewPunchMessage({
    employeeId: overrides.signedEmployeeId ?? body.employee_id,
    type: overrides.signedType || body.type,
    punchedAt: body.punched_at,
    idempotencyKey: body.idempotency_key,
    deviceId: DEVICE_ID,
    photoSha256: sha256(overrides.signedSelfie || selfie).toString("hex")
  });
  const cd = clientData("webauthn.get", shared.challengeForMessage(message), overrides.origin);
  const ad = authData({ rpId: overrides.rpId, flags: overrides.flags ?? 0x05, signCount: overrides.signCount ?? 0 });
  const signer = overrides.signer || key;
  const signature = crypto.sign("sha256", Buffer.concat([ad, sha256(cd)]), { key: signer.privateKey, dsaEncoding: "der" });
  body.metadata = {
    source: shared.SHARED_DEVICE_SOURCE,
    identity: {
      device_id: overrides.deviceId || DEVICE_ID,
      credential_id: key.credentialId,
      authenticator_data: b64url(ad),
      client_data_json: b64url(cd),
      signature: b64url(signature)
    }
  };
  if (overrides.mutate) overrides.mutate(body);
  return body;
}

function rejects(fn, code) {
  assert.throws(fn, (error) => error.code === code, `debia fallar con ${code}`);
}

// verifyCrewAssertion es asincronica (la selfie se decodifica con sharp).
async function rejectsAsync(fn, code) {
  await assert.rejects(fn, (error) => error.code === code, `debia fallar con ${code}`);
}

const verify = (dev, body, extra = {}) =>
  shared.verifyCrewAssertion({ device: dev, employeeId: body.employee_id, input: body, ...CONFIG, now: NOW, ...extra });

// ------------------------------------------------------------------ registro

test("registro valido devuelve el registro normalizado sin datos de mas", () => {
  const key = authenticator();
  const record = shared.verifyRegistration({ input: registrationInput(key), tenantId: TENANT, user: ADMIN, secret: SECRET, ...CONFIG, now: NOW });
  assert.equal(record.device_id, DEVICE_ID);
  assert.equal(record.vehicle_plate, "XYZ987", "la placa se normaliza");
  assert.equal(record.public_key, key.publicKey);
  assert.equal(record.key_algorithm, "WEBAUTHN_ES256");
  assert.equal(record.rp_id, RP_ID);
});

test("registro con reto de otra sesion, vencido o alterado se rechaza", () => {
  const key = authenticator();
  const input = registrationInput(key);
  rejects(() => shared.verifyRegistration({ input, tenantId: TENANT, user: { id: 99 }, secret: SECRET, ...CONFIG, now: NOW }), "WEBAUTHN_RETO_AJENO");
  rejects(() => shared.verifyRegistration({ input, tenantId: "otro-tenant", user: ADMIN, secret: SECRET, ...CONFIG, now: NOW }), "WEBAUTHN_RETO_AJENO");
  rejects(() => shared.verifyRegistration({ input, tenantId: TENANT, user: ADMIN, secret: SECRET, ...CONFIG, now: new Date(NOW.getTime() + 6 * 60000) }), "WEBAUTHN_RETO_VENCIDO");
  rejects(() => shared.verifyRegistration({ input: registrationInput(key, { challenge: b64url(Buffer.from("x.y")) }), tenantId: TENANT, user: ADMIN, secret: SECRET, ...CONFIG, now: NOW }), "WEBAUTHN_RETO_INVALIDO");
});

test("registro desde un origen no permitido o sin huella verificada se rechaza", () => {
  const key = authenticator();
  rejects(() => shared.verifyRegistration({ input: registrationInput(key, { origin: "https://evil.example" }), tenantId: TENANT, user: ADMIN, secret: SECRET, ...CONFIG, now: NOW }), "WEBAUTHN_ORIGEN_NO_PERMITIDO");
  rejects(() => shared.verifyRegistration({ input: registrationInput(key, { flags: 0x01 }), tenantId: TENANT, user: ADMIN, secret: SECRET, ...CONFIG, now: NOW }), "HUELLA_NO_VERIFICADA");
});

test("registro con algoritmo distinto de ES256 o llave invalida se rechaza", () => {
  const key = authenticator();
  rejects(() => shared.verifyRegistration({ input: registrationInput(key, { input: { public_key_algorithm: -257 } }), tenantId: TENANT, user: ADMIN, secret: SECRET, ...CONFIG, now: NOW }), "WEBAUTHN_ALGORITMO_NO_SOPORTADO");
  rejects(() => shared.verifyRegistration({ input: registrationInput(key, { input: { public_key: "AAAA" } }), tenantId: TENANT, user: ADMIN, secret: SECRET, ...CONFIG, now: NOW }), "LLAVE_BIOMETRICA_INVALIDA");
});

// ------------------------------------------------------------------ marcacion

test("marcacion firmada por el celular registrado queda device_verified con la selfie", async () => {
  const key = authenticator();
  const result = await verify(device(key), crewPunch(key));
  assert.equal(result.metadata.identity_verification.status, "device_verified");
  assert.equal(result.metadata.identity_verification.channel, "shared_device");
  assert.equal(result.metadata.identity_verification.vehicle_plate, "XYZ987");
  assert.equal(result.metadata.identity_verification.proves, "celular_autorizado");
  assert.match(result.metadata.identity_photo.base64_data, /^data:image\/jpeg;base64,/);
  assert.equal(result.metadata.identity_photo.sha256, sha256(JPEG).toString("hex"));
});

test("la firma no se puede reusar para OTRA persona, otro tipo u otra selfie", async () => {
  const key = authenticator();
  // firmado para 463 pero enviado como 512: el empleado lo fija el servidor y cambia el mensaje
  await rejectsAsync(() => verify(device(key), crewPunch(key, { employeeId: 512, signedEmployeeId: 463 })), "FIRMA_NO_CORRESPONDE");
  await rejectsAsync(() => verify(device(key), crewPunch(key, { type: "salida", signedType: "entrada" })), "FIRMA_NO_CORRESPONDE");
  await rejectsAsync(() => verify(device(key), crewPunch(key, { selfie: JPEG_2, signedSelfie: JPEG })), "FIRMA_NO_CORRESPONDE");
});

test("firma de otro celular, celular revocado o credencial distinta se rechaza", async () => {
  const key = authenticator();
  const intruder = authenticator();
  await rejectsAsync(() => verify(device(key), crewPunch(key, { signer: intruder })), "FIRMA_BIOMETRICA_INVALIDA");
  await rejectsAsync(() => verify(device(key, { active: false }), crewPunch(key)), "CELULAR_NO_REGISTRADO");
  await rejectsAsync(() => verify(null, crewPunch(key)), "CELULAR_NO_REGISTRADO");
  await rejectsAsync(() => verify(device(key, { credential_id: intruder.credentialId }), crewPunch(key)), "CELULAR_NO_COINCIDE");
  await rejectsAsync(() => verify(device(key), crewPunch(key, { deviceId: "web-otro-celular-01" })), "CELULAR_NO_COINCIDE");
});

test("origen ajeno, dominio distinto o sin huella verificada se rechaza", async () => {
  const key = authenticator();
  await rejectsAsync(() => verify(device(key), crewPunch(key, { origin: "https://evil.example" })), "WEBAUTHN_ORIGEN_NO_PERMITIDO");
  await rejectsAsync(() => verify(device(key), crewPunch(key, { rpId: "evil.example" })), "WEBAUTHN_RP_NO_COINCIDE");
  await rejectsAsync(() => verify(device(key), crewPunch(key, { flags: 0x01 })), "HUELLA_NO_VERIFICADA");
});

test("sin selfie o sin firma se rechaza", async () => {
  const key = authenticator();
  await rejectsAsync(() => verify(device(key), crewPunch(key, { mutate: (b) => { delete b.identity_photo; } })), "SELFIE_REQUERIDA");
  await rejectsAsync(() => verify(device(key), crewPunch(key, { mutate: (b) => { delete b.metadata.identity.signature; } })), "IDENTIDAD_REQUERIDA");
});

test("el contador de firmas que no avanza se senala para auditoria sin bloquear", async () => {
  const key = authenticator();
  const ok = await verify(device(key, { sign_count: 4 }), crewPunch(key, { signCount: 5 }));
  assert.equal(ok.sign_count, 5);
  assert.equal(ok.metadata.identity_verification.sign_count_regression, undefined);
  const replay = await verify(device(key, { sign_count: 5 }), crewPunch(key, { signCount: 5 }));
  assert.equal(replay.metadata.identity_verification.sign_count_regression, true);
  assert.equal(replay.sign_count, 5);
  const zero = await verify(device(key, { sign_count: 0 }), crewPunch(key, { signCount: 0 }));
  assert.equal(zero.metadata.identity_verification.sign_count_regression, undefined, "0 = autenticador sin contador");
});

test("webauthnConfig lee listas separadas por coma", () => {
  const cfg = shared.webauthnConfig({ WEBAUTHN_ORIGINS: "https://a.co, https://b.co", WEBAUTHN_RP_IDS: "A.co" });
  assert.deepEqual(cfg, { allowedOrigins: ["https://a.co", "https://b.co"], allowedRpIds: ["a.co"] });
});

// ------------------------------------------------------------------ servicio

function loadHrService(fakePrisma) {
  const prismaPath = require.resolve("../src/core/prisma");
  const servicePath = require.resolve("../src/modules/hr/service");
  const previousPrisma = require.cache[prismaPath];
  const previousService = require.cache[servicePath];
  require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: fakePrisma };
  delete require.cache[servicePath];
  const service = require(servicePath);
  return {
    service,
    restore() {
      delete require.cache[servicePath];
      if (previousService) require.cache[servicePath] = previousService;
      if (previousPrisma) require.cache[prismaPath] = previousPrisma;
      else delete require.cache[prismaPath];
    }
  };
}

const driverSession = { id: 7, email: "conductor@apexos.local", role: { name: "Operario" } };
const employees = [
  { id: 222, tenant_id: TENANT, user_id: 7, code: "EMP-222", user_type: "operario", active: true, metadata: { name: "Conductor" }, user: { id: 7, name: "Conductor", email: "conductor@apexos.local" } },
  { id: 463, tenant_id: TENANT, user_id: null, code: "EMP-463", user_type: "operario", active: true, metadata: { name: "Auxiliar" }, user: null },
  { id: 900, tenant_id: TENANT, user_id: null, code: "EMP-900", user_type: "operario", active: true, metadata: { name: "Otro camion" }, user: null }
];

function todayRoute() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return { id: 12, tenant_id: TENANT, date, status: "active", employees: ["EMP-222", "EMP-463"], vehicle_plate: "XYZ987", start_time: "00:00", end_time: "23:59", tolerance_minutes: 1440 };
}

function fakePrisma(key, capture) {
  const route = todayRoute();
  const tx = {
    employee: { findFirst: async ({ where }) => employees.find((e) => e.id === where?.id) || null },
    timeRoute: { findFirst: async () => route },
    routePreoperationalChecklist: { findFirst: async () => null, create: async ({ data }) => ({ id: 77, ...data }) },
    timePunch: {
      findFirst: async () => null,
      findMany: async () => [],
      create: async ({ data }) => {
        capture.punches.push(data);
        return { id: 91, ...data };
      }
    },
    gpsPing: { create: async () => ({}) },
    workSession: { findFirst: async () => null, create: async () => ({}), update: async () => ({}) },
    $executeRaw: async (strings, ...values) => {
      capture.raw.push({ sql: strings.join("?"), values });
    },
    $queryRaw: async (strings) => (String(strings?.join ? strings.join("") : strings).includes("pg_try_advisory_xact_lock") ? [{ acquired: true }] : [])
  };
  const dev = device(key);
  return {
    runWithTenant: (_tenantId, callback) => callback(),
    $transaction: async (callback) => callback(tx),
    hrSharedDevice: {
      findFirst: async ({ where }) => (where.device_id === dev.device_id && dev.active ? dev : null),
      update: async ({ data }) => {
        capture.deviceUpdates.push(data);
        Object.assign(dev, data);
        return dev;
      }
    },
    timeRoute: { findMany: async () => [route], findFirst: async () => route },
    employee: { findMany: async () => employees },
    workSession: { findFirst: async () => null },
    timePunch: { findFirst: async () => null }
  };
}

function withWebauthnEnv(fn) {
  const previous = { o: process.env.WEBAUTHN_ORIGINS, r: process.env.WEBAUTHN_RP_IDS };
  process.env.WEBAUTHN_ORIGINS = ORIGIN;
  process.env.WEBAUTHN_RP_IDS = RP_ID;
  return Promise.resolve(fn()).finally(() => {
    if (previous.o === undefined) delete process.env.WEBAUTHN_ORIGINS; else process.env.WEBAUTHN_ORIGINS = previous.o;
    if (previous.r === undefined) delete process.env.WEBAUTHN_RP_IDS; else process.env.WEBAUTHN_RP_IDS = previous.r;
  });
}

test("servicio: el conductor con sesion abierta marca al AUXILIAR desde el celular del camion", () => withWebauthnEnv(async () => {
  const key = authenticator();
  const capture = { punches: [], raw: [], deviceUpdates: [] };
  const loaded = loadHrService(fakePrisma(key, capture));
  try {
    const body = crewPunch(key, { employeeId: 463, punchedAt: new Date().toISOString(), signCount: 3 });
    const result = await loaded.service.createCrewPunch(TENANT, driverSession, DEVICE_ID, body);
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(capture.punches.length, 1);
    const punch = capture.punches[0];
    assert.equal(punch.employee_id, 463, "la marcacion queda sobre el auxiliar, no sobre quien tiene la sesion");
    assert.equal(punch.vehicle_plate, "XYZ987");
    assert.equal(punch.metadata.identity_verification.status, "device_verified");
    assert.equal(punch.metadata.shared_device_session_user_id, 7);
    assert.equal(punch.metadata.identity, undefined, "la firma cruda no se guarda en la marcacion");
    assert.ok(!capture.raw.some((c) => c.values.includes("AJUSTE_MANUAL_MARCACION")), "no es un ajuste manual");
    assert.equal(capture.deviceUpdates[0].sign_count, 3);
  } finally {
    loaded.restore();
  }
}));

test("servicio: alguien sin malla HOY en esa placa no puede marcar en el celular", () => withWebauthnEnv(async () => {
  const key = authenticator();
  const capture = { punches: [], raw: [], deviceUpdates: [] };
  const loaded = loadHrService(fakePrisma(key, capture));
  try {
    const body = crewPunch(key, { employeeId: 900, punchedAt: new Date().toISOString() });
    await assert.rejects(loaded.service.createCrewPunch(TENANT, driverSession, DEVICE_ID, body), (e) => e.code === "EMPLEADO_FUERA_DE_TRIPULACION");
    assert.equal(capture.punches.length, 0);
    assert.equal(capture.deviceUpdates.length, 0, "no toca el contador si la persona no pertenece");
  } finally {
    loaded.restore();
  }
}));

test("servicio: celular no registrado o firma invalida no crea marcacion", () => withWebauthnEnv(async () => {
  const key = authenticator();
  const capture = { punches: [], raw: [], deviceUpdates: [] };
  const loaded = loadHrService(fakePrisma(key, capture));
  try {
    const body = crewPunch(key, { employeeId: 463, punchedAt: new Date().toISOString() });
    await assert.rejects(loaded.service.createCrewPunch(TENANT, driverSession, "web-desconocido-001", body), (e) => e.code === "CELULAR_NO_REGISTRADO");
    const forged = crewPunch(key, { employeeId: 463, punchedAt: new Date().toISOString(), signer: authenticator() });
    await assert.rejects(loaded.service.createCrewPunch(TENANT, driverSession, DEVICE_ID, forged), (e) => e.code === "FIRMA_BIOMETRICA_INVALIDA");
    assert.equal(capture.punches.length, 0);
  } finally {
    loaded.restore();
  }
}));

test("servicio: registrar y revocar exige rol administrativo", () => withWebauthnEnv(async () => {
  const key = authenticator();
  const capture = { punches: [], raw: [], deviceUpdates: [] };
  const loaded = loadHrService(fakePrisma(key, capture));
  try {
    await assert.rejects(loaded.service.createSharedDeviceChallenge(TENANT, driverSession), (e) => e.code === "CELULAR_ADMIN_REQUERIDO");
    await assert.rejects(loaded.service.revokeSharedDevice(TENANT, driverSession, 1, {}), (e) => e.code === "CELULAR_ADMIN_REQUERIDO");
  } finally {
    loaded.restore();
  }
}));

test("servicio: sin WEBAUTHN_ORIGINS / WEBAUTHN_RP_IDS el registro avisa la configuracion faltante", async () => {
  const saved = { o: process.env.WEBAUTHN_ORIGINS, r: process.env.WEBAUTHN_RP_IDS };
  delete process.env.WEBAUTHN_ORIGINS;
  delete process.env.WEBAUTHN_RP_IDS;
  const key = authenticator();
  const loaded = loadHrService(fakePrisma(key, { punches: [], raw: [], deviceUpdates: [] }));
  try {
    await assert.rejects(loaded.service.createSharedDeviceChallenge(TENANT, ADMIN), (e) => e.code === "WEBAUTHN_NO_CONFIGURADO");
  } finally {
    loaded.restore();
    if (saved.o !== undefined) process.env.WEBAUTHN_ORIGINS = saved.o;
    if (saved.r !== undefined) process.env.WEBAUTHN_RP_IDS = saved.r;
  }
});
