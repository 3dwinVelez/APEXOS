const test = require("node:test");
const assert = require("node:assert/strict");
const { budgetMetrics, isFullCalendarMonth, orderTotals, periodProgress } = require("../src/modules/commercial-management/domain");

test("duracion no se calcula desde null ni para reprogramaciones", () => {
  const { visitExecutionMinutes } = require("../src/modules/commercial-management/domain");
  assert.equal(visitExecutionMinutes({ status: "RESCHEDULED", started_at: null, completed_at: new Date() }), null);
  assert.equal(visitExecutionMinutes({ status: "COMPLETED", started_at: null, completed_at: new Date() }), null);
  assert.equal(visitExecutionMinutes({ status: "COMPLETED", started_at: "2026-08-31T10:00:00Z", completed_at: "2026-08-31T10:03:00Z" }), 3);
  assert.equal(visitExecutionMinutes({ status: "COMPLETED", started_at: "invalid", completed_at: new Date() }), null);
});

test("calcula total del pedido y descuento como monto", () => {
  const result = orderTotals([{ product_id: 1, quantity: 2, unit_price: 50000, discount: 10000 }]);
  assert.equal(result.subtotal, 100000);
  assert.equal(result.discount, 10000);
  assert.equal(result.total, 90000);
});

test("rechaza descuentos superiores al bruto", () => {
  assert.throws(() => orderTotals([{ product_id: 1, quantity: 1, unit_price: 100, discount: 101 }]), /descuento/);
});

test("calcula avance, proyeccion y semaforo dinamicos", () => {
  const period = { start_date: "2026-08-01T00:00:00.000Z", end_date: "2026-08-31T00:00:00.000Z" };
  const progress = periodProgress(period, new Date("2026-08-16T00:00:00.000Z"));
  const metrics = budgetMetrics({ budget: 100000000, sales: 50000000, progress });
  assert.equal(progress, 0.5);
  assert.equal(metrics.projection, 100000000);
  assert.equal(metrics.traffic_light, "GREEN");
});

test("pedido cancelado no pertenece a estados de venta reconocida", () => {
  const { RECOGNIZED_SALE_STATUSES } = require("../src/modules/commercial-management/domain");
  assert.deepEqual(RECOGNIZED_SALE_STATUSES, ["CONFIRMED", "INVOICED"]);
  assert.equal(RECOGNIZED_SALE_STATUSES.includes("CANCELLED"), false);
});

test("valida un mes calendario completo usando la zona horaria de Colombia", () => {
  assert.equal(isFullCalendarMonth("2026-08-01T00:00:00-05:00", "2026-08-31T23:59:59.999-05:00"), true);
  assert.equal(isFullCalendarMonth("2026-08-02T00:00:00-05:00", "2026-08-31T23:59:59.999-05:00"), false);
});
