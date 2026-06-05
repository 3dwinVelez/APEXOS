const loadEnv = require("../apps/api/src/core/loadEnv");

loadEnv();

const SUPABASE_URL = String(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const TARGET_ENV = String(process.env.TARGET_ENV || "").toLowerCase();
const CONFIRMED = String(process.env.CONFIRM_QA_STORAGE_MIGRATION || "").toLowerCase() === "true";
const BUCKET = "service-images";
const BUCKET_LIMIT = 10 * 1024 * 1024;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
}
if (TARGET_ENV !== "qa" || !CONFIRMED) {
  throw new Error("Set TARGET_ENV=qa and CONFIRM_QA_STORAGE_MIGRATION=true to run this controlled migration.");
}

const headers = {
  apikey: SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SERVICE_ROLE_KEY}`
};

function safeSegment(value) {
  return String(value || "unknown").replace(/[^a-zA-Z0-9_-]/g, "-");
}

function extensionFor(mimeType) {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  return "jpg";
}

function parseDataUri(value, fallbackMime) {
  const match = String(value || "").match(/^data:([^;,]+);base64,(.+)$/s);
  if (!match) throw new Error("Invalid evidence data URI.");
  const mimeType = match[1] || fallbackMime || "image/jpeg";
  const bytes = Buffer.from(match[2], "base64");
  if (!["image/png", "image/jpeg", "image/webp"].includes(mimeType)) {
    throw new Error(`Unsupported evidence MIME type: ${mimeType}`);
  }
  if (!bytes.length || bytes.length > BUCKET_LIMIT) {
    throw new Error(`Evidence size ${bytes.length} is outside the accepted range.`);
  }
  return { mimeType, bytes };
}

async function request(pathname, options = {}) {
  const response = await fetch(`${SUPABASE_URL}${pathname}`, {
    ...options,
    headers: { ...headers, ...(options.headers || {}) }
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${options.method || "GET"} ${pathname} -> ${response.status}: ${body.slice(0, 500)}`);
  }
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function ensureBucket() {
  const bucketResponse = await fetch(`${SUPABASE_URL}/storage/v1/bucket/${BUCKET}`, { headers });
  const body = {
    id: BUCKET,
    name: BUCKET,
    public: false,
    file_size_limit: BUCKET_LIMIT,
    allowed_mime_types: ["image/png", "image/jpeg", "image/webp"]
  };
  if (bucketResponse.status === 404) {
    await request("/storage/v1/bucket", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return "created";
  }
  if (!bucketResponse.ok) throw new Error(`GET bucket -> ${bucketResponse.status}`);
  await request(`/storage/v1/bucket/${BUCKET}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return "updated";
}

async function upload(path, bytes, mimeType) {
  await request(`/storage/v1/object/${BUCKET}/${path}`, {
    method: "POST",
    headers: { "Content-Type": mimeType, "x-upsert": "true", "cache-control": "3600" },
    body: bytes
  });
  const verify = await fetch(`${SUPABASE_URL}/storage/v1/object/info/${BUCKET}/${path}`, { headers });
  if (!verify.ok) throw new Error(`Uploaded object verification failed: ${verify.status}`);
}

async function migrateRow(row) {
  const { mimeType, bytes } = parseDataUri(row.file_url, row.mime_type);
  const path = `${safeSegment(row.company_id)}/${safeSegment(row.order_id)}/legacy-${safeSegment(row.id)}.${extensionFor(mimeType)}`;
  await upload(path, bytes, mimeType);
  await request(`/rest/v1/service_evidence?id=eq.${encodeURIComponent(row.id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({
      file_url: null,
      storage_bucket: BUCKET,
      storage_path: `${BUCKET}/${path}`,
      mime_type: mimeType,
      size_bytes: bytes.length,
      metadata: { ...(row.metadata || {}), migrated_to_storage: true, migrated_at: new Date().toISOString() }
    })
  });
  return { id: row.id, path, bytes: bytes.length };
}

async function main() {
  console.log(`[storage-migration] target=qa project=${new URL(SUPABASE_URL).hostname.split(".")[0]}`);
  console.log(`[storage-migration] bucket=${await ensureBucket()}`);
  const rows = await request("/rest/v1/service_evidence?select=id,company_id,order_id,file_url,mime_type,metadata&file_url=like.data:*%3Bbase64,*&order=created_at.asc");
  console.log(`[storage-migration] pending=${rows.length}`);
  const migrated = [];
  for (const row of rows) {
    const result = await migrateRow(row);
    migrated.push(result);
    console.log(`[storage-migration] migrated id=${result.id} bytes=${result.bytes}`);
  }
  const remaining = await request("/rest/v1/service_evidence?select=id&file_url=like.data:*%3Bbase64,*");
  if (remaining.length) throw new Error(`${remaining.length} evidence rows still contain data URIs.`);
  console.log(`[storage-migration] complete migrated=${migrated.length} remaining_data_uri=0`);
}

main().catch((error) => {
  console.error(`[storage-migration] failed: ${error.message}`);
  process.exitCode = 1;
});
