"use client";

import { api } from "@/lib/api";
import { ActionCard } from "@/components/ui/ActionCard";
import { ClipboardCheck, FileText, Plus, Search, Settings2, Wrench } from "lucide-react";
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
    const response = await api<OrdersResponse>(`/api/v1/services/orders${status ? `?status=${status}` : ""}`);
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
      [order.number, order.customer_name, order.customer_address, order.reference?.code, order.reference?.name]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term))
    );
  }, [orders, query]);

  return (
    <div className="mx-auto max-w-5xl space-y-4 pb-24 md:pb-6">
      <header className="sticky top-0 z-20 -mx-4 border-b border-line bg-paper/95 px-4 py-3 backdrop-blur md:static md:mx-0 md:border-0 md:bg-transparent md:px-0">
        <div>
          <p className="text-sm font-medium text-apex">M-26 · Operacion de campo</p>
          <h1 className="text-2xl font-semibold md:text-3xl">Servicios</h1>
        </div>
      </header>

      <section className="grid gap-3 md:grid-cols-[1fr_1fr]">
        <ActionCard title="Nueva orden" detail="Crear servicio y enviarlo al flujo operativo." icon={Plus} href="/dashboard/servicios/nuevo" primary />
        <ActionCard title="Referencias" detail="Modelos, piezas y tiempos base del servicio." icon={Settings2} href="/dashboard/servicios/referencias" />
      </section>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {[["Pendientes", kpis.pending], ["En curso", kpis.in_progress], ["Cerradas", kpis.closed], ["No ejecutadas", kpis.not_executed], ["Total", kpis.total]].map(([label, value]) => (
          <div className="rounded-md border border-line bg-white p-4 shadow-sm" key={label}><p className="text-2xl font-semibold">{value}</p><p className="text-sm text-neutral-500">{label}</p></div>
        ))}
      </section>

      <section className="rounded-md border border-line bg-white p-4 shadow-sm">
        <div className="mb-4 grid gap-3 md:flex md:flex-wrap md:items-center md:justify-between">
          <div>
            <div className="mb-3 flex items-center gap-2">
              <FileText className="text-apex" size={18} />
              <h2 className="text-base font-semibold">Ordenes de servicio</h2>
            </div>
          </div>
          <div className="relative min-w-[240px] flex-1 md:max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" size={16} />
            <input className="h-12 w-full rounded-md border border-line bg-white pl-10 pr-3 text-base md:h-10 md:text-sm" placeholder="Buscar orden o cliente" value={query} onChange={(event) => setQuery(event.target.value)} />
          </div>
          <select className="h-12 rounded-md border border-line px-3 text-base md:h-10 md:text-sm" value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">Todos los estados</option>
            {Object.entries(statusLabel).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          {filtered.map((order) => (
            <Link className="min-h-36 rounded-md border border-line p-4 text-left transition active:scale-[0.99] hover:border-apex hover:bg-paper" href={`/dashboard/servicios/${order.id}`} key={order.id}>
              <div className="mb-3 flex items-center justify-between gap-2">
                <span className={`rounded-md border px-3 py-2 text-xs font-semibold ${statusTone[order.status] || "border-line bg-paper"}`}>{statusLabel[order.status] || order.status}</span>
                <span className="text-xs font-semibold text-neutral-500">{order.number}</span>
              </div>
              <div className="flex items-start gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-apex/10 text-apex"><Wrench size={21} /></div>
                <div className="min-w-0">
                  <h3 className="text-base font-semibold">{order.customer_name}</h3>
                  <p className="mt-1 line-clamp-2 text-sm text-neutral-600">{order.customer_address}</p>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-neutral-600">
                    <span className="rounded-md bg-paper px-2 py-1">{order.service_type}</span>
                    <span className="rounded-md bg-paper px-2 py-1">{order.reference?.code || "Sin ref."}</span>
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

      <div className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-[1fr_auto] gap-2 border-t border-line bg-white/95 p-3 backdrop-blur md:hidden">
        <Link className="inline-flex h-14 items-center justify-center gap-2 rounded-md bg-apex text-base font-semibold text-white shadow-sm" href="/dashboard/servicios/nuevo">
          <Plus size={18} /> Nueva orden
        </Link>
        <Link className="inline-flex h-14 w-14 items-center justify-center rounded-md border border-line bg-white" href="/dashboard/servicios/referencias" aria-label="Referencias">
          <Settings2 size={20} />
        </Link>
      </div>
    </div>
  );
}
