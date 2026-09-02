"use client";

import { api } from "@/lib/api";
import { getGpsFix, type GpsFix } from "@/lib/gps";
import { scheduleGpsRequired } from "@/lib/hrScheduleMonitor";
import { publishHrMonitorRefresh } from "@/lib/hrMonitorRefresh";
import { isMarkingOnlyAccess } from "@/lib/accessProfile";
import { SignatureCapture } from "@/components/operations/SignatureCapture";
import { PhotoCapture, type CapturedFile } from "@/components/operations/PhotoCapture";
import { AlertTriangle, ArrowLeft, CheckCircle2, ExternalLink, MapPin, Navigation, Plus, RefreshCw, Truck, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type Employee = { id: number | string; user_id?: string; code: string; document_number?: string; user_type?: string; position?: string; metadata: { name: string; user_type?: string; code?: string; identity_aliases?: string[] }; user: { name: string; email?: string } };
type Attendance = { user_name: string; route_id?: number | string | null; next_type: string | null; punches: Array<{ id: number; type: string; time: string; vehicle_plate: string }> };
type AttendancePunch = Attendance["punches"][number];
type TimeRoute = { id: number | string; date?: string; code?: string; display_id?: string; source_route_id?: number | string; vehicle_plate: string; employees: string[]; employee_ids?: string[]; employee_names?: string[]; start_time: string; end_time: string; gps_required?: boolean; tracking_mode?: string; metadata?: Record<string, unknown> };
type PreopItem = { section: string; item_key: string; label: string; severity: string; blocks_route: boolean; evidence_required: boolean };
type PreopChecklist = { id: number; route_id?: number; plate: string; checklist_status: string; risk_level: string };
type PreopTemplate = { sections: string[]; items: PreopItem[] };
type PreopAnswer = { answer: string; observations: string; evidence: CapturedFile | null };
type ActivityType = { id: number | string; code?: string; name: string; active: boolean };
type WorkActivity = { id: number; activity_type_name: string; observation: string; occurred_at: string; latitude?: number | null; longitude?: number | null; accuracy_meters?: number | null; evidence?: Array<{ base64_data?: string; file_name?: string }> };
type WorkSession = { id: number; active: boolean; session: { id: number; status: string; started_at: string; closed_at?: string; route_id?: number | string | null } | null; activities: WorkActivity[]; alerts: Array<{ type: string; severity: string; message: string }> };
type PendingSyncItem = { id: string; path: string; payload: unknown; created_at: string; attempts: number; label: string };

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
const pendingSyncKey = "apexos_hr_mobile_pending_sync";
let pendingSyncInFlight = false;

function readPendingSync() {
  if (typeof window === "undefined") return [] as PendingSyncItem[];
  try {
    const parsed = JSON.parse(localStorage.getItem(pendingSyncKey) || "[]");
    return Array.isArray(parsed) ? parsed as PendingSyncItem[] : [];
  } catch {
    return [];
  }
}

function writePendingSync(items: PendingSyncItem[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(pendingSyncKey, JSON.stringify(items.slice(-50)));
}

function enqueuePendingSync(path: string, payload: unknown, label: string) {
  const item: PendingSyncItem = { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, path, payload, created_at: new Date().toISOString(), attempts: 0, label };
  writePendingSync([...readPendingSync(), item]);
  return item;
}

function permanentSyncFailure(error: unknown) {
  const status = Number((error as { status?: number })?.status || 0);
  return status >= 400 && status < 500 && ![408, 429].includes(status);
}

async function flushPendingSync(onUpdate?: (items: PendingSyncItem[], message?: string) => void) {
  if (typeof window === "undefined" || pendingSyncInFlight) return false;
  let queue = readPendingSync();
  if (!queue.length) {
    onUpdate?.([], "");
    return false;
  }
  pendingSyncInFlight = true;
  let changed = false;
  try {
    while (queue.length) {
      const item = queue[0];
      try {
        await api(item.path, { method: "POST", body: JSON.stringify(item.payload) });
        queue = queue.slice(1);
        writePendingSync(queue);
        changed = true;
        publishHrMonitorRefresh({ source: "mobile-sync" });
        onUpdate?.(queue, queue.length ? `${item.label} sincronizado. Quedan ${queue.length} registro(s) por confirmar.` : `${item.label} sincronizado. El monitor ya puede actualizarse.`);
      } catch (error) {
        if (permanentSyncFailure(error)) {
          queue = queue.slice(1);
          writePendingSync(queue);
          changed = true;
          onUpdate?.(queue, `${item.label} no fue aceptado: ${error instanceof Error ? error.message : "validacion permanente"}. Revisa el horario y vuelve a intentar.`);
          continue;
        }
        const next = { ...item, attempts: item.attempts + 1 };
        queue = [next, ...queue.slice(1)];
        writePendingSync(queue);
        onUpdate?.(queue, `${item.label} pendiente de confirmar. Se reintentara automaticamente.`);
        break;
      }
    }
  } finally {
    pendingSyncInFlight = false;
  }
  return changed;
}

function employeeName(employee: Employee | null) {
  return employee?.metadata?.name || employee?.user?.name || employee?.code || "";
}

function mapsUrl(gps: GpsFix) {
  return `https://www.google.com/maps?q=${gps.latitude},${gps.longitude}&z=17`;
}

function normalizeKey(value: string) {
  return String(value || "").trim().toLowerCase();
}

function todayBogota() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
}

function nextPunchForTypes(types: string[]) {
  if (!types.includes("entrada")) return "entrada";
  if (!types.includes("inicio_almuerzo")) return "inicio_almuerzo";
  if (!types.includes("fin_almuerzo")) return "fin_almuerzo";
  if (!types.includes("salida")) return "salida";
  return null;
}

function isGenericIdentityAlias(value: unknown) {
  return /^(usuario[-\s]\d+|usr-\d+)$/i.test(String(value || "").trim());
}

function employeeAliases(employee: Employee | null) {
  if (!employee) return [];
  return Array.from(new Set([
    employee.id,
    employee.user_id,
    employee.code,
    employee.document_number,
    employee.metadata?.code,
    employee.metadata?.name,
    employee.user?.name,
    employee.user?.email,
    ...(Array.isArray(employee.metadata?.identity_aliases) ? employee.metadata.identity_aliases : [])
  ].filter(Boolean).map((value) => normalizeKey(String(value)))));
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

function routeSyncMetadata(route: TimeRoute | null | undefined) {
  if (!route) return {};
  const displayRouteId = route.display_id || route.code || route.id;
  return {
    display_route_id: displayRouteId ? String(displayRouteId) : "",
    route_code: route.code ? String(route.code) : "",
    source_route_id: route.source_route_id ? String(route.source_route_id) : ""
  };
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
  const [optimisticPunches, setOptimisticPunches] = useState<Array<AttendancePunch & { route_id?: number | string | null; idempotency_key?: string }>>([]);
  const [optimisticActivities, setOptimisticActivities] = useState<WorkActivity[]>([]);
  const [activityTypes, setActivityTypes] = useState<ActivityType[]>([]);
  const [activityModal, setActivityModal] = useState(false);
  const [activityTypeId, setActivityTypeId] = useState("");
  const [activityObservation, setActivityObservation] = useState("");
  const [activityPhoto, setActivityPhoto] = useState<CapturedFile | null>(null);
  const [activitySaving, setActivitySaving] = useState(false);
  const [activityMessage, setActivityMessage] = useState("");
  const [markingType, setMarkingType] = useState<string | null>(null);
  const [selectedRouteId, setSelectedRouteId] = useState("");
  const [pendingSync, setPendingSync] = useState<PendingSyncItem[]>([]);

  const load = useCallback(async () => {
    const [me, routeData, attendanceData, typesData, sessionData] = await Promise.all([
      api<Employee>("/api/v1/hr/self").catch(() => null),
      api<TimeRoute[]>("/api/v1/hr/self/routes").catch(() => []),
      api<Attendance[]>("/api/v1/hr/self/attendance").catch(() => []),
      api<ActivityType[]>("/api/v1/hr/self/activity-types").catch(() => []),
      api<WorkSession>("/api/v1/hr/self/work-session").catch(() => null)
    ]);
    setEmployee(me);
    setRoutes(routeData.filter((item) => !item.date || String(item.date).slice(0, 10) === todayBogota()));
    setAttendance(attendanceData);
    const pendingPunchKeys = new Set(readPendingSync()
      .filter((item) => item.path.endsWith("/time-punches"))
      .map((item) => String((item.payload as { idempotency_key?: string })?.idempotency_key || ""))
      .filter(Boolean));
    setOptimisticPunches((current) => current.filter((punch) => punch.idempotency_key && pendingPunchKeys.has(punch.idempotency_key)));
    setActivityTypes(typesData);
    setSession(sessionData);
    if (typesData[0]) setActivityTypeId((current) => current || String(typesData[0].id));
    const active = await api<{ checklist: PreopChecklist | null; template: PreopTemplate }>("/api/v1/hr/self/preop/active").catch(() => null);
    if (active?.checklist) {
      setPreop(active.checklist);
      setPreopTemplate(active.template);
      setPreopAnswers(Object.fromEntries(active.template.items.map((item) => [item.item_key, { answer: "cumple", observations: "", evidence: null }])));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setPendingSync(readPendingSync());
    let mounted = true;
    const sync = () => {
      flushPendingSync((items, syncMessage) => {
        if (!mounted) return;
        setPendingSync(items);
        if (syncMessage) setMessage(syncMessage);
      }).then((changed) => {
        if (changed && mounted) load().catch(() => undefined);
      }).catch(() => undefined);
    };
    sync();
    const timer = window.setInterval(sync, 12000);
    window.addEventListener("online", sync);
    window.addEventListener("focus", sync);
    return () => {
      mounted = false;
      window.clearInterval(timer);
      window.removeEventListener("online", sync);
      window.removeEventListener("focus", sync);
    };
  }, [load]);

  const userName = !isGenericIdentityAlias(employee?.code) ? employee?.code || employeeName(employee) || "" : employeeName(employee) || employee?.user?.email || String(employee?.id || "");
  const aliases = employeeAliases(employee);
  const assignedRoutes = useMemo(() => routes.filter((item) => {
    if (item.date && String(item.date).slice(0, 10) !== todayBogota()) return false;
    const routeEmployees = [...(item.employees || []), ...(item.employee_ids || []), ...(item.employee_names || [])];
    return routeEmployees.some((emp) => {
      const empKey = normalizeKey(emp);
      return aliases.includes(empKey) || empKey === normalizeKey(userName) || empKey === normalizeKey(employee?.code || "") || empKey === normalizeKey(employeeName(employee));
    });
  }), [aliases, employee, routes, userName]);
  const activeSessionRouteId = session?.session?.route_id ? String(session.session.route_id) : "";
  const route = assignedRoutes.find((item) => String(item.id) === String(selectedRouteId || activeSessionRouteId))
    || (assignedRoutes.length === 1 ? assignedRoutes[0] : null);
  const gpsRequired = scheduleGpsRequired(route);
  const routeRequired = assignedRoutes.length > 1 && !route;
  const attendanceForRoute = attendance.find((item) => {
    const identityMatch = aliases.includes(normalizeKey(item.user_name)) || item.user_name === userName || item.user_name === employeeName(employee);
    const routeMatch = route ? String(item.route_id || "") === String(route.id) : true;
    return identityMatch && routeMatch;
  });
  const fallbackNextType = "entrada";
  const optimisticPunchesForRoute = optimisticPunches.filter((punch) => String(punch.route_id || "") === String(route?.id || ""));
  const mergedPunches = [...(attendanceForRoute?.punches || []), ...optimisticPunchesForRoute]
    .reduce<AttendancePunch[]>((acc, punch) => {
      if (!punch.type || acc.some((item) => item.type === punch.type)) return acc;
      acc.push(punch);
      return acc;
    }, [])
    .sort((left, right) => {
      const leftIndex = punchOrder.indexOf(left.type);
      const rightIndex = punchOrder.indexOf(right.type);
      return (leftIndex === -1 ? 99 : leftIndex) - (rightIndex === -1 ? 99 : rightIndex);
    });
  const currentAttendance = {
    user_name: userName,
    route_id: route?.id || attendanceForRoute?.route_id || null,
    next_type: mergedPunches.length ? nextPunchForTypes(mergedPunches.map((punch) => punch.type)) : (attendanceForRoute?.next_type || fallbackNextType),
    punches: mergedPunches
  };
  const sessionActivities = [
    ...optimisticActivities,
    ...(session?.activities || [])
  ];
  const doneTypes = new Set(currentAttendance.punches.map((punch) => punch.type) || []);
  const nextType = currentAttendance.next_type;
  const sessionActive = Boolean(session?.active || (doneTypes.has("entrada") && !doneTypes.has("salida")));
  const sessionClosed = doneTypes.has("salida");
  const vehiclePlate = route?.vehicle_plate || "";
  const isClosingLate = (() => {
    if (nextType !== "salida" || !route?.end_time) return false;
    const [hour, minute] = route.end_time.split(":").map(Number);
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes() > hour * 60 + minute;
  })();

  useEffect(() => {
    if (!employee || !userName || !gpsRequired) return;
    let mounted = true;
    const timer = window.setInterval(async () => {
      if (document.hidden || !mounted) return;
      try {
        const fix = await getGpsFix(8000);
        if (!mounted) return;
        setGps(fix);
        setGpsUpdatedAt(Date.now());
        setGpsStatus("ok");
        api("/api/v1/hr/self/gps/ping", {
          method: "POST",
          body: JSON.stringify({
            user_name: userName,
            employee_id: employee.id,
            vehicle_plate: vehiclePlate,
            route_id: route?.id,
            metadata: { source: "mobile_live_presence", ...routeSyncMetadata(route) },
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
  }, [employee, gpsRequired, route, userName, vehiclePlate]);

  useEffect(() => {
    if (!selectedRouteId && activeSessionRouteId) {
      setSelectedRouteId(activeSessionRouteId);
      return;
    }
    if (selectedRouteId && !assignedRoutes.some((item) => String(item.id) === String(selectedRouteId))) {
      setSelectedRouteId("");
      return;
    }
    if (!selectedRouteId && assignedRoutes.length === 1) setSelectedRouteId(String(assignedRoutes[0].id));
  }, [activeSessionRouteId, assignedRoutes, selectedRouteId]);

  useEffect(() => {
    if (!route?.id) return;
    let mounted = true;
    api<WorkSession>(`/api/v1/hr/self/work-session?route_id=${encodeURIComponent(String(route.id))}`).catch(() => null).then((sessionData) => {
      if (!mounted) return;
      if (sessionData) setSession(sessionData);
    });
    return () => {
      mounted = false;
    };
  }, [route?.id]);

  async function refreshGps() {
    if (!gpsRequired) return null;
    // Use cached GPS if less than 25s old — avoids blocking the UI
    if (gps && Date.now() - gpsUpdatedAt < 25000) return gps;
    setGpsStatus("loading");
    try {
      const fix = await getGpsFix();
      setGps(fix);
      setGpsStatus("ok");
      setGpsUpdatedAt(Date.now());
      if (userName) {
        void api("/api/v1/hr/self/gps/ping", {
          method: "POST",
          body: JSON.stringify({
            user_name: userName,
            employee_id: employee?.id,
            vehicle_plate: vehiclePlate,
            route_id: route?.id,
            metadata: { source: "mobile_presence", ...routeSyncMetadata(route) },
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
    if (!route) {
      setMessage(assignedRoutes.length ? "Selecciona el horario sobre el que vas a marcar." : "No tienes horario asignado para marcar.");
      return;
    }
    setMarkingType(type);
    setMessage("");
    try {
      const fix = gpsRequired ? await refreshGps() : null;
      if (gpsRequired && !fix) return;
      if (type === "salida" && isClosingLate && (!extraReason || !extraDetail.trim() || !extraEvidence)) {
        setMessage("Cierre fuera de horario: selecciona motivo, escribe el sustento y adjunta evidencia fotografica.");
        return;
      }
      const idempotencyKey = globalThis.crypto?.randomUUID?.() || `hr-punch-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const optimisticTime = new Date().toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
      setOptimisticPunches((current) => [
        ...current.filter((punch) => !(String(punch.route_id || "") === String(route?.id || "") && punch.type === type)),
        { id: Date.now(), type, time: optimisticTime, vehicle_plate: vehiclePlate, route_id: route?.id || null, idempotency_key: idempotencyKey }
      ].slice(-20));
      setMessage(`${punchLabels[type].title} pendiente de confirmar. Sincronizando...`);
      setMarkingType(null);
      const payload: Record<string, unknown> = {
        employee_id: employee.id,
        user_name: userName,
        type,
        punched_at: new Date().toISOString(),
        latitude: fix?.latitude,
        longitude: fix?.longitude,
        accuracy_meters: fix?.accuracy_meters,
        vehicle_plate: vehiclePlate,
        route_id: route?.id,
        idempotency_key: idempotencyKey,
        metadata: { source: "apexos-mobile", current_user_only: true, idempotency_key: idempotencyKey, gps_required: gpsRequired, tracking_mode: gpsRequired ? "gps" : "punch_only", ...routeSyncMetadata(route) }
      };
      if (type === "salida") {
        const closingDetail = extraDetail.trim();
        if (extraReason) payload.extra_reason = extraReason;
        if (closingDetail) payload.extra_detail = closingDetail;
        if (extraEvidence?.base64) payload.extra_evidence = extraEvidence;
      }
      setExtraReason("");
      setExtraDetail("");
      setExtraEvidence(null);
      enqueuePendingSync("/api/v1/hr/self/time-punches", payload, punchLabels[type].title);
      setPendingSync(readPendingSync());
      void flushPendingSync((items, syncMessage) => {
        setPendingSync(items);
        if (syncMessage) setMessage(syncMessage);
      }).then((changed) => {
        if (changed) {
          publishHrMonitorRefresh({ source: "mobile-punch", route_id: route?.id || null, date: todayBogota() });
          window.setTimeout(() => load().catch(() => undefined), 600);
        }
      }).catch((error) => {
        setMessage(error instanceof Error ? `Marcacion pendiente de confirmar: ${error.message}` : "Marcacion pendiente de confirmar.");
      });
    } catch (error) {
      setMessage(error instanceof Error ? `La marcacion quedo pendiente de confirmar: ${error.message}` : "La marcacion quedo pendiente de confirmar.");
    } finally {
      setMarkingType(null);
    }
  }

  async function openActivityModal() {
    setActivityMessage("");
    if (!sessionActive) {
      setMessage("Marca Entrada antes de registrar actividades.");
      await load();
      return;
    }
    if (!route) {
      setMessage(assignedRoutes.length ? "Selecciona el horario antes de registrar actividades." : "No tienes horario asignado para registrar actividades.");
      return;
    }
    setActivityModal(true);
    if (gpsRequired && !gps) {
      void refreshGps();
    }
  }

  async function saveActivity() {
    setActivityMessage("");
    if (!sessionActive) {
      setActivityMessage("No hay jornada activa. Marca Entrada antes de registrar actividades.");
      await load();
      return;
    }
    if (!route) {
      setActivityMessage(assignedRoutes.length ? "Selecciona el horario antes de guardar la actividad." : "No tienes horario asignado.");
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
    const fix = gpsRequired ? await refreshGps() : null;
    if (gpsRequired && !fix) {
      setActivityMessage("GPS obligatorio. Habilita la ubicacion del navegador y reintenta.");
      return;
    }
    setActivitySaving(true);
    const selectedActivityType = activityTypes.find((item) => String(item.id) === String(activityTypeId) || String(item.code || "") === String(activityTypeId));
    const pendingActivity: WorkActivity = {
      id: Date.now(),
      activity_type_name: selectedActivityType?.name || "Actividad operativa",
      observation: activityObservation.trim(),
      occurred_at: new Date().toISOString(),
      latitude: fix?.latitude ?? null,
      longitude: fix?.longitude ?? null,
      accuracy_meters: fix?.accuracy_meters ?? null,
      evidence: activityPhoto ? [{ base64_data: activityPhoto.base64, file_name: activityPhoto.name }] : []
    };
    setOptimisticActivities((current) => [pendingActivity, ...current].slice(0, 20));
    const savedObservation = activityObservation.trim();
    const savedPhoto = activityPhoto;
    setActivityObservation("");
    setActivityPhoto(null);
    setActivityModal(false);
    setActivitySaving(false);
    setMessage("Actividad registrada. Sincronizando evidencia en segundo plano...");
    const activityPayload = {
      activity_type_id: activityTypeId,
      employee_id: employee?.id,
      user_name: userName,
      latitude: fix?.latitude,
      longitude: fix?.longitude,
      accuracy_meters: fix?.accuracy_meters,
      gps_required: gpsRequired,
      gps_skipped: !gpsRequired,
      route_id: route?.id,
      vehicle_plate: vehiclePlate,
      observation: savedObservation,
      photo: savedPhoto,
      metadata: {
        source: "apexos-mobile-activity",
        gps_required: gpsRequired,
        gps_skipped: !gpsRequired,
        tracking_mode: gpsRequired ? "gps" : "punch_only",
        activity_type_code: selectedActivityType?.code || activityTypeId,
        activity_type_name: selectedActivityType?.name || "",
        ...routeSyncMetadata(route)
      }
    };
    enqueuePendingSync("/api/v1/hr/self/work-activities", activityPayload, "Actividad");
    setPendingSync(readPendingSync());
    void flushPendingSync((items, syncMessage) => {
      setPendingSync(items);
      if (syncMessage) setMessage(syncMessage);
    }).then((changed) => {
      if (changed) {
        publishHrMonitorRefresh({ source: "mobile-activity", route_id: route?.id || null, date: todayBogota() });
        window.setTimeout(() => load().catch(() => undefined), 600);
      }
    });
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
    const result = await api<{ status: string; route_authorized: boolean }>(`/api/v1/hr/self/preop/${preop.id}/submit`, {
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
        {!isMarkingOnlyAccess() ? <Link className="mb-3 inline-flex h-11 items-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-medium text-neutral-600 hover:text-apex md:border-0 md:bg-transparent md:px-0" href="/dashboard/talento-humano"><ArrowLeft size={18} /> Control de horarios</Link> : null}
        <p className="text-sm font-medium text-apex">Marcacion movil</p>
        <h1 className="text-2xl font-semibold">Mi jornada</h1>
      </header>

      {message ? <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-900">{message}</div> : null}
      {pendingSync.length ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-950">
          {pendingSync.length} registro(s) pendiente(s) de sincronizar. El monitor se actualizara cuando esta cola quede en cero.
        </div>
      ) : null}

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
                <p className="text-xs font-semibold uppercase text-neutral-500">Horario asignado</p>
                <h2 className="mt-1 text-lg font-semibold">{route ? `Horario ${route.id}` : assignedRoutes.length ? "Selecciona un horario" : "Sin horario asignado"}</h2>
                <p className="mt-1 text-sm text-neutral-600">{route ? `${route.start_time || "--"} - ${route.end_time || "--"}${route.vehicle_plate ? ` · ${route.vehicle_plate}` : ""} · ${gpsRequired ? "GPS activo" : "solo marcaciones"}` : assignedRoutes.length ? "Debes elegir sobre cual horario vas a registrar marcaciones y actividades." : "Consulta con administracion para asignar una jornada antes de marcar."}</p>
              </div>
              <span className={`rounded-md px-2 py-1 text-xs font-semibold ${route ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>{assignedRoutes.length} asignado(s)</span>
            </div>
            {assignedRoutes.length > 1 ? (
              <select className="mt-3 h-12 w-full rounded-md border border-line bg-white px-3 text-base" value={selectedRouteId} onChange={(event) => setSelectedRouteId(event.target.value)}>
                <option value="">Selecciona horario para marcar</option>
                {assignedRoutes.map((item) => (
                  <option key={String(item.id)} value={String(item.id)}>
                    Horario {item.id} - {item.start_time || "--"} a {item.end_time || "--"}{item.vehicle_plate ? ` - ${item.vehicle_plate}` : ""}
                  </option>
                ))}
              </select>
            ) : null}
          </section>

          <section className="rounded-md border border-line bg-white p-3 shadow-sm sm:p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase text-neutral-500">Estado operativo</p>
                <h2 className="mt-1 text-lg font-semibold">{sessionActive ? "Jornada activa" : sessionClosed ? "Jornada cerrada" : "Sin jornada activa"}</h2>
                <p className="mt-1 text-sm text-neutral-600">{sessionActive ? `Estas sobre el horario ${route?.id || ""}. Proxima marcacion: ${nextType ? punchLabels[nextType]?.title : "Jornada completa"}.` : sessionClosed ? "Este horario ya tiene salida registrada." : "Marca Entrada para iniciar trazabilidad operativa."}</p>
              </div>
              <span className={`rounded-md px-2 py-1 text-xs font-semibold ${sessionActive ? "bg-emerald-50 text-emerald-700" : "bg-paper text-neutral-600"}`}>{sessionActivities.length} actividades</span>
            </div>
            {session?.alerts?.length ? (
              <div className="mt-3 space-y-2">
                {session.alerts.slice(0, 2).map((alert) => <p className="rounded-md bg-amber-50 p-2 text-xs font-semibold text-amber-900" key={alert.type}><AlertTriangle className="mr-1 inline" size={13} />{alert.message}</p>)}
              </div>
            ) : null}
            <button className="mt-3 inline-flex h-13 min-h-12 w-full items-center justify-center gap-2 rounded-md bg-apex px-4 text-base font-semibold text-white disabled:bg-neutral-300" disabled={!sessionActive || !route} onClick={openActivityModal} type="button">
              <Plus size={18} /> Registrar actividad
            </button>
            {!sessionActive ? <p className="mt-2 text-xs font-semibold text-neutral-500">{sessionClosed ? "Horario cerrado." : "Disponible despues de marcar Entrada."}</p> : null}
          </section>

          <section className="rounded-md border border-line bg-white p-3 shadow-sm sm:p-4">
            <div className="grid gap-3">
              <div className="rounded-md bg-paper p-3">
                <p className="text-xs font-semibold uppercase text-neutral-500">Usuario conectado</p>
                <p className="mt-1 break-words text-base font-semibold">{employee ? employeeName(employee) : "Empleado no asociado"}</p>
              </div>
            </div>
            <div className="mt-4 rounded-md bg-paper p-3 text-sm text-neutral-700">
              <Truck className="mr-2 inline text-apex" size={15} /> {route ? `Marcando en horario ${route.id} - ${route.start_time || "--"} - ${route.end_time || "--"}` : "Sin horario seleccionado para este usuario/equipo"}
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
            {gpsRequired ? <button className="mt-3 inline-flex h-12 w-full items-center justify-center gap-2 rounded-md border border-line text-base font-semibold hover:bg-paper" onClick={refreshGps} type="button">
              <RefreshCw className={gpsStatus === "loading" ? "animate-spin" : ""} size={17} />
              {gpsStatus === "loading" ? "Obteniendo GPS..." : gpsStatus === "ok" && gps ? `GPS activo (${Math.round(gps.accuracy_meters || 0)}m)` : "Activar GPS obligatorio"}
            </button> : <p className="mt-3 rounded-md bg-paper p-3 text-sm font-semibold text-neutral-600">Este horario permite marcar sin GPS.</p>}
            {gpsStatus === "error" ? <p className="mt-2 text-xs font-semibold text-red-700">GPS obligatorio para marcar. Habilita ubicacion en el navegador.</p> : null}
            {gpsRequired && gps ? (
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
                  <button className={`min-h-24 w-full rounded-md border p-4 text-left transition active:scale-[0.99] ${enabled && route ? "border-apex bg-white shadow-sm" : "border-line bg-white opacity-70"}`} disabled={!enabled || !route || Boolean(markingType)} key={type} onClick={() => mark(type)} type="button">
                  <div className="flex items-center gap-3">
                    <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-md text-white ${done ? "bg-emerald-600" : enabled ? cfg.color : "bg-neutral-300"}`}>
                      {done ? <CheckCircle2 size={24} /> : <MapPin size={23} />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-base font-semibold">{cfg.title}</p>
                      <p className="mt-1 text-sm text-neutral-500">{markingType === type ? "Registrando..." : done ? "Registrado correctamente" : !route ? "Selecciona un horario" : enabled ? cfg.desc : "No disponible aun"}</p>
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
            ...sessionActivities.map((item) => ({ kind: "actividad", at: new Date(item.occurred_at).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" }), title: item.activity_type_name, detail: item.observation }))
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
          className={`h-14 w-full rounded-md text-base font-semibold text-white shadow-sm ${nextType ? punchLabels[nextType]?.color : "bg-apex"} disabled:bg-neutral-300`}
          disabled={!employee || !route || routeRequired || !nextType || Boolean(markingType)}
          onClick={() => nextType && mark(nextType)}
          type="button"
        >
          {markingType ? "Registrando..." : !route ? "Selecciona horario" : nextType ? punchLabels[nextType]?.title || "Registrar" : "Jornada completa"}
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
                <p className="mt-1 text-sm text-neutral-600">{gpsRequired ? "GPS y foto son obligatorios. Observacion opcional." : "Foto obligatoria. Observacion opcional."}</p>
              </div>
              <button className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-line" onClick={() => setActivityModal(false)} type="button" aria-label="Cerrar"><X size={18} /></button>
            </div>
            <div className="space-y-3">
              {activityMessage ? <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-900">{activityMessage}</div> : null}
              <select className="h-12 w-full rounded-md border border-line bg-white px-3 text-base" value={activityTypeId} onChange={(event) => setActivityTypeId(event.target.value)}>
                {activityTypes.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}
              </select>
              {gpsRequired ? <button className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-md border border-line text-base font-semibold" onClick={refreshGps} type="button">
                <RefreshCw className={gpsStatus === "loading" ? "animate-spin" : ""} size={17} />
                {gps ? `GPS listo (${Math.round(gps.accuracy_meters || 0)}m)` : "Capturar GPS"}
              </button> : <p className="rounded-md bg-paper p-3 text-sm font-semibold text-neutral-600">Actividad para horario sin GPS.</p>}
              {gps && Number(gps.accuracy_meters || 0) > 80 ? <p className="rounded-md bg-amber-50 p-2 text-xs font-semibold text-amber-900">Precision baja. Puedes reintentar para mejorar auditoria.</p> : null}
              <PhotoCapture label="Foto obligatoria de la actividad" required value={activityPhoto} onChange={setActivityPhoto} />
              <textarea className="min-h-28 w-full rounded-md border border-line px-3 py-3 text-base" placeholder="Observacion opcional: detalle operativo, novedad o informacion de entrega" value={activityObservation} onChange={(event) => setActivityObservation(event.target.value)} />
              <button className="h-12 w-full rounded-md bg-apex text-base font-semibold text-white disabled:bg-neutral-300" disabled={activitySaving} onClick={saveActivity} type="button">
                {activitySaving ? "Guardando..." : gpsRequired && !gps ? "Capturar GPS y guardar" : "Guardar actividad"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
