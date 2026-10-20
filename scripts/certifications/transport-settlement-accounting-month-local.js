module.exports = async function ({ request, check, vehicle, items, code, tenantId }) {
  const service = require('../../apps/api/src/modules/transport/settlement-service');
  const pyg = require('../../apps/api/src/modules/transport-pyg/service');
  const month = service.currentAccountingMonth();
  const oldMonth = '2020-01';
  const before = await pyg.getReport(tenantId, { period: month });
  const oldBefore = await pyg.getReport(tenantId, { period: oldMonth });
  const created = await request('/transport/settlement-packages', 'POST', { vehicle_id: vehicle.id, period_id: 2147483647, type_code: 'CAJA_MENOR', metadata: { accounting_period: oldMonth }, items: [{ ...items[0], guide_reference: `${code}-MONTH`, service_date: '2020-01-15', route_description: 'RUTA ADULTERADA' }] });
  check('month_assigned_by_server_and_type_not_selectable', created.status === 201 && created.body.metadata.accounting_period === month && created.body.period.code === month && created.body.type_code === 'TRANSPORTADOR', { status: created.status });
  let pkg = created.body;
  check('route_description_comes_from_tariff', pkg.items[0].route_description !== 'RUTA ADULTERADA' && Boolean(pkg.items[0].route_description));
  check('period_change_denied', (await request(`/transport/settlement-packages/${pkg.id}`, 'PATCH', { version: pkg.version, period_id: 2147483647 })).status === 409);
  for (const action of ['validate', 'precalculate']) {
    const result = await request(`/transport/settlement-packages/${pkg.id}/${action}`, 'POST', {}); check(`month_fixture_${action}`, result.status === 200); pkg = result.body;
  }
  check('manual_adjustment_of_tariff_denied', (await request(`/transport/settlement-packages/${pkg.id}/adjustments`, 'POST', { version: pkg.version, item_id: pkg.items[0].id, delta: 1, reason: 'Intento de modificar tarifa' })).status === 409);
  await request(`/transport/settlement-packages/${pkg.id}/submit`, 'POST', {});
  const approved = await request(`/transport/settlement-packages/${pkg.id}/decision`, 'POST', { decision: 'aprobada' });
  check('monthly_fixture_approved', approved.status === 200);
  const after = await pyg.getReport(tenantId, { period: month });
  const oldAfter = await pyg.getReport(tenantId, { period: oldMonth });
  check('pyg_current_month_includes_package_despite_other_service_month', Math.round((after.corporate.income_actual - before.corporate.income_actual) * 100) === Math.round(approved.body.approved_total * 100));
  check('pyg_service_month_not_affected', oldAfter.corporate.income_actual === oldBefore.corporate.income_actual);
  check('accounting_month_cannot_be_overridden', (await request(`/transport/settlement-packages/${pkg.id}/account`, 'POST', { reference: `${code}-MONTH`, accounting_period: oldMonth })).status === 409);
  const account = await request(`/transport/settlement-packages/${pkg.id}/account`, 'POST', { reference: `${code}-MONTH` });
  check('accounting_uses_assigned_month', account.status === 200 && account.body.accounting.accounting_period === month);
};
