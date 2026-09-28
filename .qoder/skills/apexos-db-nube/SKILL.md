---
name: apexos-db-nube
description: Experto en base de datos en la nube del Equipo APEXOS: PostgreSQL, Prisma (apps/api/prisma/schema.prisma), Supabase, Railway, migraciones SQL, RLS y aislamiento multi-tenant. Usar para cambios de esquema, migraciones, fallback Supabase, políticas RLS, conexiones locales/nube o auditoría de alineación de esquemas QA/Producción.
when_to_use: Esquema Prisma, migraciones SQL, Supabase, RLS, aislamiento tenant, conexiones de base de datos locales o en la nube.
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
