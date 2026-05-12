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
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [error, setError] = useState("");

  async function select(file?: File) {
    if (!file) return;
    setError("");
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Selecciona una imagen valida.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError("La imagen supera 8 MB.");
      return;
    }
    onChange(await readFile(file));
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
        ref={inputRef}
        type="file"
        onChange={(event) => select(event.target.files?.[0])}
      />
      {value ? (
        <div className="space-y-2">
          <img alt={label} className="max-h-52 w-full rounded-md object-cover" src={value.base64} />
          <p className="text-xs text-neutral-500">{value.name} · {Math.round(value.size / 1024)} KB</p>
        </div>
      ) : (
        <button className="flex min-h-28 w-full flex-col items-center justify-center gap-2 rounded-md border border-dashed border-line bg-paper text-sm font-semibold text-neutral-600 hover:border-apex hover:text-apex" onClick={() => inputRef.current?.click()} type="button">
          {capture ? <Camera size={22} /> : <FileUp size={22} />}
          Abrir camara o cargar archivo
        </button>
      )}
      {error ? <p className="mt-2 text-xs font-semibold text-red-700">{error}</p> : null}
    </div>
  );
}
