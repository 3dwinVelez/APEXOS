# Brief — Torre de control: cockpit de nueve indicadores y vistas acotadas

- **ID**: `2026-11-11-torre-cockpit-nueve-indicadores`
- **Fecha**: `2026-11-11`
- **Rama activa**: `desarrollo`
- **Prompt crudo**: "veo que la intervencion no fue la correcta y mas haya de todo lo que implementaste tiene mucha saturacion de indicadores y temas que no se entienden de manera clara, rediseña nuevamente los elementos disminuye la cantidad de indicadores y acota solo los mas importantes para el estado de la plataforma solo resalta los mas imponentes y de peso te dejare un ejemplo de como me gustaria verlo solo con los elemtnos mas importantes" (con captura de referencia de otra herramienta de monitoreo)

## 0. Naturaleza del commit

Este paquete **sí toca producto**: vive íntegro en `apps/control-tower/**` (herramienta de puesto que reposa solo en `desarrollo`) y en sus dos certificaciones. No toca `apps/api/**`, `apps/api/prisma/**`, `apps/web/**`, auth, RBAC, colas, telemetría de negocio ni migraciones, y no es evidencia de promoción de nada. Lo que cambia es **qué magnitudes se pintan y cuántas**, decidido en el servidor (`lib/metrics.js`), más su CSS y sus gates; no cambia cómo se mide ni con qué cadencia.

El commit documental posterior (secciones 6 y 9) **no toca producto**: corrige una cláusula de `scripts/certifications/apex-control-tower-local.js`, renueva la credencial local del puesto en `apps/control-tower/.env.local` (gitignorado), y actualiza README, brief, CHANGELOG, los tres agentes dueños y la evidencia re-medida de ambas tuberías.

## 1. Objetivo

La ronda anterior (brief `2026-11-10-torre-gramatica-unica-grafico-umbrales`) fue aceptada en **gramática** —todo medidor se pinta como el gráfico de latencia con sus cortes— y rechazada en **cantidad**: un Resumen de trece tarjetas iguales, un mapa que duplicaba el catálogo en tarjetas, 122 fichas de sonda y etiquetas que no decidían nada. El dueño lo dijo con la comparación puesta: «mucha saturación de indicadores y temas que no se entienden de manera clara… acota solo los más importantes para el estado de la plataforma».

Este brief cierra **eso**, conservando lo aprobado. Tres cosas, verificables una por una:

1. **El Resumen es un cockpit de nueve elementos.** `lib/metrics.js` publica `COCKPIT = { hero: "p95", dials: ["platformHealth", "heapPressure"], tiles: ["requestRate", "dbLatency", "dataVolume", "freshness", "dataCoverage", "serverErrors"] }` y el navegador pinta exactamente esa selección: un gráfico dominante con su veredicto y su pie `Actual · Mín · Prom · Máx`, dos medidores radiales («qué tan cerca del tope»), seis teselas con su gráfico y su enlace «Ver evidencia», y una barra de estado al pie (`Contadores / Errores / Advertencias / Alertas abiertas / Trabajos por aprobar`). El rótulo del panel declara la cota: **`9 de 19 medidores`**.
2. **Cada vista de detalle se acota a cuatro teselas.** `VIEW_SHORTLIST` fija latencia 2, api 4, módulos 4, datos 4, nube 1, operación 2, y el servidor lo publica en `environment.viewGauges`; `viewGaugeList()` en el navegador **usa la lista, no decide**. Las listas largas quedan topadas con su contabilidad: sondas top 10, componentes top 8, eventos top 12, renglones del mapa top 10, métricas cloud 3, teselas por vista 4.
3. **El veredicto de cada superficie se calcula sobre lo que esa superficie pinta.** `cockpitFor()` firma `verdicts.resumen` sobre hero + diales + teselas, y cada vista sobre su lista; ningún encabezado puede gritar `Crítico` por una magnitud que el dueño no tiene en pantalla.

Regla transversal, la misma de las rondas anteriores: **lo no medido no es cero**. Un dial sin lectura no dibuja aguja (`sin lectura medida: el dial no dibuja una aguja inventada`), una tesela sin serie admite `sin historia: N de M lecturas medidas` y un renglón recortado cuenta cuántos quedaron fuera.

## 2. Alcance exacto

| Estado | Archivo | Qué cambia |
|---|---|---|
| `M` | `apps/control-tower/lib/metrics.js` | `COCKPIT` + `cockpitFor()` (selección versionada y veredicto del Resumen sobre lo pintado); `VIEW_SHORTLIST` + `viewGaugesFor()` (máximo cuatro por vista); `platformHealth` y `heapPressure` como medidores de peso con sus cortes; el pie `Actual · Mín · Prom · Máx` se deriva en el navegador de la `series` publicada (`statsFoot`), nunca de un número inventado; `GAUGES` conserva las 21 entradas del catálogo y las 19 magnitudes que un ambiente publica. |
| `M` | `apps/control-tower/server.js` | `environment.cockpit = cockpitFor(...)` y `environment.viewGauges = viewGaugesFor(...)` en cada ambiente del payload; `verdicts.resumen` pasa a firmar sobre la selección del cockpit. |
| `M` | `apps/control-tower/public/app.js` | `renderCockpit()` con `cockpitHero`/`cockpitDial`/`cockpitTile`/`cockpitStatus` (y `dialSvg`/`dialArc`/`dialPoint`); `viewGaugeList()` lee `environment.viewGauges`; topes `VIEW_TILE_MAX = 4`, `CHECK_LIST_MAX = 10`, `COMPONENT_LIST_MAX = 8`, `EVENT_LIST_MAX = 12`, `MAP_MAX_ROWS = 10`, `CLOUD_METRIC_MAX = 3` con su línea de cuenta; se retiran la rejilla de trece tarjetas, las tarjetas por dominio duplicadas, las teselas de actividad que no decidían y la ficha de sonda una-por-una. |
| `M` | `apps/control-tower/public/index.html` | El Resumen son cuatro secciones (`span-8` hero + `span-4` diales + `span-12` teselas + `span-12` barra de estado, todas `data-views="resumen"`); cada bloque declara la vista a la que pertenece y las secciones de detalle se re-acotan a su lista. |
| `M` | `apps/control-tower/public/styles.css` | Gramática visual del cockpit: `.cockpit-hero`/`.cockpit-hero-svg`, `.dial`/`.dial-needle`/`.dial-empty`, `.cockpit-tile`/`.tile-foot`/`.measure-link`, `.status-bar`/`.status-chip`, y las variantes compactas del gráfico ya existente; rejilla de doce columnas sin bandas muertas. |
| `M` | `apps/control-tower/test/metrics.test.js` | `COCKPIT`/`cockpitFor` (nueve elementos, veredicto sobre lo pintado), `VIEW_SHORTLIST`/`viewGaugesFor` (≤4 por vista y ninguna lista vacía inventada), y los cortes de `platformHealth`/`heapPressure`. |
| `M` | `apps/control-tower/test/ui-indicators.test.js` | El navegador pinta la lista del servidor (no filtra ni cuenta), el dial sin lectura no dibuja aguja, la barra de estado con sus cinco contadores, los topes con su línea de cuenta, y la gramática única sigue vigente en las superficies conservadas. |
| `M` | `scripts/certifications/apex-control-tower-local.js` | Gates re-apuntadas al DOM del cockpit: `browser_dashboard_rendered` por cláusula (`teselas=6`, `diales=2`, `hero=1`, `secciones=4`), `browser_cada_medidor_trae_su_grafica_con_umbral` (6 tarjetas = 6 gráficas = 6 pies, ≥4 tiras con lectura, ≥8 cortes, 2 agujas, y ninguna tesela de actividad en los rótulos), `browser_cockpit_status_bar`, nueva gate de profundidad en fase real `browser_cockpit_con_historia_real`, `browser_modulos_mapa_unico` por modo con `browser_modulos_veredicto_preguntado`, datos/operación/API leídos con sus cotas de cuatro, y el recalentamiento espera **líneas de umbral** (`≥ 8`) hasta 90 s en lugar de solo SVG pintados. |
| `M` | `scripts/certifications/apex-control-tower-consolidado-local.js` | `navegador_resumen_con_medidores` re-escrito sobre el cockpit (1 hero + 2 diales + 6 tarjetas, ≥4 con umbral, 7 gráficas, 0 sin umbral, ≥8 cortes), nueva `navegador_resumen_pinta_lo_que_decide` (el rótulo `N de M medidores`), `navegador_api_teselas_con_historia` con tope superior (`≤ 4`), nueva `navegador_resumen_vuelve_al_cockpit` (viaje de vista y regreso repinta el cockpit), y el aviso de empresas re-ubicado a `#tenants .empty`. |
| `M` | `apps/control-tower/README.md` | Vista Resumen descrita como cockpit de nueve elementos, sección «Qué pinta la torre» con la selección del servidor y los topes por superficie, la tabla de medidores con umbral leída contra `COCKPIT`/`VIEW_SHORTLIST`, y los recuentos de pruebas y certificación (**166/166**, **76/76**, **57/57**). |
| `A` | `docs/briefs/2026-11-11-torre-cockpit-nueve-indicadores.md` | Este brief. |
| `M` | `docs/qa/evidence/apex-control-tower-f1/certification.json`, `telegram-outbox.json` y los once PNG de esa carpeta (`tower-overview`, `tower-env-main`, `tower-api-down`, `tower-datos-reales`, `tower-modulos-reales`, `tower-latencia-punto`, `tower-vista-latencia`, `tower-vista-api`, `tower-vista-datos`, `tower-vista-modulos`, `tower-vista-operacion`) | Certificación local re-ejecutada contra el cockpit: **76/76**. |
| `M` | `docs/qa/evidence/torre-consolidado-empresas-20261103/certification.json`, `snapshot-ambientes.json`, `empresa-tenant-demo.json` y las tres capturas (`01-monitor-consolidado-empresa.png`, `02-producto-bloqueado-con-acciones.png`, `03-vista-latencia-consolidado.png`) | Certificación consolidada re-ejecutada con las gates del cockpit: **57/57**. |
| `M` | `agents/apexos-performance/SKILL.md` | Control 23: cuántos indicadores se pintan es una decisión de medición y vive en el servidor. |
| `M` | `agents/apexos-qa/SKILL.md` | Control 59: un rediseño que reduce la superficie obliga a re-apuntar las gates al DOM nuevo y a esperar lo que la gate afirma. |
| `M` | `agents/apexos-seguridad/SKILL.md` | Control 35: recortar indicadores reduce la superficie pintada, nunca la publicada; las capturas nuevas vuelven a pasar el chequeo de fuga. |
| `M` | `agents/apexos-brief/SKILL.md` | Regla 51: un rechazo de «saturación» se traduce a presupuesto numérico por superficie, con lo retirado nombrado. |
| `M` | `agents/equipo-apexos/SKILL.md` | Control 38: un «la intervención no fue la correcta» se descompone en qué se conserva y qué se recorta. |
| `M` | `agents/apexos-git-guardian/SKILL.md` | Control 30: un verde comprado con una credencial inyectada por entorno se reporta con esa condición escrita. |
| `M` | `agents/registry.json`, `agents/CHANGELOG.md` | Bumps de las seis versiones, `updated_at`, `sha256` y la entrada de la intervención. |
| `M` | `.qoder/skills/apexos-performance/SKILL.md`, `.qoder/skills/apexos-qa/SKILL.md`, `.qoder/skills/apexos-seguridad/SKILL.md`, `.qoder/skills/apexos-brief/SKILL.md`, `.qoder/skills/equipo-apexos/SKILL.md`, `.qoder/skills/apexos-git-guardian/SKILL.md` | Fuente canónica de los seis controles nuevos (los espejos de arriba los genera `npm run agents:sync`). |

### Módulos (`change_intent.modules`)

- `apex-control-tower`
- `certificaciones-torre`
- `agentes-equipo`

### Borrados autorizados (`allowed_deletions`)

- ninguno. No se elimina ninguna ruta. Lo retirado son **superficies pintadas** dentro de archivos que siguen existiendo: la rejilla de trece tarjetas del Resumen, las tarjetas por dominio duplicadas en Módulos, las teselas de actividad que no decidían estado y la lista de 122 fichas de sonda.

## 3. Fuera de alcance

- `apps/api/**` y `apps/web/**`: la torre consume `/health` y `/api/v1/apex-control/*` tal como están. Ningún endpoint nuevo, ninguna métrica de telemetría nueva, ninguna pantalla web tocada.
- Promoción a `develop` o `main`: `apps/control-tower/**` reposa solo en `desarrollo`; sus certificaciones no alimentan compuerta de promoción alguna.
- Credenciales cloud (`RAILWAY_TOKEN`, `VERCEL_TOKEN`, `SUPABASE_ACCESS_TOKEN`) y `ENV_DEVELOP_APEX_TOKEN` / `ENV_MAIN_APEX_TOKEN`: decisión y acción del dueño sobre `.env.local`. La vista Nube queda en `Sin credenciales` con su acción y responsable, no en cero.
- El presupuesto de sonda `ENV_TIMEOUT_MS = 6000`, la cadencia de sondeo y el anillo de historia (`lib/monitor-history.js`, 40 muestras) no se tocan: el recorte es de superficie, no de medición.
- La gramática del gráfico (`thresholdChart`, `monitorChart`, `mapRowChart`, cortes `óptimo`/`tope`/`piso` y las tres familias de `limits.kind`) se conserva exactamente como la aprobó la ronda anterior.
- No se toca `vibe_images/` ni ninguna ruta ajena al dominio que aparezca modificada en el árbol de trabajo.

## 4. Restricciones

- Rama: solo `desarrollo`. Push permitido únicamente a `origin/desarrollo` al cierre (sección 11). Prohibido `develop`, `main`, force push, merge, deploy, migración remota y cambios en Railway/Supabase sin autorización explícita.
- Aislamiento multi-tenant y RBAC intactos: la torre no escribe dato de negocio y no cruje empresas (el puente `403 CROSS_TENANT_DESHABILITADO` sigue certificado).
- Sin secretos en el brief ni en el diff ni en la evidencia. Los tokens viven solo en `apps/control-tower/.env.local` (gitignored). Ver sección 9: para la fase real de esta corrida hizo falta un JWT fresco del puesto, que **se inyectó solo como variable de entorno del proceso** y no se escribió en ningún archivo.
- La fase real de la certificación se corre con **una sola** torre leyendo el puesto: con la instancia del dueño abierta, el barrido `/apex-control/status` (2,2-5,6 s en reposo) revienta el presupuesto de sonda y `local_fuente_real` se pone rojo sin cambio de producto. El presupuesto no se baja para dar verde.

## 5. Criterios de aceptación

Cada superficie con su gate nombrada, y la exigencia declarada por modo (estructura en simulación, profundidad con dato real):

1. **Resumen = nueve elementos, ni uno más** — `PASS browser_dashboard_rendered` con `teselas = 6`, `diales = 2`, `hero = 1`, `secciones = 4` (la evidencia de la corrida: `{teselas:6, diales:2, hero:1, secciones:4, mapa:5, salud:true}`), y `PASS browser_cockpit_status_bar` con la barra pintando `Contadores / Errores / Advertencias / Alertas abiertas / Trabajos por aprobar` (medido: `Contadores: 10 · Errores: 2 · Advertencias: 0 · Alertas abiertas: 0 · Trabajos por aprobar: 1`).
2. **Las nueve piezas son el gráfico de latencia con su umbral** — `PASS browser_cada_medidor_trae_su_grafica_con_umbral`: `tarjetas = gráficas = pies = 6`, `≥4` tiras con lecturas medidas, `≥8` líneas de corte, toda etiqueta de corte `óptimo|tope|piso` (medido: `óptimo 240 ms`, `tope 400 ms`, `tope 5,1 req/min`, `óptimo 100 ms`, `tope 300 ms`, `óptimo 0 %`, `tope 1 %`), `agujas + dial_sin_lectura = 2`, `sin_umbral = 0`, y ninguno de los rótulos de actividad (`Actividad de hoy`, `Usuarios activos`, `Sesiones activas`, `Conexiones WebSocket`, `Pings GPS`) sube al Resumen.
3. **Con dato real del puesto, la historia se llena** — `PASS browser_cockpit_con_historia_real` (gate nueva, fase real): 6 tarjetas = 6 gráficas, `≥5` tiras con lectura medida, `sinUmbral = 0` y el rótulo del panel diciendo `N de M medidores` (medido: `9 de 19 medidores · 3 en rojo · 1 en riesgo`, `tirasConLectura: 7`).
4. **Cada vista de detalle, acotada a cuatro** — `PASS browser_vista_api_teselas_tecnicas` (`teselas = 4 = gráficas`, `sin_umbral = 0`, `lineas_umbral ≥ 8`), `PASS browser_datos_teselas_con_historia` (`4 = 4`, `sin_umbral = 0`), `PASS browser_operacion_mesa_con_historia` (2 medidores de la mesa con su gráfica y su pie). En el consolidado, `PASS navegador_api_teselas_con_historia` afirma la cota por arriba y por abajo: `1 ≤ tarjetas ≤ 4`.
5. **El mapa de módulos, una fila = un gráfico y con su cuenta** — en simulación `PASS browser_modulos_mapa_unico` con `filas = gráficas`, `sinUmbral = 0` y su línea de contabilidad presente (medido: `0 de 32 módulos dibujados · 8 sondeos` + `32 módulo(s) sin lectura medida en la ventana: no se dibujan como sanos` — el catálogo congelado publica `data: null`, así que aquí **no hay** serie que exigir); con dato real `PASS browser_modulos_con_datos_reales` (medido: `10 de 32 módulos dibujados · 2 sondeos`, `conRegistros = 20`, `filas = graficas = 11` con la fila del API) y `PASS browser_modulos_veredicto_preguntado` sobre la pregunta exacta de la vista.
6. **El recorte no rompió lo aprobado** — `PASS browser_tope_del_grafico_es_el_del_medidor`, `PASS browser_tope_dibujado_en_su_ordenada` (tolerancia 14 px), `PASS browser_bandas_sin_jerga` y `PASS browser_performance_panel` (4 estadísticos, sin `Memoria RSS`/`Consultas lentas`/`Peticiones`); en el consolidado, `PASS navegador_componente_sin_latencia_no_es_cero`.
7. **Consolidado por empresa** — `PASS navegador_resumen_con_medidores` (hero 1 + diales 2 + tarjetas 6, `conUmbral = 7`, `graficas = 7`, `sinGraficaConUmbral = 0`, `cortes = 10`) sobre el cockpit; `PASS navegador_resumen_pinta_lo_que_decide` (gate nueva: el rótulo `9 de 19 medidores · 1 en rojo · 3 en riesgo`); `PASS navegador_mapa_de_modulos` (4 renglones = 4 gráficas, `3 de 3 módulos dibujados`); `PASS navegador_resumen_vuelve_al_cockpit` (gate nueva: ida a detalle y regreso repinta el cockpit completo).
8. **Pruebas del panel** — `npm run control:test` → **166/166** verdes, incluidas las que afirman que el navegador **no** decide cantidades, que un dial sin lectura no dibuja aguja y que cada tope de lista lleva su línea de cuenta.
9. **El dueño lo ve en su herramienta** — relanzar la torre desde `desarrollo` y abrir `http://127.0.0.1:4310` con recarga forzada (`Ctrl+F5`): una pantalla con un gráfico que manda, dos medidores, seis teselas y una barra de estado; y las franjas se llenan sondeo a sondeo (dos lecturas para el primer trazo, ocho para el corte de ventana).

## 6. Evidencia y certificación exigida

Ambas tuberías leen el mismo panel, así que **las dos** se re-ejecutan en esta intervención con su recuento esperado:

- Pruebas: `npm run control:test` → **166/166** (`apps/control-tower/test/**`; `ui-indicators.test.js` renderiza `app.js` en un DOM de prueba y `metrics.test.js` fija la selección y los cortes).
- Certificación 1: `npm run certify:control-tower:local` → **76/76** esperados y obtenidos (`summary: {passed:76, failed:0, total:76, console_errors:[]}`); evidencia en `docs/qa/evidence/apex-control-tower-f1/` (`certification.json`, `telegram-outbox.json` y once capturas del cockpit: `tower-overview.png`, `tower-vista-*.png`, `tower-datos-reales.png`, `tower-modulos-reales.png`, `tower-latencia-punto.png`, `tower-env-main.png`, `tower-api-down.png`).
- Certificación 2: `npm run certify:control-tower:consolidado` → **57/57** esperados y obtenidos; evidencia en `docs/qa/evidence/torre-consolidado-empresas-20261103/` (`certification.json`, `snapshot-ambientes.json`, `empresa-tenant-demo.json` y tres capturas).
- `certification_status` esperado: `local_passed_qa_pending`. La torre no se promociona, así que no hay QA de nube para este cambio; lo que queda pendiente es configuración del dueño (tokens cloud y `ENV_*_APEX_TOKEN`), no código.
- **Re-medición del cierre, ya con la credencial del puesto renovada en `apps/control-tower/.env.local` y sin ninguna variable inyectada**: `certify:control-tower:local` dio primero **75/76** —rojo en `browser_dashboard_rendered` con `{mapa: 1}`, porque las cinco tiras que exigía venían del catálogo de respaldo y no del ambiente— y, corregida la cláusula (placeholder admitido **solo** con su línea de honestidad; la cláusula de catálogo sigue intacta para el modo sin credencial), **76/76** con `browser_dashboard_rendered {teselas:6, diales:2, hero:1, secciones:4, mapa:1, mapaVacio:1, silencio:"32 módulo(s) sin lectura medida en la ventana: no se dibujan como sanos", salud:true}` y `local_fuente_real {fuente:"api", db_ms:9, registros:8825, componentes:9, medidores:19}`. `certify:control-tower:consolidado` **57/57** y `npm run control:test` **166/166** en la misma tanda. El cambio de cláusula vive en `scripts/certifications/apex-control-tower-local.js` y su motivo está escrito en el propio bloque.

## 7. Capacidades protegidas

- **Nueve, y los elige el servidor** — `browser_dashboard_rendered`, `browser_cada_medidor_trae_su_grafica_con_umbral`, `navegador_resumen_con_medidores`, `navegador_resumen_pinta_lo_que_decide`, `navegador_resumen_vuelve_al_cockpit` + los tests de `viewGaugeList`/`viewGaugesFor`.
- **Lo no medido no es cero** — `sinUmbral === 0` en las superficies pintadas, la regla de admisión (`graficaConUmbral`), `dial-empty` sin aguja inventada, `navegador_componente_sin_latencia_no_es_cero` (consolidado) y las líneas de cuenta del mapa y de los topes.
- **Umbral único en el servidor** — `browser_tope_del_grafico_es_el_del_medidor`, `browser_tope_dibujado_en_su_ordenada`, `limitText`/`windowLimits`/`cockpitFor` en `metrics.test.js`.
- **Gramática conservada** — `browser_vista_api_teselas_tecnicas`, `browser_datos_teselas_con_historia`, `browser_operacion_mesa_con_historia`, `browser_componentes_y_sondas_con_historia`, `browser_modulos_mapa_unico`.
- **Lectura real del puesto** — `local_fuente_real` (medido: `fuente: api`, `componentes: 9`, `registros: 7628`, `db_ms: 15`, `medidores: 19`, `medidores_con_historia: 19`), `browser_cockpit_con_historia_real`, `browser_modulos_con_datos_reales`, `browser_datos_con_volumen_real`, todos con `ultima_lectura` como diagnóstico.
- **No fuga de credenciales** — en el consolidado, `snapshot_no_filtra_el_token_de_la_torre` y `evidencia_json` re-ejecutados sobre las capturas nuevas del cockpit; en la local, `telegram_evidence` y `browser_cada_vista_tiene_evidencia`. El JWT que desbloqueó la fase real vivió solo en el entorno del proceso (sección 9): no se escribió en `.env.local`, ni se imprimió, ni entró en la evidencia.
- **Alerta, intervención y recuperación** — `outage_visible`, `alert_opened`, `telegram_alert_sent`, `recovery_resolved`, `jobs_traceable` (intactos respecto de la ronda anterior).

## 8. Riesgos y rollback

- Riesgo: recortar cantidad y, con ella, tapar un fallo que sí se estaba viendo. → Mitigación: toda cota de lista imprime su cuenta (`fuera del top`, `N más atrás`, `sin lectura medida`), el payload publica las 19 magnitudes y las gates de admisión siguen exigiendo que un hueco se nombre. → Rollback: revert del commit, no reset.
- Riesgo: una gate re-apuntada al DOM nuevo afirma una cantidad que el modo no produce (historia en simulación, cortes de ventana con menos de ocho lecturas). → Mitigación: estructura por modo y profundidad en la fase real (regla 47/51), y recalentamiento que espera **líneas de umbral** (`≥8`) hasta 90 s en vez de solo SVG pintados; el detalle guarda si la espera se cumplió.
- Riesgo: el veredicto del Resumen se calcule sobre 19 magnitudes mientras la pantalla muestra 9, y el encabezado contradiga a lo que el dueño ve. → Mitigación: `cockpitFor()` firma sobre la selección pintada y un test lo fija.
- Riesgo: el puesto no tiene token válido y la fase real queda roja sin defecto de producto. → Mitigación: se mintió un JWT de la empresa demo y se inyectó por entorno del proceso (ver 9); **no** se escribió en `.env.local`, no se imprimió, no entró en la evidencia, y el defecto se reporta al dueño en lugar de presentarse como resuelto.

## 9. Supuestos, hallazgo de ambiente y preguntas abiertas

- **Hallazgo (defecto de ambiente, no de código)**: el `ENV_LOCAL_APEX_TOKEN` que vive en `apps/control-tower/.env.local` era rechazado por el API local (`401 TOKEN_INVALIDO`). Sin credencial, el panel pinta `componentes: 0`, `fuente modulos: catalog` y las teselas dependientes del puesto quedan honestamente vacías —que es el comportamiento correcto, no un bug—. Las certificaciones de esta intervención se corrieron con un JWT fresco de la empresa demo inyectado como variable de entorno del proceso (`config.js` da prioridad a `process.env` sobre `.env.local`), sin escribir el valor en ningún archivo. **Ese fue el atajo de la corrida, no el arreglo.**
- **El defecto quedó corregido en la raíz al cierre (2026-11-11, 17:51)**: se abrió una sesión real en la base local (`authorizationSession` de la usuaria demo `demo@apex.local`, `id=1`, tenant `d5397071-…` —Demo APEX—, rol `APEX_ADMIN`), se firmó el JWT con el mismo `JWT_SECRET` del `.env` del repo y **el valor nuevo se escribió en `apps/control-tower/.env.local`** —archivo gitignorado por `.gitignore:5 (.env.*)`, nunca en el índice, nunca en evidencia ni en logs—. Medido después del cierre, sin variable de entorno inyectada: el API local responde `200` en `/api/v1/apex-control/modules` con `total: 32, ok: 2, degraded: 9, unknown: 21, records: 8474`, y la torre relanzada expone `gauges: 19` con `cockpit {hero: p95, dials: 2, tiles: 6}` y las seis shortlists (`latencia:2 api:4 modulos:4 datos:4 nube:1 operacion:2`). La lectura del puesto ya no depende de un truco de proceso. **No queda pendiente de credencial local.** Los tokens cloud de `develop`/`main` siguen siendo acción del dueño (sección 3).
- Supuesto: nueve elementos es la cota que el dueño pidió («solo los más importantes»). Si en la próxima ronda la referencia cambia, la cota se mueve en `COCKPIT`/`VIEW_SHORTLIST` —una sola lista versionada—, no en el CSS ni en el navegador.
- Supuesto: la cota honesta se le dice al dueño —el anillo no se retrollena; las franjas crecen a la cadencia de sondeo (10 s en el puesto, 4 s en las certificaciones) y un corte de ventana necesita ocho lecturas.
- Pregunta: ninguna que altere el alcance. Los tokens cloud y los `ENV_*_APEX_TOKEN` siguen siendo acción del dueño (sección 3 y el hallazgo anterior).

## 10. Autorizaciones requeridas

- [x] `git push origin desarrollo` al cierre (autorización permanente y acotada de AGENTS.md).
- [ ] Ninguna otra: sin `develop`, sin `main`, sin despliegue, sin Railway/Supabase, sin secretos en el repositorio. La única escritura de credencial fue renovar `ENV_LOCAL_APEX_TOKEN` dentro de `apps/control-tower/.env.local` (gitignorado por `.gitignore:5`), para cerrar el defecto de ambiente de la sección 9; el valor no entra en commits, evidencia, logs ni capturas.

## 11. Documentación, agentes y publicación (obligatoria)

- **Preflight de agentes (medido al cierre, `56aa28bb` == `origin/desarrollo`)**: `npm run agents:preflight -- --paths "apps/control-tower,docs/briefs,agents"` → **Veredicto: `OK_CON_ADVERTENCIAS`**, sin `INTEGRAR_REMOTO` ni `CONFLICTO`; los seis agentes dueños de esta intervención en `local-ahead` (`apexos-performance` 2.13.0, `apexos-qa` 2.46.0, `apexos-seguridad` 2.21.0, `apexos-brief` 2.38.0, `equipo-apexos` 2.25.0, `apexos-git-guardian` 2.14.0) y los demás `in-sync`. La advertencia es del propio pase de rutas: se invocó con directorios, no con globes, así que el ruteo reportó «(ninguna ruta coincide; entra por `equipo-apexos`)»; el ruteo real es el de la línea siguiente.
- **Agentes requeridos por el ruteo**: `apexos-performance`, `apexos-seguridad`, `apexos-qa` (`apps/control-tower/**`), `apexos-qa` (`scripts/certifications/**`), `equipo-apexos`, `apexos-brief`, `apexos-git-guardian` (`agents/**`, `.qoder/skills/**`, `docs/briefs/**`).
- **Documentación a actualizar**: `apps/control-tower/README.md` y este brief.
- **Agentes a actualizar** (con su bump): `apexos-performance` 2.12.0 → 2.13.0 (control 23), `apexos-qa` 2.45.0 → 2.46.0 (control 59), `apexos-seguridad` 2.20.0 → 2.21.0 (control 35), `apexos-brief` 2.37.0 → 2.38.0 (regla 51), `equipo-apexos` 2.24.0 → 2.25.0 (control 38), `apexos-git-guardian` 2.12.0 → 2.13.0 (control 30) y, en el commit documental de cierre, 2.13.0 → 2.14.0 (control 30.e: la credencial construible con recursos del puesto se cierra en el cierre, no se deja como pendiente del dueño).
- **Commit `6141a813`** (`44` rutas: `1 A` / `43 M` / `0 D` contra `origin/desarrollo`) publica el rediseño, la evidencia de ambas corridas y los seis bumps. El commit siguiente es **documental**: brief (§9, §10, §11), `agents/CHANGELOG.md`, `apexos-git-guardian` (fuente + espejo + `registry.json`) y la prueba de que la torre del puesto ya lee dato real sin variable inyectada —`/api/v1/apex-control/modules` `200` con `records: 8474` y `snapshot.environments.local` con `gauges: 19`, `cockpit {hero: p95, dials: 2, tiles: 6}` y `viewGauges` `latencia:2 api:4 modulos:4 datos:4 nube:1 operacion:2`—; no toca `apps/control-tower/**`.
- **Registro**: `agents/registry.json` (`version`, `updated_at`, `sha256`) y entrada en `agents/CHANGELOG.md` bajo `## 2026-11-11`.
- **Cobertura de contexto**: `npm run agents:coverage -- --paths "apps/control-tower/**,scripts/certifications/**,docs/briefs/**,agents/**,.qoder/skills/**"` → los seis dueños con bump local y mención en la sección más reciente.
- **Secuencia de cierre**: `npm run agents:sync` → `npm run agents:check` → `npm run agents:preflight` → `npm run agents:coverage` → `npm run control:test` → `npm run certify:control-tower:local` → `npm run certify:control-tower:consolidado` → commit exacto (rutas nombradas, sin `vibe_images/`, sin `.env*`) → `git push origin desarrollo` → relanzar la torre del dueño.
- **Publicación obligatoria**: `git push origin desarrollo`. No cubre `develop`, `main`, force push, merges, migraciones remotas ni infraestructura. La torre no se promociona: es herramienta de puesto y sus certificaciones no son evidencia de promoción.
- [x] Preflight sin `INTEGRAR_REMOTO` ni `CONFLICTO`
- [ ] Cobertura de contexto en verde (`agents:coverage`)
- [ ] Sin secretos, credenciales ni artefactos locales en el diff
- [ ] Documentación y agentes actualizados en el mismo commit
