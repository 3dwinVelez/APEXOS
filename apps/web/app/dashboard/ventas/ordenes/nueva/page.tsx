"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { VentasNav } from "@/components/ventas-nav";
import { ZeroFriendlyNumberInput } from "@/components/ui/ZeroFriendlyNumberInput";

type Customer = { id: number; name: string };
type Item = { id: number; code: string; name: string; unit_price: number };

export default function NuevaOVPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [form, setForm] = useState({ customer_id: 0, item_id: 0, qty: 1, unit_price: 0, notes: "" });

  useEffect(() => {
    Promise.all([
      api<Customer[]>("/api/v1/sales/customers"),
      api<{ data: Item[] }>("/api/v1/inventory/items")
    ]).then(([c, i]) => {
      setCustomers(c || []);
      setItems(i.data || []);
    }).catch((err) => setError(err instanceof Error ? err.message : "Error cargando datos"));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setOk("");
    try {
      const res = await api<{ number: string }>("/api/v1/sales/orders", {
        method: "POST",
        body: JSON.stringify({
          customer_id: Number(form.customer_id),
          notes: form.notes || undefined,
          lines: [{ item_id: Number(form.item_id), qty: Number(form.qty), unit_price: Number(form.unit_price) }]
        })
      });
      setOk(`Orden creada: ${res.number}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear la orden");
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-semibold">Nueva orden de venta</h1>
      <VentasNav />
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {ok ? <p className="text-sm text-emerald-700">{ok}</p> : null}
      <form className="grid gap-2 rounded-md border border-line bg-white p-4 md:grid-cols-2" onSubmit={submit}>
        <select className="h-10 rounded-md border border-line px-3 text-sm" value={form.customer_id} onChange={(e) => setForm((p) => ({ ...p, customer_id: Number(e.target.value) }))} required>
          <option value={0}>Cliente</option>
          {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select className="h-10 rounded-md border border-line px-3 text-sm" value={form.item_id} onChange={(e) => {
          const itemId = Number(e.target.value);
          const found = items.find((i) => i.id === itemId);
          setForm((p) => ({ ...p, item_id: itemId, unit_price: found.unit_price || 0 }));
        }} required>
          <option value={0}>Producto/servicio</option>
          {items.map((i) => <option key={i.id} value={i.id}>{i.code} · {i.name}</option>)}
        </select>
        <ZeroFriendlyNumberInput className="h-10 rounded-md border border-line px-3 text-sm" min={0.01} step="0.01" placeholder="Cantidad" value={form.qty} onValueChange={(value) => setForm((p) => ({ ...p, qty: value }))} />
        <ZeroFriendlyNumberInput className="h-10 rounded-md border border-line px-3 text-sm" min={0} step="0.01" placeholder="Precio unitario" value={form.unit_price} onValueChange={(value) => setForm((p) => ({ ...p, unit_price: value }))} />
        <input className="h-10 rounded-md border border-line px-3 text-sm md:col-span-2" placeholder="Notas/condiciones comerciales (opcional)" value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
        <button className="h-10 rounded-md bg-apex px-4 text-sm text-white md:col-span-2" type="submit">Crear orden</button>
      </form>
    </div>
  );
}

