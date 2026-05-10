import { Brain } from "lucide-react";

export function BrainPanel() {
  return (
    <section className="rounded-md border border-line bg-white p-4">
      <div className="mb-3 flex items-center gap-2">
        <Brain size={18} className="text-apex" />
        <h2 className="text-base font-semibold">APEX BRAIN</h2>
      </div>
      <div className="space-y-3 text-sm text-neutral-700">
        <p>Sin alertas críticas por ahora.</p>
        <p className="rounded-md bg-paper p-3">Cuando el negocio genere señales, APEX las convertirá en sugerencias accionables.</p>
      </div>
    </section>
  );
}
