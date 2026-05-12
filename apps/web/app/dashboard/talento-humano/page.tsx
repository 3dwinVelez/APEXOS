"use client";

import { api } from "@/lib/api";
import { Activity, CalendarDays, Clock, MapPinned, Plus, Route, Smartphone, Truck, Users } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

type Schedule = { id: number };
type Attendance = { user_name: string; next_type: string | null; punches: Array<{ id: number }> };
type Workday = { id: number; inconsistent: boolean };
type Employee = { id: number };
type Vehicle = { id: number };
type TimeRoute = { id: number; vehicle_plate: string; employees: string[]; start_time: string; end_time: string; status: string };

export default function TalentPage() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [workdays, setWorkdays] = useState<Workday[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [routes, setRoutes] = useState<TimeRoute[]>([]);

  async function load() {
    const [scheduleData, attendanceData, workdayData, employeeData, vehicleData, routeData] = await Promise.all([
      api<Schedule[]>("/api/v1/hr/schedules").catch(() => []),
      api<Attendance[]>("/api/v1/hr/attendance").catch(() => []),
      api<Workday[]>("/api/v1/hr/workdays").catch(() => []),
      api<Employee[]>("/api/v1/hr/employees").catch(() => []),
      api<Vehicle[]>("/api/v1/transport/vehicles").catch(() => []),
      api<TimeRoute[]>("/api/v1/hr/routes").catch(() => [])
    ]);
    setSchedules(scheduleData);
    setAttendance(attendanceData);
    setWorkdays(workdayData);
    setEmployees(employeeData);
    setVehicles(vehicleData);
    setRoutes(routeData);
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-apex">M-17 · Talento Humano</p>
          <h1 className="text-3xl font-semibold">Control de horarios</h1>
          <p className="mt-2 max-w-3xl text-sm text-neutral-600">Panel central. La marcacion y la planeacion viven en pantallas auxiliares optimizadas para operacion y movil.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link className="inline-flex h-10 items-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-medium hover:bg-paper" href="/dashboard/talento-humano/rutas"><Route size={16} /> Rutas</Link>
          <Link className="inline-flex h-10 items-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-medium hover:bg-paper" href="/dashboard/talento-humano/mapa"><MapPinned size={16} /> Mapa GPS</Link>
          <Link className="inline-flex h-10 items-center gap-2 rounded-md bg-apex px-4 text-sm font-medium text-white" href="/dashboard/talento-humano/marcacion"><Smartphone size={16} /> Marcacion movil</Link>
        </div>
      </header>

      <section className="grid gap-3 md:grid-cols-6">
        <div className="rounded-md border border-line bg-white p-4"><Clock className="mb-3 text-apex" size={18} /><p className="text-2xl font-semibold">{schedules.length}</p><p className="text-sm text-neutral-500">Horarios</p></div>
        <div className="rounded-md border border-line bg-white p-4"><Users className="mb-3 text-apex" size={18} /><p className="text-2xl font-semibold">{employees.length}</p><p className="text-sm text-neutral-500">Operarios</p></div>
        <div className="rounded-md border border-line bg-white p-4"><Truck className="mb-3 text-apex" size={18} /><p className="text-2xl font-semibold">{vehicles.length}</p><p className="text-sm text-neutral-500">Vehiculos</p></div>
        <div className="rounded-md border border-line bg-white p-4"><Route className="mb-3 text-apex" size={18} /><p className="text-2xl font-semibold">{routes.length}</p><p className="text-sm text-neutral-500">Rutas</p></div>
        <div className="rounded-md border border-line bg-white p-4"><Activity className="mb-3 text-apex" size={18} /><p className="text-2xl font-semibold">{attendance.length}</p><p className="text-sm text-neutral-500">Con marcas</p></div>
        <div className="rounded-md border border-line bg-white p-4"><CalendarDays className="mb-3 text-apex" size={18} /><p className="text-2xl font-semibold">{workdays.length}</p><p className="text-sm text-neutral-500">Procesadas</p></div>
      </section>

      {!employees.length || !vehicles.length ? (
        <section className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          Para operar como APEX legacy necesitas personas y vehiculos base. Crea personas en rutas/marcacion y vehiculos desde Transporte.
        </section>
      ) : null}

      <section className="grid gap-4 md:grid-cols-3">
        <Link className="rounded-md border border-line bg-white p-5 transition hover:border-apex hover:bg-paper" href="/dashboard/talento-humano/marcacion">
          <Smartphone className="mb-4 text-apex" size={22} />
          <h2 className="font-semibold">Marcacion movil</h2>
          <p className="mt-2 text-sm text-neutral-600">Ingreso, almuerzo, retorno y cierre con vehiculo, ruta y GPS.</p>
        </Link>
        <Link className="rounded-md border border-line bg-white p-5 transition hover:border-apex hover:bg-paper" href="/dashboard/talento-humano/rutas">
          <Route className="mb-4 text-apex" size={22} />
          <h2 className="font-semibold">Planeacion de rutas</h2>
          <p className="mt-2 text-sm text-neutral-600">Asignacion diaria de vehiculo, equipo, horario, tolerancia y viaticos.</p>
        </Link>
        <Link className="rounded-md border border-line bg-white p-5 transition hover:border-apex hover:bg-paper" href="/dashboard/transporte">
          <Truck className="mb-4 text-apex" size={22} />
          <h2 className="font-semibold">Maestro de vehiculos</h2>
          <p className="mt-2 text-sm text-neutral-600">Placas y documentos transversales para rutas, servicios y logistica.</p>
        </Link>
        <Link className="rounded-md border border-line bg-white p-5 transition hover:border-apex hover:bg-paper" href="/dashboard/talento-humano/mapa">
          <MapPinned className="mb-4 text-apex" size={22} />
          <h2 className="font-semibold">Mapa GPS en vivo</h2>
          <p className="mt-2 text-sm text-neutral-600">Seguimiento de operarios activos bajo rutas planeadas.</p>
        </Link>
      </section>

      <section className="rounded-md border border-line bg-white p-4">
        <div className="mb-3 flex items-center gap-2"><MapPinned size={18} className="text-apex" /><h2 className="text-base font-semibold">Monitor del dia</h2></div>
        <div className="grid gap-2 md:grid-cols-2">
          {attendance.map((row) => (
            <div className="rounded-md border border-line p-3" key={row.user_name}>
              <div className="flex items-center justify-between gap-3"><p className="font-semibold">{row.user_name}</p><span className="rounded-md bg-paper px-2 py-1 text-xs">{row.next_type ? `Sigue ${row.next_type}` : "Jornada completa"}</span></div>
              <p className="mt-2 text-xs text-neutral-500">{row.punches.length} marca(s) registradas hoy</p>
            </div>
          ))}
          {!attendance.length ? <p className="text-sm text-neutral-500">Sin marcaciones hoy.</p> : null}
        </div>
      </section>
    </div>
  );
}
