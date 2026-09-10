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

## Certificacion en SCJ QA

- Commit desplegado: `40738831c28d03c1c4448840f8c5f374959df94f`.
- Deploy API: `fc5b89a1-85d8-4434-b676-99f5f13353de`, estado `SUCCESS`.
- Deploy web: `3149a26f-456f-493e-b02d-57ddd556099e`, estado `SUCCESS`.
- Ejecucion: `hr_single_active_schedule_1789066724247`.
- Se montaron dos horarios temporales simultaneos para una identidad controlada de SCJ.
- `/hr/self/routes` devolvio exactamente un horario: el activo mas reciente (`80`).
- La marcacion sobre el horario alterno fue rechazada con `HORARIO_NO_ACTIVO`.
- La entrada sobre el horario activo fue aceptada y persistida exactamente una vez.
- Horarios, marcacion, sesion e identidad temporales fueron limpiados/desactivados al finalizar.

Estado: certificacion funcional SCJ QA aprobada. Produccion y `main` no estan autorizados ni fueron intervenidos.
