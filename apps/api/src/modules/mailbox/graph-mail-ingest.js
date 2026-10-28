const crypto = require("node:crypto");
const { readGraphConfig } = require("./config");
const { objectKey, manifestBytes, looksLikeZip } = require("./mailbox-objects");
const { refreshAccessToken } = require("./graph-auth");
const { createMailboxStorage } = require("./mailbox-storage");

const GRAPH = "https://graph.microsoft.com/v1.0";
const FILE_ATTACHMENT = "#microsoft.graph.fileAttachment";
const ZIP_MIME = new Set(["application/zip", "application/x-zip-compressed", "multipart/x-zip"]);
const MAX_PAGES = 10;

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isZipCandidate(attachment) {
  const name = String(attachment?.name || "").toLowerCase();
  if (name.endsWith(".zip")) return true;
  return ZIP_MIME.has(String(attachment?.contentType || "").toLowerCase());
}

function normalizeFolder(folder) {
  const value = String(folder || "INBOX").trim();
  return /^[A-Za-z]+$/.test(value) ? value.toLowerCase() : value;
}

async function graphRequest(url, { accessToken, fetchImpl, parse = "json", sleep = defaultSleep, attempts = 3 }) {
  let lastStatus = 0;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const response = await fetchImpl(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    lastStatus = response.status;
    if ((response.status === 429 || response.status >= 500) && attempt < attempts) {
      const retryAfter = Number(response.headers?.get?.("retry-after"));
      await sleep(retryAfter > 0 ? retryAfter * 1000 : attempt * 1000);
      continue;
    }
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`Graph respondio ${response.status}. ${detail.slice(0, 200)}`);
    }
    return parse === "buffer" ? Buffer.from(await response.arrayBuffer()) : await response.json();
  }
  throw new Error(`Graph no respondio tras ${attempts} intentos (ultimo estado ${lastStatus}).`);
}

async function listMessages({ config, accessToken, since, fetchImpl, sleep }) {
  const folder = encodeURIComponent(normalizeFolder(config.folder));
  const query = new URLSearchParams({
    $select: "id,subject,from,receivedDateTime",
    $filter: `hasAttachments eq true and receivedDateTime ge ${since}`,
    $orderby: "receivedDateTime desc",
    $top: "50"
  });
  const messages = [];
  let url = `${GRAPH}/me/mailFolders/${folder}/messages?${query.toString()}`;
  for (let page = 0; url && page < MAX_PAGES; page += 1) {
    const payload = await graphRequest(url, { accessToken, fetchImpl, sleep });
    messages.push(...(payload.value || []));
    url = payload["@odata.nextLink"] || null;
  }
  return messages;
}

async function ingestAttachment({ message, attachment, config, storage, accessToken, fetchImpl, sleep, now }) {
  const key = objectKey({
    tenantId: config.tenantId,
    folder: config.folder,
    receivedAt: message.receivedDateTime,
    messageId: message.id,
    attachmentId: attachment.id,
    fileName: attachment.name
  });
  if (await storage.exists(key)) return { status: "skipped", reason: "already_stored", key };

  const bytes = await graphRequest(`${GRAPH}/me/messages/${encodeURIComponent(message.id)}/attachments/${encodeURIComponent(attachment.id)}/$value`, {
    accessToken, fetchImpl, parse: "buffer", sleep
  });
  if (!bytes.length) return { status: "failed", reason: "empty_attachment", key };
  if (bytes.length > config.maxBytes) return { status: "failed", reason: "size_limit", key };
  if (!looksLikeZip(bytes)) return { status: "failed", reason: "not_a_zip", key };

  const manifest = {
    source: "microsoft-graph",
    account: config.account,
    folder: config.folder,
    message_id: message.id,
    attachment_id: attachment.id,
    subject: message.subject || null,
    sender: message.from?.emailAddress?.address || null,
    sender_name: message.from?.emailAddress?.name || null,
    received_at: message.receivedDateTime,
    file_name: attachment.name || null,
    size_bytes: bytes.length,
    sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
    stored_at: now().toISOString(),
    object_key: key
  };
  const manifestKey = `${key}.json`;
  // El manifiesto va primero: si la subida del zip falla, la siguiente pasada
  // vuelve a descargar y sobrescribe ambos objetos sin dejar huérfanos.
  await storage.put(manifestKey, manifestBytes(manifest), "application/json");
  await storage.put(key, bytes, "application/zip");
  return { status: "uploaded", key, size: bytes.length };
}

async function ingestOnce(options = {}) {
  const env = options.env || process.env;
  const config = options.config || readGraphConfig(env);
  const fetchImpl = options.fetchImpl || fetch;
  const sleep = options.sleep || defaultSleep;
  const storage = options.storage || createMailboxStorage(env, { fetchImpl });
  const now = options.now || (() => new Date());
  const log = options.log || (() => {});
  const accessToken = options.accessToken
    || await refreshAccessToken({ clientId: config.clientId, tokenFile: config.tokenFile, fetchImpl });

  const since = new Date(now().getTime() - config.lookbackDays * 86400000).toISOString();
  const messages = await listMessages({ config, accessToken, since, fetchImpl, sleep });
  const summary = { messages: messages.length, candidates: 0, uploaded: 0, skipped: 0, failed: 0, truncated: false, results: [] };

  for (const message of messages) {
    if (summary.uploaded >= config.maxAttachments) { summary.truncated = true; break; }
    const attachments = await graphRequest(`${GRAPH}/me/messages/${encodeURIComponent(message.id)}/attachments`, {
      accessToken, fetchImpl, sleep
    });
    for (const attachment of attachments.value || []) {
      if (summary.uploaded >= config.maxAttachments) { summary.truncated = true; break; }
      if (attachment.isInline) continue;
      if (String(attachment["@odata.type"] || "") !== FILE_ATTACHMENT) continue;
      if (!isZipCandidate(attachment)) continue;
      summary.candidates += 1;
      if (Number(attachment.size || 0) > config.maxBytes) {
        summary.failed += 1;
        summary.results.push({ message_id: message.id, attachment: attachment.name, status: "failed", reason: "size_limit" });
        continue;
      }
      try {
        const outcome = await ingestAttachment({ message, attachment, config, storage, accessToken, fetchImpl, sleep, now });
        if (outcome.status === "uploaded") summary.uploaded += 1;
        else if (outcome.status === "skipped") summary.skipped += 1;
        else summary.failed += 1;
        summary.results.push({ message_id: message.id, attachment: attachment.name, ...outcome });
      } catch (error) {
        summary.failed += 1;
        summary.results.push({ message_id: message.id, attachment: attachment.name, status: "failed", reason: error.message });
        log("[mailbox] adjunto fallido", { message_id: message.id, attachment: attachment.name, error: error.message });
      }
    }
  }
  return summary;
}

module.exports = { ingestOnce, isZipCandidate };
