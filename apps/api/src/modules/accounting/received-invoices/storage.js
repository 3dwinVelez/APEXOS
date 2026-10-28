const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const Minio = require("minio");
const { appError } = require("./errors");

const BUCKET = "invoice-documents";
const ALLOWED_EXTENSIONS = new Set(["xml", "pdf", "zip"]);
const MIME_TYPES = Object.freeze({
  xml: "application/xml",
  pdf: "application/pdf",
  zip: "application/zip"
});

// Mismo patron que la evidencia TMS: almacenamiento local explicito solo con
// base de datos local. En cualquier otro entorno se exige MinIO.
function localDirectory() {
  const configured = String(process.env.INVOICE_LOCAL_STORAGE_DIR || "").trim();
  if (!configured) return null;
  let hostname = "";
  try {
    hostname = new URL(process.env.DATABASE_URL || "").hostname;
  } catch {
    hostname = "";
  }
  if (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "::1", ""].includes(hostname)) {
    throw appError("El almacenamiento local de facturas exige una base de datos local.", "INVOICE_STORAGE_CONFIG_INVALID", 500);
  }
  return path.resolve(configured);
}

function tenantSegment(tenantId) {
  const segment = String(tenantId || "").replace(/[^a-zA-Z0-9_-]/g, "_");
  if (!segment) throw appError("Tenant invalido para almacenar la factura.", "INVOICE_TENANT_INVALID", 400);
  return segment;
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

function safeFileName(name, extension) {
  const base = String(name || "")
    .replace(/\\/g, "/")
    .split("/")
    .pop()
    .replace(/\.[^.]+$/, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[._]+/, "")
    .slice(0, 60);
  return `${base || "documento"}.${extension}`;
}

function buildObjectName({ tenantId, checksum, fileName, extension }) {
  const now = new Date();
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const digest = String(checksum || "").slice(0, 16);
  if (!/^[a-f0-9]{16}$/.test(digest)) throw appError("Checksum invalido para almacenar la factura.", "INVOICE_STORAGE_INVALID", 500);
  return `${tenantSegment(tenantId)}/${year}/${month}/${digest}-${safeFileName(fileName, extension)}`;
}

function referenceOf(objectName) {
  return `${BUCKET}/${objectName}`;
}

// Una referencia es utilizable solo si pertenece al tenant activo y apunta a un
// tipo de archivo permitido. Evita fugas entre empresas y lecturas arbitrarias.
function checkedObjectName(tenantId, reference) {
  const prefix = `${BUCKET}/${tenantSegment(tenantId)}/`;
  const value = String(reference || "");
  if (!value.startsWith(prefix)) {
    throw appError("El documento no pertenece a la empresa activa.", "INVOICE_STORAGE_FORBIDDEN", 403);
  }
  const objectName = value.slice(BUCKET.length + 1);
  if (!/^[a-zA-Z0-9/_.-]+$/.test(objectName) || objectName.split("/").includes("..")) {
    throw appError("Referencia de documento no autorizada.", "INVOICE_STORAGE_FORBIDDEN", 403);
  }
  const extension = objectName.split(".").pop().toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(extension)) {
    throw appError("Tipo de documento no autorizado.", "INVOICE_STORAGE_FORBIDDEN", 403);
  }
  return objectName;
}

async function ensureBucket(client) {
  if (!(await client.bucketExists(BUCKET))) {
    try {
      await client.makeBucket(BUCKET);
    } catch (error) {
      if (!/exists|already/i.test(String(error?.message || ""))) throw error;
    }
  }
}

async function putDocument({ tenantId, fileName, bytes, kind }) {
  if (!Buffer.isBuffer(bytes) || !bytes.length) {
    throw appError("El documento esta vacio.", "INVOICE_DOCUMENT_EMPTY", 422);
  }
  const extension = kind === "pdf" ? "pdf" : kind === "zip" ? "zip" : "xml";
  const checksum = crypto.createHash("sha256").update(bytes).digest("hex");
  const objectName = buildObjectName({ tenantId, checksum, fileName, extension });
  const local = localDirectory();
  if (local) {
    const target = path.join(local, objectName);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, bytes, { flag: "wx" }).catch(async (error) => {
      if (error.code !== "EEXIST") throw error;
    });
  } else {
    const client = storageClient();
    await ensureBucket(client);
    await client.putObject(BUCKET, objectName, bytes, bytes.length, {
      "Content-Type": MIME_TYPES[extension],
      "X-Amz-Meta-Sha256": checksum
    });
  }
  return {
    storage_reference: referenceOf(objectName),
    checksum_sha256: checksum,
    size_bytes: bytes.length,
    mime_type: MIME_TYPES[extension]
  };
}

async function readDocument(tenantId, reference) {
  const objectName = checkedObjectName(tenantId, reference);
  const extension = objectName.split(".").pop().toLowerCase();
  const local = localDirectory();
  if (local) {
    const bytes = await fs.readFile(path.join(local, objectName)).catch(() => {
      throw appError("Documento no encontrado en el almacenamiento.", "INVOICE_DOCUMENT_NOT_FOUND", 404);
    });
    return { bytes, mime_type: MIME_TYPES[extension] };
  }
  const client = storageClient();
  const stream = await client.getObject(BUCKET, objectName).catch(() => {
    throw appError("Documento no encontrado en el almacenamiento.", "INVOICE_DOCUMENT_NOT_FOUND", 404);
  });
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return { bytes: Buffer.concat(chunks), mime_type: MIME_TYPES[extension] };
}

async function documentExists(tenantId, reference) {
  const objectName = checkedObjectName(tenantId, reference);
  const local = localDirectory();
  if (local) {
    try { await fs.access(path.join(local, objectName)); return true; } catch { return false; }
  }
  try {
    await storageClient().statObject(BUCKET, objectName);
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  BUCKET,
  putDocument,
  readDocument,
  documentExists,
  safeFileName,
  referencedObjectName: checkedObjectName
};
