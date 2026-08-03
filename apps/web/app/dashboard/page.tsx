"use client";

import { BrainPanel } from "@/components/brain/BrainPanel";
import { api } from "@/lib/api";
import { loadModuleAccess, ModuleAccessState } from "@/lib/moduleAccess";
import { MODULES } from "@/lib/modules";
import { Activity, AlertTriangle, ArrowRight, Boxes, CheckCircle2, ClipboardCheck, LockKeyhole, MapPinned, ShieldCheck, Truck, Users, Wrench } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type ServicesSummary = {
  data: Array<{ status: string; scheduled_date?: string; photos?: unknown[]; incidents?: unknown[] }>;
  kpis: { pending: number; in_progress: number; closed: number; not_executed: number; total: number };
};
type OperationsMap = { kpis?: { online?: number; offline?: number; routes?: number; people?: number; without_gps?: number }; routes?: unknown[] };
type AttendanceRow = { punches?: unknown[] };
type VehicleMetrics = { total: number; active: number; blocked: number; pending_validation: number; expiring: number; reliable_records: number };
type PreopMetrics = { checklists_today: number; checklists_pending: number; routes_blocked: number; approved_with_findings: number };

type DashboardSummary = {
  services: ServicesSummary["kpis"];
  servicesToday: number;
  evidence: number;
  incidents: number;
  routes: number;
  online: number;
  offline: number;
  withoutGps: number;
  people: number;
  punches: number;
  vehicleActive: number;
  vehicleBlocked: number;
  vehicleExpiring: number;
  vehiclePending: number;
  vehicleTotal: number;
  vehicleReliable: number;
  preopToday: number;
  preopPending: number;
  preopBlocked: number;
  preopFindings: number;
};

const emptySummary: DashboardSummary = {
  services: { pending: 0, in_progress: 0, closed: 0, not_executed: 0, total: 0 },
  servicesToday: 0,
  evidence: 0,
  incidents: 0,
  routes: 0,
  online: 0,
  offline: 0,
  withoutGps: 0,
  people: 0,
  punches: 0,
  vehicleActive: 0,
  vehicleBlocked: 0,
  vehicleExpiring: 0,
  vehiclePending: 0,
  vehicleTotal: 0,
  vehicleReliable: 0,
  preopToday: 0,
  preopPending: 0,
  preopBlocked: 0,
  preopFindings: 0
};

const moduleColors: Record<string, string> = {
  servicios: "#0f766e",
  "talento-humano": "#2563eb",
  transporte: "#7c3aed"
};
const statusTones = [
  "bg-amber-500",
  "bg-sky-600",
  "bg-emerald-600",
  "bg-rose-600"
];

function buildServiceTrend(orders: ServicesSummary["data"]) {
  const formatter = new Intl.DateTimeFormat("es-CO", { weekday: "short" });
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - (6 - index));
    const key = date.toISOString().slice(0, 10);
    return {
      key,
      name: formatter.format(date).replace(".", ""),
      programados: orders.filter((order) => order.scheduled_date?.slice(0, 10) === key).length
    };
  });
}

function MetricBars({ items }: { items: Array<{ name: string; value: number; tone?: string }> }) {
  const max = Math.max(1, ...items.map((item) => item.value));
  return (
    <div className="grid gap-3">
      {items.map((item, index) => (
        <div className="grid gap-1.5" key={item.name}>
          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="font-medium text-neutral-700">{item.name}</span>
            <span className="font-semibold text-neutral-900">{item.value}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-sm bg-paper" aria-hidden="true">
            <div
              className={`h-full ${item.tone || statusTones[index % statusTones.length]}`}
              style={{ width: `${Math.max(4, Math.round((item.value / max) * 100))}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function TrendStrip({ items }: { items: Array<{ name: string; programados: number }> }) {
  const max = Math.max(1, ...items.map((item) => item.programados));
  return (
    <div className="grid h-44 grid-cols-7 items-end gap-2" aria-label="Servicios programados ultimos 7 dias">
      {items.map((item) => (
        <div className="flex h-full flex-col justify-end gap-2" key={item.name}>
          <div className="flex flex-1 items-end">
            <div
              className="w-full rounded-sm bg-emerald-500"
              style={{ height: `${Math.max(6, Math.round((item.programados / max) * 100))}%` }}
              title={`${item.programados} programados`}
            />
          </div>
          <div className="text-center">
            <p className="text-xs font-semibold text-neutral-900">{item.programados}</p>
            <p className="text-[11px] text-neutral-500">{item.name}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const [access, setAccess] = useState<ModuleAccessState>({ loading: true, isPlatformAdmin: false, bySlug: {} });
  const [summary, setSummary] = useState<DashboardSummary>(emptySummary);
  const [serviceTrend, setServiceTrend] = useState(() => buildServiceTrend([]));
  const [dataLoading, setDataLoading] = useState(true);
  const [sourceErrors, setSourceErrors] = useState<string[]>([]);
  const [accessError, setAccessError] = useState(false);

  useEffect(() => {
    if (localStorage.getItem("role_name")?.toLowerCase() === "tecnico") {
      router.replace("/dashboard/servicios");
      return;
    }
    loadModuleAccess(MODULES)
      .then((state) => {
        setAccessError(false);
        setAccess(state);
      })
      .catch((error) => {
        console.error("No fue posible resolver los módulos habilitados.", error);
        setAccessError(true);
        setAccess({ loading: false, isPlatformAdmin: false, bySlug: {} });
      });
  }, [router]);

  useEffect(() => {
    if (access.loading) return;

    const servicesEnabled = access.bySlug.servicios === true;
    const hrEnabled = access.bySlug["talento-humano"] === true;
    const transportEnabled = access.bySlug.transporte === true;
    const failures: string[] = [];
    const reportFailure = (source: string, error: unknown) => {
      failures.push(source);
      console.error(`No fue posible consultar ${source}.`, error);
    };
    setDataLoading(true);

    Promise.all([
      servicesEnabled ? api<ServicesSummary>("/api/v1/services/orders?limit=200").catch((error) => { reportFailure("Servicios", error); return null; }) : Promise.resolve(null),
      hrEnabled ? api<OperationsMap>("/api/v1/hr/operations-map").catch((error) => { reportFailure("Mapa operativo", error); return null; }) : Promise.resolve(null),
      hrEnabled ? api<AttendanceRow[]>("/api/v1/hr/attendance").catch((error) => { reportFailure("Marcaciones", error); return []; }) : Promise.resolve([]),
      transportEnabled ? api<VehicleMetrics>("/api/v1/transport/vehicles/metrics/dashboard").catch((error) => { reportFailure("Transporte", error); return null; }) : Promise.resolve(null),
      hrEnabled ? api<PreopMetrics>("/api/v1/hr/routes/preop/metrics").catch((error) => { reportFailure("Preoperacionales", error); return null; }) : Promise.resolve(null)
    ]).then(([services, operations, attendance, vehicleMetrics, preopMetrics]) => {
      const orders = services?.data || [];
      const attendanceRows: AttendanceRow[] = Array.isArray(attendance) ? attendance : [];
      const today = new Date().toISOString().slice(0, 10);
      setServiceTrend(buildServiceTrend(orders));
      setSummary({
        services: services?.kpis || emptySummary.services,
        servicesToday: orders.filter((order) => order.scheduled_date?.slice(0, 10) === today).length,
        evidence: orders.reduce((sum, order) => sum + (order.photos?.length || 0), 0),
        incidents: orders.reduce((sum, order) => sum + (order.incidents?.length || 0), 0),
        routes: operations?.kpis?.routes || operations?.routes?.length || 0,
        online: operations?.kpis?.online || 0,
        offline: operations?.kpis?.offline || 0,
        withoutGps: operations?.kpis?.without_gps || 0,
        people: operations?.kpis?.people || 0,
        punches: attendanceRows.reduce((sum, item) => sum + (item.punches?.length || 0), 0),
        vehicleActive: vehicleMetrics?.active || 0,
        vehicleBlocked: vehicleMetrics?.blocked || 0,
        vehicleExpiring: vehicleMetrics?.expiring || 0,
        vehiclePending: vehicleMetrics?.pending_validation || 0,
        vehicleTotal: vehicleMetrics?.total || 0,
        vehicleReliable: vehicleMetrics?.reliable_records || 0,
        preopToday: preopMetrics?.checklists_today || 0,
        preopPending: preopMetrics?.checklists_pending || 0,
        preopBlocked: preopMetrics?.routes_blocked || 0,
        preopFindings: preopMetrics?.approved_with_findings || 0
      });
      setSourceErrors([...new Set(failures)]);
    }).catch((error) => {
      console.error("No fue posible construir el resumen del dashboard.", error);
      setSourceErrors([...new Set([...failures, "Resumen del dashboard"])]);
    }).finally(() => setDataLoading(false));
  }, [access]);

  const enabled = (slug: string) => !access.loading && access.bySlug[slug] === true;
  const orderedModules = [...MODULES]
    .sort((a, b) => {
      const aEnabled = enabled(a.slug);
      const bEnabled = enabled(b.slug);
      if (aEnabled !== bEnabled) return aEnabled ? -1 : 1;
      return (access.orderBySlug?.[a.slug] ?? 999) - (access.orderBySlug?.[b.slug] ?? 999);
    });
  const activeModules = [...MODULES]
    .filter((module) => enabled(module.slug))
    .sort((a, b) => (access.orderBySlug?.[a.slug] ?? 999) - (access.orderBySlug?.[b.slug] ?? 999));
  const activeServices = summary.services.pending + summary.services.in_progress;
  const supportedModules = activeModules.filter((module) => ["servicios", "talento-humano", "transporte"].includes(module.slug));
  const visibleSourceErrors = accessError ? ["Acceso a módulos", ...sourceErrors] : sourceErrors;

  const headlineMetrics = [
    { module: "servicios", label: "Servicios abiertos", value: activeServices, context: `${summary.servicesToday} programados hoy`, icon: Wrench, color: moduleColors.servicios },
    { module: "servicios", label: "Servicios cerrados", value: summary.services.closed, context: `${summary.services.total} órdenes consultadas`, icon: CheckCircle2, color: moduleColors.servicios },
    { module: "talento-humano", label: "Personas planeadas", value: summary.people, context: `${summary.online} con señal reciente`, icon: Users, color: moduleColors["talento-humano"] },
    { module: "talento-humano", label: "Rutas de hoy", value: summary.routes, context: `${summary.punches} marcaciones registradas`, icon: MapPinned, color: moduleColors["talento-humano"] },
    { module: "transporte", label: "Vehículos registrados", value: summary.vehicleTotal, context: `${summary.vehicleActive} activos`, icon: Truck, color: moduleColors.transporte },
    { module: "transporte", label: "Registros confiables", value: summary.vehicleReliable, context: `${summary.vehiclePending} por validar`, icon: ShieldCheck, color: moduleColors.transporte }
  ].filter((item) => enabled(item.module));

  const alerts = [
    { module: "servicios", label: "Servicios no ejecutados", value: summary.services.not_executed, detail: "Órdenes que requieren revisión", color: "#dc2626" },
    { module: "servicios", label: "Novedades de servicio", value: summary.incidents, detail: "Incidentes reportados", color: "#d97706" },
    { module: "talento-humano", label: "Personas sin GPS", value: summary.withoutGps, detail: "Sin ubicación disponible", color: "#d97706" },
    { module: "talento-humano", label: "Rutas bloqueadas", value: summary.preopBlocked, detail: "Bloqueadas por preoperacional", color: "#be123c" },
    { module: "transporte", label: "Vehículos bloqueados", value: summary.vehicleBlocked, detail: "No disponibles para operar", color: "#be123c" },
    { module: "transporte", label: "Documentos por vencer", value: summary.vehicleExpiring, detail: "Vehículos que requieren gestión", color: "#d97706" }
  ].filter((item) => enabled(item.module) && item.value > 0);

  const moduleActivityData = [
    { module: "servicios", name: "Servicios hoy", value: summary.servicesToday },
    { module: "talento-humano", name: "Personas campo", value: summary.people },
    { module: "talento-humano", name: "Rutas hoy", value: summary.routes },
    { module: "transporte", name: "Vehículos", value: summary.vehicleTotal }
  ].filter((item) => enabled(item.module));

  const concreteSignals = [
    { module: "servicios", label: "Evidencias", value: summary.evidence, icon: Boxes },
    { module: "servicios", label: "Novedades", value: summary.incidents, icon: AlertTriangle },
    { module: "talento-humano", label: "Marcaciones", value: summary.punches, icon: Activity },
    { module: "talento-humano", label: "Preoperacionales", value: summary.preopToday, icon: ClipboardCheck },
    { module: "transporte", label: "Vehículos activos", value: summary.vehicleActive, icon: Truck }
  ].filter((item) => enabled(item.module)).slice(0, 4);

  const serviceData = [
    { name: "Pendientes", value: summary.services.pending },
    { name: "En curso", value: summary.services.in_progress },
    { name: "Cerradas", value: summary.services.closed },
    { name: "No ejecutadas", value: summary.services.not_executed }
  ];

  const moduleRows = [
    {
      module: "servicios",
      name: "Servicios",
      description: `${activeServices} órdenes abiertas, ${summary.services.closed} cerradas y ${summary.servicesToday} programadas hoy.`,
      value: `${summary.services.total} órdenes`
    },
    {
      module: "talento-humano",
      name: "Talento humano",
      description: `${summary.people} personas planeadas, ${summary.online} con señal y ${summary.routes} rutas registradas.`,
      value: `${summary.punches} marcaciones`
    },
    {
      module: "transporte",
      name: "Transporte",
      description: `${summary.vehicleActive} vehículos activos, ${summary.vehicleBlocked} bloqueados y ${summary.vehicleExpiring} por vencer.`,
      value: `${summary.vehicleTotal} vehículos`
    }
  ];

  if (access.loading) {
    return <div className="rounded-md border border-line bg-white p-8 text-sm text-neutral-500">Preparando el tablero según los módulos habilitados...</div>;
  }

  return (
    <div className="apex-workspace-shell space-y-6">
      <section className="border-b border-line pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-[22px] font-semibold">Dashboard</h1>
          <span className="text-xs font-semibold text-neutral-500">{activeModules.length} modulo(s)</span>
        </div>
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {activeModules.slice(0, 8).map((module, index) => {
              const Icon = module.icon;
              return (
                <Link className={`group flex h-10 shrink-0 items-center gap-2 rounded-md border px-3 text-sm font-semibold transition-colors hover:bg-paper ${index === 0 ? "border-apex text-apex" : "border-line text-neutral-700"}`} href={`/dashboard/${module.slug}`} key={module.slug} prefetch={false}>
                  <Icon size={16} />
                  <span>{module.name}</span>
                </Link>
              );
            })}
            {!activeModules.length ? (
              <div className="rounded-md border border-line bg-paper px-3 py-2 text-sm text-neutral-600">No hay modulos activos para esta empresa.</div>
            ) : null}
          </div>
      </section>

      <section className="apex-dashboard-grid">
        <div className="overflow-hidden rounded-md border border-line bg-white">
          <div className="p-5">
            <div className="min-h-48 min-w-0">
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="text-sm font-semibold">{enabled("servicios") ? "Servicios programados · últimos 7 días" : "Actividad registrada"}</p>
                <span className="text-xs text-neutral-500">
                  {enabled("servicios") ? `${summary.servicesToday} hoy` : `${supportedModules.length} módulos`}
                </span>
              </div>
              {enabled("servicios") ? (
                <TrendStrip items={serviceTrend} />
              ) : moduleActivityData.length ? (
                <MetricBars items={moduleActivityData.map((item) => ({ ...item, tone: "bg-apex" }))} />
              ) : (
                <div className="flex h-44 items-center justify-center text-center text-sm text-neutral-500">
                  Los módulos activos aparecerán aquí cuando cuenten con actividad registrada.
                </div>
              )}
            </div>
          </div>

          {concreteSignals.length > 0 && (
            <div className="grid border-t border-line md:grid-cols-4">
              {concreteSignals.map((item) => {
                const Icon = item.icon;
                return (
                  <div className="flex items-center gap-3 border-t border-line px-5 py-4 first:border-t-0 md:border-l md:border-t-0 md:first:border-l-0" key={item.label}>
                    <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-paper text-apex"><Icon size={17} /></span>
                    <div><p className="text-lg font-semibold leading-tight">{item.value}</p><p className="text-xs text-neutral-500">{item.label}</p></div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <aside className="rounded-md border border-line bg-white p-4">
          <h2 className="text-base font-semibold">Requiere atención</h2>
          <div className="mt-4 divide-y divide-line">
            {visibleSourceErrors.length > 0 && (
              <div className="flex items-center justify-between gap-4 py-3">
                <div><p className="text-sm font-semibold">Fuentes sin respuesta</p><p className="text-xs text-neutral-500">{visibleSourceErrors.join(" · ")}</p></div>
                <span className="min-w-10 rounded-md bg-neutral-800 px-2 py-1 text-center text-sm font-bold text-white">{visibleSourceErrors.length}</span>
              </div>
            )}
            {dataLoading ? (
              <p className="py-8 text-center text-sm text-neutral-500">Consultando actividad...</p>
            ) : alerts.length ? alerts.map((item) => (
              <div className="flex items-center justify-between gap-4 py-3" key={item.label}>
                <div><p className="text-sm font-semibold">{item.label}</p><p className="text-xs text-neutral-500">{item.detail}</p></div>
                <span className="min-w-10 rounded-md px-2 py-1 text-center text-sm font-bold text-white" style={{ backgroundColor: item.color }}>{item.value}</span>
              </div>
            )) : (
              <div className="py-8 text-center">
                <p className="text-sm font-semibold text-emerald-700">Sin excepciones registradas</p>
                <p className="mt-1 text-xs text-neutral-500">Los módulos activos no reportan pendientes críticos.</p>
              </div>
            )}
          </div>
        </aside>
      </section>

      {headlineMetrics.length > 0 && (
        <section className="overflow-hidden rounded-md border border-line bg-white">
          <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
            <h2 className="text-sm font-semibold">Cifras clave</h2>
            <span className="text-xs font-medium text-neutral-500">{headlineMetrics.length} indicadores</span>
          </div>
          <div className="grid md:grid-cols-2 xl:grid-cols-3">
          {headlineMetrics.map((item) => {
            const Icon = item.icon;
            return (
              <Link className="group flex items-center gap-3 border-b border-line px-4 py-3 transition hover:bg-paper md:border-r xl:[&:nth-child(3n)]:border-r-0" href={`/dashboard/${item.module}`} key={item.label} prefetch={false}>
                <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-paper" style={{ color: item.color }}><Icon size={16} /></span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <p className="text-base font-semibold leading-none">{item.value}</p>
                    <h3 className="truncate text-xs font-semibold">{item.label}</h3>
                  </div>
                  <p className="mt-1 truncate text-xs text-neutral-500">{item.context}</p>
                </div>
                <ArrowRight className="shrink-0 text-neutral-300 transition group-hover:translate-x-0.5 group-hover:text-neutral-700" size={15} />
              </Link>
            );
          })}
          </div>
        </section>
      )}

      {enabled("servicios") && (
        <section className="rounded-md border border-line bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-semibold">Estado de servicios</h2>
            <Link className="inline-flex items-center gap-2 text-sm font-semibold text-apex" href="/dashboard/servicios" prefetch={false}>Abrir Servicios <ArrowRight size={15} /></Link>
          </div>
          <div className="mt-4">
            <MetricBars items={serviceData} />
          </div>
        </section>
      )}

      <section className="apex-dashboard-grid">
        <div className="rounded-md border border-line bg-white p-4">
          <h2 className="text-base font-semibold">Resumen por módulo</h2>
          <div className="mt-4 divide-y divide-line">
            {moduleRows.length ? moduleRows.map((item) => (
              enabled(item.module) ? (
                <Link className="grid gap-3 py-4 transition hover:bg-paper md:grid-cols-[160px_1fr_130px_20px]" href={`/dashboard/${item.module}`} key={item.module} prefetch={false}>
                  <p className="text-sm font-semibold">{item.name}</p>
                  <p className="text-sm text-neutral-600">{item.description}</p>
                  <p className="text-right text-sm font-semibold">{item.value}</p>
                  <ArrowRight className="text-neutral-400" size={16} />
                </Link>
              ) : (
                <div className="grid gap-3 py-4 text-neutral-500 md:grid-cols-[160px_1fr_130px_20px]" key={item.module}>
                  <p className="text-sm font-semibold">{item.name}</p>
                  <p className="text-sm">Modulo visible, bloqueado por suscripcion o permisos actuales.</p>
                  <p className="text-right text-sm font-semibold">Bloqueado</p>
                  <LockKeyhole className="text-neutral-400" size={16} />
                </div>
              )
            )) : (
              <p className="py-8 text-center text-sm text-neutral-500">No hay módulos activos con un resumen analítico disponible.</p>
            )}
          </div>
        </div>
        <BrainPanel />
      </section>

      {orderedModules.length > 0 && (
        <section className="rounded-md border border-line bg-white p-4">
          <h2 className="text-base font-semibold">Módulos disponibles</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {orderedModules.map((module) => {
              const Icon = module.icon;
              const moduleEnabled = enabled(module.slug);
              if (!moduleEnabled) {
                return (
                  <div className="flex items-center gap-3 rounded-md border border-line bg-paper/60 p-3 text-neutral-500" key={module.slug} title="Modulo bloqueado por suscripcion o permisos">
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-white text-neutral-400"><Icon size={17} /></span>
                    <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{module.name}</p><p className="truncate text-xs">Bloqueado</p></div>
                    <LockKeyhole className="text-neutral-400" size={16} />
                  </div>
                );
              }
              return (
                <Link className="group flex items-center gap-3 rounded-md border border-line p-3 transition hover:border-neutral-300 hover:bg-paper" href={`/dashboard/${module.slug}`} key={module.slug} prefetch={false}>
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-paper text-apex"><Icon size={17} /></span>
                  <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{module.name}</p><p className="truncate text-xs text-neutral-500">{module.area}</p></div>
                  <ArrowRight className="text-neutral-300 transition group-hover:translate-x-0.5 group-hover:text-neutral-700" size={16} />
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
