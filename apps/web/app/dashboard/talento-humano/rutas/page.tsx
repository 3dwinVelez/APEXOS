"use client";

import { api } from "@/lib/api";
import { ModalFrame } from "@/components/ui/ModalFrame";
import { Activity, ArrowLeft, CalendarDays, Camera, CheckSquare2, Clock, Copy, Edit3, HelpCircle, MapPinned, Navigation, Plus, RefreshCw, Save, Search, Square, UserPlus, Users, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Employee = { id: number; code: string; user_type?: string; position: string; department: string; metadata: { name: string; document: string; user_type?: string }; user: { name: string } };
type Vehicle = { id: number; plate: string; type: string; model: string };
type TimeRoute = { id: number | string; date: string; vehicle_plate: string; employees: string[]; start_time: string; end_time: string; status: string; tolerance_minutes?: number; per_diem?: number; notes?: string };
type OperatorPoint = { key: string; user_name: string; name: string; route_id: number | string; online?: boolean; last_punch_type?: string; last_activity_type?: string; last_activity_time?: string };
type PunchPoint = { id: number | string; user_name: string; type: string; time?: string; punched_at: string; latitude?: number | null; longitude?: number | null; accuracy_meters?: number | null; extra_minutes?: number; extra_reason?: string; extra_detail?: string; extra_evidence?: { base64_data?: string; file_name?: string; file_url?: string } };
type ActivityPoint = { id: number | string; user_name: string; type: string; time?: string; occurred_at: string; latitude?: number | null; longitude?: number | null; accuracy_meters?: number | null; observation?: string; evidence?: Array<{ base64_data?: string; file_name?: string; file_url?: string }> };
type RouteMonitor = TimeRoute & { placa?: string; assigned_count?: number; online_count?: number; with_gps_count?: number; punch_points?: PunchPoint[]; activity_points?: ActivityPoint[] };
type OperationsMap = { date: string; generated_at: string; people: OperatorPoint[]; routes: RouteMonitor[]; totals: { routes: number; planned_people: number; online: number; without_gps: number; offline: number } };

const punchNames: Record<string, string> = { entrada: "Entrada", inicio_almuerzo: "Almuerzo", fin_almuerzo: "Retorno", salida: "Cierre" };
const weekdayOptions = [
  { value: 1, label: "Lun" },
  { value: 2, label: "Mar" },
  { value: 3, label: "Mie" },
  { value: 4, label: "Jue" },
  { value: 5, label: "Vie" },
  { value: 6, label: "Sab" },
  { value: 0, label: "Dom" }
];
const administrativeSites = ["SEDE-PRINCIPAL", "BOG-NORTE", "BOG-SUR", "OFICINA-ADMINISTRATIVA", "REMOTO"];
const administrativeSitePrefix = "Sede administrativa:";

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

function employeeValue(employee: Employee) {
  return employee.code || employeeName(employee);
}

function employeeSearchText(employee: Employee) {
  return [
    employeeName(employee),
    employee.code,
    employee.metadata?.document,
    employee.position,
    employee.department,
    employee.user_type
  ].filter(Boolean).join(" ").toLowerCase();
}

function inputDate(value?: string | null) {
  if (!value) return new Date().toISOString().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString().slice(0, 10) : date.toISOString().slice(0, 10);
}

function addDays(value: string, days: number) {
  const date = new Date(`${value}T00:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function rangePreview(start: string, end: string, weekdays: number[]) {
  const startDate = new Date(`${start}T00:00:00`);
  const endDate = new Date(`${end}T00:00:00`);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate < startDate) return 0;
  const allowed = new Set(weekdays);
  let count = 0;
  for (let cursor = new Date(startDate); cursor <= endDate; cursor.setDate(cursor.getDate() + 1)) {
    if (allowed.has(cursor.getDay())) count += 1;
  }
  return count;
}

function notesWithoutAdministrativeSite(value = "") {
  return value.split("\n").filter((line) => !line.trim().startsWith(administrativeSitePrefix)).join("\n").trim();
}

function administrativeSiteFromNotes(value = "") {
  const line = value.split("\n").find((item) => item.trim().startsWith(administrativeSitePrefix));
  return line ? line.replace(administrativeSitePrefix, "").trim() : "";
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

function PeoplePicker({
  employees,
  selected,
  onChange
}: {
  employees: Employee[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    const rows = term ? employees.filter((employee) => employeeSearchText(employee).includes(term)) : employees;
    return rows.slice(0, 20);
  }, [employees, query]);
  const selectedEmployees = useMemo(() => employees.filter((employee) => selectedSet.has(employeeValue(employee))), [employees, selectedSet]);

  function toggle(value: string) {
    onChange(selectedSet.has(value) ? selected.filter((item) => item !== value) : [...selected, value]);
  }

  function addFiltered() {
    const next = new Set(selected);
    filtered.forEach((employee) => next.add(employeeValue(employee)));
    onChange(Array.from(next));
  }

  return (
    <div className="rounded-md border border-line bg-paper p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">Personas asignadas</p>
          <p className="mt-1 text-xs text-neutral-500">Busca por nombre, codigo, documento, cargo o area. Ideal para listas grandes.</p>
        </div>
        <span className="rounded-md bg-white px-2 py-1 text-xs font-semibold text-neutral-600">{selected.length} seleccionada(s)</span>
      </div>
      <label className="relative mt-3 block">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" size={16} />
        <input className="h-11 w-full rounded-md border border-line bg-white pl-9 pr-3 text-sm" placeholder="Buscar persona para agregar..." value={query} onChange={(event) => setQuery(event.target.value)} />
      </label>
      <div className="mt-2 flex flex-wrap gap-2">
        <button className="inline-flex h-9 items-center gap-2 rounded-md border border-line bg-white px-3 text-xs font-semibold hover:bg-paper" onClick={addFiltered} type="button"><UserPlus size={14} /> Agregar filtrados</button>
        {selected.length ? <button className="inline-flex h-9 items-center rounded-md border border-line bg-white px-3 text-xs font-semibold text-neutral-600 hover:bg-paper" onClick={() => onChange([])} type="button">Limpiar seleccion</button> : null}
      </div>
      {selectedEmployees.length ? (
        <div className="mt-3 flex max-h-24 flex-wrap gap-2 overflow-y-auto rounded-md bg-white p-2">
          {selectedEmployees.map((employee) => {
            const value = employeeValue(employee);
            return (
              <button className="inline-flex max-w-full items-center gap-2 rounded-md bg-apex px-2 py-1 text-xs font-semibold text-white" key={employee.id} onClick={() => toggle(value)} type="button">
                <span className="truncate">{employeeName(employee)}</span>
                <X size={13} />
              </button>
            );
          })}
        </div>
      ) : null}
      <div className="mt-3 max-h-52 overflow-y-auto rounded-md border border-line bg-white">
        {filtered.map((employee) => {
          const value = employeeValue(employee);
          const active = selectedSet.has(value);
          return (
            <button className={`grid w-full grid-cols-[22px_1fr] gap-2 border-b border-line px-3 py-2 text-left last:border-b-0 hover:bg-paper ${active ? "bg-emerald-50" : ""}`} key={employee.id} onClick={() => toggle(value)} type="button">
              <span className="pt-0.5 text-apex">{active ? <CheckSquare2 size={16} /> : <Square size={16} />}</span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">{employeeName(employee)}</span>
                <span className="mt-0.5 block truncate text-xs text-neutral-500">{employee.code || "Sin codigo"} - {employee.position || employee.user_type || "Sin cargo"} - {employee.department || "Sin area"}</span>
              </span>
            </button>
          );
        })}
        {!filtered.length ? <p className="p-4 text-sm text-neutral-500">Sin coincidencias.</p> : null}
      </div>
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
  const [modal, setModal] = useState<"route" | "edit" | null>(null);
  const [editingRoute, setEditingRoute] = useState<RouteMonitor | null>(null);
  const [loadingMonitor, setLoadingMonitor] = useState(false);
  const [form, setForm] = useState({ date: new Date().toISOString().slice(0, 10), vehicle_plate: "", employees: [] as string[], start_time: "08:00", end_time: "17:00", tolerance_minutes: 15, per_diem: 0, notes: "" });
  const [scheduleKind, setScheduleKind] = useState<"administrative" | "operational">("administrative");
  const [administrativeSite, setAdministrativeSite] = useState("SEDE-PRINCIPAL");
  const [bulkMode, setBulkMode] = useState(false);
  const [bulk, setBulk] = useState({ start_date: new Date().toISOString().slice(0, 10), end_date: addDays(new Date().toISOString().slice(0, 10), 4), weekdays: [1, 2, 3, 4, 5] });

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

  function resetForm() {
    const today = new Date().toISOString().slice(0, 10);
    setForm({ date: today, vehicle_plate: "", employees: [], start_time: "08:00", end_time: "17:00", tolerance_minutes: 15, per_diem: 0, notes: "" });
    setScheduleKind("administrative");
    setAdministrativeSite("SEDE-PRINCIPAL");
    setBulk({ start_date: today, end_date: addDays(today, 4), weekdays: [1, 2, 3, 4, 5] });
    setBulkMode(false);
    setEditingRoute(null);
  }

  function openCreateModal(route?: RouteMonitor) {
    setSelectedRouteId("");
    resetForm();
    if (route) {
      const date = inputDate(route.date);
      const site = administrativeSiteFromNotes(route.notes || "");
      setScheduleKind(route.vehicle_plate ? "operational" : "administrative");
      setAdministrativeSite(site || "SEDE-PRINCIPAL");
      setForm({
        date,
        vehicle_plate: route.vehicle_plate || route.placa || "",
        employees: route.employees || [],
        start_time: route.start_time || "08:00",
        end_time: route.end_time || "17:00",
        tolerance_minutes: route.tolerance_minutes ?? 15,
        per_diem: route.per_diem ?? 0,
        notes: notesWithoutAdministrativeSite(route.notes || "")
      });
      setBulk({ start_date: date, end_date: addDays(date, 4), weekdays: [1, 2, 3, 4, 5] });
    }
    setModal("route");
  }

  function openEditModal(route: RouteMonitor) {
    setSelectedRouteId("");
    setEditingRoute(route);
    setBulkMode(false);
    const site = administrativeSiteFromNotes(route.notes || "");
    setScheduleKind(route.vehicle_plate ? "operational" : "administrative");
    setAdministrativeSite(site || "SEDE-PRINCIPAL");
    setForm({
      date: inputDate(route.date),
      vehicle_plate: route.vehicle_plate || route.placa || "",
      employees: route.employees || [],
      start_time: route.start_time || "08:00",
      end_time: route.end_time || "17:00",
      tolerance_minutes: route.tolerance_minutes ?? 15,
      per_diem: route.per_diem ?? 0,
      notes: notesWithoutAdministrativeSite(route.notes || "")
    });
    setModal("edit");
  }

  function routePayload(status = "active") {
    const siteLine = scheduleKind === "administrative" && administrativeSite.trim()
      ? `${administrativeSitePrefix} ${administrativeSite.trim()}`
      : "";
    return {
      ...form,
      vehicle_plate: scheduleKind === "administrative" ? "" : form.vehicle_plate,
      notes: [siteLine, form.notes.trim()].filter(Boolean).join("\n"),
      status
    };
  }

  async function saveRoute() {
    if (!form.employees.length) {
      setMessage("Selecciona al menos una persona para asignar el horario.");
      return;
    }
    if (!form.start_time || !form.end_time) {
      setMessage("Define hora de inicio y hora de fin del horario.");
      return;
    }
    if (modal === "edit" && editingRoute) {
      await api<TimeRoute>(`/api/v1/hr/routes/${editingRoute.id}`, { method: "PATCH", body: JSON.stringify(routePayload(editingRoute.status || "active")) });
      setMessage("Horario actualizado correctamente.");
    } else if (bulkMode) {
      if (!bulk.start_date || !bulk.end_date || !bulk.weekdays.length) {
        setMessage("Define rango de fechas y al menos un dia de la semana.");
        return;
      }
      const result = await api<{ created: number }>("/api/v1/hr/routes/bulk", { method: "POST", body: JSON.stringify({ ...routePayload("active"), start_date: bulk.start_date, end_date: bulk.end_date, weekdays: bulk.weekdays }) });
      setMessage(`${result.created || 0} horario(s) asignado(s) correctamente.`);
    } else {
      await api<TimeRoute>("/api/v1/hr/routes", { method: "POST", body: JSON.stringify(routePayload("active")) });
      setMessage("Horario asignado correctamente.");
    }
    resetForm();
    setModal(null);
    await load();
  }

  const activeRoutes = useMemo(() => routes.filter((route) => route.status !== "closed"), [routes]);
  const totalAssigned = useMemo(() => routes.reduce((sum, route) => sum + (route.employees?.length || 0), 0), [routes]);
  const selectedEmployeeCount = form.employees.length;
  const bulkCount = bulkMode ? rangePreview(bulk.start_date, bulk.end_date, bulk.weekdays) : 1;
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
        <button className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-md bg-apex px-4 text-sm font-semibold text-white md:h-10 md:w-auto" onClick={() => openCreateModal()} type="button">
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
              <article className="rounded-md border border-line p-4 text-left transition hover:border-apex hover:bg-paper" key={String(route.id)}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold">{routeLabel(route)}</p>
                    <p className="mt-1 text-xs text-neutral-500">Horario {String(route.id)} - {route.date ? new Date(route.date).toLocaleDateString() : "hoy"}</p>
                  </div>
                  <span className={`rounded-md px-2 py-1 text-xs font-semibold ${events ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>{events ? "En seguimiento" : "Sin eventos"}</span>
                </div>
                  <p className="mt-3 max-h-10 overflow-hidden text-sm text-neutral-600">{route.employees?.join(", ") || "Sin personas asignadas"}</p>
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-neutral-600">
                  <span className="rounded-md bg-white px-2 py-1">{route.start_time || "--"} - {route.end_time || "--"}</span>
                  <span className="rounded-md bg-white px-2 py-1">{route.assigned_count ?? route.employees?.length ?? 0} persona(s)</span>
                  <span className="rounded-md bg-white px-2 py-1">{events} evento(s)</span>
                  <span className="rounded-md bg-white px-2 py-1">{route.activity_points?.length || 0} evidencia(s)</span>
                </div>
                <div className="mt-4 grid gap-2 sm:grid-cols-3">
                  <button className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-semibold hover:bg-paper" onClick={() => setSelectedRouteId(String(route.id))} type="button"><Navigation size={15} /> Abrir</button>
                  <button className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-semibold hover:bg-paper" onClick={() => openEditModal(route)} type="button"><Edit3 size={15} /> Editar</button>
                  <button className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-apex px-3 text-sm font-semibold text-white" onClick={() => openCreateModal(route)} type="button"><Copy size={15} /> Clonar</button>
                </div>
              </article>
            );
          })}
          {!monitorRoutes.length ? <div className="col-span-full rounded-md border border-dashed border-line p-10 text-center text-sm text-neutral-500">No hay horarios asignados.</div> : null}
        </div>
      </section>

      {modal ? (
        <ModalFrame title={modal === "edit" ? "Editar horario operativo" : "Nuevo horario operativo"} onClose={() => { setModal(null); resetForm(); }}>
          <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-950">
            Usa este formulario para asignar jornadas a personal operativo, administrativo o logistico. Puedes crear un dia puntual o clonar la misma jornada por rango de fechas y dias de la semana.
          </div>
          {modal !== "edit" ? (
            <div className="mt-4 grid gap-2 rounded-md border border-line bg-white p-2 sm:grid-cols-2">
              <button className={`inline-flex h-11 items-center justify-center gap-2 rounded-md text-sm font-semibold ${!bulkMode ? "bg-apex text-white" : "bg-paper text-neutral-700"}`} onClick={() => setBulkMode(false)} type="button"><CalendarDays size={15} /> Un solo dia</button>
              <button className={`inline-flex h-11 items-center justify-center gap-2 rounded-md text-sm font-semibold ${bulkMode ? "bg-apex text-white" : "bg-paper text-neutral-700"}`} onClick={() => setBulkMode(true)} type="button"><Copy size={15} /> Clonar por rango</button>
            </div>
          ) : null}
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <p className="mb-2 text-sm font-semibold text-neutral-800">Tipo de asignacion</p>
              <div className="grid gap-2 rounded-md border border-line bg-white p-2 sm:grid-cols-2">
                <button className={`h-11 rounded-md text-sm font-semibold ${scheduleKind === "administrative" ? "bg-apex text-white" : "bg-paper text-neutral-700"}`} onClick={() => { setScheduleKind("administrative"); setForm((prev) => ({ ...prev, vehicle_plate: "" })); }} type="button">
                  Administrativo / sede fija
                </button>
                <button className={`h-11 rounded-md text-sm font-semibold ${scheduleKind === "operational" ? "bg-apex text-white" : "bg-paper text-neutral-700"}`} onClick={() => setScheduleKind("operational")} type="button">
                  Operativo / recurso movil
                </button>
              </div>
            </div>
            {bulkMode && modal !== "edit" ? (
              <>
                <FieldHelp label="Fecha inicial" help="Primer dia desde el que quieres clonar este horario.">
                  <input className="h-12 w-full rounded-md border border-line px-3 text-base md:text-sm" type="date" value={bulk.start_date} onChange={(event) => setBulk((prev) => ({ ...prev, start_date: event.target.value }))} />
                </FieldHelp>
                <FieldHelp label="Fecha final" help="Ultimo dia incluido en la creacion masiva. Puedes planear 7, 15 o mas dias en una sola accion.">
                  <input className="h-12 w-full rounded-md border border-line px-3 text-base md:text-sm" type="date" value={bulk.end_date} onChange={(event) => setBulk((prev) => ({ ...prev, end_date: event.target.value }))} />
                </FieldHelp>
                <div className="md:col-span-2">
                  <p className="mb-2 text-sm font-semibold text-neutral-800">Dias de la semana</p>
                  <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
                    {weekdayOptions.map((day) => {
                      const active = bulk.weekdays.includes(day.value);
                      return (
                        <button className={`h-10 rounded-md border text-sm font-semibold ${active ? "border-apex bg-apex text-white" : "border-line bg-white text-neutral-700 hover:bg-paper"}`} key={day.value} onClick={() => setBulk((prev) => ({ ...prev, weekdays: active ? prev.weekdays.filter((item) => item !== day.value) : [...prev.weekdays, day.value] }))} type="button">
                          {day.label}
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-2 text-xs text-neutral-500">Se crearan {bulkCount} bloque(s) de horario para el grupo seleccionado.</p>
                </div>
              </>
            ) : (
              <FieldHelp label="Fecha del horario" help="Dia en el que aplica la asignacion.">
                <input className="h-12 w-full rounded-md border border-line px-3 text-base md:text-sm" type="date" value={form.date} onChange={(event) => setForm((prev) => ({ ...prev, date: event.target.value }))} />
              </FieldHelp>
            )}
            {scheduleKind === "administrative" ? (
              <FieldHelp label="Sede administrativa fija" help="Sede, oficina o punto fijo donde aplica la jornada. No requiere vehiculo.">
                <>
                  <input className="h-12 w-full rounded-md border border-line px-3 text-base md:text-sm" list="administrative-sites" placeholder="Ej: SEDE-PRINCIPAL" value={administrativeSite} onChange={(event) => setAdministrativeSite(event.target.value)} />
                  <datalist id="administrative-sites">
                    {administrativeSites.map((site) => <option key={site} value={site} />)}
                  </datalist>
                </>
              </FieldHelp>
            ) : (
              <FieldHelp label="Recurso o vehiculo" help="Opcional para operacion movil. Selecciona placa cuando el horario dependa de transporte o ruta fisica.">
                <select className="h-12 w-full rounded-md border border-line px-3 text-base md:text-sm" value={form.vehicle_plate} onChange={(event) => setForm((prev) => ({ ...prev, vehicle_plate: event.target.value }))}>
                  <option value="">Sin vehiculo asignado</option>
                  {vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.plate}>{vehicle.plate} - {vehicle.type || vehicle.model || "Movil"}</option>)}
                </select>
              </FieldHelp>
            )}
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
                <p>{bulkMode && modal !== "edit" ? `${bulkCount} bloque(s) por crear.` : "1 bloque de horario."}</p>
                <p>{scheduleKind === "administrative" ? `Sede fija: ${administrativeSite || "sin definir"}.` : form.vehicle_plate ? `Recurso asignado: ${form.vehicle_plate}.` : "Operacion sin vehiculo fijo."}</p>
              </div>
            </div>
          </div>
          <div className="mt-4">
            <PeoplePicker employees={employees} selected={form.employees} onChange={(next) => setForm((prev) => ({ ...prev, employees: next }))} />
          </div>
          <button className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-md bg-apex text-base font-semibold text-white" onClick={saveRoute} type="button"><Save size={17} /> {modal === "edit" ? "Guardar cambios" : bulkMode ? `Crear ${bulkCount} horario(s)` : "Asignar horario"}</button>
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
                <div className="flex items-center gap-2">
                  <button className="inline-flex h-10 items-center gap-2 rounded-md border border-line px-3 text-sm font-semibold hover:bg-paper" onClick={() => openEditModal(selectedRoute)} type="button"><Edit3 size={16} /> Editar</button>
                  <button className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-line" onClick={() => setSelectedRouteId("")} type="button" aria-label="Cerrar"><X size={18} /></button>
                </div>
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
        <button className="h-14 w-full rounded-md bg-apex text-base font-semibold text-white" onClick={() => openCreateModal()} type="button">Nuevo horario</button>
      </div>
    </div>
  );
}
