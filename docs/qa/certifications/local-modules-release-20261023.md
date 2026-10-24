# Certificacion local de modulos Inventario, Compras y Transporte — 2026-10-23

Cambio: `local-modules-20261023`
Promocion certificada: `desarrollo -> develop` (pre-QA). No autoriza `main`.
Commit funcional certificado: `b15cd882f518ea9b492b9de9d40dfafa1286f5c1`
Baseline del destino `develop`: `0d3dd7256f42d94c80d085a650307b6c03a64477` (tip vigente al certificar; incluye el merge #67 — PYG interactivo por PUC y presupuesto por centro — absorbido en el candidato).
Ventana de ejecucion: 2026-10-24T03:52:22.556Z a 2026-10-24T04:19:26.626Z.
Resultado del orquestador: **PASSED** sobre 14 certificadores versionados.
Directorio de artefactos (fuera del repositorio): `C:/Users/mq1/AppData/Local/Temp/apex-modules-release-VMr4LE`

## Alcance exacto del candidato

151 rutas contra `origin/develop`: 77 nuevas (A), 74 modificadas (M), 0 eliminadas (D).
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
| 1 | `scripts/certifications/inventory-purchases-write-local.cjs` | passed | `462118b63e6d1b6ee89cb8e8b759b6d761960e03bd9c0f10f43c4012703a7664` | `8ae7257957c244af74568a5e4cc6c9e0393d419cb907b83a19a9e54bc83ad1da` |
| 2 | `scripts/certifications/transport-settlement-import-local.js` | passed | `7b3ea23ff42f0277711b016a63ebc1e4a579fb4db78c8ce92f9b2a4b4768dd4a` | `c2e3afd4658b836613d84ca44a9b74dbeaad6b5020081bf1fc2a05cce6819bc9` |
| 3 | `scripts/certifications/inventory-modern-ui-local.cjs` | passed | `79866c5aa4b98caa42325977017e78d1d99b58387cbc9306a243a36739f673be` | `7d957c082babbf07c8a3ec573c8055676e03a87d7e9634b254cf1b9e00aae8e6` |
| 4 | `scripts/certifications/inventory-guided-workflows-local.cjs` | passed | `8b5814205aad8559a2735ff855cdc935a810fd3959f4440e2a51fc9994b19fba` | `4fe02d4b0a06d746d6192283f5c9595d757210650597fabe1cce892b0ca79524` |
| 5 | `scripts/certifications/inventory-redundancy-local.cjs` | passed | `88ea037fb535217334f1187ccc00990ecca27bcdc7cd89cd9143a1452eb4b94c` | `65bb5649163d1d635129b28516981c9be64e19e973dc85e9825d696fc199ff39` |
| 6 | `scripts/certifications/purchases-modern-ui-local.cjs` | passed | `50bba165f7916592857537d8df36a6b5064e7d9685f7272dbeb3148532db1965` | `d3c85b57fefb9aa6607926d146cc2c21edd3ae81568ef2f10d12836b52efc936` |
| 7 | `scripts/certifications/purchases-reports-local.cjs` | passed | `0b144858ded2ec65e309534a1bdb39f5adf5b521ab063444fe7600c16af1e473` | `d6adf44ebb97004df922427c49a4f3042c862032e7d040854f8615001996308c` |
| 8 | `scripts/certifications/purchases-operator-readability-local.cjs` | passed | `054853e6eea2b320328b5228ddcde3049cc69528c60c1aae681ef10592a8bc5e` | `69aa631e3437e640a0d87dfaaa133651f62af473e18e0d1ae8c6c55dca5608ed` |
| 9 | `scripts/certifications/transport-search-select-local.cjs` | passed | `31fce584365b772d8d642384b2dc1ff2d697c2fbce22c5766c8daec0106133d5` | `bb9ae2ad10f4336e94ab106ef198cb82c436be30426bd67e72a143717da05529` |
| 10 | `scripts/certifications/transport-theme-local.cjs` | passed | `46ff8e8bf1e3721f46a583160e76fb016df75ad3079f8ffdbacb5ba9658ac717` | `0f09896dd81855896e02156ddccf29be45d5f2ff161c2833b5972bc7935a4160` |
| 11 | `scripts/certifications/transport-print-theme-local.cjs` | passed | `c6573838f81b3409810877512dc35196a71790cdcdca2c594c4cca3538819371` | `21f3a4ec36a304a005777cbef6ab0392335bb370ffa9a0f50fa9f0f3a15cd225` |
| 12 | `scripts/certifications/transport-rate-three-steps-local.cjs` | passed | `09b40d65ed2cdd5f52d2eff0166cec46bd16bcd22c5c6afecdbaf96969a31a9b` | `8c0504874ac492a14412f827df73ebb59be0eb9862093d6ca4499529a8a74a67` |
| 13 | `scripts/certifications/transport-vehicle-consolidation-local.cjs` | passed | `493b220f5bd018e3f1f95e1b984a76b7c85972ad9441462c725c74ba8eb2a092` | `c3922514af3d01d760784760ede80dfe2352ce48decabace76333aadb37e33b9` |
| 14 | `scripts/certifications/release-local-regression.cjs` | passed | `9d85b469f14f7bda683ed6989b1b6e7e874acd1457282f00106b3d1aa9e00e82` | `32e9a5b6a51c111a49707d3dbabfc59fa7be66784a059f175c0ecd3e9f9bc1ce` |

## Regresion de plataformas (subconjunto `node --test`)

| Suite | Pruebas | Pasan | Fallan | Omitidas | sha256 bitacora |
| --- | --- | --- | --- | --- | --- |
| api | 794 | 794 | 0 | 0 | `eac3c3927633cb3e713ccbdfc2e318abb43eeb16ceb3904488a906c87a154c26` |
| web | 567 | 567 | 0 | 0 | `a9362b902ebf27a9b2cf71fe3935b1a7d75c2257827eb31bd24bbd1c2a4a6f4e` |

## Ajustes de estabilidad introducidos en esta ronda (solo en el arnes, nunca en el producto)

- `scripts/certifications/local-certification-env.cjs`: `gotoLocalAppPage` activa `setBypassServiceWorker` porque el service worker de la app (`apps/web/public/sw.js`) hace `skipWaiting` + `clients.claim` y toma el control a mitad de sesion, abortando navegaciones de Puppeteer (`net::ERR_ABORTED`, `Cannot find context with specified id`).
- `scripts/certifications/local-certification-env.cjs`: presupuesto de navegacion de 120 s y un unico reintento con reinicio del observador de trafico. La maquina de certificacion tiene 7.8 GB y bajo presion el renderer aborta la navegacion; una navegacion no conserva estado, asi que el reintento no enmascara un fallo funcional y un fallo persistente revienta tras el segundo intento.
- `scripts/certifications/inventory-modern-ui-local.cjs`: la reconciliacion de valorizacion ahora espera a que desaparezca `Cargando valorizacion…` y a que el recuento del resumen iguale el numero de productos del API. El resumen se pinta primero con `0 productos · $ 0`, asi que la espera anterior comparaba contra un DOM sin cargar.
- `scripts/certifications/purchases-reports-local.cjs`: antes de exportar, exige que no quede ninguna fila `Cargando ...` y que el paginador reporte el total del API (`de <conteo>`). La espera anterior (`tbody tr > 0`) se satisfacía con el marcador de carga y el Excel se leia vacio; coincidia por accidente cuando la base no tenia facturas.
- `scripts/certifications/purchases-operator-readability-local.cjs`: espera el listado hidratado antes de auditar la legibilidad del operador.
- `scripts/certifications/transport-theme-local.cjs`: espera la redireccion central (`/pyg`, `/maestros`) que el router resuelve despues de hidratar.
- `scripts/certifications/transport-print-theme-local.cjs`: espera el arranque de tema del cliente en la pestana de dashboard antes de auditar claro/oscuro.
- `scripts/certifications/inventory-purchases-write-browser.cjs`: el proveedor se elige con el buscador propio del formulario y se verifica que la ficha quedo capturada. El campo solo resuelve el NIT sobre el catalogo ya descargado; escribir antes dejaba la revision sin proveedor y el `POST /purchases/orders` nunca se disparaba. No se elimino ni suavizo ninguna de las 35 comprobaciones.

Ningun cambio altero aserciones de negocio: solo se agregaron esperas de estado real y la cobertura `scripts/test/local-certification-env.test.js` (140 pruebas) fija el reintento unico y que no se acumulen observadores. Los timeouts funcionales originales se conservan.

## Revision de seguridad del candidato

Veredicto del experto en ciberseguridad: **APTO CON OBSERVACIONES**, sin bloqueadores para `develop`.

- Verificado: limites de descompresion de XLSX (8 MB por parte, 20 MB total), rechazo de VBA/enlaces externos/travesia/archivos cifrados, guardavenenos de formulas (`=`, `+`, `@`), multipart de 2 MB y un archivo, `preview_hash` anti-TOCTOU, rechazo de escritura cross-tenant con `AsyncLocalStorage`, entradas del catalogo de permisos RBAC, sandbox de PDF con `--network none` y seccomp sin privilegios, y guardas de certification que obligan a loopback e inquilinos sinteticos.
- Observacion pendiente de decision del solicitante: `docs/AVANCE_ROTACION_CREDENCIALES_RAILWAY_20261022.md` y `docs/RECOVERY_RUNBOOK_20261022.md` versionan huellas `sha12` + longitud de secretos rotados y rutas del vault DPAPI. No se imprimio ningun valor; la decision de retirarlos del repositorio queda explícita en manos del solicitante porque la custodia externa usa el mismo formato de huella.
- No verificable por revision estatica: RLS en Supabase/Railway y la aplicacion real del perfil seccomp por proveedor.

## Trabajo ajeno preservado

- `apps/web/app/privacidad/page.tsx` (ajeno, commit `cdc89ddd`): el candidato lo restaura byte a byte (`ee4d5bd4b87831e06d3521606d31a1b2cd6207e9`) y no existe en `origin/develop` ni en `origin/main`. Es restauracion, no modificacion.
- El candidato fusiona la punta `origin/develop` (`0d3dd725`, merge #67: PYG interactivo por PUC, presupuesto por centro y sus 31 + 11 pruebas) con `git merge --no-edit` sin conflictos; el arbol del candidato contiene ese trabajo y el diff contra el destino no revierte ninguna ruta ajena.
- Validaciones del arbol fusionado, antes de la certification E2E: `scripts/test/local-certification-env.test.js` 140/140, `scripts/test/validate-promotion-scope.test.js` 4/4, `scripts/test/validate-preqa-promotion-evidence.test.js` 3/3, `apps/api/test/accounting-pyg-interactive.test.js` 31/31 y `apps/web/test/accounting-pyg-interactive.test.mjs` 11/11.

## Hallazgo separado: el build de produccion no compila en las tres ramas

`next build` (Next 16.3.5) falla al validar rutas tipadas porque `apps/web/app/dashboard/transporte/page.tsx` exporta el componente nombrado `TransportFleetPage` junto con el `export default`, patron que ya existe identico en `origin/develop` y `origin/main`. No lo introduce este candidato y queda fuera de su alcance; es la causa probable de que Vercel Production no despliegue y requiere su propia certificacion.

## Limites declarados

- Esta evidencia certifica el ambiente LOCAL y habilita la promocion a `develop` para QA funcional; no autoriza `main` ni certifica Railway/Vercel/Supabase remotos.
- Las migraciones locales `20261016123000*` (Sedes) siguen sin aplicarse a la nube: corresponde a la ventana de despliegue QA autorizada aparte.
- Las pruebas unitarias, el lint y el build no sustituyen esta certification E2E; se conservan sus bitacoras con hash.

