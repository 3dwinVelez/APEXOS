export const PUNCH_LADDER = ["entrada", "inicio_almuerzo", "fin_almuerzo", "salida"] as const;
export type PunchLadderType = (typeof PUNCH_LADDER)[number];

export const PUNCH_LADDER_LABELS: Record<PunchLadderType, string> = {
  entrada: "Entrada",
  inicio_almuerzo: "Inicio de almuerzo",
  fin_almuerzo: "Fin de almuerzo",
  salida: "Salida"
};

// El servidor corta el motivo a 300 (apps/api/src/modules/hr/schema.js). Pedir un minimo es lo
// que impide que la correccion sea una marcacion borrada por un "ok": el motivo es lo unico que
// la distingue de un salto de orden y es lo que se lee despues en la novedad.
export const CORRECTION_REASON_MINIMUM = 12;
export const CORRECTION_REASON_MAXIMUM = 300;

// La jornada se planea en Bogota y el servidor puede estar en UTC. Un "2026-11-19T06:00" sin
// desplazamiento se leeria como 06:00 UTC (01:00 aqui), asi que la hora corregida viaja siempre
// con su zona. Colombia no tiene horario de verano: el desplazamiento es fijo.
export const OPERATING_UTC_OFFSET = "-05:00";

export type CorrectionSchedule = { start_time?: string | null; end_time?: string | null } | null | undefined;

export type CorrectionInput = {
  employeeId: number | null;
  userName: string;
  date: string;
  type: string;
  clock: string;
  reason: string;
  schedule?: CorrectionSchedule;
};

export function isPunchLadderType(value: unknown): value is PunchLadderType {
  return typeof value === "string" && (PUNCH_LADDER as readonly string[]).includes(value);
}

/// Que falta en la escalera, en el orden en que debio ocurrir. Un hueco del medio (los dos
/// almuerzos) ya no tiene marcacion esperada para el operario: la escalera lineal no lo puede
/// rellenar y por eso la correccion se ofrece por tipo, no solo por "la siguiente".
export function missingLadderTypes(present: Partial<Record<PunchLadderType, boolean>> | null | undefined): PunchLadderType[] {
  return PUNCH_LADDER.filter((type) => !present?.[type]);
}

/// La hora que el horario define para esa marcacion. El almuerzo no tiene campo en el horario,
/// asi que se devuelve vacio a proposito: sin dato, el supervisor la escribe; inventarla seria
/// exactamente lo que la autorizacion del dueño excluye.
export function scheduledClockFor(type: string, schedule: CorrectionSchedule): string {
  if (type === "entrada") return String(schedule?.start_time || "").slice(0, 5);
  if (type === "salida") return String(schedule?.end_time || "").slice(0, 5);
  return "";
}

export function correctionInstant(date: string, clock: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ""))) return "";
  if (!/^\d{2}:\d{2}$/.test(String(clock || ""))) return "";
  const hours = Number(clock.slice(0, 2));
  const minutes = Number(clock.slice(3, 5));
  if (!Number.isInteger(hours) || hours > 23 || !Number.isInteger(minutes) || minutes > 59) return "";
  const iso = `${date}T${clock}:00${OPERATING_UTC_OFFSET}`;
  return Number.isNaN(new Date(iso).getTime()) ? "" : iso;
}

/// Un motivo de relleno ("--", "x") cumple el minimo de caracteres y no dice nada. Se exige al
/// menos una palabra de texto real, ademas del minimo.
function reasonIsInformative(reason: string) {
  return reason.replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ0-9]/g, "").length >= CORRECTION_REASON_MINIMUM;
}

export function correctionValidationIssues(input: CorrectionInput, now: Date = new Date()): string[] {
  const issues: string[] = [];
  if (!Number.isInteger(input.employeeId) || Number(input.employeeId) <= 0) {
    issues.push("El reporte no resolvio la ficha del empleado: registra la marcacion desde su terminal o corrige la asignacion del horario.");
  }
  if (!isPunchLadderType(input.type)) issues.push("Selecciona la marcacion que falta.");
  if (!input.userName.trim()) issues.push("Falta el identificador del trabajador.");
  const instant = correctionInstant(input.date, String(input.clock || "").trim());
  if (!instant) {
    issues.push("Indica la hora en formato HH:MM (24 horas).");
  } else if (new Date(instant).getTime() > now.getTime()) {
    issues.push("La hora corregida no puede ser posterior a este momento.");
  }
  const reason = String(input.reason || "").trim();
  if (reason.length < CORRECTION_REASON_MINIMUM || !reasonIsInformative(reason)) {
    issues.push(`El motivo debe tener al menos ${CORRECTION_REASON_MINIMUM} caracteres: explica por que registras esa hora.`);
  } else if (reason.length > CORRECTION_REASON_MAXIMUM) {
    issues.push(`El motivo no puede pasar de ${CORRECTION_REASON_MAXIMUM} caracteres.`);
  }
  return issues;
}

/// Sin `route_id`: el supervisor corrige una hora, no autoriza el inicio de una ruta, y ese es el
/// unico camino por el que el checklist preoperacional del conductor no intercepte una jornada que
/// ya ocurrio. La escalera, en cambio, si necesita ver el dia completo: sin horario declarado el
/// servidor consulta las marcaciones de la persona sin filtrar por ruta.
export function correctionBody(input: CorrectionInput) {
  return {
    employee_id: Number(input.employeeId),
    user_name: String(input.userName || "").trim(),
    type: input.type,
    punched_at: correctionInstant(input.date, String(input.clock || "").trim()),
    correccion_administrativa: true,
    motivo_correccion: String(input.reason || "").trim().slice(0, CORRECTION_REASON_MAXIMUM)
  };
}
