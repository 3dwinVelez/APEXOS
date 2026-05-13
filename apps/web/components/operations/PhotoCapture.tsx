"use client";

import { Camera, FileUp, X } from "lucide-react";
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
  const fileRef = useRef<HTMLInputElement | null>(null);
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
    <div className="rounded-md border border-line bg-white p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">{label}{required ? " *" : ""}</p>
        {value ? (
          <button className="rounded-md p-1 text-neutral-500 hover:bg-paper" onClick={() => onChange(null)} type="button" aria-label="Quitar evidencia"><X size={15} /></button>
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
      <input
        accept="image/*"
        className="hidden"
        ref={fileRef}
        type="file"
        onChange={(event) => select(event.target.files?.[0])}
      />
      {value ? (
        <div className="space-y-2">
          <img alt={label} className="max-h-52 w-full rounded-md object-cover" src={value.base64} />
          <p className="text-xs text-neutral-500">{value.name} - {Math.round(value.size / 1024)} KB</p>
        </div>
      ) : (
        <div className="grid min-h-28 gap-2 sm:grid-cols-2">
          {capture ? (
            <button className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed border-line bg-paper px-3 py-5 text-sm font-semibold text-neutral-600 hover:border-apex hover:text-apex" onClick={() => cameraRef.current?.click()} type="button">
              <Camera size={22} />
              Tomar foto
            </button>
          ) : null}
          <button className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed border-line bg-paper px-3 py-5 text-sm font-semibold text-neutral-600 hover:border-apex hover:text-apex" onClick={() => fileRef.current?.click()} type="button">
            <FileUp size={22} />
            Cargar archivo
          </button>
        </div>
      )}
      {error ? <p className="mt-2 text-xs font-semibold text-red-700">{error}</p> : null}
    </div>
  );
}
