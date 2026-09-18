"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Search, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { asCollection } from "@/lib/api-collections";
import { InventoryNav } from "@/components/inventory-nav";
import { ModalFrame } from "@/components/ui/ModalFrame";
import { Button } from "@/components/ui/button";
import { showToast } from "@/components/system/ToastCenter";

type Warehouse = { id: number; code: string; name: string; society_code: string };
type Item = { id: number; code: string; legacy_code?: string | null; name: string; unit: string; average_cost: number; warehouse_rows: Array<{ warehouse_id: number; qty: number }> };
type Line = { key: string; item_id: string; code: string; name: string; qty: string; unit_cost: string };

const blank = (): Line => ({ key: crypto.randomUUID(), item_id: "", code: "", name: "", qty: "", unit_cost: "" });
const initialLines = () => [blank(), blank(), blank(), blank(), blank()];

export default function NewAdjustment() {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [lines, setLines] = useState<Line[]>(initialLines);
  const [header, setHeader] = useState({ document_type: "AE", warehouse_id: "", posting_date: new Date().toISOString().slice(0, 10), reason: "" });
  const [searchLine, setSearchLine] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    Promise.all([api<unknown>("/api/v1/inventory/warehouses"), api<unknown>("/api/v1/inventory/costs?all=true")])
      .then(([warehouseResponse, itemResponse]) => {
        setWarehouses(asCollection<Warehouse>(warehouseResponse, ["warehouses"]));
        setItems(asCollection<Item>(itemResponse, ["items"]));
      })
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "No se cargaron los maestros"));
  }, []);

  const results = useMemo(() => {
    const needle = search.toLowerCase();
    return items.filter((item) => !needle || [item.code, item.legacy_code || "", item.name].some((value) => value.toLowerCase().includes(needle))).slice(0, 100);
  }, [items, search]);

  const update = (key: string, changes: Partial<Line>) => setLines((current) => current.map((line) => line.key === key ? { ...line, ...changes } : line));
  const choose = (key: string, item: Item) => {
    update(key, { item_id: String(item.id), code: item.code, name: item.name, unit_cost: String(Number(item.average_cost || 0) || "") });
    setSearchLine(null);
    setSearch("");
  };
  const validate = (key: string) => {
    const line = lines.find((entry) => entry.key === key);
    if (!line?.code.trim()) return setSearchLine(key);
    const item = items.find((entry) => [entry.code, entry.legacy_code || ""].some((value) => value.toUpperCase() === line.code.trim().toUpperCase()));
    if (!item) return update(key, { item_id: "", name: "" });
    choose(key, item);
  };
  const available = (line: Line) => items.find((item) => item.id === Number(line.item_id))?.warehouse_rows.filter((row) => row.warehouse_id === Number(header.warehouse_id)).reduce((sum, row) => sum + Number(row.qty), 0) || 0;

  async function submit(idempotencyKey = crypto.randomUUID()) {
    if (saving) return;
    setError("");
    setMessage("");
    const active = lines.filter((line) => line.item_id || line.code || line.qty);
    if (!header.warehouse_id || !header.reason.trim()) return setError("Bodega y motivo son obligatorios.");
    if (!active.length || active.some((line) => !line.item_id || !(Number(line.qty) > 0))) return setError("Completa al menos una posición válida.");
    if (new Set(active.map((line) => line.item_id)).size !== active.length) return setError("No repitas SKU en el ajuste.");
    if (header.document_type === "AS" && active.some((line) => Number(line.qty) > available(line))) return setError("Una salida no puede superar la existencia de la bodega.");
    if (header.document_type === "AE" && active.some((line) => {
      const item = items.find((entry) => entry.id === Number(line.item_id));
      return !(Number(item?.average_cost || 0) > 0) && !(Number(line.unit_cost) > 0);
    })) return setError("Ingresa costo para los SKU que todavía no tienen costo promedio.");

    setSaving(true);
    try {
      const row = await api<{ number: string }>("/api/v1/inventory/adjustments", {
        method: "POST",
        body: JSON.stringify({
          ...header,
          warehouse_id: Number(header.warehouse_id),
          idempotency_key: idempotencyKey,
          lines: active.map((line) => ({ item_id: Number(line.item_id), qty: Number(line.qty), ...(line.unit_cost ? { unit_cost: Number(line.unit_cost) } : {}) }))
        })
      });
      const success = `${row.number} contabilizado correctamente.`;
      setMessage(success);
      showToast({ tone: "success", title: `Ajuste contabilizado — ${row.number}`, description: "Las existencias y el costo quedaron actualizados." });
      setLines(initialLines());
      setHeader((current) => ({ ...current, reason: "" }));
    } catch (submitError) {
      const detail = submitError instanceof Error ? submitError.message : "No se pudo contabilizar el ajuste";
      setError(detail);
      showToast({ tone: "error", title: "No se pudo contabilizar el ajuste", description: detail, retry: () => void submit(idempotencyKey) });
    } finally {
      setSaving(false);
    }
  }

  return <div className="space-y-5">
    <header><p className="text-sm font-medium text-apex">Inventario - Ajustes</p><h1 className="text-3xl font-semibold">Nuevo ajuste</h1><p className="text-sm text-neutral-600">Entrada AE o salida AS con contabilización automática.</p></header>
    <InventoryNav />
    {error ? <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</p> : null}
    {message ? <p aria-live="polite" className="rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700" role="status">{message}</p> : null}
    <section className="rounded-md border border-line bg-white p-4"><div className="grid gap-3 md:grid-cols-4">
      <label className="text-sm">Tipo<select className="mt-1 h-10 w-full rounded border border-line px-2" value={header.document_type} onChange={(event) => setHeader({ ...header, document_type: event.target.value })}><option value="AE">AE - Entrada</option><option value="AS">AS - Salida</option></select></label>
      <label className="text-sm">Bodega<select className="mt-1 h-10 w-full rounded border border-line px-2" value={header.warehouse_id} onChange={(event) => setHeader({ ...header, warehouse_id: event.target.value })}><option value="">Seleccionar</option>{warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.code} - {warehouse.name}</option>)}</select></label>
      <label className="text-sm">Fecha<input className="mt-1 h-10 w-full rounded border border-line px-2" type="date" value={header.posting_date} onChange={(event) => setHeader({ ...header, posting_date: event.target.value })} /></label>
      <label className="text-sm">Motivo obligatorio<input className="mt-1 h-10 w-full rounded border border-line px-2" value={header.reason} onChange={(event) => setHeader({ ...header, reason: event.target.value })} /></label>
    </div></section>
    <section className="rounded-md border border-line bg-white">
      <div className="flex justify-between border-b border-line p-4"><h2 className="font-semibold">Posiciones</h2><button className="flex items-center gap-2 text-sm text-apex" onClick={() => setLines((current) => [...current, blank()])} type="button"><Plus size={16} /> Línea</button></div>
      <div className="space-y-2 p-4">{lines.map((line, index) => <div className="grid gap-2 md:grid-cols-[36px_210px_1fr_110px_120px_44px]" key={line.key}>
        <span className="pt-3 text-sm">{index + 1}</span><div className="flex"><input className="h-10 min-w-0 flex-1 rounded-l border border-line px-2 font-mono" placeholder="SKU o Enter" value={line.code} onChange={(event) => update(line.key, { code: event.target.value.toUpperCase(), item_id: "", name: "" })} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); validate(line.key); } }} /><button className="h-10 w-10 rounded-r border border-l-0 border-line text-apex" onClick={() => { setSearchLine(line.key); setSearch(line.code); }} type="button"><Search className="mx-auto" size={16} /></button></div>
        <input className="h-10 rounded border border-line bg-paper px-2" readOnly value={line.name} /><input className="h-10 rounded border border-line px-2" min="0" step="0.0001" placeholder="Cantidad" type="number" value={line.qty} onChange={(event) => update(line.key, { qty: event.target.value })} /><input className="h-10 rounded border border-line px-2" disabled={header.document_type === "AS" || Number(items.find((item) => item.id === Number(line.item_id))?.average_cost || 0) > 0} min="0" step="0.01" placeholder="Costo auto" type="number" value={line.unit_cost} onChange={(event) => update(line.key, { unit_cost: event.target.value })} /><button aria-label={`Eliminar línea ${index + 1}`} className="h-10 text-red-600" onClick={() => setLines((current) => current.filter((entry) => entry.key !== line.key))} type="button"><Trash2 className="mx-auto" size={16} /></button>
      </div>)}</div>
    </section>
    <div className="flex justify-end gap-2"><Link className="rounded border border-line px-4 py-2 text-sm" href="/dashboard/inventario/ajustes">Cancelar</Link><Button loading={saving} onClick={() => void submit()} type="button">{saving ? "Contabilizando ajuste…" : "Contabilizar ajuste"}</Button></div>
    {searchLine ? <ModalFrame title="Buscar SKU" onClose={() => setSearchLine(null)} maxWidth="md:max-w-3xl"><input autoFocus className="h-10 w-full rounded border border-line px-3" placeholder="Código, código anterior o nombre" value={search} onChange={(event) => setSearch(event.target.value)} /><div className="mt-3 max-h-[55vh] divide-y overflow-y-auto rounded border border-line">{results.map((item) => <button className="flex w-full justify-between p-3 text-left text-sm hover:bg-paper" key={item.id} onClick={() => choose(searchLine, item)} type="button"><span><b className="font-mono">{item.code}</b> · {item.name}</span><span>Costo {Number(item.average_cost || 0).toLocaleString("es-CO")}</span></button>)}</div></ModalFrame> : null}
  </div>;
}
