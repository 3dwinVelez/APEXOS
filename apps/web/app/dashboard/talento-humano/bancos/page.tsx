"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";

type Bank = { code: string; name: string; swift: string; active: boolean };
const empty: Bank = { code: "", name: "", swift: "", active: true };
export default function BanksPage() {
  const [rows, setRows] = useState<Bank[]>([]);
  const [form, setForm] = useState<Bank>(empty);
  const [editing, setEditing] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function load() { setRows(await api<Bank[]>("/api/v1/talento-humano/bancos", { cache: "no-store" })); }
  useEffect(() => { load().catch(error => setMessage(error.message)); }, []);
  async function save(event: React.FormEvent) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setMessage("");
    try {
      await api(`/api/v1/talento-humano/bancos${editing ? `/${editing}` : ""}`, { method: editing ? "PATCH" : "POST", body: JSON.stringify(form) });
      await load(); setEditing(""); setForm(empty); setMessage("Banco guardado.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "No se pudo guardar el banco."); }
    finally { setBusy(false); }
  }
  return <div className="space-y-4">
    <header className="rounded-md border border-line bg-white p-4">
      <Link href="/dashboard/talento-humano" className="text-sm text-apex">Talento Humano</Link>
      <h1 className="text-2xl font-semibold">Maestro de bancos</h1>
      <p className="mt-1 text-sm text-neutral-600">Bancos disponibles para las cuentas de los empleados de esta empresa.</p>
      <Link href="/dashboard/talento-humano/empleados" className="mt-2 inline-block text-sm font-semibold text-apex">Ir al maestro de empleados</Link>
    </header>
    <form onSubmit={save} className="rounded-md border border-line bg-white p-4">
      <h2 className="font-semibold">{editing ? "Editar banco" : "Agregar banco"}</h2>
      <fieldset disabled={busy} className="mt-3 grid gap-3 md:grid-cols-3">
        <label className="text-sm">Codigo nacional ACH<input aria-label="Codigo nacional ACH" required pattern="[0-9]{3}" maxLength={3} disabled={Boolean(editing)} className="mt-1 h-10 w-full rounded-md border border-line px-3" value={form.code} onChange={event => setForm({ ...form, code: event.target.value })} /><span className="text-xs text-neutral-500">Tres digitos, incluidos los ceros iniciales.</span></label>
        <label className="text-sm">Nombre del banco<input aria-label="Nombre del banco" required maxLength={120} className="mt-1 h-10 w-full rounded-md border border-line px-3" value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} /></label>
        <label className="text-sm">SWIFT / BIC (opcional)<input aria-label="SWIFT / BIC" maxLength={11} pattern="[A-Za-z]{6}[A-Za-z0-9]{2}([A-Za-z0-9]{3})?" className="mt-1 h-10 w-full rounded-md border border-line px-3" value={form.swift} onChange={event => setForm({ ...form, swift: event.target.value.toUpperCase() })} /></label>
        <label className="flex items-center gap-2 text-sm"><input aria-label="Banco activo" type="checkbox" checked={form.active} onChange={event => setForm({ ...form, active: event.target.checked })} />Banco activo</label>
        <div className="flex gap-2 md:col-span-2"><button disabled={busy} type="submit" className="rounded-md bg-apex px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{busy ? "Guardando..." : "Guardar banco"}</button>{editing ? <button type="button" className="rounded-md border border-line px-4 py-2 text-sm" onClick={() => { setEditing(""); setForm(empty); }}>Cancelar edicion</button> : null}</div>
      </fieldset>
      <p className="mt-3 text-sm" role="status">{message}</p>
    </form>
    <section className="overflow-x-auto rounded-md border border-line bg-white p-4">
      <h2 className="mb-3 font-semibold">Bancos registrados</h2>
      <table className="w-full text-left text-sm"><thead className="bg-paper"><tr><th className="p-3">Codigo nacional</th><th className="p-3">Banco</th><th className="p-3">SWIFT / BIC</th><th className="p-3">Estado</th><th className="p-3">Accion</th></tr></thead><tbody>{rows.map(bank => <tr key={bank.code} data-bank-code={bank.code} className="border-t border-line"><td className="p-3 font-mono">{bank.code}</td><td className="p-3">{bank.name}</td><td className="p-3">{bank.swift || "Sin registrar"}</td><td className="p-3">{bank.active ? "Activo" : "Inactivo"}</td><td className="p-3"><button disabled={busy} type="button" aria-label={`Editar banco ${bank.code}`} className="rounded-md border border-line px-3 py-1" onClick={() => { setEditing(bank.code); setForm({ ...bank }); setMessage(""); }}>Editar</button></td></tr>)}</tbody></table>
      <p className="mt-3 text-xs text-neutral-500">Desactiva los bancos que ya no utilices. Las fichas que los tienen asociados conservan sus datos.</p>
    </section>
  </div>;
}
