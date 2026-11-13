CREATE TABLE IF NOT EXISTS th_nomina_ajustes (
  id SERIAL PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  employee_id INTEGER NOT NULL,
  period_key TEXT NOT NULL,
  adjustment_type TEXT NOT NULL,
  concept_code TEXT NOT NULL,
  description TEXT NOT NULL,
  minutes INTEGER NOT NULL DEFAULT 0,
  amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  taxable BOOLEAN NOT NULL DEFAULT true,
  status TEXT NOT NULL DEFAULT 'activo',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS th_nomina_ajustes_period_employee_idx
  ON th_nomina_ajustes (tenant_id, period_key, employee_id, status);

CREATE TABLE IF NOT EXISTS th_nomina_documentos (
  id SERIAL PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  employee_id INTEGER NOT NULL,
  payroll_id INTEGER,
  period_key TEXT NOT NULL,
  period_type TEXT NOT NULL DEFAULT 'quincena',
  date_start DATE NOT NULL,
  date_end DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  gross NUMERIC(14, 2) NOT NULL DEFAULT 0,
  deductions NUMERIC(14, 2) NOT NULL DEFAULT 0,
  net NUMERIC(14, 2) NOT NULL DEFAULT 0,
  employer_cost NUMERIC(14, 2) NOT NULL DEFAULT 0,
  lines JSONB NOT NULL DEFAULT '[]'::jsonb,
  source_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  pdf_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, employee_id, period_key)
);

CREATE INDEX IF NOT EXISTS th_nomina_documentos_period_idx
  ON th_nomina_documentos (tenant_id, period_key, status);
