const date = value => new Date(String(value).slice(0, 10) + 'T00:00:00Z');
const iso = value => value.toISOString().slice(0, 10);
const money = value => Math.round((Number(value) || 0) * 100) / 100;
function commercialDays(start, end) {
  const a = date(start), b = date(end);
  if (a > b) return 0;
  const last = new Date(Date.UTC(b.getUTCFullYear(), b.getUTCMonth() + 1, 0)).getUTCDate();
  const dayEnd = b.getUTCDate() === last ? 30 : Math.min(b.getUTCDate(), 30);
  return (b.getUTCFullYear() - a.getUTCFullYear()) * 360 + (b.getUTCMonth() - a.getUTCMonth()) * 30 + dayEnd - Math.min(a.getUTCDate(), 30) + 1;
}
function periods(start, end, semester = false) {
  const result = [];
  let cursor = date(start);
  const cut = date(end);
  while (cursor <= cut) {
    const boundary = new Date(Date.UTC(cursor.getUTCFullYear(), semester && cursor.getUTCMonth() < 6 ? 5 : 11, semester && cursor.getUTCMonth() < 6 ? 30 : 31));
    const stop = boundary < cut ? boundary : cut;
    result.push({ start: iso(cursor), end: iso(stop) });
    cursor = new Date(stop.getTime() + 86400000);
  }
  return result;
}
const ordinary = new Set(['SALARIO_BASICO', 'JORNADA_ORDINARIA', 'SALARIO_PENDIENTE']);
const vacationExcluded = new Set(['HED', 'HEN', 'HEDD', 'HEND', 'DOM_FEST_DIURNO', 'DOM_FEST_NOCTURNO', 'AUX_TRANSPORTE']);
function variableBase(lines, start, end, vacation = false) {
  let total = 0;
  for (const line of lines) {
    const code = String(line.code || '').toUpperCase();
    if (!(line.amount > 0) || ordinary.has(code) || line.concept_type === 'informativo' || line.exclude_from_social_benefits_base || line.source === 'prestaciones' || line.legal_group === 'prestaciones_sociales') continue;
    if (vacation ? vacationExcluded.has(code) || (line.salary_constitutive === false && !line.include_in_vacation_base) : line.salary_constitutive === false && !line.include_in_social_benefits_base) continue;
    const from = String(line.metadata?.date_start || '').slice(0, 10), to = String(line.metadata?.date_end || from).slice(0, 10);
    if (!from || to < start || from > end) continue;
    const overlap = commercialDays(from > start ? from : start, to < end ? to : end);
    total += Number(line.amount) * overlap / Math.max(1, commercialDays(from, to));
  }
  return money(total * 30 / Math.max(1, commercialDays(start, end)));
}
// Each accrual window is independent: prima per semester, severance/interest per year.
// Vacation accrual remains cumulative, with its own base excluding overtime/rest-day work.
function calculateTerminationBenefits({ start, end, balances = [], lines = [], salaryFor }) {
  const windows = [
    ...periods(start, end, true).map(period => ({ ...period, code: 'PRIMA_SERVICIOS' })),
    ...periods(start, end).flatMap(period => ['CESANTIAS', 'INTERESES_CESANTIAS'].map(code => ({ ...period, code }))),
    { start, end, code: 'VACACIONES' }
  ];
  return windows.map(window => {
    const vacation = window.code === 'VACACIONES';
    const averagingStart = vacation || window.code !== 'PRIMA_SERVICIOS'
      ? [start, iso(new Date(Date.UTC(date(window.end).getUTCFullYear() - 1, date(window.end).getUTCMonth(), date(window.end).getUTCDate() + 1)))].sort().at(-1)
      : window.start;
    const days = commercialDays(window.start, window.end);
    const base = money(salaryFor(averagingStart, window.end, window.code) + variableBase(lines, averagingStart, window.end, vacation));
    const principal = money(base * days / (vacation ? 720 : 360));
    const accrued = window.code === 'INTERESES_CESANTIAS' ? money(principal * days * 0.12 / 360) : principal;
    const paid = money(balances.filter(row => row.concept_code === window.code && row.date_start <= window.end && row.date_end >= window.start).reduce((sum, row) => {
      const overlap = commercialDays(row.date_start > window.start ? row.date_start : window.start, row.date_end < window.end ? row.date_end : window.end);
      return sum + Number(row.paid_amount || 0) * overlap / Math.max(1, commercialDays(row.date_start, row.date_end));
    }, 0));
    return { ...window, days, base, accrued_amount: accrued, paid_amount: paid, amount: money(Math.max(0, accrued - paid)), averaging_start: averagingStart };
  });
}
module.exports = { calculateTerminationBenefits, commercialDays, variableBase };
