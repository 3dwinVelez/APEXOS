const fs = require("node:fs/promises");
const path = require("node:path");

function storageError(message, statusCode = 502) {
  return Object.assign(new Error(message), { statusCode });
}

function encodeKey(key) {
  return String(key).split("/").map(encodeURIComponent).join("/");
}

function supabaseCredentials(env) {
  const url = String(env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY;
  if (!url || !key) return null;
  return { url, key };
}

function localDirectory(env) {
  const dir = String(env.MAILBOX_LOCAL_DIR || "").trim();
  if (!dir) return null;
  if (String(env.NODE_ENV || "").toLowerCase() === "production") {
    throw storageError("MAILBOX_LOCAL_DIR no puede usarse en produccion.", 500);
  }
  return path.resolve(dir);
}

function localStorage(root, bucket) {
  function target(key) {
    const resolved = path.resolve(root, key);
    if (!resolved.startsWith(path.resolve(root) + path.sep)) throw storageError("Ruta de almacenamiento no autorizada.", 403);
    return resolved;
  }
  return {
    bucket,
    provider: "local-development",
    async exists(key) {
      try { await fs.access(target(key)); return true; } catch { return false; }
    },
    async put(key, bytes) {
      const file = target(key);
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, bytes);
    }
  };
}

function supabaseStorage({ url, key }, bucket, fetchImpl) {
  const headers = { apikey: key, Authorization: `Bearer ${key}` };

  async function request(pathname, options = {}) {
    const response = await fetchImpl(`${url}/storage/v1${pathname}`, {
      ...options,
      headers: { ...headers, ...(options.headers || {}) }
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw storageError(`Almacenamiento rechazo la operacion (${response.status}). ${detail.slice(0, 160)}`);
    }
    return response;
  }

  return {
    bucket,
    provider: "supabase-storage",
    async exists(objectKey) {
      const directory = path.posix.dirname(objectKey);
      const name = path.posix.basename(objectKey);
      const response = await request(`/object/list/${encodeURIComponent(bucket)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prefix: `${directory}/`, limit: 100, search: name })
      });
      const entries = await response.json().catch(() => []);
      return Array.isArray(entries) && entries.some((entry) => entry?.name === name);
    },
    async put(objectKey, bytes, contentType) {
      await request(`/object/${encodeURIComponent(bucket)}/${encodeKey(objectKey)}`, {
        method: "POST",
        headers: { "Content-Type": contentType || "application/octet-stream", "x-upsert": "true" },
        body: bytes
      });
    }
  };
}

function createMailboxStorage(env = process.env, { fetchImpl = fetch } = {}) {
  const bucket = String(env.MAILBOX_INGEST_BUCKET || "mailbox-ingest").trim() || "mailbox-ingest";
  const local = localDirectory(env);
  if (local) return localStorage(local, bucket);
  const credentials = supabaseCredentials(env);
  if (!credentials) {
    throw storageError("Almacenamiento del buzon no configurado: define SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY, o MAILBOX_LOCAL_DIR en desarrollo.", 503);
  }
  return supabaseStorage(credentials, bucket, fetchImpl);
}

module.exports = { createMailboxStorage };
