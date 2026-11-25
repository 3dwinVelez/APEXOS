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
- [ ] Promoción `desarrollo -> develop`: requiere manifiesto de alcance y `npm run qa:preqa:evidence`. El dueño ya dijo que el destino es `develop`, pero la compuerta se corre aparte y con evidencia.
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
- **Qué no se hizo**: no se tocó `develop` ni `main`; no se desplegó; no se modificó `AppApexos` ni su compuerta de escritorio; no se creó ruta nueva ni entrada en la paleta de comandos; no se añadió dependencia de QR; no se declaró ninguna variable en Railway.
- **Pendientes con dueño**:
  1. Decidir si el botón debe apuntar a una instancia de la app que lea datos de producción —la enlazada hoy se autodeclara `environment: QA`— (dueño + `apexos-backend`). Es una variable de build o el valor quemado, no un cambio de lógica.
  2. Promoción `desarrollo -> develop` con manifiesto de alcance v2 y `npm run qa:preqa:evidence` (`apexos-git-guardian` + `apexos-qa` + dueño).
  3. Repetir la guía en el navegador desplegado de QA una vez exista ese despliegue (dueño).
