const prisma = require('../../core/prisma');
const { fail } = require('./settlement-engine');

async function settlementReportData(tenantId, id) {
  if (!tenantId) fail(401, 'TMS_TENANT_REQUIRED', 'Empresa requerida.');
  if (!Number.isSafeInteger(Number(id)) || Number(id) <= 0) fail(400, 'TMS_SETTLEMENT_ID_INVALID', 'Liquidación inválida.');
  return prisma.runWithTenant(tenantId, async () => {
    const pkg = await prisma.transportSettlementPackage.findFirst({ where: { id: Number(id), tenant_id: String(tenantId) }, include: { items: { orderBy: { id: 'asc' } }, accountings: true, adjustments: true, period: true } });
    if (!pkg) fail(404, 'TMS_SETTLEMENT_NOT_FOUND', 'La liquidación no existe en la empresa.');
    if (pkg.status !== 'liquidada') fail(409, 'TMS_SETTLEMENT_PDF_NOT_LIQUIDATED', 'El formato para facturar está disponible cuando la liquidación está liquidada.');
    const company = await prisma.tenant.findUnique({ where: { id: String(tenantId) }, select: { name: true, tax_id: true, country: true } });
    const annexes = [];
    const byKey = new Map();
    const items = [];
    for (const item of pkg.items) {
      const criteria = [];
      const entries = item.metadata?.charge_criteria || [{ concept: item.rate_code || 'Flete histórico', rate_card_id: item.rate_card_id, rate_version: item.rate_version, rate_snapshot: item.metadata?.report_rate_snapshot || item.calculation_trace?.snapshot, quantity: Number(item.quantity), unit_value: Number(item.rate_unit_value ?? (Number(item.calculated_amount) / (Number(item.quantity) || 1))), support: item.observation || '' }];
      for (const entry of entries) {
        const snapshot = entry.rate_snapshot || {};
        const key = `${entry.rate_card_id || snapshot.rate_card_id}:${entry.rate_version || snapshot.rate_version}:${JSON.stringify(snapshot.metrics || {})}`;
        let annex = byKey.get(key);
        if (!annex) {
          let definition = snapshot.definition;
          if (!definition && (entry.rate_card_id || snapshot.rate_card_id)) definition = await prisma.transportRateCard.findFirst({ where: { tenant_id: String(tenantId), id: Number(entry.rate_card_id || snapshot.rate_card_id), version: Number(entry.rate_version || snapshot.rate_version || 1) } });
          annex = { id: `A${annexes.length + 1}`, code: entry.rate_code || snapshot.rate_code || item.rate_code || 'Histórico', version: entry.rate_version || snapshot.rate_version || item.rate_version, unit_value: Number(entry.unit_value || 0), metrics: snapshot.metrics || entry.metrics || {}, definition: definition ? JSON.parse(JSON.stringify(definition)) : null, provenance: snapshot.definition ? (snapshot.freeze_stage === 'liquidation' ? 'Versión conservada al liquidar el paquete' : 'Versión conservada al asignar el tarifario') : definition ? 'Versión original disponible en el maestro' : 'La versión histórica completa no está disponible; se conservan únicamente los valores liquidados.' };
          byKey.set(key, annex); annexes.push(annex);
        }
        criteria.push({ ...entry, annex_id: annex.id });
      }
      items.push({ ...item, criteria });
    }
    return JSON.parse(JSON.stringify({ company, package: { ...pkg, items }, annexes }));
  });
}

module.exports = { settlementReportData };
