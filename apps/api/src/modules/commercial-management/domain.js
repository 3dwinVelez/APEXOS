const RECOGNIZED_SALE_STATUSES = ["CONFIRMED", "INVOICED"];

function money(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round((number + Number.EPSILON) * 100) / 100 : 0;
}

function orderTotals(lines) {
  const normalized = lines.map((line) => {
    const quantity = Number(line.quantity);
    const unitPrice = money(line.unit_price);
    const discount = money(line.discount || 0);
    if (!(quantity > 0) || unitPrice < 0 || discount < 0) throw Object.assign(new Error("Cantidad, precio o descuento no validos."), { statusCode: 400 });
    const gross = money(quantity * unitPrice);
    if (discount > gross) throw Object.assign(new Error("El descuento no puede superar el valor de la linea."), { statusCode: 400 });
    return { ...line, quantity, unit_price: unitPrice, discount, line_total: money(gross - discount) };
  });
  const subtotal = money(normalized.reduce((sum, line) => sum + money(line.quantity * line.unit_price), 0));
  const discount = money(normalized.reduce((sum, line) => sum + line.discount, 0));
  return { lines: normalized, subtotal, discount, total: money(subtotal - discount) };
}

function periodProgress(period, now = new Date()) {
  const start = new Date(period.start_date).getTime();
  const end = new Date(period.end_date).getTime();
  const current = now.getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 0;
  if (current < start) return 0;
  if (current > end) return 1;
  return Math.min(1, Math.max(0, (current - start) / (end - start || 1)));
}

function datePartsInTimeZone(value, timeZone = "America/Bogota") {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(value));
  const part = (type) => Number(parts.find((item) => item.type === type)?.value);
  return { year: part("year"), month: part("month"), day: part("day") };
}

function isFullCalendarMonth(startValue, endValue, timeZone = "America/Bogota") {
  const start = datePartsInTimeZone(startValue, timeZone);
  const end = datePartsInTimeZone(endValue, timeZone);
  const lastDay = new Date(Date.UTC(start.year, start.month, 0)).getUTCDate();
  return start.day === 1 && end.year === start.year && end.month === start.month && end.day === lastDay;
}

function budgetMetrics({ budget, sales, progress, thresholds = {} }) {
  const target = money(budget);
  const actual = money(sales);
  const completion = target > 0 ? actual / target : 0;
  const performanceIndex = progress > 0 ? completion / progress : (completion >= 1 ? 1 : 0);
  const projection = progress > 0 ? money(actual / progress) : 0;
  const green = Number(thresholds.green ?? 0.9);
  const yellow = Number(thresholds.yellow ?? 0.7);
  const trafficLight = completion >= 1 ? "BLUE" : performanceIndex >= green ? "GREEN" : performanceIndex >= yellow ? "YELLOW" : "RED";
  return { budget: target, sales: actual, completion, progress, performance_index: performanceIndex, projection, traffic_light: trafficLight };
}

function visitExecutionMinutes(visit) {
  if (visit.status !== "COMPLETED" || !visit.started_at || !visit.completed_at) return null;
  const minutes = (new Date(visit.completed_at).getTime() - new Date(visit.started_at).getTime()) / 60000;
  return Number.isFinite(minutes) && minutes >= 0 ? Math.round(minutes) : null;
}

module.exports = { RECOGNIZED_SALE_STATUSES, money, orderTotals, periodProgress, budgetMetrics, isFullCalendarMonth, visitExecutionMinutes };
