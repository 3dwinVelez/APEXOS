# Authorization Versions Migration Release Assessment

Fecha original de evaluacion: 2026-08-04.
Fecha de consolidacion en desarrollo: 2026-08-06.

## Alcance

Este documento consolida la evaluacion de release de la migracion:

```text
apps/api/prisma/migrations/20260727042000_authorization_versions/migration.sql
apps/api/prisma/schema.prisma
```

La evidencia original estaba como documento no rastreado en el worktree de
`main`. No se versiono desde `main`; se reconstruyo en `desarrollo` como
evidencia de reconciliacion.

## Commits relacionados

- `7284e64 feat(security): aplicar versionado y revocacion de sesiones`
  introdujo el versionado de autorizaciones.
- La migracion esta presente en `desarrollo` y `develop`.
- La migracion no esta presente en el arbol actual de `main`.

## Cambios evaluados

| Recurso | Cambio | Riesgo |
| --- | --- | --- |
| `Tenant` | Agrega `authorization_version INTEGER NOT NULL DEFAULT 1` | Bajo-medio por lock breve de esquema. |
| `User` | Agrega `authorization_version INTEGER NOT NULL DEFAULT 1` | Bajo-medio por lock breve de esquema. |
| `AuthorizationSession` | Tabla nueva con versionado de usuario y tenant | Bajo; tabla nueva sin filas previas. |
| Indices de `AuthorizationSession` | Indices por usuario/tenant y revocacion | Bajo; tabla nueva. |

## Estado por rama

| Rama | Estado |
| --- | --- |
| `desarrollo` | Contiene migracion y cambios de Prisma. |
| `develop` | Contiene migracion y cambios de Prisma. |
| `main` | No contiene la migracion en el arbol actual. |

## Compatibilidad

El backend nuevo espera `AuthorizationSession` y las columnas
`authorization_version` durante login y refresh. Por esa razon:

- Codigo nuevo antes de la migracion: riesgo de fallo en login API Prisma.
- Codigo anterior despues de la migracion: compatible con columnas y tabla
  adicionales.
- Procedimiento recomendado futuro: aplicar migracion antes del backend que la
  usa y mantener flags de enforcement apagados durante la promocion inicial.

Flags relacionados:

```text
AUTHORIZATION_VERSION_ENFORCEMENT_ENABLED
AUTHORIZATION_VERSION_OBSERVATION_ENABLED
```

## Dictamen consolidado

```text
AUTORIZADA CON FLAGS DESACTIVADOS PARA QA/RELEASE CONTROLADO
```

No se ejecuto migracion productiva durante esta reconciliacion. Una futura
promocion a produccion debe validar estructura, login, refresh y logout antes
de activar enforcement.
