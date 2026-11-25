# Brief — Botón «Descarga nuestra app» en el lobby con mini-guía de instalación

- **ID**: `2026-11-24-boton-app-movil-lobby`
- **Fecha**: `2026-11-24`
- **Rama activa**: `desarrollo`
- **Prompt crudo**: "vamos a diseñar un boton en el lobby para que direccione a esta direccion que seria nuestra app, puedes colocar como descarga nuestra app appapexos-production.up.railway.app teniendo en cuenta que debe tener una miniguia de como instalarla, la app se isntala a travez de un navegador crhome dandole en los punticos y buscar la funcion instalar y crear acceso directo lo cual instalaria la app desde el portal, hay que tener en cuenta que esta url solo habilita los dispositivos moviles si lo abren desde una ventana de pc este no permitira crear el app y le mostrara un mensaje que le dice que es exlcusivo para moviles.. busca la forma de integrarla donde el boton lo lleve primero a la miniguia y luego lo direccione a la app, vamos a realizar estos cambios desde desrrollo y solo lo desplegaremos en develop por el momento no tocaremos produccion \"main\" ejecuta la mejora y revisamos"

## 1. Objetivo

Que un usuario del portal encuentre, desde el lobby, la app móvil de APEXOS y sepa instalarla. El botón lleva primero a una mini-guía (Chrome → tres puntos → Instalar app / Crear acceso directo) y desde ahí a la app. Quien está en computador no recibe un enlace muerto: la guía le dice que la app es exclusiva para celulares y le entrega el enlace para llevarlo al teléfono.

Verificable: en móvil la guía muestra los pasos y el enlace a la app; en escritorio la guía muestra el aviso de exclusividad y el botón de copiar enlace, y en ningún caso se abre una pestaña a la app como acción primaria.

## 2. Alcance exacto

| Estado | Archivo | Qué cambia |
|---|---|---|
| `A` | `apps/web/lib/mobileAppInstall.ts` | URL de la app (`NEXT_PUBLIC_MOBILE_APP_URL` con respaldo a `https://appapexos-production.up.railway.app`), detección pura de dispositivo portátil y los pasos de instalación como dato |
| `A` | `apps/web/components/lobby/AppInstallBand.tsx` | Banda del lobby con el botón «Descarga nuestra app» y el diálogo de la mini-guía sobre `ModalFrame`; rama móvil (pasos + abrir la app) y rama escritorio (aviso exclusivo + copiar enlace) |
| `M` | `apps/web/app/dashboard/page.tsx` | Monta la banda una sola vez, fuera del condicional de módulos habilitados, para que aparezca también con el lobby vacío |
| `A` | `apps/web/test/mobile-app-install.test.mjs` | Contrato de fuente con control de contraste: URL, detección en las cuatro familias, copy de los pasos y ausencia cruzada de las dos ramas |
| `A` | `scripts/certifications/mobile-app-install-browser-local.js` | Certificación en Chromium real: viewport teléfono y viewport escritorio, tema claro y oscuro, enlace con `rel=noopener`, copiado al portapapeles y cero ventanillas nativas |
| `M` | `package.json` | Script `certify:app-install:local` |
| `M` | `docs/design/APEXOS_COMPONENT_CATALOG.md` | Registra la banda de instalación como superficie del lobby y su primitiva canónica |
| `A` | `docs/project/app-movil.md` | Documento funcional de la app móvil: qué es, dónde vive, cómo se instala y qué pasa en PC |
| `M` | `.qoder/skills/apexos-frontend/SKILL.md` | Control nuevo sobre la banda y su rama por dispositivo |
| `M` | `.qoder/skills/apexos-qa/SKILL.md` | Control nuevo sobre la certificación por viewport y tema |
| `M` | `.qoder/skills/apexos-brief/SKILL.md` | Control nuevo sobre briefs cuyo destino vive en otro repositorio |
| `M` | `agents/apexos-frontend/SKILL.md` | Espejo regenerado por `agents:sync` |
| `M` | `agents/apexos-qa/SKILL.md` | Espejo regenerado por `agents:sync` |
| `M` | `agents/apexos-brief/SKILL.md` | Espejo regenerado por `agents:sync` |
| `M` | `agents/registry.json` | Versión, `updated_at` y `sha256` de los tres agentes |
| `M` | `agents/CHANGELOG.md` | Entrada de la intervención |
| `A` | `docs/qa/evidence/app-install-lobby-20261124/**` | Evidencia de la corrida de certificación |

### Módulos (`change_intent.modules`)

- `lobby`
- `app-movil`

### Borrados autorizados (`allowed_deletions`)

- ninguno

## 3. Fuera de alcance

- **El código de la app.** `appapexos-production.up.railway.app` es un servicio aparte (repo `AppApexos`, Vite + PWA, título «APEXOS Web Móvil»). Su bloqueo de escritorio (`APEXOS Web Móvil es exclusivo para celulares` y la bandera `allowDesktop: false`) ya existe allá; este brief no lo duplica ni lo toca.
- **`develop` y `main`.** La autorización del dueño es desplegar en `develop`; eso exige manifiesto de alcance y `npm run qa:preqa:evidence`, y se pide aparte. `main` queda explícitamente fuera.
- **El instalador del portal.** `WorldClassToolkit` ya instala el portal web (`apps/web/app/manifest.ts`, `start_url: /dashboard`). Son dos apps distintas y no se fusionan.
- **Variables de entorno en Railway.** No se crea ninguna: el respaldo quemado en el código hace que la banda funcione sin configurar ambiente.
- **Código QR.** No se agrega dependencia de QR; en escritorio el puente al teléfono es copiar el enlace.
- **Sidebar, buscador y MobileNav.** La banda vive solo en el lobby; no se registra como función del centro de comandos porque no es una ruta nueva.

## 4. Restricciones

- Rama: solo `desarrollo`. Push permitido únicamente a `origin/desarrollo` al cierre (sección 11). Prohibido `develop`, `main`, force push, merge, deploy, migración remota y cambios en Railway/Supabase sin autorización explícita.
- Aislamiento multi-tenant y RBAC intactos: la banda no consulta datos ni depende de `active_modules`.
- Sin secretos ni credenciales en el brief ni en el diff.
- Solo tokens del design system; el diálogo pasa por `ModalFrame` y el enlace usa `buttonClasses`, sin cadenas de estilo copiadas.
- No se toca el hero: sigue sin botones y sin la clase `apex-lobby-cta-` en `app/dashboard/page.tsx` (contrato de la ronda V4).

## 5. Criterios de aceptación

1. `node --test apps/web/test/mobile-app-install.test.mjs` → verde, y el control de contraste del propio archivo se pone rojo si la detección o el barrido se rompen.
2. `npm --workspace apps/web run lint` → 0 errores; `npm --workspace apps/web run typecheck` → 0 errores.
3. `npm run certify:app-install:local` → veredicto completo con evidencia en `docs/qa/evidence/app-install-lobby-20261124/`.
4. En viewport de teléfono, el lobby muestra «Descarga nuestra app»; al tocarla se abre la mini-guía con los pasos que nombran Chrome, los tres puntos, Instalar app y Crear acceso directo, y un enlace a `https://appapexos-production.up.railway.app` que abre en pestaña nueva con `rel="noopener"`.
5. En viewport de escritorio, la misma guía muestra «es exclusiva para celulares», el botón «Copiar enlace» y el enlace a la app **no** figura como acción primaria.
6. La banda se ve aunque el tenant no tenga módulos habilitados (lobby con el estado vacío).
7. Los dos temas (claro y oscuro) pintan la banda y el diálogo sin texto ilegible; cero `window.alert/confirm/prompt` en todo el flujo.

## 6. Evidencia y certificación exigida

- Pruebas: `apps/web/test/mobile-app-install.test.mjs`, suites heredadas del lobby (`operational-home-redesign.test.mjs`, `lobby-greeting.test.mjs`, `module-portfolio.test.mjs`) y `technical-alert-silence.test.mjs`.
- Certificación: `npm run certify:app-install:local` (`scripts/certifications/mobile-app-install-browser-local.js`) con evidencia en `docs/qa/evidence/app-install-lobby-20261124/`.
- `certification_status` esperado: `local_passed_qa_pending`.

## 7. Capacidades protegidas

- **Lobby V4 intacto** — las tres suites del lobby siguen verdes sin modificar sus aserciones.
- **Silencio de fallos técnicos** — `technical-alert-silence.test.mjs` sigue afirmando cero ventanillas; el copiado al portapapeles reporta en el propio diálogo.
- **Enlace externo seguro** — `target="_blank"` con `rel="noopener noreferrer"` y URL https fija; se certifica el atributo servido, no solo el fuente.
- **Sin dependencia nueva** — `package.json` solo gana un script; se verifica que `npm ci` no pida paquetes extra.

## 8. Riesgos y rollback

- Riesgo: la URL quemada apunta al servicio de la app que hoy está configurado con `environment: QA` → Mitigación: se declara al dueño y queda el override `NEXT_PUBLIC_MOBILE_APP_URL` listo; no se cambia ningún ambiente sin autorización → Rollback: revert del commit.
- Riesgo: la detección de dispositivo clasifica mal una tablet → Mitigación: la rama de escritorio nunca es un callejón (entrega el enlace); la regla de detección está fijada por prueba en las cuatro familias.
- Riesgo: una banda promocional sature el lobby, que el dueño ya rechazó otras veces → Mitigación: una sola fila compacta, sin imagen, sin animación y fuera del hero.

## 9. Supuestos y preguntas abiertas

- Supuesto: «la app» es `APEXOS Web Móvil` del repo `AppApexos`, no el portal web instalable que ya ofrece `WorldClassToolkit`.
- Supuesto: el mismo enlace aplica en QA y Producción, porque la app es un servicio único.
- Pregunta para el dueño: ¿la app publicada en `appapexos-production` debe seguir leyendo el ambiente QA o hay una instancia de producción que deba ser el destino? Cambia el valor quemado, no el código.

## 10. Autorizaciones requeridas

- [x] Trabajar en `desarrollo` y empujar a `origin/desarrollo` (autorización permanente acotada de AGENTS.md).
- [x] Promoción `desarrollo -> develop`: autorizada por el dueño el 2026-11-25 («extiende solo el cambio del boton hacia develop»), corrida con manifiesto de alcance v2 y `npm run qa:preqa:evidence` en verde. Cerrada en `95bf7d5d`; ver sección 13. El botón viaja solo: `main` no se tocó.
- [ ] Ninguna autorización para `main`, Railway, Supabase ni despliegues.

## 11. Documentación, agentes y publicación (obligatoria)

- **Preflight de agentes**: `npm run agents:preflight -- --paths "apps/web/**"` → veredicto `OK`; agentes requeridos `apexos-frontend`, `apexos-qa`, `equipo-apexos`.
- **Agentes consultados**: `apexos-frontend`, `apexos-qa`, `equipo-apexos`.
- **Documentación a actualizar**: `docs/briefs/2026-11-24-boton-app-movil-lobby.md`, `docs/project/app-movil.md`, `docs/design/APEXOS_COMPONENT_CATALOG.md`, `docs/qa/evidence/app-install-lobby-20261124/`.
- **Agentes a actualizar**: `apexos-frontend` `2.46.0` → `2.47.0`; `apexos-qa` `2.121.0` → `2.122.0`; `apexos-brief` `2.99.1` → `2.100.0` (lo exige `agents:coverage`: el brief es ruta con dueño y su dominio también cambió —un destino que vive en otro repositorio se declara fuera de alcance con evidencia—). Controles nuevos: la banda del lobby resuelve su rama por dispositivo, la certificación se corre por viewport y tema, y el arnés lee el copy de la librería.
- **Registro**: `agents/registry.json` actualizado (`version`, `updated_at`, `sha256`) y entrada en `agents/CHANGELOG.md`.
- **Cobertura de contexto**: `npm run agents:coverage -- --paths "<las rutas exactas del corte>"`.
- **Secuencia de cierre**: `npm run agents:sync` → `npm run agents:check` → `npm run agents:preflight` → `npm run agents:coverage -- --paths ...` → pruebas de la sección 5 → commit.
- **Publicación obligatoria**: `git push origin desarrollo`. No cubre `develop`, `main`, force push, merges, migraciones remotas ni infraestructura.
- [ ] Preflight sin `INTEGRAR_REMOTO` ni `CONFLICTO`
- [ ] Cobertura de contexto en verde (`agents:coverage`)
- [ ] Sin secretos, credenciales ni artefactos locales en el diff
- [ ] Documentación y agentes actualizados en el mismo commit

## 12. Cierre medido (2026-11-24)

- **Prueba de contrato**: `node --experimental-strip-types --no-warnings --test apps/web/test/mobile-app-install.test.mjs` → **11/11**.
- **Certificación en navegador real**: `npm run certify:app-install:local` → **111/111**, 0 rojos. Artefacto de producción servido por `next start` (`BUILD_ID KVLBjDje71LMIGoeczYpz`, `git_head aa428b8a`), cinco escenarios (móvil claro, móvil oscuro, escritorio claro, escritorio oscuro, móvil sin módulos), diez capturas (guía abierta + lobby con la banda a la vista) y el destino externo sondeado vivo: **200** con título «APEXOS Web Móvil».
- **Controles de mutación, vistos en rojo y revertidos**: forzar el enlace de la app en el pie del escritorio encendió **9** chequeos (entre ellos `cero_enlaces_a_la_app_en_el_documento` y las dos patas del copiado); colgar la banda dentro de la rama de módulos encendió `el_lobby_vacio_conserva_la_banda` y toda la pata móvil del escenario sin módulos. La corrida con las dos mutaciones quedó **85/109 con 24 rojos**.
- **Suite web completa**: **905 pruebas, 900 pasan, 5 fallan**. Las cinco son preexistentes y de otros frentes —`accounting-pyg-interactive` (ruta `/dashboard/contabilidad/pyg/ampliado` sin registro en la paleta), `transport-master-access`, `transport-vehicle-master-catalogs`, `command-palette-module-functions`, `hr-offline-marking` (literal de `shouldBlockHrWriteFallback`)—; la prueba de que no las causó esta intervención es que ninguno de esos archivos de prueba lee ninguna de las rutas tocadas.
- **Gobernanza**: `agents:sync` y `agents:check` verdes (11 agentes, 11 documentos), `agents:preflight` → `OK_CON_ADVERTENCIAS` (la única advertencia es que `docs/project/**` no tiene dueño asignado en la tabla de ruteo), `agents:coverage -- --paths "<15 rutas exactas>"` → **OK**, `test:agents` **46/46**, `npm run lint` **0 errores / 24 avisos** (línea base sin cambios), `typecheck` limpio.
- **Correcciones propias durante el corte**: el primer chequeo del copiado exigía «enlace copiado» si el permiso estaba concedido, y en Chrome headless el permiso se concede pero el `writeText` rechaza igual —se reescribió en dos patas (honestidad con el portapapeles real + afirmación con un portapapeles grabador)—; el censo de consola no llevaba URL y se cayó con un 404 sin nombre —ahora solo perdona `/favicon.ico`, que el portal no sirve—; el control «el banner del lobby decodifica» daba falso negativo en tres de cinco escenarios porque muestreaba con la imagen en vuelo —se puso espera con límite y los `ERR_ABORTED` por navegación se registran aparte—. También se revirtió el volteo que mi propio build de producción hizo en `apps/web/next-env.d.ts` (apuntaba a `.next/types` en vez del `.next-dev` commiteado): no forma parte de esta intervención.
- **Publicación**: `5e39dd52` en `desarrollo`, empujado a `origin/desarrollo` en fast-forward sobre `aa428b8a`. El commit lleva 28 rutas: las 15 del inventario más las 11 de evidencia (los `.log` los excluye `.gitignore`). De `package.json` se empalmó solo la línea `certify:app-install:local`: las tres líneas `certify:hr-monitor-single-statement:*` que estaban en el archivo pertenecen a otro frente y quedaron sin commitear.
- **Qué no se hizo**: no se tocó `develop` ni `main`; no se desplegó; no se modificó `AppApexos` ni su compuerta de escritorio; no se creó ruta nueva ni entrada en la paleta de comandos; no se añadió dependencia de QR; no se declaró ninguna variable en Railway.
- **Pendientes con dueño**:
  1. Decidir si el botón debe apuntar a una instancia de la app que lea datos de producción —la enlazada hoy se autodeclara `environment: QA`— (dueño + `apexos-backend`). Es una variable de build o el valor quemado, no un cambio de lógica.
  2. Promoción `desarrollo -> develop` con manifiesto de alcance v2 y `npm run qa:preqa:evidence` (`apexos-git-guardian` + `apexos-qa` + dueño).
  3. Repetir la guía en el navegador desplegado de QA una vez exista ese despliegue (dueño).

## 13. Promoción a `develop` cerrada (2026-11-25)

- **Orden del dueño**: «porfavor extiende solo el cambio del boton hacia develop» (2026-11-25). Solo el botón y su guía; `main` queda intacto.
- **Transporte**: `replay_puntual`, no merge. Medido antes de decidir: `origin/develop` tenía **138** commits propios y un merge barrería más de **1.000** rutas ajenas. El candidato se armó sobre `c0fbb4b9` en el worktree `apexos-cand-boton-app-develop-20261125` (rama auxiliar `codex/qa-boton-app-movil-develop-20261125`).
- **Inventario**: **26** rutas exactas (**1 M** + **25 A**), **0** borrados, **0** excepciones de origen. El manifiesto es `docs/qa/manifests/boton-app-movil-lobby-develop-20261125-scope.json` y su gemelo pre-QA `...-preqa.json`.
- **Compuertas, las tres verdes**: `ALCANCE DE PROMOCION VALIDO: boton-app-movil-lobby-develop-20261125 (26 rutas, transporte puntual: cada blob verificado contra origin/desarrollo)`; `AUTORIZACION PRE-QA VALIDA: boton-app-movil-lobby-develop-20261125`; `git-governance-guard.js promote desarrollo-to-develop` callado con código de salida **0** sobre un worktree limpio.
- **Un rojo que era del instrumento, no del candidato**: la primera corrida del portón de alcance se hizo dentro del árbol del candidato y salió «ni el candidato ni el destino contienen el commit funcional certificado». Causa medida: `develop` trae un `validate-promotion-scope.js` de **113** líneas (blob `a98fc805`) que aún no sabe leer `transport: replay_puntual`; la versión canónica de `desarrollo` tiene **222** líneas (blob `7d0b5dfa`). Se re-corró la misma compuerta con el instrumento de la rama donde nació el cambio, apuntando al candidato por sha. No se aflojó el candado ni se tocó una ruta del candidato para complacerlo. Los otros dos instrumentos sí son idénticos en las dos ramas (`fde6dae3` y `21aae5c1`).
- **Medido dentro del árbol del destino**: prueba de contrato del botón **11/11** y las cuatro suites del lobby que ya vivían en `develop` **35/35**, 0 fallos. Los invariantes del replay con el instrumento del repo: **18/18** carry, 0 edit por hunks, y su control de mutación verde con **3** derivas que ponen rojo.
- **Publicación**: fast-forward `c0fbb4b9..95bf7d5d` en `origin/develop`, verificado con `--dry-run` antes (sin signo `+`, o sea no forzado). Dos commits: `b28fabf0` (aplicación, 18 rutas) y `95bf7d5d` (portón, 8 rutas). En `desarrollo` quedó `9e9052ea` con las mismas 8 rutas espejadas, porque el candado compara cada blob contra `origin/desarrollo` vivo.
- **Paridad después del empuje**: **26** rutas publicadas, **0** blobs distintos entre `origin/develop` y `origin/desarrollo`.
- **Señal de despliegue en QA**: el lobby servido en `apexos-web-qa-production` ya trae el botón —el chunk `2i5x12au5xr0p.js` del `/dashboard` contiene literalmente «Descarga nuestra app», «Crear acceso directo» y `appapexos-production.up.railway.app`—; en la raíz `/` no aparece, que es lo diseñado. Esto prueba el artefacto, no reemplaza la corrida de los 111 controles contra QA.
- **Qué no subió, medido**: `package.json` (164 líneas en `desarrollo` contra 139 en `develop`, con tres líneas ajenas en el medio) —el instrumento se corre por `node` directo y el alias queda pendiente—; `docs/design/APEXOS_COMPONENT_CATALOG.md` (no existe en `develop`); el canon de agentes completo (cinco agentes más nuevos en `desarrollo`); `apps/control-tower/**` (no promociona por regla de repositorio). Todo declarado como deriva en el manifiesto, no callado.
- **Pendientes con dueño**:
  1. Correr el instrumento de navegador (111 controles) contra el lobby de QA ya desplegado y versionar el DESPUÉS (`apexos-qa`).
  2. Alinear el canon de agentes de `develop` con `desarrollo` en una intervención aparte (`equipo-apexos` + `apexos-git-guardian`).
  3. Decidir si el enlace debe apuntar a una instancia de la app que lea producción (dueño + `apexos-backend`).
  4. Orden expresa para borrar la rama auxiliar `codex/qa-boton-app-movil-develop-20261125` y su worktree (`apexos-git-guardian`).

## 14. Secuela: la oferta se muda al inicio de sesión (2026-11-25)

- **Orden del dueño**: «lo pusiste en donde no era: el botón está bien, pero va en el inicio de sesión, no cuando se inicia sesión» (2026-11-25, con dos capturas: la banda al pie del tablero y la pantalla de acceso). El botón, la guía y el copy no cambian; cambia **dónde se monta** y, con eso, a quién llega.
- **Por qué el tablero era el sitio equivocado**: al tablero se entra con sesión y empresa habilitada. Quien necesita instalar la app es justamente quien aún no la tiene: en un celular nuevo, la primera pantalla del producto es el acceso. Montada en el lobby, la oferta solo era visible para el usuario que ya resolvió entrar por otro lado.

### Inventario exacto de la secuela

| Estado | Ruta | Qué hace |
|---|---|---|
| `M` | `apps/web/app/login/page.tsx` | nueva columna fija `apex-login-panel-stack` (`mx-auto w-full max-w-md`) que envuelve formulario y banda; la banda entra con `<div className="apex-login-app-install mt-8">` **después** de `</form>`; el `max-w-md` pasa del `<form>` a la columna |
| `M` | `apps/web/app/dashboard/page.tsx` | se retiran el `import` y el montaje de la banda (3 líneas) |
| `R`+`M` | `apps/web/components/lobby/AppInstallBand.tsx` → `apps/web/components/system/AppInstallBand.tsx` | `git mv` fuera del apellido `lobby`, que mentía tras la mudanza; el directorio `components/lobby/` desaparece; diseño apilado: `p-4` fijo, `flex-col` sin `sm:flex-row`, botón `w-full` sin `sm:w-auto` |
| `M` | `apps/web/test/mobile-app-install.test.mjs` | contrato re-anclado: lee acceso, tablero y banda; **11 → 13** pruebas |
| `M` | `scripts/certifications/mobile-app-install-browser-local.js` | arnés re-anclado a la pantalla de acceso, con puerta de hidratación y pasada de ausencia en el tablero |
| `M` | `docs/project/app-movil.md` | título, montaje, tabla de instrumentos y ruta de evidencia |
| `M` | `docs/design/APEXOS_COMPONENT_CATALOG.md` | la fila «diálogo que bifurca por dispositivo» apunta a `components/system/` y describe la columna del acceso |
| `A` | `docs/qa/evidence/app-install-acceso-20261125/**` | certificación verde (1 JSON, 9 PNG) |
| `A` | `docs/qa/evidence/app-install-acceso-20261125-mutaciones/certification.json` | control de mutación (1 JSON; las capturas se borran, el rojo es numérico) |
| `M` | `agents/**` y `.qoder/skills/**` | `apexos-frontend`, `apexos-qa`, `apexos-brief`, `equipo-apexos` y `agents/CHANGELOG.md` |

### Medición

- **Prueba de contrato**: **13/13** (`node --experimental-strip-types --no-warnings --test apps/web/test/mobile-app-install.test.mjs`). Tres pruebas nuevas y una reescrita: la pantalla de acceso monta la banda **una sola vez y después del `</form>`** (con control de contraste que exige que el acceso sí la monte); el tablero tiene **cero** menciones de `AppInstallBand` y cero de la librería; la banda se apila (prohibido `sm:flex-row`, `sm:w-auto`, `sm:p-5`) y su acción primaria sale de `buttonClasses("primary","touch","w-full")`; el contrato heredado del tablero sigue leyéndose sobre la variable correcta.
- **Certificación en navegador real**: `npm run certify:app-install:local` → **126/126**, 0 rojos. Artefacto de producción servido por `next start` (`BUILD_ID R-dJE_2uSjVBDXuUGfcyo`, `git_head b802a251`), **cuatro** escenarios (móvil claro/oscuro, escritorio claro/oscuro), nueve capturas (guía abierta, banda a la vista y `tablero-sin-banda.png`) y el destino externo vivo: **200** con título «APEXOS Web Móvil».
- **Lo nuevo que se jura, y no se juraba**: la banda está visible **sin sesión** (`tiene_token: false`, campos vacíos, formulario pintado); el botón es `type="button"` y **no** está dentro del `<form>` (medido con `closest("form")`, no por el fuente); pulsarlo no manda nada a `/auth/login` —censo de peticiones del arnés: **0** envíos—, la URL sigue en `/login` y no aparece token; en móvil (390 px) la banda cabe en la columna sin desbordar (**308 px** de botón, **0 px** de desborde horizontal) y en escritorio (**294 px**); el acceso sigue pintado detrás de la guía; y el **tablero con sesión y seis módulos servidos no ofrece la banda ni enlaza a la app** (`banda: false`, `#app-install-title`: **0** nodos, enlaces: **0**).
- **La trampa que este corte destapa**: `/login` es una ruta **estática** (`○ /login`), así que la banda llega escrita en el HTML antes de que React enganche sus oyentes. El arnés antiguo llegaba al lobby pasando antes por el acceso, y ese viaje extra calentaba los *chunks*; montada la banda en el propio acceso, el primer clic caía sobre una página todavía sorda. La primera corrida salió **96/122 con 26 rojos**, todos en los dos escenarios móviles, y el rojo acusaba al producto («la guía no abre») de un problema del instrumento. Se verificó con una sonda aparte: en el mismo viewport móvil, esperando 4 s, la guía **sí** monta (diálogo de 448 px con sus cuatro pasos). La puerta no es un sueño: el arnés pulsa el revelador de contraseña del propio formulario y lee el `type` del campo —si no cambia, la página no hidrató y el escenario se declara rojo con esa causa—, devuelve el campo a `password` y solo entonces pulsa la banda. Medido: hidratación entre **449 ms** y **582 ms** por escenario.
- **Control de mutación, visto en rojo y revertido**: sobre un build aparte (`BUILD_ID 5IPZ7QZH2NbmEAVtEtjg0`) se metieron a propósito los dos defectos que la secuela quiere impedir —re-montar la banda en el tablero y colgarla dentro del `<form>`— y la corrida salió **121/126 con 5 rojos** exactamente los esperados: `el_tablero_no_ofrece_la_banda` (`{"banda":true,"nodos":1}`) y `la_banda_fuera_del_formulario` en los cuatro escenarios (`{"dentro":true}`). Sin ese control, los dos assert nuevos serían verdes por ceguera. La evidencia quedó en `docs/qa/evidence/app-install-acceso-20261125-mutaciones/certification.json`.
- **Suite web completa**: **907 pruebas, 902 pasan, 5 fallan** —los mismos cinco preexistentes de la sección 12 (`editor de presupuesto`, `registro de funciones del dashboard`, `escrituras self-service de HR`, `falta de HR no bloquea flota`, `ficha enlaza sucursal`)—, ninguno lee las rutas tocadas. Nota de procedimiento: la suite hay que correrla **desde `apps/web`**; desde el raíz del repo sube a 9 rojos porque `ibc-nomina-ui.test.mjs` y `public-service-requests-security.test.mjs` resuelven sus fuentes con `process.cwd()` y no con el directorio del archivo.
- **Gobernanza**: `agents:preflight` ruteó la secuela a `apexos-frontend`, `apexos-qa`, `apexos-brief` y `equipo-apexos` (los cuatro avanzan en este mismo commit); `agents:sync`, `agents:check`, `agents:preflight` y `agents:coverage -- --paths` verdes; `test:agents` **46/46**; `typecheck` del workspace sin errores; `next build` exitoso y `next-env.d.ts` devuelto a su estado commiteado (el build lo voltea, no forma parte de la intervención).
- **Qué no se hizo**: no se tocó `develop` ni `main`; no se desplegó; no se cambió el copy ni la URL ni la lógica de detección de dispositivo; no se borró la evidencia anterior (`app-install-lobby-20261124` queda como registro de lo que se retiró).
- **Consecuencia sobre la promoción del §13**: `origin/develop` recibió la montura vieja —la banda dentro del tablero— y **no** tiene esta corrección. `main` nunca tuvo la banda, así que producción sigue limpia. Llevar la secuela a `develop` requiere autorización nueva del dueño con su propio manifiesto; este cierre solo publica `desarrollo`.
- **Pendientes con dueño**:
  1. Autorizar (o no) que la corrección de montura viaje a `develop`, que hoy sirve el botón en el lobby (`dueño` + `apexos-git-guardian`).
  2. Correr el instrumento de navegador contra el acceso de QA desplegado y versionar el DESPUÉS (`apexos-qa`).
  3. Decidir si el enlace debe apuntar a una instancia de la app que lea producción (dueño + `apexos-backend`).
  4. Orden expresa para borrar la rama auxiliar `codex/qa-boton-app-movil-develop-20261125` y su worktree (`apexos-git-guardian`).
