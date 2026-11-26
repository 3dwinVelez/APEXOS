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
| Eje | no existía | 06:00–22:00, **17** marcas, `left=(inicio−6)/16`, `width=duración/16`, nocturno recortado y nombrado |
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
- El eje tiene **17** marcas (06, 08, …, 22) y el tope de filas dibujadas es **60**, con aviso de filas ocultas.
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

- Todo lo anterior es **ambiente local**. La certificación del candidato sobre `develop` (§6) también lo es: el ambiente QA desplegado todavía no se mide contra el binario servido, y esa pata es obligatoria antes de considerar el frente servido (regla del repo: la certificación local no autoriza `main` y no sustituye la QA funcional).
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
| 1 | La primera corrida del candidato cayó en `one hub entry opens programming…` | **No queda probada**: la corrida se sobreescribió en la carpeta `.local` al correr las dos siguientes y su diagnóstico se perdió. Lo que sí está medido es que **el mismo árbol** pasó **10/10** a las 21:20Z sin tocar la pantalla, así que el rojo no venía del binario. La explicación más consistente es la compilación fría del `.next-hr-user-association` del candidato —en la propia corrida buena el dev server registró **7** compilaciones en frío: `/dashboard/talento-humano/rutas` en **13,9 s** (**11,6 s** de Next) y `/manifest.webmanifest` en **20,1 s**, con peticiones en cola a **15,2 s** (`candidato-develop/next-buena.log`)— y eso se entrega como **inferencia**, no como medición | Se añadió diagnóstico por pata (url, título, claves de `localStorage` y los primeros **600** caracteres servidos) para que un rojo futuro sí quede versionado, y se re-corrrió: **10/10** |
| 2 | `programming creates, edits and clones…` (el ANTES, 21:11:06Z–21:14:03Z) | **Sí del destino**, no del carry: la pata de `develop` no era ejecutable contra una pantalla que fija el listado a un día | Reparada dentro del instrumento fusionado (párrafo anterior) y declarada como deriva en los manifiestos |
| 3 | El rojo **buscado**: devuelta la pantalla a `c79f3da7`, el arnés fusionado cayó en **2** de **10** patas (21:25:23Z–21:28:31Z) con `Waiting for selector [data-schedule-view="timeline"] [data-route-id="1"] failed` | Esperado: demuestra que la pata discrimina | `candidato-develop/control-mutacion-candidato.json`, con su diagnóstico en `candidato-develop/diagnostico-hub-pantalla-anterior.json` (el texto servido muestra la pantalla sin el eje: el hub llega hasta «Programación de jornadas» y la franja no existe) |

**Paridad y compuertas, todas contra la punta final.** `promotion-migration-check` con el espec de **11** invariantes (`candidato-develop/spec-invariantes.json`) devolvió **11 de 11** en verde contra el commit `e3b2046d` a las 21:21:58Z (`candidato-develop/paridad-rutas.json`), y su `--selftest` (21:22:06Z) confirmó que el portón **puede** fallar: el replay correcto pasó **3/3** y los **3** mutantes (línea añadida, hunk que falta, archivo que no se borra) cayeron rojos (`candidato-develop/control-de-mutacion-porton.json`). Contrato de eje re-ejecutado en el árbol del candidato: **11/11**. `npm run qa:promotion:scope` → `ALCANCE DE PROMOCION VALIDO: rediseno-horarios-mallas-develop-20261126 (12 rutas…)` y `npm run qa:preqa:evidence` → `AUTORIZACION PRE-QA VALIDA`, con **1** waiver nombrado (`candidato-develop/waiver-instrumento.json`).

**Error propio de este corte, declarado.** Al guardar la corrida del control de mutación copié el artefacto sobre `candidato-develop/certification.json` y **casi pierdo la corrida buena**: la restauré desde el respaldo `.local/BUENA-candidato/` del worktree, el rojo quedó renombrado `control-mutacion-candidato.json` y su diagnóstico `diagnostico-hub-pantalla-anterior.json`. El daño real no fue ese —el archivo se recuperó— sino lo de la fila 1 de la tabla: **la primera corrida roja del candidato no dejó evidencia** porque las corridas sucesivas escriben en la misma carpeta `.local`. Desde este corte la corrida buena se respalda en un directorio con nombre propio antes de tocar cualquier artefacto versionado, y todo artefacto se escribe a una ruta nueva y se valida antes de existir.

## 7. Pendientes, con dueño

1. **Promover a `develop` y desplegar el candidato** —`equipo-apexos` + `apexos-git-guardian`—: requiere manifiesto de alcance v2 con el inventario exacto, `qa:promotion:scope`, `qa:preqa:evidence`, `qa:promotion:migration`, `qa:promotion:gates` y el portón de gobernanza con `APEXOS_PROMOTION_AUTH`. La orden del dueño autoriza `desarrollo -> develop` y el despliegue; no autoriza nada más.
2. **QA funcional en el ambiente desplegado** —`apexos-qa`—: repetir la tanda de controles contra el host y verificar por artefacto servido que el ambiente corre el candidato.
3. **`main`** —dueño—: **NO autorizado** en esta intervención; queda bloqueado hasta su orden expresa.
4. **GRANT de `platform_settings` en Producción** —dueño + `apexos-db-nube`—: pendiente ajeno a este frente, sigue sin decidir.
5. **Compuerta alterna de selfie y los cuatro pendientes del turno anterior** —dueño—: en pausa por orden expresa suya.
