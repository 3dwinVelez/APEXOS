"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { VentasNav } from "@/components/ventas-nav";

type Customer = { id: number; name: string; tax_id: string; email: string; city: string; country: string };

export default function ClientesPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ name: "", tax_id: "", email: "", city: "", country: "CO", segment: "" });

  async function load() {
    setCustomers(await api<Customer[]>("/api/v1/sales/customers"));
  }

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : "No se pudieron cargar clientes"));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await api("/api/v1/sales/customers", {
        method: "POST",
        body: JSON.stringify({
          name: form.name,
          tax_id: form.tax_id || undefined,
          email: form.email || undefined,
          city: form.city || undefined,
          country: form.country || "CO",
          segment: form.segment || undefined
        })
      });
      setForm({ name: "", tax_id: "", email: "", city: "", country: "CO", segment: "" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear cliente");
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-semibold">Clientes</h1>
      <VentasNav />
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      <form className="grid gap-2 rounded-md border border-line bg-white p-4 md:grid-cols-3" onSubmit={submit}>
        <input className="h-10 rounded-md border border-line px-3 text-sm" placeholder="Nombre del cliente" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} required />
        <input className="h-10 rounded-md border border-line px-3 text-sm" placeholder="Documento tributario" value={form.tax_id} onChange={(e) => setForm((p) => ({ ...p, tax_id: e.target.value }))} />
        <input className="h-10 rounded-md border border-line px-3 text-sm" placeholder="Correo" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} />
        <input className="h-10 rounded-md border border-line px-3 text-sm" placeholder="Ciudad" value={form.city} onChange={(e) => setForm((p) => ({ ...p, city: e.target.value }))} />
        <input className="h-10 rounded-md border border-line px-3 text-sm" placeholder="País (ISO2)" value={form.country} onChange={(e) => setForm((p) => ({ ...p, country: e.target.value.toUpperCase() }))} />
        <input className="h-10 rounded-md border border-line px-3 text-sm" placeholder="Segmento (retail, b2b, salud...)" value={form.segment} onChange={(e) => setForm((p) => ({ ...p, segment: e.target.value }))} />
        <button className="h-10 rounded-md bg-apex px-4 text-sm text-white md:col-span-3" type="submit">Crear cliente</button>
      </form>
      <section className="rounded-md border border-line bg-white p-4">
        <h2 className="mb-2 font-semibold">Listado</h2>
        <div className="space-y-2 text-sm">
          {customers.map((c) => (
            <div key={c.id} className="rounded-md border border-line px-3 py-2">
              {c.name} · {c.tax_id || "Sin documento"} · {c.country || "-"}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

