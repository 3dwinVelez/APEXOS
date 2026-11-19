"use client";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-paper p-4">
      <div className="w-full max-w-xl rounded-md border border-red-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold text-red-700">Operacion recuperable</p>
        <h1 className="mt-2 text-2xl font-semibold text-neutral-900">La plataforma evito un bloqueo completo.</h1>
        <p className="mt-3 text-sm text-neutral-700">Se registro lo que paso para que soporte pueda revisarlo. Puedes reintentar la operacion sin reiniciar toda la plataforma y tu informacion no se pierde.</p>
        {error.digest ? <p className="mt-4 rounded-md bg-paper px-3 py-2 text-xs text-neutral-700">Si el problema continua, menciona esta referencia al reintentar: {error.digest}.</p> : null}
        <button className="mt-5 inline-flex h-11 items-center justify-center rounded-md bg-apex px-4 text-sm font-semibold text-white" onClick={() => reset()} type="button">Reintentar</button>
      </div>
    </main>
  );
}
