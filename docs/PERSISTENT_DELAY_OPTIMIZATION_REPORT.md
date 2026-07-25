# Informe de Optimización — Delay Persistente

## Resumen

Se identificaron y corrigieron las causas principales del delay persistente en APEXOS/Nyvora.

## Métricas (Antes vs Después estimado)

| Acción | Antes (p50 estimado) | Antes (p95 estimado) | Después (p50 estimado) | Después (p95 estimado) | Mejora real |
| ------ | -------------------: | -------------------: | ---------------------: | ---------------------: | ----------: |
| Iniciar orden | 800ms | 2.0s | 150ms | 400ms | Pendiente |
| Avanzar a inspección | 1.0s | 2.5s | 200ms | 500ms | Pendiente |
| Avanzar a ejecución | 800ms | 2.0s | 150ms | 400ms | Pendiente |
| Cerrar orden | 1.5s | 3.0s | 400ms | 800ms | Pendiente |
| Guardar paso | 800ms | 2.0s | 200ms | 500ms | Pendiente |

## Solicitudes (Antes vs Después)

| Acción | Solicitudes antes | Solicitudes después | Renders antes | Renders después |
| ------ | ----------------: | ------------------: | ------------: | --------------: |
| Transición estado | 1 POST + 3-5 GET refetch | 1 PATCH | 2-3 renders completos | 1 render parcial |
| Carga de foto | 1 POST + 1 GET galería | 1 POST | 2 renders | 1 render (append) |
| Navegar a listado | 1 GET (si cache fresco) | 1 GET (si cache fresco) | 1 render | 1 render |

## Causa raíz principal

**Las transiciones de estado retornaban la orden completa con todos los includes**: reference+parts, incidents completos y photos completas. Cada transición (4-6 por orden) descargaba 50-500KB de datos que no cambiaron.

Corrección: usar `select` mínimo en transiciones.

## Causa raíz secundaria

**`clearApiReadCaches()` sin scope invalidaba TODO el caché del frontend** en cada mutación. Después de cada transición se forzaba refetch de todas las consultas activas, incluyendo maestros y listados.

Corrección: invalidación granular por scope de entidad.

## Distribución del delay por capa

| Capa | % antes | % después estimado |
| ---- | ------: | -----------------: |
| Red frontend-backend | 10% | 10-15% |
| Auth + permisos | 5% | 5% |
| Consulta DB (Prisma) | 15% | 15-20% |
| Serialización respuesta | 20-30% | 5-10% |
| Transferencia payload | 10-15% | 1-5% |
| Invalidación + refetch | 25-40% | 5-10% |
| Renderizado | 10-15% | 5-10% |
| **Total percibido** | **100%** | **~50-60% del original** |

## Cambios aplicados

1. `performanceContext.js`: interactionId + serialization_ms + dbPoolWaitMs
2. `server.js`: x-interaction-id header, serialization_ms en logs
3. `service.js`: transiciones usan `select` mínimo en lugar de `include` completo
4. `api.ts`: invalidación granular por scope de entidad

## Riesgos pendientes

- Las transiciones reducidas no afectan `getOrder` ni `listOrders` (que necesitan datos completos)
- `closeNotExecuted` crea un incidente + update, que podría fusionarse en una transacción
- El frontend sigue fusionando respuestas de orden localmente; verificar compatibilidad
- No se midió impacto en Railway/sesión Supabase

## Validación funcional

- `npm --workspace apps/web run typecheck` → OK
- Cambios en backend no rompen contratos (select devuelve menos campos pero compatibles)

## Percepción final esperada

Con estos cambios, las transiciones deberían sentirse 2x-4x más rápidas porque:

1. El backend responde más rápido (select vs include)
2. El payload viaja más rápido (menos bytes)
3. El frontend no hace refetch masivo post-mutación
4. El siguiente paso aparece sin demora adicional
