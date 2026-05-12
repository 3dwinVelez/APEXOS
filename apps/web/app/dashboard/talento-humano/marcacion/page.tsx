"use client";

import { api } from "@/lib/api";
import { getGpsFix, type GpsFix } from "@/lib/gps";
import { ArrowLeft, CheckCircle2, MapPin, Truck } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Employee = { id: number; code: string; metadata: { name: string }; user: { name: string } };
type Vehicle = { id: number; plate: string; type: string; model: string };
type Attendance = { user_name: string; next_type: string | null; punches: Array<{ id: number; type: string; time: string; vehicle_plate: string }> };
type TimeRoute = { id: number; vehicle_plate: string; employees: string[]; start_time: string; end_time: string };

const punchOrder = ["entrada", "inicio_almuerzo", "fin_almuerzo", "salida"];
const punchLabels: Record<string, { title: string; desc: string; color: string }> = {
  entrada: { title: "Inicio jornada", desc: "Registra tu entrada al trabajo", color: "bg-blue-600" },
  inicio_almuerzo: { title: "Salida almuerzo", desc: "Registra tu salida a almorzar", color: "bg-amber-500" },
  fin_almuerzo: { title: "Retorno almuerzo", desc: "Registra tu regreso", color: "bg-emerald-600" },
  salida: { title: "Fin jornada", desc: "Registra tu cierre del dia", color: "bg-violet-600" }
};

function employeeName(employee: Employee) {
  return employee.metadata.name || employee.user.name || employee.code || "";
}

export default function MobilePunchPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [routes, setRoutes] = useState<TimeRoute[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [employeeId, setEmployeeId] = useState<number | null>(null);
  const [vehiclePlate, setVehiclePlate] = useState("");
  const [message, setMessage] = useState("");
  const [gps, setGps] = useState<GpsFix | null>(null);
  const [gpsStatus, setGpsStatus] = useState<"idle" | "loading" | "ok" | "error">("idle");

  async function load() {
    const [employeeData, vehicleData, routeData, attendanceData] = await Promise.all([
      api<Employee[]>("/api/v1/hr/employees?active=true").catch(() => []),
      api<Vehicle[]>("/api/v1/transport/vehicles").catch(() => []),
      api<TimeRoute[]>("/api/v1/hr/routes").catch(() => []),
      api<Attendance[]>("/api/v1/hr/attendance").catch(() => [])
    ]);
    setEmployees(employeeData);
    setVehicles(vehicleData);
    setRoutes(routeData);
    setAttendance(attendanceData);
    if (!employeeId && employeeData[0]) setEmployeeId(employeeData[0].id);
    if (!vehiclePlate && vehicleData[0]) setVehiclePlate(vehicleData[0].plate);
  }

  useEffect(() => {
    load();
  }, []);

  const employee = useMemo(() => employees.find((item) => item.id === employeeId) || employees[0] || null, [employees, employeeId]);
  const userName = employee ? employee.code || employeeName(employee) : "";
  const currentAttendance = attendance.find((item) => item.user_name === userName) || { user_name: userName, next_type: "entrada", punches: [] };
  const doneTypes = new Set(currentAttendance.punches.map((punch) => punch.type) || []);
  const nextType = currentAttendance.next_type || "entrada";
  const route = routes.find((item) => item.vehicle_plate === vehiclePlate && item.employees.includes(userName));

  async function refreshGps() {
    setGpsStatus("loading");
    try {
      const fix = await getGpsFix();
      setGps(fix);
      setGpsStatus("ok");
      if (userName) {
        await api("/api/v1/hr/gps/ping", {
          method: "POST",
          body: JSON.stringify({
            user_name: userName,
            employee_id: employee?.id,
            vehicle_plate: vehiclePlate,
            route_id: route?.id,
            ...fix,
            source: "mobile_presence"
          })
        }).catch(() => undefined);
      }
      return fix;
    } catch (error) {
      setGpsStatus("error");
      setMessage(error instanceof Error ? error.message : "GPS no disponible.");
      return null;
    }
  }

  async function mark(type: string) {
    if (!employee) return;
    const fix = gps || await refreshGps();
    if (!fix) return;
    await api("/api/v1/hr/time-punches", {
      method: "POST",
      body: JSON.stringify({
        employee_id: employee.id,
        user_name: userName,
        type,
        punched_at: new Date().toISOString(),
        latitude: fix.latitude,
        longitude: fix.longitude,
        accuracy_meters: fix.accuracy_meters,
        vehicle_plate: vehiclePlate,
        route_id: route?.id,
        metadata: { source: "apexos-mobile" }
      })
    });
    setMessage(`${punchLabels[type].title} registrado.`);
    await load();
  }

  return (
    <div className="mx-auto max-w-md space-y-4 pb-8">
      <header className="sticky top-0 z-10 -mx-4 border-b border-line bg-paper/95 px-4 py-3 backdrop-blur md:static md:mx-0 md:border-0 md:bg-transparent md:px-0">
        <Link className="mb-3 inline-flex items-center gap-2 text-sm font-medium text-neutral-600 hover:text-apex" href="/dashboard/talento-humano"><ArrowLeft size={16} /> Control de horarios</Link>
        <p className="text-sm font-medium text-apex">Marcacion movil</p>
        <h1 className="text-2xl font-semibold">Mi jornada</h1>
      </header>

      {message ? <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{message}</div> : null}

      <section className="rounded-md border border-line bg-white p-4">
        <div className="grid gap-3">
          <select className="h-11 rounded-md border border-line px-3 text-sm" value={employee?.id || ""} onChange={(event) => setEmployeeId(Number(event.target.value))}>
            {employees.map((item) => <option key={item.id} value={item.id}>{employeeName(item)}</option>)}
          </select>
          <select className="h-11 rounded-md border border-line px-3 text-sm" value={vehiclePlate} onChange={(event) => setVehiclePlate(event.target.value)}>
            <option value="">Vehiculo</option>
            {vehicles.map((item) => <option key={item.id} value={item.plate}>{item.plate} · {item.type || item.model || "Movil"}</option>)}
          </select>
        </div>
        <div className="mt-3 rounded-md bg-paper p-3 text-sm text-neutral-600">
          <Truck className="mr-2 inline text-apex" size={15} /> {route ? `Ruta ${route.id} · ${route.start_time || "--"} - ${route.end_time || "--"}` : "Sin ruta asignada para este vehiculo/equipo"}
        </div>
        <button className="mt-3 h-10 w-full rounded-md border border-line text-sm font-semibold hover:bg-paper" onClick={refreshGps} type="button">
          {gpsStatus === "loading" ? "Obteniendo GPS..." : gpsStatus === "ok" && gps ? `GPS activo (${Math.round(gps.accuracy_meters || 0)}m)` : "Activar GPS obligatorio"}
        </button>
        {gpsStatus === "error" ? <p className="mt-2 text-xs font-semibold text-red-700">GPS obligatorio para marcar. Habilita ubicacion en el navegador.</p> : null}
      </section>

      <section className="space-y-3">
        {punchOrder.map((type) => {
          const done = doneTypes.has(type);
          const enabled = type === nextType && !!employee;
          const cfg = punchLabels[type];
          return (
            <button className={`w-full rounded-md border p-4 text-left transition ${enabled ? "border-apex bg-white shadow-sm" : "border-line bg-white opacity-70"}`} disabled={!enabled} key={type} onClick={() => mark(type)} type="button">
              <div className="flex items-center gap-3">
                <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-md text-white ${done ? "bg-emerald-600" : enabled ? cfg.color : "bg-neutral-300"}`}>
                  {done ? <CheckCircle2 size={21} /> : <MapPin size={20} />}
                </div>
                <div className="flex-1">
                  <p className="font-semibold">{cfg.title}</p>
                  <p className="mt-1 text-sm text-neutral-500">{done ? "Registrado correctamente" : enabled ? cfg.desc : "No disponible aun"}</p>
                </div>
              </div>
            </button>
          );
        })}
      </section>

      <section className="rounded-md border border-line bg-white p-4">
        <h2 className="mb-3 text-base font-semibold">Historial de hoy</h2>
        <div className="space-y-2">
          {currentAttendance.punches.map((punch) => (
            <div className="flex items-center justify-between rounded-md bg-paper px-3 py-2 text-sm" key={punch.id}>
              <span>{punchLabels[punch.type].title || punch.type}</span>
              <span className="font-semibold">{punch.time}</span>
            </div>
          ))}
          {!currentAttendance.punches.length ? <p className="text-sm text-neutral-500">Sin marcaciones hoy.</p> : null}
        </div>
      </section>
    </div>
  );
}
