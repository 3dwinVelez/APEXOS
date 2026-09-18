# QA Gate — 8 módulos núcleo

## Candidato y ambiente

- Rama de trabajo: `desarrollo`.
- API QA observada: `8932809b7297` mediante `/health`.
- `origin/develop` contiene después únicamente commits de evidencia; no cambia el runtime respecto del SHA desplegado.
- Producción no fue utilizada.

## Cobertura

La certificación ejecutó Dashboard, Inventario, Compras, Ventas, Servicios, Transporte, Talento Humano y Contabilidad con:

- navegación de rutas web;
- lectura autenticada por módulo;
- denegación anónima por módulo protegido;
- 40 lecturas concurrentes, cinco por módulo;
- creación y consulta de datos sintéticos en inventario, compras, servicios, transporte, HR y contabilidad;
- inicio de servicio, evidencia fotográfica y PDF;
- GPS, marcación y actividad con evidencia;
- desactivación comprobada de los usuarios sintéticos.

## Ejecuciones

### Intento 1 — `QA-FULL-20260917211117`

- 161 passed, 3 failed, 0 blocked, 0 warnings.
- `INVALID_SERVICE_TYPE`: defecto del fixture; usaba el literal `mantenimiento` en vez de consultar un tipo activo.
- Dos respuestas `404 NO_ENCONTRADO` al desactivar usuarios recién creados.
- Después de las respuestas 404, el login de ambos usuarios fue rechazado con 401: la escritura de desactivación sí ocurrió.

### Intento 2 — `QA-FULL-20260917211534`

- 167 passed, 0 failed, 0 blocked, 2 warnings.
- El fixture consultó `/services/service-types`, creó e inició correctamente la orden y verificó fotos y PDF.
- Las 40 lecturas concurrentes aprobaron.
- Los dos usuarios sintéticos quedaron inactivos, confirmado por login 401.
- El endpoint de estado volvió a responder 404 después de desactivar cada usuario.

## Defecto de producto confirmado

`PATCH /api/v1/admin/users/:id/status` aplica `active=false` y revoca sesiones, pero luego intenta releer al usuario con el filtro global de soft-delete que añade `active=true`. La lectura final no encuentra al usuario recién desactivado y Fastify traduce Prisma `P2025` a `404 NO_ENCONTRADO`.

Parche mínimo aplicado localmente en `desarrollo`: la lectura final de `setUserActive` consulta con `__includeInactive: true`. La regresión local demuestra retorno exitoso con estado inactivo, revocación de sesiones y rechazo cross-tenant. La recertificación remota permanece pendiente hasta que este parche sea desplegado de forma autorizada en QA.

## Higiene de fixtures

Usuarios de las dos ejecuciones nuevas comprobados como inactivos:

- tenant `51adcbb8-c3d4-4bbc-a52d-481065c20af4`: usuarios 313 y 314;
- tenant `0713e507-7938-44dd-9516-e60760886962`: usuarios 315 y 316.

Los tenants y registros funcionales sintéticos permanecen para auditoría porque no existe un endpoint seguro de purge. Recomendación: cuarentenarlos con `Tenant.active=false` mediante una operación QA explícita y transaccional, validando primero el prefijo `QA Full Validation QA-FULL-`. No ejecutar borrado físico ni tocar producción.

El run heredado `QA-FULL-20260917150839` también dejó el tenant `b543a6c5-fc1f-491d-a196-dc05a5d7db7f` y usuario 312; debe incluirse en la misma cuarentena controlada.

## Dictamen

`APTO CON OBSERVACIONES` para los ocho módulos certificados. No hay fallos funcionales en la segunda ejecución. El flujo administrativo activar/desactivar usuarios queda `PENDIENTE QA`: el defecto 404 está corregido y probado localmente, pero todavía no ha sido desplegado ni recertificado en el ambiente remoto.
