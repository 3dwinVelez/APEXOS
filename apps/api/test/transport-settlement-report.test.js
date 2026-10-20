const test = require('node:test');
const assert = require('node:assert/strict');
let pkg, rateReads;
const db = {
  runWithTenant: async (tenant, work) => { assert.equal(tenant, 'company-a'); return work(); },
  transportSettlementPackage: { findFirst: async ({ where }) => { assert.equal(where.tenant_id, 'company-a'); return pkg; } },
  tenant: { findUnique: async () => ({ name: 'Empresa A' }) },
  transportRateCard: { findFirst: async ({ where }) => { rateReads.push(where); return null; } }
};
const prismaPath = require.resolve('../src/core/prisma');
require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: db };
const { settlementReportData } = require('../src/modules/transport/settlement-report');
const criterion = () => ({ concept: 'Ruta', rate_card_id: 7, rate_version: 1, quantity: 1, unit_value: 500000, rate_snapshot: { metrics: { distance_km: 48.6 }, definition: { id: 7, version: 1, code: 'RUTA-01', base_rate: 500000 } } });

test('solo permite el formato de una liquidacion liquidada de la empresa autenticada', async () => {
  await assert.rejects(() => settlementReportData(null, 1), error => error.statusCode === 401);
  for (const id of ['invalid', -1, 0, 1.5, Infinity]) await assert.rejects(() => settlementReportData('company-a', id), error => error.statusCode === 400);
  pkg = null;
  await assert.rejects(() => settlementReportData('company-a', 1), error => error.statusCode === 404);
  for (const status of ['borrador', 'aprobada', 'contabilizada', 'reversada']) {
    pkg = { status };
    await assert.rejects(() => settlementReportData('company-a', 1), error => error.statusCode === 409);
  }
});
test('preserva valores y definicion congelada; deduplica anexos sin leer el tarifario actual', async () => {
  rateReads = [];
  pkg = { status: 'liquidada', code: 'LIQ-000001', items: [1, 2].map(id => ({ id, metadata: { charge_criteria: [criterion()] } })) };
  const report = await settlementReportData('company-a', 1);
  assert.equal(report.annexes.length, 1);
  assert.equal(report.annexes[0].definition.base_rate, 500000);
  assert.equal(report.package.items[0].criteria[0].annex_id, report.package.items[1].criteria[0].annex_id);
  assert.deepEqual(rateReads, []);
});
test('un historico incompleto consulta solo su version y empresa y no inventa una captura', async () => {
  rateReads = [];
  pkg = { status: 'liquidada', items: [{ id: 1, metadata: { charge_criteria: [{ ...criterion(), rate_snapshot: {} }] } }] };
  const report = await settlementReportData('company-a', 1);
  assert.equal(report.annexes[0].definition, null);
  assert.match(report.annexes[0].provenance, /no está disponible/);
  assert.deepEqual(rateReads, [{ tenant_id: 'company-a', id: 7, version: 1 }]);
});

test('un historico usa su respaldo en metadata y conserva el valor unitario por cantidad', async () => {
  rateReads = [];
  pkg = { status: 'liquidada', items: [{ id: 3, rate_card_id: 7, rate_version: 1, quantity: 2, calculated_amount: 1000000, metadata: { report_rate_snapshot: { definition: criterion().rate_snapshot.definition, freeze_stage: 'liquidation' } } }] };
  const report = await settlementReportData('company-a', 1);
  assert.equal(report.package.items[0].criteria[0].unit_value, 500000);
  assert.equal(report.annexes[0].definition.base_rate, 500000);
  assert.match(report.annexes[0].provenance, /al liquidar/);
  assert.deepEqual(rateReads, []);
});
