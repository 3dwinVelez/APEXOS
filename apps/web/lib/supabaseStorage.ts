import { supabaseFetch, supabaseHeaders, supabaseUrl } from "./supabaseClient";
import { inspectFileSignature, type AllowedFileMime } from "./fileSignature";

export const IMAGE_MAX_BYTES = 2 * 1024 * 1024;
export const IMAGE_MAX_DIMENSION = 4096;
export const IMAGE_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

type ImageBucket = "company-assets" | "user-avatars" | "service-images";
type DocumentBucket = "user-documents";

type UploadResult = {
  bucket: ImageBucket | DocumentBucket;
  path: string;
  storagePath: string;
};

type EncodedImage = {
  base64: string;
  name: string;
  type: string;
};

type AuthorizedUpload = {
  signed_upload_url: string;
  path: string;
};

const USER_DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;
const USER_DOCUMENT_MIME_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/webp"] as const;

async function validateImage(file: File): Promise<AllowedFileMime> {
  if (!file.size) throw new Error("La imagen esta vacia.");
  if (!IMAGE_MIME_TYPES.includes(file.type as (typeof IMAGE_MIME_TYPES)[number])) {
    throw new Error("Formato no permitido. Usa PNG, JPEG o WEBP.");
  }
  if (file.size > IMAGE_MAX_BYTES) {
    throw new Error("La imagen supera el limite de 2MB.");
  }
  const detectedMime = await inspectFileSignature(file);
  if (!detectedMime || detectedMime !== file.type || !IMAGE_MIME_TYPES.includes(detectedMime as (typeof IMAGE_MIME_TYPES)[number])) {
    throw new Error("El contenido de la imagen no coincide con su formato.");
  }
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) throw new Error("La imagen esta truncada o no puede decodificarse.");
  const exceedsDimensions = bitmap.width > IMAGE_MAX_DIMENSION || bitmap.height > IMAGE_MAX_DIMENSION;
  bitmap.close();
  if (exceedsDimensions) throw new Error(`La imagen supera ${IMAGE_MAX_DIMENSION}px por lado.`);
  return detectedMime;
}

function extensionFor(mime: AllowedFileMime) {
  if (mime === "application/pdf") return "pdf";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "jpg";
}

async function validateUserDocument(file: File): Promise<AllowedFileMime> {
  if (!file.size) throw new Error("El documento esta vacio.");
  if (!USER_DOCUMENT_MIME_TYPES.includes(file.type as (typeof USER_DOCUMENT_MIME_TYPES)[number])) {
    throw new Error("Formato no permitido. Usa PDF, PNG, JPEG o WEBP.");
  }
  if (file.size > USER_DOCUMENT_MAX_BYTES) {
    throw new Error("El documento supera el limite de 10MB.");
  }
  const detectedMime = await inspectFileSignature(file);
  if (!detectedMime || detectedMime !== file.type || !USER_DOCUMENT_MIME_TYPES.includes(detectedMime)) {
    throw new Error("El contenido del documento no coincide con su formato.");
  }
  if (detectedMime !== "application/pdf") {
    const bitmap = await createImageBitmap(file).catch(() => null);
    if (!bitmap) throw new Error("La imagen esta truncada o no puede decodificarse.");
    const exceedsDimensions = bitmap.width > IMAGE_MAX_DIMENSION || bitmap.height > IMAGE_MAX_DIMENSION;
    bitmap.close();
    if (exceedsDimensions) throw new Error(`La imagen supera ${IMAGE_MAX_DIMENSION}px por lado.`);
  }
  return detectedMime;
}

function safeName(prefix: string, mime: AllowedFileMime) {
  return `${prefix}-${Date.now()}-${crypto.randomUUID()}.${extensionFor(mime)}`;
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

async function uploadImage(bucket: ImageBucket, path: string, file: File, validatedMime?: AllowedFileMime): Promise<UploadResult> {
  if (!validatedMime) await validateImage(file);
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
  if (data.signedURL?.startsWith("http")) return data.signedURL;
  const signedPath = data.signedURL?.startsWith("/object/")
    ? `/storage/v1${data.signedURL}`
    : data.signedURL;
  return supabaseUrl(signedPath);
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

export async function uploadCompanyLogo(companyId: string, file: File) {
  const mime = await validateImage(file);
  return uploadImage("company-assets", `${companyId}/logos/${safeName("logo", mime)}`, file, mime);
}

export function getCompanyLogoUrl(storageValue: string, expiresIn = 3600) {
  return createSignedImageUrl(storageValue, expiresIn);
}

export async function uploadUserAvatar(companyId: string, userId: string, file: File) {
  const mime = await validateImage(file);
  return uploadImage("user-avatars", `${companyId}/${userId}/${safeName("avatar", mime)}`, file, mime);
}

export function getUserAvatarUrl(storageValue: string, expiresIn = 3600) {
  return createSignedImageUrl(storageValue, expiresIn);
}

export async function uploadServiceImage(companyId: string, serviceId: string, file: File) {
  const mime = await validateImage(file);
  return uploadImage("service-images", `${companyId}/${serviceId}/${safeName("service", mime)}`, file, mime);
}

export function uploadServiceImageData(companyId: string, serviceId: string, image: EncodedImage) {
  const match = image.base64.match(/^data:([^;,]+);base64,(.+)$/);
  if (!match) throw new Error("La evidencia no contiene una imagen base64 valida.");
  const bytes = Uint8Array.from(atob(match[2]), (character) => character.charCodeAt(0));
  const file = new File([bytes], image.name || "evidencia.jpg", { type: image.type || match[1] });
  return uploadServiceImage(companyId, serviceId, file);
}

export async function uploadAuthorizedServiceImageData(authorization: AuthorizedUpload, image: EncodedImage) {
  const match = image.base64.match(/^data:([^;,]+);base64,(.+)$/);
  if (!match) throw new Error("La evidencia no contiene una imagen base64 valida.");
  const bytes = Uint8Array.from(atob(match[2]), (character) => character.charCodeAt(0));
  const file = new File([bytes], image.name || "evidencia.jpg", { type: image.type || match[1] });
  await validateImage(file);
  const signedPath = authorization.signed_upload_url.startsWith("/object/")
    ? `/storage/v1${authorization.signed_upload_url}`
    : authorization.signed_upload_url;
  const uploadUrl = signedPath.startsWith("http") ? signedPath : supabaseUrl(signedPath);
  const response = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type, "x-upsert": "false" },
    body: file
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(body.message || "Storage rechazo la carga preautorizada.");
  }
  return { bucket: "service-images" as const, path: authorization.path, storagePath: storagePath("service-images", authorization.path) };
}

export function getServiceImageUrl(storageValue: string, expiresIn = 3600) {
  return createSignedImageUrl(storageValue, expiresIn);
}

export async function uploadUserDocument(companyId: string, userId: string, documentType: string, file: File): Promise<UploadResult> {
  const mime = await validateUserDocument(file);
  const safeDocumentType = documentType.replace(/[^a-z0-9_-]/gi, "-").toLowerCase() || "internal";
  const responsePath = `${companyId}/${userId}/${safeDocumentType}/${safeName("document", mime)}`;
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
