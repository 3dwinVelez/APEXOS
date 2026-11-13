CREATE TABLE IF NOT EXISTS th_prestaciones_saldos (
  id SERIAL PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  employee_id INTEGER NOT NULL,
  concept_code TEXT NOT NULL,
  period_key TEXT NOT NULL,
  date_start DATE NOT NULL,
  date_end DATE NOT NULL,
  accrued_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  paid_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  balance_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  source_document_type TEXT NOT NULL DEFAULT 'nomina',
  source_document_id INTEGER,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, employee_id, concept_code, period_key)
);

CREATE INDEX IF NOT EXISTS th_prestaciones_saldos_employee_idx
  ON th_prestaciones_saldos (tenant_id, employee_id, concept_code, balance_amount);

CREATE TABLE IF NOT EXISTS th_liquidaciones_trabajador (
  id SERIAL PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  employee_id INTEGER NOT NULL,
  termination_date DATE NOT NULL,
  termination_reason TEXT NOT NULL DEFAULT 'retiro_voluntario',
  contract_type TEXT NOT NULL DEFAULT 'indefinite',
  status TEXT NOT NULL DEFAULT 'draft',
  gross NUMERIC(14, 2) NOT NULL DEFAULT 0,
  deductions NUMERIC(14, 2) NOT NULL DEFAULT 0,
  net NUMERIC(14, 2) NOT NULL DEFAULT 0,
  indemnization_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  benefit_balance_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  lines JSONB NOT NULL DEFAULT '[]'::jsonb,
  source_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, employee_id, termination_date)
);

CREATE INDEX IF NOT EXISTS th_liquidaciones_trabajador_employee_idx
  ON th_liquidaciones_trabajador (tenant_id, employee_id, termination_date, status);
