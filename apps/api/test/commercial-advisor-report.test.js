const test = require('node:test');
const assert = require('node:assert/strict');
const { aggregateAdvisorVisits: report } = require('../src/modules/commercial-management/advisor-report');
const visit = (extra = {}) => ({ advisor_id: 1, advisor: { name: 'Ana' }, visit_date: '2026-08-31T15:00:00Z', status: 'COMPLETED', orders: [], quotations: [], ...extra });
test('valor suma todos los pedidos vigentes sin duplicar por cotizacion y respeta filtros', () => {
  const visits = [visit({ orders: [{ status: 'REGISTERED', total: '100.10' }, { status: 'CONFIRMED', total: '200.20' }, { status: 'CANCELLED', total: 900 }], quotations: [{ status: 'CONVERTED' }] }), visit({ advisor_id: 2, orders: [{ status: 'INVOICED', total: 50 }] }), visit({ status: 'IN_PROGRESS', orders: [{ status: 'REGISTERED', total: 80 }] })];
  const result = report(visits, { year: 2026, month: 8, advisor_id: 1, group: 'month' });
  assert.equal(result.rows[0].order_value, 300.30);
  assert.equal(result.totals.with_order, 1);
  assert.equal(report(visits, { group: 'year' }).totals.order_value, 350.30);
  assert.equal(report(visits, { month: 9 }).totals.order_value, 0);
});
test('categorias excluyentes, cotizacion convertida y documentos cancelados', () => {
  const result = report([visit({ orders: [{ status: 'REGISTERED' }], quotations: [{ status: 'CONVERTED' }] }), visit({ quotations: [{ status: 'OPEN' }] }), visit({ orders: [{ status: 'CANCELLED' }], quotations: [{ status: 'CANCELLED' }] }), visit({ status: 'SCHEDULED' }), visit({ status: 'RESCHEDULED' }), visit({ status: 'CANCELLED' })]);
  assert.deepEqual(result.totals, { order_value: 0, total: 4, completed: 3, pending: 1, with_order: 1, with_quotation: 2, quotation_only: 1, without_result: 1 });
});
test('filtros y agrupacion Colombia, semana de lunes incluso entre años', () => {
  const visits = [visit({ visit_date: '2026-01-01T03:00:00Z' }), visit({ advisor_id: 2 }), visit()];
  assert.equal(report(visits, { year: 2025, month: 12, day: 31, group: 'week' }).rows[0].period, '2025-12-29');
  assert.equal(report(visits, { year: 2026, month: 8, advisor_id: 1, group: 'month' }).rows[0].period, '2026-08');
  assert.equal(report(visits, { year: 2026, group: 'year' }).rows.length, 2);
  assert.equal(report(visits, { year: 2026, day: 1 }).rows.length, 0);
  assert.equal(report([], {}).totals.total, 0);
});
