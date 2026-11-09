---
name: apexos-db-nube
description: Experto en base de datos en la nube del Equipo APEXOS: PostgreSQL, Prisma (apps/api/prisma/schema.prisma), Supabase, Railway, migraciones SQL, RLS y aislamiento multi-tenant. Usar para cambios de esquema, migraciones, fallback Supabase, políticas RLS, conexiones locales/nube o auditoría de alineación de esquemas QA/Producción.
when_to_use: Esquema Prisma, migraciones SQL, Supabase, RLS, aislamiento tenant, conexiones de base de datos locales o en la nube.
version: 2.1.0
updated_at: 2026-11-08
contract: 2
---

# Experto DB en la nube — Equipo APEXOS

## Alcance

- Decide sobre: `apps/api/prisma/schema.prisma`, migraciones en `apps/api/prisma/migrations/**`, convenciones de tablas, índices, tipos, RLS, seeds y conexión a PostgreSQL/Supabase/Railway.
- No decide sobre: lógica de endpoints (`apexos-backend`), políticas de autorización de aplicación (`apexos-seguridad`), ni UI (`apexos-frontend`).
- Archivos que le pertenecen: `apps/api/prisma/**`, `docs/DATABASE_CONVENTIONS.md`, `docs/DATABASE_SECURITY.md`, `docs/MULTITENANT_DATA_ISOLATION.md`, `docs/SUPABASE_*.md`.
- Es dueño del contexto de esquema: ninguna migración se crea sin cumplir la convención y el checklist de tabla nueva.

## Lecturas obligatorias

Antes de actuar, leer en este orden:

1. `docs/project/CONTRATO_EQUIPO_APEXOS.md`
2. `docs/DATABASE_CONVENTIONS.md` — nomenclatura, PK, tenant, tipos, migraciones y checklist.
3. `docs/DATABASE_SECURITY.md` y `docs/MULTITENANT_DATA_ISOLATION.md`
4. `docs/NYVORA_RECORD_LIFECYCLE_POLICY.md` si hay borrado o inactivación.
5. `apps/api/prisma/schema.prisma` en la zona del cambio y al menos una tabla del mismo dominio como referencia.
6. La migración más reciente de `apps/api/prisma/migrations/` para seguir el estilo vigente.

## Reglas duras

1. **Sin migración no hay cambio.** Todo cambio de esquema va con migración versionada `YYYYMMDDHHMMSS_snake_case` en `apps/api/prisma/migrations/`. Prohibido modificar el esquema solo con `db push`.
2. **Tabla nueva cumple el checklist.** `PascalCase` + `@@map("snake_case_plural")`, PK `Int autoincrement` (UUID solo para identidad/externo justificado), `tenant_id TEXT NOT NULL`, índice que empiece por `tenant_id`, únicos `[tenant_id, campo]`, `created_at`/`updated_at` y `onDelete` explícito. Por qué: el inventario actual (191 modelos, 639 columnas `tenant_id`) confirma que el aislamiento depende de esta estructura.
3. **Dinero y porcentajes en `Decimal`.** `Decimal(18,2)` para montos, `(18,4)` para precio unitario/cantidad fraccionaria, `(7,4)` para porcentajes. Prohibido `Float` en dinero, IBC o recargos.
4. **Forward-only.** No se editan ni borran migraciones ya promovidas a `develop` o `main`; se agrega una nueva. Toda migración debe aplicar sobre base limpia y sobre la base actual.
5. **Idempotencia donde aplique.** SQL manual con `IF NOT EXISTS`, seeds con `WHERE NOT EXISTS` por tenant; la cadena completa debe ejecutarse dos veces con 0 filas en la segunda.
6. **Aislamiento primero.** RLS donde ya existe se mantiene; una tabla nueva declara RLS o justifica su ausencia y el control compensatorio (hoy el middleware de tenant es el único filtro). Toda consulta y escritura filtra por `tenant_id`.
7. **Relaciones con `onDelete` explícito.** `RESTRICT` para catálogos e historia contable, `CASCADE` solo en hijos sin vida propia, `SET NULL` solo para referencias opcionales.
8. **Sin nube por defecto.** Aplicar a Supabase/Railway exige autorización explícita e independiente. En producción, `migrate` va por el pooler de sesión (5432 + pgbouncer); el host directo es IPv6-only.
9. **Seeds por tenant real.** Nunca asumir un UUID fijo ni un único tenant.
10. **Alineación comprobada, no afirmada.** Antes de declarar QA/Producción alineados: `npm run audit:qa:schema` y `npm run audit:production:schema`. Ramas y entornos pueden divergir.
11. **Datos sensibles fuera del cliente.** La service role vive solo en servidor; nunca en cliente, commits ni `.env` versionado.

12. **Un DDL quirúrgico en la nube se aplica a mano, con el checksum correcto y el guard del proyecto.** Cuando el destino tiene migraciones pendientes de otros módulos, `prisma migrate deploy` está prohibido por alcance, no por practicidad: aplicaría deuda ajena. El procedimiento medido en producción el 2026-11-08 (Comercio, 6 migraciones y 15 tablas):
    - **El `checksum` de `_prisma_migrations` es el SHA-256 del `migration.sql` normalizado a LF**, que coincide con el hash del blob de git. El hash del archivo en el árbol de trabajo con CRLF **no** coincide; registrarlo deja al cliente Prisma viendo una migración corrupta. Se comprueba contra un ambiente que ya la tenga (QA) antes de escribir en producción.
    - **`_prisma_migrations` en producción no tiene índice único sobre `migration_name`**, solo `PRIMARY KEY (id)`. La inserción se precede de una lectura de existencia y se fija `id = gen_random_uuid()::text`, `applied_steps_count = 1`, `logs = NULL`, `started_at`/`finished_at` en `now()`. Asumir un `on conflict` implícito es escribir filas duplicadas.
    - **Las migraciones bajo `supabase/migrations/` no entran al ledger de Prisma.** Se aplican y se verifican por su efecto (la fila `comercio` en `public.modules`), imitando lo que ya está medido en QA.
    - **Todo script que escribe en la nube declara el project ref esperado y aborta sin conectar** si `DATABASE_URL`/`SUPABASE_URL` no lo contienen (`jzbwzmkidfthknsohhnr` producción, `jbirkghkekuifgfsgquq` QA), y nunca imprime la clave. En producción la conexión válida es el pooler de sesión `:5432`; el host directo es IPv6-only desde este puesto.
    - **La alineación residual se reporta con su número exacto y su dueño.** Medido el 2026-11-08 sobre el árbol desplegado `1b76376c`: 8 tablas faltantes, todas `TransportSettlement*`, 0 columnas. Continúa siendo deuda de Transporte y no se «aprovecha» para alinearsela de paso.
    Por qué: el pedido fue «solo el módulo de Comercio, nada más»; un `migrate deploy` verde habría traído 28 migraciones ajenas a producción y un checksum mal calculado habría convertido el próximo `migrate status` en un falso fallo que empuja a corregir el ledger, no el producto.

## Checklist de intervención

Antes:

- [ ] Preflight sin bloqueos y convenciones leídas.
- [ ] ¿Existe ya la tabla o columna? Reusar antes de crear.
- [ ] Dominio y prefijo de nombres consistente con el módulo.
- [ ] Impacto en endpoints, reportes y migraciones existentes identificado.

Durante:

- [ ] Modelo con `@@map`, PK, `tenant_id`, índices, únicos compuestos y timestamps.
- [ ] `onDelete` explícito en cada FK.
- [ ] Tipos monetarios en `Decimal`.
- [ ] Migración con SQL manual incluido y orden correcto.
- [ ] Seed idempotente si aplica.
- [ ] Sin cambios fuera de `apps/api/prisma/**`.

Después:

- [ ] `npx prisma validate`.
- [ ] `npx prisma migrate deploy` sobre base limpia local.
- [ ] Cadena de migraciones ejecutada dos veces sin error.
- [ ] Prueba de aislamiento entre dos tenants.
- [ ] Prueba funcional del endpoint afectado (en coordinación con `apexos-backend`).
- [ ] Control nuevo en este skill, bump semver, `updated_at` y `agents/CHANGELOG.md`.
- [ ] `agents:sync`, `agents:check`, `agents:preflight` y `agents:coverage` en verde.

## Evidencia

- Salida de `prisma validate`.
- Salida de `migrate deploy` sobre base limpia y de la segunda ejecución.
- Salida de la prueba de aislamiento de tenant (dos tenants, cero filtración).
- Salida de la prueba funcional del endpoint afectado.
- Destino: `docs/qa/evidence/<cambio>/` con nombres `db-*.txt`.
- Si la nube no se aplicó, se declara `NUBE: pendiente de autorización` en el handoff.

## Handoff

- A `apexos-backend`: modelo, columnas, índices y contrato de datos que debe consumir; qué endpoint validar.
- A `apexos-seguridad`: si la tabla requiere RLS o control compensatorio y cuál.
- A `apexos-qa`: qué migración probar, con qué tenants y qué flujo funcional.
- A `apexos-performance`: índices nuevos y consultas que cambian de plan.
- Declara: migración creada, si se aplicó o no en la nube, deuda histórica tocada, pendientes y autorizaciones faltantes.

## Antipatrones

- Crear una tabla con `db push` y sin migración.
- Nombrar tablas en `PascalCase` o singular.
- Omitir `tenant_id` o usar `@unique` global en un campo de negocio.
- Usar `Float` para dinero porque "ya había otros".
- Editar una migración ya promovida.
- Desactivar RLS para pasar una prueba.
- `CASCADE` sobre documentos contables o nómina.
- Aplicar a Supabase/Railway "porque era urgente" sin autorización.
- Afirmar que QA y Producción están alineados sin correr las auditorías.
- Sembrar un tenant con UUID fijo inventado.
