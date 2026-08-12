# Matriz de conflictos offline

No se adopta ultima escritura gana. `409` representa conflicto revisable,
`422` rechazo definitivo, `423` bloqueo por estado/autorizacion y `200` un
resultado aplicado o idempotente dentro de la respuesta por operacion.

| Operacion | Entidad / actor | Version base | Cambio concurrente | Prioridad y resultado | Codigo | Estado local / accion del tecnico | Humana |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Inicio de servicio | ServiceOrder / tecnico asignado | Obligatoria | Cancelacion, reasignacion o inicio por otro actor | Servidor gana en cancelacion/reasignacion; si el mismo evento ya existe devuelve recibo | 200, 409, 423 | `SYNCED`, `CONFLICT` o `BLOCKED`; consultar detalle o escalar | Si en reasignacion |
| Finalizacion solicitada | ServiceOrder / tecnico asignado | Obligatoria | Cierre, cancelacion o checklist incompleto | Cierre servidor prevalece; solicitud no cierra por si sola; requisitos se revalidan | 200, 409, 422, 423 | Conservar solicitud; corregir requisitos o escalar | Si estado incompatible |
| Actividad completada | ServiceReferencePart o actividad / tecnico | Obligatoria | Cambio de definicion, eliminacion o cierre | No aplicar sobre definicion distinta; evento duplicado es idempotente | 200, 409, 422 | Rebasar contra pull; repetir solo con nueva version | Si actividad retirada |
| Checklist modificado | Checklist de orden / tecnico | Obligatoria | Supervisor o tecnico modifica mismo item | Items distintos pueden combinarse; mismo item y version distinta genera conflicto | 200, 409 | Mantener valor local y mostrar comparacion futura | Si mismo item |
| Observacion agregada | ServiceIncident / tecnico | Version de orden recomendada | Cancelacion o cierre durante captura | Evento append-only se acepta si politica permite observaciones post-cierre; nunca sobrescribe | 200, 422, 423 | `SYNCED`, `REJECTED` o `BLOCKED`; exportar texto si se rechaza | No, salvo bloqueo |
| Evidencia registrada | ServicePhoto / tecnico | Version de orden y hash | Evidencia duplicada, orden cerrada/reasignada, autorizacion expirada | Hash + operationId deduplican; autorizacion expirada se renueva; pertenencia invalida bloquea | 200, 409, 422, 423 | Reintentar prepare, conservar blob o escalar; borrar solo al confirmar | Si pertenencia cambio |
| Coordenada registrada | Evento de ubicacion / tecnico | Version de orden recomendada | Estado avanza o evento equivalente existe | Append-only, deduplicado por operationId; se rechaza precision/formato invalido | 200, 422, 423 | Corregir si es estructural; conservar para auditoria local limitada | No |

## Reglas transversales

- La version base es monotona del servidor; `updated_at` solo puede servir como
  compatibilidad temporal hasta una migracion aprobada.
- Cancelacion, reasignacion, revocacion y cambio de tenant nunca se resuelven en
  cliente.
- Un conflicto no elimina la operacion ni el dato capturado.
- Un reintento usa el mismo `operationId`; una correccion crea una operacion
  nueva que referencia la anterior.
- Operaciones de una misma orden mantienen orden causal; ordenes distintas
  pueden procesarse de forma independiente.

