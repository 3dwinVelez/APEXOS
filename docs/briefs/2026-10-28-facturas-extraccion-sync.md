# Brief — Extracción de facturas electrónicas y job carpeta → invoice_received

- **ID**: `2026-10-28-facturas-extraccion-sync`
- **Fecha**: `2026-10-28`
- **Rama activa**: `desarrollo` (commit local `0538d38e`, sin push)
- **Prompt crudo**: "necesito que mires este proyecto que extrae los datos del xml de la factura electronica para que repliques esa extraccion, necesito que extraigas, el nit del emisor, numero de factura, nit receptor, nombre emisor, el valor total a pagar, si tiene iva, porcentaje de iva fecha de emision, y validar que el cufe si sea valido" / "quita la validacion onlinea del cufe en la dian, crea algo que podamos integrar en apex como un job de que se revisan los documentos en un carpeta en este caso la local y luego subir esa informacion al supabase del ambiente de qa"

## 1. Objetivo

Extraer datos de facturas electrónicas DIAN desde XML (zip o xml suelto) y sincronizarlos a la tabla `invoice_received` de APEX mediante un job escaneable por carpeta, para que las facturas queden visibles en la pantalla de facturas recibidas de cualquier ambiente (local o Supabase QA), sin duplicados entre corridas ni con la vía `received-invoices`.

## 2. Alcance exacto

| Estado | Archivo | Qué cambia |
|---|---|---|
| `A` | `apps/api/src/modules/mailbox/invoice-xml.js` | `extractInvoiceData`, `extractFromZip`, `validateCufe`, `cleanNit` |
| `A` | `apps/api/src/modules/mailbox/invoice-folder-sync.js` | `readSyncConfig`, `scanFolder`, `buildDedupeKey`, `invoiceRow`, `syncFolder` |
| `A` | `apps/api/scripts/mailbox-invoice-sync.js` | CLI `npm run mail:invoice-sync` |
| `A` | `apps/api/test/mailbox-invoice-xml.test.js` | 11 pruebas de extracción/validación |
| `A` | `apps/api/test/mailbox-invoice-sync.test.js` | 6 pruebas del job (carpeta temporal + Prisma falso) |
| `M` | `apps/api/src/fabric/crons.js` | cron opt-in `MAILBOX_INVOICE_SYNC_ENABLED` cada N min |
| `M` | `apps/api/package.json` | dep `fast-xml-parser`, scripts `mail:*` y `test:mailbox` |
| `M` | `package-lock.json` | entrada de `fast-xml-parser` (1 línea) |
| `M` | `.env.example` | variables `MAILBOX_INVOICE_SYNC_*` |

### Módulos (`change_intent.modules`)

- `mailbox`

### Borrados autorizados (`allowed_deletions`)

- ninguno

## 3. Fuera de alcance

- `apps/api/src/modules/accounting/received-invoices/` (otra vía, código intacto; solo se escribe en su tabla).
- Subida de archivos a storage y filas en `invoice_documents`: el job solo registra la factura (`xml_available: true`).
- Migraciones en nube, Railway y Supabase QA (pendiente de autorización).
- Verificación online del CUFE contra la DIAN: eliminada a pedido del usuario (catálogo detrás de WAF).

## 4. Restricciones

- Rama: solo `desarrollo`. Prohibido push, merge, deploy, migración remota, cambios en Railway/Supabase sin autorización explícita.
- Aislamiento multi-tenant: toda lectura/escritura pasa por `prisma.runWithTenant(tenantId)`; el `tenant_id` entra en cada fila y en el dedupe.
- Sin secretos ni credenciales en el brief ni en el diff; `.env` sigue fuera de git.

## 5. Criterios de aceptación

1. `npm run test:mailbox` (en `apps/api`) → 34/34 pruebas en verde (18 de ingesta + 11 de extracción + 6 del job).
2. Corrida real con zips del buzón: 2 facturas insertadas en `invoice_received` (`E123209` CERO 70 $42.000 sin IVA; `9RE89679` SANREMO $20.300 con IVA 19% $3.241); segunda corrida → `inserted: 0, duplicates: 2`.
3. Los campos extraídos coinciden con el parser de referencia Python (`sap_mir7_invoice`): NIT emisor/receptor sin DV, nombre, número, fecha, total `PayableAmount`, IVA (presente/porcentajes/valor), CUFE estructuralmente válido.
4. Factura sin CUFE o con CUFE inválido → insertada con `processing_status=review` y `review_reasons` (`CUFE_NO_IDENTIFICADO` / `CUFE_INVALIDO`).

## 6. Evidencia y certificación exigida

- Pruebas: `apps/api/test/mailbox-invoice-xml.test.js`, `apps/api/test/mailbox-invoice-sync.test.js`, más regresión `mailbox-graph-ingest.test.js` y `mailbox-imap-ingest.test.js` (34/34).
- Evidencia real: filas en `invoice_received` del Postgres local (`infra-postgres-1:55432`), tenant demo `c0d70738-9098-4b55-8f62-7aefa80d14ad`.
- `certification_status` esperado: `local_passed_qa_pending` (falta QA funcional en Railway/Supabase QA).

## 7. Capacidades protegidas

- Aislamiento multi-tenant — `runWithTenant` + `tenant_id` en `where` y en el índice único `(tenant_id, dedupe_key)`.
- Dedupe compartido con `received-invoices` — mismo formato `cufe:<hex>` / `doc:<nit>|<prefijo>|<numero>|<total>`; verificado con doble corrida.
- Seguridad XML — rechazo de `DOCTYPE/ENTITY`, límite de 10 MB y validación de estructura antes de parsear.

## 8. Riesgos y rollback

- Riesgo: el job escribe en la tabla compartida de la otra vía → Mitigación: solo `create` con dedupe y campos compatibles, sin tocar su código → Rollback: `git revert 0538d38e` (no reset) y borrado puntual de filas insertadas por tenant/`dedupe_key`.
- Riesgo: `MAILBOX_INVOICE_SYNC_DIR` no es persistente en Railway → Mitigación: definir origen real (storage del buzón o descarga IMAP) antes de habilitar el cron en QA.
- Riesgo: filas demo en BD local → Mitigación: borrar las 2 filas del tenant demo cuando ya no se necesiten.

## 9. Supuestos y preguntas abiertas

- Supuesto: la tabla `invoice_received` es el destino correcto y visible en la UI (lo es en local).
- Pregunta: ambiente QA — ¿`DATABASE_URL` apuntará al Supabase de QA desde un proceso local o se habilita el cron en el API de QA? (afecta cómo se opera el job; no el código).
- Pregunta: ¿unificar esta vía con `received-invoices` más adelante? Hoy separadas por decisión del usuario.
- Pendiente: migración `20261028160000_received_invoices` aplicada en QA (en local ya está).

## 10. Autorizaciones requeridas

- [ ] Push de `0538d38e` a `origin/desarrollo`.
- [ ] Promoción `desarrollo → develop` (requiere manifiesto de alcance y `npm run qa:preqa:evidence`).
- [ ] Migración en Supabase QA y habilitación del cron en QA.

## 11. Guía de handoff (cómo opera)

```bash
# una corrida
MAILBOX_INVOICE_SYNC_TENANT_ID=<tenant> \
MAILBOX_INVOICE_SYNC_DIR=<carpeta> \
npm run mail:invoice-sync

# como job con el API levantado
MAILBOX_INVOICE_SYNC_ENABLED=true
MAILBOX_INVOICE_SYNC_INTERVAL_MINUTES=30          # 1..59, default 30
MAILBOX_INVOICE_SYNC_TENANT_ID=<tenant>            # fallback: MAILBOX_INGEST_TENANT_ID
MAILBOX_INVOICE_SYNC_DIR=<carpeta con zips/xml>
```

Flujo: `scanFolder` (recursivo, `.zip`/`.xml`) → `extractFromZip`/`extractInvoiceData` → `invoiceRow` → `receivedInvoice.findFirst({tenant_id, dedupe_key})` → `create`. Fallos por archivo se acumulan en `summary.failed` sin abortar el lote. Resumen impreso: `{scanned, inserted, duplicates, failed}`.

La base destino es la de `DATABASE_URL`: local hoy, Supabase QA al apuntarla allá. El módulo acepta `prisma` inyectado (usado por las pruebas).
