const crypto = require("node:crypto");

// Helpers compartidos por todos los transportes (Graph e IMAP): la ruta final en
// storage debe ser la misma sin importar de donde vino el adjunto.

function safeFileName(name) {
  const base = String(name || "")
    .replace(/[\\/]/g, "_")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[^a-zA-Z0-9._ -]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "");
  return (base || "adjunto.zip").slice(0, 80);
}

function looksLikeZip(bytes) {
  if (!bytes || bytes.length < 4) return false;
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) return false;
  const pair = (bytes[2] << 8) | bytes[3];
  return pair === 0x0304 || pair === 0x0506 || pair === 0x0708;
}

// Clave determinista: el mismo mensaje y adjunto siempre producen la misma ruta,
// asi una nueva pasada no duplica archivos aunque el proceso se reinicie.
function objectKey({ tenantId, folder, receivedAt, messageId, attachmentId, fileName }) {
  const tenant = String(tenantId).replace(/[^a-zA-Z0-9_-]/g, "_");
  if (!tenant) throw Object.assign(new Error("MAILBOX_INGEST_TENANT_ID invalido."), { code: "MAILBOX_CONFIG_INVALID" });
  const folderSlug = String(folder || "INBOX").toLowerCase().replace(/[^a-z0-9_-]/g, "_") || "inbox";
  const digest = crypto.createHash("sha256").update(`${messageId}|${attachmentId}`).digest("hex").slice(0, 12);
  const date = new Date(receivedAt);
  const stamp = Number.isNaN(date.getTime()) ? new Date() : date;
  const year = String(stamp.getUTCFullYear());
  const month = String(stamp.getUTCMonth() + 1).padStart(2, "0");
  const day = String(stamp.getUTCDate()).padStart(2, "0");
  const name = safeFileName(fileName);
  const fileNameWithExtension = name.toLowerCase().endsWith(".zip") ? name : `${name}.zip`;
  return `${tenant}/mailbox/${folderSlug}/${year}/${month}/${day}/${digest}-${fileNameWithExtension}`;
}

function manifestBytes(manifest) {
  return Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

module.exports = { safeFileName, looksLikeZip, objectKey, manifestBytes };
