const crypto = require("node:crypto");
const JSZip = require("jszip");
const { LIMITS } = require("./constants");
const { appError } = require("./errors");

const ZIP_SIGNATURES = [
  Buffer.from([0x50, 0x4b, 0x03, 0x04]),
  Buffer.from([0x50, 0x4b, 0x05, 0x06]),
  Buffer.from([0x50, 0x4b, 0x07, 0x08])
];

const IGNORED_PREFIXES = ["__macosx/", ".git/"];
const IGNORED_NAMES = new Set([".ds_store", "thumbs.db", "desktop.ini"]);

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function hasZipSignature(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) return false;
  return ZIP_SIGNATURES.some((signature) => buffer.subarray(0, 4).equals(signature));
}

// El nombre que trae el ZIP es dato no confiable: nunca se usa como ruta de
// escritura, solo como etiqueta. Aun asi se rechaza lo que pueda confundir.
function inspectEntryName(rawName) {
  const name = String(rawName || "");
  if (!name) return { ok: false, reason: "nombre_vacio" };
  if (name.includes("\u0000")) return { ok: false, reason: "nombre_invalido" };
  const normalized = name.replace(/\\/g, "/");
  if (normalized.startsWith("/") || /^[a-zA-Z]:\//.test(normalized)) return { ok: false, reason: "ruta_absoluta" };
  if (normalized.split("/").some((segment) => segment === "..")) return { ok: false, reason: "ruta_no_permitida" };
  const lower = normalized.toLowerCase();
  if (IGNORED_PREFIXES.some((prefix) => lower.startsWith(prefix))) return { ok: false, ignored: true, reason: "metadato_del_sistema" };
  if (IGNORED_NAMES.has(lower.split("/").pop())) return { ok: false, ignored: true, reason: "metadato_del_sistema" };
  return { ok: true, name: normalized };
}

function detectKind(name, bytes) {
  const lower = name.toLowerCase();
  // El tipo se decide por contenido; la extension solo desempata para reportar
  // un archivo renombrado en lugar de descartarlo en silencio.
  if (bytes.length >= 5 && bytes.subarray(0, 5).toString("latin1") === "%PDF-") return "pdf";
  const head = bytes.subarray(0, Math.min(bytes.length, 512)).toString("utf8").replace(/^\uFEFF/, "").trimStart();
  if (head.startsWith("<")) return "xml";
  if (lower.endsWith(".xml")) return "xml_nombrado";
  if (lower.endsWith(".pdf")) return "pdf_nombrado";
  return null;
}

function isCandidateName(name) {
  const lower = name.toLowerCase();
  return lower.endsWith(".xml") || lower.endsWith(".pdf");
}

function entrySize(entry) {
  const data = entry._data || {};
  const uncompressed = Number(data.uncompressedSize);
  const compressed = Number(data.compressedSize);
  return {
    uncompressed: Number.isFinite(uncompressed) ? uncompressed : null,
    compressed: Number.isFinite(compressed) && compressed > 0 ? compressed : null
  };
}

async function readEntry(entry) {
  try {
    return Buffer.from(await entry.async("uint8array"));
  } catch (error) {
    const message = String(error?.message || "");
    if (/encrypt|password/i.test(message)) {
      throw appError("El ZIP esta protegido con contrasena.", "ZIP_PROTEGIDO", 422);
    }
    throw appError(`No fue posible leer una entrada del ZIP: ${message.slice(0, 120)}`, "ZIP_DANADO", 422);
  }
}

// Inspecciona el ZIP completo antes de aceptar cualquier byte descomprimido:
// firmas, rutas, cantidad de entradas, tamano por entrada, total y ratio de
// compresion (defensa contra bombas de descompresion).
async function inspectZip(buffer, { fileName = null } = {}) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) {
    throw appError("El archivo ZIP esta vacio.", "ZIP_VACIO", 422);
  }
  if (buffer.length > LIMITS.MAX_ARCHIVE_BYTES) {
    throw appError(
      `El ZIP supera el limite de ${Math.round(LIMITS.MAX_ARCHIVE_BYTES / (1024 * 1024))} MB.`,
      "ZIP_EXCEDE_TAMANO",
      413,
      { limit_bytes: LIMITS.MAX_ARCHIVE_BYTES, size_bytes: buffer.length }
    );
  }
  if (!hasZipSignature(buffer)) {
    throw appError("El archivo no es un ZIP valido.", "ZIP_NO_ES_ZIP", 415);
  }

  let archive;
  try {
    archive = await JSZip.loadAsync(buffer, { checkCRC32: false });
  } catch (error) {
    const message = String(error?.message || "");
    if (/encrypt|password/i.test(message)) {
      throw appError("El ZIP esta protegido con contrasena.", "ZIP_PROTEGIDO", 422);
    }
    throw appError(`El ZIP esta danado o truncado: ${message.slice(0, 120)}`, "ZIP_DANADO", 422);
  }

  const entries = Object.values(archive.files);
  const files = entries.filter((entry) => !entry.dir);
  if (!files.length) throw appError("El ZIP no contiene archivos.", "ZIP_VACIO", 422);
  if (files.length > LIMITS.MAX_ENTRIES) {
    throw appError(
      `El ZIP contiene ${files.length} archivos y el limite es ${LIMITS.MAX_ENTRIES}.`,
      "ZIP_DEMASIADAS_ENTRADAS",
      413,
      { entries: files.length, limit: LIMITS.MAX_ENTRIES }
    );
  }

  let declaredTotal = 0;
  let readTotal = 0;
  const results = [];
  const rejected = [];

  for (const entry of files) {
    const check = inspectEntryName(entry.name);
    if (!check.ok) {
      rejected.push({ file_name: entry.name, reason: check.reason, ignored: Boolean(check.ignored) });
      continue;
    }
    const sizes = entrySize(entry);
    if (sizes.uncompressed !== null) {
      if (sizes.uncompressed > LIMITS.MAX_ENTRY_BYTES) {
        throw appError(
          `El archivo ${check.name} declara ${Math.round(sizes.uncompressed / 1024)} KB y el limite por archivo es ${Math.round(LIMITS.MAX_ENTRY_BYTES / (1024 * 1024))} MB.`,
          "ZIP_ENTRADA_EXCEDE_TAMANO",
          413,
          { file_name: check.name, size_bytes: sizes.uncompressed }
        );
      }
      declaredTotal += sizes.uncompressed;
      if (declaredTotal > LIMITS.MAX_TOTAL_UNCOMPRESSED_BYTES) {
        throw appError(
          "La descompresion del ZIP excede el limite total permitido.",
          "ZIP_TOTAL_EXCEDE_TAMANO",
          413,
          { limit_bytes: LIMITS.MAX_TOTAL_UNCOMPRESSED_BYTES }
        );
      }
      if (sizes.compressed && sizes.uncompressed / sizes.compressed > LIMITS.MAX_COMPRESSION_RATIO) {
        throw appError(
          `El archivo ${check.name} tiene una tasa de compresion sospechosa.`,
          "ZIP_RATIO_SOSPECHOSO",
          422,
          { file_name: check.name, ratio: Math.round(sizes.uncompressed / sizes.compressed) }
        );
      }
    }
    if (!isCandidateName(check.name)) continue;

    const bytes = await readEntry(entry);
    readTotal += bytes.length;
    if (readTotal > LIMITS.MAX_TOTAL_UNCOMPRESSED_BYTES) {
      throw appError(
        "La descompresion del ZIP excede el limite total permitido.",
        "ZIP_TOTAL_EXCEDE_TAMANO",
        413,
        { limit_bytes: LIMITS.MAX_TOTAL_UNCOMPRESSED_BYTES }
      );
    }
    const kind = detectKind(check.name, bytes);
    if (kind === "pdf" && bytes.length > LIMITS.MAX_PDF_BYTES) {
      rejected.push({ file_name: check.name, reason: "pdf_excede_tamano", size_bytes: bytes.length });
      continue;
    }
    if ((kind === "xml" || kind === "xml_nombrado") && bytes.length > LIMITS.MAX_XML_BYTES) {
      rejected.push({ file_name: check.name, reason: "xml_excede_tamano", size_bytes: bytes.length });
      continue;
    }
    if (!kind) {
      rejected.push({ file_name: check.name, reason: "extension_sin_contenido_valido" });
      continue;
    }
    if (kind.endsWith("_nombrado")) {
      rejected.push({
        file_name: check.name,
        reason: kind === "xml_nombrado" ? "xml_no_reconocido" : "pdf_no_reconocido"
      });
      continue;
    }
    results.push({
      file_name: check.name,
      kind,
      size_bytes: bytes.length,
      checksum_sha256: sha256(bytes),
      bytes
    });
  }

  if (!results.length) {
    throw appError(
      "El ZIP no contiene archivos XML o PDF reconocibles.",
      "ZIP_SIN_DOCUMENTOS",
      422,
      { rejected }
    );
  }

  return {
    file_name: fileName,
    archive_size_bytes: buffer.length,
    entry_count: files.length,
    extracted_count: results.length,
    files: results,
    rejected
  };
}

module.exports = { inspectZip, hasZipSignature, inspectEntryName, detectKind, sha256 };
