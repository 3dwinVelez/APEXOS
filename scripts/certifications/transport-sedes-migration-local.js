// Ejecuta las migraciones sobre tablas sinteticas dentro de una transaccion revertida.
const fs = require('node:fs');
const path = require('node:path');
require('../load-env')(path.resolve('.env'));
if (!['localhost', '127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname)) throw Error('Solo base local');
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
const result = { status: 'running', checks: [] };
const check = (name, ok) => { result.checks.push({ name, status: ok ? 'passed' : 'failed' }); if (!ok) throw Error(name); };
(async () => {
  try {
    await db.$transaction(async tx => {
      const schema = `qa_sedes_${Date.now()}`;
      await tx.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
      await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}", public`);
      await tx.$executeRawUnsafe(`CREATE TABLE "TransportOrigin" (id SERIAL PRIMARY KEY, tenant_id text, code text, name text, address text, city text, department text, country text, latitude float NOT NULL, longitude float NOT NULL, timezone text, service_minutes int, metadata jsonb, active boolean, created_at timestamp, updated_at timestamp)`);
      await tx.$executeRawUnsafe(`CREATE UNIQUE INDEX "TransportOrigin_tenant_id_code_key" ON "TransportOrigin"(tenant_id, code)`);
      await tx.$executeRawUnsafe(`CREATE INDEX "TransportOrigin_tenant_id_city_active_idx" ON "TransportOrigin"(tenant_id, city, active)`);
      await tx.$executeRawUnsafe(`CREATE TABLE "TransportRateCard" (id SERIAL PRIMARY KEY, origin_id int REFERENCES "TransportOrigin"(id), origin_department text, origin_city text, origin_municipality text, metadata jsonb)`);
      for (const table of ['TransportNeed', 'TransportPlan', 'TransportTrip']) {
        await tx.$executeRawUnsafe(`CREATE TABLE "${table}" (id SERIAL PRIMARY KEY, tenant_id text, origin_id int REFERENCES "TransportOrigin"(id), status text)`);
        if (table !== 'TransportPlan') await tx.$executeRawUnsafe(`CREATE INDEX "${table}_tenant_id_origin_id_status_idx" ON "${table}"(tenant_id, origin_id, status)`);
      }
      await tx.$executeRawUnsafe(`CREATE TABLE "TransportSettlementPackage" (id SERIAL PRIMARY KEY, carrier_id int NOT NULL)`);
      await tx.$executeRawUnsafe(`INSERT INTO "TransportOrigin" (tenant_id,code,name,latitude,longitude,active) VALUES ('A','QA-PRESERVE','Sede A',6,-75,true),('B','B-01','Sede B',4,-74,false)`);
      await tx.$executeRawUnsafe(`INSERT INTO "TransportRateCard" (origin_id,origin_department,origin_city,origin_municipality,metadata) VALUES (1,'Antioquia','Medellin','Medellin','{"preserved":true}')`);
      for (const table of ['TransportNeed', 'TransportPlan', 'TransportTrip']) await tx.$executeRawUnsafe(`INSERT INTO "${table}" (tenant_id,origin_id,status) VALUES ('A',1,'created')`);
      for (const migration of ['20261016123000_sedes_replace_origins', '20261019134505_transport_settlement_vehicle']) {
        const sql = fs.readFileSync(path.join('apps/api/prisma/migrations', migration, 'migration.sql'), 'utf8');
        for (const statement of sql.split(';').map(s => s.replace(/^\s*--.*$/gm, '').trim()).filter(Boolean)) await tx.$executeRawUnsafe(statement);
      }
      const rates = await tx.$queryRawUnsafe('SELECT metadata FROM "TransportRateCard"');
      check('origin_fields_archived_before_removal', rates[0].metadata.legacy_origin_before_sedes.origin_id === 1 && rates[0].metadata.legacy_origin_before_sedes.origin_city === 'Medellin');
      check('unrelated_rate_metadata_preserved', rates[0].metadata.preserved === true);
      const sedes = await tx.$queryRawUnsafe('SELECT * FROM sedes WHERE id IN (1,2) ORDER BY id');
      check('existing_tenants_ids_and_activity_preserved', sedes.length === 2 && sedes[0].tenant_id === 'A' && sedes[0].active && sedes[1].tenant_id === 'B' && !sedes[1].active);
      for (const table of ['TransportNeed', 'TransportPlan', 'TransportTrip']) {
        const rows = await tx.$queryRawUnsafe(`SELECT sede_id FROM "${table}"`);
        check(`${table}_foreign_key_preserved`, rows[0].sede_id === 1);
      }
      await tx.$executeRawUnsafe('INSERT INTO "TransportSettlementPackage" (carrier_id) VALUES (NULL)');
      check('vehicle_package_without_legacy_carrier', true);
      throw Error('ROLLBACK_CERTIFICATION');
    }, { timeout: 30000 });
  } catch (error) {
    if (error.message === 'ROLLBACK_CERTIFICATION') { result.status = 'passed'; result.rolled_back = true; }
    else { result.status = 'failed'; result.error = error.message; process.exitCode = 1; }
  } finally {
    await db.$disconnect();
    if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
  }
})();
