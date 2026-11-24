# Comando SQL para Eliminar Migración Fantasma de QA

## Instrucciones

1. Abrir el SQL Editor de Supabase QA:
   **URL:** https://supabase.com/dashboard/project/jbirkghkekuifgfsgquq/sql

2. Copiar y pegar el siguiente bloque SQL completo:

```sql
-- ============================================================================
-- ELIMINACIÓN DE MIGRACIÓN FANTASMA: 20260601000000_baseline_core_schema
-- ============================================================================
-- Contexto: Esta migración existe en el ledger de QA pero nunca en el repositorio.
-- applied_steps_count = 0 indica que no ejecutó cambios reales.
-- Procedimiento: Verificar → Eliminar → Confirmar
-- ============================================================================

-- PASO 1: Verificar existencia y estado
SELECT 
  id,
  migration_name,
  checksum,
  applied_steps_count,
  started_at,
  finished_at,
  logs
FROM _prisma_migrations
WHERE migration_name = '20260601000000_baseline_core_schema';

-- Resultado esperado: 1 fila con applied_steps_count = 0

-- PASO 2: Eliminar la migración fantasma
DELETE FROM _prisma_migrations
WHERE migration_name = '20260601000000_baseline_core_schema'
  AND applied_steps_count = 0;

-- Resultado esperado: DELETE 1

-- PASO 3: Confirmar eliminación
SELECT count(*) as remaining_baseline
FROM _prisma_migrations
WHERE migration_name = '20260601000000_baseline_core_schema';

-- Resultado esperado: 0

-- PASO 4: Contar migraciones restantes en QA
SELECT count(*) as total_migrations_qa
FROM _prisma_migrations;

-- Resultado esperado: 72 migraciones (73 - 1 fantasma eliminada)

-- ============================================================================
-- FIN DEL PROCEDIMIENTO
-- ============================================================================
```

3. Ejecutar el bloque completo (botón "Run" o Ctrl+Enter)

4. Copiar los resultados de cada PASO y guardarlos en:
   `docs/qa/evidence/db-alignment-20261117/qa-baseline-removed.txt`

5. Verificar que:
   - PASO 1 muestra 1 fila con `applied_steps_count = 0`
   - PASO 2 muestra `DELETE 1`
   - PASO 3 muestra `remaining_baseline = 0`
   - PASO 4 muestra `total_migrations_qa = 72`

## Después de ejecutar

Una vez completada la eliminación, ejecutar:

```bash
node scripts/audit-db-alignment-api.js
```

Este script comparará las migraciones de QA (ahora 72) con las de Producción (69) y mostrará las 3 migraciones legales faltantes en Producción.

## Nota de seguridad

- Este comando solo elimina un registro del ledger, no modifica tablas ni datos
- La condición `AND applied_steps_count = 0` protege contra eliminación accidental
- Si `applied_steps_count` fuera distinto de 0, el DELETE no afectaría ninguna fila
