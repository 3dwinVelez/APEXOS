const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");

const identity = require("../src/modules/hr/mobile-identity");

// Mismo formato que entrega Android Keystore: llave publica X.509 (SPKI) en
// DER y firma SHA256withECDSA en DER.
function deviceKey() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  return {
    publicKey: publicKey.export({ format: "der", type: "spki" }).toString("base64"),
    sign: (message) => crypto.sign("sha256", Buffer.from(message, "utf8"), { key: privateKey, dsaEncoding: "der" }).toString("base64")
  };
}

const user = { id: 41, email: "tec@apexos.qa" };
const DEVICE = "dev-5f3a9c1e2b7d";
const NOW = new Date("2026-11-04T15:00:00.000Z");
// Cabecera JPEG real: assertSafeFile valida la firma del archivo.
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(400, 7)]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(200, 3)]);
const sha = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");

function enrolledEmployee(key, extra = {}) {
  return {
    id: 7,
    metadata: {
      name: "Tecnico",
      mobile_biometric: { device_id: DEVICE, public_key: key.publicKey, key_algorithm: "EC_P256_SHA256", enrolled_at: "2026-11-01T10:00:00.000Z", ...extra }
    }
  };
}

function enrollmentInput(key, overrides = {}) {
  const signedAt = overrides.signed_at || NOW.toISOString();
  const deviceId = overrides.device_id || DEVICE;
  return {
    device_id: deviceId,
    public_key: key.publicKey,
    signed_at: signedAt,
    platform: "android",
    device_model: "Pixel 8",
    signature: key.sign(identity.enrollmentMessage({ userId: user.id, deviceId, signedAt })),
    ...overrides
  };
}

function mobilePunch(key, { bytes = JPEG, type = "image/jpeg", dataUrl = true, signWith, signedType, deviceId = DEVICE, punchType = "entrada", selfie = true } = {}) {
  const punchedAt = "2026-11-04T13:02:00.000Z";
  const idempotencyKey = "b3c1f2a4-9e7d-4c6b-8a10-123456789abc";
  const base64 = bytes.toString("base64");
  const photoSha256 = selfie ? sha(bytes) : identity.NO_PHOTO_SHA256;
  const message = identity.punchMessage({ userId: user.id, type: signedType || punchType, punchedAt, idempotencyKey, deviceId, photoSha256 });
  return {
    user_name: "Tecnico",
    type: punchType,
    punched_at: punchedAt,
    idempotency_key: idempotencyKey,
    metadata: {
      source: identity.MOBILE_SOURCE,
      identity: { device_id: deviceId, signature: (signWith || key).sign(message) },
      ...(selfie ? { identity_photo: { name: "selfie.jpg", type, size: bytes.length, base64: dataUrl ? `data:${type};base64,${base64}` : base64 } } : {})
    }
  };
}

function webPunch({ punchType = "entrada", bytes = JPEG, type = "image/jpeg", selfie = true } = {}) {
  return {
    user_name: "Tecnico",
    type: punchType,
    metadata: { source: "web" },
    ...(selfie ? { identity_photo: { name: "selfie.jpg", type, size: bytes.length, base64: `data:${type};base64,${bytes.toString("base64")}` } } : {})
  };
}

function rejects(fn, code) {
  assert.throws(fn, (error) => {
    assert.equal(error.code, code, `esperaba ${code}, llego ${error.code}: ${error.message}`);
    return true;
  });
}

test("registra el telefono con una firma valida de la huella", () => {
  const key = deviceKey();
  const record = identity.buildEnrollment({ employee: { id: 7, metadata: {} }, user, input: enrollmentInput(key), now: NOW });
  assert.equal(record.device_id, DEVICE);
  assert.equal(record.public_key, key.publicKey);
  assert.equal(record.key_algorithm, "EC_P256_SHA256");
  assert.equal(record.enrolled_by_user_id, user.id);
  assert.equal(record.enrolled_at, NOW.toISOString());
});

test("no se vuelve a registrar sin que un supervisor restablezca", () => {
  const key = deviceKey();
  rejects(() => identity.buildEnrollment({ employee: enrolledEmployee(key), user, input: enrollmentInput(deviceKey()), now: NOW }), "BIOMETRIA_YA_REGISTRADA");
});

test("el registro exige que la firma sea de la llave enviada", () => {
  const key = deviceKey();
  const intruder = deviceKey();
  const input = { ...enrollmentInput(key), signature: enrollmentInput(intruder).signature };
  rejects(() => identity.buildEnrollment({ employee: { metadata: {} }, user, input, now: NOW }), "FIRMA_BIOMETRICA_INVALIDA");
});

test("el registro firmado para otro usuario no sirve", () => {
  const key = deviceKey();
  const input = enrollmentInput(key);
  rejects(() => identity.buildEnrollment({ employee: { metadata: {} }, user: { id: 99 }, input, now: NOW }), "FIRMA_BIOMETRICA_INVALIDA");
});

test("solo acepta llaves EC P-256", () => {
  const { publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const rsa = publicKey.export({ format: "der", type: "spki" }).toString("base64");
  rejects(() => identity.buildEnrollment({ employee: { metadata: {} }, user, input: { ...enrollmentInput(deviceKey()), public_key: rsa }, now: NOW }), "LLAVE_BIOMETRICA_INVALIDA");
  rejects(() => identity.buildEnrollment({ employee: { metadata: {} }, user, input: { ...enrollmentInput(deviceKey()), public_key: "no-es-una-llave" }, now: NOW }), "LLAVE_BIOMETRICA_INVALIDA");
});

test("un registro con la hora muy corrida se rechaza", () => {
  const key = deviceKey();
  const stale = new Date(NOW.getTime() - 30 * 60 * 1000).toISOString();
  rejects(() => identity.buildEnrollment({ employee: { metadata: {} }, user, input: enrollmentInput(key, { signed_at: stale }), now: NOW }), "REGISTRO_VENCIDO");
});

test("un identificador de telefono raro se rechaza", () => {
  const key = deviceKey();
  rejects(() => identity.buildEnrollment({ employee: { metadata: {} }, user, input: enrollmentInput(key, { device_id: "a b" }), now: NOW }), "DISPOSITIVO_INVALIDO");
});

test("la marcacion de la app firmada en el telefono registrado queda verificada", () => {
  const key = deviceKey();
  const result = identity.verifyPunchIdentity({ employee: enrolledEmployee(key), user, input: mobilePunch(key), now: NOW });
  assert.equal(result.identity_verification.status, "verified");
  assert.equal(result.identity_verification.device_id, DEVICE);
  assert.equal(result.identity_verification.channel, "mobile");
  assert.equal(result.identity_photo.sha256, sha(JPEG));
  assert.equal(result.identity_photo.size, JPEG.length);
  assert.ok(result.identity_photo.base64_data.startsWith("data:image/jpeg;base64,"));
});

test("la selfie se guarda como data URL aunque llegue sin prefijo", () => {
  const key = deviceKey();
  const result = identity.verifyPunchIdentity({ employee: enrolledEmployee(key), user, input: mobilePunch(key, { dataUrl: false }), now: NOW });
  assert.equal(result.identity_photo.base64_data, `data:image/jpeg;base64,${JPEG.toString("base64")}`);
});

test("acepta selfie PNG", () => {
  const key = deviceKey();
  const result = identity.verifyPunchIdentity({ employee: enrolledEmployee(key), user, input: mobilePunch(key, { bytes: PNG, type: "image/png" }), now: NOW });
  assert.equal(result.identity_photo.type, "image/png");
});

test("la web guarda la selfie pero no la da por verificada", () => {
  const result = identity.verifyPunchIdentity({ employee: { metadata: {} }, user, input: webPunch(), now: NOW });
  assert.equal(result.identity_verification.status, "photo_only");
  assert.equal(result.identity_verification.channel, "web");
  // El navegador no firma nada: la foto muestra quien marco, no lo prueba.
  assert.equal(result.identity_verification.signature, undefined);
  assert.equal(result.identity_photo.sha256, sha(JPEG));
  assert.ok(result.identity_photo.base64_data.startsWith("data:image/jpeg;base64,"));
});

test("la web no puede marcar entrada ni salida sin selfie", () => {
  for (const punchType of ["entrada", "salida"]) {
    rejects(() => identity.verifyPunchIdentity({ employee: { metadata: {} }, user, input: webPunch({ punchType, selfie: false }), now: NOW }), "SELFIE_REQUERIDA");
  }
});

test("el almuerzo de la web sigue marcandose sin foto", () => {
  for (const punchType of ["inicio_almuerzo", "fin_almuerzo"]) {
    const result = identity.verifyPunchIdentity({ employee: { metadata: {} }, user, input: webPunch({ punchType, selfie: false }), now: NOW });
    assert.deepEqual(result, { identity_verification: { status: "not_verified", channel: "web" } });
  }
});

test("la app sin telefono registrado no puede marcar", () => {
  const key = deviceKey();
  rejects(() => identity.verifyPunchIdentity({ employee: { metadata: {} }, user, input: mobilePunch(key), now: NOW }), "BIOMETRIA_NO_REGISTRADA");
});

test("una version vieja de la app (sin firma) no puede marcar", () => {
  const key = deviceKey();
  const input = { type: "entrada", metadata: { source: identity.MOBILE_SOURCE, biometric_verified: true } };
  rejects(() => identity.verifyPunchIdentity({ employee: enrolledEmployee(key), user, input, now: NOW }), "IDENTIDAD_REQUERIDA");
});

test("desde otro telefono no se puede marcar", () => {
  const key = deviceKey();
  rejects(() => identity.verifyPunchIdentity({ employee: enrolledEmployee(key), user, input: mobilePunch(key, { deviceId: "otro-telefono-123" }), now: NOW }), "DISPOSITIVO_NO_REGISTRADO");
});

test("con la llave de otro telefono la firma no pasa", () => {
  const key = deviceKey();
  rejects(() => identity.verifyPunchIdentity({ employee: enrolledEmployee(key), user, input: mobilePunch(key, { signWith: deviceKey() }), now: NOW }), "FIRMA_BIOMETRICA_INVALIDA");
});

test("cambiar la selfie despues de firmar invalida la marcacion", () => {
  const key = deviceKey();
  const input = mobilePunch(key);
  const other = Buffer.concat([JPEG, Buffer.from([1])]);
  input.metadata.identity_photo.base64 = `data:image/jpeg;base64,${other.toString("base64")}`;
  rejects(() => identity.verifyPunchIdentity({ employee: enrolledEmployee(key), user, input, now: NOW }), "FIRMA_BIOMETRICA_INVALIDA");
});

test("cambiar el tipo de marcacion despues de firmar la invalida", () => {
  const key = deviceKey();
  rejects(() => identity.verifyPunchIdentity({ employee: enrolledEmployee(key), user, input: mobilePunch(key, { signedType: "salida" }), now: NOW }), "FIRMA_BIOMETRICA_INVALIDA");
});

test("sin selfie la app no puede marcar entrada ni salida", () => {
  const key = deviceKey();
  for (const punchType of ["entrada", "salida"]) {
    const input = mobilePunch(key, { punchType });
    delete input.metadata.identity_photo;
    rejects(() => identity.verifyPunchIdentity({ employee: enrolledEmployee(key), user, input, now: NOW }), "SELFIE_REQUERIDA");
  }
});

test("el almuerzo se marca sin selfie pero firmado", () => {
  const key = deviceKey();
  for (const punchType of ["inicio_almuerzo", "fin_almuerzo"]) {
    const result = identity.verifyPunchIdentity({ employee: enrolledEmployee(key), user, input: mobilePunch(key, { punchType, selfie: false }), now: NOW });
    assert.equal(result.identity_verification.status, "verified");
    assert.equal(result.identity_photo, undefined);
  }
});

test("quitarle la selfie a una entrada firmada con foto no la cuela como almuerzo", () => {
  const key = deviceKey();
  // Firmada como inicio_almuerzo sin foto, pero enviada como entrada: la
  // firma cubre el tipo, asi que no pasa.
  const input = mobilePunch(key, { punchType: "inicio_almuerzo", selfie: false });
  input.type = "entrada";
  rejects(() => identity.verifyPunchIdentity({ employee: enrolledEmployee(key), user, input, now: NOW }), "SELFIE_REQUERIDA");
});

test("una app vieja todavia marca el almuerzo con foto, pero la foto no se guarda", () => {
  // Quien no ha actualizado firmo con el hash de su selfie. Se le deja marcar
  // (si no, se queda sin almorzar) pero el almuerzo deja de acumular caras.
  const key = deviceKey();
  const result = identity.verifyPunchIdentity({ employee: enrolledEmployee(key), user, input: mobilePunch(key, { punchType: "inicio_almuerzo" }), now: NOW });
  assert.equal(result.identity_verification.status, "verified");
  assert.equal(result.identity_photo, undefined);
});

test("en el almuerzo la firma sigue atada al telefono registrado", () => {
  const key = deviceKey();
  for (const selfie of [true, false]) {
    rejects(() => identity.verifyPunchIdentity({ employee: enrolledEmployee(key), user, input: mobilePunch(key, { punchType: "inicio_almuerzo", selfie, signWith: deviceKey() }), now: NOW }), "FIRMA_BIOMETRICA_INVALIDA");
  }
});

test("una selfie que no es imagen se rechaza", () => {
  const key = deviceKey();
  rejects(() => identity.verifyPunchIdentity({ employee: enrolledEmployee(key), user, input: mobilePunch(key, { bytes: Buffer.from("%PDF-1.7 hola"), type: "application/pdf" }), now: NOW }), "SELFIE_INVALIDA");
  // Declarada como JPEG pero con contenido PNG: assertSafeFile la detecta.
  assert.throws(() => identity.verifyPunchIdentity({ employee: enrolledEmployee(key), user, input: mobilePunch(key, { bytes: PNG, type: "image/jpeg" }), now: NOW }), /no coincide/);
});

test("una selfie demasiado grande se rechaza", () => {
  const key = deviceKey();
  const big = Buffer.concat([JPEG, Buffer.alloc(identity.MAX_IDENTITY_PHOTO_BYTES, 1)]);
  assert.throws(() => identity.verifyPunchIdentity({ employee: enrolledEmployee(key), user, input: mobilePunch(key, { bytes: big }), now: NOW }), /tamano maximo/);
});

test("restablecer pasa el registro al historial sin la llave", () => {
  const key = deviceKey();
  const metadata = identity.resetEnrollmentMetadata(enrolledEmployee(key).metadata, { user: { id: 3 }, now: NOW, reason: "cambio de telefono" });
  assert.equal(metadata.mobile_biometric, undefined);
  assert.equal(metadata.name, "Tecnico");
  assert.equal(metadata.mobile_biometric_history.length, 1);
  const [entry] = metadata.mobile_biometric_history;
  assert.equal(entry.device_id, DEVICE);
  assert.equal(entry.public_key, undefined);
  assert.equal(entry.reset_by_user_id, 3);
  assert.equal(entry.reset_reason, "cambio de telefono");
});

test("el historial de registros no crece sin limite", () => {
  const key = deviceKey();
  const history = Array.from({ length: 25 }, (_, index) => ({ device_id: `old-${index}` }));
  const metadata = identity.resetEnrollmentMetadata({ ...enrolledEmployee(key).metadata, mobile_biometric_history: history }, { now: NOW });
  assert.equal(metadata.mobile_biometric_history.length, 20);
  assert.equal(metadata.mobile_biometric_history.at(-1).device_id, DEVICE);
});

test("los listados no llevan el contenido de la selfie ni la firma cruda", () => {
  const key = deviceKey();
  const verified = identity.verifyPunchIdentity({ employee: enrolledEmployee(key), user, input: mobilePunch(key), now: NOW });
  const stored = { source: identity.MOBILE_SOURCE, identity: { signature: "x" }, ...verified };
  const visible = identity.publicPunchMetadata(stored);
  assert.equal(visible.identity, undefined);
  assert.equal(visible.identity_photo.base64_data, undefined);
  assert.equal(visible.identity_photo.has_base64_data, true);
  assert.equal(visible.identity_verification.status, "verified");
});

test("la selfie se entrega al monitor como evidencia", () => {
  const key = deviceKey();
  const verified = identity.verifyPunchIdentity({ employee: enrolledEmployee(key), user, input: mobilePunch(key), now: NOW });
  const evidence = identity.identityEvidenceOf({ id: 15, metadata: verified });
  assert.equal(evidence.evidence_type, "identity_selfie");
  assert.ok(evidence.base64_data.startsWith("data:image/jpeg;base64,"));
  assert.equal(identity.identityEvidenceOf({ id: 16, metadata: {} }), null);
});

test("las selfies guardadas antes del despliegue tambien llegan al monitor", () => {
  // La API anterior guardaba la metadata de la app tal cual: la selfie queda
  // en `identity_photo.base64` y sin `identity_verification`.
  const legacy = { id: 30, metadata: { source: identity.MOBILE_SOURCE, identity_photo: { name: "selfie.jpg", type: "image/jpeg", size: JPEG.length, base64: `data:image/jpeg;base64,${JPEG.toString("base64")}` } } };
  assert.equal(identity.identityEvidenceOf(legacy).base64_data, legacy.metadata.identity_photo.base64);
  const raw = { id: 31, metadata: { identity_photo: { type: "image/png", base64: PNG.toString("base64") } } };
  assert.equal(identity.identityEvidenceOf(raw).base64_data, `data:image/png;base64,${PNG.toString("base64")}`);
  const visible = identity.publicPunchMetadata(legacy.metadata);
  assert.equal(visible.identity_photo.base64, undefined);
  assert.equal(visible.identity_photo.has_base64_data, true);
});

test("lo que ve el empleado de su registro nunca incluye la llave", () => {
  const key = deviceKey();
  const visible = identity.publicEnrollment(enrolledEmployee(key, { platform: "android", device_model: "Pixel 8" }));
  assert.deepEqual(visible, { enrolled: true, device_id: DEVICE, platform: "android", device_model: "Pixel 8", enrolled_at: "2026-11-01T10:00:00.000Z" });
  assert.deepEqual(identity.publicEnrollment({ metadata: {} }), { enrolled: false });
});
