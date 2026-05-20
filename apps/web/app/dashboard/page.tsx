"use client";

import { BrainPanel } from "@/components/brain/BrainPanel";
import { api } from "@/lib/api";
import { loadModuleAccess, ModuleAccessState } from "@/lib/moduleAccess";
import { MODULES } from "@/lib/modules";
import { Activity, AlertTriangle, Boxes, CheckCircle2, Gauge, MapPinned, ShieldCheck, Sparkles, TrendingUp, Users, Wrench } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Bar, Cell, ComposedChart, CartesianGrid, Line, Pie, PieChart, PolarAngleAxis, RadialBar, RadialBarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type ServicesSummary = { data: Array<{ status: string; photos: unknown[]; incidents: unknown[] }>; kpis: { pending: number; in_progress: number; closed: number; not_executed: number; total: number } };
type OperationsMap = { kpis?: { online?: number; offline?: number; routes?: number; people?: number; without_gps?: number }; routes?: unknown[] };
type Attendance = { punches: unknown[] };
type VehicleMetrics = { total: number; active: number; blocked: number; pending_validation: number; expiring: number; reliable_records: number; average_score: number };
type PreopMetrics = { checklists_today: number; checklists_pending: number; routes_blocked: number; compliance_rate: number; approved_with_findings: number };

const serviceColors = ["#f59e0b", "#0284c7", "#059669", "#dc2626"];

export default function DashboardPage() {
  const [access, setAccess] = useState<ModuleAccessState>({ loading: true, isPlatformAdmin: false, bySlug: {} });
  const [summary, setSummary] = useState({
    services: { pending: 0, in_progress: 0, closed: 0, not_executed: 0, total: 0 },
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
    if (localStorage.getItem("auth_provider") === "supabase") {
      loadModuleAccess(MODULES).then(setAccess).catch(() => setAccess({ loading: false, isPlatformAdmin: false, bySlug: {} }));
    } else {
      setAccess({ loading: false, isPlatformAdmin: false, bySlug: Object.fromEntries(MODULES.map((module) => [module.slug, true])) });
    }
  }, []);

  useEffect(() => {
    Promise.all([
      api<ServicesSummary>("/api/v1/services/orders?limit=200").catch(() => null),
      api<OperationsMap>("/api/v1/hr/operations-map").catch(() => null),
      api<Attendance[]>("/api/v1/hr/attendance").catch(() => []),
      api<VehicleMetrics>("/api/v1/transport/vehicles/metrics/dashboard").catch(() => null),
      api<PreopMetrics>("/api/v1/hr/routes/preop/metrics").catch(() => null)
    ]).then(([services, operations, attendance, vehicleMetrics, preopMetrics]) => {
      const orders = services?.data || [];
      const attendanceRows = Array.isArray(attendance) ? attendance as Attendance[] : [];
      setSummary({
        services: services?.kpis || { pending: 0, in_progress: 0, closed: 0, not_executed: 0, total: 0 },
        evidence: orders.reduce((sum, order) => sum + (order.photos?.length || 0), 0),
        incidents: orders.reduce((sum, order) => sum + (order.incidents?.length || 0), 0),
        routes: operations?.kpis?.routes || operations?.routes?.length || 0,
        online: operations?.kpis?.online || 0,
        people: operations?.kpis?.people || 0,
        punches: attendanceRows.reduce((sum: number, item: Attendance) => sum + (item.punches?.length || 0), 0),
        vehicleScore: vehicleMetrics?.average_score || 0,
        vehicleBlocked: vehicleMetrics?.blocked || 0,
        vehicleExpiring: vehicleMetrics?.expiring || 0,
        vehicleTotal: vehicleMetrics?.total || 0,
        vehicleReliable: vehicleMetrics?.reliable_records || 0,
        preopToday: preopMetrics?.checklists_today || 0,
        preopPending: preopMetrics?.checklists_pending || 0,
        preopBlocked: preopMetrics?.routes_blocked || 0,
        preopCompliance: preopMetrics?.compliance_rate || 100
      });
    });
  }, []);

  const enabled = (slug: string) => access.loading || access.bySlug[slug] === true;
  const serviceCompletion = summary.services.total ? Math.round((summary.services.closed / summary.services.total) * 100) : 100;
  const fieldCoverage = summary.people ? Math.round((summary.online / summary.people) * 100) : 0;
  const riskScore = Math.max(0, 100 - (summary.vehicleBlocked * 18 + summary.vehicleExpiring * 8 + summary.services.not_executed * 5));

  const commandCards = [
    { module: "servicios", label: "Servicios", value: serviceCompletion, primary: `${summary.services.in_progress + summary.services.pending}`, hint: "activos por resolver", icon: Wrench, color: "#0f766e" },
    { module: "talento-humano", label: "Campo", value: fieldCoverage, primary: `${summary.online}/${summary.people}`, hint: "equipo en linea", icon: MapPinned, color: "#2563eb" },
    { module: "transporte", label: "Flota", value: summary.vehicleScore, primary: `${summary.vehicleScore}/100`, hint: "score maestro", icon: ShieldCheck, color: "#7c3aed" },
    { module: "talento-humano", label: "Preoperacional", value: summary.preopCompliance, primary: `${summary.preopToday}`, hint: `${summary.preopBlocked} bloqueadas`, icon: Gauge, color: "#be123c" },
    { module: "servicios", label: "Riesgo", value: riskScore, primary: `${summary.incidents}`, hint: "novedades abiertas", icon: AlertTriangle, color: "#d97706" }
  ].filter((card) => enabled(card.module));

  const serviceData = [
    { name: "Pendientes", value: summary.services.pending },
    { name: "En curso", value: summary.services.in_progress },
    { name: "Cerradas", value: summary.services.closed },
    { name: "No ejecutadas", value: summary.services.not_executed }
  ];

  const pulseData = useMemo(() => [
    { name: "Servicios", actual: summary.services.in_progress + summary.services.pending, salud: serviceCompletion },
    { name: "Campo", actual: summary.online, salud: fieldCoverage },
    { name: "Preop", actual: summary.preopToday, salud: summary.preopCompliance },
    { name: "Flota", actual: summary.vehicleTotal, salud: summary.vehicleScore },
    { name: "Riesgo", actual: summary.incidents + summary.vehicleBlocked, salud: riskScore }
  ], [fieldCoverage, riskScore, serviceCompletion, summary]);

  const insightCards = [
    { title: "Prioridad operativa", value: summary.services.pending + summary.services.in_progress, hint: "servicios requieren seguimiento", icon: Activity },
    { title: "Calidad documental", value: `${summary.vehicleReliable}/${summary.vehicleTotal}`, hint: "fichas confiables de flota", icon: ShieldCheck },
    { title: "Evidencia capturada", value: summary.evidence, hint: "soportes disponibles", icon: Boxes },
    { title: "Cobertura de campo", value: `${fieldCoverage}%`, hint: "personal rastreado en vivo", icon: Users }
  ];

  return (
    <div className="space-y-5">
      <header>
        <p className="text-sm font-medium text-apex">APEX CORE</p>
        <h1 className="text-3xl font-semibold">Monitor central</h1>
        <p className="mt-2 max-w-3xl text-sm text-neutral-600">Indicadores dinamicos segun los modulos activos: operacion, servicios, flota, talento humano, IA y riesgos en una sola vista.</p>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {commandCards.map((card) => {
          const Icon = card.icon;
          return (
            <div className="rounded-md border border-line bg-white p-4" key={card.label}>
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm text-neutral-500">{card.label}</p>
                <Icon size={18} style={{ color: card.color }} />
              </div>
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="text-2xl font-semibold">{card.primary}</p>
                  <p className="mt-1 text-xs font-medium text-neutral-500">{card.hint}</p>
                </div>
                <div className="h-16 w-16">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadialBarChart data={[{ value: card.value, fill: card.color }]} innerRadius="70%" outerRadius="100%" startAngle={90} endAngle={-270}>
                      <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
                      <RadialBar dataKey="value" cornerRadius={8} background />
                    </RadialBarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          );
        })}
      </section>

      <section className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <div className="rounded-md border border-line bg-white p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">Pulso ejecutivo</h2>
              <p className="text-sm text-neutral-600">Barras para volumen real y linea para salud porcentual.</p>
            </div>
            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
              <TrendingUp size={13} /> En vivo
            </span>
          </div>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={pulseData}>
                <CartesianGrid stroke="#ece7df" vertical={false} />
                <XAxis dataKey="name" tickLine={false} axisLine={false} />
                <YAxis yAxisId="left" tickLine={false} axisLine={false} />
                <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tickLine={false} axisLine={false} />
                <Tooltip />
                <Bar yAxisId="left" dataKey="actual" radius={[6, 6, 0, 0]} fill="#0f766e" />
                <Line yAxisId="right" type="monotone" dataKey="salud" stroke="#111827" strokeWidth={3} dot={{ r: 4 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-4">
            {insightCards.map((item) => {
              const Icon = item.icon;
              return (
                <div className="rounded-md bg-paper p-3" key={item.title}>
                  <Icon className="mb-2 text-apex" size={16} />
                  <p className="text-lg font-semibold">{item.value}</p>
                  <p className="text-xs text-neutral-500">{item.hint}</p>
                </div>
              );
            })}
          </div>
        </div>
        <BrainPanel />
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-md border border-line bg-white p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">Distribucion de servicios</h2>
              <p className="text-sm text-neutral-600">Embudo operativo con lectura por estado.</p>
            </div>
            <Sparkles className="text-apex" size={18} />
          </div>
          <div className="grid gap-3 md:grid-cols-[220px_1fr]">
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={serviceData} dataKey="value" nameKey="name" innerRadius={56} outerRadius={86} paddingAngle={3}>
                    {serviceData.map((entry, index) => <Cell key={entry.name} fill={serviceColors[index]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-2">
              {serviceData.map((item, index) => (
                <div className="flex items-center justify-between rounded-md bg-paper p-3 text-sm" key={item.name}>
                  <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: serviceColors[index] }} /> {item.name}</span>
                  <span className="font-semibold">{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-md border border-line bg-white p-4">
          <div className="mb-4">
            <h2 className="text-base font-semibold">Score maestro de flota</h2>
            <p className="text-sm text-neutral-600">Confiabilidad documental y completitud por placa.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-[180px_1fr]">
            <div className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <RadialBarChart data={[{ name: "Score", value: summary.vehicleScore, fill: "#7c3aed" }]} innerRadius="72%" outerRadius="100%" startAngle={90} endAngle={-270}>
                  <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
                  <RadialBar dataKey="value" cornerRadius={10} background />
                  <Tooltip />
                </RadialBarChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-3">
              <div className="rounded-md bg-paper p-3"><p className="text-sm text-neutral-500">Score promedio</p><p className="text-3xl font-semibold">{summary.vehicleScore}/100</p></div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-md border border-line p-3"><p className="text-neutral-500">Bloqueados</p><p className="text-xl font-semibold text-red-700">{summary.vehicleBlocked}</p></div>
                <div className="rounded-md border border-line p-3"><p className="text-neutral-500">Por vencer</p><p className="text-xl font-semibold text-amber-700">{summary.vehicleExpiring}</p></div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
