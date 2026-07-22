"use client";

import { FormEvent, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { ContabilidadNav } from "@/components/contabilidad-nav";

type Retention = { code: string; type: "retefuente" | "reteiva" | "reteica"; concept: string; percent: number; minimum_base: number; account_code: string; active: boolean };
type Supplier = { id: number; name: string; tax_id?: string | null };

const EMPTY = { code: "", type: "retefuente", concept: "", percent: 0, minimum_base: 0, account_code: "2365", active: true } as Retention;

export default function RetencionesPage() {
  const [rows, setRows] = useState<Retention[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [form, setForm] = useState<Retention>(EMPTY);
  const [supplierId, setSupplierId] = useState("");
  const [assigned, setAssigned] = useState<string[]>([]);
  const [message, setMessage] = useState("");

  async function load() {
    const [masters, parties] = await Promise.all([api<Retention[]>("/api/v1/accounting/retention-masters"), api<Supplier[]>("/api/v1/purchases/suppliers")]);
    setRows(masters); setSuppliers(parties);
  }
  useEffect(() => { void load(); }, []);

  async function loadAssignment(id: string) {
    setSupplierId(id);
    if (!id) return setAssigned([]);
    const result = await api<{ retention_codes: string[] }>(`/api/v1/accounting/suppliers/${id}/retentions`);
    setAssigned(result.retention_codes);
  }

  async function saveMaster(event: FormEvent) {
    event.preventDefault();
    await api("/api/v1/accounting/retention-masters", { method: "POST", body: JSON.stringify(form) });
    setForm(EMPTY); setMessage("Maestro de retencion guardado"); await load();
  }

  async function saveAssignment() {
    await api(`/api/v1/accounting/suppliers/${supplierId}/retentions`, { method: "PUT", body: JSON.stringify({ retention_codes: assigned }) });
    setMessage("Retenciones del proveedor actualizadas; Compras las heredara automaticamente");
  }

  return <div className="space-y-5">
    <header><p className="text-sm font-medium text-apex">Contabilidad</p><h1 className="text-3xl font-semibold">Retenciones tributarias</h1><p className="mt-1 text-sm text-neutral-600">Parametriza retefuente, reteIVA y reteICA, y enlazalas a cada proveedor.</p></header>
    <ContabilidadNav />
    {message ? <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p> : null}
    <form className="grid gap-3 rounded-md border border-line bg-white p-4 md:grid-cols-7" onSubmit={saveMaster}>
      <label className="text-sm">Codigo<input className="mt-1 h-10 w-full rounded-md border border-line px-2 uppercase" required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} /></label>
      <label className="text-sm">Tipo<select className="mt-1 h-10 w-full rounded-md border border-line px-2" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as Retention["type"] })}><option value="retefuente">ReteFuente</option><option value="reteiva">ReteIVA</option><option value="reteica">ReteICA</option></select></label>
      <label className="text-sm md:col-span-2">Concepto<input className="mt-1 h-10 w-full rounded-md border border-line px-2" required value={form.concept} onChange={(e) => setForm({ ...form, concept: e.target.value })} /></label>
      <label className="text-sm">Porcentaje<input className="mt-1 h-10 w-full rounded-md border border-line px-2" min="0" max="100" step="0.001" type="number" value={form.percent} onChange={(e) => setForm({ ...form, percent: Number(e.target.value) })} /></label>
      <label className="text-sm">Base minima<input className="mt-1 h-10 w-full rounded-md border border-line px-2" min="0" step="0.01" type="number" value={form.minimum_base} onChange={(e) => setForm({ ...form, minimum_base: Number(e.target.value) })} /></label>
      <label className="text-sm">Cuenta<input className="mt-1 h-10 w-full rounded-md border border-line px-2" required value={form.account_code} onChange={(e) => setForm({ ...form, account_code: e.target.value })} /></label>
      <button className="h-10 rounded-md bg-apex px-4 text-sm font-medium text-white md:col-start-7" type="submit">Guardar maestro</button>
    </form>
    <div className="overflow-x-auto rounded-md border border-line bg-white"><table className="w-full text-sm"><thead><tr className="border-b border-line text-left"><th className="p-3">Codigo</th><th>Tipo</th><th>Concepto</th><th>Porcentaje</th><th>Base minima</th><th>Cuenta</th></tr></thead><tbody>{rows.map((row) => <tr className="border-b border-line/60" key={row.code}><td className="p-3 font-mono">{row.code}</td><td>{row.type}</td><td>{row.concept}</td><td>{row.percent}%</td><td>{row.minimum_base}</td><td className="font-mono">{row.account_code}</td></tr>)}</tbody></table></div>
    <section className="rounded-md border border-line bg-white p-4"><h2 className="font-semibold">Asignacion por proveedor</h2><select className="mt-3 h-10 w-full max-w-xl rounded-md border border-line px-3" value={supplierId} onChange={(e) => void loadAssignment(e.target.value)}><option value="">Seleccione proveedor</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.tax_id ? `${supplier.tax_id} - ` : ""}{supplier.name}</option>)}</select>
      {supplierId ? <div className="mt-4 space-y-2">{rows.filter((row) => row.active !== false).map((row) => <label className="flex items-center gap-3 rounded-md bg-paper p-3 text-sm" key={row.code}><input checked={assigned.includes(row.code)} type="checkbox" onChange={(e) => setAssigned((current) => e.target.checked ? [...current, row.code] : current.filter((code) => code !== row.code))} /><span><strong>{row.code}</strong> · {row.concept} ({row.percent}%)</span></label>)}<button className="mt-2 h-10 rounded-md bg-apex px-4 text-sm font-medium text-white" onClick={() => void saveAssignment()} type="button">Guardar asignacion</button></div> : null}
    </section>
  </div>;
}
