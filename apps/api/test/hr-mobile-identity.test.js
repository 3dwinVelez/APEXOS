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
// Imagen real decodificable: es la unica que puede re-emitirse a JPEG canonico. Las de
// arriba son cabeceras validas con relleno -pertenecen a la clase imagen pero no renderizan,
// y desde esta intervencion eso degrada la evidencia en vez de perder la marcacion.
const sharpLib = require("sharp");
async function realJpeg(width = 24, height = 24) {
  return sharpLib({ create: { width, height, channels: 3, background: { r: 180, g: 140, b: 110 } } }).jpeg({ quality: 90 }).toBuffer();
}

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

async function rejects(fn, code) {
  await assert.rejects(async () => await fn(), (error) => {
    assert.equal(error.code, code, `esperaba ${code}, llego ${error.code}: ${error.message}`);
    return true;
  });
}

test("registra el telefono con una firma valida de la huella", async () => {
  const key = deviceKey();
  const record = identity.buildEnrollment({ employee: { id: 7, metadata: {} }, user, input: enrollmentInput(key), now: NOW });
  assert.equal(record.device_id, DEVICE);
  assert.equal(record.public_key, key.publicKey);
  assert.equal(record.key_algorithm, "EC_P256_SHA256");
  assert.equal(record.enrolled_by_user_id, user.id);
  assert.equal(record.enrolled_at, NOW.toISOString());
});

test("no se vuelve a registrar sin que un supervisor restablezca", async () => {
  const key = deviceKey();
  await rejects(async () => identity.buildEnrollment({ employee: enrolledEmployee(key), user, input: enrollmentInput(deviceKey()), now: NOW }), "BIOMETRIA_YA_REGISTRADA");
});

test("el registro exige que la firma sea de la llave enviada", async () => {
  const key = deviceKey();
  const intruder = deviceKey();
  const input = { ...enrollmentInput(key), signature: enrollmentInput(intruder).signature };
  await rejects(async () => identity.buildEnrollment({ employee: { metadata: {} }, user, input, now: NOW }), "FIRMA_BIOMETRICA_INVALIDA");
});

test("el registro firmado para otro usuario no sirve", async () => {
  const key = deviceKey();
  const input = enrollmentInput(key);
  await rejects(async () => identity.buildEnrollment({ employee: { metadata: {} }, user: { id: 99 }, input, now: NOW }), "FIRMA_BIOMETRICA_INVALIDA");
});

test("solo acepta llaves EC P-256", async () => {
  const { publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const rsa = publicKey.export({ format: "der", type: "spki" }).toString("base64");
  await rejects(async () => identity.buildEnrollment({ employee: { metadata: {} }, user, input: { ...enrollmentInput(deviceKey()), public_key: rsa }, now: NOW }), "LLAVE_BIOMETRICA_INVALIDA");
  await rejects(async () => identity.buildEnrollment({ employee: { metadata: {} }, user, input: { ...enrollmentInput(deviceKey()), public_key: "no-es-una-llave" }, now: NOW }), "LLAVE_BIOMETRICA_INVALIDA");
});

test("un registro con la hora muy corrida se rechaza", async () => {
  const key = deviceKey();
  const stale = new Date(NOW.getTime() - 30 * 60 * 1000).toISOString();
  await rejects(async () => identity.buildEnrollment({ employee: { metadata: {} }, user, input: enrollmentInput(key, { signed_at: stale }), now: NOW }), "REGISTRO_VENCIDO");
});

test("un identificador de telefono raro se rechaza", async () => {
  const key = deviceKey();
  await rejects(async () => identity.buildEnrollment({ employee: { metadata: {} }, user, input: enrollmentInput(key, { device_id: "a b" }), now: NOW }), "DISPOSITIVO_INVALIDO");
});

test("la marcacion de la app firmada en el telefono registrado queda verificada", async () => {
  const key = deviceKey();
  const real = await realJpeg();
  const result = await identity.verifyPunchIdentity({ employee: enrolledEmployee(key), user, input: mobilePunch(key, { bytes: real }), now: NOW });
  assert.equal(result.identity_verification.status, "verified");
  assert.equal(result.identity_verification.device_id, DEVICE);
  assert.equal(result.identity_verification.channel, "mobile");
  // Nada de lo que llega se re-emite: la firma de la app cierra sobre el sha256 de los bytes
  // recibidos, y cualquier transcodificacion cambiaria ese hash. Lo almacenado es la JPEG
  // exacta que subio el telefono, en su base64 canonico.
  assert.equal(result.identity_photo.sha256, sha(real));
  assert.equal(result.identity_photo.original_sha256, sha(real));
  assert.equal(result.identity_photo.base64_data, `data:image/jpeg;base64,${real.toString("base64")}`);
  assert.equal(result.identity_photo.evidence_status, "available");
});

test("la selfie se guarda como data URL canonico aunque llegue sin prefijo", async () => {
  const key = deviceKey();
  const real = await realJpeg();
  const result = await identity.verifyPunchIdentity({ employee: enrolledEmployee(key), user, input: mobilePunch(key, { bytes: real, dataUrl: false }), now: NOW });
  assert.ok(result.identity_photo.base64_data.startsWith("data:image/jpeg;base64,"));
  assert.equal(Buffer.from(result.identity_photo.base64_data.split(",")[1], "base64").toString("base64"), result.identity_photo.base64_data.split(",")[1]);
});

test("acepta selfie PNG declarada PNG", async () => {
  const key = deviceKey();
  const png = await sharpLib({ create: { width: 20, height: 20, channels: 3, background: { r: 10, g: 20, b: 30 } } }).png().toBuffer();
  const result = await identity.verifyPunchIdentity({ employee: enrolledEmployee(key), user, input: mobilePunch(key, { bytes: png, type: "image/png" }), now: NOW });
  // El PNG es renderizable por el navegador y se guarda verbatim: conserva su tipo olido y su
  // hash firmado. Ya no existe la re-emision forzada a JPEG (ver `normalizeSelfie`).
  assert.equal(result.identity_photo.type, "image/png");
  assert.equal(result.identity_photo.sha256, sha(png));
  assert.equal(result.identity_photo.sniffed_mime, "image/png");
  assert.equal(result.identity_photo.evidence_status, "available");
  assert.equal(result.identity_verification.status, "verified");
});

test("la web guarda la selfie pero no la da por verificada", async () => {
  const real = await realJpeg();
  const result = await identity.verifyPunchIdentity({ employee: { metadata: {} }, user, input: webPunch({ bytes: real }), now: NOW });
  assert.equal(result.identity_verification.status, "photo_only");
  assert.equal(result.identity_verification.channel, "web");
  // El navegador no firma nada: la foto muestra quien marco, no lo prueba.
  assert.equal(result.identity_verification.signature, undefined);
  assert.equal(result.identity_photo.sha256, sha(real));
  assert.ok(result.identity_photo.base64_data.startsWith("data:image/jpeg;base64,"));
});

test("la web no puede marcar entrada ni salida sin selfie", async () => {
  for (const punchType of ["entrada", "salida"]) {
    await rejects(async () => identity.verifyPunchIdentity({ employee: { metadata: {} }, user, input: webPunch({ punchType, selfie: false }), now: NOW }), "SELFIE_REQUERIDA");
  }
});

test("la web reenvia una entrada sin foto cuando el servidor ya rechazo esa foto", async () => {
  // La cola web despega la foto que el propio API rechazo y reenvia la hora con su novedad.
  // Si aqui vuelve SELFIE_REQUERIDA, el operario pierde la jornada: la espiral medida del
  // user 231 (sin entrada, todo lo demas paso a FUERA_DE_SECUENCIA).
  for (const punchType of ["entrada", "salida"]) {
    const input = webPunch({ punchType, selfie: false });
    input.metadata.evidence_status = "degraded";
    input.metadata.evidence_detached_reason = "El archivo de validacion debe ser una imagen JPEG o PNG.";
    input.metadata.hr_novelty = { kind: "selfie_pendiente", requires_supervisor_action: true, failure_code: "EVIDENCIA_ALFABETO_INVALIDO", message: "Falta la foto de validacion." };
    const result = await identity.verifyPunchIdentity({ employee: { metadata: {} }, user, input, now: NOW });
    assert.equal(result.identity_verification.status, "not_verified", "la hora entra pero la identidad no queda verificada");
    assert.equal(result.identity_verification.evidence_status, "degraded");
    assert.equal(result.identity_verification.evidence_failure_code, "EVIDENCIA_ALFABETO_INVALIDO");
    assert.match(result.identity_verification.evidence_detached_reason, /JPEG o PNG/);
  }
});

test("la excepcion de la foto desprendida no se compra con una declaracion inventada", async () => {
  const casos = [
    { etiqueta: "sin codigo de evidencia", metadata: { evidence_status: "degraded", evidence_detached_reason: "Ya no tengo la foto en el equipo." } },
    { etiqueta: "con un codigo que no es del contrato", metadata: { evidence_status: "degraded", evidence_detached_reason: "Ya no tengo la foto en el equipo.", hr_novelty: { failure_code: "YO_DECIDO" } } },
    { etiqueta: "sin motivo legible", metadata: { evidence_status: "degraded", hr_novelty: { failure_code: "EVIDENCIA_ALFABETO_INVALIDO" } } },
    { etiqueta: "declarando otro estado", metadata: { evidence_status: "available", evidence_detached_reason: "Ya no tengo la foto en el equipo.", hr_novelty: { failure_code: "EVIDENCIA_ALFABETO_INVALIDO" } } }
  ];
  for (const caso of casos) {
    const input = webPunch({ selfie: false });
    Object.assign(input.metadata, caso.metadata);
    await rejects(async () => identity.verifyPunchIdentity({ employee: { metadata: {} }, user, input, now: NOW }), "SELFIE_REQUERIDA");
  }
});

test("el almuerzo de la web sigue marcandose sin foto", async () => {
  for (const punchType of ["inicio_almuerzo", "fin_almuerzo"]) {
    const result = await identity.verifyPunchIdentity({ employee: { metadata: {} }, user, input: webPunch({ punchType, selfie: false }), now: NOW });
    assert.deepEqual(result, { identity_verification: { status: "not_verified", channel: "web" } });
  }
});

test("la app sin telefono registrado no puede marcar", async () => {
  const key = deviceKey();
  await rejects(async () => identity.verifyPunchIdentity({ employee: { metadata: {} }, user, input: mobilePunch(key), now: NOW }), "BIOMETRIA_NO_REGISTRADA");
});

test("una version vieja de la app (sin firma) no puede marcar", async () => {
  const key = deviceKey();
  const input = { type: "entrada", metadata: { source: identity.MOBILE_SOURCE, biometric_verified: true } };
  await rejects(async () => identity.verifyPunchIdentity({ employee: enrolledEmployee(key), user, input, now: NOW }), "IDENTIDAD_REQUERIDA");
});

test("desde otro telefono no se puede marcar", async () => {
  const key = deviceKey();
  await rejects(async () => identity.verifyPunchIdentity({ employee: enrolledEmployee(key), user, input: mobilePunch(key, { deviceId: "otro-telefono-123" }), now: NOW }), "DISPOSITIVO_NO_REGISTRADO");
});

test("con la llave de otro telefono la firma no pasa", async () => {
  const key = deviceKey();
  await rejects(async () => identity.verifyPunchIdentity({ employee: enrolledEmployee(key), user, input: mobilePunch(key, { signWith: deviceKey() }), now: NOW }), "FIRMA_BIOMETRICA_INVALIDA");
});

test("cambiar la selfie despues de firmar invalida la marcacion", async () => {
  const key = deviceKey();
  const input = mobilePunch(key);
  const other = Buffer.concat([JPEG, Buffer.from([1])]);
  input.metadata.identity_photo.base64 = `data:image/jpeg;base64,${other.toString("base64")}`;
  await rejects(async () => identity.verifyPunchIdentity({ employee: enrolledEmployee(key), user, input, now: NOW }), "FIRMA_BIOMETRICA_INVALIDA");
});

test("cambiar el tipo de marcacion despues de firmar la invalida", async () => {
  const key = deviceKey();
  await rejects(async () => identity.verifyPunchIdentity({ employee: enrolledEmployee(key), user, input: mobilePunch(key, { signedType: "salida" }), now: NOW }), "FIRMA_BIOMETRICA_INVALIDA");
});

test("sin selfie la app no puede marcar entrada ni salida", async () => {
  const key = deviceKey();
  for (const punchType of ["entrada", "salida"]) {
    const input = mobilePunch(key, { punchType });
    delete input.metadata.identity_photo;
    await rejects(async () => identity.verifyPunchIdentity({ employee: enrolledEmployee(key), user, input, now: NOW }), "SELFIE_REQUERIDA");
  }
});

test("el almuerzo se marca sin selfie pero firmado", async () => {
  const key = deviceKey();
  for (const punchType of ["inicio_almuerzo", "fin_almuerzo"]) {
    const result = await identity.verifyPunchIdentity({ employee: enrolledEmployee(key), user, input: mobilePunch(key, { punchType, selfie: false }), now: NOW });
    assert.equal(result.identity_verification.status, "verified");
    assert.equal(result.identity_photo, undefined);
  }
});

test("quitarle la selfie a una entrada firmada con foto no la cuela como almuerzo", async () => {
  const key = deviceKey();
  // Firmada como inicio_almuerzo sin foto, pero enviada como entrada: la
  // firma cubre el tipo, asi que no pasa.
  const input = mobilePunch(key, { punchType: "inicio_almuerzo", selfie: false });
  input.type = "entrada";
  await rejects(async () => identity.verifyPunchIdentity({ employee: enrolledEmployee(key), user, input, now: NOW }), "SELFIE_REQUERIDA");
});

test("una app vieja todavia marca el almuerzo con foto, pero la foto no se guarda", async () => {
  // Quien no ha actualizado firmo con el hash de su selfie. Se le deja marcar
  // (si no, se queda sin almorzar) pero el almuerzo deja de acumular caras.
  const key = deviceKey();
  const result = await identity.verifyPunchIdentity({ employee: enrolledEmployee(key), user, input: mobilePunch(key, { punchType: "inicio_almuerzo" }), now: NOW });
  assert.equal(result.identity_verification.status, "verified");
  assert.equal(result.identity_photo, undefined);
});

test("en el almuerzo la firma sigue atada al telefono registrado", async () => {
  const key = deviceKey();
  for (const selfie of [true, false]) {
    await rejects(async () => identity.verifyPunchIdentity({ employee: enrolledEmployee(key), user, input: mobilePunch(key, { punchType: "inicio_almuerzo", selfie, signWith: deviceKey() }), now: NOW }), "FIRMA_BIOMETRICA_INVALIDA");
  }
});

test("una selfie que no es imagen se rechaza", async () => {
  const key = deviceKey();
  // PDF y video NO pertenecen a la clase imagen: se rechazan, no se degradan.
  await rejects(async () => identity.verifyPunchIdentity({ employee: enrolledEmployee(key), user, input: mobilePunch(key, { bytes: Buffer.concat([Buffer.from("%PDF-1.7 "), Buffer.alloc(200, 7)]), type: "application/pdf" }), now: NOW }), "VALIDACION");
  await rejects(async () => identity.verifyPunchIdentity({ employee: enrolledEmployee(key), user, input: mobilePunch(key, { bytes: Buffer.concat([Buffer.alloc(4, 0), Buffer.from("ftypisom"), Buffer.alloc(200, 7)]), type: "image/jpeg" }), now: NOW }), "VALIDACION");
});

test("una selfie declarada JPEG pero con contenido PNG real es evidencia disponible", async () => {
  // La igualdad estricta de MIME se relaja SOLO para la evidencia de RR.HH.: un PNG declarado
  // jpeg pertenece a la clase imagen y no puede costarle la jornada a nadie. Y como el navegador
  // SI pinta PNG, la evidencia queda `available` -no degradada- conservando los bytes firmados.
  const key = deviceKey();
  const png = await sharpLib({ create: { width: 20, height: 20, channels: 3, background: { r: 9, g: 8, b: 7 } } }).png().toBuffer();
  const result = await identity.verifyPunchIdentity({ employee: enrolledEmployee(key), user, input: mobilePunch(key, { bytes: png, type: "image/jpeg" }), now: NOW });
  assert.equal(result.identity_verification.status, "verified");
  assert.equal(result.identity_photo.sniffed_mime, "image/png");
  assert.equal(result.identity_photo.declared_mime, "image/jpeg");
  assert.equal(result.identity_photo.evidence_status, "available");
  assert.equal(result.identity_photo.sha256, sha(png));
});

test("un PNG declarado jpeg que el navegador no puede decodificar degrada, no rechaza", async () => {
  // Cabecera PNG legitima (clase imagen) con relleno sintatico: no renderiza. La jornada se
  // conserva, la evidencia se degrada y la firma sigue cerrando sobre los bytes guardados.
  const key = deviceKey();
  const result = await identity.verifyPunchIdentity({ employee: enrolledEmployee(key), user, input: mobilePunch(key, { bytes: PNG, type: "image/jpeg" }), now: NOW });
  assert.equal(result.identity_verification.status, "verified");
  assert.equal(result.identity_verification.evidence_status, "degraded");
  assert.equal(result.identity_verification.evidence_failure_code, identity.EVIDENCE_DEGRADATION_CODES.not_decodable);
  assert.equal(result.identity_photo.sniffed_mime, "image/png");
  assert.equal(result.identity_photo.declared_mime, "image/jpeg");
  assert.equal(result.identity_photo.evidence_status, "degraded");
  assert.equal(result.identity_photo.sha256, sha(PNG));
});
test("una selfie demasiado grande se rechaza", async () => {
  const key = deviceKey();
  const big = Buffer.concat([JPEG, Buffer.alloc(identity.MAX_IDENTITY_PHOTO_BYTES, 1)]);
  await assert.rejects(async () => identity.verifyPunchIdentity({ employee: enrolledEmployee(key), user, input: mobilePunch(key, { bytes: big }), now: NOW }), /tamano maximo/);
});

test("restablecer pasa el registro al historial sin la llave", async () => {
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

test("el historial de registros no crece sin limite", async () => {
  const key = deviceKey();
  const history = Array.from({ length: 25 }, (_, index) => ({ device_id: `old-${index}` }));
  const metadata = identity.resetEnrollmentMetadata({ ...enrolledEmployee(key).metadata, mobile_biometric_history: history }, { now: NOW });
  assert.equal(metadata.mobile_biometric_history.length, 20);
  assert.equal(metadata.mobile_biometric_history.at(-1).device_id, DEVICE);
});

test("los listados no llevan el contenido de la selfie ni la firma cruda", async () => {
  const key = deviceKey();
  const real = await realJpeg();
  const verified = await identity.verifyPunchIdentity({ employee: enrolledEmployee(key), user, input: mobilePunch(key, { bytes: real }), now: NOW });
  const stored = { source: identity.MOBILE_SOURCE, identity: { signature: "x" }, ...verified };
  const visible = identity.publicPunchMetadata(stored);
  assert.equal(visible.identity, undefined);
  assert.equal(visible.identity_photo.base64_data, undefined);
  assert.equal(visible.identity_photo.has_base64_data, true);
  assert.equal(visible.identity_verification.status, "verified");
});

test("una fila degradada jamas anuncia evidencia en los listados, aunque lleve bytes", () => {
  // Guarda del contrato: si esta proyeccion dejara pasar `has_base64_data: true` en una fila
  // degradada, la pantalla prometeria un archivo que el visor no puede pintar.
  const degraded = {
    source: identity.MOBILE_SOURCE,
    identity: { signature: "cruda" },
    identity_photo: {
      name: "selfie.heic", type: "image/heif", size: 4096, evidence_status: "degraded",
      evidence_failure_code: "EVIDENCIA_NO_DECODIFICABLE", has_base64_data: true,
      base64_data: "data:image/heif;base64,AAAAAAAA", storage_path: "company/t1/x.heic"
    }
  };
  const visible = identity.publicPunchMetadata(degraded);
  assert.equal(visible.identity, undefined);
  assert.equal(visible.identity_photo.base64_data, undefined);
  assert.equal(visible.identity_photo.storage_path, null);
  assert.equal(visible.identity_photo.has_base64_data, false);
  assert.equal(visible.identity_photo.evidence_failure_code, "EVIDENCIA_NO_DECODIFICABLE");
});

test("la selfie se entrega al monitor como evidencia", async () => {
  const key = deviceKey();
  const real = await realJpeg();
  const verified = await identity.verifyPunchIdentity({ employee: enrolledEmployee(key), user, input: mobilePunch(key, { bytes: real }), now: NOW });
  const evidence = identity.identityEvidenceOf({ id: 15, metadata: verified });
  assert.equal(evidence.evidence_type, "identity_selfie");
  assert.ok(evidence.base64_data.startsWith("data:image/jpeg;base64,"));
  assert.equal(identity.identityEvidenceOf({ id: 16, metadata: {} }), null);
});

test("la evidencia degradada tambien llega al monitor, con su motivo", async () => {
  // El monitor necesita nombrar la evidencia que NO pudo pintar y, en el canal movil, servirla
  // por id: son los bytes firmados. Un `null` aqui deja al supervisor sin las dos cosas.
  const key = deviceKey();
  const verified = await identity.verifyPunchIdentity({ employee: enrolledEmployee(key), user, input: mobilePunch(key), now: NOW });
  assert.equal(verified.identity_photo.evidence_status, "degraded");
  const evidence = identity.identityEvidenceOf({ id: 40, metadata: verified });
  assert.equal(evidence.evidence_type, "identity_selfie");
  assert.equal(evidence.evidence_status, "degraded");
  assert.equal(evidence.evidence_failure_code, "EVIDENCIA_NO_DECODIFICABLE");
  assert.equal(evidence.mime_type, "image/jpeg");
  assert.ok(evidence.base64_data.startsWith("data:image/jpeg;base64,"));
  // En la web la fila degradada no conserva bytes ilegibles: el descriptor sigue siendo util.
  const webDegraded = { identity_photo: { name: "s.jpg", type: "image/heif", size: 10, evidence_status: "degraded", evidence_failure_code: "EVIDENCIA_NO_DECODIFICABLE", has_base64_data: false } };
  const webEvidence = identity.identityEvidenceOf({ id: 41, metadata: webDegraded });
  assert.equal(webEvidence.evidence_status, "degraded");
  assert.equal(webEvidence.base64_data, undefined);
});

test("las selfies guardadas antes del despliegue tambien llegan al monitor", async () => {
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

test("lo que ve el empleado de su registro nunca incluye la llave", async () => {
  const key = deviceKey();
  const visible = identity.publicEnrollment(enrolledEmployee(key, { platform: "android", device_model: "Pixel 8" }));
  assert.deepEqual(visible, { enrolled: true, device_id: DEVICE, platform: "android", device_model: "Pixel 8", enrolled_at: "2026-11-01T10:00:00.000Z" });
  assert.deepEqual(identity.publicEnrollment({ metadata: {} }), { enrolled: false });
});
