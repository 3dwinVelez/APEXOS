"use client";

import { api } from "@/lib/api";
import { ArrowLeft, Plus, Route, Save } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

type Employee = { id: number; code: string; position: string; department: string; metadata: { name: string; document: string }; user: { name: string } };
type Vehicle = { id: number; plate: string; type: string; model: string };
type TimeRoute = { id: number; date: string; vehicle_plate: string; employees: string[]; start_time: string; end_time: string; status: string };

function employeeName(employee: Employee) {
  return employee.metadata.name || employee.user.name || employee.code || `Empleado ${employee.id}`;
}

export default function RoutesPlanningPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [routes, setRoutes] = useState<TimeRoute[]>([]);
  const [message, setMessage] = useState("");
  const [employeeForm, setEmployeeForm] = useState({ name: "", document: "", code: "", position: "empleado", department: "Operacion" });
  const [form, setForm] = useState({ date: new Date().toISOString().slice(0, 10), vehicle_plate: "", employees: [] as string[], start_time: "08:00", end_time: "17:00", tolerance_minutes: 15, per_diem: 0, notes: "" });

  async function load() {
    const [employeeData, vehicleData, routeData] = await Promise.all([
      api<Employee[]>("/api/v1/hr/employees?active=true").catch(() => []),
      api<Vehicle[]>("/api/v1/transport/vehicles").catch(() => []),
      api<TimeRoute[]>("/api/v1/hr/routes").catch(() => [])
    ]);
    setEmployees(employeeData);
    setVehicles(vehicleData);
    setRoutes(routeData);
    if (!form.vehicle_plate && vehicleData[0]) setForm((prev) => ({ ...prev, vehicle_plate: vehicleData[0].plate }));
  }

  useEffect(() => {
    load();
  }, []);

  async function createEmployee() {
    await api<Employee>("/api/v1/hr/employees", {
      method: "POST",
      body: JSON.stringify({
        ...employeeForm,
        code: employeeForm.code || `OP-${Date.now().toString().slice(-5)}`,
        hire_date: new Date().toISOString(),
        labor_status: "activo"
      })
    });
    setEmployeeForm({ name: "", document: "", code: "", position: "empleado", department: "Operacion" });
    setMessage("Persona creada para rutas, horarios y servicios.");
    await load();
  }

  async function createRoute() {
    if (!form.vehicle_plate || !form.employees.length) {
      setMessage("Selecciona vehiculo y al menos una persona.");
      return;
    }
    await api<TimeRoute>("/api/v1/hr/routes", { method: "POST", body: JSON.stringify({ ...form, status: "active" }) });
    setMessage("Ruta operativa creada.");
    setForm((prev) => ({ ...prev, employees: [], notes: "" }));
    await load();
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link className="mb-3 inline-flex items-center gap-2 text-sm font-medium text-neutral-600 hover:text-apex" href="/dashboard/talento-humano"><ArrowLeft size={16} /> Control de horarios</Link>
          <p className="text-sm font-medium text-apex">Talento Humano</p>
          <h1 className="text-3xl font-semibold">Planeacion de rutas</h1>
          <p className="mt-2 max-w-3xl text-sm text-neutral-600">Pantalla auxiliar para crear rutas con vehiculo, equipo, horario, tolerancia y viaticos.</p>
        </div>
      </header>

      {message ? <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{message}</div> : null}

      <section className="grid gap-5 xl:grid-cols-[390px_1fr]">
        <aside className="space-y-5">
          <div className="rounded-md border border-line bg-white p-4">
            <h2 className="mb-3 text-base font-semibold">Crear operario o tecnico</h2>
            <div className="space-y-3">
              <input className="h-10 w-full rounded-md border border-line px-3 text-sm" placeholder="Nombre completo" value={employeeForm.name} onChange={(event) => setEmployeeForm((prev) => ({ ...prev, name: event.target.value }))} />
              <div className="grid grid-cols-2 gap-2">
                <input className="h-10 rounded-md border border-line px-3 text-sm" placeholder="Documento" value={employeeForm.document} onChange={(event) => setEmployeeForm((prev) => ({ ...prev, document: event.target.value }))} />
                <input className="h-10 rounded-md border border-line px-3 text-sm" placeholder="Codigo" value={employeeForm.code} onChange={(event) => setEmployeeForm((prev) => ({ ...prev, code: event.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <select className="h-10 rounded-md border border-line px-3 text-sm" value={employeeForm.position} onChange={(event) => setEmployeeForm((prev) => ({ ...prev, position: event.target.value }))}>
                  <option value="empleado">Operario</option>
                  <option value="tecnico">Tecnico</option>
                  <option value="supervisor">Supervisor</option>
                </select>
                <input className="h-10 rounded-md border border-line px-3 text-sm" value={employeeForm.department} onChange={(event) => setEmployeeForm((prev) => ({ ...prev, department: event.target.value }))} />
              </div>
              <button className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-neutral-900 text-sm font-semibold text-white disabled:opacity-50" disabled={!employeeForm.name.trim()} onClick={createEmployee} type="button"><Plus size={16} /> Crear persona</button>
            </div>
          </div>

          <div className="rounded-md border border-line bg-white p-4">
            <h2 className="mb-3 text-base font-semibold">Nueva ruta</h2>
            <div className="space-y-3">
              <input className="h-10 w-full rounded-md border border-line px-3 text-sm" type="date" value={form.date} onChange={(event) => setForm((prev) => ({ ...prev, date: event.target.value }))} />
              <select className="h-10 w-full rounded-md border border-line px-3 text-sm" value={form.vehicle_plate} onChange={(event) => setForm((prev) => ({ ...prev, vehicle_plate: event.target.value }))}>
                <option value="">Vehiculo *</option>
                {vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.plate}>{vehicle.plate} · {vehicle.type || vehicle.model || "Movil"}</option>)}
              </select>
              <div className="grid grid-cols-2 gap-2">
                <input className="h-10 rounded-md border border-line px-3 text-sm" value={form.start_time} onChange={(event) => setForm((prev) => ({ ...prev, start_time: event.target.value }))} />
                <input className="h-10 rounded-md border border-line px-3 text-sm" value={form.end_time} onChange={(event) => setForm((prev) => ({ ...prev, end_time: event.target.value }))} />
                <input className="h-10 rounded-md border border-line px-3 text-sm" type="number" value={form.tolerance_minutes} onChange={(event) => setForm((prev) => ({ ...prev, tolerance_minutes: Number(event.target.value) }))} />
                <input className="h-10 rounded-md border border-line px-3 text-sm" type="number" value={form.per_diem} onChange={(event) => setForm((prev) => ({ ...prev, per_diem: Number(event.target.value) }))} />
              </div>
              <input className="h-10 w-full rounded-md border border-line px-3 text-sm" placeholder="Notas" value={form.notes} onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))} />
              <button className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-apex text-sm font-semibold text-white" onClick={createRoute} type="button"><Save size={16} /> Crear ruta</button>
            </div>
          </div>
        </aside>

        <section className="space-y-5">
          <div className="rounded-md border border-line bg-white p-4">
            <h2 className="mb-3 text-base font-semibold">Equipo</h2>
            <div className="flex flex-wrap gap-2">
              {employees.map((employee) => {
                const value = employee.code || employeeName(employee);
                const active = form.employees.includes(value);
                return (
                  <button className={`rounded-md border px-3 py-2 text-xs font-semibold ${active ? "border-apex bg-apex/10 text-apex" : "border-line hover:bg-paper"}`} key={employee.id} onClick={() => setForm((prev) => ({ ...prev, employees: active ? prev.employees.filter((item) => item !== value) : [...prev.employees, value] }))} type="button">
                    {employeeName(employee)}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-md border border-line bg-white p-4">
            <div className="mb-3 flex items-center gap-2"><Route size={18} className="text-apex" /><h2 className="text-base font-semibold">Rutas recientes</h2></div>
            <div className="grid gap-3 md:grid-cols-2">
              {routes.map((route) => (
                <div className="rounded-md border border-line p-3" key={route.id}>
                  <div className="flex items-center justify-between gap-3"><p className="font-semibold">{route.vehicle_plate || "Sin vehiculo"}</p><span className="rounded-md bg-paper px-2 py-1 text-xs">{route.status}</span></div>
                  <p className="mt-2 text-sm text-neutral-600">{route.employees.join(", ") || "Sin equipo"}</p>
                  <p className="mt-1 text-xs text-neutral-500">{route.start_time || "--"} - {route.end_time || "--"}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </section>
    </div>
  );
}
