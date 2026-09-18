"use client";

import { api } from "@/lib/api";
import { downloadXlsxWorkbook } from "@/lib/reportExports";
import { hasStoredRolePermission } from "@/lib/rolePermissions";
import { ArrowLeft, CalendarDays, Download, Eye, Filter, RotateCcw, Search } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type Employee = { id: number | string; code: string; user_type?: string; position: string; department: string; metadata: { name: string; document: string; user_type?: string; identity_aliases?: string[] }; user: { name: string; email?: string } };
type Punch = { id: number; user_name: string; type: string; time: string; punched_at: string; date: string; latitude?: number; longitude?: number; accuracy_meters?: number; vehicle_plate: string; route_id?: number; extra_minutes: number; extra_reason?: string; extra_detail?: string };
type Attendance = { user_name: string; next_type: string | null; punches: Punch[] };
type WorkActivity = { id: number; employee_id?: number | string; user_id?: string; activity_type_name: string; observation: string; occurred_at: string; latitude: number; longitude: number; accuracy_meters?: number; user_name: string; route_id?: number | string; vehicle_plate?: string; evidence?: Array<{ base64_data?: string; file_name?: string }>; metadata?: { supplied_user_name?: string; employee_code?: string; employee_name?: string; identity_aliases?: string[] } };
type TimeRoute = { id: number; date: string; vehicle_plate: string; employees: string[]; start_time: string; end_time: string; status: string };
type ReportRow = {
  key: string;
  employeeId: string;
  employeeName: string;
  role: string;
  document: string;
  date: string;
  route: string;
  vehicle: string;
  entry?: Punch;
  lunchStart?: Punch;
  lunchEnd?: Punch;
  exit?: Punch;
  workedMinutes: number;
  overtimeMinutes: number;
  overtimeReason: string;
  overtimeDetail: string;
  activities: WorkActivity[];
  events: Array<{ kind: string; title: string; at: string; gps?: string; detail?: string }>;
};

function today() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function shiftDate(value: string, days: number) {
  const date = new Date(`${value}T12:00:00-05:00`);
  date.setUTCDate(date.getUTCDate() + days);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function dateKey(value?: string) {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value.slice(0, 10) : new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function normalized(value: unknown) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

function reportRangeError(from: string, to: string) {
  if (!from || !to) return "Selecciona una fecha inicial y una fecha final.";
  const start = new Date(`${from}T00:00:00-05:00`);
  const end = new Date(`${to}T00:00:00-05:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return "La fecha final debe ser igual o posterior a la inicial.";
  if ((end.getTime() - start.getTime()) / 86400000 + 1 > 92) return "El rango maximo permitido es de 92 dias.";
  return "";
}

function minutesLabel(minutes: number) {
  const safe = Math.max(0, Math.round(minutes || 0));
  return `${Math.floor(safe / 60)}h ${String(safe % 60).padStart(2, "0")}m`;
}

function hour(value?: string) {
  if (!value) return "--";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value.slice(0, 5) : date.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
}

function employeeName(employee?: Employee, fallback = "") {
  return employee?.metadata?.name || employee?.user?.name || fallback || "Sin nombre";
}

function gps(point: { latitude?: number; longitude?: number }) {
  return point.latitude != null && point.longitude != null ? `${Number(point.latitude).toFixed(5)}, ${Number(point.longitude).toFixed(5)}` : "";
}

export default function HrReportsPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [punches, setPunches] = useState<Punch[]>([]);
  const [activities, setActivities] = useState<WorkActivity[]>([]);
  const [routes, setRoutes] = useState<TimeRoute[]>([]);
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [appliedRange, setAppliedRange] = useState({ from: today(), to: today() });
  const [employeeFilter, setEmployeeFilter] = useState("all");
  const [onlyOvertime, setOnlyOvertime] = useState(false);
  const [journeyFilter, setJourneyFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<ReportRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [canExport, setCanExport] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setCanExport(hasStoredRolePermission("hr", "export"));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage("");
    try {
      const [employeeRows, punchRows, activityRows, routeRows] = await Promise.all([
        api<Employee[]>("/api/v1/hr/employees?active=true").catch(() => [] as Employee[]),
        api<Attendance[]>(`/api/v1/hr/attendance?fecha_inicio=${encodeURIComponent(appliedRange.from)}&fecha_fin=${encodeURIComponent(appliedRange.to)}`).catch(() => [] as Attendance[]),
        api<WorkActivity[]>(`/api/v1/hr/work-activities?fecha_inicio=${encodeURIComponent(appliedRange.from)}&fecha_fin=${encodeURIComponent(appliedRange.to)}&limit=5000`).catch(() => [] as WorkActivity[]),
        api<TimeRoute[]>(`/api/v1/hr/routes?fecha_inicio=${encodeURIComponent(appliedRange.from)}&fecha_fin=${encodeURIComponent(appliedRange.to)}`).catch(() => [] as TimeRoute[])
      ]);
      setEmployees(employeeRows);
      setPunches(punchRows.flatMap((att) => att.punches || []));
      setActivities(activityRows);
      setRoutes(routeRows);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No fue posible cargar los reportes de Talento Humano.");
    } finally {
      setLoading(false);
    }
  }, [appliedRange]);

  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  const rows = useMemo(() => {
    const groups = new Map<string, Punch[]>();
    for (const punch of punches) {
      const date = typeof punch.date === "string" ? punch.date.slice(0, 10) : new Date().toISOString().slice(0, 10);
      const key = `${punch.user_name || "sin-empleado"}|${date}`;
      groups.set(key, [...(groups.get(key) || []), punch]);
    }
    return Array.from(groups.entries()).map(([key, group]) => {
      const sorted = group.sort((a, b) => new Date(a.punched_at).getTime() - new Date(b.punched_at).getTime());
      const userName = sorted[0]?.user_name || "";
      const employee = employees.find((emp) => [emp.id, emp.code, employeeName(emp), emp.user?.email, ...(emp.metadata?.identity_aliases || [])].some((alias) => normalized(alias) === normalized(userName)));
      const route = routes.find((r) => String(r.id) === String(sorted[0]?.route_id));
      const entry = sorted.find((item) => item.type === "entrada");
      const lunchStart = sorted.find((item) => item.type === "inicio_almuerzo");
      const lunchEnd = sorted.find((item) => item.type === "fin_almuerzo");
      const exit = sorted.find((item) => item.type === "salida");
      const gross = entry && exit ? Math.max(0, new Date(exit.punched_at).getTime() - new Date(entry.punched_at).getTime()) / 60000 : 0;
      const lunch = lunchStart && lunchEnd ? Math.max(0, new Date(lunchEnd.punched_at).getTime() - new Date(lunchStart.punched_at).getTime()) / 60000 : 0;
      const userAliases = new Set([
        userName,
        employee?.id,
        employee?.code,
        employeeName(employee, ""),
        employee?.user?.email,
        employee?.metadata?.name,
        ...(Array.isArray(employee?.metadata?.identity_aliases) ? employee.metadata.identity_aliases : [])
      ].filter(Boolean).map((value) => String(value).trim().toLowerCase()));
      const routeActivities = activities.filter((activity) => {
        if (dateKey(activity.occurred_at) !== dateKey(sorted[0]?.date)) return false;
        const activityAliases = [
          activity.user_name,
          activity.employee_id,
          activity.user_id,
          activity.metadata?.supplied_user_name,
          activity.metadata?.employee_code,
          activity.metadata?.employee_name,
          ...(Array.isArray(activity.metadata?.identity_aliases) ? activity.metadata.identity_aliases : [])
        ].filter(Boolean).map((value) => String(value).trim().toLowerCase());
        return activityAliases.some((alias) => userAliases.has(alias)) || Boolean(activity.route_id && String(activity.route_id) === String(sorted[0]?.route_id));
      });
      const events = [
        ...sorted.map((punch) => ({ kind: "Marcacion", title: punch.type, at: punch.punched_at, gps: gps(punch), detail: punch.extra_minutes ? `${punch.extra_minutes} min extra` : "" })),
        ...routeActivities.map((activity) => ({ kind: "Actividad", title: activity.activity_type_name || "Actividad operativa", at: activity.occurred_at, gps: gps(activity), detail: activity.observation || "" }))
      ].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
      return {
        key,
        employeeId: String(employee?.id || userName),
        employeeName: employeeName(employee, userName),
        role: String(employee?.user_type || employee?.position || "operativo"),
        document: employee?.metadata?.document || "",
        date: dateKey(sorted[0]?.date),
        route: route ? `Ruta ${route.id}` : String(sorted[0]?.route_id || "--"),
        vehicle: sorted[0]?.vehicle_plate || route?.vehicle_plate || "--",
        entry,
        lunchStart,
        lunchEnd,
        exit,
        workedMinutes: Math.max(0, Math.round(gross - lunch)),
        overtimeMinutes: sorted.reduce((sum, punch) => sum + Number(punch.extra_minutes || 0), 0),
        overtimeReason: sorted.find((punch) => punch.extra_reason)?.extra_reason || "",
        overtimeDetail: sorted.find((punch) => punch.extra_detail)?.extra_detail || "",
        activities: routeActivities,
        events
      } satisfies ReportRow;
    });
  }, [activities, employees, punches, routes]);

  const filtered = useMemo(() => rows.filter((row) => {
    const term = normalized(query);
    if (row.date < appliedRange.from || row.date > appliedRange.to) return false;
    if (employeeFilter !== "all" && row.employeeId !== employeeFilter) return false;
    if (onlyOvertime && !row.overtimeMinutes) return false;
    if (journeyFilter === "complete" && (!row.entry || !row.exit)) return false;
    if (journeyFilter === "incomplete" && row.entry && row.exit) return false;
    if (!term) return true;
    return normalized([row.employeeName, row.document, row.route, row.vehicle, row.role, row.overtimeReason, row.overtimeDetail, ...row.activities.map((activity) => activity.activity_type_name)].join(" ")).includes(term);
  }), [appliedRange, employeeFilter, journeyFilter, onlyOvertime, query, rows]);

  const activeFilters = [employeeFilter !== "all", onlyOvertime, journeyFilter !== "all", Boolean(query.trim())].filter(Boolean).length;

  function applyDateFilters() {
    const error = reportRangeError(from, to);
    if (error) return setMessage(error);
    setMessage("");
    setAppliedRange({ from, to });
  }

  function applyPreset(days: number | "month") {
    const end = today();
    const start = days === "month" ? `${end.slice(0, 8)}01` : shiftDate(end, -(days - 1));
    setFrom(start);
    setTo(end);
    setAppliedRange({ from: start, to: end });
  }

  function clearSmartFilters() {
    setEmployeeFilter("all");
    setOnlyOvertime(false);
    setJourneyFilter("all");
    setQuery("");
  }

  async function exportRows() {
    if (!canExport) {
      setMessage("Tu rol no tiene permiso para exportar reportes de Talento Humano.");
      return;
    }
    setExporting(true);
    setMessage("");
    try {
      const uniqueEmployees = new Set(filtered.map((row) => row.employeeId)).size;
      const workedHours = filtered.reduce((sum, row) => sum + row.workedMinutes, 0) / 60;
      const overtimeHours = filtered.reduce((sum, row) => sum + row.overtimeMinutes, 0) / 60;
      await downloadXlsxWorkbook(`apexos-reporte-talento-humano-${appliedRange.from}-${appliedRange.to}.xlsx`, [
        {
          name: "Resumen",
          title: "Reporte de Talento Humano",
          subtitle: `Periodo ${appliedRange.from} a ${appliedRange.to} | Datos filtrados: ${filtered.length} jornada(s)`,
          columns: [{ key: "indicador", label: "Indicador", width: 220 }, { key: "valor", label: "Valor", width: 160 }],
          rows: [
            { indicador: "Jornadas incluidas", valor: filtered.length },
            { indicador: "Empleados", valor: uniqueEmployees },
            { indicador: "Horas laboradas", valor: Number(workedHours.toFixed(2)) },
            { indicador: "Horas extra", valor: Number(overtimeHours.toFixed(2)) },
            { indicador: "Jornadas incompletas", valor: filtered.filter((row) => !row.entry || !row.exit).length },
            { indicador: "Eventos de trazabilidad", valor: filtered.reduce((sum, row) => sum + row.events.length, 0) }
          ]
        },
        {
          name: "Jornadas",
          title: "Detalle de jornadas",
          subtitle: `Periodo ${appliedRange.from} a ${appliedRange.to} | Exportado con los filtros visibles`,
          columns: [
            { key: "fecha", label: "Fecha", width: 95, numberFormat: "yyyy-mm-dd" }, { key: "empleado", label: "Empleado", width: 180 },
            { key: "rol", label: "Rol", width: 120 }, { key: "documento", label: "Documento", width: 110 }, { key: "ruta", label: "Ruta", width: 110 },
            { key: "vehiculo", label: "Vehiculo", width: 95 }, { key: "entrada", label: "Entrada", width: 85 }, { key: "almuerzo_inicio", label: "Inicio almuerzo", width: 100 },
            { key: "almuerzo_fin", label: "Fin almuerzo", width: 100 }, { key: "cierre", label: "Cierre", width: 85 },
            { key: "horas_laboradas", label: "Horas laboradas", width: 110, numberFormat: "0.00" }, { key: "horas_extra", label: "Horas extra", width: 95, numberFormat: "0.00" },
            { key: "estado", label: "Estado jornada", width: 115 }, { key: "motivo_extra", label: "Motivo extra", width: 180 },
            { key: "justificacion_extra", label: "Justificacion extra", width: 240 }, { key: "actividades", label: "Actividades", width: 90 }, { key: "eventos", label: "Eventos", width: 85 }
          ],
          rows: filtered.map((row) => ({
            fecha: new Date(`${row.date}T12:00:00-05:00`), empleado: row.employeeName, rol: row.role, documento: row.document, ruta: row.route, vehiculo: row.vehicle,
            entrada: hour(row.entry?.punched_at), almuerzo_inicio: hour(row.lunchStart?.punched_at), almuerzo_fin: hour(row.lunchEnd?.punched_at), cierre: hour(row.exit?.punched_at),
            horas_laboradas: Number((row.workedMinutes / 60).toFixed(2)), horas_extra: Number((row.overtimeMinutes / 60).toFixed(2)), estado: row.entry && row.exit ? "Completa" : "Incompleta",
            motivo_extra: row.overtimeReason, justificacion_extra: row.overtimeDetail, actividades: row.activities.length, eventos: row.events.length
          }))
        },
        {
          name: "Trazabilidad",
          title: "Eventos de trazabilidad",
          subtitle: "Marcaciones y actividades asociadas a cada jornada filtrada",
          columns: [
            { key: "fecha", label: "Fecha", width: 95, numberFormat: "yyyy-mm-dd" }, { key: "empleado", label: "Empleado", width: 180 }, { key: "ruta", label: "Ruta", width: 110 },
            { key: "tipo", label: "Tipo", width: 100 }, { key: "evento", label: "Evento", width: 160 }, { key: "hora", label: "Hora", width: 85 },
            { key: "gps", label: "GPS", width: 150 }, { key: "detalle", label: "Detalle", width: 280 }
          ],
          rows: filtered.flatMap((row) => row.events.map((event) => ({ fecha: new Date(`${row.date}T12:00:00-05:00`), empleado: row.employeeName, ruta: row.route, tipo: event.kind, evento: event.title, hora: hour(event.at), gps: event.gps || "", detalle: event.detail || "" })))
        }
      ]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No fue posible generar el archivo Excel.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link className="mb-3 inline-flex h-10 items-center gap-2 rounded-md text-sm font-medium text-neutral-600 hover:text-apex" href="/dashboard/talento-humano"><ArrowLeft size={17} /> Talento Humano</Link>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-apex">Reportes operativos</p>
          <h1 className="mt-1 text-3xl font-semibold">Horas laboradas y trazabilidad</h1>
          <p className="mt-2 max-w-3xl text-sm text-neutral-600">Consulta jornada, marcaciones, actividades GPS, horas extra, motivo y justificacion por empleado.</p>
        </div>
        <button className="inline-flex h-11 items-center gap-2 rounded-md bg-apex px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60" disabled={loading || exporting || !canExport} onClick={() => void exportRows()} title={canExport ? "Descargar el subconjunto filtrado" : "Tu rol no tiene permiso hr:export"} type="button"><Download size={16} /> {exporting ? "Generando Excel..." : "Descargar Excel"}</button>
      </header>

      {message ? <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-900">{message}</div> : null}

      <section className="space-y-4 rounded-md border border-line bg-white p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-neutral-500"><CalendarDays size={15} /> Rangos rapidos</span>
          <button className="h-8 rounded-full border border-line px-3 text-xs font-semibold hover:border-apex hover:text-apex" onClick={() => applyPreset(1)} type="button">Hoy</button>
          <button className="h-8 rounded-full border border-line px-3 text-xs font-semibold hover:border-apex hover:text-apex" onClick={() => applyPreset(7)} type="button">Ultimos 7 dias</button>
          <button className="h-8 rounded-full border border-line px-3 text-xs font-semibold hover:border-apex hover:text-apex" onClick={() => applyPreset(30)} type="button">Ultimos 30 dias</button>
          <button className="h-8 rounded-full border border-line px-3 text-xs font-semibold hover:border-apex hover:text-apex" onClick={() => applyPreset("month")} type="button">Mes actual</button>
          <span className="ml-auto text-xs text-neutral-500">Rango aplicado: {appliedRange.from} a {appliedRange.to}</span>
        </div>
        <div className="grid gap-3 lg:grid-cols-[1fr_1fr_1.3fr_1fr_auto_auto]">
          <label className="text-sm font-semibold">Desde<input className="mt-1 h-10 w-full rounded-md border border-line px-3 font-normal" max={to} type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
          <label className="text-sm font-semibold">Hasta<input className="mt-1 h-10 w-full rounded-md border border-line px-3 font-normal" min={from} type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
          <label className="text-sm font-semibold">Empleado<select className="mt-1 h-10 w-full rounded-md border border-line px-3 font-normal" value={employeeFilter} onChange={(event) => setEmployeeFilter(event.target.value)}><option value="all">Todos los empleados</option>{employees.map((employee) => <option key={employee.id} value={String(employee.id)}>{employeeName(employee)}{employee.metadata?.document ? ` - ${employee.metadata.document}` : ""}</option>)}</select></label>
          <label className="text-sm font-semibold">Estado de jornada<select className="mt-1 h-10 w-full rounded-md border border-line px-3 font-normal" value={journeyFilter} onChange={(event) => setJourneyFilter(event.target.value)}><option value="all">Todas</option><option value="complete">Completas</option><option value="incomplete">Incompletas</option></select></label>
          <label className="flex items-end gap-2 pb-2 text-sm font-semibold"><input checked={onlyOvertime} onChange={(event) => setOnlyOvertime(event.target.checked)} type="checkbox" /> Solo extras</label>
          <button className="inline-flex h-10 items-center gap-2 self-end rounded-md border border-apex px-3 text-sm font-semibold text-apex hover:bg-paper disabled:opacity-60" disabled={loading} onClick={applyDateFilters} type="button"><Filter size={16} /> {loading ? "Consultando..." : "Aplicar rango"}</button>
        </div>
        {activeFilters ? <button className="inline-flex h-9 items-center gap-2 rounded-md border border-line px-3 text-sm font-semibold text-neutral-600 hover:bg-paper" onClick={clearSmartFilters} type="button"><RotateCcw size={15} /> Limpiar filtros inteligentes ({activeFilters})</button> : null}
      </section>

      <section className="overflow-hidden rounded-md border border-line bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-4">
          <div><h2 className="font-semibold">Detalle profesional de jornada</h2><p className="text-sm text-neutral-500">{filtered.length} de {rows.length} registro(s) encontrados</p></div>
          <label className="relative w-full sm:w-96"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" size={16} /><input className="h-10 w-full rounded-md border border-line pl-9 pr-3 text-sm" placeholder="Empleado, documento, ruta, vehiculo, rol o actividad" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[1100px] w-full text-left text-sm">
            <thead className="bg-paper text-xs uppercase text-neutral-500"><tr>{["Fecha", "Empleado", "Rol", "Ruta", "Vehiculo", "Entrada", "Cierre", "Laboradas", "Extra", "Motivo", "Trazabilidad", ""].map((head) => <th className="px-4 py-3" key={head}>{head}</th>)}</tr></thead>
            <tbody className="divide-y divide-line">
              {filtered.map((row) => (
                <tr className="hover:bg-paper" key={row.key}>
                  <td className="px-4 py-3">{row.date}</td>
                  <td className="px-4 py-3 font-semibold">{row.employeeName}<p className="text-xs font-normal text-neutral-500">{row.document || "Sin documento"}</p></td>
                  <td className="px-4 py-3">{row.role}</td>
                  <td className="px-4 py-3">{row.route}</td>
                  <td className="px-4 py-3">{row.vehicle}</td>
                  <td className="px-4 py-3">{hour(row.entry?.punched_at)}</td>
                  <td className="px-4 py-3">{hour(row.exit?.punched_at)}</td>
                  <td className="px-4 py-3 font-semibold">{minutesLabel(row.workedMinutes)}</td>
                  <td className={`px-4 py-3 font-semibold ${row.overtimeMinutes ? "text-amber-700" : ""}`}>{minutesLabel(row.overtimeMinutes)}</td>
                  <td className="max-w-[220px] truncate px-4 py-3">{row.overtimeReason || "--"}</td>
                  <td className="px-4 py-3">{row.events.length} evento(s)</td>
                  <td className="px-4 py-3"><button className="inline-flex h-9 items-center gap-2 rounded-md border border-line px-3 font-semibold hover:bg-white" onClick={() => setSelected(row)} type="button"><Eye size={15} /> Ver</button></td>
                </tr>
              ))}
              {!filtered.length ? <tr><td className="px-4 py-8 text-center text-neutral-500" colSpan={12}>{loading ? "Cargando..." : "Sin registros para el filtro seleccionado."}</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>

      {selected ? (
        <div className="fixed inset-0 z-50 bg-neutral-950/40">
          <aside className="ml-auto flex h-full w-full max-w-3xl flex-col bg-white shadow-xl">
            <header className="flex items-start justify-between gap-3 border-b border-line p-4">
              <div><p className="text-sm font-semibold text-apex">Trazabilidad completa</p><h2 className="text-2xl font-semibold">{selected.employeeName}</h2><p className="text-sm text-neutral-500">{selected.date} - {selected.route} - {selected.vehicle}</p></div>
              <button className="rounded-md border border-line px-3 py-2 text-sm font-semibold" onClick={() => setSelected(null)} type="button">Cerrar</button>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <Metric label="Horas laboradas" value={minutesLabel(selected.workedMinutes)} />
                <Metric label="Horas extra" value={minutesLabel(selected.overtimeMinutes)} />
                <Metric label="Eventos" value={selected.events.length} />
              </div>
              {selected.overtimeMinutes ? <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950"><p className="font-semibold">Justificacion de extension</p><p className="mt-1">Motivo: {selected.overtimeReason || "--"}</p><p className="mt-1">{selected.overtimeDetail || "Sin detalle registrado."}</p></div> : null}
              <div className="mt-4 space-y-2">
                {selected.events.map((event, index) => <div className="rounded-md border border-line p-3" key={`${event.kind}-${event.at}-${index}`}><div className="flex items-start gap-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-apex text-sm font-bold text-white">{index + 1}</span><div><p className="font-semibold">{event.kind}: {event.title}</p><p className="text-sm text-neutral-600">{hour(event.at)} - {event.detail || "Sin observacion"}</p>{event.gps ? <p className="mt-1 text-xs text-neutral-500">GPS {event.gps}</p> : null}</div></div></div>)}
              </div>
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-md border border-line bg-paper p-3"><p className="text-xs font-semibold uppercase text-neutral-500">{label}</p><p className="mt-2 text-xl font-semibold">{value}</p></div>;
}
