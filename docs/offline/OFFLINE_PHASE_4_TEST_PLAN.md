# Plan de pruebas de Fase 4

## Automatizacion

- Base nueva, migracion v1/v2 a v3, snapshot conservado, fallo y reapertura.
- Enqueue, consultas, orden, estados, conteos y limpieza.
- UUID, payload, tipos deshabilitados y campos secretos.
- Idempotencia por ID/clave, doble clic y transaccion concurrente.
- Dependencias validas, inexistentes, propias, bloqueadas y orden causal.
- Recuperacion de `PROCESSING`, aborto y almacenamiento restringido.
- Limites de cantidad, payload, total y reintentos.
- Aislamiento por usuario, contexto y metadata manipulada.
- Politica de logout modelada sin integracion visual.

## Regresion

- API completa.
- Web offline completa.
- Prisma validate, TypeScript, ESLint, build y performance guard.
- `git diff --check`.
- Certificacion Read-Only v1.0.
- Inspeccion de bundle y ausencia de endpoints/imports React.

No se usan ordenes reales, red de sincronizacion, QA remoto o produccion.
