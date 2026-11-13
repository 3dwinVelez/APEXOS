CREATE TABLE IF NOT EXISTS th_nomina_conceptos (
  id SERIAL PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  country TEXT NOT NULL DEFAULT 'CO',
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  concept_type TEXT NOT NULL DEFAULT 'devengo',
  salary_constitutive BOOLEAN NOT NULL DEFAULT true,
  affects_ibc BOOLEAN NOT NULL DEFAULT true,
  default_operation TEXT NOT NULL DEFAULT 'manual',
  active BOOLEAN NOT NULL DEFAULT true,
  valid_from DATE NOT NULL DEFAULT CURRENT_DATE,
  valid_to DATE,
  priority INTEGER NOT NULL DEFAULT 100,
  source_note TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS th_nomina_conceptos_lookup_idx
  ON th_nomina_conceptos (tenant_id, country, code, active, valid_from, valid_to);

INSERT INTO th_nomina_conceptos
  (tenant_id, country, code, name, concept_type, salary_constitutive, affects_ibc, default_operation, active, valid_from, source_note, metadata)
VALUES
  ('default', 'CO', 'SALARIO_BASICO', 'Salario basico', 'devengo', true, true, 'automatico', true, '2026-09-01', 'Concepto base liquidado desde salario mensual y dias trabajados.', '{"legal_group":"salario","debit_account_code":"510506","credit_account_code":"250505"}'),
  ('default', 'CO', 'JORNADA_ORDINARIA', 'Jornada ordinaria', 'devengo', true, true, 'manual', true, '2026-09-01', 'Tiempo ordinario reconocido por correccion de jornada.', '{"legal_group":"salario","debit_account_code":"510506","credit_account_code":"250505"}'),
  ('default', 'CO', 'PRIMA_SERVICIOS', 'Prima de servicios', 'devengo', false, false, 'automatico', true, '2026-09-01', 'Prestacion social causada proporcionalmente.', '{"legal_group":"prestaciones_sociales","exclude_from_social_benefits_base":true,"debit_account_code":"510536","credit_account_code":"261020"}'),
  ('default', 'CO', 'CESANTIAS', 'Cesantias', 'devengo', false, false, 'automatico', true, '2026-09-01', 'Prestacion social causada proporcionalmente.', '{"legal_group":"prestaciones_sociales","exclude_from_social_benefits_base":true,"debit_account_code":"510530","credit_account_code":"251005"}'),
  ('default', 'CO', 'INTERESES_CESANTIAS', 'Intereses a las cesantias', 'devengo', false, false, 'automatico', true, '2026-09-01', 'Intereses legales del 12% anual sobre cesantias.', '{"legal_group":"prestaciones_sociales","exclude_from_social_benefits_base":true,"debit_account_code":"510530","credit_account_code":"251010"}'),
  ('default', 'CO', 'VACACIONES', 'Vacaciones', 'devengo', false, false, 'automatico', true, '2026-09-01', 'Vacaciones causadas proporcionalmente.', '{"legal_group":"prestaciones_sociales","exclude_from_social_benefits_base":true,"debit_account_code":"510533","credit_account_code":"252005"}'),
  ('default', 'CO', 'AUX_TRANSPORTE', 'Auxilio de transporte', 'devengo', false, false, 'automatico', true, '2026-09-01', 'Parametrizable; se liquida automaticamente segun valor y tope SMMLV vigente.', '{"legal_group":"auxilio","include_in_social_benefits_base":true,"include_in_vacation_base":false,"debit_account_code":"510527","credit_account_code":"250505"}'),
  ('default', 'CO', 'COMISION', 'Comision salarial', 'devengo', true, true, 'manual', true, '2026-09-01', 'Concepto manual para comisiones que constituyen salario.', '{"legal_group":"variable","debit_account_code":"510515","credit_account_code":"250505"}'),
  ('default', 'CO', 'BONIFICACION_SALARIAL', 'Bonificacion salarial', 'devengo', true, true, 'manual', true, '2026-09-01', 'Concepto manual para bonificaciones salariales.', '{"legal_group":"variable","debit_account_code":"510548","credit_account_code":"250505"}'),
  ('default', 'CO', 'BONIFICACION_NO_SALARIAL', 'Bonificacion no salarial', 'devengo', false, false, 'manual', true, '2026-09-01', 'Concepto manual no salarial; validar soporte contractual.', '{"legal_group":"no_salarial","debit_account_code":"519595","credit_account_code":"250505"}'),
  ('default', 'CO', 'LICENCIA_REMUNERADA', 'Licencia remunerada', 'devengo', true, true, 'manual', true, '2026-09-01', 'Tiempo remunerado ingresado manualmente.', '{"legal_group":"licencia","debit_account_code":"510506","credit_account_code":"250505"}'),
  ('default', 'CO', 'LICENCIA_NO_REMUNERADA', 'Licencia no remunerada', 'deduccion', false, false, 'manual', true, '2026-09-01', 'Descuento o novedad de tiempo no remunerado.', '{"legal_group":"licencia","debit_account_code":"250505","credit_account_code":"510506"}'),
  ('default', 'CO', 'DED_SALUD', 'Deduccion salud empleado', 'deduccion', false, false, 'automatico', true, '2026-09-01', 'Deduccion parametrizada por porcentaje.', '{"legal_group":"seguridad_social","debit_account_code":"250505","credit_account_code":"237005"}'),
  ('default', 'CO', 'DED_PENSION', 'Deduccion pension empleado', 'deduccion', false, false, 'automatico', true, '2026-09-01', 'Deduccion parametrizada por porcentaje.', '{"legal_group":"seguridad_social","debit_account_code":"250505","credit_account_code":"238030"}')
ON CONFLICT DO NOTHING;
