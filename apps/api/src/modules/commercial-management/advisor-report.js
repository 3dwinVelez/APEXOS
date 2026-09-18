function day(value) {
  return new Date(new Date(value).getTime() - 5 * 3600000).toISOString().slice(0, 10);
}
function bucket(date, group) {
  if (group === 'year') return date.slice(0, 4);
  if (group === 'month') return date.slice(0, 7);
  if (group === 'week') {
    const d = new Date(`${date}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7);
    return d.toISOString().slice(0, 10);
  }
  return date;
}
function aggregateAdvisorVisits(visits, query = {}) {
  const groups = new Map();
  for (const visit of visits) {
    if (['RESCHEDULED', 'CANCELLED'].includes(visit.status)) continue;
    const date = day(visit.visit_date);
    if (query.year && date.slice(0, 4) !== String(query.year)) continue;
    if (query.month && Number(date.slice(5, 7)) !== Number(query.month)) continue;
    if (query.day && Number(date.slice(8, 10)) !== Number(query.day)) continue;
    if (query.advisor_id && visit.advisor_id !== Number(query.advisor_id)) continue;
    const period = query.group === 'advisor' ? 'Todo el período' : bucket(date, query.group || 'day');
    const key = `${period}/${visit.advisor_id}`;
    if (!groups.has(key)) groups.set(key, { period, advisor_id: visit.advisor_id, advisor: visit.advisor?.name || 'Sin nombre', total: 0, completed: 0, pending: 0, order_value: 0, with_order: 0, with_quotation: 0, quotation_only: 0, without_result: 0 });
    const row = groups.get(key);
    row.total++;
    if (visit.status !== 'COMPLETED') { row.pending++; continue; }
    row.completed++;
    const order = visit.orders.some(doc => doc.status !== 'CANCELLED');
    const quote = visit.quotations.some(doc => doc.status !== 'CANCELLED');
    if (order) row.with_order++;
    row.order_value = Math.round((row.order_value + visit.orders.filter(doc => doc.status !== 'CANCELLED').reduce((sum, doc) => sum + Number(doc.total || 0), 0)) * 100) / 100;
    if (quote) row.with_quotation++;
    if (!order && quote) row.quotation_only++;
    if (!order && !quote) row.without_result++;
  }
  const rows = [...groups.values()].sort((a, b) => a.period.localeCompare(b.period) || a.advisor.localeCompare(b.advisor));
  const totals = Object.fromEntries(['order_value', 'total', 'completed', 'pending', 'with_order', 'with_quotation', 'quotation_only', 'without_result'].map(key => [key, rows.reduce((sum, row) => sum + row[key], 0)]));
  totals.order_value = Math.round(totals.order_value * 100) / 100;
  return { rows, totals };
}
module.exports = { aggregateAdvisorVisits };
