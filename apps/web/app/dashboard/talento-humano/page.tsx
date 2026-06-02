"use client";

import { api } from "@/lib/api";
import { Activity, AlertTriangle, CalendarDays, Camera, CheckCircle2, Clock, FileText, MapPinned, Navigation, RefreshCw, Route, Smartphone, Truck, Users, X } from "lucide-react";
import Link from "next/link";
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
  return route.vehicle_plate || route.placa || `Ruta ${route.id}`;
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
    ? `Hay ${openAlerts} punto(s) por revisar: rutas sin eventos o personas sin GPS.`
    : "La operacion de campo se ve estable y con trazabilidad reciente.";

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-md bg-[#071417] text-white shadow-sm">
        <div className="grid gap-5 p-5 lg:grid-cols-[1.05fr_0.95fr] lg:p-6">
          <div className="flex min-h-[260px] flex-col justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">M-17 - Talento Humano</p>
              <h1 className="mt-3 max-w-2xl text-3xl font-semibold md:text-4xl">Centro operativo de personal en campo</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/72">{statusMessage} Jornada, rutas, GPS y evidencias quedan conectados en una sola lectura.</p>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <Link className="inline-flex h-11 items-center gap-2 rounded-md bg-white px-4 text-sm font-semibold text-[#071417]" href="/dashboard/talento-humano/marcacion"><Smartphone size={16} /> Marcacion movil</Link>
              <Link className="inline-flex h-11 items-center gap-2 rounded-md border border-white/15 px-4 text-sm font-semibold text-white hover:bg-white/10" href="/dashboard/talento-humano/rutas"><Route size={16} /> Rutas</Link>
              <Link className="inline-flex h-11 items-center gap-2 rounded-md border border-white/15 px-4 text-sm font-semibold text-white hover:bg-white/10" href="/dashboard/talento-humano/mapa"><MapPinned size={16} /> Mapa GPS</Link>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <ApexIndicator icon={<Users size={18} />} label="Personas en campo" value={peopleInField} detail={`${onlinePeople} con senal reciente`} tone="emerald" />
            <ApexIndicator icon={<Route size={18} />} label="Rutas activas" value={activeRoutes} detail={`${monitorRoutes.length} planeadas hoy`} tone="sky" />
            <ApexIndicator icon={<Activity size={18} />} label="Eventos trazables" value={fieldEvents} detail={`${attendance.length} personas con marcas`} tone="violet" />
            <ApexIndicator icon={<AlertTriangle size={18} />} label="Alertas operativas" value={openAlerts} detail={`${gpsCoverage}% cobertura GPS`} tone={openAlerts ? "amber" : "emerald"} />
          </div>
        </div>
        <div className="grid border-t border-white/10 sm:grid-cols-4">
          <HeroStat label="Horarios" value={schedules.length} />
          <HeroStat label="Vehiculos" value={vehicles.length} />
          <HeroStat label="Jornadas completas" value={completedMarks} />
          <HeroStat label="Procesadas" value={workdays.length} />
        </div>
      </section>

      {!employees.length || !vehicles.length ? (
        <section className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          Para operar necesitas personas y vehiculos base. Los usuarios se crean desde Administracion APEX y la flota desde Transporte.
        </section>
      ) : null}

      <section className="grid gap-3 lg:grid-cols-5">
        <ActionTile icon={<Smartphone size={20} />} title="Marcacion movil" detail="Jornada, GPS y evidencia de campo." href="/dashboard/talento-humano/marcacion" primary />
        <ActionTile icon={<Route size={20} />} title="Planeacion de rutas" detail="Equipo, vehiculo y horario operativo." href="/dashboard/talento-humano/rutas" />
        <ActionTile icon={<MapPinned size={20} />} title="Mapa GPS en vivo" detail="Trazabilidad limpia por ruta y persona." href="/dashboard/talento-humano/mapa" />
        <ActionTile icon={<CalendarDays size={20} />} title="Reportes" detail="Horas, extras y trazabilidad por empleado." href="/dashboard/talento-humano/reportes" />
        <ActionTile icon={<FileText size={20} />} title="Configuracion nomina" detail="Recargos, nocturna y conceptos contables." href="/dashboard/talento-humano/nomina" />
      </section>

      <section className="overflow-hidden rounded-md border border-line bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-4">
          <div>
            <div className="flex items-center gap-2"><MapPinned size={18} className="text-apex" /><h2 className="text-lg font-semibold">Monitor operativo de rutas</h2></div>
            <p className="mt-1 text-sm text-neutral-600">Control cronologico por ruta planeada: equipo, marcaciones, actividades, GPS y evidencias.</p>
          </div>
          <button className="inline-flex h-10 items-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-semibold hover:bg-paper" onClick={load} type="button">
            <RefreshCw className={loadingMonitor ? "animate-spin" : ""} size={16} /> Actualizar
          </button>
        </div>

        <div className="grid border-b border-line md:grid-cols-4">
          <MonitorStrip label="Rutas planeadas" value={operations?.totals.routes ?? monitorRoutes.length} hint={`${activeRoutes} activas`} />
          <MonitorStrip label="Personas asignadas" value={peopleInField} hint={`${onlinePeople} en linea`} />
          <MonitorStrip label="Cobertura GPS" value={`${gpsCoverage}%`} hint={`${operations?.totals.without_gps || 0} sin GPS`} />
          <MonitorStrip label="Eventos del dia" value={fieldEvents} hint="Marcas + actividades" />
        </div>

        <div className="hidden grid-cols-[1.3fr_1fr_1fr_1fr_120px] gap-3 border-b border-line bg-paper px-4 py-3 text-xs font-semibold uppercase text-neutral-500 md:grid">
          <span>Ruta</span>
          <span>Equipo</span>
          <span>Actividad</span>
          <span>Estado</span>
          <span>Detalle</span>
        </div>
        <div className="divide-y divide-line">
          {monitorRoutes.map((route) => {
            const routePeople = operations?.people.filter((person) => String(person.route_id) === String(route.id)) || [];
            const events = (route.punch_points?.length || 0) + (route.activity_points?.length || 0);
            const alerts = routePeople.filter((person) => !person.online).length;
            return (
              <button className="grid w-full gap-3 px-4 py-4 text-left transition hover:bg-paper md:grid-cols-[1.3fr_1fr_1fr_1fr_120px] md:items-center" key={String(route.id)} onClick={() => setSelectedRouteId(String(route.id))} type="button">
                <div>
                  <p className="text-base font-semibold">{routeLabel(route)}</p>
                  <p className="mt-1 text-xs text-neutral-500">{formatHour(route.start_time)} - {formatHour(route.end_time)} - {route.status || "planeada"}</p>
                </div>
                <div className="text-sm">
                  <p className="font-semibold">{route.assigned_count ?? route.employees?.length ?? 0} persona(s)</p>
                  <p className="mt-1 text-xs text-neutral-500">{route.online_count || 0} con senal reciente</p>
                </div>
                <div className="text-sm">
                  <p className="font-semibold">{events} evento(s)</p>
                  <p className="mt-1 text-xs text-neutral-500">{route.activity_points?.length || 0} actividades con evidencia</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold ${events ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>
                    {events ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}{events ? "En seguimiento" : "Sin eventos"}
                  </span>
                  {alerts ? <span className="rounded-md bg-paper px-2 py-1 text-xs font-semibold text-neutral-600">{alerts} sin senal</span> : null}
                </div>
                <span className="inline-flex h-10 items-center justify-center rounded-md bg-apex px-3 text-sm font-semibold text-white">Abrir</span>
              </button>
            );
          })}
          {!monitorRoutes.length ? <p className="p-4 text-sm text-neutral-500">Sin rutas planeadas para el dia.</p> : null}
        </div>
      </section>

      {selectedRoute ? (
        <div className="fixed inset-0 z-50 bg-neutral-950/40">
          <aside className="ml-auto flex h-full w-full max-w-5xl flex-col overflow-hidden bg-white shadow-xl">
            <header className="border-b border-line p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-apex">Panel administrativo de ruta</p>
                  <h2 className="text-2xl font-semibold">{routeLabel(selectedRoute)}</h2>
                  <p className="mt-1 text-sm text-neutral-600">{formatHour(selectedRoute.start_time)} - {formatHour(selectedRoute.end_time)} - {selectedPeople.length || selectedRoute.employees?.length || 0} persona(s) asignadas</p>
                </div>
                <button className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-line" onClick={() => setSelectedRouteId("")} type="button" aria-label="Cerrar monitor"><X size={18} /></button>
              </div>
            </header>
            <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[320px_1fr]">
              <section className="border-b border-line p-4 lg:border-b-0 lg:border-r">
                <h3 className="text-sm font-semibold uppercase text-neutral-500">Equipo en ruta</h3>
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
                    <h3 className="text-base font-semibold">Linea cronologica de la ruta</h3>
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
                          <img alt="Evidencia de actividad" className="h-32 w-full rounded-md object-cover" src={event.evidence[0].base64_data} />
                        ) : event.evidence?.[0]?.file_url ? (
                          <a className="inline-flex h-10 items-center gap-2 rounded-md border border-line px-3 text-sm font-semibold hover:bg-paper" href={event.evidence[0].file_url} target="_blank" rel="noreferrer"><Camera size={16} /> Ver evidencia</a>
                        ) : (
                          <p className="rounded-md bg-paper p-3 text-xs font-semibold text-neutral-500">Sin evidencia fotografica</p>
                        )}
                      </div>
                    </article>
                  ))}
                  {!selectedTimeline.length ? <p className="rounded-md bg-paper p-4 text-sm text-neutral-500">Esta ruta aun no tiene marcaciones ni actividades registradas.</p> : null}
                </div>
              </section>
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}

function ApexIndicator({ icon, label, value, detail, tone }: { icon: ReactNode; label: string; value: number; detail: string; tone: "emerald" | "sky" | "violet" | "amber" }) {
  const colors = {
    emerald: "bg-emerald-400/12 text-emerald-200 border-emerald-300/20",
    sky: "bg-sky-400/12 text-sky-200 border-sky-300/20",
    violet: "bg-violet-400/12 text-violet-200 border-violet-300/20",
    amber: "bg-amber-400/12 text-amber-200 border-amber-300/20"
  };
  return (
    <div className={`rounded-md border p-4 ${colors[tone]}`}>
      <div className="flex items-center justify-between gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-md bg-white/10">{icon}</span>
        <p className="text-3xl font-semibold text-white">{value}</p>
      </div>
      <p className="mt-4 text-sm font-semibold text-white">{label}</p>
      <p className="mt-1 text-xs text-white/62">{detail}</p>
    </div>
  );
}

function HeroStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="border-b border-white/10 p-4 sm:border-b-0 sm:border-r last:border-r-0">
      <p className="text-2xl font-semibold">{value}</p>
      <p className="mt-1 text-xs uppercase tracking-wide text-white/55">{label}</p>
    </div>
  );
}

function ActionTile({ icon, title, detail, href, primary = false }: { icon: ReactNode; title: string; detail: string; href: string; primary?: boolean }) {
  return (
    <Link className={`rounded-md border p-4 transition hover:-translate-y-0.5 hover:shadow-sm ${primary ? "border-apex bg-[#146C6312]" : "border-line bg-white hover:border-apex"}`} href={href}>
      <span className={`flex h-10 w-10 items-center justify-center rounded-md ${primary ? "bg-apex text-white" : "bg-paper text-apex"}`}>{icon}</span>
      <p className="mt-4 font-semibold">{title}</p>
      <p className="mt-1 text-sm text-neutral-600">{detail}</p>
    </Link>
  );
}

function MonitorStrip({ label, value, hint }: { label: string; value: number | string; hint: string }) {
  return (
    <div className="border-b border-line p-4 md:border-b-0 md:border-r last:border-r-0">
      <p className="text-xs font-semibold uppercase text-neutral-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
      <p className="mt-1 text-xs text-neutral-500">{hint}</p>
    </div>
  );
}
