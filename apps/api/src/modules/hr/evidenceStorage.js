// Fase D — la evidencia de marcacion vive en Supabase Storage, no en la base.
// Escritura: si HR_EVIDENCE_STORAGE_ENABLED es "true", la foto se sube ANTES de crear la
// marcacion; si la subida falla, la marcacion se rechaza (503 STORAGE_UPLOAD_FAILED) y no
// queda ningun base64 inline. Sin la variable (local/tests) se conserva el comportamiento
// viejo inline para no romper el puesto de trabajo sin nube.
// Lectura: getMonitorEvidence resuelve la referencia (bandera de rescate o storage_path
// declarado) y devuelve los bytes desde Storage cuando la fila ya fue purgada. La lectura
// se activa con solo existir SUPABASE_URL + SERVICE ROLE KEY, independientemente del flag
// de escritura, porque las filas rescatadas historicamente deben seguir siendo visibles.

const BUCKET = "operational-evidence";
const FETCH_TIMEOUT_MS = 20000;

const FLAG_EXTRA = "hr_evidence_rescue_extra";
const FLAG_IDENTITY = "hr_evidence_rescue_identity";
const FLAG_ACTIVITY = "hr_evidence_rescue";

function extensionFor(mime) {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/gif") return "gif";
  if (mime === "application/pdf") return "pdf";
  if (mime === "video/mp4") return "mp4";
  if (mime === "video/webm") return "webm";
  return "jpg";
}

function writeEnabled() {
  return String(process.env.HR_EVIDENCE_STORAGE_ENABLED || "").toLowerCase() === "true";
}

function readEnabled() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function storageConfig() {
  const url = String(process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !key) return null;
  return { url, key };
}

// Supabase Storage rechaza claves con caracteres no ASCII (medido en QA 2026-11-18).
function sanitizeKey(p) {
  return String(p || "").split("/").map((seg) => seg.replace(/[^A-Za-z0-9._-]/g, "_").replace(/_+/g, "_")).join("/");
}

function decodeInline(raw) {
  const s = String(raw || "").trim();
  const m = s.match(/^data:([^;]+);base64,(.*)$/is);
  if (m) return { mime: m[1].toLowerCase(), buf: Buffer.from(m[2], "base64") };
  return { mime: "image/jpeg", buf: Buffer.from(s, "base64") };
}

async function storageRequest(path, options = {}) {
  const conf = storageConfig();
  if (!conf) throw Object.assign(new Error("Storage de evidencia no configurado."), { statusCode: 503, code: "STORAGE_UPLOAD_FAILED" });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(`${conf.url}/storage/v1${path}`, {
      ...options,
      headers: {
        apikey: conf.key,
        Authorization: `Bearer ${conf.key}`,
        ...(options.headers || {})
      },
      signal: controller.signal
    });
    return response;
  } finally {
    clearTimeout(timer);
  }
}

// Sube el base64 inline y devuelve la ruta final ya saneada. Lanza 503 si algo falla:
// el llamador NO debe persistir la fila en ese caso.
async function uploadInline({ tenantId, entity, entityId, fileName, base64Raw, declaredPath }) {
  const { mime, buf } = decodeInline(base64Raw);
  if (!buf.length || buf.length < 32) {
    const err = new Error("La evidencia no contiene un archivo valido.");
    err.statusCode = 400;
    err.code = "STORAGE_UPLOAD_FAILED";
    throw err;
  }
  const sha256 = require("node:crypto").createHash("sha256").update(buf).digest("hex");
  // sin entityId la ruta es por contenido: dos reintentos de la misma marcacion
  // apuntan al mismo objeto y la subida repetida no duplica nada
  const leaf = fileName ? sanitizeKey(String(fileName)) : `${sha256.slice(0, 32)}.${extensionFor(mime)}`;
  const safeName = /\.([A-Za-z0-9]+)$/.test(leaf) ? leaf : `${leaf}.${extensionFor(mime)}`;
  const objectPath = declaredPath && /^company\//.test(declaredPath)
    ? sanitizeKey(declaredPath)
    : entityId
      ? `company/${tenantId}/hr/${entity}/${entityId}/${safeName}`
      : `company/${tenantId}/hr/${entity}/${sha256.slice(0, 32)}.${extensionFor(mime)}`;
  const urlPath = `/object/${BUCKET}/${objectPath.split("/").map(encodeURIComponent).join("/")}`;
  let response;
  try {
    response = await storageRequest(urlPath, {
      method: "POST",
      headers: { "Content-Type": mime, "x-upsert": "true" },
      body: buf
    });
  } catch (cause) {
    const err = new Error("No fue posible guardar la evidencia en el almacen.");
    err.statusCode = 503;
    err.code = "STORAGE_UPLOAD_FAILED";
    err.cause = cause;
    throw err;
  }
  if (!response.ok) {
    const err = new Error(`El almacen rechazo la evidencia (${response.status}).`);
    err.statusCode = 503;
    err.code = "STORAGE_UPLOAD_FAILED";
    throw err;
  }
  return { storage_path: objectPath, mime, bytes: buf.length, sha256 };
}

// Pre-procesamiento de una marcacion ANTES de abrir la transaccion: valida la firma de
// contenido, sube la selfie y la evidencia extra y devuelve el input ya sin bytes.
// La transaccion entonces solo persiste referencias. Si la subida falla, la marcacion
// nunca se crea y el operario recibe 503 STORAGE_UPLOAD_FAILED.
async function preparePunchEvidence({ tenantId, input }) {
  const { assertSafeFile } = require("../../security/policy");
  const nextInput = { ...input };

  const metadata = input.metadata && typeof input.metadata === "object" ? input.metadata : null;
  const photo = metadata?.identity_photo;
  if (photo && typeof photo === "object" && (photo.base64_data || photo.base64)) {
    const base64Raw = photo.base64_data || photo.base64;
    assertSafeFile({ base64_data: base64Raw, file_name: photo.name, mime_type: photo.type, file_size: photo.size }, {});
    const up = await uploadInline({
      tenantId,
      entity: "identity-photos",
      fileName: photo.name || "",
      base64Raw
    });
    const { base64_data: _b, base64: _r, ...photoRest } = photo;
    nextInput.metadata = {
      ...metadata,
      identity_photo: { ...photoRest, base64_data: "", storage_path: up.storage_path, sha256: up.sha256, size: up.bytes }
    };
  }

  const extra = input.extra_evidence;
  const extraBase64 = extra && typeof extra === "object" ? String(extra.base64 || extra.base64_data || "").trim() : "";
  if (extraBase64) {
    assertSafeFile({ base64_data: extraBase64, file_name: extra.name, mime_type: extra.type, file_size: extra.size }, {});
    const up = await uploadInline({
      tenantId,
      entity: "extra-evidence",
      fileName: extra.name || "",
      base64Raw: extraBase64
    });
    nextInput.extra_evidence = {
      base64: "",
      storage_path: up.storage_path,
      name: extra.name || "",
      type: extra.type || up.mime,
      size: extra.size || up.bytes
    };
  }

  return nextInput;
}

// Ruta del objeto segun lo que la fila declara: primero la bandera de rescate (camino
// verificado por SHA-256), luego el storage_path declarado por la escritura nueva.
function pathForEvidence(evidence, metadata, kind = "extra") {
  const meta = metadata && typeof metadata === "object" ? metadata : {};
  const flagKey = kind === "identity" ? FLAG_IDENTITY : kind === "activity" ? FLAG_ACTIVITY : FLAG_EXTRA;
  const flag = meta[flagKey];
  if (flag && flag.status === "rescued" && flag.storage_path) return String(flag.storage_path);
  // compatibilidad con corridas de rescate que usaron la bandera unica
  const legacy = meta[FLAG_ACTIVITY];
  if (kind !== "activity" && legacy && legacy.status === "rescued" && legacy.storage_path) {
    const sp = String(legacy.storage_path);
    const isIdentityPath = sp.includes("identity");
    if (kind === "identity" && isIdentityPath) return sp;
    if (kind === "extra" && !isIdentityPath) return sp;
  }
  const declared = evidence && evidence.storage_path;
  if (declared && /^company\//.test(String(declared))) return sanitizeKey(declared);
  return null;
}

function hasRescuedRef(metadata, kind = "extra") {
  const meta = metadata && typeof metadata === "object" ? metadata : {};
  const flagKey = kind === "identity" ? FLAG_IDENTITY : kind === "activity" ? FLAG_ACTIVITY : FLAG_EXTRA;
  if (meta[flagKey] && meta[flagKey].status === "rescued") return true;
  const legacy = meta[FLAG_ACTIVITY];
  if (kind !== "activity" && legacy && legacy.status === "rescued") {
    const sp = String(legacy.storage_path || "");
    if (kind === "identity") return sp.includes("identity");
    if (kind === "extra") return sp && !sp.includes("identity");
  }
  return false;
}

// Descarga el objeto y lo devuelve como data URL (el contrato que ya pintan las pantallas).
// null = no existe todavia (fila anterior al rescate o ruta invalida). Lanza solo por
// configuracion o red, nunca por 404.
async function downloadDataUrl(objectPath) {
  if (!objectPath) return null;
  const urlPath = `/object/${BUCKET}/${String(objectPath).split("/").map(encodeURIComponent).join("/")}`;
  const response = await storageRequest(urlPath, { method: "GET" });
  if (response.status === 404 || response.status === 400) return null;
  if (!response.ok) {
    const err = new Error(`No fue posible leer la evidencia del almacen (${response.status}).`);
    err.statusCode = 503;
    err.code = "STORAGE_READ_FAILED";
    throw err;
  }
  const buf = Buffer.from(await response.arrayBuffer());
  const mime = String(response.headers.get("content-type") || "image/jpeg").split(";")[0];
  return `data:${mime};base64,${buf.toString("base64")}`;
}

module.exports = {
  BUCKET,
  writeEnabled,
  readEnabled,
  sanitizeKey,
  decodeInline,
  uploadInline,
  preparePunchEvidence,
  downloadDataUrl,
  pathForEvidence,
  hasRescuedRef,
  FLAG_EXTRA,
  FLAG_IDENTITY,
  FLAG_ACTIVITY
};
