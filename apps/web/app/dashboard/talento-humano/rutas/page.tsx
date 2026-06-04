"use client";

import { api } from "@/lib/api";
import { ModalFrame } from "@/components/ui/ModalFrame";
import { Activity, ArrowLeft, CalendarDays, Camera, Clock, HelpCircle, MapPinned, Navigation, Plus, RefreshCw, Save, Users, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Employee = { id: number; code: string; user_type?: string; position: string; department: string; metadata: { name: string; document: string; user_type?: string }; user: { name: string } };
type Vehicle = { id: number; plate: string; type: string; model: string };
type TimeRoute = { id: number | string; date: string; vehicle_plate: string; employees: string[]; start_time: string; end_time: string; status: string };
type OperatorPoint = { key: string; user_name: string; name: string; route_id: number | string; online?: boolean; last_punch_type?: string; last_activity_type?: string; last_activity_time?: string };
type PunchPoint = { id: number | string; user_name: string; type: string; time?: string; punched_at: string; latitude?: number | null; longitude?: number | null; accuracy_meters?: number | null; extra_minutes?: number; extra_reason?: string; extra_detail?: string; extra_evidence?: { base64_data?: string; file_name?: string; file_url?: string } };
type ActivityPoint = { id: number | string; user_name: string; type: string; time?: string; occurred_at: string; latitude?: number | null; longitude?: number | null; accuracy_meters?: number | null; observation?: string; evidence?: Array<{ base64_data?: string; file_name?: string; file_url?: string }> };
type RouteMonitor = TimeRoute & { placa?: string; assigned_count?: number; online_count?: number; with_gps_count?: number; punch_points?: PunchPoint[]; activity_points?: ActivityPoint[] };
type OperationsMap = { date: string; generated_at: string; people: OperatorPoint[]; routes: RouteMonitor[]; totals: { routes: number; planned_people: number; online: number; without_gps: number; offline: number } };

const punchNames: Record<string, string> = { entrada: "Entrada", inicio_almuerzo: "Almuerzo", fin_almuerzo: "Retorno", salida: "Cierre" };

function employeeName(employee: Employee) {
  return employee.metadata.name || employee.user.name || employee.code || `Empleado ${employee.id}`;
}

function formatHour(value?: string | null) {
  if (!value) return "--";
  if (/^\d{2}:\d{2}/.test(value)) return value.slice(0, 5);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "--" : date.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
}

function routeLabel(route: RouteMonitor) {
  return route.vehicle_plate || route.placa || `Horario ${route.id}`;
}

function Metric({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: number; hint: string }) {
  return (
    <div className="bg-neutral-950 p-4">
      <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-md bg-emerald-400/10 text-emerald-300">{icon}</div>
      <p className="text-3xl font-semibold">{value}</p>
      <p className="mt-1 text-sm text-white">{label}</p>
      <p className="mt-1 text-xs text-neutral-400">{hint}</p>
    </div>
  );
}

function FieldHelp({ label, help, children }: { label: string; help: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 flex items-center gap-1 text-sm font-semibold text-neutral-800">
        {label}
        <HelpCircle size={14} className="text-neutral-400" />
      </span>
      {children}
      <span className="mt-1 block text-xs leading-5 text-neutral-500">{help}</span>
    </label>
  );
}

export default function RoutesPlanningPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [routes, setRoutes] = useState<TimeRoute[]>([]);
  const [operations, setOperations] = useState<OperationsMap | null>(null);
  const [selectedRouteId, setSelectedRouteId] = useState("");
  const [message, setMessage] = useState("");
  const [modal, setModal] = useState<"route" | null>(null);
  const [loadingMonitor, setLoadingMonitor] = useState(false);
  const [form, setForm] = useState({ date: new Date().toISOString().slice(0, 10), vehicle_plate: "", employees: [] as string[], start_time: "08:00", end_time: "17:00", tolerance_minutes: 15, per_diem: 0, notes: "" });

  async function load() {
    setLoadingMonitor(true);
    const today = new Date().toISOString().slice(0, 10);
    const [employeeData, vehicleData, routeData, operationsData] = await Promise.all([
      api<Employee[]>("/api/v1/hr/employees?active=true").catch(() => []),
      api<Vehicle[]>("/api/v1/transport/vehicles").catch(() => []),
      api<TimeRoute[]>("/api/v1/hr/routes").catch(() => []),
      api<OperationsMap>(`/api/v1/hr/operations-map?date=${today}&minutes=30&footprint_days=30`).catch(() => null)
    ]);
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

  async function createRoute() {
    if (!form.employees.length) {
      setMessage("Selecciona al menos una persona para asignar el horario.");
      return;
    }
    if (!form.start_time || !form.end_time) {
      setMessage("Define hora de inicio y hora de fin del horario.");
      return;
    }
    await api<TimeRoute>("/api/v1/hr/routes", { method: "POST", body: JSON.stringify({ ...form, status: "active" }) });
    setMessage("Horario asignado correctamente.");
    setForm((prev) => ({ ...prev, vehicle_plate: "", employees: [], notes: "" }));
    setModal(null);
    await load();
  }

  const activeRoutes = useMemo(() => routes.filter((route) => route.status !== "closed"), [routes]);
  const totalAssigned = useMemo(() => routes.reduce((sum, route) => sum + (route.employees?.length || 0), 0), [routes]);
  const selectedEmployeeCount = form.employees.length;
  const monitorRoutes: RouteMonitor[] = operations?.routes?.length ? operations.routes : routes.map((route) => ({ ...route, punch_points: [], activity_points: [] }));
  const selectedRoute = monitorRoutes.find((route) => String(route.id) === selectedRouteId) || null;
  const selectedPeople = useMemo(() => selectedRoute && operations ? operations.people.filter((person) => String(person.route_id) === String(selectedRoute.id)) : [], [operations, selectedRoute]);
  const selectedTimeline = useMemo(() => {
    if (!selectedRoute) return [];
    return [
      ...(selectedRoute.punch_points || []).map((event) => ({ kind: "marca" as const, id: `punch-${event.id}`, user_name: event.user_name, title: punchNames[event.type] || event.type, at: event.punched_at, time: event.time || event.punched_at, latitude: event.latitude, longitude: event.longitude, accuracy_meters: event.accuracy_meters, observation: event.extra_minutes ? `${event.extra_minutes} minuto(s) extra · ${event.extra_reason || "extension"}${event.extra_detail ? ` · ${event.extra_detail}` : ""}` : "", evidence: event.extra_evidence?.base64_data || event.extra_evidence?.file_url ? [event.extra_evidence] : [] })),
      ...(selectedRoute.activity_points || []).map((event) => ({ kind: "actividad" as const, id: `activity-${event.id}`, user_name: event.user_name, title: event.type, at: event.occurred_at, time: event.time || event.occurred_at, latitude: event.latitude, longitude: event.longitude, accuracy_meters: event.accuracy_meters, observation: event.observation || "", evidence: event.evidence || [] }))
    ].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  }, [selectedRoute]);
  const totalEvents = monitorRoutes.reduce((sum, route) => sum + (route.punch_points?.length || 0) + (route.activity_points?.length || 0), 0);
  const routeCoverage = monitorRoutes.length ? Math.round((monitorRoutes.filter((route) => (route.punch_points?.length || 0) > 0).length / monitorRoutes.length) * 100) : 0;

  return (
    <div className="space-y-5 pb-20 md:pb-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link className="mb-3 inline-flex h-11 items-center gap-2 rounded-md pr-3 text-sm font-medium text-neutral-600 hover:text-apex" href="/dashboard/talento-humano"><ArrowLeft size={18} /> Control de horarios</Link>
          <p className="text-sm font-medium text-apex">Talento Humano</p>
          <h1 className="text-2xl font-semibold md:text-3xl">Asignar horarios</h1>
        </div>
        <button className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-md bg-apex px-4 text-sm font-semibold text-white md:h-10 md:w-auto" onClick={() => setModal("route")} type="button">
          <Plus size={16} /> Nuevo horario
        </button>
      </header>

      {message ? <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-900">{message}</div> : null}

      <section className="overflow-hidden rounded-md border border-line bg-neutral-950 text-white">
        <div className="grid lg:grid-cols-[1.15fr_2fr]">
          <div className="border-b border-white/10 p-5 lg:border-b-0 lg:border-r">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">Monitor APEX</p>
            <h2 className="mt-3 text-2xl font-semibold">Control operativo de horarios</h2>
            <p className="mt-2 text-sm text-neutral-300">Horarios, personas, marcaciones, actividades, GPS y evidencias en un solo panel administrativo.</p>
            <div className="mt-5 flex items-end gap-2">
              <span className="text-5xl font-semibold">{routeCoverage}</span>
              <span className="pb-2 text-sm text-neutral-400">/100 seguimiento</span>
            </div>
          </div>
          <div className="grid gap-px bg-white/10 sm:grid-cols-2 xl:grid-cols-4">
            <Metric icon={<CalendarDays size={18} />} label="Horarios activos" value={activeRoutes.length} hint={`${routes.length} planeados`} />
            <Metric icon={<Users size={18} />} label="Personas asignadas" value={totalAssigned} hint={`${employees.length} disponibles`} />
            <Metric icon={<MapPinned size={18} />} label="Con GPS" value={operations?.totals.online || 0} hint={`${operations?.totals.without_gps || 0} sin senal`} />
            <Metric icon={<Activity size={18} />} label="Eventos" value={totalEvents} hint="marcas + actividades" />
          </div>
        </div>
      </section>

      <section className="rounded-md border border-line bg-white p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2"><CalendarDays size={18} className="text-apex" /><h2 className="text-base font-semibold">Monitor dinamico por horario</h2></div>
            <p className="mt-1 text-sm text-neutral-600">Abre un horario para ver su trazabilidad cronologica, personas asignadas y evidencias.</p>
          </div>
          <button className="inline-flex h-10 items-center gap-2 rounded-md border border-line px-3 text-sm font-semibold hover:bg-paper" onClick={load} type="button"><RefreshCw className={loadingMonitor ? "animate-spin" : ""} size={16} /> Actualizar</button>
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          {monitorRoutes.map((route) => {
            const events = (route.punch_points?.length || 0) + (route.activity_points?.length || 0);
            return (
              <button className="rounded-md border border-line p-4 text-left transition hover:border-apex hover:bg-paper" key={String(route.id)} onClick={() => setSelectedRouteId(String(route.id))} type="button">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold">{routeLabel(route)}</p>
                    <p className="mt-1 text-xs text-neutral-500">Horario {String(route.id)} - {route.date ? new Date(route.date).toLocaleDateString() : "hoy"}</p>
                  </div>
                  <span className={`rounded-md px-2 py-1 text-xs font-semibold ${events ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>{events ? "En seguimiento" : "Sin eventos"}</span>
                </div>
                <p className="mt-3 text-sm text-neutral-600">{route.employees?.join(", ") || "Sin personas asignadas"}</p>
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-neutral-600">
                  <span className="rounded-md bg-white px-2 py-1">{route.start_time || "--"} - {route.end_time || "--"}</span>
                  <span className="rounded-md bg-white px-2 py-1">{route.assigned_count ?? route.employees?.length ?? 0} persona(s)</span>
                  <span className="rounded-md bg-white px-2 py-1">{events} evento(s)</span>
                  <span className="rounded-md bg-white px-2 py-1">{route.activity_points?.length || 0} evidencia(s)</span>
                </div>
              </button>
            );
          })}
          {!monitorRoutes.length ? <div className="col-span-full rounded-md border border-dashed border-line p-10 text-center text-sm text-neutral-500">No hay horarios asignados.</div> : null}
        </div>
      </section>

      {modal === "route" ? (
        <ModalFrame title="Nuevo horario operativo" onClose={() => setModal(null)}>
          <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-950">
            Usa este formulario para asignar jornadas a personal operativo, administrativo o logistico. El vehiculo es opcional y solo aplica cuando el horario esta asociado a una operacion de transporte.
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <FieldHelp label="Fecha del horario" help="Dia en el que aplica la asignacion. Para horarios recurrentes usa una asignacion por dia operativo.">
              <input className="h-12 w-full rounded-md border border-line px-3 text-base md:text-sm" type="date" value={form.date} onChange={(event) => setForm((prev) => ({ ...prev, date: event.target.value }))} />
            </FieldHelp>
            <FieldHelp label="Recurso o vehiculo" help="Opcional. Dejalo vacio para horarios generales de oficina, bodega, planta o equipos sin vehiculo.">
              <select className="h-12 w-full rounded-md border border-line px-3 text-base md:text-sm" value={form.vehicle_plate} onChange={(event) => setForm((prev) => ({ ...prev, vehicle_plate: event.target.value }))}>
                <option value="">Sin vehiculo asignado</option>
                {vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.plate}>{vehicle.plate} - {vehicle.type || vehicle.model || "Movil"}</option>)}
              </select>
            </FieldHelp>
            <FieldHelp label="Hora de inicio" help="La primera marcacion se compara contra esta hora para control de llegada.">
              <input className="h-12 w-full rounded-md border border-line px-3 text-base md:text-sm" type="time" value={form.start_time} onChange={(event) => setForm((prev) => ({ ...prev, start_time: event.target.value }))} />
            </FieldHelp>
            <FieldHelp label="Hora de fin" help="El cierre despues de esta hora puede generar extension o novedad segun tolerancia.">
              <input className="h-12 w-full rounded-md border border-line px-3 text-base md:text-sm" type="time" value={form.end_time} onChange={(event) => setForm((prev) => ({ ...prev, end_time: event.target.value }))} />
            </FieldHelp>
            <FieldHelp label="Tolerancia en minutos" help="Margen permitido antes de marcar atrasos o extensiones operativas.">
              <input className="h-12 w-full rounded-md border border-line px-3 text-base md:text-sm" min={0} type="number" value={form.tolerance_minutes} onChange={(event) => setForm((prev) => ({ ...prev, tolerance_minutes: Number(event.target.value) }))} />
            </FieldHelp>
            <FieldHelp label="Viatico o auxilio" help="Valor opcional asociado a la jornada. Usa 0 cuando no aplique.">
              <input className="h-12 w-full rounded-md border border-line px-3 text-base md:text-sm" min={0} type="number" value={form.per_diem} onChange={(event) => setForm((prev) => ({ ...prev, per_diem: Number(event.target.value) }))} />
            </FieldHelp>
            <FieldHelp label="Notas internas" help="Indica sede, turno, frente de trabajo, instruccion especial o responsable del horario.">
              <textarea className="min-h-24 w-full rounded-md border border-line px-3 py-2 text-base md:text-sm" placeholder="Ej: Turno bodega norte, prioridad recepcion, supervisor asignado..." value={form.notes} onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))} />
            </FieldHelp>
            <div className="rounded-md border border-line bg-paper p-3">
              <p className="flex items-center gap-2 text-sm font-semibold text-neutral-800"><Clock size={16} className="text-apex" /> Resumen</p>
              <div className="mt-3 space-y-2 text-sm text-neutral-600">
                <p><span className="font-semibold text-neutral-900">{form.start_time || "--"} - {form.end_time || "--"}</span> con {form.tolerance_minutes || 0} min de tolerancia.</p>
                <p>{selectedEmployeeCount} persona(s) seleccionada(s).</p>
                <p>{form.vehicle_plate ? `Recurso asignado: ${form.vehicle_plate}.` : "Horario general sin vehiculo fijo."}</p>
              </div>
            </div>
          </div>
          <div className="mt-4 rounded-md border border-line bg-paper p-3">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold">Personas asignadas</p>
                <p className="mt-1 text-xs text-neutral-500">Selecciona una o varias personas. Esta asignacion alimenta marcaciones, mapa y reportes.</p>
              </div>
              <span className="rounded-md bg-white px-2 py-1 text-xs font-semibold text-neutral-600">{selectedEmployeeCount} seleccionada(s)</span>
            </div>
            <div className="flex max-h-44 flex-wrap gap-2 overflow-y-auto">
              {employees.map((employee) => {
                const value = employee.code || employeeName(employee);
                const active = form.employees.includes(value);
                return (
                  <button className={`h-10 rounded-md border px-3 text-xs font-semibold ${active ? "border-apex bg-apex text-white" : "border-line bg-white hover:bg-paper"}`} key={employee.id} onClick={() => setForm((prev) => ({ ...prev, employees: active ? prev.employees.filter((item) => item !== value) : [...prev.employees, value] }))} type="button">
                    {employeeName(employee)}
                  </button>
                );
              })}
            </div>
          </div>
          <button className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-md bg-apex text-base font-semibold text-white" onClick={createRoute} type="button"><Save size={17} /> Asignar horario</button>
        </ModalFrame>
      ) : null}

      {selectedRoute ? (
        <div className="fixed inset-0 z-50 bg-neutral-950/40">
          <aside className="ml-auto flex h-full w-full max-w-5xl flex-col overflow-hidden bg-white shadow-xl">
            <header className="border-b border-line p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-apex">Monitor administrativo</p>
                  <h2 className="text-2xl font-semibold">{routeLabel(selectedRoute)}</h2>
                  <p className="mt-1 text-sm text-neutral-600">{formatHour(selectedRoute.start_time)} - {formatHour(selectedRoute.end_time)} - {(selectedRoute.assigned_count ?? selectedRoute.employees?.length ?? 0)} persona(s)</p>
                </div>
                <button className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-line" onClick={() => setSelectedRouteId("")} type="button" aria-label="Cerrar"><X size={18} /></button>
              </div>
            </header>
            <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[320px_1fr]">
              <section className="border-b border-line p-4 lg:border-b-0 lg:border-r">
                <h3 className="text-sm font-semibold uppercase text-neutral-500">Equipo incluido</h3>
                <div className="mt-3 space-y-2">
                  {(selectedPeople.length ? selectedPeople : (selectedRoute.employees || []).map((name) => ({ key: String(name), name, user_name: String(name), route_id: selectedRoute.id } as OperatorPoint))).map((person) => (
                    <div className="rounded-md border border-line p-3" key={person.key}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-semibold">{person.name || person.user_name}</p>
                          <p className="mt-1 text-xs text-neutral-500">{person.last_punch_type ? `Ultima marca: ${punchNames[person.last_punch_type] || person.last_punch_type}` : "Sin marca registrada"}</p>
                        </div>
                        <span className={`rounded-md px-2 py-1 text-xs font-semibold ${person.online ? "bg-emerald-50 text-emerald-700" : "bg-paper text-neutral-600"}`}>{person.online ? "En vivo" : "Sin senal"}</span>
                      </div>
                      {person.last_activity_type ? <p className="mt-2 text-xs text-neutral-600">{person.last_activity_type} - {person.last_activity_time || "--"}</p> : null}
                    </div>
                  ))}
                </div>
              </section>
              <section className="p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-base font-semibold">Trazabilidad cronologica</h3>
                    <p className="mt-1 text-sm text-neutral-600">Marcaciones y actividades individuales con GPS y evidencia.</p>
                  </div>
                  <Link className="inline-flex h-10 items-center gap-2 rounded-md border border-line px-3 text-sm font-semibold hover:bg-paper" href="/dashboard/talento-humano/mapa"><Navigation size={16} /> Mapa</Link>
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
                      <div>
                        {event.evidence?.[0]?.base64_data ? <img alt="Evidencia" className="h-32 w-full rounded-md object-cover" src={event.evidence[0].base64_data} /> : event.evidence?.[0]?.file_url ? <a className="inline-flex h-10 items-center gap-2 rounded-md border border-line px-3 text-sm font-semibold hover:bg-paper" href={event.evidence[0].file_url} target="_blank" rel="noreferrer"><Camera size={16} /> Ver evidencia</a> : <p className="rounded-md bg-paper p-3 text-xs font-semibold text-neutral-500">Sin evidencia fotografica</p>}
                      </div>
                    </article>
                  ))}
                  {!selectedTimeline.length ? <p className="rounded-md bg-paper p-4 text-sm text-neutral-500">Este horario aun no tiene marcaciones ni actividades.</p> : null}
                </div>
              </section>
            </div>
          </aside>
        </div>
      ) : null}

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-white/95 p-3 backdrop-blur md:hidden">
        <button className="h-14 w-full rounded-md bg-apex text-base font-semibold text-white" onClick={() => setModal("route")} type="button">Nuevo horario</button>
      </div>
    </div>
  );
}
