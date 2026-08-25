"use client";

import { useEffect, useState } from "react";
import { ShoppingCart } from "lucide-react";
import { VentasNav } from "@/components/ventas-nav";
import { ZeroFriendlyNumberInput } from "@/components/ui/ZeroFriendlyNumberInput";
import { api } from "@/lib/api";
import { asCollection } from "@/lib/api-collections";

type Customer = { id: number; name: string };
type Item = { id: number; code: string; name: string; unit_price: number };

export default function NuevaOVPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ customer_id: 0, item_id: 0, qty: 1, unit_price: 0, notes: "" });

  useEffect(() => {
    Promise.all([api<unknown>("/api/v1/sales/customers"), api<unknown>("/api/v1/inventory/items")])
      .then(([customerResponse, itemResponse]) => {
        setCustomers(asCollection<Customer>(customerResponse, ["customers"]));
        setItems(asCollection<Item>(itemResponse, ["items"]));
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Error cargando datos"));
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setOk("");
    setSaving(true);
    try {
      const result = await api<{ number: string }>("/api/v1/sales/orders", {
        method: "POST",
        body: JSON.stringify({
          customer_id: Number(form.customer_id),
          notes: form.notes || undefined,
          lines: [{ item_id: Number(form.item_id), qty: Number(form.qty), unit_price: Number(form.unit_price) }]
        })
      });
      setOk("Orden creada: " + result.number);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear la orden");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="apex-workspace-shell space-y-4">
      <header className="apex-section-card p-4">
        <p className="text-sm font-medium text-apex">Ventas · Órdenes</p>
        <h1 className="text-3xl font-semibold">Nueva orden de venta</h1>
        <p className="mt-1 text-sm text-neutral-600">Registra los datos mínimos del pedido. El precio se completa desde el producto y puede ajustarse antes de guardar.</p>
      </header>
      <VentasNav />
      {error ? <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      {ok ? <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{ok}</p> : null}

      <form className="apex-section-card overflow-hidden" onSubmit={submit}>
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <ShoppingCart className="text-apex" size={18} />
          <h2 className="font-semibold">Datos de la orden</h2>
        </div>
        <div className="grid gap-4 p-4 md:grid-cols-2">
          <Field label="Cliente" required>
            <select className="h-10 w-full rounded-md border border-line px-3 text-sm" value={form.customer_id} onChange={(event) => setForm((current) => ({ ...current, customer_id: Number(event.target.value) }))} required>
              <option value={0}>Seleccionar cliente</option>
              {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
            </select>
          </Field>
          <Field label="Producto o servicio" required>
            <select className="h-10 w-full rounded-md border border-line px-3 text-sm" value={form.item_id} onChange={(event) => {
              const itemId = Number(event.target.value);
              const found = items.find((item) => item.id === itemId);
              setForm((current) => ({ ...current, item_id: itemId, unit_price: found?.unit_price || 0 }));
            }} required>
              <option value={0}>Seleccionar producto</option>
              {items.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}
            </select>
          </Field>
          <Field label="Cantidad" required>
            <ZeroFriendlyNumberInput className="h-10 w-full rounded-md border border-line px-3 text-sm" min={0.01} step="0.01" value={form.qty} onValueChange={(value) => setForm((current) => ({ ...current, qty: value }))} />
          </Field>
          <Field label="Precio unitario" required>
            <ZeroFriendlyNumberInput className="h-10 w-full rounded-md border border-line px-3 text-sm" min={0} step="0.01" value={form.unit_price} onValueChange={(value) => setForm((current) => ({ ...current, unit_price: value }))} />
          </Field>
          <Field label="Notas o condiciones">
            <textarea className="min-h-20 w-full rounded-md border border-line px-3 py-2 text-sm" value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} />
          </Field>
        </div>
        <div className="flex items-center justify-end border-t border-line bg-paper px-4 py-3">
          <button className="h-10 rounded-md bg-apex px-5 text-sm font-medium text-white disabled:opacity-50" disabled={saving || !form.customer_id || !form.item_id || form.qty <= 0} type="submit">
            {saving ? "Guardando…" : "Crear orden"}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, required = false, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return <label className="block text-sm font-medium">{label}{required ? <span className="ml-1 text-red-600">*</span> : null}<span className="mt-1 block">{children}</span></label>;
}
