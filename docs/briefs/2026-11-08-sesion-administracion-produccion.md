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
| Certificacion end-to-end versionada | `npm run certify:sesion-admin:local` 11 cheques / 0 fallos |
| Certificacion de ambiente QA desplegado | `sesion-administracion-qa.js` 9 controles / 0 fallos sobre `6edf85c7d622` |
| Celda de navegador del sintoma | `403 EMPRESA_NO_VINCULADA`, URL sin cambio, token vivo, reintento identico |
| Promocion a `main` | candidato `3fa6a5f0` + documentales, inventario 23 rutas (16 A / 7 M / 0 D), `allowed_deletions: []` |
| Puertas de promocion sobre el tip final | `ALCANCE DE PROMOCION VALIDO (23 rutas)` y `APROBACION QA VALIDA` |
| Produccion despues del deploy | `/health commit=b8a24c5c38c0`; anonimo y token forjado siguen `401 TOKEN_INVALIDO` |
| Regresiones atribuibles al candidato | 0 (API 500/495 vs base 494/490 con los mismos nombres; web 443/442 vs 438/437 con el mismo nombre) |

## Criterios de aceptacion observables

1. Una sesion valida cuya cuenta no tiene empresa asociada **no** produce 401: produce 403 con
   codigo de negocio y el usuario permanece dentro de la aplicacion. Medido con el servidor real.
2. Un token que no resuelve identidad **si** produce 401 `TOKEN_INVALIDO` y el cliente sigue
   tirando la sesion. La autenticacion no se relajo.
3. El mensaje en pantalla nombra la causa (empresa o rol faltante) y dice que la sesion sigue
   activa.
4. Ninguna ruta 403 puede alcanzar `clearSession` (asercion estructural sobre la fuente).
5. `npm run certify:sesion-admin:local` termina en verde con 11 cheques y deja el JSON de
   evidencia en el repositorio. Un gate que no devuelve veredicto cuenta como fallo.

## Evidencia exigida

`docs/qa/evidence/sesion-admin-produccion-20261108/diagnostico.txt`, `pruebas.txt` y
`certificacion-local.json` (salida de `npm run certify:sesion-admin:local`,
`scripts/certifications/sesion-administracion-local.js`).

La certificacion levanta el servidor real escuchando en loopback contra un borde Supabase
simulado, mide en la misma corrida el 403 de sesion valida sin empresa y el 401 de credencial
invalida, corre las dos suites del contrato y cierra con seis contratos de fuente. Dos hallazgos
del arnes quedaron escritos: `app.close()` no detiene el cron del arranque y habia que terminar
con `process.exit` explicito (la corrida pasaba 11/11 y seguia colgada), y el script necesita el
`.env` de la raíz porque `require(server)` abre Prisma.

## Ronda 3: ejecucion de la promocion y verificacion post-despliegue

Con la autorizacion expresa del dueno («Si: a develop y luego a main»), el paquete se reconstruyo
sobre el tip vigente de `main` (`1b76376c0c37`) en el worktree auxiliar `codex/qa-sesion-main-20261108`
y se publico en cuatro commits puntuales, sin merge de rama completa:

| Commit | Contenido |
|---|---|
| `3fa6a5f0` | producto: `supabaseAuth.js`, `server.js`, `tenancy.js`, `rbac.js`, `apps/web/lib/api.ts`, las dos suites del contrato y su prueba de fuente (11 rutas) |
| `cd58c876` | manifiestos de alcance y aprobacion `sesion-main-20261108-*` con su evidencia (12 rutas) |
| `b8a24c5c` | salidas de las dos puertas de promocion estampadas en `gates-candidato.txt` |
| `85fc46ec` | registro post-despliegue en produccion (solo documentacion; producto byte a byte identico) |

Inventario medido contra el destino: **23 rutas, 16 `A` / 7 `M` / 0 `D`**, `allowed_deletions: []`.
Las dos puertas se revalidaron sobre cada tip nuevo y quedaron en verde en el final:
`ALCANCE DE PROMOCION VALIDO: sesion-admin-produccion-20261108 (23 rutas)` y
`APROBACION QA VALIDA: sesion-admin-produccion-20261108`. El primer rechazo no fue de alcance sino
de forma: las rutas de evidencia de los manifiestos se resuelven contra el directorio del propio
manifiesto (`../evidence/…`, `../../../scripts/…`) y estaban un nivel fuera.

Lo que quedo verificado en produccion despues del deploy: `/health commit=b8a24c5c38c0`, y la
autenticacion **no** se relajo — peticion anonima y token firmado con clave ajena devuelven ambos
`401 TOKEN_INVALIDO`.

Limitaciones escritas, no resueltas:

- El estado de los checks de CI sobre `main` no se pudo leer desde esta estacion (`gh` no esta
  disponible en este shell). Se reporta como limitacion de la medida, no como verde.
- La sonda de cadena sobre el bundle JS desplegado dio 0 coincidencias **en produccion y tambien en
  QA**, que se sabe buena: los chunks de `/login` no contienen el chunk del dashboard. Metodo no
  concluyente; no se presento como rojo ni como prueba.
- Queda una medicion que ningun agente puede hacer: abrir Administracion con la sesion del dueno en
  produccion. Se espera `403` con codigo de causa (`EMPRESA_NO_VINCULADA`) y la sesion viva, **no**
  una expulsion a `/login`. Crear una cuenta de prueba en produccion no esta autorizado.

## Deudas que este brief publica

1. **Cerrada en codigo, abierta en la medida del dueno:** la promocion `desarrollo -> develop -> main`
   se ejecuto y produccion corre `b8a24c5c38c0`. Esto NO cierra el incidente: falta la verificacion
   post-despliegue con la sesion del dueno (punto anterior) y la cuenta maestra sigue sin vinculo de
   empresa, o sea que ya no es expulsada pero aun no configura Administracion.
2. **Autorizada y sin implementar:** la salida C (respaldo de plataforma en `supabaseAuth`) queda
   autorizada para `desarrollo`. No se aplico en esta intervencion: cambia autorizacion y exige
   revision de `apexos-seguridad`. Las salidas A y B siguen sin autorizacion porque escriben datos
   productivos.
3. **Cerrada en QA, no en la cuenta del dueno:** ya existe una certificacion de navegador end-to-end
   con un Supabase real y recien creado (`sesion-qa-navegador.txt`, control 05 de
   `sesion-administracion-qa.js`), pero con una cuenta efimera del arnes, no con la sesion del
   dueno: reproducir su caso exacto exige la clave de su cuenta y ninguna prueba de este cierre la
   usa. La cuenta efimera necesita la forma que pasa el guard de ruta de cliente
   (`platform_admins` activo + `profiles` + cero `company_users`); con una cuenta normal el navegador
   nunca llega a `/api/v1/admin/*` y la celda seria un verde falso.
4. `apps/api/server.js` y `apps/api/test/**` no tienen agente dueno en el ruteo (`el preflight los
   enruta a equipo-apexos`); es la misma carencia ya registrada en otras intervenciones.
