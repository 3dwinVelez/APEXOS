// Logica pura de la marcacion sin senal. No toca DOM ni localStorage para poder
// probarla con node --test, igual que hrScheduleMonitor.ts.

export type GpsFailureCause = "PERMISSION_DENIED" | "POSITION_UNAVAILABLE" | "TIMEOUT" | "UNSUPPORTED" | "UNKNOWN";

const KNOWN_GPS_CAUSES: GpsFailureCause[] = ["PERMISSION_DENIED", "POSITION_UNAVAILABLE", "TIMEOUT", "UNSUPPORTED"];

// Codigo que viaja en la novedad GPS_INACTIVO_SIN_SENAL (th_novedades_jornada.metadata.reason).
export const GPS_UNAVAILABLE_REASONS: Record<GpsFailureCause, string> = {
  PERMISSION_DENIED: "permiso_ubicacion_denegado",
  POSITION_UNAVAILABLE: "gps_no_disponible",
  TIMEOUT: "gps_sin_fix_timeout",
  UNSUPPORTED: "dispositivo_sin_gps",
  UNKNOWN: "gps_no_disponible"
};

export const OFFLINE_GPS_REASON = "sin_senal";

export function gpsFailureCause(error: unknown): GpsFailureCause {
  const declared = String((error as { gpsCause?: unknown })?.gpsCause || "").toUpperCase();
  if (KNOWN_GPS_CAUSES.includes(declared as GpsFailureCause)) return declared as GpsFailureCause;
  // Un GeolocationPositionError sin envolver sigue siendo clasificable por su codigo numerico.
  const code = Number((error as { code?: number })?.code || 0);
  if (code === 1) return "PERMISSION_DENIED";
  if (code === 2) return "POSITION_UNAVAILABLE";
  if (code === 3) return "TIMEOUT";
  return "UNKNOWN";
}

// Negar el permiso es una decision del usuario, no falta de senal: es la unica causa
// que sigue bloqueando la marcacion.
export function gpsCauseIsUserDecision(cause: GpsFailureCause) {
  return cause === "PERMISSION_DENIED";
}

export type OfflineMarkingDecision = {
  allowed: boolean;
  gpsUnavailable: boolean;
  reason: string;
  userMessage: string;
};

const QUEUED_MESSAGE = "quedo guardada con su fecha y hora reales y se sincronizara al recuperar senal.";

export function decideOfflineMarking(input: {
  online: boolean;
  gpsRequired: boolean;
  hasFix?: boolean;
  cause?: GpsFailureCause | null;
}): OfflineMarkingDecision {
  if (!input.gpsRequired || input.hasFix) {
    return { allowed: true, gpsUnavailable: false, reason: "", userMessage: "" };
  }
  if (!input.online) {
    return {
      allowed: true,
      gpsUnavailable: true,
      reason: OFFLINE_GPS_REASON,
      userMessage: `Sin senal: la marcacion ${QUEUED_MESSAGE} Se registrara la novedad "GPS inactivo por falta de senal".`
    };
  }
  const cause = input.cause || "UNKNOWN";
  if (gpsCauseIsUserDecision(cause)) {
    return {
      allowed: false,
      gpsUnavailable: false,
      reason: GPS_UNAVAILABLE_REASONS[cause],
      userMessage: "El GPS es obligatorio y negaste el permiso de ubicacion. Habilitalo en el navegador para poder marcar."
    };
  }
  return {
    allowed: true,
    gpsUnavailable: true,
    reason: GPS_UNAVAILABLE_REASONS[cause],
    userMessage: `No fue posible obtener el GPS (${cause.replace(/_/g, " ").toLowerCase()}): la marcacion ${QUEUED_MESSAGE} Se registrara la novedad "GPS inactivo por falta de senal".`
  };
}

export function gpsUnavailableMetadata(input: { gpsUnavailable: boolean; reason: string; queuedAt: string }) {
  if (!input.gpsUnavailable) return {};
  return {
    gps_unavailable: true,
    gps_unavailable_reason: input.reason,
    queued_at: input.queuedAt
  };
}

export type HrOfflineSnapshot = {
  taken_at: string;
  taken_day: string;
  self: unknown;
  routes: unknown[];
  activity_types: unknown[];
};

export type RequestOutcome<T> = { ok: boolean; value: T };

export function requestOutcome<T>(ok: boolean, value: T): RequestOutcome<T> {
  return { ok, value };
}

// Sin horario fresco no hay snapshot nuevo que valga: se conserva el anterior para que
// envejezca por su propia taken_day y la pantalla pueda avisar que ya no es el dia.
export function buildHrOfflineSnapshot(input: {
  previous: HrOfflineSnapshot | null;
  self: RequestOutcome<unknown>;
  routes: RequestOutcome<unknown[]>;
  activityTypes: RequestOutcome<unknown[]>;
  takenAt: string;
  takenDay: string;
}): HrOfflineSnapshot | null {
  const previous = input.previous;
  if (!input.routes.ok) return previous;
  return {
    taken_at: input.takenAt,
    taken_day: input.takenDay,
    self: input.self.ok ? input.self.value : (previous?.self ?? null),
    routes: input.routes.value,
    activity_types: input.activityTypes.ok ? input.activityTypes.value : (previous?.activity_types || [])
  };
}

export function isSnapshotForDay(snapshot: HrOfflineSnapshot | null, today: string) {
  return Boolean(snapshot && snapshot.taken_day && snapshot.taken_day === today);
}

export type ScheduleSource = "live" | "snapshot" | "stale_snapshot" | "none";

export type ResolvedSchedule<T> = {
  source: ScheduleSource;
  routes: T[];
  takenAt: string;
  takenDay: string;
};

// Regla de producto: solo sirve el horario del dia en curso. Un snapshot de otro dia no
// se usa como horario vigente ni se inventa uno; se avisa.
export function resolveDegradedSchedule<T>(input: {
  routesOk: boolean;
  liveRoutes: T[];
  snapshot: HrOfflineSnapshot | null;
  today: string;
}): ResolvedSchedule<T> {
  if (input.routesOk) {
    return { source: "live", routes: input.liveRoutes, takenAt: "", takenDay: "" };
  }
  const snapshot = input.snapshot;
  const snapshotRoutes = Array.isArray(snapshot?.routes) ? snapshot?.routes as T[] : [];
  if (!snapshotRoutes.length) {
    return { source: "none", routes: [], takenAt: snapshot?.taken_at || "", takenDay: snapshot?.taken_day || "" };
  }
  if (!isSnapshotForDay(snapshot, input.today)) {
    return { source: "stale_snapshot", routes: [], takenAt: snapshot?.taken_at || "", takenDay: snapshot?.taken_day || "" };
  }
  return { source: "snapshot", routes: snapshotRoutes, takenAt: snapshot?.taken_at || "", takenDay: snapshot?.taken_day || "" };
}

export function degradedScheduleNotice(resolved: { source: ScheduleSource; takenAt: string; takenDay: string }, today: string) {
  if (resolved.source === "snapshot") {
    return "Sin conexion: estas marcando sobre el horario del dia guardado en este dispositivo.";
  }
  if (resolved.source === "stale_snapshot") {
    return `Sin conexion y sin horario de hoy (${today}) en este dispositivo. El ultimo horario guardado es del ${resolved.takenDay || "dia anterior"} y no sirve para marcar. Conectate para cargar tu jornada.`;
  }
  return "Sin conexion y sin horario guardado en este dispositivo. Conectate al menos una vez para poder marcar.";
}

export type SyncFailure = { status: number; code: string; message: string; retryable: boolean; permanent: boolean };

export function classifySyncFailure(error: unknown): SyncFailure {
  const status = Number((error as { status?: number })?.status || 0);
  const code = String((error as { code?: string })?.code || "");
  const message = error instanceof Error && error.message ? error.message : "El servidor rechazo el registro.";
  const permanent = status >= 400 && status < 500 && ![408, 429].includes(status);
  return { status, code, message, permanent, retryable: !permanent };
}

export function syncFailureReason(failure: SyncFailure) {
  return failure.code ? `${failure.message} (${failure.code})` : failure.message;
}

// =============================================================================
// Las tres clases de fallo de la cola (incidente MAR-VALIDACION-20261119).
//
// Antes de este contrato cualquier 4xx era "permanente": una foto que el
// navegador no supo decodificar se llevaba puesta la jornada del operario, y el
// item bloqueado se saltaba para siempre en `flushPendingSync`. La regla nueva
// separa lo que fallo:
//   transitorio -> se conserva y se reintenta (igual que hoy)
//   evidencia   -> la marcacion SOBREVIVE, se reintenta sin la foto y queda degradada
//   marcacion   -> la regla de negocio rechazo el punch: se CIERRA con motivo visible
// Un formato de archivo nunca puede consumirse una jornada, y un cierre nunca
// puede quedar Showing "por enviar" bloqueando la cola detras de el.
// =============================================================================

export type SyncFailureClass = "transient" | "evidence" | "marking";

// Codigos machine-readable que el servidor ya responde cuando lo que fallo es la
// FOTO. Son literales de `apps/api/src/security/policy.js`
// (`EVIDENCE_FAILURE_CODES`) y de `apps/api/src/modules/hr/mobile-identity.js`;
// viajan en `code` o en `details.evidence_failure_code`. Cualquier 4xx con uno de
// estos codigos es evidencia, sin importar el codigo paraguas que lo envuelva.
export const EVIDENCE_FAILURE_CODES: readonly string[] = [
  "EVIDENCIA_INDECODIFICABLE",
  "EVIDENCIA_ALFABETO_INVALIDO",
  "EVIDENCIA_MINIMA",
  "EVIDENCIA_NO_DECODIFICABLE",
  "EVIDENCIA_MULTIPAGE",
  "EVIDENCIA_TIEMPO_LIMITE_TRANSCODIFICACION",
  "EVIDENCIA_TAMANO_INVALIDO",
  "EVIDENCIA_SUPERA_LIMITE",
  // El nombre que traia el brief del contrato. Se conserva como alias para no
  // romper si el servidor lo publica tal cual.
  "EVIDENCIA_FORMATO_NO_PERMITIDO",
  "SELFIE_INVALIDA",
  "SELFIE_NO_DECODIFICABLE"
];

// Rechazos duros del CONTENIDO: el servidor los define como no negociables
// (`isHardContentRejection`: video, PDF, texto, SVG, alfabeto invalido). No son
// un problema de formato del que recuperarse: la foto nunca existio como imagen.
const HARD_CONTENT_CODES: readonly string[] = ["EVIDENCIA_CLASE_RECHAZADA", "EVIDENCIA_TIPO_DECLARADO_RECHAZADO"];

// SELFIE_REQUERIDA es evidencia cuando la pantalla YA tenia la foto tomada (el
// dispositivo no pudo entregarla); si realmente no hay foto, la pantalla la
// exige antes de marcar y el rechazo es de marcacion.
const AMBIGUOUS_EVIDENCE_CODES: readonly string[] = ["SELFIE_REQUERIDA"];

// Reglas de negocio que rechazan el punch en si. Reintentarlas no cambia nada:
// solo un supervisor puede corregirlas.
export const MARKING_BUSINESS_CODES: readonly string[] = [
  "MARCACION_DIFERIDA_EXPIRADA",
  "MARCACION_EN_EL_FUTURO",
  "MARCACION_FUERA_DE_SECUENCIA",
  "HORARIO_FUERA_DEL_DIA",
  "HORARIO_NO_ACTIVO",
  "JORNADA_COMPLETA"
];

// IDEMPOTENCY_KEY_CONFLICT NO se cierra: es el unico rechazo donde reintentar SI
// tiene sentido, porque la clave ya existe en el servidor y lo que hay que hacer
// es reconciliar, no descartar. Medido en produccion (evidencia
// `bloqueados-produccion-20261119.json`): dejo a un operario bloqueado todo el
// dia. El servidor responde 409 solo cuando la clave pertenece a OTRO empleado;
// si pertenece al mismo, hace replay 200. Es decir: un conflicto real significa
// que la fila del dispositivo esta mal escrita, y eso se resuelve consultando la
// asistencia propia (`reconcileIdempotencyConflict`), no tirando la marcacion.
export const IDEMPOTENCY_CONFLICT_CODE = "IDEMPOTENCY_KEY_CONFLICT";

// Rechazo que el operario resuelve solo: la escalera espera OTRA casilla, no esta rota. Se
// distingue del resto de MARKING_BUSINESS_CODES (horario inactivo, marcacion en el futuro), que
// necesita a un administrador. Medido en produccion: los dos casos recibian el mismo cierre
// generico y el operario seguia reintentando el boton que el servidor ya habia rechazado.
const SELF_RESOLVABLE_MARKING_CODES: readonly string[] = ["MARCACION_FUERA_DE_SECUENCIA", "JORNADA_COMPLETA"];

const EXPECTED_PUNCH_PATTERN = /permitida es\s+([a-z_áéíóñ]+)/i;

// `details.expected_type` es lo que el API publica desde esta intervencion; la frase se sigue
// leyendo porque el ambiente desplegado contesta 409 sin detalle. Devuelve el tipo tal como lo
// nombra el contrato (`entrada`, `inicio_almuerzo`, `fin_almuerzo`, `salida`) o cadena vacia.
export function expectedPunchTypeOf(error: unknown): string {
  const source = error && typeof error === "object" ? (error as Record<string, unknown>) : {};
  const details = source.details && typeof source.details === "object" ? (source.details as Record<string, unknown>) : {};
  const fromDetail = String(details.expected_type || "").trim().toLowerCase();
  if (fromDetail) return fromDetail;
  const text = `${String(source.message || "")} ${String(source.error || "")}`;
  return EXPECTED_PUNCH_PATTERN.exec(text)?.[1]?.trim().toLowerCase() || "";
}

// El detalle que el servidor manda en `error.details` (`evidenceFailureError`) nombra el archivo o la foto; `field` dice cual campo. Con esto el 400 paraguas
// `VALIDACION` se clasifica sin adivinar.
const EVIDENCE_DETAIL_PATTERN = /archivo|imagen|foto|selfie|evidencia|formato|decodific|mime|\.jpg|\.png/i;
const EVIDENCE_FIELD_PATTERN = /^(identity_photo|extra_evidence|photo)$/i;

export function evidenceCodeOf(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const source = value as Record<string, unknown>;
  for (const key of ["evidence_failure_code", "failure_code", "reason_code"]) {
    const candidate = String(source[key] || "").toUpperCase();
    if (candidate) return candidate;
  }
  const nested = source.details && typeof source.details === "object" ? source.details : null;
  return nested ? evidenceCodeOf(nested) : "";
}

function fieldOf(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const source = value as Record<string, unknown>;
  const direct = String(source.field || "");
  if (direct) return direct;
  const nested = source.details && typeof source.details === "object" ? source.details : null;
  return nested ? fieldOf(nested) : "";
}

function evidenceDetailOf(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const source = value as Record<string, unknown>;
  const parts = [source.message, source.detail, source.error, evidenceCodeOf(source)];
  const nested = source.details && typeof source.details === "object" ? source.details : null;
  if (nested) parts.push(evidenceDetailOf(nested));
  return parts.filter(Boolean).map(String).join(" ");
}

// Decide la clase a partir del error crudo del cliente (`api()` adjunta
// `status`, `code` y `details`) o de un `SyncFailure` ya clasificado.
export function classifySyncFailureClass(error: unknown): SyncFailureClass {
  const status = Number((error as { status?: number })?.status || 0);
  // Sin respuesta (red caida, timeout del navegador) o 5xx/408/429: transitorio.
  if (!status || status >= 500 || status === 408 || status === 429) return "transient";
  const code = String((error as { code?: string })?.code || "").toUpperCase();
  const detail = evidenceDetailOf(error);
  const declaredEvidenceCode = evidenceCodeOf(error);
  if (declaredEvidenceCode && EVIDENCE_FAILURE_CODES.includes(declaredEvidenceCode)) return "evidence";
  if (EVIDENCE_FAILURE_CODES.includes(code)) return "evidence";
  if (AMBIGUOUS_EVIDENCE_CODES.includes(code) && EVIDENCE_DETAIL_PATTERN.test(detail)) return "evidence";
  // El 400 paraguas del servidor (`VALIDACION`) baja a evidencia solo cuando el
  // detalle nombra el archivo o el campo de foto. Un rechazo duro de contenido
  // (video, PDF, texto) TAMBIEN es evidencia: lo que falla sigue siendo la foto,
  // y en ese caso no hay foto que desprenderse, asi que la marcacion sobrevive
  // igual y la escalada la decide `decideQueueTransition`.
  if (HARD_CONTENT_CODES.includes(code) || HARD_CONTENT_CODES.includes(declaredEvidenceCode)) return "evidence";
  if (code === "VALIDACION" && (EVIDENCE_DETAIL_PATTERN.test(detail) || EVIDENCE_FIELD_PATTERN.test(String(fieldOf(error))))) return "evidence";
  // La clave de idempotencia en conflicto tiene su propio camino (`reconcile`), pero
  // sigue siendo un rechazo del punch: si la reconciliacion no puede ejecutarse, el
  // item se cierra con motivo visible y no se queda reintentando para siempre.
  if (code === IDEMPOTENCY_CONFLICT_CODE) return "marking";
  // Todo lo demas (regla de negocio, sesion, alcance) se cierra: dejarlo encolado
  // es exactamente el bug que dejo la cola mostrando "por enviar" para siempre.
  return "marking";
}

// El servidor solo responde IDEMPOTENCY_KEY_CONFLICT cuando la clave ya existe
// vinculada a OTRO empleado; para el mismo empleado hace replay y responde 200.
export function isIdempotencyConflict(error: unknown) {
  const code = String((error as { code?: string })?.code || "").toUpperCase();
  return code === IDEMPOTENCY_CONFLICT_CODE;
}

export type QueueTransitionAction = "retry" | "retry_without_photo" | "reconcile" | "close";

export type QueueTransition = {
  failureClass: SyncFailureClass;
  action: QueueTransitionAction;
  // Texto plano para el operario: que paso y que hace el sistema ahora.
  notice: string;
  tone: "success" | "error" | "pending";
};

// Un item ya encolado puede reintentarse sin foto cuantas veces haya foto que
// desprenderse. Cuando la foto ya salio del payload (o nunca existio) el fallo de
// evidencia deja de ser recuperable en el dispositivo y pasa a manos del
// supervisor: se cierra con motivo visible, nunca en silencio.
export function decideQueueTransition(input: { error: unknown; hasPhotoAttached: boolean }): QueueTransition {
  const failureClass = classifySyncFailureClass(input.error);
  if (failureClass === "transient") {
    return {
      failureClass,
      action: "retry",
      notice: "Tu hora quedo guardada en el equipo y se va a intentar de nuevo automaticamente.",
      tone: "pending"
    };
  }
  if (failureClass === "evidence") {
    if (input.hasPhotoAttached) {
      return {
        failureClass,
        action: "retry_without_photo",
        notice: DEGRADED_MARKING_NOTICE,
        tone: "pending"
      };
    }
    return {
      failureClass,
      action: "close",
      notice: PHOTO_LOST_ESCALATION_NOTICE,
      tone: "error"
    };
  }
  // La clave en conflicto se reconcilia contra el servidor ANTES de cerrar nada:
  // puede que la hora ya este registrada (doble envio desde otro dispositivo) o que
  // la fila del dispositivo este mal escrita. Cerrarla sin preguntar era lo que
  // dejaba al operario sin jornada todo el dia.
  if (isIdempotencyConflict(input.error)) {
    return {
      failureClass,
      action: "reconcile",
      notice: IDEMPOTENCY_RECONCILE_NOTICE,
      tone: "pending"
    };
  }
  const reason = syncFailureReason(classifySyncFailure(input.error));
  // MARCACION_DIFERIDA_EXPIRADA es el unico cierre que necesita nombrar la salida:
  // 20 ocurrencias en produccion, todas a hora de entrada/salida de turno, o sea
  // una marcacion encolada que solo se reenvio a la manana siguiente. Decirle al
  // operario "no se pudo registrar" sin decirle que lo corrija un administrador lo
  // deja reintentando algo que jamas va a pasar.
  const expired = isExpiredDeferredMarking(input.error);
  const code = String((input.error as { code?: string })?.code || "").toUpperCase();
  // Un rechazo de escalera no es un callejon: el servidor dice cual marcacion sigue y el operario
  // puede registrarla el mismo. Aplicar el mismo cierre "avisa a tu administrador" a los rechazos
  // de negocio perdio jornadas por un boton pulsado en orden equivocado (39 rechazos / 14 operarios
  // en un dia). Los que no estan en la lista de negocio (permiso, ruta no encontrada) conservan la
  // frase del servidor sin promesa de autocorreccion.
  const business = MARKING_BUSINESS_CODES.includes(code);
  const expected = !expired && business && SELF_RESOLVABLE_MARKING_CODES.includes(code) ? expectedPunchTypeOf(input.error) : "";
  return {
    failureClass,
    action: "close",
    notice: expired
      ? EXPIRED_MARKING_ESCALATION_NOTICE
      : expected
        ? `${MARKING_REJECTED_CLOSE_PREFIX}La marcacion que sigue hoy es ${expected}: registrala con su boton.`
        : `${MARKING_REJECTED_CLOSE_PREFIX}${reason}`,
    tone: "error"
  };
}

// El codigo viaja en `code` o, cuando el servidor responde el 409 sin codigo, en la
// propia frase. Ambos casos se ven en la evidencia de produccion (20× con codigo,
// 12× "La marcacion diferida supero las 24 horas permitidas..." sin el literal).
const EXPIRED_DEFERRED_PATTERN = /MARCACION_DIFERIDA_EXPIRADA|super[oó]\s+las\s+24\s+horas/i;

export function isExpiredDeferredMarking(error: unknown) {
  const code = String((error as { code?: string })?.code || "").toUpperCase();
  if (code === "MARCACION_DIFERIDA_EXPIRADA") return true;
  const message = error instanceof Error ? error.message : String((error as { message?: unknown })?.message || "");
  return EXPIRED_DEFERRED_PATTERN.test(message);
}

// --- Copy visible (va literal en la certificacion de QA) ---------------------

export const DEGRADED_MARKING_NOTICE = "Tu hora quedo registrada. La foto no se pudo guardar y queda pendiente de revision de tu supervisor.";

// La foto ya no estaba en el dispositivo (IndexedDB la perdio o nunca llego a
// guardarse): no hay nada que desprenderse y el reintento local esta agotado. La
// marcacion se CIERRA con este motivo a la vista, nunca se descarta en silencio.
export const PHOTO_LOST_ESCALATION_NOTICE = "La foto de esta marcacion ya no esta en el equipo y por eso no se pudo enviar. Tu hora debe registrarla tu supervisor. Guarda la app abierta hasta que termine de sincronizar.";

export const DEGRADED_MARKING_BLOCKED_REASON = "La foto de validacion no se pudo guardar en este telefono. Tu hora si quedo registrada y la foto queda guardada en el equipo para revision del supervisor.";

export const EXPIRED_MARKING_ESCALATION_NOTICE = "Esta marcacion ya no se puede enviar porque paso el tiempo permitido. Pide a tu supervisor que registre la hora. No es una falla de la aplicacion.";

export const IDEMPOTENCY_RECONCILE_NOTICE = "Vamos a confirmar esta marcacion con el servidor antes de volver a enviarla, para no registrar tu hora dos veces.";

export const IDEMPOTENCY_ALREADY_REGISTERED_NOTICE = "Tu hora ya estaba registrada en el sistema. No se volvio a enviar para no duplicarla.";

export const IDEMPOTENCY_UNRECOVERABLE_NOTICE = "Esta marcacion choca con otra ya registrada y no se pudo confirmar automaticamente. Pide a tu supervisor que revise tu hora.";

export const MARKING_REJECTED_CLOSE_PREFIX = "Esta marcacion no se pudo registrar. ";

export const NOVELTY_PENDING_PHOTO_MESSAGE = "Marcacion registrada sin su foto de validacion: el telefono del trabajador no pudo guardar la imagen. La foto sigue en el dispositivo y queda pendiente de revision.";

export const NOVELTY_EXPIRED_MARKING_MESSAGE = "El trabajador intento enviar una marcacion fuera del tiempo permitido y el sistema la cerro. La hora debe registrarla un administrador.";

// Novedad que ve el supervisor: se declara aparte del aviso al operario para que
// la pantalla pueda decir las dos cosas sin mezclarlas.
export const SUPERVISOR_NOVELTY_KINDS = {
  degraded_evidence: "MARCAT_SIN_EVIDENCIA",
  expired_marking: "MARCAT_CERRADA_NECESITA_ADMIN"
} as const;

export type NoveltyKind = keyof typeof SUPERVISOR_NOVELTY_KINDS;

// El self-heal acotado vive en metadata, no en un campo nuevo: la cola viaja por
// localStorage y ya sobrevive a cuotas con claves propias.
export const EVIDENCE_RETRY_METADATA_KEY = "hr_evidence_retry";
// Una sola reintento automatico por item despues de desplegada esta version.
export const EVIDENCE_SELF_HEAL_MAX_ATTEMPTS = 1;

export type SelfHealCandidate = {
  blocked_code?: string;
  blocked_reason?: string;
  metadata?: Record<string, unknown> | null;
  payload?: unknown;
};

function photoKeysOf(payload: unknown): string[] {
  if (!payload || typeof payload !== "object") return [];
  return Object.keys(payload as Record<string, unknown>).filter((key) => OFFLINE_EVIDENCE_PAYLOAD_KEYS.includes(key));
}

// Un item bloqueado por evidencia sigue teniendo sus claves de foto (la foto
// vive en IndexedDB), asi que se puede volver a intentar desprendiendolas.
export function hasDetachablePhoto(item: SelfHealCandidate) {
  return photoKeysOf(item.payload).length > 0;
}

export function evidenceRetryAttemptsOf(item: SelfHealCandidate): number {
  const marker = item.metadata?.[EVIDENCE_RETRY_METADATA_KEY];
  if (!marker || typeof marker !== "object") return 0;
  const attempts = Number((marker as { attempts?: unknown }).attempts || 0);
  return Number.isFinite(attempts) ? Math.max(0, Math.round(attempts)) : 0;
}

export function markEvidenceRetryAttempt(item: SelfHealCandidate, at: string) {
  const previous = item.metadata?.[EVIDENCE_RETRY_METADATA_KEY];
  const prior = previous && typeof previous === "object" ? (previous as { attempts?: unknown }) : null;
  const attempts = Math.max(0, Number(prior?.attempts || 0)) + 1;
  return { [EVIDENCE_RETRY_METADATA_KEY]: { attempts, at } };
}

// El self-heal libera, en el primer arranque de esta version, lo que la version
// anterior bloqueo por un problema de formato. Tres condiciones y ninguna otra:
// el bloqueo fue de evidencia, aun hay foto que desprender y el reintento
// automatico no se gasto. Un item degradado o cerrado por marcacion jamas
// vuelve a la cola: eso reabriria lo que el supervisor ya resolvio.
export function isEvidenceBlockedSelfHealCandidate(item: SelfHealCandidate & { status?: string; blocked_code?: string }): boolean {
  if (item.status !== "blocked") return false;
  const code = String(item.blocked_code || "").toUpperCase();
  const classified = classifySyncFailureClass({
    status: 400,
    code,
    message: item.blocked_reason || "",
    details: { evidence_failure_code: code }
  });
  if (classified !== "evidence") return false;
  if (!hasDetachablePhoto(item)) return false;
  return evidenceRetryAttemptsOf(item) < EVIDENCE_SELF_HEAL_MAX_ATTEMPTS;
}

export const SELF_HEAL_RELEASE_NOTICE = "Se recupero una marcacion que estaba bloqueada por la foto y se envio de nuevo sin ella. Revisa el aviso de la foto pendiente.";

// --- Como llega la escalada al supervisor -----------------------------------
//
// La pantalla NO puede inventar un endpoint de novedades propias: hoy el API no
// tiene `POST /hr/self/novelties` (lo certifica `apps/api/src/modules/hr/routes.js`,
// que solo expone lecturas `/hr/novelties` con permiso `hr.read`). Lo que si
// existe es el `metadata` de la marcacion, que viaja intacto hasta la fila y lo
// leen el monitor y el reporte. Por eso la escalada se declara AQUI, en una sola
// forma, y la pantalla la adjunta al payload que ya envia:
//   hr_novelty -> marca visible para el supervisor, con su clase y su accion.
// Si el backend del propietario publica el endpoint de novedades, este es el
// unico lugar donde cambia el transporte; el contrato del dato no se toca.
export const HR_NOVELTY_METADATA_KEY = "hr_novelty";

export type HrNoveltyMarker = {
  kind: string;
  requires_supervisor_action: true;
  message: string;
  punch_type: string;
  punched_at: string;
  idempotency_key: string;
  failure_code: string;
  evidence_pending_refs: string[];
  raised_at: string;
};

export function buildHrNoveltyMarker(input: {
  kind: NoveltyKind;
  message: string;
  punchType: string;
  punchedAt: string;
  idempotencyKey: string;
  failureCode: string;
  photoRefs?: string[];
  raisedAt?: string;
}): HrNoveltyMarker {
  return {
    kind: SUPERVISOR_NOVELTY_KINDS[input.kind],
    requires_supervisor_action: true,
    message: input.message,
    punch_type: input.punchType,
    punched_at: input.punchedAt,
    idempotency_key: input.idempotencyKey,
    failure_code: input.failureCode,
    evidence_pending_refs: (input.photoRefs || []).filter(Boolean),
    raised_at: input.raisedAt || new Date().toISOString()
  };
}

export function attachHrNoveltyMarker<T extends Record<string, unknown>>(payload: T, marker: HrNoveltyMarker): T {
  const metadata = payload.metadata && typeof payload.metadata === "object" ? (payload.metadata as Record<string, unknown>) : {};
  return { ...payload, metadata: { ...metadata, [HR_NOVELTY_METADATA_KEY]: marker } };
}

export function readHrNoveltyMarker(payload: unknown): HrNoveltyMarker | null {
  const marker = ((payload as { metadata?: Record<string, unknown> } | null)?.metadata || {})[HR_NOVELTY_METADATA_KEY];
  return marker && typeof marker === "object" ? (marker as HrNoveltyMarker) : null;
}

// --- Reconciliacion de clave de idempotencia ---------------------------------
//
// Cuando el servidor responde IDEMPOTENCY_KEY_CONFLICT la cola NO debe cerrar la
// fila a ciegas ni reenviarla con otra clave (eso inventaria una hora). Lo que se
// hace es leer la asistencia propia del dia y decidir con el dato real. La lectura
// ya existe en la pantalla (`/api/v1/hr/self/attendance`), asi que no se inventa
// ningun endpoint nuevo.
export type OwnPunchRow = { type?: string; time?: string; idempotency_key?: string };

export type IdempotencyReconciliation =
  // La hora ya esta almacenada con ESTA clave: el envio anterior si llego. Se
  // descarta la fila local sin escalar nada, porque no hay novedad.
  | { outcome: "already_registered" }
  // El mismo tipo de marcacion ya existe con OTRA clave: reenviar duplicaria la
  // jornada. Se cierra visible y se escala al supervisor.
  | { outcome: "superseded_by_other_key"; punchType: string }
  // No hay nada parecido en el servidor: la fila del dispositivo esta mal escrita.
  // Se puede volver a intentar UNA vez con clave nueva, que es lo unico que
  // destraba al operario sin inventarse una hora.
  | { outcome: "not_registered" };

export function reconcileIdempotencyConflict(input: {
  punchType: string;
  idempotencyKey: string;
  punches: OwnPunchRow[];
}): IdempotencyReconciliation {
  const wantedType = String(input.punchType || "");
  const wantedKey = String(input.idempotencyKey || "");
  const rows = Array.isArray(input.punches) ? input.punches : [];
  if (wantedKey && rows.some((row) => String(row?.idempotency_key || "") === wantedKey)) {
    return { outcome: "already_registered" };
  }
  if (wantedType && rows.some((row) => String(row?.type || "") === wantedType)) {
    return { outcome: "superseded_by_other_key", punchType: wantedType };
  }
  return { outcome: "not_registered" };
}

// --- Planificacion del reintento de la cola ----------------------------------
//
// Medido en produccion (evidencia `bloqueados-produccion-20261119.json`): la
// distancia p50 entre fallos consecutivos del MISMO usuario y ruta era 9,2 s, que
// es exactamente el `setInterval(sync, 12000)` de la pantalla menos los ~2,8 s que
// tarda el intento. Con cada petición pudiendo quemar 20 s de timeout y la pantalla
// abriendo ~7 lecturas paralelas por tick, el intervalo fijo no dejaba respirar ni
// al cliente ni al servidor. Dos reglas lo arreglan:
//   1) un tick a la vez (single-flight), ya garantizado por `flushPendingSync`;
//   2) respaldo exponencial con jitter, activado SOLO por un fallo previo. Sin
//      fallo el reintento sigue siendo inmediato (el operario no espera).
export const QUEUE_IDLE_POLL_MS = 30_000;
export const QUEUE_BACKOFF_BASE_MS = 15_000;
export const QUEUE_BACKOFF_MAX_MS = 5 * 60_000;

export function queueRetryDelayMs(attempts: number, random: () => number = Math.random) {
  const safeAttempts = Math.max(0, Number.isFinite(attempts) ? Math.floor(attempts) : 0);
  if (!safeAttempts) return 0;
  // Tope de 2^8: sin él, una cola olvidada días calcula 2^40 y se desborda.
  const ceiling = Math.min(QUEUE_BACKOFF_BASE_MS * 2 ** Math.min(safeAttempts, 8), QUEUE_BACKOFF_MAX_MS);
  // Jitter completo (0, ceiling]: evita que veinte dispositivos del mismo turno
  // reintenten exactamente en el mismo instante.
  const jitter = Math.max(0, Math.min(1, random()));
  return Math.round(Math.min(ceiling * (jitter || 0.25), QUEUE_BACKOFF_MAX_MS));
}

export type QueueSchedulerEvent = "idle" | "failure" | "success";

// Estado puro del planificador: la pantalla solo tiene que preguntar cuanto
// esperar despues de cada tick.
export function queueNextPollMs(event: QueueSchedulerEvent, attempts: number, random: () => number = Math.random) {
  if (event === "failure") return queueRetryDelayMs(attempts, random);
  return QUEUE_IDLE_POLL_MS;
}

// Claves de primer nivel del payload que llevan foto. Viven aqui (y la pantalla
// las importa) para que la politica de cola y el externalizado usen la misma lista.
export const OFFLINE_EVIDENCE_PAYLOAD_KEYS: readonly string[] = ["photo", "extra_evidence", "identity_photo"];

// Quita las fotos del payload y anota POR QUE faltan. La marca viaja al servidor
// para que la fila quede como marcacion degradada y no como marcacion normal.
export function detachEvidence<T extends Record<string, unknown>>(payload: T, reason: string = DEGRADED_MARKING_BLOCKED_REASON): { payload: Record<string, unknown>; detachedKeys: string[] } {
  const result: Record<string, unknown> = { ...payload };
  const detachedKeys: string[] = [];
  for (const key of OFFLINE_EVIDENCE_PAYLOAD_KEYS) {
    if (result[key] === undefined) continue;
    delete result[key];
    detachedKeys.push(key);
  }
  if (!detachedKeys.length) return { payload: result, detachedKeys };
  const metadata = result.metadata && typeof result.metadata === "object" ? (result.metadata as Record<string, unknown>) : {};
  result.metadata = {
    ...metadata,
    evidence_status: "degraded",
    evidence_detached_reason: reason,
    evidence_detached_at: new Date().toISOString()
  };
  return { payload: result, detachedKeys };
}

export function payloadHasDetachedEvidence(payload: unknown) {
  const metadata = (payload as { metadata?: Record<string, unknown> } | null)?.metadata;
  return String(metadata?.evidence_status || "") === "degraded";
}

// Las evidencias viajan en IndexedDB; en la cola de localStorage queda solo esta marca
// para que el payload sea pequeno y sobrevivible a la cuota.
export const HR_EVIDENCE_REF_KEY = "__hr_offline_evidence";

export function evidenceRefMarker(ref: string) {
  return { [HR_EVIDENCE_REF_KEY]: ref };
}

export function evidenceRefOf(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const ref = (value as Record<string, unknown>)[HR_EVIDENCE_REF_KEY];
  return typeof ref === "string" && ref ? ref : null;
}

export function inlineEvidenceBytes(payload: unknown): number {
  let total = 0;
  const visit = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (typeof child === "string" && (key === "base64" || key === "base64_data")) total += child.length;
      else visit(child);
    }
  };
  visit(payload);
  return total;
}

export function payloadByteLength(payload: unknown) {
  return typeof TextEncoder === "undefined"
    ? JSON.stringify(payload ?? null).length
    : new TextEncoder().encode(JSON.stringify(payload ?? null)).length;
}

export type QuotaDegradationAction = { type: "strip_photo" | "drop_item"; id: string };

// Orden de degradacion ante cuota llena: primero se sacrifica la foto inline mas pesada
// (el registro sigue encolado y visible como bloqueado) y solo despues se descartan
// registros completos, del mas antiguo al mas reciente. El ultimo elemento nunca se
// descarta aqui: es el que el operario acaba de marcar.
export function quotaDegradationPlan<T extends { id: string; created_at?: string }>(
  items: T[],
  photoBytesOf: (item: T) => number
): QuotaDegradationAction[] {
  const byOldest = (left: T, right: T) => String(left.created_at || "").localeCompare(String(right.created_at || ""));
  const strips = items
    .map((item) => ({ item, bytes: photoBytesOf(item) }))
    .filter((entry) => entry.bytes > 0)
    .sort((left, right) => right.bytes - left.bytes || byOldest(left.item, right.item))
    .map((entry) => ({ type: "strip_photo" as const, id: entry.item.id }));
  const drops = [...items]
    .sort(byOldest)
    .slice(0, -1)
    .map((item) => ({ type: "drop_item" as const, id: item.id }));
  return [...strips, ...drops];
}

export type QuotaDegradationResult<T> = { items: T[]; stripped: string[]; dropped: string[]; persisted: boolean };

// Ejecuta el plan paso a paso y se detiene en cuanto la escritura cabe, de modo que se
// sacrifica lo minimo necesario. persist devuelve false cuando el almacén lanza por cuota.
export function degradeUntilPersisted<T extends { id: string; created_at?: string }>(input: {
  items: T[];
  limit: number;
  serialize: (items: T[]) => string;
  persist: (serialized: string) => boolean;
  stripEvidence: (item: T) => T;
  photoBytesOf: (item: T) => number;
}): QuotaDegradationResult<T> {
  let current = input.items.slice(-input.limit);
  if (input.persist(input.serialize(current))) {
    return { items: current, stripped: [], dropped: [], persisted: true };
  }
  const stripped: string[] = [];
  const dropped: string[] = [];
  for (const action of quotaDegradationPlan(current, input.photoBytesOf)) {
    if (action.type === "strip_photo") {
      current = current.map((item) => (item.id === action.id ? input.stripEvidence(item) : item));
      stripped.push(action.id);
    } else {
      current = current.filter((item) => item.id !== action.id);
      dropped.push(action.id);
    }
    if (input.persist(input.serialize(current))) {
      return { items: current, stripped, dropped, persisted: true };
    }
  }
  return { items: current, stripped, dropped, persisted: false };
}
