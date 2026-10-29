const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const JSZip = require("jszip");
const { ingestArchive } = require("../accounting/received-invoices/ingest");

const SCAN_EXTENSIONS = new Set([".zip", ".xml", ".pdf"]);
const SOURCE_EXTENSIONS = new Set([".zip", ".xml"]);

function syncError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function readSyncConfig(env = process.env) {
  const tenantId = (env.MAILBOX_INVOICE_SYNC_TENANT_ID || env.MAILBOX_INGEST_TENANT_ID || "").trim();
  if (!tenantId) throw syncError("Falta MAILBOX_INVOICE_SYNC_TENANT_ID (o MAILBOX_INGEST_TENANT_ID).", "SYNC_TENANT_REQUERIDO");
  const folder = (env.MAILBOX_INVOICE_SYNC_DIR || "").trim();
  if (!folder) throw syncError("Falta MAILBOX_INVOICE_SYNC_DIR: carpeta con zips/XML de facturas.", "SYNC_CARPETA_REQUERIDA");
  const absolute = path.resolve(folder);
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isDirectory()) {
    throw syncError(`La carpeta "${absolute}" no existe o no es un directorio.`, "SYNC_CARPETA_INVALIDA");
  }
  return { tenantId, folder: absolute };
}

function scanFolder(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) scanFolder(full, acc);
    else if (entry.isFile() && SCAN_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) acc.push(full);
  }
  return acc;
}

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function baseName(file) {
  return path.basename(file, path.extname(file));
}

// Un XML suelto viaja con su PDF hermano (mismo directorio y mismo nombre base)
// para que la bandeja conserve ambos documentos, igual que en un ZIP.
function siblingPdf(xmlFile, files) {
  const directory = path.dirname(xmlFile);
  const base = baseName(xmlFile).toLowerCase();
  return files.find((candidate) => (
    path.dirname(candidate) === directory
    && path.extname(candidate).toLowerCase() === ".pdf"
    && baseName(candidate).toLowerCase() === base
  )) || null;
}

function mtimeOf(file) {
  try {
    return fs.statSync(file).mtime;
  } catch {
    return new Date();
  }
}

async function archiveFor(file, files) {
  const name = path.basename(file);
  if (path.extname(file).toLowerCase() === ".zip") {
    const buffer = fs.readFileSync(file);
    return {
      messageKey: `folder:zip:${sha256(buffer)}`,
      archiveName: name,
      subject: `Carpeta: ${name}`,
      receivedAt: mtimeOf(file),
      buffer
    };
  }

  const xmlBytes = fs.readFileSync(file);
  const zip = new JSZip();
  zip.file(name, xmlBytes);
  const pdf = siblingPdf(file, files);
  if (pdf) zip.file(path.basename(pdf), fs.readFileSync(pdf));
  return {
    messageKey: `folder:xml:${sha256(xmlBytes)}`,
    archiveName: `${baseName(file)}.zip`,
    subject: `Carpeta: ${name}`,
    receivedAt: mtimeOf(file),
    buffer: await zip.generateAsync({ type: "nodebuffer", compression: "STORE" })
  };
}

function failureEntries(result, label) {
  const entries = [];
  for (const entry of result.rejected || []) {
    if (!entry.ignored) entries.push({ file: `${label}:${entry.file_name}`, error: entry.reason });
  }
  for (const entry of result.errors || []) {
    if (String(entry.message || "").startsWith("Archivo omitido")) continue;
    entries.push({ file: label, error: entry.message });
  }
  return entries;
}

// La carpeta no escribe filas por su cuenta: cada XML/ZIP entra por el mismo
// motor de la bandeja (documentos, auditoría, revisión y dedupe).
async function syncFolder({ config, ingest = ingestArchive, log = () => {} } = {}) {
  if (!config) config = readSyncConfig();
  const files = scanFolder(config.folder);
  const sources = files.filter((file) => SOURCE_EXTENSIONS.has(path.extname(file).toLowerCase()));
  const summary = {
    folder: config.folder,
    tenant_id: config.tenantId,
    scanned: sources.length,
    inserted: 0,
    duplicates: 0,
    failed: []
  };

  for (const file of sources) {
    const label = path.basename(file);
    let archive;
    try {
      archive = await archiveFor(file, files);
    } catch (error) {
      summary.failed.push({ file: label, error: error.message });
      log("[invoice-sync] archivo ilegible", { file, error: error.message });
      continue;
    }

    try {
      const result = await ingest({
        tenantId: config.tenantId,
        source: "folder",
        messageKey: archive.messageKey,
        mailbox: config.folder,
        subject: archive.subject,
        fromAddress: null,
        receivedAt: archive.receivedAt,
        archiveBuffer: archive.buffer,
        archiveName: archive.archiveName,
        attachmentCount: 1
      });
      summary.inserted += result.summary?.created || 0;
      summary.duplicates += result.summary?.duplicates || 0;
      summary.failed.push(...failureEntries(result, label));
      log("[invoice-sync] fuente procesada", {
        file: label,
        archive: archive.archiveName,
        status: result.status,
        created: result.summary?.created || 0,
        duplicates: result.summary?.duplicates || 0,
        failed: result.summary?.failed || 0
      });
    } catch (error) {
      summary.failed.push({ file: label, error: error.message });
      log("[invoice-sync] ingesta fallida", { file, error: error.message, code: error.code });
    }
  }

  return summary;
}

module.exports = { readSyncConfig, scanFolder, syncFolder, archiveFor, siblingPdf };
