# Edicion administrativa especial de ordenes de servicio

## Objetivo

Permitir que un rol expresamente autorizado corrija una orden de servicio desde cualquier estado operativo valido, incluso cuando la orden este facturada o pagada. La funcion permite actualizar informacion, cambiar el estado, anexar novedades y administrar evidencias sin modificar automaticamente facturas, pagos, asientos ni saldos contables.

## Permiso unico

```text
services.orders.edit_any_state
```

El permiso aparece en Administracion > Roles y permisos como `Edicion especial de ordenes`.

La administracion persiste esta opcion como `servicios_correcciones.edit_any_state`. El cliente
y el API la normalizan a `services.orders.edit_any_state`, y al guardar un rol sus permisos se
propagan a los usuarios que ya lo tienen asignado.

- No se hereda de `services:write`.
- No se concede por llamarse `admin`, `owner` o `Administrador de empresa`.
- Un permiso comodin real `*:*` continua siendo valido.
- La API comprueba el permiso explicitamente en middleware y nuevamente en el servicio.
- Al asignar o revocar el permiso se conserva el mecanismo existente de invalidacion de autorizaciones.

## Capacidades

El permiso habilita una unica superficie administrativa para:

- Corregir observaciones, cliente, direccion, telefono, tipo de servicio, fecha programada y numero de factura registrado en la orden.
- Cambiar desde cualquier estado actual hacia cualquier estado reconocido diferente.
- Anexar una novedad administrativa.
- Registrar una pieza faltante o averiada dentro de la inspeccion, con cantidad, accion requerida, proveedor sugerido y foto opcional.
- Agregar una fotografia o soporte mediante carga autorizada y validacion binaria.
- Retirar evidencia mediante baja logica, conservando el archivo y la auditoria.
- Reabrir o cerrar administrativamente la orden.
- Consultar el historial completo de correcciones.

Estados reconocidos:

```text
agendado
pendiente
en_curso
inspeccion
ejecucion
cerrada
no_ejecutada
cancelada
revision
reabierta
lista_facturacion
```

No se aceptan estados libres o desconocidos.

## Pagos y facturacion

El estado financiero no bloquea la edicion especial. Una orden marcada como `INVOICED`, `READY_FOR_BILLING` o `PAID` admite las mismas correcciones operativas que cualquier otra orden.

La operacion no cambia de forma implicita:

- Estado de pago.
- Estado de facturacion.
- Bloqueos de facturacion.
- Facturas o documentos contables.
- Asientos, cuentas por cobrar o saldos.

El estado financiero observado al momento de la correccion se conserva en metadata para auditoria.

## Integridad transaccional

Se conservan los siguientes controles:

- Aislamiento obligatorio por `tenant_id`.
- Version optimista mediante `ServiceOrder.version` y `expected_version`.
- Respuesta `409` cuando otro usuario modifica la orden concurrentemente.
- Idempotencia opcional mediante `idempotency_key`.
- Transaccion Prisma para orden, evidencias, novedades, historial y auditoria.
- Detalle antes/despues inmutable mediante trigger PostgreSQL.
- Baja logica para evidencias retiradas.
- Cuarentena, firma binaria, MIME, tamano y checksum para nuevas evidencias.

La correccion se registra como `DRAFT` y el mismo usuario autorizado la aplica inmediatamente dentro del flujo controlado. Se conserva compatibilidad para aplicar registros historicos que ya estuvieran `APPROVED`, pero las nuevas operaciones no requieren un segundo permiso.

## API

Todas las rutas siguientes requieren `services.orders.edit_any_state`:

```text
POST /api/v1/services/orders/:id/corrections
GET  /api/v1/services/orders/:id/corrections
GET  /api/v1/services/orders/:id/corrections/:correctionId
POST /api/v1/services/orders/:id/corrections/:correctionId/apply
POST /api/v1/services/orders/:id/corrections/:correctionId/evidence
POST /api/v1/services/orders/:id/corrections/evidence-upload-authorizations
POST /api/v1/services/corrections/evidence-upload-authorizations/:id/confirm
POST /api/v1/services/orders/:id/reopen
POST /api/v1/services/orders/:id/force-close
```

Las rutas de aprobacion y rechazo permanecen temporalmente para compatibilidad con correcciones historicas pendientes y exigen el mismo permiso unico.

## Interfaz

La vista de detalle usa una superficie operativa de hasta 1440 px en escritorio y mantiene el flujo adaptable en movil.

El monitor de Servicios muestra la accion `Corregir` en cualquier estado cuando el usuario tiene
el permiso especial. La accion abre directamente el control administrativo del detalle para
corregir informacion o estado y anexar novedades o evidencias.

El panel organiza la correccion en tres pasos visibles: seleccionar la accion, definir el cambio y
justificar/revisar/guardar. Presenta cuatro acciones directas: `Editar informacion`, `Agregar novedad`,
`Reportar pieza` y `Anexar soporte`. Las operaciones menos frecuentes de estado, reapertura,
cierre y retiro de evidencia permanecen agrupadas como acciones administrativas.

El boton de guardado permanece accionable mientras el formulario esta incompleto para que, al
usarlo, muestre la lista exacta de requisitos pendientes. La interfaz tambien muestra en tiempo
real el comparativo antes/despues, el minimo de caracteres, la confirmacion de auditoria y la
etapa que se esta ejecutando. Si el registro se crea pero su aplicacion falla, informa el
identificador y permite reintentar desde el historial cuando no hay que volver a seleccionar un archivo.

El API rechaza con `409 SERVICE_CORRECTION_NO_CHANGES` cualquier actualizacion de campo cuyo
valor normalizado sea igual al vigente. Esto evita auditorias vacias y versiones incrementadas sin efecto.

El monitor solo ofrece `Corregir` para ordenes que tienen una identidad operable en el API y no
requieren primero completar la sincronizacion administrativa. Cuando la URL ya contiene parametros,
el modo de correccion se agrega con `&corregir=1` para conservar la identidad externa.

Una pieza faltante o averiada se agrega o actualiza en `metadata.inspection.items`, genera una
novedad de servicio y alimenta el reporte de piezas requeridas. Cuando incluye una foto, la pieza,
la novedad, la evidencia y el historial se guardan dentro de la misma transaccion y con una sola
actualizacion de version.

Para conservar compatibilidad con la restriccion inmutable del historial ya desplegado, el detalle
de una pieza se persiste como `FIELD_UPDATED` sobre `metadata.inspection.items`; la intencion
`PIECE_ISSUE_ADDED` permanece en la metadata de la correccion. No se requiere una migracion remota.

- El control administrativo queda junto al resumen principal de la orden.
- Las decisiones de inspeccion se distribuyen en tres columnas en escritorio.
- Las evidencias usan una galeria de hasta cuatro columnas.
- `PhotoCapture`, `SignatureCapture`, el editor administrativo y el generador PDF se cargan en fragmentos separados.
- Las preguntas de satisfaccion solo se consultan cuando la orden entra en ejecucion.

Esto reduce JavaScript y solicitudes innecesarias durante la carga inicial de una orden cerrada o en consulta administrativa.

## Modelo de datos

La migracion `20260731110000_service_order_administrative_corrections` agrega:

- Version y marca de modificacion administrativa en `ServiceOrder`.
- Campos de trazabilidad y baja logica en `ServicePhoto`.
- `ServiceOrderCorrection` para la cabecera y contexto de la operacion.
- `ServiceOrderCorrectionChange` para el historial antes/despues.
- Indices por empresa, orden, estado, fecha y evidencia.
- Un trigger que rechaza `UPDATE` y `DELETE` del detalle historico.

Los campos `billing_status` y `billing_blocked` permanecen por compatibilidad de esquema, pero esta funcion no los usa para bloquear ni alterar una correccion.

## Matriz minima de certificacion

Antes de cada promocion deben aprobarse:

1. Rol sin permiso: API `403` y control oculto.
2. Rol administrativo por nombre, sin permiso: API `403` y control oculto.
3. Rol con permiso: informacion, estado, novedad, pieza faltante o averiada, alta y retiro de evidencia.
4. Orden pagada y facturada: mismas operaciones, sin efectos contables laterales.
5. Todos los estados origen y todos los destinos reconocidos.
6. Estado desconocido o igual al actual: rechazo controlado.
7. Conflicto de version: `409` sin sobrescritura.
8. Repeticion idempotente: una sola correccion.
9. Empresa diferente: `404` o `403` sin fuga de datos.
10. Migracion sobre PostgreSQL temporal y verificacion de inmutabilidad.
11. Lint, TypeScript, build, pruebas API y pruebas web completas.
12. Validacion visual en escritorio y movil.
13. Empresa modelo Nyvora: flujo completo de alta de evidencia por UUID externo, persistencia tras recarga, rol limitado bloqueado y aislamiento de otro tenant.
14. Correccion maestra: edicion de campo, novedad, estado, alta y retiro de evidencia con recarga entre cada etapa, rechazo de cambio sin efecto e historial antes/despues.

El certificador versionado `npm run certify:service-master-correction:qa` comprueba el commit exacto
desplegado y ejecuta la matriz 14 contra una orden QA identificada, que deja finalmente cancelada.

El fixture versionado `scripts/certifications/fixtures/nyvora-service-correction.js` requiere `CONFIRM_NYVORA_FIXTURE=true`. Crea perfiles, tecnico y referencia visibles e idempotentes; las claves temporales se generan en memoria y nunca forman parte de logs o evidencias.

## Incidente de evidencia por identidad externa

La orden mostrada por el monitor puede usar un UUID externo mientras PostgreSQL conserva un ID local numerico. La autorizacion de carga debe resolver primero el UUID dentro del tenant y persistir siempre el ID local canonico en `EvidenceUploadAuthorization.order_key`. El alta final busca esa misma clave; guardar el UUID en una etapa y el ID local en otra deja el archivo validado pero imposible de anexar.

Las ordenes historicas pueden omitir `photos` y los historiales antiguos pueden omitir `changes`. La interfaz normaliza ambas colecciones a arreglos vacios para mantener operativa la correccion sin ocultar errores de API. Cada reintento de carga genera un `client_upload_id` nuevo, evitando colisiones con autorizaciones consumidas o expiradas.

## Promocion

La unica ruta autorizada es:

```text
desarrollo -> develop -> main
```

Cada promocion debe registrar hash origen, hash destino, resultado de pruebas, estado de migracion, respaldo, smoke test y mecanismo de rollback. No se debe promover un worktree con cambios no relacionados ni ejecutar force push o reescritura de historia.

## Evidencia de certificacion 2026-08-03

La implementacion fue certificada en `desarrollo` con los siguientes resultados:

- Pruebas API completas: 76 aprobadas, 0 fallidas.
- Pruebas web completas: 63 aprobadas, 0 fallidas.
- Pruebas focalizadas del permiso y de las correcciones: 16 aprobadas, 0 fallidas.
- ESLint, TypeScript, validacion Prisma y guardas de rendimiento: aprobados.
- Build de produccion Next.js: aprobado para 64 paginas.
- Vista de detalle verificada a 1440 x 900 y 390 x 844, sin desbordamiento horizontal.
- Migracion de la funcion aplicada dos veces sobre una base PostgreSQL temporal: idempotente.
- Certificador transaccional: version final 6, 5 entradas historicas, aislamiento entre empresas, inmutabilidad, cuarentena y promocion de evidencias aprobados.
- Rendimiento del certificador: promedio base 8.814 ms, p95 base 13.527 ms; promedio concurrente 9.939 ms, p95 concurrente 16.750 ms.

Existe una deuda anterior e independiente de esta funcion: una base PostgreSQL totalmente vacia no puede ejecutar de principio a fin el historial completo de migraciones porque `20260602...` presupone una relacion `Item` creada fuera de esa cadena. La migracion de correcciones no introduce ese problema y fue certificada sobre una copia temporal aislada del esquema vigente. Hasta normalizar el historial antiguo, no debe usarse `prisma migrate deploy` sobre una base local creada mediante `db push`; los entornos administrados deben validarse con su historial real antes de cualquier migracion remota.
