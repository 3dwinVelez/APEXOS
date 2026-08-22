"use client";

import { useState } from "react";
import { CheckCircle2, Download, FileSpreadsheet, Upload } from "lucide-react";
import { api } from "@/lib/api";
import { InventoryNav } from "@/components/inventory-nav";

type Preview = { valid: boolean; society_code: string; posting_date: string; bridge_account_code: string; positions: Array<{ excel_row: number; sku: string; description: string; warehouse: string; location: string; qty: number; unit: string; unit_cost: number; total: number; inventory_account_code: string }>; totals: { lines: number; units: number; value: number } };
type Posted = { accounting_document: { id: number; full_number: string }; positions: number; units: number; total_value: number };

export default function InitialInventoryLoadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [posted, setPosted] = useState<Posted | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");

  async function send(path: string) {
    if (!file) throw new Error("Selecciona la plantilla diligenciada.");
    const form = new FormData(); form.append("file", file);
    return api<Preview | Posted>(path, { method: "POST", body: form });
  }
  async function validate() {
    setBusy(true); setError(""); setPosted(null);
    try { setPreview(await send("/api/v1/inventory/initial-load/validate") as Preview); }
    catch (err) { setPreview(null); setError(err instanceof Error ? err.message : "No se pudo validar la plantilla"); }
    finally { setBusy(false); }
  }
  async function post() {
    if (!preview) return;
    setBusy(true); setError("");
    try { const result = await send("/api/v1/inventory/initial-load") as Posted; setPosted(result); setPreview(null); setFile(null); }
    catch (err) { setError(err instanceof Error ? err.message : "No se pudo contabilizar el cargue inicial"); }
    finally { setBusy(false); setConfirming(false); }
  }

  return <div className="space-y-4">
    <header><p className="text-sm font-medium text-apex">Inventario</p><h1 className="text-3xl font-semibold">Cargue inicial de inventario</h1><p className="mt-1 text-sm text-neutral-600">Importa existencias iniciales por SKU y bodega, revisa el resultado y contabiliza en una sola operación.</p></header>
    <InventoryNav />
    {error ? <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
    {posted ? <section className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-emerald-800"><p className="flex items-center gap-2 font-semibold"><CheckCircle2 size={18} /> Cargue inicial contabilizado</p><p className="mt-1 text-sm">Documento {posted.accounting_document.full_number} · {posted.positions} posiciones · {posted.units.toLocaleString("es-CO")} unidades · ${posted.total_value.toLocaleString("es-CO")}</p></section> : null}
    <section className="grid gap-4 lg:grid-cols-3">
      <article className="rounded-md border border-line bg-white p-4"><span className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-paper text-apex"><Download size={18} /></span><h2 className="mt-3 font-semibold">1. Descargar plantilla</h2><p className="mt-1 min-h-12 text-sm text-neutral-500">Usa los códigos vigentes de SKU, bodega y ubicación.</p><a className="mt-3 inline-flex h-10 items-center rounded-md border border-apex px-4 text-sm text-apex" download href="/plantillas/Plantilla_Cargue_Inicial_Inventario.xlsx">Descargar Excel</a></article>
      <article className="rounded-md border border-line bg-white p-4"><span className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-paper text-apex"><FileSpreadsheet size={18} /></span><h2 className="mt-3 font-semibold">2. Seleccionar archivo</h2><p className="mt-1 text-sm text-neutral-500">No cambies los encabezados. Un archivo corresponde a una sociedad y fecha.</p><input accept=".xlsx" className="mt-3 block w-full text-sm" onChange={(event) => { setFile(event.target.files?.[0] || null); setPreview(null); }} type="file" /><button className="mt-3 h-10 rounded-md border border-apex px-4 text-sm text-apex disabled:opacity-50" disabled={!file || busy} onClick={() => void validate()} type="button">{busy ? "Validando..." : "Validar plantilla"}</button></article>
      <article className="rounded-md border border-line bg-white p-4"><span className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-paper text-apex"><Upload size={18} /></span><h2 className="mt-3 font-semibold">3. Contabilizar</h2><p className="mt-1 text-sm text-neutral-500">Débito a inventario por familia y crédito a la cuenta puente 99999999.</p><button className="mt-3 h-10 rounded-md bg-apex px-4 text-sm font-medium text-white disabled:opacity-50" disabled={!preview || busy} onClick={() => setConfirming(true)} type="button">Confirmar cargue inicial</button></article>
    </section>
    {preview ? <section className="rounded-md border border-line bg-white"><header className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-4"><div><h2 className="font-semibold">Validación correcta</h2><p className="text-sm text-neutral-500">Sociedad {preview.society_code} · Fecha {new Date(preview.posting_date).toLocaleDateString("es-CO")} · Puente {preview.bridge_account_code}</p></div><div className="text-right text-sm"><strong>{preview.totals.lines} posiciones · {preview.totals.units.toLocaleString("es-CO")} unidades</strong><span className="block text-lg text-apex">${preview.totals.value.toLocaleString("es-CO")}</span></div></header><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-sm"><thead><tr className="border-b border-line bg-paper text-left"><th className="px-3 py-2">Fila</th><th className="px-3 py-2">SKU</th><th className="px-3 py-2">Descripción</th><th className="px-3 py-2">Bodega / ubicación</th><th className="px-3 py-2 text-right">Cantidad</th><th className="px-3 py-2 text-right">Costo</th><th className="px-3 py-2 text-right">Valor</th><th className="px-3 py-2">Cuenta inventario</th></tr></thead><tbody>{preview.positions.map((row) => <tr className="border-b border-line/70" key={row.excel_row}><td className="px-3 py-2">{row.excel_row}</td><td className="px-3 py-2 font-mono">{row.sku}</td><td className="px-3 py-2">{row.description}</td><td className="px-3 py-2">{row.warehouse} / {row.location}</td><td className="px-3 py-2 text-right">{row.qty.toLocaleString("es-CO")} {row.unit}</td><td className="px-3 py-2 text-right">${row.unit_cost.toLocaleString("es-CO")}</td><td className="px-3 py-2 text-right">${row.total.toLocaleString("es-CO")}</td><td className="px-3 py-2 font-mono">{row.inventory_account_code}</td></tr>)}</tbody></table></div></section> : null}
    {confirming && preview ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4" onMouseDown={() => !busy && setConfirming(false)}><section className="w-full max-w-lg rounded-lg bg-white p-5 shadow-xl" onMouseDown={(event) => event.stopPropagation()}><h2 className="text-xl font-semibold">Confirmar cargue inicial</h2><p className="mt-2 text-sm text-neutral-600">Se cargarán <strong>{preview.totals.units.toLocaleString("es-CO")} unidades</strong> por <strong>${preview.totals.value.toLocaleString("es-CO")}</strong>. La operación afectará inventario, kardex, costos y contabilidad y no podrá repetirse con el mismo archivo.</p><div className="mt-5 flex justify-end gap-2"><button className="h-10 rounded-md border border-line px-4 text-sm" disabled={busy} onClick={() => setConfirming(false)} type="button">Cancelar</button><button className="h-10 rounded-md bg-apex px-4 text-sm font-medium text-white disabled:opacity-50" disabled={busy} onClick={() => void post()} type="button">{busy ? "Contabilizando..." : "Sí, contabilizar"}</button></div></section></div> : null}
  </div>;
}
