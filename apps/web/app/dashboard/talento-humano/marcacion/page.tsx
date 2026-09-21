"use client";

import { api } from "@/lib/api";
import { getGpsFix, type GpsFix } from "@/lib/gps";
import { scheduleGpsRequired } from "@/lib/hrScheduleMonitor";
import { publishHrMonitorRefresh } from "@/lib/hrMonitorRefresh";
import { isMarkingOnlyAccess } from "@/lib/accessProfile";
import {
  buildHrOfflineSnapshot,
  classifySyncFailure,
  decideOfflineMarking,
  degradeUntilPersisted,
  degradedScheduleNotice,
  evidenceRefMarker,
  evidenceRefOf,
  gpsFailureCause,
  gpsUnavailableMetadata,
  inlineEvidenceBytes,
  payloadByteLength,
  requestOutcome,
  resolveDegradedSchedule,
  syncFailureReason,
  type GpsFailureCause,
  type HrOfflineSnapshot,
  type RequestOutcome,
  type ScheduleSource
} from "@/lib/hrOfflineMarking";
import {
  deleteHrOfflineEvidence,
  getHrOfflineEvidence,
  newHrOfflineEvidenceRef,
  pruneHrOfflineEvidence,
  putHrOfflineEvidence
} from "@/lib/hrOfflineEvidence";
import { SignatureCapture } from "@/components/operations/SignatureCapture";
import { PhotoCapture, type CapturedFile } from "@/components/operations/PhotoCapture";
import { AlertTriangle, ArrowLeft, CheckCircle2, ExternalLink, MapPin, Navigation, Plus, RefreshCw, Truck, WifiOff, X } from "lucide-react";
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
type PendingSyncItem = {
  id: string;
  path: string;
  payload: unknown;
  created_at: string;
  attempts: number;
  label: string;
  status?: "queued" | "blocked";
  blocked_reason?: string;
  blocked_code?: string;
  evidence_refs?: string[];
  evidence_dropped?: boolean;
};
type MessageTone = "success" | "error" | "pending";

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
const hrSnapshotKey = "apexos_hr_mobile_snapshot";
const pendingSyncLimit = 50;
const evidencePayloadKeys = ["photo", "extra_evidence"] as const;
let pendingSyncInFlight = false;

const messageToneStyles: Record<MessageTone, { className: string; role: "alert" | "status" }> = {
  error: { className: "border-rose-200 bg-rose-50 text-rose-900", role: "alert" },
  pending: { className: "border-amber-200 bg-amber-50 text-amber-950", role: "status" },
  success: { className: "border-emerald-200 bg-emerald-50 text-emerald-900", role: "status" }
};

function isBlockedItem(item: PendingSyncItem) {
  return item.status === "blocked";
}

function readPendingSync() {
  if (typeof window === "undefined") return [] as PendingSyncItem[];
  try {
    const parsed = JSON.parse(localStorage.getItem(pendingSyncKey) || "[]");
    return Array.isArray(parsed) ? parsed as PendingSyncItem[] : [];
  } catch {
    return [];
  }
}

function readHrSnapshot(): HrOfflineSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const parsed = JSON.parse(localStorage.getItem(hrSnapshotKey) || "null") as HrOfflineSnapshot | null;
    return parsed && Array.isArray(parsed.routes) ? parsed : null;
  } catch {
    return null;
  }
}

function writeHrSnapshot(snapshot: HrOfflineSnapshot) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(hrSnapshotKey, JSON.stringify(snapshot));
  } catch {
    // El snapshot es una mejora de arranque en frio; si no cabe, no debe romper la marcacion.
  }
}

function stripInlineEvidence(item: PendingSyncItem): PendingSyncItem {
  const payload = { ...(item.payload as Record<string, unknown>) };
  for (const key of evidencePayloadKeys) delete payload[key];
  return {
    ...item,
    payload,
    evidence_dropped: true,
    status: "blocked",
    blocked_reason: "El dispositivo se quedo sin espacio local y la foto de evidencia fue descartada. Vuelve a tomar el registro con la foto.",
    blocked_code: "EVIDENCIA_DESCARTADA_POR_CUOTA"
  };
}

// setItem lanza QuotaExceededError cuando la cola crece (las fotos en base64 son grandes).
// La degradacion la decide degradeUntilPersisted; aqui solo queda el pegamento con localStorage.
function writePendingSync(items: PendingSyncItem[]): { items: PendingSyncItem[]; notice: string } {
  if (typeof window === "undefined") return { items, notice: "" };
  const result = degradeUntilPersisted<PendingSyncItem>({
    items,
    limit: pendingSyncLimit,
    serialize: (entries) => JSON.stringify(entries),
    persist: (serialized) => {
      try {
        localStorage.setItem(pendingSyncKey, serialized);
        return true;
      } catch {
        return false;
      }
    },
    stripEvidence: stripInlineEvidence,
    photoBytesOf: (item) => inlineEvidenceBytes(item.payload)
  });
  if (!result.persisted) {
    return { items: result.items, notice: "El almacenamiento local del dispositivo esta lleno y no fue posible guardar la marcacion pendiente. Sincroniza con senal antes de cerrar la app." };
  }
  return { items: result.items, notice: quotaNotice(result.stripped, result.dropped, result.items) };
}

function quotaNotice(stripped: string[], dropped: string[], current: PendingSyncItem[]) {
  const parts: string[] = [];
  if (stripped.length) parts.push(`${stripped.length} registro(s) quedaron bloqueados sin su foto por falta de espacio local.`);
  if (dropped.length) parts.push(`${dropped.length} registro(s) antiguo(s) fueron descartados para liberar espacio.`);
  if (!parts.length) return "";
  parts.push(current.filter((item) => !isBlockedItem(item)).length
    ? "El resto de la cola sigue pendiente de sincronizar."
    : "Revisa la cola bloqueada antes de continuar.");
  return parts.join(" ");
}

function evidenceRefsOf(item: PendingSyncItem) {
  const payload = (item.payload || {}) as Record<string, unknown>;
  const fromPayload = evidencePayloadKeys
    .map((key) => evidenceRefOf(payload[key]))
    .filter((ref): ref is string => Boolean(ref));
  return Array.from(new Set([...(item.evidence_refs || []), ...fromPayload]));
}

async function externalizeEvidence(payload: Record<string, unknown>) {
  const result: Record<string, unknown> = { ...payload };
  const refs: string[] = [];
  for (const key of evidencePayloadKeys) {
    const photo = result[key] as CapturedFile | undefined;
    if (!photo?.base64) continue;
    const ref = newHrOfflineEvidenceRef(key);
    const stored = await putHrOfflineEvidence(ref, { base64: photo.base64, size: photo.size, type: photo.type, name: photo.name });
    // Sin IndexedDB la evidencia sigue inline: la politica de cuota la protege de todos modos.
    if (stored) {
      result[key] = evidenceRefMarker(ref);
      refs.push(ref);
    }
  }
  return { payload: result, refs };
}

async function rehydrateEvidence(payload: unknown) {
  const result = { ...(payload as Record<string, unknown>) };
  for (const key of evidencePayloadKeys) {
    const ref = evidenceRefOf(result[key]);
    if (!ref) continue;
    const photo = await getHrOfflineEvidence(ref);
    if (!photo) throw new Error("La evidencia guardada en este dispositivo ya no esta disponible.");
    result[key] = photo;
  }
  return result;
}

async function cleanupEvidence(item: PendingSyncItem) {
  await Promise.all(evidenceRefsOf(item).map((ref) => deleteHrOfflineEvidence(ref)));
}

async function enqueuePendingSync(path: string, payload: Record<string, unknown>, label: string) {
  const prepared = await externalizeEvidence(payload);
  const item: PendingSyncItem = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    path,
    payload: prepared.payload,
    created_at: new Date().toISOString(),
    attempts: 0,
    label,
    status: "queued",
    evidence_refs: prepared.refs
  };
  const written = writePendingSync([...readPendingSync(), item]);
  return { item, items: written.items, notice: written.notice };
}

function blockPendingSync(items: PendingSyncItem[], id: string, reason: string, code = "") {
  return items.map((item) => (item.id === id ? { ...item, status: "blocked" as const, blocked_reason: reason, blocked_code: code } : item));
}

function discardPendingSync(id: string) {
  const items = readPendingSync();
  const target = items.find((item) => item.id === id);
  const queue = items.filter((item) => item.id !== id);
  writePendingSync(queue);
  if (target) void cleanupEvidence(target);
  return queue;
}

function permanentSyncFailure(error: unknown) {
  const status = Number((error as { status?: number })?.status || 0);
  return status >= 400 && status < 500 && ![408, 429].includes(status);
}

async function settle<T>(promise: Promise<T>, fallback: T): Promise<RequestOutcome<T>> {
  try {
    return requestOutcome(true, await promise);
  } catch {
    return requestOutcome(false, fallback);
  }
}

type SyncUpdate = (items: PendingSyncItem[], message?: string, tone?: MessageTone) => void;

async function flushPendingSync(onUpdate?: SyncUpdate) {
  if (typeof window === "undefined" || pendingSyncInFlight) return false;
  let queue = readPendingSync();
  if (!queue.length) {
    onUpdate?.([], "");
    return false;
  }
  // Sin senal no hay nada que intentar: se evita quemar el timeout de red en cada intervalo.
  if (navigator.onLine === false) return false;
  pendingSyncInFlight = true;
  let changed = false;
  try {
    for (;;) {
      const index = queue.findIndex((item) => !isBlockedItem(item));
      if (index < 0) break;
      const item = queue[index];
      let outbound: unknown;
      try {
        outbound = await rehydrateEvidence(item.payload);
      } catch (error) {
        const failure = classifySyncFailure(error);
        queue = writePendingSync(blockPendingSync(queue, item.id, syncFailureReason(failure))).items;
        changed = true;
        onUpdate?.(queue, `${item.label} quedo bloqueado: ${syncFailureReason(failure)}`, "error");
        continue;
      }
      try {
        await api(item.path, { method: "POST", body: JSON.stringify(outbound) });
        queue = writePendingSync(queue.filter((entry) => entry.id !== item.id)).items;
        changed = true;
        void cleanupEvidence(item);
        publishHrMonitorRefresh({ source: "mobile-sync" });
        onUpdate?.(queue, queue.filter((entry) => !isBlockedItem(entry)).length
          ? `${item.label} sincronizado. Quedan ${queue.filter((entry) => !isBlockedItem(entry)).length} registro(s) por confirmar.`
          : `${item.label} sincronizado. El monitor ya puede actualizarse.`, "success");
      } catch (error) {
        if (permanentSyncFailure(error)) {
          const failure = classifySyncFailure(error);
          queue = writePendingSync(blockPendingSync(queue, item.id, syncFailureReason(failure), failure.code)).items;
          changed = true;
          onUpdate?.(queue, `${item.label} no fue aceptado: ${syncFailureReason(failure)}`, "error");
          continue;
        }
        const next = { ...item, attempts: item.attempts + 1 };
        queue = writePendingSync(queue.map((entry) => (entry.id === item.id ? next : entry))).items;
        onUpdate?.(queue, `${item.label} pendiente de confirmar. Se reintentara automaticamente.`, "pending");
        break;
      }
    }
  } finally {
    pendingSyncInFlight = false;
  }
  return changed;
}

function offlineQueueWeight(items: PendingSyncItem[]) {
  return items.reduce((total, item) => total + payloadByteLength(item.payload), 0);
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
  const [dayMileage, setDayMileage] = useState("");
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
  const [pendingSync, setPendingSync] = useState<PendingSyncItem[]>([]);
  const [messageTone, setMessageTone] = useState<MessageTone>("success");
  const [online, setOnline] = useState(true);
  const [gpsCause, setGpsCause] = useState<GpsFailureCause | null>(null);
  const [scheduleSource, setScheduleSource] = useState<ScheduleSource>("live");
  const [scheduleNotice, setScheduleNotice] = useState("");

  function notify(text: string, tone: MessageTone = "success") {
    setMessage(text);
    setMessageTone(tone);
  }

  const load = useCallback(async () => {
    const [meResult, routesResult, attendanceResult, typesResult, sessionResult] = await Promise.all([
      settle<Employee | null>(api<Employee>("/api/v1/hr/self"), null),
      settle<TimeRoute[]>(api<TimeRoute[]>("/api/v1/hr/self/routes"), []),
      settle<Attendance[]>(api<Attendance[]>("/api/v1/hr/self/attendance"), []),
      settle<ActivityType[]>(api<ActivityType[]>("/api/v1/hr/self/activity-types"), []),
      settle<WorkSession | null>(api<WorkSession>("/api/v1/hr/self/work-session"), null)
    ]);
    const today = todayBogota();
    const dayRoutes = routesResult.value.filter((item) => !item.date || String(item.date).slice(0, 10) === today);
    const snapshot = buildHrOfflineSnapshot({
      previous: readHrSnapshot(),
      self: meResult,
      routes: { ok: routesResult.ok, value: dayRoutes },
      activityTypes: typesResult,
      takenAt: new Date().toISOString(),
      takenDay: today
    });
    if (snapshot) writeHrSnapshot(snapshot);
    const resolved = resolveDegradedSchedule<TimeRoute>({
      routesOk: routesResult.ok,
      liveRoutes: dayRoutes,
      snapshot,
      today
    });
    const typesData = typesResult.ok || typesResult.value.length
      ? typesResult.value
      : ((snapshot?.activity_types || []) as ActivityType[]);
    setEmployee(meResult.ok ? meResult.value : ((snapshot?.self || null) as Employee | null));
    setRoutes(resolved.routes);
    setScheduleSource(resolved.source);
    setScheduleNotice(resolved.source === "live" ? "" : degradedScheduleNotice(resolved, today));
    setAttendance(attendanceResult.value);
    const pendingPunchKeys = new Set(readPendingSync()
      .filter((item) => item.path.endsWith("/time-punches"))
      .map((item) => String((item.payload as { idempotency_key?: string })?.idempotency_key || ""))
      .filter(Boolean));
    setOptimisticPunches((current) => current.filter((punch) => punch.idempotency_key && pendingPunchKeys.has(punch.idempotency_key)));
    setActivityTypes(typesData);
    setSession(sessionResult.value);
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
    const initialQueue = readPendingSync();
    setPendingSync(initialQueue);
    setOnline(typeof navigator === "undefined" ? true : navigator.onLine !== false);
    // Los blobs cuya marcacion ya no esta en la cola son huerfanos de sesiones interrumpidas.
    void pruneHrOfflineEvidence(initialQueue.flatMap(evidenceRefsOf));
    let mounted = true;
    const sync = () => {
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        if (mounted) setPendingSync(readPendingSync());
        return;
      }
      flushPendingSync((items, syncMessage, tone) => {
        if (!mounted) return;
        setPendingSync(items);
        if (syncMessage) notify(syncMessage, tone || "pending");
      }).then((changed) => {
        if (changed && mounted) load().catch(() => undefined);
      }).catch(() => undefined);
    };
    const goOnline = () => {
      if (!mounted) return;
      setOnline(true);
      // Al recuperar senal el horario vuelve a ser la fuente de verdad: se recarga y se vacia la cola.
      load().catch(() => undefined);
      sync();
    };
    const goOffline = () => {
      if (mounted) setOnline(false);
    };
    sync();
    const timer = window.setInterval(sync, 12000);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    window.addEventListener("focus", sync);
    return () => {
      mounted = false;
      window.clearInterval(timer);
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
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
  const route = assignedRoutes.find((item) => String(item.id) === activeSessionRouteId)
    || assignedRoutes[0]
    || null;
  const gpsRequired = scheduleGpsRequired(route);
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
  const pendingQueued = pendingSync.filter((item) => !isBlockedItem(item));
  const pendingBlocked = pendingSync.filter(isBlockedItem);
  const pendingWeightKb = Math.max(1, Math.round(offlineQueueWeight(pendingQueued) / 1024));

  useEffect(() => {
    if (!employee || !userName || !gpsRequired) return;
    let mounted = true;
    const timer = window.setInterval(async () => {
      if (document.hidden || !mounted || navigator.onLine === false) return;
      try {
        const fix = await getGpsFix(8000);
        if (!mounted) return;
        setGps(fix);
        setGpsUpdatedAt(Date.now());
        setGpsStatus("ok");
        setGpsCause(null);
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
      } catch (error) {
        if (!mounted) return;
        setGpsCause(gpsFailureCause(error));
        setGpsStatus("error");
      }
    }, 30000);
    return () => {
      mounted = false;
      if (timer) window.clearInterval(timer);
    };
  }, [employee, gpsRequired, route, userName, vehiclePlate]);

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

  async function refreshGps(): Promise<{ fix: GpsFix | null; cause: GpsFailureCause | null }> {
    if (!gpsRequired) return { fix: null, cause: null };
    // Use cached GPS if less than 25s old — avoids blocking the UI
    if (gps && Date.now() - gpsUpdatedAt < 25000) return { fix: gps, cause: null };
    setGpsStatus("loading");
    try {
      const fix = await getGpsFix();
      setGps(fix);
      setGpsStatus("ok");
      setGpsCause(null);
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
          notify("GPS capturado, pero no fue posible sincronizar la presencia en vivo. La marcacion guardara la ubicacion al registrarse.", "pending");
        });
      }
      return { fix, cause: null };
    } catch (error) {
      const cause = gpsFailureCause(error);
      setGpsStatus("error");
      setGpsCause(cause);
      return { fix: null, cause };
    }
  }

  async function mark(type: string) {
    if (!employee || markingType) return;
    if (!route) {
      notify(scheduleNotice || (assignedRoutes.length ? "Selecciona el horario sobre el que vas a marcar." : "No tienes horario asignado para marcar."), "error");
      return;
    }
    // El backend evalua la regla del dia contra punched_at, no contra la hora del flush: una
    // marcacion de las 22:40 sincronizada a las 07:00 se rechazaria con HORARIO_FUERA_DEL_DIA.
    const markedAt = new Date();
    setMarkingType(type);
    notify("");
    try {
      const isOnline = typeof navigator === "undefined" ? true : navigator.onLine !== false;
      let fix: GpsFix | null = null;
      let cause: GpsFailureCause | null = null;
      if (gpsRequired) {
        if (isOnline) {
          const result = await refreshGps();
          fix = result.fix;
          cause = result.cause;
        } else if (gps && Date.now() - gpsUpdatedAt < 25000) {
          // Sin senal no se pide un fix nuevo (bloquearia al operario hasta 13 s), pero un
          // fix reciente sigue siendo mejor que marcar la novedad de GPS inactivo.
          fix = gps;
        }
      }
      const decision = decideOfflineMarking({ online: isOnline, gpsRequired, hasFix: Boolean(fix), cause });
      if (!decision.allowed) {
        notify(decision.userMessage, "error");
        return;
      }
      if (type === "salida" && isClosingLate && (!extraReason || !extraDetail.trim() || !extraEvidence)) {
        notify("Cierre fuera de horario: selecciona motivo, escribe el sustento y adjunta evidencia fotografica.", "error");
        return;
      }
      if (type === "salida" && vehiclePlate) {
        const normalizedMileage = dayMileage.trim().replace(",", ".");
        if (!/^\d+(\.\d{1,1})?$/.test(normalizedMileage)) {
          notify("Registra el kilometraje del dia con maximo un decimal antes de cerrar la jornada.", "error");
          return;
        }
        notify(`Kilometraje del dia: ${normalizedMileage} km. Confirmando cierre...`, "pending");
      }
      const idempotencyKey = globalThis.crypto?.randomUUID?.() || `hr-punch-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const optimisticTime = markedAt.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
      setOptimisticPunches((current) => [
        ...current.filter((punch) => !(String(punch.route_id || "") === String(route?.id || "") && punch.type === type)),
        { id: markedAt.getTime(), type, time: optimisticTime, vehicle_plate: vehiclePlate, route_id: route?.id || null, idempotency_key: idempotencyKey }
      ].slice(-20));
      setMarkingType(null);
      const queuedAt = new Date().toISOString();
      const payload: Record<string, unknown> = {
        employee_id: employee.id,
        user_name: userName,
        type,
        punched_at: markedAt.toISOString(),
        latitude: fix?.latitude,
        longitude: fix?.longitude,
        accuracy_meters: fix?.accuracy_meters,
        vehicle_plate: vehiclePlate,
        route_id: route?.id,
        idempotency_key: idempotencyKey,
        metadata: {
          source: "apexos-mobile",
          current_user_only: true,
          idempotency_key: idempotencyKey,
          gps_required: gpsRequired,
          tracking_mode: gpsRequired ? "gps" : "punch_only",
          offline: !isOnline,
          ...gpsUnavailableMetadata({ gpsUnavailable: decision.gpsUnavailable, reason: decision.reason, queuedAt }),
          ...routeSyncMetadata(route)
        }
      };
      if (type === "salida") {
        const closingDetail = extraDetail.trim();
        if (extraReason) payload.extra_reason = extraReason;
        if (closingDetail) payload.extra_detail = closingDetail;
        if (extraEvidence?.base64) payload.extra_evidence = extraEvidence;
        if (vehiclePlate) payload.kilometraje_dia = dayMileage.trim().replace(",", ".");
      }
      setExtraReason("");
      setExtraDetail("");
      setExtraEvidence(null);
      if (type === "salida") setDayMileage("");
      const queued = await enqueuePendingSync("/api/v1/hr/self/time-punches", payload, punchLabels[type].title);
      setPendingSync(readPendingSync());
      if (queued.notice) notify(queued.notice, "error");
      else if (decision.gpsUnavailable) notify(`${punchLabels[type].title} ${decision.userMessage}`, "pending");
      else notify(`${punchLabels[type].title} pendiente de confirmar. Sincronizando...`, "pending");
      void flushPendingSync((items, syncMessage, tone) => {
        setPendingSync(items);
        if (syncMessage) notify(syncMessage, tone || "pending");
      }).then((changed) => {
        if (changed) {
          publishHrMonitorRefresh({ source: "mobile-punch", route_id: route?.id || null, date: todayBogota() });
          window.setTimeout(() => load().catch(() => undefined), 600);
        }
      }).catch((error) => {
        notify(error instanceof Error ? `Marcacion pendiente de confirmar: ${error.message}` : "Marcacion pendiente de confirmar.", "pending");
      });
    } catch (error) {
      notify(error instanceof Error ? `La marcacion quedo pendiente de confirmar: ${error.message}` : "La marcacion quedo pendiente de confirmar.", "error");
    } finally {
      setMarkingType(null);
    }
  }

  async function openActivityModal() {
    setActivityMessage("");
    if (!sessionActive) {
      notify("Marca Entrada antes de registrar actividades.", "error");
      await load();
      return;
    }
    if (!route) {
      notify(scheduleNotice || (assignedRoutes.length ? "Selecciona el horario antes de registrar actividades." : "No tienes horario asignado para registrar actividades."), "error");
      return;
    }
    setActivityModal(true);
    if (gpsRequired && !gps && (typeof navigator === "undefined" || navigator.onLine !== false)) {
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
      setActivityMessage(scheduleNotice || (assignedRoutes.length ? "Selecciona el horario antes de guardar la actividad." : "No tienes horario asignado."));
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
    const occurredAt = new Date();
    const isOnline = typeof navigator === "undefined" ? true : navigator.onLine !== false;
    let fix: GpsFix | null = null;
    let cause: GpsFailureCause | null = null;
    if (gpsRequired) {
      if (isOnline) {
        const result = await refreshGps();
        fix = result.fix;
        cause = result.cause;
      } else if (gps && Date.now() - gpsUpdatedAt < 25000) {
        // Sin senal no se pide un fix nuevo (bloquearia al operario hasta 13 s), pero un
        // fix reciente sigue siendo mejor que marcar la novedad de GPS inactivo.
        fix = gps;
      }
    }
    const decision = decideOfflineMarking({ online: isOnline, gpsRequired, hasFix: Boolean(fix), cause });
    if (!decision.allowed) {
      setActivityMessage(decision.userMessage);
      return;
    }
    setActivitySaving(true);
    const selectedActivityType = activityTypes.find((item) => String(item.id) === String(activityTypeId) || String(item.code || "") === String(activityTypeId));
    const pendingActivity: WorkActivity = {
      id: occurredAt.getTime(),
      activity_type_name: selectedActivityType?.name || "Actividad operativa",
      observation: activityObservation.trim(),
      occurred_at: occurredAt.toISOString(),
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
    const queuedAt = new Date().toISOString();
    const activityPayload: Record<string, unknown> = {
      activity_type_id: activityTypeId,
      employee_id: employee?.id,
      user_name: userName,
      occurred_at: occurredAt.toISOString(),
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
        offline: !isOnline,
        ...gpsUnavailableMetadata({ gpsUnavailable: decision.gpsUnavailable, reason: decision.reason, queuedAt }),
        ...routeSyncMetadata(route)
      }
    };
    const queued = await enqueuePendingSync("/api/v1/hr/self/work-activities", activityPayload, "Actividad");
    setPendingSync(readPendingSync());
    if (queued.notice) notify(queued.notice, "error");
    else if (decision.gpsUnavailable) notify(`Actividad ${decision.userMessage}`, "pending");
    else notify("Actividad registrada. Sincronizando evidencia en segundo plano...", "pending");
    void flushPendingSync((items, syncMessage, tone) => {
      setPendingSync(items);
      if (syncMessage) notify(syncMessage, tone || "pending");
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
    notify(
      result.route_authorized ? "Checklist aprobado. Operacion vehicular habilitada." : "Operacion vehicular bloqueada por novedad critica.",
      result.route_authorized ? "success" : "error"
    );
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

      {message ? <div className={`rounded-md border p-4 text-sm font-medium ${messageToneStyles[messageTone].className}`} role={messageToneStyles[messageTone].role}>{message}</div> : null}
      {!online ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm font-semibold text-amber-950" role="status">
          <WifiOff className="mr-2 inline" size={16} /> Sin senal. Puedes seguir marcando: cada marcacion se guarda en este dispositivo con su fecha y hora reales y se sincronizara automaticamente al recuperar conexion.
        </div>
      ) : null}
      {scheduleNotice ? (
        <div className={`rounded-md border p-4 text-sm font-semibold ${scheduleSource === "snapshot" ? "border-sky-200 bg-sky-50 text-sky-900" : "border-rose-200 bg-rose-50 text-rose-900"}`} role={scheduleSource === "snapshot" ? "status" : "alert"}>
          {scheduleNotice}
        </div>
      ) : null}
      {pendingQueued.length ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-950" role="status">
          {pendingQueued.length} registro(s) pendiente(s) de sincronizar (~{pendingWeightKb} KB guardados en este dispositivo). El monitor se actualizara cuando esta cola quede en cero.
        </div>
      ) : null}
      {pendingBlocked.length ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-900" role="alert">
          <p className="flex items-center gap-2"><AlertTriangle size={16} /> {pendingBlocked.length} registro(s) bloqueado(s): el servidor los rechazo y no se reintentaran solos.</p>
          <ul className="mt-2 space-y-2">
            {pendingBlocked.map((item) => (
              <li className="rounded-md border border-rose-200 bg-white p-2" key={item.id}>
                <p className="text-sm font-semibold">{item.label} · {new Date(item.created_at).toLocaleString("es-CO")}</p>
                <p className="mt-1 text-xs font-medium text-rose-800">{item.blocked_reason || "Rechazado por el servidor."}</p>
                <button className="mt-2 h-10 rounded-md border border-rose-300 px-3 text-xs font-semibold text-rose-900 hover:bg-rose-100" onClick={() => setPendingSync(discardPendingSync(item.id))} type="button">
                  Descartar registro
                </button>
              </li>
            ))}
          </ul>
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
                <h2 className="mt-1 text-lg font-semibold">{route ? `Horario ${route.id}` : "Sin horario asignado"}</h2>
                <p className="mt-1 text-sm text-neutral-600">{route ? `${route.start_time || "--"} - ${route.end_time || "--"}${route.vehicle_plate ? ` · ${route.vehicle_plate}` : ""} · ${gpsRequired ? "GPS activo" : "solo marcaciones"}` : "Consulta con administracion para asignar una jornada antes de marcar."}</p>
              </div>
              <span className={`rounded-md px-2 py-1 text-xs font-semibold ${route ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>{scheduleSource === "snapshot" ? "Guardado en el equipo" : `${assignedRoutes.length} asignado(s)`}</span>
            </div>
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
            {nextType === "salida" && vehiclePlate ? (
              <label className="mt-3 block rounded-md border border-line bg-white p-3">
                <span className="text-sm font-semibold text-neutral-900">Kilometraje recorrido del dia</span>
                <span className="mt-1 block text-xs text-neutral-500">Obligatorio para cerrar una jornada con vehiculo. Registra kilometros recorridos, no odometro final.</span>
                <div className="mt-2 flex items-center gap-2">
                  <input className="h-12 min-w-0 flex-1 rounded-md border border-line px-3 text-base" inputMode="decimal" placeholder="Ej: 42.5" value={dayMileage} onChange={(event) => setDayMileage(event.target.value)} />
                  <span className="rounded-md bg-paper px-3 py-3 text-sm font-semibold text-neutral-700">km</span>
                </div>
                {dayMileage.trim() ? <span className="mt-2 block text-xs font-semibold text-apex">Kilometraje del dia: {dayMileage.trim().replace(",", ".")} km</span> : null}
              </label>
            ) : null}
            {gpsRequired ? <button className="mt-3 inline-flex h-12 w-full items-center justify-center gap-2 rounded-md border border-line text-base font-semibold hover:bg-paper" onClick={refreshGps} type="button">
              <RefreshCw className={gpsStatus === "loading" ? "animate-spin" : ""} size={17} />
              {gpsStatus === "loading" ? "Obteniendo GPS..." : gpsStatus === "ok" && gps ? `GPS activo (${Math.round(gps.accuracy_meters || 0)}m)` : "Activar GPS obligatorio"}
            </button> : <p className="mt-3 rounded-md bg-paper p-3 text-sm font-semibold text-neutral-600">Este horario permite marcar sin GPS.</p>}
            {gpsStatus === "error" ? (
              <p className={`mt-2 rounded-md p-2 text-xs font-semibold ${gpsCause === "PERMISSION_DENIED" ? "bg-rose-50 text-rose-800" : "bg-amber-50 text-amber-900"}`}>
                {gpsCause === "PERMISSION_DENIED"
                  ? "GPS obligatorio y permiso de ubicacion denegado. Habilitalo en el navegador para poder marcar."
                  : "Sin fix de GPS. Puedes marcar igual: la marcacion se guardara con su hora real y quedara la novedad GPS inactivo por falta de senal."}
              </p>
            ) : null}
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
          disabled={!employee || !route || !nextType || Boolean(markingType)}
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
                <p className="mt-1 text-sm text-neutral-600">{gpsRequired ? "GPS y foto son obligatorios. Sin senal se guarda igual con tu hora real y novedad de GPS inactivo." : "Foto obligatoria. Observacion opcional."}</p>
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
