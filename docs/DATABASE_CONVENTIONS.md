# Convenciones de base de datos — APEXOS

Versión: 1.0 — 2026-11-03

Norma operativa para crear o modificar tablas en `apps/api/prisma/schema.prisma` y en `apps/api/prisma/migrations/`. Complementa `docs/DATABASE_SECURITY.md` y `docs/MULTITENANT_DATA_ISOLATION.md`; no los reemplaza.

## 1. Estado medido del esquema (referencia, no excusa)

Medición sobre `schema.prisma` el 2026-11-03:

| Indicador | Valor actual | Lectura |
|---|---|---|
| Modelos | 191 | Base madura, herencia histórica mixta |
| Modelos con `@@map` | 91 | El resto usa el nombre PascalCase como tabla física |
| PK `autoincrement()` | 185 | Convención dominante |
| PK `uuid()` | 3 | Solo `Tenant` y entidades de identidad externa |
| Columnas `tenant_id` | 639 | Multi-tenant real, no opcional |
| Índices con `tenant_id` | 351 | Ya es el patrón de acceso |
| `Float` | 216 | Deuda histórica; no se replica |
| `Decimal` | 90 | Convención para dinero nueva |
| Migraciones | 72 | Nomenclatura `YYYYMMDDHHMMSS_snake_case` |

Regla: el código nuevo sigue las reglas de este documento. La deuda histórica no autoriza a repetirla.

## 2. Nomenclatura

- Modelo Prisma: `PascalCase` singular (`CommercialAdvisor`).
- Tabla física: `snake_case` plural, declarada con `@@map("commercial_advisors")`. Todo modelo nuevo lleva `@@map`.
- Columnas: `snake_case` (`legal_name`, `created_at`, `tenant_id`).
- Índices y constraints: los nombres generados por Prisma con el nombre de tabla física; no se renombran a mano.
- Prefijo de dominio solo si el módulo ya lo usa de forma consistente (`inv_`, `cnt_`); no se inventan prefijos nuevos sin aprobación del módulo.
- Migración: `YYYYMMDDHHMMSS_snake_case` en `apps/api/prisma/migrations/`, con `migration.sql` idempotente cuando aplique `IF NOT EXISTS`.

## 3. Clave primaria

- Por defecto: `Int @id @default(autoincrement())`, mapeado a `SERIAL`.
- `String @id @default(uuid())` solo para:
  - entidades de plataforma o identidad (`Tenant`),
  - registros que se exponen como identificador público y no deben ser enumerables.
- UUID no reemplaza la PK interna en tablas de negocio; si se requiere un ID externo, se agrega columna `external_*_id` con índice único por tenant.
- No se usan claves compuestas como PK salvo tablas puente puras, y en ese caso se documenta en el modelo.

## 4. Multi-tenant

- Toda tabla operativa nueva lleva `tenant_id TEXT NOT NULL`.
- Toda relación con datos de tenant valida pertenencia antes de escribir: el backend nunca confía en el `tenant_id` del cuerpo.
- El middleware de tenant es el único filtro hoy en la API; por eso ningún endpoint puede consultar sin `tenant_id`.
- Índices obligatorios:
  - `@@index([tenant_id])` o índice compuesto que empiece por `tenant_id`.
  - Únicos de negocio: `@@unique([tenant_id, <campo>])`, no `@unique` global.
- Catálogos globales: solo si son de plataforma (`modules`, `plans`); el resto es por tenant.
- RLS: se mantiene donde ya existe (`docs/DATABASE_SECURITY.md`); no se agrega ni se desactiva sin auditoría de seguridad.

## 5. Tipos y dinero

- Dinero: `Decimal @db.Decimal(18, 2)`. Prohibido `Float` para montos.
- Precio unitario y cantidades fraccionarias: `Decimal @db.Decimal(18, 4)`.
- Porcentajes, tasas y recargos: `Decimal @db.Decimal(7, 4)`. Prohibido `Float` para porcentajes.
- Cantidades enteras: `Int`; usar `BigInt` solo con justificación de volumen.
- Fechas: `DateTime` (`TIMESTAMP(3)`); fechas de calendario sin hora se documentan y se guardan normalizadas a la zona del tenant.
- Estructura flexible: `Json` con `@default("{}")` o `@default("[]")`; nunca para reemplazar columnas consultables.
- Booleanos de estado: `Boolean @default(true)` para `active`; estados de flujo se modelan con `String` + catálogo o enum, no con múltiples booleanos.

## 6. Auditoría y ciclo de vida

- Toda tabla nueva lleva `created_at DateTime @default(now())` y `updated_at DateTime @updatedAt`.
- Campos de actor cuando aplica: `created_by_id`, `updated_by_id` con FK a `User`.
- Borrado: preferir estado (`active = false`) o transición documentada. Borrado físico solo bajo `docs/NYVORA_RECORD_LIFECYCLE_POLICY.md`.
- Para operaciones sensibles se registra en `AuditLog`; no se implementa auditoría paralela por tabla.

## 7. Relaciones

- Toda FK declara `onDelete` explícito; no se acepta el default implícito.
  - `RESTRICT` para catálogos y documentos con historia contable.
  - `CASCADE` solo en hijos que no tienen vida propia (líneas de un documento).
  - `SET NULL` solo para referencias opcionales.
- Toda FK a tabla de tenant se acompaña de índice por `tenant_id` + FK.
- No se crean relaciones polimórficas nuevas sin columna discriminadora e índice.

## 8. Migraciones

- Forward-only. No se editan migraciones ya aplicadas en `develop` o `main`; se crea una nueva.
- Cada migración debe poder aplicarse sobre una base vacía y sobre la base actual, sin depender de datos previos.
- SQL manual (`ALTER TABLE`, `CREATE INDEX`, backfill) va en la misma migración que el cambio de esquema.
- Backfills grandes: por lotes, idempotentes y con criterio de reanudación.
- No se ejecutan migraciones en la nube sin autorización explícita; por defecto solo local.
- Validación obligatoria local: `npx prisma validate`, `npx prisma migrate deploy` sobre base limpia, y prueba del endpoint afectado.

## 9. Checklist de tabla nueva

Antes de escribir el modelo:

- [ ] ¿Existe ya una tabla que cubre el caso? Reusar antes de crear.
- [ ] Nombre de modelo `PascalCase` y `@@map("snake_case_plural")`.
- [ ] PK `Int autoincrement` o UUID justificado.
- [ ] `tenant_id TEXT NOT NULL` e índice que empiece por `tenant_id`.
- [ ] Únicos de negocio con `[tenant_id, ...]`.
- [ ] `created_at` y `updated_at`.
- [ ] Montos en `Decimal`, nunca `Float`.
- [ ] `onDelete` explícito en cada FK.
- [ ] Estado activo/inactivo antes de proponer borrado.
- [ ] Migración `YYYYMMDDHHMMSS_nombre` + `migration.sql`.
- [ ] Endpoint y servicio filtran por tenant.
- [ ] Prueba que demuestre aislamiento entre dos tenants.

## 10. Prohibiciones

- Crear tablas fuera de Prisma o sin migración versionada.
- Usar `Float` para dinero, porcentajes o cantidades contables.
- Tabla operativa sin `tenant_id`.
- `@unique` global en campos de negocio por tenant.
- Editar o borrar migraciones ya promovidas.
- Desactivar RLS para hacer pasar una prueba.
- `CASCADE` en documentos con historia contable o nómina.
- Nombres de tabla en PascalCase, camelCase o singulares en código nuevo.
- Borrado físico de entidades protegidas sin autorización.

## 11. Evidencia de cierre

Toda intervención que toque el esquema adjunta en `docs/qa/evidence/<cambio>/`:

1. `prisma validate` en verde.
2. `migrate deploy` local sobre base limpia en verde.
3. Salida de la prueba de aislamiento de tenant.
4. Salida de la prueba funcional del endpoint afectado.
