# Validacion local: horario diario unico

- Rama de implementacion: `desarrollo`.
- Commit funcional: `a1006bcf3999b5644125c4d782909abf4253a8af`.
- Problema: `/hr/self/routes` devolvia todas las mallas coincidentes para el empleado y la fecha actual; la pantalla trasladaba la ambiguedad al usuario mediante un selector.
- Regla implementada: jornada activa, luego ultima marcacion del dia y, si aun no existe actividad, asignacion operativa mas reciente.
- Los horarios cerrados, completados, cancelados o inactivos no son candidatos.
- Los endpoints `self` rechazan con `HORARIO_NO_ACTIVO` cualquier intento de operar un horario alterno.
- La pantalla de marcacion ya no presenta selector ni exige que el empleado decida entre mallas.
- No se modificaron esquema, migraciones, RLS, RBAC, datos remotos ni otros modulos.

## Evidencia automatizada

- `node --test apps/api/test/hr-*.test.js`: 25 aprobadas, 0 fallidas.
- `node --test apps/web/test/hr-marking-only-access.test.mjs`: 6 aprobadas, 0 fallidas.
- `npm --workspace apps/web run typecheck`: aprobado.
- `git diff --check`: aprobado.

## Estado

Validacion local aprobada. La certificacion funcional sobre SCJ QA y cualquier promocion a `develop` permanecen pendientes de autorizacion expresa independiente.
