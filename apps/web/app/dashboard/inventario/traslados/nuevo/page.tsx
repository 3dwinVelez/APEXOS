"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { InventoryNav } from "@/components/inventory-nav";

type Warehouse = { id: number; code: string; name: string; society_code: string };
type Item = { id: number; code: string; name: string; unit: string };
type Line = { key: string; item_id: string; qty: number };

export default function NuevoTrasladoPage() {
  const router = useRouter();
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [header, setHeader] = useState({ origin_place_id: "", destination_place_id: "", reason: "" });
  const [lines, setLines] = useState<Line[]>([{ key: crypto.randomUUID(), item_id: "", qty: 1 }]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      api<Warehouse[]>("/api/v1/inventory/warehouses"),
      api<{ data: Item[] }>("/api/v1/inventory/items?limit=500&sort_by=code")
    ]).then(([warehouseRows, itemRows]) => {
      setWarehouses(warehouseRows);
      setItems(itemRows.data || []);
    }).catch((err) => setError(err instanceof Error ? err.message : "No se pudieron cargar los datos"));
  }, []);

  const origin = warehouses.find((row) => row.id === Number(header.origin_place_id));
  const destinations = warehouses.filter((row) => row.id !== origin?.id && (!origin || row.society_code === origin.society_code));
  const duplicateSkus = useMemo(() => {
    const selected = lines.map((line) => line.item_id).filter(Boolean);
    return new Set(selected.filter((id, index) => selected.indexOf(id) !== index));
  }, [lines]);

  function updateLine(key: string, changes: Partial<Line>) {
    setLines((current) => current.map((line) => line.key === key ? { ...line, ...changes } : line));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (duplicateSkus.size) return setError("Cada SKU debe aparecer una sola vez en el traslado.");
    if (!lines.length || lines.some((line) => !line.item_id || Number(line.qty) <= 0)) return setError("Completa todos los SKU y cantidades.");
    setSaving(true);
    try {
      await api("/api/v1/inventory/transfers", {
        method: "POST",
        body: JSON.stringify({
          origin_place_id: Number(header.origin_place_id),
          destination_place_id: Number(header.destination_place_id),
          reason: header.reason.trim(),
          idempotency_key: crypto.randomUUID(),
          lines: lines.map((line) => ({ item_id: Number(line.item_id), qty: Number(line.qty) }))
        })
      });
      router.push("/dashboard/inventario/traslados");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear el traslado");
    } finally {
      setSaving(false);
    }
  }

  return <div className="space-y-5">
    <header>
      <p className="text-sm font-medium text-apex">Inventario - Traslados</p>
      <h1 className="text-3xl font-semibold">Nuevo traslado</h1>
      <p className="mt-1 text-sm text-neutral-600">La cabecera define origen y destino; el detalle admite varios SKU y cantidades.</p>
    </header>
    <InventoryNav />
    {error ? <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
    <form className="space-y-4" onSubmit={submit}>
      <section className="rounded-md border border-line bg-white p-4">
        <h2 className="mb-3 font-semibold">Cabecera</h2>
        <div className="grid gap-3 md:grid-cols-3">
          <label className="text-sm">Bodega origen<select className="mt-1 h-10 w-full rounded-md border border-line px-2" required value={header.origin_place_id} onChange={(e) => setHeader({ ...header, origin_place_id: e.target.value, destination_place_id: "" })}><option value="">Seleccionar</option>{warehouses.map((row) => <option key={row.id} value={row.id}>{row.code} - {row.name}</option>)}</select></label>
          <label className="text-sm">Bodega destino<select className="mt-1 h-10 w-full rounded-md border border-line px-2" required value={header.destination_place_id} onChange={(e) => setHeader({ ...header, destination_place_id: e.target.value })}><option value="">Seleccionar</option>{destinations.map((row) => <option key={row.id} value={row.id}>{row.code} - {row.name}</option>)}</select></label>
          <label className="text-sm">Motivo<input className="mt-1 h-10 w-full rounded-md border border-line px-2" value={header.reason} onChange={(e) => setHeader({ ...header, reason: e.target.value })} /></label>
        </div>
      </section>
      <section className="rounded-md border border-line bg-white">
        <div className="flex items-center justify-between border-b border-line p-4"><h2 className="font-semibold">Detalle de productos</h2><button className="inline-flex items-center gap-2 rounded-md border border-apex px-3 py-2 text-sm text-apex" onClick={() => setLines((current) => [...current, { key: crypto.randomUUID(), item_id: "", qty: 1 }])} type="button"><Plus size={16} /> Agregar línea</button></div>
        <div className="space-y-3 p-4">{lines.map((line, index) => <div className="grid gap-3 md:grid-cols-[60px_1fr_180px_44px]" key={line.key}><span className="pt-3 text-sm text-neutral-500">{index + 1}</span><label className="text-sm">SKU<select className="mt-1 h-10 w-full rounded-md border border-line px-2" required value={line.item_id} onChange={(e) => updateLine(line.key, { item_id: e.target.value })}><option value="">Seleccionar</option>{items.map((item) => <option key={item.id} value={item.id}>{item.code} - {item.name}</option>)}</select>{duplicateSkus.has(line.item_id) ? <span className="text-xs text-red-600">SKU repetido</span> : null}</label><label className="text-sm">Cantidad<input className="mt-1 h-10 w-full rounded-md border border-line px-2" min="0.0001" required step="0.0001" type="number" value={line.qty} onChange={(e) => updateLine(line.key, { qty: Number(e.target.value) })} /></label><button aria-label="Eliminar línea" className="mt-6 h-10 rounded-md border border-red-200 text-red-600 disabled:opacity-40" disabled={lines.length === 1} onClick={() => setLines((current) => current.filter((row) => row.key !== line.key))} type="button"><Trash2 className="mx-auto" size={16} /></button></div>)}</div>
      </section>
      <div className="flex justify-end gap-2"><Link className="rounded-md border border-line px-4 py-2 text-sm" href="/dashboard/inventario/traslados">Cancelar</Link><button className="rounded-md bg-apex px-4 py-2 text-sm font-medium text-white disabled:opacity-50" disabled={saving || duplicateSkus.size > 0} type="submit">{saving ? "Guardando..." : "Crear traslado"}</button></div>
    </form>
  </div>;
}
