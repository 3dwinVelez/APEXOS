CREATE TABLE IF NOT EXISTS th_libranza_conceptos (
  id SERIAL PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  entity_id INTEGER,
  debit_account_code TEXT,
  credit_account_code TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS th_libranza_conceptos_code_idx
  ON th_libranza_conceptos (tenant_id, code);

CREATE TABLE IF NOT EXISTS th_libranza_empleados (
  id SERIAL PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  employee_id INTEGER NOT NULL,
  concept_id INTEGER NOT NULL REFERENCES th_libranza_conceptos(id),
  description TEXT,
  frequency TEXT NOT NULL DEFAULT 'quincena',
  mode TEXT NOT NULL DEFAULT 'cuotas',
  original_amount NUMERIC(14, 2),
  installment_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  installments_total INTEGER,
  installments_paid INTEGER NOT NULL DEFAULT 0,
  deducted_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  balance_amount NUMERIC(14, 2),
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date DATE,
  inactive_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'activa',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS th_libranza_empleados_employee_idx
  ON th_libranza_empleados (tenant_id, employee_id, status, frequency);

CREATE TABLE IF NOT EXISTS th_libranza_movimientos (
  id SERIAL PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  employee_libranza_id INTEGER NOT NULL REFERENCES th_libranza_empleados(id) ON DELETE CASCADE,
  employee_id INTEGER NOT NULL,
  period_key TEXT NOT NULL,
  payroll_document_id INTEGER,
  amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  balance_before NUMERIC(14, 2),
  balance_after NUMERIC(14, 2),
  status TEXT NOT NULL DEFAULT 'aplicado',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, employee_libranza_id, period_key)
);

CREATE INDEX IF NOT EXISTS th_libranza_movimientos_employee_idx
  ON th_libranza_movimientos (tenant_id, employee_id, period_key);
