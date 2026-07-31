# Validacion del schema local de certificacion

## Fuente autoritativa

El repositorio no contiene una migracion baseline para las tablas core. Las
migraciones Prisma empiezan con cambios aditivos sobre tablas existentes. La
reconstruccion usa un proceso combinado y documentado:

1. `schema.prisma` materializa el snapshot actual sobre una base vacia mediante
   `prisma db push`, sin `--accept-data-loss`.
2. Cada `migration.sql` versionado se ejecuta en orden con
   `ON_ERROR_STOP=1`.
3. Cada migracion se registra con `prisma migrate resolve --applied`.
4. `prisma migrate deploy` debe terminar sin pendientes.
5. El validador estructural exige base vacia y contrato critico completo.

La ausencia de baseline historico es una deuda de gobierno. El flujo local no
se debe extrapolar a QA o produccion.

## Matriz de estructura

| Componente | Fuente | Uso en certificacion |
| --- | --- | --- |
| Tablas/modelos Prisma | `schema.prisma` | si |
| Indices y extensiones aditivas | `apps/api/prisma/migrations` | si |
| Versiones y sesiones | `20260727042000_authorization_versions` | si |
| Evidencia autorizada | `20260727040000_authoritative_evidence_uploads` | estructura vacia |
| Extensiones base | migraciones Prisma (`pg_trgm`) y PostgreSQL (`plpgsql`) | si |
| RLS/policies Supabase | `supabase/migrations` | no; datastore paralelo |
| Auth/Storage Supabase | stack Supabase | no requerido por auth Prisma local |
| Seeds | certificador controlado | diseñado, no ejecutado |

Las migraciones Supabase administran `companies`, Auth, Storage, buckets, RLS,
policies, funciones y triggers de otro datastore. Capabilities/bootstrap usan
`Tenant`, `User`, `AuthorizationSession` y Servicios por Prisma; por eso el
ambiente seleccionado no simula Supabase.

## Integridad verificada

- Ocho migraciones disponibles, ordenadas y con SHA-256 registrado en la
  auditoria de ejecucion.
- Sin INSERT/UPDATE/DELETE de seed ni referencias a hosts QA/produccion.
- Un `DROP INDEX IF EXISTS` acotado a reemplazo de indice.
- `Tenant.authorization_version` y `User.authorization_version`: entero,
  default 1.
- `AuthorizationSession`: versiones, expiracion, revocacion, FK e indices.
- 88 tablas, 67 claves foraneas, 325 indices.
- Extensiones: `pg_trgm`, `plpgsql`.
- Cero RLS/policies en el datastore Prisma local, segun frontera anterior.
- Cero tenants, usuarios, ordenes, fotos y autorizaciones de evidencia.

El script `validate-offline-cert-schema.js` aborta ante host, puerto, nombre,
tabla, tipo, migracion o conteo inesperado.

