"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { CxcNav } from "@/components/cxc-nav";

type Retention = { id: number; code: string; description: string; account_code: string; percent: number; concept?: string; retention_type: string; minimum_base: number; base_type: string; active: boolean };

export default function RetencionesPage() {
  const [retenciones, setRetenciones] = useState<Retention[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ code: "", description: "", account_code: "135515", percent: 2.5, concept: "", retention_type: "retefuente", minimum_base: 0, base_type: "subtotal", scope: "sales", active: true });

  function load() {
    setLoading(true);
    api<Retention[]>("/api/v1/accounts-receivable/retentions")
      .then((res) => setRetenciones(res || []))
      .catch(() => setRetenciones([]))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  async function handleInit() {
    if (!confirm("¿Inicializar retenciones por defecto?")) return;
    try {
      await api("/api/v1/accounts-receivable/retentions/init", { method: "POST" });
      setOk("Retenciones inicializadas");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setOk("");
    try {
      const res = await api<Retention>("/api/v1/accounts-receivable/retentions", {
        method: "POST",
        body: JSON.stringify(form)
      });
      setOk(`Retención ${res.code} creada`);
      setShowForm(false);
      setForm({ code: "", description: "", account_code: "135515", percent: 2.5, concept: "", retention_type: "retefuente", minimum_base: 0, base_type: "subtotal", scope: "sales", active: true });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-semibold">Maestro de retenciones</h1>
      <CxcNav />
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {ok ? <p className="text-sm text-emerald-700">{ok}</p> : null}
      <div className="flex gap-3">
        <button className="h-10 rounded-md bg-apex px-4 text-sm text-white" onClick={() => setShowForm(!showForm)}>
          + Nueva retención
        </button>
        <button className="h-10 rounded-md border border-line px-4 text-sm" onClick={handleInit}>
          Inicializar por defecto
        </button>
      </div>

      {showForm && (
        <form className="rounded-lg border border-line bg-white p-4 space-y-3" onSubmit={handleSubmit}>
          <div className="grid gap-3 md:grid-cols-3">
            <input className="h-10 rounded-md border border-line px-3 text-sm" placeholder="Código *" value={form.code} onChange={(e) => setForm((p) => ({ ...p, code: e.target.value.toUpperCase() }))} required />
            <input className="h-10 rounded-md border border-line px-3 text-sm" placeholder="Descripción *" value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} required />
            <input className="h-10 rounded-md border border-line px-3 text-sm" placeholder="Cuenta contable *" value={form.account_code} onChange={(e) => setForm((p) => ({ ...p, account_code: e.target.value }))} required />
            <select className="h-10 rounded-md border border-line px-3 text-sm" value={form.retention_type} onChange={(e) => setForm((p) => ({ ...p, retention_type: e.target.value }))}>
              <option value="retefuente">ReteFuente</option>
              <option value="reteiva">ReteIVA</option>
              <option value="reteica">ReteICA</option>
            </select>
            <input className="h-10 rounded-md border border-line px-3 text-sm" type="number" step="0.01" placeholder="Porcentaje *" value={form.percent} onChange={(e) => setForm((p) => ({ ...p, percent: Number(e.target.value) }))} required />
            <input className="h-10 rounded-md border border-line px-3 text-sm" type="number" min={0} step="0.01" placeholder="Base minima" value={form.minimum_base} onChange={(e) => setForm((p) => ({ ...p, minimum_base: Number(e.target.value) }))} />
            <select className="h-10 rounded-md border border-line px-3 text-sm" value={form.base_type} onChange={(e) => setForm((p) => ({ ...p, base_type: e.target.value }))}>
              <option value="subtotal">Base subtotal</option>
              <option value="iva">Base IVA</option>
            </select>
            <input className="h-10 rounded-md border border-line px-3 text-sm" placeholder="Concepto (opcional)" value={form.concept} onChange={(e) => setForm((p) => ({ ...p, concept: e.target.value }))} />
          </div>
          <button className="h-10 rounded-md bg-apex px-4 text-sm text-white" type="submit">Guardar</button>
        </form>
      )}

      {loading ? <p className="text-sm text-neutral-500">Cargando...</p> : retenciones.length === 0 ? <p className="text-sm text-neutral-500">No hay retenciones configuradas</p> : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-left text-neutral-600">
              <th className="py-2 pr-4 font-medium">Código</th>
              <th className="py-2 pr-4 font-medium">Descripción</th>
              <th className="py-2 pr-4 font-medium">Cuenta</th>
              <th className="py-2 pr-4 font-medium">%</th>
              <th className="py-2 pr-4 font-medium">Tipo / base minima</th>
              <th className="py-2 pr-4 font-medium">Concepto</th>
              <th className="py-2 pr-4 font-medium">Activo</th>
            </tr>
          </thead>
          <tbody>
            {retenciones.map((r) => (
              <tr key={r.id} className="border-b border-line">
                <td className="py-2 pr-4 font-mono">{r.code}</td>
                <td className="py-2 pr-4">{r.description}</td>
                <td className="py-2 pr-4 font-mono">{r.account_code}</td>
                <td className="py-2 pr-4">{r.percent}%</td>
                <td className="py-2 pr-4">{r.retention_type} · ${Number(r.minimum_base || 0).toLocaleString()}</td>
                <td className="py-2 pr-4">{r.concept || "—"}</td>
                <td className="py-2 pr-4">{r.active ? "✓" : "✗"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
