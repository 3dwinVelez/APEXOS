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
