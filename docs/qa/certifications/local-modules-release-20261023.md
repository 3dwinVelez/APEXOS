# Certificacion local de modulos Inventario, Compras y Transporte — 2026-10-23

Cambio: `local-modules-20261023`
Promocion certificada: `desarrollo -> develop` (pre-QA). No autoriza `main`.
Commit funcional certificado: `dce85470ece5146ed048619dfd9eb56d0545c2cb`
Baseline del destino `develop`: `759323c7fff3e5bb14374ae770284274a05ef1a0` (tip vigente al certificar; el candidato lo absorbe con `git merge --no-edit`, asi que el diff contra el destino no revierte su trabajo).
Ventana de ejecucion: 2026-10-24T06:09:24.152Z a 2026-10-24T06:37:36.860Z.
Resultado del orquestador: **PASSED** sobre 14 certificadores versionados.
Directorio de artefactos (fuera del repositorio): `C:/Users/mq1/AppData/Local/Temp/apex-modules-release-J2Lmfm`

## Alcance exacto del candidato

154 rutas contra `origin/develop`: 80 nuevas (A), 74 modificadas (M), 0 eliminadas (D).
Sin migraciones, sin `schema.prisma`, sin `package.json` ni bloqueos de dependencias, sin archivos `.env`.
El diff de dos puntos y el de tres puntos son el mismo conjunto de rutas: el candidato no revierte trabajo ajeno.

## Ambiente de ejecucion

- Copia exacta del candidato en `%TEMP%` creada con `git init` + `git fetch` del commit (sin `.env` heredado, verificado en cada nivel del arbol).
- Base de datos PostgreSQL local clonada (`apexos_cert_recovery_f855022a`, 185 tablas) restaurada desde el volcado de la recuperacion; nunca se apunto a Supabase ni a Railway.
- API real en `127.0.0.1:3310` y frontend real en `127.0.0.1:3311`; navegador Chromium/Edge headless.
- Puerta de red loopback inyectada con `NODE_OPTIONS --require` que rechaza destinos no locales y los puertos 3000, 3001, 54320, 6379, 9000, 9001 y 8000.
- Escrituras reales solo en inquilinos sinteticos de certificacion (`write-cert-*`, `S-CERT`/`B-CERT`/`CC-CERT`, cuentas 143501/220501/261001/413501/417501/519501/613501/99999999).
- Las rutas del frontend se precalentaron (41 rutas, 0 fallos) para que la certification no dependa de la compilacion fria del modo desarrollo.

## Certificadores ejecutados

| # | Certificador | Resultado | sha256 script | sha256 bitacora |
| --- | --- | --- | --- | --- |
| 1 | `scripts/certifications/inventory-purchases-write-local.cjs` | passed | `462118b63e6d1b6ee89cb8e8b759b6d761960e03bd9c0f10f43c4012703a7664` | `26becaac4a1368197bf100b250b71183dc708d180cddefb34619c2bd631075ad` |
| 2 | `scripts/certifications/transport-settlement-import-local.js` | passed | `7b3ea23ff42f0277711b016a63ebc1e4a579fb4db78c8ce92f9b2a4b4768dd4a` | `6848996e84deae787cbf4bb7c8a7a7c53dce3ed3a777dfecebfe82fac12d04d2` |
| 3 | `scripts/certifications/inventory-modern-ui-local.cjs` | passed | `79866c5aa4b98caa42325977017e78d1d99b58387cbc9306a243a36739f673be` | `c3495158b9b4c6ff0f51ab5e3a4acbd5db0ca1b9795951186d5338f71134e9eb` |
| 4 | `scripts/certifications/inventory-guided-workflows-local.cjs` | passed | `8b5814205aad8559a2735ff855cdc935a810fd3959f4440e2a51fc9994b19fba` | `834fe102eb815b2da4a97ad1df4805cf7afeaa1802529863793302ef94d9eb13` |
| 5 | `scripts/certifications/inventory-redundancy-local.cjs` | passed | `8cbe52fdd3622ba110c2d2d25d2496d12d606a880f0523c028d0000edd86350c` | `8272b445a90b353083e35c0ee6a09da23534322a9169232428ae8b64e73ae671` |
| 6 | `scripts/certifications/purchases-modern-ui-local.cjs` | passed | `3b5d0843c1ae0022e9ee187eff20e98c768b535eca0efe651796039f48a7a6e3` | `ef69663c2cf04a2c84ea23e93c1d975fe87f52a7fa586a22a1a5f95a14b59097` |
| 7 | `scripts/certifications/purchases-reports-local.cjs` | passed | `0b144858ded2ec65e309534a1bdb39f5adf5b521ab063444fe7600c16af1e473` | `61e3ca9f22f1e97c3b947238d11ca52c751d420d4d6ca8c37f9e3a78a3e9f864` |
| 8 | `scripts/certifications/purchases-operator-readability-local.cjs` | passed | `054853e6eea2b320328b5228ddcde3049cc69528c60c1aae681ef10592a8bc5e` | `8d1f0252b4e9986227b973190540cdd24c10d480e7ef9510470bdfefaef96160` |
| 9 | `scripts/certifications/transport-search-select-local.cjs` | passed | `31fce584365b772d8d642384b2dc1ff2d697c2fbce22c5766c8daec0106133d5` | `de808a0358926f1e3227a2bc66385d83816afc573277f79f4980f4a7de59993b` |
| 10 | `scripts/certifications/transport-theme-local.cjs` | passed | `46ff8e8bf1e3721f46a583160e76fb016df75ad3079f8ffdbacb5ba9658ac717` | `3b6feaddea923d00cb9398b70ee084ee62a2196b65a7a5e45d1f7a401f9c6285` |
| 11 | `scripts/certifications/transport-print-theme-local.cjs` | passed | `c6573838f81b3409810877512dc35196a71790cdcdca2c594c4cca3538819371` | `b79981c6224f8f9c92368e449309a6b65fc31989396b6e3dc05e51934bebe660` |
| 12 | `scripts/certifications/transport-rate-three-steps-local.cjs` | passed | `09b40d65ed2cdd5f52d2eff0166cec46bd16bcd22c5c6afecdbaf96969a31a9b` | `4000bef9d0c11c7f4315b29c42c90846f2512cfee95903394f17509ac0e984ea` |
| 13 | `scripts/certifications/transport-vehicle-consolidation-local.cjs` | passed | `493b220f5bd018e3f1f95e1b984a76b7c85972ad9441462c725c74ba8eb2a092` | `b32bc5958e0a83d20bd4524de5aba76fc27f60b7d7a6bb49af42e99f215b0a90` |
| 14 | `scripts/certifications/release-local-regression.cjs` | passed | `9d85b469f14f7bda683ed6989b1b6e7e874acd1457282f00106b3d1aa9e00e82` | `cadfba2f13513d29496dfb22aa1277a95376ee7f95c00adbd61680bd7e5f5693` |

## Regresion de plataformas (subconjunto `node --test`)

| Suite | Pruebas | Pasan | Fallan | Omitidas | sha256 bitacora |
| --- | --- | --- | --- | --- | --- |
| api | 802 | 802 | 0 | 0 | `c07c286b364746d6cd172520801f17b9a0211a31373069c8f37ba27f92813c2b` |
| web | 567 | 567 | 0 | 0 | `c6faefc63a05efb5888b2c0f11eff345792f2eebf47f26c0f0a67908cce3aa3a` |

## Ajustes de estabilidad introducidos en esta ronda (solo en el arnes, nunca en el producto)

- `scripts/certifications/local-certification-env.cjs`: `gotoLocalAppPage` activa `setBypassServiceWorker` porque el service worker de la app (`apps/web/public/sw.js`) hace `skipWaiting` + `clients.claim` y toma el control a mitad de sesion, abortando navegaciones de Puppeteer (`net::ERR_ABORTED`, `Cannot find context with specified id`).
- `scripts/certifications/local-certification-env.cjs`: presupuesto de navegacion de 120 s y un unico reintento con reinicio del observador de trafico. La maquina de certificacion tiene 7.8 GB y bajo presion el renderer aborta la navegacion; una navegacion no conserva estado, asi que el reintento no enmascara un fallo funcional y un fallo persistente revienta tras el segundo intento.
- `scripts/certifications/local-certification-env.cjs`: `waitForLocalAppOrigin` sondea el origen (cualquier codigo HTTP prueba que escucha) con espera acotada de 90 s y la aplica `gotoLocalAppPage` antes del reintento cuando la navegacion falla con `ERR_CONNECTION_REFUSED`. `next dev` se autocierra al acercarse al umbral de memoria y su supervisor tarda segundos en volver a abrir el puerto; la ronda r9 perdio un certificador contra ese puerto muerto.
- `scripts/certifications/local-modules-release.cjs`: antes de lanzar cada certificador verifica la vida de la API y del frontend y, si no reviven, cierra la ronda como `environment_failed`. Un ambiente caido queda separado de un fallo funcional del candidato y no consume certificadores.
- `scripts/certifications/inventory-redundancy-local.cjs`: la bitacora de evidencia guarda `runtime_errors` con su mensaje, para que un fallo de «no browser runtime errors» se explique solo en lugar de dejar solo el conteo.
- `scripts/certifications/inventory-modern-ui-local.cjs`: la reconciliacion de valorizacion ahora espera a que desaparezca `Cargando valorizacion…` y a que el recuento del resumen iguale el numero de productos del API. El resumen se pinta primero con `0 productos · $ 0`, asi que la espera anterior comparaba contra un DOM sin cargar.
- `scripts/certifications/purchases-reports-local.cjs`: antes de exportar, exige que no quede ninguna fila `Cargando ...` y que el paginador reporte el total del API (`de <conteo>`). La espera anterior (`tbody tr > 0`) se satisfacía con el marcador de carga y el Excel se leia vacio; coincidia por accidente cuando la base no tenia facturas.
- `scripts/certifications/purchases-operator-readability-local.cjs`: espera el listado hidratado antes de auditar la legibilidad del operador.
- `scripts/certifications/transport-theme-local.cjs`: espera la redireccion central (`/pyg`, `/maestros`) que el router resuelve despues de hidratar.
- `scripts/certifications/transport-print-theme-local.cjs`: espera el arranque de tema del cliente en la pestana de dashboard antes de auditar claro/oscuro.
- `scripts/certifications/inventory-purchases-write-browser.cjs`: el proveedor se elige con el buscador propio del formulario y se verifica que la ficha quedo capturada. El campo solo resuelve el NIT sobre el catalogo ya descargado; escribir antes dejaba la revision sin proveedor y el `POST /purchases/orders` nunca se disparaba. No se elimino ni suavizo ninguna de las 35 comprobaciones.

Ningun cambio altero aserciones de negocio: solo se agregaron esperas de estado real y la cobertura `scripts/test/local-certification-env.test.js` (142 pruebas) fija el reintento unico, que no se acumulen observadores y que la espera de vida del origen acotada no reintente a ciegas ni enmascara un ERR_ABORTED. Los timeouts funcionales originales se conservan.

## Revision de seguridad del candidato

Veredicto del experto en ciberseguridad: **APTO CON OBSERVACIONES**, sin bloqueadores para `develop`.

La revision cubrio el candidato completo y, de forma explicita, el delta `b15cd882..dce85470` respecto del veredicto anterior: el resolutor por lote de saldos iniciales del PR #68 (`apps/api/src/modules/accounting/service.js`) y el arnes de certificacion.

- Delta del PR #68 (`resolveOpeningBalanceAccountsBatched` y `resolveOpeningBalancePartiesBatched`): las cuatro consultas `findMany` con `in` siguen dentro del alcance de tenant porque el middleware de `apps/api/src/core/prisma.js:95-98` inyecta `where.tenant_id` en toda accion de `READ_OPS` (que incluye `findMany`) sobre los modelos `Account` y `Party`, ambos en `TENANT_MODELS`; `__includeInactive` solo relaja el filtro `active` del borrado blando, nunca el tenant. Codigos y NIT viajan como parametros de Prisma, no como SQL compuesto, y el techo de 5.000 filas de la plantilla acota cualquier lista `in` muy por debajo del limite de parametros de PostgreSQL. Las semantics de rechazo se conservan: exacto por encima de insensible, ambiguedad de codigo, cuenta inactiva o no transaccional con su numero de fila y bloqueo del respaldo a `id` legacy cuando el NIT existe inactivo.
- Verificado (mantiene el alcance del veredicto anterior): limites de descompresion de XLSX (8 MB por parte, 20 MB total), rechazo de VBA/enlaces externos/travesia/archivos cifrados, guardavenenos de formulas (`=`, `+`, `@`), multipart de 2 MB y un archivo, `preview_hash` anti-TOCTOU, rechazo de escritura cross-tenant con `AsyncLocalStorage`, entradas del catalogo de permisos RBAC, sandbox de PDF con `--network none` y seccomp sin privilegios, y guardas de certification que obligan a loopback e inquilinos sinteticos.
- Observacion pendiente de decision del solicitante: `docs/AVANCE_ROTACION_CREDENCIALES_RAILWAY_20261022.md` y `docs/RECOVERY_RUNBOOK_20261022.md` versionan huellas `sha12` + longitud de secretos rotados y rutas del vault DPAPI. No se imprimio ningun valor; la decision de retirarlos del repositorio queda explícita en manos del solicitante porque la custodia externa usa el mismo formato de huella.
- Delta del arnes (`local-certification-env.cjs`, `local-modules-release.cjs`, `purchases-modern-ui-local.cjs`, `inventory-redundancy-local.cjs`): no anade secretos, no lee `.env` (la prueba de dependencia del propio arnes lo sigue bloqueando), ni abre destinos distintos de los origenes ya validados por `localOrigin` (loopback, puerto alterno explicito, nunca 3000/3001/54320) y la puerta `NODE_OPTIONS --require` los rechaza igual. El log de recuperacion imprime origen y motivo de navegacion abortada, sin credenciales ni datos de negocio. Ninguna asercion de negocio fue eliminada o suavizada: solo se agregaron esperas de estado real y la evidencia ahora conserva los mensajes de error de navegador.
- No verificable por revision estatica: RLS en Supabase/Railway y la aplicacion real del perfil seccomp por proveedor.

## Trabajo ajeno preservado

- `apps/web/app/privacidad/page.tsx` (ajeno, commit `cdc89ddd`): el candidato lo restaura byte a byte (`ee4d5bd4b87831e06d3521606d31a1b2cd6207e9`) y no existe en `origin/develop` ni en `origin/main`. Es restauracion, no modificacion.
- El candidato fusiona la punta `origin/develop` (`759323c7`, merge #67: PYG interactivo por PUC, presupuesto por centro y sus 31 + 11 pruebas; merge #68: saldos iniciales por lote con su certificador `opening-balances-volume-local.js`, sus manifiestos y su evidencia) con `git merge --no-edit` sin conflictos; el arbol del candidato contiene ese trabajo y el diff contra el destino no revierte ninguna ruta ajena.
- Validaciones del arbol fusionado, antes y durante la certification E2E: `scripts/test/local-certification-env.test.js` 142/142 (Arnés), `scripts/test/validate-promotion-scope.test.js` 4/4, `scripts/test/validate-preqa-promotion-evidence.test.js` 3/3 y la regresion completa de plataformas que se tabula arriba (API 802/802, Web 567/567), que incluye las pruebas del PR #67 y del PR #68.

## Hallazgo separado: el build de produccion no compila en las tres ramas

`next build` (Next 16.3.5) falla al validar rutas tipadas porque `apps/web/app/dashboard/transporte/page.tsx` exporta el componente nombrado `TransportFleetPage` junto con el `export default`, patron que ya existe identico en `origin/develop` y `origin/main`. No lo introduce este candidato y queda fuera de su alcance; es la causa probable de que Vercel Production no despliegue y requiere su propia certificacion.

## Limites declarados

- Esta evidencia certifica el ambiente LOCAL y habilita la promocion a `develop` para QA funcional; no autoriza `main` ni certifica Railway/Vercel/Supabase remotos.
- Las migraciones locales `20261016123000*` (Sedes) siguen sin aplicarse a la nube: corresponde a la ventana de despliegue QA autorizada aparte.
- Las pruebas unitarias, el lint y el build no sustituyen esta certification E2E; se conservan sus bitacoras con hash.

