"use client";
import { InventorySearchSelect } from "@/components/inventory-ui";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { InventoryNav } from "@/components/inventory-nav";
import { InventoryGuidedForm } from "@/components/inventory-workflow";
import { ModalFrame } from "@/components/ui/ModalFrame";
import { Button } from "@/components/ui/button";
import { showToast } from "@/components/system/ToastCenter";

type Kind = "category" | "subcategory" | "line" | "subline" | "brand" | "reference";
type Row = { id: number; name: string; type: Kind; parent_id?: number | null; parent?: { id: number; name: string } | null };
type ClassificationForm = { id: number; name: string; type: Kind; parent_id: number };

const labels: Record<Kind, string> = {
  category: "Categoria",
  subcategory: "Subcategoria",
  line: "Linea",
  subline: "Sublinea",
  brand: "Marca",
  reference: "Referencia"
};
const parentType: Partial<Record<Kind, Kind>> = { subcategory: "category", line: "subcategory", subline: "line" };
const emptyForm = (): ClassificationForm => ({ id: 0, name: "", type: "category", parent_id: 0 });

export default function Page() {
  const [editorOpen, setEditorOpen] = useState(false), [query, setQuery] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [form, setForm] = useState<ClassificationForm>(emptyForm);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    setRows(await api<Row[]>("/api/v1/inventory/classifications"));
  }

  useEffect(() => {
    void load().catch((loadError) => setError(loadError instanceof Error ? loadError.message : "No se pudieron cargar las clasificaciones"));
  }, []);

  const parents = useMemo(() => rows.filter((row) => row.type === parentType[form.type]), [form.type, rows]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    setOk("");
    try {
      const editing = Boolean(form.id);
      await api(form.id ? `/api/v1/inventory/classifications/${form.id}` : "/api/v1/inventory/classifications", {
        method: form.id ? "PUT" : "POST",
        body: JSON.stringify({ type: form.type, name: form.name, parent_id: parentType[form.type] ? form.parent_id : null })
      });
      setForm(emptyForm());
      setOk("Clasificacion guardada"); setEditorOpen(false);
      showToast({ tone: "success", title: editing ? "Clasificación actualizada" : "Clasificación creada", description: `${form.name} quedó guardada en el árbol de productos.` });
      await load();
    } catch (saveError) {
      const detail = saveError instanceof Error ? saveError.message : "No se pudo guardar";
      setError(detail);
      showToast({ tone: "error", title: "No se pudo guardar la clasificación", description: detail });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <header>
        <p className="text-sm font-medium text-apex">Inventario</p>
        <h1 className="text-3xl font-semibold">Árbol de clasificación</h1>
        <p className="text-sm text-content-body">Categoria → subcategoria → linea → sublinea. Marca y referencia son independientes.</p>
      </header>
      <InventoryNav />
      <div className="flex flex-wrap items-center justify-between gap-3"><label className="text-sm">Buscar clasificación<input className="mt-1 h-10 w-full rounded-lg border border-line bg-surface px-3 sm:w-80" type="search" value={query} onChange={event => setQuery(event.target.value)} /></label><Button type="button" onClick={() => { setForm(emptyForm()); setError(""); setEditorOpen(true); }}>Nueva clasificación</Button></div>
      {error ? <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</p> : null}
      {ok ? <p aria-live="polite" className="rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700" role="status">{ok}</p> : null}
      {editorOpen ? <ModalFrame title={form.id ? "Editar clasificación" : "Nueva clasificación"} onClose={() => { if (!saving) setEditorOpen(false); }} maxWidth="md:!max-w-2xl"><InventoryGuidedForm key={form.id || "new"} error={error} busy={saving} onSubmit={save} onCancel={() => setEditorOpen(false)} submitLabel="Guardar clasificación" steps={[{ title: "Clasificación", description: "Elija el nivel y su relación con el árbol de productos.", content: <div className="grid gap-4 sm:grid-cols-2">        <label className="text-sm">Nivel
          <InventorySearchSelect className="control mt-1" value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value as Kind, parent_id: 0 })}>
            {Object.entries(labels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </InventorySearchSelect>
        </label>
        <label className="text-sm">Nombre
          <input className="control mt-1" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
        </label>
        <label className="text-sm">Padre
          <InventorySearchSelect className="control mt-1" disabled={!parentType[form.type]} required={Boolean(parentType[form.type])} value={form.parent_id || ""} onChange={(event) => setForm({ ...form, parent_id: Number(event.target.value) })}>
            <option value="">Seleccionar</option>
            {parents.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
          </InventorySearchSelect>
        </label>
</div> }]} /></ModalFrame> : null}
      <section className="overflow-x-auto rounded border border-line bg-surface">
        <table className="w-full text-sm">
          <thead><tr className="border-b bg-paper text-left"><th className="p-3">Nivel</th><th>Nombre</th><th>Padre</th><th className="pr-3 text-right">Accion</th></tr></thead>
          <tbody>{rows.filter(row => [row.name, labels[row.type], row.parent?.name].join(" ").toLowerCase().includes(query.trim().toLowerCase())).map((row) => <tr className="border-b" key={row.id}><td className="p-3">{labels[row.type]}</td><td>{row.name}</td><td>{row.parent?.name || "--"}</td><td className="pr-3 text-right"><button className="rounded border border-line px-3 py-2" disabled={saving} onClick={() => { setForm({ id: row.id, name: row.name, type: row.type, parent_id: row.parent_id || 0 }); setError(""); setEditorOpen(true); }} type="button">Editar</button></td></tr>)}</tbody>
        </table>
      </section>
    </div>
  );
}
