# Performance Test Plan

## Niveles

1. Commit: unit tests, typecheck, lint, `performance:guard`.
2. Merge: benchmark QA a 1/10/25 usuarios y rutas críticas autenticadas.
3. Producción: smoke read-only a 1/10; sin escritura ni carga agresiva.
4. Periódico: volumen 1k/10k/100k y concurrencia 50/100/200 en Nyvora QA.

## Datos

Crear fixtures únicamente con `company_id` confirmado de Nyvora QA y `metadata.performance_run_id`. Escalas: usuarios 100/1k/10k, servicios 1k/10k, vehículos 100/1k, marcaciones 10k/100k. Adjuntos son metadata de pocos bytes, no archivos reales.

La generación debe ser transaccional por lotes, idempotente y abortar si el entorno contiene `production`. La limpieza elimina exclusivamente el `performance_run_id` confirmado y verifica conteos antes/después.

## Escenarios

Login, dashboard, usuarios, roles, permisos, servicios/listado/detalle, vehículos, marcaciones, maestros, filtros, páginas primera/intermedia/final, creación y edición. Ejecutar 1/10/25/50/100/200, detener ante >2% errores, p99 >5 s, CPU >85%, memoria >85% o pool >80%.

Registrar throughput, p50/p95/p99, errores, bytes, `Server-Timing`, CPU, memoria y conexiones. Repetir frío y caliente.
