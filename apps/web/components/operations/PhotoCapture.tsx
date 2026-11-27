"use client";

import { Camera, CheckCircle2, ImagePlus, Loader2, X } from "lucide-react";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
const SOURCE_IMAGE_MAX_BYTES = 8 * 1024 * 1024;
// Techo del canal: es lo que el servidor acepta (`MAX_EVIDENCE_BYTES` via
// `assertSafeFile`) y por eso la foto re-codificada nunca puede pasar de aqui.
const STORAGE_IMAGE_MAX_BYTES = 2 * 1024 * 1024;
const OPTIMIZED_IMAGE_MAX_SIDES = [1600, 1280, 1024, 800];
const JPEG_QUALITY_STEPS = [0.82, 0.72, 0.62, 0.52, 0.42];

export type CapturedFile = {
  base64: string;
  size: number;
  type: string;
  name: string;
  originalSize?: number;
  previewUrl?: string;
  processedAt?: string;
};

// La foto no se descarto a escondidas: sale como un resultado estructurado que
// la pantalla puede convertir en marcacion degradada. `null` sigue significando
// "el usuario no eligio nada", que no es lo mismo que "el telefono no pudo".
export type PhotoUnusableReason = "undecodable" | "too_large" | "encode_failed";

export type PhotoUnusableOutcome = { reason: PhotoUnusableReason; message: string };

// Unica frase que ve el operario cuando la camara entrega algo inutilizable. No
// nombra formatos tecnicos (HEIC, MIME) porque quien la lee esta en una ruta, no
// en un laboratorio; el detalle tecnico sale por `onUnusable` al supervisor.
export const PHOTO_UNUSABLE_COPY = "La foto no se pudo usar en este telefono. Puedes marcar igual: tu hora queda registrada y la foto va a revision del supervisor.";

type Props = {
  label: string;
  required?: boolean;
  capture?: boolean;
  /** `user` abre la camara frontal: es lo que hace que una selfie sea selfie. */
  facing?: "user" | "environment";
  locked?: boolean;
  loading?: boolean;
  progress?: number;
  status?: "idle" | "processing" | "pending" | "uploading" | "uploaded" | "failed";
  value: CapturedFile | null;
  onChange: (file: CapturedFile | null) => void;
  onUnusable?: (outcome: PhotoUnusableOutcome) => void;
};

function isAllowedImageType(type: string): type is (typeof ALLOWED_IMAGE_TYPES)[number] {
  return ALLOWED_IMAGE_TYPES.includes(type as (typeof ALLOWED_IMAGE_TYPES)[number]);
}

function optimizedName(file: File) {
  return file.name.replace(/\.[^.]+$/, "") + ".jpg";
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new window.Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("No fue posible preparar la imagen."));
    };
    image.src = url;
  });
}

// --- El formato real sale de los bytes, nunca de `file.type` ------------------
//
// Incidente del 2026-11-19: la camara de un Android declaraba `image/jpeg` sobre
// un HEIC. El archivo media menos de 2 MB, asi que la version anterior lo dejaba
// intacto y el servidor, que si lee la firma, respondia 400 VALIDACION. La cola
// hacia de ese 400 un bloqueo permanente y la jornada se perdia. Las firmas de
// abajo replican `apps/api/src/security/fileSignature.js` para que cliente y
// servidor discutan el mismo byte.

const IMAGE_SIGNATURES: Array<{ mime: string; minBytes: number; matches: (bytes: Uint8Array) => boolean }> = [
  { mime: "image/jpeg", minBytes: 3, matches: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: "image/png", minBytes: 8, matches: (b) => [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => b[index] === value) },
  { mime: "image/webp", minBytes: 12, matches: (b) => asciiAt(b, 0, 4) === "RIFF" && asciiAt(b, 8, 12) === "WEBP" }
];

// Formatos que el navegador NO va a decodificar casi nunca: son la salida real de
// la camara de muchos telefonos. Nombrarlos permite decirlo en vez de mentir.
const BROWSER_UNDECODABLE_SIGNATURES: Array<{ label: string; minBytes: number; matches: (bytes: Uint8Array) => boolean }> = [
  { label: "HEIC", minBytes: 12, matches: (b) => asciiAt(b, 4, 8) === "ftyp" && ["heic", "heix", "hevc", "heim", "hifm"].includes(asciiAt(b, 8, 12).toLowerCase()) },
  { label: "HEIF", minBytes: 12, matches: (b) => asciiAt(b, 4, 8) === "ftyp" && ["mif1", "msf1"].includes(asciiAt(b, 8, 12).toLowerCase()) },
  { label: "AVIF", minBytes: 12, matches: (b) => asciiAt(b, 4, 8) === "ftyp" && asciiAt(b, 8, 12).toLowerCase() === "avif" },
  { label: "TIFF", minBytes: 4, matches: (b) => (b[0] === 0x49 && b[1] === 0x49 && b[2] === 0x2a && b[3] === 0) || (b[0] === 0x4d && b[1] === 0x4d && b[2] === 0 && b[3] === 0x2a) }
];

function asciiAt(bytes: Uint8Array, start: number, end: number) {
  let text = "";
  for (let index = start; index < end && index < bytes.length; index += 1) text += String.fromCharCode(bytes[index]);
  return text;
}

function leadingBytes(file: Blob, count = 16): Promise<Uint8Array> {
  const slice = typeof file.slice === "function" ? file.slice(0, count) : file;
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(slice);
  });
}

export type SniffedImage = { mime: string; declared: string; formatLabel: string; browserDecodable: boolean };

// Etiqueta derivada del contenido. `declared` se conserva para el diagnostico:
// cuando difieren, la pantalla puede decir cual era la etiqueta falsa.
export async function sniffImageFormat(file: Blob, declaredType = ""): Promise<SniffedImage> {
  const declared = String(declaredType || "").toLowerCase();
  let bytes: Uint8Array;
  try {
    bytes = await leadingBytes(file);
  } catch {
    return { mime: "", declared, formatLabel: "", browserDecodable: false };
  }
  const signature = IMAGE_SIGNATURES.find((entry) => bytes.length >= entry.minBytes && entry.matches(bytes));
  if (signature) return { mime: signature.mime, declared, formatLabel: signature.mime, browserDecodable: true };
  const exotic = BROWSER_UNDECODABLE_SIGNATURES.find((entry) => bytes.length >= entry.minBytes && entry.matches(bytes));
  if (exotic) return { mime: `image/${exotic.label.toLowerCase()}`, declared, formatLabel: exotic.label, browserDecodable: false };
  return { mime: "", declared, formatLabel: "", browserDecodable: false };
}

async function toJpegFile(file: File, name: string) {
  const image = await loadImage(file);
  let lastBlob: Blob | null = null;

  for (const maxSide of OPTIMIZED_IMAGE_MAX_SIDES) {
    const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("No fue posible optimizar la imagen.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    for (const quality of JPEG_QUALITY_STEPS) {
      const blob = await canvasToBlob(canvas, quality);
      if (!blob) continue;
      lastBlob = blob;
      // Siempre JPEG y siempre por debajo del techo del canal: etiqueta y bytes
      // salen del mismo render, asi que ya no pueden contradecirse.
      if (blob.size <= STORAGE_IMAGE_MAX_BYTES) {
        return new File([blob], name, { type: "image/jpeg" });
      }
    }
  }

  if (lastBlob && lastBlob.size <= STORAGE_IMAGE_MAX_BYTES) {
    return new File([lastBlob], name, { type: "image/jpeg" });
  }
  throw new Error("No fue posible optimizar la imagen.");
}

export type PreparedPhoto =
  | { ok: true; file: CapturedFile }
  | { ok: false; reason: PhotoUnusableReason; message: string };

// Un solo punto de verdad para "esta foto sirve o no". Se exporta porque la
// pantalla de marcacion lo necesita cuando la camara entrega algo que el
// navegador no decodifica: ahi no hay callejon sin salida, hay marcacion degradada.
export async function prepareCapturedPhoto(file: File): Promise<PreparedPhoto> {
  if (file.size > SOURCE_IMAGE_MAX_BYTES) {
    return { ok: false, reason: "too_large", message: "La imagen supera 8 MB." };
  }
  const sniffed = await sniffImageFormat(file, file.type);
  if (!sniffed.browserDecodable) {
    return {
      ok: false,
      reason: "undecodable",
      message: sniffed.formatLabel
        ? `Este telefono guardo la foto en ${sniffed.formatLabel} y este navegador no puede usarla.`
        : "Este telefono guardo una foto que este navegador no puede usar."
    };
  }
  // Si el navegador SI puede decodificarla, SIEMPRE se re-codifica a JPEG. Aqui
  // cae el caso que antes escapaba: PNG etiquetado como JPEG por debajo de 2 MB
  // que salia con la etiqueta falsa y el servidor rechazaba.
  let encoded: File;
  try {
    encoded = await toJpegFile(file, optimizedName(file));
  } catch {
    return { ok: false, reason: "encode_failed", message: "No fue posible preparar la imagen. Intenta con otra foto." };
  }
  try {
    return { ok: true, file: await readFile(encoded, file.size) };
  } catch {
    return { ok: false, reason: "encode_failed", message: "No fue posible preparar la imagen. Intenta con otra foto." };
  }
}

async function readFile(file: File, originalSize = file.size): Promise<CapturedFile> {
  return new Promise<CapturedFile>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({
      base64: String(reader.result || ""),
      size: file.size,
      type: file.type,
      name: file.name,
      originalSize,
      processedAt: new Date().toISOString()
    });
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function PhotoCapture({ label, required, capture = true, facing = "environment", locked = false, loading = false, progress, status = "idle", value, onChange, onUnusable }: Props) {
  const cameraRef = useRef<HTMLInputElement | null>(null);
  const [error, setError] = useState("");
  const [localPreview, setLocalPreview] = useState("");
  const visibleStatus = loading ? "uploading" : status;
  // La previa solo existe sobre una foto que el navegador puede leer. Pintar la
  // miniatura de un archivo que el servidor va a rechazar es exactamente la
  // mentira que costo la jornada del incidente.
  const previewSrc = value?.previewUrl || value?.base64 || localPreview;

  useEffect(() => () => {
    if (localPreview) URL.revokeObjectURL(localPreview);
  }, [localPreview]);

  async function select(file?: File) {
    if (!file) return;
    setError("");
    const prepared = await prepareCapturedPhoto(file);
    // El narrowing tiene que ser explicito sobre la marca `ok`: con `if (!prepared.ok)`
    // TypeScript no estrecha el union porque `file` es opcional en la rama negativa.
    if (prepared.ok !== true) {
      setError(PHOTO_UNUSABLE_COPY);
      onUnusable?.({ reason: prepared.reason, message: prepared.message });
      return;
    }
    if (!isAllowedImageType(prepared.file.type)) {
      setError(PHOTO_UNUSABLE_COPY);
      onUnusable?.({ reason: "undecodable", message: `El navegador devolvio ${prepared.file.type || "un formato desconocido"}.` });
      return;
    }
    let previewUrl = "";
    try {
      const blob = await (await fetch(prepared.file.base64)).blob();
      previewUrl = URL.createObjectURL(blob);
    } catch {
      previewUrl = "";
    }
    setLocalPreview((current) => {
      if (current) URL.revokeObjectURL(current);
      return previewUrl;
    });
    onChange(previewUrl ? { ...prepared.file, previewUrl } : prepared.file);
  }

  function clear() {
    setLocalPreview((current) => {
      if (current) URL.revokeObjectURL(current);
      return "";
    });
    onChange(null);
  }

  return (
    <div className="min-w-0 rounded-md border border-line bg-white p-3 shadow-sm">
      <div className="mb-2 flex min-w-0 items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="break-words text-sm font-semibold leading-5">{label}{required ? " *" : ""}</p>
          <p className="text-xs text-neutral-500">Hasta 8 MB. La foto se guarda en JPG para que el sistema la acepte.</p>
        </div>
        {value ? (
          <button className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-neutral-500 hover:bg-paper disabled:opacity-50" disabled={loading} onClick={clear} type="button" aria-label="Quitar evidencia"><X size={18} /></button>
        ) : null}
      </div>
      {locked ? (
        <div className="flex min-h-24 items-center justify-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 text-center text-sm font-semibold text-emerald-800">
          <CheckCircle2 size={20} />
          Evidencia registrada
        </div>
      ) : (
        <>
      <input
        accept="image/jpeg,image/png,image/webp"
        capture={capture ? facing : undefined}
        className="hidden"
        ref={cameraRef}
        type="file"
        onChange={(event) => select(event.target.files?.[0])}
      />
      {value || localPreview ? (
        <div className="space-y-2">
          <div className="relative overflow-hidden rounded-md border border-line bg-paper">
            {previewSrc ? <Image alt={label} className="aspect-[4/3] w-full object-cover" height={480} src={previewSrc} unoptimized width={640} /> : null}
            {visibleStatus === "uploading" ? (
              <div className="absolute inset-0 flex items-center justify-center bg-white/75 text-sm font-semibold text-apex backdrop-blur-sm">
                <Loader2 className="mr-2 animate-spin" size={18} /> Guardando evidencia
              </div>
            ) : null}
          </div>
          {visibleStatus === "uploading" ? (
            <div className="h-2 overflow-hidden rounded-full bg-paper">
              <div className="h-full rounded-full bg-apex transition-all" style={{ width: `${Math.min(Math.max(progress ?? 35, 8), 95)}%` }} />
            </div>
          ) : null}
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
            <p className="min-w-0 break-words text-xs text-neutral-500">
              {value ? `${value.name} - ${Math.round(value.size / 1024)} KB${value.originalSize ? ` optimizada desde ${Math.round(value.originalSize / 1024)} KB` : ""}` : "Preparando vista previa..."}
            </p>
            <button className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-semibold text-neutral-700 hover:bg-paper disabled:opacity-50 sm:w-auto" disabled={loading} onClick={() => cameraRef.current?.click()} type="button">
              <ImagePlus size={16} /> Cambiar
            </button>
          </div>
          {visibleStatus === "pending" ? <p className="text-xs font-semibold text-amber-700">Pendiente de guardar.</p> : null}
          {visibleStatus === "uploaded" ? <p className="text-xs font-semibold text-emerald-700">Evidencia registrada.</p> : null}
          {visibleStatus === "failed" ? <p className="text-xs font-semibold text-red-700">Fallo la carga. Conserva la foto y reintenta.</p> : null}
        </div>
      ) : (
        <button className="flex min-h-36 w-full flex-col items-center justify-center gap-2 rounded-md border border-dashed border-line bg-paper px-3 py-5 text-center text-base font-semibold text-neutral-700 hover:border-apex hover:text-apex disabled:opacity-50" disabled={loading} onClick={() => cameraRef.current?.click()} type="button">
          {loading ? <Loader2 className="animate-spin" size={28} /> : <Camera size={28} />}
          {loading ? "Procesando..." : facing === "user" ? "Tomar selfie" : "Tomar foto"}
          <span className="text-xs font-medium text-neutral-500">{facing === "user" ? "Abre la camara frontal" : "Abre la camara del dispositivo"}</span>
        </button>
      )}
      {error ? <p className="mt-2 text-xs font-semibold text-red-700">{error}</p> : null}
        </>
      )}
    </div>
  );
}
