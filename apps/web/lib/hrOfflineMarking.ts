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
