"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { ComprasNav } from "@/components/compras-nav";

type Supplier = { id: number; name: string };
type Item = { id: number; code: string; name: string; unit_cost: number };

export default function NuevaOCPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [form, setForm] = useState({ supplier_id: 0, item_id: 0, qty: 1, unit_cost: 0, notes: "" });

  useEffect(() => {
    Promise.all([
      api<Supplier[]>("/api/v1/purchases/suppliers"),
      api<{ data: Item[] }>("/api/v1/inventory/items")
    ]).then(([s, i]) => {
      setSuppliers(s || []);
      setItems(i.data || []);
    }).catch((err) => setError(err instanceof Error ? err.message : "Error cargando datos"));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setOk("");
    try {
      const res = await api<{ number: string }>("/api/v1/purchases/orders", {
        method: "POST",
        body: JSON.stringify({
          supplier_id: Number(form.supplier_id),
          notes: form.notes || undefined,
          lines: [{ item_id: Number(form.item_id), qty: Number(form.qty), unit_cost: Number(form.unit_cost) }]
        })
      });
      setOk(`Orden creada: ${res.number}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear la orden");
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-semibold">Nueva orden de compra</h1>
      <ComprasNav />
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {ok ? <p className="text-sm text-emerald-700">{ok}</p> : null}
      <form className="grid gap-2 rounded-md border border-line bg-white p-4 md:grid-cols-2" onSubmit={submit}>
        <select className="h-10 rounded-md border border-line px-3 text-sm" value={form.supplier_id} onChange={(e) => setForm((p) => ({ ...p, supplier_id: Number(e.target.value) }))} required>
          <option value={0}>Proveedor</option>
          {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select className="h-10 rounded-md border border-line px-3 text-sm" value={form.item_id} onChange={(e) => {
          const itemId = Number(e.target.value);
          const found = items.find((i) => i.id === itemId);
          setForm((p) => ({ ...p, item_id: itemId, unit_cost: found?.unit_cost || 0 }));
        }} required>
          <option value={0}>Producto/insumo</option>
          {items.map((i) => <option key={i.id} value={i.id}>{i.code} · {i.name}</option>)}
        </select>
        <input className="h-10 rounded-md border border-line px-3 text-sm" type="number" min={0.01} step="0.01" placeholder="Cantidad" value={form.qty} onChange={(e) => setForm((p) => ({ ...p, qty: Number(e.target.value) }))} />
        <input className="h-10 rounded-md border border-line px-3 text-sm" type="number" min={0} step="0.01" placeholder="Costo unitario" value={form.unit_cost} onChange={(e) => setForm((p) => ({ ...p, unit_cost: Number(e.target.value) }))} />
        <input className="h-10 rounded-md border border-line px-3 text-sm md:col-span-2" placeholder="Condiciones / notas (opcional)" value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
        <button className="h-10 rounded-md bg-apex px-4 text-sm text-white md:col-span-2" type="submit">Crear orden</button>
      </form>
    </div>
  );
}

