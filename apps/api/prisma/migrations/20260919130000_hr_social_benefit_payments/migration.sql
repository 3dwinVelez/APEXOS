CREATE TABLE IF NOT EXISTS th_prestaciones_pagos_documentos (
  id SERIAL PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  payment_type TEXT NOT NULL,
  period_key TEXT NOT NULL,
  date_start DATE NOT NULL,
  date_end DATE NOT NULL,
  payment_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  total_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  source_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, payment_type, period_key)
);

CREATE TABLE IF NOT EXISTS th_prestaciones_pagos_lineas (
  id SERIAL PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  document_id INTEGER NOT NULL REFERENCES th_prestaciones_pagos_documentos(id) ON DELETE CASCADE,
  employee_id INTEGER NOT NULL,
  benefit_balance_id INTEGER NOT NULL REFERENCES th_prestaciones_saldos(id),
  concept_code TEXT NOT NULL,
  amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  entity_id INTEGER,
  entity_nit TEXT,
  entity_name TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS th_prestaciones_pagos_documentos_lookup_idx
  ON th_prestaciones_pagos_documentos (tenant_id, payment_type, period_key, status);

CREATE INDEX IF NOT EXISTS th_prestaciones_pagos_lineas_employee_idx
  ON th_prestaciones_pagos_lineas (tenant_id, employee_id, concept_code);
