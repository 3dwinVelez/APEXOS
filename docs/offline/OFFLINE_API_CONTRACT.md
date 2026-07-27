# Contrato conceptual de API offline

Estado: diseno, sin endpoints implementados.

Todos los endpoints futuros usan `/api/v1/offline`, autenticacion actual,
capacidad autoritativa, JSON UTF-8, timestamps ISO-8601 UTC, UUID para IDs de
cliente y versiones enteras monotonas. El servidor deriva tenant y usuario.

## Bootstrap

`GET /bootstrap?deviceId=&limit=&cursor=` devuelve capacidad, reloj de servidor,
ordenes asignadas minimizadas, catalogos permitidos, `nextCursor`,
`checkpoint` y expiracion. Es paginado y repetible; el checkpoint se activa
solo al completar todas las paginas.

## Pull incremental

`GET /sync/pull?checkpoint=&limit=&cursor=` devuelve cambios, tombstones de
asignaciones retiradas, versiones y siguiente checkpoint. Un checkpoint
desconocido o demasiado antiguo devuelve `410 CHECKPOINT_EXPIRED` y exige
bootstrap, sin borrar datos pendientes.

## Push por lote

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

## Estado

`GET /sync/status?operationId=` devuelve recibos por IDs solicitados, capacidad
y hora servidor. Sirve para resolver una respuesta perdida antes de reintentar.

## Evidencia

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

