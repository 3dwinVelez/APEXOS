# Brief — Retrointegración del módulo de Talento Humano desde develop

- **ID**: `2026-11-27-hr-retrointegracion-ramas`
- **Fecha**: `2026-11-27`
- **Rama activa**: `desarrollo` (punta `536c72bb`, igual a `origin/desarrollo` al abrir el preflight)
- **Prompt crudo**: "veo que no todos los cambios fueron migrados hacia talento humano desde develop, faltan funciones, campos entre otras herramientas ?" · "ten en cuenta dejar para produccion provicionalmente la aplicacion de maracion mediante la web los demas cambios deben migrar de manera completa y sana" · "verfica todo al finalziar debe quedar todo respaldado y funcionando de manera correcta sin elminar de produccion la aplicaicon de marcacion lo demas debe quedar alineado en todos los ambientes"

## 1. Objetivo

Dejar a `desarrollo` con el mismo Talento Humano que ya sirve `develop` (bancos, liquidación de retiro, revisión por día, ajustes manuales, nómina rediseñada, reportes con columnas de tiempo) **sin perder ninguna capacidad certificada que solo vive en `desarrollo`**, y sin tocar un registro de cliente. La pantalla de marcación web sigue existiendo y sigue accesible desde el hub.

## 2. Alcance exacto

106 rutas contra la baseline `536c72bb`: 74 altas, 32 modificaciones, +5.613 −728. El inventario ruta por ruta está en `docs/qa/evidence/hr-alineacion-20261127/divergencias.txt` y en `paridad.json`. Frente por frente:

| Estado | Frente | Qué cambia |
|---|---|---|
| `A` | `apps/api/src/modules/hr/banks.js`, `davivienda-file.js`, `payrollReceiptPdf.js`, `payrollPeriod.js`, `dayReview.js`, `termination*.js` (4), `contractFoundationRepair.js`, `contractCalendarDate.js`, `accumulatedOrdinaryTime.js`, `adjustmentCalendarConcept.js` | Maestro de bancos, archivo Davivienda, PDF de desprendible, periodos, revisión por día, liquidación de retiro y tiempo ordinario acumulado |
| `M` | `apps/api/src/modules/hr/{routes,schema,service}.js` | Registro de endpoints y esquemas de los módulos anteriores |
| `A` | `apps/web/app/dashboard/talento-humano/bancos/page.tsx`, `nomina/payroll.module.css`, `components/hr/{HrWorkspace,TerminationDayReviews,TerminationManualAdjustments}.tsx` + 2 css | Pantalla de bancos y el rediseño de nómina y retiro |
| `M` | `apps/web/app/dashboard/talento-humano/{aportes-sociales,configuracion-laboral,libranzas,liquidacion-trabajador,nomina,prestaciones-pagos,provisiones}/page.tsx` | Columnas, catálogos y flujos del rediseño |
| `M` | `apps/web/app/dashboard/talento-humano/page.tsx` | Hub fusionado: entra **Maestro de bancos**, `Horarios y mallas` apunta a `/rutas` y **Marcaciones sigue visible** |
| `M` | `apps/web/app/dashboard/talento-humano/reportes/page.tsx` | Fusiona: columnas de tiempo de develop + frente de corrección administrativa y degradación de evidencia de desarrollo |
| `M` | `apps/web/app/dashboard/talento-humano/empleados/page.tsx` | Blob de develop + recupera el cierre de vigencia en línea y el panel biométrico de dos clics |
| `M` | `apps/web/app/dashboard/talento-humano/marcacion/page.tsx` | Se queda la versión de desarrollo (tolerancia de foto) + el selfie ligado al paso de develop |
| `M` | `apps/web/app/dashboard/talento-humano/mapa/page.tsx` | Blob de develop sin la línea que pintaba la evidencia en base64 dentro del detalle |
| `M` | `apps/web/lib/{hrAttendanceState,hrTimeReport,payroll-period,payrollDisplay,hrScheduleMonitor,moduleFunctions,reportExports}.ts` | Librerías del rediseño y catálogo de funciones del módulo |
| `A`/`M` | `apps/api/test/hr-*.test.js` (11), `apps/web/test/hr-*.test.mjs` (11), `scripts/certifications/hr-*-local.js` (14), `docs/qa/certifications/hr-*.md` (15) | Pruebas e instrumentos del trabajo de develop |
| `M` | `apps/web/components/shell/MobileNav.tsx` | Vuelve a la versión de producción: cinco casillas y la de Marcar sigue |

### Módulos (`change_intent.modules`)

- `talento-humano`
- `plataforma-shell`

### Borrados autorizados (`allowed_deletions`)

- ninguno. Ninguna ruta del árbol integrado elimina un archivo: las 728 supresiones son líneas dentro de rutas modificadas, auditadas una por una.

## 3. Fuera de alcance

- Promociones. Esto solo toca `desarrollo`; `develop` y `main` no se mueven aquí.
- Migraciones en la nube, Railway, Supabase, secretos ni infraestructura.
- El frente biométrico (WebAuthn, rostros, dispositivos) no se lleva a Producción en esta intervención: son 14 endpoints y 3 tablas que exigen migración autorizada.
- Las ventanillas nativas que ya existían (sección 9).
- `apps/control-tower/**`.

## 4. Restricciones

- Rama: solo `desarrollo`. Push permitido únicamente a `origin/desarrollo` al cierre (sección 11). Prohibido `develop`, `main`, force push, merge, deploy, migración remota y cambios en Railway/Supabase sin autorización explícita.
- Aislamiento multi-tenant y RBAC intactos: no se tocó `apps/api/prisma/**` ni una sola escritura de cliente.
- Sin secretos ni credenciales en el brief ni en el diff.
- **No aplicar los borrados de develop**: `develop` elimina 155 rutas de módulos que viven legítimamente solo en `desarrollo`. Por eso la retrointegración se hizo por blob y por ruta, nunca con `merge`.

## 5. Criterios de aceptación

1. `node --test apps/web/test/*.test.mjs` → 948 pruebas, 943 pasan; los 5 rojos son los mismos que ya caen en la baseline prístina y pertenecen a Servicios/Contable.
2. `node --test apps/api/test/hr-*.test.js` → 413 pruebas, 409 pasan; los 4 rojos son los mismos nombres que caen en la baseline (361/357), con 52 pruebas de API más que `desarrollo` traía.
3. `tsc --noEmit` en `apps/web` → salida 0.
4. Comparación por blob contra `origin/develop` en las 169 rutas del módulo → 158 idénticas y 11 divergentes, cada divergencia explicada y aditiva.
5. `grep` de `window.alert|window.confirm|window.prompt` en `empleados/page.tsx` → cero coincidencias, y el control biométrico se pone rojo si se reintroduce.
6. El hub de Talento Humano sigue listando `Marcaciones` (`/dashboard/talento-humano/marcacion`) y la navegación móvil conserva su casilla.

## 6. Evidencia y certificación exigida

- Artefacto: `docs/qa/evidence/hr-alineacion-20261127/paridad.json` con `divergencias.txt`, `rojos-web.txt`, `rojos-api.txt`, `rojos-api-base.txt`.
- Certificación escrita: `docs/qa/certifications/hr-retrointegracion-20261127.md`.
- `certification_status` esperado: `local_passed_qa_pending`. Sin corrida de navegador contra ambiente desplegado no se puede proponer promoción.

## 7. Capacidades protegidas

- **Corrección administrativa de marcación desde Reportes** — sobrevive fusionada; `test/hr-marking-correction.test.mjs` en verde.
- **Degradación de evidencia fotográfica** (la foto en formato ilegible no cuesta la jornada) — queda en Reportes y en Marcación; `hr-marking-lateness-selfie.test.mjs` con control de mutación.
- **Compuerta de escrituras self-service contra el respaldo Supabase** — `hr-offline-marking.test.mjs` punto D, puesto al día sin aflojar el control.
- **Marcación web** — enlace del hub, casilla móvil y pantalla intactos.
- **Enmudecimiento de ventanas técnicas en Empleados** — recuperado del revert de develop.

## 8. Riesgos y rollback

- Riesgo: fusionar a mano una pantalla de 1.300 líneas → Mitigación: el puerto es aditivo (170 inserciones, 4 líneas reescritas) y se audito una por una las lineas quitadas. Rollback: `git revert` del commit de integración en `desarrollo`, nunca snapshot antiguo.
- Riesgo: creer que `desarrollo` ya tenía todo → Medido: 4 frentes certificados estaban revertidos en `develop` y llegaron aquí; se documentan en la certificación.
- Riesgo: marcar esto como listo para Producción → No lo está: falta la corrida de navegador y el manifiesto de alcance contra la punta de `develop`.

## 9. Supuestos y preguntas abiertas

- Supuesto: "alineado en todos los ambientes" se cumple llevando el trabajo de `develop` a `desarrollo` primero; la promoción sigue necesitando autorización expresa.
- Hallazgo: `develop` —y por tanto Producción— corre código revertido de trabajos certificados: telemetría y clasificación de fallos del cliente, identidad de instalación, la línea de evidencia en base64 del mapa y dos ventanillas nativas en Empleados. Tres de los cuatro quedan corregidos en `desarrollo` con esta intervención; la declaración pública va en la certificación.
- Pendiente: 7 `confirm(` sin prefijo en nomina, rostros, liquidación, dispositivos y aportes — preexistentes en las dos ramas, con su propio brief.

## 10. Autorizaciones requeridas

- Ninguna adicional para cerrar `desarrollo` (el push acotado ya está concedido en AGENTS.md).
- Para `desarrollo -> develop` y `develop -> main`: autorización expresa + manifiesto de alcance `scope_schema_version: 2` + `qa:promotion:scope` + `qa:preqa:evidence` / `qa:approval:evidence`.
- Para el frente biométrico en Producción: autorización de migración remota de `hr_face_enrollments`, `hr_shared_devices`, `hr_webauthn_credentials`.

## 11. Documentación, agentes y publicación (obligatoria)

- Agentes dueños según `agents:preflight`: `equipo-apexos`, `apexos-backend`, `apexos-seguridad`, `apexos-frontend`, `apexos-qa`.
- Control nuevo versionado: la paridad de un módulo entre ramas se demuestra **por blob y por línea sin réplica**, no por ancestría de commits; y una retrointegración que toma blobs de otra rama debe comparar identificadores exclusivos del destino antes de cerrar.
- Publicación: `git push origin desarrollo` al cierre, con suites y evidencia en verde.

## 12. Secuela 2 (2026-11-27): dos rutas se absorben en `desarrollo` para poder promocionar sin excepciones

La orden de "no dejar pendientes" obliga a cerrar la promoción con la forma más fuerte del candado. `scripts/validate-promotion-scope.js` no admite excepciones de origen cuando el transporte se declara `replay_puntual`: cada ruta del diff tiene que ser el blob que esa ruta tiene en `origin/desarrollo`. El censo por blob del frente dio **42** rutas divergentes entre las dos puntas; **40** son versiones anteriores del mismo edit local (subirlas no revierte nada) y **2** estaban realmente más adelante en `develop`:

| Ruta | Decisión | Prueba |
|---|---|---|
| `scripts/certifications/hr-punch-mobile-evidence-local.js` | sube el blob de `origin/develop` sin retoque (**152→246** líneas, `+104/−10`) | suma `f49d9561` idéntica en las dos ramas, `node --check` salida **0**; la pata de evidencia conserva `has_base64_data`/`punch_points` y gana la variante `splitIdentity` más **3** aserciones de permisos del lote (**401/404/403**) |
| `apps/web/test/command-palette-module-functions.test.mjs` | fusión manual: entran las patas de bancos y PYG ampliado; **no** entra la que exigía que la marcación web siguiera oculta | **10/10** con `node --test test/command-palette-module-functions.test.mjs` |

Por qué la paleta no puede tomar el blob del destino: asertar `byLabel.has("Registrar marcaciones") === false` (develop) y `=== "/dashboard/talento-humano/marcacion"` (desarrollo, orden del dueño del 2026-11-27) es la misma clave con la misma etiqueta; no hay fusión que deje vivas las dos.

Medición tras absorber: suite del portal **956/953/3** (los mismos **3** rojos atribuidos por ruta leída, fuera de este diff), `tsc` salida **0**, y corrida aislada del arnés fusionado en `desarrollo` (`.local/hr-punch-mobile-evidence/`, respaldo de la corrida anterior en `.local/BUENA-20261126/`). Detalle en `docs/qa/certifications/hr-retrointegracion-20261127.md` §8 y `docs/qa/evidence/hr-alineacion-20261127/absorcion-develop.json`.

Consecuencia para las manifiestos: `transport: "replay_puntual"`, `origin_waivers: []`, `replay_baseline: d667276f2f95a0abe27abd5d37cd883e35f2ad02`.

## 13. Secuela 3 (mismo día): la pantalla de marcación también estaba más adelante en `develop`

El censo del §12 se quedó en dos rutas porque comparaba **archivos del instrumentador**, no las pantallas. Repetido el censo por blob sobre **1 027** rutas de las áreas del módulo (**101** iguales, **749** solo en `desarrollo`, **86** distintas, **91** solo en `develop`; bajo `apps/`: **26** `M` y **0** borrados), una tercera ruta `M` llevaba contenido ajeno: `apps/web/app/dashboard/talento-humano/marcacion/page.tsx`.

`develop` trae allí el frente `6fd7c5a2` de sincronización entre dispositivos: la pantalla une los grupos de un mismo empleado con `attendancePunches`, revalida contra el servidor antes de escribir y mantiene **una** petición en vuelo. `desarrollo` tenía la librería (`apps/web/lib/hrAttendanceState.ts`, blob idéntico `70135b5b` en las dos ramas) **sin llamador**: la lectura de decisión tomaba un solo grupo y las marcaciones que el celular del camión ya había subido desaparecían de la web. No era un detalle de presentación: el operario marcaba dos veces la misma pierna.

Decisión: absorber en `desarrollo` (commit `542027c7`), no fusionar dentro del candidato. El candado de `scripts/validate-promotion-scope.js:113-161` con `replay_puntual` no admite excepciones de origen, así que cualquier costura hecha en el candidato lo deja rojo; y llevar el blob de `desarrollo` sin absorber habria revertido el frente de espacio de trabajo, que la orden del dueño prohíbe.

Criterios de aceptación que se añadieron por esta secuela:

- Contrato **que puede fallar**: `apps/web/test/hr-marking-cross-device.test.mjs`, **8** pruebas, **8/8 rojas** contra el blob previo a la fusión y **8/8 verdes** después. Sin control ANTES rojo el contrato no vale como evidencia.
- La revalidación cuesta **2** lecturas por marcaje, no **6**: el piso medido del pooler es ~**660 ms** por viaje y cada toque de marcación lo paga.
- El candidato **no introduce ningún rojo** respecto del árbol puro del destino: base `origin/develop a440560d` **915/898/17** contra candidato **964/948/16**, diferencia **0** rojos nuevos y **1** rojo apagado. Medido con el mismo corredor en los dos árboles y motivos normalizados (sin rutas absolutas del puesto).
- Contrato HR dentro del árbol del candidato: **236/236** en **32** archivos.
- Verificación estática del candidato (el worktree no trae `node_modules`, no hay `tsc`): **29** archivos de código, **63** especificaciones de import, **0** rotas; **8** módulos compartidos reemplazados pierden **0** exportaciones.
- Certificación de navegador en base descartable: **10/10** patas selladas con `542027c7`.

Inventario del candidato (72 rutas, **29** `A` + **43** `M`, **0** `D`): 22 de producto web HR, 11 de contratos de prueba, 7 instrumentos de certificación, 15 de documentación y 18 de canon del equipo (los dos espejos y `registry.json`, para que el registro no mienta contra los `SKILL.md` que sí suben). Cero rutas bajo `apps/api/`, `packages/`, `infra/` o `apps/control-tower/`.

Exclusiones deliberadas, cada una con su razón (un `M` de otro frente dentro de este replay sería un cambio encubierto de módulo):

| Ruta | Por qué no viaja |
|---|---|
| `apps/web/lib/moduleFunctions.ts` | su blob en `desarrollo` añade la entrada de paleta de **Facturas electrónicas**, cuya pantalla no existe en `develop`: el atajo quedaría roto en QA |
| `apps/web/lib/modules.ts`, `apps/web/lib/moduleAccess.ts`, `apps/web/test/module-portfolio.test.mjs` | frente apex-control / portafolio, no Talento Humano |
| `apps/web/next.config.ts` | su diferencia viene de `a401646c` (contabilidad de facturas recibidas), no de este frente; y el `frame-src` que abre el mapa es un token global → brief propio |
| `apps/web/test/command-palette-module-functions.test.mjs`, `technical-alert-silence.test.mjs` | contratos del atajo de paleta y del enmudecimiento, que viajan con sus propios frentes |
| `apps/api/**`, `apps/control-tower/**` | el API HR de `desarrollo` está más adelante pero no está certificado contra este candidato; la torre no se promociona |

Pendientes que esta sección no cierra: corrida de Chromium contra QA desplegado (tarea 15), promoción a `main` con aprobación funcional (tarea 16) y el `iframe` del GPS bloqueado por CSP, que requiere su propio brief por tocar un token global.

Detalle y artefactos en `docs/qa/certifications/hr-retrointegracion-20261127.md` §9 y `docs/qa/evidence/hr-alineacion-20261127/{absorcion-sincronia,candidato-develop}/`.


## 14. Secuela 4 (mismo dia): compuertas, control de mutacion y congelado del candidato

El inventario que sube es **79** rutas: **43** `M` + **36** `A`, **0** borrados (`allowed_deletions: []`), **0** rutas bajo `apps/api/`, `apps/control-tower/`, `packages/`, `infra/`, `lib/moduleFunctions.ts`, `lib/modules.ts`, `lib/moduleAccess.ts` y `next.config.ts`. Transporte declarado por ascendencia con `origin_waivers: []`, porque el contrato de CI del destino exige que el commit certificado sea ancestro del candidato y un replay nacido sobre la punta de `develop` no esta en `origin/desarrollo`; la paridad de blobs que daba el modo `replay_puntual` se sigue midiendo igual y sale **79/79**.

**Viajan dentro del candidato (los 2 manifiestos):** `docs/qa/manifests/hr-retrointegracion-develop-20261127-scope.json` y `...-preqa.json`, como commit de gobernanza encima del commit certificado. El contrato de CI del destino (`scripts/git-governance-guard.js:136-172`, activado por `.github/workflows/ci.yml:34-40` para todo PR `codex/qa-*`) los exige ahi y los exonera por nombre del inventario de producto. Y `:103-113` (`candidatePath`) verifica ademas que todo `script` y toda `evidence` citada por los manifiestos este versionada en el ref del candidato, asi que las **10** rutas de `docs/qa/evidence/hr-alineacion-20261127/candidato-develop/` entran **dentro** del commit certificado: `certified_functional_paths` pasa de **79** a **89** y el diff neto promocionado a **91** rutas (**89** + los **2** manifiestos). Lo que no viaja es lo que se sella a si mismo: la evidencia posterior al corte (corridas de QA desplegado y de produccion) queda en la contabilidad de la rama.

**No entra en el candidato, a proposito:** `docs/qa/evidence/hr-alineacion-20261127/candidato-develop/`, la evidencia que sella el SHA del candidato. Un artefacto marcado con el SHA N no puede estar en el arbol que produce el SHA N, y el porton humano se pasa por ruta de archivo. Consecuencia verificable: la lista de replay excluyo esa ruta y el diff neto quedo sin esas entradas.

**Criterio de no-regresion, expresado como resta con cifras:** suite del portal en el arbol **puro** de `origin/develop` **915/898/17** contra candidato **964/948/16** = **0** rojos nuevos y **1** rojo del destino apagado; contrato HR dentro del candidato **236/236**; **63** especificaciones de import de **29** archivos, **0** rotas; **8** modulos compartidos reemplazados pierden **0** exportaciones; porton de blobs **79/79** con su control de mutacion rojo (**1** de **79**, salida **1**). Instrumentos: `suite-base-origin-develop.json`, `suite-candidato.json`, `comparacion-antes-despues.json`, `contrato-hr-candidato.json`, `verificacion-estatica.json`, `paridad-rutas.json`, `control-de-mutacion-porton.json`, `paridad-superficie-certificada.json`.

**Pendientes que esta seccion no cierra (con dueño):** corrida de navegador dentro del arbol del candidato y certificacion funcional contra QA desplegado (`apexos-qa`); promocion `desarrollo -> develop` por rama auxiliar + PR (`apexos-git-guardian`); migraciones biometricas `20261121230000`, `20261122060000`, `20261122120000` en QA y Produccion y su despliegue (`apexos-db-nube`, autorizacion expresa del dueño); `develop -> main` con `qa:approval:evidence` (`apexos-qa`); y el brief propio del `frame-src` del mapa (`apexos-frontend`).


## 15. Secuela 5 (mismo dia): reparar la cuarta compuerta y recongelar el candidato
**Que se pidio y que se encontro.** La orden de no dejar pendientes exigia correr las cuatro compuertas del manifiesto. La cuarta, `node scripts/certifications/scoped-qa-governance-local.js`, estaba roja en `desarrollo` desde `21a99f47` (2026-11-24): sus fixtures sinteticos no creaban `refs/remotes/origin/desarrollo` y el porton de origen lo empezo a exigir tres dias antes. El rojo era del arnes, no del candidato.

**Alcance de esta seccion (A/M/D exacto).** `M scripts/certifications/scoped-qa-governance-local.js` (los dos fixtures provisionan el ref de origen, `expect()` afirma mensaje y se anade la negativa `scope_unoriginated_blob_rejected`), `A docs/qa/evidence/hr-alineacion-20261127/gobernanza-local.json` (corrida **22/22**), `M .qoder/skills/apexos-qa/SKILL.md` + su espejo `agents/apexos-qa/SKILL.md` y `agents/registry.json` (regla 160, **2.145.0 → 2.146.0**), `M agents/CHANGELOG.md`, `M docs/qa/certifications/hr-retrointegracion-20261127.md` (seccion 11) y este brief. **0** rutas bajo `apps/`, **0** borrados, **0** migraciones.

**Criterios de aceptacion, observables.** (1) El instrumento responde **22** patas verdes y codigo de salida **0**, con la negativa afirmando el texto `contenido sin origen en desarrollo`. (2) Las **89** rutas del inventario no cambian de tamaño ni de conteo `M`/`A` tras el bump: **43** `M` + **46** `A`, **0** `D`, **0** excepciones de origen. (3) `git diff --quiet <arbol medido>..<commit certificado> -- apps/` sale limpio, que es lo que autoriza a reutilizar la suite y la corrida de navegador medidas en el arbol anterior. (4) Las cuatro compuertas (`qa:promotion:scope`, `qa:preqa:evidence`, `ci-promotion` local y el instrumento de gobernanza) se vuelven a correr contra el candidato recongelado y las cuatro salen verdes.

**Lo que queda fuera, declarado.** El arreglo del arnes no entra en el inventario del frente de Talento Humano: `scripts/validate-promotion-scope.js` y el propio instrumento siguen en `desarrollo` y no bajan con este candidato. Su promocion es un frente de gobernanza con manifiesto propio (dueno: `apexos-git-guardian` con `apexos-qa`), y mientras no baje, `develop` conserva un par validador-instrumento que se autovalida sin candado de origen.

## 16. Secuela 6 (mismo dia): el frente retrointegrado se certifica contra el ambiente desplegado y los dos rojos resultan del arnes

**Que se medrio.** `develop` ya servia el frente en el portal (`3e7fabf5`, PR #119) y la API sirve `a440560d7f04`. Restaba la certificacion funcional contra lo desplegado, que es lo que la regla 155 del canon de QA exige antes de `develop -> main`. Dos instrumentos propios salieron rojos y **ninguno** era del producto.

**Rojo 1: la pantalla movil medida sobre un listado vacio.** `scripts/certifications/hr-schedule-timeline-qa.js` respondio **46/50** con cuatro patas de layout en 390 px. La pagina servida tiene el mismo blob en `081027de`, `a440560d` y `3e7fabf5` (`git rev-parse <ref>:apps/web/app/dashboard/talento-humano/rutas/page.tsx`, identico en los tres), asi que el rojo no podia venir del arbol promovido: `setViewport({isMobile:true})` recarga el documento, React reinicia el filtro a la fecha de hoy y QA no tiene jornadas de hoy. El censo de red lo confirma: el `fetch` posterior al recargo pide `date=2026-11-27` y devuelve **2 bytes**. Reparado el arnes, no la pantalla: `estabilizarTelefono()` re-fija la fecha hasta ver filas en la franja medida y la pata de denominador `en_390px_el_listado_trae_jornadas_de_la_fecha_medida` gobierna las **6** patas mobiles (`exigirTelefono`), porque una pata de layout sobre un listado vacio solo prueba que el vacio se ve ordenado. Dos piezas mas del arnes: el listener de `response` ahora lee `content-length` del objeto plano que entrega puppeteer-core y va envuelto en `try/catch` (un oyente que revienta tumbaba la corrida), y `page.off` queda protegido. Resultado **51/51**, evidencia sobrescrita en su propia carpeta `docs/qa/evidence/rediseno-horarios-mallas-20261126/qa-desplegado/`.

**Rojo 2: anclas y payloads que ya no existen.** `scripts/certifications/hr-paquete-main-qa.js` respondio **24/26**. Las dos piernas rotas eran de contrato desactualizado: (a) `paridad_blobs_hr` exigia el blob de `apps/api/src/modules/hr/webPunchSelfie.js`, ruta desmontada el 2026-11-24, y un archivo ausente en **los dos** arboles es un retiro verificado, no una divergencia; ademas el ancla `CANDIDATO_HR` venia fijada a `54cabeb3` (**8** dias viejo). (b) `punch_selfie_no_imagen_400` usaba payloads de **15** bytes que caen en el minimo (`EVIDENCIA_MINIMA`) y exigia `SELFIE_INVALIDA`, codigo que **no existe** en el codigo desde el contrato del 24-11 (medido: `grep -rn SELFIE_INVALIDA apps/api/src` devuelve **0**). Con tamano real, contra el API servido: PDF **120 KB** -> 400 `VALIDACION` motivo `EVIDENCIA_CLASE_RECHAZADA`; SVG **12 KB** -> 400 `VALIDACION` motivo `EVIDENCIA_TIPO_DECLARADO_RECHAZADO`; MP4 **60 KB** declarado JPEG -> 400 `EVIDENCIA_CLASE_RECHAZADA`; **2,5 MB** -> 400 por limite de cuerpo. Se agrego la pierna que faltaba para cerrar la promesa del mismo contrato: **60 KB** que declaran `image/jpeg` y no decodifican conservan la jornada (**200**, `identity_verification.status=photo_only`, `evidence_status=degraded`, `EVIDENCIA_NO_DECODIFICABLE`), es decir el formato ileible no borra una hora de trabajo. Resultado **27/27** con `commit_servido a440560d7f04`, paridad **11/11** por blob contra el candidato `3e7fabf5` y `script_sha256 2d080496781e`.

**Error propio declarado (capa de evidencia, no de producto).** La primera corrida del paquete escribio sobre `docs/qa/evidence/hr-paquete-main-20261123/qa-campo-escritura.json`, que esta citado en el manifiesto de `main`. Se respaldo la corrida propia en `.tmp/hr-align-20261127/paquete-qa-clobber.json`, se restauro el archivo versionado con `git checkout -- <ruta>` y se verifico la diferencia (la mia: BLOQUEADO **24/26** del 27-11; la citada: APROBADO **26/26** del 23-11). El instrumento gana `--evidencia=<dir>`: desde ahora cada intervencion corre su evidencia a su carpeta y la de una promocion publicada queda intacta. La corrida buena de esta seccion escribe en `docs/qa/evidence/hr-alineacion-20261127/paquete-qa-desplegado/qa-campo-escritura.json`.

**Alcance de esta seccion (A/M/D exacto).** `M scripts/certifications/hr-schedule-timeline-qa.js`, `M scripts/certifications/hr-paquete-main-qa.js` (anclas, retiro verificado, payloads reales, pierna nueva, `IDS_PIERNAS` **27**, `--evidencia`), `A docs/qa/evidence/hr-alineacion-20261127/paquete-qa-desplegado/qa-campo-escritura.json`, `M docs/qa/evidence/rediseno-horarios-mallas-20261126/qa-desplegado/` (**7** rutas `M`: `certification.json` + **6** PNG, y **3** `A`: `certification-prev-20261127205908.json` **46/50**, `...20261127210858.json` **44/45**, `...20261127211345.json` **51/51**, que son el ANTES versionado), `M .qoder/skills/apexos-qa/SKILL.md` + su espejo `agents/apexos-qa/SKILL.md` (regla 161, **2.146.0 -> 2.147.0**), `M .qoder/skills/apexos-brief/SKILL.md` + su espejo `agents/apexos-brief/SKILL.md` (regla 135, **2.120.0 -> 2.121.0**) y `agents/registry.json`, `M agents/CHANGELOG.md`, `M docs/qa/certifications/hr-retrointegracion-20261127.md` y este brief. **0** rutas bajo `apps/`, **0** borrados, **0** migraciones, **0** despliegues en esta seccion. **Consecuencia sobre el congelado (regla 135):** los dos bumps cambian blobs que si viajan en el inventario de replay, asi que el candidato de `develop -> main` se recorta contra la punta nueva de `desarrollo` y las compuertas se vuelven a correr: no se promociona contra un SHA sellado antes de este corte.

**Escrituras en QA y su retiro.** La corrida es con `--escribe-en-qa=SI` sobre la empresa modelo NYVORA y retira por endpoint lo que creo: **3** usuarios por `PATCH /admin/users/:id/status` (`active=false`), **2** mallas por `PATCH /hr/routes/:id`, **2** bancos por `PATCH /talento-humano/bancos/:code`; quedan declarados **31** registros de `revision-dias` sin DELETE de catalogo y las marcaciones con `idempotency_key qa-paquete-20261127212604-reenvio`. El `DELETE` fisico de mallas responde **400** porque exige `delete_physical_records` y el arnes no se lo entrega: la fila se retira por estado, no se borra.

**Lo que NO cierra esta seccion.** No hay promocion `develop -> main` todavia: la certificacion de QA desplegado es el prerrequisito que faltaba, no la aprobacion. Siguen pendientes, con dueño: manifiesto de alcance v2 y `qa:approval:evidence` para `main` (`apexos-qa` + `apexos-git-guardian`), desplegar y verificar el artefacto servido, aplicar en Produccion `20261121230000`, `20261122060000`, `20261122120000` por pooler (`apexos-db-nube`) y re-medir las marcaciones de la semana en Produccion. La orden del dueño mantiene la aplicacion de marcacion por web en Produccion: no se retira ninguna compuerta de marcacion en esta promocion.
