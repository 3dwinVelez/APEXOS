"use client";

import { Camera, ImagePlus, Loader2, X } from "lucide-react";
import { useRef, useState } from "react";

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

function readFile(file: File) {
  return new Promise<CapturedFile>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ base64: String(reader.result || ""), size: file.size, type: file.type, name: file.name });
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function PhotoCapture({ label, required, capture = true, loading = false, value, onChange }: Props) {
  const cameraRef = useRef<HTMLInputElement | null>(null);
  const [error, setError] = useState("");

  async function select(file?: File) {
    if (!file) return;
    setError("");
    if (!file.type.startsWith("image/")) {
      setError("Selecciona una imagen valida.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError("La imagen supera 8 MB.");
      return;
    }
    try {
      onChange(await readFile(file));
    } catch {
      setError("No fue posible leer la imagen. Intenta con otro archivo.");
    }
  }

  return (
    <div className="min-w-0 rounded-md border border-line bg-white p-3 shadow-sm">
      <div className="mb-2 flex min-w-0 items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="break-words text-sm font-semibold leading-5">{label}{required ? " *" : ""}</p>
          <p className="text-xs text-neutral-500">Imagen JPG/PNG/WEBP hasta 8 MB.</p>
        </div>
        {value ? (
          <button className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-neutral-500 hover:bg-paper disabled:opacity-50" disabled={loading} onClick={() => onChange(null)} type="button" aria-label="Quitar evidencia"><X size={18} /></button>
        ) : null}
      </div>
      <input
        accept="image/*"
        capture={capture ? "environment" : undefined}
        className="hidden"
        ref={cameraRef}
        type="file"
        onChange={(event) => select(event.target.files?.[0])}
      />
      {value ? (
        <div className="space-y-2">
          <div className="relative overflow-hidden rounded-md border border-line bg-paper">
            <img alt={label} className="aspect-[4/3] w-full object-cover" src={value.base64} />
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
