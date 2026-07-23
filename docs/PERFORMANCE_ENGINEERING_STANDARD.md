# Performance Engineering Standard

## Principios

- Medir antes y después; ninguna afirmación sin reporte reproducible.
- Ningún listado ilimitado, N+1, consulta dentro de bucles o filtro masivo en Node/React.
- Seleccionar sólo columnas requeridas; relaciones profundas necesitan justificación.
- Filtros, búsqueda y ordenamiento se resuelven en base de datos cuando el volumen puede crecer.
- Toda consulta multiempresa comienza por empresa/tenant y considera un índice compuesto.
- Seguridad, RLS, auditoría y consistencia nunca se sacrifican por latencia.
- Datos secundarios no bloquean la pantalla; toda espera visible tiene skeleton, progreso o error.

## Presupuestos

| Clase | p95 |
| --- | ---: |
| Interacción local | < 100 ms |
| Endpoint simple | < 300 ms |
| Endpoint mediano | < 600 ms |
| Operación compleja | < 1.000 ms |
| Crítica | >= 2.000 ms |

## Frontend

- Deduplicar GET, definir `staleTime`, invalidar sólo dominios afectados y cancelar búsquedas anteriores.
- Paginar en servidor; virtualizar sobre 200 filas visibles.
- Catálogos de baja variación se reutilizan y cargan bajo demanda.
- Imágenes usan miniatura/lazy loading; signed URLs sólo en detalle.
- Hooks deben tener dependencias estables y ser idempotentes ante Strict Mode.
- Medir bundle y solicitudes por pantalla antes del merge.

## Backend

- DTO específico, límite máximo y cursor para conjuntos crecientes.
- Auth/tenant/permisos se instrumentan por fase; no se sincronizan datos sin cambios.
- Consultas independientes pueden ejecutarse en paralelo con límites.
- Timeouts obligatorios para Auth, Storage y servicios externos.
- Logs incluyen request ID, módulo, operación, empresa, referencia de usuario anonimizada, estado, bytes, consultas y severidad.
- Caché requiere clave, TTL, invalidación, fallback y análisis de obsolescencia.

## Prisma y PostgreSQL

- Un `PrismaClient` por proceso. Preferir `select`; `include` sólo en detalle.
- Índices documentan consulta, escritura adicional y reversión.
- Toda FK y combinación frecuente `tenant/status/created_at` debe revisarse.
- Offset sólo para páginas acotadas; usar cursor/keyset en historiales extensos.
- `EXPLAIN (ANALYZE, BUFFERS)` únicamente en QA o consulta segura y representativa.
- Policies RLS evitan funciones costosas por fila y conservan pruebas cross-tenant.

## Checklist y Definition of Done

- [ ] Pantalla: solicitudes, bundle, skeleton, error, paginación.
- [ ] Endpoint: DTO, límite, timeout, Server-Timing, tamaño.
- [ ] Tabla/migración: FK, índices, RLS, rollback, costo de escritura.
- [ ] Dashboard/listado/filtro: volumen, p50/p95, consulta en DB.
- [ ] Integración/archivos: latencia, lazy load, tamaño, fallo controlado.
- [ ] Pruebas: funcionales, multiempresa, carga fría/caliente y regresión.

No está terminado si hay duplicados, N+1, listado ilimitado, ausencia de feedback, presupuesto excedido sin justificación o falta evidencia antes/después.
