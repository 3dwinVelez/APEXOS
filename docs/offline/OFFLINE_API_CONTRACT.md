# Contrato conceptual de API offline

Estado: bootstrap de solo lectura implementado en Fase 3. Pull, push, estado y
evidencias permanecen como diseno para fases posteriores.

Todos los endpoints futuros usan `/api/v1/offline`, autenticacion actual,
capacidad autoritativa, JSON UTF-8, timestamps ISO-8601 UTC, UUID para IDs de
cliente y versiones enteras monotonas. El servidor deriva tenant y usuario.

## Capacidad implementada

`GET /capabilities` no recibe contexto por query. Devuelve la capacidad efectiva
derivada de sesion y allowlists. En Fase 3 solo puede habilitar
`offlineTechnician.enabled`; `readOnly=true` y sync, evidencia y auto-sync
permanecen falsas.

## Bootstrap implementado

`GET /bootstrap` no acepta parametros. Devuelve contexto autoritativo, reloj,
expiracion, ordenes asignadas minimizadas, actividades, checklists, catalogos,
`hasMore` y checkpoint opaco. La respuesta esta acotada y no se pagina en esta
fase; `hasMore=true` indica que no debe considerarse una copia completa.

## Pull incremental (no implementado)

`GET /sync/pull?checkpoint=&limit=&cursor=` devuelve cambios, tombstones de
asignaciones retiradas, versiones y siguiente checkpoint. Un checkpoint
desconocido o demasiado antiguo devuelve `410 CHECKPOINT_EXPIRED` y exige
bootstrap, sin borrar datos pendientes.

## Push por lote (no implementado)

`POST /sync/push` recibe `deviceId`, `batchId`, checkpoint observado y hasta 50
operaciones o 512 KiB, lo que ocurra primero. El payload binario esta prohibido.
Las operaciones se procesan independientemente, respetando orden causal por
entidad.

```json
{
  "operationId": "uuid",
  "type": "SERVICE_STARTED",
  "entityId": "server-id",
  "baseVersion": 3,
  "occurredAt": "2026-07-27T15:00:00.000Z",
  "payload": {}
}
```

Resultado:

```json
{
  "operationId": "uuid",
  "status": "APPLIED",
  "serverEntityId": "uuid",
  "serverVersion": 4,
  "processedAt": "2026-07-27T15:00:01.000Z",
  "error": null,
  "conflict": null
}
```

Estados: `APPLIED`, `ALREADY_APPLIED`, `RETRYABLE_ERROR`, `REJECTED`,
`CONFLICT`, `BLOCKED`. HTTP `200` o `207` puede contener resultados mixtos; un
error de transporte o envoltura invalida el lote, no los resultados ya
confirmados en una respuesta anterior.

## Estado (no implementado)

`GET /sync/status?operationId=` devuelve recibos por IDs solicitados, capacidad
y hora servidor. Sirve para resolver una respuesta perdida antes de reintentar.

## Evidencia (no implementado)

`POST /evidence/prepare` recibe operationId, orden, hash SHA-256, MIME, bytes y
dimensiones. Devuelve autorizacion corta y destino de cuarentena, o el recibo
existente. Limite inicial: una evidencia, 2 MiB y 4096 px por lado, sujeto a la
politica autoritativa existente.

`POST /evidence/confirm` recibe autorizacion y operationId. El backend verifica
objeto, bytes, firma, MIME, dimensiones, hash, asignacion y estado; luego
promueve y devuelve version/recibo. Nunca acepta una URL arbitraria del cliente.

## Errores y conflictos

Cada error incluye `category`, `code`, `message`, `retryAfterMs` opcional y
campos corregibles. Categorias: `NETWORK`, `AUTHENTICATION`, `AUTHORIZATION`,
`VALIDATION`, `CONFLICT`, `RATE_LIMIT`, `SERVER`, `STORAGE`, `UNKNOWN`.

Un conflicto incluye entidad, version base, version servidor, campos afectados,
regla y acciones permitidas; no incluye datos que el usuario ya no puede leer.
Los mensajes son informativos, los codigos son estables.

## Idempotencia, versiones y checkpoints

- `operationId` identifica el evento durante toda su vida.
- `batchId` correlaciona transporte y no reemplaza idempotencia por operacion.
- El mismo ID con payload distinto devuelve `409 IDEMPOTENCY_MISMATCH`.
- La version aumenta solo al aplicar un cambio autoritativo.
- El checkpoint es opaco, ligado a tenant/usuario/dispositivo y no editable.
- Pull y push aceptan paginacion/lotes limitados; nunca respuestas sin cota.

## Endpoints existentes reutilizados internamente

Las reglas de `startOrder`, inspeccion, ejecucion, cierre, incidentes y
evidencias autorizadas se reutilizan desde servicios de dominio. Los endpoints
actuales no se invocan en cascada ni cambian de contrato. Auth, tenancy, RBAC y
estado de autorizacion siguen siendo precondiciones.
