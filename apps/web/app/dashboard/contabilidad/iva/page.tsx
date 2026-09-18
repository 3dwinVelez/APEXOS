"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { ContabilidadNav } from "@/components/contabilidad-nav";
import { ModalFrame } from "@/components/ui/ModalFrame";
import { ZeroFriendlyNumberInput } from "@/components/ui/ZeroFriendlyNumberInput";

type Scope = "purchases" | "sales";
type Vat = { code: string; concept: string; percent: number; account_code: string; active: boolean; scope: Scope };
type Account = { code: string; name: string; active: boolean; allows_tx: boolean; handles_tax?: boolean };
const empty = (scope: Scope): Vat => ({ code: "", concept: "", percent: 0, account_code: "", active: true, scope });

export default function IvaPage() {
  const [scope, setScope] = useState<Scope>("purchases");
  const [rows, setRows] = useState<Vat[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [form, setForm] = useState<Vat>(empty("purchases"));
  const [editing, setEditing] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [message, setMessage] = useState("");
  const load = useCallback(async (nextScope = scope) => {
    const [vats, accountRows] = await Promise.all([api<Vat[]>(`/api/v1/accounting/vat-masters?scope=${nextScope}`), api<Account[]>("/api/v1/accounting/accounts?active=true&limit=1000")]);
    setRows(vats); setAccounts(accountRows.filter((row) => row.active !== false && row.allows_tx !== false && (row.handles_tax || row.code.startsWith("2408"))));
  }, [scope]);
  useEffect(() => { void load(); }, [load]);
  function reset() { setForm(empty(scope)); setEditing(false); setModalOpen(false); }
  function create() { setForm(empty(scope)); setEditing(false); setMessage(""); setModalOpen(true); }
  function changeScope(next: Scope) { setScope(next); setForm(empty(next)); setEditing(false); setMessage(""); }
  async function save(event: FormEvent) { event.preventDefault(); await api("/api/v1/accounting/vat-masters", { method: "POST", body: JSON.stringify({ ...form, scope, percent: Number(form.percent) }) }); reset(); setMessage("Maestro de IVA guardado"); await load(); }
  function edit(row: Vat) { setForm({ ...row }); setEditing(true); setMessage(""); setModalOpen(true); }
  async function remove(row: Vat) {
    if (!window.confirm(`¿Eliminar el IVA ${row.code}? Si tiene movimientos se desactivará para conservar el historial.`)) return;
    const result = await api<Vat[]>(`/api/v1/accounting/vat-masters/${encodeURIComponent(row.code)}?scope=${scope}`, { method: "DELETE" });
    const retained = result.find((item) => item.code === row.code); setRows(result); reset();
    setMessage(retained?.active === false ? "El IVA tenía movimientos y fue desactivado." : "IVA eliminado.");
  }
  return <div className="space-y-5">
    <header><p className="text-sm font-medium text-apex">Contabilidad</p><div className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-3xl font-semibold">Maestro de IVA</h1><p className="mt-1 text-sm text-neutral-600">Configura códigos, porcentajes y cuentas separados para Compras y Ventas.</p></div><button className="rounded-md bg-apex px-4 py-2 text-sm font-medium text-white" onClick={create} type="button">Crear IVA</button></div></header>
    <ContabilidadNav />
    <div className="flex gap-2 border-b border-line"><button className={`px-4 py-2 text-sm ${scope === "purchases" ? "border-b-2 border-apex text-apex" : "text-neutral-500"}`} onClick={() => changeScope("purchases")} type="button">IVA de compras</button><button className={`px-4 py-2 text-sm ${scope === "sales" ? "border-b-2 border-apex text-apex" : "text-neutral-500"}`} onClick={() => changeScope("sales")} type="button">IVA de ventas</button></div>
    {message ? <p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p> : null}
    {modalOpen ? <ModalFrame onClose={reset} title={editing ? `Editar IVA ${form.code}` : "Crear IVA"}><form className="grid gap-4 md:grid-cols-2" onSubmit={save}>
      <label className="text-sm">Código<input className="mt-1 h-10 w-full rounded-md border border-line px-3 uppercase disabled:bg-neutral-100" disabled={editing} required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} /></label>
      <label className="text-sm">Nombre<input className="mt-1 h-10 w-full rounded-md border border-line px-3" required value={form.concept} onChange={(e) => setForm({ ...form, concept: e.target.value })} /></label>
      <label className="text-sm">Porcentaje<ZeroFriendlyNumberInput className="mt-1 h-10 w-full rounded-md border border-line px-3" min="0" max="100" step="0.001" value={form.percent} onValueChange={(value) => setForm({ ...form, percent: value })} /></label>
      <label className="text-sm">Cuenta contable<select className="mt-1 h-10 w-full rounded-md border border-line px-3" required value={form.account_code} onChange={(e) => setForm({ ...form, account_code: e.target.value })}><option value="">Seleccione del PUCC</option>{accounts.map((row) => <option key={row.code} value={row.code}>{row.code} - {row.name}</option>)}</select></label>
      <div className="flex justify-end gap-2 border-t border-line pt-4 md:col-span-2"><button className="h-10 rounded-md border border-line px-4 text-sm" onClick={reset} type="button">Cancelar</button><button className="h-10 rounded-md bg-apex px-4 text-sm font-medium text-white" type="submit">{editing ? "Guardar cambios" : "Crear IVA"}</button></div>
    </form></ModalFrame> : null}
    <div className="overflow-x-auto rounded-md border border-line bg-white"><table className="w-full text-sm"><thead><tr className="border-b border-line text-left"><th className="p-3">Código</th><th>Nombre</th><th>Porcentaje</th><th>Cuenta</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>{rows.map((row) => <tr className="border-b border-line/60" key={row.code}><td className="p-3 font-mono">{row.code}</td><td>{row.concept}</td><td>{row.percent}%</td><td className="font-mono">{row.account_code}</td><td>{row.active !== false ? "Activo" : "Inactivo"}</td><td><div className="flex gap-2"><button className="text-apex underline" onClick={() => edit(row)} type="button">Editar</button><button className="text-red-600 underline" onClick={() => void remove(row)} type="button">Eliminar</button></div></td></tr>)}</tbody></table></div>
  </div>;
}
