# Producción — conteos de datos antes y después de la ventana (2026-11-13 → 14)

Línea base medida en el Supabase de producción (proyecto `jzbwzmkidfthknsohhnr`) antes de aplicar las
24 migraciones pendientes, dentro de esta misma intervención. Después se midió con el mismo query
(`docs/qa/evidence/promocion-paquetes-main-20261113/prod-data-counts-after.txt`) una vez desplegado
`main` en `c8e5e67c52b1`.

| Tabla | Antes | Después | Delta | Lectura |
|---|---:|---:|---:|---|
| `Tenant` | 5 | 5 | 0 | sin cambios |
| `User` | 186 | 186 | 0 | sin usuarios nuevos ni bajas |
| `Employee` | 391 | 391 | 0 | sin cambios |
| `employees` (tabla cruda Supabase) | 101 | 101 | 0 | sin cambios |
| `TimePunch` | 2136 | 2154 | +18 | marcaciones en vivo de la operación real, no del despliegue |
| `TimeRoute` | 298 | 298 | 0 | sin cambios |
| `cnt_cuedoc` | 3 | 3 | 0 | sin aperturas nuevas |
| `TransportCarrier` | 0 | 0 | 0 | sin cambios |
| `TransportOrigin` (vista de compatibilidad) | 0 | 3 | +3 | refleja las 3 sedes de abajo |
| `sedes` (tabla; antes `TransportOrigin`) | 0 | 3 | +3 | creadas por el bootstrap de la app (`metadata.source = admin_user_master_data`) el 2026-11-14 00:07:32, después de la migración |
| `TransportRateCard` | 0 | 0 | 0 | sin cambios |
| `TransportNeed` / `TransportTrip` / `TransportPlan` | 0 | 0 | 0 | sin cambios |
| `TransportDriver` | 0 | 0 | 0 | sin cambios |
| `TransportSettlementPackage` / `TransportSettlementPeriod` | 0 | 0 | 0 | sin cambios |
| `modules` (catálogo Supabase) | 34 | 34 | 0 | M-29 ya estaba catalogado; la migración lo actualizó |
| `apexos_accounting_private.standard_chart` | no existía | 2508 | +2508 | plan de cuentas estándar, objeto nuevo |

## Migraciones

- 68 migraciones aplicadas en `_prisma_migrations`; 0 fallidas o pendientes (`prod-migrate-deploy.log`).
- 24 aplicadas en la ventana: 14 de Talento Humano, 6 de `develop` (planes, geografía, cajas menores,
  PYG, aperturas, sedes) y las 2 de `main` que producción no tenía (GPS sin señal, paquetes de
  liquidación). Las 2 de nómina de hora extra y descanso son las únicas no aditivas y están descritas
  abajo.
- Operaciones no aditivas verificadas: rename `TransportOrigin` → `sedes` (0 filas al momento),
  `UPDATE th_conceptos_recargo` que fija `value_type='factor_total'` para HED/HEN/HEDD/HEND y
  `ALTER TABLE TimeRoute ADD COLUMN kind` con valor por defecto. Las tres conservan datos; la vista
  `TransportOrigin` mantiene el nombre anterior para el código viejo durante el despliegue.

## Objetos Supabase

- `apexos_accounting_private.standard_chart`: creado con 2508 cuentas.
- Catálogo M-29 (`gastos_menores`): activo en el catálogo, 3 empresas con fila y 0 habilitadas.
  NYVORA no lo tiene licenciado; sus endpoints responden `403 MODULO_NO_HABILITADO` como contrato.

## Sedes nuevas en producción

Las 3 filas de `sedes` no son del SQL de migración: `metadata.source = admin_user_master_data` y
`created_at = 2026-11-14T00:07:32.951Z` corresponden al bootstrap del API ya desplegado, que crea la
sede principal y dos sedes Bogotá cuando la empresa entra al administrador de datos maestros. Son
filas aditivas, con coordenadas por completar, y no modifican registros existentes.
