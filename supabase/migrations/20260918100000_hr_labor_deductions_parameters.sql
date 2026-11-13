INSERT INTO th_parametros_laborales (tenant_id, country, code, name, value, unit, valid_from, priority, source_note, metadata)
SELECT t.id, 'CO', item.code, item.name, item.value, 'percent', DATE '2026-09-01', 100, 'Deduccion o aporte parametrizable; validar legalmente antes de produccion.', jsonb_build_object('category', 'deduction', 'basis', 'ibc')
FROM "Tenant" t
CROSS JOIN (VALUES
  ('DED_SALUD', 'Deduccion salud empleado', 4),
  ('DED_PENSION', 'Deduccion pension empleado', 4),
  ('APORTE_SALUD', 'Aporte salud empleador', 8.5),
  ('APORTE_PENSION', 'Aporte pension empleador', 12)
) AS item(code, name, value)
WHERE NOT EXISTS (
  SELECT 1
  FROM th_parametros_laborales existing
  WHERE existing.tenant_id = t.id
    AND existing.company_id IS NULL
    AND existing.country = 'CO'
    AND existing.code = item.code
    AND existing.valid_from = DATE '2026-09-01'
);
