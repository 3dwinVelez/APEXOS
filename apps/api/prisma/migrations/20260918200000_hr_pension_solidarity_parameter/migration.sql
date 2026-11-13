INSERT INTO th_parametros_laborales (tenant_id, country, code, name, value, unit, valid_from, priority, source_note, metadata)
SELECT t.id, 'CO', 'DED_FONDO_SOLIDARIDAD_PENSIONAL', 'Fondo de solidaridad pensional', 0, 'percent', DATE '2026-01-01', 100,
       'Deduccion variable segun IBC expresado en SMMLV; revisar Ley 797 de 2003 y Decreto 1833 de 2016 antes de produccion.',
       '{
         "category":"deduction",
         "basis":"ibc",
         "social_contribution":true,
         "entity_type":"PENSION",
         "payer":"employee",
         "variable_rate":true,
         "brackets":[
           {"from_smmlv":4,"to_smmlv":16,"percent":1},
           {"from_smmlv":16,"to_smmlv":17,"percent":1.2},
           {"from_smmlv":17,"to_smmlv":18,"percent":1.4},
           {"from_smmlv":18,"to_smmlv":19,"percent":1.6},
           {"from_smmlv":19,"to_smmlv":20,"percent":1.8},
           {"from_smmlv":20,"percent":2}
         ]
       }'::jsonb
FROM "Tenant" t
WHERE NOT EXISTS (
  SELECT 1
  FROM th_parametros_laborales existing
  WHERE existing.tenant_id = t.id
    AND existing.country = 'CO'
    AND existing.code = 'DED_FONDO_SOLIDARIDAD_PENSIONAL'
    AND existing.valid_from = DATE '2026-01-01'
);

INSERT INTO th_nomina_conceptos (tenant_id, country, code, name, concept_type, salary_constitutive, affects_ibc, default_operation, valid_from, priority, source_note, metadata)
SELECT t.id, 'CO', 'DED_FONDO_SOLIDARIDAD_PENSIONAL', 'Fondo de solidaridad pensional', 'deduccion', false, false, 'automatico', DATE '2026-01-01', 100,
       'Concepto automatico para deduccion adicional de pension por rangos de SMMLV.',
       '{"legal_group":"seguridad_social","debit_account_code":"","credit_account_code":"","source":"parametro_laboral"}'::jsonb
FROM "Tenant" t
WHERE NOT EXISTS (
  SELECT 1
  FROM th_nomina_conceptos existing
  WHERE existing.tenant_id = t.id
    AND existing.country = 'CO'
    AND existing.code = 'DED_FONDO_SOLIDARIDAD_PENSIONAL'
    AND existing.valid_from = DATE '2026-01-01'
);
