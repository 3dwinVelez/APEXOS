const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

export const IMAGE_MAX_BYTES = 2 * 1024 * 1024;
export const IMAGE_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

type ImageBucket = "company-assets" | "user-avatars" | "service-images";

type UploadResult = {
  bucket: ImageBucket;
  path: string;
  storagePath: string;
};

function requireSupabaseConfig() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error("Configura NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  }
}

function authHeaders(contentType?: string) {
  requireSupabaseConfig();
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  if (!token) throw new Error("Sesion requerida para cargar imagenes.");
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${token}`,
    ...(contentType ? { "Content-Type": contentType } : {})
  };
}

function validateImage(file: File) {
  if (!IMAGE_MIME_TYPES.includes(file.type as (typeof IMAGE_MIME_TYPES)[number])) {
    throw new Error("Formato no permitido. Usa PNG, JPEG o WEBP.");
  }
  if (file.size > IMAGE_MAX_BYTES) {
    throw new Error("La imagen supera el limite de 2MB.");
  }
}

function extensionFor(file: File) {
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  return "jpg";
}

function safeName(prefix: string, file: File) {
  return `${prefix}-${Date.now()}.${extensionFor(file)}`;
}

function encodePath(path: string) {
  return path.split("/").map(encodeURIComponent).join("/");
}

function objectUrl(bucket: ImageBucket, path: string) {
  return `${SUPABASE_URL}/storage/v1/object/${bucket}/${encodePath(path)}`;
}

export function storagePath(bucket: ImageBucket, path: string) {
  return `${bucket}/${path}`;
}

export function splitStoragePath(value: string): { bucket: ImageBucket; path: string } {
  const [bucket, ...pathParts] = value.split("/");
  if (!["company-assets", "user-avatars", "service-images"].includes(bucket) || !pathParts.length) {
    throw new Error("Ruta de Storage invalida.");
  }
  return { bucket: bucket as ImageBucket, path: pathParts.join("/") };
}

async function uploadImage(bucket: ImageBucket, path: string, file: File): Promise<UploadResult> {
  validateImage(file);
  const response = await fetch(objectUrl(bucket, path), {
    method: "PUT",
    headers: {
      ...authHeaders(file.type),
      "x-upsert": "true",
      "cache-control": "3600"
    },
    body: file
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(body.message || "No fue posible cargar la imagen.");
  }
  return { bucket, path, storagePath: storagePath(bucket, path) };
}

export async function createSignedImageUrl(value: string, expiresIn = 3600) {
  const { bucket, path } = splitStoragePath(value);
  const response = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/${bucket}/${encodePath(path)}`, {
    method: "POST",
    headers: authHeaders("application/json"),
    body: JSON.stringify({ expiresIn })
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(body.message || "No fue posible obtener la imagen.");
  }
  const data = await response.json();
  return data.signedURL?.startsWith("http") ? data.signedURL : `${SUPABASE_URL}${data.signedURL}`;
}

export async function deleteImage(value: string) {
  const { bucket, path } = splitStoragePath(value);
  const response = await fetch(objectUrl(bucket, path), {
    method: "DELETE",
    headers: authHeaders()
  });
  if (!response.ok && response.status !== 404) {
    const body = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(body.message || "No fue posible eliminar la imagen.");
  }
}

export async function replaceImage(previousPath: string | null | undefined, next: () => Promise<UploadResult>) {
  const uploaded = await next();
  if (previousPath && previousPath !== uploaded.storagePath) {
    await deleteImage(previousPath).catch(() => undefined);
  }
  return uploaded;
}

export function uploadCompanyLogo(companyId: string, file: File) {
  return uploadImage("company-assets", `${companyId}/logos/${safeName("logo", file)}`, file);
}

export function getCompanyLogoUrl(storageValue: string, expiresIn = 3600) {
  return createSignedImageUrl(storageValue, expiresIn);
}

export function uploadUserAvatar(companyId: string, userId: string, file: File) {
  return uploadImage("user-avatars", `${companyId}/${userId}/${safeName("avatar", file)}`, file);
}

export function getUserAvatarUrl(storageValue: string, expiresIn = 3600) {
  return createSignedImageUrl(storageValue, expiresIn);
}

export function uploadServiceImage(companyId: string, serviceId: string, file: File) {
  return uploadImage("service-images", `${companyId}/${serviceId}/${safeName("service", file)}`, file);
}

export function getServiceImageUrl(storageValue: string, expiresIn = 3600) {
  return createSignedImageUrl(storageValue, expiresIn);
}
