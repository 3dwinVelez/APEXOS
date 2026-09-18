# Revision de seguridad — hr-monitor-silent-failures-20260918

Revisor: experto apexos-seguridad (Equipo APEXOS)
Fecha: 2026-09-18
Alcance: diff completo de la intervencion en el worktree desarrollo-controlled-promotion (rama `desarrollo`).

## Hallazgos

### 1. POST /admin/platform-logs/client sin `requirePermission("admin", "read")` — APROBADO (riesgo residual Bajo)

- La ruta conserva los hooks globales `fastify.authenticate` y `tenancy`: solo usuarios autenticados del tenant pueden registrar telemetria de cliente. Sin token: 401.
- El listado `GET /admin/platform-logs` conserva `requirePermission("admin", "read")`: los operarios no pueden leer los logs del tenant; el canal de escritura no habilita lectura.
- Acotacion de abuso (flooding): rate-limit global de 200 req/min por tenant (`server.js` keyGenerator `tenant_id || ip`) aplica a la ruta; el mensaje se trunca a 1000 caracteres (`admin/service.js`), el detalle a 2000 y el stack a 6 lineas (`fabric/platformLogs.js`).
- Redaccion: `recordPlatformLog` aplica `redactSensitive` antes de persistir; no se aceptan campos arbitrarios (payload reconstruido campo a campo).
- Riesgo residual: un usuario puede auto-reportar logs falsos (suplantacion de contenido de su propia telemetria). Severidad Baja por tratarse de un canal de auto-reporte diagnostico; la mitigacion operativa es el marcado `source: "frontend"` en cada registro.

### 2. `err.details` en respuestas 409 de marcacion — APROBADO (sin hallazgos)

- `HORARIO_FUERA_DEL_DIA` y `HORARIO_NO_ACTIVO` exponen `route_date`, `today` y `active_route_id`.
- `active_route_id` proviene de `resolveOwnRouteForToday`, que filtra por `routeAssignedToEmployee`: solo rutas asignadas al propio empleado. No hay fuga cross-employee ni cross-tenant.
- Los campos son fechas ISO y un id numerico de ruta propia: informacion necesaria para que el cliente movil resincronice su cache sin reintentar en bucle.

### 3. `normalizeRouteNotes` en hr/service.js — APROBADO (sin hallazgos)

- Transformacion pura de string (reemplazo del escape literal `\n`); no construye SQL, HTML ni comandos.
- Las notas normalizadas se renderizan en React, que escapa el texto: sin superficie XSS nueva.

## Veredicto

Los tres cambios de la intervencion pasan la revision de seguridad sin hallazgos criticos, altos o medios. Riesgo residual bajo documentado en el hallazgo 1, mitigado por rate-limit global, truncado, redaccion y canal de solo-escritura.
