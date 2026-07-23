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
