CREATE TABLE IF NOT EXISTS th_nomina_cierres_periodo (
  id SERIAL PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  period_key TEXT NOT NULL,
  period_type TEXT NOT NULL DEFAULT 'mes',
  date_start DATE NOT NULL,
  date_end DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'cerrado',
  payroll_documents INTEGER NOT NULL DEFAULT 0,
  social_contribution_document_id INTEGER,
  total_payroll_gross NUMERIC(14, 2) NOT NULL DEFAULT 0,
  total_payroll_net NUMERIC(14, 2) NOT NULL DEFAULT 0,
  total_social_contributions NUMERIC(14, 2) NOT NULL DEFAULT 0,
  total_provisions NUMERIC(14, 2) NOT NULL DEFAULT 0,
  validation_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  closed_by INTEGER,
  reopened_by INTEGER,
  closed_at TIMESTAMPTZ,
  reopened_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, period_key)
);

CREATE INDEX IF NOT EXISTS th_nomina_cierres_periodo_status_idx
  ON th_nomina_cierres_periodo (tenant_id, status, date_start, date_end);
