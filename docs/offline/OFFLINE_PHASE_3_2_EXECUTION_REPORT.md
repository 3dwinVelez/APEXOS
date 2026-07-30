# Informe de ejecucion Fase 3.2

Fecha: 2026-07-27  
Resultado: **ambiente local preparado**

## Diagnostico

`config/local.env` apuntaba al puerto inactivo `54320`. El Docker general usa
`55432`, contiene datos y schema anterior. Existe ademas PostgreSQL Windows en
`5432`, no administrado por el proyecto. Ninguno fue modificado.

La fuente Prisma contiene ocho migraciones aditivas, incluida
`20260727042000_authorization_versions`. No existe baseline core. Se adopto una
base Docker dedicada y un baseline combinado solo local, descrito en
`OFFLINE_LOCAL_SCHEMA_VALIDATION.md`.

## Ejecucion

La primera reconstruccion revelo incompatibilidad de PowerShell con
`RandomNumberGenerator.Fill`; se corrigio a `Create().GetBytes()`. La siguiente
detecto `P3005` al intentar deploy sobre el snapshot no vacio; se implemento el
baseline oficial mediante ejecucion SQL ordenada y `migrate resolve`. El primer
validador esperaba el nombre de modelo de evidencia en vez de su `@@map`; se
corrigio a `evidence_upload_authorizations`.

La reconstruccion final desde volumen eliminado paso:

```text
PostgreSQL: 16.14
tablas: 88
migraciones: 8, cero pendientes
claves foraneas: 67
indices: 325
extensiones: pg_trgm, plpgsql
Tenant/User.authorization_version: presentes
AuthorizationSession: presente
tenants/usuarios/ordenes/evidencias: 0
```

El smoke del certificador devuelve `schemaCompatible=true` y
`exactTenantMatches=0`. Esto es el resultado esperado antes del seed.

## Regresion

- Scripts Node, PowerShell y Compose: correctos.
- Prisma validate: correcto.
- API: 46/46.
- Offline web: 21/21.
- TypeScript y ESLint: correctos.
- Build Next: correcto; shared 103 kB, Servicios 155 kB, detalle 163 kB.
- Performance guard: 17 objetivos, 0 fallos.
- `git diff --check`: correcto.

## Limites

No se ejecuto el seed, no se crearon credenciales y no se reintento la
certificacion funcional. No hubo conexiones remotas, migraciones QA/produccion,
datos reales, cambios offline, push, merge ni despliegue.
