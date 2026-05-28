import { supabaseFetch, supabaseHeaders, supabaseUrl } from "./supabaseClient";

export const IMAGE_MAX_BYTES = 2 * 1024 * 1024;
export const IMAGE_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

type ImageBucket = "company-assets" | "user-avatars" | "service-images";
type DocumentBucket = "user-documents";

type UploadResult = {
  bucket: ImageBucket | DocumentBucket;
  path: string;
  storagePath: string;
};

const USER_DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;
const USER_DOCUMENT_MIME_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/webp"] as const;

function validateImage(file: File) {
  if (!IMAGE_MIME_TYPES.includes(file.type as (typeof IMAGE_MIME_TYPES)[number])) {
    throw new Error("Formato no permitido. Usa PNG, JPEG o WEBP.");
  }
  if (file.size > IMAGE_MAX_BYTES) {
    throw new Error("La imagen supera el limite de 2MB.");
  }
}

function extensionFor(file: File) {
  if (file.type === "application/pdf") return "pdf";
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  return "jpg";
}

function validateUserDocument(file: File) {
  if (!USER_DOCUMENT_MIME_TYPES.includes(file.type as (typeof USER_DOCUMENT_MIME_TYPES)[number])) {
    throw new Error("Formato no permitido. Usa PDF, PNG, JPEG o WEBP.");
  }
  if (file.size > USER_DOCUMENT_MAX_BYTES) {
    throw new Error("El documento supera el limite de 10MB.");
  }
}

function safeName(prefix: string, file: File) {
  return `${prefix}-${Date.now()}.${extensionFor(file)}`;
}

function encodePath(path: string) {
  return path.split("/").map(encodeURIComponent).join("/");
}

function objectUrl(bucket: ImageBucket | DocumentBucket, path: string) {
  return supabaseUrl(`/storage/v1/object/${bucket}/${encodePath(path)}`);
}

export function storagePath(bucket: ImageBucket | DocumentBucket, path: string) {
  return `${bucket}/${path}`;
}

export function splitStoragePath(value: string): { bucket: ImageBucket | DocumentBucket; path: string } {
  const [bucket, ...pathParts] = value.split("/");
  if (!["company-assets", "user-avatars", "service-images", "user-documents"].includes(bucket) || !pathParts.length) {
    throw new Error("Ruta de Storage invalida.");
  }
  return { bucket: bucket as ImageBucket | DocumentBucket, path: pathParts.join("/") };
}

async function uploadImage(bucket: ImageBucket, path: string, file: File): Promise<UploadResult> {
  validateImage(file);
  const response = await fetch(objectUrl(bucket, path), {
    method: "PUT",
    headers: {
      ...supabaseHeaders({ contentType: file.type }),
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
  const data = await supabaseFetch<{ signedURL: string }>(`/storage/v1/object/sign/${bucket}/${encodePath(path)}`, {
    method: "POST",
    body: JSON.stringify({ expiresIn })
  });
  return data.signedURL?.startsWith("http") ? data.signedURL : supabaseUrl(data.signedURL);
}

export async function deleteImage(value: string) {
  const { bucket, path } = splitStoragePath(value);
  const response = await fetch(objectUrl(bucket, path), {
    method: "DELETE",
    headers: supabaseHeaders()
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

export async function uploadUserDocument(companyId: string, userId: string, documentType: string, file: File): Promise<UploadResult> {
  validateUserDocument(file);
  const safeDocumentType = documentType.replace(/[^a-z0-9_-]/gi, "-").toLowerCase() || "internal";
  const responsePath = `${companyId}/${userId}/${safeDocumentType}/${safeName("document", file)}`;
  const response = await fetch(objectUrl("user-documents", responsePath), {
    method: "PUT",
    headers: {
      ...supabaseHeaders({ contentType: file.type }),
      "x-upsert": "true",
      "cache-control": "3600"
    },
    body: file
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(body.message || "No fue posible cargar el documento.");
  }
  return { bucket: "user-documents", path: responsePath, storagePath: storagePath("user-documents", responsePath) };
}

export function getUserDocumentUrl(storageValue: string, expiresIn = 900) {
  return createSignedImageUrl(storageValue, expiresIn);
}
