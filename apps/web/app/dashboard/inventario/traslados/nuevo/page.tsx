"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Search, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { InventoryNav } from "@/components/inventory-nav";
import { ModalFrame } from "@/components/ui/ModalFrame";

type Warehouse = { id: number; code: string; name: string; society_code: string };
type Item = { id: number; code: string; name: string; unit: string; warehouse_rows: Array<{ warehouse_id: number; qty: number }> };
type Line = { key: string; item_id: string; item_code: string; item_name: string; item_error: string; qty: number };
const emptyLine = (): Line => ({ key: crypto.randomUUID(), item_id: "", item_code: "", item_name: "", item_error: "", qty: 1 });

export default function NuevoTrasladoPage() {
  const router = useRouter();
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [header, setHeader] = useState({ origin_place_id: "", destination_place_id: "", reason: "" });
  const [lines, setLines] = useState<Line[]>([emptyLine()]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [skuSearchLineKey, setSkuSearchLineKey] = useState<string | null>(null);
  const [skuSearch, setSkuSearch] = useState("");

  useEffect(() => {
    Promise.all([api<Warehouse[]>("/api/v1/inventory/warehouses"), api<{ data: Item[] }>("/api/v1/inventory/costs?all=true")])
      .then(([warehouseRows, itemRows]) => { setWarehouses(warehouseRows); setItems(itemRows.data || []); })
      .catch((err) => setError(err instanceof Error ? err.message : "No se pudieron cargar los datos"));
  }, []);

  const origin = warehouses.find((row) => row.id === Number(header.origin_place_id));
  const destinations = warehouses.filter((row) => row.id !== origin?.id && (!origin || row.society_code === origin.society_code));
  const duplicateSkus = useMemo(() => {
    const selected = lines.map((line) => line.item_id).filter(Boolean);
    return new Set(selected.filter((id, index) => selected.indexOf(id) !== index));
  }, [lines]);
  const skuSearchResults = useMemo(() => {
    const needle = skuSearch.trim().toLowerCase();
    return items.filter((item) => !needle || item.code.toLowerCase().includes(needle) || item.name.toLowerCase().includes(needle)).slice(0, 50);
  }, [items, skuSearch]);

  function updateLine(key: string, changes: Partial<Line>) { setLines((current) => current.map((line) => line.key === key ? { ...line, ...changes } : line)); }
  function available(itemId: string) {
    const item = items.find((row) => row.id === Number(itemId));
    return (item?.warehouse_rows || []).filter((row) => row.warehouse_id === Number(header.origin_place_id)).reduce((sum, row) => sum + Number(row.qty || 0), 0);
  }
  function assignItem(key: string, item: Item) {
    updateLine(key, { item_id: String(item.id), item_code: item.code, item_name: item.name, item_error: "" });
    setSkuSearchLineKey(null);
    setSkuSearch("");
  }
  function validateSku(key: string) {
    const line = lines.find((row) => row.key === key);
    if (!line) return;
    const code = line.item_code.trim().toUpperCase();
    if (!code) {
      updateLine(key, { item_id: "", item_name: "", item_error: "Ingresa un código SKU o usa el buscador." });
      return;
    }
    const item = items.find((row) => row.code.toUpperCase() === code);
    if (!item) {
      updateLine(key, { item_id: "", item_name: "", item_error: `El SKU ${code} no existe o está inactivo.` });
      return;
    }
    assignItem(key, item);
  }
  function openSkuSearch(key: string, search = "") {
    setSkuSearchLineKey(key);
    setSkuSearch(search);
  }

  async function createTransfer(createAnother: boolean) {
    setError(""); setMessage("");
    if (!header.origin_place_id || !header.destination_place_id) return setError("Selecciona las bodegas de origen y destino.");
    if (duplicateSkus.size) return setError("Cada SKU debe aparecer una sola vez en el traslado.");
    if (!lines.length || lines.some((line) => !line.item_id || Number(line.qty) <= 0)) return setError("Completa todos los SKU y cantidades.");
    const insufficient = lines.find((line) => Number(line.qty) > available(line.item_id));
    if (insufficient) return setError(`La cantidad solicitada supera la existencia disponible de ${insufficient.item_code}.`);
    setSaving(true);
    try {
      const created = await api<{ number?: string }>("/api/v1/inventory/transfers", { method: "POST", body: JSON.stringify({ origin_place_id: Number(header.origin_place_id), destination_place_id: Number(header.destination_place_id), reason: header.reason.trim(), idempotency_key: crypto.randomUUID(), lines: lines.map((line) => ({ item_id: Number(line.item_id), qty: Number(line.qty) })) }) });
      if (createAnother) { setLines([emptyLine()]); setHeader((current) => ({ ...current, reason: "" })); setMessage(`${created.number || "Traslado"} creado. Puedes registrar el siguiente con las mismas bodegas.`); }
      else router.push("/dashboard/inventario/traslados");
    } catch (err) { setError(err instanceof Error ? err.message : "No se pudo crear el traslado"); }
    finally { setSaving(false); }
  }

  function submit(event: FormEvent) { event.preventDefault(); void createTransfer(false); }

  return <div className="space-y-5">
    <header><p className="text-sm font-medium text-apex">Inventario - Traslados</p><h1 className="text-3xl font-semibold">Nuevo traslado</h1><p className="mt-1 text-sm text-neutral-600">La cabecera define origen y destino; agrega varios SKU consultando su existencia disponible.</p></header>
    <InventoryNav />
    {error ? <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
    {message ? <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p> : null}
    <form className="space-y-4" onSubmit={submit}>
      <section className="rounded-md border border-line bg-white p-4"><h2 className="mb-3 font-semibold">Cabecera</h2><div className="grid gap-3 md:grid-cols-3">
        <label className="text-sm">Bodega origen<select className="mt-1 h-10 w-full rounded-md border border-line px-2" required value={header.origin_place_id} onChange={(e) => { setHeader({ ...header, origin_place_id: e.target.value, destination_place_id: "" }); setLines((current) => current.map((line) => ({ ...line, qty: 1 }))); }}><option value="">Seleccionar</option>{warehouses.map((row) => <option key={row.id} value={row.id}>{row.code} - {row.name}</option>)}</select></label>
        <label className="text-sm">Bodega destino<select className="mt-1 h-10 w-full rounded-md border border-line px-2" required value={header.destination_place_id} onChange={(e) => setHeader({ ...header, destination_place_id: e.target.value })}><option value="">Seleccionar</option>{destinations.map((row) => <option key={row.id} value={row.id}>{row.code} - {row.name}</option>)}</select></label>
        <label className="text-sm">Motivo<input className="mt-1 h-10 w-full rounded-md border border-line px-2" value={header.reason} onChange={(e) => setHeader({ ...header, reason: e.target.value })} /></label>
      </div></section>
      <section className="rounded-md border border-line bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line p-4"><div><h2 className="font-semibold">Detalle de productos</h2><p className="text-xs text-neutral-500">Escribe el código exacto del SKU o usa el buscador por código o nombre.</p></div><button className="inline-flex items-center gap-2 rounded-md border border-apex px-3 py-2 text-sm text-apex" onClick={() => setLines((current) => [...current, emptyLine()])} type="button"><Plus size={16} /> Agregar línea</button></div>
        <div className="space-y-3 p-4">{lines.map((line, index) => <div className="grid gap-3 md:grid-cols-[50px_220px_minmax(220px,1fr)_140px_170px_44px]" key={line.key}>
          <span className="pt-8 text-sm text-neutral-500">{index + 1}</span>
          <label className="text-sm">Código SKU<div className="mt-1 flex"><input className={`h-10 min-w-0 flex-1 rounded-l-md border px-2 font-mono ${line.item_error ? "border-red-400" : "border-line"}`} placeholder="Ej: SKU-001" required value={line.item_code} onBlur={() => validateSku(line.key)} onChange={(e) => updateLine(line.key, { item_code: e.target.value.toUpperCase(), item_id: "", item_name: "", item_error: "" })} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (line.item_code.trim()) validateSku(line.key); else openSkuSearch(line.key); } }} /><button aria-label="Buscar SKU" className="h-10 w-10 rounded-r-md border border-l-0 border-line text-apex hover:bg-paper" onClick={() => openSkuSearch(line.key, line.item_code)} type="button"><Search className="mx-auto" size={16} /></button></div>{line.item_error ? <span className="block text-xs text-red-600">{line.item_error}</span> : null}{duplicateSkus.has(line.item_id) ? <span className="block text-xs text-red-600">SKU repetido</span> : null}</label>
          <label className="text-sm">Nombre del SKU<input className="mt-1 h-10 w-full rounded-md border border-line bg-paper px-2 text-neutral-700" placeholder="Se completa automáticamente" readOnly value={line.item_name} /></label>
          <div className="pt-6 text-sm"><span className="block text-xs text-neutral-500">Disponible</span><strong>{line.item_id && header.origin_place_id ? `${available(line.item_id)} ${items.find((item) => item.id === Number(line.item_id))?.unit || ""}` : "--"}</strong></div>
          <label className="text-sm">Cantidad<input className="mt-1 h-10 w-full rounded-md border border-line px-2" max={line.item_id ? available(line.item_id) : undefined} min="0.0001" required step="0.0001" type="number" value={line.qty} onChange={(e) => updateLine(line.key, { qty: Number(e.target.value) })} /></label>
          <button aria-label="Eliminar línea" className="mt-6 h-10 rounded-md border border-red-200 text-red-600 disabled:opacity-40" disabled={lines.length === 1} onClick={() => setLines((current) => current.filter((row) => row.key !== line.key))} type="button"><Trash2 className="mx-auto" size={16} /></button>
        </div>)}</div>
      </section>
      <div className="flex flex-wrap justify-end gap-2"><Link className="rounded-md border border-line px-4 py-2 text-sm" href="/dashboard/inventario/traslados">Cancelar</Link><button className="rounded-md border border-apex px-4 py-2 text-sm font-medium text-apex disabled:opacity-50" disabled={saving || duplicateSkus.size > 0} onClick={() => void createTransfer(true)} type="button">Crear y nuevo</button><button className="rounded-md bg-apex px-4 py-2 text-sm font-medium text-white disabled:opacity-50" disabled={saving || duplicateSkus.size > 0} type="submit">{saving ? "Guardando..." : "Crear traslado"}</button></div>
    </form>
    {skuSearchLineKey ? <ModalFrame maxWidth="md:max-w-3xl" onClose={() => { setSkuSearchLineKey(null); setSkuSearch(""); }} title="Buscar SKU para el traslado">
      <div className="space-y-4">
        <label className="relative block"><span className="sr-only">Código o nombre</span><Search className="absolute left-3 top-3 text-neutral-400" size={16} /><input autoFocus className="h-10 w-full rounded-md border border-line pl-10 pr-3 text-sm" placeholder="Buscar por código o nombre del producto" value={skuSearch} onChange={(event) => setSkuSearch(event.target.value)} /></label>
        <div className="max-h-[55vh] divide-y divide-line overflow-y-auto rounded-md border border-line">
          {skuSearchResults.map((item) => <button className="flex w-full items-center justify-between gap-4 p-3 text-left text-sm hover:bg-paper" key={item.id} onClick={() => assignItem(skuSearchLineKey, item)} type="button"><span><strong className="font-mono">{item.code}</strong><span className="ml-2">{item.name}</span></span><span className="shrink-0 text-xs text-neutral-500">Unidad {item.unit || "UND"}</span></button>)}
          {!skuSearchResults.length ? <p className="p-6 text-center text-sm text-neutral-500">No hay SKU que coincidan con la búsqueda.</p> : null}
        </div>
      </div>
    </ModalFrame> : null}
  </div>;
}
