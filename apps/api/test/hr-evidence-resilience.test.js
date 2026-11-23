const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");

const identity = require("../src/modules/hr/mobile-identity");
const { validateEvidenceContent, EVIDENCE_FAILURE_CODES } = require("../src/security/policy");
const { mapApiError } = require("../src/core/api-error");
const sharpLib = require("sharp");

// Identidad del telefono: misma forma que entrega Android Keystore (SPKI DER + firma DER).
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
const sha = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");

function enrolledEmployee(key) {
  return {
    id: 7,
    metadata: { name: "Tecnico", mobile_biometric: { device_id: DEVICE, public_key: key.publicKey, key_algorithm: "EC_P256_SHA256", enrolled_at: "2026-11-01T10:00:00.000Z" } }
  };
}

// La app firma el sha256 de los bytes QUE ENVIA. `photoBase64` permite enviar una codificacion
// distinta (prefijo duplicado, saltos, url-safe, sin padding) de la que se firmo: es justo lo
// que el transporte rompe y lo que la normalizacion debe reparar sin tocar el veredicto.
function mobilePunch(key, { bytes, photoBase64, type = "image/jpeg", punchType = "entrada", signedBytes, size } = {}) {
  const punchedAt = "2026-11-04T13:02:00.000Z";
  const idempotencyKey = "b3c1f2a4-9e7d-4c6b-8a10-123456789abc";
  const photoSha256 = sha(signedBytes || bytes);
  const message = identity.punchMessage({ userId: user.id, type: punchType, punchedAt, idempotencyKey, deviceId: DEVICE, photoSha256 });
  const encoded = photoBase64 || bytes.toString("base64");
  return {
    user_name: "Tecnico",
    type: punchType,
    punched_at: punchedAt,
    idempotency_key: idempotencyKey,
    metadata: {
      source: identity.MOBILE_SOURCE,
      identity: { device_id: DEVICE, signature: key.sign(message) },
      identity_photo: { name: "selfie.jpg", type, size: size ?? bytes.length, base64: `data:${type};base64,${encoded}` }
    }
  };
}

function webPunch({ bytes, type = "image/jpeg", punchType = "entrada", size } = {}) {
  return {
    user_name: "Tecnico",
    type: punchType,
    metadata: { source: "web" },
    identity_photo: { name: "selfie.jpg", type, size: size ?? bytes.length, base64: `data:${type};base64,${bytes.toString("base64")}` }
  };
}

// Asercion RED: exige el codigo EXACTO con el que el modulo rechaza. Si la compuerta se afloja
// (degrada lo que debía rechazar) o se vuelve muda (`code` vacio, como en produccion), cae.
// El motivo machine-readable se comprueba aparte en `error.details.evidence_failure_code`.
async function rejectsCode(fn, code) {
  let error = null;
  try {
    await fn();
  } catch (cause) {
    error = cause;
  }
  assert.ok(error, `esperaba rechazo ${code}, no hubo ninguno`);
  assert.equal(error.code, code, `esperaba ${code}, llego ${error.code}: ${error.message}`);
  return error;
}

async function realJpeg(width = 24, height = 24) {
  return sharpLib({ create: { width, height, channels: 3, background: { r: 180, g: 140, b: 110 } } }).jpeg({ quality: 90 }).toBuffer();
}

async function realPng() {
  return sharpLib({ create: { width: 20, height: 20, channels: 3, background: { r: 9, g: 20, b: 40 } } }).png().toBuffer();
}

async function realAvif() {
  return sharpLib({ create: { width: 16, height: 16, channels: 3, background: { r: 30, g: 90, b: 60 } } }).avif().toBuffer();
}

async function realWebp() {
  return sharpLib({ create: { width: 16, height: 16, channels: 3, background: { r: 1, g: 2, b: 3 } } }).webp().toBuffer();
}

// HEIC sintetica con marca mayor `heic`: contenedor HEIF legitimo (clase imagen) que este
// build de sharp NO puede decodificar -libvips compilado sin decodificador HEVC, medido en
// esta intervencion-. Es exactamente el caso que degrada y nunca cuesta la jornada.
function heicBytes(fill = 11) {
  return Buffer.concat([
    Buffer.from([0, 0, 0, 24]), Buffer.from("ftyp"), Buffer.from("heic"),
    Buffer.from([0, 0, 0, 24]), Buffer.from("heic"), Buffer.from("mif1"),
    Buffer.alloc(600, fill)
  ]);
}

// TIFF: foto real de camara de escaner, no renderizable por todos los visores y fuera de la
// lista de clases pintables declarada en `mobile-identity`.
function tiffBytes() {
  return Buffer.concat([Buffer.from("II*\0", "ascii"), Buffer.alloc(500, 5)]);
}

function pdfBytes() {
  return Buffer.concat([Buffer.from("%PDF-1.7 "), Buffer.alloc(400, 7)]);
}

function mp4Bytes() {
  return Buffer.concat([Buffer.alloc(4, 0), Buffer.from("ftypisom"), Buffer.alloc(400, 7)]);
}

// ---------------------------------------------------------------------------
// 1. No se transcodifica: lo almacenado son los bytes que cubrio la firma.
// ---------------------------------------------------------------------------

test("la selfie recibida se guarda verbatim: ningun byte re-codificado", async () => {
  const real = await realJpeg();
  const stored = await identity.normalizeSelfie({ name: "s.jpg", type: "image/jpeg", size: real.length, base64: real.toString("base64") }, { persistDegradedPayload: true });
  assert.equal(stored.stored.evidence_status, "available");
  assert.equal(stored.stored.sha256, sha(real));
  // Esta asercion es la que se rompe si alguien devuelve a meter `sharp(...).toBuffer()`:
  // un re-encode cambiaria los bytes y, con ellos, el hash que cierra la firma de la app.
  assert.equal(Buffer.from(stored.stored.base64_data.split(",")[1], "base64").equals(real), true);
});

test("el canal movil queda verified sobre la JPEG firmada y su hash coincide", async () => {
  const key = deviceKey();
  const real = await realJpeg();
  const result = await identity.verifyPunchIdentity({ employee: enrolledEmployee(key), user, input: mobilePunch(key, { bytes: real }), now: NOW });
  assert.equal(result.identity_verification.status, "verified");
  assert.equal(result.identity_verification.evidence_status, undefined);
  assert.equal(result.identity_photo.sha256, sha(real));
  assert.equal(result.identity_photo.evidence_status, "available");
});

test("una AVIF real de camara queda available conservando sus bytes y su tipo olido", async () => {
  const key = deviceKey();
  const avif = await realAvif();
  const result = await identity.verifyPunchIdentity({ employee: enrolledEmployee(key), user, input: mobilePunch(key, { bytes: avif }), now: NOW });
  assert.equal(result.identity_verification.status, "verified");
  assert.equal(result.identity_photo.sniffed_mime, "image/avif");
  assert.equal(result.identity_photo.type, "image/avif");
  assert.equal(result.identity_photo.evidence_status, "available");
  assert.equal(result.identity_photo.sha256, sha(avif));
});

test("un WEBP real queda available y conserva el hash firmado", async () => {
  const png = await realPng();
  const webp = await realWebp();
  const stored = await identity.normalizeSelfie({ name: "s.webp", type: "image/png", size: webp.length, base64: webp.toString("base64") });
  assert.equal(stored.stored.evidence_status, "available");
  assert.equal(stored.stored.sniffed_mime, "image/webp");
  assert.equal(stored.stored.sha256, sha(webp));
  // El PNG de referencia sigue siendo pintable: la regla es por clase, no por archivo.
  const asPng = await identity.normalizeSelfie({ name: "s.png", type: "image/png", size: png.length, base64: png.toString("base64") });
  assert.equal(asPng.stored.evidence_status, "available");
});

// ---------------------------------------------------------------------------
// 2. Degradacion: foto legitima que el navegador no pinta.
// ---------------------------------------------------------------------------

test("un HEIC con marca HEVC real degrada la evidencia y no cuesta la marcacion", async () => {
  const key = deviceKey();
  const heic = heicBytes();
  const result = await identity.verifyPunchIdentity({ employee: enrolledEmployee(key), user, input: mobilePunch(key, { bytes: heic }), now: NOW });
  assert.equal(result.identity_verification.status, "verified");
  assert.equal(result.identity_verification.evidence_status, "degraded");
  assert.equal(result.identity_verification.signed_sha256, sha(heic));
  assert.equal(result.identity_photo.evidence_status, "degraded");
  assert.equal(result.identity_photo.evidence_failure_code, identity.EVIDENCE_DEGRADATION_CODES.not_decodable);
  assert.equal(result.identity_photo.sniffed_mime, "image/heif");
  // Los bytes firmados SI se conservan en el canal movil: integridad probada y archivo que
  // el supervisor puede pedir por id aunque su navegador no lo pinte.
  assert.equal(result.identity_photo.sha256, sha(heic));
  assert.equal(result.identity_photo.has_base64_data, false);
  assert.equal(result.identity_photo.evidence_inline, true);
  assert.ok(result.identity_photo.base64_data.startsWith("data:image/heif;base64,"));
});

test("un TIFF degrada en lugar de rechazar", async () => {
  // Un escaner manda TIFF y el olfato de contenido no lo conoce (`sniffed_mime` nulo): es una
  // foto REAL declarada como foto, que el visor no va a pintar. Degrada -no es una clase
  // prohibida-, conserva los bytes firmados y no cuesta la jornada. Declarado con un tipo que
  // no es imagen, en cambio, si se rechaza: eso ya es mentir sobre el contenido.
  const key = deviceKey();
  const tiff = tiffBytes();
  const result = await identity.verifyPunchIdentity({ employee: enrolledEmployee(key), user, input: mobilePunch(key, { bytes: tiff, type: "image/tiff" }), now: NOW });
  assert.equal(result.identity_verification.status, "verified");
  assert.equal(result.identity_photo.evidence_status, "degraded");
  assert.equal(result.identity_photo.sha256, sha(tiff));
  assert.equal(result.identity_photo.evidence_inline, true);
  const mentiroso = await rejectsCode(
    async () => identity.verifyPunchIdentity({ employee: enrolledEmployee(key), user, input: mobilePunch(key, { bytes: tiff, type: "application/pdf" }), now: NOW }),
    "VALIDACION"
  );
  // El codigo de negocio es `VALIDACION` (contrato del modulo y de la certificacion e2e) y el
  // motivo machine-readable viaja en el detalle: sin olfato que confirme una raster y con un
  // tipo declarado que no es imagen, lo que se niega es la CLASE del contenido.
  assert.equal(mentiroso.statusCode, 400);
  assert.equal(mentiroso.details.evidence_failure_code, EVIDENCE_FAILURE_CODES.content_class);
});

test("PNG declarado jpeg pero ileible degrada con su motivo machine-readable", async () => {
  const key = deviceKey();
  const fakePng = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(200, 3)]);
  const result = await identity.verifyPunchIdentity({ employee: enrolledEmployee(key), user, input: mobilePunch(key, { bytes: fakePng, type: "image/jpeg" }), now: NOW });
  assert.equal(result.identity_verification.status, "verified");
  assert.equal(result.identity_photo.evidence_status, "degraded");
  assert.equal(result.identity_photo.declared_mime, "image/jpeg");
  assert.equal(result.identity_photo.sniffed_mime, "image/png");
  assert.equal(result.identity_photo.evidence_failure_code, identity.EVIDENCE_DEGRADATION_CODES.not_decodable);
});

// ---------------------------------------------------------------------------
// 3. Transporte tolerado: se repara y se registra, nunca se re-inventa contenido.
// ---------------------------------------------------------------------------

test("el transporte roto se tolera y se registra en normalization_applied", async () => {
  const real = await realJpeg();
  const plain = real.toString("base64");
  const cases = [
    { label: "doble prefijo data:", base64: `data:image/jpeg;base64,data:image/jpeg;base64,${plain}`, wants: "double_prefix" },
    { label: "saltos de linea", base64: `data:image/jpeg;base64,${plain.replace(/(.{20})/g, "$1\n")}`, wants: "whitespace" },
    { label: "sin padding", base64: `data:image/jpeg;base64,${plain.replace(/=+$/, "")}`, wants: "padding" }
  ];
  for (const item of cases) {
    const stored = await identity.normalizeSelfie({ name: "s.jpg", type: "image/jpeg", size: real.length, base64: item.base64 }, { persistDegradedPayload: true });
    assert.equal(stored.stored?.evidence_status, "available", item.label);
    assert.equal(stored.stored.sha256, sha(real), `${item.label}: el hash sigue siendo el de los bytes firmados`);
    assert.ok(stored.stored.normalization_applied.includes(item.wants), `${item.label}: esperaba ${item.wants} en ${JSON.stringify(stored.stored.normalization_applied)}`);
    // Lo persistido es canonico: sale sin el desperfecto con el que entro.
    assert.ok(stored.stored.base64_data.startsWith("data:image/jpeg;base64,"), item.label);
    assert.equal(stored.stored.base64_data.includes("\n"), false, item.label);
  }
});

test("el alfabeto url-safe se tolera y la firma sigue cerrando", async () => {
  const key = deviceKey();
  const real = await realJpeg();
  const canonical = real.toString("base64");
  const urlSafe = canonical.replace(/\+/g, "-").replace(/\//g, "_");
  const result = await identity.verifyPunchIdentity({ employee: enrolledEmployee(key), user, input: mobilePunch(key, { bytes: real, photoBase64: urlSafe }), now: NOW });
  assert.equal(result.identity_verification.status, "verified");
  assert.equal(result.identity_photo.sha256, sha(real));
  assert.ok(result.identity_photo.normalization_applied.includes("urlsafe"));
});

// ---------------------------------------------------------------------------
// 4. Rechazos duros que NO se relajan.
// ---------------------------------------------------------------------------

test("un PDF o un mp4 disfrazados de selfie se rechazan con codigo y detalle", async () => {
  const key = deviceKey();
  for (const [label, bytes] of [["pdf", pdfBytes()], ["mp4", mp4Bytes()]]) {
    let error = null;
    try {
      await identity.verifyPunchIdentity({ employee: enrolledEmployee(key), user, input: mobilePunch(key, { bytes }), now: NOW });
    } catch (cause) {
      error = cause;
    }
    assert.ok(error, `${label}: esperaba rechazo`);
    assert.equal(error.statusCode, 400, label);
    // El codigo de negocio sigue siendo `VALIDACION` (contrato del modulo y de la certificacion
    // end-to-end); lo que se agrega es el motivo machine-readable en el detalle.
    assert.equal(error.code, "VALIDACION", `${label}: ${error.code}`);
    assert.equal(error.details.evidence_failure_code, EVIDENCE_FAILURE_CODES.content_class, label);
    assert.equal(error.details.field, "identity_photo", label);
    // El detalle dice que OLIO el servidor: es lo unico que distingue "video" de "foto mala".
    assert.ok(["video/mp4", "application/pdf"].includes(error.details.sniffed_mime), `${label}: ${error.details.sniffed_mime}`);
  }
});

test("un payload con alfabeto invalido se rechaza, no se degrada", async () => {
  const key = deviceKey();
  const broken = "data:image/jpeg;base64,!!!!no-es-base64!!!!";
  await rejectsCode(
    async () => identity.verifyPunchIdentity({ employee: enrolledEmployee(key), user, input: mobilePunch(key, { bytes: Buffer.alloc(64, 1), photoBase64: broken.slice(23), signedBytes: Buffer.alloc(64, 1) }), now: NOW }),
    "VALIDACION"
  );
});

test("el rechazo por clase llega al cliente con el motivo machine-readable en el detalle", async () => {
  const key = deviceKey();
  let thrown = null;
  try {
    await identity.verifyPunchIdentity({ employee: enrolledEmployee(key), user, input: mobilePunch(key, { bytes: pdfBytes() }), now: NOW });
  } catch (error) {
    thrown = error;
  }
  const mapped = mapApiError(thrown, { url: "/api/v1/hr/self/time-punches", method: "POST" }, "req-1");
  assert.equal(mapped.statusCode, 400);
  assert.equal(mapped.payload.code, "VALIDACION");
  assert.equal(mapped.payload.details.evidence_failure_code, EVIDENCE_FAILURE_CODES.content_class);
  assert.equal(mapped.payload.details.field, "identity_photo");
});

test("el tope de bytes sigue rechazando y nombra el limite que disparo", async () => {
  const key = deviceKey();
  const cap = identity.identityPhotoByteCap();
  const big = Buffer.concat([await realJpeg(4, 4), Buffer.alloc(cap, 1)]);
  assert.ok(big.length > cap, "el fixture debe superar el tope");
  let error = null;
  try {
    await identity.verifyPunchIdentity({ employee: enrolledEmployee(key), user, input: mobilePunch(key, { bytes: big }), now: NOW });
  } catch (cause) {
    error = cause;
  }
  assert.ok(error, "el tope de almacenamiento dejo de rechazar");
  assert.equal(error.statusCode, 400);
  assert.equal(error.code, "VALIDACION");
  assert.equal(error.details.evidence_failure_code, EVIDENCE_FAILURE_CODES.oversize);
  assert.match(error.message, /tamano maximo/);
  assert.match(error.message, new RegExp(String(cap)));
  assert.equal(error.details.max_bytes, cap);
  assert.equal(error.details.byte_length, big.length);
});

test("el canal web usa su propio tope de 2 MB y lo nombra", async () => {
  const cap = identity.WEB_IDENTITY_PHOTO_MAX_BYTES;
  assert.equal(cap, 2 * 1024 * 1024);
  const big = Buffer.concat([await realJpeg(4, 4), Buffer.alloc(cap, 1)]);
  await assert.rejects(async () => identity.verifyPunchIdentity({ employee: { metadata: {} }, user, input: webPunch({ bytes: big }), now: NOW }), (error) => {
    assert.equal(error.code, "VALIDACION", error.code);
    assert.equal(error.details.evidence_failure_code, EVIDENCE_FAILURE_CODES.oversize);
    assert.match(error.message, new RegExp(String(cap)));
    return true;
  });
});

test("la compuerta del almacen y la de la selfie afirman lo mismo sobre el mismo payload", async () => {
  // Las dos compuertas leen `validateEvidenceContent`: si divergiera, la marcacion entraria
  // con una evidencia que despues el almacen rechaza (o al reves).
  const real = await realJpeg();
  const viaGate = validateEvidenceContent({ base64_data: real.toString("base64"), mime_type: "image/jpeg" }, { contentClass: "image", maxBytes: identity.identityPhotoByteCap(), field: "identity_photo" });
  const viaSelfie = identity.inspectSelfiePayload({ type: "image/jpeg", base64: real.toString("base64") });
  assert.equal(viaGate.ok, true);
  assert.equal(viaSelfie.ok, true);
  assert.equal(viaGate.sha256, viaSelfie.sha256);
  assert.equal(viaGate.sniffed_mime, viaSelfie.sniffed_mime);
});

// ---------------------------------------------------------------------------
// 5. La web: la foto nunca cuesta la jornada.
// ---------------------------------------------------------------------------

test("la web guarda la foto buena como photo_only y degrada la ilegible sin perder la marcacion", async () => {
  const real = await realJpeg();
  const good = await identity.verifyPunchIdentity({ employee: { metadata: {} }, user, input: webPunch({ bytes: real }), now: NOW });
  assert.equal(good.identity_verification.status, "photo_only");
  assert.equal(good.identity_photo.sha256, sha(real));
  assert.equal(good.identity_photo.evidence_status, "available");

  const bad = await identity.verifyPunchIdentity({ employee: { metadata: {} }, user, input: webPunch({ bytes: heicBytes() }), now: NOW });
  assert.equal(bad.identity_verification.status, "photo_only");
  assert.equal(bad.identity_verification.evidence_status, "degraded");
  assert.equal(bad.identity_verification.evidence_failure_code, identity.EVIDENCE_DEGRADATION_CODES.not_decodable);
  // En la web NO se persiste un payload ilegible: no prueba nada (no hay firma) e inflaria la fila.
  assert.equal(bad.identity_photo.base64_data, undefined);
  assert.equal(bad.identity_photo.has_base64_data, false);
  assert.equal(bad.identity_photo.evidence_inline, false);
  assert.equal(bad.identity_photo.sha256, sha(heicBytes()));
});

// ---------------------------------------------------------------------------
// 6. El contrato que ve el cliente: codigo + detalle legibles para un admin.
// ---------------------------------------------------------------------------

// Dos rechazos que la pantalla tiene que poder DISTINGUIR sin leer espanol: "secuencia
// incorrecta" (el fondo de validacion de marcaciones) y "foto invalida" (esta compuerta).
test("la pantalla distingue un rechazo de secuencia de un rechazo de foto", async () => {
  const key = deviceKey();
  // La secuencia la gobierna `nextPunchType` en el servicio; aqui se reproduce su rechazo con
  // el mismo contrato que ese fondo lanza: statusCode + code declarados.
  const outOfSequence = Object.assign(new Error("La siguiente marcacion permitida es salida."), {
    statusCode: 409,
    code: "MARCACION_FUERA_DE_SECUENCIA"
  });
  let photo = null;
  try {
    await identity.verifyPunchIdentity({ employee: enrolledEmployee(key), user, input: mobilePunch(key, { bytes: pdfBytes() }), now: NOW });
  } catch (error) {
    photo = error;
  }
  assert.ok(photo, "el rechazo de foto debio existir");
  const mappedSequence = mapApiError(outOfSequence, {}, "req-0");
  const mappedPhoto = mapApiError(photo, {}, "req-1");
  assert.equal(mappedSequence.statusCode, 409);
  assert.equal(mappedPhoto.statusCode, 400);
  // Codigo de negocio distinto y motivo machine-readable propio: ningun "sin codigo".
  assert.notEqual(mappedSequence.payload.code, mappedPhoto.payload.code);
  assert.ok(mappedSequence.payload.code, "el rechazo de secuencia llego sin codigo");
  assert.ok(mappedPhoto.payload.details?.evidence_failure_code, "el rechazo de foto llego sin motivo");
});

test("un rechazo de evidencia llega al cliente con codigo y detalle, no con una frase suelta", async () => {
  const key = deviceKey();
  let thrown = null;
  try {
    await identity.verifyPunchIdentity({ employee: enrolledEmployee(key), user, input: mobilePunch(key, { bytes: pdfBytes() }), now: NOW });
  } catch (error) {
    thrown = error;
  }
  const mapped = mapApiError(thrown, { url: "/api/v1/hr/self/time-punches", method: "POST" }, "req-1");
  assert.equal(mapped.statusCode, 400);
  // Medido en produccion: los 4xx de la marcacion llegaban con `code` vacio ("400 (sin codigo)
  // (sin detalle)"). Si el mapeo volviera a descartar `details`, esta asercion cae.
  assert.equal(mapped.payload.code, "VALIDACION");
  assert.equal(mapped.payload.details.evidence_failure_code, EVIDENCE_FAILURE_CODES.content_class);
  assert.equal(mapped.payload.details.field, "identity_photo");
  assert.equal(typeof mapped.payload.details.byte_length, "number");
});
