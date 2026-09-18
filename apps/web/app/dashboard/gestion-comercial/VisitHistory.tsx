"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import Link from "next/link";
import { X, ArrowLeft } from "lucide-react";
type Row = Record<string, any>;
type History = { events: Row[]; visits: Row[]; orders: Row[]; quotations: Row[]; commitments: Row[] };
const date = (value: string) => value && Number.isFinite(new Date(value).getTime()) ? new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "Sin fecha";
const code = (id: number) => `VIS-${String(id).padStart(5, "0")}`;
const money = (value: unknown) => Number(value || 0).toLocaleString("es-CO", { style: "currency", currency: "COP" });
const labels: Record<string, string> = { SCHEDULED: "Agendada", STARTED: "Iniciada", COMPLETED: "Finalizada", RESCHEDULED: "Reprogramada", CUSTOMER_CREATED: "Cliente creado", PENDING: "Pendiente", CANCELLED: "Cancelado", OPEN: "Abierta", CONVERTED: "Convertida a pedido", REGISTERED: "Registrado", CONFIRMED: "Confirmado", INVOICED: "Facturado", IN_PROGRESS: "En curso" };

export function VisitHistory({ visitId, onClose }: { visitId: number; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [history, setHistory] = useState<History | null>(null);
  const [error, setError] = useState("");
  const [target, setTarget] = useState<{ kind: "orders" | "quotations"; id: number } | null>(null);
  const [document, setDocument] = useState<Row | null>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  useEffect(() => {
    let active = true;
    api<History>(`/api/v1/commercial-management/visits/${visitId}/history`, { cache: "no-store" }).then(data => { if (active) setHistory(data); }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [visitId]);
  useEffect(() => {
    let active = true;
    setDocument(null); setError("");
    if (target) api<Row>(`/api/v1/commercial-management/${target.kind}/${target.id}`, { cache: "no-store" }).then(data => { if (active) setDocument(data); }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [target]);
  const entries = history ? [
    ...history.events.map(event => ({ key: `event-${event.id}`, at: event.event_at, visit: event.visit_id, title: labels[event.event_type] || event.event_type, detail: [event.scheduled_for ? `Programada para ${date(event.scheduled_for)}` : "", event.details?.previous_schedule ? `Agenda anterior: ${date(event.details.previous_schedule)}` : "", event.details?.reason, event.details?.replacement_visit_id ? `Continúa en ${code(event.details.replacement_visit_id)}` : ""].filter(Boolean).join(" · "), target: null })),
    ...history.orders.map(doc => ({ key: `order-${doc.id}`, at: doc.order_date, visit: doc.visit_id, title: `Pedido ${doc.order_number}`, detail: `${labels[doc.status] || doc.status} · ${money(doc.total)}`, target: { kind: "orders" as const, id: doc.id } })),
    ...history.quotations.map(doc => ({ key: `quote-${doc.id}`, at: doc.quotation_date, visit: doc.visit_id, title: `Cotización ${doc.quotation_number}`, detail: `${labels[doc.status] || doc.status} · ${money(doc.total)}`, target: { kind: "quotations" as const, id: doc.id } })),
    ...history.commitments.map(item => ({ key: `commitment-${item.id}`, at: item.created_at, visit: item.visit_id, title: "Compromiso registrado", detail: `${item.description} · Vence ${date(item.due_date)} · ${labels[item.status] || item.status}`, target: null }))
  ].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime()) : [];
  return <dialog ref={dialog} onClose={onClose} aria-labelledby="visit-history-title" className={`m-auto max-h-[90vh] w-[95vw] ${target ? "max-w-4xl" : "max-w-2xl"} overflow-auto rounded-xl bg-white p-5 text-slate-900 shadow-xl backdrop:bg-black/50`}>
    <header className="mb-5 flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase text-apex">Trazabilidad comercial</p><h2 id="visit-history-title" className="text-xl font-semibold">Historial completo · {code(visitId)}</h2></div><button type="button" aria-label="Cerrar historial" onClick={onClose} className="rounded border border-line p-2"><X size={18}/></button></header>
    {error && <p role="alert" className="my-3 rounded bg-red-50 p-3 text-red-700">{error}</p>}
    {target ? <><button className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-apex" onClick={() => setTarget(null)}><ArrowLeft size={16}/> Volver al lead time</button>{!document && !error ? <p role="status">Cargando documento…</p> : null}{document && <section><h3 className="text-xl font-semibold">{document.order_number || document.quotation_number}</h3><p>{labels[document.status] || document.status} · {date(document.order_date || document.quotation_date)}</p><div className="my-4 grid gap-3 rounded bg-paper p-4 sm:grid-cols-2"><p>Cliente: <strong>{document.customer?.legal_name}</strong><br/>{document.customer?.identification}<br/>{document.customer?.address}<br/>{document.customer?.email} · {document.customer?.phone}</p><p>Asesor: <strong>{document.advisor?.name}</strong>{document.valid_until ? <><br/>Vigencia: {date(document.valid_until)}</> : null}</p></div><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{["Código", "Producto", "Cantidad", "Precio", "Descuento", "Total"].map(label => <th className="p-2" key={label}>{label}</th>)}</tr></thead><tbody>{document.lines?.map((line: Row, index: number) => <tr className="border-t border-line" key={line.id || index}><td className="p-2">{line.product_code}</td><td className="p-2">{line.product_name}</td><td className="p-2">{Number(line.quantity)}</td><td className="p-2">{money(line.unit_price)}</td><td className="p-2">{money(line.discount)}</td><td className="p-2">{money(line.line_total)}</td></tr>)}</tbody></table></div><p className="mt-4 text-xl font-semibold">Total {money(document.total)}</p>{document.notes && <p className="mt-3 whitespace-pre-wrap text-sm">{document.notes}</p>}</section>}</> : <>
      {!history && !error && <p role="status">Consultando historial…</p>}
      {history && <><div className={`mb-5 grid gap-3 ${history.visits.length > 1 ? "sm:grid-cols-2" : "grid-cols-1"}`}>{history.visits.map(visit => <div key={visit.id} className="rounded-lg bg-paper p-3 text-sm"><strong>{code(visit.id)} · {labels[visit.status] || visit.status}</strong><p>{visit.customer?.legal_name || "Prospección sin cliente"} · {visit.advisor?.name}</p><p>Agenda: {date(visit.visit_date)}</p><p>Inicio: {visit.started_at ? date(visit.started_at) : "No iniciada"}</p><p>Fin: {visit.status === "COMPLETED" && visit.completed_at ? date(visit.completed_at) : "Sin cierre de visita"}</p>{visit.rescheduled_from_id && visit.id !== visitId && <Link className="mt-2 inline-block font-semibold text-apex underline" href={`/dashboard/gestion-comercial/agenda?visita=${visit.id}`}>Abrir nueva programación · {code(visit.id)}</Link>}{visit.result && <p>Resultado: {visit.result.name}</p>}{visit.outcome_notes && <p className="whitespace-pre-wrap">{visit.outcome_notes}</p>}{visit.follow_up_required && <p>Seguimiento requerido: {date(visit.follow_up_date)}</p>}</div>)}</div>
      <h3 className="mb-3 font-semibold">Lead time · secuencia de eventos</h3><ol className="ml-2 border-l-2 border-teal-200 pl-5">{entries.map(entry => <li className="relative pb-5" key={entry.key}><span className="absolute -left-[27px] top-1 h-3 w-3 rounded-full bg-apex"/><p className="text-xs text-neutral-500">{date(entry.at)} · {code(entry.visit)}</p>{entry.target ? <button className="text-left font-semibold text-apex underline" onClick={() => setTarget(entry.target)}>{entry.title} · Ver detalle</button> : <strong>{entry.title}</strong>}<p className="text-sm">{entry.detail}</p></li>)}</ol>
      {!history.orders.length && !history.quotations.length && <p className="text-sm text-neutral-500">Esta cadena de visitas no tiene pedidos ni cotizaciones.</p>}
      <h3 className="mb-2 mt-4 font-semibold">Compromisos pendientes resultantes</h3>{history.commitments.filter(item => item.status === "PENDING").map(item => <div key={item.id} className="mb-2 rounded bg-amber-50 p-3 text-sm"><strong>{item.description}</strong><p>{code(item.visit_id)} · Vence {date(item.due_date)}{new Date(item.due_date) < new Date() ? " · Vencido" : ""}</p></div>)}{!history.commitments.some(item => item.status === "PENDING") && <p className="text-sm text-neutral-500">Sin compromisos pendientes registrados.</p>}</>}
    </>}
  </dialog>;
}
