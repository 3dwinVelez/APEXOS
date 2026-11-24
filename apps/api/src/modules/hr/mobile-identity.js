const { punchPhotoItems } = require("./punchEvidence");
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
const { EVIDENCE_FAILURE_CODES, isHardContentRejection, validateEvidenceContent } = require("../../security/policy");
const { normalizePunchType } = require("./timeLogic");
const evidenceStorage = require("./evidenceStorage");

// Lectura del tope en CADA llamada: el modulo se carga con el proceso y las pruebas y los
// certificadores ajustan la variable en caliente; un valor capturado una sola vez dejaria
// de gobernar lo que realmente se rechaza.
function identityPhotoByteCap() {
  const configured = Number(process.env.HR_IDENTITY_PHOTO_MAX_BYTES || 0);
  return Number.isInteger(configured) && configured > 0 ? configured : MAX_IDENTITY_PHOTO_BYTES;
}

// Decodificacion acotada (regla 3b del dueno de seguridad): reloj duro, leido en cada corrida
// para que el puesto y las pruebas puedan ajustarlo. Un operario subiendo una foto enorme no
// puede dejar clavado al proceso unico del API.
//
// OJO: el decodificador SOLO decide si la imagen es renderizable por el navegador. Nunca
// re-emite bytes: ver `normalizeSelfie`.
const DECODE_LIMIT_PIXELS = 4096 * 4096;

function transcodeTimeoutMs() {
  const configured = Number(process.env.HR_EVIDENCE_TRANSCODE_TIMEOUT_MS || 0);
  return Number.isFinite(configured) && configured > 0 ? configured : 2000;
}

// Tope del canal web: la foto pasa por la camara del navegador y pesa mas que la que
// optimiza la app. Es el mismo tope de cualquier evidencia de marcacion.
const WEB_IDENTITY_PHOTO_MAX_BYTES = 2 * 1024 * 1024;

const MOBILE_SOURCE = "apexos-movil";
const KEY_ALGORITHM = "EC_P256_SHA256";
const ENROLL_CLOCK_SKEW_MS = 10 * 60 * 1000;
// La app reduce la selfie a ~20 KB; el tope deja margen sin aceptar fotos de
// camara completas que inflarian cada fila de marcacion.
const MAX_IDENTITY_PHOTO_BYTES = 300 * 1024;
const IDENTITY_PHOTO_TYPES = new Set(["image/jpeg", "image/png"]);
const HISTORY_LIMIT = 20;
// La selfie valida quien abre y quien cierra la jornada. El almuerzo y el
// retorno son cortes internos del mismo turno: ya hay una entrada verificada
// detras, y pedir cuatro fotos solo llenaba el monitor de caras repetidas.
//
// Esto rige SOLO el canal firmado de la app. Cambiarlo rompe las versiones ya
// instaladas: esas firman el almuerzo y el retorno contra `NO_PHOTO_SHA256`, asi
// que exigirles foto se convierte en `FIRMA_BIOMETRICA_INVALIDA`, no en un pedido
// de selfie. Para la web existe `WEB_SELFIE_REQUIRED_TYPES`, que es el otro canal.
const SELFIE_REQUIRED_TYPES = new Set(["entrada", "salida"]);
// En la web no hay chip que firme: la unica prueba de quien marco es la cara. El
// equipo marca las cuatro desde el navegador, asi que las cuatro piden selfie.
// Ventana de contingencia (brief 2026-11-24): este es el unico lugar donde se
// declara el requisito. Un segundo filtro de selfie en el camino de la marcacion
// web queda prohibido, porque se adelanta a la validacion por clase y reintroduce
// el rechazo por formato que costo jornadas.
const WEB_SELFIE_REQUIRED_TYPES = new Set(["entrada", "inicio_almuerzo", "fin_almuerzo", "salida"]);
// Hash que firma la app cuando la marcacion no lleva selfie. Es el sha256 del
// vacio: la firma sigue cubriendo tipo, hora e idempotencia, asi que una
// marcacion de almuerzo tampoco se puede reusar ni reordenar.
const NO_PHOTO_SHA256 = crypto.createHash("sha256").update(Buffer.alloc(0)).digest("hex");

// Estados de la evidencia de identidad. Son strings literales del contrato: la pantalla,
// el certificador de QA y el registro de auditoria los leen tal cual.
//   EVIDENCE_STATUS.available  - nada degradado; hay archivo que mostrar.
//   EVIDENCE_STATUS.degraded   - la marcacion existe y se guardo lo que llego, pero el
//                                visor no puede pintarlo (o nunca fue una imagen).
const EVIDENCE_STATUS = Object.freeze({ available: "available", degraded: "degraded" });

// Motivos por los que una fila queda degradada. `EVIDENCE_FAILURE_CODES` (security/policy)
// aporta los de contenido; aqui van los de decodificacion del visor.
const EVIDENCE_DEGRADATION_CODES = Object.freeze({
  ...EVIDENCE_FAILURE_CODES,
  not_decodable: EVIDENCE_FAILURE_CODES.not_decodable,
  animated: EVIDENCE_FAILURE_CODES.animated,
  decode_timeout: "EVIDENCIA_TIEMPO_LIMITE_DECODIFICACION",
  // Firma valida sobre los bytes recibidos pero lo almacenado era la re-emision canonica a
  // JPEG. HISTORY-only: el servidor ya no transcodifica, asi que ninguna fila nueva lo produce.
  evidence_reencoded: "EVIDENCIA_RECODIFICADA"
});

// Clases raster que el navegador SI pinta con un `src` data URL. Todo lo demas que sea foto
// legitima (HEIF/HEIC con marca HEVC real, TIFF) se conserva verbatim y se degrada: medido en
// este build, sharp trae libvips SIN decodificador HEVC, asi que transcodificar es imposible
// y borrar la foto seria perder evidencia de identidad.
const VIEWABLE_RASTER_MIMES = new Set(["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif"]);

function isViewableRaster(mime) {
  return VIEWABLE_RASTER_MIMES.has(String(mime || "").toLowerCase());
}

// Estado extra de `identity_verification` en el canal movil: la firma SI cubre el hash de
// lo que se guardo (integridad probada) y solo falla el visor. Desde que el servidor dejo de
// transcodificar, este estado es HISTORY-only: una marcacion nueva con evidencia no
// renderizable queda `verified` + `evidence_status: "degraded"` y nunca se le baja el estado
// (una JPEG normal de la app jamas puede quedar degradada por recodificacion). Se conserva
// exportado porque las filas escritas antes de este cambio lo llevan en la base.
const VERIFIED_EVIDENCE_DEGRADED = "verified_evidence_degraded";

// Novedad visible para el supervisor cuando una marcacion queda con evidencia degradada.
const DEGRADED_EVIDENCE_NOVELTY_CODE = "EVIDENCIA_MARCACION_DEGRADADA";

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

// El tamano que DECLARA el cliente nunca manda: se compara contra la longitud REAL de lo
// decodificado y, si no cuadra, se corrige al valor medido con su marca. El tope del canal
// siempre se mide sobre bytes que existen (`inspectSelfiePayload`); mentirle al `file_size`
// no compra espacio ni tumba la marcacion.
function declaredSizeOf(photo) {
  const declared = Number(photo.size ?? photo.file_size ?? photo.size_bytes ?? 0);
  return Number.isFinite(declared) ? Math.trunc(declared) : null;
}

// MIME declarado que la compuerta de clase acepta aunque el olfato no lo reconozca. Un TIFF o
// un BMP de escaner son FOTOS declaradas como fotos: el navegador no las pinta, asi que la
// evidencia degrada (se conservan los bytes firmados). Un PDF o un mp4 declarados "image/jpeg"
// son otra cosa mintiendo sobre su contenido, y eso se rechaza igual que siempre.
// El veredicto NEGATIVO de `inspectSelfiePayload` trae los campos dentro de `failure`, no en
// la raiz: leerlos de arriba daria `undefined` y toda foto desconocida moriria en un 400.
const ACCEPTED_DECLARED_IMAGE_PREFIX = "image/";

function acceptsDeclaredImageClass(inspection) {
  const verdict = inspection.ok ? inspection : (inspection.failure || {});
  if (inspection.ok || verdict.sniffed_mime || !verdict.declared_mime) return false;
  return String(verdict.declared_mime).toLowerCase().startsWith(ACCEPTED_DECLARED_IMAGE_PREFIX);
}

// Decodificacion tolerante + olfato por clase + tope REAL. Es la UNICA fuente del veredicto
// para las dos compuertas (la selfie y el almacen), asi que no pueden divergir.
// Devuelve siempre un objeto: `ok`, o `failure` con el motivo machine-readable.
// El tope que goberno la decision viaja en el veredicto (`max_bytes`) para que el rechazo
// nombre el limite que disparo -el del canal movil o el de la web son distintos-.
function inspectSelfiePayload(photo, { maxBytes = identityPhotoByteCap(), field = "identity_photo" } = {}) {
  const raw = photo.base64_data || photo.base64 || photo.payload;
  const result = validateEvidenceContent(
    { base64_data: raw, mime_type: String(photo.type || photo.mime_type || "").toLowerCase() },
    { contentClass: "image", maxBytes, field }
  );
  if (!result.ok) return { ok: false, max_bytes: maxBytes, failure: result };
  const declared = declaredSizeOf(photo);
  return {
    ok: true,
    ...result,
    max_bytes: maxBytes,
    declared_size: declared,
    // El tamano declarado solo se conserva para el registro de auditoria; lo que gobierna
    // es `byte_length`, medido sobre los bytes que realmente llegaron. La discrepancia se
    // marca en la fila, no cuesta la marcacion.
    size_declared_mismatch: declared != null && declared !== 0 && declared !== result.byte_length
  };
}

// Una foto NO decodificable sigue siendo una imagen por firma (un HEIC con marca HEVC real
// es la camara de un iPhone). Se conserva verbatim y se degrada la evidencia; no se rechaza.
//
// AQUI NO SE RE-EMITE NADA: solo se mira. Cualquier `toBuffer()` de esta funcion cambiaria
// los bytes y, con ellos, el hash que cubre la firma de la app -ver `normalizeSelfie`-.
async function decodeRasterImage(buffer) {
  let sharp;
  try {
    sharp = require("sharp");
  } catch {
    // Sin el decodificador no hay forma de saber si el visor la pinta: degradacion, nunca perdida.
    return { decoded: false, error: "decodificador_no_disponible" };
  }
  const options = { failOn: "error", limitInputPixels: DECODE_LIMIT_PIXELS };
  const withTimeout = (promise) => Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => resolve({ timeout: true }), transcodeTimeoutMs()))
  ]);
  const probed = await withTimeout(sharp(buffer, options).metadata()).catch((error) => ({ error }));
  if (probed?.timeout) return { decoded: false, error: EVIDENCE_DEGRADATION_CODES.decode_timeout };
  if (probed?.error || !probed?.width || !probed?.height) return { decoded: false, error: EVIDENCE_DEGRADATION_CODES.not_decodable };
  if ((probed.pages || 1) > 1) return { decoded: false, error: EVIDENCE_DEGRADATION_CODES.animated, metadata: probed };
  if (probed.width > 4096 || probed.height > 4096) return { decoded: false, error: EVIDENCE_FAILURE_CODES.not_decodable, metadata: probed };
  return { decoded: true, metadata: probed };
}

function degradedDetail(inspection, failureCode) {
  return {
    evidence_status: EVIDENCE_STATUS.degraded,
    evidence_failure_code: failureCode || inspection.code || EVIDENCE_FAILURE_CODES.undecodable,
    // Lo que se guardo: hash, tipo olido, tamano real y normalizaciones aplicadas. Nunca
    // viaja un data URL ni bytes; esto es lo unico que el supervisor va a poder leer.
    evidence_sha256: inspection.sha256 || "",
    declared_mime: inspection.declared_mime ?? null,
    sniffed_mime: inspection.sniffed_mime ?? null,
    byte_length: inspection.byte_length ?? 0,
    max_bytes: inspection.max_bytes ?? null,
    normalization_applied: inspection.normalization_applied || [],
    degraded_at: new Date().toISOString()
  };
}

// Fila degradada: se anuncia SIN evidencia disponible y SIN ruta de almacén, porque no hay
// objeto que el visor pueda pedir. La marcacion vive; el archivo no se promete.
//
// `persistPayload` dice si los bytes recibidos viajan en la fila: en la web NO (un payload
// ilegible no prueba nada y llenaria la base de basura), en el movil SI -son exactamente los
// bytes que cubre la firma y no guardarlos dejaria una marcacion "verified" sin evidencia-.
// El payload persistido lleva el data URL canonico para que `has_base64_data` sea la UNICA
// bandera del contrato (ver `publicPunchMetadata`: una fila degradada jamas anuncia
// evidencia), y `evidence_inline` deja constancia de que los bytes si estan en la fila: es lo
// unico que le permite al monitor servir la foto de un HEIC por id cuando el supervisor la
// necesita, aunque el navegador no sepa pintarla.
function degradedStoredPhoto(photo, inspection, failureCode, { persistPayload = false } = {}) {
  const detail = degradedDetail(inspection, failureCode);
  const stored = {
    name: String(photo.name || "selfie.bin").slice(0, 120),
    type: inspection.sniffed_mime || inspection.declared_mime || "application/octet-stream",
    size: inspection.byte_length || 0,
    sha256: inspection.sha256 || null,
    has_base64_data: false,
    evidence_inline: false,
    storage_path: null,
    ...detail
  };
  if (persistPayload && inspection.raw) {
    // Data URL con los bytes canonicos tal cual llegaron (ya normalizados, no re-codificados):
    // asi el sha256 de lo almacenado coincide con el de lo firmado.
    stored.base64_data = `data:${stored.type};base64,${inspection.raw}`;
    stored.evidence_inline = true;
  }
  return {
    // El hash de los bytes RECIBIDOS es lo que cubre la firma de la app: una fila degradada
    // que no lo devolviera se leeria arriba como "no hay huella" y costaria la marcacion.
    sha256: inspection.sha256 || null,
    stored,
    detail
  };
}

// El tope es un resguardo de almacenamiento y de denegacion de servicio, no un problema de
// formato: por eso se comprime ANTES de decidir si la evidencia degrada o se rechaza. Un
// payload ileible por encima del tope (alfabeto invalido, vacio) degrada -no hay bytes que
// almacenar ni jornada que perder-; uno real y grande se rechaza nombrando el limite.
function hardOversizeRejection(inspection, { field, maxBytes }) {
  const failure = inspection.failure || {};
  // El veredicto de `validateEvidenceContent` ya trae la longitud REAL medida (`byte_length`)
  // incluso cuando falla: es la unica fuente del tope que se rompio.
  const byteLength = failure.byte_length ?? inspection.byte_length ?? 0;
  if (!failure.sha256) return null;
  if (byteLength <= maxBytes) return null;
  const detail = {
    ...failure,
    field,
    max_bytes: maxBytes,
    byte_length: byteLength,
    evidence_failure_code: EVIDENCE_FAILURE_CODES.oversize
  };
  return fail(400, "VALIDACION", `El archivo supera el tamano maximo permitido (${maxBytes} bytes).`, detail);
}

// Valida la selfie y la deja como la guarda la marcacion. Devuelve tambien el
// sha256 de los bytes recibidos, que es lo que la firma de la app cubre.
//
// CUATRO salidas posibles: `stored` con la evidencia disponible, `stored` degradada con el
// motivo, o `hard_rejection` (el unico que cuesta la marcacion). Un problema de formato o de
// renderizado NUNCA pierde la jornada: degrada la evidencia y avisa. Video, PDF, texto, SVG,
// alfabeto invalido o un payload por encima del tope real si se rechazan.
//
// LA REGLA QUE GOBIERNA AQUI: se persisten LOS BYTES RECIBIDOS, verbatim, en su base64
// canonico (`normalizeBase64Payload`). El servidor NO transcodifica. La razon no es de
// calidad sino de integridad: en el canal movil la firma EC cierra sobre el sha256 de lo que
// llego, asi que cualquier re-emision (aunque fuera byte a byte identica en apariencia)
// cambiaria el hash almacenado y rebajaran TODA marcacion normal de la app a
// `verified_evidence_degraded`. sharp solo se usa para DECIDIR si el visor la pinta y para
// rechazar entrada hostil (animada, bombas de descompresion), nunca para reescribir.
async function normalizeSelfie(photo, { maxBytes = identityPhotoByteCap(), field = "identity_photo", persistDegradedPayload = false } = {}) {
  const inspection = inspectSelfiePayload(photo, { maxBytes, field });
  // Cadena canonica (normalizada de transporte, sin re-codificar): es lo unico que sale del
  // servidor, tanto en la fila disponible como en la degradada del canal movil.
  const rawCanonical = photo.base64_data || photo.base64 || photo.payload || "";
  // El hash que cubre la firma es el de los bytes RECIBIDOS, se calcule o no un buffer: por
  // eso se toma del `inspectBase64Payload` (que normaliza antes de decodificar) y no del
  // veredicto de contenido, que puede fallar antes de llegar a medir.
  const received = require("../../security/fileSignature").inspectBase64Payload(rawCanonical, { field });
  const receivedSha256 = received.sha256 || null;
  if (!inspection.ok) {
    // `evidence_failure_code` es la clave que leen arriba `degradedStoredPhoto`, el monitor y
    // el detalle del 400. El veredicto de la compuerta trae ese motivo en `code`, asi que se
    // normaliza aqui una sola vez: si se dejara suelto, toda la evidencia degradada llegaria
    // arriba con el codigo vacio (medido en produccion: 16 filas "400 (sin codigo)").
    const detail = { ...inspection.failure, field, max_bytes: inspection.max_bytes, evidence_failure_code: inspection.failure.code };
    // El tope manda sobre la degradacion: un archivo grande rechazo no puede acabar guardado.
    const oversize = hardOversizeRejection(inspection, { field, maxBytes });
    if (oversize) return { hard_rejection: oversize, detail: oversize.details };
    // Solo la CLASE desconocida se rescata: una foto declarada como foto cuyo olfato no
    // reconocemos (TIFF, BMP) es una imagen que el visor no pinta, degrada con los bytes
    // firmados. Un alfabeto invalido o un tipo declarado prohibido, en cambio, son un fallo
    // duro aunque el cliente jure `image/jpeg`: degradarlos guardaría una fila cuya firma no
    // cierra, y el rechazo llegaria arriba disfrazado de FIRMA_BIOMETRICA_INVALIDA.
    if (acceptsDeclaredImageClass(inspection) && detail.evidence_failure_code === EVIDENCE_FAILURE_CODES.content_class) {
      detail.evidence_failure_code = EVIDENCE_DEGRADATION_CODES.not_decodable;
    }
    if (isHardContentRejection(detail.evidence_failure_code)) {
      // El `code` de negocio se queda en `VALIDACION` -contrato administrativo del modulo y de
      // la certificacion end-to-end-, pero el motivo machine-readable viaja SIEMPRE en
      // `details.evidence_failure_code`: es lo unico que le dice a un administrador, sin abrir
      // el codigo, si le mandaron un video o si la foto simplemente no renderiza. Sin ese
      // detalle el cliente solo veia la frase suelta (medido: 16 filas "400 (sin codigo)
      // (sin detalle)" y 12 con la frase de formato declarado para un solo operario bloqueado).
      return { hard_rejection: fail(400, "VALIDACION", inspection.failure.message, detail), detail };
    }
    return degradedStoredPhoto(photo, { ...detail, sha256: receivedSha256, byte_length: received.byte_length, normalization_applied: received.normalization_applied, raw: received.canonical }, detail.evidence_failure_code, { persistPayload: persistDegradedPayload });
  }
  // Lo recibido, en base64 canonico: nunca la cadena cruda del cliente (prefijo duplicado,
  // saltos de linea, alfabeto url-safe o padding ausente ya fueron reparados aqui) y nunca
  // una re-derivacion. `stored.sha256 === received.sha256 === hash firmado`.
  const canonicalBase64 = inspection.canonical || received.canonical;
  const originalSha256 = inspection.sha256 || receivedSha256;
  const decoded = await decodeRasterImage(inspection.buffer);
  const sniffed = inspection.sniffed_mime;
  const viewable = isViewableRaster(sniffed);
  const detail = {
    field,
    declared_mime: inspection.declared_mime,
    sniffed_mime: sniffed,
    byte_length: inspection.byte_length,
    max_bytes: inspection.max_bytes,
    sha256: originalSha256,
    normalization_applied: inspection.normalization_applied,
    size_declared_mismatch: inspection.size_declared_mismatch || false
  };
  if (!decoded.decoded || !viewable) {
    // Clase imagen pero no renderizable por el navegador (HEIC/HEVC real, TIFF) o no
    // decodificable (animado, truncado, fuera de reloj): se conserva el payload verbatim
    // -los bytes firmados- y la fila queda degradada con su alerta.
    const failureCode = decoded.decoded ? EVIDENCE_DEGRADATION_CODES.not_decodable : decoded.error;
    return degradedStoredPhoto(photo, { ...detail, raw: canonicalBase64 }, failureCode, { persistPayload: persistDegradedPayload });
  }
  return {
    sha256: originalSha256,
    stored: {
      name: String(photo.name || "selfie.jpg").slice(0, 120),
      // El tipo es el OLIDO, no el declarado: es exactamente el MIME del archivo guardado,
      // y el visor lo necesita tal cual (un PNG almacenado como image/jpeg no se rompe, pero
      // un AVIF anunciado como jpeg tampoco se arregla).
      type: sniffed,
      size: inspection.byte_length,
      // Mismo hash que cubrio la firma: no hay re-codificacion posible.
      sha256: originalSha256,
      original_sha256: originalSha256,
      sniffed_mime: sniffed,
      declared_mime: inspection.declared_mime,
      normalization_applied: inspection.normalization_applied,
      evidence_status: EVIDENCE_STATUS.available,
      has_base64_data: true,
      // Siempre como data URL canonico: es lo que pintan las pantallas de la web. Nunca se
      // persiste la cadena cruda que mando el cliente.
      base64_data: `data:${sniffed};base64,${canonicalBase64}`
    },
    detail
  };
}

// Resumen del resultado de la selfie para quien persiste la marcacion: evita que cada
// llamador vuelva a inferir si la evidencia quedo degradada.
function evidenceOutcomeOf(normalized) {
  const stored = normalized?.stored || null;
  const degraded = Boolean(normalized?.degraded) || stored?.evidence_status === EVIDENCE_STATUS.degraded;
  return {
    stored,
    degraded,
    evidence_status: degraded ? EVIDENCE_STATUS.degraded : EVIDENCE_STATUS.available,
    evidence_failure_code: degraded ? (normalized.detail?.evidence_failure_code || null) : null,
    detail: normalized.detail || null
  };
}

function selfieRequiredFor(type) {
  return SELFIE_REQUIRED_TYPES.has(String(type || ""));
}

// Requisito del canal web. Normaliza el tipo porque la web manda el nombre canonico
// pero el esquema no lo restringe; la normalizacion NO toca la firma de la app, que
// sigue usando `type` en crudo dentro de `punchMessage`.
function webSelfieRequiredFor(type) {
  return WEB_SELFIE_REQUIRED_TYPES.has(normalizePunchType(type));
}

// El dispositivo despega la foto de una marcacion cuando el propio servidor ya la
// rechazo con un codigo de evidencia (la rama `retry_without_photo` de la cola web).
// Sin leer esa declaracion, el reenvio sin foto caia en el mismo `SELFIE_REQUERIDA`
// y la hora se perdia igual: es la espiral medida del user 231 (sin entrada, todo lo
// demas paso a `FUERA_DE_SECUENCIA`). La excepcion es angosta y no acepta archivos:
// exige la marca de degradado, un codigo del contrato de evidencia y un motivo
// legible. La fila no queda verificada -queda `not_verified` con su novedad, que es
// lo que ve el supervisor- y un payload que simplemente omite la foto se sigue
// rechazando con `SELFIE_REQUERIDA`.
function declaredEvidenceDetachment(input) {
  const metadata = input?.metadata && typeof input.metadata === "object" ? input.metadata : null;
  if (!metadata || metadata.evidence_status !== EVIDENCE_STATUS.degraded) return null;
  const novelty = metadata.hr_novelty && typeof metadata.hr_novelty === "object" ? metadata.hr_novelty : null;
  const failureCode = String(metadata.evidence_failure_code || novelty?.failure_code || "");
  if (!Object.values(EVIDENCE_FAILURE_CODES).includes(failureCode)) return null;
  const reason = String(metadata.evidence_detached_reason || novelty?.message || "").trim();
  if (reason.length < 8) return null;
  return { failureCode, reason };
}

// Selfie de una marcacion hecha desde la web. No viene firmada: el navegador
// no tiene chip que firme. Sirve para que el supervisor vea quien marco, no
// para probarlo, y por eso la marcacion no queda como "verified".
//
// Las cuatro marcaciones la piden (`WEB_SELFIE_REQUIRED_TYPES`): sin firma, la cara es
// la unica prueba de quien marco, y el almuerzo tampoco puede quedarse ciego.
//
// Aqui la jornada NUNCA se pierde por el FORMATO de la foto. La validacion es por clase:
// un HEIC, AVIF, PNG o WebP de camara real se acepta aunque el navegador anuncie otro MIME,
// y si el visor no puede pintarlo la marcacion se guarda igual con
// `identity_photo.evidence_status = "degraded"` y su codigo de fallo. Lo unico que se
// rechaza de plano es que no sea una imagen (video, PDF, texto, SVG) o que los bytes no se
// puedan decodificar. La proyeccion publica (`publicPunchMetadata`) no anuncia evidencia
// en el caso degradado.
async function webIdentity({ input, type, now }) {
  const photo = input.identity_photo && typeof input.identity_photo === "object" ? input.identity_photo : null;
  if (!photo?.base64 && !photo?.base64_data) {
    const detached = declaredEvidenceDetachment(input);
    if (webSelfieRequiredFor(type) && !detached) {
      throw fail(400, "SELFIE_REQUERIDA", "Toma la selfie de validacion para registrar esta marcacion.");
    }
    return {
      identity_verification: {
        status: "not_verified",
        channel: "web",
        ...(detached
          ? {
            evidence_status: EVIDENCE_STATUS.degraded,
            evidence_failure_code: detached.failureCode,
            evidence_detached_reason: detached.reason
          }
          : {})
      }
    };
  }
  // Desde la web la foto pasa por la camara del navegador y pesa mas que la
  // que optimiza la app; el tope es el de cualquier evidencia de marcacion.
  const normalized = await normalizeSelfie(photo, { maxBytes: WEB_IDENTITY_PHOTO_MAX_BYTES });
  if (normalized.hard_rejection) throw normalized.hard_rejection;
  const outcome = evidenceOutcomeOf(normalized);
  return {
    identity_verification: {
      status: "photo_only",
      channel: "web",
      captured_at: now.toISOString(),
      ...(outcome.degraded
        ? { evidence_status: EVIDENCE_STATUS.degraded, evidence_failure_code: outcome.evidence_failure_code }
        : {})
    },
    ...(outcome.stored ? { identity_photo: outcome.stored } : {})
  };
}

// Verifica la identidad de una marcacion propia.
//
// Devuelve una promesa con la metadata a agregar a la marcacion (la selfie se inspecciona con
// sharp, y eso es asincronico: quien la llame debe esperar). Lanza si la marcacion viene
// de la app y no trae lo necesario: registro, telefono correcto, firma valida
// y, en entrada y salida, la selfie. Las de la web no pueden firmarse, asi que
// guardan la selfie pero quedan como `photo_only`: el supervisor ve la cara,
// no una prueba, y la diferencia tiene que seguir siendo visible.
async function verifyPunchIdentity({ employee, user, input = {}, now = new Date() }) {
  const metadata = input.metadata || {};
  const type = String(input.type || "");
  if (metadata.source !== MOBILE_SOURCE) {
    return webIdentity({ input, type, now });
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
  const requiresSelfie = selfieRequiredFor(type);
  if (requiresSelfie && !photo?.base64) {
    throw fail(400, "SELFIE_REQUERIDA", "La marcacion de entrada y de cierre requiere la foto de tu rostro.");
  }
  // El almuerzo y el retorno no llevan selfie, pero siguen firmados: la app
  // nueva firma el sha256 del vacio, asi que una entrada no puede colarse sin
  // foto quitandosela al payload (la firma cubre el tipo).
  //
  // Una app anterior a esta regla si manda selfie en el almuerzo y la firmo
  // con el hash de esa foto. Se acepta esa firma para no dejar sin marcar a
  // quien no ha actualizado, pero la foto no se guarda: el punto es que el
  // almuerzo deje de acumular caras.
  //
  // `persistDegradedPayload`: en el movil los bytes almacenados tienen que ser los que
  // cubrio la firma, nunca una re-codificacion. La normalizacion base64 si se aplica (es
  // transporte), y por eso la firma se comprueba contra el hash de lo decodificado.
  const selfie = photo?.base64 ? await normalizeSelfie(photo, { persistDegradedPayload: true }) : null;
  if (selfie?.hard_rejection) throw selfie.hard_rejection;
  // La firma cubre el sha256 de los bytes tal como llegaron. Si la normalizacion los dejo
  // ilegibles no hay hash que comprobar: es falla de integridad, no degradacion.
  const signedHash = selfie?.sha256 || selfie?.detail?.sha256 || null;
  if (selfie && !signedHash) {
    throw fail(403, "FIRMA_BIOMETRICA_INVALIDA", "No fue posible comprobar la huella de esta marcacion.");
  }
  const expectedHashes = requiresSelfie
    ? [signedHash]
    : [NO_PHOTO_SHA256, ...(signedHash ? [signedHash] : [])];
  const signed = expectedHashes.some((photoSha256) => verifySignature(
    record.public_key,
    punchMessage({
      userId: user?.id,
      type,
      punchedAt: String(input.punched_at || ""),
      idempotencyKey: String(input.idempotency_key || ""),
      deviceId: record.device_id,
      photoSha256
    }),
    identity.signature
  ));
  if (!signed) {
    // Falla de integridad: aqui SI se rechaza. No hay marcacion sin prueba de quien la hizo.
    throw fail(403, "FIRMA_BIOMETRICA_INVALIDA", "No fue posible comprobar la huella de esta marcacion.");
  }
  // Evidencia degradada en canal verificado: la firma es buena y lo almacenado son EXACTAMENTE
  // los bytes que cubrio (no se transcodifica), pero el visor no puede pintarlo -HEIC/HEVC real,
  // TIFF, animado o truncado-. La marcacion sigue siendo `verified`: la identidad esta probada;
  // lo que falla es el render. Ese estado se expresa con `evidence_status: "degraded"` mas su
  // `evidence_failure_code`, NUNCA bajando el estado: una JPEG normal de la app tiene que
  // quedar `verified` a secas.
  const keepsPhoto = Boolean(selfie && selfie.stored && requiresSelfie);
  const evidenceDegraded = Boolean(keepsPhoto && selfie.stored?.evidence_status === EVIDENCE_STATUS.degraded);
  return {
    identity_verification: {
      status: "verified",
      method: KEY_ALGORITHM,
      channel: "mobile",
      device_id: record.device_id,
      enrolled_at: record.enrolled_at || null,
      verified_at: now.toISOString(),
      signature: String(identity.signature),
      ...(evidenceDegraded
        ? {
          evidence_status: EVIDENCE_STATUS.degraded,
          evidence_failure_code: selfie.detail?.evidence_failure_code || null,
          stored_sha256: selfie.stored?.sha256 || null,
          signed_sha256: signedHash
        }
        : {})
    },
    ...(keepsPhoto ? { identity_photo: selfie.stored } : {})
  };
}

// Quita de la marcacion lo que no debe viajar en listados: el contenido de la
// selfie (se pide aparte) y la firma cruda que manda la app.
// `has_base64_data` anuncia que hay archivo QUE PEDIR por id, no que los bytes
// viajen aqui: tambien es cierto cuando la selfie vive en Storage (recateada o
// subida por el almacen nuevo) y la fila ya no lleva base64.
//
// Una fila degradada NUNCA anuncia evidencia disponible, aunque por alguna razon historica
// traiga bytes o ruta: ahi el visor no tiene nada legitimo que mostrar y prometerlo seria
// peor que admitir la falla. Lo unico que se proyecta es el motivo -y aun asi jamas los
// bytes ni la firma cruda: la proyeccion es una lista blanca de campos-.
function publicPunchMetadata(metadata = {}) {
  if (!metadata || typeof metadata !== "object") return metadata;
  const { identity: _identity, identity_photo: photo, ...rest } = metadata;
  if (!photo || typeof photo !== "object") return rest;
  const { base64_data: base64, base64: raw, storage_path: storagePath, ...photoRest } = photo;
  if (photo.evidence_status === EVIDENCE_STATUS.degraded) {
    return {
      ...rest,
      identity_photo: {
        name: photo.name || null,
        type: photo.type || null,
        size: photo.size || 0,
        has_base64_data: false,
        evidence_inline: Boolean(photo.evidence_inline),
        storage_path: null,
        evidence_status: EVIDENCE_STATUS.degraded,
        evidence_failure_code: photo.evidence_failure_code || null,
        evidence_sha256: photo.evidence_sha256 || null,
        declared_mime: photo.declared_mime ?? null,
        sniffed_mime: photo.sniffed_mime ?? null,
        byte_length: photo.byte_length ?? 0,
        max_bytes: photo.max_bytes ?? null,
        normalization_applied: photo.normalization_applied || [],
        degraded_at: photo.degraded_at || null
      }
    };
  }
  const available = Boolean(base64 || raw || storagePath) || evidenceStorage.hasRescuedRef(metadata, "identity");
  return {
    ...rest,
    identity_photo: { ...photoRest, ...(storagePath ? { storage_path: storagePath } : {}), has_base64_data: available }
  };
}

// Selfie de una marcacion en el formato de evidencias del monitor.
//
// Lee tambien `base64`: las marcaciones de la app hechas ANTES de desplegar
// esta verificacion guardaron la selfie tal como la mando la app (sin
// normalizar a `base64_data`), y deben verse igual en el monitor.
//
// Cuando la fila ya no lleva bytes (purgada tras el rescate, o escrita por el
// almacen nuevo) anuncia la ruta del objeto: el resumen del monitor la pinta
// como disponible y `getMonitorEvidence` sirve los contenido por id desde
// Storage. Sin ruta verificable el comportamiento es el viejo: null.
//
// UNA FILA DEGRADADA TAMBIEN DEVUELVE DESCRIPTOR. El monitor necesita poder nombrar la
// evidencia que NO pudo pintar (motivo, hash, tamano) y, cuando los bytes firmados viven en la
// fila (`evidence_inline`, canal movil), servirla por id: un HEIC real es prueba de identidad
// aunque el navegador no lo renderice. Devolver `null` dejaba al supervisor sin ninguna de las
// dos cosas -medido: `TypeError ... reading 'evidence_type'` en el resumen del dia-.
function identityEvidenceOf(punch) {
  const photo = punch?.metadata?.identity_photo;
  if (!photo || typeof photo !== "object") return null;
  const type = String(photo.type || "image/jpeg");
  const degraded = photo.evidence_status === EVIDENCE_STATUS.degraded;
  const descriptor = {
    evidence_type: "identity_selfie",
    file_name: photo.name || `selfie-${punch.id}.jpg`,
    mime_type: type,
    file_size: photo.size || null,
    ...(degraded
      ? {
        evidence_status: EVIDENCE_STATUS.degraded,
        evidence_failure_code: photo.evidence_failure_code || null,
        sha256: photo.evidence_sha256 || photo.sha256 || null
      }
      : {})
  };
  // La proyeccion canonica (`punchPhotoItems`) solo admite raster pintable: para una fila
  // degradada lee los bytes inline directamente, si es que el canal los guardo.
  const normalized = degraded ? null : punchPhotoItems({ metadata: { identity_photo: photo } })[0];
  const content = degraded
    ? (photo.evidence_inline ? String(photo.base64_data || photo.base64 || "") : "")
    : (normalized?.base64_data || "");
  if (content) {
    return { ...descriptor, base64_data: content.startsWith("data:") ? content : `data:${type};base64,${content}` };
  }
  const objectPath = evidenceStorage.pathForEvidence(photo, punch?.metadata, "identity");
  if (objectPath) return { ...descriptor, storage_path: objectPath };
  // Fila degradada sin bytes ni ruta (el canal web nunca persiste un payload ilegible): el
  // descriptor sigue siendo util -ese es exactamente el caso que el monitor debe reportar-.
  if (degraded) return descriptor;
  return null;
}

module.exports = {
  MOBILE_SOURCE,
  KEY_ALGORITHM,
  MAX_IDENTITY_PHOTO_BYTES,
  NO_PHOTO_SHA256,
  SELFIE_REQUIRED_TYPES,
  WEB_SELFIE_REQUIRED_TYPES,
  webSelfieRequiredFor,
  EVIDENCE_STATUS,
  EVIDENCE_DEGRADATION_CODES,
  VERIFIED_EVIDENCE_DEGRADED,
  DEGRADED_EVIDENCE_NOVELTY_CODE,
  VIEWABLE_RASTER_MIMES,
  WEB_IDENTITY_PHOTO_MAX_BYTES,
  identityPhotoByteCap,
  isViewableRaster,
  selfieRequiredFor,
  enrollmentMessage,
  punchMessage,
  enrollmentOf,
  publicEnrollment,
  buildEnrollment,
  resetEnrollmentMetadata,
  inspectSelfiePayload,
  decodeRasterImage,
  normalizeSelfie,
  evidenceOutcomeOf,
  webIdentity,
  verifyPunchIdentity,
  publicPunchMetadata,
  identityEvidenceOf,
  // Reutilizados por shared-device-identity.js (celular compartido del camion).
  publicKeyFrom,
  normalizeSelfie
};
