// Certificación real de desarrollo: documentos completos en una transacción y cuatro etapas.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
require('../load-env')(path.resolve('.env'));
if (!['localhost', '127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname)) throw Error('Solo base local');
process.env.DISABLE_REDIS = 'true';
const output = process.argv[2];
if (!output) throw Error('Indique archivo externo de evidencia');
const evidence = { environment: 'LOCAL_DESARROLLO', commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), working_tree: true, checks: [], status: 'running' };
let token, app;
const base = 'http://127.0.0.1:3218/api/v1';
async function request(route, method = 'GET', body, anonymous = false) {
  const response = await fetch(base + route, { method, signal: AbortSignal.timeout(30000), headers: { 'content-type': 'application/json', ...(!anonymous && token ? { authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, body: await response.json() };
}
function check(name, ok, detail = {}) { evidence.checks.push({ name, status: ok ? 'passed' : 'failed', detail }); if (!ok) throw Error(name); }
(async () => {
  try {
    app = await require('../../apps/api/server')(); await app.listen({ port: 3218, host: '127.0.0.1' });
    check('anonymous_denied', (await request('/transport/settlement-packages', 'GET', null, true)).status === 401);
    check('tariff_catalog_requires_auth', (await request('/transport/settlement-rate-options', 'GET', null, true)).status === 401);
    check('tariff_quote_requires_auth', (await request('/transport/settlement-criterion-quote', 'POST', { rate_card_id: 1 }, true)).status === 401);
    const login = await request('/auth/login', 'POST', { email: process.env.LOCAL_TMS_EMAIL || 'demo@apex.local', password: process.env.LOCAL_TMS_PASSWORD || 'test1234' });
    check('local_login', login.status === 200 && Boolean(login.body.token)); token = login.body.token;
    const vehicles = await request('/transport/vehicles?limit=200');
    const vehicle = vehicles.body.find(v => !['inactivo', 'retirado', 'bloqueado'].includes(v.status));
    check('existing_vehicle_master', Boolean(vehicle)); evidence.vehicle_plate = vehicle.plate;
    const code = `QA-LIQ4-${Date.now()}`; evidence.code = code;
    const rateIds = {};
    for (const [concept, amount] of [["Flete", 85000], ["Peajes", 12000], ["Espera", 5000]]) {
      const rate = await request('/transport/rate-cards', 'POST', { code: `${code}-${concept}`, name: `Flete parametrizado ${concept}`, valid_from: '2020-01-01', valid_to: '2099-12-31', currency: 'COP', base_rate: amount, status: 'activa', metadata: { applies_to: 'flota_propia', vehicle_id: vehicle.id } });
      check('configured_rate_' + concept, rate.status === 201, { status: rate.status }); rateIds[concept] = rate.body.id;
    }
    evidence.rate_ids = rateIds;
    const criterion = (concept, quantity, unit_value, support) => ({ concept, quantity, unit_value, support, rate_card_id: rateIds[concept === 'Flete' || concept === 'Peajes' ? concept : 'Espera'], rate_version: 1 });
    const items = [
      { guide_reference: `${code}-A`, vehicle_plate: 'FALSE', charge_criteria: [criterion('Flete', 1, 85000, 'Remesa A firmada'), criterion('Peajes', 2, 12000, 'Comprobantes de peajes A')] },
      { guide_reference: `${code}-B`, charge_criteria: [criterion('Espera', 3, 5000, 'Acta B: tres horas')] }
    ];
    const payload = { vehicle_id: vehicle.id, type_code: 'TRANSPORTADOR', items, metadata: { cost_center: 'FALSE', vehicle_id: 99999999 } };
    await require('./transport-settlement-accounting-month-local')({ request, check, vehicle, items, code, tenantId: login.body.user.tenant_id });
    await require('./transport-settlement-destinations-local')({ request, check, vehicle, items, code });
    await require('./transport-settlement-documents-local')({ request, check, vehicle, items, code });
    const beforeInvalid = await request('/transport/settlement-packages?limit=300');
    const invalid = await request('/transport/settlement-packages', 'POST', { ...payload, code: code + '-BAD', items: [items[0], { ...items[1], charge_criteria: [criterion('Flete', 1, 50, ' ')] }] });
    check('invalid_second_document_rejected', invalid.status === 400, { status: invalid.status });
    const listAfterInvalid = await request('/transport/settlement-packages?limit=300');
    check('atomic_rollback_no_empty_package', listAfterInvalid.body.length === beforeInvalid.body.length);
    check('empty_vehicle_package_rejected', (await request('/transport/settlement-packages', 'POST', { code: code + '-EMPTY', vehicle_id: vehicle.id })).status === 400);
    const created = await request('/transport/settlement-packages', 'POST', payload); let pkg = created.body;
    check('created_complete', created.status === 201 && pkg.items?.length === 2 && pkg.status === 'borrador' && pkg.adjusted_total === 124000, { status: created.status, total: pkg.adjusted_total, error: created.status !== 201 ? pkg : undefined });
    evidence.package_id = pkg.id; evidence.package_code = pkg.code;
    check('code_generated_without_client_input', /^LIQ-\d{6,}$/.test(pkg.code));
    check('failed_creation_does_not_consume_consecutive', pkg.code === require('../../apps/api/src/modules/transport/settlement-engine').nextSettlementPackageCode(beforeInvalid.body.map(p => p.code)));
    check('vehicle_and_cost_center_server_authority', pkg.carrier_id === null && pkg.metadata.vehicle_id === vehicle.id && pkg.metadata.cost_center === vehicle.plate && pkg.items.every(item => item.vehicle_plate === vehicle.plate));
    check('support_preserved', pkg.items[0].metadata.charge_criteria[1].support === 'Comprobantes de peajes A');
    check('tariff_snapshot_frozen', pkg.items[0].metadata.charge_criteria[0].rate_snapshot.unit_amount === 85000 && pkg.items[0].metadata.charge_criteria[0].rate_card_id === rateIds.Flete);
    const catalog = await request(`/transport/settlement-rate-options?vehicle_id=${vehicle.id}&currency=COP`);
    check('catalog_from_configured_rates', catalog.status === 200 && catalog.body.some(r => r.id === rateIds.Flete && r.unit_amount === 85000));
    const fake = await request('/transport/settlement-packages', 'POST', { ...payload, code: code + '-FAKE', items: [{ ...items[0], guide_reference: code + '-FAKE-DOC', charge_criteria: [{ ...items[0].charge_criteria[0], unit_value: 1 }] }] });
    check('forged_manual_price_rejected', fake.status === 409 && fake.body.code === 'TMS_SETTLEMENT_SELECTED_RATE_PRICE_CHANGED');
    const manual = await request('/transport/settlement-packages', 'POST', { ...payload, code: code + '-MANUAL', items: [{ guide_reference: code + '-MAN-DOC', charge_criteria: [{ concept: 'Flete libre', quantity: 1, unit_value: 1, support: 'fake' }] }] });
    check('free_freight_not_allowed', manual.status === 400);
    const composite = await request('/transport/rate-cards', 'POST', { code: code + '-COMP', name: 'Flete con adicionales', valid_from: '2020-01-01', valid_to: '2099-12-31', currency: 'COP', base_rate: 85000, price_per_stop: 12000, status: 'activa', metadata: { applies_to: 'flota_propia', vehicle_id: vehicle.id, stops_included: 1, simulation: { distance_km: 48.6, destination_latitude: 6.3, destination_longitude: -75.5, stops: [{ latitude: 6.2, longitude: -75.4 }, { latitude: 6.25, longitude: -75.45 }] } } });
    check('composite_rate_created', composite.status === 201); evidence.composite_rate_id = composite.body.id;
    const quote = await request('/transport/settlement-criterion-quote', 'POST', { rate_card_id: composite.body.id, vehicle_id: vehicle.id });
    check('configured_extras_automatically_included', quote.status === 200 && quote.body.unit_value === 109000 && quote.body.metrics.stop_count === 3);
    const otherVehicle = vehicles.body.find(v => v.id !== vehicle.id && !['inactivo', 'retirado', 'bloqueado'].includes(v.status));
    check('vehicle_bound_tariff_rejects_other_plate', Boolean(otherVehicle) && (await request('/transport/settlement-criterion-quote', 'POST', { rate_card_id: composite.body.id, vehicle_id: otherVehicle.id })).status === 422);
    for (const [unit, field, price, amount, expected] of [['km', 'distance_km', 2000, 12, 24000], ['kg', 'weight_kg', 2500, 20, 50000], ['m3', 'volume_m3', 3000, 4, 12000]]) {
      const variable = await request('/transport/rate-cards', 'POST', { code: code + '-' + unit, name: 'Flete por ' + unit, valid_from: '2020-01-01', valid_to: '2099-12-31', currency: 'COP', status: 'activa', ['price_per_' + unit]: price, metadata: { applies_to: 'flota_propia', vehicle_id: vehicle.id } });
      const measured = await request('/transport/settlement-criterion-quote', 'POST', { rate_card_id: variable.body.id, vehicle_id: vehicle.id, metrics: { [field]: amount } });
      check('configured_price_per_' + unit, variable.status === 201 && measured.status === 200 && measured.body.unit_value === expected);
    }
    const expired = await request('/transport/settlement-criterion-quote', 'POST', { rate_card_id: composite.body.id, vehicle_id: vehicle.id, service_date: '1900-01-01' });
    check('expired_rate_rejected', expired.status === 422);
    const foreign = await request('/transport/settlement-criterion-quote', 'POST', { rate_card_id: 2147483647, vehicle_id: vehicle.id });
    check('unknown_rate_not_quoted', foreign.status === 422);
    check('currency_mismatch_rejected', (await request('/transport/settlement-criterion-quote', 'POST', { rate_card_id: composite.body.id, vehicle_id: vehicle.id, currency: 'USD' })).status === 422);
    check('stale_tariff_version_rejected', (await request('/transport/settlement-criterion-quote', 'POST', { rate_card_id: composite.body.id, vehicle_id: vehicle.id, rate_version: 999 })).status === 409);
    try { await require('../../apps/api/src/modules/transport/settlement-service').quoteSettlementCriterion('qa-unrelated-company', { rate_card_id: composite.body.id }); check('cross_tenant_tariff_denied', false); }
    catch (error) { check('cross_tenant_tariff_denied', error.code === 'TMS_SETTLEMENT_SELECTED_RATE_UNAVAILABLE'); }
    const duplicate = await request('/transport/settlement-packages', 'POST', { ...payload, code: code + '-DUP', authorize_duplicate: true });
    check('duplicate_document_other_package_denied', duplicate.status === 409);
    const changed = await request(`/transport/rate-cards/${rateIds.Flete}/versions`, 'POST', { code: `${code}-Flete`, name: 'Flete actualizado después de asignar', valid_from: '2020-01-01', valid_to: '2099-12-31', currency: 'COP', base_rate: 99000, status: 'activa', metadata: { applies_to: 'flota_propia', vehicle_id: vehicle.id } });
    check('new_tariff_version_after_assignment', changed.status === 201 && changed.body.version === 2);
    const service = require('../../apps/api/src/modules/transport/settlement-service');
    try { await service.createSettlementPackage('qa-unrelated-company', { id: null }, { ...payload, code: code + '-CROSS' }); check('cross_tenant_vehicle_denied', false); }
    catch (error) { check('cross_tenant_vehicle_denied', error.code === 'TMS_SETTLEMENT_VEHICLE_NOT_FOUND'); }
    check('approval_cannot_skip_validation', (await request(`/transport/settlement-packages/${pkg.id}/decision`, 'POST', { decision: 'aprobada', version: pkg.version })).status === 409);
    check('stale_version_rejected', (await request(`/transport/settlement-packages/${pkg.id}/validate`, 'POST', { version: pkg.version + 999 })).status === 409);
    for (const action of ['validate', 'precalculate', 'submit']) {
      const response = await request(`/transport/settlement-packages/${pkg.id}/${action}`, 'POST', { version: pkg.version });
      check(action, response.status === 200, { status: response.status }); pkg = response.body;
    }
    const approval = await request(`/transport/settlement-packages/${pkg.id}/decision`, 'POST', { decision: 'aprobada', version: pkg.version }); pkg = approval.body;
    check('approved', approval.status === 200 && pkg.status === 'aprobada' && pkg.approved_total === 124000);
    check('assigned_snapshot_survives_new_tariff_version', pkg.items[0].metadata.charge_criteria[0].unit_value === 85000 && pkg.items[0].metadata.charge_criteria[0].rate_snapshot.unit_amount === 85000);
    check('approved_immutable', (await request(`/transport/settlement-packages/${pkg.id}/items`, 'POST', { items: [{ ...items[0], guide_reference: code + '-AFTER' }] })).status === 409);
    check('account_reference_required', (await request(`/transport/settlement-packages/${pkg.id}/account`, 'POST', { version: pkg.version })).status === 400);
    const account = { reference: code + '-CNT', accounting_period: '2026-10', version: pkg.version };
    const accounting = await request(`/transport/settlement-packages/${pkg.id}/account`, 'POST', account); pkg = accounting.body;
    check('accounted', accounting.status === 200 && pkg.status === 'contabilizada' && pkg.accounted_total === 124000);
    const replay = await request(`/transport/settlement-packages/${pkg.id}/account`, 'POST', account);
    check('accounting_idempotent', replay.body.idempotent_replay === true && replay.body.accountings.length === 1);
    const other = await request('/transport/settlement-packages', 'POST', { ...payload, code: code + '-KEY', items: [{ ...items[1], guide_reference: code + '-KEY-DOC' }] });
    check('accounting_key_cannot_replay_other_package', other.status === 201 && (await request(`/transport/settlement-packages/${other.body.id}/account`, 'POST', { reference: 'synthetic', idempotency_key: replay.body.accounting.idempotency_key })).status === 409);
    const issue = await request(`/transport/settlement-packages/${pkg.id}/issues`, 'POST', { category: 'soporte', description: 'Verificación sintética antes del cierre', blocking: true });
    check('blocking_issue_prevents_liquidation', issue.status === 201 && (await request(`/transport/settlement-packages/${pkg.id}/close`, 'POST', { version: pkg.version })).status === 409);
    check('issue_resolved_before_liquidation', (await request(`/transport/settlement-issues/${issue.body.id}/resolve`, 'POST', { resolution: 'Soporte sintético verificado' })).status === 200);
    const closed = await request(`/transport/settlement-packages/${pkg.id}/close`, 'POST', { version: pkg.version }); pkg = closed.body;
    check('liquidated', closed.status === 200 && pkg.status === 'liquidada');
    const reopened = await request(`/transport/settlement-packages/${pkg.id}`);
    check('reopened_support_and_totals', reopened.body.items[1].metadata.charge_criteria[0].support === 'Acta B: tres horas' && reopened.body.accounted_total === 124000);
    const audit = await request(`/transport/settlement-packages/${pkg.id}/audit`);
    check('four_stages_audited', ['created', 'aprobada', 'accounted', 'liquidada'].every(action => audit.body.timeline.some(e => e.action === 'transport.settlement_package.' + action)));
    const inactive = await request(`/transport/rate-cards/${changed.body.id}/deactivate`, 'POST', {});
    check('inactive_rate_rejected', inactive.status === 200 && (await request('/transport/settlement-criterion-quote', 'POST', { rate_card_id: changed.body.id, vehicle_id: vehicle.id })).status === 422);
    const parallel = await Promise.all([1, 2].map(i => request('/transport/settlement-packages', 'POST', { vehicle_id: vehicle.id, code: 'MANUAL-NOT-ALLOWED', items: [{ guide_reference: `${code}-CONCURRENT-${i}`, charge_criteria: [criterion('Espera', 1, 5000, 'Soporte concurrencia')] }] })));
    const numbers = parallel.map(r => BigInt(String(r.body.code).replace('LIQ-', ''))).sort((a, b) => a < b ? -1 : 1);
    check('concurrent_creators_get_distinct_incremental_codes', parallel.every(r => r.status === 201) && numbers[1] === numbers[0] + 1n, { codes: parallel.map(r => r.body.code) });
    check('manual_code_does_not_override_sequence', parallel.every(r => r.body.code !== 'MANUAL-NOT-ALLOWED' && /^LIQ-\d{6,}$/.test(r.body.code)));
    const db = require('../../apps/api/src/core/prisma');
    const tenant = await db.tenant.create({ data: { name: `QA consecutivo ${code}` } });
    const ownCarrier = await db.runWithTenant(tenant.id, async () => await db.transportCarrier.create({ data: { tenant_id: tenant.id, code: 'QA-CODE', legal_name: 'Transportador sintético de consecutivo' } }));
    const firstOwn = await service.createSettlementPackage(tenant.id, null, { carrier_id: ownCarrier.id });
    const secondOwn = await service.createSettlementPackage(tenant.id, null, { carrier_id: ownCarrier.id });
    check('independent_sequence_per_tenant', firstOwn.code === 'LIQ-000001' && secondOwn.code === 'LIQ-000002'); evidence.sequence_fixture_tenant = tenant.id;
    await require('./transport-settlement-pdf-local')({ base, token, tenantId: login.body.user.tenant_id, vehicleId: vehicle.id, packageId: pkg.id, draftId: parallel[0].body.id, foreignId: firstOwn.id, output: output.replace(/\.json$/, '.pdf'), check });
    evidence.status = 'passed';
  } catch (error) { evidence.status = 'failed'; evidence.error = error.message; process.exitCode = 1; }
  finally { if (app) await app.close(); fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true }); fs.writeFileSync(output, JSON.stringify(evidence, null, 2)); console.log(JSON.stringify(evidence, null, 2)); await require('../../apps/api/src/core/prisma').$disconnect(); }
})();
