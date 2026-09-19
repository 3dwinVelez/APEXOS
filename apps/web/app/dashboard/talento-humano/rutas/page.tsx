"use client";

import { api } from "@/lib/api";
import { ModalFrame } from "@/components/ui/ModalFrame";
import { Badge, Skeleton } from "@/components/ui/feedback";
import { localCalendarDate, scheduleGpsRequired, scheduleMonitorDate, scheduleTrackingMode } from "@/lib/hrScheduleMonitor";
import { subscribeHrMonitorRefresh } from "@/lib/hrMonitorRefresh";
import { AlertTriangle, ArrowLeft, Building2, CalendarDays, Camera, CheckCircle2, CheckSquare2, Clock, Copy, Edit3, Filter, HelpCircle, ImageOff, LogIn, LogOut, MapPin, Navigation, PlayCircle, Plus, RefreshCw, RotateCcw, Save, Search, Square, Timer, Truck, UserPlus, Utensils, UtensilsCrossed, X, ZoomIn } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Employee = { id: number | string; code: string; user_type?: string; position: string; department: string; metadata: { name: string; document: string; user_type?: string }; user: { name: string } };
type Vehicle = { id: number | string; plate: string; type: string; model: string };
type TimeRoute = { id: number | string; code?: string; display_id?: number | string; date: string; vehicle_plate: string; employees: string[]; employee_ids?: string[]; employee_names?: string[]; start_time: string; end_time: string; status: string; tolerance_minutes?: number; notes?: string; gps_required?: boolean; tracking_mode?: string; metadata?: Record<string, unknown> };
type MasterOption = { code: string; name: string; active?: boolean; sort_order?: number };
type UserMasterData = { locations?: MasterOption[] };
type OperatorPoint = { key: string; user_name: string; name: string; route_id: number | string; online?: boolean; status?: string; latitude?: number | null; longitude?: number | null; age_seconds?: number | null; last_punch_type?: string; last_punch_time?: string; last_activity_type?: string; last_activity_time?: string };
type MonitorEvidence = { id?: number | string; source?: "activity" | "punch"; base64_data?: string; file_name?: string; file_url?: string; has_base64_data?: boolean; available?: boolean };
type PunchPoint = { id: number | string; user_name: string; type: string; time?: string; punched_at: string; latitude?: number | null; longitude?: number | null; accuracy_meters?: number | null; extra_minutes?: number; extra_reason?: string; extra_detail?: string; extra_evidence?: MonitorEvidence };
type ActivityPoint = { id: number | string; user_name: string; type: string; time?: string; occurred_at: string; latitude?: number | null; longitude?: number | null; accuracy_meters?: number | null; observation?: string; evidence?: MonitorEvidence[] };
type RouteEventSummary = { route_id: number | string; punch_count: number; activity_count: number; evidence_count: number; closed_count: number; event_count: number; last_event_at?: string | null };
type RouteEventSummaryResponse = { generated_at: string; routes: RouteEventSummary[] };
type MonitorMark = { id: number | string; type: string; time?: string };
type MonitorMarksByUser = { user_name: string; marks: MonitorMark[] };
type RouteMonitor = TimeRoute & RouteEventSummary & { placa?: string; assigned_count?: number; online_count?: number; with_gps_count?: number; punch_points?: PunchPoint[]; activity_points?: ActivityPoint[]; marks_by_user?: MonitorMarksByUser[] };
type OperationsMap = { date: string; generated_at: string; people: OperatorPoint[]; routes: RouteMonitor[]; totals: { routes: number; planned_people: number; online: number; without_gps: number; offline: number } };
type MonitorEvidenceBatch = { route_id: number | string; generated_at: string; punch_evidence: Record<string, MonitorEvidence>; activity_evidence: Record<string, MonitorEvidence[]>; counts: { punches: number; punch_evidence: number; activities: number; activity_evidence: number } };

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
const administrativeSitePrefix = "Sede administrativa:";

function employeeName(employee: Employee | null | undefined) {
  return employee?.metadata?.name || employee?.user?.name || employee?.code || `Empleado ${employee?.id}`;
}

function formatHour(value?: string | null) {
  if (!value) return "--";
  if (/^\d{2}:\d{2}/.test(value)) return value.slice(0, 5);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "--" : date.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
}

type TimelineEvent = {
  kind: "marca" | "actividad";
  id: string;
  user_name: string;
  type: string;
  title: string;
  at: string;
  time: string;
  latitude?: number | null;
  longitude?: number | null;
  accuracy_meters?: number | null;
  observation: string;
  evidence: MonitorEvidence[];
};

const punchSequence = ["entrada", "inicio_almuerzo", "fin_almuerzo", "salida"];
const punchShortNames: Record<string, string> = { entrada: "Entrada", inicio_almuerzo: "Almuerzo", fin_almuerzo: "Retorno", salida: "Cierre" };

function punchIconFor(type: string) {
  switch (type) {
    case "entrada": return LogIn;
    case "inicio_almuerzo": return Utensils;
    case "fin_almuerzo": return UtensilsCrossed;
    case "salida": return LogOut;
    default: return Clock;
  }
}

function punchIconClassName(type: string) {
  switch (type) {
    case "entrada": return "bg-apex";
    case "inicio_almuerzo": return "bg-amber-500";
    case "fin_almuerzo": return "bg-amber-600";
    case "salida": return "bg-neutral-500";
    default: return "bg-apex";
  }
}

function minutesFromTime(value?: string | null) {
  if (!value) return null;
  const match = String(value).match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function punchPunctuality(event: TimelineEvent, route: RouteMonitor) {
  if (event.kind !== "marca") return null;
  const minutes = minutesFromTime(event.time);
  const tolerance = Math.max(0, Number(route.tolerance_minutes ?? 15));
  if (event.type === "entrada") {
    const expected = minutesFromTime(route.start_time);
    if (minutes == null || expected == null) return null;
    const diff = minutes - expected;
    if (diff <= 0) return { label: diff === 0 ? "En punto" : `Anticipado ${Math.abs(diff)} min`, tone: "success" as const, icon: CheckCircle2 };
    if (diff <= tolerance) return { label: `Dentro de tolerancia (+${diff} min)`, tone: "info" as const, icon: Clock };
    return { label: `Tarde ${diff} min`, tone: "warning" as const, icon: AlertTriangle };
  }
  if (event.type === "salida") {
    const expected = minutesFromTime(route.end_time);
    if (minutes == null || expected == null) return null;
    const diff = expected - minutes;
    if (diff <= 0) return { label: "Cierre a tiempo", tone: "success" as const, icon: CheckCircle2 };
    if (diff <= tolerance) return { label: `Cierre anticipado ${diff} min`, tone: "info" as const, icon: Clock };
    return { label: `Salida temprana ${diff} min`, tone: "warning" as const, icon: AlertTriangle };
  }
  return null;
}

function personMonitorMarks(route: RouteMonitor, person: OperatorPoint) {
  const normalized = (value?: string | null) => String(value || "").trim().toLowerCase();
  const names = new Set([normalized(person.user_name), normalized(person.name)].filter(Boolean));
  const marks = (route.marks_by_user || []).filter((entry) => names.has(normalized(entry.user_name))).flatMap((entry) => entry.marks);
  const byType = new Map<string, MonitorMark>();
  for (const mark of marks) if (!byType.has(mark.type)) byType.set(mark.type, mark);
  return byType;
}

function personStatusBadge(person: OperatorPoint) {
  if (person.online) return { label: "En vivo", tone: "success" as const };
  if (person.status === "Ultima marca") return { label: "Ultima marca", tone: "info" as const };
  if (person.status === "Sin GPS") return { label: "Sin GPS", tone: "neutral" as const };
  return { label: "Sin senal", tone: "neutral" as const };
}

function safeEvidenceUrl(value?: string | null) {
  const trimmed = String(value || "").trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : "";
}

function routeLabel(route: RouteMonitor) {
  return route.vehicle_plate || route.placa || `Horario ${route.id}`;
}

function employeeValue(employee: Employee) {
  const code = String(employee.code || "").trim();
  if (code && !/^(usuario[-\s]\d+|usr-\d+)$/i.test(code)) return code;
  return employeeName(employee);
}

function routeEmployeeNames(route: TimeRoute | RouteMonitor) {
  return (route.employee_names?.length ? route.employee_names : route.employees) || [];
}

function routeEmployeeValues(route: TimeRoute | RouteMonitor) {
  return (route.employee_ids?.length ? route.employee_ids : route.employees) || [];
}

function routeMergeKeys(route: Partial<TimeRoute | RouteMonitor>) {
  return new Set([route.id, route.code, route.display_id].filter(Boolean).map((value) => String(value)));
}

function routeDerivedStatus(route: RouteMonitor | TimeRoute) {
  const rawStatus = String(route.status || "active").toLowerCase();
  if (["closed", "cerrada", "completed"].includes(rawStatus)) return "closed";
  const assignedCount = Number((route as RouteMonitor).assigned_count ?? routeEmployeeValues(route).length ?? 0);
  const closedCount = Number((route as RouteMonitor).closed_count || 0);
  if (assignedCount > 0 && closedCount >= assignedCount) return "closed";
  const punchPoints = ((route as RouteMonitor).punch_points || []) as PunchPoint[];
  if (assignedCount > 0) {
    const closedUsers = new Set(punchPoints.filter((punch) => punch.type === "salida").map((punch) => String(punch.user_name || "").trim().toLowerCase()).filter(Boolean));
    if (closedUsers.size >= assignedCount) return "closed";
  }
  return rawStatus || "active";
}

function routeEventCount(route: RouteMonitor | TimeRoute) {
  const summaryCount = Number((route as RouteMonitor).event_count);
  if (Number.isFinite(summaryCount)) return summaryCount;
  return (((route as RouteMonitor).punch_points?.length || 0) + ((route as RouteMonitor).activity_points?.length || 0));
}

function routeDisplayState(route: RouteMonitor | TimeRoute) {
  const events = routeEventCount(route);
  const status = routeDerivedStatus(route);
  if (status === "closed") return { status, label: "Cerrado", className: "bg-neutral-100 text-neutral-700" };
  if (status === "cancelled") return { status, label: "Cancelado", className: "bg-rose-50 text-rose-700" };
  if (events) return { status, label: "En seguimiento", className: "bg-emerald-50 text-emerald-700" };
  return { status, label: "Sin eventos", className: "bg-amber-50 text-amber-800" };
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
  if (!value) return localCalendarDate();
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? localCalendarDate() : localCalendarDate(date);
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
    return rows.slice(0, 50);
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
          <p className="text-sm font-semibold text-content-strong">Personas asignadas</p>
          <p className="mt-1 text-xs text-content-muted">Busca por nombre, codigo, documento, cargo o area. Ideal para listas grandes.</p>
        </div>
        <span className="rounded-md bg-surface px-2 py-1 text-xs font-semibold text-content-body">{selected.length} seleccionada(s)</span>
      </div>
      <label className="relative mt-3 block">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-content-subtle" size={16} />
        <input className="h-11 w-full rounded-md border border-line bg-surface pl-9 pr-3 text-sm text-content-body" placeholder="Buscar persona para agregar..." value={query} onChange={(event) => setQuery(event.target.value)} />
      </label>
      <div className="mt-2 flex flex-wrap gap-2">
        <button className="inline-flex h-9 items-center gap-2 rounded-md border border-line bg-surface px-3 text-xs font-semibold text-content-body hover:bg-paper" onClick={addFiltered} type="button"><UserPlus size={14} /> Agregar filtrados</button>
        {selected.length ? <button className="inline-flex h-9 items-center rounded-md border border-line bg-surface px-3 text-xs font-semibold text-content-muted hover:bg-paper" onClick={() => onChange([])} type="button">Limpiar seleccion</button> : null}
      </div>
      {selectedEmployees.length ? (
        <div className="mt-3 flex max-h-24 flex-wrap gap-2 overflow-y-auto rounded-md bg-surface p-2">
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
      <div className="mt-3 max-h-52 overflow-y-auto rounded-md border border-line bg-surface">
        {filtered.map((employee) => {
          const value = employeeValue(employee);
          const active = selectedSet.has(value);
          return (
            <button className={`grid w-full grid-cols-[22px_1fr] gap-2 border-b border-line px-3 py-2 text-left last:border-b-0 hover:bg-paper ${active ? "bg-success/10" : ""}`} key={employee.id} onClick={() => toggle(value)} type="button">
              <span className="pt-0.5 text-apex">{active ? <CheckSquare2 size={16} /> : <Square size={16} />}</span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-content-strong">{employeeName(employee)}</span>
                <span className="mt-0.5 block truncate text-xs text-content-muted">{employee.code || "Sin codigo"} - {employee.position || employee.user_type || "Sin cargo"} - {employee.department || "Sin area"}</span>
              </span>
            </button>
          );
        })}
        {!filtered.length ? <p className="p-4 text-sm text-content-muted">Sin coincidencias.</p> : null}
      </div>
    </div>
  );
}

function FieldHelp({ label, help, children }: { label: string; help: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 flex items-center gap-1 text-sm font-semibold text-content-strong">
        {label}
        <HelpCircle size={14} className="text-content-subtle" />
      </span>
      {children}
      <span className="mt-1 block text-xs leading-5 text-content-muted">{help}</span>
    </label>
  );
}

export default function RoutesPlanningPage() {
  const initialDate = localCalendarDate();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [administrativeSites, setAdministrativeSites] = useState<MasterOption[]>([]);
  const [routes, setRoutes] = useState<TimeRoute[]>([]);
  const [eventSummaries, setEventSummaries] = useState<RouteEventSummary[]>([]);
  const [operations, setOperations] = useState<OperationsMap | null>(null);
  const [monitorDate, setMonitorDate] = useState(initialDate);
  const [selectedRouteId, setSelectedRouteId] = useState("");
  const [message, setMessage] = useState("");
  const [modal, setModal] = useState<"route" | "edit" | null>(null);
  const [editingRoute, setEditingRoute] = useState<RouteMonitor | null>(null);
  const [loadingMonitor, setLoadingMonitor] = useState(false);
  const [savingRoute, setSavingRoute] = useState(false);
  const [validationIssues, setValidationIssues] = useState<string[]>([]);
  const [form, setForm] = useState({ date: initialDate, vehicle_plate: "", employees: [] as string[], start_time: "08:00", end_time: "17:00", tolerance_minutes: 15, notes: "", gps_required: true });
  const [scheduleKind, setScheduleKind] = useState<"administrative" | "operational">("administrative");
  const [administrativeSite, setAdministrativeSite] = useState("SEDE-PRINCIPAL");
  const [bulkMode, setBulkMode] = useState(false);
  const [bulk, setBulk] = useState({ start_date: initialDate, end_date: addDays(initialDate, 4), weekdays: [1, 2, 3, 4, 5] });
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [loadedEvidence, setLoadedEvidence] = useState<Record<string, MonitorEvidence[]>>({});
  const [loadingEvidence, setLoadingEvidence] = useState<Record<string, boolean>>({});
  const [evidenceErrors, setEvidenceErrors] = useState<Record<string, string>>({});
  const [loadingBatch, setLoadingBatch] = useState(false);
  const [lightbox, setLightbox] = useState<MonitorEvidence | null>(null);
  const batchLoadedRef = useRef(false);

  const loadRoutes = useCallback(async () => {
    let latest: TimeRoute[] | null = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const data = await api<TimeRoute[]>("/api/v1/hr/routes", { cache: "no-store" }).catch(() => null);
      if (Array.isArray(data)) {
        latest = data;
        if (data.length) {
          setRoutes(data);
          return;
        }
      }
      if (attempt < 2) await new Promise((resolve) => window.setTimeout(resolve, 500));
    }
    if (latest) setRoutes(latest);
  }, []);

  const loadReferenceData = useCallback(async () => {
    const [employeeData, vehicleData, masterData] = await Promise.all([
      api<Employee[]>("/api/v1/hr/employees?active=true").catch(() => []),
      api<Vehicle[]>("/api/v1/transport/vehicles").catch(() => []),
      api<UserMasterData>("/api/v1/admin/user-master-data").catch(() => ({ locations: [] }))
    ]);
    setEmployees(employeeData);
    setVehicles(vehicleData);
    const activeSites = (masterData.locations || []).filter((site) => site.active !== false).sort((a, b) => (a.sort_order || 100) - (b.sort_order || 100));
    setAdministrativeSites(activeSites);
    setAdministrativeSite((current) => activeSites.some((site) => site.code === current) ? current : activeSites[0]?.code || "");
  }, []);

  const loadMonitor = useCallback(async (targetDate = monitorDate) => {
    setLoadingMonitor(true);
    try {
      const operationsData = await api<OperationsMap>(`/api/v1/hr/operations-map?date=${encodeURIComponent(targetDate)}&minutes=30&footprint_days=30`, { cache: "no-store" });
      setOperations(operationsData);
    } catch {
      // Keep the last valid snapshot visible while the next refresh retries.
    } finally {
      setLoadingMonitor(false);
    }
  }, [monitorDate]);

  const loadEventSummaries = useCallback(async () => {
    try {
      const data = await api<RouteEventSummaryResponse>("/api/v1/hr/routes/event-summaries", { cache: "no-store" });
      setEventSummaries(data.routes || []);
    } catch {
      // Preserve the latest valid counters until the next short refresh.
    }
  }, []);

  useEffect(() => {
    void loadRoutes();
    void loadReferenceData();
    void loadEventSummaries();
  }, [loadEventSummaries, loadReferenceData, loadRoutes]);

  useEffect(() => {
    const refreshVisible = () => {
      if (document.hidden) return;
      loadRoutes();
      loadEventSummaries();
      if (selectedRouteId) loadMonitor(monitorDate);
    };
    const timer = window.setInterval(refreshVisible, 5000);
    document.addEventListener("visibilitychange", refreshVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshVisible);
    };
  }, [loadEventSummaries, loadMonitor, loadRoutes, monitorDate, selectedRouteId]);

  useEffect(() => subscribeHrMonitorRefresh((detail) => {
    if (document.hidden) return;
    loadRoutes();
    loadEventSummaries();
    if (!selectedRouteId || (detail.route_id && String(detail.route_id) !== selectedRouteId)) return;
    loadMonitor(detail.date || monitorDate);
  }), [loadEventSummaries, loadMonitor, loadRoutes, monitorDate, selectedRouteId]);

  function resetForm() {
    const today = localCalendarDate();
    setForm({ date: today, vehicle_plate: "", employees: [], start_time: "08:00", end_time: "17:00", tolerance_minutes: 15, notes: "", gps_required: true });
    setScheduleKind("administrative");
    setAdministrativeSite("SEDE-PRINCIPAL");
    setBulk({ start_date: today, end_date: addDays(today, 4), weekdays: [1, 2, 3, 4, 5] });
    setBulkMode(false);
    setEditingRoute(null);
  }

  function openRouteMonitor(route: RouteMonitor) {
    const targetDate = scheduleMonitorDate(route.date);
    setLoadedEvidence({});
    setLoadingEvidence({});
    setEvidenceErrors({});
    setLightbox(null);
    batchLoadedRef.current = false;
    setSelectedRouteId(String(route.id));
    setMonitorDate(targetDate);
    loadMonitor(targetDate);
  }

  const loadTimelineEvidence = useCallback(async (event: TimelineEvent) => {
    const summary = event.evidence?.[0];
    if (summary?.id == null || loadingEvidence[event.id]) return;
    const source = event.kind === "marca" ? "punch" : "activity";
    setLoadingEvidence((current) => ({ ...current, [event.id]: true }));
    setEvidenceErrors((current) => ({ ...current, [event.id]: "" }));
    try {
      const evidence = await api<MonitorEvidence>(`/api/v1/hr/monitor-evidence/${source}/${encodeURIComponent(String(summary.id))}`, { cache: "no-store" });
      if (!evidence.base64_data && !evidence.file_url) throw new Error("La evidencia no contiene un archivo visible.");
      setLoadedEvidence((current) => ({ ...current, [event.id]: [evidence] }));
    } catch (error) {
      setEvidenceErrors((current) => ({ ...current, [event.id]: error instanceof Error ? error.message : "No fue posible cargar la evidencia." }));
    } finally {
      setLoadingEvidence((current) => ({ ...current, [event.id]: false }));
    }
  }, [loadingEvidence]);

  const loadRouteEvidenceBatch = useCallback(async (routeId: number | string) => {
    setLoadingBatch(true);
    try {
      const batch = await api<MonitorEvidenceBatch>(`/api/v1/hr/monitor-evidence/route/${encodeURIComponent(String(routeId))}`, { cache: "no-store" });
      const merged: Record<string, MonitorEvidence[]> = {};
      for (const [id, payload] of Object.entries(batch.punch_evidence || {})) merged[`punch-${id}`] = [payload];
      for (const [id, items] of Object.entries(batch.activity_evidence || {})) merged[`activity-${id}`] = items;
      setLoadedEvidence((current) => ({ ...current, ...merged }));
    } catch {
      // La carga individual por evento sigue disponible como respaldo.
    } finally {
      setLoadingBatch(false);
    }
  }, []);

  async function openCreateModal(route?: RouteMonitor) {
    loadReferenceData();
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
        employees: routeEmployeeValues(route),
        start_time: route.start_time || "08:00",
        end_time: route.end_time || "17:00",
        tolerance_minutes: route.tolerance_minutes ?? 15,
        notes: notesWithoutAdministrativeSite(route.notes || ""),
        gps_required: scheduleGpsRequired(route)
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
      employees: routeEmployeeValues(route),
      start_time: route.start_time || "08:00",
      end_time: route.end_time || "17:00",
      tolerance_minutes: route.tolerance_minutes ?? 15,
      notes: notesWithoutAdministrativeSite(route.notes || ""),
      gps_required: scheduleGpsRequired(route)
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
      gps_required: form.gps_required,
      tracking_mode: scheduleTrackingMode(form.gps_required),
      status
    };
  }

  async function saveRoute() {
    if (savingRoute) return;
    const issues: string[] = [];
    if (bulkMode && modal !== "edit") {
      if (!bulk.start_date) issues.push("Selecciona la fecha inicial del rango.");
      if (!bulk.end_date) issues.push("Selecciona la fecha final del rango.");
      if (bulk.start_date && bulk.end_date && bulk.end_date < bulk.start_date) issues.push("La fecha final no puede ser anterior a la fecha inicial.");
      if (!bulk.weekdays.length) issues.push("Selecciona al menos un dia de la semana.");
      if (bulk.start_date && bulk.end_date && bulk.weekdays.length && bulkCount === 0) issues.push("El rango no contiene ninguno de los dias seleccionados.");
    } else if (!form.date) issues.push("Selecciona la fecha del horario.");
    if (scheduleKind === "administrative" && !administrativeSite) issues.push("Selecciona una sede administrativa.");
    if (!form.start_time) issues.push("Diligencia la hora de inicio.");
    if (!form.end_time) issues.push("Diligencia la hora de fin.");
    if (form.start_time && form.end_time && form.end_time === form.start_time) issues.push("La hora de inicio y la hora de fin no pueden ser iguales.");
    if (!Number.isFinite(form.tolerance_minutes) || form.tolerance_minutes < 0) issues.push("La tolerancia debe ser un numero igual o mayor que cero.");
    if (!form.employees.length) issues.push("Selecciona al menos una persona para el horario.");
    if (issues.length) {
      setValidationIssues(issues);
      return;
    }
    setSavingRoute(true);
    const savedMonitorDate = bulkMode && modal !== "edit" ? bulk.start_date : form.date;
    try {
      if (modal === "edit" && editingRoute) {
        await api<TimeRoute>(`/api/v1/hr/routes/${editingRoute.id}`, { method: "PATCH", body: JSON.stringify(routePayload(editingRoute.status || "active")) });
        setMessage("Horario actualizado correctamente.");
      } else if (bulkMode) {
        const result = await api<{ created: number }>("/api/v1/hr/routes/bulk", { method: "POST", body: JSON.stringify({ ...routePayload("active"), start_date: bulk.start_date, end_date: bulk.end_date, weekdays: bulk.weekdays }) });
        setMessage(`${result.created || 0} horario(s) asignado(s) correctamente.`);
      } else {
        await api<TimeRoute>("/api/v1/hr/routes", { method: "POST", body: JSON.stringify(routePayload("active")) });
        setMessage("Horario asignado correctamente.");
      }
      setMonitorDate(savedMonitorDate);
      resetForm();
      setModal(null);
      await Promise.all([loadRoutes(), loadReferenceData(), loadEventSummaries(), loadMonitor(savedMonitorDate)]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No fue posible guardar el horario.");
    } finally {
      setSavingRoute(false);
    }
  }

  const totalAssigned = useMemo(() => routes.reduce((sum, route) => sum + (routeEmployeeValues(route).length || 0), 0), [routes]);
  const selectedEmployeeCount = form.employees.length;
  const bulkCount = bulkMode ? rangePreview(bulk.start_date, bulk.end_date, bulk.weekdays) : 1;
  const monitorRoutes: RouteMonitor[] = useMemo(() => {
    if (!routes.length) return operations?.routes || [];
    return routes.map((route) => {
      const summary = eventSummaries.find((item) => String(item.route_id) === String(route.id));
      const routeKeys = routeMergeKeys(route);
      const operation = (operations?.routes || []).find((item) => {
        const operationKeys = routeMergeKeys(item);
        return Array.from(routeKeys).some((key) => operationKeys.has(key));
      });
      return { ...route, ...summary, ...operation, route_id: summary?.route_id || route.id, punch_count: summary?.punch_count || 0, activity_count: summary?.activity_count || 0, evidence_count: summary?.evidence_count || 0, closed_count: summary?.closed_count || 0, event_count: summary?.event_count || 0, employee_ids: operation?.employee_ids || route.employee_ids, employee_names: operation?.employee_names || route.employee_names, punch_points: operation?.punch_points || [], activity_points: operation?.activity_points || [] };
    });
  }, [eventSummaries, operations, routes]);
  const activeRoutes = useMemo(() => monitorRoutes.filter((route) => routeDerivedStatus(route) !== "closed" && routeDerivedStatus(route) !== "cancelled"), [monitorRoutes]);
  const selectedRoute = useMemo(() => monitorRoutes.find((route) => String(route.id) === selectedRouteId) || null, [monitorRoutes, selectedRouteId]);
  const selectedPeople = useMemo(() => selectedRoute && operations ? operations.people.filter((person) => String(person.route_id) === String(selectedRoute.id)) : [], [operations, selectedRoute]);
  const selectedTimeline = useMemo(() => {
    if (!selectedRoute) return [];
    return [
      ...(selectedRoute.punch_points || []).map((event) => ({ kind: "marca" as const, id: `punch-${event.id}`, user_name: event.user_name, type: event.type, title: punchNames[event.type] || event.type, at: event.punched_at, time: event.time || event.punched_at, latitude: event.latitude, longitude: event.longitude, accuracy_meters: event.accuracy_meters, observation: event.extra_minutes ? `${event.extra_minutes} minuto(s) extra · ${event.extra_reason || "extension"}${event.extra_detail ? ` · ${event.extra_detail}` : ""}` : "", evidence: event.extra_evidence?.base64_data || event.extra_evidence?.file_url || event.extra_evidence?.has_base64_data ? [event.extra_evidence] : [] })),
      ...(selectedRoute.activity_points || []).map((event) => ({ kind: "actividad" as const, id: `activity-${event.id}`, user_name: event.user_name, type: event.type, title: event.type, at: event.occurred_at, time: event.time || event.occurred_at, latitude: event.latitude, longitude: event.longitude, accuracy_meters: event.accuracy_meters, observation: event.observation || "", evidence: event.evidence || [] }))
    ].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  }, [selectedRoute]);

  useEffect(() => {
    if (!selectedRoute || batchLoadedRef.current) return;
    batchLoadedRef.current = true;
    void loadRouteEvidenceBatch(selectedRoute.id);
  }, [loadRouteEvidenceBatch, selectedRoute]);

  useEffect(() => {
    if (loadingBatch || !selectedRoute) return;
    for (const event of selectedTimeline) {
      const summary = event.evidence?.[0];
      if (summary?.available && summary.id != null && !loadedEvidence[event.id] && !loadingEvidence[event.id] && !evidenceErrors[event.id]) {
        void loadTimelineEvidence(event);
      }
    }
  }, [evidenceErrors, loadTimelineEvidence, loadedEvidence, loadingBatch, loadingEvidence, selectedRoute, selectedTimeline]);
  const routeCoverage = monitorRoutes.length ? Math.round((monitorRoutes.filter((route) => routeEventCount(route) > 0).length / monitorRoutes.length) * 100) : 0;
  const administrativeRoutes = monitorRoutes.filter((route) => !route.vehicle_plate && !route.placa).length;
  const operationalRoutes = monitorRoutes.length - administrativeRoutes;
  const routesWithoutPeople = monitorRoutes.filter((route) => !(route.assigned_count ?? routeEmployeeValues(route).length ?? 0)).length;
  const filteredRoutes = useMemo(() => {
    const term = query.trim().toLowerCase();
    return monitorRoutes
      .filter((route) => !term || [routeLabel(route), routeDerivedStatus(route), routeDisplayState(route).label, administrativeSiteFromNotes(route.notes || ""), ...routeEmployeeNames(route)].join(" ").toLowerCase().includes(term))
      .filter((route) => !kindFilter || (kindFilter === "operational" ? Boolean(route.vehicle_plate || route.placa) : !route.vehicle_plate && !route.placa))
      .filter((route) => !statusFilter || routeDerivedStatus(route) === statusFilter)
      .filter((route) => !dateFilter || inputDate(route.date) === dateFilter)
      .sort((a, b) => inputDate(b.date).localeCompare(inputDate(a.date)) || String(a.start_time || "").localeCompare(String(b.start_time || "")));
  }, [dateFilter, kindFilter, monitorRoutes, query, statusFilter]);
  const activeFilters = [query.trim(), kindFilter, statusFilter, dateFilter].filter(Boolean).length;

  function clearFilters() {
    setQuery("");
    setKindFilter("");
    setStatusFilter("");
    setDateFilter("");
  }

  return (
    <div className="space-y-5 pb-20 md:pb-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link className="mb-2 inline-flex items-center gap-2 text-sm font-medium text-neutral-600 hover:text-apex" href="/dashboard/talento-humano"><ArrowLeft size={16} /> Talento Humano</Link>
          <p className="text-sm font-medium text-apex">Administracion de jornadas</p>
          <h1 className="mt-1 text-3xl font-semibold">Asignar horarios</h1>
          <p className="mt-2 max-w-3xl text-sm text-neutral-600">Consulta, compara y asigna jornadas administrativas u operativas sin mezclar la planeacion con el seguimiento en campo.</p>
        </div>
        <button className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-md bg-apex px-4 text-sm font-semibold text-white md:h-10 md:w-auto" onClick={() => openCreateModal()} type="button">
          <Plus size={16} /> Nuevo horario
        </button>
      </header>

      {message ? <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-900">{message}</div> : null}

      <section className="overflow-hidden rounded-md border border-line bg-white">
        <div className="border-b border-line p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2"><CalendarDays size={18} className="text-apex" /><h2 className="text-lg font-semibold">Consulta de horarios</h2></div>
              <p className="mt-1 text-sm text-neutral-600">Compara fecha, jornada, personas y estado antes de abrir o editar un horario.</p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2 text-xs font-semibold text-neutral-600">
              <span className="rounded-md border border-line px-3 py-1.5">{filteredRoutes.length} de {monitorRoutes.length}</span>
              <span className="rounded-md bg-emerald-50 px-3 py-1.5 text-emerald-700">{activeRoutes.length} activos</span>
              <span className="rounded-md bg-paper px-3 py-1.5">{totalAssigned} personas</span>
              <span className="rounded-md bg-paper px-3 py-1.5">{administrativeRoutes}/{operationalRoutes} adm/op</span>
              <span className={`rounded-md px-3 py-1.5 ${routesWithoutPeople ? "bg-amber-50 text-amber-800" : "bg-paper text-neutral-600"}`}>{routeCoverage}% seguimiento</span>
              <button className="inline-flex h-10 items-center gap-2 rounded-md border border-line px-3 text-sm font-semibold hover:bg-paper" onClick={() => { loadRoutes(); loadEventSummaries(); if (selectedRouteId) loadMonitor(); }} type="button"><RefreshCw className={loadingMonitor ? "animate-spin" : ""} size={16} /> Actualizar</button>
            </div>
          </div>
          <div className="mt-4 grid gap-2 lg:grid-cols-[minmax(240px,1fr)_180px_180px_170px]">
            <label className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" size={16} /><input className="h-10 w-full rounded-md border border-line pl-9 pr-3 text-sm" placeholder="Buscar persona, sede, placa o estado" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
            <select className="h-10 rounded-md border border-line bg-white px-3 text-sm" value={kindFilter} onChange={(event) => setKindFilter(event.target.value)}><option value="">Todos los tipos</option><option value="administrative">Administrativos</option><option value="operational">Operativos</option></select>
            <select className="h-10 rounded-md border border-line bg-white px-3 text-sm" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">Todos los estados</option><option value="active">Activos</option><option value="closed">Cerrados</option><option value="cancelled">Cancelados</option></select>
            <input aria-label="Filtrar por fecha" className="h-10 rounded-md border border-line bg-white px-3 text-sm" type="date" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} />
          </div>
          {activeFilters ? <button className="mt-3 inline-flex h-9 items-center gap-2 rounded-md border border-line px-3 text-sm font-semibold text-neutral-700 hover:bg-paper" onClick={clearFilters} type="button"><RotateCcw size={15} /> Limpiar {activeFilters} filtro(s)</button> : null}
        </div>

        <div className="grid gap-3 p-3 md:hidden">
          {filteredRoutes.map((route) => {
            const events = routeEventCount(route);
            const displayState = routeDisplayState(route);
            return (
              <article className="rounded-md border border-line p-4 text-left transition hover:border-apex hover:bg-paper" key={String(route.id)}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold">{route.vehicle_plate || route.placa || administrativeSiteFromNotes(route.notes || "") || "Jornada administrativa"}</p>
                    <p className="mt-1 text-xs text-neutral-500">{inputDate(route.date)} · {formatHour(route.start_time)} - {formatHour(route.end_time)}</p>
                  </div>
                  <span className={`rounded-md px-2 py-1 text-xs font-semibold ${displayState.className}`}>{displayState.label}</span>
                </div>
                  <p className="mt-3 max-h-10 overflow-hidden text-sm text-neutral-600">{routeEmployeeNames(route).join(", ") || "Sin personas asignadas"}</p>
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-neutral-600">
                  <span className="rounded-md bg-white px-2 py-1">{route.start_time || "--"} - {route.end_time || "--"}</span>
                  <span className="rounded-md bg-white px-2 py-1">{route.assigned_count ?? routeEmployeeValues(route).length ?? 0} persona(s)</span>
                  <span className="rounded-md bg-white px-2 py-1">{events} evento(s)</span>
                  <span className="rounded-md bg-white px-2 py-1">{scheduleGpsRequired(route) ? "GPS" : "Sin GPS"}</span>
                  <span className="rounded-md bg-white px-2 py-1">{route.evidence_count || 0} evidencia(s)</span>
                </div>
                <div className="mt-4 grid gap-2 sm:grid-cols-3">
                  <button className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-semibold hover:bg-paper" onClick={() => openRouteMonitor(route)} type="button"><Navigation size={15} /> Abrir</button>
                  <button className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-semibold hover:bg-paper" onClick={() => openEditModal(route)} type="button"><Edit3 size={15} /> Editar</button>
                  <button className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-apex px-3 text-sm font-semibold text-white" onClick={() => openCreateModal(route)} type="button"><Copy size={15} /> Clonar</button>
                </div>
              </article>
            );
          })}
        </div>

        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[1160px] border-collapse text-left text-sm">
            <thead className="bg-paper text-xs uppercase tracking-wide text-neutral-500"><tr><th className="px-4 py-3">ID horario</th><th className="px-4 py-3">Fecha y jornada</th><th className="px-4 py-3">Tipo y ubicacion</th><th className="px-4 py-3">Personas</th><th className="px-4 py-3">Estado</th><th className="px-4 py-3 text-right">Acciones</th></tr></thead>
            <tbody className="divide-y divide-line">
              {filteredRoutes.map((route) => {
                const events = routeEventCount(route);
                const operational = Boolean(route.vehicle_plate || route.placa);
                const displayState = routeDisplayState(route);
                return <tr className="hover:bg-paper/70" key={String(route.id)}>
                  <td className="px-4 py-3"><p className="font-semibold text-apex">{route.display_id || route.code || route.id}</p><p className="mt-1 text-xs text-neutral-500">Horario</p></td>
                  <td className="px-4 py-3"><p className="font-semibold">{inputDate(route.date)}</p><p className="mt-1 text-xs text-neutral-500">{formatHour(route.start_time)} - {formatHour(route.end_time)} · {route.tolerance_minutes ?? 15} min tolerancia · {scheduleGpsRequired(route) ? "GPS" : "sin GPS"}</p></td>
                  <td className="px-4 py-3"><p className="flex items-center gap-2 font-semibold">{operational ? <Truck className="text-apex" size={15} /> : <Building2 className="text-apex" size={15} />}{operational ? "Operativa" : "Administrativa"}</p><p className="mt-1 text-xs text-neutral-500">{operational ? routeLabel(route) : administrativeSiteFromNotes(route.notes || "") || "Sin sede definida"}</p></td>
                  <td className="px-4 py-3"><p className="font-semibold">{route.assigned_count ?? routeEmployeeValues(route).length ?? 0} persona(s)</p><p className="mt-1 max-w-72 truncate text-xs text-neutral-500">{routeEmployeeNames(route).join(", ") || "Sin personas asignadas"}</p></td>
                  <td className="px-4 py-3"><span className={`rounded-md px-2 py-1 text-xs font-semibold ${displayState.className}`}>{displayState.label}</span><p className="mt-1 text-xs capitalize text-neutral-500">{displayState.status} · {events} evento(s)</p></td>
                  <td className="px-4 py-3"><div className="flex justify-end gap-2"><button className="h-9 rounded-md border border-line px-3 text-xs font-semibold hover:bg-paper" onClick={() => openRouteMonitor(route)} type="button">Abrir</button><button className="h-9 rounded-md border border-line px-3 text-xs font-semibold hover:bg-paper" onClick={() => openEditModal(route)} type="button">Editar</button><button className="h-9 rounded-md border border-apex px-3 text-xs font-semibold text-apex hover:bg-paper" onClick={() => openCreateModal(route)} type="button">Clonar</button></div></td>
                </tr>;
              })}
            </tbody>
          </table>
        </div>
        {!filteredRoutes.length ? <div className="p-10 text-center"><Filter className="mx-auto text-neutral-300" size={28} /><p className="mt-3 text-sm font-semibold">No hay horarios con estos filtros</p><p className="mt-1 text-sm text-neutral-500">Limpia los filtros o crea una nueva asignacion.</p></div> : null}
      </section>

      {modal ? (
        <ModalFrame title={modal === "edit" ? "Editar asignacion de horario" : "Nueva asignacion de horario"} onClose={() => { if (validationIssues.length) { setValidationIssues([]); return; } setModal(null); resetForm(); }} maxWidth="md:max-w-3xl" footer={<button className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-apex text-sm font-semibold text-white disabled:bg-neutral-300" disabled={savingRoute} onClick={saveRoute} type="button"><Save size={16} /> {savingRoute ? "Guardando..." : modal === "edit" ? "Guardar cambios" : bulkMode ? `Crear ${bulkCount} horario(s)` : "Asignar horario"}</button>}>
          <div className="rounded-md border border-apex/20 bg-apex/5 p-3 md:p-4">
            <div className="flex items-start gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-surface text-apex">{scheduleKind === "administrative" ? <Building2 size={17} /> : <Truck size={17} />}</span><div><p className="text-xs font-semibold uppercase tracking-wide text-apex">{modal === "edit" ? "Actualizar jornada" : bulkMode ? `Crear ${bulkCount} horarios` : "Crear un horario"}</p><h2 className="mt-1 text-base font-semibold text-content-strong">{scheduleKind === "administrative" ? "Jornada administrativa o de sede fija" : "Jornada operativa con recurso movil"}</h2><p className="mt-1 text-sm text-content-body">Define cuando y donde aplica, luego selecciona las personas de esta jornada.</p></div></div>
          </div>
          {modal !== "edit" ? (
            <div className="mt-3 grid gap-2 rounded-md border border-line bg-surface p-1.5 sm:grid-cols-2">
              <button className={`inline-flex h-10 items-center justify-center gap-2 rounded-md text-sm font-semibold ${!bulkMode ? "bg-apex text-white" : "bg-paper text-content-body"}`} onClick={() => setBulkMode(false)} type="button"><CalendarDays size={14} /> Un solo dia</button>
              <button className={`inline-flex h-10 items-center justify-center gap-2 rounded-md text-sm font-semibold ${bulkMode ? "bg-apex text-white" : "bg-paper text-content-body"}`} onClick={() => setBulkMode(true)} type="button"><Copy size={14} /> Clonar por rango</button>
            </div>
          ) : null}
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div className="md:col-span-2">
              <p className="mb-1.5 text-sm font-semibold text-content-strong">Tipo de asignacion</p>
              <div className="grid gap-2 rounded-md border border-line bg-surface p-1.5 sm:grid-cols-2">
                <button className={`h-10 rounded-md text-sm font-semibold ${scheduleKind === "administrative" ? "bg-apex text-white" : "bg-paper text-content-body"}`} onClick={() => { setScheduleKind("administrative"); setForm((prev) => ({ ...prev, vehicle_plate: "" })); }} type="button">
                  Administrativo / sede fija
                </button>
                <button className={`h-10 rounded-md text-sm font-semibold ${scheduleKind === "operational" ? "bg-apex text-white" : "bg-paper text-content-body"}`} onClick={() => setScheduleKind("operational")} type="button">
                  Operativo / recurso movil
                </button>
              </div>
            </div>
            <div className="md:col-span-2">
              <p className="mb-1.5 text-sm font-semibold text-content-strong">Control de marcacion</p>
              <div className="grid gap-2 rounded-md border border-line bg-surface p-1.5 sm:grid-cols-2">
                <button className={`rounded-md px-3 py-2 text-left text-sm font-semibold ${form.gps_required ? "bg-apex text-white" : "bg-paper text-content-body"}`} onClick={() => setForm((prev) => ({ ...prev, gps_required: true }))} type="button">
                  Seguimiento GPS
                  <span className="mt-1 block text-xs font-medium opacity-80">Marcaciones, presencia y actividades con ubicacion.</span>
                </button>
                <button className={`rounded-md px-3 py-2 text-left text-sm font-semibold ${!form.gps_required ? "bg-apex text-white" : "bg-paper text-content-body"}`} onClick={() => setForm((prev) => ({ ...prev, gps_required: false }))} type="button">
                  Solo marcaciones
                  <span className="mt-1 block text-xs font-medium opacity-80">Control horario sin solicitar ubicacion al usuario.</span>
                </button>
              </div>
            </div>
            {bulkMode && modal !== "edit" ? (
              <>
                <FieldHelp label="Fecha inicial" help="Primer dia desde el que quieres clonar este horario.">
                  <input className="h-10 w-full rounded-md border border-line px-3 text-sm" type="date" value={bulk.start_date} onChange={(event) => setBulk((prev) => ({ ...prev, start_date: event.target.value }))} />
                </FieldHelp>
                <FieldHelp label="Fecha final" help="Ultimo dia incluido en la creacion masiva.">
                  <input className="h-10 w-full rounded-md border border-line px-3 text-sm" type="date" value={bulk.end_date} onChange={(event) => setBulk((prev) => ({ ...prev, end_date: event.target.value }))} />
                </FieldHelp>
                <div className="md:col-span-2">
                  <p className="mb-1.5 text-sm font-semibold text-content-strong">Dias de la semana</p>
                  <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-7">
                    {weekdayOptions.map((day) => {
                      const active = bulk.weekdays.includes(day.value);
                      return (
                        <button className={`h-9 rounded-md border text-sm font-semibold ${active ? "border-apex bg-apex text-white" : "border-line bg-paper text-content-body hover:bg-surface"}`} key={day.value} onClick={() => setBulk((prev) => ({ ...prev, weekdays: active ? prev.weekdays.filter((item) => item !== day.value) : [...prev.weekdays, day.value] }))} type="button">
                          {day.label}
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-1.5 text-xs text-content-muted">Se crearan {bulkCount} bloque(s) de horario para el grupo seleccionado.</p>
                </div>
              </>
            ) : (
              <FieldHelp label="Fecha del horario" help="Dia en el que aplica la asignacion.">
                <input className="h-10 w-full rounded-md border border-line px-3 text-sm" type="date" value={form.date} onChange={(event) => setForm((prev) => ({ ...prev, date: event.target.value }))} />
              </FieldHelp>
            )}
            {scheduleKind === "administrative" ? (
              <FieldHelp label="Sede administrativa fija" help="Sede, oficina o punto fijo donde aplica la jornada.">
                <select className="h-10 w-full rounded-md border border-line bg-surface px-3 text-sm text-content-body" value={administrativeSite} onChange={(event) => setAdministrativeSite(event.target.value)}>
                  <option value="">Seleccionar sede</option>
                  {administrativeSites.map((site) => <option key={site.code} value={site.code}>{site.code} - {site.name}</option>)}
                </select>
              </FieldHelp>
            ) : (
              <FieldHelp label="Recurso o vehiculo" help="Opcional para operacion movil. Selecciona placa cuando el horario dependa de transporte o ruta fisica.">
                <select className="h-10 w-full rounded-md border border-line bg-surface px-3 text-sm text-content-body" value={form.vehicle_plate} onChange={(event) => setForm((prev) => ({ ...prev, vehicle_plate: event.target.value }))}>
                  <option value="">Sin vehiculo asignado</option>
                  {vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.plate}>{vehicle.plate} - {vehicle.type || vehicle.model || "Movil"}</option>)}
                </select>
              </FieldHelp>
            )}
            <FieldHelp label="Hora de inicio" help="La primera marcacion se compara contra esta hora para control de llegada.">
              <input className="h-10 w-full rounded-md border border-line px-3 text-sm" type="time" value={form.start_time} onChange={(event) => setForm((prev) => ({ ...prev, start_time: event.target.value }))} />
            </FieldHelp>
            <FieldHelp label="Hora de fin" help="El cierre despues de esta hora puede generar extension o novedad segun tolerancia.">
              <input className="h-10 w-full rounded-md border border-line px-3 text-sm" type="time" value={form.end_time} onChange={(event) => setForm((prev) => ({ ...prev, end_time: event.target.value }))} />
            </FieldHelp>
            <FieldHelp label="Tolerancia en minutos" help="Margen permitido antes de marcar atrasos o extensiones operativas.">
              <input className="h-10 w-full rounded-md border border-line px-3 text-sm" min={0} type="number" value={form.tolerance_minutes} onChange={(event) => setForm((prev) => ({ ...prev, tolerance_minutes: Number(event.target.value) }))} />
            </FieldHelp>
            <FieldHelp label="Notas internas" help="Indica sede, turno, frente de trabajo, instruccion especial o responsable del horario.">
              <textarea className="min-h-[72px] w-full rounded-md border border-line px-3 py-2 text-sm" placeholder="Ej: Turno bodega norte, prioridad recepcion, supervisor asignado..." value={form.notes} onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))} />
            </FieldHelp>
            <div className="rounded-md border border-line bg-paper p-2.5">
              <p className="flex items-center gap-2 text-xs font-semibold text-content-strong"><Clock size={14} className="text-apex" /> Resumen</p>
              <div className="mt-2 space-y-1 text-sm text-content-body">
                <p><span className="font-semibold text-content-strong">{form.start_time || "--"} - {form.end_time || "--"}</span> con {form.tolerance_minutes || 0} min de tolerancia.</p>
                <p>{selectedEmployeeCount} persona(s) seleccionada(s).</p>
                <p>{bulkMode && modal !== "edit" ? `${bulkCount} bloque(s) por crear.` : "1 bloque de horario."}</p>
                <p>{scheduleKind === "administrative" ? `Sede fija: ${administrativeSite || "sin definir"}.` : form.vehicle_plate ? `Recurso asignado: ${form.vehicle_plate}.` : "Operacion sin vehiculo fijo."}</p>
                <p>{form.gps_required ? "Seguimiento GPS activo." : "Solo marcaciones, sin GPS obligatorio."}</p>
              </div>
            </div>
          </div>
          <div className="mt-3">
            <PeoplePicker employees={employees} selected={form.employees} onChange={(next) => setForm((prev) => ({ ...prev, employees: next }))} />
          </div>
        </ModalFrame>
      ) : null}

      {validationIssues.length ? (
        <ModalFrame title="Faltan datos para guardar" onClose={() => setValidationIssues([])} maxWidth="md:max-w-md" footer={<button className="h-10 w-full rounded-md bg-apex text-sm font-semibold text-white" onClick={() => setValidationIssues([])} type="button">Entendido</button>}>
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-warning/10 text-warning"><AlertTriangle size={20} /></span>
            <p className="text-sm text-content-body">Completa puntualmente lo siguiente:</p>
          </div>
          <ul className="mt-4 space-y-2 rounded-md bg-paper p-3 text-sm text-content-body">
            {validationIssues.map((issue) => <li className="flex gap-2" key={issue}><span className="font-bold text-warning">•</span><span>{issue}</span></li>)}
          </ul>
        </ModalFrame>
      ) : null}

      {selectedRoute ? (
        <div className="fixed inset-0 z-50 bg-neutral-950/40" onClick={() => setSelectedRouteId("")}>
          <aside className="ml-auto flex h-full w-full max-w-5xl flex-col overflow-hidden bg-paper shadow-xl" role="dialog" aria-modal="true" aria-label="Monitor administrativo" onClick={(event) => event.stopPropagation()}>
            <header className="border-b border-line p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-apex">Monitor administrativo</p>
                    {(() => { const displayState = routeDisplayState(selectedRoute); return <Badge tone={displayState.status === "closed" ? "neutral" : displayState.status === "cancelled" ? "error" : "success"}>{displayState.label}</Badge>; })()}
                  </div>
                  <h2 className="mt-1 text-2xl font-semibold text-content-strong">{routeLabel(selectedRoute)}</h2>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-content-muted">
                    <span className="inline-flex items-center gap-1.5"><Clock size={14} /> {formatHour(selectedRoute.start_time)} - {formatHour(selectedRoute.end_time)}</span>
                    <span className="inline-flex items-center gap-1.5"><Timer size={14} /> Tolerancia {selectedRoute.tolerance_minutes ?? 15} min</span>
                    <span>{selectedRoute.assigned_count ?? routeEmployeeValues(selectedRoute).length ?? 0} persona(s)</span>
                    <span>{scheduleGpsRequired(selectedRoute) ? "Seguimiento GPS" : "Solo marcaciones"}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button className="inline-flex h-10 items-center gap-2 rounded-md border border-line px-3 text-sm font-semibold hover:bg-paper" onClick={() => { loadRoutes(); loadEventSummaries(); loadMonitor(); }} type="button"><RefreshCw className={loadingMonitor ? "animate-spin" : ""} size={16} /> Actualizar</button>
                  <button className="inline-flex h-10 items-center gap-2 rounded-md border border-line px-3 text-sm font-semibold hover:bg-paper" onClick={() => openEditModal(selectedRoute)} type="button"><Edit3 size={16} /> Editar</button>
                  <Link className="inline-flex h-10 items-center gap-2 rounded-md border border-line px-3 text-sm font-semibold hover:bg-paper" href="/dashboard/talento-humano/mapa"><Navigation size={16} /> Mapa</Link>
                  <button className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-line hover:bg-paper" onClick={() => setSelectedRouteId("")} type="button" aria-label="Cerrar"><X size={18} /></button>
                </div>
              </div>
            </header>
            <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[340px_1fr]">
              <section className="border-b border-line p-4 lg:border-b-0 lg:border-r">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-content-muted">Equipo asignado</h3>
                  <span className="text-xs font-semibold text-content-muted">{selectedPeople.filter((person) => person.online).length}/{selectedPeople.length} en vivo</span>
                </div>
                <div className="mt-3 space-y-2">
                  {(selectedPeople.length ? selectedPeople : routeEmployeeNames(selectedRoute).map((name) => ({ key: String(name), name, user_name: String(name), route_id: selectedRoute.id } as OperatorPoint))).map((person) => {
                    const marks = personMonitorMarks(selectedRoute, person);
                    const status = personStatusBadge(person);
                    const initials = String(person.name || person.user_name).split(/\s+/).filter(Boolean).map((word) => word[0]).slice(0, 2).join("").toUpperCase();
                    return (
                      <article className="rounded-md border border-line bg-surface p-3" key={person.key}>
                        <div className="flex items-start gap-3">
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-apex/10 text-sm font-bold text-apex">{initials}</span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <p className="truncate font-semibold text-content-strong">{person.name || person.user_name}</p>
                              <Badge tone={status.tone}>{status.label}</Badge>
                            </div>
                            <p className="mt-0.5 text-xs text-content-muted">
                              {person.last_punch_type && person.last_punch_type !== "sin_marcar" ? `Ultima marca: ${punchShortNames[person.last_punch_type] || person.last_punch_type}${person.last_punch_time ? ` · ${person.last_punch_time}` : ""}` : "Sin marca registrada"}
                            </p>
                            <div className="mt-2 flex flex-wrap gap-1">
                              {punchSequence.map((type) => {
                                const mark = marks.get(type);
                                return (
                                  <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${mark ? "bg-success/10 text-content-strong" : "bg-surface-muted text-content-subtle"}`} key={type} title={mark ? `Marcada a las ${formatHour(mark.time)}` : "Pendiente"}>
                                    {mark ? <CheckCircle2 size={10} /> : null}{punchShortNames[type]}
                                  </span>
                                );
                              })}
                            </div>
                            {person.last_activity_type ? <p className="mt-2 text-xs text-content-muted">{person.last_activity_type} - {person.last_activity_time || "--"}</p> : null}
                            {person.latitude != null && person.longitude != null ? (
                              <p className="mt-1 text-xs text-content-muted"><MapPin className="inline" size={11} /> {Number(person.latitude).toFixed(5)}, {Number(person.longitude).toFixed(5)}{person.age_seconds != null ? ` · hace ${Math.max(0, Math.round(Number(person.age_seconds) / 60))} min` : ""}</p>
                            ) : null}
                          </div>
                        </div>
                      </article>
                    );
                  })}
                  {!selectedPeople.length ? <p className="rounded-md bg-surface-muted p-3 text-sm text-content-muted">Sin personas asignadas a esta jornada.</p> : null}
                </div>
              </section>
              <section className="p-4">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-base font-semibold text-content-strong">Trazabilidad cronologica</h3>
                    <p className="mt-1 text-sm text-content-muted">Marcaciones y actividades con hora, GPS, tolerancia y evidencia fotografica.</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="neutral">{selectedTimeline.filter((event) => event.kind === "marca").length} marcaciones</Badge>
                    <Badge tone="info">{selectedTimeline.filter((event) => event.kind === "actividad").length} actividades</Badge>
                    <Badge tone="success">{selectedTimeline.reduce((sum, event) => sum + (loadedEvidence[event.id]?.length ? loadedEvidence[event.id] : event.evidence || []).filter((item) => item.base64_data || safeEvidenceUrl(item.file_url)).length, 0)} evidencias</Badge>
                    {loadingBatch ? <Badge tone="neutral"><RefreshCw className="animate-spin" size={12} /> Cargando evidencias</Badge> : null}
                  </div>
                </div>
                {!selectedTimeline.length ? (
                  <p className="rounded-md bg-surface-muted p-4 text-sm text-content-muted">Este horario aun no tiene marcaciones ni actividades.</p>
                ) : (
                  <ol className="relative space-y-3 before:absolute before:bottom-6 before:left-[21px] before:top-6 before:w-px before:bg-line">
                    {selectedTimeline.map((event) => {
                      const punctuality = punchPunctuality(event, selectedRoute);
                      const PunctualityIcon = punctuality?.icon || Clock;
                      const EventIcon = event.kind === "marca" ? punchIconFor(event.type) : PlayCircle;
                      const iconClassName = event.kind === "marca" ? punchIconClassName(event.type) : "bg-emerald-600";
                      const items = (loadedEvidence[event.id]?.length ? loadedEvidence[event.id] : event.evidence || []) as MonitorEvidence[];
                      const visibleItems = items.filter((item) => item.base64_data || safeEvidenceUrl(item.file_url));
                      const canLoadEvidence = Boolean(event.evidence?.[0]?.available && event.evidence?.[0]?.id != null);
                      return (
                        <li className="relative pl-14" key={event.id}>
                          <span className={`absolute left-0 top-1 flex h-11 w-11 items-center justify-center rounded-full text-white ring-4 ring-paper ${iconClassName}`}><EventIcon size={18} /></span>
                          <article className="rounded-md border border-line bg-surface p-3">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="font-semibold text-content-strong">{event.title}</p>
                                  <Badge tone={event.kind === "marca" ? "neutral" : "info"}>{event.kind === "marca" ? "Marcacion" : "Actividad"}</Badge>
                                  {punctuality ? <Badge tone={punctuality.tone}><PunctualityIcon size={12} /> {punctuality.label}</Badge> : null}
                                </div>
                                <p className="mt-1 text-sm text-content-muted">{event.user_name} · <span className="font-semibold text-content-body">{formatHour(event.time)}</span></p>
                                {event.observation ? <p className="mt-1.5 text-sm text-content-body">{event.observation}</p> : null}
                                {event.latitude != null && event.longitude != null ? (
                                  <p className="mt-1.5 flex items-center gap-1.5 text-xs text-content-muted"><MapPin size={12} /> {Number(event.latitude).toFixed(5)}, {Number(event.longitude).toFixed(5)} · precision ±{Math.round(Number(event.accuracy_meters || 0))} m</p>
                                ) : null}
                              </div>
                            </div>
                            <div className="mt-3">
                              {visibleItems.length ? (
                                <div className="flex flex-wrap gap-2">
                                  {visibleItems.slice(0, 4).map((item, itemIndex) => item.base64_data ? (
                                    <button className="group relative h-24 w-24 overflow-hidden rounded-md border border-line" key={`${String(item.id || "img")}-${itemIndex}`} onClick={() => setLightbox(item)} type="button" title={item.file_name || "Ampliar evidencia"}>
                                      <Image alt={item.file_name || `Evidencia de ${event.title}`} className="h-full w-full object-cover transition duration-200 group-hover:scale-105" height={96} src={item.base64_data} unoptimized width={96} />
                                      <span className="absolute inset-0 flex items-center justify-center bg-neutral-950/0 text-white opacity-0 transition group-hover:bg-neutral-950/30 group-hover:opacity-100"><ZoomIn size={18} /></span>
                                    </button>
                                  ) : safeEvidenceUrl(item.file_url) ? (
                                    <a className="inline-flex h-24 w-24 items-center justify-center gap-1.5 rounded-md border border-line bg-paper px-2 text-center text-xs font-semibold text-content-body hover:border-apex" href={safeEvidenceUrl(item.file_url)} target="_blank" rel="noreferrer" key={`${String(item.id || "url")}-${itemIndex}`} title={item.file_name || "Ver evidencia"}><Camera size={16} /> Ver</a>
                                  ) : null)}
                                  {visibleItems.length > 4 ? <span className="self-center text-xs font-semibold text-content-muted">+{visibleItems.length - 4} mas</span> : null}
                                </div>
                              ) : loadingEvidence[event.id] ? (
                                <div className="flex items-center gap-3 text-sm text-content-muted"><Skeleton className="h-24 w-24" /> Cargando evidencia...</div>
                              ) : canLoadEvidence ? (
                                <button className="inline-flex h-9 items-center gap-2 rounded-md border border-apex/30 bg-apex/5 px-3 text-sm font-semibold text-apex hover:bg-apex/10" onClick={() => void loadTimelineEvidence(event)} type="button"><Camera size={15} /> {evidenceErrors[event.id] ? "Reintentar evidencia" : "Cargar evidencia"}</button>
                              ) : (
                                <p className="inline-flex items-center gap-2 rounded-md bg-surface-muted px-3 py-2 text-xs font-semibold text-content-subtle"><ImageOff size={14} /> Sin evidencia fotografica</p>
                              )}
                              {evidenceErrors[event.id] ? <p className="mt-2 text-xs font-medium text-red-600" role="alert">{evidenceErrors[event.id]}</p> : null}
                            </div>
                          </article>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </section>
            </div>
          </aside>
          {lightbox ? (
            <div className="fixed inset-0 z-[60] flex items-center justify-center bg-neutral-950/80 p-4" onClick={() => setLightbox(null)} role="dialog" aria-modal="true" aria-label="Evidencia ampliada">
              <div className="max-h-full max-w-3xl overflow-hidden rounded-md bg-paper" onClick={(event) => event.stopPropagation()}>
                <div className="flex items-center justify-between gap-3 border-b border-line p-3">
                  <p className="truncate text-sm font-semibold text-content-strong">{lightbox.file_name || "Evidencia fotografica"}</p>
                  <button className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-line hover:bg-paper" onClick={() => setLightbox(null)} type="button" aria-label="Cerrar evidencia"><X size={16} /></button>
                </div>
                <div className="max-h-[70vh] overflow-auto p-3">
                  <Image alt={lightbox.file_name || "Evidencia ampliada"} className="h-auto w-auto max-w-full rounded-md" height={720} src={lightbox.base64_data || ""} unoptimized width={1280} />
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-white/95 p-3 backdrop-blur md:hidden">
        <button className="h-14 w-full rounded-md bg-apex text-base font-semibold text-white" onClick={() => openCreateModal()} type="button">Nuevo horario</button>
      </div>
    </div>
  );
}
