// Flujo real invocado por la certificacion local de cuatro etapas.
module.exports = async function ({ request, check, vehicle, items, code }) {
  const customer = await request('/sales/customers', 'POST', { name: `QA Cliente liquidacion ${code}`, tax_id: `${code}-CUSTOMER` });
  check('customer_created_in_sales_master', customer.status === 201);
  const catalog = await request('/transport/settlement-customers');
  check('same_sales_customer_in_transport', catalog.status === 200 && catalog.body.some(row => row.id === customer.body.id));
  const carrier = await request('/transport/carriers', 'POST', { code: `${code}-LEGACY`, legal_name: 'QA historico sin vehiculo' });
  const legacy = await request('/transport/settlement-packages', 'POST', { carrier_id: carrier.body.id });
  check('legacy_package_has_no_vehicle', legacy.status === 201 && !legacy.body.metadata?.vehicle_id);
  const body = { version: legacy.body.version, vehicle_id: vehicle.id, items: [{ ...items[0], guide_reference: `${code}-EDIT`, customer_id: customer.body.id, service: 'Nombre falsificado' }] };
  const invalid = await request(`/transport/settlement-packages/${legacy.body.id}/documents`, 'PUT', { ...body, items: [{ ...body.items[0], customer_id: 2147483647 }] });
  check('unknown_customer_rejected', invalid.status === 422);
  const unchanged = await request(`/transport/settlement-packages/${legacy.body.id}`);
  check('failed_conversion_rolls_back_vehicle_and_items', !unchanged.body.metadata?.vehicle_id && unchanged.body.items.length === 0);
  const db = require('../../apps/api/src/core/prisma');
  const tenant = await db.tenant.create({ data: { name: `QA cliente aislado ${code}` } });
  const foreign = await db.runWithTenant(tenant.id, async () => await db.party.create({ data: { tenant_id: tenant.id, name: 'QA cliente otra empresa', type: 'customer', active: true } }));
  check('cross_tenant_customer_rejected', (await request(`/transport/settlement-packages/${legacy.body.id}/documents`, 'PUT', { ...body, items: [{ ...body.items[0], customer_id: foreign.id }] })).status === 422);
  const saved = await request(`/transport/settlement-packages/${legacy.body.id}/documents`, 'PUT', body);
  check('legacy_converted_with_vehicle_customer_tariff_support', saved.status === 200 && saved.body.metadata.vehicle_id === vehicle.id && saved.body.items[0].service === customer.body.name && saved.body.items[0].metadata.customer_id === customer.body.id && saved.body.adjusted_total === 109000, { status: saved.status, error: saved.status !== 200 ? saved.body : undefined });
  const item = saved.body.items[0];
  const edited = { ...body, version: saved.body.version, items: [{ ...body.items[0], id: item.id, charge_criteria: body.items[0].charge_criteria.map(row => ({ ...row, quantity: 2, support: 'Soporte corregido del documento' })) }] };
  check('stale_edit_denied', (await request(`/transport/settlement-packages/${legacy.body.id}/documents`, 'PUT', { ...edited, version: body.version })).status === 409);
  check('missing_customer_on_edit_denied', (await request(`/transport/settlement-packages/${legacy.body.id}/documents`, 'PUT', { ...edited, items: [{ ...edited.items[0], customer_id: undefined }] })).status === 400);
  const changed = await request(`/transport/settlement-packages/${legacy.body.id}/documents`, 'PUT', edited);
  check('existing_document_updated_without_duplicate', changed.status === 200 && changed.body.items.length === 1 && changed.body.items[0].id === item.id && changed.body.adjusted_total === 194000);
  const reopened = await request(`/transport/settlement-packages/${legacy.body.id}`);
  check('reopened_customer_and_corrected_support', reopened.body.items[0].metadata.customer_id === customer.body.id && reopened.body.items[0].metadata.charge_criteria[0].support === 'Soporte corregido del documento');
  for (const action of ['validate', 'precalculate', 'submit']) {
    const result = await request(`/transport/settlement-packages/${legacy.body.id}/${action}`, 'POST', {});
    check(`edited_legacy_${action}`, result.status === 200);
  }
  check('edited_legacy_approved', (await request(`/transport/settlement-packages/${legacy.body.id}/decision`, 'POST', { decision: 'aprobada' })).status === 200);
  check('approved_document_edit_denied', (await request(`/transport/settlement-packages/${legacy.body.id}/documents`, 'PUT', { ...edited, version: changed.body.version })).status === 409);
  const audit = await request(`/transport/settlement-packages/${legacy.body.id}/audit`);
  check('document_change_audited', audit.body.timeline.some(row => row.action === 'transport.settlement_package.documents_updated'));
};
