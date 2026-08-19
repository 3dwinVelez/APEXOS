# Fix de infraestructura: pooler transaccional Supabase

Fecha: 2026-08-19
Servicio: `apexos-api-prod` (Railway)
Commit desplegado: `22f833003010`

## Problema

Bajo carga concurrente, endpoints como `/api/v1/brain/insights`, `/api/v1/hr/operations-map`, `/api/v1/auth/me` y `/api/v1/hr/routes/preop/metrics` devolvían 500 con el error:

```text
FATAL: (EMAXCONNSESSION) max clients reached in session mode - max clients are limited to pool_size: 15
```

## Causa raíz

Supabase ofrece dos poolers:
- **Session pooler** (puerto 5432): mantiene una conexión por sesión, con `pool_size=15`.
- **Transaction pooler** (puerto 6543): usa PgBouncer en modo transacción, apropiado para Prisma y aplicaciones serverless/concurrentes.

La app usaba el session pooler (puerto 5432), por lo que se saturaba con 15 conexiones.

## Corrección aplicada

Se cambió `DATABASE_URL` en Railway al **transaction pooler**:

```text
postgresql://postgres.jzbwzmkidfthknsohhnr:...@aws-1-sa-east-1.pooler.supabase.com:6543/postgres?sslmode=require&pgbouncer=true&connection_limit=25
```

Luego se redeployó desde la fuente.

## Validación

Ráfaga de 3 rondas × 4 endpoints concurrentes (`brain/insights`, `hr/operations-map`, `auth/me`, `hr/routes/preop/metrics`) → **12/12 respuestas 200**, sin `EMAXCONNSESSION`.

## Nota

No hubo cambios de código; este es un cambio de infraestructura/variable en Railway.
