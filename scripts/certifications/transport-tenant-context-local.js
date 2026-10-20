const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
require('../load-env')(path.resolve('.env'));
if (!['localhost', '127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname)) throw Error('Solo base local');
process.env.DISABLE_REDIS = 'true';
const db = require('../../apps/api/src/core/prisma');
const service = require('../../apps/api/src/modules/transport/settlement-service');
const tms = require('../../apps/api/src/modules/transport/tms-service');
const result = { status: 'running', environment: 'LOCAL', commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), checks: [] };
const check = (name, ok) => { result.checks.push({ name, status: ok ? 'passed' : 'failed' }); if (!ok) throw Error(name); };
(async () => {
  try {
    const fixtures = [];
    for (const label of ['A', 'B']) {
      const tenant = await db.tenant.create({ data: { name: `QA aislamiento ${label} ${Date.now()}` } });
      const carrier = await db.runWithTenant(tenant.id, () => db.transportCarrier.create({ data: { code: 'QA-ISOLATION', legal_name: `QA transportador ${label}` } }));
      const pkg = await service.createSettlementPackage(tenant.id, null, { carrier_id: carrier.id });
      const period = await service.saveSettlementPeriod(tenant.id, null, null, { code: 'QA-ISOLATION', start_date: '2026-10-01', end_date: '2026-10-31' });
      fixtures.push({ tenant, pkg, period, carrier });
    }
    for (const [index, own] of fixtures.entries()) {
      const other = fixtures[1 - index];
      const [packages, periods, carriers] = await Promise.all([service.listSettlementPackages(own.tenant.id), service.listSettlementPeriods(own.tenant.id), tms.listCarriers(own.tenant.id)]);
      check(`tenant_${index}_package_list_only_own`, packages.length === 1 && packages[0].id === own.pkg.id && packages.every(row => row.tenant_id === own.tenant.id));
      check(`tenant_${index}_period_list_only_own`, periods.length === 1 && periods[0].id === own.period.id && periods.every(row => row.tenant_id === own.tenant.id));
      check(`tenant_${index}_carrier_list_only_own`, carriers.length === 1 && carriers[0].id === own.carrier.id);
      check(`tenant_${index}_own_package_read`, (await service.getSettlementPackage(own.tenant.id, own.pkg.id)).id === own.pkg.id);
      try { await service.getSettlementPackage(own.tenant.id, other.pkg.id); check(`tenant_${index}_foreign_detail_denied`, false); }
      catch (error) { check(`tenant_${index}_foreign_detail_denied`, error.code === 'P2025'); }
      try { await service.updateSettlementPackage(own.tenant.id, null, other.pkg.id, { observation: 'MUST NOT WRITE' }); check(`tenant_${index}_foreign_update_denied`, false); }
      catch (error) { check(`tenant_${index}_foreign_update_denied`, error.code === 'P2025'); }
    }
    result.status = 'passed';
  } catch (error) { result.status = 'failed'; result.error = error.message; process.exitCode = 1; }
  finally { await db.$disconnect(); fs.writeFileSync(process.argv[2], JSON.stringify(result, null, 2)); console.log(JSON.stringify(result)); }
})();
