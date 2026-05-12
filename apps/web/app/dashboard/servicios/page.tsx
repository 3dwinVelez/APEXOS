"use client";

import { api } from "@/lib/api";
import { ClipboardCheck, Plus, Search, Settings2, Wrench } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type ServiceReference = { id: number; code: string; name: string };
type ServiceOrder = {
  id: number;
  number: string;
  reference: ServiceReference;
  service_type: string;
  status: string;
  customer_name: string;
  customer_address: string;
  customer_phone: string;
  scheduled_date: string;
  incidents: Array<{ id: number }>;
  photos: Array<{ id: number }>;
};
type OrdersResponse = { data: ServiceOrder[]; kpis: { pending: number; in_progress: number; closed: number; not_executed: number; total: number } };

const statusLabel: Record<string, string> = {
  pendiente: "Pendiente",
  en_curso: "En curso",
  inspeccion: "Inspeccion",
  ejecucion: "Ejecucion",
  cerrada: "Cerrada",
  no_ejecutada: "No ejecutada",
  cancelada: "Cancelada"
};

const statusTone: Record<string, string> = {
  pendiente: "border-slate-200 bg-slate-50 text-slate-700",
  en_curso: "border-sky-200 bg-sky-50 text-sky-700",
  inspeccion: "border-amber-200 bg-amber-50 text-amber-800",
  ejecucion: "border-violet-200 bg-violet-50 text-violet-800",
  cerrada: "border-emerald-200 bg-emerald-50 text-emerald-800",
  no_ejecutada: "border-red-200 bg-red-50 text-red-800"
};

export default function ServicesPage() {
  const [orders, setOrders] = useState<ServiceOrder[]>([]);
  const [kpis, setKpis] = useState<OrdersResponse["kpis"]>({ pending: 0, in_progress: 0, closed: 0, not_executed: 0, total: 0 });
  const [status, setStatus] = useState("");
  const [query, setQuery] = useState("");

  async function load() {
    const response = await api<OrdersResponse>(`/api/v1/services/orders${status ? `status=${status}` : ""}`);
    setOrders(response.data);
    setKpis(response.kpis);
  }

  useEffect(() => {
    load().catch(() => undefined);
  }, [status]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return orders;
    return orders.filter((order) =>
      [order.number, order.customer_name, order.customer_address, order.reference.code, order.reference.name]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term))
    );
  }, [orders, query]);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-apex">M-26 · Operacion de campo</p>
          <h1 className="text-3xl font-semibold">Monitor de servicios</h1>
          <p className="mt-2 max-w-3xl text-sm text-neutral-600">Vista central para priorizar ordenes. La creacion, referencias y ejecucion operativa viven en pantallas auxiliares.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link className="inline-flex h-10 items-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-medium hover:bg-paper" href="/dashboard/servicios/referencias">
            <Settings2 size={16} /> Referencias
          </Link>
          <Link className="inline-flex h-10 items-center gap-2 rounded-md bg-apex px-4 text-sm font-medium text-white" href="/dashboard/servicios/nuevo">
            <Plus size={16} /> Nueva orden
          </Link>
        </div>
      </header>

      <section className="grid gap-3 md:grid-cols-5">
        {[["Pendientes", kpis.pending], ["En curso", kpis.in_progress], ["Cerradas", kpis.closed], ["No ejecutadas", kpis.not_executed], ["Total", kpis.total]].map(([label, value]) => (
          <div className="rounded-md border border-line bg-white p-4" key={label}><p className="text-2xl font-semibold">{value}</p><p className="text-sm text-neutral-500">{label}</p></div>
        ))}
      </section>

      <section className="rounded-md border border-line bg-white p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="relative min-w-[240px] flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" size={16} />
            <input className="h-10 w-full rounded-md border border-line bg-white pl-9 pr-3 text-sm" placeholder="Buscar cliente, orden, direccion o referencia" value={query} onChange={(event) => setQuery(event.target.value)} />
          </div>
          <select className="h-10 rounded-md border border-line px-3 text-sm" value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">Todos los estados</option>
            {Object.entries(statusLabel).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          {filtered.map((order) => (
            <Link className="rounded-md border border-line p-4 text-left transition hover:border-apex hover:bg-paper" href={`/dashboard/servicios/${order.id}`} key={order.id}>
              <div className="mb-3 flex items-center justify-between gap-2">
                <span className={`rounded-md border px-2 py-1 text-xs font-semibold ${statusTone[order.status] || "border-line bg-paper"}`}>{statusLabel[order.status] || order.status}</span>
                <span className="text-xs font-semibold text-neutral-500">{order.number}</span>
              </div>
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-apex/10 text-apex"><Wrench size={18} /></div>
                <div className="min-w-0">
                  <h3 className="font-semibold">{order.customer_name}</h3>
                  <p className="mt-1 line-clamp-2 text-sm text-neutral-600">{order.customer_address}</p>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-neutral-600">
                    <span className="rounded-md bg-paper px-2 py-1">{order.service_type}</span>
                    <span className="rounded-md bg-paper px-2 py-1">{order.reference.code || "Sin ref."}</span>
                    <span className="rounded-md bg-paper px-2 py-1">{order.photos.length} fotos</span>
                    <span className="rounded-md bg-paper px-2 py-1">{order.incidents.length} novedades</span>
                  </div>
                </div>
              </div>
            </Link>
          ))}
          {!filtered.length ? (
            <div className="col-span-full rounded-md border border-dashed border-line p-10 text-center">
              <ClipboardCheck className="mx-auto mb-3 text-neutral-300" size={34} />
              <p className="font-semibold">No hay ordenes para este filtro</p>
              <p className="mt-1 text-sm text-neutral-500">Crea una nueva orden o cambia el estado consultado.</p>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
