"use client";

import { BrainPanel } from "@/components/brain/BrainPanel";
import { api } from "@/lib/api";
import { loadModuleAccess, ModuleAccessState } from "@/lib/moduleAccess";
import { MODULES } from "@/lib/modules";
import { Activity, Boxes, CheckCircle2, Clock, LockKeyhole, MapPinned, TrendingUp, Users, Wrench } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

type ServicesSummary = { data: Array<{ status: string; photos: unknown[]; incidents: unknown[] }>; kpis: { pending: number; in_progress: number; closed: number; not_executed: number; total: number } };
type OperationsMap = { kpis?: { online?: number; offline?: number; routes?: number; people?: number; without_gps?: number }; routes?: unknown[] };
type Attendance = { punches: unknown[] };

export default function DashboardPage() {
  const [access, setAccess] = useState<ModuleAccessState>({ loading: true, isPlatformAdmin: false, bySlug: {} });
  const [summary, setSummary] = useState({
    services: { pending: 0, in_progress: 0, closed: 0, not_executed: 0, total: 0 },
    evidence: 0,
    incidents: 0,
    routes: 0,
    online: 0,
    people: 0,
    punches: 0
  });

  useEffect(() => {
    if (localStorage.getItem("auth_provider") === "supabase") {
      loadModuleAccess(MODULES).then(setAccess).catch(() => setAccess({ loading: false, isPlatformAdmin: false, bySlug: {} }));
    } else {
      setAccess({ loading: false, isPlatformAdmin: false, bySlug: Object.fromEntries(MODULES.map((module) => [module.slug, true])) });
    }
  }, []);

  useEffect(() => {
    if (localStorage.getItem("auth_provider") === "supabase") return;
    Promise.all([
      api<ServicesSummary>("/api/v1/services/orders?limit=200").catch(() => null),
      api<OperationsMap>("/api/v1/hr/operations-map").catch(() => null),
      api<Attendance[]>("/api/v1/hr/attendance").catch(() => [])
    ]).then(([services, operations, attendance]) => {
      const orders = services?.data || [];
      const attendanceRows = Array.isArray(attendance) ? attendance as Attendance[] : [];
      setSummary({
        services: services?.kpis || { pending: 0, in_progress: 0, closed: 0, not_executed: 0, total: 0 },
        evidence: orders.reduce((sum, order) => sum + (order.photos?.length || 0), 0),
        incidents: orders.reduce((sum, order) => sum + (order.incidents?.length || 0), 0),
        routes: operations?.kpis?.routes || operations?.routes?.length || 0,
        online: operations?.kpis?.online || 0,
        people: operations?.kpis?.people || 0,
        punches: attendanceRows.reduce((sum: number, item: Attendance) => sum + (item.punches?.length || 0), 0)
      });
    });
  }, []);

  const activeModules = MODULES.filter((module) => access.loading || access.bySlug[module.slug] === true).length;
  const kpis = [
    { label: "Servicios activos", value: String(summary.services.in_progress + summary.services.pending), hint: `${summary.services.closed} cerrados`, icon: Wrench },
    { label: "Cumplimiento", value: summary.services.total ? `${Math.round((summary.services.closed / summary.services.total) * 100)}%` : "100%", hint: `${summary.services.total} ordenes`, icon: CheckCircle2 },
    { label: "Equipo en ruta", value: String(summary.online), hint: `${summary.people} personas rastreadas`, icon: MapPinned },
    { label: "Marcaciones hoy", value: String(summary.punches), hint: `${summary.routes} rutas planeadas`, icon: Clock }
  ];
  const bars = [
    { label: "Pendientes", value: summary.services.pending, className: "bg-amber-500" },
    { label: "En curso", value: summary.services.in_progress, className: "bg-sky-600" },
    { label: "Cerradas", value: summary.services.closed, className: "bg-emerald-600" },
    { label: "No ejecutadas", value: summary.services.not_executed, className: "bg-rose-600" }
  ];
  const maxBar = Math.max(...bars.map((bar) => bar.value), 1);

  return (
    <div className="space-y-5">
      <header>
        <p className="text-sm font-medium text-apex">APEX CORE</p>
        <h1 className="text-3xl font-semibold">Tablero operativo</h1>
      </header>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <div className="rounded-md border border-line bg-white p-4" key={kpi.label}>
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm text-neutral-500">{kpi.label}</p>
                <Icon size={18} className="text-apex" />
              </div>
              <p className="text-2xl font-semibold">{kpi.value}</p>
              <p className="mt-1 text-xs font-medium text-neutral-500">{kpi.hint}</p>
            </div>
          );
        })}
      </section>
      <section className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <div className="rounded-md border border-line bg-white p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">Pulso operativo</h2>
              <p className="text-sm text-neutral-600">Tendencia de servicios y control de campo segun datos activos.</p>
            </div>
            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
              <TrendingUp size={13} /> En vivo
            </span>
          </div>
          <div className="space-y-3">
            {bars.map((bar) => (
              <div key={bar.label}>
                <div className="mb-1 flex justify-between text-sm">
                  <span className="text-neutral-600">{bar.label}</span>
                  <span className="font-semibold">{bar.value}</span>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-paper">
                  <div className={`h-full rounded-full ${bar.className}`} style={{ width: `${Math.max(8, (bar.value / maxBar) * 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-md bg-paper p-3"><Activity className="mb-2 text-apex" size={16} /><p className="text-lg font-semibold">{summary.evidence}</p><p className="text-xs text-neutral-500">Evidencias</p></div>
            <div className="rounded-md bg-paper p-3"><Boxes className="mb-2 text-apex" size={16} /><p className="text-lg font-semibold">{summary.incidents}</p><p className="text-xs text-neutral-500">Novedades</p></div>
            <div className="rounded-md bg-paper p-3"><Users className="mb-2 text-apex" size={16} /><p className="text-lg font-semibold">{activeModules}</p><p className="text-xs text-neutral-500">Modulos activos</p></div>
          </div>
        </div>
        <BrainPanel />
      </section>
      <section className="rounded-md border border-line bg-white p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Módulos activos</h2>
            <p className="text-sm text-neutral-600">Cuenta administradora con acceso completo para revisión.</p>
          </div>
          <span className="rounded-md bg-paper px-3 py-1 text-sm">{MODULES.length} módulos</span>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {MODULES.map((module) => {
            const Icon = module.icon;
            const enabled = access.loading ? true : access.bySlug[module.slug] === true;
            const cardClassName = enabled
              ? "rounded-md border border-line p-3 hover:bg-paper"
              : "rounded-md border border-amber-300 bg-amber-50/70 p-3 text-amber-900";
            const content = (
              <>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Icon size={18} className={enabled ? "text-apex" : "text-amber-700"} />
                    <p className="text-sm font-semibold">{module.name}</p>
                  </div>
                  <span className={`inline-flex items-center gap-1 text-xs ${enabled ? "text-neutral-500" : "text-amber-700"}`}>
                    {!enabled ? <LockKeyhole size={13} /> : null}
                    {module.id}
                  </span>
                </div>
                <p className={`line-clamp-2 text-sm ${enabled ? "text-neutral-600" : "text-amber-800"}`}>{module.summary}</p>
              </>
            );
            return enabled ? (
              <Link className={cardClassName} href={`/dashboard/${module.slug}`} key={module.id}>
                {content}
              </Link>
            ) : (
              <div className={cardClassName} key={module.id} title={`${module.name} bloqueado`}>
                {content}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
