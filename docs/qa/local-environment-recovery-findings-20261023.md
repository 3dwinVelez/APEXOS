# Hallazgos del ambiente local — 2026-10-23

Documento de evidencia. Cubre tres hallazgos confirmados durante la recuperación del
ambiente local y la certificación aislada del bundle de módulos locales.

## 1. `networkidle2` no es estable en la copia aislada con `next dev`

**Síntoma.** `transport-search-select-local.cjs` y `transport-theme-local.cjs` agotaban el
presupuesto de 60 s en rutas que ya estaban compiladas (`/dashboard/transporte`,
`/dashboard/transporte/flota`), mientras el mismo HTML respondía en 0,2–1,8 s por HTTP.

**Causa raíz (medida, no supuesta).** Con la misma interceptación de red que usan los
certificadores, tres solicitudes quedaron abiertas de forma permanente y nunca emitieron
respuesta: `_next/static/chunks/webpack.js?v=…`, `_next/static/chunks/main-app.js?v=…` y
`_next/static/chunks/app/login/page.js`. Son chunks servidos desde la caché del navegador en
la navegación siguiente a `/login`; Puppeteer dispara `request` pero no `response`, así que el
contador de solicitudes en vuelo nunca baja de 3 y `networkidle2` (tolerancia de 2) no se
cumple jamás. Los endpoints de API cerraron en 1–3 s y el registro de la API no muestra ni
una respuesta por encima de 5 s, por lo que no es latencia de backend ni defecto de producto.

**Corrección aplicada.** `scripts/certifications/local-certification-env.cjs` expone
`createApiIdleWatcher(page)`, que solo observa el tráfico `/api/v1/` real y libera la página
cuando esas solicitudes cierran. Los dos certificadores de Transporte navegan con
`domcontentloaded`, esperan `.transport-workspace` y después el reposo de API, de modo que la
auditoría de selects nativos y de tema ocurre sobre la pantalla ya hidratada y no de forma
vacía. El comportamiento está cubierto por la prueba unitaria
`scripts/test/local-certification-env.test.js` ("the idle watcher ignores cached dev chunks…").

**Consecuencia operativa.** La suite debe precalentar las rutas de Aplicación antes de lanzar
los navegadores: en esta corrida las compilaciones frías medidos por el propio `next dev`
fueron de 6 s a 85 s por ruta (`/dashboard/compras/facturas` = 84,9 s). Un certificador que
dependa de `networkidle2` heredará esos tiempos como falsos fallos funcionales.

## 2. Estado de migraciones de la base local

**Síntoma.** `prisma migrate status` no podía determinar el estado: la base `apexos`
(PostgreSQL Docker en 55432) no tenía la tabla `_prisma_migrations` porque el esquema local se
mantuvo históricamente con `prisma db push`, no con `migrate deploy`.

**Recuperación.** Verificado primero que el esquema local ya contenía los objetos de las
migraciones más recientes (`sedes` presente y `TransportOrigin` ausente,
`transport_pyg_concepts` presente, `TransportSettlementPackage.carrier_id` anulable). Después
se registraron las 62 migraciones con `prisma migrate resolve --applied`, operación de solos
metadatos. `prisma migrate status` reporta ahora *Database schema is up to date* y
`migrate deploy` queda como no-op.

**Dos migraciones sí estaban pendientes de efecto (no solo de registro)** y se aplicó
exactamente su SQL versionado, aditivo y no destructivo:

- `20260919110000_time_route_kind_descanso` → `ALTER TABLE "TimeRoute" ADD COLUMN IF NOT EXISTS "kind" TEXT NOT NULL DEFAULT 'trabajo'` (la columna no existía localmente; el motor de liquidación la necesita para distinguir descanso de trabajo).
- `20261014120000_accounting_opening_balances_nullable_party` → `ALTER TABLE "cnt_cuedoc" ALTER COLUMN "party_id" DROP NOT NULL` (sin esto, un saldo inicial sin contraparte revienta contra la base).

**Deriva residual declarada, no corregida aquí.** `prisma migrate diff` entre la base y
`schema.prisma` sigue reportando dos clases de diferencia:

1. Tablas y claves foráneas `th_*` (Talento Humano y respaldo Supabase) que el esquema Prisma
   no modela. `migrate diff` propone `DROP TABLE` sobre ellas; están fuera del alcance de
   Prisma y **ningún `db push` debe ejecutarse contra esta base sin revisar eso**, porque
   borraría datos operativos.
2. Las columnas `created_at`/`updated_at` y defaults de `transport_pyg_*` son
   `TIMESTAMPTZ(6)` en base (como las creó la migración SQL `20261013120000_transport_pyg`)
   mientras `schema.prisma` las declara como `TIMESTAMP(3)`. La divergencia está en el
   repositorio (migración vs modelo), no en la máquina local, y por tanto también existe en
   QA/PROD. Alinearla requiere su propio cambio de esquema versionado con manifiesto de
   alcance y certificadores nuevos; no se hizo en esta promoción.

**Migraciones sin aplicar a la nube (pendientes de autorización explícita).** Las migraciones
de `apps/api/prisma/migrations` y `supabase/migrations` no se aplicaron a QA ni a PROD en esta
sesión; la política del repositorio exige autorización independiente para migraciones remotas.

## 3. Bloqueo preexistente de `next build` (rutas tipadas)

`next build` (Next 16.3.5) no compila en `desarrollo`, `develop` ni `main`.
`apps/web/app/dashboard/transporte/page.tsx` declara `export function TransportFleetPage()`
además de su `export default`, y la validación de rutas tipadas exige que un módulo de ruta
exporte solo el default más la configuración permitida; el type-check del build falla con
`Type '() => Element' is not assignable to type '{ [x: string]: never }'`. El patrón está
byte-idéntico en `origin/develop` y `origin/main`, así que es deuda preexistente de
producción —hipótesis principal del build roto en Vercel Production— y no una regresión del
candidato de módulos locales.

Decisión de alcance: la certificación local corre contra `next dev` (por eso existe el
precalentamiento y el hallazgo 1). Sacar el componente compartido del módulo de ruta es un
alcance separado, con sus propios certificadores; se dejó deliberadamente fuera de esta
promoción para no ampliar el inventario de archivos sin evidencia.

## 4. El service worker de la aplicación interfiere con la navegación de Puppeteer

Síntoma observado en dos corridas del orquestador aislado, en certificadores distintos:

- corrida 1 (`apex-modules-release-XOHLSk`): `transport-rate-three-steps-local.cjs` falló al
  esperar `[data-cost-panel=summary]` con `Cannot find context with specified id`, es decir,
  el documento se recargó a mitad del asistente.
- corrida 2 (`apex-modules-release-7vx210`), con la API y el `next dev` reiniciados y con
  bitácora del servidor: `purchases-modern-ui-local.cjs` pasó 18 comprobaciones y falló en la
  navegación a `/dashboard/compras/ordenes` con `net::ERR_ABORTED`, aunque el servidor registró
  `GET /dashboard/compras/ordenes 200 in 3.7s`. El mismo certificador había quedado `passed`
  en la corrida 1 y el asistente de tarifario quedó `passed` en la corrida 2: el fallo rota
  entre certificados, no se fija en una pantalla.

Causa: `apps/web/public/sw.js` se registra desde `components/system/WorldClassToolkit.tsx`,
llama `skipWaiting()` en `install` y `clients.claim()` en `activate`, e intercepta **todo** GET
del mismo origen con estrategia red-first y respaldo de caché (incluida la lista `SHELL`
`/`, `/login`, `/dashboard`, `/manifest.webmanifest`). Al adueñarse de los clientes a mitad de
sesión, la navegación en curso la aborta el propio navegador y el contexto de ejecución de la
página muere; la caché además puede servir un documento distinto del solicitado, lo que en un
arnés de certificación se lee como un defecto funcional que no existe. Una sonda del asistente
de tarifario reprodujo la recarga del mismo URL justo después de montar la pantalla.

Corrección aplicada en el arnés, sin tocar el producto: `gotoLocalAppPage` ejecuta
`page.setBypassServiceWorker(true)` la primera vez que se usa en cada página, de modo que las
navegaciones del certificador van directas al `next dev` aislado. La restricción queda cubierta
por la prueba unitaria «the shared navigation helper waits for API traffic and passes the
response through» en `scripts/test/local-certification-env.test.js`, que exige exactamente una
activación del esquive por página.

Deuda declarada, fuera de este alcance: el service worker cachea documentos y assets también
en desarrollo, y su respaldo `caches.match('/dashboard')` puede devolver otra pantalla cuando
falla la red. Merece su propio alcance con criterios de caché por entorno y verificación en
navegador antes de cambiarlo; en esta promoción el producto quedó intacto.

## 5. Presión de memoria de la máquina local: los fallos rotaban entre certificadores

Con el esquive del service worker activo, la tercera corrida falló en un certificador
distinto otra vez (`inventory-modern-ui-local.cjs`, `TimeoutError: Navigation timeout of
60000 ms exceeded` al entrar a `/dashboard/inventario/reportes`), y el servidor registró ese
mismo documento sirviéndose en 3.5 s durante el recalentado y en 0.46 s al medirlo con `curl`
después del fallo. La bitácora de `next dev` muestra además rutas que ya estaban compiladas
volviendo a compilarse a mitad de suite (`○ Compiling /dashboard/inventario/ajustes ...` con
10.3 s de respuesta).

Medición del ambiente en ese momento: 7.8 GB de RAM visible con **0.3 GB libres**, 13 procesos
de Node (1.4 GB), Qoder (0.9 GB), Chrome del usuario (0.9 GB) y **cero** instancias de Edge
headless residuales, es decir, los certificadores sí liberaban sus navegadores. El patrón
coherente con esos datos es agotamiento de recursos: el renderer mata o reinicia la navegación
en curso del certificador que esté navegando, y el presupuesto de 60 s no alcanza cuando la
ruta recompila bajo presión. No es un defecto de las pantallas: tres corridas, tres
certificadores distintos, y cada uno de ellos había pasado en alguna de las otras corridas.

Respuesta del arnés (sin tocar el producto):

- Presupuesto de navegación subido a 120 s en `gotoLocalAppPage`.
- Un único reintento por navegación, con reinicio del observador de tráfico para no heredar
  peticiones colgadas del intento abortado. Una navegación no conserva estado, así que
  reintentar no enmascara un fallo funcional: las aserciones van después y un fallo persistente
  se reporta tras el segundo intento.
- Cobertura en `scripts/test/local-certification-env.test.js`: 140 pruebas, incluida
  «the shared navigation helper retries one killed navigation without duplicating its watcher»,
  que exige el reintento único, que no se acumulen observadores y que un fallo persistente
  revienta en dos intentos.

Condición operativa para las corridas de certificación: la máquina no debe tener aplicaciones
pesadas además del arnés (API aislada, `next dev` aislado y un navegador por certificador).
Con menos de 0.5 GB libres, los reintentos pueden no alcanzar y la evidencia saldrá mezclada
con fallos de ambiente.

## 6. La reconciliation de valorización se comparaba contra un DOM todavía vacío

En la cuarta corrida, `scripts/certifications/inventory-modern-ui-local.cjs` pasó 101
verificaciones y falló en `cost summary reconciles with filtered warehouse quantities and
export values`. No fue una inconsistencia del producto: `/dashboard/inventario/reportes/costos`
pinta el resumen antes de recibir datos (`0 productos · Valor actual del resultado: $ 0`,
`apps/web/app/dashboard/inventario/reportes/page.tsx:502`) y el aviso `Cargando valorización…`
vive en otro `<p role="status">` (misma línea 591). El certificador esperaba la cadena
`productos · Valor actual`, que el marcador vacío ya satisface, y comparaba el total del API
contra un DOM sin cargar.

Medición directa en el ambiente aislado (`http://127.0.0.1:3311`, base
`apexos_cert_recovery_f855022a`): la página y el payload concuerdan en
`9 productos · $ 51.763.560` con la misma fórmula `warehouse_rows.qty × average_cost` que usa
el certificador; el tráfico real muestra el `OPTIONS` 204 y el `GET` 200 de
`/api/v1/inventory/costs?all=true`, sin error de red ni de consola.

Respuesta del arnés (sin tocar el producto): la espera ahora exige que el aviso de carga
desaparezca y que el recuento del resumen iguale el número de productos devueltos por el API,
antes de comparar el total. Corrida de verificación: 111/111 verificaciones en
`%TEMP%\apex-inventory-modern-cUfEwm`.

## 7. La reporteria de compras exportaba antes de que el cliente terminara de cargar

`scripts/certifications/purchases-reports-local.cjs` falló en la quinta corrida
(`%TEMP%\apex-modules-release-5jnUZ0`) en `invoice Excel includes entire filtered result`.
Medición en el ambiente aislado: el API devolvía 4 posiciones
(`/api/v1/purchases/invoices/report?from_date=&to_date=`, documentos `CP-000001`…`CP-000004`,
todos `open`, contabilizados el 2026-07-31), el paginador marcaba `0–0 de 0` y el `.xlsx`
salía con 1 fila (solo cabecera).

La causa está en el arnés, no en la pantalla: las tablas de
`/reportes/ordenes` y `/reportes/facturas` pintan una fila `Cargando órdenes...` mientras
llega la respuesta, así que la espera `table tbody tr > 0` se satisfacía con ese marcador.
Con 0 facturas en la base (corridas anteriores) el archivo coincidía por accidente con el
recuento del API; en cuanto el certificador 1 de la misma corrida escribió facturas reales,
la carrera dejó de ser invisible. El producto responde bien: a los 8 s la tabla muestra las
4 filas y el paginador `1–4 de 4`.

Respuesta (solo arnés): la espera ahora exige que no quede ninguna fila `Cargando` y que el
paginador reporte el total real (`de <conteo>`), usando el total que ya devolvió el API. La
aserción de negocio no se tocó: el Excel debe seguir trayendo todas las posiciones filtradas.
Verificación: 9/9 verificaciones en `%TEMP%\apex-purchases-reports-8nhYr8`.

## 8. `next dev` se autocierra por umbral de memoria y deja un puerto muerto

La novena corrida (`%TEMP%\apex-modules-release-17pwQS`) pasó los certificadores 1 al 8 y
perdió el noveno (`transport-search-select-local.cjs`) con `net::ERR_CONNECTION_REFUSED at
http://127.0.0.1:3311/dashboard/transporte/cubicaje`. La bitácora del frontend
(`.tmp/isolated-web-r8.log`) registra en ese mismo instante
`⚠ Server is approaching the used memory threshold, restarting...`: el propio `next dev`
mata el proceso y su supervisor tarda unos segundos en volver a abrir el puerto. Con 7.8 GB
de RAM la máquina deja entre 0.3 y 0.5 GB libres durante la corrida.

No es un fallo del candidato: el navegador llegó a un puerto cerrado, no a una pantalla
defectuosa. Respuesta (solo arnés):

- `waitForLocalAppOrigin` en `scripts/certifications/local-certification-env.cjs` sondea el
  origen y considera vivo cualquier código HTTP (incluso 404 o 500); la espera es acotada
  (90 s por defecto) y devuelve `false` en lugar de colgarse.
- `gotoLocalAppPage` la aplica antes del único reintento, y solo cuando el fallo es
  `ERR_CONNECTION_REFUSED` / `ERR_EMPTY_RESPONSE` / `ECONNREFUSED`. Un `ERR_ABORTED` normal
  conserva exactamente el comportamiento anterior: un reintento y nada más.
- `scripts/certifications/local-modules-release.cjs` verifica API y frontend antes de cada
  certificador y, si no reviven, cierra la ronda como `environment_failed` con los orígenes
  muertos. Un ambiente caído queda contablemente separado de un fallo funcional.

Cobertura: `scripts/test/local-certification-env.test.js` 142/142; las dos pruebas nuevas fijan
que la espera ocurre una sola vez antes del reintento, que un origen que no revive no se
reintenta a ciegas y que `ERR_ABORTED` no pasa por la sonda.

## 9. El buscador de SKU de la orden exigía una opción antes de cargar el maestro

La décima corrida (`%TEMP%\apex-modules-release-Ef170Y`) falló en
`purchases-modern-ui-local.cjs` con `No real SKU available for certification` después de 73
comprobaciones correctas. El modal de `/ordenes/nueva` se abre contra el catálogo que el
cliente carga en vuelo (`GET /api/v1/inventory/items`, página 155-165 de la pantalla) y
mientras llega muestra el aviso `No hay SKU que coincidan con la búsqueda.`; el certificador
leía `button.text-left` en ese instante, es decir, contra un DOM todavía vacío. Bajo presión
de memoria la transición cliente a cliente recompila la ruta y la ventana se ensancha, que es
lo que hizo visible la carrera en esta ronda y no en la anterior.

Respuesta (solo arnés): después de abrir el modal se espera el primer botón de opción o el
aviso definitivo, con presupuesto de 60 s. La aserción de negocio no se suaviza: si el
catálogo real no trae ningún SKU, el certificador sigue fallando. Verificación: 80/80
comprobaciones en `%TEMP%\apex-purchases-modern-dtE6bM`.
