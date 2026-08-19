# Estado: concurrencia HR y deploy Railway

Fecha: 2026-08-18

## Causa raíz del fallo de marcaciones concurrentes

`createPunch` usaba `prisma.$transaction` interactiva, pero **los middleware `$use` de Prisma NO se aplican a transacciones interactivas**. Por eso `tx.timePunch.findMany` no filtraba por `tenant_id` y mezclaba punches de otros tenants del día, causando `JORNADA_COMPLETA` (409) incluso para empleados recién creados.

## Corrección aplicada (commit `d4ff1a9` / `3c47de7` en main)

- Se añadió `tenant_id` explícito a todas las consultas dentro de la transacción de `createPunch`:
  - `timePunch.findMany` (secuencia) con `tenant_id`
  - `employee.findFirst`, `timeRoute.findFirst`, `routePreoperationalChecklist.findFirst`
  - `timePunch.create`, `gpsPing.create`, `workSession` (find/update/create)
- Se añadió reintento automático ante `MARCACION_FUERA_DE_SECUENCIA`/`JORNADA_COMPLETA`/`P2034` (hasta 5 intentos con backoff).

## Cambio de infraestructura (Railway)

- `DATABASE_URL` actualizada en Railway con `connection_limit=25` (antes 5), que era un cuello de botella adicional para 20 marcaciones concurrentes.

## Estado del deploy

- `main` = `3c47de7` (fix de tenant scoping).
- Railway está con **incidencia upstream de GitHub**: deployments en `QUEUED`/`INITIALIZING` desde 18:15, con `queuedReason: "Deployment queued due to upstream GitHub issues"`.
- El ambiente sigue sirviendo `47556c5` (reintentos, sin fix de tenant scoping) hasta que Railway procese el nuevo deploy.

## Pendiente

1. Cuando Railway se recupere, reintentar el redeploy de `main` (o `railway up` desde el código).
2. Verificar `/health` reporta `3c47de7` o el hash del nuevo deploy.
3. Re-ejecutar `nyvora-hr-unique.js` para certificar 10/10 con concurrencia real.
