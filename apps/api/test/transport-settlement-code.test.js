const test = require('node:test');
const assert = require('node:assert/strict');
const { nextSettlementPackageCode } = require('../src/modules/transport/settlement-engine');
test('inicia el consecutivo sin cambiar códigos históricos o personalizados', () => {
  assert.equal(nextSettlementPackageCode([]), 'LIQ-000001');
  assert.equal(nextSettlementPackageCode(['LIQ-2026-005', 'QA-LIQ-999999', 'HGGT']), 'LIQ-000001');
});
test('continúa desde el mayor número aunque los registros estén desordenados o cancelados', () => {
  assert.equal(nextSettlementPackageCode(['LIQ-000004', 'LIQ-000001', 'LIQ-000009']), 'LIQ-000010');
  assert.equal(nextSettlementPackageCode(['LIQ-9', 'LIQ-000009', 'liq-000010']), 'LIQ-000011');
});
test('continúa después de seis dígitos sin reiniciarse ni perder precisión', () => {
  assert.equal(nextSettlementPackageCode(['LIQ-999999']), 'LIQ-1000000');
  assert.equal(nextSettlementPackageCode(['LIQ-9007199254740992']), 'LIQ-9007199254740993');
});
test('el límite de longitud produce un error explícito', () => {
  assert.throws(() => nextSettlementPackageCode(['LIQ-' + '9'.repeat(36)]), error => error.code === 'TMS_SETTLEMENT_CODE_LIMIT');
});
