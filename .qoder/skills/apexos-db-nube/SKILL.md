---
name: apexos-db-nube
description: Experto en base de datos en la nube del Equipo APEXOS: PostgreSQL, Prisma (apps/api/prisma/schema.prisma), Supabase, Railway, migraciones SQL, RLS y aislamiento multi-tenant. Usar para cambios de esquema, migraciones, fallback Supabase, políticas RLS, conexiones locales/nube o auditoría de alineación de esquemas QA/Producción.
when_to_use: Esquema Prisma, migraciones SQL, Supabase, RLS, aislamiento tenant, conexiones de base de datos locales o en la nube.
version: 1.1.0
updated_at: 2026-11-02
---

# Experto DB en la nube — Equipo APEXOS

## Referencias clave

- `apps/api/prisma/schema.prisma` — esquema universal tenant-first
- `apps/api/prisma/` — migraciones versionadas
- `docs/SUPABASE_CONNECTION.md`, `docs/SUPABASE_QA_VALIDATION.md`, `docs/SUPABASE_STORAGE.md`
- `docs/DATABASE_SECURITY.md`, `docs/RLS_SECURITY_MATRIX.md`, `docs/RLS_DEPLOYMENT_VALIDATION.md`
- `infra/docker-compose.yml` — Postgres local en puerto 55432

## Reglas

- Ningún cambio de esquema sin migración documentada. En local: `npm run prisma:validate` y `npm run db:push` (solo desarrollo).
- RLS primero: toda tabla multi-tenant debe aislar por tenant. Validar despliegue con `npm run security:inspect-rls`.
- Alineación de esquemas antes de releases: `npm run audit:qa:schema` y `npm run audit:production:schema`.
- La service role de Supabase vive solo en servidor; nunca en cliente, commits ni `.env` versionado.
- Fallback Supabase: una escritura crítica no se confirma por fallback si la API responde error.
- Correcciones sobre órdenes Supabase deben respetar versionado (`order_version`) y crearse como DRAFT.
- Prohibido: conectar local a producción, borrar datos o migrar Railway/Supabase sin autorización explícita.

## Controles acumulados (entrenamiento 2026-11-02)

- **Migraciones idempotentes.** Validar en PostgreSQL desechable (`initdb`/`pg_ctl`, puerto libre), ejecutar la cadena completa dos veces y exigir 0 filas en la segunda. Usar `WHERE NOT EXISTS` en seeds por tenant.
- **Sin nube por defecto.** Aplicar a Supabase/Railway es una autorización independiente. En producción, `prisma migrate` va por el pooler de sesión (5432 + pgbouncer); el host directo es IPv6-only.
- **RLS no es universal.** Varias tablas no tienen políticas; el aislamiento real lo ejerce el middleware de tenant. Al proponer una tabla nueva, incluir RLS o justificar su ausencia y el control compensatorio.
- **Seeds multi-tenant.** Sembrar por tenant existente, nunca asumir un único tenant ni un UUID fijo. Topes IBC: 25 SMMLV mensual con prorrateo de 15 días en quincena.
- **Tipos monetarios.** `numeric/decimal`, nunca `float`, para dinero, IBC y porcentajes.
- **Alineación real.** `main`, `develop` y `desarrollo` pueden tener esquemas distintos; verificar con `npm run audit:qa:schema` y `npm run audit:production:schema` antes de afirmar que están alineados.
- **Entornos locales incompletos.** `master_catalogs` puede no existir en la instancia local; no asumir su presencia ni crear dependencias duras de ella.
