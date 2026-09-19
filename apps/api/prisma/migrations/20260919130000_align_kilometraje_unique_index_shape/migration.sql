-- Alinea th_jornada_kilometrajes_one_active con la forma canonica de la migracion
-- 20260917120000_hr_workday_novelties_foundation. En algunos ambientes el indice fue
-- reemplazado fuera de banda por su forma de columnas planas (tenant_id, route_id,
-- employee_id, active), lo que hacia no portable cualquier ON CONFLICT sobre la clave.
-- La recreacion es idempotente: no cambia nada cuando el indice ya usa COALESCE.

DO $$
DECLARE
  current_def text;
BEGIN
  SELECT indexdef INTO current_def
  FROM pg_indexes
  WHERE schemaname = current_schema()
    AND tablename = 'th_jornada_kilometrajes'
    AND indexname = 'th_jornada_kilometrajes_one_active';

  IF current_def IS NULL OR position('COALESCE' in upper(current_def)) = 0 THEN
    DROP INDEX IF EXISTS th_jornada_kilometrajes_one_active;
    CREATE UNIQUE INDEX th_jornada_kilometrajes_one_active
      ON th_jornada_kilometrajes (tenant_id, COALESCE(route_id, -1), COALESCE(employee_id, -1))
      WHERE active = true;
  END IF;
END $$;
