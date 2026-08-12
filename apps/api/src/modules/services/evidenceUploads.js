const crypto = require("node:crypto");
const prisma = require("../../core/prisma");

const BUCKET = "service-images";
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_DIMENSION = 4096;
const ALLOWED_MIME = new Set(["image/png", "image/jpeg", "image/webp"]);
const ALLOWED_PURPOSE = /^[a-z0-9_-]{1,64}$/;

function enabled() {
  return String(process.env.AUTHORIZED_EVIDENCE_UPLOADS_ENABLED || "").toLowerCase() === "true";
}

function storageConfig() {
  const url = String(process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw Object.assign(new Error("Storage autoritativo no configurado."), { statusCode: 503 });
  return { url, key };
}

function serviceHeaders(contentType = "application/json") {
  const { key } = storageConfig();
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": contentType };
}

function extension(mime) {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "jpg";
}

function companyId(user) {
  return String(user?.company_id || "").trim() || null;
}

async function assertOrderAccess(tenantId, user, orderKey) {
  if (/^\d+$/.test(String(orderKey))) {
    const order = await prisma.serviceOrder.findFirst({ where: { id: Number(orderKey) }, select: { id: true } });
    if (!order) throw Object.assign(new Error("Orden no encontrada en la empresa."), { statusCode: 404 });
    return companyId(user);
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(orderKey))) {
    throw Object.assign(new Error("Identificador de orden invalido."), { statusCode: 400 });
  }
  const current = await prisma.user.findUnique({ where: { id: user.id }, select: { preferences: true } });
  const company = companyId(user) || String(current?.preferences?.company_id || "").trim();
  if (!company) throw Object.assign(new Error("La sesion no tiene empresa operativa asociada."), { statusCode: 403 });
  const query = new URLSearchParams({ select: "id", id: `eq.${orderKey}`, company_id: `eq.${company}`, limit: "1" });
  const response = await storageRequest(`/rest/v1/service_orders?${query.toString()}`);
  const orders = await response.json();
  if (!Array.isArray(orders) || orders.length !== 1) {
    throw Object.assign(new Error("Orden no encontrada en la empresa."), { statusCode: 404 });
  }
  return company;
}

function dimensions(bytes, mime) {
  if (mime === "image/png" && bytes.length >= 24) {
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  if (mime === "image/webp" && bytes.length >= 30 && bytes.toString("ascii", 12, 16) === "VP8X") {
    return { width: 1 + bytes.readUIntLE(24, 3), height: 1 + bytes.readUIntLE(27, 3) };
  }
  if (mime === "image/jpeg") {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) break;
      const marker = bytes[offset + 1];
      const length = bytes.readUInt16BE(offset + 2);
      if (length < 2) break;
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        return { height: bytes.readUInt16BE(offset + 5), width: bytes.readUInt16BE(offset + 7) };
      }
      offset += 2 + length;
    }
  }
  return null;
}

function detectedMime(bytes) {
  if (bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
  if (bytes.length >= 12 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff && bytes.at(-2) === 0xff && bytes.at(-1) === 0xd9) return "image/jpeg";
  if (bytes.length >= 16 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}

async function storageRequest(path, options = {}) {
  const { url } = storageConfig();
  const response = await fetch(`${url}${path}`, {
    ...options,
    headers: { ...serviceHeaders(options.contentType), ...(options.headers || {}) }
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw Object.assign(new Error(`Storage rechazo la operacion (${response.status}). ${detail.slice(0, 160)}`), { statusCode: 502 });
  }
  return response;
}

async function signedResponse(authorization) {
  const response = await storageRequest(`/storage/v1/object/upload/sign/${BUCKET}/${authorization.quarantine_path}`, {
    method: "POST",
    body: JSON.stringify({ upsert: false })
  });
  const signed = await response.json();
  return {
    authorization_id: authorization.id,
    bucket: BUCKET,
    path: authorization.quarantine_path,
    signed_upload_url: signed.url || signed.signedURL || signed.signedUrl,
    expires_at: authorization.expires_at
  };
}

async function authorize(tenantId, user, orderKey, input) {
  if (!enabled()) throw Object.assign(new Error("Carga autoritativa deshabilitada."), { statusCode: 404 });
  const mime = String(input.mime_type || "").toLowerCase();
  const size = Number(input.size_bytes || 0);
  const purpose = String(input.purpose || "");
  const clientUploadId = String(input.client_upload_id || "");
  if (!ALLOWED_MIME.has(mime)) throw Object.assign(new Error("Tipo de evidencia no permitido."), { statusCode: 415 });
  if (!Number.isInteger(size) || size < 1 || size > MAX_BYTES) throw Object.assign(new Error("Tamano de evidencia invalido."), { statusCode: 413 });
  if (!ALLOWED_PURPOSE.test(purpose) || !clientUploadId || clientUploadId.length > 128) {
    throw Object.assign(new Error("Proposito o identificador de carga invalido."), { statusCode: 400 });
  }

  return prisma.runWithTenant(tenantId, async () => {
    const existing = await prisma.evidenceUploadAuthorization.findUnique({
      where: { tenant_id_user_id_client_upload_id: { tenant_id: tenantId, user_id: user.id, client_upload_id: clientUploadId } }
    });
    if (existing && existing.expires_at > new Date() && existing.status === "authorized") return signedResponse(existing);
    const authorizedCompanyId = await assertOrderAccess(tenantId, user, orderKey);
    const id = crypto.randomUUID();
    const quarantinePath = `_quarantine/${tenantId}/${user.id}/${id}.${extension(mime)}`;
    const authorization = await prisma.evidenceUploadAuthorization.create({
      data: {
        id,
        tenant_id: tenantId,
        company_id: authorizedCompanyId,
        order_key: String(orderKey),
        user_id: user.id,
        supabase_user_id: user.supabase_user_id || null,
        purpose,
        expected_mime_type: mime,
        expected_size_bytes: size,
        client_upload_id: clientUploadId,
        quarantine_path: quarantinePath,
        expires_at: new Date(Date.now() + 5 * 60 * 1000)
      }
    });
    return signedResponse(authorization);
  });
}

async function reject(authorization, reason) {
  await prisma.evidenceUploadAuthorization.update({ where: { id: authorization.id }, data: { status: "rejected", rejection_reason: reason } });
  await storageRequest(`/storage/v1/object/${BUCKET}/${authorization.quarantine_path}`, { method: "DELETE" }).catch(() => undefined);
  throw Object.assign(new Error(reason), { statusCode: 422 });
}

async function confirm(tenantId, user, authorizationId) {
  if (!enabled()) throw Object.assign(new Error("Carga autoritativa deshabilitada."), { statusCode: 404 });
  return prisma.runWithTenant(tenantId, async () => {
    const authorization = await prisma.evidenceUploadAuthorization.findFirst({ where: { id: authorizationId, user_id: user.id } });
    if (!authorization) throw Object.assign(new Error("Autorizacion no encontrada."), { statusCode: 404 });
    if (authorization.status === "validated") return authorization;
    if (authorization.status !== "authorized" || authorization.expires_at <= new Date()) {
      throw Object.assign(new Error("Autorizacion expirada o consumida."), { statusCode: 409 });
    }
    const object = await storageRequest(`/storage/v1/object/${BUCKET}/${authorization.quarantine_path}`);
    const bytes = Buffer.from(await object.arrayBuffer());
    const mime = detectedMime(bytes);
    const imageDimensions = mime ? dimensions(bytes, mime) : null;
    if (bytes.length !== authorization.expected_size_bytes) return reject(authorization, "El tamano cargado no coincide con el autorizado.");
    if (!mime || mime !== authorization.expected_mime_type) return reject(authorization, "La firma binaria no coincide con el MIME autorizado.");
    if (!imageDimensions || imageDimensions.width < 1 || imageDimensions.height < 1) return reject(authorization, "La imagen esta truncada o no es decodificable.");
    if (imageDimensions.width > MAX_DIMENSION || imageDimensions.height > MAX_DIMENSION) return reject(authorization, "Las dimensiones de la imagen exceden el limite.");
    const tenantSegment = authorization.company_id || tenantId;
    const finalPath = `${tenantSegment}/${authorization.order_key}/${authorization.id}.${extension(mime)}`;
    await storageRequest("/storage/v1/object/copy", {
      method: "POST",
      body: JSON.stringify({ bucketId: BUCKET, sourceKey: authorization.quarantine_path, destinationKey: finalPath })
    });
    await storageRequest(`/storage/v1/object/${BUCKET}/${authorization.quarantine_path}`, { method: "DELETE" });
    return prisma.evidenceUploadAuthorization.update({
      where: { id: authorization.id },
      data: {
        status: "validated",
        final_path: finalPath,
        detected_mime_type: mime,
        detected_size_bytes: bytes.length,
        detected_width: imageDimensions.width,
        detected_height: imageDimensions.height,
        checksum_sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
        confirmed_at: new Date()
      }
    });
  });
}

async function status(tenantId, user, authorizationId) {
  return prisma.runWithTenant(tenantId, async () => {
    const item = await prisma.evidenceUploadAuthorization.findFirst({ where: { id: authorizationId, user_id: user.id } });
    if (!item) throw Object.assign(new Error("Autorizacion no encontrada."), { statusCode: 404 });
    return {
      authorization_id: item.id,
      status: item.status,
      rejection_reason: item.rejection_reason,
      storage_path: item.final_path ? `${BUCKET}/${item.final_path}` : null,
      checksum_sha256: item.checksum_sha256,
      confirmed_at: item.confirmed_at
    };
  });
}

module.exports = { authorize, confirm, status, detectedMime, dimensions, MAX_BYTES, MAX_DIMENSION };
