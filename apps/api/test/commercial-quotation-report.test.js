const test = require('node:test');
const assert = require('node:assert/strict');
const { compareQuotation } = require('../src/modules/commercial-management/quotation-report');
const line = (id, quantity, total) => ({ product_id: id, product_code: String(id), product_name: `P${id}`, quantity, line_total: total });
const quote = { id: 1, quotation_number: 'COT-1', quotation_date: '2026-08-01', status: 'CONVERTED', advisor_id: 1, advisor: { name: 'Ana' }, customer_id: 2, customer: { legal_name: 'Cliente' }, lines: [line(1, 5, 450), line(2, 2, 200), line(3, 1, 100), line(4, 1, 100)], sales_order: { order_number: 'GC-1', status: 'REGISTERED', order_date: '2026-09-01', lines: [line(1, 2, 200), line(2, 4, 400), line(4, 1, 110), line(5, 3, 300)] } };
test('compara union de productos con valores netos y conserva fechas distintas', () => {
  const rows = compareQuotation(quote);
  assert.deepEqual(rows.map(row => row.outcome), ['LESS', 'MORE', 'NOT_ORDERED', 'SAME', 'ADDED']);
  assert.equal(rows[0].quantity_difference, -3);
  assert.equal(rows[0].value_difference, -250);
  assert.equal(rows[3].value_difference, 10, 'Misma cantidad con precio distinto');
  assert.equal(rows[4].quoted_value, 0);
  assert.equal(rows[0].order_date, '2026-09-01');
  assert.equal(rows.reduce((sum, row) => sum + row.ordered_value, 0), 1010);
});
test('pendiente no se etiqueta como no comprado y cancelados no suman pedidos', () => {
  assert.ok(compareQuotation({ ...quote, status: 'OPEN', sales_order: null }).every(row => row.outcome === 'PENDING' && row.ordered_value === 0));
  assert.ok(compareQuotation({ ...quote, sales_order: { ...quote.sales_order, status: 'CANCELLED' } }).every(row => row.outcome === 'ORDER_CANCELLED' && row.ordered_value === 0));
  assert.ok(compareQuotation({ ...quote, status: 'CANCELLED', sales_order: null }).every(row => row.outcome === 'CANCELLED'));
});
test('agrupa lineas repetidas sin duplicar cantidades ni valores', () => {
  const rows = compareQuotation({ ...quote, lines: [line(1, 1, 0.1), line(1, 2, 0.2)], sales_order: null });
  assert.equal(rows.length, 1); assert.equal(rows[0].quoted_quantity, 3); assert.equal(rows[0].quoted_value, 0.3);
});
