# Certificación — Retrointegración de Talento Humano a desarrollo (2026-11-27)

- **ID**: `hr-retrointegracion-20261127`
- **Rama certificada**: `desarrollo` (baseline `536c72bb`, igual a `origin/desarrollo`)
- **Rama fuente**: `origin/develop`
- **Brief**: `docs/briefs/2026-11-27-hr-retrointegracion-ramas.md`
- **Evidencia**: `docs/qa/evidence/hr-alineacion-20261127/`
- **certification_status**: `local_passed_qa_pending`
- **Escrituras a registros de cliente**: cero. No se tocó `apps/api/prisma/**`, ni base de datos, ni despliegues.

## 1. Qué se pidió y qué se encontró

El dueño reportó que a Talento Humano le faltaban funciones y campos migrados desde `develop`. La medición por blob, no por log de commits, confirmó el reporte y agregó un hallazgo incómodo: **la direction estaba rota en los dos sentidos**.

| Frente | Solo en `develop` (traído) | Solo en `desarrollo` (recuperado) |
|---|---|---|
| Bancos | maestro de bancos, ACH/SWIFT, archivo Davivienda | — |
| Liquidación de retiro | revisión por día, ajustes manuales, beneficios, deducciones, PDF | — |
| Nómina | rediseño con rango de periodos, conceptos, provisiones y aportes | — |
| Reportes | columnas de tiempo trabajado/extra y totales | corrección administrativa de marcación y lectura de evidencia degradada |
| Marcación web | selfie ligado al paso | tolerancia a foto ilegible y taxonomia de fallos de la cola |
| Empleados | — | cierre de vigencia en línea y panel biométrico de dos clics |
| Mapa | — | detalle sin base64 inline |
| Hub | entrada de bancos | enlace de Marcaciones |

Las 4 columnas de la derecha son trabajo ya certificado y promovido en su momento, revertido en `develop` por el rediseño: es decir, **hoy Producción sirve código anterior a ese trabajo**. Se declara aquí, en la misma respuesta, y queda como pendiente del dueño.

## 2. Metodo

No se hizo `merge`. Fusionar `develop` sobre `desarrollo` aplicaba 155 supresiones de rutas de modulos que viven legítimamente solo en `desarrollo`. El procedimiento fue:

1. Clasificar el delta base..`origin/develop` restringido a Talento Humano en cuatro canastas: `BORRA-DEVELOP` (46 rutas, no se aplican), `COPIA-SEGURA` (57), `FUSION` (6) y `NUEVO-DEVELOP` (61).
2. Copiar 90 blobs de `develop` sobre un worktree auxiliar en `536c72bb`.
3. Reconciliar a mano los dos registros compartidos (`moduleFunctions.ts` y el hub) reinsertando lo que `develop` no conocía.
4. Censar identificadores exclusivos de `desarrollo` en cada ruta tocada: `pdfEscape`, `tabClass`, `Kpi` y `Balance` se verificaron uno por uno (dos renombrados, uno sustituido por el modulo nuevo de PDF, uno con su equivalente inline).
5. Auditar cada línea quitada del blob de `develop` en los tres puertos aditivos.

## 3. Mediciones

| Instrumento | Resultado |
|---|---|
| Suite del portal (`node --test apps/web/test/*.test.mjs`) | 948 pruebas, 943 pasan, 5 fallan |
| Baseline prístina del portal | los mismos 5 nombres caen en `536c72bb` (Servicios y Contable, ajenos al frente) |
| Suite API de Talento Humano (`node --test apps/api/test/hr-*.test.js`) | 413 pruebas, 409 pasan, 4 fallan |
| Baseline prístina de la API | 361 pruebas, 357 pasan, **los mismos 4 nombres** caen |
| `tsc --noEmit` en `apps/web` | salida 0 |
| Paridad por blob contra `origin/develop` (169 rutas del modulo) | 158 identicas, 11 divergentes y explicadas |
| Lineas de `develop` sin replica en el arbol integrado | hub 0, aportes 0, prestaciones 0, provisiones 0, librerias de marcacion 0, mapa 1, reportes 4, pruebas 10, empleados 15, marcacion 124 |

Las 124 lineas de `marcacion/page.tsx` no son funciones perdidas: son el sondeo fijo de 12 segundos que `desarrollo` retiro por medición en Produccion (p50 de 9,2 s entre fallos consecutivos del mismo usuario) y que aqui se queda sin aplicar a proposito, mas el andamiaje de listeners que ese sondeo arrastraba.

## 4. Controles de mutacion

Un control que no puede fallar no protege nada. Cada control nuevo se puso rojo primero:

- Quitar `selfieType !== type` de la compuerta de marcacion → `la selfie queda ligada al paso que se esta marcando` pasa de 9/9 a rojo; restaurado, vuelve a 9/9.
- El punto D de `hr-offline-marking.test.mjs` estaba rojo **en las dos ramas**: la prueba exigia que la compuerta terminara en `hrSelfServiceWrite` y el codigo ya habia agregado `hrSharedDeviceWrite` y `hrFaceWrite`. Se actualizo el literal y se añadieron dos aserciones positivas para que sacar una escritura del bloqueo vuelva a ponerlo rojo. No se aflojo ningun control.
- `hr-landing-information-architecture.test.mjs`: el control de que Marcaciones **no** aparece en el hub se invirtio por orden del dueño de hoy y queda con su cita; se verifico que pone rojo si se retira el enlace.

## 5. Lo que NO certifica este documento

- No certifica navegador contra ambiente desplegado: no hay corrida de Chromium sobre el arbol integrado. Por eso el estado es `local_passed_qa_pending`, no `qa_approved`.
- No habilita promoción. `qa:promotion:scope` contra la punta de `develop` sigue midiendo el porton completo y requiere manifiesto nuevo con autorizacion expresa.
- No lleva a Produccion el frente biométrico (14 endpoints, 3 tablas) ni aplica migracion alguna.
- No re-mide el DESPUES en Produccion: ese paso pertenece a la promoción, no a esta retrointegracion.

## 6. Pendientes con dueño

1. **Decidir la promoción** de este arbol a `develop` y `main` — dueño: el dueño; instrumento: manifiesto de alcance v2 + `qa:promotion:scope` + `qa:preqa:evidence`, y corrida de navegador antes.
2. **Cuatro rutas revertidas en Produccion** (telemetria de `api.ts`, identidad de instalacion, base64 del mapa, ventanillas de Empleados) — dueño: `apexos-frontend` y `apexos-qa`; tres quedan corregidas en `desarrollo` con este commit, falta decidir si se suben.
3. ~~**Siete `confirm(` sin prefijo**~~ — **CERRADO el 2026-11-27** en la sección 7: las siete preguntas destructivas viven ahora en `ConfirmWindow` dentro de la pantalla, con censo de ventanillas nativas en **0**.
4. **Frente biométrico en Produccion** — dueño: `apexos-db-nube` y el dueño (autorizacion de migracion).
5. **Un instrumento con la premisa retirada** —dueño + `apexos-qa`—: `scripts/certifications/hr-hide-web-marking-local.js` vino de `develop` para certificar que la marcación web se oculta. La orden del 2026-11-27 es dejarla en producción, así que el archivo queda en el árbol por paridad pero **no** se cita como evidencia: hay que decidir si se retira o se re-ancla.
6. **El checkout principal quedó una punta atrás** (`desarrollo` local en `536c72bb`, `origin/desarrollo` en `914047aa`): adelante a la fuerza dejaría **106** rutas como «revertidas por alguien» junto al monitor en vuelo. Se recupera re-anclando los **5** archivos del monitor sobre la punta nueva y recién después un `merge --ff-only` —responsable: quien retome ese frente, con `apexos-git-guardian`.
7. **Worktrees y ramas auxiliares** de esta intervención (`wt-hr-alineacion-20261127`, `wt-hr-base-20261127`, tags `backup/prealineacion-*`) — dueño: el dueño decide el borrado; nada se elimina sin orden expresa.

## 7. Secuela del mismo dia: las siete ventanillas nativas quedaron mudas

El punto 3 de la seccion anterior se cerro dentro de esta intervencion por orden expresa del dueno («no dejes pendientes»). No es un rediseño: es el mismo flujo con la pregunta adentro de la aplicacion.

| Pantalla | ANTES | DESPUES |
|---|---|---|
| `rostros` | `window.confirm` con el nombre del empleado | `ConfirmWindow`: nombre, fecha del registro y version de consentimiento; el DELETE sale del segundo clic |
| `dispositivos-marcacion` | `window.confirm` con la placa | ventana con placa, ultimo uso y la nota de que el historial de marcaciones se conserva |
| `aportes-sociales` | `confirm(` pelado | ventana con `period_key` y total a pagar del documento |
| `liquidacion-trabajador` | `confirm(` pelado | ventana con empleado, neto, prestaciones, indemnizacion y fecha de corte |
| `nomina` (reabrir periodo, borrar documentos, anular jornadas del archivo plano) | tres `confirm(` pelados | una mesa de tres textos con el `period_key` de cada accion; ninguno de los tres botones vuelve a ejecutar directo |

Medicion de la secuela, en el arbol integrado:

- Ventanillas nativas bajo `app/dashboard/talento-humano`: **7 → 0**, barridas sobre los **19** archivos `.tsx` de la carpeta (el contrato exige el censo, no un numero redondo).
- Suite del portal: **956** pruebas, **953** verdes, **3** rojas. Las **3** se atribuyen por alcance, no por antiguedad: `el editor de presupuesto...`, `la ficha enlaza sucursal...` y `la falta de HR no bloquea la consulta de flota` leen exclusivamente rutas de `contabilidad/`, `transporte/`, `administracion/` y `lib/api.ts`, ninguna dentro de este diff (**7** rutas modificadas + **2** nuevas).
- `tsc -p tsconfig.typecheck.json --noEmit` en `apps/web`: salida **0**.
- Contrato nuevo `apps/web/test/hr-confirm-window.test.mjs`: **8** pruebas (barrido, dos controles de contraste, el componente, las cuatro pantallas con estado + gatillo + cierre, las tres de nomina y la marcacion web intacta con su selfie).
- Los dos contratos que **exigian** la ventanilla (`hr-face-enrollments-page.test.mjs` y `hr-shared-devices-page.test.mjs`) se invirtieron en esta misma corrida: ahora exigen `doesNotMatch(/window\.confirm\(/)` mas el estado de la fila, el gatillo, el segundo clic y el cierre.
- Controles de mutacion: **6**, cada uno rojo por el control esperado y con el archivo devuelto byte a byte. Uno estuvo verde la primera pasada —el bucle asertaba el `onConfirm` pero no el `onClick`, asi que reponer el clic directo no caia nada— y por eso el contrato quedo con las dos aserciones.

## 8. Secuela 2 del mismo dia: las dos piezas que `develop` tenia mas adelante suben a `desarrollo`

El porton de alcance (`scripts/validate-promotion-scope.js:113-161`) exige que cada ruta del candidato sea, blob por blob, la que esa ruta tiene en `origin/desarrollo`; declarado `transport: replay_puntual`, no admite ninguna excepcion de origen. El censo del frente dio **42** rutas divergentes entre las dos puntas. **40** son `desarrollo` reemplazando en la misma funcion lo que `develop` traia, asi que llevarlas tal cual no revierte trabajo ajeno. **2** no: ahi `develop` estaba realmente mas adelante y llevarlas habria borrado trabajo del frente de espacio de trabajo. Esas dos se absorben primero en `desarrollo`, que es la unica direccion que el flujo permite.

| Ruta | Que tenia `develop` | Que se hizo | Que queda medido |
|---|---|---|---|
| `scripts/certifications/hr-punch-mobile-evidence-local.js` | el arnes fusionado con el que se certifica este frente en navegador: **246** lineas contra **152**, con la pata del hub unificado, la creacion/edicion/clonacion de jornadas, la trazabilidad cronologica, los reportes, la paleta de comandos y el censo de permisos del lote (**401 / 404 / 403**) | sube el blob de `origin/develop` sin retoque: la suma del archivo en el arbol de trabajo es **f49d9561**, identica a la de `origin/develop` | las **10** patas quedan. La pata de evidencia no pierde lo propio y gana una variante: lee `identity` o `punch` segun exista el endpoint partido (`splitIdentity`) y anade **3** aserciones de permisos que `desarrollo` no tenia |
| `apps/web/test/command-palette-module-functions.test.mjs` | dos patas vivas del maestro de modulos: `Gestionar bancos de empleados` → `/dashboard/talento-humano/bancos` y `Ver PYG ampliado` colgado del modulo contabilidad | fusion a mano: entran esas cuatro aserciones y **no** entra la que exigia que la marcacion web siguiera oculta, revirsada por la orden del dueno del 2026-11-27 | **10/10** verdes con `node --test test/command-palette-module-functions.test.mjs` |

La paleta no podia tomar el blob de `develop` entero: ese blob aserta `assert.equal(byLabel.has("Registrar marcaciones"), false)` y el contrato de `desarrollo` aserta que el atajo existe y apunta a `/marcacion`. Es la misma clave con la misma etiqueta, asi que no existe fusion que deje vivas las dos aserciones. Gana la orden del dueno, `desarrollo` queda como fuente del contrato y las demas patas de `develop` se conservan.

Comprobaciones de la absorcion:

- `node --check scripts/certifications/hr-punch-mobile-evidence-local.js`: salida **0**.
- `tsc -p tsconfig.typecheck.json --noEmit` en `apps/web` con las dos piezas ya absorbidas: salida **0**.
- Suite del portal con las dos piezas ya absorbidas: **956** pruebas, **953** verdes, **3** rojas —los mismos **3** rojos de la seccion 3, atribuidos a `contabilidad/`, `transporte/`, `administracion/` y `lib/api.ts`, ninguna ruta de este diff.
- Con estas dos piezas dentro, el candidato a `develop` se declara `transport: replay_puntual` con **cero** excepciones de origen: cada ruta del diff es el blob de `origin/desarrollo`, medida por `git rev-parse` ruta por ruta y no por ascendencia de commit.

Corrida del arnés absorbido, en `desarrollo` y en base descartable (`docs/qa/evidence/hr-alineacion-20261127/absorcion-arnes/`):

- `node scripts/certifications/hr-employee-user-association-isolated-local.js --certificate=hr-punch-mobile-evidence-local.js`: **10** patas **10** verdes, `exit_code` **0**, `unexpected_5xx` **0**, `source_database_modified: false`, base `apexos_cert_hr_assoc_1795803938790`, artefacto con `commit: 773d0cbd` y **4** minutos **17** segundos de corrida (18:25:55Z → 18:29:42Z).
- Las **10** patas: las **2** de evidencia (mapa por referencia y `TimePunch` con su foto de identidad), la del hub unificado, **3** del rediseño de horarios (linea de tiempo por defecto, tabla con menu, tema y telefono), creacion/edicion/clonacion de jornadas, trazabilidad cronologica con las **6** fotografias y su lupa, el recorrido de Reportes y la paleta de comandos abriendo bancos y PYG ampliado.
- **Dos corridas rojas quedaron versionadas, no borradas.** La primera (`run-20261127.out`, vacía) murió en la preparación de la base descartable con un `pg_dump` que respondió vacío; reproducido suelto, el mismo volcado aplicó en **0** y la corrida salió después. La segunda (`certification-corrida-roja-2.json` + `diagnostico-hub-corrida-roja-2.json`) cayó en la pata del hub y su diagnóstico dice por qué: el portal respondió «Acceso no autorizado — Tu rol no tiene permisos para abrir Talento humano» con «Sesión no identificada», y el log del API trae un `P1001` (no alcanza `127.0.0.1:55432`) en `GET /api/v1/talento-humano/bancos`. Es decir: el navegador llegó al hub sin sesión porque el API perdió la base un instante, no porque al hub le falte el enlace. La tercera corrida, sobre el mismo árbol y sin tocar nada, pasó **10/10** —eso es lo que separa un rojo de arnés de un rojo de producto, y por eso el diagnóstico del hub se versiona junto con la corrida.
- El disco del puesto está al **89 %** y la memoria libre rondaba **0,8 GB** de **8,3** durante la segunda corrida: el arnés levanta API, `next dev` y Chromium a la vez. Queda declarado como condición del puesto, no como defecto del frente.



Lo que **no** certifica esta seccion: sigue sin haber corrida de Chromium contra un ambiente desplegado (eso pertenece al pre-QA de la promocion), y el barrido cubre Talento Humano, no el resto del portal: fuera de esa carpeta quedan ventanillas en contabilidad (`accounting-reversal-budget-import`), que son de otro frente y sus pruebas las exigen a proposito.

## 9. Secuela 3 del mismo dia: la marcacion web vuelve a leer las jornadas de otros dispositivos

El censo del punto 8 se hizo por **hash de blob**, no por ascendencia, y su inventario completo esta en `docs/qa/evidence/hr-alineacion-20261127/absorcion-develop.json`. Sobre **1 027** rutas tocadas en las areas del modulo: **101** identicas, **749** solo en `desarrollo`, **86** distintas en las dos ramas y **91** solo en `develop`. Bajo `apps/` hay **26** rutas `M` y **0** borrados. La fusion del arnes dejo **40 + 2** rutas pero no cubrio una tercera, que aparecio al leer el `M` de `apps/web/app/dashboard/talento-humano/marcacion/page.tsx` linea por linea: ahi `develop` tambien estaba mas adelante.

Que tenia `develop` y no tenia `desarrollo` (commit `6fd7c5a2`, frente de sincronizacion entre dispositivos):

- La pantalla unia los grupos de un mismo empleado llamando a `attendancePunches`. En `desarrollo` esa libreria **ya existia y era el mismo blob** en las dos ramas (`apps/web/lib/hrAttendanceState.ts`, `70135b5b`), pero **ninguna pantalla la llamaba**: el frente vivia como archivo muerto y la toma de decision leia un solo grupo. Como `/self/attendance` llega agrupado por identidad, un operario con grupo por codigo, por nombre y por alias perdia en la web las marcaciones que el celular del camion ya habia subido.
- Un revalidar contra el servidor **antes** de escribir la marcacion: si el horario cambio, si la jornada avanzo desde otro dispositivo o si ya se cerro, la pantalla lo dice y no escribe.
- Una sola peticion en vuelo (`refreshOperationalState`) con `cache: "no-store"` y `silentFailureAlert`, y la foto recargada solo cuando cambia la firma de la jornada.

Por que no se podia resolver en el candidato: `scripts/validate-promotion-scope.js:113-161`, declarado `transport: replay_puntual`, **prohibe** `origin_waivers` y exige que cada ruta del diff sea el blob de `origin/desarrollo`. Llevar la pantalla tal como estaba en `desarrollo` habria revertido el frente ajeno; fusionarla a mano dentro del candidato habria roto el candado de origen. La unica direccion legal era absorber primero en `desarrollo`.

Como quedo la absorcion:

- Se reuso la libreria compartida (reside en `apps/web/lib/hrAttendanceState.ts`, no se duplico en la pantalla) y se respeto la superficie de estado de `desarrollo`: no entraron `remoteSyncError`, `lastRemoteSync` ni `preparingPunch`, retirados ahi por el frente de enmudecimiento.
- La revalidacion cuesta **2** lecturas (`/self/attendance` + `/self/routes`), no **6**. La primera version enganchaba `refreshOperationalState` a `load()`, que paga seis viajes por marcaje; con el piso medido en **~660 ms** por viaje al pooler, eso eran ~**2,6 s** anadidos a cada toque. Se reviro y se porto la version fiel de `develop`.
- Contrato nuevo `apps/web/test/hr-marking-cross-device.test.mjs`: **8** pruebas (union por libreria, residencia, un solo vuelo con `no-store`, foto por firma, los **3** mensajes de revalidacion, que una caida de red **no** niegue la marcacion, que la cola pendiente cuenta como pierna propia y cero dialogos nativos). Control **ANTES** contra el blob previo a la fusion: **8 de 8 rojas**. Control **DESPUES**: **8 de 8 verdes**. El contrato puede fallar, que es lo que lo convierte en evidencia.

Mediciones del candidato `652316ff` (arbol nacido en `origin/develop a440560d`, replay de **72** rutas: **29** `A` + **43** `M`, **0** borrados, **0** rutas bajo `apps/api/`, `packages/`, `infra/` o `apps/control-tower/`):

| Control | Resultado | Artefacto |
|---|---|---|
| Suite del portal en el arbol **puro** de `origin/develop` | **915** pruebas, **898** verdes, **17** rojas | `candidato-develop/suite-base-origin-develop.json` |
| Suite del portal en el **candidato** | **964** pruebas, **948** verdes, **16** rojas | `candidato-develop/suite-candidato.json` |
| Rojos **nuevos** introducidos por el replay | **0** | `candidato-develop/comparacion-antes-despues.json` |
| Rojos que el candidato **apaga** | **1**: `hr-offline-marking.test.mjs` pata `D` (las escrituras self-service de HR no caen al respaldo Supabase) | el mismo |
| Contrato HR dentro del candidato | **236** pruebas, **236** verdes, **0** rojas en **32** archivos | `candidato-develop/contrato-hr-candidato.json` |
| Imports de los **29** archivos de codigo del diff | **63** especificaciones, **0** rotas | `candidato-develop/verificacion-estatica.json` |
| Modulos compartidos reemplazados | **8**, pierden **0** exportaciones | el mismo |
| Certificacion de navegador en base descartable | **10** patas **10** verdes, `commit` sellado `542027c7`, base `apexos_cert_hr_assoc_1795805950668`, `source_database_modified: false`, `unexpected_5xx` **0** | `absorcion-sincronia/` |

Atribucion de los **16** rojos del candidato, cada uno ya rojo en el destino: **10** son arneses `certify-*-local` que piden un portal vivo en `127.0.0.1:3001` y mueren con `net::ERR_CONNECTION_REFUSED` (estan disenados para correr contra servidor levantado, no en la suite de contratos); **4** `ibc-nomina-ui.test.mjs`, **1** `transport-print-theme.test.mjs` y **1** `transport-pyg-account-config.component.test.mjs`, los tres frentes ajenos a este diff. Ninguno lee la pantalla de marcacion.

Trampa de comparacion, versionada porque casi publica lo contrario: la primera pasada del comparador de rojos dio **10** rojos "nuevos" y **10** "apagados". Eran los mismos arneses: el texto del fallo trae la **ruta absoluta** del arbol donde corro, asi que el motivo de `wt-hr-base-...` nunca iguala al de `wt-hr-cand-...`. Normalizado el motivo a nombre de archivo, la diferencia real es **una** pata. Un diff de conjuntos sobre cadenas que llevan rutas del puesto tiene que normalizarse antes de afirmar "el candidato introduce rojos".

Hallazgo nuevo que **no** entra en esta promocion: `develop` fija `default-src 'self'` sin `frame-src`, y las dos ramas dibujan un `<iframe>` de OpenStreetMap en la pantalla de marcacion para la vista previa del GPS. Con esa directiva el navegador bloquea el iframe **en todos los ambientes**, y arreglarlo exige tocar un token global (`next.config.ts`) que consumen otros modulos. Por la regla 22 del orquestador, un token global no se repinta de contrabando dentro de la pasada de un modulo: va en su propio brief con su certificacion de navegador.

Error propio declarado en esta secuela: las dos primeras corridas del candidato (suite completo y contrato HR) salieron escritas **desde el arbol base**, porque reutilice el directorio de trabajo de la medicion anterior sin cambiarlo. Los artefactos decian `candidato` y traian `a440560d`. Se volvieron a correr desde el worktree del candidato y hoy `suite-candidato.json` y `contrato-hr-candidato.json` estan sellados con `652316ff`; la tabla de arriba usa las cifras re-medidas.

Lo que **no** certifica esta seccion: sigue sin haber corrida contra un ambiente **desplegado** (eso es el pre-QA posterior al push), `apps/api/**` no viaja en este candidato y la comparacion de suites es de contratos de codigo, no del arbol de despliegue.

## 10. Secuela 4 (mismo dia): el porton de blobs y el control que no podia fallar

Corte de compuertas: cero codigo de producto nuevo, cero escrituras de cliente. Lo que se cerro aqui es la forma promocional del candidato y dos defectos de instrumento que habrian pasado verdes.

**Medicion del porton.** `scripts/certifications/promotion-migration-check.js` con las **79** rutas declaradas como `carry` desde `origin/desarrollo` contra el arbol del candidato: `INVARIANTES DE REPLAY VALIDAS: 79/79` (`docs/qa/evidence/hr-alineacion-20261127/candidato-develop/paridad-rutas.json`, `passed: true`, `rotos: 0`). O sea: cada archivo que sube a `develop` es, byte a byte, el archivo que esta en la rama donde se escribio y se probo.

**Defecto de instrumento numero uno (se declar porque salio verde).** El primer control de mutacion del porton tambien salio **verde**, y un control verde no controlaba nada: el spec mutado fijaba `from_ref: "HEAD"` y el `HEAD` del worktree auxiliar **era** el propio candidato, asi que el blob esperado y el medido eran el mismo por construccion. La regla 122 de `apexos-qa` explica la semantica (`wanted = blobAt(item.from_ref || spec.origin_ref, ...)`, `actual = currentBlob(...)`): `from_ref` es el blob esperado, no el arbol medido. Reconstruido el control rompiendo una ruta `M` contra `origin/develop` (`.qoder/skills/apexos-backend/SKILL.md`), el porton respondio `INVARIANTES DE REPLAY ROTAS`, `passed: false`, **1** de **79** rota y codigo de salida **1** (`control-de-mutacion-porton.json`, con el spec vivo en `spec-mutacion.json`). El porton se niega a pisar evidencia existente, asi que el rojo se guardo con `--allow-output-overwrite` teniendo la corrida buena respaldada, y el rojo queda versionado: es lo que demuestra que el **79/79** se midio y no se asumio.

**Defecto de instrumento numero dos.** `cmd | tail -3; echo "exit=$?"` reporta el estado de `tail`, no el del porton: la corrida roja devolvio `exit=0` por la tuberia. El codigo de salida se captura solo (`> /dev/null 2>&1; echo $?`) y se coteja contra el JSON.

**Orden de congelado (regla 66 de `apexos-git-guardian`).** `scripts/validate-promotion-scope.js:151` compara los blobs contra la punta **viva** de `origin/desarrollo` en el momento del porton, no contra el commit certificado. Por eso el papeleo de la ronda (bumps `apexos-git-guardian` 2.49.0, `apexos-qa` 2.144.0, `equipo-apexos` 2.83.0, esta seccion y su entrada de `agents/CHANGELOG.md`) entra **antes** de congelar el candidato: si entrara despues, las rutas `.qoder/skills/**` y `agents/CHANGELOG.md` que viajan en el inventario dejarian de ser el blob de origen y el mismo arbol que dio **79/79** daria rojo sin que nadie tocara producto. Consecuencia medida y versionada: entre el arbol donde se corrio la certificacion de navegador (`542027c7`) y el candidato congelado, las **29** rutas de producto del diff y los **2** scripts del instrumento son el mismo blob (`identidad_total: true`, `paridad-superficie-certificada.json`), y **0** rutas bajo `apps/api/` viajan en este candidato.

**Lo que NO certifica esta seccion.** La corrida de navegador con base efimera no se re-ejecuto dentro del arbol del candidato: el puesto tenia **1,07 GB** de memoria libre y el arnés levanta API + `next dev` + Chromium sobre una copia de la base. Lo que se hace es medir la superficie (parrafo anterior) y declarar la sustitucion; la cobertura funcional del arbol integrado se toma contra el ambiente QA **desplegado**, que corre el mismo binario promocionado. Tampoco se certifica aqui el despliegue, las migraciones biometricas pendientes en la nube ni `develop -> main`.

