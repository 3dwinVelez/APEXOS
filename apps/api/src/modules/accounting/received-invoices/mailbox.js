const crypto = require("node:crypto");
const { ImapFlow } = require("imapflow");
const { simpleParser } = require("mailparser");
const prisma = require("../../../core/prisma");
const { ingestArchive } = require("./ingest");
const { appError } = require("./errors");

const DEFAULT_PORT = 993;
const DEFAULT_FOLDER = "INBOX";
const DEFAULT_POLLING_SECONDS = 30;
const MIN_POLLING_SECONDS = 10;
const MAX_POLLING_SECONDS = 3600;
// El planificador dispara cada 30 s; esta gracia absorbe el desfase entre el
// arranque de una consulta y el siguiente tick sin acortar el intervalo real.
const SCHEDULE_GRACE_MS = 5000;
const RETRY_FAILED_AFTER_MS = 10 * 60 * 1000;
const MAX_MESSAGES_PER_SYNC = 50;
const PASSWORD_KEY_PATTERN = /^[A-Z][A-Z0-9_]{2,60}$/;
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function positiveInt(value, fallback, min, max, label) {
  if (value === undefined || value === null || String(value).trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw appError(`${label} debe ser un entero entre ${min} y ${max}.`, "INVOICE_MAIL_CONFIG_INVALID", 422);
  }
  return parsed;
}

function cleanHost(value) {
  const host = String(value || "").trim();
  if (!host) throw appError("El servidor IMAP es obligatorio.", "INVOICE_MAIL_CONFIG_INVALID", 422);
  if (host.length > 253 || !/^[a-zA-Z0-9.-]+$/.test(host)) {
    throw appError("El servidor IMAP no es valido.", "INVOICE_MAIL_CONFIG_INVALID", 422);
  }
  return host.toLowerCase();
}

// Solo se persiste el NOMBRE de la variable de entorno que contiene la clave.
// La contrasena jamas viaja al navegador ni se guarda en la base de datos.
function validateMailConfig(payload = {}, current = {}) {
  const provider = String(payload.provider || current.provider || "imap").trim().toLowerCase();
  if (provider !== "imap") {
    throw appError("Este modulo recibe correo por IMAP; Microsoft Graph se configura en su propia integracion.", "INVOICE_MAIL_CONFIG_INVALID", 422);
  }
  const host = cleanHost(payload.host ?? current.host);
  const port = positiveInt(payload.port ?? current.port, DEFAULT_PORT, 1, 65535, "El puerto");
  const folder = String(payload.folder ?? current.folder ?? DEFAULT_FOLDER).trim() || DEFAULT_FOLDER;
  if (folder.length > 120 || /[\u0000-\u001f]/.test(folder)) {
    throw appError("La carpeta IMAP no es valida.", "INVOICE_MAIL_CONFIG_INVALID", 422);
  }
  const username = String(payload.username ?? current.username ?? "").trim();
  if (!username || username.length > 320) {
    throw appError("El usuario IMAP es obligatorio.", "INVOICE_MAIL_CONFIG_INVALID", 422);
  }
  const passwordEnvKey = String(payload.password_env_key ?? current.password_env_key ?? "INVOICE_IMAP_PASSWORD").trim();
  if (!PASSWORD_KEY_PATTERN.test(passwordEnvKey)) {
    throw appError("El nombre de la variable de la contrasena no es valido.", "INVOICE_MAIL_CONFIG_INVALID", 422);
  }
  return {
    provider,
    host,
    port,
    secure: payload.secure === undefined ? Boolean(current.secure ?? true) : Boolean(payload.secure),
    username,
    password_env_key: passwordEnvKey,
    folder,
    polling_seconds: positiveInt(payload.polling_seconds ?? current.polling_seconds, DEFAULT_POLLING_SECONDS, MIN_POLLING_SECONDS, MAX_POLLING_SECONDS, "El intervalo de consulta"),
    enabled: payload.enabled === undefined ? Boolean(current.enabled) : Boolean(payload.enabled)
  };
}

function envPollingSeconds() {
  const configured = Number(process.env.INVOICE_IMAP_POLL_SECONDS);
  if (Number.isInteger(configured) && configured > 0) return configured;
  const legacyMinutes = Number(process.env.INVOICE_IMAP_POLLING_MINUTES);
  if (Number.isInteger(legacyMinutes) && legacyMinutes > 0) return legacyMinutes * 60;
  return DEFAULT_POLLING_SECONDS;
}

function envFallback() {
  if (!process.env.INVOICE_IMAP_HOST) return null;
  return {
    provider: "imap",
    host: process.env.INVOICE_IMAP_HOST,
    port: Number(process.env.INVOICE_IMAP_PORT || DEFAULT_PORT),
    secure: String(process.env.INVOICE_IMAP_SECURE || "true").toLowerCase() !== "false",
    username: process.env.INVOICE_IMAP_USER || "",
    password_env_key: "INVOICE_IMAP_PASSWORD",
    folder: process.env.INVOICE_IMAP_FOLDER || DEFAULT_FOLDER,
    polling_seconds: envPollingSeconds(),
    enabled: String(process.env.INVOICE_IMAP_ENABLED || "").toLowerCase() === "true",
    last_synced_at: null,
    last_error: null,
    env_fallback: true
  };
}

async function getMailConfigRow() {
  return prisma.invoiceMailConfig.findFirst({ orderBy: { id: "asc" } });
}

async function getMailConfig() {
  const row = await getMailConfigRow();
  const config = row || envFallback();
  if (!config) {
    return {
      provider: "imap",
      host: null,
      port: DEFAULT_PORT,
      secure: true,
      username: null,
      password_env_key: "INVOICE_IMAP_PASSWORD",
      folder: DEFAULT_FOLDER,
      polling_seconds: DEFAULT_POLLING_SECONDS,
      enabled: false,
      configured: false,
      password_configured: Boolean(process.env.INVOICE_IMAP_PASSWORD),
      last_synced_at: null,
      last_error: null,
      env_fallback: false
    };
  }
  const passwordKey = config.password_env_key || "INVOICE_IMAP_PASSWORD";
  return {
    ...config,
    configured: Boolean(config.host && config.username),
    password_configured: Boolean(process.env[passwordKey]),
    env_fallback: Boolean(config.env_fallback)
  };
}

async function saveMailConfig(payload = {}) {
  const current = await getMailConfigRow();
  const data = validateMailConfig(payload, current || {});
  if (current) {
    return prisma.invoiceMailConfig.update({ where: { id: current.id }, data: { ...data, last_error: null } });
  }
  return prisma.invoiceMailConfig.create({ data });
}

function passwordFor(config) {
  const key = config.password_env_key || "INVOICE_IMAP_PASSWORD";
  const password = process.env[key];
  if (!password) {
    throw appError(
      `No hay contrasena IMAP configurada. Define la variable de entorno ${key} en el servidor.`,
      "INVOICE_MAIL_PASSWORD_MISSING",
      503
    );
  }
  return password;
}

function clientFor(config, password) {
  const allowInsecureLocal = String(process.env.INVOICE_IMAP_ALLOW_INSECURE || "").toLowerCase() === "true";
  return new ImapFlow({
    host: config.host,
    port: Number(config.port || DEFAULT_PORT),
    secure: config.secure !== false,
    auth: { user: config.username, pass: password },
    logger: false,
    tls: { rejectUnauthorized: !(allowInsecureLocal && LOCAL_HOSTS.has(config.host)) }
  });
}

// El mensaje se identifica por UIDValidity + UID + checksum del adjunto: una
// nueva sincronizacion del mismo correo produce la misma clave y no duplica.
function messageKeyFor({ uidValidity, uid, checksum }) {
  const validity = String(uidValidity || "0").replace(/[^0-9]/g, "") || "0";
  const uidPart = String(uid || "").replace(/[^0-9]/g, "");
  const digest = String(checksum || "").slice(0, 16);
  return `imap:${validity}:${uidPart}:${digest}`;
}

function isZipAttachment(attachment) {
  const name = String(attachment?.filename || "").toLowerCase();
  const contentType = String(attachment?.contentType || "").toLowerCase();
  if (name.endsWith(".zip")) return true;
  if (["application/zip", "application/x-zip-compressed", "multipart/x-zip"].includes(contentType)) return true;
  const content = attachment?.content;
  return Boolean(content && content.length >= 4 && content[0] === 0x50 && content[1] === 0x4b
    && [0x03, 0x05, 0x07].includes(content[2]) && [0x04, 0x06, 0x08].includes(content[3]));
}

function zipAttachments(attachments = []) {
  return attachments
    .filter((attachment) => attachment && attachment.content && isZipAttachment(attachment))
    .map((attachment) => ({
      fileName: String(attachment.filename || "adjunto.zip").replace(/[\\/]/g, "_").slice(0, 160),
      bytes: Buffer.from(attachment.content),
      size: Number(attachment.size) || attachment.content.length
    }));
}

async function connectionStatus(config) {
  const password = passwordFor(config);
  const client = clientFor(config, password);
  await client.connect();
  try {
    const mailbox = await client.mailboxOpen(config.folder || DEFAULT_FOLDER);
    return { ok: true, folder: mailbox.path, messages: mailbox.exists, host: config.host };
  } finally {
    await client.logout().catch(() => {});
  }
}

async function recordFailure({ config, messageKey, subject, fromAddress, receivedAt, zipFileName, error }) {
  const existing = await prisma.invoiceProcessedEmail.findFirst({ where: { message_key: messageKey } });
  const data = {
    source: "imap",
    mailbox: `${config.username}@${config.host}`,
    message_key: messageKey,
    subject: subject || null,
    from_address: fromAddress || null,
    received_at: receivedAt ? new Date(receivedAt) : new Date(),
    attachment_count: 1,
    processed_attachment_count: 0,
    invoice_count: 0,
    status: "error",
    error_message: String(error?.message || "Error desconocido").slice(0, 500),
    zip_file_name: zipFileName || null,
    processed_at: new Date()
  };
  const email = existing
    ? await prisma.invoiceProcessedEmail.update({ where: { id: existing.id }, data })
    : await prisma.invoiceProcessedEmail.create({ data });
  await prisma.invoiceProcessingError.create({
    data: {
      email_id: email.id,
      code: String(error?.code || "MAIL_INGEST_FAILED").toUpperCase().slice(0, 60),
      message: String(error?.message || "No fue posible procesar el adjunto.").slice(0, 500),
      detail: { zip_file_name: zipFileName || null }
    }
  });
  return email.id;
}

async function processAttachment({ config, uidValidity, uid, parsed, attachment }) {
  const checksum = crypto.createHash("sha256").update(attachment.bytes).digest("hex");
  const messageKey = messageKeyFor({ uidValidity, uid, checksum });
  const receivedAt = parsed.date || new Date();
  const fromAddress = parsed.from?.value?.[0]?.address || null;
  try {
    return await ingestArchive({
      tenantId: config.tenant_id,
      source: "imap",
      messageKey,
      mailbox: `${config.username}@${config.host}`,
      subject: parsed.subject || null,
      fromAddress,
      receivedAt,
      internetMessageId: parsed.messageId || null,
      archiveBuffer: attachment.bytes,
      archiveName: attachment.fileName,
      attachmentCount: 1
    });
  } catch (error) {
    await recordFailure({
      config,
      messageKey,
      subject: parsed.subject || null,
      fromAddress,
      receivedAt,
      zipFileName: attachment.fileName,
      error
    });
    return { status: "error", message: error.message, code: error.code || "MAIL_INGEST_FAILED" };
  }
}

const RUNNING_TENANTS = new Set();

// Con una consulta cada 30 s no se puede volver a descargar el buzon completo.
// Los UID ya procesados se omiten; los fallos se reintentan despues de un
// enfriamiento para no martillar un correo que siempre falla.
function processedUidSet(rows = [], uidValidity = "0", now = Date.now()) {
  const prefix = `imap:${String(uidValidity || "0")}:`;
  const skip = new Set();
  for (const row of rows) {
    const key = String(row?.message_key || "");
    if (!key.startsWith(prefix)) continue;
    const uid = key.slice(prefix.length).split(":")[0];
    if (!uid) continue;
    const status = String(row.status || "");
    const processedAt = row.processed_at ? new Date(row.processed_at).getTime() : 0;
    const retriable = (status === "error" || status === "processing")
      && (!processedAt || now - processedAt >= RETRY_FAILED_AFTER_MS);
    if (!retriable) skip.add(uid);
  }
  return skip;
}

async function syncMailbox({ tenantId, limit = 20, trigger = "manual", createClient = clientFor } = {}) {
  if (!tenantId) throw appError("Falta la empresa para sincronizar el correo.", "INVOICE_TENANT_INVALID", 400);
  if (RUNNING_TENANTS.has(tenantId)) {
    throw appError("Ya hay una sincronizacion en curso para esta empresa.", "INVOICE_MAIL_SYNC_RUNNING", 409);
  }
  return prisma.runWithTenant(tenantId, async () => {
    const config = await getMailConfigRow() || envFallback();
    if (!config?.host || !config.username) {
      throw appError("Configura el buzon IMAP antes de sincronizar.", "INVOICE_MAIL_NOT_CONFIGURED", 422);
    }
    if (trigger === "scheduled" && config.enabled === false) {
      return { skipped: true, reason: "disabled" };
    }
    const password = passwordFor(config);
    const folder = config.folder || DEFAULT_FOLDER;
    const maxMessages = Math.min(MAX_MESSAGES_PER_SYNC, Math.max(1, Number(limit) || 20));
    RUNNING_TENANTS.add(tenantId);
    const client = createClient(config, password);
    const summary = { messages: 0, pending: 0, attachments: 0, created: 0, duplicates: 0, failed: 0, results: [] };
    try {
      // El intervalo se mide desde el inicio de la consulta para que un
      // procesamiento largo no empuje la siguiente corrida a 60 s.
      if (config.id) {
        await prisma.invoiceMailConfig.update({
          where: { id: config.id },
          data: { last_synced_at: new Date() }
        }).catch(() => {});
      }
      await client.connect();
      const lock = await client.getMailboxLock(folder);
      try {
        const since = new Date(Date.now() - 7 * 86400000);
        const uids = await client.search({ since }, { uid: true });
        const uidValidity = String(client.mailbox?.uidValidity || "0");
        const mailbox = `${config.username}@${config.host}`;
        const processed = await prisma.invoiceProcessedEmail.findMany({
          where: {
            mailbox,
            message_key: { startsWith: `imap:${uidValidity}:` },
            OR: [{ processed_at: { gte: since } }, { processed_at: null }]
          },
          select: { message_key: true, status: true, processed_at: true }
        });
        const skip = processedUidSet(processed, uidValidity);
        const pending = (Array.isArray(uids) ? uids : [])
          .filter((uid) => !skip.has(String(uid)))
          .sort((left, right) => Number(left) - Number(right))
          .slice(0, maxMessages);
        summary.pending = pending.length;
        for (const uid of pending) {
          const message = await client.fetchOne(uid, { uid: true, source: true }, { uid: true });
          if (!message?.source) continue;
          summary.messages += 1;
          let parsed;
          try {
            parsed = await simpleParser(message.source);
          } catch (error) {
            summary.failed += 1;
            summary.results.push({ uid, status: "error", message: "No fue posible leer el mensaje." });
            continue;
          }
          for (const attachment of zipAttachments(parsed.attachments)) {
            summary.attachments += 1;
            const result = await processAttachment({ config: { ...config, tenant_id: tenantId }, uidValidity, uid, parsed, attachment });
            if (result.status === "created" || result.status === "processed" || result.status === "processed_with_errors") {
              summary.created += result.summary?.created || 0;
              summary.duplicates += result.summary?.duplicates || 0;
              if (result.status === "processed_with_errors") summary.failed += result.summary?.failed || 0;
            } else if (result.duplicate || result.status === "duplicate_email") {
              summary.duplicates += 1;
            } else {
              summary.failed += 1;
            }
            summary.results.push({ uid, file: attachment.fileName, status: result.status, invoices: result.invoices?.length || 0 });
          }
        }
      } finally {
        lock.release();
      }
      if (config.id) {
        await prisma.invoiceMailConfig.update({
          where: { id: config.id },
          data: { last_error: null }
        }).catch(() => {});
      }
      return summary;
    } catch (error) {
      if (config.id) {
        await prisma.invoiceMailConfig.update({
          where: { id: config.id },
          data: { last_error: String(error.message).slice(0, 500) }
        }).catch(() => {});
      }
      throw error;
    } finally {
      RUNNING_TENANTS.delete(tenantId);
      await client.logout().catch(() => {});
    }
  });
}

function pollingSecondsFor(config = {}) {
  const value = Number(config.polling_seconds ?? DEFAULT_POLLING_SECONDS);
  if (!Number.isInteger(value)) return DEFAULT_POLLING_SECONDS;
  return Math.min(MAX_POLLING_SECONDS, Math.max(MIN_POLLING_SECONDS, value));
}

// El cron dispara cada 30 s; cada buzon decide si ya le toca segun su
// intervalo. La gracia evita perder un tick por milisegundos de desfase.
function dueConfigs(configs = [], now = Date.now()) {
  return configs.filter((config) => {
    if (config.enabled === false) return false;
    if (!config.last_synced_at) return true;
    const dueAt = new Date(config.last_synced_at).getTime() + pollingSecondsFor(config) * 1000 - SCHEDULE_GRACE_MS;
    return now >= dueAt;
  });
}

// Recorre las empresas con buzon habilitado sin contexto de tenant: el cron no
// tiene empresa activa y debe operar cada configuracion en su propio contexto.
async function runScheduled({ tenantId = null, now = Date.now(), sync = syncMailbox } = {}) {
  const configs = await prisma.invoiceMailConfig.findMany({
    where: { enabled: true, ...(tenantId ? { tenant_id: tenantId } : {}) }
  });
  const results = [];
  for (const config of dueConfigs(configs, now)) {
    try {
      const summary = await prisma.runWithTenant(config.tenant_id, () => sync({
        tenantId: config.tenant_id,
        limit: MAX_MESSAGES_PER_SYNC,
        trigger: "scheduled"
      }));
      results.push({ tenant_id: config.tenant_id, ...summary });
    } catch (error) {
      results.push({ tenant_id: config.tenant_id, error: error.message });
    }
  }
  return results;
}

module.exports = {
  getMailConfig,
  saveMailConfig,
  connectionStatus,
  syncMailbox,
  runScheduled,
  validateMailConfig,
  zipAttachments,
  messageKeyFor,
  isZipAttachment,
  processedUidSet,
  dueConfigs,
  pollingSecondsFor,
  DEFAULT_POLLING_SECONDS,
  SCHEDULE_GRACE_MS
};
