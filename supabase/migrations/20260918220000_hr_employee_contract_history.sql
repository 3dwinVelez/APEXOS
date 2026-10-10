CREATE TABLE IF NOT EXISTS th_empleado_contratos (
  id BIGSERIAL PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  employee_id INTEGER NOT NULL REFERENCES "Employee"(id) ON DELETE CASCADE,
  continuity_group_id TEXT NOT NULL,
  contract_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'activo',
  reason TEXT NOT NULL DEFAULT 'ingreso',
  valid_from DATE NOT NULL,
  valid_to DATE,
  salary_base NUMERIC(14,2),
  society_code TEXT,
  branch_code TEXT,
  cost_center_code TEXT,
  cost_center TEXT,
  termination_reason TEXT,
  termination_document_id BIGINT,
  previous_contract_id BIGINT REFERENCES th_empleado_contratos(id),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS th_empleado_contratos_employee_idx
  ON th_empleado_contratos (tenant_id, employee_id, valid_from DESC);

CREATE INDEX IF NOT EXISTS th_empleado_contratos_status_idx
  ON th_empleado_contratos (tenant_id, employee_id, status);

CREATE INDEX IF NOT EXISTS th_empleado_contratos_cost_center_idx
  ON th_empleado_contratos (tenant_id, society_code, branch_code, cost_center_code);

CREATE UNIQUE INDEX IF NOT EXISTS th_empleado_contratos_one_active_idx
  ON th_empleado_contratos (tenant_id, employee_id)
  WHERE status = 'activo';
