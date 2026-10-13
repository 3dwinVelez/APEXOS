-- PYG por vehiculo (centro de costo = placa).
-- Estado de resultados operativo por vehiculo con presupuesto vs ejecutado:
-- catálogo de conceptos, presupuestos mensuales por vehículo/concepto, mapping de
-- fuentes de gasto (caja menor) y configuración de impuesto (régimen simple).
-- Los conceptos del catálogo se siembran por tenant de forma idempotente desde el
-- servicio (mismos códigos del PYG corporativo de logística).

CREATE TABLE IF NOT EXISTS transport_pyg_concepts (
  id SERIAL PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  section TEXT NOT NULL DEFAULT 'gastos_operativos',
  kind TEXT NOT NULL DEFAULT 'expense',
  display_order INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);

CREATE INDEX IF NOT EXISTS transport_pyg_concepts_lookup_idx
  ON transport_pyg_concepts (tenant_id, active, display_order);

CREATE TABLE IF NOT EXISTS transport_pyg_budgets (
  id SERIAL PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  vehicle_id INTEGER NOT NULL REFERENCES "Vehicle"(id),
  period TEXT NOT NULL,
  concept_code TEXT NOT NULL,
  amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  created_by INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, vehicle_id, period, concept_code)
);

CREATE INDEX IF NOT EXISTS transport_pyg_budgets_period_idx
  ON transport_pyg_budgets (tenant_id, period);

CREATE INDEX IF NOT EXISTS transport_pyg_budgets_vehicle_idx
  ON transport_pyg_budgets (tenant_id, vehicle_id);

CREATE TABLE IF NOT EXISTS transport_pyg_source_map (
  id SERIAL PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_code TEXT NOT NULL,
  pyg_concept_code TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, source_type, source_code)
);

CREATE TABLE IF NOT EXISTS transport_pyg_config (
  id SERIAL PRIMARY KEY,
  tenant_id TEXT NOT NULL UNIQUE,
  tax_percent NUMERIC(7, 4) NOT NULL DEFAULT 2.25,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS: aislamiento por tenant (mismo criterio que el resto de tablas multi-tenant).
ALTER TABLE transport_pyg_concepts ENABLE ROW LEVEL SECURITY;
ALTER TABLE transport_pyg_budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE transport_pyg_source_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE transport_pyg_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY transport_pyg_concepts_tenant_isolation ON transport_pyg_concepts
  USING (tenant_id = current_setting('app.tenant_id', TRUE))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', TRUE));

CREATE POLICY transport_pyg_budgets_tenant_isolation ON transport_pyg_budgets
  USING (tenant_id = current_setting('app.tenant_id', TRUE))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', TRUE));

CREATE POLICY transport_pyg_source_map_tenant_isolation ON transport_pyg_source_map
  USING (tenant_id = current_setting('app.tenant_id', TRUE))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', TRUE));

CREATE POLICY transport_pyg_config_tenant_isolation ON transport_pyg_config
  USING (tenant_id = current_setting('app.tenant_id', TRUE))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', TRUE));
