# Performance Audit

## Hallazgos prioritarios

1. **P0: bcrypt en cada request Supabase.** `ensureUserMirror` construía el hash bcrypt con costo 12 antes del `upsert`, incluso para usuarios existentes. Medición local: 316–342 ms, p50 322,38 ms por hash. Varias solicitudes paralelas saturan el thread pool.
2. **P0: sincronización Auth repetida.** Cada endpoint repetía Supabase Auth, membresía, empresa, módulos, rol, tenant y usuario. No existía caché ni deduplicación concurrente.
3. **P1: monitor de Servicios con múltiples round trips.** Auth y membresía son secuenciales; después se consultan órdenes y cuatro relaciones. Sin Auth, el patrón ya cuesta 249 ms p50 / 434 ms p95.
4. **P1: pantallas agregadoras.** Administración inicia ocho endpoints; Dashboard cinco; Marcación seis. La latencia percibida queda gobernada por el más lento y por autenticación repetida.
5. **P1: observabilidad incompleta.** Existía tiempo total y Prisma, pero no fases de autenticación, tenant o autorización; `x-request-id` sólo estaba garantizado en errores.
6. **P2: listados con límites altos y filtrado cliente.** Servicios solicita 200 filas y Administración carga logs/catálogos aunque no estén visibles. Requieren paginación progresiva antes de crecer.
7. **P2: benchmark no siempre representativo.** La consulta histórica de `service_orders` usaba service role sin empresa. El patrón multiempresa debe medirse separado.

## PostgreSQL, RLS e infraestructura

- La migración `20260720090000_prod_read_performance_indexes.sql` cubre órdenes por empresa/estado/creación y relaciones críticas. No se añadieron índices sin plan.
- PostgREST no expone el media type de planes (`PGRST107`), por lo que no fue posible obtener `EXPLAIN ANALYZE/BUFFERS` desde este entorno.
- Railway región, CPU, memoria, reinicios y pool no están disponibles en variables ni API local. No se afirma alineación regional.
- `DATABASE_URL` local apunta a `localhost:54320`; Docker no está activo. No se ejecutaron pruebas locales de base de datos.

## Seguridad

No se desactivó RLS, Auth, permisos ni auditoría. La caché usa SHA-256 del token y TTL de 30 segundos; no guarda tokens, correos ni contraseñas en logs.
