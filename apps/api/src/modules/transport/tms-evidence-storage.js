const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const Minio = require("minio");
const sharp = require("sharp");
const prisma = require("../../core/prisma");
const { detectedMime, MAX_BYTES, MAX_DIMENSION } = require("../services/evidenceUploads");

const BUCKET = "tms-evidence";
const MIME_EXTENSION = Object.freeze({ "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" });

// Explicit development provider: real files, authenticated reads, never an implicit fallback.
function localDirectory() {
  if (!process.env.TMS_LOCAL_EVIDENCE_DIR) return null;
  const db = new URL(process.env.DATABASE_URL || "http://invalid");
  if (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "::1"].includes(db.hostname)) throw new Error("Local evidence requires a local development database.");
  return path.resolve(process.env.TMS_LOCAL_EVIDENCE_DIR);
}
function tenantPrefix(tenantId) { return `${BUCKET}/${String(tenantId).replace(/[^a-zA-Z0-9_-]/g, "_")}/`; }
function checkedObject(tenantId, reference) {
  if (!String(reference).startsWith(tenantPrefix(tenantId)) || !/^tms-evidence\/[a-zA-Z0-9/_-]+\.(png|jpg|webp)$/.test(String(reference))) throw Object.assign(new Error("Referencia de evidencia no autorizada."), { statusCode: 403 });
  return String(reference).slice(BUCKET.length + 1);
}
async function assertEvidenceReferences(tenantId, tripId, stopId, references) {
  const prefix = `${tenantPrefix(tenantId)}trips/${tripId}/stops/${stopId}/`;
  for (const reference of new Set(references)) {
    const objectName = checkedObject(tenantId, reference);
    if (!reference.startsWith(prefix)) throw Object.assign(new Error("La evidencia no pertenece a esta parada."), { statusCode: 403 });
    try { if (localDirectory()) await fs.access(path.join(localDirectory(), objectName)); else await storageClient().statObject(BUCKET, objectName); }
    catch { throw Object.assign(new Error("Cargue el archivo antes de registrar la entrega."), { statusCode: 422 }); }
  }
}

function storageClient() {
  return new Minio.Client({
    endPoint: process.env.MINIO_ENDPOINT || "localhost",
    port: Number(process.env.MINIO_PORT || 9000),
    useSSL: String(process.env.MINIO_USE_SSL || "false").toLowerCase() === "true",
    accessKey: process.env.MINIO_ACCESS_KEY || "apex_minio",
    secretKey: process.env.MINIO_SECRET_KEY || "change_me_minio_secret"
  });
}

async function validateEvidence(bytes, declaredMime) {
  if (!bytes.length) throw Object.assign(new Error("La evidencia esta vacia."), { statusCode: 400 });
  if (bytes.length > MAX_BYTES) throw Object.assign(new Error("La evidencia supera el limite de 2 MB."), { statusCode: 413 });
  const mime = detectedMime(bytes);
  if (!mime || !MIME_EXTENSION[mime] || mime !== String(declaredMime || "").toLowerCase()) throw Object.assign(new Error("El contenido no coincide con un formato PNG, JPEG o WEBP permitido."), { statusCode: 415 });
  const metadata = await sharp(bytes, { failOn: "error" }).metadata().catch(() => null);
  if (!metadata?.width || !metadata?.height || metadata.width > MAX_DIMENSION || metadata.height > MAX_DIMENSION) throw Object.assign(new Error("La imagen esta truncada, no puede decodificarse o excede 4096 px por lado."), { statusCode: 422 });
  return { mime, extension: MIME_EXTENSION[mime], width: metadata.width, height: metadata.height, checksum_sha256: crypto.createHash("sha256").update(bytes).digest("hex") };
}

async function uploadEvidence(tenantId, user, tripId, stopId, file) {
  if (!file) throw Object.assign(new Error("Debes seleccionar una evidencia."), { statusCode: 400 });
  return prisma.runWithTenant(tenantId, async () => {
    const stop = await prisma.transportStop.findFirst({ where: { id: Number(stopId), trip_id: Number(tripId) }, select: { id: true, trip_id: true } });
    if (!stop) throw Object.assign(new Error("La parada no pertenece al viaje indicado."), { statusCode: 404 });
    const bytes = await file.toBuffer();
    const inspected = await validateEvidence(bytes, file.mimetype);
    const tenantSegment = String(tenantId).replace(/[^a-zA-Z0-9_-]/g, "_");
    const objectName = `${tenantSegment}/trips/${stop.trip_id}/stops/${stop.id}/${crypto.randomUUID()}.${inspected.extension}`;
    if (localDirectory()) {
      const target = path.join(localDirectory(), objectName);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, bytes, { flag: "wx" });
    } else {
    const client = storageClient();
    if (!(await client.bucketExists(BUCKET))) await client.makeBucket(BUCKET);
    await client.putObject(BUCKET, objectName, bytes, bytes.length, { "Content-Type": inspected.mime, "X-Amz-Meta-Uploader": String(user?.id || "unknown"), "X-Amz-Meta-Sha256": inspected.checksum_sha256 });
    }
    return { storage_reference: `${BUCKET}/${objectName}`, mime_type: inspected.mime, size_bytes: bytes.length, width: inspected.width, height: inspected.height, checksum_sha256: inspected.checksum_sha256 };
  });
}

async function evidenceUrl(tenantId, reference) {
  const tenantSegment = String(tenantId).replace(/[^a-zA-Z0-9_-]/g, "_");
  const prefix = `${BUCKET}/${tenantSegment}/`;
  if (!String(reference || "").startsWith(prefix)) throw Object.assign(new Error("La evidencia no pertenece a la empresa activa."), { statusCode: 403 });
  const objectName = checkedObject(tenantId, reference);
  if (localDirectory()) {
    const bytes = await fs.readFile(path.join(localDirectory(), objectName)).catch(() => { throw Object.assign(new Error("Evidencia no encontrada."), { statusCode: 404 }); });
    return { content_base64: bytes.toString("base64"), mime_type: detectedMime(bytes), provider: "local-development" };
  }
  const client = storageClient();
  await client.statObject(BUCKET, objectName).catch(() => { throw Object.assign(new Error("Evidencia no encontrada."), { statusCode: 404 }); });
  return { url: await client.presignedGetObject(BUCKET, objectName, 5 * 60), expires_in_seconds: 300 };
}

module.exports = { assertEvidenceReferences, uploadEvidence, evidenceUrl, validateEvidence, BUCKET };
