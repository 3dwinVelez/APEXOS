export type PunctualityTone = "success" | "info" | "warning";

export type PunctualityAlert = {
  label: string;
  tone: PunctualityTone;
};

export type PunctualityWindow = {
  startTime?: string | null;
  endTime?: string | null;
  toleranceMinutes?: number | null;
};

export type PunctualityPunch = {
  type?: string | null;
  time?: string | null;
  punched_at?: string | null;
} & PunctualityWindow;

export function minutesFromTime(value?: string | null) {
  if (!value) return null;
  const match = String(value).match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

export function punchClockTime(punch: { time?: string | null; punched_at?: string | null }) {
  if (minutesFromTime(punch.time) != null) return String(punch.time);
  if (!punch.punched_at) return null;
  const date = new Date(punch.punched_at);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-GB", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
}

export function punctualityAlert(punch: PunctualityPunch): PunctualityAlert | null {
  const minutes = minutesFromTime(punchClockTime(punch));
  const tolerance = Math.max(0, Number(punch.toleranceMinutes ?? 15));
  if (punch.type === "entrada") {
    const expected = minutesFromTime(punch.startTime);
    if (minutes == null || expected == null) return null;
    const diff = minutes - expected;
    if (diff <= 0) return { label: diff === 0 ? "En punto" : `Anticipado ${Math.abs(diff)} min`, tone: "success" };
    if (diff <= tolerance) return { label: `Dentro de tolerancia (+${diff} min)`, tone: "info" };
    return { label: `Tarde ${diff} min`, tone: "warning" };
  }
  if (punch.type === "salida") {
    const expected = minutesFromTime(punch.endTime);
    if (minutes == null || expected == null) return null;
    const diff = expected - minutes;
    if (diff <= 0) return { label: "Cierre a tiempo", tone: "success" };
    if (diff <= tolerance) return { label: `Cierre anticipado ${diff} min`, tone: "info" };
    return { label: `Salida temprana ${diff} min`, tone: "warning" };
  }
  return null;
}

export function isCriticalPunctuality(alert: PunctualityAlert | null | undefined) {
  return alert?.tone === "warning";
}

export const punctualityTypeNames: Record<string, string> = {
  entrada: "Entrada",
  inicio_almuerzo: "Almuerzo",
  fin_almuerzo: "Retorno",
  salida: "Cierre"
};
