"use client";

import { api } from "@/lib/api";
import { getGpsFix, type GpsFix } from "@/lib/gps";
import { SignatureCapture } from "@/components/operations/SignatureCapture";
import { PhotoCapture, type CapturedFile } from "@/components/operations/PhotoCapture";
import { AlertTriangle, ArrowLeft, CheckCircle2, ExternalLink, MapPin, Navigation, Plus, RefreshCw, Truck, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Employee = { id: number; code: string; user_type?: string; position?: string; metadata: { name: string; user_type?: string }; user: { name: string } };
type Attendance = { user_name: string; next_type: string | null; punches: Array<{ id: number; type: string; time: string; vehicle_plate: string }> };
type TimeRoute = { id: number; vehicle_plate: string; employees: string[]; start_time: string; end_time: string };
type PreopItem = { section: string; item_key: string; label: string; severity: string; blocks_route: boolean; evidence_required: boolean };
type PreopChecklist = { id: number; route_id?: number; plate: string; checklist_status: string; risk_level: string };
type PreopTemplate = { sections: string[]; items: PreopItem[] };
type PreopAnswer = { answer: string; observations: string; evidence: CapturedFile | null };
type PunchResponse = { next?: string | null; preoperational_required?: boolean; preoperational_checklist?: PreopChecklist | null };
type ActivityType = { id: number; name: string; active: boolean };
type WorkActivity = { id: number; activity_type_name: string; observation: string; occurred_at: string; latitude: number; longitude: number; accuracy_meters?: number; evidence?: Array<{ base64_data?: string; file_name?: string }> };
type WorkSession = { id: number; active: boolean; session: { id: number; status: string; started_at: string; closed_at?: string } | null; activities: WorkActivity[]; alerts: Array<{ type: string; severity: string; message: string }> };

const overtimeReasons = [
  ["entrega_cliente_extendida", "Entrega extendida por solicitud del cliente"],
  ["congestion_vial", "Congestion vial o cierre de via"],
  ["reintento_entrega", "Reintento de entrega autorizado"],
  ["novedad_operativa", "Novedad operativa en ruta"],
  ["vehiculo_varado", "Vehiculo varado o falla mecanica"],
  ["cargue_descargue_extendido", "Cargue o descargue extendido"],
  ["validacion_inventario", "Validacion de inventario o piezas"],
  ["servicio_critico", "Cierre de servicio critico"],
  ["autorizacion_supervisor", "Extension autorizada por supervisor"],
  ["clima_seguridad", "Clima, seguridad o condicion externa"]
];

const punchOrder = ["entrada", "inicio_almuerzo", "fin_almuerzo", "salida"];
const punchLabels: Record<string, { title: string; desc: string; color: string }> = {
  entrada: { title: "Inicio jornada", desc: "Registra tu entrada al trabajo", color: "bg-blue-600" },
  inicio_almuerzo: { title: "Salida almuerzo", desc: "Registra tu salida a almorzar", color: "bg-amber-500" },
  fin_almuerzo: { title: "Retorno almuerzo", desc: "Registra tu regreso", color: "bg-emerald-600" },
  salida: { title: "Fin jornada", desc: "Registra tu cierre del dia", color: "bg-violet-600" }
};

function employeeName(employee: Employee | null) {
  return employee?.metadata?.name || employee?.user?.name || employee?.code || "";
}

function mapsUrl(gps: GpsFix) {
  return `https://www.google.com/maps?q=${gps.latitude},${gps.longitude}&z=17`;
}

function normalizeKey(value: string) {
  return String(value || "").trim().toLowerCase();
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
  const [extraDetail, setExtraDetail] = useState("");
  const [extraEvidence, setExtraEvidence] = useState<CapturedFile | null>(null);
  const [gps, setGps] = useState<GpsFix | null>(null);
  const [gpsUpdatedAt, setGpsUpdatedAt] = useState(0);
  const [gpsStatus, setGpsStatus] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [view, setView] = useState<"marcar" | "historial">("marcar");
  const [preop, setPreop] = useState<PreopChecklist | null>(null);
  const [preopTemplate, setPreopTemplate] = useState<PreopTemplate>({ sections: [], items: [] });
  const [preopAnswers, setPreopAnswers] = useState<Record<string, PreopAnswer>>({});
  const [preopMessage, setPreopMessage] = useState("");
  const [mileageInitial, setMileageInitial] = useState("");
  const [fuelLevel, setFuelLevel] = useState("");
  const [signature, setSignature] = useState<CapturedFile | null>(null);
  const [session, setSession] = useState<WorkSession | null>(null);
  const [activityTypes, setActivityTypes] = useState<ActivityType[]>([]);
  const [activityModal, setActivityModal] = useState(false);
  const [activityTypeId, setActivityTypeId] = useState("");
  const [activityObservation, setActivityObservation] = useState("");
  const [activityPhoto, setActivityPhoto] = useState<CapturedFile | null>(null);
  const [activitySaving, setActivitySaving] = useState(false);
  const [activityMessage, setActivityMessage] = useState("");
  const [markingType, setMarkingType] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [me, routeData, attendanceData, typesData, sessionData] = await Promise.all([
      api<Employee>("/api/v1/hr/me").catch(() => null),
      api<TimeRoute[]>("/api/v1/hr/routes").catch(() => []),
      api<Attendance[]>("/api/v1/hr/attendance").catch(() => []),
      api<ActivityType[]>("/api/v1/hr/activity-types").catch(() => []),
      api<WorkSession>("/api/v1/hr/work-sessions/current").catch(() => null)
    ]);
    setEmployee(me);
    setRoutes(routeData);
    setAttendance(attendanceData);
    setActivityTypes(typesData);
    setSession(sessionData);
    if (typesData[0]) setActivityTypeId((current) => current || String(typesData[0].id));
    const active = await api<{ checklist: PreopChecklist | null; template: PreopTemplate }>("/api/v1/hr/routes/preop/active").catch(() => null);
    if (active?.checklist) {
      setPreop(active.checklist);
      setPreopTemplate(active.template);
      setPreopAnswers(Object.fromEntries(active.template.items.map((item) => [item.item_key, { answer: "cumple", observations: "", evidence: null }])));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const userName = employee?.code || employeeName(employee) || "";
  const currentAttendance = attendance.find((item) => {
    const match = item.user_name === userName || item.user_name === employeeName(employee);
    return match;
  }) || { user_name: userName, next_type: "entrada", punches: [] };
  const doneTypes = new Set(currentAttendance.punches.map((punch) => punch.type) || []);
  const nextType = currentAttendance.next_type || "entrada";
  const displayName = employeeName(employee) || "";
  const route = routes.find((item) => {
    const routeEmployees = item.employees || [];
    return routeEmployees.some((emp) => {
      const empKey = normalizeKey(emp);
      return empKey === normalizeKey(userName) || empKey === normalizeKey(employee?.code || "") || empKey === normalizeKey(displayName);
    });
  }) || routes.find((item) => displayName && item.employees.includes(displayName));
  const vehiclePlate = route?.vehicle_plate || "";
  const isClosingLate = (() => {
    if (nextType !== "salida" || !route?.end_time) return false;
    const [hour, minute] = route.end_time.split(":").map(Number);
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes() > hour * 60 + minute;
  })();

  useEffect(() => {
    if (!employee || !userName) return;
    let mounted = true;
    const timer = window.setInterval(async () => {
      if (document.hidden || !mounted) return;
      try {
        const fix = await getGpsFix(8000);
        if (!mounted) return;
        setGps(fix);
        setGpsUpdatedAt(Date.now());
        setGpsStatus("ok");
        api("/api/v1/hr/gps/ping", {
          method: "POST",
          body: JSON.stringify({
            user_name: userName,
            employee_id: employee.id,
            vehicle_plate: vehiclePlate,
            route_id: route?.id,
            ...fix,
            source: "mobile_live_presence"
          })
        }).catch(() => {
          if (mounted) setGpsStatus("error");
        });
      } catch {
        if (mounted) setGpsStatus("error");
      }
    }, 30000);
    return () => {
      mounted = false;
      if (timer) window.clearInterval(timer);
    };
  }, [employee, route?.id, userName, vehiclePlate]);

  async function refreshGps() {
    // Use cached GPS if less than 25s old — avoids blocking the UI
    if (gps && Date.now() - gpsUpdatedAt < 25000) return gps;
    setGpsStatus("loading");
    try {
      const fix = await getGpsFix();
      setGps(fix);
      setGpsStatus("ok");
      setGpsUpdatedAt(Date.now());
      if (userName) {
        void api("/api/v1/hr/gps/ping", {
          method: "POST",
          body: JSON.stringify({
            user_name: userName,
            employee_id: employee?.id,
            vehicle_plate: vehiclePlate,
            route_id: route?.id,
            ...fix,
            source: "mobile_presence"
          })
        }).catch(() => {
          setMessage("GPS capturado, pero no fue posible sincronizar la presencia en vivo. La marcacion guardara la ubicacion al registrarse.");
        });
      }
      return fix;
    } catch (error) {
      setGpsStatus("error");
      setMessage(error instanceof Error ? error.message : "GPS no disponible.");
      return null;
    }
  }

  async function mark(type: string) {
    if (!employee || markingType) return;
    setMarkingType(type);
    setMessage("");
    try {
      const fix = await refreshGps();
      if (!fix) return;
      if (type === "salida" && isClosingLate && (!extraReason || !extraDetail.trim() || !extraEvidence)) {
        setMessage("Cierre fuera de horario: selecciona motivo, escribe el sustento y adjunta evidencia fotografica.");
        return;
      }
      const response = await api<PunchResponse>("/api/v1/hr/time-punches", {
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
          extra_detail: type === "salida" ? extraDetail : undefined,
          extra_evidence: type === "salida" ? extraEvidence : undefined,
          metadata: { source: "apexos-mobile", current_user_only: true }
        })
      });
      if (response.preoperational_required && response.preoperational_checklist) {
        const template = await api<PreopTemplate>("/api/v1/hr/routes/preop/template");
        setPreop(response.preoperational_checklist);
        setPreopTemplate(template);
        setPreopAnswers(Object.fromEntries(template.items.map((item) => [item.item_key, { answer: "cumple", observations: "", evidence: null }])));
        setPreopMessage("Checklist preoperacional obligatorio antes de iniciar ruta.");
        setMessage("Completa el checklist preoperacional para habilitar la Entrada.");
        return;
      }
      // Optimistically update UI so next button is immediately available
      const nextPunchType = response.next || null;
      setAttendance((prev) => {
        const updated = prev.map((item) =>
          item.user_name === userName
            ? { ...item, next_type: nextPunchType, punches: [...item.punches, { id: Date.now(), type, time: new Date().toLocaleTimeString(), vehicle_plate: vehiclePlate }] }
            : item
        );
        if (!updated.some((item) => item.user_name === userName)) {
          updated.push({ user_name: userName, next_type: nextPunchType, punches: [{ id: Date.now(), type, time: new Date().toLocaleTimeString(), vehicle_plate: vehiclePlate }] });
        }
        return updated;
      });
      setExtraReason("");
      setExtraDetail("");
      setExtraEvidence(null);
      setMessage(`${punchLabels[type].title} registrado.`);
      load().catch(() => undefined);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No fue posible registrar la marcacion.");
    } finally {
      setMarkingType(null);
    }
  }

  async function openActivityModal() {
    setActivityMessage("");
    if (!session?.active) {
      setMessage("Marca Entrada antes de registrar actividades.");
      await load();
      return;
    }
    setActivityModal(true);
    if (!gps) {
      void refreshGps();
    }
  }

  async function saveActivity() {
    setActivityMessage("");
    if (!session?.active) {
      setActivityMessage("No hay jornada activa. Marca Entrada antes de registrar actividades.");
      await load();
      return;
    }
    if (!activityTypeId) {
      setActivityMessage("Selecciona el tipo de actividad.");
      return;
    }
    if (!activityPhoto) {
      setActivityMessage("Toma o adjunta una foto de evidencia para continuar.");
      return;
    }
    if (!activityObservation.trim()) {
      setActivityMessage("Escribe una observacion corta de la actividad.");
      return;
    }
    const fix = await refreshGps();
    if (!fix) {
      setActivityMessage("GPS obligatorio. Habilita la ubicacion del navegador y reintenta.");
      return;
    }
    setActivitySaving(true);
    try {
      await api("/api/v1/hr/work-activities", {
        method: "POST",
        body: JSON.stringify({
          activity_type_id: Number(activityTypeId),
          latitude: fix.latitude,
          longitude: fix.longitude,
          accuracy_meters: fix.accuracy_meters,
          route_id: route?.id,
          vehicle_plate: vehiclePlate,
          observation: activityObservation,
          photo: activityPhoto,
          metadata: { source: "apexos-mobile-activity" }
        })
      });
      setActivityObservation("");
      setActivityPhoto(null);
      setActivityModal(false);
      setMessage("Actividad registrada con evidencia.");
      load().catch(() => undefined);
    } catch (error) {
      setActivityMessage(error instanceof Error ? error.message : "No fue posible registrar la actividad.");
    } finally {
      setActivitySaving(false);
    }
  }

  async function evidenceFile(file: File, itemKey: string) {
    const reader = new FileReader();
    reader.onload = () => setPreopAnswers((current) => ({ ...current, [itemKey]: { ...(current[itemKey] || { answer: "cumple", observations: "", evidence: null }), evidence: { base64: String(reader.result || ""), size: file.size, type: file.type, name: file.name } } }));
    reader.readAsDataURL(file);
  }

  async function submitPreop() {
    if (!preop) return;
    const missing = preopTemplate.items.find((item) => {
      const answer = preopAnswers[item.item_key];
      if (!answer) return true;
      if (answer.answer === "no_cumple" && !answer.observations.trim()) return true;
      if (answer.answer === "no_cumple" && (item.blocks_route || item.evidence_required) && !answer.evidence) return true;
      return false;
    });
    if (missing) {
      setPreopMessage(`Completa observacion/evidencia requerida: ${missing.label}`);
      return;
    }
    if (!signature) {
      setPreopMessage("La declaracion responsable requiere firma digital.");
      return;
    }
    const result = await api<{ status: string; route_authorized: boolean }>(`/api/v1/hr/routes/preop/${preop.id}/submit`, {
      method: "POST",
      body: JSON.stringify({
        mileage_initial: Number(mileageInitial || 0),
        fuel_level: fuelLevel,
        location_lat: gps?.latitude,
        location_lng: gps?.longitude,
        digital_signature: signature.base64,
        observations: preopMessage,
        answers: preopTemplate.items.map((item) => {
          const answer = preopAnswers[item.item_key];
          return {
            item_key: item.item_key,
            answer: answer?.answer || "cumple",
            observations: answer?.observations || "",
            evidence: answer?.evidence ? [{ evidence_type: "photo", file_name: answer.evidence.name, base64_data: answer.evidence.base64, mime_type: answer.evidence.type, file_size: answer.evidence.size }] : []
          };
        })
      })
    });
    setMessage(result.route_authorized ? "Checklist aprobado. Operacion vehicular habilitada." : "Operacion vehicular bloqueada por novedad critica.");
    setPreop(null);
    await load();
    if (result.route_authorized && nextType === "entrada") {
      await mark("entrada");
    }
  }

  return (
    <div className="mx-auto max-w-md space-y-4 pb-32 md:pb-8">
      <header className="sticky top-0 z-20 -mx-3 border-b border-line bg-paper/95 px-3 py-3 backdrop-blur sm:-mx-4 sm:px-4 md:static md:mx-0 md:border-0 md:bg-transparent md:px-0">
        <Link className="mb-3 inline-flex h-11 items-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-medium text-neutral-600 hover:text-apex md:border-0 md:bg-transparent md:px-0" href="/dashboard/talento-humano"><ArrowLeft size={18} /> Control de horarios</Link>
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
          <section className="rounded-md border border-line bg-white p-3 shadow-sm sm:p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase text-neutral-500">Estado operativo</p>
                <h2 className="mt-1 text-lg font-semibold">{session?.active ? "Jornada activa" : doneTypes.has("salida") ? "Jornada cerrada" : "Sin jornada activa"}</h2>
                <p className="mt-1 text-sm text-neutral-600">{session?.active ? "Puedes registrar actividades con GPS, foto y observacion." : "Marca Entrada para iniciar trazabilidad operativa."}</p>
              </div>
              <span className={`rounded-md px-2 py-1 text-xs font-semibold ${session?.active ? "bg-emerald-50 text-emerald-700" : "bg-paper text-neutral-600"}`}>{session?.activities?.length || 0} actividades</span>
            </div>
            {session?.alerts?.length ? (
              <div className="mt-3 space-y-2">
                {session.alerts.slice(0, 2).map((alert) => <p className="rounded-md bg-amber-50 p-2 text-xs font-semibold text-amber-900" key={alert.type}><AlertTriangle className="mr-1 inline" size={13} />{alert.message}</p>)}
              </div>
            ) : null}
            <button className="mt-3 inline-flex h-13 min-h-12 w-full items-center justify-center gap-2 rounded-md bg-apex px-4 text-base font-semibold text-white disabled:bg-neutral-300" disabled={!session?.active} onClick={openActivityModal} type="button">
              <Plus size={18} /> Registrar actividad
            </button>
            {!session?.active ? <p className="mt-2 text-xs font-semibold text-neutral-500">Disponible despues de marcar Entrada.</p> : null}
          </section>

          <section className="rounded-md border border-line bg-white p-3 shadow-sm sm:p-4">
            <div className="grid gap-3">
              <div className="rounded-md bg-paper p-3">
                <p className="text-xs font-semibold uppercase text-neutral-500">Usuario conectado</p>
                <p className="mt-1 break-words text-base font-semibold">{employee ? employeeName(employee) : "Empleado no asociado"}</p>
              </div>
            </div>
            <div className="mt-4 rounded-md bg-paper p-3 text-sm text-neutral-700">
              <Truck className="mr-2 inline text-apex" size={15} /> {route ? `Horario ${route.id} - ${route.start_time || "--"} - ${route.end_time || "--"}` : "Sin horario asignado para este usuario/equipo"}
            </div>
            {nextType === "salida" && isClosingLate ? (
              <div className="mt-3 space-y-3 rounded-md border border-amber-200 bg-amber-50 p-3">
                <div>
                  <p className="text-sm font-semibold text-amber-950">Extension de horario detectada</p>
                  <p className="mt-1 text-xs text-amber-900">Para cerrar jornada fuera del horario planeado debes seleccionar motivo, sustentar y adjuntar foto.</p>
                </div>
                <select className="h-12 w-full rounded-md border border-amber-200 bg-white px-3 text-base" value={extraReason} onChange={(event) => setExtraReason(event.target.value)}>
                  <option value="">Motivo de extension *</option>
                  {overtimeReasons.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
                <textarea className="min-h-24 w-full rounded-md border border-amber-200 bg-white px-3 py-3 text-base" placeholder="Sustento obligatorio: quien autorizo, punto, cliente o novedad" value={extraDetail} onChange={(event) => setExtraDetail(event.target.value)} />
                <PhotoCapture label="Foto obligatoria de soporte de extension" required value={extraEvidence} onChange={setExtraEvidence} />
              </div>
            ) : nextType === "salida" ? (
              <textarea className="mt-3 min-h-24 w-full rounded-md border border-line px-3 py-3 text-base" placeholder="Observacion opcional de cierre" value={extraDetail} onChange={(event) => setExtraDetail(event.target.value)} />
            ) : null}
            <button className="mt-3 inline-flex h-12 w-full items-center justify-center gap-2 rounded-md border border-line text-base font-semibold hover:bg-paper" onClick={refreshGps} type="button">
              <RefreshCw className={gpsStatus === "loading" ? "animate-spin" : ""} size={17} />
              {gpsStatus === "loading" ? "Obteniendo GPS..." : gpsStatus === "ok" && gps ? `GPS activo (${Math.round(gps.accuracy_meters || 0)}m)` : "Activar GPS obligatorio"}
            </button>
            {gpsStatus === "error" ? <p className="mt-2 text-xs font-semibold text-red-700">GPS obligatorio para marcar. Habilita ubicacion en el navegador.</p> : null}
            {gps ? (
              <div className="mt-3 overflow-hidden rounded-md border border-line bg-white">
                <iframe className="h-40 w-full border-0 sm:h-44" src={osmEmbedUrl(gps)} title="Mi ubicacion GPS" loading="lazy" />
                <div className="grid gap-2 p-3 text-xs text-neutral-600 sm:flex sm:items-center sm:justify-between">
                  <span className="min-w-0 break-words"><Navigation className="mr-1 inline text-apex" size={13} />{gps.latitude.toFixed(6)}, {gps.longitude.toFixed(6)} · {Math.round(gps.accuracy_meters || 0)}m</span>
                  <a className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-apex px-3 text-xs font-semibold text-white sm:w-auto" href={mapsUrl(gps)} target="_blank" rel="noreferrer">
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
                  <button className={`min-h-24 w-full rounded-md border p-4 text-left transition active:scale-[0.99] ${enabled ? "border-apex bg-white shadow-sm" : "border-line bg-white opacity-70"}`} disabled={!enabled || Boolean(markingType)} key={type} onClick={() => mark(type)} type="button">
                  <div className="flex items-center gap-3">
                    <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-md text-white ${done ? "bg-emerald-600" : enabled ? cfg.color : "bg-neutral-300"}`}>
                      {done ? <CheckCircle2 size={24} /> : <MapPin size={23} />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-base font-semibold">{cfg.title}</p>
                      <p className="mt-1 text-sm text-neutral-500">{markingType === type ? "Registrando..." : done ? "Registrado correctamente" : enabled ? cfg.desc : "No disponible aun"}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </section>
        </>
      ) : null}

      {view === "historial" ? <section className="rounded-md border border-line bg-white p-3 shadow-sm sm:p-4">
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
        <h3 className="mb-3 mt-5 text-base font-semibold">Timeline operativo</h3>
        <div className="space-y-2">
          {[...currentAttendance.punches.map((punch) => ({ kind: "marca", at: punch.time, title: punchLabels[punch.type]?.title || punch.type, detail: punch.vehicle_plate || "Marcacion" })),
            ...(session?.activities || []).map((item) => ({ kind: "actividad", at: new Date(item.occurred_at).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" }), title: item.activity_type_name, detail: item.observation }))
          ].map((event, index) => (
            <div className="flex gap-3 rounded-md bg-paper p-3" key={`${event.kind}-${index}`}>
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${event.kind === "marca" ? "bg-apex" : "bg-emerald-600"}`}>{index + 1}</span>
              <div className="min-w-0">
                <p className="text-sm font-semibold">{event.title}</p>
                <p className="mt-1 text-xs text-neutral-500">{event.at} - {event.detail}</p>
              </div>
            </div>
          ))}
        </div>
      </section> : null}

      {view === "marcar" ? <div className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-white/95 px-3 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3 backdrop-blur md:hidden">
        <button
          className={`h-14 w-full rounded-md text-base font-semibold text-white shadow-sm ${punchLabels[nextType]?.color || "bg-apex"} disabled:bg-neutral-300`}
          disabled={!employee || !nextType || Boolean(markingType)}
          onClick={() => mark(nextType)}
          type="button"
        >
          {markingType ? "Registrando..." : nextType ? punchLabels[nextType]?.title || "Registrar" : "Jornada completa"}
        </button>
      </div> : null}

      {preop ? (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-neutral-950/50 p-0 sm:p-3">
          <section className="min-h-dvh bg-white p-3 shadow-xl sm:mx-auto sm:min-h-0 sm:max-w-3xl sm:rounded-md sm:p-4">
            <div className="sticky top-0 z-10 -mx-3 mb-4 border-b border-line bg-white/95 px-3 pb-3 pt-3 backdrop-blur sm:static sm:mx-0 sm:bg-transparent sm:px-0 sm:pt-0">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-apex">Validacion preoperacional</p>
                  <h2 className="text-xl font-semibold">Checklist preoperacional obligatorio</h2>
                  <p className="mt-1 text-sm text-neutral-600">Placa {preop.plate}. Sin aprobacion no se habilita el inicio de ruta.</p>
                </div>
                <button className="inline-flex h-10 shrink-0 items-center justify-center rounded-md border border-line px-3 text-sm font-semibold text-neutral-700" onClick={() => setPreop(null)} type="button">Volver</button>
              </div>
            </div>
            {preopMessage ? <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-900">{preopMessage}</div> : null}
            <div className="mb-4 grid gap-3 md:grid-cols-2">
              <input className="h-12 w-full rounded-md border border-line px-3 text-base md:text-sm" placeholder="Kilometraje inicial" value={mileageInitial} onChange={(event) => setMileageInitial(event.target.value)} />
              <input className="h-12 w-full rounded-md border border-line px-3 text-base md:text-sm" placeholder="Nivel combustible / carga" value={fuelLevel} onChange={(event) => setFuelLevel(event.target.value)} />
            </div>
            <div className="space-y-4">
              {preopTemplate.sections.map((section) => (
                <div className="rounded-md border border-line p-3" key={section}>
                  <h3 className="mb-3 font-semibold">{section}</h3>
                  <div className="space-y-3">
                    {preopTemplate.items.filter((item) => item.section === section).map((item) => {
                      const answer = preopAnswers[item.item_key] || { answer: "cumple", observations: "", evidence: null };
                      return (
                        <div className="rounded-md bg-paper p-3" key={item.item_key}>
                          <div className="grid gap-2 sm:flex sm:items-start sm:justify-between">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold">{item.label}</p>
                              <p className={`text-xs font-semibold ${item.blocks_route ? "text-red-700" : "text-amber-700"}`}>{item.blocks_route ? "Critico: bloquea ruta" : "Novedad media"}</p>
                            </div>
                            <div className="grid grid-cols-3 gap-1 text-xs">
                              {["cumple", "no_cumple", "no_aplica"].map((value) => (
                                <button className={`h-11 min-w-0 rounded-md px-1 font-semibold ${answer.answer === value ? "bg-apex text-white" : "bg-white"}`} key={value} onClick={() => setPreopAnswers((current) => ({ ...current, [item.item_key]: { ...answer, answer: value } }))} type="button">
                                  {value === "cumple" ? "Cumple" : value === "no_cumple" ? "No cumple" : "N/A"}
                                </button>
                              ))}
                            </div>
                          </div>
                          {answer.answer === "no_cumple" ? (
                            <div className="mt-3 grid gap-2 md:grid-cols-[1fr_220px]">
                              <textarea className="min-h-24 rounded-md border border-line p-3 text-base md:text-sm" placeholder="Describe la novedad y accion tomada" value={answer.observations} onChange={(event) => setPreopAnswers((current) => ({ ...current, [item.item_key]: { ...answer, observations: event.target.value } }))} />
                              <label className="flex min-h-24 cursor-pointer flex-col items-center justify-center rounded-md border border-dashed border-line bg-white p-2 text-center text-xs font-semibold">
                                {answer.evidence ? answer.evidence.name : "Adjuntar evidencia"}
                                <input className="hidden" type="file" accept="image/*,application/pdf,video/*" onChange={(event) => event.target.files?.[0] && evidenceFile(event.target.files[0], item.item_key)} />
                              </label>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4">
              <SignatureCapture label="Firma / declaracion responsable del conductor" required value={signature} onChange={setSignature} />
            </div>
            <button className="mt-4 h-12 w-full rounded-md bg-apex text-base font-semibold text-white" onClick={submitPreop} type="button">Enviar checklist y validar ruta</button>
          </section>
        </div>
      ) : null}

      {activityModal ? (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-neutral-950/50 p-0 sm:p-3">
          <section className="min-h-dvh bg-white p-3 shadow-xl sm:mx-auto sm:min-h-0 sm:max-w-md sm:rounded-md sm:p-4">
            <div className="mb-4 flex items-start justify-between gap-3 border-b border-line pb-3">
              <div>
                <p className="text-sm font-semibold text-apex">Trazabilidad operativa</p>
                <h2 className="text-xl font-semibold">Registrar actividad</h2>
                <p className="mt-1 text-sm text-neutral-600">GPS, foto y observacion son obligatorios.</p>
              </div>
              <button className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-line" onClick={() => setActivityModal(false)} type="button" aria-label="Cerrar"><X size={18} /></button>
            </div>
            <div className="space-y-3">
              {activityMessage ? <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-900">{activityMessage}</div> : null}
              <select className="h-12 w-full rounded-md border border-line bg-white px-3 text-base" value={activityTypeId} onChange={(event) => setActivityTypeId(event.target.value)}>
                {activityTypes.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}
              </select>
              <button className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-md border border-line text-base font-semibold" onClick={refreshGps} type="button">
                <RefreshCw className={gpsStatus === "loading" ? "animate-spin" : ""} size={17} />
                {gps ? `GPS listo (${Math.round(gps.accuracy_meters || 0)}m)` : "Capturar GPS"}
              </button>
              {gps && Number(gps.accuracy_meters || 0) > 80 ? <p className="rounded-md bg-amber-50 p-2 text-xs font-semibold text-amber-900">Precision baja. Puedes reintentar para mejorar auditoria.</p> : null}
              <PhotoCapture label="Foto obligatoria de la actividad" required value={activityPhoto} onChange={setActivityPhoto} />
              <textarea className="min-h-28 w-full rounded-md border border-line px-3 py-3 text-base" placeholder="Observacion obligatoria: detalle operativo, novedad o informacion de entrega" value={activityObservation} onChange={(event) => setActivityObservation(event.target.value)} />
              <button className="h-12 w-full rounded-md bg-apex text-base font-semibold text-white disabled:bg-neutral-300" disabled={activitySaving} onClick={saveActivity} type="button">
                {activitySaving ? "Guardando..." : gps ? "Guardar actividad" : "Capturar GPS y guardar"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
