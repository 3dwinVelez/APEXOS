// Certificacion HTTP real; invocada por el flujo local de cuatro etapas.
module.exports = async function ({ request, check, vehicle, items, code }) {
  const customer = await request('/sales/customers', 'POST', { name: `QA destinos ${code}`, tax_id: `${code}-DEST-CUSTOMER` });
  check('destination_customer_created', customer.status === 201);
  const points = [];
  for (let i = 1; i <= 3; i++) {
    const point = await request('/transport/delivery-points', 'POST', { code: `${code}-T${i}`, name: `QA Tienda ${i}`, address: `Calle ${i}`, city: 'Medellin', customer_party_id: customer.body.id });
    check(`store_${i}_created_in_master`, point.status === 201); points.push(point.body);
  }
  const catalog = await request('/transport/settlement-destinations');
  check('three_stores_available_in_package_catalog', points.every(point => catalog.body.some(row => row.id === point.id)));
  const body = { vehicle_id: vehicle.id, items: points.map(point => ({ delivery_point_id: point.id, charge_criteria: items[0].charge_criteria })) };
  const result = await request('/transport/settlement-packages', 'POST', body);
  check('package_covers_three_stores_without_documents', result.status === 201 && result.body.items.length === 3 && result.body.adjusted_total === 327000, { status: result.status, error: result.status !== 201 ? result.body : undefined });
  check('destination_and_customer_snapshots_are_authoritative', result.body.items.every((item, i) => item.metadata.destination_snapshot.name === points[i].name && item.metadata.customer_id === customer.body.id && Boolean(item.guide_reference)));
  const grouped = await request('/transport/settlement-packages', 'POST', { vehicle_id: vehicle.id, items: [{ delivery_point_ids: points.map(point => point.id), charge_criteria: items[0].charge_criteria }] });
  check('three_informative_stores_one_route_charge', grouped.status === 201 && grouped.body.items.length === 1 && grouped.body.adjusted_total === 109000 && grouped.body.items[0].metadata.destination_snapshots.length === 3);
  const route = grouped.body.items[0];
  const reduced = await request(`/transport/settlement-packages/${grouped.body.id}/documents`, 'PUT', { version: grouped.body.version, vehicle_id: vehicle.id, items: [{ id: route.id, guide_reference: route.guide_reference, delivery_point_ids: [points[1].id], charge_criteria: items[0].charge_criteria }] });
  check('reducing_stores_keeps_route_price', reduced.status === 200 && reduced.body.adjusted_total === 109000 && reduced.body.items[0].metadata.destination_snapshots.length === 1);
  const restored = await request(`/transport/settlement-packages/${grouped.body.id}/documents`, 'PUT', { version: reduced.body.version, vehicle_id: vehicle.id, items: [{ id: route.id, guide_reference: route.guide_reference, delivery_point_ids: points.map(point => point.id), charge_criteria: items[0].charge_criteria }] });
  check('adding_stores_keeps_route_price', restored.status === 200 && restored.body.adjusted_total === 109000);
  const groupedReload = await request(`/transport/settlement-packages/${grouped.body.id}`);
  check('multiple_stores_persist_after_reopen', groupedReload.body.items[0].metadata.delivery_point_ids.length === 3);
  const invalid = await request('/transport/settlement-packages', 'POST', { ...body, items: [{ ...body.items[0], delivery_point_id: 2147483647 }] });
  check('unknown_destination_denied', invalid.status === 422);
  const db = require('../../apps/api/src/core/prisma');
  const tenant = await db.tenant.create({ data: { name: `QA destino aislado ${code}` } });
  const foreign = await db.runWithTenant(tenant.id, async () => await db.transportDeliveryPoint.create({ data: { tenant_id: tenant.id, code: 'FOREIGN', name: 'Otra empresa', address: 'Calle 1', city: 'Medellin' } }));
  check('cross_tenant_destination_denied', (await request('/transport/settlement-packages', 'POST', { ...body, items: [{ ...body.items[0], delivery_point_id: foreign.id }] })).status === 422);
  await request(`/transport/delivery-points/${points[0].id}`, 'PUT', { ...points[0], active: false });
  check('inactive_destination_denied', (await request('/transport/settlement-packages', 'POST', { ...body, items: [body.items[0]] })).status === 422);
  const reopened = await request(`/transport/settlement-packages/${result.body.id}`);
  check('historical_destination_snapshot_preserved', reopened.body.items[0].metadata.destination_snapshot.name === 'QA Tienda 1');
};
