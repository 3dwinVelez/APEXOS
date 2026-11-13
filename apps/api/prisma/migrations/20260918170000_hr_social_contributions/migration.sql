CREATE TABLE IF NOT EXISTS th_aportes_sociales_documentos (
  id SERIAL PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  period_key TEXT NOT NULL,
  period_type TEXT NOT NULL DEFAULT 'mes',
  date_start DATE NOT NULL,
  date_end DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  total_ibc NUMERIC(14, 2) NOT NULL DEFAULT 0,
  total_employee NUMERIC(14, 2) NOT NULL DEFAULT 0,
  total_employer NUMERIC(14, 2) NOT NULL DEFAULT 0,
  total_payable NUMERIC(14, 2) NOT NULL DEFAULT 0,
  source_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, period_key)
);

CREATE TABLE IF NOT EXISTS th_aportes_sociales_lineas (
  id SERIAL PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  document_id INTEGER NOT NULL REFERENCES th_aportes_sociales_documentos(id) ON DELETE CASCADE,
  employee_id INTEGER NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id INTEGER,
  concept_code TEXT NOT NULL,
  concept_name TEXT NOT NULL,
  ibc NUMERIC(14, 2) NOT NULL DEFAULT 0,
  employee_percent NUMERIC(8, 4) NOT NULL DEFAULT 0,
  employer_percent NUMERIC(8, 4) NOT NULL DEFAULT 0,
  employee_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  employer_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS th_aportes_sociales_lineas_document_idx
  ON th_aportes_sociales_lineas (tenant_id, document_id, entity_type, entity_id);

CREATE INDEX IF NOT EXISTS th_aportes_sociales_lineas_employee_idx
  ON th_aportes_sociales_lineas (tenant_id, employee_id, concept_code);

INSERT INTO th_parametros_laborales (tenant_id, country, code, name, value, unit, valid_from, priority, source_note, metadata)
SELECT t.id, 'CO', item.code, item.name, item.value, 'percent', DATE '2026-09-01', 100, 'Aporte social parametrizable; validar topes, exoneraciones y PILA antes de produccion.', item.metadata::jsonb
FROM "Tenant" t
CROSS JOIN (VALUES
  ('APORTE_ARL_RIESGO_1', 'Aporte ARL riesgo I', 0.522, '{"category":"deduction","basis":"ibc","social_contribution":true,"entity_type":"ARL","payer":"employer"}'),
  ('APORTE_ARL_RIESGO_2', 'Aporte ARL riesgo II', 1.044, '{"category":"deduction","basis":"ibc","social_contribution":true,"entity_type":"ARL","payer":"employer","arl_risk_class":2}'),
  ('APORTE_ARL_RIESGO_3', 'Aporte ARL riesgo III', 2.436, '{"category":"deduction","basis":"ibc","social_contribution":true,"entity_type":"ARL","payer":"employer","arl_risk_class":3}'),
  ('APORTE_ARL_RIESGO_4', 'Aporte ARL riesgo IV', 4.350, '{"category":"deduction","basis":"ibc","social_contribution":true,"entity_type":"ARL","payer":"employer","arl_risk_class":4}'),
  ('APORTE_ARL_RIESGO_5', 'Aporte ARL riesgo V', 6.960, '{"category":"deduction","basis":"ibc","social_contribution":true,"entity_type":"ARL","payer":"employer","arl_risk_class":5}'),
  ('APORTE_CAJA', 'Aporte caja de compensacion', 4, '{"category":"deduction","basis":"ibc","social_contribution":true,"entity_type":"CAJA_COMPENSACION","payer":"employer"}'),
  ('APORTE_ICBF', 'Aporte ICBF', 3, '{"category":"deduction","basis":"ibc","social_contribution":true,"entity_type":"ICBF","payer":"employer","exonerable":true}'),
  ('APORTE_SENA', 'Aporte SENA', 2, '{"category":"deduction","basis":"ibc","social_contribution":true,"entity_type":"SENA","payer":"employer","exonerable":true}')
) AS item(code, name, value, metadata)
ON CONFLICT (tenant_id, company_id, country, code, valid_from) DO NOTHING;
