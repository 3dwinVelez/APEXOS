function parseTimeMinutes(value) {
  if (!value) return null;
  const raw = String(value).trim().toUpperCase();
  const match = raw.match(/^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const suffix = match[3];
  if (suffix === "PM" && hour !== 12) hour += 12;
  if (suffix === "AM" && hour === 12) hour = 0;
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

function combineDateAndTime(day, value) {
  const minutes = parseTimeMinutes(value);
  if (minutes == null) return null;
  const date = new Date(day);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), Math.floor(minutes / 60), minutes % 60, 0, 0);
}

function normalizePunchType(type) {
  const value = String(type || "").trim().toUpperCase();
  const mapping = {
    ENTRADA: "entrada",
    INGRESO: "entrada",
    SALIDA: "salida",
    CIERRE: "salida",
    ALMUERZO: "inicio_almuerzo",
    INICIO_ALMUERZO: "inicio_almuerzo",
    FIN_ALMUERZO: "fin_almuerzo",
    RETORNO: "fin_almuerzo",
    REGRESO: "fin_almuerzo"
  };
  return mapping[value] || value.toLowerCase();
}

function ordinaryMinutes(schedule, params) {
  if (schedule) {
    const start = parseTimeMinutes(schedule.start_time);
    const end = parseTimeMinutes(schedule.end_time);
    if (start != null && end != null) {
      let total = end - start;
      if (total <= 0) total += 1440;
      const lunchStart = parseTimeMinutes(schedule.lunch_start_time);
      const lunchEnd = parseTimeMinutes(schedule.lunch_end_time);
      if (lunchStart != null && lunchEnd != null) {
        const lunch = lunchEnd - lunchStart;
        if (lunch > 0) total -= lunch;
      }
      return Math.max(total, 0);
    }
  }
  return Number(params.ordinary_hours_day || 8) * 60;
}

function splitPaidIntervals(entryAt, exitAt, lunchStartAt, lunchEndAt, schedule, params, alerts) {
  if (exitAt <= entryAt) exitAt = new Date(exitAt.getTime() + 86400000);
  if (lunchStartAt && lunchStartAt < entryAt) lunchStartAt = new Date(lunchStartAt.getTime() + 86400000);
  if (lunchEndAt && lunchEndAt < entryAt) lunchEndAt = new Date(lunchEndAt.getTime() + 86400000);
  if (lunchStartAt && lunchEndAt && lunchEndAt <= lunchStartAt) lunchEndAt = new Date(lunchEndAt.getTime() + 86400000);

  if (!lunchStartAt || !lunchEndAt) {
    const scheduledStart = schedule.lunch_start_time ? combineDateAndTime(entryAt, schedule.lunch_start_time) : null;
    const scheduledEnd = schedule.lunch_end_time ? combineDateAndTime(entryAt, schedule.lunch_end_time) : null;
    if (scheduledStart && scheduledEnd) {
      lunchStartAt = scheduledStart;
      lunchEndAt = scheduledEnd <= scheduledStart ? new Date(scheduledEnd.getTime() + 86400000) : scheduledEnd;
    } else {
      const defaultBreak = Number(params.lunch_minutes || 60);
      const midpoint = new Date(entryAt.getTime() + (exitAt.getTime() - entryAt.getTime()) / 2);
      lunchStartAt = new Date(midpoint.getTime() - defaultBreak * 30000);
      lunchEndAt = new Date(lunchStartAt.getTime() + defaultBreak * 60000);
    }
    alerts.push("almuerzo_imputado");
  }

  const intervals = [];
  if (lunchStartAt > entryAt) intervals.push([entryAt, new Date(Math.min(lunchStartAt.getTime(), exitAt.getTime()))]);
  if (lunchEndAt < exitAt) intervals.push([new Date(Math.max(lunchEndAt.getTime(), entryAt.getTime())), exitAt]);
  return {
    intervals: intervals.filter(([start, end]) => end > start),
    lunchStartAt,
    lunchEndAt,
    exitAt
  };
}

function splitByOrdinaryLimit(intervals, limitMinutes) {
  const result = [];
  let worked = 0;
  for (const [start, end] of intervals) {
    const duration = Math.floor((end - start) / 60000);
    if (duration <= 0) continue;
    if (worked >= limitMinutes) {
      result.push([start, end, "extra"]);
      worked += duration;
      continue;
    }
    const remaining = limitMinutes - worked;
    if (duration <= remaining) {
      result.push([start, end, "ordinario"]);
      worked += duration;
    } else {
      const cutoff = new Date(start.getTime() + remaining * 60000);
      result.push([start, cutoff, "ordinario"]);
      result.push([cutoff, end, "extra"]);
      worked += duration;
    }
  }
  return result;
}

const OPERATING_TIMEZONE = "America/Bogota";
const TIME_PARTS_FORMATTER = new Intl.DateTimeFormat("en-CA", { timeZone: OPERATING_TIMEZONE, hour: "2-digit", minute: "2-digit", hour12: false });
const DAY_PARTS_FORMATTER = new Intl.DateTimeFormat("en-CA", { timeZone: OPERATING_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" });

function classifyMinute(date, nature, params, holidays) {
  const nightStart = parseTimeMinutes(params.night_start || "21:00") ?? 1260;
  const nightEnd = parseTimeMinutes(params.night_end || "06:00") ?? 360;
  const parts = TIME_PARTS_FORMATTER.formatToParts(date);
  const hour = Number(parts.find((p) => p.type === "hour")?.value || date.getHours());
  const minute = Number(parts.find((p) => p.type === "minute")?.value || date.getMinutes());
  const colombiaMinute = hour * 60 + minute;
  const isNight = colombiaMinute >= nightStart || colombiaMinute < nightEnd;
  const dayParts = DAY_PARTS_FORMATTER.formatToParts(date);
  const key = [dayParts.find((p) => p.type === "year")?.value, dayParts.find((p) => p.type === "month")?.value, dayParts.find((p) => p.type === "day")?.value].join("-");
  const dayOfWeek = new Date(key + "T00:00:00-05:00").getDay();
  const isSpecial = dayOfWeek === 0 || holidays.has(key);
  if (nature === "ordinario" && !isSpecial && !isNight) return "ordinary_day_minutes";
  if (nature === "ordinario" && !isSpecial && isNight) return "ordinary_night_minutes";
  if (nature === "ordinario" && isSpecial && !isNight) return "ordinary_sunday_holiday_day_minutes";
  if (nature === "ordinario" && isSpecial && isNight) return "ordinary_sunday_holiday_night_minutes";
  if (nature === "extra" && !isSpecial && !isNight) return "overtime_day_minutes";
  if (nature === "extra" && !isSpecial && isNight) return "overtime_night_minutes";
  if (nature === "extra" && isSpecial && !isNight) return "overtime_sunday_holiday_day_minutes";
  return "overtime_sunday_holiday_night_minutes";
}

function bucketIntervals(intervals, params, holidays) {
  const buckets = {
    ordinary_day_minutes: 0,
    ordinary_night_minutes: 0,
    ordinary_sunday_holiday_day_minutes: 0,
    ordinary_sunday_holiday_night_minutes: 0,
    overtime_day_minutes: 0,
    overtime_night_minutes: 0,
    overtime_sunday_holiday_day_minutes: 0,
    overtime_sunday_holiday_night_minutes: 0
  };
  for (const [start, end, nature] of intervals) {
    let cursor = new Date(start);
    while (cursor < end) {
      const next = new Date(Math.min(end.getTime(), cursor.getTime() + 60000));
      buckets[classifyMinute(cursor, nature, params, holidays)] += 1;
      cursor = next;
    }
  }
  return buckets;
}

function processWorkday({ employee, schedule, punches, params = {}, holidays = new Set(), date }) {
  const sorted = punches.map((punch) => ({ ...punch, normalized: normalizePunchType(punch.type) })).sort((a, b) => new Date(a.punched_at) - new Date(b.punched_at));
  const entry = sorted.find((punch) => punch.normalized === "entrada");
  if (!entry) return null;
  const entryAt = new Date(entry.punched_at);
  const exit = sorted.find((punch) => punch.normalized === "salida" && new Date(punch.punched_at) > entryAt);
  if (!exit) {
    return {
      employee_id: employee.id,
      date,
      schedule_id: schedule.id,
      entry_at: entryAt,
      alerts: ["sin_salida"],
      inconsistent: true
    };
  }
  const exitAt = new Date(exit.punched_at);
  const lunchStart = sorted.find((punch) => punch.normalized === "inicio_almuerzo" && new Date(punch.punched_at) > entryAt && new Date(punch.punched_at) < exitAt);
  const lunchEnd = sorted.find((punch) => punch.normalized === "fin_almuerzo" && lunchStart && new Date(punch.punched_at) > new Date(lunchStart.punched_at));
  const alerts = [];
  const paid = splitPaidIntervals(entryAt, exitAt, lunchStart ? new Date(lunchStart.punched_at) : null, lunchEnd ? new Date(lunchEnd.punched_at) : null, schedule, params, alerts);
  const limit = ordinaryMinutes(schedule, params);
  const classified = splitByOrdinaryLimit(paid.intervals, limit);
  const buckets = bucketIntervals(classified, params, holidays);
  return {
    employee_id: employee.id,
    date,
    schedule_id: schedule.id,
    route_id: entry.route_id || exit.route_id || null,
    vehicle_plate: entry.vehicle_plate || exit.vehicle_plate || "",
    entry_at: entryAt,
    exit_at: paid.exitAt,
    lunch_start_at: paid.lunchStartAt,
    lunch_end_at: paid.lunchEndAt,
    total_minutes: Math.max(Math.floor((paid.exitAt - entryAt) / 60000), 0),
    lunch_minutes: Math.max(Math.floor((paid.lunchEndAt - paid.lunchStartAt) / 60000), 0),
    alerts,
    inconsistent: false,
    ...buckets
  };
}

module.exports = { normalizePunchType, processWorkday };
