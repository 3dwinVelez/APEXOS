"use client";

import { api } from "@/lib/api";
import { ArrowLeft, Plus, Save } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

type Part = { id?: number; name: string; quantity: number; unit: string; description: string };
type ServiceReference = { id: number; code: string; name: string; category: string; description: string; estimated_minutes: number; brand: string; model: string; active: boolean; parts: Part[]; total_pieces: number };

const categories = ["muebles", "colchones", "electrodomesticos", "cocina", "oficina", "decoracion", "iluminacion", "textiles", "otros"];

export default function ServiceReferencesPage() {
  const [references, setReferences] = useState<ServiceReference[]>([]);
  const [selected, setSelected] = useState<ServiceReference | null>(null);
  const [category, setCategory] = useState("");
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({ code: "", name: "", category: "muebles", description: "", estimated_minutes: 60, brand: "", model: "", active: true, parts: [{ name: "", quantity: 1, unit: "und", description: "" }] as Part[] });

  async function load() {
    setReferences(await api<ServiceReference[]>(`/api/v1/services/references${category ? `category=${category}` : ""}`));
  }

  useEffect(() => {
    load().catch(() => undefined);
  }, [category]);

  function reset() {
    setSelected(null);
    setForm({ code: "", name: "", category: "muebles", description: "", estimated_minutes: 60, brand: "", model: "", active: true, parts: [{ name: "", quantity: 1, unit: "und", description: "" }] });
  }

  function edit(reference: ServiceReference) {
    setSelected(reference);
    setForm({
      code: reference.code,
      name: reference.name,
      category: reference.category,
      description: reference.description || "",
      estimated_minutes: reference.estimated_minutes,
      brand: reference.brand || "",
      model: reference.model || "",
      active: reference.active,
      parts: reference.parts.length ? reference.parts.map((part) => ({ name: part.name, quantity: part.quantity, unit: part.unit, description: part.description || "" })) : [{ name: "", quantity: 1, unit: "und", description: "" }]
    });
  }

  async function save() {
    if (!form.code || !form.name || form.parts.some((part) => !part.name)) {
      setMessage("Codigo, nombre y piezas son obligatorios.");
      return;
    }
    const path = selected ? `/api/v1/services/references/${selected.id}` : "/api/v1/services/references";
    await api<ServiceReference>(path, { method: selected ? "PUT" : "POST", body: JSON.stringify(form) });
    setMessage(selected ? "Referencia actualizada." : "Referencia creada.");
    reset();
    await load();
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link className="mb-3 inline-flex items-center gap-2 text-sm font-medium text-neutral-600 hover:text-apex" href="/dashboard/servicios"><ArrowLeft size={16} /> Volver a servicios</Link>
          <p className="text-sm font-medium text-apex">Servicios</p>
          <h1 className="text-3xl font-semibold">Referencias de servicio</h1>
          <p className="mt-2 max-w-3xl text-sm text-neutral-600">Maestro espejo del legacy para categorias, tiempos estimados y piezas de inspeccion.</p>
        </div>
        <button className="inline-flex h-10 items-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-medium hover:bg-paper" onClick={reset} type="button"><Plus size={16} /> Nueva referencia</button>
      </header>

      {message ? <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{message}</div> : null}

      <section className="grid gap-5 xl:grid-cols-[420px_1fr]">
        <aside className="rounded-md border border-line bg-white p-4">
          <h2 className="mb-3 text-base font-semibold">{selected ? "Editar referencia" : "Nueva referencia"}</h2>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <input className="h-10 rounded-md border border-line px-3 text-sm" placeholder="Codigo *" value={form.code} onChange={(event) => setForm((prev) => ({ ...prev, code: event.target.value.toUpperCase() }))} />
              <select className="h-10 rounded-md border border-line px-3 text-sm" value={form.category} onChange={(event) => setForm((prev) => ({ ...prev, category: event.target.value }))}>
                {categories.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </div>
            <input className="h-10 w-full rounded-md border border-line px-3 text-sm" placeholder="Nombre *" value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} />
            <div className="grid grid-cols-3 gap-2">
              <input className="h-10 rounded-md border border-line px-3 text-sm" placeholder="Marca" value={form.brand} onChange={(event) => setForm((prev) => ({ ...prev, brand: event.target.value }))} />
              <input className="h-10 rounded-md border border-line px-3 text-sm" placeholder="Modelo" value={form.model} onChange={(event) => setForm((prev) => ({ ...prev, model: event.target.value }))} />
              <input className="h-10 rounded-md border border-line px-3 text-sm" type="number" value={form.estimated_minutes} onChange={(event) => setForm((prev) => ({ ...prev, estimated_minutes: Number(event.target.value) }))} />
            </div>
            <textarea className="min-h-20 w-full rounded-md border border-line px-3 py-2 text-sm" placeholder="Descripcion" value={form.description} onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))} />
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase text-neutral-500">Piezas</p>
                <button className="text-xs font-semibold text-apex" onClick={() => setForm((prev) => ({ ...prev, parts: [...prev.parts, { name: "", quantity: 1, unit: "und", description: "" }] }))} type="button">Agregar</button>
              </div>
              {form.parts.map((part, index) => (
                <div className="grid grid-cols-[1fr_64px_64px] gap-2" key={index}>
                  <input className="h-10 rounded-md border border-line px-3 text-sm" placeholder="Pieza" value={part.name} onChange={(event) => setForm((prev) => ({ ...prev, parts: prev.parts.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item) }))} />
                  <input className="h-10 rounded-md border border-line px-2 text-sm" type="number" value={part.quantity} onChange={(event) => setForm((prev) => ({ ...prev, parts: prev.parts.map((item, itemIndex) => itemIndex === index ? { ...item, quantity: Number(event.target.value) } : item) }))} />
                  <input className="h-10 rounded-md border border-line px-2 text-sm" value={part.unit} onChange={(event) => setForm((prev) => ({ ...prev, parts: prev.parts.map((item, itemIndex) => itemIndex === index ? { ...item, unit: event.target.value } : item) }))} />
                </div>
              ))}
            </div>
            <button className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-apex text-sm font-semibold text-white" onClick={save} type="button"><Save size={16} /> Guardar referencia</button>
          </div>
        </aside>

        <section className="rounded-md border border-line bg-white p-4">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div><h2 className="text-base font-semibold">Maestro</h2><p className="text-sm text-neutral-500">{references.length} referencia(s)</p></div>
            <select className="h-10 rounded-md border border-line px-3 text-sm" value={category} onChange={(event) => setCategory(event.target.value)}>
              <option value="">Todas las categorias</option>
              {categories.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {references.map((reference) => (
              <button className={`rounded-md border p-4 text-left hover:bg-paper ${selected.id === reference.id ? "border-apex" : "border-line"}`} key={reference.id} onClick={() => edit(reference)} type="button">
                <div className="mb-2 flex items-center justify-between gap-2"><span className="text-xs font-semibold text-apex">{reference.category}</span><span className="rounded-md bg-paper px-2 py-1 text-xs">{reference.code}</span></div>
                <h3 className="font-semibold">{reference.name}</h3>
                <p className="mt-1 text-sm text-neutral-500">{reference.parts.length} pieza(s) · {reference.estimated_minutes} min</p>
              </button>
            ))}
          </div>
        </section>
      </section>
    </div>
  );
}
