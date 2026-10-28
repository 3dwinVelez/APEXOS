const path = require("node:path");

// apps/api/src/modules/mailbox -> raiz del repositorio
const REPO_ROOT = path.resolve(__dirname, "../../../../..");
const DEFAULT_TOKEN_FILE = path.join(REPO_ROOT, ".secrets", "graph-mail-token.json");

function configError(message) {
  return Object.assign(new Error(message), { code: "MAILBOX_CONFIG_INVALID" });
}

function positiveInt(value, fallback, name) {
  if (value === undefined || value === null || String(value).trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw configError(`${name} debe ser un entero positivo.`);
  return parsed;
}

function required(env, name) {
  const value = String(env[name] || "").trim();
  if (!value) throw configError(`Falta ${name} para la ingesta del buzon.`);
  return value;
}

function optionalBool(value, fallback = false) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return fallback;
  return normalized === "true" || normalized === "1";
}

function resolveTokenFile(env = process.env) {
  const raw = String(env.MAILBOX_GRAPH_TOKEN_FILE || "").trim();
  if (!raw) return DEFAULT_TOKEN_FILE;
  return path.isAbsolute(raw) ? raw : path.resolve(REPO_ROOT, raw);
}

function readSharedConfig(env = process.env) {
  return {
    tenantId: required(env, "MAILBOX_INGEST_TENANT_ID"),
    bucket: String(env.MAILBOX_INGEST_BUCKET || "mailbox-ingest").trim() || "mailbox-ingest",
    lookbackDays: positiveInt(
      env.MAILBOX_INGEST_LOOKBACK_DAYS ?? env.MAILBOX_GRAPH_LOOKBACK_DAYS,
      7,
      "MAILBOX_INGEST_LOOKBACK_DAYS"
    ),
    maxBytes: positiveInt(env.MAILBOX_INGEST_MAX_BYTES, 25 * 1024 * 1024, "MAILBOX_INGEST_MAX_BYTES"),
    maxAttachments: positiveInt(env.MAILBOX_INGEST_MAX_ATTACHMENTS, 50, "MAILBOX_INGEST_MAX_ATTACHMENTS"),
    localDir: String(env.MAILBOX_LOCAL_DIR || "").trim() || null,
    enabled: optionalBool(env.MAILBOX_INGEST_ENABLED),
    intervalMinutes: positiveInt(env.MAILBOX_INGEST_INTERVAL_MINUTES, 15, "MAILBOX_INGEST_INTERVAL_MINUTES")
  };
}

function readGraphConfig(env = process.env) {
  return {
    ...readSharedConfig(env),
    transport: "graph",
    clientId: required(env, "MAILBOX_GRAPH_CLIENT_ID"),
    account: String(env.MAILBOX_GRAPH_ACCOUNT || "").trim() || null,
    folder: String(env.MAILBOX_GRAPH_FOLDER || "INBOX").trim() || "INBOX",
    tokenFile: resolveTokenFile(env)
  };
}

function readImapConfig(env = process.env) {
  return {
    ...readSharedConfig(env),
    transport: "imap",
    host: String(env.MAILBOX_IMAP_HOST || "imap.gmail.com").trim(),
    port: positiveInt(env.MAILBOX_IMAP_PORT, 993, "MAILBOX_IMAP_PORT"),
    secure: optionalBool(env.MAILBOX_IMAP_SECURE, true),
    user: required(env, "MAILBOX_IMAP_USER"),
    password: required(env, "MAILBOX_IMAP_PASSWORD"),
    mailbox: String(env.MAILBOX_IMAP_MAILBOX || "INBOX").trim() || "INBOX",
    markSeen: optionalBool(env.MAILBOX_IMAP_MARK_SEEN)
  };
}

function resolveTransport(env = process.env) {
  const explicit = String(env.MAILBOX_TRANSPORT || "").trim().toLowerCase();
  if (explicit) {
    if (explicit !== "imap" && explicit !== "graph") throw configError("MAILBOX_TRANSPORT solo acepta 'imap' o 'graph'.");
    return explicit;
  }
  if (String(env.MAILBOX_IMAP_USER || "").trim()) return "imap";
  if (String(env.MAILBOX_GRAPH_CLIENT_ID || "").trim()) return "graph";
  throw configError("Configura MAILBOX_IMAP_USER o MAILBOX_GRAPH_CLIENT_ID para elegir el transporte del buzon.");
}

function readIngestConfig(env = process.env) {
  return resolveTransport(env) === "imap" ? readImapConfig(env) : readGraphConfig(env);
}

function isIngestEnabled(env = process.env) {
  return optionalBool(env.MAILBOX_INGEST_ENABLED);
}

module.exports = {
  readSharedConfig,
  readGraphConfig,
  readImapConfig,
  readIngestConfig,
  resolveTransport,
  resolveTokenFile,
  isIngestEnabled,
  DEFAULT_TOKEN_FILE,
  REPO_ROOT
};
