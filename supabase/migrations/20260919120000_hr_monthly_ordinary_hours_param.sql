-- Divisor mensual de horas ordinarias para liquidar hora extra y recargos.
-- Con la jornada de 42 horas semanales (Ley 2101) el divisor es 210 (42/6*30) desde el
-- 15 de julio de 2026. Antes era 240 (jornada de 48 horas). Parametrizable y con vigencia:
-- se puede editar en Configuracion laboral > Parametros laborales.
INSERT INTO th_parametros_laborales (tenant_id, country, code, name, value, unit, valid_from, priority, source_note, metadata)
SELECT t.id, 'CO', 'HORAS_MENSUALES_ORDINARIAS', 'Horas mensuales ordinarias (divisor hora)', 210, 'hour', DATE '2026-07-15', 100,
       'Jornada de 42 horas semanales (Ley 2101): 42/6*30 = 210. Antes 240 con jornada de 48 horas. Validar vigencia por fecha.',
       '{"legal_group":"jornada","basis":"hora_ordinaria"}'::jsonb
FROM "Tenant" t
WHERE NOT EXISTS (
  SELECT 1 FROM th_parametros_laborales existing
  WHERE existing.tenant_id = t.id
    AND existing.country = 'CO'
    AND existing.code = 'HORAS_MENSUALES_ORDINARIAS'
    AND existing.valid_from = DATE '2026-07-15'
);
