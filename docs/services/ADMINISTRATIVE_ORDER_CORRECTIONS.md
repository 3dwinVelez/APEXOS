# Correccion administrativa controlada de ordenes de servicio

## Alcance y diagnostico previo

La implementacion se realizo exclusivamente en `desarrollo`. No se hicieron push, merge, despliegues, cambios remotos ni operaciones sobre Railway o Supabase.

El flujo existente usa `ServiceOrder` con estados de texto (`agendado`, `pendiente`, `en_curso`, `inspeccion`, `ejecucion`, `cerrada`, `no_ejecutada`), checklist y encuesta en `metadata`, incidencias en `ServiceIncident` y evidencias en `ServicePhoto`. El aislamiento se aplica con `tenant_id`, `runWithTenant` y filtros explicitos. RBAC usa pares `module/action`. La facturacion no tiene una relacion directa con la orden: se identifica por `invoice_number`, `billing_status` y metadata financiera. Offline conserva capacidades de tecnico de solo lectura/operacion y no incorpora permisos administrativos.

Riesgos identificados antes de implementar:

- Una edicion libre de `ServiceOrder` perderia el valor original.
- `ServicePhoto` no tenia retiro logico.
- No existia version optimista de la orden.
- Los estados eran abiertos y necesitaban una matriz administrativa separada.
- Una evidencia administrativa no podia omitir cuarentena, firma binaria, MIME, tamano, dimensiones, checksum o pertenencia.
- Las ordenes facturadas o pagadas necesitaban bloqueo explicito.

## Arquitectura implementada

- `ServiceOrderCorrection`: cabecera, motivo, descripcion, version esperada, estado, solicitante, aprobador, sensibilidad, impacto financiero, idempotencia y metadata de sesion/IP.
- `ServiceOrderCorrectionChange`: diff inmutable con valor anterior/nuevo, estado anterior/nuevo, tipo y evidencia relacionada.
- `ServiceOrder.version`: bloqueo optimista; una version diferente produce `409`.
- `ServicePhoto.active`: retiro logico con fecha, usuario, motivo y correccion. El archivo original permanece.
- `AuditLog`: registra aplicacion, version, usuario, sesion, IP y entidad.
- Cada aplicacion usa una transaccion Prisma con `maxWait` de 5 s y `timeout` de 20 s.
- El trigger `ServiceOrderCorrectionChange_immutable` impide `UPDATE` y `DELETE` del detalle historico.

Estados de correccion: `DRAFT`, `PENDING_APPROVAL`, `APPROVED`, `APPLIED`, `REJECTED`, `REVERTED`.

Tipos de cambio: `FIELD_UPDATED`, `EVIDENCE_ADDED`, `EVIDENCE_REMOVED`, `STATUS_CHANGED`, `ORDER_REOPENED`, `ORDER_FORCE_CLOSED`, `OBSERVATION_ADDED`.

## Permisos

- `services.orders.administrative_correction`
- `services.orders.correct_information`
- `services.orders.change_state`
- `services.orders.add_observation`
- `services.orders.manage_evidence`
- `services.orders.force_close`
- `services.orders.view_correction_history`
- `services.orders.approve_correction`

Los permisos se comprueban en middleware y nuevamente en el servicio segun el tipo de cambio. `services:write` no concede capacidades de correccion. El catalogo de roles permite asignarlos de forma independiente.

## Matriz administrativa

| Desde | Hacia |
| --- | --- |
| `ejecucion` | `cerrada` |
| `cerrada` | `revision`, `reabierta` |
| `no_ejecutada` | `reabierta` |
| `revision` | `cerrada`, `lista_facturacion` |
| `reabierta` | `cerrada`, `revision` |
| `correccion_administrativa` | `revision` |
| `lista_facturacion` | `revision` |

El cierre forzado solo se prepara desde `en_curso`, `inspeccion`, `ejecucion`, `reabierta` o `revision`, exige revision de evidencias, observacion y lista visible de pendientes. Reapertura y cierre forzado siempre requieren aprobacion independiente.

## Facturacion y pagos

- `UNBILLED`: admite correcciones segun permisos.
- `READY_FOR_BILLING`: una correccion material devuelve la orden a `revision`, bloquea facturacion y marca `IN_REVIEW`.
- `INVOICED`: bloquea cambios financieros y altas/retiros de soporte; requiere un ajuste financiero formal externo a este flujo.
- `PAID`: solo admite observaciones o notas no financieras.
- Una reapertura conserva el cierre anterior en metadata y activa `billing_blocked` hasta nueva revision/cierre.
- El cierre administrativo conserva pendientes y mantiene el bloqueo para revision.

## API

- `POST /services/orders/:id/corrections`
- `GET /services/orders/:id/corrections`
- `GET /services/orders/:id/corrections/:correctionId`
- `POST /services/orders/:id/corrections/:correctionId/apply`
- `POST /services/orders/:id/corrections/:correctionId/approve`
- `POST /services/orders/:id/corrections/:correctionId/reject`
- `POST /services/orders/:id/reopen`
- `POST /services/orders/:id/force-close`
- `POST /services/orders/:id/corrections/evidence-upload-authorizations`
- `POST /services/corrections/evidence-upload-authorizations/:id/confirm`
- `POST /services/orders/:id/corrections/:correctionId/evidence`

## Interfaz

El detalle de la orden muestra `Control administrativo` solo a usuarios autorizados. Incluye motivo, descripcion, version, confirmacion, comparacion anterior/nuevo, cambios de estado permitidos, observaciones, alta y retiro de evidencias, reapertura, cierre forzado, historial, aprobacion/rechazo y etiqueta de orden modificada. Los controles usan el permiso especifico y el backend mantiene la autoridad final.

## Evidencia de validacion

- Pruebas nuevas: 15/15 correctas, incluida la carrera de aprobacion.
- TypeScript: correcto.
- ESLint focalizado: correcto.
- Build Next.js 15.5.22: correcto, 64 paginas generadas.
- Prisma validate/generate: correcto.
- Offline CSP/panel: 9/9 correctas; el panel offline no incorpora controles administrativos.
- Certificacion PostgreSQL temporal: 5 correcciones, version final 6, aislamiento cruzado bloqueado, historial inmutable, retiro logico, reapertura y cierre controlados.
- Evidencia: preautorizacion, URL firmada local, cuarentena, validacion binaria, dimensiones, checksum, promocion y asociacion administrativa correctas.
- Rendimiento local final, 30 muestras: detalle base promedio 7.493 ms (p95 10.222 ms); detalle e historial en paralelo promedio 9.695 ms (p95 13.993 ms). El historial se carga bajo demanda.

La suite API global obtuvo 78/78 con `REDIS_DISABLED=true`, configuracion explicita apropiada para pruebas puras sin colas. La suite offline completa obtuvo 49/49 despues de fijar un reloj determinista en sus fixtures y hacer que el servicio de lectura use el estado de retencion calculado por el repositorio.

## Migracion y dictamen

Migracion local creada: `20260731110000_service_order_administrative_corrections`. Fue aplicada y certificada en una base PostgreSQL temporal, posteriormente eliminada. No se aplico a la base local habitual, QA ni produccion.

Dictamen: **aprobado localmente** para continuar en `desarrollo`. Antes de promover se debe corregir la configuracion administrada de QA, ejecutar la migracion en un ambiente QA controlado, configurar los permisos de roles administrativos y certificar la API y el almacenamiento reales de QA.

## Informe final de certificacion

### 1. Resumen ejecutivo

La funcionalidad quedo implementada y certificada exclusivamente en el worktree de `desarrollo`. Los controles funcionales, RBAC, aprobacion independiente, concurrencia, aislamiento por empresa, auditoria, evidencias, reglas financieras y suites globales resultaron correctos. No hubo commit, push, merge, despliegue ni acceso a QA, Railway, Supabase o produccion. La promocion permanece bloqueada exclusivamente por las compuertas de configuracion administrada y certificacion remota.

### 2. Funcionalidad implementada

Se incorporo creacion, aplicacion, aprobacion, rechazo, reapertura, cierre administrativo, correccion de informacion, nuevas observaciones, cambio controlado de estado, alta segura y retiro logico de evidencias, historial antes/despues y bloqueo optimista por version.

### 3. Arquitectura final

La API mantiene la autoridad mediante RBAC granular y transacciones Prisma. La UI solo presenta acciones permitidas. `ServiceOrderCorrection` conserva la solicitud y su ciclo de vida; `ServiceOrderCorrectionChange` conserva el detalle inmutable; `AuditLog` registra la aplicacion. El detalle de orden y el historial se consultan en paralelo y el historial esta limitado a 100 entradas, evitando una consulta por cada correccion.

### 4. Archivos creados y modificados

Modificados:

- `apps/api/prisma/schema.prisma`
- `apps/api/src/core/prisma.js`
- `apps/api/src/middleware/rbac.js`
- `apps/api/src/modules/admin/service.js`
- `apps/api/src/modules/services/routes.js`
- `apps/api/src/modules/services/schema.js`
- `apps/api/src/modules/services/service.js`
- `apps/web/app/dashboard/servicios/[id]/page.tsx`
- `package.json`

Creados:

- `apps/api/prisma/migrations/20260731110000_service_order_administrative_corrections/migration.sql`
- `apps/api/src/modules/services/administrativeCorrections.js`
- `apps/api/test/service-order-administrative-corrections.test.js`
- `apps/web/components/services/AdministrativeCorrectionPanel.tsx`
- `scripts/certify-service-order-corrections-local.js`
- `docs/services/ADMINISTRATIVE_ORDER_CORRECTIONS.md`

`apps/web/next-env.d.ts` fue alterado mecanicamente por Next.js durante el build y se restaura antes del cierre.

### 5. Modelo de datos y migracion

La migracion agrega version, estado y bloqueo de facturacion a `ServiceOrder`; baja logica y trazabilidad administrativa a `ServicePhoto`; las tablas `ServiceOrderCorrection` y `ServiceOrderCorrectionChange`; claves foraneas restrictivas; indices por tenant, orden, estado, fecha y evidencia; unicidad de idempotencia; y un trigger que rechaza `UPDATE` y `DELETE` del detalle historico.

### 6. Permisos incorporados

- `services.orders.administrative_correction`
- `services.orders.correct_information`
- `services.orders.change_state`
- `services.orders.add_observation`
- `services.orders.manage_evidence`
- `services.orders.force_close`
- `services.orders.view_correction_history`
- `services.orders.approve_correction`

Un permiso heredado como `services:write` no concede estas capacidades.

### 7. Matriz final de transiciones

| Origen | Destinos administrativos |
| --- | --- |
| `ejecucion` | `cerrada` |
| `cerrada` | `revision`, `reabierta` |
| `no_ejecutada` | `reabierta` |
| `revision` | `cerrada`, `lista_facturacion` |
| `reabierta` | `cerrada`, `revision` |
| `correccion_administrativa` | `revision` |
| `lista_facturacion` | `revision` |

El cierre forzado solo se admite desde `en_curso`, `inspeccion`, `ejecucion`, `reabierta` o `revision` y exige confirmar revision de evidencias.

### 8. Reglas de aprobacion

Los cambios sensibles quedan en `PENDING_APPROVAL`. El creador recibio `403 SERVICE_CORRECTION_SELF_APPROVAL_FORBIDDEN` al intentar autoaprobar. Un usuario diferente con permiso exclusivo de aprobacion aprobo y rechazo correctamente, pero recibio `403 PERMISO_DENEGADO` al intentar aplicar porque no tenia `administrative_correction`.

### 9. Reglas de facturacion y pago

Una orden `INVOICED` rechazo cambios financieros con `409 SERVICE_ORDER_INVOICED_LOCKED`. Una orden `PAID` rechazo reapertura con `409 SERVICE_ORDER_PAID_LOCKED` y solo admite notas no financieras. Una correccion material sobre `READY_FOR_BILLING` termino en `revision`, `IN_REVIEW`, `billing_blocked=true` y version incrementada.

### 10. Gestion de evidencias

El alta paso por preautorizacion, URL firmada local, cuarentena, validacion binaria, MIME, tamano, dimensiones, checksum, promocion y eliminacion del objeto de cuarentena. El retiro marco `active=false`, con fecha, usuario, motivo y correccion; no elimino el registro ni el archivo original. La consulta normal filtra evidencias activas y la auditoria conserva la referencia retirada.

### 11. Auditoria e inmutabilidad

El historial conserva usuario, motivo, descripcion, version, contexto y valores anterior/nuevo. La API no publica endpoints de mutacion o borrado del detalle. Directamente en PostgreSQL, intentos separados de `UPDATE` y `DELETE` devolvieron `ServiceOrderCorrectionChange is immutable`; la fila siguio presente.

### 12. Concurrencia e idempotencia

Una version deliberadamente obsoleta produjo `409 SERVICE_ORDER_VERSION_CONFLICT` y cero filas persistidas. La aplicacion usa `updateMany` condicionado por tenant, id y version dentro de la transaccion. La clave de idempotencia es unica por tenant y orden; una correccion ya aplicada se devuelve sin repetir efectos.

### 13. Seguridad multiempresa

Las consultas y escrituras pasan por `runWithTenant`, incluyen `tenant_id` y verifican que la orden pertenezca a la empresa. La certificacion PostgreSQL rechazo la consulta cruzada con `404`; la prueba automatizada rechazo tambien la creacion cruzada con `404`. Ningun dato de otro tenant fue modificado.

### 14. Compatibilidad offline

No se agregaron tablas, permisos, colas ni acciones administrativas al flujo offline. Las 9 pruebas focalizadas de CSP y panel pasaron. Un tecnico restringido mantuvo su flujo normal de inicio, inspeccion, ejecucion y cierre, sin visualizar `Control administrativo` ni historial.

### 15. Resultado de pruebas especificas

- `npm run test:service-corrections`: 15/15.
- `npm run prisma:validate`: correcto.
- `npm run prisma:generate`: correcto.
- TypeScript web: correcto.
- ESLint focalizado desde `apps/web`: correcto.
- Build Next.js 15.5.22: correcto, 64 paginas.
- Offline CSP/panel focalizado: 9/9.
- Certificacion funcional PostgreSQL: correcta, version final 6 e historial de 5 correcciones.

### 16. Resultado de pruebas globales

- API completa actual con `REDIS_DISABLED=true`: 78/78.
- Offline completa actual: 49/49.
- Correcciones administrativas focalizadas: 15/15.
- ESLint global del workspace web: correcto.
- TypeScript web: correcto.
- Build Next.js: correcto, 64 paginas generadas.

### 17. Validacion visual en escritorio y movil

En 1440x1000 el panel, formulario, historial, comparacion antes/despues y controles quedaron visibles, estables y sin desbordamiento (`scrollWidth=1430`, viewport 1440). En 390x844 no hubo desbordamiento (`scrollWidth=380`, viewport 390) y los controles quedaron dentro de 330 px utiles. No hubo errores ni advertencias de consola. Con usuario tecnico, el detalle de la orden cargo normalmente y los conteos de panel e historial administrativo fueron cero.

### 18. Metricas de rendimiento

Sobre 30 muestras locales finales: detalle base promedio 7.493 ms, p95 10.222 ms; detalle mas historial en paralelo promedio 9.695 ms, p95 13.993 ms. El historial usa una consulta acotada con `include` de cambios, sin patron N+1.

### 19. Incidencias corregidas durante la certificacion

Los nueve fallos offline provenian de fixtures con expiracion fija anterior al reloj del sistema. Se inyecto un reloj determinista en todos los adaptadores de prueba y `snapshotState` paso a respetar el estado de retencion que calcula el repositorio. La suite completa quedo en 49/49.

El certificador funcional ahora carga `.env` antes de inicializar Prisma y rechaza cualquier base cuyo nombre no cumpla `apexos_correction_cert_*`. La evidencia se ejecuta unicamente sobre una copia PostgreSQL desechable; la base completa y su dump se eliminan al terminar, evitando limpiezas parciales sobre bases compartidas.

La migracion se aplico dos veces sobre una copia temporal de la base local. La segunda aplicacion fue idempotente y `prisma migrate diff` devolvio `No difference detected`. La base y el dump temporales fueron eliminados al terminar.

### 20. Estado exacto del worktree

La certificacion partio de `desarrollo` en `309ec764b66aa0448d60915352429f797b6d31ca`, que contiene el ajuste previo y aislado del iniciador de Windows. En ese momento `origin/desarrollo` estaba en `91bd015a80c8c92457ca1869232a23a5bb8b996a`, `develop` en `26b13313ed1354365d8e052e96f130931e718d7f` y `main` en `e14a8443616683eea3e468a95e59a0386efd4f33`. La entrega funcional se consolida en un unico commit trazable sobre esa base; no modifica directamente los worktrees ni referencias de `develop` o `main`.

### 21. Riesgos y observaciones pendientes

- Ejecutar la migracion y el flujo de almacenamiento en QA requiere autorizacion independiente.
- Asignar los nuevos permisos a roles reales requiere una decision de gobierno.
- No existe evidencia en almacenamiento remoto real porque fue expresamente excluido.

### 22. Dictamen

**APROBADO LOCALMENTE** en `desarrollo`. No hay fallos funcionales, de seguridad, aislamiento, auditoria, concurrencia, evidencias, facturacion, suites globales, build o migracion temporal. Este dictamen no autoriza por si solo migraciones ni promociones remotas: las compuertas QA y produccion descritas abajo siguen siendo obligatorias.

### 23. Compuerta de promocion multiambiente

- `desarrollo`: codigo, migracion, build, lint, TypeScript, Prisma, rendimiento, API 78/78, offline 49/49 y certificacion PostgreSQL local aprobados.
- Migracion local temporal: aplicada dos veces sin error; `prisma migrate diff` devolvio `No difference detected` entre la base migrada y `schema.prisma`.
- `develop`/QA: bloqueado. El worktree no contiene `config/qa.env`; el archivo administrado encontrado en el repositorio principal fallo el doctor reforzado porque apunta a PostgreSQL local y no declara `EXPECTED_ENVIRONMENT` ni `EXPECTED_SUPABASE_PROJECT_REF`. Debe corregirse mediante el gestor de secretos, respaldar la base, aplicar la migracion QA y repetir la certificacion contra API y almacenamiento QA reales.
- `main`/produccion: bloqueado. El archivo administrado encontrado fallo el doctor reforzado porque no declara `EXPECTED_ENVIRONMENT` ni `EXPECTED_SUPABASE_PROJECT_REF`. Ademas requiere dictamen QA `APROBADO`, identificador de release, plan de rollback, respaldo y ventana de migracion autorizada.
- No se ejecutaron migraciones remotas, despliegues ni operaciones sobre Railway o Supabase durante esta certificacion.
