# Certificacion del cierre de los pendientes de la contencion P2028 — 2026-10-26

Cambio: `hr-contention-p2028-cierre-20261026` (cuatro pendientes abiertos por la ronda
`hr-contention-p2028-20261026`, cuyas certificaciones previas siguen vigentes en
`hr-contention-p2028-20261026.md`).

Rama de trabajo: `desarrollo`
Commits funcionales certificados: `767bd8eb` (candado de permiso), `9dcef87c` (prueba de contrato del
nucleo), `efaac010` (arnes de navegador)
Resultado de las certificaciones re-ejecutadas sobre `efaac010`:

| Certificacion | Resultado | Evidencia |
| --- | --- | --- |
| `certify:hr-contention-message-browser:local` (navegador real) | **PASSED** — 22/22 | `../evidence/hr-contention-message-browser-20261026/browser-certification.json` + 2 capturas |
| `certify:hr-contention-p2028:local` (contencion por HTTP, regresiva) | **PASSED** — 52/52 | `../evidence/hr-contention-p2028-20261026/local-certification.json` |

**Esta certificacion es local y no autoriza ninguna promocion.** No promueve a `develop` ni a `main`,
no despliega y no aplica migraciones remotas.

## Pendiente 3 — el alta de ajustes de nomina no pedía permiso

`POST /hr/payroll/adjustments` y `POST /talento-humano/nomina/ajustes` se escribieron sin `preHandler`,
a diferencia de sus rutas hermanas (`GET` y `DELETE` de la misma coleccion, que si exigen
`payroll:read` / `payroll:write`). Cualquier usuario autenticado del tenant podia abrir un ajuste IBC
aun cuando su rol no tuviera nomina editable.

Se agrego `preHandler: requirePermission("payroll", "write")` a las dos rutas
([apps/api/src/modules/hr/routes.js:194](file:///c:/Users/mq1/Documents/Proyectos/APEXOS/apps/api/src/modules/hr/routes.js#L194)
y [:237](file:///c:/Users/mq1/Documents/Proyectos/APEXOS/apps/api/src/modules/hr/routes.js#L237)).
No se toco el servicio ni la regla de negocio: el mismo flujo, ahora con el candado que ya tenian sus
hermanas.

Prueba versionada: `apps/api/test/hr-payroll-adjustment-permission.test.js` (3/3). Ademas del contrato
de las dos lineas, barre **todas** las rutas de Talento Humano y falla si alguna queda sin `preHandler`,
y ejercita el middleware real `requirePermission("payroll","write")`: rol `Operario de planta` con
`hr:read` recibe 403 `PERMISO_DENEGADO`; rol `Contador` con `payroll:write` pasa y deja
`request.rbacScope.role_name = "Contador"`.

Regresiva: la certificacion de contencion (52/52) vuelve a pasar con el candado puesto, con el rol de
prueba que tiene `nomina: { view, edit }` — que es exactamente como el catalogo expande
`payroll:write`.

## Pendiente 2 — el aviso visto en un navegador real, sobre el build de produccion

Lo que estaba probado era el HTTP: la API rinde 503 con codigo reintentable. Lo que no se habia hecho
nunca era **abrir un navegador** y leer el texto que ve el operario. Ese era el hueco.

El arnes nuevo (`scripts/certifications/hr-contention-message-browser-local.js`, 22 comprobaciones)
levanta los dos servicios reales:

- API Fastify local en `127.0.0.1:3218` contra el PostgreSQL local.
- Frontend servido por `next start` en `127.0.0.1:3219`, es decir **el artefacto de produccion**, no
  `next dev`. El navegador habla con la API por el proxy de mismo origen `app/api/v1/[...path]`.
- Chrome real (puppeteer-core), login por pantalla con el usuario de certificacion.

La contencion no se simula ni se intercepta: una conexion PostgreSQL independiente sostiene
`pg_advisory_xact_lock(hashtextextended('hr-ibc-adjustment:<tenant>:<empleado>', 0))` durante 18 s, mas
alla del deadline de 15 s del try-lock acotado. El 503 lo produce el servidor.

Salida literal de los chequeos que importan:

```text
contention_post_returns_503            503
contention_busy_code                   AJUSTE_NOMINA_CONCURRENCIA_TEMPORAL
contention_gives_up_within_budget      15337 ms (deadline 15000 ms)
server_message                         "Otra correccion de nomina se esta guardando para esta persona
                                        en este momento. Intente de nuevo en unos segundos."
browser_shows_friendly_busy_message    "Otra persona está guardando ese mismo registro en este momento.
                                        Espera unos segundos e inténtalo de nuevo: tu información no se perdió."
browser_never_announces_backend_crash  sin "Backend no disponible" ni "Error interno del servidor"
browser_never_shows_raw_json           sin cuerpos {"error": ...} en pantalla
browser_keeps_form_selection           el empleado sigue seleccionado despues del rechazo
contention_persisted_nothing           0 renglones en th_nomina_ajustes
retry_after_release_succeeds           200
browser_shows_success_after_retry      "Ajuste agregado. Ejecuta prueba o recalcula para verlo en la liquidacion."
adjustment_persisted_exactly_once      1 renglon (el reintento no duplico)
session_had_no_500 / no_page_errors / no_console_errors
```

Capturas versionadas: `01-aviso-concurrencia.png` (banner amable arriba, banner rojo en la tarjeta de
ajustes y alerta tecnica a la derecha con `Ruta ... | Estado: 503 | Detalle: ...`) y
`02-guardado-tras-reintento.png`.

Nota de diseño que **no** se cambio: la alerta tecnica global sigue titulandose "Fallo tecnico
detectado" con nivel error para cualquier 5xx, incluido el 503 de concurrencia. El detalle tecnico es
para soporte y el banner amable es para el operario; ambos conviven. Bajar el nivel de esa alerta a
aviso seria un cambio de UX con alcance propio y certificacion propia, y no se hizo en esta ronda.

## Pendiente 5 — el bloqueo del build de produccion no existia

El registro de memoria del 2026-10-23 afirmaba que `next build` moria en el type-check de rutas tipadas
porque `app/dashboard/transporte/page.tsx` exporta `TransportFleetPage` ademas del default (y lo mismo
en `inventario/reportes/page.tsx`), y que esa era la causa probable de Vercel Production roto.

**Es falso, y por eso no se refactorizo nada.** La corrida de linea base sobre `desarrollo`:

```text
> next build            (Next 16.3.5, Turbopack)
✓ Compiled successfully in 2.1min
  Finished TypeScript in 2.9min ...
✓ Generating static pages using 3 workers (128/128) in 23.3s
exit 0
```

El validador que Next genera (`apps/web/.next/types/validator.ts`) declara
`AppPageConfig` con `default` y los campos de configuracion permitidos, pero **sin firma de indice
`[x: string]: never`**. La comprobacion es `Specific extends AppPageConfig<Route>`, asi que un modulo
de ruta con exports nombrados adicionales satisface el contrato por tipado estructural. El error
`'{ [x: string]: never }'` pertenece a otra version o configuracion, no a este repositorio.

Consecuencia practica: las proximas certificaciones pueden correr contra `next build` + `next start`
(asi se corro esta) en lugar de conformarse con `next dev`. Tambien queda descartada la hipotesis del
build roto para Vercel Production, que ademas ya sirvio el commit `3ebe71f7` con los chunks nuevos
verificados en linea.

## Pendiente 4 — alineacion de `runWithTenant` en el nucleo

Estado real del envoltorio
([apps/api/src/core/prisma.js](file:///c:/Users/mq1/Documents/Proyectos/APEXOS/apps/api/src/core/prisma.js)):

| Rama | Forma |
| --- | --- |
| `desarrollo` | `tenantStorage.run({ tenantId }, async () => await fn())` |
| `origin/develop` | identica a `desarrollo` |
| `origin/main` | `tenantStorage.run({ tenantId }, fn)` |

Es decir: la unica rama desalineada es `main`, y la diferencia viene de como se reconstruyo la
candidata de main, no de un defecto del nucleo. Un sondeo de AsyncLocalStorage mostro que ambas formas
se comportan igual en ALS puro, asi que **no hay evidencia de un fallo observable** que justifique abrir
una promocion puntual a `main` solo por esa linea.

Lo que si queda cerrado es el contrato: `apps/api/test/core-tenant-context-propagation.test.js` (4/4,
sin tocar la base) fija que el tenant llegue visible al middleware `$use` dentro del ambito, que
sobreviva a un `await` intermedio, que fuera del ambito no haya filtro inyectado (y por lo tanto que
perder el contexto es una exposicion entre tenants, no un detalle estetico) y que el codigo fuente
conserva la forma asincrona. En la siguiente promocion legitima de `apps/api/src/core/prisma.js`
`develop -> main`, la linea viaja con el resto del archivo.

## Como re-ejecutar

```bash
npm run build --prefix apps/web            # artefacto que sirve next start
npm run certify:hr-contention-message-browser:local
npm run certify:hr-contention-p2028:local
cd apps/api && node --test test/hr-payroll-adjustment-permission.test.js \
  test/core-tenant-context-propagation.test.js
```

Requisitos del arnes de navegador: PostgreSQL en loopback, Chrome en `CHROME_BIN` (por defecto la ruta
de instalacion de Windows) y `apps/web/.next/BUILD_ID` existente. El arnes crea su propio rol, usuario y
empleado de certificacion y los purga en el `finally` (incluido el empleado espejo del usuario); los
logs de arranque de los dos servicios van a un directorio temporal, no a la evidencia versionada.

## Lo que NO queda certificado por esta ronda

- Que la marcacion y el kilometraje se vean bien en navegador: el arnes de navegador ejercita el ajuste
  de nomina, que es el unico de los tres flujos cuya pantalla no exige horario asignado ni GPS. Los
  otros dos siguen probados por HTTP (52/52) y por pruebas unitarias del mensaje amable.
- Ningun ambiente de QA remoto (Railway/Vercel) ni la base en la nube: todo lo anterior es local.
- La promocion de estos tres commits a `develop` o `main`. Para `desarrollo -> develop` sigue vigente el
  bloqueo de alcance ya documentado: `desarrollo` va por detras de `develop` en Contabilidad y el diff
  neto arrastra eliminaciones ajenas, asi que habria que reconstruir los commits sobre el tip de
  `develop` y recertificar contra el SHA nuevo.
