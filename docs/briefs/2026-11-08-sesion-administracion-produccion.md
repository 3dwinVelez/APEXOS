# Brief — La sesion no aguanta al abrir Administracion en produccion

Fecha: 2026-11-08
Rama de trabajo: `desarrollo` (partiendo de `8d6ef81c`, a la par con `origin/desarrollo`)
Ambiente reportado: produccion (`main`, commit desplegado `1b76376c0c37`)

## Instruccion literal del duenyo

> estaba validando mi usuario maestro en productivo pero al intentar acceder al modulo de
> administracion para configurar el modulo me bota el sistema de manera inmediata es como si no
> aguantara la sesion, este es el usuario de productivo [correo personal, no se versiona] para que
> lo valides en el main y corrijas cualquier error que pueda estar pasando en productivo que este
> botando los usuarios

El correo se usa solo para la medida en la base; no entra en evidencia, brief ni commit.

## Decisiones tomadas, con la alternativa descartada

1. **Diagnostico contra el arbol desplegado, no contra `desarrollo`.** Se leyo `origin/main` con
   `git show` en cada archivo citado. *Descartado* razonar con el tree de trabajo: las Fases 1 y 2
   del candado no estan en `main`, y habrian llevado a culpar al enforcement de revocacion, que no
   corre en produccion.
2. **Separar 401 (autenticacion) de 403 (autorizacion/alcance) en el servidor.** *Descartado*
   "arreglarlo" en el cliente tolerando el 401 sin borrar la sesion: eso conservaria un codigo de
   estado incorrecto y rompería el refresh legitimo en los casos donde la credencial si murio.
3. **No escribir datos en produccion sin autorizacion.** *Descartado* insertar la fila
   `company_users` que le falta a la cuenta maestra: es un `INSERT` en la base productiva y la
   ausencia de autorizacion expresa es prohibicion. Se entrega como decision A/B/C/D.
4. **No tocar el orden del login (Supabase antes que local) en esta pasada.** *Descartado* porque
   invertir el orden cambia la forma en que entran todos los tenants, no solo la cuenta maestra, y
   esa decision le pertenece a `apexos-seguridad` con su propia certificacion.

## Que se hizo

| # | Cambio | Ruta |
|---|---|---|
| 1 | Helper `authorizationDenied(message, code)` con `statusCode=403`; los dos rechazos de vinculo de empresa dejan de ser `Error` pelados | `apps/api/src/security/supabaseAuth.js` |
| 2 | El catch del camino Supabase respeta el `statusCode` del error (403 con su codigo) y sigue respondiendo 401 a credencial invalida | `apps/api/server.js` |
| 3 | El bloque que resuelve el tenant pasa de 401 `TOKEN_INVALIDO` a 500 `EMPRESA_NO_RESUELTA`: un titubeo de la base o de la cache no puede derribar una sesion | `apps/api/server.js` |
| 4 | `EMPRESA_REQUERIDA` pasa de 401 a 403 | `apps/api/src/middleware/tenancy.js` |
| 5 | Cuatro rechazos por "autenticado sin rol" pasan de 401 `NO_AUTENTICADO` a 403 `ROL_NO_DEFINIDO` | `apps/api/src/middleware/rbac.js` |
| 6 | `SESSION_SCOPE_CODES` y dos mensajes nuevos: dicen que falta la empresa (o el rol) y afirman que la sesion sigue activa | `apps/web/lib/api.ts` |
| 7 | Prueba de contrato con el decorador real levantado (`require("../server")` + `app.inject`) | `apps/api/test/authorization-status-codes.test.js` (A) |
| 8 | Prueba del contrato del cliente, incluida la que impide que un 403 llegue a `clearSession` | `apps/web/test/session-scope-403.test.mjs` (A) |
| 9 | La prueba que fijaba la conducta equivocada se actualiza a 403/ROL_NO_DEFINIDO | `apps/api/test/hr-route-physical-deletion.test.js` |
| 10 | Diagnostico y pruebas versionados | `docs/qa/evidence/sesion-admin-produccion-20261108/` (A) |
| 11 | Regla nueva en los seis agentes duenos (backend, seguridad, frontend, QA, brief, orquestador), con su bump, espejos, `registry.json` y `CHANGELOG.md` | `.qoder/skills/**`, `agents/**` |

Inventario: **20 M, 5 A, 0 D**. M = 6 de codigo y pruebas (`server.js`, `middleware/rbac.js`, `middleware/tenancy.js`, `security/supabaseAuth.js`, `test/hr-route-physical-deletion.test.js`, `apps/web/lib/api.ts`), 6 `SKILL.md` canonicos, 6 espejos en `agents/`, `agents/registry.json` y `agents/CHANGELOG.md`. A = este brief, las 2 pruebas nuevas y `docs/qa/evidence/sesion-admin-produccion-20261108/` (2 archivos). El `0 D` es el criterio de aceptacion contra `origin/desarrollo`.

## Que se midio

| Medida | Valor |
|---|---|
| auth.users en produccion | 107 (28 con login en 30 dias) |
| `company_users` activas | 106 |
| Usuarios con login reciente y cero memberships | **1 — la cuenta maestra** |
| companies en produccion | 2 (IMPORTADORA SCJ SAS, NYVORA) |
| Rol de la cuenta | APEX_PLATFORM_SUPERADMIN, `*:*` + companies/infrastructure/logs/platform/roles/support/users |
| Modulos activos del tenant | incluye `administracion_apex` y `platform_admin` |
| Prueba de contrato API (con integracion real) | 6/6 |
| Pruebas API afectadas | 32/32 |
| Suite web completa | 666/666 (661 preexistentes + 5 nuevas) |

## Criterios de aceptacion observables

1. Una sesion valida cuya cuenta no tiene empresa asociada **no** produce 401: produce 403 con
   codigo de negocio y el usuario permanece dentro de la aplicacion. Medido con el servidor real.
2. Un token que no resuelve identidad **si** produce 401 `TOKEN_INVALIDO` y el cliente sigue
   tirando la sesion. La autenticacion no se relajo.
3. El mensaje en pantalla nombra la causa (empresa o rol faltante) y dice que la sesion sigue
   activa.
4. Ninguna ruta 403 puede alcanzar `clearSession` (asercion estructural sobre la fuente).

## Evidencia exigida

`docs/qa/evidence/sesion-admin-produccion-20261108/diagnostico.txt` y `pruebas.txt`.

## Deudas que este brief publica

1. **Bloqueado por autorizacion:** el fix no esta en produccion. `main` sigue en `1b76376c` y hoy
   expulsa. Promover a `develop` y a `main` pide autorizacion independiente.
2. **Bloqueado por autorizacion:** la cuenta maestra necesita vinculo de empresa en produccion
   (salidas A/B/C/D en el diagnostico). A y B escriben datos productivos; C y D cambian
   autorizacion y les toca `apexos-seguridad`.
3. Sin certificacion funcional end-to-end con la sesion real del usuario: reproducir el sintoma
   exige la clave de la cuenta y ninguna prueba de este cierre la usa.
4. `apps/api/server.js` y `apps/api/test/**` no tienen agente dueno en el ruteo (`el preflight los
   enruta a equipo-apexos`); es la misma carencia ya registrada en otras intervenciones.
