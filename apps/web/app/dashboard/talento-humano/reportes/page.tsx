"use client";

import { api } from "@/lib/api";
import { ArrowLeft, Download, Eye, Filter, Search } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type Employee = { id: number; code: string; user_type?: string; position: string; department: string; metadata: { name: string; document: string; user_type?: string }; user: { name: string } };
type Punch = { id: number; user_name: string; type: string; time: string; punched_at: string; date: string; latitude?: number; longitude?: number; accuracy_meters?: number; vehicle_plate: string; extra_minutes: number; extra_reason?: string; extra_detail?: string };
type Attendance = { user_name: string; next_type: string | null; punches: Punch[] };
type WorkActivity = { id: number; activity_type_name: string; observation: string; occurred_at: string; latitude: number; longitude: number; accuracy_meters?: number; user_name: string; route_id?: number; vehicle_plate?: string; evidence?: Array<{ base64_data?: string; file_name?: string }> };
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
  return new Date().toISOString().slice(0, 10);
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

function csvValue(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function downloadCsv(filename: string, rows: Array<Record<string, unknown>>) {
  const headers = Object.keys(rows[0] || {});
  const csv = [headers.join(","), ...rows.map((row) => headers.map((key) => csvValue(row[key])).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
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
  const [employeeFilter, setEmployeeFilter] = useState("all");
  const [onlyOvertime, setOnlyOvertime] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<ReportRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setMessage("");
    try {
      const [employeeRows, punchRows, activityRows, routeRows] = await Promise.all([
        api<Employee[]>("/api/v1/hr/employees?active=true").catch(() => [] as Employee[]),
        api<Attendance[]>("/api/v1/hr/attendance").catch(() => [] as Attendance[]),
        api<WorkActivity[]>(`/api/v1/hr/work-activities?limit=500`).catch(() => [] as WorkActivity[]),
        api<TimeRoute[]>("/api/v1/hr/routes").catch(() => [] as TimeRoute[])
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
  }, []);

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
      const employee = employees.find((emp) => employeeName(emp) === userName || emp.code === userName);
      const route = routes.find((r) => String(r.id) === String(sorted[0]?.route_id));
      const entry = sorted.find((item) => item.type === "entrada");
      const lunchStart = sorted.find((item) => item.type === "inicio_almuerzo");
      const lunchEnd = sorted.find((item) => item.type === "fin_almuerzo");
      const exit = sorted.find((item) => item.type === "salida");
      const gross = entry && exit ? Math.max(0, new Date(exit.punched_at).getTime() - new Date(entry.punched_at).getTime()) / 60000 : 0;
      const lunch = lunchStart && lunchEnd ? Math.max(0, new Date(lunchEnd.punched_at).getTime() - new Date(lunchStart.punched_at).getTime()) / 60000 : 0;
      const routeActivities = activities.filter((activity) => activity.user_name === userName);
      const events = [
        ...sorted.map((punch) => ({ kind: "Marcacion", title: punch.type, at: punch.punched_at, gps: gps(punch), detail: punch.extra_minutes ? `${punch.extra_minutes} min extra` : "" })),
        ...routeActivities.map((activity) => ({ kind: "Actividad", title: activity.activity_type_name || "Actividad operativa", at: activity.occurred_at, gps: gps(activity), detail: activity.observation || "" }))
      ].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
      return {
        key,
        employeeId: userName,
        employeeName: employeeName(employee, userName),
        role: String(employee?.user_type || employee?.position || "operativo"),
        document: employee?.metadata?.document || "",
        date: sorted[0]?.date?.slice(0, 10) || "",
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

  const filtered = rows.filter((row) => {
    const term = query.trim().toLowerCase();
    if (employeeFilter !== "all" && row.employeeName !== employeeFilter) return false;
    if (onlyOvertime && !row.overtimeMinutes) return false;
    if (!term) return true;
    return [row.employeeName, row.document, row.route, row.vehicle, row.role].join(" ").toLowerCase().includes(term);
  });

  function exportRows() {
    downloadCsv("apexos-reporte-horas-trazabilidad.csv", filtered.map((row) => ({
      fecha: row.date,
      empleado: row.employeeName,
      rol: row.role,
      documento: row.document,
      ruta: row.route,
      vehiculo: row.vehicle,
      entrada: hour(row.entry?.punched_at),
      almuerzo_inicio: hour(row.lunchStart?.punched_at),
      almuerzo_fin: hour(row.lunchEnd?.punched_at),
      cierre: hour(row.exit?.punched_at),
      horas_laboradas: minutesLabel(row.workedMinutes),
      horas_extra: minutesLabel(row.overtimeMinutes),
      motivo_extra: row.overtimeReason,
      justificacion_extra: row.overtimeDetail,
      actividades: row.activities.length,
      eventos_trazabilidad: row.events.length
    })));
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
        <button className="inline-flex h-11 items-center gap-2 rounded-md bg-apex px-4 text-sm font-semibold text-white" onClick={exportRows} type="button"><Download size={16} /> Exportar CSV</button>
      </header>

      {message ? <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-900">{message}</div> : null}

      <section className="grid gap-3 rounded-md border border-line bg-white p-4 lg:grid-cols-[1fr_1fr_1fr_auto_auto]">
        <label className="text-sm font-semibold">Desde<input className="mt-1 h-10 w-full rounded-md border border-line px-3 font-normal" type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
        <label className="text-sm font-semibold">Hasta<input className="mt-1 h-10 w-full rounded-md border border-line px-3 font-normal" type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
        <label className="text-sm font-semibold">Empleado<select className="mt-1 h-10 w-full rounded-md border border-line px-3 font-normal" value={employeeFilter} onChange={(event) => setEmployeeFilter(event.target.value)}><option value="all">Todos</option>{employees.map((employee) => <option key={employee.id} value={employeeName(employee)}>{employeeName(employee)}</option>)}</select></label>
        <label className="flex items-end gap-2 pb-2 text-sm font-semibold"><input checked={onlyOvertime} onChange={(event) => setOnlyOvertime(event.target.checked)} type="checkbox" /> Solo extras</label>
        <button className="inline-flex h-10 items-center self-end rounded-md border border-line px-3 text-sm font-semibold hover:bg-paper" onClick={load} type="button"><Filter size={16} /> Filtrar</button>
      </section>

      <section className="overflow-hidden rounded-md border border-line bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-4">
          <div><h2 className="font-semibold">Detalle profesional de jornada</h2><p className="text-sm text-neutral-500">{filtered.length} registro(s) encontrados</p></div>
          <label className="relative w-full sm:w-80"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" size={16} /><input className="h-10 w-full rounded-md border border-line pl-9 pr-3 text-sm" placeholder="Buscar empleado, ruta, vehiculo" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
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
