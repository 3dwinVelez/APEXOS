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

## Certificacion de los modos restantes (QA desplegado) — PASO

Se certificaron los demas modos de la funcion Corregir sobre ordenes Supabase
(UUID) con la misma cuenta `scj@apexos.qa`:

1. **Cambio de estado** (SCJ-OS-001 `983441c4-eb50-4596-a985-fa977582dfef`,
   cerrada): se cambio el estado a `pendiente` con motivo `Estado incorrecto` y
   justificacion de certificacion. La orden quedo en `Pendiente` y el historial
   registro el cambio como **APPLIED**. Evidencia:
   `live-qa-status-change-applied.png`.
2. **Agregar novedad** (SCJ-OS-005 `1f88e836-cdb4-4e50-aaf5-cce2debd143c`):
   se agrego la novedad `Novedad QA certificacion en vivo 20260821` y el
   historial registro `administrative_observation`. Evidencia:
   `live-qa-observation-applied.png`.
3. **Reportar pieza** (MED-SER-003): se registro la pieza `Pieza QA
   certificacion` como `faltante` con detalle. El historial registro
   `pieza_faltante`. Evidencia: `live-qa-piece-issue-applied.png`.
4. **Anexar soporte** (SCJ-OS-007 `6c808f62-444d-4b35-8d1b-98210a7efe9b`):
   se subio una imagen PNG como `Soporte administrativo` y el historial
   registro la correccion como **APPLIED**. Evidencia:
   `live-qa-evidence-applied.png`.

## Hallazgo fijado durante la certificacion: version optimista

Al intentar el modo **Retirar evidencia** sobre SCJ-OS-007 (que ya habia
recibido el soporte administrativo), la UI mostro version `1` y el backend
rechazo con `La orden cambio mientras preparabas la correccion` (control de
concurrencia correcto). La causa: el fallback Supabase guardaba la version en
`metadata.version` pero el detalle de la orden no exponía `version` a nivel
top-level, por lo que la UI nunca veia la version incrementada tras aplicar
una correccion.

Se corrigio en `apps/web/lib/api.ts`: el mapeo del detalle Supabase ahora
expone `version: Number(metadata.version || 1)`. Con este ajuste, tras aplicar
una correccion y recargar, la UI muestra la version vigente y el retiro de
evidencia puede aplicarse. **Re-certificado en vivo: PASS** (evidencia
`live-qa-evidence-withdrawn.png`).

## Hallazgo fijado durante la certificacion: estados no permitidos en Supabase

Al certificar **Reabrir orden** (cambio a `reabierta`) en vivo, Supabase
rechazo con `400 violates check constraint service_orders_status_check`. El
check constraint de Supabase solo permitia
`agendado, pendiente, en_curso, inspeccion, ejecucion, cerrada, no_ejecutada, cancelada`
mientras el backend Prisma soporta `reabierta`, `revision` y `lista_facturacion`.

Se creo la migracion `supabase/migrations/20260821120000_service_orders_administrative_statuses.sql`
y se aplico en el proyecto Supabase QA (verificado con `pg_get_constraintdef`).
**Re-certificado en vivo: PASS** (evidencia `live-qa-reopen-applied.png`).

## Hallazgo fijado durante la certificacion: force-close creaba APPLIED

Al certificar **Cerrar administrativamente** en vivo, la correccion se
registraba pero no se aplicaba con `La correccion no esta disponible para
aplicar`. El fallback Supabase de `/reopen` y `/force-close` creaba la
correccion con estado `APPLIED` y aplicaba el cambio directamente, pero el
panel luego llama a `/apply` que rechaza estados no `DRAFT`/`APPROVED`.

Se corrigio en `apps/web/lib/api.ts`: `/reopen` y `/force-close` ahora crean
la correccion como `DRAFT` (sin aplicar) para que el `/apply` posterior
aplique el cambio, alineandose con el backend local. **Re-certificado en
vivo: PASS** (evidencia `live-qa-force-close-applied.png`).

## Certificacion de los modos restantes (QA desplegado) — PASO

Ademas de los 4 modos anteriores, se certificaron:

5. **Retirar evidencia** (SCJ-OS-007 `6c808f62-...`): se retiro la evidencia
   `administrative_support` con motivo `Evidencia incorrecta`. El historial
   registro el retiro como **APPLIED** y el archivo se conserva para
   auditoria. Evidencia: `live-qa-evidence-withdrawn.png`.
6. **Reabrir orden** (SCJ-OS-006 `ff64256b-...`, no ejecutada): se reabrio la
   orden a `reabierta` con motivo `Estado incorrecto`. La orden quedo
   `Reabierta` y el historial registro la correccion como **APPLIED**.
   Evidencia: `live-qa-reopen-applied.png`.
7. **Cerrar administrativamente** (SCJ-OS-001 `983441c4-...`, pendiente): se
   cerro la orden a `cerrada` con observacion, requisitos pendientes y
   confirmacion. La orden quedo `Cerrada` y el historial registro la
   correccion como **APPLIED**. Evidencia: `live-qa-force-close-applied.png`.

## Estado

- Certificacion navegador en QA desplegado: PASS (8 evidencias capturadas).
- Hallazgo de version optimista: FIJADO y re-certificado.
- Hallazgo de constraint de estados: FIJADO con migracion aplicada en QA y re-certificado.
- Hallazgo de force-close DRAFT: FIJADO y re-certificado.
- Pruebas automatizadas del modulo: 20/20 PASS.
- Typecheck web: PASS.
- Build web: PASS.
- Lint web: PASS.

