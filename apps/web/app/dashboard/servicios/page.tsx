"use client";

import { api } from "@/lib/api";
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Gauge,
  Image as ImageIcon,
  Layers3,
  Plus,
  Search,
  Settings2,
  Sparkles,
  Timer,
  Wrench
} from "lucide-react";
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
  ejecucion: "border-indigo-200 bg-indigo-50 text-indigo-800",
  cerrada: "border-emerald-200 bg-emerald-50 text-emerald-800",
  no_ejecutada: "border-rose-200 bg-rose-50 text-rose-800",
  cancelada: "border-neutral-200 bg-neutral-100 text-neutral-700"
};

function formatDate(value?: string) {
  if (!value) return "Sin fecha";
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("es-CO", { day: "2-digit", month: "short" });
}

function isToday(value?: string) {
  if (!value) return false;
  return value === new Date().toISOString().slice(0, 10);
}

function serviceAction(order: ServiceOrder) {
  if (order.status === "pendiente") return "Iniciar";
  if (["en_curso", "inspeccion", "ejecucion"].includes(order.status)) return "Continuar";
  if (order.status === "no_ejecutada") return "Revisar";
  return "Ver detalle";
}

function Indicator({ icon: Icon, label, value, detail, tone }: { icon: typeof Gauge; label: string; value: string | number; detail: string; tone: string }) {
  return (
    <div className="min-w-0 rounded-md border border-white/10 bg-white/[0.07] p-3 text-white shadow-sm sm:p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${tone}`}><Icon size={17} /></span>
        <span className="text-right text-xs font-semibold uppercase tracking-[0.12em] text-white/45">{label}</span>
      </div>
      <p className="text-3xl font-semibold leading-none">{value}</p>
      <p className="mt-2 text-sm leading-5 text-white/65">{detail}</p>
    </div>
  );
}

function QuickLink({ href, icon: Icon, title, detail, primary = false }: { href: string; icon: typeof Plus; title: string; detail: string; primary?: boolean }) {
  return (
    <Link className={`group min-w-0 rounded-md border p-4 transition active:scale-[0.99] ${primary ? "border-apex bg-apex text-white shadow-sm hover:bg-[#116b61]" : "border-line bg-white hover:border-apex hover:bg-paper"}`} href={href}>
      <div className="flex items-start justify-between gap-3">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md ${primary ? "bg-white/15" : "bg-apex/10 text-apex"}`}><Icon size={19} /></span>
        <ChevronRight className={primary ? "text-white/70" : "text-neutral-400 group-hover:text-apex"} size={18} />
      </div>
      <h3 className="mt-4 break-words font-semibold">{title}</h3>
      <p className={`mt-1 text-sm leading-5 ${primary ? "text-white/75" : "text-neutral-600"}`}>{detail}</p>
    </Link>
  );
}

export default function ServicesPage() {
  const [orders, setOrders] = useState<ServiceOrder[]>([]);
  const [kpis, setKpis] = useState<OrdersResponse["kpis"]>({ pending: 0, in_progress: 0, closed: 0, not_executed: 0, total: 0 });
  const [status, setStatus] = useState("");
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    try {
      setMessage("");
      const response = await api<OrdersResponse>(`/api/v1/services/orders${status ? `?status=${status}` : ""}`);
      setOrders(response.data);
      setKpis(response.kpis);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No fue posible cargar servicios.");
      setOrders([]);
    }
  }

  useEffect(() => {
    load();
  }, [status]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return orders;
    return orders.filter((order) =>
      [order.number, order.customer_name, order.customer_address, order.reference?.code, order.reference?.name, order.service_type]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term))
    );
  }, [orders, query]);

  const operational = useMemo(() => {
    const active = orders.filter((order) => ["en_curso", "inspeccion", "ejecucion"].includes(order.status));
    const withFindings = orders.filter((order) => order.incidents.length > 0);
    const withEvidence = orders.filter((order) => order.photos.length > 0);
    const today = orders.filter((order) => isToday(order.scheduled_date));
    const attention = orders.filter((order) => ["pendiente", "en_curso", "inspeccion", "ejecucion", "no_ejecutada"].includes(order.status));
    const evidenceRate = orders.length ? Math.round((withEvidence.length / orders.length) * 100) : 0;
    const closedRate = orders.length ? Math.round((kpis.closed / orders.length) * 100) : 0;
    return { active, withFindings, withEvidence, today, attention, evidenceRate, closedRate };
  }, [kpis.closed, orders]);

  const mainMessage = operational.attention.length
    ? `Hay ${operational.attention.length} servicio(s) que requieren seguimiento operativo.`
    : "La operacion de servicios no tiene pendientes criticos en este momento.";

  return (
    <div className="mx-auto max-w-7xl space-y-5 pb-28 md:pb-8">
      <header className="sticky top-0 z-20 -mx-3 border-b border-line bg-paper/95 px-3 py-3 backdrop-blur sm:-mx-4 sm:px-4 md:static md:mx-0 md:border-0 md:bg-transparent md:px-0">
        <div className="flex items-center gap-3">
          <Link className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-line bg-white md:hidden" href="/dashboard" aria-label="Volver al inicio">
            <ArrowLeft size={18} />
          </Link>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-apex">M-26 · Operacion de campo</p>
            <h1 className="truncate text-2xl font-semibold md:text-3xl">Servicios</h1>
            <p className="mt-1 hidden text-sm text-neutral-600 sm:block">Monitor operativo para crear, ejecutar y controlar servicios tecnicos con evidencia.</p>
          </div>
        </div>
      </header>

      <section className="overflow-hidden rounded-md bg-[#081411] text-white shadow-sm">
        <div className="grid gap-5 p-4 sm:p-5 lg:grid-cols-[1.15fr_0.85fr] lg:p-6">
          <div className="min-w-0">
            <div className="mb-5 inline-flex items-center gap-2 rounded-md bg-white/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-teal-100">
              <Sparkles size={14} />
              Centro operativo de servicios
            </div>
            <h2 className="max-w-2xl text-2xl font-semibold leading-tight sm:text-4xl">Control claro de servicios, evidencias y novedades</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/70">{mainMessage} Prioriza lo pendiente, revisa no ejecutados y valida que cada cierre tenga evidencia suficiente.</p>
            <div className="mt-5 grid gap-2 sm:flex sm:flex-wrap">
              <Link className="inline-flex h-11 min-w-0 items-center justify-center gap-2 rounded-md bg-white px-4 text-sm font-semibold text-[#081411]" href="/dashboard/servicios/nuevo">
                <Plus className="shrink-0" size={17} />
                <span className="truncate">Nueva orden</span>
              </Link>
              <Link className="inline-flex h-11 min-w-0 items-center justify-center gap-2 rounded-md border border-white/15 px-4 text-sm font-semibold text-white hover:bg-white/10" href="/dashboard/servicios/reportes">
                <BarChart3 className="shrink-0" size={17} />
                <span className="truncate">Ver reportes</span>
              </Link>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Indicator icon={ClipboardCheck} label="Total" value={kpis.total} detail={`${kpis.closed} cerrados · ${kpis.pending} pendientes`} tone="bg-teal-400/20 text-teal-200" />
            <Indicator icon={Timer} label="En proceso" value={kpis.in_progress} detail="Servicios vivos que requieren continuidad." tone="bg-sky-400/20 text-sky-200" />
            <Indicator icon={AlertTriangle} label="Hallazgos" value={operational.withFindings.length} detail="Ordenes con novedades registradas." tone="bg-amber-400/20 text-amber-200" />
            <Indicator icon={ImageIcon} label="Evidencia" value={`${operational.evidenceRate}%`} detail="Servicios con soporte fotografico." tone="bg-emerald-400/20 text-emerald-200" />
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <QuickLink title="Nueva orden" detail="Crear servicio y enviarlo al flujo operativo." icon={Plus} href="/dashboard/servicios/nuevo" primary />
        <QuickLink title="Referencias" detail="Modelos, piezas, manuales y tiempos base." icon={Settings2} href="/dashboard/servicios/referencias" />
        <QuickLink title="Reportes" detail="Tiempos, hallazgos, evidencias y escenarios." icon={BarChart3} href="/dashboard/servicios/reportes" />
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-md border border-line bg-white p-4">
          <div className="flex items-center justify-between gap-3"><p className="text-sm text-neutral-500">Servicios de hoy</p><CalendarClock className="text-apex" size={18} /></div>
          <p className="mt-3 text-3xl font-semibold">{operational.today.length}</p>
          <p className="mt-1 text-sm text-neutral-600">Programados para ejecutar o revisar hoy.</p>
        </div>
        <div className="rounded-md border border-line bg-white p-4">
          <div className="flex items-center justify-between gap-3"><p className="text-sm text-neutral-500">Cierre operativo</p><CheckCircle2 className="text-emerald-600" size={18} /></div>
          <p className="mt-3 text-3xl font-semibold">{operational.closedRate}%</p>
          <p className="mt-1 text-sm text-neutral-600">Proporcion cerrada dentro del conjunto consultado.</p>
        </div>
        <div className="rounded-md border border-line bg-white p-4">
          <div className="flex items-center justify-between gap-3"><p className="text-sm text-neutral-500">No ejecutadas</p><AlertTriangle className="text-rose-600" size={18} /></div>
          <p className="mt-3 text-3xl font-semibold">{kpis.not_executed}</p>
          <p className="mt-1 text-sm text-neutral-600">Casos que requieren causa y reprogramacion.</p>
        </div>
        <div className="rounded-md border border-line bg-white p-4">
          <div className="flex items-center justify-between gap-3"><p className="text-sm text-neutral-500">Con evidencia</p><ImageIcon className="text-sky-600" size={18} /></div>
          <p className="mt-3 text-3xl font-semibold">{operational.withEvidence.length}</p>
          <p className="mt-1 text-sm text-neutral-600">Ordenes con fotografias o soportes cargados.</p>
        </div>
      </section>

      {message ? <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-900">{message}</div> : null}

      <section className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
        <aside className="min-w-0 space-y-3 rounded-md border border-line bg-white p-4">
          <div>
            <h2 className="font-semibold">Atencion prioritaria</h2>
            <p className="mt-1 text-sm text-neutral-500">Servicios abiertos, en proceso o con novedad.</p>
          </div>
          <div className="space-y-2">
            {operational.attention.slice(0, 5).map((order) => (
              <Link className="block rounded-md border border-line p-3 transition hover:border-apex hover:bg-paper" href={`/dashboard/servicios/${order.id}`} key={order.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{order.number} · {order.customer_name}</p>
                    <p className="mt-1 truncate text-xs text-neutral-500">{order.reference?.code || "Sin referencia"} · {formatDate(order.scheduled_date)}</p>
                  </div>
                  <span className={`shrink-0 rounded-md border px-2 py-1 text-[11px] font-semibold ${statusTone[order.status] || "border-line bg-paper"}`}>{statusLabel[order.status] || order.status}</span>
                </div>
              </Link>
            ))}
            {!operational.attention.length ? <p className="rounded-md bg-paper p-3 text-sm text-neutral-500">Sin servicios abiertos para atender.</p> : null}
          </div>
        </aside>

        <section className="min-w-0 rounded-md border border-line bg-white p-3 shadow-sm sm:p-4">
          <div className="mb-4 grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
            <div className="relative min-w-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" size={16} />
              <input className="h-12 w-full rounded-md border border-line bg-white pl-10 pr-3 text-base md:h-10 md:text-sm" placeholder="Buscar orden, cliente, direccion o referencia" value={query} onChange={(event) => setQuery(event.target.value)} />
            </div>
            <select className="h-12 w-full rounded-md border border-line bg-white px-3 text-base md:h-10 md:text-sm" value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="">Todos los estados</option>
              {Object.entries(statusLabel).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </div>

          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-semibold">Ordenes de servicio</h2>
              <p className="text-sm text-neutral-500">{filtered.length} registro(s) visibles</p>
            </div>
            <span className="inline-flex items-center gap-2 rounded-md bg-paper px-3 py-2 text-xs font-semibold text-neutral-600">
              <Layers3 size={14} />
              Vista operativa
            </span>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            {filtered.map((order) => (
              <Link className="min-h-40 rounded-md border border-line p-3 text-left transition active:scale-[0.99] hover:border-apex hover:bg-paper sm:p-4" href={`/dashboard/servicios/${order.id}`} key={order.id}>
                <div className="mb-3 flex items-start justify-between gap-2">
                  <span className={`rounded-md border px-3 py-2 text-xs font-semibold ${statusTone[order.status] || "border-line bg-paper"}`}>{statusLabel[order.status] || order.status}</span>
                  <span className="min-w-0 truncate text-right text-xs font-semibold text-neutral-500">{order.number}</span>
                </div>
                <div className="flex items-start gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-apex/10 text-apex"><Wrench size={21} /></div>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-base font-semibold">{order.customer_name}</h3>
                    <p className="mt-1 line-clamp-2 text-sm leading-5 text-neutral-600">{order.customer_address}</p>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-neutral-600 sm:flex sm:flex-wrap">
                      <span className="truncate rounded-md bg-paper px-2 py-1">{order.service_type}</span>
                      <span className="truncate rounded-md bg-paper px-2 py-1">{order.reference?.code || "Sin ref."}</span>
                      <span className="rounded-md bg-paper px-2 py-1">{order.photos.length} foto(s)</span>
                      <span className="rounded-md bg-paper px-2 py-1">{order.incidents.length} novedad(es)</span>
                    </div>
                    <div className="mt-4 grid min-w-0 gap-2 sm:flex sm:items-center sm:justify-between sm:gap-3">
                      <span className="text-xs font-medium text-neutral-500">{formatDate(order.scheduled_date)}</span>
                      <span className="inline-flex h-9 min-w-0 items-center justify-center gap-2 rounded-md bg-white px-3 text-xs font-semibold text-apex shadow-sm ring-1 ring-line sm:w-auto">
                        <span className="truncate">{serviceAction(order)}</span>
                        <ChevronRight className="shrink-0" size={14} />
                      </span>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
            {!filtered.length ? (
              <div className="col-span-full rounded-md border border-dashed border-line p-8 text-center sm:p-10">
                <ClipboardCheck className="mx-auto mb-3 text-neutral-300" size={34} />
                <p className="font-semibold">No hay ordenes para este filtro</p>
                <p className="mt-1 text-sm text-neutral-500">Crea una nueva orden o cambia el estado consultado.</p>
              </div>
            ) : null}
          </div>
        </section>
      </section>

      <div className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-[1fr_56px_56px] gap-2 border-t border-line bg-white/95 p-3 pb-[calc(env(safe-area-inset-bottom)+12px)] backdrop-blur md:hidden">
        <Link className="inline-flex h-14 min-w-0 items-center justify-center gap-2 rounded-md bg-apex px-3 text-base font-semibold text-white shadow-sm" href="/dashboard/servicios/nuevo">
          <Plus className="shrink-0" size={18} /> <span className="truncate">Nueva orden</span>
        </Link>
        <Link className="inline-flex h-14 w-14 items-center justify-center rounded-md border border-line bg-white" href="/dashboard/servicios/referencias" aria-label="Referencias">
          <Settings2 size={20} />
        </Link>
        <Link className="inline-flex h-14 w-14 items-center justify-center rounded-md border border-line bg-white" href="/dashboard/servicios/reportes" aria-label="Reportes">
          <BarChart3 size={20} />
        </Link>
      </div>
    </div>
  );
}
