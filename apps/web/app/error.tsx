"use client";

import { useEffect } from "react";
import { notifyPlatform } from "@/lib/platformAlerts";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    notifyPlatform({
      level: "error",
      title: "Fallo controlado en pantalla",
      message: "La interfaz detecto un error y activo una recuperacion segura.",
      technical: error.message,
      source: "frontend",
      sticky: true
    });
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-paper p-4">
      <div className="w-full max-w-xl rounded-md border border-red-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold text-red-700">Operacion recuperable</p>
        <h1 className="mt-2 text-2xl font-semibold text-neutral-900">La plataforma evito un bloqueo completo.</h1>
        <p className="mt-3 text-sm text-neutral-700">Se registro una alerta tecnica con el detalle del fallo para soporte. Puedes reintentar la operacion sin reiniciar toda la plataforma.</p>
        <p className="mt-4 rounded-md bg-paper px-3 py-2 text-xs text-neutral-700">{error.message || "Error de interfaz no identificado."}</p>
        <button className="mt-5 inline-flex h-11 items-center justify-center rounded-md bg-apex px-4 text-sm font-semibold text-white" onClick={() => reset()} type="button">Reintentar</button>
      </div>
    </main>
  );
}
