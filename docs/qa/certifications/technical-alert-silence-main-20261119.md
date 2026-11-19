# Certificación — pierna `develop → main` del enmudecimiento (`technical-alert-silence-main-20261119`)

- **Empresa / alcance**: toda la superficie web de APEXOS en Producción. El registro del fallo sigue viviendo en `platform_logs`; este corte solo quita la ventana de la vista del cliente.
- **Promesa certificada**: con la API caída, estrellada, en cuota o sin señal, el cliente **no ve ninguna ventana emergente técnica**; la pantalla queda viva en estado de dato y el fallo se registra. El detalle técnico solo aparece si el usuario activa el modo diagnóstico.
- **Qué se promociona**: el replay puntual del commit funcional ya certificado y desplegado en QA (`36eb0ccb`, medido 68/68 en local y **163/163 en QA**) sobre `origin/main 956f2d23`. No es un merge de `develop`: `main..develop` trae frentes ajenos a este alcance.
- **Ramas y commit**: rama auxiliar `codex/qa-technical-alert-silence-main-20261119` → replay `3ca8d541` (36 rutas) + herencia de evidencia `6f6c1a11` (18 rutas reemplazadas por los blobs del árbol medido) + evidencia y nota de esta pierna + los dos manifiestos.

## 1. Por qué esta pierna no vuelve a medir la promesa desde cero

El cambio es solo de `apps/web` y de su certificador. El control de que el artefacto correcto es el que viaja no se hace repitiendo la corrida, sino demostrando identidad de bytes con el árbol que sí se midió:

| Naturaleza | Rutas | Blob idéntico al certificado en QA |
|---|---|---|
| código (`apps/web/**`, `scripts/certifications/**`) | 12 | **12 de 12** |
| documentación de certificación | 3 | 3 de 3 |
| evidencia versionada | 19 | 19 de 19 |
| raíz del destino (`package.json`, `.gitignore`) | 2 | 1 de 2 |

El único distinto es `package.json`, y es correcto que lo sea: el replay conserva la versión propia de `main` y le aplica solo las dos líneas nuevas de scripts. El diff exacto, línea por línea, está en `main-20261119/equivalencia-blob-main-develop.txt`.

## 2. La columna del después, medida en QA contra el build desplegado

`scripts/certifications/technical-alert-silence-browser-qa.js` (`npm run certify:technical-alerts-silence:qa`) corrió contra `https://apexos-web-qa-production.up.railway.app` sirviendo ya el merge `5ff1440f` de `develop`, y cerró **163 de 163 controles, 0 fallos**. Ventana de la corrida: `2026-11-19T14:27:37Z` a `2026-11-19T14:39:55Z` (738 s), `run_id 20261119142737`. Evidencia: `docs/qa/evidence/technical-alert-silence-20261118/qa-despues/`.

| Control | Medido |
|---|---|
| Veredicto | **163/163**, `EXIT=0` |
| Bundle desplegado | 10 chunks, 629.512 bytes leídos; `apex:alert` en **0** chunks, `apex:diagnostic` en 1 (`/_next/static/chunks/0203i95lepgi4.js`) |
| Commit del API | `9c82fca1a392`, sin cambio: un corte solo-web no mueve `/health.commit`, por eso el control del artefacto es la sonda de tokens y no el health |
| Identidades | `NYVORA / Administrador de empresa`, `NYVORA / Empleado` y, para el control de aislamiento, `Diana vargas / Analista contable` (empresa real distinta, no un fixture). Usuarios efímeros creados por Prisma y **desactivados** al terminar |
| Escenarios | 12: camino feliz + tormenta 500 + 429 + corte de red, por cada una de las tres identidades, sobre rutas, mapa, servicios, monitoreo y lobby |
| Tarjetas técnicas en DOM | **0** en los 60 recorridos, con vocabulario técnico buscado en el texto pintado. 21 controles `guard_honesto_sin_ventana`/`rbac_sin_ventana` verifican además que la pantalla negada por rol muestra estado de dato honesto y no una ventana |
| Registro del fallo | `el_navegador_intento_registrar_los_fallos` (70 intentos) y `los_fallos_quedan_registrados_en_qa` (**74 registrados con 2xx**: 70×200, 4×204) |
| Deuda medida, no maquillada | `telemetria_sin_token.status_sonda` → `401`: el fallo de un usuario deslogueado sigue sin dejar registro |

El antes, sobre el build que QA servía sin el arreglo (`develop 5fcc2ed1`), fue **141/163 con 22 fallos**: 20 de ventana (18 con tormenta inyectada y 2 en RBAC/camino feliz del empleado limitado, que veía la ventana sin ninguna inyección) más 2 de artefacto (`apex:alert` presente en un chunk y `apex:diagnostic` ausente). Ese es exactamente el conjunto que esta corrida volteó, con el mismo certificador y los mismos 163 controles: el arnés quedó probado como capaz de fallar antes de creerse su propio verde (`qa-antes/certification.json`).

## 3. Suites y soporte sobre el árbol de main

| Control | Resultado |
|---|---|
| Suite web, archivo por archivo (cwd `apps/web`) | 112 archivos, 829 pruebas: **828 pasan, 1 falla** (`main-20261119/suite-web-main.txt`) |
| El único rojo | `transport-pyg-account-config.component.test.mjs` → subprueba «react y react-dom/server salen de la misma instalación de node_modules», que exige que la dependencia resuelva dentro del propio árbol. Atribución completa en §4 |
| Contratos del cambio sobre el árbol de main | `technical-alert-silence.test.mjs` 9/9 y `hr-monitor-refresh.test.mjs` en verde |
| API / Prisma / migraciones | **No hay ni una ruta en el inventario**: el diff es 100 % `apps/web`, su certificador, evidencia y documentación |

## 4. Atribución del rojo: guardarrails del sustrato, no del corte

Esta worktree no traía `node_modules`; el sustrato se montó por junction desde la worktree certificada, y `package-lock.json` es blob-idéntico entre `origin/main` y el candidato (`6a62f9317f3b952f1f9099c81acbe24214ca3e00`), así que el árbol de dependencias es el mismo. Con junction, el `realpath` de cada dependencia apunta a la otra worktree y ese guardarrail **debe** caer: se niega a certificar un render con dependencias ajenas al árbol medido. Dos controles lo cierran:

1. **Blob**: `apps/web/test/transport-pyg-account-config.component.test.mjs` vale `0d7e7460e6eff0773036ab18d2f3bddd3b1098da` en `origin/main`, en `origin/develop` y en el candidato. En la corrida certificada de `develop`, sobre un árbol con instalación propia, ese archivo sale **3 pruebas / 3 pasan / 0 fallan**.
2. **Baseline intacto del destino**: worktree temporal desprendida de `origin/main 956f2d23`, **sin este diff** y con el mismo sustrato de junction, produjo `not ok 3` con el mismo mensaje y la misma ruta (`...apexos-cand-alertsilence-develop\node_modules\react\index.js`), 2 pasan y 1 falla. Retirada después de verificar que la fuente no perdió un archivo.

Además, ninguna ruta del inventario toca `apps/web/**/transporte/**` ni la configuración de cuentas PYG: el área del test es ajena al diff por las dos vías.

## 5. Rollback

`rollback_plan` del manifiesto de aprobación: `previous_main_commit = 956f2d23915885a30476fcb8e1dc2d6e13f13b1e`, estrategia `controlled_revert` del commit de fusión sobre `main` (sin reescribir historia compartida) y redeploy de `apexos-web-prod`. Sin migraciones de esquema ni cambios de API, el revert no deja datos huérfanos y no reinicia el servicio de datos. Gatillo: si en Producción vuelve a aparecer un `.platform-alert` en rutas, mapa, servicios, monitoreo o lobby, si el bundle publicado vuelve a traer `apex:alert`, o si el cierre de sesión por inactividad deja de explicar el motivo en el login.

## 6. Lo que este corte no arregla (deuda declarada, sigue abierta)

1. **Las causas del fallo técnico siguen vivas en el backend**: `P2024`/`P2028`/`57014`, el `statement_timeout` de 5 s contra lecturas pesadas, la evidencia en base64 dentro de jsonb y los handlers `app/api/**` que filtran el detalle de Supabase. El enmudecimiento deja de gritarlas; no las cura.
2. **Telemetría sin sesión**: `/api/v1/admin/platform-logs/client` exige `request.user`, así que el fallo de un usuario deslogueado no deja registro. Medido: `401`.
3. **Ocho `window.alert` de validación de formulario** en Talento Humano → Empleados. Son validación client-side, no fallo de la API, y quedan como deuda de UX aparte.
4. **El fallback silencioso de Supabase** en el cliente web.
