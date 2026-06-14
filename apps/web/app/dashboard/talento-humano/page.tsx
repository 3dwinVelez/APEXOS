"use client";

import { api } from "@/lib/api";
import { Activity, AlertTriangle, BarChart3, Camera, CheckCircle2, ChevronRight, Clock3, FileText, Filter, MapPinned, Navigation, RefreshCw, RotateCcw, Route, Search, Smartphone, Users, X } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

type Schedule = { id: number };
type Attendance = { user_name: string; next_type: string | null; punches: Array<{ id: number }> };
type Workday = { id: number; inconsistent: boolean };
type Employee = { id: number };
type Vehicle = { id: number };
type TimeRoute = { id: number | string; vehicle_plate: string; employees: string[]; start_time: string; end_time: string; status: string };
type OperatorPoint = {
  key: string;
  user_name: string;
  name: string;
  route_id: number | string;
  online?: boolean;
  last_punch_type?: string;
  last_activity_type?: string;
  last_activity_time?: string;
};
type PunchPoint = {
  id: number | string;
  user_name: string;
  type: string;
  time?: string;
  punched_at: string;
  latitude?: number | null;
  longitude?: number | null;
  accuracy_meters?: number | null;
  vehicle_plate?: string;
  extra_minutes?: number;
  extra_reason?: string;
  extra_detail?: string;
  extra_evidence?: { base64_data?: string; file_name?: string; file_url?: string };
};
type ActivityPoint = {
  id: number | string;
  user_name: string;
  type: string;
  time?: string;
  occurred_at: string;
  latitude?: number | null;
  longitude?: number | null;
  accuracy_meters?: number | null;
  observation?: string;
  evidence?: Array<{ base64_data?: string; file_name?: string; file_url?: string }>;
};
type RouteMonitor = TimeRoute & {
  placa?: string;
  assigned_count?: number;
  online_count?: number;
  with_gps_count?: number;
  punch_points?: PunchPoint[];
  activity_points?: ActivityPoint[];
};
type OperationsMap = {
  date: string;
  generated_at: string;
  people: OperatorPoint[];
  routes: RouteMonitor[];
  totals: { routes: number; planned_people: number; online: number; without_gps: number; offline: number };
};

const punchNames: Record<string, string> = {
  entrada: "Entrada",
  inicio_almuerzo: "Almuerzo",
  fin_almuerzo: "Retorno",
  salida: "Cierre"
};

function formatHour(value?: string | null) {
  if (!value) return "--";
  if (/^\d{2}:\d{2}/.test(value)) return value.slice(0, 5);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "--" : date.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
}

function routeLabel(route: RouteMonitor) {
  return route.vehicle_plate || route.placa || `Horario ${route.id}`;
}

export default function TalentPage() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [workdays, setWorkdays] = useState<Workday[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [routes, setRoutes] = useState<TimeRoute[]>([]);
  const [operations, setOperations] = useState<OperationsMap | null>(null);
  const [selectedRouteId, setSelectedRouteId] = useState<string>("");
  const [loadingMonitor, setLoadingMonitor] = useState(false);
  const [routeQuery, setRouteQuery] = useState("");
  const [routeFilter, setRouteFilter] = useState("attention");

  async function load() {
    setLoadingMonitor(true);
    const today = new Date().toISOString().slice(0, 10);
    const [scheduleData, attendanceData, workdayData, employeeData, vehicleData, routeData, operationsData] = await Promise.all([
      api<Schedule[]>("/api/v1/hr/schedules").catch(() => []),
      api<Attendance[]>("/api/v1/hr/attendance").catch(() => []),
      api<Workday[]>("/api/v1/hr/workdays").catch(() => []),
      api<Employee[]>("/api/v1/hr/employees").catch(() => []),
      api<Vehicle[]>("/api/v1/transport/vehicles").catch(() => []),
      api<TimeRoute[]>("/api/v1/hr/routes").catch(() => []),
      api<OperationsMap>(`/api/v1/hr/operations-map?date=${today}&minutes=30&footprint_days=30`).catch(() => null)
    ]);
    setSchedules(scheduleData);
    setAttendance(attendanceData);
    setWorkdays(workdayData);
    setEmployees(employeeData);
    setVehicles(vehicleData);
    setRoutes(routeData);
    setOperations(operationsData);
    setLoadingMonitor(false);
  }

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 30000);
    return () => window.clearInterval(timer);
  }, []);

  const monitorRoutes: RouteMonitor[] = operations?.routes?.length ? operations.routes : routes.map((route) => ({ ...route, punch_points: [], activity_points: [] }));
  const selectedRoute = monitorRoutes.find((route) => String(route.id) === selectedRouteId) || null;
  const selectedPeople = useMemo(() => {
    if (!selectedRoute || !operations) return [];
    return operations.people.filter((person) => String(person.route_id) === String(selectedRoute.id));
  }, [operations, selectedRoute]);
  const selectedTimeline = useMemo(() => {
    if (!selectedRoute) return [];
    return [
      ...(selectedRoute.punch_points || []).map((event) => ({
        kind: "marca" as const,
        id: `punch-${event.id}`,
        user_name: event.user_name,
        title: punchNames[event.type] || event.type,
        at: event.punched_at,
        time: event.time || event.punched_at,
        latitude: event.latitude,
        longitude: event.longitude,
        accuracy_meters: event.accuracy_meters,
        evidence: event.extra_evidence?.base64_data || event.extra_evidence?.file_url ? [event.extra_evidence] : [],
        observation: event.extra_minutes ? `${event.extra_minutes} minuto(s) extra - ${event.extra_reason || "extension"}${event.extra_detail ? ` - ${event.extra_detail}` : ""}` : ""
      })),
      ...(selectedRoute.activity_points || []).map((event) => ({
        kind: "actividad" as const,
        id: `activity-${event.id}`,
        user_name: event.user_name,
        title: event.type,
        at: event.occurred_at,
        time: event.time || event.occurred_at,
        latitude: event.latitude,
        longitude: event.longitude,
        accuracy_meters: event.accuracy_meters,
        evidence: event.evidence || [],
        observation: event.observation || ""
      }))
    ].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  }, [selectedRoute]);

  const fieldEvents = monitorRoutes.reduce((sum, route) => sum + (route.punch_points?.length || 0) + (route.activity_points?.length || 0), 0);
  const peopleInField = operations?.totals.planned_people ?? monitorRoutes.reduce((sum, route) => sum + (route.assigned_count ?? route.employees?.length ?? 0), 0);
  const onlinePeople = operations?.totals.online ?? 0;
  const gpsCoverage = peopleInField ? Math.round((onlinePeople / peopleInField) * 100) : 0;
  const activeRoutes = monitorRoutes.filter((route) => ["active", "planned", "en_ruta"].includes(String(route.status || "").toLowerCase())).length;
  const completedMarks = attendance.filter((item) => item.next_type == null).length;
  const openAlerts = (operations?.totals.without_gps || 0) + monitorRoutes.filter((route) => !(route.punch_points?.length || route.activity_points?.length)).length;
  const statusMessage = openAlerts
    ? `Hay ${openAlerts} punto(s) por revisar: horarios sin eventos o personas sin GPS.`
    : "La operacion de campo se ve estable y con trazabilidad reciente.";
  const filteredRoutes = useMemo(() => {
    const term = routeQuery.trim().toLowerCase();
    return monitorRoutes
      .filter((route) => {
        const routePeople = operations?.people.filter((person) => String(person.route_id) === String(route.id)) || [];
        const events = (route.punch_points?.length || 0) + (route.activity_points?.length || 0);
        const offline = routePeople.filter((person) => !person.online).length;
        if (routeFilter === "active" && !["active", "planned", "en_ruta"].includes(String(route.status || "").toLowerCase())) return false;
        if (routeFilter === "no_events" && events > 0) return false;
        if (routeFilter === "offline" && offline === 0) return false;
        return !term || [routeLabel(route), route.status, ...(route.employees || []), ...routePeople.map((person) => person.name)].join(" ").toLowerCase().includes(term);
      })
      .sort((a, b) => {
        if (routeFilter !== "attention") return String(a.start_time || "").localeCompare(String(b.start_time || ""));
        const attention = (route: RouteMonitor) => {
          const routePeople = operations?.people.filter((person) => String(person.route_id) === String(route.id)) || [];
          const events = (route.punch_points?.length || 0) + (route.activity_points?.length || 0);
          return (events ? 0 : 100) + routePeople.filter((person) => !person.online).length;
        };
        return attention(b) - attention(a) || String(a.start_time || "").localeCompare(String(b.start_time || ""));
      });
  }, [monitorRoutes, operations, routeFilter, routeQuery]);
  const activeRouteFilters = (routeQuery.trim() ? 1 : 0) + (routeFilter !== "attention" ? 1 : 0);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-apex">M-17 · Operacion de personal</p>
          <h1 className="mt-1 text-3xl font-semibold">Talento Humano</h1>
          <p className="mt-2 max-w-3xl text-sm text-neutral-600">{statusMessage}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link className="inline-flex h-11 items-center gap-2 rounded-md border border-line bg-white px-4 text-sm font-semibold hover:bg-paper" href="/dashboard/talento-humano/mapa"><MapPinned size={17} /> Ver mapa</Link>
          <Link className="inline-flex h-11 items-center gap-2 rounded-md bg-apex px-4 text-sm font-semibold text-white hover:bg-apex/90" href="/dashboard/talento-humano/rutas"><Route size={17} /> Asignar horario</Link>
        </div>
      </header>

      {!employees.length || !vehicles.length ? (
        <section className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          Para operar necesitas personas y vehiculos base. Los usuarios se crean desde Administracion APEX y la flota desde Transporte.
        </section>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <CompactMetric icon={<Users size={17} />} label="Personas planeadas" value={peopleInField} detail={`${onlinePeople} con senal reciente`} />
        <CompactMetric icon={<Route size={17} />} label="Horarios activos" value={activeRoutes} detail={`${monitorRoutes.length} planeados · ${schedules.length} plantillas`} />
        <CompactMetric icon={<Activity size={17} />} label="Eventos del dia" value={fieldEvents} detail={`${completedMarks} completas · ${workdays.length} procesadas`} />
        <CompactMetric icon={<AlertTriangle size={17} />} label="Requieren atencion" value={openAlerts} detail={`${gpsCoverage}% cobertura GPS`} tone={openAlerts ? "amber" : "default"} />
      </section>

      <section className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
        <OperationalLink icon={<Smartphone size={18} />} title="Marcacion movil" detail="Registrar jornada" href="/dashboard/talento-humano/marcacion" />
        <OperationalLink icon={<Route size={18} />} title="Planeacion" detail="Asignar horarios" href="/dashboard/talento-humano/rutas" />
        <OperationalLink icon={<MapPinned size={18} />} title="Mapa GPS" detail="Seguimiento en vivo" href="/dashboard/talento-humano/mapa" />
        <OperationalLink icon={<BarChart3 size={18} />} title="Reportes" detail="Horas y novedades" href="/dashboard/talento-humano/reportes" />
        <OperationalLink icon={<FileText size={18} />} title="Nomina" detail="Conceptos y recargos" href="/dashboard/talento-humano/nomina" />
      </section>

      <section className="overflow-hidden rounded-md border border-line bg-white">
        <div className="border-b border-line p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2"><Clock3 size={18} className="text-apex" /><h2 className="text-lg font-semibold">Horarios de hoy</h2></div>
              <p className="mt-1 text-sm text-neutral-600">Prioriza horarios sin eventos o con personas sin senal y abre el detalle solo cuando necesites actuar.</p>
            </div>
            <div className="flex items-center gap-3">
              <p className="text-sm text-neutral-500">{filteredRoutes.length} de {monitorRoutes.length}</p>
              <button className="inline-flex h-10 items-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-semibold hover:bg-paper" onClick={load} type="button">
                <RefreshCw className={loadingMonitor ? "animate-spin" : ""} size={16} /> Actualizar
              </button>
            </div>
          </div>
          <div className="mt-4 grid gap-2 md:grid-cols-[minmax(240px,1fr)_220px]">
            <label className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" size={16} />
              <input className="h-10 w-full rounded-md border border-line pl-9 pr-3 text-sm" placeholder="Buscar placa, persona o estado" value={routeQuery} onChange={(event) => setRouteQuery(event.target.value)} />
            </label>
            <select className="h-10 rounded-md border border-line bg-white px-3 text-sm" value={routeFilter} onChange={(event) => setRouteFilter(event.target.value)}>
              <option value="attention">Prioridad operativa</option>
              <option value="active">Horarios activos</option>
              <option value="no_events">Sin eventos</option>
              <option value="offline">Con personas sin senal</option>
              <option value="all">Todos los horarios</option>
            </select>
          </div>
          {activeRouteFilters ? <button className="mt-3 inline-flex h-9 items-center gap-2 rounded-md border border-line px-3 text-sm font-semibold text-neutral-700 hover:bg-paper" onClick={() => { setRouteQuery(""); setRouteFilter("attention"); }} type="button"><RotateCcw size={15} /> Limpiar filtros</button> : null}
        </div>

        <div className="grid gap-3 p-3 md:hidden">
          {filteredRoutes.map((route) => {
            const routePeople = operations?.people.filter((person) => String(person.route_id) === String(route.id)) || [];
            const events = (route.punch_points?.length || 0) + (route.activity_points?.length || 0);
            const alerts = routePeople.filter((person) => !person.online).length;
            return (
              <button className="rounded-md border border-line p-4 text-left hover:border-apex hover:bg-paper" key={String(route.id)} onClick={() => setSelectedRouteId(String(route.id))} type="button">
                <div className="flex items-start justify-between gap-3"><div><p className="text-lg font-semibold">{routeLabel(route)}</p><p className="mt-1 text-xs text-neutral-500">{formatHour(route.start_time)} - {formatHour(route.end_time)}</p></div><ChevronRight className="text-neutral-400" size={18} /></div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold ${events ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>
                    {events ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}{events ? "En seguimiento" : "Sin eventos"}
                  </span>
                  {alerts ? <span className="rounded-md bg-paper px-2 py-1 text-xs font-semibold text-neutral-600">{alerts} sin senal</span> : null}
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-sm"><Info label="Personas" value={route.assigned_count ?? route.employees?.length ?? 0} /><Info label="En linea" value={route.online_count || 0} /><Info label="Eventos" value={events} /></div>
              </button>
            );
          })}
        </div>

        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[940px] border-collapse text-left text-sm">
            <thead className="bg-paper text-xs uppercase tracking-wide text-neutral-500"><tr><th className="px-4 py-3">Horario</th><th className="px-4 py-3">Equipo</th><th className="px-4 py-3">Actividad</th><th className="px-4 py-3">Estado operativo</th><th className="px-4 py-3 text-right">Accion</th></tr></thead>
            <tbody className="divide-y divide-line">
              {filteredRoutes.map((route) => {
                const routePeople = operations?.people.filter((person) => String(person.route_id) === String(route.id)) || [];
                const events = (route.punch_points?.length || 0) + (route.activity_points?.length || 0);
                const alerts = routePeople.filter((person) => !person.online).length;
                return <tr className="hover:bg-paper/70" key={String(route.id)}>
                  <td className="px-4 py-3"><p className="font-semibold">{routeLabel(route)}</p><p className="mt-1 text-xs text-neutral-500">{formatHour(route.start_time)} - {formatHour(route.end_time)} · {route.status || "planeada"}</p></td>
                  <td className="px-4 py-3"><p className="font-semibold">{route.assigned_count ?? route.employees?.length ?? 0} persona(s)</p><p className="mt-1 text-xs text-neutral-500">{route.online_count || 0} con senal reciente</p></td>
                  <td className="px-4 py-3"><p className="font-semibold">{events} evento(s)</p><p className="mt-1 text-xs text-neutral-500">{route.activity_points?.length || 0} actividades con evidencia</p></td>
                  <td className="px-4 py-3"><span className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold ${events ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>{events ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}{events ? "En seguimiento" : "Sin eventos"}</span>{alerts ? <p className="mt-1 text-xs font-semibold text-amber-800">{alerts} persona(s) sin senal</p> : null}</td>
                  <td className="px-4 py-3 text-right"><button className="h-9 rounded-md border border-line px-3 text-sm font-semibold hover:border-apex hover:bg-paper" onClick={() => setSelectedRouteId(String(route.id))} type="button">Abrir monitor</button></td>
                </tr>;
              })}
            </tbody>
          </table>
        </div>
        {!filteredRoutes.length ? <div className="p-10 text-center"><Filter className="mx-auto text-neutral-300" size={28} /><p className="mt-3 text-sm font-semibold">No hay horarios con estos filtros</p><p className="mt-1 text-sm text-neutral-500">Limpia los filtros o asigna un nuevo horario.</p></div> : null}
      </section>

      {selectedRoute ? (
        <div className="fixed inset-0 z-50 bg-neutral-950/40">
          <aside className="ml-auto flex h-full w-full max-w-5xl flex-col overflow-hidden bg-white shadow-xl">
            <header className="border-b border-line p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-apex">Panel administrativo de horario</p>
                  <h2 className="text-2xl font-semibold">{routeLabel(selectedRoute)}</h2>
                  <p className="mt-1 text-sm text-neutral-600">{formatHour(selectedRoute.start_time)} - {formatHour(selectedRoute.end_time)} - {selectedPeople.length || selectedRoute.employees?.length || 0} persona(s) asignadas</p>
                </div>
                <button className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-line" onClick={() => setSelectedRouteId("")} type="button" aria-label="Cerrar monitor"><X size={18} /></button>
              </div>
            </header>
            <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[320px_1fr]">
              <section className="border-b border-line p-4 lg:border-b-0 lg:border-r">
                <h3 className="text-sm font-semibold uppercase text-neutral-500">Personas asignadas</h3>
                <div className="mt-3 space-y-2">
                  {(selectedPeople.length ? selectedPeople : (selectedRoute.employees || []).map((name) => ({ key: String(name), name, user_name: String(name), route_id: selectedRoute.id } as OperatorPoint))).map((person) => (
                    <div className="rounded-md border border-line p-3" key={person.key}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-semibold">{person.name || person.user_name}</p>
                          <p className="mt-1 text-xs text-neutral-500">{person.last_punch_type ? `Ultima marca: ${punchNames[person.last_punch_type] || person.last_punch_type}` : "Sin marca registrada"}</p>
                        </div>
                        <span className={`shrink-0 rounded-md px-2 py-1 text-xs font-semibold ${person.online ? "bg-emerald-50 text-emerald-700" : "bg-paper text-neutral-600"}`}>{person.online ? "En vivo" : "Sin senal"}</span>
                      </div>
                      {person.last_activity_type ? <p className="mt-2 text-xs text-neutral-600">{person.last_activity_type} - {person.last_activity_time || "--"}</p> : null}
                    </div>
                  ))}
                </div>
              </section>
              <section className="p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-base font-semibold">Linea cronologica del horario</h3>
                    <p className="mt-1 text-sm text-neutral-600">Marcaciones y actividades ordenadas por hora, con ubicacion y evidencia cuando existe.</p>
                  </div>
                  <Link className="inline-flex h-10 items-center gap-2 rounded-md border border-line px-3 text-sm font-semibold hover:bg-paper" href="/dashboard/talento-humano/mapa">
                    <Navigation size={16} /> Ver mapa
                  </Link>
                </div>
                <div className="space-y-3">
                  {selectedTimeline.map((event, index) => (
                    <article className="grid gap-3 rounded-md border border-line p-3 md:grid-cols-[44px_1fr_180px]" key={event.id}>
                      <span className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold text-white ${event.kind === "marca" ? "bg-apex" : "bg-emerald-600"}`}>{index + 1}</span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold">{event.title}</p>
                          <span className="rounded-md bg-paper px-2 py-1 text-xs font-semibold text-neutral-600">{event.kind === "marca" ? "Marcacion" : "Actividad"}</span>
                        </div>
                        <p className="mt-1 text-sm text-neutral-600">{event.user_name} - {formatHour(event.time)}</p>
                        {event.observation ? <p className="mt-2 text-sm text-neutral-700">{event.observation}</p> : null}
                        {event.latitude != null && event.longitude != null ? <p className="mt-2 text-xs text-neutral-500">GPS {Number(event.latitude).toFixed(5)}, {Number(event.longitude).toFixed(5)} - {Math.round(Number(event.accuracy_meters || 0))}m</p> : null}
                      </div>
                      <div className="min-w-0">
                        {event.evidence?.[0]?.base64_data ? (
                          <Image alt="Evidencia de actividad" className="h-32 w-full rounded-md object-cover" height={320} src={event.evidence[0].base64_data} unoptimized width={640} />
                        ) : event.evidence?.[0]?.file_url ? (
                          <a className="inline-flex h-10 items-center gap-2 rounded-md border border-line px-3 text-sm font-semibold hover:bg-paper" href={event.evidence[0].file_url} target="_blank" rel="noreferrer"><Camera size={16} /> Ver evidencia</a>
                        ) : (
                          <p className="rounded-md bg-paper p-3 text-xs font-semibold text-neutral-500">Sin evidencia fotografica</p>
                        )}
                      </div>
                    </article>
                  ))}
                  {!selectedTimeline.length ? <p className="rounded-md bg-paper p-4 text-sm text-neutral-500">Este horario aun no tiene marcaciones ni actividades registradas.</p> : null}
                </div>
              </section>
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}

function CompactMetric({ icon, label, value, detail, tone = "default" }: { icon: ReactNode; label: string; value: number | string; detail: string; tone?: "default" | "amber" }) {
  const toneClass = tone === "amber" ? "border-amber-200 bg-amber-50 text-amber-900" : "border-line bg-white text-neutral-800";
  return (
    <div className={`flex items-center gap-3 rounded-md border p-3 ${toneClass}`}>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-white/70 text-apex">{icon}</span>
      <div className="min-w-0">
        <div className="flex items-baseline gap-2"><p className="text-xl font-semibold">{value}</p><p className="truncate text-sm font-semibold">{label}</p></div>
        <p className="truncate text-xs opacity-70">{detail}</p>
      </div>
    </div>
  );
}

function OperationalLink({ icon, title, detail, href }: { icon: ReactNode; title: string; detail: string; href: string }) {
  return (
    <Link className="group flex items-center gap-3 rounded-md border border-line bg-white p-3 hover:border-apex hover:bg-paper" href={href}>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-paper text-apex group-hover:bg-white">{icon}</span>
      <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{title}</span><span className="block truncate text-xs text-neutral-500">{detail}</span></span>
      <ChevronRight className="shrink-0 text-neutral-400" size={16} />
    </Link>
  );
}

function Info({ label, value }: { label: string; value: number | string }) {
  return <div><p className="text-xs text-neutral-500">{label}</p><p className="font-semibold">{value}</p></div>;
}
