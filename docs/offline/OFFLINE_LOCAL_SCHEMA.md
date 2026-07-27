# Esquema local offline

La base replica una proyeccion minima, no modelos Prisma. No existen tablas de
operaciones, evidencia, conflictos ni uploads.

## Contexto y campos comunes

Todos los registros operativos incluyen:

```text
localKey, serverId, environmentId, companyId, userId,
serverVersion, serverUpdatedAt, storedAt, expiresAt, schemaVersion
```

`serverVersion` es entero no negativo y tiene prioridad sobre fechas. El
dispositivo nunca lo incrementa. `serverUpdatedAt` es informativo y la hora
local no decide autoridad.

## Version 1

| Tabla | Clave e indices | Contenido |
| --- | --- | --- |
| `offlineOrders` | `localKey`, `serverId`, `assignedTechnicianId`, `serverVersion`, `expiresAt` | Numero, estado, tecnico asignado, cliente visible, direccion, agenda y datos operativos minimos |
| `offlineActivities` | `localKey`, `serverId`, `orderId`, `serverVersion`, `expiresAt` | Tipo, titulo, descripcion, estado, secuencia y requerido |
| `offlineChecklists` | `localKey`, `serverId`, `orderId`, `serverVersion`, `expiresAt` | Etiqueta, secuencia, requerido y valor autoritativo de solo lectura |
| `offlineCatalogs` | `localKey`, `catalogType`, `serverId`, `serverVersion`, `expiresAt` | Codigo y etiqueta estrictamente operativos |
| `offlineMetadata` | `key`, `expiresAt` | Contexto, checkpoint futuro vacio, hidratacion y TTL |
| `offlineSchemaState` | `key` | Instalacion local, version y diagnostico de migracion |

No se almacenan tokens, permisos, documentos, fotos, firmas, URLs firmadas,
payloads de operaciones, auditoria completa, datos administrativos o datos de
otros tecnicos/empresas.

## Version 2 de demostracion

La version 2 agrega el indice y campo opcional `retentionState` a
`offlineMetadata`. La migracion asigna `ACTIVE` a metadata compatible y conserva
las demas tablas. Es una migracion local inocua para demostrar upgrade.

Estados de retencion:

- `ACTIVE`: vigente.
- `EXPIRED_RETAINED`: vencido, visible como desactualizado.
- `BLOCKED`: no utilizable hasta resolver un error.
- `DELETE_REQUIRED`: debe limpiarse.

## Snapshot de prueba

Un snapshot contiene contexto, `schemaVersion`, `generatedAt`, `expiresAt` y
arreglos de ordenes, actividades, checklists y catalogos. El validador usa
listas positivas de campos y rechaza:

- contexto distinto;
- version de esquema no soportada;
- tipos o fechas invalidos;
- registros de otro tecnico o empresa;
- actividad/checklist sin orden del snapshot;
- version inferior a la almacenada;
- claves adicionales que puedan introducir datos prohibidos.

La hidratacion reemplaza el snapshot completo en una sola transaccion.

