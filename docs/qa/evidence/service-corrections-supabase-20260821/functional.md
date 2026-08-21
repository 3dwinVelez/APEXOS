# Certificacion funcional — Correcciones administrativas para ordenes Supabase

Fecha: 2026-08-21
Commit evaluado: `351431a` (rama `desarrollo`)
Ambiente: QA desplegado (`https://apexos-api-qa-production.up.railway.app`, commit `ceae958`)

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

## Estado

- Pruebas automatizadas del modulo: 20/20 PASS.
- Typecheck web: PASS (tras regenerar el Prisma client).
- Build web: PASS.
- Lint web: PASS.
- Certificacion QA en vivo: PENDIENTE (bloqueada por Docker Desktop apagado,
  necesaria la base local 54320 para el fixture Nyvora).
- Certificacion navegador en QA desplegado: PENDIENTE (requiere el flujo
  Corregir y anexar desde el navegador contra el QA desplegado).
