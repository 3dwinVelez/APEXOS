"use client";

import { Check, PenLine, RotateCcw, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { CapturedFile } from "./PhotoCapture";

type Props = {
  label?: string;
  required?: boolean;
  value: CapturedFile | null;
  onChange: (file: CapturedFile | null) => void;
};

function pointerPosition(event: React.PointerEvent<HTMLCanvasElement>, canvas: HTMLCanvasElement) {
  const rect = canvas.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

export function SignatureCapture({ label = "Firma del cliente", required, value, onChange }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [hasStroke, setHasStroke] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.max(Math.floor(rect.width * ratio), 1);
    canvas.height = Math.max(Math.floor(rect.height * ratio), 1);
    const context = canvas.getContext("2d");
    if (!context) return;
    context.scale(ratio, ratio);
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = 2.4;
    context.strokeStyle = "#1E293B";
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, rect.width, rect.height);
    if (value?.base64) {
      const image = new Image();
      image.onload = () => {
        context.drawImage(image, 0, 0, rect.width, rect.height);
        setHasStroke(true);
      };
      image.src = value.base64;
    } else {
      setHasStroke(false);
    }
  }, [value?.base64]);

  function start(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context || value) return;
    canvas.setPointerCapture(event.pointerId);
    const point = pointerPosition(event, canvas);
    context.beginPath();
    context.moveTo(point.x, point.y);
    setDrawing(true);
  }

  function move(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!drawing || !canvas || !context || value) return;
    event.preventDefault();
    const point = pointerPosition(event, canvas);
    context.lineTo(point.x, point.y);
    context.stroke();
    setHasStroke(true);
  }

  function stop() {
    setDrawing(false);
  }

  function clear() {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const rect = canvas.getBoundingClientRect();
    context.clearRect(0, 0, rect.width, rect.height);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, rect.width, rect.height);
    setHasStroke(false);
    onChange(null);
  }

  function confirm() {
    const canvas = canvasRef.current;
    if (!canvas || !hasStroke) return;
    const base64 = canvas.toDataURL("image/png");
    onChange({
      base64,
      size: Math.round((base64.length * 3) / 4),
      type: "image/png",
      name: "firma_cliente.png"
    });
  }

  return (
    <div className="rounded-md border border-line bg-white p-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">{label}{required ? " *" : ""}</p>
        <div className="flex gap-2">
          {hasStroke || value ? (
            <button className="inline-flex h-10 items-center gap-1 rounded-md border border-line px-3 text-xs font-semibold hover:bg-paper" onClick={clear} type="button">
              <RotateCcw size={14} />
              Limpiar
            </button>
          ) : null}
          {hasStroke && !value ? (
            <button className="inline-flex h-10 items-center gap-1 rounded-md bg-apex px-3 text-xs font-semibold text-white" onClick={confirm} type="button">
              <Check size={14} />
              Confirmar
            </button>
          ) : null}
        </div>
      </div>

      <div className={`relative rounded-md border-2 p-2 ${value ? "border-emerald-300 bg-emerald-50" : required && !hasStroke ? "border-dashed border-amber-300 bg-amber-50/50" : "border-dashed border-line bg-paper"}`}>
        <canvas
          ref={canvasRef}
          className="h-48 w-full rounded-md bg-white touch-none"
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={stop}
          onPointerCancel={stop}
          onPointerLeave={stop}
        />
        {!hasStroke && !value ? (
          <div className="pointer-events-none absolute inset-2 flex flex-col items-center justify-center rounded-md text-center text-sm text-neutral-500">
            <PenLine className="mb-2 text-apex" size={30} />
            Firma aqui con el dedo
          </div>
        ) : null}
        {value ? (
          <div className="absolute right-4 top-4 inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2 py-1 text-xs font-semibold text-white">
            <Check size={13} />
            Firmado
          </div>
        ) : null}
      </div>

      {!value ? (
        <p className="mt-2 text-xs font-semibold text-amber-800">La firma debe confirmarse antes de cerrar el servicio.</p>
      ) : (
        <button className="mt-2 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-red-200 text-sm font-semibold text-red-700 hover:bg-red-50" onClick={clear} type="button">
          <X size={15} />
          Repetir firma
        </button>
      )}
    </div>
  );
}
