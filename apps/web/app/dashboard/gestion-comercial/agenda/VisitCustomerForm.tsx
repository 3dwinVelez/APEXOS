"use client";
import { api } from "@/lib/api";
import { FormEvent, useEffect, useState } from "react";
type Category = { id: number; name: string };
const inputClass = "mt-1 h-10 w-full rounded-md border border-line bg-white px-3 text-sm";

export function VisitCustomerForm({ visitId, onCreated }: { visitId: number; onCreated: () => Promise<void> }) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [form, setForm] = useState({ code: "", legal_name: "", category_id: "", identification: "", email: "", phone: "", address: "", city: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { void api<Category[]>("/api/v1/commercial-management/customer-categories?active=true").then(setCategories).catch(e => setError(e.message)); }, []);
  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError("");
    try {
      await api(`/api/v1/commercial-management/visits/${visitId}/customer`, { method: "POST", body: JSON.stringify({ ...form, email: form.email || undefined, category_id: Number(form.category_id) }) });
      await onCreated();
    } catch (e) { setError(e instanceof Error ? e.message : "No fue posible crear el cliente."); }
    finally { setBusy(false); }
  }
  return <section className="apex-section-card p-4"><h2 className="text-lg font-semibold">Crear cliente durante la visita</h2><p className="mt-1 text-sm text-amber-800">Hasta vincular el cliente no se pueden generar cotizaciones ni pedidos. Se asignará al asesor de esta visita.</p><form onSubmit={save} className="mt-4 grid gap-3 sm:grid-cols-2">
    {([["code","Código"],["legal_name","Nombre / razón social"],["identification","NIT o cédula"],["phone","Celular"],["email","Correo"],["address","Dirección"],["city","Ciudad"]] as const).map(([key,label]) => <label key={key} className="text-sm font-medium">{label}<input required={key === "code" || key === "legal_name"} type={key === "email" ? "email" : "text"} className={inputClass} value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })}/></label>)}
    <label className="text-sm font-medium">Categoría<select required className={inputClass} value={form.category_id} onChange={e => setForm({...form, category_id:e.target.value})}><option value="">Seleccionar</option>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
    {error ? <p role="alert" className="text-sm text-red-700 sm:col-span-2">{error}</p> : null}<button type="submit" disabled={busy} className="apex-primary-action h-10 text-sm font-semibold sm:col-span-2">{busy ? "Guardando..." : "Crear cliente y vincular a la visita"}</button>
  </form></section>;
}
