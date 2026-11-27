"use client";

import { api } from "@/lib/api";
import { getGpsFix, type GpsFix } from "@/lib/gps";
import { scheduleGpsRequired } from "@/lib/hrScheduleMonitor";
import { publishHrMonitorRefresh } from "@/lib/hrMonitorRefresh";
import { isMarkingOnlyAccess } from "@/lib/accessProfile";
import {
  buildHrOfflineSnapshot,
  buildHrNoveltyMarker,
  attachHrNoveltyMarker,
  DEGRADED_MARKING_BLOCKED_REASON,
  DEGRADED_MARKING_NOTICE,
  IDEMPOTENCY_ALREADY_REGISTERED_NOTICE,
  IDEMPOTENCY_UNRECOVERABLE_NOTICE,
  NOVELTY_EXPIRED_MARKING_MESSAGE,
  NOVELTY_PENDING_PHOTO_MESSAGE,
  PHOTO_LOST_ESCALATION_NOTICE,
  QUEUE_IDLE_POLL_MS,
  SELF_HEAL_RELEASE_NOTICE,
  classifySyncFailure,
  decideOfflineMarking,
  decideQueueTransition,
  degradeUntilPersisted,
  degradedScheduleNotice,
  detachEvidence,
  evidenceCodeOf,
  evidenceRefMarker,
  evidenceRefOf,
  evidenceRetryAttemptsOf,
  gpsFailureCause,
  gpsUnavailableMetadata,
  inlineEvidenceBytes,
  isEvidenceBlockedSelfHealCandidate,
  isExpiredDeferredMarking,
  markEvidenceRetryAttempt,
  payloadByteLength,
  queueNextPollMs,
  readHrNoveltyMarker,
  reconcileIdempotencyConflict,
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
  listPendingReviewEvidence,
  newHrOfflineEvidenceRef,
  pruneHrOfflineEvidence,
  putHrOfflineEvidence,
  putPendingReviewEvidence
} from "@/lib/hrOfflineEvidence";
import { SignatureCapture } from "@/components/operations/SignatureCapture";
import { PhotoCapture, PHOTO_UNUSABLE_COPY, type CapturedFile, type PhotoUnusableOutcome } from "@/components/operations/PhotoCapture";
import { AlertTriangle, ArrowLeft, CalendarX, CheckCircle2, ExternalLink, MapPin, Navigation, Plus, RefreshCw, Truck, WifiOff, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

type Employee = { id: number | string; user_id?: string; code: string; document_number?: string; user_type?: string; position?: string; metadata: { name: string; user_type?: string; code?: string; identity_aliases?: string[] }; user: { name: string; email?: string } };
type Attendance = { user_name: string; route_id?: number | string | null; next_type: string | null; punches: Array<{ id: number; type: string; time: string; vehicle_plate: string; idempotency_key?: string }> };
type AttendancePunch = Attendance["punches"][number];
type TimeRoute = { id: number | string; date?: string; code?: string; display_id?: string; source_route_id?: number | string; vehicle_plate: string; employees: string[]; employee_ids?: string[]; employee_names?: string[]; start_time: string; end_time: string; tolerance_minutes?: number | null; gps_required?: boolean; tracking_mode?: string; metadata?: Record<string, unknown> };
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
  // `queued` espera o reintenta. `blocked` era el unico estado terminal y por eso
  // un problema de foto se comia la jornada: hoy hay dos terminales distintos.
  //   blocked    -> no se puede resolver en el dispositivo (foto perdida, o cola
  //                degradada por cuota). Visible, con motivo y con accion.
  //   closed     -> la regla de negocio rechazo la marcacion. Se CIERRA para que
  //                no siga "por enviar" ni bloquee lo que viene detras, y se
  //                escala al supervisor con la novedad correspondiente.
  status?: "queued" | "blocked" | "closed";
  blocked_reason?: string;
  blocked_code?: string;
  evidence_refs?: string[];
  evidence_dropped?: boolean;
  // La foto ya salio del payload y vive en IndexedDB esperando revision.
  evidence_degraded?: boolean;
  // Novedad declarada al supervisor (evita re-escalarla en cada reintento).
  escalated_novelty?: string;
  metadata?: Record<string, unknown>;
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

// Motivos de llegada tarde. Son distintos a los de extension: una entrada
// tardia no se explica por "cierre de servicio critico", y mezclarlos dejaba
// al empleado escogiendo el motivo menos malo en vez del real.
const latenessReasons = [
  ["congestion_vial", "Congestion vial o cierre de via"],
  ["transporte_publico", "Falla del transporte publico"],
  ["falla_vehiculo", "Falla mecanica del vehiculo"],
  ["cita_medica", "Cita medica o incapacidad"],
  ["calamidad_domestica", "Calamidad domestica"],
  ["clima_seguridad", "Clima, seguridad o condicion externa"],
  ["autorizacion_supervisor", "Ingreso tardio autorizado por supervisor"],
  ["otro", "Otro motivo (detallar en el sustento)"]
];

// Marcaciones que exigen selfie DESDE LA WEB. Son las cuatro: sin chip que firme,
// la unica prueba de quien marco es la cara, y el almuerzo no puede quedar ciego.
// Tiene que coincidir con `WEB_SELFIE_REQUIRED_TYPES` del API; la app firmada sigue
// pidiendo solo entrada y salida porque las versiones instaladas firman el almuerzo
// sin foto. Ventana de contingencia: brief 2026-11-24.
const selfieRequiredPunches = new Set(["entrada", "inicio_almuerzo", "fin_almuerzo", "salida"]);

const punchOrder = ["entrada", "inicio_almuerzo", "fin_almuerzo", "salida"];
const punchLabels: Record<string, { title: string; desc: string; color: string }> = {
  entrada: { title: "Inicio jornada", desc: "Registra tu entrada al trabajo", color: "bg-blue-600" },
  inicio_almuerzo: { title: "Salida almuerzo", desc: "Registra tu salida a almorzar", color: "bg-amber-500" },
  fin_almuerzo: { title: "Retorno almuerzo", desc: "Registra tu regreso", color: "bg-emerald-600" },
  salida: { title: "Fin jornada", desc: "Registra tu cierre del dia", color: "bg-violet-600" }
};
const pendingSyncKey = "apexos_hr_mobile_pending_sync";
const hrSnapshotKey = "apexos_hr_mobile_snapshot";
const selfHealNoticeKey = "apexos_hr_mobile_self_heal_notice";
const pendingSyncLimit = 50;
// Claves de primer nivel del payload que llevan foto. Salen del localStorage a
// IndexedDB mientras la marcacion espera en la cola: en base64 llenan la cuota.
// La lista vive en la libreria de politica para que la cola y el externalizado
// no puedan divergir.
const evidencePayloadKeys = ["photo", "extra_evidence", "identity_photo"] as const;
// Un item ya no se envia cuando esta bloqueado (no hay forma de resolverlo en el
// dispositivo) o cerrado (la regla de negocio lo rechazo y ya esta escalado).
// Los dos siguen VISIBLES en la cola; lo que pierden es el puesto al frente.
function isSendableItem(item: PendingSyncItem) {
  return item.status !== "blocked" && item.status !== "closed";
}

function isBlockedItem(item: PendingSyncItem) {
  return item.status === "blocked";
}

function isClosedItem(item: PendingSyncItem) {
  return item.status === "closed";
}

// Cualquier terminal visible deja de contar como "por enviar". Antes `isBlockedItem`
// era el unico filtro y un cierre seguia apareciendo como pendiente.
function isPendingItem(item: PendingSyncItem) {
  return !isBlockedItem(item) && !isClosedItem(item);
}

// La marca `evidence_degraded` solo se pone cuando el payload PERDIO la foto, no
// cuando la foto sigue adjunta esperando su reintento.
function itemHasDetachablePhoto(item: PendingSyncItem) {
  if (item.evidence_degraded) return false;
  const payload = (item.payload || {}) as Record<string, unknown>;
  return evidencePayloadKeys.some((key) => payload[key] !== undefined);
}

let pendingSyncInFlight = false;
// El planificador necesita saber si el ultimo tick TERMINO en fallo para decidir el
// respaldo. `flushPendingSync` devuelve solo "hubo cambios", que mezcla exitos y
// fallos, asi que la propia cola declara cuando algo volvio a `queued` con intento
// nuevo. Se lee y se limpia en cada tick.
let queueSawFailure = false;

function markQueueFailureObserved() {
  queueSawFailure = true;
}

const messageToneStyles: Record<MessageTone, { className: string; role: "alert" | "status" }> = {
  error: { className: "border-rose-200 bg-rose-50 text-rose-900", role: "alert" },
  pending: { className: "border-amber-200 bg-amber-50 text-amber-950", role: "status" },
  success: { className: "border-emerald-200 bg-emerald-50 text-emerald-900", role: "status" }
};

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

// Cierra un item sin borrarlo. La diferencia con `blocked` no es cosmetica: un
// item cerrado sale del conteo de "por enviar" y deja de bloquear la cola, pero
// su motivo y su hora siguen visibles hasta que el operario lo descarta. Nunca
// se descarta solo: eso seria perder evidencia de la jornada.
function closePendingSyncItem(items: PendingSyncItem[], id: string, reason: string, code: string): PendingSyncItem[] {
  return items.map((item) => (item.id === id ? { ...item, status: "closed" as const, blocked_reason: reason, blocked_code: code } : item));
}

function readSelfHealNotices(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(selfHealNoticeKey) || "[]");
    return Array.isArray(parsed) ? parsed.filter((entry) => typeof entry === "string" && entry) as string[] : [];
  } catch {
    return [];
  }
}

function writeSelfHealNotices(notices: string[]) {
  if (typeof window === "undefined") return;
  try {
    if (notices.length) localStorage.setItem(selfHealNoticeKey, JSON.stringify(notices.slice(0, 3)));
    else localStorage.removeItem(selfHealNoticeKey);
  } catch {
    // El aviso de recuperacion es informativo: si no cabe, la cola ya lo dice.
  }
}

// Self-heal acotado. Los items que ESTA version ya bloqueo por foto llevan la
// marca en metadata y no vuelven a liberarse. Los que bloqueo la version anterior
// (el incidente de produccion: 400 VALIDACION por un HEIC etiquetado como JPEG)
// no tienen marca, asi que se liberan UNA vez y se reintentan sin la foto. Sin
// esto, los operarios afectados seguirian pegados despues del despliegue.
export function releaseEvidenceBlockedItems(items: PendingSyncItem[]): { items: PendingSyncItem[]; released: number } {
  let released = 0;
  const next = items.map((item) => {
    if (!isEvidenceBlockedSelfHealCandidate(item)) return item;
    released += 1;
    // La version anterior encol el item CON la foto dentro del payload. Liberarlo sin
    // desprenderla reenvia exactamente el archivo que el servidor rechazo, y como el item
    // ya queda marcado como degradado la politica de ese segundo 400 es cerrarlo: la hora
    // se perderia otra vez, que es justo el incidente que esta ruta viene a cerrar. Se
    // desprende aqui y viaja con su novedad, igual que la rama `retry_without_photo`.
    const detached = detachEvidence(item.payload as Record<string, unknown>, DEGRADED_MARKING_BLOCKED_REASON);
    return {
      ...item,
      status: "queued" as const,
      payload: withEscalationMarker(detached.payload, {
        kind: "degraded_evidence",
        failureCode: String(item.blocked_code || ""),
        photoRefs: evidenceRefsOf(item)
      }),
      attempts: evidenceRetryAttemptsOf(item),
      blocked_reason: "",
      blocked_code: "",
      evidence_degraded: true,
      metadata: { ...(item.metadata || {}), ...markEvidenceRetryAttempt(item, new Date().toISOString()) }
    };
  });
  return { items: released ? next : items, released };
}

// Se llama una sola vez por carga de pantalla (el efecto de arranque). Persiste
// el resultado antes de reintentar para que un cierre del navegador no vuelva a
// gastar el unico reintento automatico.
function selfHealEvidenceQueue(onUpdate: SyncUpdate) {
  const queue = readPendingSync();
  if (!queue.some((item) => isEvidenceBlockedSelfHealCandidate(item))) return false;
  const healed = releaseEvidenceBlockedItems(queue);
  if (!healed.released) return false;
  const written = writePendingSync(healed.items);
  const notices = [...readSelfHealNotices(), SELF_HEAL_RELEASE_NOTICE];
  writeSelfHealNotices(notices);
  onUpdate(written.items, notices[notices.length - 1], "pending");
  return true;
}

// Escalada al supervisor. No existe un endpoint de novedades self-service en el
// API (`apps/api/src/modules/hr/routes.js` solo expone `/hr/novelties` en lectura
// con permiso `hr.read`), asi que la novedad se DECLARA dentro del `metadata` de
// la propia marcacion, que viaja intacto hasta la fila y lo leen el monitor y el
// reporte. Cuando el backend publique el endpoint, cambia solo el transporte: el
// contrato del dato (`buildHrNoveltyMarker`) queda igual.
function withEscalationMarker(payload: Record<string, unknown>, input: {
  kind: "degraded_evidence" | "expired_marking";
  failureCode: string;
  photoRefs: string[];
}): Record<string, unknown> {
  const punchedAt = String(payload.punched_at || new Date().toISOString());
  return attachHrNoveltyMarker(payload, buildHrNoveltyMarker({
    kind: input.kind,
    message: input.kind === "degraded_evidence" ? NOVELTY_PENDING_PHOTO_MESSAGE : NOVELTY_EXPIRED_MARKING_MESSAGE,
    punchType: String(payload.type || ""),
    punchedAt,
    idempotencyKey: String(payload.idempotency_key || ""),
    failureCode: input.failureCode,
    photoRefs: input.photoRefs
  }));
}

// Novedad de una marcacion CERRADA por regla de negocio. No hay POST posible: el
// propio servidor la rechazo, y reenviarla con otro `idempotency_key` seria
// inventarse una hora. La novedad se guarda en la propia fila cerrada
// (`escalated_novelty`) para que la cola la muestre y el supervisor la vea al
// revisar el equipo; cuando el backend publique el endpoint, esto es lo unico
// que cambia de transporte.
function recordClosedMarkingNovelty(item: PendingSyncItem, payload: Record<string, unknown>) {
  const marker = readHrNoveltyMarker(payload);
  if (!marker) return "";
  const queue = readPendingSync().map((entry) => (entry.id === item.id ? { ...entry, escalated_novelty: marker.kind } : entry));
  writePendingSync(queue);
  return marker.kind;
}

async function settle<T>(promise: Promise<T>, fallback: T): Promise<RequestOutcome<T>> {
  try {
    return requestOutcome(true, await promise);
  } catch {
    return requestOutcome(false, fallback);
  }
}

type SyncUpdate = (items: PendingSyncItem[], message?: string, tone?: MessageTone) => void;

function newPunchIdempotencyKey() {
  return globalThis.crypto?.randomUUID?.() || `hr-punch-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// Se reescribe la clave en los dos sitios donde viaja: el campo de primer nivel que
// lee el servidor y `metadata.idempotency_key` que la pantalla usa para emparejar la
// marcacion optimista. Dejar uno de los dos viejo volveria a producir el conflicto.
function withIdempotencyKey(payload: Record<string, unknown>, key: string): Record<string, unknown> {
  const metadata = payload.metadata && typeof payload.metadata === "object" ? (payload.metadata as Record<string, unknown>) : {};
  return { ...payload, idempotency_key: key, metadata: { ...metadata, idempotency_key: key } };
}

export type IdempotencyResolution = "already_registered" | "retry_with_new_key" | "escalate";

// Reconciliacion de la clave en conflicto contra la unica lectura propia que existe
// hoy (`GET /api/v1/hr/self/attendance`, que devuelve `idempotency_key` en cada
// punch del dia). La decision pura vive en `reconcileIdempotencyConflict`; aqui solo
// esta el transporte y el recorte por horario/clave.
async function reconcileAgainstServer(item: PendingSyncItem): Promise<{ outcome: IdempotencyResolution }> {
  const payload = (item.payload || {}) as Record<string, unknown>;
  const punchedAt = String(payload.punched_at || item.created_at || "");
  const punchType = String(payload.type || "");
  const key = String(payload.idempotency_key || "");
  let rows: Attendance["punches"] = [];
  try {
    const day = punchedAt.slice(0, 10);
    const attendance = await api<Attendance[]>(`/api/v1/hr/self/attendance?date=${day}`, { silentFailureAlert: true });
    const routeKey = String(payload.route_id ?? "");
    // El empleado puede tener varias filas (una por horario o sin horario). Se
    // agrupan las punches de SU jornada: si hay una sola fila se usa tal cual, y si
    // hay varias se toma la del horario marcado, con la primera como respaldo.
    const groups = Array.isArray(attendance) ? attendance : [];
    const scoped = routeKey ? groups.filter((group) => String(group?.route_id ?? "") === routeKey) : [];
    const chosen = scoped.length ? scoped : groups.slice(0, 1);
    rows = chosen.flatMap((group) => (Array.isArray(group?.punches) ? group.punches : []));
  } catch {
    // Sin lectura no hay con qué reconciliar: mejor cerrar visible que reintentar a
    // ciegas y volver al bucle que dejo al operario bloqueado todo el dia.
    return { outcome: "escalate" };
  }
  const decision = reconcileIdempotencyConflict({ punchType, idempotencyKey: key, punches: rows });
  if (decision.outcome === "already_registered") return { outcome: "already_registered" };
  if (decision.outcome === "not_registered") return { outcome: "retry_with_new_key" };
  // Ya existe el mismo tipo de marcacion con otra clave: reenviar duplicaria la
  // hora. Es el unico caso que necesita administrador.
  return { outcome: "escalate" };
}

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
      const index = queue.findIndex((item) => isSendableItem(item));
      if (index < 0) break;
      const item = queue[index];
      let outbound: unknown;
      try {
        outbound = await rehydrateEvidence(item.payload);
      } catch (error) {
        // La evidencia ya no esta en el dispositivo: no hay foto que desprenderse,
        // asi que la marcacion se cierra con motivo visible y se escala. Nunca se
        // descarta en silencio.
        const failure = classifySyncFailure(error);
        queue = writePendingSync(blockPendingSync(queue, item.id, syncFailureReason(failure), failure.code)).items;
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
        onUpdate?.(queue, queue.filter((entry) => isPendingItem(entry)).length
          ? `${item.label} sincronizado. Quedan ${queue.filter((entry) => isPendingItem(entry)).length} registro(s) por confirmar.`
          : `${item.label} sincronizado. El monitor ya puede actualizarse.`, "success");
      } catch (error) {
        const transition = decideQueueTransition({ error, hasPhotoAttached: itemHasDetachablePhoto(item) });
        const failure = classifySyncFailure(error);

        if (transition.action === "retry_without_photo") {
          // Clase evidencia: LA MARCACION SOBREVIVE. Se reintenta YA, en este mismo
          // ciclo, con la foto desprendida del payload y con la MISMA
          // `idempotency_key` que traia el item: por eso el servidor almacena UNA
          // sola fila, no dos. La foto NO se borra de IndexedDB ni se le quita la
          // referencia al item: sigue aqui hasta que el supervisor pueda
          // recibirla, y por eso `cleanupEvidence` no se llama en esta rama.
          const detached = detachEvidence(outbound as Record<string, unknown>, DEGRADED_MARKING_BLOCKED_REASON);
          const marked = withEscalationMarker(detached.payload, {
            kind: "degraded_evidence",
            // El codigo que declara el desprendimiento tiene que ser el de evidencia que devolvio el
            // servidor en details, no el paraguas VALIDACION: con el paraguas el API no reconoce
            // la excepcion y la hora se vuelve a perder.
            failureCode: evidenceCodeOf(error) || failure.code,
            photoRefs: evidenceRefsOf(item)
          });
          try {
            await api(item.path, { method: "POST", body: JSON.stringify(marked) });
            // Un solo punch almacenado: la fila queda degradada y el item sale de la
            // cola. La foto sobrevive en IndexedDB y su conteo se muestra aparte.
            queue = writePendingSync(queue.filter((entry) => entry.id !== item.id)).items;
            changed = true;
            publishHrMonitorRefresh({ source: "mobile-sync" });
            onUpdate?.(queue, DEGRADED_MARKING_NOTICE, "success");
            continue;
          } catch (retryError) {
            // Sin foto tampoco entro: ya no es un problema de formato. Vale la
            // politica del nuevo fallo (transitorio vuelve a la cola, regla de
            // negocio se cierra) y la foto queda guardada igual en el equipo.
            const retryTransition = decideQueueTransition({ error: retryError, hasPhotoAttached: false });
            const retryFailure = classifySyncFailure(retryError);
            if (retryTransition.action === "close") {
              queue = writePendingSync(closePendingSyncItem(queue, item.id, syncFailureReason(retryFailure), retryFailure.code)).items;
              changed = true;
              onUpdate?.(queue, `${item.label}: ${retryTransition.notice}`, "error");
              continue;
            }
            const degraded = { ...item, attempts: item.attempts + 1, status: "queued" as const, evidence_degraded: true, blocked_reason: "", blocked_code: "" };
            queue = writePendingSync(queue.map((entry) => (entry.id === item.id ? degraded : entry))).items;
            changed = true;
            markQueueFailureObserved();
            onUpdate?.(queue, `${item.label}: ${DEGRADED_MARKING_NOTICE}`, "pending");
            break;
          }
        }

        if (transition.action === "reconcile") {
          // IDEMPOTENCY_KEY_CONFLICT: la clave ya existe en el servidor. Antes esto
          // se cerraba (o reintentaba para siempre, que es como dejo a un operario
          // sin jornada todo un dia). Ahora se consulta la asistencia propia y se
          // decide con el dato real: o la hora ya esta, o no esta y se puede
          // reintentar con clave nueva.
          const resolution = await reconcileAgainstServer(item);
          if (resolution.outcome === "already_registered") {
            queue = writePendingSync(queue.filter((entry) => entry.id !== item.id)).items;
            changed = true;
            void cleanupEvidence(item);
            publishHrMonitorRefresh({ source: "mobile-sync" });
            onUpdate?.(queue, `${item.label}: ${IDEMPOTENCY_ALREADY_REGISTERED_NOTICE}`, "success");
            continue;
          }
          if (resolution.outcome === "retry_with_new_key") {
            const freshKey = newPunchIdempotencyKey();
            // La reescritura se hace sobre el payload ENCOLADO, no sobre `outbound`:
            // la foto ya vive en IndexedDB bajo una referencia y rehidratarla otra vez
            // costaria otro decode de varios megas por un caso raro.
            const rewritten = withIdempotencyKey(item.payload as Record<string, unknown>, freshKey);
            try {
              await api(item.path, { method: "POST", body: JSON.stringify(await rehydrateEvidence(rewritten)) });
              queue = writePendingSync(queue.filter((entry) => entry.id !== item.id)).items;
              changed = true;
              void cleanupEvidence(item);
              publishHrMonitorRefresh({ source: "mobile-sync" });
              onUpdate?.(queue, `${item.label} sincronizado.`, "success");
              continue;
            } catch (retryError) {
              // Se vuelve a evaluar la politica con el fallo nuevo; si sigue siendo
              // conflicto, `reconciliations` corta el bucle y la fila se cierra.
              const retryTransition = decideQueueTransition({ error: retryError, hasPhotoAttached: itemHasDetachablePhoto(item) });
              const retryFailure = classifySyncFailure(retryError);
              queue = writePendingSync(retryTransition.action === "close"
                ? closePendingSyncItem(queue, item.id, syncFailureReason(retryFailure), retryFailure.code)
                : blockPendingSync(queue.map((entry) => (entry.id === item.id ? { ...entry, payload: rewritten } : entry)), item.id, IDEMPOTENCY_UNRECOVERABLE_NOTICE, retryFailure.code)).items;
              changed = true;
              onUpdate?.(queue, `${item.label}: ${IDEMPOTENCY_UNRECOVERABLE_NOTICE}`, "error");
              continue;
            }
          }
          queue = writePendingSync(blockPendingSync(queue, item.id, IDEMPOTENCY_UNRECOVERABLE_NOTICE, "IDEMPOTENCY_KEY_CONFLICT")).items;
          changed = true;
          onUpdate?.(queue, `${item.label}: ${IDEMPOTENCY_UNRECOVERABLE_NOTICE}`, "error");
          continue;
        }

        if (transition.action === "close") {
          // Clase marcacion: la regla de negocio rechazo el punch. Se CIERRA para
          // que deje de aparecer como "por enviar" y para que no bloquee lo que
          // viene detras, con el motivo a la vista y la accion concreta.
          const expired = isExpiredDeferredMarking(error);
          const closed = withEscalationMarker(outbound as Record<string, unknown>, {
            kind: "expired_marking",
            failureCode: failure.code,
            photoRefs: evidenceRefsOf(item)
          });
          void recordClosedMarkingNovelty(item, closed);
          // La foto NO se borra: un cierre necesita evidencia para que el
          // administrador pueda corregir la hora contra lo realmente tomado.
          queue = writePendingSync(closePendingSyncItem(queue, item.id, transition.notice, failure.code || (expired ? "MARCACION_DIFERIDA_EXPIRADA" : ""))).items;
          changed = true;
          onUpdate?.(queue, `${item.label}: ${transition.notice}`, transition.tone);
          continue;
        }

        if (permanentSyncFailure(error)) {
          // 4xx que la politica no reconoce como ninguna de las dos clases (sesion,
          // alcance): se conserva el comportamiento histórico de bloqueo visible.
          queue = writePendingSync(blockPendingSync(queue, item.id, syncFailureReason(failure), failure.code)).items;
          changed = true;
          onUpdate?.(queue, `${item.label} no fue aceptado: ${syncFailureReason(failure)}`, "error");
          continue;
        }
        const next = { ...item, attempts: item.attempts + 1 };
        queue = writePendingSync(queue.map((entry) => (entry.id === item.id ? next : entry))).items;
        markQueueFailureObserved();
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
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [routes, setRoutes] = useState<TimeRoute[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [message, setMessage] = useState("");
  const [extraReason, setExtraReason] = useState("");
  const [extraDetail, setExtraDetail] = useState("");
  const [extraEvidence, setExtraEvidence] = useState<CapturedFile | null>(null);
  const [identitySelfie, setIdentitySelfie] = useState<CapturedFile | null>(null);
  // La foto vale para el paso en que se tomo: sin este ancla, una selfie de entrada
  // sirve de validacion de salida cuando el paso avanza sin que la pantalla la suelte.
  const [selfieType, setSelfieType] = useState("");
  const [dayMileage, setDayMileage] = useState("");
  const [startMileage, setStartMileage] = useState("");
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
  // Estado de pantalla, no de error: "no_ficha" = el usuario no tiene empleado vinculado,
  // "no_horario" = tiene ficha pero hoy no le corresponde ningun horario. Los dos se resuelven
  // antes de montar la ventana de marcado para que el operario no vea cuatro tarjetas de
  // "Fallo tecnico detectado" por unos 404 que son informacion, ni tenga que adivinar porque
  // los botones no hacen nada.
  const [blocked, setBlocked] = useState<null | "no_ficha" | "no_horario">(null);
  // La foto que el telefono NO pudo entregar no es un callejon: la marcacion sigue
  // siendo posible y la hora se registra. `degradedPhoto` guarda el motivo tecnico
  // (para el supervisor) y activa el envio degradado; la operario solo ve una frase
  // en espanol plano que no nombra formatos.
  const [degradedPhoto, setDegradedPhoto] = useState<{ reason: string; detail: string; step: string } | null>(null);
  // La camara fallo en UN paso, no en la jornada: si el operario cambia de paso sin marcar,
  // el paso nuevo vuelve a exigir foto.
  const degradedFor = (type: string) => Boolean(degradedPhoto && degradedPhoto.step === type);
  // Fotos rechazadas que siguen vivas en IndexedDB esperando revision. Se leen al
  // montar para que el conteo sobreviva a recargar la pantalla.
  const [pendingReviewCount, setPendingReviewCount] = useState(0);

  function notify(text: string, tone: MessageTone = "success") {
    setMessage(text);
    setMessageTone(tone);
  }

  // La camara avisa con un resultado estructurado, nunca con una pantalla en blanco.
  async function onSelfieUnusable(outcome: PhotoUnusableOutcome) {
    const ref = newHrOfflineEvidenceRef("hr-selfie-pendiente");
    const stored = await putPendingReviewEvidence({
      ref,
      base64: "",
      size: 0,
      type: outcome.reason,
      name: `selfie-${new Date().toISOString()}`,
      reason: outcome.message,
      punch_type: String(currentAttendance.next_type || "entrada"),
      punched_at: new Date().toISOString()
    });
    setPendingReviewCount((current) => current + (stored ? 1 : 0));
    setDegradedPhoto({ reason: outcome.reason, detail: outcome.message, step: String(currentAttendance.next_type || "entrada") });
  }

  const load = useCallback(async () => {
    // La ficha abre o cierra la pantalla: si el usuario no tiene un empleado vinculado, el API
    // responde 404 en las cinco lecturas y cada 404 levantaba su tarjeta de "Fallo tecnico
    // detectado". Se lee primero, con la alerta global silenciada y el estado HTTP a la vista,
    // para no lanzar las consultas que dependen de ella. Un fallo de red (status 0) no es una
    // ficha ausente: ahi manda el respaldo local y el aviso de horario degradado de siempre.
    const meResult = await api<Employee>("/api/v1/hr/self", { silentFailureAlert: true })
      .then((value) => ({ ok: true as const, status: 200, value }))
      .catch((error) => ({
        ok: false as const,
        status: Number((error as { status?: number })?.status || 0),
        value: null as Employee | null
      }));
    const cached = readHrSnapshot();
    if (!meResult.ok && meResult.status === 404 && !(cached?.self && cached.taken_day === todayBogota())) {
      setEmployee(null);
      setRoutes([]);
      setAttendance([]);
      setActivityTypes([]);
      setSession(null);
      setScheduleSource("live");
      setScheduleNotice("");
      setBlocked("no_ficha");
      return;
    }
    const [routesResult, attendanceResult, typesResult, sessionResult] = await Promise.all([
      settle<TimeRoute[]>(api<TimeRoute[]>("/api/v1/hr/self/routes"), []),
      settle<Attendance[]>(api<Attendance[]>("/api/v1/hr/self/attendance"), []),
      settle<ActivityType[]>(api<ActivityType[]>("/api/v1/hr/self/activity-types"), []),
      settle<WorkSession | null>(api<WorkSession>("/api/v1/hr/self/work-session"), null)
    ]);
    const today = todayBogota();
    const dayRoutes = routesResult.value.filter((item) => !item.date || String(item.date).slice(0, 10) === today);
    const snapshot = buildHrOfflineSnapshot({
      previous: cached,
      self: requestOutcome(meResult.ok, meResult.value),
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
    // Con ficha y conexion, un dia sin horarios es un estado que la pantalla debe decir en voz
    // alta, no un listado vacio con botones que no llevan a ningun lado. En modo respaldo
    // (snapshot) no se bloquea: el operario sigue marcando con lo que tiene en el dispositivo.
    setBlocked(resolved.source === "live" && !resolved.routes.length ? "no_horario" : null);
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

  // El conteo de fotos pendientes de revision sobrevive a recargar la pantalla:
  // viven en su propio almacen, fuera de la cola que si se sincroniza.
  useEffect(() => {
    let mounted = true;
    void listPendingReviewEvidence().then((rows) => {
      if (mounted) setPendingReviewCount(rows.length);
    }).catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const initialQueue = readPendingSync();
    setPendingSync(initialQueue);
    setOnline(typeof navigator === "undefined" ? true : navigator.onLine !== false);
    // Los blobs cuya marcacion ya no esta en la cola son huerfanos de sesiones interrumpidas.
    void pruneHrOfflineEvidence(initialQueue.flatMap(evidenceRefsOf));
    let mounted = true;
    // Self-heal acotado: lo que la version anterior bloqueo por un problema de foto
    // se libera UNA vez y se reintenta sin la foto. Sin esto, los operarios
    // afectados seguirian pegados despues del despliegue. Va despues de `mounted`
    // porque su callback de actualizacion es asincrono respecto a este efecto.
    selfHealEvidenceQueue((items, syncMessage, tone) => {
      if (!mounted) return;
      setPendingSync(items);
      if (syncMessage) notify(syncMessage, tone || "pending");
    });
    // El reintento ya NO es un `setInterval` fijo de 12 s. Medido en produccion: la
    // distancia p50 entre fallos consecutivos del mismo usuario+route era 9,2 s, o
    // sea exactamente ese intervalo menos lo que tarda el intento, con cada petición
    // pudiendo quemar 20 s de timeout y ~7 lecturas paralelas por tick. Ahora hay UN
    // tick a la vez (`tickRunning`, porque `flushPendingSync` tiene su propio
    // single-flight y un segundo arranque solo devolvía false) y el siguiente
    // reintento llega tras respaldo exponencial con jitter SOLO si el anterior
    // fallo. Con la cola limpia se vuelve al ritmo lento de siempre.
    let timer = 0;
    let tickRunning = false;
    let consecutiveFailures = 0;
    const schedule = (delay: number) => {
      if (!mounted) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(runTick, Math.max(1000, delay));
    };
    const runTick = () => {
      if (!mounted) return;
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        setPendingSync(readPendingSync());
        // Sin senal no hay nada que intentar: se espera el evento `online`.
        schedule(QUEUE_IDLE_POLL_MS);
        return;
      }
      if (tickRunning) {
        // Solaparse seria exactamente la tormenta que se midio.
        schedule(2000);
        return;
      }
      tickRunning = true;
      flushPendingSync((items, syncMessage, tone) => {
        if (!mounted) return;
        setPendingSync(items);
        if (syncMessage) notify(syncMessage, tone || "pending");
        if (queueSawFailure) consecutiveFailures += 1;
      }).then((changed) => {
        if (changed && mounted) load().catch(() => undefined);
      }).catch(() => {
        consecutiveFailures += 1;
      }).finally(() => {
        tickRunning = false;
        queueSawFailure = false;
        if (!mounted) return;
        const remaining = readPendingSync().filter(isSendableItem).length;
        if (!remaining) {
          consecutiveFailures = 0;
          schedule(QUEUE_IDLE_POLL_MS);
          return;
        }
        schedule(consecutiveFailures > 0
          ? queueNextPollMs("failure", consecutiveFailures)
          : QUEUE_IDLE_POLL_MS);
      });
    };
    const goOnline = () => {
      if (!mounted) return;
      setOnline(true);
      // Al recuperar senal el horario vuelve a ser la fuente de verdad: se recarga y se vacia la cola.
      load().catch(() => undefined);
      // La senal recuperada es la unica señal que SI merece intento inmediato.
      consecutiveFailures = 0;
      schedule(0);
    };
    const goOffline = () => {
      if (mounted) setOnline(false);
    };
    // `focus` sigue reintentando al instante: el operario que vuelve a la app
    // quiere ver su cola resuelta, no esperar el respaldo.
    const onFocus = () => {
      consecutiveFailures = 0;
      schedule(0);
    };
    runTick();
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    window.addEventListener("focus", onFocus);
    return () => {
      mounted = false;
      window.clearTimeout(timer);
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("focus", onFocus);
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
  // La tolerancia tiene que ser la misma que aplica el servidor al calcular los
  // minutos extra. Cuando la pantalla no la restaba, entre la hora de cierre y
  // el fin de la tolerancia el formulario se exigia aqui y el servidor no lo
  // pedia: el empleado llenaba motivo y foto para nada.
  const toleranceMinutes = Math.max(0, Number(route?.tolerance_minutes ?? 15));
  const minutesNow = (() => {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  })();
  const scheduleMinutes = (value?: string | null) => {
    const match = String(value || "").match(/^(\d{1,2}):(\d{2})/);
    return match ? Number(match[1]) * 60 + Number(match[2]) : null;
  };
  const isArrivingLate = (() => {
    if (nextType !== "entrada") return false;
    const expected = scheduleMinutes(route?.start_time);
    return expected != null && minutesNow > expected + toleranceMinutes;
  })();
  const isClosingLate = (() => {
    if (nextType !== "salida") return false;
    const expected = scheduleMinutes(route?.end_time);
    return expected != null && minutesNow > expected + toleranceMinutes;
  })();
  // Lo que hay que justificar es lo que cae fuera de la tolerancia, que es el
  // mismo numero que el servidor guarda en la marcacion.
  const justifiedMinutes = (() => {
    const expected = scheduleMinutes(isArrivingLate ? route?.start_time : route?.end_time);
    if (expected == null) return 0;
    return Math.max(0, minutesNow - expected - toleranceMinutes);
  })();
  const needsJustification = isArrivingLate || isClosingLate;
  const needsSelfie = Boolean(nextType && selfieRequiredPunches.has(nextType));
  // "Por enviar" son SOLO las que aun esperan. Un cierre ya no cuenta aqui: ese era
  // el item que se quedaba bloqueando la cola para siempre.
  const pendingQueued = pendingSync.filter(isPendingItem);
  const pendingBlocked = pendingSync.filter(isBlockedItem);
  const pendingClosed = pendingSync.filter(isClosedItem);
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
      // La selfie sigue siendo obligatoria, SALVO cuando el telefono demostro que no
      // puede entregarla: ahi bloquear al operario es perderle la jornada por culpa de
      // un formato. Se marca igual y la foto va a revision del supervisor.
      if (selfieRequiredPunches.has(type) && !identitySelfie && !degradedFor(type)) {
        notify("Toma la selfie de validacion antes de marcar.", "error");
        return;
      }
      if (selfieRequiredPunches.has(type) && identitySelfie && selfieType !== type && !degradedFor(type)) {
        notify(`La foto es de ${punchLabels[selfieType as keyof typeof punchLabels]?.title || "otro paso"}: toma la selfie de ${punchLabels[type]?.title.toLowerCase() || "este paso"}.`, "error");
        return;
      }
      if (type === "entrada" && isArrivingLate && (!extraReason || !extraDetail.trim() || !extraEvidence)) {
        notify("Llegada fuera de tolerancia: selecciona motivo, escribe el sustento y adjunta evidencia fotografica.", "error");
        return;
      }
      if (type === "salida" && isClosingLate && (!extraReason || !extraDetail.trim() || !extraEvidence)) {
        notify("Cierre fuera de horario: selecciona motivo, escribe el sustento y adjunta evidencia fotografica.", "error");
        return;
      }
      if (type === "entrada" && vehiclePlate) {
        const normalizedStart = startMileage.trim().replace(",", ".");
        if (!/^\d+(\.\d{1,1})?$/.test(normalizedStart)) {
          notify("Registra el kilometraje inicial con maximo un decimal antes de abrir la jornada.", "error");
          return;
        }
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
      // Sin previewUrl: es un blob: del navegador, no sobrevive a la cola ni
      // significa nada en el servidor.
      if (identitySelfie?.base64) {
        payload.identity_photo = { base64: identitySelfie.base64, name: identitySelfie.name, type: identitySelfie.type, size: identitySelfie.size };
      }
      if (type === "entrada") {
        const arrivalDetail = extraDetail.trim();
        if (extraReason) payload.extra_reason = extraReason;
        if (arrivalDetail) payload.extra_detail = arrivalDetail;
        if (extraEvidence?.base64) payload.extra_evidence = extraEvidence;
        if (vehiclePlate) payload.kilometraje_inicial = startMileage.trim().replace(",", ".");
      }
      if (type === "salida") {
        const closingDetail = extraDetail.trim();
        if (extraReason) payload.extra_reason = extraReason;
        if (closingDetail) payload.extra_detail = closingDetail;
        if (extraEvidence?.base64) payload.extra_evidence = extraEvidence;
        if (vehiclePlate) payload.kilometraje_dia = dayMileage.trim().replace(",", ".");
      }
      // Marcacion degradada declarada: la hora viaja sin foto y con la novedad del
      // supervisor pegada al metadata, que es el unico transporte que existe hoy.
      if (degradedFor(type) && selfieRequiredPunches.has(type)) {
        payload.metadata = attachHrNoveltyMarker(payload, buildHrNoveltyMarker({
          kind: "degraded_evidence",
          message: NOVELTY_PENDING_PHOTO_MESSAGE,
          punchType: type,
          punchedAt: markedAt.toISOString(),
          idempotencyKey,
          failureCode: `FOTO_${String(degradedPhoto.reason || "").toUpperCase()}`,
          photoRefs: []
        })).metadata;
      }
      setExtraReason("");
      setExtraDetail("");
      setExtraEvidence(null);
      setIdentitySelfie(null);
      setSelfieType("");
      setDegradedPhoto(null);
      if (type === "entrada") setStartMileage("");
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
      {pendingClosed.length ? (
        <div className="rounded-md border border-slate-300 bg-slate-50 p-4 text-sm font-semibold text-slate-900" role="status">
          <p className="flex items-center gap-2"><CalendarX size={16} /> {pendingClosed.length} marcacion(es) cerradas: no se van a enviar y no cuentan como pendientes. Tu hora la debe registrar un administrador.</p>
          <ul className="mt-2 space-y-2">
            {pendingClosed.map((item) => (
              <li className="rounded-md border border-slate-300 bg-white p-2" key={item.id}>
                <p className="text-sm font-semibold">{item.label} · {new Date(item.created_at).toLocaleString("es-CO")}</p>
                <p className="mt-1 text-xs font-medium text-slate-700">{item.blocked_reason || "El servidor rechazo esta marcacion."}</p>
                <button className="mt-2 h-10 rounded-md border border-slate-300 px-3 text-xs font-semibold text-slate-800 hover:bg-slate-100" onClick={() => setPendingSync(discardPendingSync(item.id))} type="button">
                  Ya la reporte, quitar de la lista
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {pendingReviewCount ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-950" role="status">
          {pendingReviewCount} foto(s) quedaron guardadas en este equipo esperando revision de tu supervisor. Tu hora ya fue registrada.
        </div>
      ) : null}

      {blocked ? null : <section className="grid grid-cols-2 gap-2 rounded-md border border-line bg-white p-1 shadow-sm">
        <button className={`h-12 rounded-md text-base font-semibold ${view === "marcar" ? "bg-apex text-white" : "text-neutral-700"}`} onClick={() => setView("marcar")} type="button">
          Marcar
        </button>
        <button className={`h-12 rounded-md text-base font-semibold ${view === "historial" ? "bg-apex text-white" : "text-neutral-700"}`} onClick={() => setView("historial")} type="button">
          Historial
        </button>
      </section>}

      {blocked ? (
        <section className="rounded-md border border-line bg-white p-8 text-center shadow-sm" role="status">
          <CalendarX className="mx-auto text-neutral-400" size={48} aria-hidden="true" />
          <h2 className="mt-5 text-2xl font-semibold">Sin horario asignado</h2>
          <p className="mt-3 text-sm font-medium text-neutral-700">
            {blocked === "no_ficha"
              ? "Tu usuario no tiene una ficha laboral asociada, así que no hay jornada que registrar desde aquí. Pide a Talento Humano que vincule tu ficha a este usuario."
              : "Hoy no tienes ningún horario asignado. La ventana de marcación se abre el día en que Talento Humano publique tu horario."}
          </p>
          <p className="mt-3 text-xs font-medium text-neutral-500">
            No es una falla de la aplicación: tus marcaciones anteriores y las pendientes de sincronizar siguen donde estaban.
          </p>
          <button className="mt-5 inline-flex h-12 items-center gap-2 rounded-md border border-line px-4 text-sm font-semibold text-neutral-700 hover:bg-neutral-50" onClick={() => load()} type="button">
            <RefreshCw size={16} /> Volver a revisar
          </button>
        </section>
      ) : null}

      {!blocked && view === "marcar" ? (
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
            {needsSelfie ? (
              <div className="mt-3">
                <PhotoCapture
                  facing="user"
                  key={nextType}
                  label={`Selfie de ${punchLabels[nextType ?? ""]?.title || "validacion"}`}
                  onChange={(photo) => { setIdentitySelfie(photo); setSelfieType(nextType ?? ""); }}
                  onUnusable={onSelfieUnusable}
                  required
                  value={selfieType === nextType ? identitySelfie : null}
                />
                {degradedPhoto ? (
                  <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs font-semibold text-amber-950" role="status">
                    {PHOTO_UNUSABLE_COPY} Puedes pulsar el boton de marcar: tu hora si se registra.
                  </p>
                ) : null}
                <p className="mt-2 text-xs text-neutral-500">Debe verse tu rostro. Las cuatro marcaciones piden foto: entrada, salida a almuerzo, retorno y cierre.</p>
              </div>
            ) : null}
            {needsJustification ? (
              <div className="mt-3 space-y-3 rounded-md border border-amber-200 bg-amber-50 p-3">
                <div>
                  <p className="text-sm font-semibold text-amber-950">{isArrivingLate ? "Llegada tarde detectada" : "Extension de horario detectada"}</p>
                  <p className="mt-1 text-xs text-amber-900">
                    {isArrivingLate
                      ? `Vas ${justifiedMinutes} min por fuera de la tolerancia de ${toleranceMinutes} min. Para registrar la entrada debes seleccionar motivo, sustentar y adjuntar foto.`
                      : `Vas ${justifiedMinutes} min por fuera de la tolerancia de ${toleranceMinutes} min. Para cerrar jornada fuera del horario planeado debes seleccionar motivo, sustentar y adjuntar foto.`}
                  </p>
                </div>
                <select className="h-12 w-full rounded-md border border-amber-200 bg-white px-3 text-base" value={extraReason} onChange={(event) => setExtraReason(event.target.value)}>
                  <option value="">{isArrivingLate ? "Motivo de la llegada tarde *" : "Motivo de extension *"}</option>
                  {(isArrivingLate ? latenessReasons : overtimeReasons).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
                <textarea className="min-h-24 w-full rounded-md border border-amber-200 bg-white px-3 py-3 text-base" placeholder={isArrivingLate ? "Sustento obligatorio: que paso, a quien avisaste y desde donde vienes" : "Sustento obligatorio: quien autorizo, punto, cliente o novedad"} value={extraDetail} onChange={(event) => setExtraDetail(event.target.value)} />
                <PhotoCapture label={isArrivingLate ? "Foto obligatoria de soporte de la llegada tarde" : "Foto obligatoria de soporte de extension"} required value={extraEvidence} onChange={setExtraEvidence} />
              </div>
            ) : nextType === "salida" ? (
              <textarea className="mt-3 min-h-24 w-full rounded-md border border-line px-3 py-3 text-base" placeholder="Observacion opcional de cierre" value={extraDetail} onChange={(event) => setExtraDetail(event.target.value)} />
            ) : null}
            {nextType === "entrada" && vehiclePlate ? (
              <label className="mt-3 block rounded-md border border-line bg-white p-3">
                <span className="text-sm font-semibold text-neutral-900">Kilometraje inicial del dia</span>
                <span className="mt-1 block text-xs text-neutral-500">Obligatorio para abrir una jornada con vehiculo. Es la lectura del odometro al recibir el vehiculo.</span>
                <div className="mt-2 flex items-center gap-2">
                  <input className="h-12 min-w-0 flex-1 rounded-md border border-line px-3 text-base" inputMode="decimal" placeholder="Ej: 128430.5" value={startMileage} onChange={(event) => setStartMileage(event.target.value)} />
                  <span className="rounded-md bg-paper px-3 py-3 text-sm font-semibold text-neutral-700">km</span>
                </div>
                {startMileage.trim() ? <span className="mt-2 block text-xs font-semibold text-apex">Kilometraje inicial: {startMileage.trim().replace(",", ".")} km</span> : null}
              </label>
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

      {!blocked && view === "historial" ? <section className="rounded-md border border-line bg-white p-3 shadow-sm sm:p-4">
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

      {mounted && preop ? createPortal((
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
      ), document.body) : null}

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
