# Alineación de esquema en producción — 2026-09-18

## Incidente detectado por la certificación NYVORA en producción

La certificación masiva NYVORA contra `main` (commit `d28eec07acec`, deploy Railway `apexos-api-prod-production`) falló en 22 de 69 endpoints con `500 ERROR_INTERNO` (código Prisma `P2022`: columnas inexistentes). Evidencia del fallo: `prod-nyvora-mass-regression-pre-migration.json`.

Columnas reportadas como inexistentes:

| Columna | Endpoints afectados |
|---|---|
| `Item.legacy_code` | inventory/items, inventory/costs, purchases/vmi-alerts |
| `Party.receivable_balance` | purchases/suppliers, purchases/orders, sales/customers, accounting/reports/payables, brain/ecosystem, brain/insights, brain/mentor |
| `cnt_cabdoc.referenced_document_id` | accounting/documents |
| `cxp_cabdoc.gross_total` | accounting/payables/documents |
| `TimePunch.idempotency_key` | hr/operations-map, hr/attendance |

## Causa raíz

Deriva de esquema preexistente a la intervención: la base Supabase de producción solo tenía **2 de 38 migraciones** registradas en `_prisma_migrations` (dos migraciones puntuales aplicadas manualmente el 2026-08-13). El esquema de prod fue creado originalmente con un `db push` y nunca recibió la cadena de migraciones versionadas. El código de `main` (incluido el commit anterior `1d4c0b5`) ya exigía esas columnas, por lo que prod ya estaba rota antes de esta intervención; la certificación de producción del release 20260917 había quedado pendiente ("smoke checks" pos-deploy no ejecutados).

QA nunca presentó el fallo porque su base tiene las 38 migraciones aplicadas.

## Resolución (autorizada por el release owner)

1. Auditoría de solo lectura de `_prisma_migrations` en prod vs. QA vs. carpeta de migraciones del repo.
2. `prisma migrate deploy` contra prod vía session pooler (`pgbouncer=true`); el host directo (`db.<ref>.supabase.co`) no es alcanzable desde la máquina de QA por resolver solo a IPv6.
3. Una colisión: `20260814003500_sales_invoicing_cxc`. Las 6 tablas ya existían en prod como supersets (push posterior con más columnas) y las 8 FKs ya estaban presentes; se aplicaron los 16 índices faltantes con `CREATE INDEX IF NOT EXISTS` (incluido el único `retention_masters_tenant_id_code_key`, sin duplicados previos) y se marcó la migración como aplicada con `prisma migrate resolve --applied`.
4. Resultado: **38/38 migraciones aplicadas** en prod, sin drift restante; las 5 columnas verificadas presentes.

## Verificación final

- Certificación masiva NYVORA en producción: **69/69 pasados, 0 fallos** (`prod-nyvora-mass-regression.json`), usuario de certificación desactivado.
- Health de prod: `{"status":"OK","modules":17,"commit":"d28eec07acec"}`.
- Logs de prod sin errores no manejados posteriores a la migración.
