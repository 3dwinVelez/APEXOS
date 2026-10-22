"use client";

import { useState } from "react";
import { CheckCircle2, Download, FileSpreadsheet, Upload } from "lucide-react";
import { api } from "@/lib/api";
import { API_BASE_URL } from "@/lib/apiBaseUrl";
import { ContabilidadNav } from "@/components/contabilidad-nav";

type Preview = { valid: boolean; file_hash: string; posting_date: string; society_code: string; lines: Array<{ excel_row: number; account_code: string; branch_code: string; cost_center_code: string; party_tax_id?: string | null; movement: string; amount: number }>; totals: { lines: number; debit: number; credit: number } };
type Posted = { reference: string; accounting_document: { id: number; full_number: string }; lines: number; total_debit: number; total_credit: number };

function money(value: number) { return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 2 }).format(value || 0); }
function formatUtcDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${day}/${month}/${date.getUTCFullYear()}`;
}

export default function ImportarSaldosInicialesPage() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [posted, setPosted] = useState<Posted | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function send(path: string) {
    if (!file) throw new Error("Selecciona la plantilla diligenciada.");
    const form = new FormData(); form.append("file", file);
    return api<Preview | Posted>(path, { method: "POST", body: form });
  }
  async function downloadTemplate() {
    setError("");
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`${API_BASE_URL}/api/v1/accounting/opening-balances/template`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!response.ok) throw new Error("No se pudo descargar la plantilla");
      const blob = await response.blob(); const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = "plantilla-saldos-iniciales.xlsx"; anchor.click(); URL.revokeObjectURL(url);
    } catch (err) { setError(err instanceof Error ? err.message : "No se pudo descargar la plantilla"); }
  }
  async function validate() {
    if (busy) return;
    setBusy(true); setError(""); setPosted(null);
    try { setPreview(await send("/api/v1/accounting/opening-balances/validate") as Preview); } catch (err) { setPreview(null); setError(err instanceof Error ? err.message : "No se pudo validar la plantilla"); } finally { setBusy(false); }
  }
  async function post() {
    if (!preview || busy) return;
    if (!window.confirm(`Confirmar saldos iniciales por ${money(preview.totals.debit)} en ${preview.totals.lines} lineas?`)) return;
    setBusy(true); setError("");
    try { setPosted(await send("/api/v1/accounting/opening-balances") as Posted); setPreview(null); setFile(null); } catch (err) { setError(err instanceof Error ? err.message : "No se pudo contabilizar"); } finally { setBusy(false); }
  }

  return <div className="space-y-5">
    <header><p className="text-sm font-medium text-apex">Contabilidad</p><h1 className="text-3xl font-semibold">Importar saldos iniciales</h1><p className="mt-1 text-sm text-neutral-600">Carga saldos históricos a una fecha de corte. Positivo es débito y negativo es crédito.</p></header>
    <ContabilidadNav />
    {error ? <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</p> : null}
    {posted ? <p className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800" role="status"><CheckCircle2 size={18} /> Saldos contabilizados en {posted.accounting_document.full_number} ({posted.lines} líneas).</p> : null}
    <section className="grid gap-4 lg:grid-cols-3">
      <article className="rounded-md border border-line bg-white p-4"><Download className="text-apex" size={20} /><h2 className="mt-3 font-semibold">1. Descargar plantilla</h2><p className="mt-1 text-sm text-neutral-500">Incluye fecha de corte, cuenta, centro, sucursal, saldo y tercero opcional.</p><button className="mt-3 h-10 rounded-md border border-apex px-4 text-sm text-apex" onClick={() => void downloadTemplate()} type="button">Descargar Excel</button></article>
      <article className="rounded-md border border-line bg-white p-4"><FileSpreadsheet className="text-apex" size={20} /><h2 className="mt-3 font-semibold">2. Validar y previsualizar</h2><input accept=".xlsx" className="mt-3 block w-full text-sm" disabled={busy} onChange={(event) => { setFile(event.target.files?.[0] || null); setPreview(null); setPosted(null); setError(""); }} type="file" /><button className="mt-3 h-10 rounded-md border border-line px-4 text-sm disabled:opacity-50" disabled={!file || busy} onClick={() => void validate()} type="button">{busy ? "Procesando…" : "Validar plantilla"}</button></article>
      <article className="rounded-md border border-line bg-white p-4"><Upload className="text-apex" size={20} /><h2 className="mt-3 font-semibold">3. Confirmar</h2><p className="mt-1 text-sm text-neutral-500">Solo se habilita cuando todos los saldos cuadran y los maestros son válidos.</p><button className="mt-3 h-10 rounded-md bg-apex px-4 text-sm font-medium text-white disabled:opacity-50" disabled={!preview || busy} onClick={() => void post()} type="button">Confirmar contabilización</button></article>
    </section>
    {preview ? <section className="rounded-md border border-line bg-white p-4"><h2 className="font-semibold">Validación correcta</h2><p className="mt-1 text-sm text-neutral-600">Sociedad {preview.society_code} · Fecha {formatUtcDate(preview.posting_date)} · Débito {money(preview.totals.debit)} · Crédito {money(preview.totals.credit)}</p><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead><tr className="border-b border-line bg-paper text-left"><th className="p-2">Fila</th><th>Cuenta</th><th>Sucursal</th><th>Centro</th><th>Tercero</th><th>Movimiento</th><th className="text-right">Valor</th></tr></thead><tbody>{preview.lines.map((row) => <tr className="border-b border-line/70" key={`${row.excel_row}-${row.account_code}-${row.branch_code}`}><td className="p-2">{row.excel_row}</td><td className="font-mono">{row.account_code}</td><td className="font-mono">{row.branch_code}</td><td className="font-mono">{row.cost_center_code}</td><td>{row.party_tax_id || "--"}</td><td>{row.movement === "debit" ? "Débito" : "Crédito"}</td><td className="text-right">{money(row.amount)}</td></tr>)}</tbody></table></div></section> : null}
  </div>;
}
