# Incidente de autenticacion por esquema incompleto

Fecha: 2026-08-12

## Impacto

La API productiva acepto el despliegue como saludable, pero el inicio de sesion y las consultas de empresa fallaron con `500`. La interfaz interpreto esas respuestas como perdida de autorizacion y retiro la sesion del usuario.

## Causa raiz confirmada

Los registros productivos reportaron Prisma `P2022` para:

- `Tenant.authorization_version`
- `User.authorization_version`

El codigo desplegado dependia de la migracion `20260727042000_authorization_versions`, pero el esquema productivo no contenia esas columnas. El endpoint `/health` solo ejecutaba `SELECT 1`, por lo que Railway aprobo una API conectada a PostgreSQL pero funcionalmente incompatible.

## Correccion preventiva

- `/health` valida las tablas y columnas necesarias para crear y verificar sesiones.
- Un esquema incompleto devuelve `503`, `SCHEMA_INCOMPATIBLE` y la lista de elementos faltantes.
- `npm run certify:auth-session` comprueba commit desplegado, salud, login real, `/auth/me` y una consulta autenticada.

## Regla de promocion

Esta intervencion no puede promoverse a `main` con una comprobacion HTTP superficial. El certificado debe ejecutarse con datos reales en QA sobre el SHA exacto de `develop`, adjuntarse al manifiesto y repetirse en produccion despues de aplicar la migracion autorizada.

La aplicacion de migraciones remotas conserva una autorizacion independiente. La correccion de codigo no sustituye esa autorizacion ni demuestra que el esquema remoto haya sido reparado.
