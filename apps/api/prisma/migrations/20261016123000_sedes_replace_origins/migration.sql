-- Origenes operativos consolidados como Sedes administrativas georreferenciadas.
-- El maestro "Sedes" reemplaza por completo al maestro de origenes operativos:
-- la tabla TransportOrigin pasa a ser "sedes" (modelo Sede) y las tarifas pierden el bloque origen.

-- 1. La entidad origen pasa a ser la sede administrativa
ALTER TABLE "TransportOrigin" RENAME TO sedes;
ALTER TABLE "TransportOrigin_id_seq" RENAME TO "Sede_id_seq";
ALTER TABLE sedes RENAME CONSTRAINT "TransportOrigin_pkey" TO "sedes_pkey";
ALTER INDEX "TransportOrigin_tenant_id_city_active_idx" RENAME TO "sedes_tenant_id_city_active_idx";
ALTER INDEX "TransportOrigin_tenant_id_code_key" RENAME TO "sedes_tenant_id_code_key";

-- 2. Coordenadas opcionales: una sede administrativa puede crearse antes de georreferenciarse
ALTER TABLE sedes ALTER COLUMN latitude DROP NOT NULL;
ALTER TABLE sedes ALTER COLUMN longitude DROP NOT NULL;

-- 3. El tarifario deja de filtrar por origen (las tarifas aplican a todas las sedes)
ALTER TABLE "TransportRateCard" DROP CONSTRAINT "TransportRateCard_origin_id_fkey";
ALTER TABLE "TransportRateCard" DROP COLUMN origin_id;
ALTER TABLE "TransportRateCard" DROP COLUMN origin_department;
ALTER TABLE "TransportRateCard" DROP COLUMN origin_city;
ALTER TABLE "TransportRateCard" DROP COLUMN origin_municipality;
-- el indice TransportRateCard_tenant_origin_destination_idx desaparece junto con la columna origin_id

-- 4. Necesidades, planes y viajes referencian la sede
ALTER TABLE "TransportNeed" RENAME COLUMN origin_id TO sede_id;
ALTER INDEX "TransportNeed_tenant_id_origin_id_status_idx" RENAME TO "TransportNeed_tenant_id_sede_id_status_idx";
ALTER TABLE "TransportNeed" RENAME CONSTRAINT "TransportNeed_origin_id_fkey" TO "TransportNeed_sede_id_fkey";
ALTER TABLE "TransportPlan" RENAME COLUMN origin_id TO sede_id;
ALTER TABLE "TransportPlan" RENAME CONSTRAINT "TransportPlan_origin_id_fkey" TO "TransportPlan_sede_id_fkey";
ALTER TABLE "TransportTrip" RENAME COLUMN origin_id TO sede_id;
ALTER INDEX "TransportTrip_tenant_id_origin_id_status_idx" RENAME TO "TransportTrip_tenant_id_sede_id_status_idx";
ALTER TABLE "TransportTrip" RENAME CONSTRAINT "TransportTrip_origin_id_fkey" TO "TransportTrip_sede_id_fkey";

-- 5. Las sedes administrativas por defecto pasan a existir como sedes (coordenadas por completar en el administrador)
INSERT INTO sedes (tenant_id, code, name, address, city, department, country, timezone, service_minutes, metadata, active, created_at, updated_at)
SELECT t.tenant_id, d.code, d.name, d.name || ' - direccion por completar', 'Por completar', NULL, 'CO', 'America/Bogota', 60, '{}', true, now(), now()
FROM (SELECT DISTINCT tenant_id FROM sedes) t
CROSS JOIN (VALUES
  ('SEDE-PRINCIPAL', 'Sede principal'),
  ('BOG-NORTE', 'Bogota Norte'),
  ('BOG-SUR', 'Bogota Sur')
) AS d(code, name)
WHERE NOT EXISTS (SELECT 1 FROM sedes s WHERE s.tenant_id = t.tenant_id AND s.code = d.code);

-- 6. Origenes de prueba/basura QA quedan inactivos (se conservan por historia, no se eliminan)
UPDATE sedes SET active = false WHERE code LIKE 'QA-%' OR code LIKE 'TEST-%';
