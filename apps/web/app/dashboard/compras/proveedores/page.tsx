"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { ComprasNav } from "@/components/compras-nav";

type Supplier = { id: number; name: string; tax_id?: string; email?: string; city?: string; country?: string };

export default function ProveedoresPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ name: "", tax_id: "", email: "", city: "", country: "CO", metadata: "" });

  async function load() {
    setSuppliers(await api<Supplier[]>("/api/v1/purchases/suppliers"));
  }

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : "No se pudieron cargar proveedores"));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await api("/api/v1/purchases/suppliers", {
        method: "POST",
        body: JSON.stringify({
          name: form.name,
          tax_id: form.tax_id || undefined,
          email: form.email || undefined,
          city: form.city || undefined,
          country: form.country || "CO",
          metadata: form.metadata ? { notes: form.metadata } : {}
        })
      });
      setForm({ name: "", tax_id: "", email: "", city: "", country: "CO", metadata: "" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear proveedor");
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-semibold">Proveedores</h1>
      <ComprasNav />
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      <form className="grid gap-2 rounded-md border border-line bg-white p-4 md:grid-cols-3" onSubmit={submit}>
        <input className="h-10 rounded-md border border-line px-3 text-sm" placeholder="Nombre del proveedor" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} required />
        <input className="h-10 rounded-md border border-line px-3 text-sm" placeholder="Documento tributario" value={form.tax_id} onChange={(e) => setForm((p) => ({ ...p, tax_id: e.target.value }))} />
        <input className="h-10 rounded-md border border-line px-3 text-sm" placeholder="Correo" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} />
        <input className="h-10 rounded-md border border-line px-3 text-sm" placeholder="Ciudad" value={form.city} onChange={(e) => setForm((p) => ({ ...p, city: e.target.value }))} />
        <input className="h-10 rounded-md border border-line px-3 text-sm" placeholder="País (ISO2, ej: CO, MX, PE)" value={form.country} onChange={(e) => setForm((p) => ({ ...p, country: e.target.value.toUpperCase() }))} />
        <input className="h-10 rounded-md border border-line px-3 text-sm" placeholder="Notas/segmento (opcional)" value={form.metadata} onChange={(e) => setForm((p) => ({ ...p, metadata: e.target.value }))} />
        <button className="h-10 rounded-md bg-apex px-4 text-sm text-white md:col-span-3" type="submit">Crear proveedor</button>
      </form>
      <section className="rounded-md border border-line bg-white p-4">
        <h2 className="mb-2 font-semibold">Listado</h2>
        <div className="space-y-2 text-sm">
          {suppliers.map((s) => (
            <div key={s.id} className="rounded-md border border-line px-3 py-2">
              {s.name} · {s.tax_id || "Sin documento"} · {s.country || "-"}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

