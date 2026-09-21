-- Novedad para la marcacion registrada sin senal: el operario conserva su hora real
-- pero no existe traza GPS que validar, y el supervisor debe poder verla y revisarla.
-- Idempotente: el despliegue de QA y de produccion aplica las migraciones pendientes
-- en el arranque del servicio, sin control manual.
INSERT INTO th_tipos_novedad (
  tenant_id, code, name, description, category, severity, origin,
  requires_justification, requires_approval, affects_payroll
)
SELECT t.id,
       'GPS_INACTIVO_SIN_SENAL',
       'GPS inactivo por falta de senal',
       'El operario marco sin senal: la marcacion conserva su hora real pero no hay traza GPS que validar.',
       'gps',
       'media',
       'automatico',
       false,
       false,
       false
FROM "Tenant" t
WHERE NOT EXISTS (
  SELECT 1 FROM th_tipos_novedad x
  WHERE x.tenant_id = t.id AND x.code = 'GPS_INACTIVO_SIN_SENAL'
);
