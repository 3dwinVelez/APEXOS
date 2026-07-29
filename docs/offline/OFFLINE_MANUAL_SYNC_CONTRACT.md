# Contrato de sincronizacion manual offline

Fecha: 2026-07-29. Fase: 5. Alcance: `TEST_OPERATION`.

## Endpoint

`POST /api/v1/offline/sync/push`

El servidor deriva ambiente, empresa, usuario, rol y permisos desde la sesion. El
cliente solo declara `installationId` y un lote de operaciones. Se rechazan
campos desconocidos y cualquier tipo distinto de `TEST_OPERATION`.

Limites autoritativos:

- 20 operaciones por lote.
- 256 KiB por solicitud.
- 15 segundos por procesamiento.
- 6 solicitudes por minuto, agrupadas por empresa y usuario.

## Solicitud

```json
{
  "installationId": "uuid",
  "operations": [
    {
      "operationId": "uuid",
      "idempotencyKey": "string",
      "operationType": "TEST_OPERATION",
      "payload": { "marker": "string" },
      "baseVersion": 0,
      "createdAtDevice": "ISO-8601"
    }
  ]
}
```

## Respuesta

La respuesta devuelve el contexto autoritativo y un resultado independiente por
operacion. Los estados son `APPLIED`, `ALREADY_APPLIED`, `RETRYABLE_ERROR`,
`REJECTED`, `CONFLICT` y `BLOCKED`.

`APPLIED` y `ALREADY_APPLIED` confirman la operacion local. Errores temporales
conservan la operacion como reintentable. Rechazos de autorizacion o validacion
la bloquean. El cliente rechaza una respuesta cuyo contexto no coincida con la
base local abierta.

## Idempotencia

`OfflineSyncReceipt` mantiene dos restricciones unicas por ambiente, empresa y
usuario: una para `operationId` y otra para `idempotencyKey`. La instalacion
queda ligada al primer recibo y un replay desde otra instalacion se rechaza. El
hash SHA-256 cubre tipo, payload, version base y fecha del dispositivo usando
JSON canonico.

La busqueda de recibo, la ejecucion del handler sintetico y la creacion del
recibo se realizan en una unica transaccion PostgreSQL. Una violacion `P2002`
durante una carrera se resuelve leyendo el recibo ganador, sin duplicar efectos.

- Repeticion exacta: `ALREADY_APPLIED`.
- Misma clave con contenido diferente: `REJECTED / IDEMPOTENCY_MISMATCH`.
- Carrera concurrente: un solo recibo.
- Retencion inicial del recibo: 30 dias.

## Cliente

La cola entrega solo la siguiente operacion ejecutable: una dependencia no
confirmada impide enviar sus descendientes. Antes de transmitir, el servicio
reclama la operacion como `PROCESSING`; si otra pestana gana la carrera, no se
duplica el envio.

- 401: bloqueo por autenticacion.
- 403: bloqueo por autorizacion.
- 409: conflicto.
- 422: bloqueo por validacion.
- 429, 5xx, timeout o red: reintentable.

## Exclusiones

No existen handlers de inicio/cierre de servicio, actividades, checklist,
observaciones, ubicacion o evidencias. No hay sincronizacion automatica,
Background Sync ni Service Worker. La unica persistencia servidor de esta fase
es el recibo sintetico.
