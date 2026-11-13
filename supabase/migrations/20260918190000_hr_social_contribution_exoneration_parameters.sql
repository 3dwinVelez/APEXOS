INSERT INTO th_parametros_laborales (tenant_id, country, code, name, value, unit, valid_from, priority, source_note, metadata)
SELECT t.id, 'CO', item.code, item.name, item.value, item.unit, DATE '2026-01-01', 100,
       'Parametro editable para evaluar exoneracion de aportes de salud empleador, ICBF y SENA; validar valor legal vigente antes de produccion.',
       item.metadata::jsonb
FROM "Tenant" t
CROSS JOIN (VALUES
  ('SMMLV', 'Salario minimo mensual legal vigente', 1750905, 'currency', '{"category":"legal_parameter","periodicity":"annual"}'),
  ('EXONERACION_APORTES_TOPE_SMMLV', 'Tope exoneracion aportes salud, ICBF y SENA', 10, 'smmlv', '{"category":"legal_parameter","basis":"ibc_periodo","applies_to":["APORTE_SALUD","APORTE_ICBF","APORTE_SENA"]}'),
  ('AUX_TRANSPORTE', 'Auxilio de transporte mensual', 249095, 'currency', '{"category":"legal_parameter","periodicity":"annual","applies_to":["AUX_TRANSPORTE"],"include_in_social_benefits_base":true,"include_in_vacation_base":false}'),
  ('AUX_TRANSPORTE_TOPE_SMMLV', 'Tope auxilio de transporte', 2, 'smmlv', '{"category":"legal_parameter","basis":"salario_mensual","applies_to":["AUX_TRANSPORTE"]}')
) AS item(code, name, value, unit, metadata)
ON CONFLICT (tenant_id, company_id, country, code, valid_from) DO NOTHING;
