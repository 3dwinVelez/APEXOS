const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../src/modules/transport/settlement-engine');
const row = (patch = {}) => ({ concept: 'Flete', quantity: 1, unit_value: 85000, support: 'Remesa 001 firmada', ...patch });
test('criterios calculan cantidades, centavos y varios conceptos sin confiar en totales enviados', () => {
  const result = E.calculateChargeCriteria([row(), row({ concept: 'Peajes', quantity: 2, unit_value: 12000, amount: 999999 }), row({ quantity: 3, unit_value: .1 })]);
  assert.equal(result.amount, 109000.3);
  assert.equal(result.criteria[1].amount, 24000);
});
test('cada criterio requiere concepto y soporte del documento', () => {
  for (const patch of [{ concept: ' ' }, { support: '' }, { quantity: 0 }, { quantity: Infinity }, { unit_value: -1 }, { unit_value: NaN }]) assert.throws(() => E.calculateChargeCriteria([row(patch)]));
  for (const entries of [[], null, Array.from({ length: 51 }, () => row())]) assert.throws(() => E.calculateChargeCriteria(entries));
});
test('la normalización descarta campos privilegiados y conserva solo el criterio', () => {
  assert.deepEqual(E.normalizeChargeCriteria([row({ approved_amount: 999999, tenant_id: 'other' })]), [row()]);
});
test('las cantidades del tarifario reutilizan el recorrido configurado y las paradas reales', () => {
  const metrics = E.settlementRateMetrics({ price_per_km: 100, metadata: { simulation: { distance_km: 48.6, destination_latitude: 6.3, destination_longitude: -75.5, stops: [{ latitude: 6.2, longitude: -75.4 }, { label: 'Sin resolver' }] } } });
  assert.equal(metrics.distance_km, 48.6); assert.equal(metrics.stop_count, 2);
  assert.equal(E.settlementRateMetrics({ price_per_kg: 2500 }, { weight_kg: 20 }).weight_kg, 20);
  assert.throws(() => E.settlementRateMetrics({ price_per_km: 100 }), error => error.code === 'TMS_SETTLEMENT_RATE_METRIC_REQUIRED');
});
test('criterios enlazados preservan identidad y métricas, sin aceptar snapshots del navegador', () => {
  const normalized = E.normalizeChargeCriteria([row({ rate_card_id: 42, rate_version: 3, metrics: { distance_km: 15, admin: true }, rate_snapshot: { unit_amount: 1 } })])[0];
  assert.equal(normalized.rate_card_id, 42); assert.equal(normalized.rate_version, 3); assert.deepEqual(normalized.metrics, { distance_km: 15 }); assert.equal(normalized.rate_snapshot, undefined);
  for (const metrics of [{ distance_km: -1 }, { stop_count: .2 }, { weight_kg: Infinity }]) assert.throws(() => E.normalizeChargeCriteria([row({ rate_card_id: 42, metrics })]));
});
