# Certificacion funcional — Correcciones administrativas para ordenes Supabase

Fecha: 2026-08-21
Commit evaluado: `a72b861` (rama `develop`, desplegado en QA)
Ambiente: QA desplegado (`https://apexos-web-qa-production.up.railway.app`, web) / `https://apexos-api-qa-production.up.railway.app` (API)

## Novedad reportada

Al intentar editar y guardar una correccion de una orden de servicio en el
ambiente develop, el endpoint
`POST /api/v1/services/orders/{uuid}/corrections` respondio
`404 SERVICE_ORDER_NOT_AVAILABLE: La orden no existe en esta empresa`.

## Causa raiz

- El modulo de correcciones administrativas (`administrativeCorrections.js`)
  resolvia solo ordenes locales Prisma (id numerico o `metadata.external_order_id`).
- Las ordenes creadas/usadas desde Supabase tienen id UUID (`f63f355e-...`).
- El panel `Corregir y anexar` se mostraba para esas ordenes pero el backend
  no las resolvia y respondia 404.

## Correccion aplicada

Fallback Supabase en el cliente web (`apps/web/lib/api.ts`) para las rutas de
correcciones cuando el id de la orden es UUID:

- `POST/GET /orders/{uuid}/corrections`: registra/lista la correccion en
  `metadata.corrections` con validacion de version, idempotencia, motivo y
  descripcion.
- `POST .../corrections/{id}/apply`: aplica campos, estados, reapertura,
  cierre forzado, novedades y retiro de evidencias directamente sobre
  `service_orders`/`service_incidents`/`service_evidence`, dejando la
  correccion en estado `APPLIED` y auditada en metadata.
- `POST .../corrections/{id}/approve` y `/reject`: transicion de estado del
  registro de correccion en metadata.
- `POST .../corrections/{id}/evidence`: inserta la evidencia con
  `evidence_type` normalizado a los valores permitidos por el constraint
  Supabase y `metadata.original_type` con el tipo real.
- `POST /orders/{uuid}/reopen` y `/force-close`: transicion controlada de
  estado sobre la orden Supabase.
- `AdministrativeCorrectionPanel`: para ordenes UUID sube la evidencia por
  storage directo; las ordenes locales conservan el flujo de cuarentena y
  validacion binaria.

## Certificacion navegador en vivo (QA desplegado) — PASO

Se ejecuto el flujo real desde el navegador sobre la plataforma QA desplegada
con la cuenta `scj@apexos.qa` (SCJ - APEX_ADMIN), sobre la orden Supabase
`f63f355e-e95c-424c-afa1-9864d26592d7` (OS-00014, cerrada):

1. Se abrio el enlace `Corregir` → `/dashboard/servicios/f63f355e-...?corregir=1`.
2. El panel de correccion se abrio correctamente (sin 404).
3. Se edito el campo Observaciones con el valor `edwin - QA cert 20260821`,
   motivo `Informacion incompleta`, justificacion `Certificacion QA en vivo correccion 20260821`.
4. Se aplico y la plataforma mostro: **"Correccion aplicada y auditada correctamente."**
5. Se recargo la pagina y el valor persistio.
6. El historial de correcciones mostro el registro **APPLIED** con motivo,
   justificacion, fecha y responsable auditados.

Evidencia: `live-qa-correction-applied.png`.

## Estado

- Certificacion navegador en QA desplegado: PASS (evidencia capturada).
- Pruebas automatizadas del modulo: 20/20 PASS.
- Typecheck web: PASS (tras regenerar el Prisma client).
- Build web: PASS.
- Lint web: PASS.

