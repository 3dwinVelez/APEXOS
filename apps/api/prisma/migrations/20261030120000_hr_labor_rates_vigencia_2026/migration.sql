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
