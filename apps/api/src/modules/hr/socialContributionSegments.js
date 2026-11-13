"use strict";

// Pure Colombian payroll contribution segmentation. The caller owns legal
// parameters; this module deliberately contains no statutory rates.

const TYPES = new Set(["TRABAJO", "VAC_DISFRUTADAS", "VAC_COMPENSADAS", "LICENCIA_REMUNERADA", "SLN"]);
const SS = ["salud", "pension", "arl", "parafiscales"];

const money = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
const dateOnly = (value) => {
  const text = String(value || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new Error(`Fecha inválida: ${value}`);
  const date = new Date(`${text}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) throw new Error(`Fecha inválida: ${value}`);
  if (date.toISOString().slice(0, 10) !== text) throw new Error(`Fecha inválida: ${value}`);
  return date;
};
const iso = (date) => date.toISOString().slice(0, 10);
const addDay = (date) => new Date(date.getTime() + 86400000);
const daysBetween = (from, to) => Math.floor((to.getTime() - from.getTime()) / 86400000) + 1;
const isFirstOfMonth = (date) => date.getUTCDate() === 1;
const isLastOfMonth = (date) => addDay(date).getUTCDate() === 1;
function commercialDaysBetween(from, to) {
  let cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  const finish = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()));
  let total = 0;
  while (cursor <= finish) {
    const monthEnd = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0));
    const chunkEnd = monthEnd < finish ? monthEnd : finish;
    const calendarChunk = daysBetween(cursor, chunkEnd);
    if (isFirstOfMonth(cursor) && isLastOfMonth(chunkEnd)) total += 30;
    else {
      let counted = 0;
      for (let day = new Date(cursor.getTime()); day <= chunkEnd; day = addDay(day)) {
        if (day.getUTCDate() <= 30) counted += 1;
      }
      if (isLastOfMonth(chunkEnd) && chunkEnd.getUTCDate() < 30) counted += 30 - chunkEnd.getUTCDate();
      total += Math.min(30, counted || calendarChunk);
    }
    cursor = addDay(chunkEnd);
  }
  return total;
}

function rateFor(rates, subsystem, side) {
  const raw = rates?.[subsystem] ?? rates?.[subsystem === "parafiscales" ? "ccf" : subsystem];
  if (raw == null) return 0;
  if (typeof raw === "number") return side === "employer" ? Number(raw) : 0;
  if (typeof raw === "object") return Number(raw[side] ?? raw[side === "employer" ? "patronal" : "trabajador"] ?? 0);
  return 0;
}

function rateAmount(base, rates, subsystem, side) {
  return money(base * rateFor(rates, subsystem, side) / 100);
}

function roundPila(value, rounding, subsystem, side) {
  const scoped = rounding?.[subsystem] ?? rounding?.default ?? rounding;
  const rule = scoped?.[side] ?? scoped?.amount ?? scoped;
  if (typeof rule === "function") return money(rule(value));
  if (rule && typeof rule === "object") {
    const factor = 10 ** Number(rule.decimals ?? 2);
    const mode = rule.mode || "nearest";
    const operation = mode === "ceil" ? Math.ceil : mode === "floor" ? Math.floor : Math.round;
    const decimalValue = operation(Number(value || 0) * factor) / factor;
    if (rule.step != null && Number(rule.step) > 0) {
      const step = Number(rule.step);
      const stepOperation = mode === "ceil" ? Math.ceil : mode === "floor" ? Math.floor : Math.round;
      return stepOperation(decimalValue / step) * step;
    }
    return decimalValue;
  }
  return money(value);
}

function normalizedType(adjustment) {
  const type = String(adjustment.type || adjustment.classification || adjustment.adjustment_type || "TRABAJO").toUpperCase();
  if (type === "VACACIONES" || type === "VACACIONES_DISFRUTADAS" || type === "VAC_DISFRUTADAS") return "VAC_DISFRUTADAS";
  if (type === "VACACIONES_COMPENSADAS" || type === "VAC_COMPENSADAS") return "VAC_COMPENSADAS";
  if (type === "LICENCIA_REMUNERADA" || type === "LR") return "LICENCIA_REMUNERADA";
  if (type === "LICENCIA_NO_REMUNERADA" || type === "SUSPENSION" || type === "SLN") return "SLN";
  if (type === "TRABAJO" || type === "ORDINARIO") return "TRABAJO";
  throw Object.assign(new Error(`Tipo de novedad no soportado: ${type}`), { code: "IBC_UNSUPPORTED_NOVELTY" });
}

function referenceFor(adjustment) {
  const ref = adjustment.frozenHistoricalReference || adjustment.ibcReference || adjustment.ibc_referencia_inicio || adjustment.historicalIbc;
  const monthly = Number(ref?.monthlyAmount ?? ref?.monthly_amount ?? ref?.amount ?? ref ?? NaN);
  if (!Number.isFinite(monthly) || monthly < 0) {
    throw Object.assign(new Error("La novedad requiere IBC histórico congelado al inicio"), { code: "IBC_HISTORICAL_REFERENCE_REQUIRED" });
  }
  return { monthlyAmount: monthly, sourcePeriod: ref?.sourcePeriod || ref?.periodo_ibc_referencia || adjustment.referencePeriod || null, capturedAt: ref?.capturedAt || adjustment.referenceStart || adjustment.dateStart || null };
}

function dateRange(adjustment, periodStart, periodEnd) {
  const from = dateOnly(adjustment.originalEventStart || adjustment.original_event_start || adjustment.start || adjustment.date_start || adjustment.dateStart || periodStart);
  const to = dateOnly(adjustment.originalEventEnd || adjustment.original_event_end || adjustment.end || adjustment.date_end || adjustment.dateEnd || adjustment.start || adjustment.date_start || periodEnd);
  if (to < from) throw Object.assign(new Error("Rango de novedad inválido"), { code: "IBC_INVALID_DATE_RANGE" });
  const clippedFrom = from < periodStart ? periodStart : from;
  const clippedTo = to > periodEnd ? periodEnd : to;
  return clippedTo < clippedFrom ? null : { from: clippedFrom, to: clippedTo };
}

function makeReferenceMap(adjustments) {
  const byKey = new Map();
  for (const adjustment of adjustments) {
    const type = normalizedType(adjustment);
    if (type === "TRABAJO" || type === "VAC_COMPENSADAS") continue;
    const ref = referenceFor(adjustment);
    const key = adjustment.continuityKey || adjustment.continuity_key || null;
    if (!key) continue;
    const previous = byKey.get(key);
    if (previous && (previous.monthlyAmount !== ref.monthlyAmount || previous.sourcePeriod !== ref.sourcePeriod)) {
      throw Object.assign(new Error(`La referencia histórica cambió durante la novedad continua ${key}`), { code: "IBC_HISTORICAL_REFERENCE_CHANGED" });
    }
    byKey.set(key, ref);
  }
  return byKey;
}

function calculateSocialContributionSegments(input = {}) {
  const requestedPeriodStart = dateOnly(input.period?.start || input.periodStart || input.fecha_inicio);
  const requestedPeriodEnd = dateOnly(input.period?.end || input.periodEnd || input.fecha_fin);
  const employmentStart = input.entryDate || input.fecha_ingreso ? dateOnly(input.entryDate || input.fecha_ingreso) : null;
  const employmentEnd = input.exitDate || input.fecha_retiro ? dateOnly(input.exitDate || input.fecha_retiro) : null;
  const periodStart = employmentStart && employmentStart > requestedPeriodStart ? employmentStart : requestedPeriodStart;
  const periodEnd = employmentEnd && employmentEnd < requestedPeriodEnd ? employmentEnd : requestedPeriodEnd;
  if (periodEnd < periodStart) throw Object.assign(new Error("Periodo inválido"), { code: "IBC_INVALID_PERIOD" });
  const periodDaysCalendar = daysBetween(periodStart, periodEnd);
  // PILA uses the commercial 30-day month. Shorter calendar months normalize to
  // PILA caps 31-day months at 30; shorter periods retain 28/29 normalized days.
  // A historical hire/termination date outside the requested period does
  // not make a full month partial. Only an effective boundary inside the
  // requested interval changes commercial-day normalization.
  const employmentBoundary = (employmentStart && employmentStart > requestedPeriodStart) || (employmentEnd && employmentEnd < requestedPeriodEnd);
  const periodDays = employmentBoundary ? Math.min(30, periodDaysCalendar) : Math.min(30, commercialDaysBetween(periodStart, periodEnd));
  const employeeProfile = input.employee || input.employeeProfile || {};
  const regime = String(employeeProfile.regime || employeeProfile.regimen || input.regime || input.regimen || "ordinary").toLowerCase();
  const sector = String(employeeProfile.sector || input.sector || "private").toLowerCase();
  if (!['ordinary', 'ordinario', 'laboral_ordinario'].includes(regime) || !['private', 'privado'].includes(sector)) {
    throw Object.assign(new Error("El motor solo admite dependientes privados del régimen laboral ordinario"), { code: "IBC_UNSUPPORTED_REGIME" });
  }
  const rates = input.contributionRates || input.rates || {};
  const adjustments = Array.isArray(input.adjustments) ? input.adjustments : [];
  const advanceMap = input.advancesRetentions || {};
  const periodKey = input.periodKey || input.period?.key;
  if (Object.keys(advanceMap).length && !periodKey) throw Object.assign(new Error("Las retenciones anticipadas requieren periodo explícito"), { code: "IBC_ADVANCE_PERIOD_REQUIRED" });
  makeReferenceMap(adjustments);

  const ranges = [];
  for (const adjustment of adjustments) {
    const type = normalizedType(adjustment);
    const range = dateRange(adjustment, periodStart, periodEnd);
    if (!range) continue;
    if (type === "VAC_COMPENSADAS") {
      ranges.push({ adjustment, type, from: range.from, to: range.to, days: 0 });
      continue;
    }
    const originalFrom = dateOnly(adjustment.originalEventStart || adjustment.original_event_start || adjustment.start || adjustment.date_start || adjustment.dateStart || periodStart);
    const originalTo = dateOnly(adjustment.originalEventEnd || adjustment.original_event_end || adjustment.end || adjustment.date_end || adjustment.dateEnd || adjustment.start || adjustment.date_start || periodEnd);
    const originalDays = commercialDaysBetween(originalFrom, originalTo);
    const clippedDays = commercialDaysBetween(range.from, range.to);
    const coversEffectivePeriod = range.from.getTime() === periodStart.getTime() && range.to.getTime() === periodEnd.getTime();
    const hasExplicitDays = adjustment.originalDays != null || adjustment.days != null || adjustment.dias != null;
    const wasClipped = range.from.getTime() !== originalFrom.getTime() || range.to.getTime() !== originalTo.getTime();
    let requestedDays = Number(hasExplicitDays ? (adjustment.originalDays ?? adjustment.days ?? adjustment.dias) : (coversEffectivePeriod && !employmentBoundary ? periodDays : originalDays));
    if (!employmentBoundary && !wasClipped && coversEffectivePeriod && isFirstOfMonth(periodStart) && isLastOfMonth(periodEnd) && requestedDays === periodDaysCalendar) requestedDays = periodDays;
    const days = !wasClipped && hasExplicitDays ? requestedDays : coversEffectivePeriod && !employmentBoundary ? Math.min(requestedDays, periodDays) : Math.min(clippedDays, requestedDays * clippedDays / originalDays);
    if (!Number.isFinite(days) || days < 0) throw Object.assign(new Error("Días de novedad inválidos"), { code: "IBC_INVALID_DAYS" });
    // Explicit PILA days are authoritative for a novelty fully contained in
    // the requested period. Calendar clipping is only used when an event
    // crosses a boundary; February 16-28 may therefore report 15 days.
    const normalizedDays = !wasClipped && hasExplicitDays
      ? days
      : coversEffectivePeriod && !employmentBoundary ? days : Math.min(days, clippedDays);
    ranges.push({ adjustment, type, from: range.from, to: range.to, days: normalizedDays });
  }
  const dated = ranges.filter((item) => item.days > 0).sort((a, b) => a.from - b.from);
  for (let i = 1; i < dated.length; i += 1) {
    if (dated[i].from <= dated[i - 1].to) throw Object.assign(new Error("Novedades con días superpuestos"), { code: "IBC_OVERLAPPING_NOVELTIES" });
  }
  const occupied = dated.reduce((sum, item) => sum + item.days, 0);
  const worked = input.currentWorkedCotizableRemuneration ?? input.current_worked_cotizable_remuneration ?? input.workedRemuneration ?? 0;
  const workedAmount = typeof worked === "object" ? Number(worked.amount ?? worked.value ?? 0) : Number(worked || 0);
  const workedDays = Number(input.workedDays ?? input.diasTrabajados ?? (typeof worked === "object" ? worked.days : periodDays - occupied));
  if (!Number.isFinite(workedAmount) || workedAmount < 0 || !Number.isFinite(workedDays) || workedDays < 0) throw Object.assign(new Error("Remuneración o días trabajados inválidos"), { code: "IBC_INVALID_WORKED_INPUT" });
  if (workedDays + occupied > periodDays) throw Object.assign(new Error("Los días de novedades superan el periodo normalizado"), { code: "IBC_DAYS_EXCEED_PERIOD" });

  const segments = [];
  const occupiedRanges = dated.map((item) => ({ from: item.from, to: item.to }));
  const gaps = [];
  let cursor = periodStart;
  for (const occupiedRange of occupiedRanges) {
    if (cursor < occupiedRange.from) gaps.push({ from: cursor, to: new Date(occupiedRange.from.getTime() - 86400000) });
    if (occupiedRange.to >= cursor) cursor = addDay(occupiedRange.to);
  }
  if (cursor <= periodEnd) gaps.push({ from: cursor, to: periodEnd });
  const gapCalendarDays = gaps.reduce((sum, gap) => sum + daysBetween(gap.from, gap.to), 0) || 1;
  for (const gap of gaps) {
    const gapDays = workedDays * daysBetween(gap.from, gap.to) / gapCalendarDays;
    if (gapDays <= 0) continue;
    segments.push({ type: "TRABAJO", pila_code: null, from: gap.from, to: gap.to, days: money(gapDays), source: "current_worked_cotizable_remuneration", amount: money(workedAmount * gapDays / workedDays), recognized: money(workedAmount * gapDays / workedDays) });
  }
  for (const item of dated) {
    const { adjustment, type } = item;
    const ref = type === "TRABAJO" || type === "VAC_COMPENSADAS" ? null : referenceFor(adjustment);
    const daily = ref ? ref.monthlyAmount / 30 : 0;
    const amount = type === "VAC_COMPENSADAS" ? 0 : money(daily * item.days);
    const recognized = Number(adjustment.recognizedValue ?? adjustment.valor_reconocido ?? adjustment.amount ?? amount);
    const lrArlPolicy = adjustment.lrArlPolicy ?? adjustment.metadata?.lr_arl_policy ?? input.lrArlPolicy;
    if (type === "LICENCIA_REMUNERADA" && !["cotiza", "no_cotiza"].includes(lrArlPolicy)) throw Object.assign(new Error("La política ARL de licencia remunerada es obligatoria y debe ser cotiza o no_cotiza"), { code: "IBC_LR_ARL_POLICY_REQUIRED" });
    segments.push({ id: adjustment.id || adjustment.noveltyId || null, type, pila_code: type === "VAC_DISFRUTADAS" ? "VAC-LR" : type === "LICENCIA_REMUNERADA" ? "L" : type === "SLN" ? "SLN" : null, from: item.from, to: item.to, days: item.days, source: adjustment.source || "novedad", amount, recognized: Number.isFinite(recognized) ? recognized : 0, reference: ref, lrArlPolicy: type === "LICENCIA_REMUNERADA" ? lrArlPolicy : null, slnPensionEmployerPercent: adjustment.slnPensionEmployerPercent ?? adjustment.pensionEmployerPercent ?? null, supportReference: adjustment.documentSupport || adjustment.documento_soporte || adjustment.supportReference || null });
  }
  for (const item of ranges.filter((candidate) => candidate.type === "VAC_COMPENSADAS")) {
    const adjustment = item.adjustment;
    segments.push({ id: adjustment.id || adjustment.noveltyId || null, type: "VAC_COMPENSADAS", pila_code: null, from: item.from, to: item.to, days: 0, source: adjustment.source || "novedad", amount: 0, recognized: Number(adjustment.recognizedValue ?? adjustment.valor_reconocido ?? adjustment.amount ?? 0), supportReference: adjustment.documentSupport || adjustment.documento_soporte || adjustment.supportReference || null });
  }
  const bases = Object.fromEntries(SS.map((key) => [key, 0]));
  const advanceRemaining = Object.fromEntries(SS.map((subsystem) => {
    const candidate = advanceMap[subsystem];
    const value = Number(advanceMap[`${subsystem}:${periodKey}`] ?? (candidate && candidate.periodKey === periodKey ? candidate.amount : 0));
    return [subsystem, Math.max(value, 0)];
  }));
  for (const segment of segments) {
    const isComp = segment.type === "VAC_COMPENSADAS";
    const isSln = segment.type === "SLN";
    const isVac = segment.type === "VAC_DISFRUTADAS";
    const isLr = segment.type === "LICENCIA_REMUNERADA";
    segment.ibcBefore = {};
    for (const subsystem of SS) {
      let base = isComp ? 0 : segment.amount;
      if (subsystem === "arl" && (isVac || isSln || (isLr && segment.lrArlPolicy === "no_cotiza"))) base = 0;
      if (subsystem === "parafiscales" && (isVac || isLr)) base = segment.recognized;
      if (subsystem === "parafiscales" && isComp) base = segment.recognized;
      if (subsystem === "parafiscales" && isSln) base = 0;
      segment.ibcBefore[subsystem] = money(base);
      bases[subsystem] += base;
    }
  }
  const capFloor = input.config?.capsFloors || input.capsFloors || {};
  const rounding = input.config?.roundingPila || input.roundingPila || {};
  const adjustedBases = {};
  const warnings = [];
  for (const subsystem of SS) {
    const original = bases[subsystem];
    const cfg = capFloor[subsystem] || {};
    let adjusted = original;
    if (cfg.floor != null && adjusted > 0 && adjusted < Number(cfg.floor)) adjusted = Number(cfg.floor);
    if (cfg.min != null && adjusted > 0 && adjusted < Number(cfg.min)) adjusted = Number(cfg.min);
    if (cfg.cap != null && adjusted > Number(cfg.cap)) adjusted = Number(cfg.cap);
    adjusted = money(adjusted);
    if (rounding.ibc) {
      const baseRule = rounding.ibc[subsystem] ?? rounding.ibc;
      adjusted = roundPila(adjusted, { default: baseRule }, subsystem, "total");
    }
    adjustedBases[subsystem] = adjusted;
    if (adjusted !== money(original)) warnings.push({ code: "IBC_AGGREGATE_CAP_FLOOR", subsystem, before: money(original), after: adjusted });
  }
  const remainingBases = { ...adjustedBases };
  const lastPositiveSegment = Object.fromEntries(SS.map((subsystem) => [subsystem, segments.findLastIndex((segment) => segment.ibcBefore[subsystem] > 0)]));
  for (const [segmentIndex, segment] of segments.entries()) {
    segment.ibcAfter = {};
    segment.daysReportBySubsystem = Object.fromEntries(SS.map((key) => [key, segment.type === "VAC_COMPENSADAS" ? 0 : segment.days]));
    segment.daysContributing = Object.fromEntries(SS.map((key) => [key, segment.ibcBefore[key] > 0 ? segment.days : 0]));
    segment.employeeAmounts = {};
    segment.employerAmounts = {};
    segment.retentionApplied = {};
    segment.retentionsApplied = segment.retentionApplied;
    segment.conceptualAmounts = { employee: {}, employer: {} };
    segment.pilaAmounts = { employee: {}, employer: {}, total: {} };
    for (const subsystem of SS) {
      const before = segment.ibcBefore[subsystem];
      const proportional = bases[subsystem] > 0 ? money(before * adjustedBases[subsystem] / bases[subsystem]) : 0;
      // Reconcile the final share instead of independently rounding every share:
      // the visible segments must sum exactly to the subsystem's adjusted base.
      const after = before > 0 ? money(segmentIndex === lastPositiveSegment[subsystem]
        ? remainingBases[subsystem]
        : Math.min(proportional, remainingBases[subsystem])) : 0;
      remainingBases[subsystem] = money(remainingBases[subsystem] - after);
      segment.ibcAfter[subsystem] = after;
      const employeeRate = segment.type === "SLN" ? 0 : rateFor(rates, subsystem, "employee");
      let employerRate = rateFor(rates, subsystem, "employer");
      if (segment.type === "SLN" && subsystem === "pension") {
        const override = segment.slnPensionEmployerPercent ?? input.overrideSLN?.pensionEmployerPercent;
        if (override != null) {
          if (![12, 16].includes(Number(override))) throw Object.assign(new Error("La tasa patronal de pensión SLN debe ser 12 o 16"), { code: "IBC_SLN_PENSION_RATE_INVALID" });
          employerRate = Number(override);
        }
      }
      const eligible = subsystem === "salud" && (input.config?.exonerationEligibility?.salud === true || typeof input.config?.exonerationEligibility === "function" && input.config.exonerationEligibility({ subsystem, segment, input }));
      const employer = eligible ? 0 : money(after * employerRate / 100);
      const employee = rateAmount(after, { [subsystem]: { employee: employeeRate } }, subsystem, "employee");
      const applied = Math.min(advanceRemaining[subsystem], employee);
      advanceRemaining[subsystem] = money(advanceRemaining[subsystem] - applied);
      segment.employeeAmounts[subsystem] = employee;
      segment.employerAmounts[subsystem] = employer;
      segment.retentionApplied[subsystem] = applied;
      segment.conceptualAmounts.employee[subsystem] = employee;
      segment.conceptualAmounts.employer[subsystem] = employer;
      segment.pilaAmounts.employee[subsystem] = roundPila(employee, rounding, subsystem, "employee");
      segment.pilaAmounts.employer[subsystem] = roundPila(employer, rounding, subsystem, "employer");
      segment.pilaAmounts.total[subsystem] = roundPila(employee + employer, rounding, subsystem, "total");
    }
    segment.ibcBeforeAfterBySubsystem = { before: segment.ibcBefore, after: segment.ibcAfter };
    segment.provenance = { source: segment.source, reference: segment.reference || null, frozenReference: Boolean(segment.reference), recognizedValue: segment.recognized };
  }
  const totals = { basesBefore: bases, basesAfter: adjustedBases, employeeAmounts: {}, employerAmounts: {}, retentionsApplied: {}, pilaAmounts: {} };
  for (const subsystem of SS) {
    totals.employeeAmounts[subsystem] = money(segments.reduce((sum, segment) => sum + segment.employeeAmounts[subsystem], 0));
    totals.employerAmounts[subsystem] = money(segments.reduce((sum, segment) => sum + segment.employerAmounts[subsystem], 0));
    totals.retentionsApplied[subsystem] = money(segments.reduce((sum, segment) => sum + segment.retentionApplied[subsystem], 0));
    // PILA rounds the obligation total per cotizante/subsystem. Segment totals
    // remain available for traceability, but are never independently summed as
    // the legal payable amount.
    totals.pilaAmounts[subsystem] = roundPila(totals.employeeAmounts[subsystem] + totals.employerAmounts[subsystem], rounding, subsystem, "total");
  }
  return { period: { start: iso(periodStart), end: iso(periodEnd), calendarDays: periodDaysCalendar, normalizedDays: periodDays }, segments, totals, warnings };
}

module.exports = { calculateSocialContributionSegments, commercialDaysBetween };
