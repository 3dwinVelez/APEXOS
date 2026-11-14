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
