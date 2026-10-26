# Certificacion local de la contencion en marcacion, kilometraje y ajustes de nomina — 2026-10-26

Cambio: `hr-contention-p2028-20261026`
Promocion certificada: `desarrollo -> develop` (pre-QA). **No autoriza `main`**, ni despliegue, ni migraciones remotas.
Commit funcional certificado: `dae326af3eb80e43793883e95b1156eb2bf9e273`
Rama de trabajo: `desarrollo`
Resultado de la certificacion funcional: **PASSED** — 52/52 comprobaciones.
Evidencia cruda: `../evidence/hr-contention-p2028-20261026/local-certification.json` y `local-fixture.json`.

## Novedad que se cierra

Despues del fix de mallas (`hr-route-p2028-20261026`, commit `f2f6d7f5`) quedaron tres escrituras de
Talento Humano con el **mismo** mechanism defectuoso: esperaban su advisory lock con
`pg_advisory_xact_lock` (bloqueante, sin aviso) dentro de transacciones cuyo presupuesto no soportaba
esa espera. Al expirar, Prisma abortaba la transaccion, el manejador global traducia el `P2028
"Transaction not found"` a un 500 generico y el operario leia "Backend no disponible" cuando el
servicio estaba arriba y solo habia que esperar unos segundos.

Las tres, con su riesgo particular:

| Escritura | Alcance del lock | Riesgo antes del fix |
| --- | --- | --- |
| Marcacion (`createPunch`) | `${tenant}:${empleado}:${ruta\|sin-horario}:${dia}T05:00:00.000Z` | el operario quedaba colgado y su marcacion no se registraba |
| Kilometraje de jornada (misma transaccion de la salida) | `${tenant}:kilometraje:${ruta}:${empleado}` | la transaccion se envenenaba: se perdian la salida y el renglon de kilometraje |
| Ajuste de nomina / novedad IBC (`createPayrollAdjustment`) | `hr-ibc-adjustment:${tenant}:${empleado}` | ni siquiera declaraba presupuesto: moria con el default de 5 s de Prisma |

## Correccion

Un helper comun y tres puntos de aplicacion, mas una regla general en el manejador global:

1. `acquireBoundedScopeLocks(db, scopes, { deadlineAt, message, code })` sustituye el lock bloqueante
   por `pg_try_advisory_xact_lock` con reintento de 200 ms hasta un **deadline compartido**. Al
   agotarse (15 s) rinde un **503 con codigo propio**, nunca un 500.
2. `createPunch` calcula un unico `punchLockDeadlineAt` y lo pasa a los dos alcances (marcacion y
   kilometraje) con `MARCACION_CONCURRENCIA_TEMPORAL`; conserva su presupuesto
   `{ maxWait: 10_000, timeout: 20_000 }`.
3. `createPayrollAdjustment` declara `PAYROLL_ADJUSTMENT_TRANSACTION_OPTIONS = { maxWait: 5_000, timeout: 30_000 }`
   — antes usaba el default de Prisma — y su deadline con `AJUSTE_NOMINA_CONCURRENCIA_TEMPORAL`.
4. `apps/api/server.js` mapea **todo** 503 con codigo a un fallo controlado con `request_id`. Antes
   la regla estaba atada a codigos concretos, asi que un codigo nuevo degrada a 500 generico; ahora
   el hueco esta cerrado por regla general.
5. `apps/web/lib/api.ts` lista los tres codigos (`ROUTE_ASSIGNMENT_BUSY`,
   `MARCACION_CONCURRENCIA_TEMPORAL`, `AJUSTE_NOMINA_CONCURRENCIA_TEMPORAL`) como reintentables, para
   que el operario vea "Otra persona esta guardando… tu informacion no se perdio" con la referencia de
   soporte, en lugar de un aviso de caida.

No se modifico ninguna regla de negocio: la secuencia de marcaciones, `MARCACION_FUERA_DE_SECUENCIA`,
el kilometraje solo en salida con placa, la jornada ya procesada, el IBC inmutable dentro de una
continuidad y el aislamiento por tenant quedan intactos. Tampoco se cambio el alcance del lock: la
serializacion sigue siendo la misma, solo es acotada y explicable.

## Ambiente de ejecucion

- API Fastify real levantada en proceso, escuchando en `127.0.0.1:3212` (loopback obligatorio).
- Base de datos PostgreSQL **aislada**: clon local `apexos_cert_contention` (186 tablas) sobre
  `127.0.0.1:55432`, creado con `pg_dump`/`psql` desde la base local. Nunca se apunto a Supabase ni a
  Railway; el arnes aborta si `DATABASE_URL` no es local.
- Inquilino de trabajo: `Puebla Operaciones` (`5ef4cb7d-8bca-41c4-a4b0-9e37d64c4abd`), con rol y
  usuario administrador efimeros y cuatro empleados de prueba (`QA-CNT-*`) creados por el propio
  arnes. Corrida `20261026175829`, periodo de nomina `mensual:2026-10-01:2026-10-31`.
- La contencion se provoca desde una **conexion PostgreSQL independiente** con la misma primitiva que
  provoco el incidente en produccion (`pg_advisory_xact_lock(hashtextextended(<scope>, 0))` +
  `pg_sleep`), calculando el scope con la misma formula que usa el servicio.

## Chequeos certificados (52/52)

| Bloque | Comprobacion | Resultado |
| --- | --- | --- |
| A — nivel de codigo | helper try-lock presente, cero `pg_advisory_xact_lock` bloqueantes residuales, 4 usos del helper, deadline y presupuestos declarados, los tres codigos presentes, regla general de 503 en el servidor y los tres codigos en la lista web | pasado |
| B — marcacion con contencion real de 18 s | `POST` devuelve **503 `MARCACION_CONCURRENCIA_TEMPORAL`** a los **15271 ms** (deadline de 15 s), con `request_id`, mensaje accionable y **cero marcaciones escritas** | pasado |
| C — marcacion con el lock liberado a los 7 s | `POST` devuelve **200** tras esperar **6710 ms** y la marcacion queda persistida. Con el viejo default de 5 s de Prisma esto era 500 P2028 | pasado |
| D — kilometraje bajo contencion real | `POST` devuelve **503 `MARCACION_CONCURRENCIA_TEMPORAL`** (15050 ms) y la transaccion se revuelve integra: siguen 3 marcaciones y el renglon de kilometraje queda en `null` | pasado |
| E — kilometraje liberado | `POST` devuelve **200** (6705 ms), el renglon activo de `th_jornada_kilometrajes` queda con 42.5 km y **no hay renglones activos duplicados** | pasado |
| F — ajuste de nomina con contencion real | `POST /api/v1/talento-humano/nomina/ajustes` devuelve **503 `AJUSTE_NOMINA_CONCURRENCIA_TEMPORAL`** (15056 ms) con `request_id` y **cero renglones** en `th_nomina_ajustes` | pasado |
| G — ajuste de nomina liberado | `POST` devuelve **200** (6809 ms), el ajuste se persiste y es devuelto por el `GET` que usa la pantalla de nomina | pasado |
| H — regresion de serializacion | dos marcaciones concurrentes del mismo empleado/dia: **200 + 409 `MARCACION_FUERA_DE_SECUENCIA`** con exactamente **una** marcacion persistida (el reintento con try-lock no duplica) | pasado |
| I — higiene del flujo | ningun 500, ningun `P2028`, ningun fallo de transporte; los tres 503 observados llevan codigo | pasado |
| J — suites versionados | 7 suites en verde (ver abajo) | pasado |

Observaciones crudas en `../evidence/hr-contention-p2028-20261026/local-certification.json`
(campos `observations`, `http_log` con los 14 HTTP reales y su latencia, y `checks`).

## Pruebas unitarias y de contrato

| Suite | Pruebas |
| --- | --- |
| `apps/api/test/hr-marking-concurrency.test.js` | 8/8 |
| `apps/api/test/hr-marking-kilometraje-conflict.test.js` | 4/4 |
| `apps/api/test/hr-payroll-adjustment-lock.test.js` (nuevo) | 3/3 |
| `apps/api/test/hr-deferred-marking-offline.test.js` | 9/9 |
| `apps/api/test/hr-marking-declared-employee.test.js` | 6/6 |
| `apps/web/test/hr-route-write-feedback.test.mjs` | 9/9 |
| `apps/web/test/hr-contention-write-feedback.test.mjs` (nuevo) | 4/4 |

## Regresion de plataforma

Ejecutada con el certificador versionado `scripts/certifications/release-local-regression.cjs` sobre
la base de certificacion aislada (evidencia versionada en
`../evidence/hr-contention-p2028-20261026/platform-regression.json`, con `head` clavado en
`dae326af`):

| Suite | Pruebas | Aprobadas | Fallidas | Omitidas |
| --- | --- | --- | --- | --- |
| API (`apps/api/test/*.test.js`) | 810 | 810 | 0 | 0 |
| Web (`apps/web/test/*.test.mjs`) | 580 | 580 | 0 | 0 |

## Limpieza y honestidad de la evidencia

- Al cerrar la corrida se purgaron los cuatro empleados de prueba y la ruta vehicular `QACNT28`
  (`cleanup.errors: []`), y se desactivaron usuario y rol.
- El arnes descubre ademas el **empleado espejo** que el alta del usuario administrador crea con el
  mismo codigo (`QA-CNT-U…`). En la primera version del arnes ese registro quedaba olvidado: se
  corrigio la limpieza y por eso esta corrida reporta `mirror_employee_removed: true`.
- Honestidad del mecanismo: el cliente Prisma del proyecto convierte el borrado de `Employee` en
  **desactivacion** (soft-delete global), asi que en la base de certificacion —clon desechable— los
  empleados de prueba quedan como filas inactivas, no borradas. Las tablas de negocio si quedaron
  vacias: marcaciones, sesiones, jornadas, novedades, kilometrajes y ajustes = 0 filas al verificar.
- En la base local compartida `apexos`, los residuos de las tres corridas exploratorias prevales
  (15 empleados `QA-CNT-*`, 3 usuarios y 3 roles) fueron eliminados fisicamente con `DELETE`
  directos tras verificar que no arrastraban filas de negocio. Verificacion posterior: 0 empleados,
  0 usuarios, 0 roles de prueba.

## Hallazgo de seguridad registrado y NO corregido

Fuera del alcance autorizado de este change: `POST /api/v1/hr/payroll/adjustments` y
`POST /api/v1/talento-humano/nomina/ajustes` **no llevan preHandler de permiso**, y el RBAC compara el
modulo literalmente. Un usuario autenticado de cualquier rol del tenant puede crear ajustes de IBC.
No se toco en este commit porque mezclar un cambio de autorizacion en un fix de concurrencia romperia
la regla de alcance del manifiesto; se reporta como deuda con decision pendiente del responsable.

## Estado del flujo de promocion

La certificacion local **esta completa** (52/52) y el responsable autorizo la promocion el
2026-10-26. En `desarrollo` el manifiesto pre-QA se quedo **sin firmar a proposito**: esa version
documenta el bloqueo mientras faltaba la autorizacion. La firma y la evidencia recertificada viven en
el candidato de `develop` (ver "Recertificacion sobre el candidato de `develop`" mas abajo), que es la
rama que se promueve.

Las escrituras de mallas del incidente original ya estaban en produccion; las tres escrituras aqui
certificadas (marcacion, kilometraje y ajustes de nomina) quedaran protegidas cuando esta candidata
llegue a `main`.

## Salida literal de las puertas versionadas

```text
$ npm run qa:preqa:evidence -- docs/qa/manifests/hr-contention-p2028-20261026-preqa.json
AUTORIZACION PRE-QA BLOQUEADA
- approval.status debe ser approved
- la autorizacion pre-QA requiere responsable y fecha

$ npm run qa:promotion:scope -- docs/qa/manifests/hr-contention-p2028-20261026-scope.json dae326af origin/develop
ALCANCE DE PROMOCION INVALIDO: rutas fuera de alcance: D:apps/api/src/modules/accounting/pyg-budget-import.js, D:apps/api/src/modules/accounting/reversal.js, M:apps/api/src/modules/accounting/routes.js, M:apps/api/src/modules/accounting/schema.js, M:apps/api/src/modules/accounting/service.js, M:apps/web/app/dashboard/contabilidad/asientos/page.tsx, M:apps/web/components/accounting/AccountingPygBudget.tsx, D:apps/web/components/accounting/AccountingPygBudgetImport.tsx, M:docs/qa/evidence/hr-route-p2028-20261026/local-certification.json, M:docs/qa/evidence/hr-route-p2028-20261026/local-fixture.json, D:docs/qa/evidence/hr-route-p2028-20261026/platform-regression.json, M:docs/qa/local-environment-recovery-findings-20261023.md
```

La misma puerta vuelta a ejecutar con el tip final de `desarrollo` como candidata
(`... HEAD origin/develop`) devuelve **las mismas 12 rutas**: el set no cambia con los commits de
documentacion, y ninguna de las 18 rutas de este change aparece como fuera de alcance.

El manifiesto pre-QA de `desarrollo` **no** llevaba una aprobacion inventada: sus 5 bloques de
`checks`, su certificacion (52/52) y su regresion (API 810 / Web 580 en la base local) pasaban todas
las verificaciones de existencias y lo unico que faltaba era la firma del responsable, que se puso en
el candidato.

El bloqueo de alcance no es un defecto del fix: es la deriva de ramas ya registrada en el cambio
de mallas. Son 12 rutas fuera de alcance y **5 de ellas son eliminaciones** (4 del modulo
`accounting` del cambio `accounting-reversal-budget-import-20261024`, que solo existe en `develop`,
y la evidencia `platform-regression.json` del cambio `hr-route-p2028-20261026`). Tomar el tip de
`desarrollo` como base de `develop` borraría ese trabajo, cosa que la política prohibe. La
`reconstruccion_puntual` descrita en `../manifests/hr-contention-p2028-20261026-scope.json`
aplica este change sobre el tip vigente de `develop`: no toca los archivos del cambio previo, así que
su inventario debe quedar en las 18 rutas exactas y cero eliminaciones — cifra que hay que medir con
el validador contra la candidata real y recertificar contra el SHA nuevo que produzca. Como control,
la fusión completa de `desarrollo` se simuló sin tocar el repositorio
(`git merge-tree --write-tree origin/develop HEAD`, árbol `cfb7b003`): 24 rutas, cero eliminaciones y
6 de ellas ajenas a este change, todas documentación/evidencia del cambio previo `hr-route-p2028-20261026`
cuya versión en `develop` es posterior.

El comando de alcance hay que volver a ejecutarlo contra el candidato final elegido: el arbol de la
fusion cambia con cada commit adicional de `desarrollo`.

## Recertificacion sobre el candidato de `develop`

El responsable autorizo la promocion el 2026-10-26 ("procede con mi autorizacion llevar las
correciones hasta el ambiente main pasando por todos los protocolos"), y el bloqueo de alcance se
resolvio como estaba previsto: **no** se promote la rama completa, sino el cherry-pick puntual de los
cuatro commits de `desarrollo` sobre el tip vigente de `develop` (`89e87b79`), en una rama auxiliar
que se elimina al terminar.

| Pieza del candidato | SHA en `desarrollo` | SHA en la candidata |
| --- | --- | --- |
| Fix funcional (12 rutas de codigo y pruebas) | `dae326af` | `73275113` |
| Arnés con limpieza del empleado espejo + evidencia | `6dca9438` | `d92be0fa` |
| Certificación, manifiestos y medición de la candidata | `930955ea` / `a442855e` | `3ce6ca4b` / `0aa9fc25` |

El cherry-pick no produjo conflictos porque las 12 rutas funcionales son idénticas entre la base de
`desarrollo` y el tip de `develop`; la divergencia entre las dos ramas vive en Contabilidad y en la
evidencia del cambio previo, y nada de eso se toca.

Todo el bloque de evidencia se volvio a producir **sobre el propio checkout del candidato**, contra
una base PostgreSQL aislada nueva (`apexos_cert_cont2`, 186 tablas, clon de la base local):

| Verificacion en la candidata | Resultado |
| --- | --- |
| Arnés de contención E2E (corrida `20261026181509`) | **52/52**, `api_commit 0aa9fc25`, limpieza sin errores y `mirror_employee_removed: true` |
| Regresión de plataforma (`release-local-regression.cjs`) | API **875/875**, Web **589/589**, cero fallidas, cero omitidas |
| Alcance medido `git diff --name-status origin/develop..HEAD` | **18 rutas exactas**, cero eliminaciones, accounting intacto, `faltan: []` y `sobran: []` |

La suite de Talento Humano sube de 43 a 43 pruebas identicas; los 65+9 casos extra de la regresión
pertenecen a Contabilidad, que solo existe en `develop`.

## Puertas ejecutadas contra el candidato (salida literal)

```text
$ npm run qa:preqa:evidence -- docs/qa/manifests/hr-contention-p2028-20261026-preqa.json
AUTORIZACION PRE-QA VALIDA: hr-contention-p2028-20261026

$ npm run qa:promotion:scope -- docs/qa/manifests/hr-contention-p2028-20261026-scope.json HEAD origin/develop
ALCANCE DE PROMOCION VALIDO: hr-contention-p2028-20261026 (18 rutas)
```

La autorizacion pre-QA queda firmada en el manifiesto con responsable, fecha y la cita textual del
lead; `promote_main` sigue en `false` porque `main` exige su propio manifiesto de aprobacion QA.
