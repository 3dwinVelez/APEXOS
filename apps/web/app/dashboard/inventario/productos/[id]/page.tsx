"use client";
import Link from "next/link";
import { use, useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, Pencil } from "lucide-react";
import { api } from "@/lib/api";
import { InventoryNav } from "@/components/inventory-nav";
import { InventorySearchSelect } from "@/components/inventory-ui";
import { InventoryGuidedForm } from "@/components/inventory-workflow";
import { ModalFrame } from "@/components/ui/ModalFrame";
import { showToast } from "@/components/system/ToastCenter";

type Item = { id: number; code: string; legacy_code?: string; name: string; type: string; unit: string; family_code?: string; society_code?: string; branch_code?: string; stock_current: number; active: boolean };
type Family = { code: string; name: string; active: boolean; society_code?: string; branch_code?: string };

export default function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [item, setItem] = useState<Item | null>(null), [families, setFamilies] = useState<Family[]>([]);
  const [error, setError] = useState(""), [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false), [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: "", legacy_code: "", unit: "UND", family_code: "", close: false });
  useEffect(() => { let active = true; void Promise.all([api<{ data: Item[] }>("/api/v1/inventory/items?all=true&active=all"), api<Family[]>("/api/v1/inventory/families?active=all")]).then(([items, rows]) => { if (!active) return; const record = items.data.find(row => row.id === Number(id)); if (!record) throw new Error("Producto no encontrado"); setItem(record); setFamilies(rows); }).catch(error => { if (active) setError(error.message); }); return () => { active = false; }; }, [id]);
  async function save(event: FormEvent) {
    event.preventDefault(); if (!item || saving || !item.active) return;
    setSaving(true); setError("");
    try {
      await api(`/api/v1/inventory/items/${item.id}`, { method: "PATCH", body: JSON.stringify({ name: form.name, legacy_code: form.legacy_code, unit: form.unit, family_code: form.family_code, ...(form.close ? { active: false } : {}) }) });
      const result = form.close ? "Producto cerrado; ya no admite operaciones" : "Producto actualizado";
      setItem({ ...item, ...form, active: form.close ? false : item.active }); setMessage(result); setEditing(false);
      showToast({ tone: "success", title: result, description: `${item.code} · ${form.name}` });
    } catch (error) { setError(error instanceof Error ? error.message : "No se pudo actualizar"); } finally { setSaving(false); }
  }
  if (!item) return <p role={error ? "alert" : "status"} className="p-6">{error || "Cargando producto…"}</p>;
  const availableFamilies = families.filter(row => row.active !== false && (!row.society_code || row.society_code === item.society_code) && (!row.branch_code || row.branch_code === item.branch_code));
  return <div className="space-y-4">
    <header className="flex flex-wrap items-start justify-between gap-3"><div><Link className="inline-flex items-center gap-2 text-sm text-apex" href="/dashboard/inventario/productos"><ArrowLeft size={15} />Productos</Link><h1 className="mt-2 text-2xl font-semibold">{item.code} · {item.name}</h1><p className="mt-1 text-sm text-content-muted">Ficha del producto · {item.active ? "Activo" : "Cerrado"}</p></div><button className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-apex px-4 text-sm font-semibold text-white disabled:opacity-40" type="button" disabled={!item.active} onClick={() => { setError(""); setForm({ name: item.name, legacy_code: item.legacy_code || "", unit: item.unit, family_code: item.family_code || "", close: false }); setEditing(true); }}><Pencil size={16} />Editar producto</button></header>
    <InventoryNav />
    {message ? <p role="status" className="rounded-lg border border-line bg-surface p-3 text-sm">{message}</p> : null}
    {error && !editing ? <p role="alert" className="text-sm text-rose-700">{error}</p> : null}
    <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[{ label: "Existencias actuales", value: `${item.stock_current} ${item.unit}` }, { label: "Sociedad / sucursal", value: [item.society_code, item.branch_code].filter(Boolean).join(" / ") || "Sin asignar" }, { label: "Familia", value: item.family_code || "Sin asignar" }, { label: "Código anterior", value: item.legacy_code || "Sin especificar" }].map(row => <div key={row.label} className="rounded-xl border border-line bg-surface p-4"><dt className="text-xs text-content-muted">{row.label}</dt><dd className="mt-2 break-words font-semibold">{row.value}</dd></div>)}</dl>
    {editing ? <ModalFrame title={`Editar producto · ${item.code}`} onClose={() => { if (!saving) setEditing(false); }} maxWidth="md:!max-w-3xl"><InventoryGuidedForm busy={saving} error={error} onSubmit={save} onCancel={() => setEditing(false)} submitLabel="Guardar cambios" steps={[{ title: "Datos del producto", description: "Actualice la identificación y la familia dentro de la unidad contable del producto.", content: <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm">Nombre<input required className="control mt-1" value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} /></label><label className="text-sm">Código anterior<input className="control mt-1" value={form.legacy_code} onChange={event => setForm({ ...form, legacy_code: event.target.value })} /></label><label className="text-sm">Unidad<input className="control mt-1" value={form.unit} onChange={event => setForm({ ...form, unit: event.target.value.toUpperCase() })} /></label><label className="text-sm">Familia<InventorySearchSelect className="control mt-1" value={form.family_code} onChange={event => setForm({ ...form, family_code: event.target.value })}>{availableFamilies.map(row => <option key={row.code} value={row.code}>{row.code} · {row.name}</option>)}</InventorySearchSelect></label><label className="flex items-start gap-2 rounded-lg border border-line bg-surface-muted p-3 text-sm sm:col-span-2"><input type="checkbox" checked={form.close} onChange={event => setForm({ ...form, close: event.target.checked })} /><span>Cerrar producto<span className="mt-1 block text-xs text-content-muted">Solo se permite sin stock ni órdenes de compra abiertas. El servidor valida estas condiciones antes de cerrar.</span></span></label></div> }]} /></ModalFrame> : null}
  </div>;
}
