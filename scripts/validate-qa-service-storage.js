const loadEnv = require("../apps/api/src/core/loadEnv");

loadEnv();

const url = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const email = process.env.QA_SUPABASE_SCJ_EMAIL || "admin@scj.qa";
const password = process.env.QA_SUPABASE_SCJ_PASSWORD || "";

if (!url || !anonKey || !password) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and QA_SUPABASE_SCJ_PASSWORD are required.");
}

async function jsonRequest(pathname, token, options = {}) {
  const response = await fetch(`${url}${pathname}`, {
    ...options,
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(`${options.method || "GET"} ${pathname} -> ${response.status}: ${text.slice(0, 400)}`);
  return body;
}

async function main() {
  const auth = await jsonRequest("/auth/v1/token?grant_type=password", anonKey, {
    method: "POST",
    body: JSON.stringify({ email, password })
  });
  const token = auth.access_token;
  const orders = await jsonRequest("/rest/v1/service_orders?select=id,company_id&order=created_at.desc&limit=1", token);
  if (!orders[0]) throw new Error("The authenticated QA user cannot access a service order.");

  const order = orders[0];
  const suffix = Date.now();
  const objectPath = `${order.company_id}/${order.id}/smoke-${suffix}.png`;
  const storagePath = `service-images/${objectPath}`;
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
  let evidenceId = "";

  try {
    const upload = await fetch(`${url}/storage/v1/object/service-images/${objectPath}`, {
      method: "POST",
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${token}`,
        "Content-Type": "image/png",
        "x-upsert": "false"
      },
      body: png
    });
    if (!upload.ok) throw new Error(`Authenticated Storage upload failed: ${upload.status} ${await upload.text()}`);

    const inserted = await jsonRequest("/rest/v1/service_evidence?select=id,storage_path", token, {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        company_id: order.company_id,
        order_id: order.id,
        evidence_type: "novedad",
        file_url: null,
        storage_bucket: "service-images",
        storage_path: storagePath,
        mime_type: "image/png",
        size_bytes: png.length,
        metadata: { qa_storage_smoke: true }
      })
    });
    evidenceId = inserted[0]?.id || "";
    if (!evidenceId) throw new Error("Evidence metadata insert did not return an id.");

    const signed = await jsonRequest(`/storage/v1/object/sign/service-images/${objectPath}`, token, {
      method: "POST",
      body: JSON.stringify({ expiresIn: 60 })
    });
    const signedUrl = signed.signedURL.startsWith("http")
      ? signed.signedURL
      : `${url}${signed.signedURL.startsWith("/object/") ? "/storage/v1" : ""}${signed.signedURL}`;
    const download = await fetch(signedUrl);
    if (!download.ok || (await download.arrayBuffer()).byteLength !== png.length) {
      throw new Error(`Signed evidence read failed: ${download.status}`);
    }

    const blocked = await fetch(`${url}/rest/v1/service_evidence`, {
      method: "POST",
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal"
      },
      body: JSON.stringify({
        company_id: order.company_id,
        order_id: order.id,
        evidence_type: "novedad",
        file_url: "data:image/png;base64,AA==",
        metadata: { qa_storage_smoke_rejected: true }
      })
    });
    if (blocked.ok) throw new Error("Data URI protection failed: database accepted base64 evidence.");

    console.log(JSON.stringify({
      status: "ok",
      login: true,
      authenticated_upload: true,
      metadata_insert: true,
      signed_read: true,
      data_uri_rejected: true
    }));
  } finally {
    if (evidenceId) {
      await jsonRequest(`/rest/v1/service_evidence?id=eq.${encodeURIComponent(evidenceId)}`, token, { method: "DELETE" }).catch(() => null);
    }
    await fetch(`${url}/storage/v1/object/service-images/${objectPath}`, {
      method: "DELETE",
      headers: { apikey: anonKey, Authorization: `Bearer ${token}` }
    }).catch(() => null);
  }
}

main().catch((error) => {
  console.error(`[service-storage-smoke] ${error.message}`);
  process.exitCode = 1;
});
