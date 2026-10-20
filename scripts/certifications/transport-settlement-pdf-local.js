const fs = require('node:fs');
module.exports = async function ({ base, token, packageId, draftId, foreignId, output, check, tenantId, vehicleId }) {
  const headers = { authorization: `Bearer ${token}` };
  const url = id => `${base}/transport/settlement-packages/${id}/invoice-pdf`;
  check('pdf_anonymous_denied', (await fetch(url(packageId))).status === 401);
  check('pdf_draft_denied', (await fetch(url(draftId), { headers })).status === 409);
  check('pdf_cross_tenant_denied', (await fetch(url(foreignId), { headers })).status === 404);
  async function post(path, body) {
    const response = await fetch(`${base}${path}`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await response.json();
    check(`pdf_fixture_${path.split('/').pop()}`, response.ok, { status: response.status }); return data;
  }
  const stamp = Date.now();
  const customer = await post('/sales/customers', { name: 'QA Cliente distribución regional', tax_id: `QA-PDF-${stamp}` });
  const points = [];
  for (let i = 1; i <= 2; i++) points.push(await post('/transport/delivery-points', { code: `QA-PDF-${stamp}-T${i}`, name: `QA Tienda ${i}`, city: i === 1 ? 'Medellín' : 'Rionegro', address: `Calle ${i} # 10-20`, customer_party_id: customer.id }));
  const rates = [];
  const metadata = { applies_to: 'flota_propia', vehicle_id: vehicleId, tariff_method: 'fijo', simulation: { origin_kind: 'custom', origin_label: 'Centro de distribución Medellín', origin_latitude: 6.2442, origin_longitude: -75.5812, destination_label: 'Tiendas Rionegro', destination_latitude: 6.153, destination_longitude: -75.374, distance_km: 48.6, duration_minutes: 72, source: 'manual', stops: [{ label: 'QA Tienda 1', latitude: 6.21, longitude: -75.5 }] } };
  for (let i = 0; i < 2; i++) rates.push(await post('/transport/rate-cards', { code: `QA-PDF-${stamp}-${i}`, name: i === 0 ? 'Ruta regional Medellín - Rionegro' : 'Ruta complementaria Rionegro', valid_from: '2020-01-01', valid_to: '2099-12-31', currency: 'COP', base_rate: i === 0 ? 500000 : 25000, status: 'activa', metadata }));
  const items = [];
  for (let i = 0; i < 2; i++) {
    const quote = await post('/transport/settlement-criterion-quote', { rate_card_id: rates[i].id, vehicle_id: vehicleId });
    items.push({ guide_reference: `QA-PDF-${stamp}-R${i}`, delivery_point_ids: i === 0 ? points.map(point => point.id) : [points[1].id], customer_id: customer.id, service_date: new Date().toISOString().slice(0, 10), charge_criteria: [{ ...quote, quantity: 1, support: `Planilla QA recorrido ${i + 1} confirmada` }] });
  }
  let pkg = await post('/transport/settlement-packages', { vehicle_id: vehicleId, items });
  for (const action of ['validate', 'precalculate', 'submit']) pkg = await post(`/transport/settlement-packages/${pkg.id}/${action}`, {});
  pkg = await post(`/transport/settlement-packages/${pkg.id}/decision`, { decision: 'aprobada' });
  pkg = await post(`/transport/settlement-packages/${pkg.id}/account`, { reference: `QA-PDF-${stamp}` });
  pkg = await post(`/transport/settlement-packages/${pkg.id}/close`, {});
  packageId = pkg.id;
  await post(`/transport/rate-cards/${rates[0].id}/versions`, { code: rates[0].code, name: 'Ruta cambiada después de liquidar', valid_from: '2020-01-01', valid_to: '2099-12-31', currency: 'COP', base_rate: 700000, status: 'activa', metadata });
  const report = await require('../../apps/api/src/modules/transport/settlement-report').settlementReportData(tenantId, packageId);
  check('pdf_uses_frozen_rate_after_new_version', Number(report.annexes[0].definition.base_rate) === 500000 && report.package.accounted_total === '525000');
  check('pdf_contains_all_routes_clients_and_stores', report.package.items.length === 2 && report.package.items[0].metadata.destination_snapshots.length === 2 && report.package.items[0].metadata.customer_snapshot.name === customer.name && report.annexes.length === 2);
  const response = await fetch(url(packageId), { headers, signal: AbortSignal.timeout(180000) });
  if (!response.ok) { const body = await response.text(); check('liquidated_pdf_generated', false, { status: response.status, body }); }
  const bytes = Buffer.from(await response.arrayBuffer());
  check('liquidated_pdf_generated', response.status === 200 && bytes.subarray(0, 5).toString() === '%PDF-' && bytes.length > 10000, { bytes: bytes.length });
  check('pdf_attachment_no_cache', response.headers.get('content-type').includes('application/pdf') && response.headers.get('content-disposition').includes('soporte-facturacion.pdf') && response.headers.get('cache-control') === 'no-store');
  fs.writeFileSync(output, bytes);
};
