CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE IF NOT EXISTS th_tipos_novedad (
  id SERIAL PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'general',
  severity TEXT NOT NULL DEFAULT 'media',
  origin TEXT NOT NULL DEFAULT 'automatico',
  requires_justification BOOLEAN NOT NULL DEFAULT false,
  requires_approval BOOLEAN NOT NULL DEFAULT true,
  affects_payroll BOOLEAN NOT NULL DEFAULT false,
  active BOOLEAN NOT NULL DEFAULT true,
  valid_from DATE NOT NULL DEFAULT CURRENT_DATE,
  valid_to DATE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code, valid_from)
);

CREATE TABLE IF NOT EXISTS th_novedades_jornada (
  id SERIAL PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  logical_key TEXT NOT NULL,
  employee_id INTEGER,
  route_id INTEGER,
  date DATE NOT NULL,
  type_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendiente',
  origin TEXT NOT NULL DEFAULT 'automatico',
  minutes INTEGER NOT NULL DEFAULT 0,
  hours NUMERIC(10, 2) NOT NULL DEFAULT 0,
  requires_review BOOLEAN NOT NULL DEFAULT false,
  reviewed_by INTEGER,
  reviewed_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, logical_key)
);

CREATE TABLE IF NOT EXISTS th_novedad_historial (
  id SERIAL PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  novelty_id INTEGER NOT NULL REFERENCES th_novedades_jornada(id) ON DELETE CASCADE,
  previous_status TEXT,
  new_status TEXT NOT NULL,
  observation TEXT,
  user_id INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS th_jornada_kilometrajes (
  id SERIAL PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  employee_id INTEGER,
  route_id INTEGER,
  punch_id INTEGER,
  vehicle_plate TEXT NOT NULL,
  value NUMERIC(12, 2) NOT NULL CHECK (value >= 0),
  unit TEXT NOT NULL DEFAULT 'km',
  reported_by INTEGER,
  reported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  active BOOLEAN NOT NULL DEFAULT true,
  corrected_from_id INTEGER REFERENCES th_jornada_kilometrajes(id),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS th_jornada_kilometrajes_one_active
  ON th_jornada_kilometrajes (tenant_id, route_id, employee_id, active)
  WHERE active = true;

CREATE TABLE IF NOT EXISTS th_entidades_laborales (
  id SERIAL PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  internal_code TEXT NOT NULL,
  nit TEXT NOT NULL,
  verification_digit TEXT,
  legal_name TEXT NOT NULL,
  trade_name TEXT,
  official_code TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  valid_from DATE NOT NULL DEFAULT CURRENT_DATE,
  valid_to DATE,
  accounting_party_id INTEGER,
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, entity_type, internal_code)
);

CREATE TABLE IF NOT EXISTS th_empleado_salarios (
  id SERIAL PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  employee_id INTEGER NOT NULL,
  monthly_salary NUMERIC(14, 2) NOT NULL CHECK (monthly_salary >= 0),
  currency TEXT NOT NULL DEFAULT 'COP',
  valid_from DATE NOT NULL,
  valid_to DATE,
  reason TEXT NOT NULL,
  created_by INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  EXCLUDE USING gist (
    tenant_id WITH =,
    employee_id WITH =,
    daterange(valid_from, COALESCE(valid_to, 'infinity'::date), '[]') WITH &&
  )
);

CREATE TABLE IF NOT EXISTS th_empleado_afiliaciones (
  id SERIAL PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  employee_id INTEGER NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id INTEGER NOT NULL REFERENCES th_entidades_laborales(id),
  valid_from DATE NOT NULL,
  valid_to DATE,
  status TEXT NOT NULL DEFAULT 'activa',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  EXCLUDE USING gist (
    tenant_id WITH =,
    employee_id WITH =,
    entity_type WITH =,
    daterange(valid_from, COALESCE(valid_to, 'infinity'::date), '[]') WITH &&
  )
);

CREATE TABLE IF NOT EXISTS th_parametros_laborales (
  id SERIAL PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  company_id TEXT,
  country TEXT NOT NULL DEFAULT 'CO',
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  value NUMERIC(14, 4),
  unit TEXT NOT NULL,
  valid_from DATE NOT NULL,
  valid_to DATE,
  priority INTEGER NOT NULL DEFAULT 100,
  active BOOLEAN NOT NULL DEFAULT true,
  source_note TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, company_id, country, code, valid_from)
);

CREATE TABLE IF NOT EXISTS th_conceptos_recargo (
  id SERIAL PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  company_id TEXT,
  country TEXT NOT NULL DEFAULT 'CO',
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  value_type TEXT NOT NULL,
  percent NUMERIC(8, 4),
  factor NUMERIC(8, 4),
  unit TEXT NOT NULL DEFAULT 'hour',
  valid_from DATE NOT NULL,
  valid_to DATE,
  priority INTEGER NOT NULL DEFAULT 100,
  active BOOLEAN NOT NULL DEFAULT true,
  source_note TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, company_id, country, code, valid_from)
);

CREATE TABLE IF NOT EXISTS th_calendario_dias (
  id SERIAL PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  country TEXT NOT NULL DEFAULT 'CO',
  territory TEXT,
  company_id TEXT,
  date DATE NOT NULL,
  name TEXT NOT NULL,
  day_type TEXT NOT NULL,
  source TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, country, date, day_type)
);

CREATE UNIQUE INDEX IF NOT EXISTS th_calendario_dias_scope_unique
  ON th_calendario_dias (tenant_id, country, COALESCE(territory, ''), COALESCE(company_id, ''), date, day_type);

ALTER TABLE th_tipos_novedad ENABLE ROW LEVEL SECURITY;
ALTER TABLE th_novedades_jornada ENABLE ROW LEVEL SECURITY;
ALTER TABLE th_novedad_historial ENABLE ROW LEVEL SECURITY;
ALTER TABLE th_jornada_kilometrajes ENABLE ROW LEVEL SECURITY;
ALTER TABLE th_entidades_laborales ENABLE ROW LEVEL SECURITY;
ALTER TABLE th_empleado_salarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE th_empleado_afiliaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE th_parametros_laborales ENABLE ROW LEVEL SECURITY;
ALTER TABLE th_conceptos_recargo ENABLE ROW LEVEL SECURITY;
ALTER TABLE th_calendario_dias ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE th_tipos_novedad FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE th_novedades_jornada FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE th_novedad_historial FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE th_jornada_kilometrajes FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE th_entidades_laborales FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE th_empleado_salarios FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE th_empleado_afiliaciones FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE th_parametros_laborales FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE th_conceptos_recargo FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE th_calendario_dias FROM anon, authenticated;

INSERT INTO th_tipos_novedad (tenant_id, code, name, description, category, severity, origin, requires_justification, requires_approval, affects_payroll)
SELECT t.id, item.code, item.name, item.description, item.category, item.severity, item.origin, item.requires_justification, item.requires_approval, item.affects_payroll
FROM "Tenant" t
CROSS JOIN (VALUES
  ('LLEGADA_TARDIA', 'Llegada tardia', 'Entrada posterior a la tolerancia configurada.', 'marcacion', 'media', 'automatico', true, true, false),
  ('SALIDA_ANTICIPADA', 'Salida anticipada', 'Salida anterior a la hora programada.', 'marcacion', 'media', 'automatico', true, true, false),
  ('SIN_ENTRADA', 'Jornada sin marcacion de entrada', 'No existe marcacion inicial.', 'marcacion', 'alta', 'automatico', true, true, false),
  ('SIN_SALIDA', 'Jornada sin marcacion final', 'No existe marcacion final.', 'marcacion', 'alta', 'automatico', true, true, false),
  ('AUSENCIA', 'Ausencia', 'No se registraron marcaciones para la jornada.', 'asistencia', 'alta', 'automatico', true, true, false),
  ('MARCACION_DUPLICADA', 'Marcacion duplicada', 'Existe mas de una marcacion equivalente.', 'marcacion', 'media', 'automatico', true, true, false),
  ('FUERA_TOLERANCIA', 'Marcacion fuera de la tolerancia', 'La marcacion excede la tolerancia configurada.', 'marcacion', 'media', 'automatico', true, true, false),
  ('FUERA_GEOCERCA', 'Marcacion fuera de geocerca', 'La marcacion no coincide con la geocerca cuando aplica GPS.', 'gps', 'alta', 'automatico', true, true, false),
  ('HED', 'Horas extra diurnas', 'Tiempo extra diurno calculado.', 'laboral', 'media', 'automatico', false, true, true),
  ('HEN', 'Horas extra nocturnas', 'Tiempo extra nocturno calculado.', 'laboral', 'media', 'automatico', false, true, true),
  ('RECARGO_NOCTURNO', 'Recargo nocturno ordinario', 'Trabajo ordinario en franja nocturna.', 'laboral', 'media', 'automatico', false, true, true),
  ('DOM_FEST_DIURNO', 'Trabajo dominical o festivo diurno', 'Trabajo diurno en domingo o festivo.', 'laboral', 'media', 'automatico', false, true, true),
  ('DOM_FEST_NOCTURNO', 'Trabajo dominical o festivo nocturno', 'Trabajo nocturno en domingo o festivo.', 'laboral', 'media', 'automatico', false, true, true),
  ('HEDD', 'Hora extra diurna dominical o festiva', 'Hora extra diurna en domingo o festivo.', 'laboral', 'media', 'automatico', false, true, true),
  ('HEND', 'Hora extra nocturna dominical o festiva', 'Hora extra nocturna en domingo o festivo.', 'laboral', 'media', 'automatico', false, true, true),
  ('EXCESO_HE_DIARIO', 'Exceso del maximo diario de horas extra', 'Alerta no bloqueante por limite diario.', 'alerta_legal', 'alta', 'automatico', false, true, false),
  ('EXCESO_HE_SEMANAL', 'Exceso del maximo semanal de horas extra', 'Alerta no bloqueante por limite semanal.', 'alerta_legal', 'alta', 'automatico', false, true, false),
  ('KILOMETRAJE_FALTANTE', 'Kilometraje final faltante', 'La jornada con vehiculo no reporto kilometraje.', 'kilometraje', 'alta', 'automatico', true, true, false),
  ('KILOMETRAJE_INCONSISTENTE', 'Kilometraje inconsistente', 'Kilometraje superior al umbral parametrizado.', 'kilometraje', 'media', 'automatico', true, true, false),
  ('AJUSTE_MANUAL_MARCACION', 'Ajuste manual de marcacion', 'Correccion manual auditada de una marcacion.', 'marcacion', 'media', 'manual', true, true, false),
  ('OTRA_MANUAL', 'Otra novedad manual', 'Novedad manual no clasificada.', 'general', 'baja', 'manual', true, true, false)
) AS item(code, name, description, category, severity, origin, requires_justification, requires_approval, affects_payroll)
ON CONFLICT (tenant_id, code, valid_from) DO NOTHING;

INSERT INTO th_parametros_laborales (tenant_id, country, code, name, value, unit, valid_from, priority, source_note)
SELECT t.id, 'CO', item.code, item.name, item.value, item.unit, DATE '2026-09-01', 100, 'Referencia editable para Colombia; validar legalmente antes de produccion.'
FROM "Tenant" t
CROSS JOIN (VALUES
  ('JORNADA_NOCTURNA_INICIO', 'Inicio jornada nocturna', 19, 'hour'),
  ('JORNADA_NOCTURNA_FIN', 'Fin jornada nocturna', 6, 'hour'),
  ('MAX_HE_DIARIO', 'Maximo diario de horas extra', 2, 'hour'),
  ('MAX_HE_SEMANAL', 'Maximo semanal de horas extra', 12, 'hour'),
  ('JORNADA_ORDINARIA_SEMANAL', 'Jornada ordinaria maxima semanal', 42, 'hour'),
  ('KILOMETRAJE_INUSUAL', 'Umbral de kilometraje inusual', 450, 'km')
) AS item(code, name, value, unit)
ON CONFLICT (tenant_id, company_id, country, code, valid_from) DO NOTHING;

INSERT INTO th_conceptos_recargo (tenant_id, country, code, name, value_type, percent, factor, valid_from, source_note)
SELECT t.id, 'CO', item.code, item.name, item.value_type, item.percent, item.factor, DATE '2026-09-01', 'Referencia editable para Colombia; validar legalmente antes de produccion.'
FROM "Tenant" t
CROSS JOIN (VALUES
  ('HORA_ORDINARIA_DIURNA', 'Hora ordinaria diurna', 'factor_total', 0, 1),
  ('RECARGO_NOCTURNO', 'Recargo nocturno ordinario', 'porcentaje_adicional', 35, 1.35),
  ('HED', 'Hora extra diurna', 'porcentaje_adicional', 25, 1.25),
  ('HEN', 'Hora extra nocturna', 'porcentaje_adicional', 75, 1.75),
  ('DOM_FEST_DIURNO', 'Trabajo ordinario dominical/festivo diurno', 'porcentaje_adicional', 90, 1.90),
  ('DOM_FEST_NOCTURNO', 'Trabajo ordinario dominical/festivo nocturno', 'porcentaje_adicional', 125, 2.25),
  ('HEDD', 'Hora extra diurna dominical/festiva', 'porcentaje_adicional', 105, 2.05),
  ('HEND', 'Hora extra nocturna dominical/festiva', 'porcentaje_adicional', 155, 2.55),
  ('DESCANSO_OBLIGATORIO', 'Dia de descanso obligatorio distinto al domingo', 'informativo', 0, 0)
) AS item(code, name, value_type, percent, factor)
ON CONFLICT (tenant_id, company_id, country, code, valid_from) DO NOTHING;
