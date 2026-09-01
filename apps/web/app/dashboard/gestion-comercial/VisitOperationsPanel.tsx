"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { api } from "@/lib/api";
import { VisitHistory } from "./VisitHistory";
import { CalendarPlus, Pencil, Search, SquareCheckBig, History } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type Row = Record<string, any>;
const statusLabels: Record<string, string> = {
  SCHEDULED: "Agendada",
  OVERDUE: "Vencida",
  PENDING_COMPLETION: "Falta completar",
  COMPLETED: "Completa",
  RESCHEDULED: "Reprogramada",
};
const badge: Record<string, string> = {
  SCHEDULED: "bg-sky-50 text-sky-700",
  OVERDUE: "bg-red-50 text-red-700",
  PENDING_COMPLETION: "bg-amber-50 text-amber-800",
  COMPLETED: "bg-emerald-50 text-emerald-700",
  RESCHEDULED: "bg-violet-50 text-violet-700",
};
const formatDate = (value: string) =>
  new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));

export function VisitOperationsPanel() {
  const [historyId, setHistoryId] = useState<number | null>(null);
  const [visits, setVisits] = useState<Row[]>([]);
  const [advisors, setAdvisors] = useState<Row[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [advisor, setAdvisor] = useState("");
  const [date, setDate] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    try {
      const [v, a] = await Promise.all([
        api<Row[]>("/api/v1/commercial-management/visits", {
          cache: "no-store",
        }),
        api<Row[]>("/api/v1/commercial-management/advisors"),
      ]);
      setVisits(v);
      setAdvisors(a);
      setError("");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No fue posible cargar las visitas.",
      );
    } finally { setLoading(false); }
  }, []);
  useEffect(() => {
    void load();
    const refresh = () => { void load(); };
    window.addEventListener("commercial-documents-changed", refresh);
    return () => window.removeEventListener("commercial-documents-changed", refresh);
  }, [load]);
  const filtered = useMemo(
    () =>
      visits.filter((visit) => {
        const haystack =
          `${visit.id} ${visit.customer?.code || ""} ${visit.customer?.legal_name || ""} ${visit.customer?.address || ""} ${visit.customer?.city || ""} ${visit.advisor?.name || ""}`.toLowerCase();
        const visitDate = new Intl.DateTimeFormat("en-CA", {
          timeZone: "America/Bogota",
        }).format(new Date(visit.visit_date));
        return (
          (!query || haystack.includes(query.toLowerCase())) &&
          (!status || visit.display_status === status) &&
          (!advisor || String(visit.advisor_id) === advisor) &&
          (!date || visitDate === date)
        );
      }),
    [visits, query, status, advisor, date],
  );
  const hasFilters = Boolean(query || status || advisor || date);
  const visible = hasFilters ? filtered : filtered.slice(-10);
  const count = (value: string) =>
    visits.filter((visit) => visit.display_status === value).length;
  return (
    <section className="apex-section-card overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line p-4">
        <div>
          <h2 className="text-lg font-semibold">Control de visitas</h2>
          <p className="text-sm text-neutral-600">
            Encuentra, prioriza y completa la operación comercial.
          </p>
        </div>
        <Link
          className="apex-primary-action inline-flex h-10 items-center gap-2 px-4 text-sm font-semibold"
          href="/dashboard/gestion-comercial/agenda?crear=1"
        >
          <CalendarPlus size={17} />
          Agendar visita
        </Link>
      </div>
      <div className="space-y-3 border-b border-line p-4">
        <label className="relative block">
          <Search
            className="absolute left-3 top-3 text-neutral-400"
            size={17}
          />
          <input
            className="h-10 w-full rounded-md border border-line bg-white pl-10 pr-3 text-sm"
            placeholder="Buscar por ID, cliente, ubicación o asesor"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <div className="flex flex-wrap gap-2">
          {[
            ["", "Todas", visits.length],
            ["SCHEDULED", "Agendadas", count("SCHEDULED")],
            ["OVERDUE", "Vencidas", count("OVERDUE")],
            [
              "PENDING_COMPLETION",
              "Falta completar",
              count("PENDING_COMPLETION"),
            ],
            ["COMPLETED", "Completas", count("COMPLETED")],
          ].map(([value, label, total]) => (
            <button
              className={`rounded-md border px-3 py-2 text-xs font-semibold ${status === value ? "border-apex bg-apex text-white" : "border-line"}`}
              key={String(value)}
              onClick={() => setStatus(String(value))}
              type="button"
            >
              {label} {total}
            </button>
          ))}
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          <input
            className="h-10 rounded-md border border-line px-3 text-sm"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          <select
            className="h-10 rounded-md border border-line bg-white px-3 text-sm"
            value={advisor}
            onChange={(e) => setAdvisor(e.target.value)}
          >
            <option value="">Todos los asesores</option>
            {advisors.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
          </select>
          <button
            className="h-10 rounded-md border border-line text-sm font-semibold"
            onClick={() => {
              setQuery("");
              setStatus("");
              setAdvisor("");
              setDate("");
            }}
            type="button"
          >
            Limpiar filtros
          </button>
        </div>
      </div>
      {error ? (
        <p className="m-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {!hasFilters && visits.length > 10 ? <p className="border-b border-line px-4 py-2 text-xs text-neutral-500">Mostrando las 10 visitas más recientes. Usa un filtro para consultar todos los resultados coincidentes.</p> : null}
      {loading ? <p className="p-8 text-center text-sm text-neutral-600" role="status">Consultando visitas…</p> : null}
      {!loading ? <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[1080px] text-left text-sm">
          <thead className="bg-paper text-xs uppercase text-neutral-500">
            <tr>
              <th className="px-4 py-3">Visita y estado</th>
              <th className="px-4 py-3">Cliente y ubicación</th>
              <th className="px-4 py-3">Motivo</th>
              <th className="px-4 py-3">Agenda</th>
              <th className="px-4 py-3">Finalización</th>
              <th className="px-4 py-3">Resultado comercial</th>
              <th className="px-4 py-3">Asesor</th>
              <th className="px-4 py-3 text-right">Acción</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((visit) => (
              <tr className="border-t border-line align-top" key={visit.id}>
                <td className="px-4 py-3">
                  <button type="button" className="font-semibold hover:text-apex hover:underline" title="Ver historial completo" onClick={() => setHistoryId(visit.id)}>VIS-{String(visit.id).padStart(5, "0")}</button>
                  <span
                    className={`mt-1 block w-fit rounded-full px-2 py-1 text-xs font-semibold ${badge[visit.display_status] || "bg-neutral-100"}`}
                  >
                    {statusLabels[visit.display_status] || visit.display_status}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <strong>{visit.customer?.legal_name || "Prospección sin cliente"}</strong>
                  <p className="mt-1 max-w-64 text-xs text-neutral-600">
                    {[visit.customer?.address, visit.customer?.city]
                      .filter(Boolean)
                      .join(" · ") || "Sin ubicación"}
                  </p>
                </td>
                <td className="px-4 py-3">
                  {visit.reason?.name || "Sin motivo"}
                </td>
                <td className="px-4 py-3">
                  <strong>{formatDate(visit.visit_date)}</strong>
                  <p className="mt-1 text-xs text-neutral-600">
                    {visit.planned_duration_minutes || 60} min planeados
                  </p>
                </td>
                <td className="px-4 py-3">
                  {visit.status === "RESCHEDULED" ? <span className="text-neutral-500">Reprogramada · no es cierre de visita</span> : visit.completed_at ? <><strong>{formatDate(visit.completed_at)}</strong><p className="mt-1 text-xs text-neutral-600">{visit.actual_duration_minutes == null ? "Duración no disponible" : `Duró ${visit.actual_duration_minutes} min`}</p></> : <span className="text-neutral-500">Pendiente</span>}
                </td>
                <td className="px-4 py-3"><CommercialResult visit={visit}/></td>
                <td className="px-4 py-3">{visit.advisor?.name}</td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    {visit.status === "SCHEDULED" ? <Link
                      className="inline-flex h-11 items-center gap-1 rounded-md border border-line px-3 text-xs font-semibold"
                      href={`/dashboard/gestion-comercial/agenda?visita=${visit.id}`}
                    >
                      <Pencil size={14} />
                      Gestionar visita
                    </Link> : visit.status === "IN_PROGRESS" ? (
                      <Link
                        className="inline-flex h-11 items-center gap-1 rounded-md border border-apex px-3 text-xs font-semibold text-apex"
                        href={`/dashboard/gestion-comercial/agenda/${visit.id}/ejecucion`}
                      >
                        <SquareCheckBig size={14} />
                        Continuar visita
                      </Link>
                    ) : <button type="button" className="inline-flex h-11 items-center gap-1 rounded-md border border-line px-3 text-xs font-semibold" onClick={() => setHistoryId(visit.id)}><History size={14}/>{visit.status === "RESCHEDULED" ? "Ver reprogramación" : "Ver historial"}</button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!visible.length ? (
          <p className="p-8 text-center text-sm text-neutral-500">
            No hay visitas que coincidan con los filtros.
          </p>
        ) : null}
      </div> : null}
      {!loading ? <div className="space-y-3 p-3 md:hidden">{visible.map(visit => <article className="rounded-lg border border-line bg-white p-4" key={visit.id}><div className="flex items-start justify-between gap-3"><button className="font-semibold text-apex" onClick={() => setHistoryId(visit.id)} type="button">VIS-{String(visit.id).padStart(5, "0")}</button><span className={`rounded-full px-2 py-1 text-xs font-semibold ${badge[visit.display_status] || "bg-neutral-100"}`}>{statusLabels[visit.display_status] || visit.display_status}</span></div><h3 className="mt-3 font-semibold">{visit.customer?.legal_name || "Prospección sin cliente"}</h3><p className="text-xs text-neutral-600">{[visit.customer?.address, visit.customer?.city].filter(Boolean).join(" · ") || "Sin ubicación"}</p><div className="mt-3 grid grid-cols-2 gap-3 text-sm"><p><span className="block text-xs text-neutral-500">Agenda</span><strong>{formatDate(visit.visit_date)}</strong></p><p><span className="block text-xs text-neutral-500">Asesor</span>{visit.advisor?.name}</p><p><span className="block text-xs text-neutral-500">Motivo</span>{visit.reason?.name || "Sin motivo"}</p><div><span className="block text-xs text-neutral-500">Resultado</span><CommercialResult visit={visit}/></div></div><div className="mt-4">{visit.status === "SCHEDULED" ? <Link className="apex-primary-action flex h-11 items-center justify-center gap-2 text-sm font-semibold" href={`/dashboard/gestion-comercial/agenda?visita=${visit.id}`}><Pencil size={16}/>Gestionar visita</Link> : visit.status === "IN_PROGRESS" ? <Link className="apex-primary-action flex h-11 items-center justify-center gap-2 text-sm font-semibold" href={`/dashboard/gestion-comercial/agenda/${visit.id}/ejecucion`}><SquareCheckBig size={16}/>Continuar visita</Link> : <button className="h-11 w-full rounded-md border border-line text-sm font-semibold" onClick={() => setHistoryId(visit.id)} type="button"><History className="mr-2 inline" size={16}/>{visit.status === "RESCHEDULED" ? "Ver reprogramación" : "Ver historial"}</button>}</div></article>)}{!visible.length ? <p className="p-6 text-center text-sm text-neutral-500">No hay visitas que coincidan con los filtros.</p> : null}</div> : null}
      {historyId !== null && <VisitHistory key={historyId} visitId={historyId} onClose={() => setHistoryId(null)}/>}
    </section>
  );
}
function CommercialResult({ visit }: { visit: Row }) {
  const quotes = (visit.quotations || []).filter((row: Row) => row.status !== "CANCELLED");
  const orders = (visit.orders || []).filter((row: Row) => row.status !== "CANCELLED");
  return <div className="space-y-1 text-xs">
    {quotes.length ? <p className="font-semibold text-amber-800">Cotización · {quotes.map((row: Row) => row.quotation_number).join(", ")}</p> : null}
    {orders.length ? <p className="font-semibold text-emerald-800">Pedido · {orders.map((row: Row) => row.order_number).join(", ")}</p> : null}
    {!quotes.length && !orders.length ? <p className="text-neutral-500">Sin cotización ni pedido</p> : null}
    {visit.result?.name ? <p>{visit.result.name}</p> : null}
  </div>;
}
