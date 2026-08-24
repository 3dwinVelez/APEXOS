# Regresión del cambio

Fecha: 2026-08-24

## Capacidades verificadas

- RBAC existente conserva el permiso histórico `hr` y admite el permiso puntual `time_tracking` solo en las rutas `/hr/self/*`.
- Los endpoints globales de Talento Humano continúan protegidos por `hr` y no se abrieron al nuevo rol.
- La autenticación local y el proveedor Supabase preservan `access_profile: marking_only`.
- El flujo web normal conserva su `Sidebar`, `MobileNav` y asistente; la carcasa reducida solo se activa para `marking_only`.
- La compilación web y el chequeo de tipos completaron correctamente.

## Pruebas automatizadas

- `apps/api/test/hr-marking-only-rbac.test.js`
- `apps/api/test/supabase-company-context.test.js`
- `apps/web/test/hr-marking-only-access.test.mjs`
- Suites RBAC y acceso web adyacentes incluidas en la ejecución consolidada.

La regresión transversal completa de todos los módulos se ejecutará obligatoriamente sobre `develop` antes de considerar una promoción posterior.
