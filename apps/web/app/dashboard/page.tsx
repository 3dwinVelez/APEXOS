"use client";

import { BrainPanel } from "@/components/brain/BrainPanel";
import { api } from "@/lib/api";
import { loadModuleAccess, ModuleAccessState } from "@/lib/moduleAccess";
import { MODULES } from "@/lib/modules";
import { Activity, AlertTriangle, Boxes, Gauge, MapPinned, ShieldCheck, TrendingUp, Users, Wrench } from "lucide-react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type ServicesSummary = {
  data: Array<{ status: string; scheduled_date?: string; photos: unknown[]; incidents: unknown[] }>;
  kpis: { pending: number; in_progress: number; closed: number; not_executed: number; total: number };
};
type OperationsMap = { kpis?: { online?: number; offline?: number; routes?: number; people?: number; without_gps?: number }; routes?: unknown[] };
type Attendance = { punches: unknown[] };
type VehicleMetrics = { total: number; active: number; blocked: number; pending_validation: number; expiring: number; reliable_records: number; average_score: number };
type PreopMetrics = { checklists_today: number; checklists_pending: number; routes_blocked: number; compliance_rate: number; approved_with_findings: number };

const statusColors = ["#f59e0b", "#0284c7", "#059669", "#dc2626"];

const clamp = (value: number) => Math.min(100, Math.max(0, Math.round(Number.isFinite(value) ? value : 0)));

export default function DashboardPage() {
  const router = useRouter();
  const [access, setAccess] = useState<ModuleAccessState>({ loading: true, isPlatformAdmin: false, bySlug: {} });
  const [summary, setSummary] = useState({
    services: { pending: 0, in_progress: 0, closed: 0, not_executed: 0, total: 0 },
    servicesToday: 0,
    evidence: 0,
    incidents: 0,
    routes: 0,
    online: 0,
    people: 0,
    punches: 0,
    vehicleScore: 0,
    vehicleBlocked: 0,
    vehicleExpiring: 0,
    vehicleTotal: 0,
    vehicleReliable: 0,
    preopToday: 0,
    preopPending: 0,
    preopBlocked: 0,
    preopCompliance: 100
  });

  useEffect(() => {
    if (localStorage.getItem("role_name")?.toLowerCase() === "tecnico") {
      router.replace("/dashboard/servicios");
      return;
    }
    if (localStorage.getItem("auth_provider") === "supabase") {
      loadModuleAccess(MODULES).then(setAccess).catch(() => setAccess({ loading: false, isPlatformAdmin: false, bySlug: {} }));
    } else {
      setAccess({ loading: false, isPlatformAdmin: false, bySlug: Object.fromEntries(MODULES.map((module) => [module.slug, true])) });
    }
  }, [router]);

  useEffect(() => {
    Promise.all([
      api<ServicesSummary>("/api/v1/services/orders?limit=200").catch(() => null),
      api<OperationsMap>("/api/v1/hr/operations-map").catch(() => null),
      api<Attendance[]>("/api/v1/hr/attendance").catch(() => []),
      api<VehicleMetrics>("/api/v1/transport/vehicles/metrics/dashboard").catch(() => null),
      api<PreopMetrics>("/api/v1/hr/routes/preop/metrics").catch(() => null)
    ]).then(([services, operations, attendance, vehicleMetrics, preopMetrics]) => {
      const orders = services?.data || [];
      const attendanceRows = Array.isArray(attendance) ? attendance : [];
      const today = new Date().toISOString().slice(0, 10);
      setSummary({
        services: services?.kpis || { pending: 0, in_progress: 0, closed: 0, not_executed: 0, total: 0 },
        servicesToday: orders.filter((order) => order.scheduled_date?.slice(0, 10) === today).length,
        evidence: orders.reduce((sum, order) => sum + (order.photos?.length || 0), 0),
        incidents: orders.reduce((sum, order) => sum + (order.incidents?.length || 0), 0),
        routes: operations?.kpis?.routes || operations?.routes?.length || 0,
        online: operations?.kpis?.online || 0,
        people: operations?.kpis?.people || 0,
        punches: attendanceRows.reduce((sum, item) => sum + (item.punches?.length || 0), 0),
        vehicleScore: clamp(vehicleMetrics?.average_score || 0),
        vehicleBlocked: vehicleMetrics?.blocked || 0,
        vehicleExpiring: vehicleMetrics?.expiring || 0,
        vehicleTotal: vehicleMetrics?.total || 0,
        vehicleReliable: vehicleMetrics?.reliable_records || 0,
        preopToday: preopMetrics?.checklists_today || 0,
        preopPending: preopMetrics?.checklists_pending || 0,
        preopBlocked: preopMetrics?.routes_blocked || 0,
        preopCompliance: clamp(preopMetrics?.compliance_rate ?? 100)
      });
    });
  }, []);

  const enabled = (slug: string) => access.loading || access.bySlug[slug] === true;
  const serviceCompletion = summary.services.total ? clamp((summary.services.closed / summary.services.total) * 100) : 100;
  const fieldCoverage = summary.people ? clamp((summary.online / summary.people) * 100) : 0;
  const riskScore = clamp(100 - (summary.vehicleBlocked * 18 + summary.vehicleExpiring * 8 + summary.services.not_executed * 5 + summary.preopBlocked * 12));
  const activeServices = summary.services.pending + summary.services.in_progress;
  const operationalLoad = activeServices + summary.preopPending + summary.vehicleBlocked + summary.incidents;

  const operationalHealthInputs = [
    enabled("servicios") ? serviceCompletion : null,
    enabled("talento-humano") && summary.people ? fieldCoverage : null,
    enabled("transporte") && summary.vehicleTotal ? summary.vehicleScore : null,
    enabled("talento-humano") ? summary.preopCompliance : null,
    riskScore
  ].filter((value): value is number => value !== null);
  const controlHealth = clamp(operationalHealthInputs.reduce((sum, value) => sum + value, 0) / Math.max(1, operationalHealthInputs.length));

  const metrics = [
    {
      module: "servicios",
      label: "Servicios por resolver",
      value: activeServices,
      context: `${summary.servicesToday} para hoy · ${summary.services.not_executed} no ejecutados · ${summary.services.total} total`,
      health: serviceCompletion,
      icon: Wrench,
      color: "#0f766e"
    },
    {
      module: "talento-humano",
      label: "Equipo con señal",
      value: `${summary.online}/${summary.people}`,
      context: `${summary.punches} marcaciones registradas`,
      health: fieldCoverage,
      icon: MapPinned,
      color: "#2563eb"
    },
    {
      module: "transporte",
      label: "Flota confiable",
      value: `${summary.vehicleReliable}/${summary.vehicleTotal}`,
      context: `${summary.vehicleBlocked} bloqueados · ${summary.vehicleExpiring} por vencer`,
      health: summary.vehicleScore,
      icon: ShieldCheck,
      color: "#7c3aed"
    },
    {
      module: "talento-humano",
      label: "Preoperacional",
      value: summary.preopToday,
      context: `${summary.preopBlocked} rutas bloqueadas`,
      health: summary.preopCompliance,
      icon: Gauge,
      color: "#be123c"
    }
  ].filter((item) => enabled(item.module));

  const alerts = [
    { label: "Servicios activos", value: activeServices, detail: "Pendientes o en proceso", color: "#0f766e", severity: activeServices > 0 },
    { label: "Riesgo documental", value: summary.vehicleBlocked + summary.vehicleExpiring, detail: "Vehiculos bloqueados o por vencer", color: "#d97706", severity: summary.vehicleBlocked + summary.vehicleExpiring > 0 },
    { label: "Bloqueos preop", value: summary.preopBlocked, detail: "Rutas detenidas por checklist", color: "#be123c", severity: summary.preopBlocked > 0 },
    { label: "Novedades", value: summary.incidents, detail: "Incidentes reportados en servicios", color: "#334155", severity: summary.incidents > 0 }
  ].filter((item) => item.severity);

  const serviceData = [
    { name: "Pendientes", value: summary.services.pending },
    { name: "En curso", value: summary.services.in_progress },
    { name: "Cerradas", value: summary.services.closed },
    { name: "No ejecutadas", value: summary.services.not_executed }
  ];

  const pulseData = [
    { module: "servicios", name: "Servicios", volumen: activeServices, salud: serviceCompletion },
    { module: "talento-humano", name: "Campo", volumen: summary.online, salud: fieldCoverage },
    { module: "talento-humano", name: "Preop", volumen: summary.preopToday, salud: summary.preopCompliance },
    { module: "transporte", name: "Flota", volumen: summary.vehicleTotal, salud: summary.vehicleScore },
    { module: "global", name: "Riesgo", volumen: summary.incidents + summary.vehicleBlocked + summary.preopBlocked, salud: riskScore }
  ].filter((item) => item.module === "global" || enabled(item.module));

  const concreteSignals = [
    { module: "servicios", label: "Evidencias", value: summary.evidence, icon: Boxes },
    { module: "talento-humano", label: "Rutas activas", value: summary.routes, icon: Activity },
    { module: "talento-humano", label: "Personas campo", value: summary.people, icon: Users },
    { module: "global", label: "Carga abierta", value: operationalLoad, icon: AlertTriangle }
  ].filter((item) => item.module === "global" || enabled(item.module));

  return (
    <div className="space-y-6">
      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="overflow-hidden rounded-md bg-neutral-950 text-white">
          <div className="grid gap-6 p-5 lg:grid-cols-[240px_minmax(0,1fr)]">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">Control operacional</p>
              <h1 className="mt-3 text-2xl font-semibold md:text-3xl">Tablero ejecutivo APEX-OS</h1>
              <p className="mt-3 text-sm leading-6 text-white/68">
                Indicadores activos tomados de servicios, campo, flota y preoperacional. Sin datos decorativos.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-[190px_minmax(0,1fr)]">
              <div className="flex min-h-44 flex-col justify-between border-l border-white/12 pl-5">
                <div>
                  <p className="text-sm text-white/58">Salud operativa</p>
                  <div className="mt-2 flex items-end gap-2">
                    <span className="text-6xl font-semibold leading-none">{controlHealth}</span>
                    <span className="pb-2 text-sm text-white/55">/100</span>
                  </div>
                </div>
                <div>
                  <div className="h-2 overflow-hidden rounded-full bg-white/12">
                    <div className="h-full rounded-full bg-emerald-400" style={{ width: `${controlHealth}%` }} />
                  </div>
                  <p className="mt-2 text-xs text-white/55">{operationalLoad} frentes requieren seguimiento.</p>
                </div>
              </div>

              <div className="h-44 min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={pulseData}>
                    <defs>
                      <linearGradient id="healthFill" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor="#34d399" stopOpacity={0.45} />
                        <stop offset="100%" stopColor="#34d399" stopOpacity={0.04} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "rgba(255,255,255,0.58)", fontSize: 12 }} />
                    <YAxis domain={[0, 100]} axisLine={false} tickLine={false} tick={{ fill: "rgba(255,255,255,0.42)", fontSize: 12 }} />
                    <Tooltip contentStyle={{ borderRadius: 8, borderColor: "#e5e7eb" }} />
                    <Area type="monotone" dataKey="salud" stroke="#34d399" strokeWidth={3} fill="url(#healthFill)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="grid border-t border-white/10 md:grid-cols-4">
            {concreteSignals.map((item) => {
              const Icon = item.icon;
              return (
                <div className="flex items-center gap-3 border-t border-white/10 px-5 py-4 first:border-t-0 md:border-l md:border-t-0 md:first:border-l-0" key={item.label}>
                  <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-white/10 text-emerald-200">
                    <Icon size={17} />
                  </span>
                  <div>
                    <p className="text-2xl font-semibold leading-tight">{item.value}</p>
                    <p className="text-xs text-white/55">{item.label}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <aside className="rounded-md border border-line bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">Prioridades</h2>
              <p className="text-sm text-neutral-500">Solo puntos con accion requerida.</p>
            </div>
            <TrendingUp className="text-apex" size={18} />
          </div>
          <div className="mt-4 divide-y divide-line">
            {alerts.length ? alerts.map((item) => (
              <div className="flex items-center justify-between gap-4 py-3" key={item.label}>
                <div>
                  <p className="text-sm font-semibold">{item.label}</p>
                  <p className="text-xs text-neutral-500">{item.detail}</p>
                </div>
                <span className="min-w-10 rounded-md px-2 py-1 text-center text-sm font-bold text-white" style={{ backgroundColor: item.color }}>
                  {item.value}
                </span>
              </div>
            )) : (
              <div className="py-8 text-center">
                <p className="text-sm font-semibold text-emerald-700">Sin bloqueos criticos</p>
                <p className="mt-1 text-xs text-neutral-500">Los indicadores activos no reportan acciones urgentes.</p>
              </div>
            )}
          </div>
        </aside>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {metrics.map((item) => {
          const Icon = item.icon;
          return (
            <article className="rounded-md border border-line bg-white p-4" key={item.label}>
              <div className="flex items-start justify-between gap-3">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-paper" style={{ color: item.color }}>
                  <Icon size={18} />
                </span>
                <span className="text-xs font-semibold text-neutral-500">{item.health}%</span>
              </div>
              <p className="mt-4 text-3xl font-semibold leading-none">{item.value}</p>
              <h3 className="mt-2 text-sm font-semibold">{item.label}</h3>
              <p className="mt-1 min-h-8 text-xs leading-4 text-neutral-500">{item.context}</p>
              <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-neutral-100">
                <div className="h-full rounded-full" style={{ width: `${clamp(item.health)}%`, backgroundColor: item.color }} />
              </div>
            </article>
          );
        })}
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.18fr)_minmax(340px,0.82fr)]">
        <div className="rounded-md border border-line bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">Pulso por frente</h2>
              <p className="text-sm text-neutral-600">Volumen operativo contra salud del proceso.</p>
            </div>
            <span className="rounded-md bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">Datos reales</span>
          </div>
          <div className="mt-4 h-80">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={pulseData}>
                <CartesianGrid stroke="#ece7df" vertical={false} />
                <XAxis dataKey="name" tickLine={false} axisLine={false} />
                <YAxis yAxisId="left" allowDecimals={false} tickLine={false} axisLine={false} />
                <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tickLine={false} axisLine={false} />
                <Tooltip />
                <Bar yAxisId="left" dataKey="volumen" radius={[6, 6, 0, 0]} fill="#2563eb" />
                <Line yAxisId="right" type="monotone" dataKey="salud" stroke="#111827" strokeWidth={3} dot={{ r: 4 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-md border border-line bg-white p-4">
          <div>
            <h2 className="text-base font-semibold">Servicios</h2>
            <p className="text-sm text-neutral-600">Estado real de ordenes activas y cerradas.</p>
          </div>
          <div className="mt-4 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={serviceData} layout="vertical" margin={{ left: 12, right: 16 }}>
                <CartesianGrid stroke="#ece7df" horizontal={false} />
                <XAxis type="number" allowDecimals={false} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" width={88} axisLine={false} tickLine={false} />
                <Tooltip />
                <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                  {serviceData.map((entry, index) => <Cell key={entry.name} fill={statusColors[index]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 divide-y divide-line">
            {serviceData.map((item, index) => (
              <div className="flex items-center justify-between py-2 text-sm" key={item.name}>
                <span className="inline-flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: statusColors[index] }} />
                  {item.name}
                </span>
                <span className="font-semibold">{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="rounded-md border border-line bg-white p-4">
          <h2 className="text-base font-semibold">Lectura de control</h2>
          <p className="mt-1 text-sm text-neutral-600">Resumen concreto para seguimiento diario.</p>
          <div className="mt-4 divide-y divide-line">
            <div className="grid gap-3 py-3 md:grid-cols-[180px_1fr_120px]">
              <p className="text-sm font-semibold">Servicios</p>
              <p className="text-sm text-neutral-600">{activeServices} ordenes requieren ejecucion o cierre.</p>
              <p className="text-right text-sm font-semibold">{serviceCompletion}% cierre</p>
            </div>
            <div className="grid gap-3 py-3 md:grid-cols-[180px_1fr_120px]">
              <p className="text-sm font-semibold">Campo</p>
              <p className="text-sm text-neutral-600">{summary.online} de {summary.people} personas tienen presencia operativa reportada.</p>
              <p className="text-right text-sm font-semibold">{fieldCoverage}% cobertura</p>
            </div>
            <div className="grid gap-3 py-3 md:grid-cols-[180px_1fr_120px]">
              <p className="text-sm font-semibold">Flota</p>
              <p className="text-sm text-neutral-600">{summary.vehicleBlocked + summary.vehicleExpiring} vehiculos necesitan gestion documental.</p>
              <p className="text-right text-sm font-semibold">{summary.vehicleScore}/100</p>
            </div>
            <div className="grid gap-3 py-3 md:grid-cols-[180px_1fr_120px]">
              <p className="text-sm font-semibold">Preoperacional</p>
              <p className="text-sm text-neutral-600">{summary.preopToday} checklists registrados hoy; {summary.preopBlocked} rutas bloqueadas.</p>
              <p className="text-right text-sm font-semibold">{summary.preopCompliance}%</p>
            </div>
          </div>
        </div>
        <BrainPanel />
      </section>
    </div>
  );
}
