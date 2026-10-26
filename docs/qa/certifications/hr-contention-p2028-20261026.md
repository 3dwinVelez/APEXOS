# Certificacion local de la contencion en marcacion y kilometraje — variante `main` — 2026-10-26

Cambio: `hr-contention-p2028-20261026`
Promocion certificada: `develop -> main`.
Commit funcional certificado: `89f02251180db6f189c06a8c5f6cada69d3c7148` (fix) sobre el baseline productivo `f4aff8e3a41448a0df705dd8e6368741e3a7944e`.
Candidato final (codigo + arnes + evidencia): `150a2248adf7ce1c74f38efb6b62ddbcf337b641`, reconstruido por cherry-pick puntual del commit de `develop` sobre el tip vigente de `origin/main`, en la rama auxiliar `aux-promo-hr-contention-main-20261026` que se elimina al terminar.
Resultado de la certificacion funcional: **PASSED** — 42/42 comprobaciones.
Evidencia cruda: `../evidence/hr-contention-p2028-20261026/local-certification.json` y `local-fixture.json`.

Esta hoja certifica **la variante que corre en main**. La ronda completa (marcacion, kilometraje y
ajuste de nomina, 52/52) esta certificada en `desarrollo` y replicada en `develop`
(`docs/qa/certifications/hr-contention-p2028-20261026.md` de esas ramas). La diferencia de 10
comprobaciones no es hueco de esta rama: es funcionalidad que en main no existe (ver abajo).

## Novedad que se cierra

Tras el fix de mallas (`hr-route-p2028-20261026`) quedaron en Talento Humano escrituras que esperaban
su advisory lock con `pg_advisory_xact_lock` (bloqueante, sin aviso) dentro de transacciones cuyo
presupuesto no soportaba esa espera. Al expirar, Prisma abortaba la transaccion, el manejador global
traducia el `P2028 "Transaction not found"` a un 500 generico y el operario leia "Backend no
disponible" cuando el servicio estaba arriba y solo habia que esperar unos segundos.

En main las escrituras con ese defecto son dos, porque la tercera todavia no vive en esta rama:

| Escritura | Alcance del lock | Riesgo antes del fix | Esta en main |
| --- | --- | --- | --- |
| Marcacion (`createPunch`) | `${tenant}:${empleado}:${ruta\|sin-horario}:${dia}T05:00:00.000Z` | el operario quedaba colgado y su marcacion no se registraba | si |
| Kilometraje de jornada (misma transaccion de la salida) | `${tenant}:kilometraje:${ruta}:${empleado}` | se perdian la salida y el renglon de kilometraje | si |
| Ajuste de nomina / novedad IBC (`createPayrollAdjustment`) | `hr-ibc-adjustment:${tenant}:${empleado}` | moria con el default de 5 s de Prisma | **no** |

## Que NO existe en main y como se demostro en vez de suponerse

`createPayrollAdjustment`, la ruta `POST /api/v1/talento-humano/nomina/ajustes`, la ruta
`/api/v1/hr/payroll/adjustments` y el formulario de ajuste de la pantalla de nomina **no estan en el
arbol de main** (verificado con `grep` sobre `apps/api/src/modules/hr/service.js`,
`apps/api/src/modules/hr/routes.js` y `apps/web/app/dashboard/talento-humano/nomina/page.tsx`). Por
eso:

- El bloque F y G del arnes de `develop` (contencion y recuperacion del ajuste de nomina) se elimino
  del arnes de esta rama, no se simulo.
- En su lugar el arnes fija el chequeo `payroll_adjustment_write_absent_in_main`: si algun dia esa
  escritura llega a main sin la proteccion, la certificacion falla.
- La prueba unitaria `apps/api/test/hr-payroll-adjustment-lock.test.js` no se puerto (certifica una
  funcion que no existe aqui) y la prueba de contrato de concurrencia se ajusto de 4 a 3 ambitos de
  lock con el mismo criterio y precedente del commit `b7358e03` de la ronda de mallas.
- `apps/web/lib/api.ts` **si** conserva los tres codigos reintentables, deliberadamente identico entre
  ramas, para que el archivo no diverja y el ajuste de nomina ya este cubierto cuando suba.

## Correccion

1. `acquireBoundedScopeLocks(db, scopes, { deadlineAt, message, code })` sustituye el lock bloqueante
   por `pg_try_advisory_xact_lock` con reintento de 200 ms hasta un **deadline compartido** (15 s). Al
   agotarse rinde un **503 con codigo propio**, nunca un 500.
2. `createPunch` calcula un unico `punchLockDeadlineAt` y lo pasa a los dos alcances que existen en
   esta rama (marcacion y kilometraje) con `MARCACION_CONCURRENCIA_TEMPORAL`; conserva su presupuesto
   `{ maxWait: 10_000, timeout: 20_000 }`.
3. `apps/api/server.js` mapea **todo** 503 con codigo a un fallo controlado con `request_id`. Antes la
   regla estaba atada a codigos concretos, asi que un codigo nuevo degradaba a 500 generico; ahora el
   hueco esta cerrado por regla general.
4. `apps/web/lib/api.ts` lista los codigos como reintentables para que el operario vea "Otra persona
   esta guardando… tu informacion no se perdio" con la referencia de soporte, en lugar de un aviso de
   caida. El aviso global de "Backend no disponible" solo sale cuando el `fetch` no obtuvo respuesta.

No se modifico ninguna regla de negocio: la secuencia de marcaciones, `MARCACION_FUERA_DE_SECUENCIA`,
el kilometraje solo en salida con placa, la jornada ya procesada y el aislamiento por tenant quedan
intactos. Tampoco se cambio el alcance del lock: la serializacion sigue siendo la misma, solo es
acotada y explicable.

Tampoco se toco `apps/api/src/core/prisma.js`. Durante la corrida el arnes fallo por un `tenant_id`
ausente y se demostro la causa: en main `runWithTenant` propaga el contexto de forma distinta que en
`desarrollo` y no resuelve el contexto con una promesa sincrona. Es una diferencia real de nucleo,
ajena a esta correccion puntual, asi que se corrigio el arnes (commit `150a2248`, declarando el tenant
al sembrar) y se dejo el nucleo intacto. Queda registrado como hallazgo para su propia ronda.

## Ambiente de ejecucion

- API Fastify real levantada en proceso, escuchando en `127.0.0.1:3212` (loopback obligatorio; el
  arnes aborta si `DATABASE_URL` no es local).
- Base de datos PostgreSQL **aislada**: clon local `apexos_cert_contention_main` (186 tablas) sobre
  `127.0.0.1:55432`. Nunca se apunto a Supabase ni a Railway.
- Inquilino de trabajo: `Puebla Operaciones` (`5ef4cb7d-8bca-41c4-a4b0-9e37d64c4abd`) con rol (402) y
  usuario administrador efimeros y tres empleados de prueba (`QA-CNT-*`, ids 604/605/606) creados por
  el propio arnes. Corrida `20261026184343`, dia operativo 2026-10-26.
- La contencion se provoca desde una **conexion PostgreSQL independiente** con la misma primitiva que
  provoco el incidente en produccion (`pg_advisory_xact_lock(hashtextextended(<scope>, 0))` +
  `pg_sleep`) y calculando el scope con la misma formula que usa el servicio.

## Chequeos certificados (42/42)

| Bloque | Comprobacion | Resultado |
| --- | --- | --- |
| A — arranque y nivel de codigo | `health_ok` contra la API en vivo y sembrado verificado del fixture (2 chequeos); helper try-lock presente, cero `pg_advisory_xact_lock` bloqueantes residuales en el servicio, **3** usos del helper (mallas, marcacion, kilometraje), presupuesto y deadline declarados, los dos ambitos de `createPunch` comparten deadline, ausencia verificada de la escritura de nomina en main, regla general de 503 en el servidor y los tres codigos presentes en `apps/web/lib/api.ts` | pasado |
| B — marcacion con contencion real de 18 s | `POST /api/v1/hr/time-punches` devuelve **503 `MARCACION_CONCURRENCIA_TEMPORAL`** a los **15187 ms** (deadline de 15 s), con `request_id`, mensaje accionable y **cero marcaciones escritas** | pasado |
| C — marcacion con el lock liberado a los 7 s | `POST` devuelve **200** tras esperar **6839 ms** y la marcacion queda persistida. Con el viejo default de 5 s de Prisma esto era 500 P2028 | pasado |
| D — kilometraje bajo contencion real | `POST` de la salida con placa devuelve **503 `MARCACION_CONCURRENCIA_TEMPORAL`** (15176 ms) y la transaccion se revuelve integra: no queda ni marcacion nueva ni renglon de kilometraje | pasado |
| E — kilometraje liberado | `POST` devuelve **200** (6705 ms), el renglon activo de `th_jornada_kilometrajes` (id 32) queda con **42.5 km** y no hay renglones activos duplicados | pasado |
| F — regresion de serializacion | dos marcaciones concurrentes del mismo empleado/dia: **200 + 409 `MARCACION_FUERA_DE_SECUENCIA`** con exactamente **una** marcacion persistida (el reintento con try-lock no duplica) | pasado |
| G — higiene del flujo | ningun 500, ningun `P2028`, ningun fallo de transporte en los 11 HTTP reales; los dos 503 observados llevan codigo | pasado |
| H — suites versionados | 6 suites de la ronda en verde (4 de API y 2 de Web, ver tabla) | pasado |

Observaciones crudas en `../evidence/hr-contention-p2028-20261026/local-certification.json`
(campos `observations`, `http_log` con los 11 HTTP reales y su latencia, y `checks`).

## Pruebas unitarias y de contrato

| Suite | Pruebas |
| --- | --- |
| `apps/api/test/hr-marking-concurrency.test.js` | 8/8 |
| `apps/api/test/hr-marking-kilometraje-conflict.test.js` | 4/4 |
| `apps/api/test/hr-deferred-marking-offline.test.js` | 9/9 |
| `apps/api/test/hr-marking-declared-employee.test.js` | 6/6 |
| `apps/web/test/hr-route-write-feedback.test.mjs` | 9/9 |
| `apps/web/test/hr-contention-write-feedback.test.mjs` (variante main: 3 pruebas, sin el formulario de nomina) | 3/3 |

Suite Talento Humano completa del candidato: API **102/102** y Web **101/101**, cero fallidas y cero
omitidas. Typecheck del cliente (`npx tsc --noEmit`): **0 errores**.

## Regresion de plataforma

`scripts/certifications/release-local-regression.cjs` **no existe en el arbol de main**, asi que se
ejecuto una replica con el mismo comando, los mismos flags (`--test --test-concurrency=2`) y el mismo
entorno, dos veces: sobre el candidato `150a2248` y sobre un worktree limpio de `origin/main`
(`f4aff8e3`). Evidencia: `../evidence/hr-contention-p2028-20261026/platform-regression.json`.

| Suite | Candidato | Baseline `f4aff8e3` | Fallas nuevas |
| --- | --- | --- | --- |
| API | 421 pruebas, 417 ok, 2 fallidas, 2 omitidas | 419 pruebas, 415 ok, 2 fallidas, 2 omitidas | **0** |
| Web | 384 pruebas, 383 ok, 1 fallida | 380 pruebas, 379 ok, 1 fallida | **0** |

Las 3 fallas son las mismas, con el mismo nombre, en las dos mediciones: dos de Inventario/Compras
(ERP) y una de Transporte TMS. Ningun archivo de esos modulos aparece en
`git diff --name-status origin/main..HEAD`, es decir, son deuda preexistente de main y no las introduce
ni las toca esta correccion. Las 6 pruebas del delta (+2 API, +4 Web) son las de esta ronda.

## Limpieza y honestidad de la evidencia

- Al cerrar la corrida se purgaron los cuatro empleados de prueba (604, 605, 606 y el espejo 603) y la
  ruta vehicular `QACNT28`; usuario y rol quedaron desactivados. `cleanup.errors: []` y
  `mirror_employee_removed: true` en las cuatro purgas.
- Honestidad del mecanismo: el cliente Prisma del proyecto convierte el borrado de `Employee` en
  **desactivacion** (soft-delete global), asi que en la base de certificacion —clon desechable— quedan
  filas inactivas. Las tablas de negocio verificaron 0 filas de prueba al cerrar.
- La base de certificacion es un clon desechable local; no se escribio en QA ni en produccion, y no se
  aplico migracion alguna (este cambio no la requiere).

## Hallazgo de seguridad: no aplica en main, si queda abierto en develop/desarrollo

En `desarrollo` y `develop`, `POST /api/v1/hr/payroll/adjustments` y
`POST /api/v1/talento-humano/nomina/ajustes` no llevan `preHandler` de permiso y el RBAC compara el
modulo literalmente: cualquier usuario autenticado del tenant puede crear ajustes de IBC. **En main esa
ruta no existe**, asi que aqui no hay exposicion que cerrar. La deuda esta registrada en la
certificacion de `develop` y espera decision del responsable; mezclar un cambio de autorizacion en un
fix de concurrencia estaria fuera del alcance de este manifiesto.

## Estado del flujo de promocion

La certificacion local de esta variante esta completa (42/42) y el responsable autorizo recorrer el
flujo hasta `main` el 2026-10-26. Esta hoja documenta `develop -> main`; el mismo cambio ya esta en
`desarrollo` (52/52) y en `develop` (52/52 sobre el candidato `0aa9fc25`). Lo que esta promocion
**no** certifica y queda declarado:

- Navegacion en navegador del flujo de marcacion con el 503: no se levanto el par API + `next dev` en
  esta intervencion (limitacion de RAM local ya documentada). Hay evidencia de contrato de codigo,
  typecheck en 0 errores y HTTP real, pero no de pantalla.
- Verificacion en el ambiente QA/PROD de Railway: se comprueba el despliegue despues del push; no se
  modifico Railway ni la base de produccion.
- El ajuste de nomina (IBC) no puede quedar protegido en produccion con este push porque esa
  funcionalidad no esta en main; subira protegido junto con esa funcionalidad.
