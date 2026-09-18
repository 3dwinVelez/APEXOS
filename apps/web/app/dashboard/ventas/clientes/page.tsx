"use client";

import { useEffect, useState } from "react";
import { Plus, Users } from "lucide-react";
import { VentasNav } from "@/components/ventas-nav";
import { ModalFrame } from "@/components/ui/ModalFrame";
import { api } from "@/lib/api";
import { asCollection } from "@/lib/api-collections";

type Customer = { id: number; name: string; tax_id: string; email: string; city: string; country: string };

const emptyForm = { name: "", tax_id: "", email: "", city: "", country: "CO", segment: "" };

export default function ClientesPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [error, setError] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState(emptyForm);

  async function load() {
    const response = await api<unknown>("/api/v1/sales/customers");
    setCustomers(asCollection<Customer>(response, ["customers"]));
  }

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : "No se pudieron cargar clientes"));
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
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
      setForm(emptyForm);
      setShowNew(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear cliente");
    }
  }

  return (
    <div className="apex-workspace-shell space-y-4">
      <header className="apex-section-card p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-apex">Ventas · Maestro</p>
            <h1 className="text-3xl font-semibold">Clientes</h1>
            <p className="mt-1 text-sm text-neutral-600">{customers.length} cliente(s) disponibles para pedidos y facturación.</p>
          </div>
          <button className="apex-primary-action inline-flex items-center justify-center gap-2 px-4 text-sm font-semibold" onClick={() => setShowNew(true)} type="button">
            <Plus size={16} /> Nuevo cliente
          </button>
        </div>
      </header>
      <VentasNav />
      {error ? <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

      <section className="apex-section-card overflow-hidden">
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <Users className="text-apex" size={18} />
          <h2 className="font-semibold">Listado de clientes</h2>
        </div>
        <div className="divide-y divide-line">
          {customers.map((customer) => (
            <div className="grid gap-1 px-4 py-3 text-sm sm:grid-cols-[minmax(0,1fr)_180px_110px]" key={customer.id}>
              <span className="font-medium">{customer.name}</span>
              <span className="font-mono text-neutral-600">{customer.tax_id || "Sin documento"}</span>
              <span className="text-neutral-500">{customer.country || "—"}</span>
            </div>
          ))}
          {!customers.length ? <p className="px-4 py-8 text-center text-sm text-neutral-500">No hay clientes registrados.</p> : null}
        </div>
      </section>

      {showNew ? (
        <ModalFrame title="Nuevo cliente" onClose={() => setShowNew(false)} maxWidth="max-w-2xl">
          <form className="space-y-4" onSubmit={submit}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Nombre o razón social" required><input className="h-10 w-full rounded-md border border-line px-3 text-sm" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} required /></Field>
              <Field label="Documento tributario"><input className="h-10 w-full rounded-md border border-line px-3 text-sm" value={form.tax_id} onChange={(event) => setForm((current) => ({ ...current, tax_id: event.target.value }))} /></Field>
              <Field label="Correo"><input className="h-10 w-full rounded-md border border-line px-3 text-sm" type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} /></Field>
              <Field label="Ciudad"><input className="h-10 w-full rounded-md border border-line px-3 text-sm" value={form.city} onChange={(event) => setForm((current) => ({ ...current, city: event.target.value }))} /></Field>
              <Field label="País (ISO 2)"><input className="h-10 w-full rounded-md border border-line px-3 text-sm uppercase" maxLength={2} value={form.country} onChange={(event) => setForm((current) => ({ ...current, country: event.target.value.toUpperCase() }))} /></Field>
              <Field label="Segmento"><input className="h-10 w-full rounded-md border border-line px-3 text-sm" placeholder="Retail, B2B, salud…" value={form.segment} onChange={(event) => setForm((current) => ({ ...current, segment: event.target.value }))} /></Field>
            </div>
            <div className="flex justify-end gap-2 border-t border-line pt-4">
              <button className="h-10 rounded-md border border-line px-4 text-sm" onClick={() => setShowNew(false)} type="button">Cancelar</button>
              <button className="h-10 rounded-md bg-apex px-4 text-sm font-medium text-white" type="submit">Crear cliente</button>
            </div>
          </form>
        </ModalFrame>
      ) : null}
    </div>
  );
}

function Field({ label, required = false, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return <label className="block text-sm font-medium">{label}{required ? <span className="ml-1 text-red-600">*</span> : null}<span className="mt-1 block">{children}</span></label>;
}
