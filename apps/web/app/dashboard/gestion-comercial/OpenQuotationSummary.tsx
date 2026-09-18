"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { api } from "@/lib/api";
import { QuotationOrderEditor } from "./QuotationOrderEditor";
import Link from "next/link";
import { FileClock, X } from "lucide-react";
import { FormEvent, useCallback, useEffect, useState } from "react";
type Row = Record<string, any>;
const money = (value: unknown) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP" }).format(Number(value || 0));

export function OpenQuotationSummary() {
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [advisor, setAdvisor] = useState("");
  const [customer, setCustomer] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [action, setAction] = useState<{kind: "order" | "cancel"; row: Row} | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try { setRows(await api<Row[]>("/api/v1/commercial-management/quotations?without_order=true", {cache: "no-store"})); }
    catch (e) { setError(e instanceof Error ? e.message : "No fue posible cargar las cotizaciones."); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!action || busy || (action.kind === "cancel" && !reason.trim())) return;
    setBusy(true); setError("");
    try {
      const result = await api<Row>(`/api/v1/commercial-management/quotations/${action.row.id}/${action.kind === "order" ? "convert-to-order" : "cancel"}`, {method: "POST", body: JSON.stringify(action.kind === "cancel" ? {reason: reason.trim()} : {})});
      setMessage(action.kind === "order" ? `Pedido ${result.order_number} generado. Puedes consultarlo en Pedidos.` : "Cotización cancelada. El motivo quedó guardado en el documento y su auditoría.");
      setAction(null); setReason("");
      window.dispatchEvent(new Event("commercial-documents-changed"));
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "No fue posible completar la operación."); }
    finally { setBusy(false); }
  }
  const localDay = (value: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date(value));
  const advisorOptions = [...new Map(rows.map(row => [String(row.advisor_id), row.advisor?.name])).entries()].sort((a, b) => String(a[1]).localeCompare(String(b[1])));
  const customerOptions = [...new Map(rows.map(row => [String(row.customer_id), row.customer?.legal_name])).entries()].sort((a, b) => String(a[1]).localeCompare(String(b[1])));
  const hasFilters = Boolean(query || advisor || customer || dateFrom || dateTo);
  const filtered = rows.filter(row => { const quotationDay = localDay(row.quotation_date); return [row.quotation_number, row.customer?.legal_name, row.advisor?.name].join(" ").toLowerCase().includes(query.toLowerCase()) && (!advisor || String(row.advisor_id) === advisor) && (!customer || String(row.customer_id) === customer) && (!dateFrom || quotationDay >= dateFrom) && (!dateTo || quotationDay <= dateTo); });
  const visible = hasFilters ? filtered : filtered.slice(0, 10);
  return <section className="apex-section-card p-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><FileClock className="text-amber-700" size={22}/><div><h2 className="text-sm font-semibold">Cotizaciones pendientes de pedido</h2><p className="text-xs text-neutral-600">Genera el pedido o cancela la oportunidad dejando el motivo.</p></div></div><Link href="/dashboard/gestion-comercial/pedidos" className="text-sm font-semibold text-apex">Ver pedidos</Link></div>
    <div className="mt-3 grid items-end gap-2 md:grid-cols-2 xl:grid-cols-5"><input aria-label="Buscar cotizaciones pendientes" className="h-10 rounded-md border border-line px-3 text-sm xl:col-span-1" placeholder="Buscar cotización, cliente o asesor" value={query} onChange={e => setQuery(e.target.value)}/><select aria-label="Filtrar cotizaciones por asesor" className="h-10 rounded-md border border-line bg-white px-3 text-sm" value={advisor} onChange={e => setAdvisor(e.target.value)}><option value="">Todos los asesores</option>{advisorOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select><select aria-label="Filtrar cotizaciones por cliente" className="h-10 rounded-md border border-line bg-white px-3 text-sm" value={customer} onChange={e => setCustomer(e.target.value)}><option value="">Todos los clientes</option>{customerOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select><label className="grid gap-1 text-xs text-neutral-500">Emitida desde<input aria-label="Fecha inicial de cotización" className="h-10 w-full rounded-md border border-line px-3 text-sm" type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}/></label><label className="grid gap-1 text-xs text-neutral-500">Emitida hasta<input aria-label="Fecha final de cotización" className="h-10 w-full rounded-md border border-line px-3 text-sm" type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}/></label></div>{hasFilters ? <div className="mt-2 flex items-center justify-between gap-3 text-xs text-neutral-500"><span>{filtered.length} cotización(es) coinciden con los filtros.</span><button type="button" className="font-semibold text-apex" onClick={() => { setQuery(""); setAdvisor(""); setCustomer(""); setDateFrom(""); setDateTo(""); }}>Limpiar filtros</button></div> : rows.length > 10 ? <p className="mt-2 text-xs text-neutral-500">Mostrando las 10 cotizaciones pendientes más recientes. Usa filtros para consultar todas las coincidencias.</p> : null}
    {message ? <p role="status" className="mt-3 text-sm text-emerald-800">{message}</p> : null}
    {error && !action ? <p role="alert" className="mt-3 text-sm text-red-700">{error}</p> : null}
    <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[780px] text-left text-sm"><thead className="bg-paper text-xs uppercase text-neutral-500"><tr><th className="p-3">Cotización</th><th className="p-3">Cliente</th><th className="p-3">Asesor</th><th className="p-3">Vence</th><th className="p-3">Estado</th><th className="p-3 text-right">Valor</th><th className="p-3">Acciones</th></tr></thead><tbody>{visible.map(row => <tr key={row.id} className="border-t border-line"><td className="p-3 font-semibold">{row.quotation_number}</td><td className="p-3">{row.customer?.legal_name}</td><td className="p-3">{row.advisor?.name}</td><td className="p-3">{new Date(row.valid_until).toLocaleDateString("es-CO")}</td><td className="p-3">{row.display_status === "EXPIRED" ? "Vencida" : "Abierta"}</td><td className="p-3 text-right">{money(row.total)}</td><td className="p-3"><div className="flex gap-2"><button type="button" className="rounded-md border border-apex px-3 py-2 text-xs font-semibold text-apex" onClick={() => {setError(""); setAction({kind:"order",row});}}>Generar pedido</button><button type="button" className="rounded-md border border-line px-3 py-2 text-xs font-semibold text-red-700" onClick={() => {setReason(""); setError(""); setAction({kind:"cancel",row});}}>Cancelar</button></div></td></tr>)}</tbody></table>{!visible.length ? <p className="p-4 text-sm text-neutral-500">No hay cotizaciones pendientes que coincidan.</p> : null}</div>
    {action?.kind === "order" && <QuotationOrderEditor key={action.row.id} quotationId={action.row.id} onClose={() => setAction(null)} onCreated={order => { setMessage(`Pedido ${order.order_number} generado.`); setAction(null); void load(); }}/>}
    {action?.kind === "cancel" ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label={action.kind === "cancel" ? "Cancelar cotización" : "Generar pedido"}><form onSubmit={submit} className="max-h-[85vh] w-full max-w-xl overflow-auto rounded-xl bg-white p-5 shadow-xl"><div className="flex justify-between gap-3"><h3 className="font-semibold">{action.kind === "cancel" ? "Cancelar cotización" : "Generar pedido"} · {action.row.quotation_number}</h3><button aria-label="Cerrar" type="button" disabled={busy} onClick={() => setAction(null)}><X size={18}/></button></div><p className="mt-3 text-sm">{action.row.customer?.legal_name} · {money(action.row.total)}</p>{action.kind === "cancel" ? <label className="mt-3 block text-sm">Motivo de cancelación (obligatorio)<textarea required maxLength={2000} className="mt-1 min-h-24 w-full rounded-md border border-line p-3" value={reason} onChange={e => setReason(e.target.value)}/></label> : <><p className="mt-3 text-sm text-neutral-600">Se generará un pedido con estos productos y cantidades, vinculado a esta cotización. Los precios se validan contra el catálogo vigente.</p><ul className="mt-3 space-y-1 text-sm">{action.row.lines?.map((line: Row) => <li key={line.id}>{line.product_code} · {line.product_name} × {Number(line.quantity)}</li>)}</ul></>}{error ? <p role="alert" className="mt-3 text-sm text-red-700">{error}</p> : null}<button disabled={busy || (action.kind === "cancel" && !reason.trim())} className="apex-primary-action mt-4 h-10 w-full text-sm font-semibold" type="submit">{busy ? "Procesando..." : action.kind === "cancel" ? "Confirmar cancelación" : "Confirmar y generar pedido"}</button></form></div> : null}
  </section>;
}
