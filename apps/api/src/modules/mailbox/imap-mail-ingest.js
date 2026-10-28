const crypto = require("node:crypto");
const { ImapFlow } = require("imapflow");
const { readImapConfig } = require("./config");
const { objectKey, manifestBytes, looksLikeZip } = require("./mailbox-objects");
const { createMailboxStorage } = require("./mailbox-storage");

const ZIP_MIME = new Set(["application/zip", "application/x-zip-compressed", "multipart/x-zip"]);

function createImapClient(config) {
  return new ImapFlow({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.password },
    logger: false
  });
}

function partFileName(node) {
  return String(node?.dispositionParameters?.filename || node?.parameters?.name || "");
}

// Recorre el arbol MIME y devuelve solo las partes que pueden ser un .zip.
// Se hace antes de descargar: asi no se baja el cuerpo completo de correos sin zip.
function collectZipParts(node, out = []) {
  if (!node) return out;
  const children = Array.isArray(node.childNodes) ? node.childNodes : [];
  if (children.length) {
    for (const child of children) collectZipParts(child, out);
    return out;
  }
  const fileName = partFileName(node);
  const contentType = String(node.type || "").toLowerCase();
  const isZip = fileName.toLowerCase().endsWith(".zip") || ZIP_MIME.has(contentType);
  const isInline = String(node.disposition || "").toLowerCase() === "inline";
  if (isZip && !isInline) {
    out.push({
      part: String(node.part || "1"),
      fileName,
      contentType,
      size: Number(node.size || 0)
    });
  }
  return out;
}

async function streamToBuffer(stream, limit) {
  const chunks = [];
  let total = 0;
  for await (const chunk of stream) {
    total += chunk.length;
    if (total > limit) {
      throw Object.assign(new Error("El adjunto supera MAILBOX_INGEST_MAX_BYTES."), { code: "MAILBOX_SIZE_LIMIT" });
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function downloadPart(client, uid, part) {
  const download = await client.download(uid, part, { uid: true });
  if (!download || !download.content) return null;
  return download.content;
}

async function storeAttachment({ source, storage, config, now, bytes }) {
  const key = objectKey({
    tenantId: config.tenantId,
    folder: config.mailbox,
    receivedAt: source.receivedAt,
    messageId: source.messageId,
    attachmentId: source.part,
    fileName: source.fileName
  });
  if (await storage.exists(key)) return { status: "skipped", reason: "already_stored", key };
  if (!bytes.length) return { status: "failed", reason: "empty_attachment", key };
  if (bytes.length > config.maxBytes) return { status: "failed", reason: "size_limit", key };
  if (!looksLikeZip(bytes)) return { status: "failed", reason: "not_a_zip", key };

  const manifest = {
    source: "imap",
    account: config.user,
    folder: config.mailbox,
    message_id: source.messageId,
    attachment_id: source.part,
    subject: source.subject || null,
    sender: source.sender || null,
    sender_name: source.senderName || null,
    received_at: source.receivedAt,
    file_name: source.fileName || null,
    size_bytes: bytes.length,
    sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
    stored_at: now().toISOString(),
    object_key: key
  };
  // El manifiesto va primero: si la subida del zip falla, la siguiente pasada
  // vuelve a descargar y sobrescribe ambos objetos sin dejar huerfanos.
  await storage.put(`${key}.json`, manifestBytes(manifest), "application/json");
  await storage.put(key, bytes, "application/zip");
  return { status: "uploaded", key, size: bytes.length };
}

async function runIngest({ client, config, storage, now, log }) {
  const since = new Date(now().getTime() - config.lookbackDays * 86400000);
  const uids = await client.search({ since }, { uid: true });
  const summary = { messages: (uids || []).length, candidates: 0, uploaded: 0, skipped: 0, failed: 0, truncated: false, results: [] };
  if (!uids || !uids.length) return summary;

  for (const uid of uids) {
    if (summary.uploaded >= config.maxAttachments) { summary.truncated = true; break; }
    const message = await client.fetchOne(uid, { envelope: true, bodyStructure: true, internalDate: true }, { uid: true });
    if (!message) continue;
    const parts = collectZipParts(message.bodyStructure);
    if (!parts.length) continue;

    const messageId = message.envelope?.messageId || `${config.mailbox}:${uid}`;
    const sender = message.envelope?.from?.[0];
    const source = {
      messageId,
      subject: message.envelope?.subject || null,
      sender: sender?.address || null,
      senderName: sender?.name || null,
      receivedAt: message.internalDate || message.envelope?.date || now()
    };

    let messageFailures = 0;
    for (const part of parts) {
      if (summary.uploaded >= config.maxAttachments) { summary.truncated = true; break; }
      summary.candidates += 1;
      if (part.size > config.maxBytes) {
        summary.failed += 1;
        messageFailures += 1;
        summary.results.push({ message_id: messageId, attachment: part.fileName, status: "failed", reason: "size_limit" });
        continue;
      }
      try {
        const stream = await downloadPart(client, uid, part.part);
        if (!stream) {
          summary.failed += 1;
          messageFailures += 1;
          summary.results.push({ message_id: messageId, attachment: part.fileName, status: "failed", reason: "attachment_not_downloadable" });
          continue;
        }
        const bytes = await streamToBuffer(stream, config.maxBytes);
        const outcome = await storeAttachment({ source: { ...source, part: part.part, fileName: part.fileName }, storage, config, now, bytes });
        if (outcome.status === "uploaded") summary.uploaded += 1;
        else if (outcome.status === "skipped") summary.skipped += 1;
        else { summary.failed += 1; messageFailures += 1; }
        summary.results.push({ message_id: messageId, attachment: part.fileName, ...outcome });
      } catch (error) {
        summary.failed += 1;
        messageFailures += 1;
        const reason = error.code === "MAILBOX_SIZE_LIMIT" ? "size_limit" : error.message;
        summary.results.push({ message_id: messageId, attachment: part.fileName, status: "failed", reason });
        log("[mailbox] adjunto fallido", { message_id: messageId, attachment: part.fileName, error: error.message });
      }
    }

    // Si algo fallo se deja sin leer: marcar el correo como visto escondería un
    // zip que todavía no está guardado.
    if (config.markSeen && messageFailures === 0) {
      await client.messageFlagsAdd(uid, ["\\Seen"], { uid: true }).catch((error) => {
        log("[mailbox] no se pudo marcar como leido", { uid, error: error.message });
      });
    }
  }
  return summary;
}

async function ingestOnce(options = {}) {
  const env = options.env || process.env;
  const config = options.config || readImapConfig(env);
  const storage = options.storage || createMailboxStorage(env);
  const now = options.now || (() => new Date());
  const log = options.log || (() => {});
  const owned = !options.client;
  const client = options.client || createImapClient(config);

  if (owned) await client.connect();
  let lock = null;
  try {
    lock = await client.getMailboxLock(config.mailbox);
    return await runIngest({ client, config, storage, now, log });
  } finally {
    if (lock) lock.release();
    if (owned) await client.logout().catch(() => {});
  }
}

module.exports = { ingestOnce, collectZipParts, createImapClient };
