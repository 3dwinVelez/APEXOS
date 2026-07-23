# Performance Optimization Report

## Cambios

- Eliminado bcrypt de 322,38 ms p50 para usuarios existentes.
- Eliminadas escrituras incondicionales de usuario/rol durante autenticación.
- Caché/deduplicación Supabase Auth de 30 s, clave SHA-256 y máximo 500 entradas.
- Fases `authentication`, `tenant`, `authorization` y `db` en `Server-Timing`.
- `x-request-id` en respuestas exitosas y fallidas.
- Logs con severidad por presupuesto y usuario anonimizado.
- Guard automático de línea base agregado a release QA/producción.

## Comparación disponible

| Flujo | Antes p50 | Antes p95 | Después p50 | Después p95 | Estado |
| --- | ---: | ---: | ---: | ---: | --- |
| bcrypt por request existente | 322,38 ms | 342,01 ms | 0 ms | 0 ms | Corregido por diseño |
| Monitor datos sin Auth | 249,21 ms | 434,33 ms | Pendiente despliegue | Pendiente despliegue | Requiere QA |
| Servicios E2E autenticado | No disponible | ~5 s reportado | Pendiente despliegue | Pendiente despliegue | Bloqueado por credenciales |

No se inventan cifras posteriores: la mejora E2E debe medirse después del despliegue QA con `Server-Timing`. El cambio elimina al menos un hash de ~322 ms y múltiples sincronizaciones por cada request repetido.

## Riesgos

- Revocación de sesión puede tardar hasta 30 s en reflejarse en API cacheada.
- Procesos con varias réplicas mantienen caché por instancia; la fuente de verdad sigue siendo Supabase.
- Falta certificar 1k/10k filas y 50–200 concurrentes en Nyvora QA.

## Saturación controlada 2026-07-22/23

Prueba read-only escalonada 1/10/25/50/100. No se hicieron escrituras.

| Objetivo | p95 c=10 | p95 c=50 | p95 c=100 | Errores c=100 |
| --- | ---: | ---: | ---: | ---: |
| Servicios HTML | 157 ms | 215 ms | 316 ms | 0 |
| Dashboard HTML | 150 ms | 197 ms | 2.024 ms | 1 |
| Login HTML | 647 ms | 770 ms | 1.208 ms | 2 |
| Órdenes Supabase | 508 ms | 993 ms | 1.693 ms | 0 |
| Evidencias metadata | 226 ms | 266 ms | 1.847 ms | 0 |
| Marcaciones | 160 ms | 300 ms | 420 ms | 0 |

Conclusión: hasta 50 concurrentes el módulo de Servicios permanece por debajo de 1 segundo. A 100 concurrentes Supabase y páginas agregadoras degradan; 100 no se certifica como capacidad operativa óptima sin pruebas autenticadas de API, métricas Railway y pool.

La revisión separada por ambiente encontró:

- Producción (`config/production.env`): 52 evidencias, 0 grupos duplicados después de aplicar `20260722173000_service_evidence_single_capture.sql`.
- Proyecto configurado en `.env` (QA/desarrollo): 111 evidencias, 3 grupos duplicados y 3 filas sobrantes (`producto_abierto`: 2, `firma_cliente`: 1). No existe conexión SQL remota disponible para aplicar la migración desde este entorno.

Los checks de release validan ahora el archivo de ambiente explícito para evitar certificar un proyecto distinto.
