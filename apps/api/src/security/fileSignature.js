// Primitivas de firma de contenido. Dos caminos que NO deben mezclarse:
//
//  - El camino ESTRICTO (`detectFileMime` + `decodeBase64Prefix` + `assertSafeFile` sin
//    opciones): exige igualdad exacta entre el MIME declarado y el olido. Lo usan
//    `comercio/storage.js` y `transport/vehicle-document-storage.js`, que publican con
//    `Content-Type` = tipo olido; aflojarlo ahí escribiría un tipo falso en el almacén.
//    Su forma de retornar (mime o null, buffer de hasta 16 bytes) no cambia.
//  - El camino por CLASE (`inspectBase64Payload` + `assertSafeFile(..., { contentClass })`),
//    opt-in por llamada: es el de la evidencia de marcación, donde un HEIC/AVIF de cámara
//    real es una foto legítima aunque el navegador no la pinte.
const SIGNATURES = [
  { mime: "image/jpeg", minBytes: 3, matches: (bytes) => bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff },
  { mime: "image/png", minBytes: 8, matches: (bytes) => [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => bytes[index] === value) },
  { mime: "image/webp", minBytes: 12, matches: (bytes) => ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP" },
  { mime: "application/pdf", minBytes: 5, matches: (bytes) => ascii(bytes, 0, 5) === "%PDF-" },
  // Un contenedor ISO-BMFF (`ftyp` en 4..8) NO es video por tener `ftyp`: las marcas de
  // marca mayor en 8..12 deciden. Sin esta rama un .heic/.avif de camara se oliendo como
  // `video/mp4` y la selfie legitima moria en un 400.
  { mime: "video/mp4", minBytes: 12, matches: (bytes) => ascii(bytes, 4, 8) === "ftyp" && !isobmfImageBrand(bytes) },
  { mime: "video/webm", minBytes: 4, matches: (bytes) => [0x1a, 0x45, 0xdf, 0xa3].every((value, index) => bytes[index] === value) }
];

// Marcas ISO-BMFF que son fotografia, no video.
const AVIF_BRANDS = new Set(["avif", "avis"]);
// `avc1`/`mp4v`/`isom` y compania siguen siendo video: no entran aqui.
const HEIF_IMAGE_BRANDS = new Set(["heic", "heix", "heim", "heis", "hevc", "hevx", "avci", "avis"]);
// Contenedores HEIF genericos: solo valen como imagen si el encabezado anuncia ademas una
// marca de imagen. Un `mif1` suelto con relleno sintatico no puede leerse como foto.
const HEIF_WRAPPER_BRANDS = new Set(["mif1", "msf1"]);

function ascii(bytes, start, end) {
  return Buffer.from(bytes.subarray(start, end)).toString("ascii");
}

// Solo marcas legibles (cuatro caracteres imprimibles): el relleno de un archivo truncado
// o sintatico no se convierte en un veredicto de formato.
function cleanBrand(value) {
  const brand = String(value || "").toLowerCase();
  return /^[a-z0-9]{4}$/.test(brand) ? brand : null;
}

// Lee las marcas de un encabezado `ftyp`: la marca mayor en 8..12 y las compatibles desde 16.
function isobmfBrands(bytes) {
  if (!bytes?.length || bytes.length < 12 || ascii(bytes, 4, 8) !== "ftyp") return [];
  const declaredSize = bytes.readUInt32BE(0);
  const brands = [cleanBrand(ascii(bytes, 8, 12))].filter(Boolean);
  // La lista compatible solo existe si el tamano declarado del encabezado la cubre.
  if (declaredSize >= 16 && declaredSize <= bytes.length) {
    for (let offset = 16; offset + 4 <= declaredSize; offset += 4) {
      const brand = cleanBrand(ascii(bytes, offset, offset + 4));
      if (brand) brands.push(brand);
    }
  }
  return brands;
}

function isobmfImageBrand(bytes) {
  const brands = isobmfBrands(bytes);
  if (!brands.length) return false;
  if (brands.some((brand) => AVIF_BRANDS.has(brand))) return true;
  if (!brands.some((brand) => HEIF_WRAPPER_BRANDS.has(brand))) return brands.some((brand) => HEIF_IMAGE_BRANDS.has(brand));
  // Contenedor generico: exige una marca de imagen real ademas del wrapper.
  return brands.some((brand) => HEIF_IMAGE_BRANDS.has(brand));
}

// Clase raster de una firma olida: lo que puede ser una selfie.
const RASTER_IMAGE_MIMES = Object.freeze(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif", "image/heif"]);
const RASTER_IMAGE_SET = new Set(RASTER_IMAGE_MIMES);

function detectFileMime(bytes) {
  if (!bytes?.length) return null;
  return SIGNATURES.find((signature) => bytes.length >= signature.minBytes && signature.matches(bytes))?.mime || null;
}

// Deteccion por clase para la evidencia de marcacion: devuelve el tipo olido afinando los
// contenedores ISO-BMFF (avif vs heif) sin tocar lo que responde `detectFileMime`.
function sniffContentType(bytes) {
  if (!bytes?.length) return { mime: null, brands: [], isobmf: false };
  const brands = isobmfBrands(bytes);
  if (brands.length) {
    if (brands.some((brand) => AVIF_BRANDS.has(brand))) return { mime: "image/avif", brands, isobmf: true };
    if (brands.some((brand) => HEIF_IMAGE_BRANDS.has(brand))) return { mime: "image/heif", brands, isobmf: true };
  }
  return { mime: detectFileMime(bytes), brands, isobmf: Boolean(brands.length) };
}

function isRasterImageMime(mime) {
  return RASTER_IMAGE_SET.has(String(mime || "").toLowerCase());
}

function decodeBase64Prefix(value, maxBytes = 16) {
  const input = String(value || "");
  const payload = input.includes(",") ? input.slice(input.indexOf(",") + 1) : input;
  if (!payload || !/^[A-Za-z0-9+/]*={0,2}$/.test(payload)) return Buffer.alloc(0);
  return Buffer.from(payload.slice(0, Math.ceil(maxBytes / 3) * 4), "base64").subarray(0, maxBytes);
}

// Tolera lo que el transporte rompe y nada mas: prefijo `data:` duplicado, saltos de linea
// y espacios del MIME base64 multiparte, el alfabeto url-safe (`-`/`_`) que emite algunos
// SDKs y el padding ausente. Devuelve SIEMPRE el buffer decodificado y su base64 canonico
// (el que se persiste: lo recibido tal cual no vuelve a salir del servidor).
//
// No inventa contenido: si despues de normalizar quedan caracteres fuera del alfabeto,
// `error` nombra el motivo y `buffer` llega vacio. Eso es rechazo, no degradacion.
function normalizeBase64Payload(value) {
  const applied = [];
  let text = String(value == null ? "" : value).trim();
  if (!text) return { buffer: Buffer.alloc(0), canonical: "", applied, error: "vacio" };

  // Un data URL siempre anuncia su prefijo; dos prefijos es el reenvio de un data URL ya
  // formado dentro de otro (medido en la cola offline de la app).
  let prefixMatches = 0;
  while (/^data:/i.test(text)) {
    const comma = text.indexOf(",");
    if (comma < 0) break;
    prefixMatches += 1;
    text = text.slice(comma + 1);
  }
  if (prefixMatches > 1) applied.push("double_prefix");

  const withoutWhitespace = text.replace(/[\s]/g, "");
  if (withoutWhitespace !== text) {
    applied.push("whitespace");
    text = withoutWhitespace;
  }
  if (/[-_]/.test(text)) {
    applied.push("urlsafe");
    text = text.replace(/-/g, "+").replace(/_/g, "/");
  }
  const unpadded = text.replace(/=+$/g, "");
  // Se recorta el padding solo para validar el resto del alfabeto; el canonico se repone
  // abajo y `padding` se anota unicamente si hizo falta.
  if (unpadded !== text) text = unpadded;
  if (!text) return { buffer: Buffer.alloc(0), canonical: "", applied, error: "vacio" };
  if (!/^[A-Za-z0-9+/]+$/.test(text)) {
    return { buffer: Buffer.alloc(0), canonical: "", applied, error: "alfabeto_invalido" };
  }
  const remainder = text.length % 4;
  if (remainder === 1) {
    return { buffer: Buffer.alloc(0), canonical: "", applied, error: "longitud_invalida" };
  }
  // El padding se repone solo cuando faltaba: una entrada ya canonica no declara
  // normalizacion alguna, y lo que se persiste es siempre el canonico con sus `=`.
  const canonical = remainder ? text + "=".repeat(4 - remainder) : text;
  if (canonical !== text) applied.push("padding");
  const buffer = Buffer.from(canonical, "base64");
  if (!buffer.length) return { buffer: Buffer.alloc(0), canonical: "", applied, error: "indecodificable" };
  return { buffer, canonical, applied };
}

// Inspeccion completa de un payload base64 para la evidencia de marcacion: decodificacion
// tolerante + olfato por clase. Es la unica fuente del veredicto para las dos compuertas
// (la de la selfie y la del almacen), asi que no pueden divergir.
function inspectBase64Payload(raw, { field = "identity_photo" } = {}) {
  const { buffer, canonical, applied, error } = normalizeBase64Payload(raw);
  const sniffed = sniffContentType(buffer);
  const detail = {
    field,
    normalization_applied: applied,
    byte_length: buffer.length,
    sha256: buffer.length ? require("node:crypto").createHash("sha256").update(buffer).digest("hex") : "",
    sniffed_mime: sniffed.mime,
    decode_error: error || null
  };
  return {
    ...detail,
    buffer,
    canonical,
    brands: sniffed.brands,
    ok: Boolean(buffer.length) && !error,
    is_image: isRasterImageMime(sniffed.mime)
  };
}

module.exports = {
  AVIF_BRANDS,
  HEIF_IMAGE_BRANDS,
  HEIF_WRAPPER_BRANDS,
  RASTER_IMAGE_MIMES,
  ascii,
  decodeBase64Prefix,
  detectFileMime,
  inspectBase64Payload,
  isRasterImageMime,
  isobmfBrands,
  normalizeBase64Payload,
  sniffContentType
};
