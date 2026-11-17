-- ============================================================================
-- PASO 1: Eliminar migración fantasma de QA
-- ============================================================================
-- Ejecutar en: SQL Editor de Supabase QA (jbirkghkekuifgfsgquq)
-- Proyecto: https://supabase.com/dashboard/project/jbirkghkekuifgfsgquq/sql

-- Verificar antes de ejecutar:
SELECT id, migration_name, applied_steps_count, checksum
FROM _prisma_migrations
WHERE migration_name = '20260601000000_baseline_core_schema';

-- Si existe y applied_steps_count = 0, eliminar:
DELETE FROM _prisma_migrations
WHERE migration_name = '20260601000000_baseline_core_schema'
  AND applied_steps_count = 0;

-- Verificar eliminación:
SELECT count(*) as remaining_baseline
FROM _prisma_migrations
WHERE migration_name = '20260601000000_baseline_core_schema';

-- Debe retornar 0

-- ============================================================================
-- PASO 2: Aplicar migraciones legales en producción
-- ============================================================================
-- Ejecutar en: SQL Editor de Supabase Producción (jzbwzmkidfthknsohhnr)
-- Proyecto: https://supabase.com/dashboard/project/jzbwzmkidfthknsohhnr/sql

-- IMPORTANTE: Ejecutar cada migración en orden y verificar antes de continuar

-- ------------------------------------------------------------------------
-- Migración 1: 20261030120000_hr_labor_rates_vigencia_2026
-- Descripción: Tarifas de recargos Ley 2466/2025
-- Checksum: fa95b6d4ba29ef0da5bc277a4388772fe8de218bb2a885be1ee91c9b5659187b
-- ------------------------------------------------------------------------

-- Verificar si ya está aplicada:
SELECT migration_name, finished_at
FROM _prisma_migrations
WHERE migration_name = '20261030120000_hr_labor_rates_vigencia_2026';

-- Si NO existe (0 filas), ejecutar:
-- Tarifas y vigencia 2026 para marcaciones y nomina.
--
-- Contexto legal:
--   * Ley 2466/2025 art. 10: jornada nocturna 19:00-06:00 con recargo 35%.
--   * Ley 2466/2025 art. 14: recargo dominical/festivo 80% hasta 30-jun-2026 y 90% desde
--     01-jul-2026 (100% desde 01-jul-2027, fuera de esta migracion).
--   * CST art. 168: hora extra diurna 25% y nocturna 75%. En domingo/festivo los factores
--     totales son 105%/155% en 2026-H1 y 115%/165% en 2026-H2.
--   * Ley 2101/2021: jornada 44 h hasta 14-jul-2026 (divisor 220) y 42 h desde 15-jul-2026
--     (divisor 210).
--
-- Las semillas originales solo tenian vigencia desde 2026-09-01, de modo que los periodos
-- anteriores no encontraban concepto de recargo y se liquidaban sin factor. Esta migracion
-- agrega la linea de tiempo completa sin sobrescribir configuraciones propias del tenant.

-- 1) Corregir HEDD/HEND del tramo 2026-H2 solo si siguen con el valor sembrado (105/155).
UPDATE th_conceptos_recargo
SET percent = 115,
    factor = 2.15,
    source_note = 'HEDD 2026-H2: 25% de hora extra + 90% dominical/festivo.'
WHERE code = 'HEDD'
  AND valid_from >= DATE '2026-07-01'
  AND percent = 105
  AND factor = 2.05;

UPDATE th_conceptos_recargo
SET percent = 165,
    factor = 2.65,
    source_note = 'HEND 2026-H2: 75% de hora extra nocturna + 90% dominical/festivo.'
WHERE code = 'HEND'
  AND valid_from >= DATE '2026-07-01'
  AND percent = 155
  AND factor = 2.55;

-- 2) Linea de tiempo completa de conceptos de recargo por tenant.
INSERT INTO th_conceptos_recargo (tenant_id, country, code, name, value_type, percent, factor, valid_from, valid_to, priority, source_note)
SELECT t.id, 'CO', item.code, item.name, item.value_type, item.percent, item.factor, item.valid_from, item.valid_to, 100, item.source_note
FROM "Tenant" t
CROSS JOIN (VALUES
  ('RECARGO_NOCTURNO', 'Recargo nocturno ordinario', 'porcentaje_adicional', 35, 1.35, DATE '2026-01-01', NULL::date, 'Ley 2466/2025 art. 10: 19:00-06:00, 35%.'),
  ('HED', 'Hora extra diurna', 'factor_total', 25, 1.25, DATE '2026-01-01', NULL::date, 'CST art. 168: hora extra diurna 25%.'),
  ('HEN', 'Hora extra nocturna', 'factor_total', 75, 1.75, DATE '2026-01-01', NULL::date, 'CST art. 168: hora extra nocturna 75%.'),
  ('DOM_FEST_DIURNO', 'Trabajo ordinario dominical/festivo diurno', 'porcentaje_adicional', 80, 1.80, DATE '2026-01-01', DATE '2026-06-30', 'Ley 2466/2025 art. 14: 80% hasta 30-jun-2026.'),
  ('DOM_FEST_NOCTURNO', 'Trabajo ordinario dominical/festivo nocturno', 'porcentaje_adicional', 115, 2.15, DATE '2026-01-01', DATE '2026-06-30', '80% dominical/festivo + 35% nocturno hasta 30-jun-2026.'),
  ('HEDD', 'Hora extra diurna dominical/festiva', 'factor_total', 105, 2.05, DATE '2026-01-01', DATE '2026-06-30', '25% de hora extra + 80% dominical/festivo hasta 30-jun-2026.'),
  ('HEND', 'Hora extra nocturna dominical/festiva', 'factor_total', 155, 2.55, DATE '2026-01-01', DATE '2026-06-30', '75% de hora extra + 80% dominical/festivo hasta 30-jun-2026.'),
  ('DOM_FEST_DIURNO', 'Trabajo ordinario dominical/festivo diurno', 'porcentaje_adicional', 90, 1.90, DATE '2026-07-01', NULL::date, 'Ley 2466/2025 art. 14: 90% desde 01-jul-2026.'),
  ('DOM_FEST_NOCTURNO', 'Trabajo ordinario dominical/festivo nocturno', 'porcentaje_adicional', 125, 2.25, DATE '2026-07-01', NULL::date, '90% dominical/festivo + 35% nocturno desde 01-jul-2026.'),
  ('HEDD', 'Hora extra diurna dominical/festiva', 'factor_total', 115, 2.15, DATE '2026-07-01', NULL::date, '25% de hora extra + 90% dominical/festivo desde 01-jul-2026.'),
  ('HEND', 'Hora extra nocturna dominical/festiva', 'factor_total', 165, 2.65, DATE '2026-07-01', NULL::date, '75% de hora extra + 90% dominical/festivo desde 01-jul-2026.')
) AS item(code, name, value_type, percent, factor, valid_from, valid_to, source_note)
ON CONFLICT DO NOTHING;

-- 3) Divisor mensual 220 h para la jornada de 44 h vigente hasta el 14-jul-2026.
-- El tramo de 210 h desde el 15-jul-2026 ya existe en 20260919120000.
INSERT INTO th_parametros_laborales (tenant_id, country, code, name, value, unit, valid_from, priority, source_note, metadata)
SELECT t.id, 'CO', 'HORAS_MENSUALES_ORDINARIAS', 'Horas mensuales ordinarias (divisor hora)', 220, 'hour', DATE '2026-01-01', 100,
       'Jornada de 44 horas semanales (Ley 2101): 44/6*30 = 220, vigente hasta 14-jul-2026.',
       '{"legal_group":"jornada","basis":"hora_ordinaria"}'::jsonb
FROM "Tenant" t
WHERE NOT EXISTS (
  SELECT 1 FROM th_parametros_laborales existing
  WHERE existing.tenant_id = t.id
    AND existing.country = 'CO'
    AND existing.code = 'HORAS_MENSUALES_ORDINARIAS'
    AND existing.valid_from = DATE '2026-01-01'
);


-- Registrar en ledger:
INSERT INTO _prisma_migrations (id, checksum, migration_name, finished_at, applied_steps_count, logs)
VALUES (
  gen_random_uuid()::text,
  'fa95b6d4ba29ef0da5bc277a4388772fe8de218bb2a885be1ee91c9b5659187b',
  '20261030120000_hr_labor_rates_vigencia_2026',
  now(),
  1,
  NULL
);

-- Verificar registro:
SELECT migration_name, checksum, finished_at, applied_steps_count
FROM _prisma_migrations
WHERE migration_name = '20261030120000_hr_labor_rates_vigencia_2026';

-- Debe retornar 1 fila con checksum = fa95b6d4ba29ef0da5bc277a4388772fe8de218bb2a885be1ee91c9b5659187b

-- ------------------------------------------------------------------------
-- Migración 2: 20261030130000_hr_ibc_caps_floors_2026
-- Descripción: Topes y pisos IBC Ley 100/1993
-- Checksum: 351ef4002b108c6aadaf8b45c3f33222cdc01bce89160211bd9b6130f5d941c4
-- ------------------------------------------------------------------------

-- Verificar si ya está aplicada:
SELECT migration_name, finished_at
FROM _prisma_migrations
WHERE migration_name = '20261030130000_hr_ibc_caps_floors_2026';

-- Si NO existe (0 filas), ejecutar:
-- Topes y pisos del IBC como parametros editables con vigencia.
--
-- Contexto legal:
--   * Ley 100 de 1993 y Decreto 780 de 1996: el IBC de salud, pension y ARL no puede
--     ser inferior a 1 SMMLV (proporcional a los dias cotizados) ni superior a 25 SMMLV
--     por mes. En una quincena ambos limites se prorratean por los dias del periodo.
--
-- Antes de esta migracion el motor solo aplicaba topes y pisos cuando existian novedades
-- segmentadas; la ruta ordinaria cotizaba sobre el salario sin limite. Estos parametros
-- permiten que contabilidad ajuste el tope sin cambiar codigo y dejan la regla trazable.

INSERT INTO th_parametros_laborales (tenant_id, country, code, name, value, unit, valid_from, priority, source_note, metadata)
SELECT t.id, 'CO', 'IBC_TOPE_SMMLV', 'Tope del IBC en SMMLV', 25, 'smmlv', DATE '2026-01-01', 100,
       'Ley 100 de 1993 y Decreto 780 de 1996: IBC maximo de 25 SMMLV mensuales, proporcional en periodos menores a un mes.',
       '{"category":"legal_parameter","basis":"ibc_periodo","applies_to":["salud","pension","arl"]}'::jsonb
FROM "Tenant" t
WHERE NOT EXISTS (
  SELECT 1 FROM th_parametros_laborales existing
  WHERE existing.tenant_id = t.id
    AND existing.country = 'CO'
    AND existing.code = 'IBC_TOPE_SMMLV'
    AND existing.valid_from = DATE '2026-01-01'
);

-- Configuracion opcional de topes/pisos absolutos por subsistema. Vacio significa que el
-- motor deriva el tope de IBC_TOPE_SMMLV y el piso de SMMLV * dias cotizados / 30.
INSERT INTO th_parametros_laborales (tenant_id, country, code, name, value, unit, valid_from, priority, source_note, metadata)
SELECT t.id, 'CO', 'IBC_CAPS_FLOORS', 'Topes y pisos de IBC por subsistema', NULL, 'json', DATE '2026-01-01', 100,
       'Permite fijar cap/floor absolutos por subsistema; vacio usa IBC_TOPE_SMMLV y el piso proporcional de 1 SMMLV.',
       '{"category":"legal_parameter","basis":"ibc_periodo","salud":{},"pension":{},"arl":{}}'::jsonb
FROM "Tenant" t
WHERE NOT EXISTS (
  SELECT 1 FROM th_parametros_laborales existing
  WHERE existing.tenant_id = t.id
    AND existing.country = 'CO'
    AND existing.code = 'IBC_CAPS_FLOORS'
    AND existing.valid_from = DATE '2026-01-01'
);


-- Registrar en ledger:
INSERT INTO _prisma_migrations (id, checksum, migration_name, finished_at, applied_steps_count, logs)
VALUES (
  gen_random_uuid()::text,
  '351ef4002b108c6aadaf8b45c3f33222cdc01bce89160211bd9b6130f5d941c4',
  '20261030130000_hr_ibc_caps_floors_2026',
  now(),
  1,
  NULL
);

-- Verificar registro:
SELECT migration_name, checksum, finished_at, applied_steps_count
FROM _prisma_migrations
WHERE migration_name = '20261030130000_hr_ibc_caps_floors_2026';

-- Debe retornar 1 fila con checksum = 351ef4002b108c6aadaf8b45c3f33222cdc01bce89160211bd9b6130f5d941c4

-- ------------------------------------------------------------------------
-- Migración 3: 20261113120000_hr_nomina_legal_2026
-- Descripción: Ajustes legales nómina 2026
-- Checksum: 85114b7fb4b7533bf99351f39a8ed1b5a0ea1bee4a7bc278dc99e1bca2be68d0
-- ------------------------------------------------------------------------

-- Verificar si ya está aplicada:
SELECT migration_name, finished_at
FROM _prisma_migrations
WHERE migration_name = '20261113120000_hr_nomina_legal_2026';

-- Si NO existe (0 filas), ejecutar:
-- Ajustes legales 2026 para la nomina (remediacion R-07 y R-10A).
--
-- Contexto:
--   * CST art. 128 y Ley 1/1963: el auxilio de transporte no es salario y no integra la
--     base de prestaciones sociales ni la de vacaciones. La semilla original lo marcaba
--     como incluido (include_in_social_benefits_base = true), lo que inflaba prima,
--     cesantias e intereses.
--   * Ley 2466/2025 art. 13: el trabajo suplementario tiene un maximo de 2 horas diarias
--     y 12 horas semanales. Se parametriza para que liquidacion y alerta lean el tope.
--
-- La semilla de 20260918150000 se corrige con un UPDATE forward-only: no se reescribe la
-- historia y se respetan las configuraciones propias del tenant salvo los tres flags legales.

-- 1) El auxilio de transporte deja de integrar la base de prestaciones y vacaciones.
UPDATE th_nomina_conceptos
SET metadata = jsonb_set(
      jsonb_set(
        jsonb_set(COALESCE(metadata, '{}'::jsonb), '{include_in_social_benefits_base}', 'false'::jsonb, true),
        '{include_in_vacation_base}', 'false'::jsonb, true),
      '{exclude_from_social_benefits_base}', 'true'::jsonb, true),
    updated_at = now()
WHERE country = 'CO'
  AND code = 'AUX_TRANSPORTE';

-- 2) Topes de trabajo suplementario por tenant.
INSERT INTO th_parametros_laborales (tenant_id, country, code, name, value, unit, valid_from, priority, source_note, metadata)
SELECT t.id, 'CO', 'MAX_HE_DIARIO', 'Maximo de horas extra por dia', 2, 'hour', DATE '2026-01-01', 100,
       'Ley 2466/2025 art. 13: maximo 2 horas diarias de trabajo suplementario.',
       '{"legal_group":"trabajo_suplementario","control":"alerta_trazada"}'::jsonb
FROM "Tenant" t
WHERE NOT EXISTS (
  SELECT 1 FROM th_parametros_laborales existing
  WHERE existing.tenant_id = t.id
    AND existing.country = 'CO'
    AND existing.code = 'MAX_HE_DIARIO'
    AND existing.valid_from = DATE '2026-01-01'
);

INSERT INTO th_parametros_laborales (tenant_id, country, code, name, value, unit, valid_from, priority, source_note, metadata)
SELECT t.id, 'CO', 'MAX_HE_SEMANAL', 'Maximo de horas extra por semana', 12, 'hour', DATE '2026-01-01', 100,
       'Ley 2466/2025 art. 13: maximo 12 horas semanales de trabajo suplementario.',
       '{"legal_group":"trabajo_suplementario","control":"alerta_trazada"}'::jsonb
FROM "Tenant" t
WHERE NOT EXISTS (
  SELECT 1 FROM th_parametros_laborales existing
  WHERE existing.tenant_id = t.id
    AND existing.country = 'CO'
    AND existing.code = 'MAX_HE_SEMANAL'
    AND existing.valid_from = DATE '2026-01-01'
);


-- Registrar en ledger:
INSERT INTO _prisma_migrations (id, checksum, migration_name, finished_at, applied_steps_count, logs)
VALUES (
  gen_random_uuid()::text,
  '85114b7fb4b7533bf99351f39a8ed1b5a0ea1bee4a7bc278dc99e1bca2be68d0',
  '20261113120000_hr_nomina_legal_2026',
  now(),
  1,
  NULL
);

-- Verificar registro:
SELECT migration_name, checksum, finished_at, applied_steps_count
FROM _prisma_migrations
WHERE migration_name = '20261113120000_hr_nomina_legal_2026';

-- Debe retornar 1 fila con checksum = 85114b7fb4b7533bf99351f39a8ed1b5a0ea1bee4a7bc278dc99e1bca2be68d0

-- ============================================================================
-- PASO 3: Verificar alineación final
-- ============================================================================

-- Ejecutar en QA:
SELECT migration_name, finished_at, checksum
FROM _prisma_migrations
ORDER BY finished_at ASC;

-- Ejecutar en Producción:
SELECT migration_name, finished_at, checksum
FROM _prisma_migrations
ORDER BY finished_at ASC;

-- Comparar: ambas consultas deben retornar las mismas migraciones
-- (excepto timestamps que pueden diferir)

-- Contar migraciones en QA:
SELECT count(*) as qa_migration_count
FROM _prisma_migrations;

-- Contar migraciones en Producción:
SELECT count(*) as prod_migration_count
FROM _prisma_migrations;

-- Ambos conteos deben ser iguales

-- ============================================================================
-- RESUMEN
-- ============================================================================
-- 
-- 1. Ejecutar PASO 1 en QA (eliminar migración fantasma)
-- 2. Ejecutar PASO 2 en Producción (aplicar 3 migraciones legales en orden)
-- 3. Ejecutar PASO 3 en ambos ambientes (verificar alineación)
-- 
-- Después de ejecutar:
-- - QA debe tener N migraciones
-- - Producción debe tener N migraciones (mismas que QA)
-- - Las 3 migraciones legales deben estar en ambos ambientes
-- - La migración fantasma baseline_core_schema no debe existir en QA
-- 
-- Si todo está correcto, ejecutar:
-- node scripts/audit-db-alignment-api.js
-- 
-- Debe mostrar: "✓ AMBAS BASES DE DATOS ESTÁN ALINEADAS"
-- ============================================================================
