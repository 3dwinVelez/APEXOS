"use client";

import { api } from "@/lib/api";
import { ModalFrame } from "@/components/ui/ModalFrame";
import { ArrowLeft, Clock, Plus, Route, Save, UserPlus, Users } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Employee = { id: number; code: string; position: string; department: string; metadata: { name: string; document: string }; user: { name: string } };
type Vehicle = { id: number; plate: string; type: string; model: string };
type TimeRoute = { id: number; date: string; vehicle_plate: string; employees: string[]; start_time: string; end_time: string; status: string };
type Modal = "route" | "employee" | null;

function employeeName(employee: Employee) {
  return employee.metadata.name || employee.user.name || employee.code || `Empleado ${employee.id}`;
}

export default function RoutesPlanningPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [routes, setRoutes] = useState<TimeRoute[]>([]);
  const [message, setMessage] = useState("");
  const [modal, setModal] = useState<Modal>(null);
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
    setModal(null);
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
    setModal(null);
    await load();
  }

  const activeRoutes = useMemo(() => routes.filter((route) => route.status !== "closed"), [routes]);
  const totalAssigned = useMemo(() => routes.reduce((sum, route) => sum + (route.employees?.length || 0), 0), [routes]);

  return (
    <div className="space-y-5 pb-20 md:pb-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link className="mb-3 inline-flex h-11 items-center gap-2 rounded-md pr-3 text-sm font-medium text-neutral-600 hover:text-apex" href="/dashboard/talento-humano"><ArrowLeft size={18} /> Control de horarios</Link>
          <p className="text-sm font-medium text-apex">Talento Humano</p>
          <h1 className="text-2xl font-semibold md:text-3xl">Planeacion de rutas</h1>
        </div>
        <div className="grid w-full grid-cols-2 gap-2 md:w-auto md:flex">
          <button className="inline-flex h-12 items-center justify-center gap-2 rounded-md border border-line bg-white px-4 text-sm font-semibold hover:bg-paper md:h-10" onClick={() => setModal("employee")} type="button">
            <UserPlus size={16} /> Operario
          </button>
          <button className="inline-flex h-12 items-center justify-center gap-2 rounded-md bg-apex px-4 text-sm font-semibold text-white md:h-10" onClick={() => setModal("route")} type="button">
            <Plus size={16} /> Nueva ruta
          </button>
        </div>
      </header>

      {message ? <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-900">{message}</div> : null}

      <section className="grid gap-3 md:grid-cols-4">
        <div className="rounded-md border border-line bg-white p-4"><Route className="mb-3 text-apex" size={19} /><p className="text-2xl font-semibold">{routes.length}</p><p className="text-sm text-neutral-500">Rutas creadas</p></div>
        <div className="rounded-md border border-line bg-white p-4"><Clock className="mb-3 text-apex" size={19} /><p className="text-2xl font-semibold">{activeRoutes.length}</p><p className="text-sm text-neutral-500">Activas</p></div>
        <div className="rounded-md border border-line bg-white p-4"><Users className="mb-3 text-apex" size={19} /><p className="text-2xl font-semibold">{employees.length}</p><p className="text-sm text-neutral-500">Operarios</p></div>
        <div className="rounded-md border border-line bg-white p-4"><Users className="mb-3 text-apex" size={19} /><p className="text-2xl font-semibold">{totalAssigned}</p><p className="text-sm text-neutral-500">Asignaciones</p></div>
      </section>

      <section className="rounded-md border border-line bg-white p-4">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2"><Route size={18} className="text-apex" /><h2 className="text-base font-semibold">Rutas recientes</h2></div>
          <span className="rounded-md bg-paper px-2 py-1 text-xs">{routes.length}</span>
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          {routes.map((route) => (
            <article className="rounded-md border border-line p-4 transition hover:border-apex hover:bg-paper" key={route.id}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-semibold">{route.vehicle_plate || "Sin vehiculo"}</p>
                  <p className="mt-1 text-xs text-neutral-500">Ruta {route.id} · {new Date(route.date).toLocaleDateString()}</p>
                </div>
                <span className="rounded-md bg-white px-2 py-1 text-xs font-semibold text-neutral-600">{route.status}</span>
              </div>
              <p className="mt-3 text-sm text-neutral-600">{route.employees.join(", ") || "Sin equipo"}</p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-neutral-600">
                <span className="rounded-md bg-white px-2 py-1">{route.start_time || "--"} - {route.end_time || "--"}</span>
                <span className="rounded-md bg-white px-2 py-1">{route.employees.length} persona(s)</span>
              </div>
            </article>
          ))}
          {!routes.length ? <div className="col-span-full rounded-md border border-dashed border-line p-10 text-center text-sm text-neutral-500">No hay rutas creadas.</div> : null}
        </div>
      </section>

      {modal === "employee" ? (
        <ModalFrame title="Crear operario o tecnico" onClose={() => setModal(null)}>
          <div className="grid gap-3 md:grid-cols-2">
            <input className="h-12 rounded-md border border-line px-3 text-base md:text-sm" placeholder="Nombre completo" value={employeeForm.name} onChange={(event) => setEmployeeForm((prev) => ({ ...prev, name: event.target.value }))} />
            <input className="h-12 rounded-md border border-line px-3 text-base md:text-sm" placeholder="Documento" value={employeeForm.document} onChange={(event) => setEmployeeForm((prev) => ({ ...prev, document: event.target.value }))} />
            <input className="h-12 rounded-md border border-line px-3 text-base md:text-sm" placeholder="Codigo" value={employeeForm.code} onChange={(event) => setEmployeeForm((prev) => ({ ...prev, code: event.target.value }))} />
            <select className="h-12 rounded-md border border-line px-3 text-base md:text-sm" value={employeeForm.position} onChange={(event) => setEmployeeForm((prev) => ({ ...prev, position: event.target.value }))}>
              <option value="empleado">Operario</option>
              <option value="tecnico">Tecnico</option>
              <option value="supervisor">Supervisor</option>
            </select>
            <input className="h-12 rounded-md border border-line px-3 text-base md:col-span-2 md:text-sm" value={employeeForm.department} onChange={(event) => setEmployeeForm((prev) => ({ ...prev, department: event.target.value }))} />
          </div>
          <button className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-md bg-neutral-900 text-base font-semibold text-white disabled:opacity-50" disabled={!employeeForm.name.trim()} onClick={createEmployee} type="button"><UserPlus size={17} /> Crear persona</button>
        </ModalFrame>
      ) : null}

      {modal === "route" ? (
        <ModalFrame title="Nueva ruta operativa" onClose={() => setModal(null)}>
          <div className="grid gap-3 md:grid-cols-2">
            <input className="h-12 rounded-md border border-line px-3 text-base md:text-sm" type="date" value={form.date} onChange={(event) => setForm((prev) => ({ ...prev, date: event.target.value }))} />
            <select className="h-12 rounded-md border border-line px-3 text-base md:text-sm" value={form.vehicle_plate} onChange={(event) => setForm((prev) => ({ ...prev, vehicle_plate: event.target.value }))}>
              <option value="">Vehiculo *</option>
              {vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.plate}>{vehicle.plate} · {vehicle.type || vehicle.model || "Movil"}</option>)}
            </select>
            <input className="h-12 rounded-md border border-line px-3 text-base md:text-sm" value={form.start_time} onChange={(event) => setForm((prev) => ({ ...prev, start_time: event.target.value }))} />
            <input className="h-12 rounded-md border border-line px-3 text-base md:text-sm" value={form.end_time} onChange={(event) => setForm((prev) => ({ ...prev, end_time: event.target.value }))} />
            <input className="h-12 rounded-md border border-line px-3 text-base md:text-sm" type="number" value={form.tolerance_minutes} onChange={(event) => setForm((prev) => ({ ...prev, tolerance_minutes: Number(event.target.value) }))} />
            <input className="h-12 rounded-md border border-line px-3 text-base md:text-sm" type="number" value={form.per_diem} onChange={(event) => setForm((prev) => ({ ...prev, per_diem: Number(event.target.value) }))} />
            <input className="h-12 rounded-md border border-line px-3 text-base md:col-span-2 md:text-sm" placeholder="Notas" value={form.notes} onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))} />
          </div>
          <div className="mt-4 rounded-md border border-line bg-paper p-3">
            <p className="mb-2 text-sm font-semibold">Equipo asignado</p>
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
          <button className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-md bg-apex text-base font-semibold text-white" onClick={createRoute} type="button"><Save size={17} /> Crear ruta</button>
        </ModalFrame>
      ) : null}

      <div className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-2 gap-2 border-t border-line bg-white/95 p-3 backdrop-blur md:hidden">
        <button className="h-14 rounded-md border border-line bg-white text-base font-semibold" onClick={() => setModal("employee")} type="button">Operario</button>
        <button className="h-14 rounded-md bg-apex text-base font-semibold text-white" onClick={() => setModal("route")} type="button">Nueva ruta</button>
      </div>
    </div>
  );
}
