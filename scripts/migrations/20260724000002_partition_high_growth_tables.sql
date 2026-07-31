-- ============================================================================
-- Particionamiento de tablas de alto crecimiento
-- Fecha: 2026-07-24
-- Propósito: Prevenir degradación de rendimiento en tablas que crecen 500M+ filas
--
-- EJECUTAR EN VENTANA DE MANTENIMIENTO PROGRAMADA
-- No ejecutar en producción sin supervisión DBA
-- ============================================================================

-- ============================================================================
-- 1. GpsPing — Partición mensual por captured_at
-- ============================================================================

-- 1a. Renombrar tabla actual
ALTER TABLE "GpsPing" RENAME TO "GpsPing_old";

-- 1b. Crear tabla particionada
CREATE TABLE "GpsPing" (
  id              SERIAL,
  tenant_id       TEXT NOT NULL,
  user_name       TEXT,
  employee_id     INT,
  route_id        INT,
  latitude        DOUBLE PRECISION,
  longitude       DOUBLE PRECISION,
  accuracy        DOUBLE PRECISION,
  speed           DOUBLE PRECISION,
  heading         DOUBLE PRECISION,
  source          TEXT DEFAULT 'mobile',
  metadata        JSONB DEFAULT '{}',
  captured_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id, captured_at)
) PARTITION BY RANGE (captured_at);

-- 1c. Crear particiones mensuales (últimos 6 meses + futuro)
CREATE TABLE "GpsPing_2026_02" PARTITION OF "GpsPing"
  FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');
CREATE TABLE "GpsPing_2026_03" PARTITION OF "GpsPing"
  FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');
CREATE TABLE "GpsPing_2026_04" PARTITION OF "GpsPing"
  FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');
CREATE TABLE "GpsPing_2026_05" PARTITION OF "GpsPing"
  FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
CREATE TABLE "GpsPing_2026_06" PARTITION OF "GpsPing"
  FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
CREATE TABLE "GpsPing_2026_07" PARTITION OF "GpsPing"
  FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');
CREATE TABLE "GpsPing_2026_08" PARTITION OF "GpsPing"
  FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');
CREATE TABLE "GpsPing_2026_09" PARTITION OF "GpsPing"
  FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');
CREATE TABLE "GpsPing_2026_10" PARTITION OF "GpsPing"
  FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');
CREATE TABLE "GpsPing_2026_11" PARTITION OF "GpsPing"
  FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');
CREATE TABLE "GpsPing_2026_12" PARTITION OF "GpsPing"
  FOR VALUES FROM ('2026-12-01') TO ('2027-01-01');
CREATE TABLE "GpsPing_default" PARTITION OF "GpsPing" DEFAULT;

-- 1d. Recrear índices sobre la tabla particionada
CREATE INDEX IF NOT EXISTS "GpsPing_tenant_id_captured_at_idx"
  ON "GpsPing"("tenant_id", "captured_at");
CREATE INDEX IF NOT EXISTS "GpsPing_tenant_id_user_name_captured_at_idx"
  ON "GpsPing"("tenant_id", "user_name", "captured_at");
CREATE INDEX IF NOT EXISTS "GpsPing_tenant_id_route_id_captured_at_idx"
  ON "GpsPing"("tenant_id", "route_id", "captured_at");
CREATE INDEX IF NOT EXISTS "GpsPing_tenant_id_source_captured_at_idx"
  ON "GpsPing"("tenant_id", "source", "captured_at");

-- 1e. Migrar datos en batches (ejecutar fuera de horas pico)
-- INSERT INTO "GpsPing" SELECT * FROM "GpsPing_old";
-- Nota: Para tablas grandes (>10M filas), usar pg_batch o script externo:
--   for batch in $(seq 0 100); do
--     psql -c "INSERT INTO \"GpsPing\" SELECT * FROM \"GpsPing_old\" WHERE id BETWEEN $((batch*50000+1)) AND $(((batch+1)*50000));"
--   done

-- 1f. Verificar integridad
-- SELECT COUNT(*) FROM "GpsPing_old";
-- SELECT COUNT(*) FROM "GpsPing";
-- Una vez verificado, eliminar tabla vieja:
-- DROP TABLE "GpsPing_old";


-- ============================================================================
-- 2. AuditLog — Partición mensual por timestamp
-- ============================================================================

ALTER TABLE "AuditLog" RENAME TO "AuditLog_old";

CREATE TABLE "AuditLog" (
  id            BIGSERIAL,
  tenant_id     TEXT NOT NULL,
  user_id       TEXT,
  action        TEXT NOT NULL,
  module        TEXT,
  entity        TEXT,
  entity_id     TEXT,
  old_value     JSONB,
  new_value     JSONB,
  ip            TEXT,
  user_agent    TEXT,
  timestamp     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata      JSONB DEFAULT '{}',
  PRIMARY KEY (id, timestamp)
) PARTITION BY RANGE (timestamp);

CREATE TABLE "AuditLog_2026_02" PARTITION OF "AuditLog"
  FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');
CREATE TABLE "AuditLog_2026_03" PARTITION OF "AuditLog"
  FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');
CREATE TABLE "AuditLog_2026_04" PARTITION OF "AuditLog"
  FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');
CREATE TABLE "AuditLog_2026_05" PARTITION OF "AuditLog"
  FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
CREATE TABLE "AuditLog_2026_06" PARTITION OF "AuditLog"
  FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
CREATE TABLE "AuditLog_2026_07" PARTITION OF "AuditLog"
  FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');
CREATE TABLE "AuditLog_2026_08" PARTITION OF "AuditLog"
  FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');
CREATE TABLE "AuditLog_2026_09" PARTITION OF "AuditLog"
  FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');
CREATE TABLE "AuditLog_2026_10" PARTITION OF "AuditLog"
  FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');
CREATE TABLE "AuditLog_2026_11" PARTITION OF "AuditLog"
  FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');
CREATE TABLE "AuditLog_2026_12" PARTITION OF "AuditLog"
  FOR VALUES FROM ('2026-12-01') TO ('2027-01-01');
CREATE TABLE "AuditLog_default" PARTITION OF "AuditLog" DEFAULT;

CREATE INDEX IF NOT EXISTS "AuditLog_tenant_id_module_timestamp_idx"
  ON "AuditLog"("tenant_id", "module", "timestamp");
CREATE INDEX IF NOT EXISTS "AuditLog_tenant_id_entity_entity_id_idx"
  ON "AuditLog"("tenant_id", "entity", "entity_id");


-- ============================================================================
-- 3. TimePunch — Partición mensual por date
-- ============================================================================

ALTER TABLE "TimePunch" RENAME TO "TimePunch_old";

CREATE TABLE "TimePunch" (
  id              SERIAL,
  tenant_id       TEXT NOT NULL,
  employee_id     INT,
  user_name       TEXT,
  type            TEXT NOT NULL,
  punched_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  date            DATE NOT NULL,
  route_id        INT,
  vehicle_plate   TEXT,
  latitude        DOUBLE PRECISION,
  longitude       DOUBLE PRECISION,
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id, date)
) PARTITION BY RANGE (date);

CREATE TABLE "TimePunch_2026_02" PARTITION OF "TimePunch"
  FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');
CREATE TABLE "TimePunch_2026_03" PARTITION OF "TimePunch"
  FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');
CREATE TABLE "TimePunch_2026_04" PARTITION OF "TimePunch"
  FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');
CREATE TABLE "TimePunch_2026_05" PARTITION OF "TimePunch"
  FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
CREATE TABLE "TimePunch_2026_06" PARTITION OF "TimePunch"
  FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
CREATE TABLE "TimePunch_2026_07" PARTITION OF "TimePunch"
  FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');
CREATE TABLE "TimePunch_2026_08" PARTITION OF "TimePunch"
  FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');
CREATE TABLE "TimePunch_2026_09" PARTITION OF "TimePunch"
  FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');
CREATE TABLE "TimePunch_2026_10" PARTITION OF "TimePunch"
  FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');
CREATE TABLE "TimePunch_2026_11" PARTITION OF "TimePunch"
  FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');
CREATE TABLE "TimePunch_2026_12" PARTITION OF "TimePunch"
  FOR VALUES FROM ('2026-12-01') TO ('2027-01-01');
CREATE TABLE "TimePunch_default" PARTITION OF "TimePunch" DEFAULT;

CREATE INDEX IF NOT EXISTS "TimePunch_tenant_id_employee_id_date_idx"
  ON "TimePunch"("tenant_id", "employee_id", "date");
CREATE INDEX IF NOT EXISTS "TimePunch_tenant_id_date_idx"
  ON "TimePunch"("tenant_id", "date");
CREATE INDEX IF NOT EXISTS "TimePunch_tenant_id_date_punched_at_idx"
  ON "TimePunch"("tenant_id", "date", "punched_at");


-- ============================================================================
-- Script de migración batch (ejemplo para producción)
-- ============================================================================
/*
-- 1. Migrar GpsPing:
DO $$
DECLARE
  batch_size INT := 50000;
  offset_val INT := 0;
  rows_migrated INT;
BEGIN
  LOOP
    INSERT INTO "GpsPing"
    SELECT * FROM "GpsPing_old"
    ORDER BY id
    LIMIT batch_size OFFSET offset_val;
    GET DIAGNOSTICS rows_migrated = ROW_COUNT;
    EXIT WHEN rows_migrated = 0;
    offset_val := offset_val + batch_size;
    COMMIT;
    RAISE NOTICE 'Migrados % registros de GpsPing...', offset_val;
  END LOOP;
END $$;

-- 2. Verificar y limpiar:
-- SELECT count(*) FROM "GpsPing_old";
-- SELECT count(*) FROM "GpsPing";
-- DROP TABLE "GpsPing_old";
*/
