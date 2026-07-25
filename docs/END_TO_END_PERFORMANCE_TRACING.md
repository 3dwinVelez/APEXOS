# Trazado de Rendimiento Extremo a Extremo

## Identificadores

Cada interacción del usuario genera un `interactionId` único con formato:

```
int-{secuencial}-{timestamp_base36}
```

Ejemplo: `int-42-ls5kf2x`

## Flujo del identificador

```text
Frontend:
  performance.mark("svc-open-order-{id}-start")
  performance.mark("svc-open-order-{id}-request")
  
Backend:
  x-request-id: req-{uuid}            (Fastify)
  x-interaction-id: int-42-ls5kf2x    (performanceContext)
  
  Server-Timing:
    app=450.2, auth=12.3, tenant=8.1, authorization=5.2, db=124.7
  
Logs:
  { event: "api_performance",
    endpoint: "/api/v1/services/orders/:id/start",
    duration_ms: 450.2,
    query_count: 4,
    query_total_ms: 124.7,
    serialization_ms: 45.3,
    db_pool_wait_ms: 0,
    phases_ms: { authentication: 12.3, tenant: 8.1, authorization: 5.2 },
    interaction_id: "int-42-ls5kf2x"
  }

Frontend:
  response.headers["x-interaction-id"] = "int-42-ls5kf2x"
  performance.measure("svc-open-order-{id}-response", ...)
```

## Headers HTTP

| Header | Contenido | Propósito |
| ------ | --------- | --------- |
| `x-request-id` | UUID (Fastify `request.id`) | Traza interna backend |
| `x-interaction-id` | `int-N-timestamp` | Traza E2E frontend→backend |
| `Server-Timing` | `app;dur=N, auth;dur=N, db;dur=N` | Separación de fases |

## Cómo leer los resultados

En los logs de la API (archivos en `logs/`), buscar el campo `event: "api_performance"`. Extraer:

```
interaction_id → tracea en Chrome Network tab (response headers)
duration_ms    → tiempo backend total
phases_ms      → auth, tenant, authorization, db
serialization_ms→ tiempo serializando JSON de respuesta
db_pool_wait_ms → tiempo esperando conexión del pool
query_count    → número de consultas Prisma
query_total_ms → suma de duración de consultas
```

## Umbrales

| Fase | Warning (>ms) | Critical (>ms) |
| ---- | ------------ | -------------- |
| app total | 300 | 2000 |
| auth | 50 | 200 |
| tenant lookup | 30 | 100 |
| authorization (RBAC) | 30 | 100 |
| db query | 100 | 500 |
| serialization | 50 | 200 |
| db pool wait | 50 | 500 |

## Reducción de instrumentación en producción

En producción, `PERFORMANCE_LOG_ENABLED=true` activa el log completo.  
Cuando esté desactivado, solo se registran eventos críticos (>2000ms) y errores.

Los headers `Server-Timing` y `x-request-id` siempre están activos por diseño.  
El `x-interaction-id` solo se genera si `performanceContext` está disponible.
