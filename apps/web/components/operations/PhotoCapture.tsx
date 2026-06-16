"use client";

import { Camera, ImagePlus, Loader2, X } from "lucide-react";
import Image from "next/image";
import { useRef, useState } from "react";

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
const SOURCE_IMAGE_MAX_BYTES = 8 * 1024 * 1024;
const STORAGE_IMAGE_MAX_BYTES = 2 * 1024 * 1024;
const OPTIMIZED_IMAGE_MAX_SIDES = [1600, 1280, 1024, 800];
const JPEG_QUALITY_STEPS = [0.82, 0.72, 0.62, 0.52, 0.42];

export type CapturedFile = {
  base64: string;
  size: number;
  type: string;
  name: string;
};

type Props = {
  label: string;
  required?: boolean;
  capture?: boolean;
  loading?: boolean;
  value: CapturedFile | null;
  onChange: (file: CapturedFile | null) => void;
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

async function optimizeForStorage(file: File) {
  if (file.size <= STORAGE_IMAGE_MAX_BYTES) return file;
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
      if (blob.size <= STORAGE_IMAGE_MAX_BYTES) {
        return new File([blob], optimizedName(file), { type: "image/jpeg" });
      }
    }
  }

  if (lastBlob && lastBlob.size <= STORAGE_IMAGE_MAX_BYTES) {
    return new File([lastBlob], optimizedName(file), { type: "image/jpeg" });
  }
  throw new Error("No fue posible optimizar la imagen.");
}

async function readFile(file: File) {
  const optimized = await optimizeForStorage(file);
  return new Promise<CapturedFile>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ base64: String(reader.result || ""), size: optimized.size, type: optimized.type, name: optimized.name });
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(optimized);
  });
}

export function PhotoCapture({ label, required, capture = true, loading = false, value, onChange }: Props) {
  const cameraRef = useRef<HTMLInputElement | null>(null);
  const [error, setError] = useState("");

  async function select(file?: File) {
    if (!file) return;
    setError("");
    if (!isAllowedImageType(file.type)) {
      setError("Selecciona una imagen JPG, PNG o WEBP.");
      return;
    }
    if (file.size > SOURCE_IMAGE_MAX_BYTES) {
      setError("La imagen supera 8 MB.");
      return;
    }
    try {
      onChange(await readFile(file));
    } catch {
      setError("No fue posible preparar la imagen. Intenta con otra foto.");
    }
  }

  return (
    <div className="min-w-0 rounded-md border border-line bg-white p-3 shadow-sm">
      <div className="mb-2 flex min-w-0 items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="break-words text-sm font-semibold leading-5">{label}{required ? " *" : ""}</p>
          <p className="text-xs text-neutral-500">JPG/PNG/WEBP hasta 8 MB. Se optimiza para guardar.</p>
        </div>
        {value ? (
          <button className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-neutral-500 hover:bg-paper disabled:opacity-50" disabled={loading} onClick={() => onChange(null)} type="button" aria-label="Quitar evidencia"><X size={18} /></button>
        ) : null}
      </div>
      <input
        accept="image/jpeg,image/png,image/webp"
        capture={capture ? "environment" : undefined}
        className="hidden"
        ref={cameraRef}
        type="file"
        onChange={(event) => select(event.target.files?.[0])}
      />
      {value ? (
        <div className="space-y-2">
          <div className="relative overflow-hidden rounded-md border border-line bg-paper">
            <Image alt={label} className="aspect-[4/3] w-full object-cover" height={480} src={value.base64} unoptimized width={640} />
            {loading ? (
              <div className="absolute inset-0 flex items-center justify-center bg-white/75 text-sm font-semibold text-apex backdrop-blur-sm">
                <Loader2 className="mr-2 animate-spin" size={18} /> Guardando evidencia
              </div>
            ) : null}
          </div>
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
            <p className="min-w-0 break-words text-xs text-neutral-500">{value.name} - {Math.round(value.size / 1024)} KB</p>
            <button className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-semibold text-neutral-700 hover:bg-paper disabled:opacity-50 sm:w-auto" disabled={loading} onClick={() => cameraRef.current?.click()} type="button">
              <ImagePlus size={16} /> Cambiar
            </button>
          </div>
        </div>
      ) : (
        <button className="flex min-h-36 w-full flex-col items-center justify-center gap-2 rounded-md border border-dashed border-line bg-paper px-3 py-5 text-center text-base font-semibold text-neutral-700 hover:border-apex hover:text-apex disabled:opacity-50" disabled={loading} onClick={() => cameraRef.current?.click()} type="button">
          {loading ? <Loader2 className="animate-spin" size={28} /> : <Camera size={28} />}
          {loading ? "Procesando..." : "Tomar foto"}
          <span className="text-xs font-medium text-neutral-500">Abre la camara del dispositivo</span>
        </button>
      )}
      {error ? <p className="mt-2 text-xs font-semibold text-red-700">{error}</p> : null}
    </div>
  );
}
