# Certificación — Rediseño de Horarios y mallas: el listado sobre un eje de dieciséis horas (2026-11-26)

- **Rama certificada:** `desarrollo`. Pantalla `apps/web/app/dashboard/talento-humano/rutas/page.tsx` con blob **`4473068e447ceb22627176cadd5d91e3d1d3397b`** sobre el blob servido en las ramas **`c79f3da7`** (+179 líneas, −27). Certificador `scripts/certifications/hr-punch-mobile-evidence-local.js` con blob **`446321b898e32902a64d29b0ff11fe16a57b7ff3`**.
- **Ambiente:** puesto local. El entrypoint canónico `node scripts/certifications/hr-employee-user-association-isolated-local.js --certificate=hr-punch-mobile-evidence-local.js` crea una base desechable (`apexos_cert_hr_assoc_1795724187592`, esquema volcado con `pg_dump --schema-only` desde `apexos` del contenedor local), levanta la API real sobre esa base y un `next dev` propio en `CERT_BROWSER_PORT` (3317), y maneja Chrome headless con el token sembrado en `localStorage`. Cero mock, cero nube.
- **Artefactos citables** (`docs/qa/evidence/rediseno-horarios-mallas-20261126/`): `certification.json` (**6/6**, 2026-11-26T20:16:48Z–20:19:06Z), `isolated-certification.json` (base aislada, `source_database_modified:false`, **cero** 5xx inesperados), `medidas-linea-de-tiempo.json` (los píxeles y contrastes que registró la corrida), `control-mutacion-contrato.json`, `control-mutacion-arnes-pantalla-anterior.json`, `artefacto-produccion.json` y seis capturas (`timeline.png`, `timeline-dark.png`, `timeline-phone.png`, `table-row-detail.png`, `table-row-menu.png`, `detail-phone.png`).
- **Suite:** contrato nuevo `apps/web/test/hr-schedule-timeline-view.test.mjs` (**11** pruebas) dentro de la suite web completa (**919 de 924**), más el certificador de navegador.
- **Alcance:** Talento Humano → Rutas («Horarios y mallas»). Ninguna ruta de API, ninguna migración, ninguna pantalla más. `main` **no autorizado**.

## 1. Qué se prometió

El PDF `Rediseno_Horarios_y_mallas.pdf` pide ocho cosas y las ocho se pueden verificar sin leer el código:

1. Seis indicadores compactos en una sola fila adaptativa.
2. Los filtros en una barra y un selector «Línea de tiempo / Tabla» en esa misma barra.
3. Una vista nueva de eje 06:00–22:00 donde cada horario es una franja y **pulsar la franja abre el detalle**.
4. La tabla de siempre con la fila cliqueable de punta a punta, el estado como punto de color y «Editar / Clonar» escondidos detrás de «⋯».
5. Una ventana flotante con fondo oscurecido y difuminado, franja de métricas, tarjeta de la persona con su progreso de cuatro marcaciones y trazabilidad filtrable.
6. Teléfono: la ventana ocupa el ancho, los indicadores se apilan y la pista se desplaza.
7. **La vista por defecto es Línea de tiempo.**
8. Posición y ancho de la franja por fórmula: `left=(inicio−6)/16`, `width=duración/16`, con la franja y el nombre como botones accesibles (`aria-label="Abrir detalle del horario N"`).

## 2. Columna del antes / después

| Medida | Antes (`c79f3da7`, lo que sirven las tres ramas) | Después (blob `4473068e`) |
|---|---|---|
| Vistas del listado | **1** (tabla) | **2** —Línea de tiempo (por defecto) y Tabla—, selector con `aria-pressed` en la barra de filtros |
| Fila de indicadores | tarjetas grandes en rejilla fija | **6** tarjetas compactas en `grid-cols-[repeat(auto-fit,minmax(150px,1fr))]`; en 390 px el navegador cuenta **2** columnas |
| Abrir el detalle | botón explícito por fila | pulsar la franja (nombre y franja son el mismo acceso) o la fila entera; **6/6** en navegador |
| Acciones «Editar / Clonar» | visibles en la fila | detrás de «⋯» con `aria-expanded`; el arnés exige que el menú exista **y** que «Editar» aparezca al abrirlo |
| Estado | texto con chip | punto de color + texto, pintado solo con tokens del sistema (**cero** hex en la franja, lo corta el contrato) |
| Eje | no existía | 06:00–22:00, **9** marcas (de dos en dos sobre las 16 horas), `left=(inicio−6)/16`, `width=duración/16`, nocturno recortado y nombrado |
| Contraste de la etiqueta sobre su franja | no medido | **12,39:1** claro y **14,49:1** oscuro (AA pide 4,5:1) |
| Área tocable de la franja | **30 px** en la geometría antigua (misma cuenta CSS; hoy **30 px** medidos en escritorio por densidad de tablero) | **46 px medidos en 390 px** de ancho (el PDF pide ≥ 40 px táctiles) |
| Ventana de detalle | modal ancho fijo | portal sobre `document.body`, `bg-neutral-950/70` + `backdrop-blur-sm`, **390 de 390 px** en teléfono |
| Refresco tras guardar | `setTimeout(250)` | retirado del flujo (la recarga va por el evento que ya existía) |
| Líneas del archivo | — | **+179 / −27** |

## 3. Cómo se probó cada pata

### 3.1 El contrato ejecuta la matemática del eje, no la mira en la captura

`apps/web/test/hr-schedule-timeline-view.test.mjs` transpila el pedazo de helpers de la página y lo corre con `new Function`, de modo que las aserciones son sobre valores calculados:

- 08:00–16:00 → `left:"12.5%"`, `width:"50%"`.
- 22:00→02:00 (jornada nocturna) → no produce ancho negativo: sale recortada al borde del eje y con su aviso de recorte nombrado.
- El eje tiene **9** marcas (`TIMELINE_TICK_HOURS = [6,8,10,12,14,16,18,20,22]`, de dos en dos sobre las 16 horas) y el tope de filas dibujadas es **60**, con aviso de filas ocultas. *(Corregido en el corte de QA: estaba escrito «**17** marcas» y era el conteo de las horas del eje, no de las etiquetas; el contrato compara el arreglo de **9** y el navegador desplegado pintó **9**.)*
- La vista por defecto es `"timeline"` y el selector alterna a tabla.
- Cero literales hexadecimales en la franja y en el punto de estado: se usan `apex`, `success`, `warning`, `error`, `line`, `surface` y `content-*`.

**Control de mutación** (`control-mutacion-contrato.json`): tres mutantes aplicados uno por uno —default a tabla, eje dividido en 24 y hex literal en la franja— dieron **1 + 2 + 1 = cuatro** pruebas Rojas. Después el blob volvió a `4473068e…` verificado byte a byte y la suite quedó **11/11**. Un contrato que no se puede romper no prueba nada; aquí se midió que se rompe.

### 3.2 El navegador recorre la interacción real

`certification.json`, **6/6**, con la API y la base del certificador:

1. `summary exposes photo availability and counters without image bytes` —herencia: el resumen sigue sin arrastrar bytes de evidencia.
2. `single carries the bytes and the batch is an index…` —herencia: la evidencia viaja por referencia y el lote cuenta lo mismo; 401/404/403 por acceso.
3. `the schedule opens its detail from the timeline bar, which is the default view` —`aria-pressed="true"` en «Línea de tiempo», se pulsa `button[aria-label^="Abrir detalle del horario"]`, la ventana muestra «Trazabilidad cronológica del equipo» y **seis** imágenes `<img>` decodificadas (`naturalWidth>0`), y no aparece «Sin evidencia fotográfica».
4. `the table view opens the same detail from the row and hides its actions behind the menu` —vista Tabla, `tr[data-route-id]` presente, cada fila ofrece «Mas acciones», un clic en la fila abre el monitor y el menú revela «Editar».
5. `the redesign repaints through the app theme control and stays usable on a phone` —el tema se cambia **desde la app** (`Mi cuenta → Tema de la plataforma → Oscuro`), se verifica `html.dark`, que fondo/pista/tinta cambien de verdad y que el contraste de la etiqueta sobre su franja compuesto por alfa calcule AA en los dos temas; luego 390×844 con espera por selector (no por sueño) para exigir scroll horizontal, indicadores apilados, franja ≥ 40 px y ventana a ancho completo.
6. `Reports journey trace renders the activity photograph and opens its enlargement` —herencia: la trazabilidad de Reportes sigue mostrando la foto de actividad y su ampliación.

### 3.3 El arnés nuevo se probó contra el árbol anterior

Devuelto `page.tsx` al blob **`c79f3da7`** (la pantalla sin línea de tiempo), la corrida cayó ROJO en la primera comprobación de navegador nombrando el selector que falta (`control-mutacion-arnes-pantalla-anterior.json`):

```
Waiting for selector `button[aria-label^="Abrir detalle del horario"]` failed
```

Restaurado el blob bueno, la corrida completa quedó **6/6**. Esta es la prueba de que la pata nueva discrimina y no viene verde por inercia.

## 4. Suites, build y artefacto servido

- **Suite web completa:** `node --test test/*.test.mjs` → **919 de 924**. Los **5** rojos son de otros frentes y están atribuidos por archivo, no por suposición: `accounting-pyg-interactive`, `command-palette-module-functions`, `hr-offline-marking`, `transport-master-access` y `transport-vehicle-master-catalogs`. Se verificó que **ninguno** de los cinco lee `rutas/page.tsx` (conteo de referencias = **0** en los cinco archivos). Ninguno es regresión de este frente.
- **Contratos vecinos que siguen verdes:** `hr-route-write-fallback.test.mjs` (la pantalla conserva `ROUTES_BACKSTOP_POLL_MS = 30_000` y `EVIDENCE_FETCH_CONCURRENCY = 4`) y el censo de portales: `createPortal(` sigue en **3** en toda la app.
- **Build de producción:** `NEXT_DIST_DIR=.next-rediseno npm run build` → **exit 0**, `✓ Compiled successfully in 118s`, `BUILD_ID c2YvmImDGG9_e4Xtw2Tfz`.
- **Censo del artefacto** (`artefacto-produccion.json`) sobre **182** chunks del cliente: «Línea de tiempo» en **2** chunks, «Abrir detalle del horario» en **1** —el chunk de esta pantalla, **91.501** bytes—, y los needles heredados presentes: «Trazabilidad cronológica» (**2**), «Sin evidencia fotográfica» (**2**), «Se asociara al guardar» (**1**), «Editar empleado» (**1**). Los dos literales que usaba la pata antigua del arnés («Debes ir al módulo», «PQR del día») valen **0** en todo el build y **0** en la fuente: no pertenecen a esta pantalla; lo que sí hacía la pata antigua era pulsar un botón de texto `Abrir` en la fila, que el rediseño retira a propósito y la pata nueva reemplaza por dos aserciones que pueden fallar.
- **Efectos colaterales del build, devueltos y verificados:** `apps/web/next-env.d.ts` y `apps/web/tsconfig.json` estaban sucios por un frente ajeno en vuelo, el build los reescribió y se restauraron contra sus hashes previos (**`150e3398…`** y **`a1c29f9e…`**). Ninguno de los dos entra en el commit de este frente.

## 5. Límites de esta certificación

- Todo lo anterior es **ambiente local**. La certificación del candidato sobre `develop` (§6) también lo es; lo servido en el ambiente QA desplegado se mide por separado en **§7**, que es la pata que cierra el frente (regla del repo: la certificación local no autoriza `main` y no sustituye la QA funcional).
- El censo de artefacto prueba que el literal viaja en el chunk compilado; no prueba que el navegador lo pinte —eso lo cubre la pata 3.2 sobre el dev server.
- No se construyó el árbol anterior con `next build`, así que no hay ANTES por artefacto; el ANTES por fuente es el control 3.3.
- Los cinco rojos de la suite web quedan como deuda de sus propios frentes: este documento los atribuye pero no los repara.
- El PDF da su paleta en hexadecimales; se implementó con los tokens del sistema, que son distintos en valor exacto y están documentados como desviación en el brief.

## 6. El candidato a `develop`: primero se midió el destino, después el carry

El candidato (`e3b2046d`) es un árbol despegado sobre `origin/develop@baf47021` con **12** rutas de diff neto: **11** traídas byte a byte de `origin/desarrollo` y **1** fusionada (el certificador). Cero borrados, cero rutas de `apps/api`, `packages/`, `infra/` o `apps/control-tower`.

**El control ANTES: ¿`develop` pasa su propio instrumento?** Se respondió restituyendo en el árbol del candidato los dos blobs del destino (`git checkout baf47021 -- apps/web/app/dashboard/talento-humano/rutas/page.tsx scripts/certifications/hr-punch-mobile-evidence-local.js`, pantalla `c79f3da7…`, instrumento `18f579b83036…`) y corriendo el arnés sin tocar nada más. Resultado (**`candidato-develop/antes-develop.json`**): **ROJO**. Pasaron **3** de **10** patas y la cuarta —`programming creates, edits and clones`— reventó con `Waiting failed: 90000ms exceeded`. La causa no es del rediseño ni del carry: el listado está fijado a un día (`dateFilter` arranca en `initialDate`, el fetch viaja con `&date=` en `page.tsx:582` y el filtro client-side compara en `page.tsx:1181`), la jornada que crea la pata nace dos días después y su fila **no puede** existir. La pata de `develop` lo estaba asumiendo sin medirlo. El artefacto declara además que el `commit` que reporta es el `HEAD` del árbol de trabajo —el instrumento lee `git rev-parse HEAD`— y no lo medido: sin esa nota la evidencia miente.

**La reparación vive en el archivo waived, no en la pantalla.** El comportamiento del filtro de fecha es anterior a este rediseño y la orden del dueño no lo cambia, así que se corrigió el arnés: la pata primero abre la vista **Tabla** y aserta **cero** filas con el filtro en hoy —eso es el control de que el filtro estaba puesto y la aserción de ausencia no es verde por vacío, porque en línea de tiempo las filas son `li[data-route-id]` y no `tr`—, mueve `input[aria-label="Filtrar por fecha"]` a la fecha del registro creado y recién entonces espera la fila.

**El DESPUÉS sobre el árbol del candidato: 10 de 10** (`candidato-develop/certification.json`, `status: passed`, **21:20:38Z–21:24:34Z**), con base aislada recién creada por el propio instrumento (`apexos_cert_hr_assoc_1795728022773`), `source_database_modified:false`, `fixture_schema_hunks:[]` y **0** `5xx` inesperados (`candidato-develop/isolated-certification.json`, verificado a las **21:24:35Z**). El navegador midió solo, otra vez sobre el árbol del candidato: contraste de la etiqueta sobre su franja **12,39:1** en claro y **14,49:1** en oscuro, franja táctil de **46 px** en teléfono y **30 px** en escritorio, indicadores en **2** columnas en 390 px y ventana de detalle **390** de **390 px** (`candidato-develop/medidas-linea-de-tiempo.json`), más sus ocho capturas.

**Los tres rojos que hubo que atribuir antes del verde.**

| # | Rojo | Atribución | Cómo se cerró |
|---|---|---|---|
| 1 | La primera corrida del candidato cayó en `one hub entry opens programming…` | **No queda probada**: la corrida se sobreescribió en la carpeta `.local` al correr las dos siguientes y su diagnóstico se perdió. Lo que sí está medido es que **el mismo árbol** pasó **10/10** a las 21:20Z sin tocar la pantalla, así que el rojo no venía del binario. La explicación más consistente es la compilación fría del `.next-hr-user-association` del candidato —en la propia corrida buena el dev server registró **7** compilaciones en frío: `/dashboard/talento-humano/rutas` en **13,9 s** (**11,6 s** de Next) y `/manifest.webmanifest` en **20,1 s**, con peticiones en cola a **15,2 s** (`candidato-develop/next-buena.txt`)— y eso se entrega como **inferencia**, no como medición | Se añadió diagnóstico por pata (url, título, claves de `localStorage` y los primeros **600** caracteres servidos) para que un rojo futuro sí quede versionado, y se re-corrrió: **10/10** |
| 2 | `programming creates, edits and clones…` (el ANTES, 21:11:06Z–21:14:03Z) | **Sí del destino**, no del carry: la pata de `develop` no era ejecutable contra una pantalla que fija el listado a un día | Reparada dentro del instrumento fusionado (párrafo anterior) y declarada como deriva en los manifiestos |
| 3 | El rojo **buscado**: devuelta la pantalla a `c79f3da7`, el arnés fusionado cayó en **2** de **10** patas (21:25:23Z–21:28:31Z) con `Waiting for selector [data-schedule-view="timeline"] [data-route-id="1"] failed` | Esperado: demuestra que la pata discrimina | `candidato-develop/control-mutacion-candidato.json`, con su diagnóstico en `candidato-develop/diagnostico-hub-pantalla-anterior.json` (el texto servido muestra la pantalla sin el eje: el hub llega hasta «Programación de jornadas» y la franja no existe) |

**Paridad y compuertas, todas contra la punta final.** `promotion-migration-check` con el espec de **11** invariantes (`candidato-develop/spec-invariantes.json`) devolvió **11 de 11** en verde contra el commit `e3b2046d` a las 21:21:58Z (`candidato-develop/paridad-rutas.json`), y su `--selftest` (21:22:06Z) confirmó que el portón **puede** fallar: el replay correcto pasó **3/3** y los **3** mutantes (línea añadida, hunk que falta, archivo que no se borra) cayeron rojos (`candidato-develop/control-de-mutacion-porton.json`). Contrato de eje re-ejecutado en el árbol del candidato: **11/11**. `npm run qa:promotion:scope` → `ALCANCE DE PROMOCION VALIDO: rediseno-horarios-mallas-develop-20261126 (12 rutas…)` y `npm run qa:preqa:evidence` → `AUTORIZACION PRE-QA VALIDA`, con **1** waiver nombrado (`candidato-develop/waiver-instrumento.json`).

**Error propio de este corte, declarado.** Al guardar la corrida del control de mutación copié el artefacto sobre `candidato-develop/certification.json` y **casi pierdo la corrida buena**: la restauré desde el respaldo `.local/BUENA-candidato/` del worktree, el rojo quedó renombrado `control-mutacion-candidato.json` y su diagnóstico `diagnostico-hub-pantalla-anterior.json`. El daño real no fue ese —el archivo se recuperó— sino lo de la fila 1 de la tabla: **la primera corrida roja del candidato no dejó evidencia** porque las corridas sucesivas escriben en la misma carpeta `.local`. Desde este corte la corrida buena se respalda en un directorio con nombre propio antes de tocar cualquier artefacto versionado, y todo artefacto se escribe a una ruta nueva y se valida antes de existir.

## 7. QA funcional sobre el ambiente desplegado: **50 de 50** contra el portal de `develop`

La pata que faltaba. El instrumento nuevo es `scripts/certifications/hr-schedule-timeline-qa.js` y corre contra los host reales, no contra un servidor local: portal `https://apexos-web-qa-production.up.railway.app` y API `https://apexos-api-qa-production.up.railway.app` (los fija `config/qa.env` y el arnés se niega a correr si el host no parece QA o si la cadena de base no trae el proyecto esperado). Evidencia en `docs/qa/evidence/rediseno-horarios-mallas-20261126/qa-desplegado/`: la corrida versionada es **`certification.json`** (`run_id 20261126221616`, `status: passed`, **50/50**, **22:16:16Z–22:17:05Z**) con sus siete capturas `qa-1-linea-de-tiempo.png` … `qa-7-ventana-telefono.png`. Las cuatro corridas anteriores quedan versionadas como `certification-corrida-{1,2,3,4}.json` porque son las que encontraron los defectos del instrumento; no se borran.

**Que el ambiente corre el candidato se probó por artefacto y no por el push.** El HTML de la pantalla (200, **11.500** bytes) referencia **15** chunks (**1.037.964** bytes descargados) y los cuatro literarios del rediseño —`Línea de tiempo`, `Abrir detalle del horario`, `Filtrar por fecha`, `Modo de vista del listado`— caen los cuatro en **un** chunk: **`2zlwn45pk_2rq.js`, 91.431 bytes**. La API servida reporta `commit baf4702127a4`, que es la punta previa de `develop`: el diff promocionado no llevaba **ninguna** ruta de `apps/api`, así que el backend no cambió y no debía cambiar. El portal sí reconstruyó. La sonda previa, corrida a las **21:45:34Z** y versionada en `candidato-develop/desplegado-qa.json`, midió del mismo artefacto **11.502** bytes de HTML, **15** chunks y **1.038.326** bytes: los **2** y los **362** bytes de diferencia son del propio Next (nonces y prefijos por petición), no de otra versión —el chunk del rediseño es el mismo `2zlwn45pk_2rq.js` en las dos lecturas—.

**Lo que midió el navegador sobre el binario desplegado**, con una cuenta efímera de `NYVORA` (54 jornadas en total, **0** de hoy) y el filtro fijado en **2026-11-23**, el día que la API reportó más material (**23** rutas, 10 marcaciones, 11 evidencias):

| Patas | Medido en QA |
|---|---|
| Vista por defecto | `aria-pressed` «Línea de tiempo» = **true**, «Tabla» = **false**, **0** `tr[data-route-id]` y el grupo con `aria-label="Modo de vista del listado"` presente |
| Indicadores | **6** tarjetas en **1** sola fila de escritorio, **182** px por tarjeta |
| Eje | **9** marcas de dos en dos, de **06:00** a **22:00** |
| Matemática de la franja | **23** franjas con `left`/`width` dentro del eje, **0** desbordan. Muestra: horario **405**, 08:00–17:00 → `left 12,5%`, `width 56,25%` (=(8−6)/16 y 9/16) |
| Acceso | **23** franjas con `aria-label="Abrir detalle del horario N…"`, **23** nombres de jornada como botón, **23** puntos de estado |
| Ventana de detalle | horario **404**: `role=dialog`, `aria-modal=true`, **4** métricas (`Marcaciones`, `Actividades`, `Evidencias`, `En vivo`), trazabilidad cronológica presente, progreso **«1 de 4 pasos · Entrada › Almuerzo › Retorno › Cierre»**, **2** imágenes contadas por la API = **2** decodificadas, fondo `blur(4px)`, **0** escrituras |
| Tabla | **23** filas con su punto y su «⋯»; **Editar/Clonar no existen a la vista** hasta abrir el menú; la fila completa abre el mismo detalle («Horario 405») |
| Tema, desde el control de la app | el grupo **Claro/Oscuro/Sistema** se lee con el modal abierto (`Sistema` venía presionado); forzado **Claro** → `dark=false`, `apex_theme=light`, fondo `rgb(245,247,249)`, tinta `rgb(23,33,43)`, franja `rgb(245,229,201)`, contraste **13,14:1**; forzado **Oscuro** → `dark=true`, fondo `rgb(15,23,32)`, tinta `rgb(242,245,247)`, franja `rgb(61,50,28)`, contraste **11,47:1**. Fondo, pista y tinta cambian los tres |
| Teléfono 390×844 | **6** tarjetas en **3** filas, pista con scroll horizontal de **281** px, **0** px de scroll de página, franja táctil de **46** px, la franja **404** abre también desde el teléfono y la ventana mide **390 de 390 px** con sus **4** métricas |
| Higiene | **0** ventanillas nativas de la app, **0** respuestas `5xx`, **0** escrituras (todo fue `GET`/`OPTIONS`), **0** tarjetas de fallo técnico |

**Los tres controles que impiden un verde vacío.** (a) El censo del eje se valida contra sí mismo: inyectado un `li[data-route-id]` falso en la lista, el arnés pasó de ver **23** a **24**, el selector de un contenedor inexistente devolvió **0** y al retirarlo volvieron **23** —o sea, la aserción de cantidad puede fallar—. (b) Se disparó a propósito un `window.alert` con prefijo `ARNES:` y el listener lo registró: si el arnés no pudiera ver una ventanilla nativa, el control de «cero ventanillas» sería verde por ceguera. (c) Ninguna comprobación de contenido se declara sobre un denominador de **0**: la jornada medida se elige por lo que la API contó (personas, marcaciones, evidencias) y no por la primera fila pintada, y si un denominador no existe la pata se reporta **`sin_denominador`** en lugar de pasar. En esta corrida **0** patas quedaron sin denominador.

**Siete rojos, todos del instrumento, y lo que cada uno enseñó.** Quedan versionados porque un verde conseguido sin atribuir los rojos no prueba nada.

| # | Rojo | Causa real | Cómo se cerró |
|---|---|---|---|
| 1 | `el_eje_va_de_0600_a_2200_con_diecisiete_marcas` (corrida 1) | **Error meu, publicado**: los documentos decían **17** marcas. `TIMELINE_TICK_HOURS = [6,8,…,22]` tiene **9** etiquetas cada dos horas; 17 era el conteo de las horas del eje | Corregido en este informe (§2 y §3.1) y en `agents/CHANGELOG.md`; la prueba ahora se llama `…_con_nueve_marcas_de_dos_en_dos` y el navegador desplegado pintó **9** |
| 2 | `abrir_la_ventana_no_escribio_nada` (corrida 1) | El arnés contaba como escritura el `OPTIONS /api/v1/hr/operations-map`: es el *preflight* de CORS, no escribe | `GET`/`OPTIONS` son lectura; cualquier otro método queda registrado |
| 3 | `el_tema_cambia_de_verdad_fondo_pista_y_tinta` (corrida 1) | El portal arranca en **Sistema** y en este puesto eso es oscuro: la pata medía «claro» sobre el tema oscuro y el par salía idéntico. Peor: `el_tema_oscuro_se_aplica_desde_mi_cuenta` estaba **verde sin haber pulsado nada**, porque el estado inicial ya era oscuro | Se fuerzan los dos temas desde el control de la app y se verifica `apex_theme` guardado (`light`/`dark`); la pata de «oscuro» ahora exige además que el control haya abierto el modal |
| 4 | Abort en el paso de teléfono (corrida 1) | `setViewport({isMobile:true})` recarga la aplicación y el filtro de fecha **vuelve a hoy**; en QA hoy tiene **0** jornadas, así que el selector esperaba una franja que no existía | `asegurarListado(fecha)` re-fija la fecha medida después de cada recarga (viewport y cambio de tema) |
| 5 | `pulsar_la_franja_abre_la_ventana_de_detalle` con `{"aria":"","fila_buscada":"402"}` (corrida 2) | La «mejor jornada» se elegía entre **todas** las fechas rankeadas, pero la pantalla pinta **un solo día**: la fila 402 nunca estuvo en el eje | El blanco se elige dentro de la fecha medida y el navegador toma la **primera** de esas filas que sí pinta franja, registrando `fila_buscada` y `fila_pulsada` |
| 6 | Abort `Waiting failed: 120000ms exceeded` en `aplicarTema` (corrida 3) | El menú «⋯» de la fila quedaba abierto y **se comía el primer clic** sobre «Mi cuenta»; además el `waitForFunction` no tenía red y reventaba la corrida entera | `Escape` antes de abrir otro modal, reintento hasta **3** veces con censo del disparador, y ninguna espera del bloque de tema puede abortar: acumula rojo |
| 7 | `el_control_de_cuenta_expone_el_grupo_de_tema` (corrida 4, **49/50**) | El censo de los tres botones se leía **antes** de abrir el modal, así que siempre salía vacío aunque el pulso hubiera funcionado (`abrio:true`, `pulsado:true`, `aria-pressed="true"`) | El censo se lee con el modal abierto; corrida 5 → **50/50** |

**Deriva del tenant, declarada.** La corrida 1 cayó en `NYVORA QA ISOLATION CONTROL`, una empresa de control de aislamiento con **2** jornadas: el arnés elegía la primera empresa `NYVORA` que devolvía la consulta. Desde entonces prefiere la compañía operativa (descarta los nombres con `isolation`/`control`/`qa`) y mide **54** jornadas en `NYVORA`.

**Cuentas dejadas en QA.** Cinco administradores efímeros, uno por corrida —`qa.timeline.admin.20261126215322@timeline-qa.test`, `…215904…`, `…220745…`, `…221454…`, `…221616…`—, todos con `cuenta_efimera_desactivada: true`: el `finally` del instrumento los retira por el endpoint de desactivación (`setUserActive(…, false)`), no por `UPDATE`. Siguen siendo filas inactivas en la base de QA y su borrado físico corresponde al dueño (§8, pendiente 4).

**Lo que esta pata NO cubre.** Que el portal haya servido el candidato se prueba por contenido del chunk, no por un `health.commit` del frontend (el bundle de Next no lo embebe). La pata de creación/edición/clonación de jornadas no se corrió contra QA a propósito: escribe, y la orden pedía desplegar y certificar la lectura del rediseño; esa pata vive en el instrumento local y en su control ANTES contra los blobs de `develop` (§6). Y `main` no se tocó ni se midió: **no autorizado**.

## 8. Pendientes, con dueño

1. **Promover a `develop` y desplegar el candidato** —`equipo-apexos` + `apexos-git-guardian`—: **CERRADO en esta intervención**. `origin/develop` quedó en **`081027de`** como fast-forward de `baf47021` (sin `--force`), el blob de la pantalla es idéntico por `git rev-parse` en las dos ramas (**`4473068e…`**) y el portal sirve el chunk del rediseño (§7).
2. **QA funcional en el ambiente desplegado** —`apexos-qa`—: **CERRADO**. **50/50** contra el binario desplegado, evidencia y siete capturas versionadas en §7.
3. **`main`** —dueño—: **NO autorizado** en esta intervención; queda bloqueado hasta su orden expresa.
4. **Cinco cuentas efímeras inactivas en QA** —dueño + `apexos-qa`—: desactivadas por el instrumento, no borradas. Borrarlas exige entrada `allowed_deletions` en un manifiesto; se deja la lista de correos en §7.
5. **La pantalla crea un horario y no lo muestra si cae fuera del día filtrado** —`apexos-frontend`/dueño—: medido y documentado en el brief §9 y en la regla 67 del agente; es comportamiento anterior al rediseño y la orden no lo cambia, así que se entrega como decisión y no se arregló de paso.
6. **GRANT de `platform_settings` en Producción** —dueño + `apexos-db-nube`—: pendiente ajeno a este frente, sigue sin decidir.
7. **Compuerta alterna de selfie y los cuatro pendientes del turno anterior** —dueño—: en pausa por orden expresa suya.
