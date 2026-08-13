# Cola local de operaciones offline

Estado: Fase 4, infraestructura local sin transporte.

`DexieOfflineOperationQueueRepository` persiste operaciones en la base
particionada por ambiente, empresa y usuario. No importa React, no llama HTTP y
no modifica la proyeccion de lectura.

## Registro

Cada operacion contiene identidad UUID e idempotencia estables, contexto,
instalacion, entidad, tipo, payload validado, version base, secuencia monotona,
fechas locales, estado, reintentos, error, dependencias y version de schema.
La hora del dispositivo es informativa y nunca decide autoridad.

## API

El repositorio implementa `enqueue`, consultas por ID/idempotencia/estado,
seleccion causal, transiciones, recuperacion de `PROCESSING`, limpieza de
confirmadas, limpieza por contexto, conteos y metadata.

Los tipos funcionales futuros estan modelados, pero la implementacion no
habilita ninguno por defecto. El harness pasa explicitamente
`allowedOperationTypes: ["TEST_OPERATION"]`. No existe consumidor productivo,
endpoint push o mutacion de ordenes.

## Limites

- 500 operaciones activas.
- 16 KiB por payload.
- 5 MiB de payload estructurado total.
- 8 reintentos.
- 5 minutos maximos en `PROCESSING`.

Al exceder un limite se rechaza la nueva operacion sin borrar ni sobrescribir
trabajo pendiente.
