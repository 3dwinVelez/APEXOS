"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { ContabilidadNav } from "@/components/contabilidad-nav";
import { ModalFrame } from "@/components/ui/ModalFrame";
import { ZeroFriendlyNumberInput } from "@/components/ui/ZeroFriendlyNumberInput";

type Scope = "purchases" | "sales";
type Retention = { id?: number; code: string; type: "retefuente" | "reteiva" | "reteica"; concept: string; percent: number; minimum_base: number; account_code: string; active: boolean };
type Account = { code: string; name: string; active: boolean; allows_tx: boolean; handles_tax?: boolean };
const empty = (): Retention => ({ code: "", type: "retefuente", concept: "", percent: 0, minimum_base: 0, account_code: "2365", active: true });

export default function RetencionesPage() {
  const [scope, setScope] = useState<Scope>("purchases");
  const [rows, setRows] = useState<Retention[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [form, setForm] = useState<Retention>(empty());
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingCode, setEditingCode] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async (nextScope = scope) => {
    const [masters, accountRows] = await Promise.all([
      api<Retention[]>(`/api/v1/accounting/retention-masters?scope=${nextScope}`),
      api<Account[]>("/api/v1/accounting/accounts?active=true&limit=1000")
    ]);
    setRows(masters);
    setAccounts(accountRows.filter((row) => row.active !== false && row.allows_tx !== false && (row.handles_tax || ["1355", "2365", "2367", "2368", "2408"].some((prefix) => row.code.startsWith(prefix)))));
  }, [scope]);
  useEffect(() => { void load(); }, [load]);

  function resetForm() { setForm(empty()); setEditingId(null); setEditingCode(""); setModalOpen(false); }
  function create() { setForm(empty()); setEditingId(null); setEditingCode(""); setMessage(""); setModalOpen(true); }
  function changeScope(next: Scope) { setScope(next); resetForm(); setMessage(""); }
  function edit(row: Retention) {
    setForm({ ...row });
    setEditingId(row.id || null);
    setEditingCode(row.code);
    setMessage("");
    setModalOpen(true);
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    const payload = { ...form, description: form.concept, retention_type: form.type, scope };
    await api(editingId ? `/api/v1/accounting/retention-masters/${editingId}` : "/api/v1/accounting/retention-masters", {
      method: editingId ? "PUT" : "POST", body: JSON.stringify(payload)
    });
    resetForm(); setMessage("Maestro de retención guardado"); await load();
  }
  async function remove(row: Retention) {
    if (!window.confirm(`¿Eliminar la retención ${row.code}? Si tiene movimientos se desactivará para conservar el historial.`)) return;
    const result = await api<Retention[]>(`/api/v1/accounting/retention-masters/${encodeURIComponent(row.code)}?scope=${scope}`, { method: "DELETE" });
    const retained = result.find((item) => item.code === row.code);
    setRows(result); resetForm();
    setMessage(retained?.active === false ? "La retención tenía movimientos y fue desactivada." : "Retención eliminada.");
  }

  return <div className="space-y-5">
    <header><p className="text-sm font-medium text-apex">Contabilidad</p><div className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-3xl font-semibold">Retenciones tributarias</h1><p className="mt-1 text-sm text-neutral-600">Parametriza retefuente, reteIVA y reteICA para compras o ventas.</p></div><div className="flex gap-2"><Link className="rounded-md border border-line bg-white px-4 py-2 text-sm" href="/dashboard/contabilidad/iva">Configurar IVA</Link><button className="rounded-md bg-apex px-4 py-2 text-sm font-medium text-white" onClick={create} type="button">Crear retención</button></div></div></header>
    <ContabilidadNav />
    <div className="flex gap-2 border-b border-line" role="tablist"><button className={`px-4 py-2 text-sm font-medium ${scope === "purchases" ? "border-b-2 border-apex text-apex" : "text-neutral-500"}`} onClick={() => changeScope("purchases")} type="button">Retenciones de compras</button><button className={`px-4 py-2 text-sm font-medium ${scope === "sales" ? "border-b-2 border-apex text-apex" : "text-neutral-500"}`} onClick={() => changeScope("sales")} type="button">Retenciones de ventas</button></div>
    {message ? <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p> : null}
    {modalOpen ? <ModalFrame maxWidth="md:max-w-4xl" onClose={resetForm} title={editingCode ? `Editar retención ${editingCode}` : "Crear retención"}><form className="grid gap-4 md:grid-cols-2" onSubmit={save}>
      <label className="text-sm">Código<input className="mt-1 h-10 w-full rounded-md border border-line px-2 uppercase disabled:bg-neutral-100" disabled={Boolean(editingCode)} required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} /></label>
      <label className="text-sm">Tipo<select className="mt-1 h-10 w-full rounded-md border border-line px-2" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as Retention["type"] })}><option value="retefuente">ReteFuente</option><option value="reteiva">ReteIVA</option><option value="reteica">ReteICA</option></select></label>
      <label className="text-sm md:col-span-2">Concepto<input className="mt-1 h-10 w-full rounded-md border border-line px-2" required value={form.concept} onChange={(e) => setForm({ ...form, concept: e.target.value })} /></label>
      <label className="text-sm">Porcentaje<ZeroFriendlyNumberInput className="mt-1 h-10 w-full rounded-md border border-line px-2" min="0" max="100" step="0.001" value={form.percent} onValueChange={(value) => setForm({ ...form, percent: value })} /></label>
      <label className="text-sm">Base mínima<ZeroFriendlyNumberInput className="mt-1 h-10 w-full rounded-md border border-line px-2" min="0" step="0.01" value={form.minimum_base} onValueChange={(value) => setForm({ ...form, minimum_base: value })} /></label>
      <label className="text-sm">Cuenta contable<select className="mt-1 h-10 w-full rounded-md border border-line px-2" required value={form.account_code} onChange={(e) => setForm({ ...form, account_code: e.target.value })}><option value="">Seleccione del PUCC</option>{accounts.map((account) => <option key={account.code} value={account.code}>{account.code} - {account.name}</option>)}</select></label>
      <div className="flex justify-end gap-2 border-t border-line pt-4 md:col-span-2"><button className="h-10 rounded-md border border-line px-4 text-sm" onClick={resetForm} type="button">Cancelar</button><button className="h-10 rounded-md bg-apex px-4 text-sm font-medium text-white" type="submit">{editingCode ? "Guardar cambios" : "Crear retención"}</button></div>
    </form></ModalFrame> : null}
    <div className="overflow-x-auto rounded-md border border-line bg-white"><table className="w-full text-sm"><thead><tr className="border-b border-line text-left"><th className="p-3">Código</th><th>Tipo</th><th>Concepto</th><th>Porcentaje</th><th>Base mínima</th><th>Cuenta</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>{rows.map((row) => <tr className="border-b border-line/60" key={row.code}><td className="p-3 font-mono">{row.code}</td><td>{row.type}</td><td>{row.concept}</td><td>{row.percent}%</td><td>{row.minimum_base}</td><td className="font-mono">{row.account_code}</td><td>{row.active !== false ? "Activo" : "Inactivo"}</td><td><div className="flex gap-2"><button className="text-apex underline" onClick={() => edit(row)} type="button">Editar</button><button className="text-red-600 underline" onClick={() => void remove(row)} type="button">Eliminar</button></div></td></tr>)}</tbody></table></div>
  </div>;
}
