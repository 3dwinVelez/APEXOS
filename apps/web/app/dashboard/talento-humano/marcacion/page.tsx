"use client";

import { api } from "@/lib/api";
import { getGpsFix, type GpsFix } from "@/lib/gps";
import { ArrowLeft, CheckCircle2, ExternalLink, MapPin, Navigation, RefreshCw, Truck } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Employee = { id: number; code: string; metadata: { name: string }; user: { name: string } };
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

function mapsUrl(gps: GpsFix) {
  return `https://www.google.com/maps?q=${gps.latitude},${gps.longitude}&z=17`;
}

function osmEmbedUrl(gps: GpsFix) {
  const delta = 0.004;
  const bbox = [
    gps.longitude - delta,
    gps.latitude - delta,
    gps.longitude + delta,
    gps.latitude + delta
  ].join(",");
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${gps.latitude},${gps.longitude}`;
}

export default function MobilePunchPage() {
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [routes, setRoutes] = useState<TimeRoute[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [message, setMessage] = useState("");
  const [extraReason, setExtraReason] = useState("");
  const [gps, setGps] = useState<GpsFix | null>(null);
  const [gpsStatus, setGpsStatus] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [view, setView] = useState<"marcar" | "historial">("marcar");

  async function load() {
    const [me, routeData, attendanceData] = await Promise.all([
      api<Employee>("/api/v1/hr/me").catch(() => null),
      api<TimeRoute[]>("/api/v1/hr/routes").catch(() => []),
      api<Attendance[]>("/api/v1/hr/attendance").catch(() => [])
    ]);
    setEmployee(me);
    setRoutes(routeData);
    setAttendance(attendanceData);
  }

  useEffect(() => {
    load();
  }, []);

  const userName = employee ? employee.code || employeeName(employee) : "";
  const currentAttendance = attendance.find((item) => item.user_name === userName) || { user_name: userName, next_type: "entrada", punches: [] };
  const doneTypes = new Set(currentAttendance.punches.map((punch) => punch.type) || []);
  const nextType = currentAttendance.next_type || "entrada";
  const displayName = employee ? employeeName(employee) : "";
  const route = routes.find((item) => item.employees.includes(userName)) || routes.find((item) => displayName && item.employees.includes(displayName));
  const vehiclePlate = route?.vehicle_plate || "";

  useEffect(() => {
    if (!employee || !gps || !userName) return;
    const timer = window.setInterval(() => {
      getGpsFix(8000).then((fix) => {
        setGps(fix);
        setGpsStatus("ok");
        return api("/api/v1/hr/gps/ping", {
          method: "POST",
          body: JSON.stringify({
            user_name: userName,
            employee_id: employee.id,
            vehicle_plate: vehiclePlate,
            route_id: route?.id,
            ...fix,
            source: "mobile_live_presence"
          })
        }).catch(() => undefined);
      }).catch(() => undefined);
    }, 30000);
    return () => window.clearInterval(timer);
  }, [employee?.id, gps, userName, vehiclePlate, route?.id]);

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
        extra_reason: type === "salida" ? extraReason : undefined,
        metadata: { source: "apexos-mobile", current_user_only: true }
      })
    });
    setExtraReason("");
    setMessage(`${punchLabels[type].title} registrado.`);
    await load();
  }

  return (
    <div className="mx-auto max-w-md space-y-4 pb-24 md:pb-8">
      <header className="sticky top-0 z-20 -mx-4 border-b border-line bg-paper/95 px-4 py-3 backdrop-blur md:static md:mx-0 md:border-0 md:bg-transparent md:px-0">
        <Link className="mb-3 inline-flex h-11 items-center gap-2 rounded-md pr-3 text-sm font-medium text-neutral-600 hover:text-apex" href="/dashboard/talento-humano"><ArrowLeft size={18} /> Control de horarios</Link>
        <p className="text-sm font-medium text-apex">Marcacion movil</p>
        <h1 className="text-2xl font-semibold">Mi jornada</h1>
      </header>

      {message ? <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-900">{message}</div> : null}

      <section className="grid grid-cols-2 gap-2 rounded-md border border-line bg-white p-1 shadow-sm">
        <button className={`h-12 rounded-md text-base font-semibold ${view === "marcar" ? "bg-apex text-white" : "text-neutral-700"}`} onClick={() => setView("marcar")} type="button">
          Marcar
        </button>
        <button className={`h-12 rounded-md text-base font-semibold ${view === "historial" ? "bg-apex text-white" : "text-neutral-700"}`} onClick={() => setView("historial")} type="button">
          Historial
        </button>
      </section>

      {view === "marcar" ? (
        <>
          <section className="rounded-md border border-line bg-white p-4 shadow-sm">
            <div className="grid gap-3">
              <div className="rounded-md bg-paper p-3">
                <p className="text-xs font-semibold uppercase text-neutral-500">Usuario conectado</p>
                <p className="mt-1 text-base font-semibold">{employee ? employeeName(employee) : "Empleado no asociado"}</p>
              </div>
            </div>
            <div className="mt-4 rounded-md bg-paper p-3 text-sm text-neutral-700">
              <Truck className="mr-2 inline text-apex" size={15} /> {route ? `Ruta ${route.id} · ${route.start_time || "--"} - ${route.end_time || "--"}` : "Sin ruta asignada para este vehiculo/equipo"}
            </div>
            {nextType === "salida" ? (
              <textarea className="mt-3 min-h-24 w-full rounded-md border border-line px-3 py-3 text-base" placeholder="Justificacion si estas cerrando fuera de tu horario habitual" value={extraReason} onChange={(event) => setExtraReason(event.target.value)} />
            ) : null}
            <button className="mt-3 inline-flex h-12 w-full items-center justify-center gap-2 rounded-md border border-line text-base font-semibold hover:bg-paper" onClick={refreshGps} type="button">
              <RefreshCw className={gpsStatus === "loading" ? "animate-spin" : ""} size={17} />
              {gpsStatus === "loading" ? "Obteniendo GPS..." : gpsStatus === "ok" && gps ? `GPS activo (${Math.round(gps.accuracy_meters || 0)}m)` : "Activar GPS obligatorio"}
            </button>
            {gpsStatus === "error" ? <p className="mt-2 text-xs font-semibold text-red-700">GPS obligatorio para marcar. Habilita ubicacion en el navegador.</p> : null}
            {gps ? (
              <div className="mt-3 overflow-hidden rounded-md border border-line bg-white">
                <iframe className="h-44 w-full border-0" src={osmEmbedUrl(gps)} title="Mi ubicacion GPS" loading="lazy" />
                <div className="flex items-center justify-between gap-2 p-3 text-xs text-neutral-600">
                  <span><Navigation className="mr-1 inline text-apex" size={13} />{gps.latitude.toFixed(6)}, {gps.longitude.toFixed(6)} · {Math.round(gps.accuracy_meters || 0)}m</span>
                  <a className="inline-flex h-10 items-center gap-2 rounded-md bg-apex px-3 text-xs font-semibold text-white" href={mapsUrl(gps)} target="_blank" rel="noreferrer">
                    Mapa <ExternalLink size={13} />
                  </a>
                </div>
              </div>
            ) : null}
          </section>

          <section className="space-y-3">
            {punchOrder.map((type) => {
              const done = doneTypes.has(type);
              const enabled = type === nextType && !!employee;
              const cfg = punchLabels[type];
              return (
                <button className={`min-h-24 w-full rounded-md border p-4 text-left transition active:scale-[0.99] ${enabled ? "border-apex bg-white shadow-sm" : "border-line bg-white opacity-70"}`} disabled={!enabled} key={type} onClick={() => mark(type)} type="button">
                  <div className="flex items-center gap-3">
                    <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-md text-white ${done ? "bg-emerald-600" : enabled ? cfg.color : "bg-neutral-300"}`}>
                      {done ? <CheckCircle2 size={24} /> : <MapPin size={23} />}
                    </div>
                    <div className="flex-1">
                      <p className="text-base font-semibold">{cfg.title}</p>
                      <p className="mt-1 text-sm text-neutral-500">{done ? "Registrado correctamente" : enabled ? cfg.desc : "No disponible aun"}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </section>
        </>
      ) : null}

      {view === "historial" ? <section className="rounded-md border border-line bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-base font-semibold">Historial de hoy</h2>
        <div className="space-y-2">
          {currentAttendance.punches.map((punch) => (
            <div className="flex min-h-11 items-center justify-between rounded-md bg-paper px-3 py-2 text-sm" key={punch.id}>
              <span>{punchLabels[punch.type].title || punch.type}</span>
              <span className="font-semibold">{punch.time}</span>
            </div>
          ))}
          {!currentAttendance.punches.length ? <p className="text-sm text-neutral-500">Sin marcaciones hoy.</p> : null}
        </div>
      </section> : null}

      {view === "marcar" ? <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-white/95 p-3 backdrop-blur md:hidden">
        <button
          className={`h-14 w-full rounded-md text-base font-semibold text-white shadow-sm ${punchLabels[nextType]?.color || "bg-apex"} disabled:bg-neutral-300`}
          disabled={!employee || !nextType}
          onClick={() => mark(nextType)}
          type="button"
        >
          {nextType ? punchLabels[nextType]?.title || "Registrar" : "Jornada completa"}
        </button>
      </div> : null}
    </div>
  );
}
