const DEFAULT_NIGHT_WINDOWS = [
  { start: "00:00", end: "06:00" },
  { start: "19:00", end: "23:59" }
];

function minutesFromTime(value) {
  if (!value || !/^\d{2}:\d{2}/.test(String(value))) return null;
  const hours = Number(value.slice(0, 2));
  const minutes = Number(value.slice(3, 5));
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function assertSameDayShift({ startTime, endTime }) {
  const start = minutesFromTime(startTime);
  const end = minutesFromTime(endTime);
  if (start == null || end == null) {
    const error = new Error("Define horas validas en formato HH:mm.");
    error.code = "HORARIO_HORA_INVALIDA";
    throw error;
  }
  if (end <= start) {
    const error = new Error("La hora final debe ser estrictamente posterior a la hora inicial dentro de la misma fecha.");
    error.code = "HORARIO_CRUZA_MEDIANOCHE";
    throw error;
  }
  return { start, end };
}

function rangesOverlap(left, right) {
  return left.start < right.end && right.start < left.end;
}

function splitDayNightSegments({ startTime, endTime, nightWindows = DEFAULT_NIGHT_WINDOWS }) {
  const { start, end } = assertSameDayShift({ startTime, endTime });
  const boundaries = new Set([start, end]);
  const normalizedWindows = nightWindows
    .map((window) => ({ start: minutesFromTime(window.start), end: minutesFromTime(window.end) }))
    .filter((window) => window.start != null && window.end != null && window.end > window.start);
  for (const window of normalizedWindows) {
    if (window.start > start && window.start < end) boundaries.add(window.start);
    if (window.end > start && window.end < end) boundaries.add(window.end);
  }
  const ordered = Array.from(boundaries).sort((a, b) => a - b);
  const segments = [];
  for (let index = 0; index < ordered.length - 1; index += 1) {
    const segment = { start: ordered[index], end: ordered[index + 1] };
    const isNight = normalizedWindows.some((window) => rangesOverlap(segment, window));
    segments.push({ ...segment, minutes: segment.end - segment.start, kind: isNight ? "nocturna" : "diurna" });
  }
  return segments;
}

function validateMileage(value, { precision = 1 } = {}) {
  if (value === "" || value == null) {
    const error = new Error("El kilometraje del dia es obligatorio.");
    error.statusCode = 400;
    error.code = "KILOMETRAJE_REQUERIDO";
    throw error;
  }
  const text = String(value).trim();
  const decimals = Math.max(0, Number(precision) || 0);
  const pattern = decimals > 0 ? new RegExp(`^\\d+(\\.\\d{1,${decimals}})?$`) : /^\d+$/;
  if (!pattern.test(text)) {
    const error = new Error("El kilometraje debe ser numerico, positivo y sin separadores invalidos.");
    error.statusCode = 400;
    error.code = "KILOMETRAJE_INVALIDO";
    throw error;
  }
  const number = Number(text);
  if (!Number.isFinite(number) || number < 0) {
    const error = new Error("El kilometraje no puede ser negativo.");
    error.statusCode = 400;
    error.code = "KILOMETRAJE_INVALIDO";
    throw error;
  }
  return number;
}

function noveltyLogicalKey({ tenantId, employeeId, date, routeId, typeCode, segment = "dia" }) {
  return [tenantId, employeeId, String(date).slice(0, 10), routeId || "sin-jornada", typeCode, segment].join(":");
}

module.exports = {
  DEFAULT_NIGHT_WINDOWS,
  minutesFromTime,
  assertSameDayShift,
  rangesOverlap,
  splitDayNightSegments,
  validateMileage,
  noveltyLogicalKey
};
