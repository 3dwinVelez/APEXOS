# Performance optimization - production main

## Fecha

2026-07-20

## Alcance

- Frontend Next.js: navegacion entre pantallas, caché de lecturas y build productivo.
- Supabase/PostgREST: consultas de administracion, servicios, talento humano y monitor operativo.
- Prisma API: indices equivalentes para el backend propio.
- Sin cambios de reglas de negocio, RLS, permisos ni datos.

## Cambios aplicados

- Se agrego caché LRU configurable para lecturas GET del cliente API.
- Se agrego `stale-while-revalidate` en cliente para que la navegacion repetida renderice con datos recientes en memoria mientras revalida en segundo plano.
- Se agrego el mismo patron para lecturas directas a Supabase REST.
- Se limitaron `select=*` en consultas administrativas Supabase a columnas usadas por la UI.
- Se activo compresion Next, cache immutable de assets estaticos y optimizacion de imports para `lucide-react` y `recharts`.
- Se paralelizo la resolucion de empresa y modulos en autenticacion Supabase del backend.
- Se agregaron indices idempotentes para rutas de alto volumen: empleados, membresias, ordenes de servicio, referencias, evidencias, novedades, rutas, GPS y marcaciones.
- Se agregaron indices Prisma equivalentes para consultas multitenant del API.

## Variables nuevas

- `NEXT_PUBLIC_API_GET_CACHE_TTL_MS=10000`
- `NEXT_PUBLIC_API_GET_STALE_MS=60000`
- `NEXT_PUBLIC_API_GET_CACHE_MAX_ENTRIES=160`
- `NEXT_PUBLIC_SUPABASE_GET_CACHE_TTL_MS=12000`
- `NEXT_PUBLIC_SUPABASE_GET_STALE_MS=60000`
- `NEXT_PUBLIC_SUPABASE_GET_CACHE_MAX_ENTRIES=120`

## Validacion ejecutada

- `npm run qa:request-map` - OK.
- `npm run prisma:validate` - OK.
- `npx prisma format --schema apps/api/prisma/schema.prisma` - OK.
- `npm --workspace apps/web run lint` - OK.
- `npm --workspace apps/web run typecheck` - OK.
- `npm --workspace apps/web run build` - OK, 58 rutas generadas.
- `npm run qa:performance` - OK para targets publicos; Supabase autenticado omitido por falta de `QA_SUPABASE_SCJ_PASSWORD`.

## Benchmark publico

Target QA: `https://apexos-web-qa-production.up.railway.app`

| Target | Concurrencia | Avg | P95 | Errores |
| --- | ---: | ---: | ---: | ---: |
| frontend_login | 10 | 447.70 ms | 491.46 ms | 0 |
| frontend_dashboard | 10 | 135.55 ms | 160.10 ms | 0 |
| frontend_login | 50 | 446.55 ms | 713.16 ms | 0 |
| frontend_dashboard | 50 | 244.72 ms | 328.80 ms | 0 |
| frontend_login | 100 | 422.28 ms | 864.24 ms | 0 |
| frontend_dashboard | 100 | 460.88 ms | 584.12 ms | 0 |

Reporte generado: `reports/performance/qa-latency-2026-07-20T16-58-17-338Z.json`.

## Notas de operacion

- La migracion Supabase usa `lock_timeout='5s'`; si produccion esta muy ocupada, fallara rapido en vez de esperar bloqueos largos.
- Ejecutar la migracion de indices en ventana de bajo trafico y repetir si el timeout evita tomar lock.
- Los caches se invalidan en mutaciones no GET desde el cliente; los TTL son deliberadamente cortos para preservar frescura operativa.
