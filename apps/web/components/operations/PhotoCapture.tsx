"use client";

import { Camera, X } from "lucide-react";
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

export function PhotoCapture({ label, required, capture = true, value, onChange }: Props) {
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
    <div className="rounded-md border border-line bg-white p-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">{label}{required ? " *" : ""}</p>
        {value ? (
          <button className="flex h-11 w-11 items-center justify-center rounded-md text-neutral-500 hover:bg-paper" onClick={() => onChange(null)} type="button" aria-label="Quitar evidencia"><X size={18} /></button>
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
          <img alt={label} className="max-h-64 w-full rounded-md object-cover" src={value.base64} />
          <p className="text-xs text-neutral-500">{value.name} - {Math.round(value.size / 1024)} KB</p>
        </div>
      ) : (
        <button className="flex min-h-32 w-full flex-col items-center justify-center gap-2 rounded-md border border-dashed border-line bg-paper px-3 py-5 text-base font-semibold text-neutral-700 hover:border-apex hover:text-apex" onClick={() => cameraRef.current?.click()} type="button">
          <Camera size={28} />
          Tomar foto
          <span className="text-xs font-medium text-neutral-500">Abre la camara del dispositivo</span>
        </button>
      )}
      {error ? <p className="mt-2 text-xs font-semibold text-red-700">{error}</p> : null}
    </div>
  );
}
