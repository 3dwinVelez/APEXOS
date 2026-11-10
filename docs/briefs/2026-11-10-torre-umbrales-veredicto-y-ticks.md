# Brief — Torre de control: umbral en todos los medidores, veredicto medido por vista e historia en ticks

- **ID**: `2026-11-10-torre-umbrales-veredicto-y-ticks`
- **Fecha**: `2026-11-10`
- **Rama activa**: `desarrollo`
- **Prompt crudo**: "continuando con el trabajo en la torre de control necesito que todos los indicadores como api, modulos, base de datos, nube, operacion y el resumen se manejen con el de los servicios api, donde tengamos umbrales definidos de medicion, tambien es importante acotar la informacion que aparece en las diferentes etiquetas: ejemplo trafico actual, memoria, entre otros que sean realmente importantes no rellenar porque si, ya que para mi es importante el rendimiento de la maquina y no ver un monton de cosas tecnicas que quizas no me aporten valor" + "pero los monitores deberian verse con la latencia con tics todos los reportes y no veo que los hayas ajustado de esa manera"

## 1. Objetivo

Que cada monitor de las siete vistas-pregunta responda con la misma gramática de medición, y que esa medición tenga historia visible:

1. **Umbral por magnitud, no número suelto.** Todo medidor publicado sale de `lib/metrics.js` con su corte `óptimo/riesgo` versionado, su banda y su veredicto. El panel no decide ningún corte.
2. **Recorte de etiquetas.** Lo que no ayuda a decidir si la máquina está bien (`tráfico actual`, `Memoria RSS`, `Peticiones`, `Consultas lentas` repetido en Latencia) sale de la vista donde era relleno; la telemetría de proceso se queda, pero bandea con su corte en la vista API.
3. **Historia medida en ticks.** Cada tarjeta, componente, sonda, proveedor cloud, tesela de módulos y fila de base de datos pinta una franja de marcas: una por sondeo en el que ese monitor dejó una lectura real. Un sondeo sin lectura no pinta barra; pinta un pie que dice `N de M sondeos con lectura`.

Regla transversal, otra vez: **lo no medido no es cero**.

## 2. Alcance exacto

| Estado | Archivo | Qué cambia |
|---|---|---|
| `A` | `apps/control-tower/lib/monitor-history.js` | Anillo `MonitorHistory` (40 muestras por familia `gauges`/`components`/`checks`, por alcance de ambiente), `measuredSeries()` que arma la serie y aplica la banda al leer, y persistencia en `store.writeAux("monitor-history")`. |
| `M` | `apps/control-tower/server.js` | `attachIndicators(snapshot, telemetry, monitors)` adjunta `series` + `window` a gauges, componentes, checks propios, proveedores cloud y a la mesa del puesto; `collect()` persiste el anillo. Se eliminan los dos umbrales que el servidor reescribía a mano: `resumen` y `operacion` usan la pregunta canónica de `VIEW_QUESTIONS`. |
| `M` | `apps/control-tower/lib/metrics.js` | `bandFromEntry()` acepta las dos formas de la entrada (publicada con `limits` o crudo del catálogo); `VIEW_QUESTIONS` pasa a ser la única fuente de la pregunta de cada vista; `operationGauges()` publica sus dos medidores con umbral; la etiqueta que el dueño citó como relleno (`Tráfico actual`) se nombra por lo que mide: `Peticiones por minuto`. |
| `M` | `apps/control-tower/lib/cloud.js`, `apps/control-tower/lib/probes.js` | Publican `latencyMs` (`null` cuando no hubo llamada HTTP) y normalizan `latencyMs ?? latency_ms`. |
| `M` | `apps/control-tower/public/app.js` | `monitorTicks()`/`mapTick()` con alturas por banda y pie explicativo; llamadas en cloud, medidas, teselas API, mesa del puesto, sondas, componentes y las cinco teselas de Base de datos; `axisTicks` baja al segundo cuando la ventana medida dura menos de cinco minutos (si no, todas las marcas caen en el mismo `hh:mm` y el eje queda con una etiqueta). |
| `M` | `apps/control-tower/public/index.html` | Secciones y leyendas de las vistas-pregunta que reciben las franjas (mesa del puesto con su veredicto y sus dos medidores). |
| `M` | `apps/control-tower/public/styles.css` | `.monitor-ticks`, `.monitor-ticks-foot`, `.map-tick` por banda y su altura, más el alto acorde al `viewBox`. |
| `M` | `apps/control-tower/test/monitor-history.test.js` | 5 pruebas nuevas: solo se guardan lecturas medidas (camel y snake case), un sondeo sin lectura devuelve `null` y no almacena, `measuredSeries` salta huecos y banda al leer, el anillo rota y sobrevive el reinicio (y descarta datos corruptos), y el alcance `puesto` no se mezcla con `local`. |
| `M` | `apps/control-tower/test/ui-indicators.test.js` | Las teselas de Base de datos pasan de 6 a 5 y cada una pinta sus ticks; la pregunta de la vista se exige literal (`¿La base está rápida y con datos reales?`) y coincide con `VIEW_QUESTIONS`; una prueba nueva afirma las franjas por componente, sonda y proveedor cloud, incluida la frase honesta cuando no hubo lectura. |
| `M` | `apps/control-tower/test/metrics.test.js` | `bandFromEntry` probado desde el catálogo crudo (óptimo/riesgo/crítico), `informational` y `unknown` sin cortes. |
| `M` | `apps/control-tower/test/server.test.js` | Gate de publicación: los gauges, componentes y checks de cada ambiente y la mesa del puesto salen con `series` y `window`, y `data/monitor-history.json` queda escrito. |
| `M` | `scripts/certifications/apex-control-tower-local.js` | Gates nuevas y retargeteadas: `browser_cada_medidor_trae_su_historia`, `browser_componentes_y_sondas_con_historia`, `browser_datos_teselas_con_historia`, `browser_operacion_mesa_con_historia` (+ captura), `browser_telemetria_proceso_con_umbral` y `browser_tope_dibujado_en_su_ordenada`; `browser_performance_panel` pasa a exigir los **4** estadísticos y que los retirados no aparezcan; el eje exige dos horarios distintos. |
| `M` | `scripts/certifications/apex-control-tower-consolidado-local.js` | `navegador_rendimiento_con_memoria_y_uso` (relleno del recorte viejo) se reemplaza por `navegador_rendimiento_cuatro_estadisticos`, `navegador_telemetria_proceso_con_umbral` y `navegador_api_teselas_con_historia`, todas leyendo DOM **visible** de la vista API. |
| `M` | `docs/qa/evidence/apex-control-tower-f1/*` | Certificación local re-ejecutada: 73/73. |
| `A` | `docs/qa/evidence/apex-control-tower-f1/tower-vista-operacion.png` | Captura de la mesa del puesto con sus dos medidores bandeados y sus franjas. |
| `M` | `docs/qa/evidence/torre-consolidado-empresas-20261103/*` | Certificación consolidada re-ejecutada: 55/55. |
| `M` | `apps/control-tower/README.md` | Contrato de la historia medida, el recorte vigente por vista y los recuentos de ambas tuberías. |
| `M` | `agents/registry.json`, `agents/CHANGELOG.md` | Bumps y controles de los agentes dueños. |
| `M` | `agents/apexos-performance/SKILL.md` | Control de la historia medida por monitor y del anillo que no inventa muestras. |
| `M` | `agents/apexos-qa/SKILL.md` | Control de la gate que lee DOM visible y de re-certificar todas las tuberías que leen la misma pantalla. |
| `M` | `agents/apexos-seguridad/SKILL.md` | Control de la superficie del anillo persistido y del `title`/`aria-label` de las marcas. |
| `M` | `agents/apexos-brief/SKILL.md` | Control del inventario de tuberías de certificación que lee la superficie cambiada. |
| `M` | `agents/equipo-apexos/SKILL.md` | Control del entregable que se llena con el tiempo: se declara su cadencia, no se rellena con datos inventados. |
| `M` | `.qoder/skills/**` | Fuentes canónicas de los cinco agentes anteriores. |
| `A` | `docs/briefs/2026-11-10-torre-umbrales-veredicto-y-ticks.md` | Este brief. |

### Módulos (`change_intent.modules`)

- `control-tower`
- `certificaciones-control-tower`
- `agentes-gobernanza`

### Borrados autorizados (`allowed_deletions`)

- ninguno.

## 3. Fuera de alcance

- No se toca `apps/api/**` ni `apps/web/**`: el panel lee `/health` y `/api/v1/apex-control/status`, y la telemetría que falta en QA/PROD es de despliegue, no de código de la torre.
- No se habilitan ni se rotan credenciales: `RAILWAY_TOKEN`/`VERCEL_TOKEN`/`SUPABASE_ACCESS_TOKEN` y los JWTs de QA/PROD siguen siendo autorización del dueño (sección 10).
- No se promueve nada. `apps/control-tower/**` reposa solo en `desarrollo` y sus certificaciones no alimentan ningún gate de promoción.
- No se borra evidencia antigua ni se reescribe historia compartida.
- El anillo no se retrorellena: no se inventan muestras anteriores al arranque para que la franja se vea llena.

## 4. Restricciones

- Rama: solo `desarrollo`; push únicamente a `origin/desarrollo` al cierre. Prohibido `develop`, `main`, force push, merge, deploy, migraciones remotas e infraestructura sin autorización expresa.
- Ningún umbral vive en el navegador: las marcas pintan la banda que el servidor ya calculó (`bandFromEntry`), y el corte del p95 sale del presupuesto versionado por ambiente.
- La superficie publicada no crece: cada marca lleva hora, valor y banda; el anillo persistido (`apps/control-tower/data/monitor-history.json`, gitignored) guarda únicamente marca de tiempo, número y clave de monitor —sin rutas, tenants, usuarios ni payloads—.
- Secretos solo en `apps/control-tower/.env.local` (gitignored): no se imprimen, commitean, loguean ni van a evidencia.
- Frente en paralelo: `vibe_images/` está sin seguimiento y no es de esta intervención; no se toca, no se commitea y no se revierte.

## 5. Criterios de aceptación

1. `npm run control:test` → **157/157** verdes (5 pruebas nuevas de `monitor-history`, la tesela 5 de Base de datos, las franjas por monitor y la pregunta canónica de cada vista).
2. `npm run certify:control-tower:local` → **73/73** con `browser_cada_medidor_trae_su_historia`, `browser_componentes_y_sondas_con_historia`, `browser_datos_teselas_con_historia`, `browser_operacion_mesa_con_historia` y `browser_telemetria_proceso_con_umbral` verdes, y la captura `tower-vista-operacion.png` en evidencia.
3. `npm run certify:control-tower:consolidado` → **55/55** con `navegador_rendimiento_cuatro_estadisticos`, `navegador_telemetria_proceso_con_umbral` y `navegador_api_teselas_con_historia`.
4. Toda vista-pregunta muestra su veredicto con la pregunta literal de `VIEW_QUESTIONS` y sus medidores con `óptimo ≤ X, tope Y`; ninguna etiqueta retirada (`Memoria RSS`, `Peticiones` sueltas, `Consultas lentas` repetido en Latencia) reaparece en la vista donde era relleno, y la etiqueta que el dueño citó (`Tráfico actual`) ahora se nombra `Peticiones por minuto`.
5. Cada monitor pinta una franja por sondeo con lectura. Un monitor sin lectura en la ventana pinta el pie `N de M sondeos con lectura` o `ninguno dejó lectura de este monitor`, nunca una barra al 0 %.
6. En vivo, tras ~3 minutos de sondeos, `GET /api/status` devuelve `series` no vacías en los medidores de LOCAL (12 de 13), en los componentes medidos, en las sondas, en la mesa del puesto y en las 32 marcas del mapa de módulos.
7. El eje del gráfico de latencia conserva dos horarios distintos aunque el sondeo sea rápido (ventana < 5 min → etiquetas con segundos).

## 6. Evidencia y certificación exigida

- Pruebas unitarias: `apps/control-tower/test/*.test.js` vía `npm run control:test` (157/157).
- Certificaciones con navegador real: `npm run certify:control-tower:local` (73/73, `docs/qa/evidence/apex-control-tower-f1/`) y `npm run certify:control-tower:consolidado` (55/55, `docs/qa/evidence/torre-consolidado-empresas-20261103/`). Las dos tuberías leen el mismo panel, así que las dos se re-ejecutan en esta intervención.
- Lectura en vivo: `GET http://127.0.0.1:4310/api/status` sobre la torre del puesto, con el conteo de `series` por ambiente reportado en el cierre.
- `certification_status`: `local_passed_qa_pending`. La torre no se despliega; la mitad de nube (`QA`/`PROD` por proveedor) sigue bloqueada por despliegue y tokens, no por este código.

## 7. Capacidades protegidas

- **Umbral único en el servidor** — `lib/metrics.js` es la fuente; probado en `metrics.test.js` (`bandFromEntry` desde el catálogo crudo) y en las gates que exigen `óptimo ≤`/`tope`.
- **Historia medida por monitor** — anillo + `series`/`window` publicados y persistidos; probado en `monitor-history.test.js`, en el gate de publicación de `server.test.js` y en las cuatro gates de navegador.
- **No medido ≠ cero** — `finite()` no convierte `null` en `0`; un sondeo sin lectura no agrega muestra; probado en `monitor-history.test.js` y en la frase honesta del pie (`ui-indicators.test.js`, `browser_datos_*` con catálogo sin conteo).
- **Recorte sin pérdida de decisión** — los cuatro estadísticos de Latencia, la memoria bandea en la vista API con su corte; probado en `browser_performance_panel` y `navegador_rendimiento_cuatro_estadisticos`.
- **Superficie publicada agregada** — marca de tiempo + número + banda, sin rutas ni tenants; `server.test.js` y la revisión de `attachIndicators`.
- **Pregunta por vista desde una sola fuente** — `VIEW_QUESTIONS` afirmado literal en `ui-indicators.test.js` y comparado contra el servidor.

## 8. Riesgos y rollback

- Riesgo: la franja se ve medio vacía en el primer minuto porque el anillo arranca en cero → Mitigación declarada: el pie dice cuántos sondeos tienen lectura; no se retrorellena.
- Riesgo: `finite(null)` diera `0` y pintara barras de lecturas inexistentes; `bandFromEntry` leía solo `entry.limits` y pintaba gris el historial de la base; los componentes en `latency_ms` dejaban el anillo vacío → Mitigación: los tres casos tienen prueba propia en `monitor-history.test.js` y `metrics.test.js`.
- Riesgo: una gate que lee `textContent` de una sección oculta da verde sin que el dueño vea nada → Mitigación: las gates nuevas filtran por `offsetParent !== null` y leen la vista activa.
- Riesgo: la corrida real compite con la torre del puesto y `local_fuente_real` se pone rojo por carga → Mitigación: se detuvo la torre del escritorio durante la certificación y se volvió a levantar después; el timeout de sonda no se bajó.
- Riesgo: un perfil Chrome de certificación viejo deja `EBUSY` sobre `DevToolsActivePort` → Mitigación: reintento del arnés, ya registrado como carrera de arnés y no de producto.
- Rollback: `git revert` del commit de la torre revierte panel, anillo, pruebas, ambas certificaciones y evidencia juntos.

## 9. Supuestos y preguntas abiertas

- Supuesto: la cadencia de sondeo del puesto (`pollMs` 10 s) define el ancho real de la ventana de 40 muestras; con esa cadencia la historia visible cubre unos 6 minutos.
- Supuesto: el dueño acepta que una franja crezca desde ahora (no se rellena el pasado).
- Pregunta (no altera el alcance): si la historia debe mirar más atrás (ventana mayor o persistencia por día), es otra intervención con su propio cálculo de disco y cadencia.

## 10. Autorizaciones requeridas

- [x] Cierre en `desarrollo` con `git push origin desarrollo` (autorización permanente y acotada del propietario).
- [ ] Pendiente: tokens cloud (`RAILWAY_TOKEN`, `VERCEL_TOKEN`, `SUPABASE_ACCESS_TOKEN` + `ENV_*_PROJECT_ID`) en `apps/control-tower/.env.local` para que la vista Nube bandea por proveedor.
- [ ] Pendiente: despliegue en QA/PROD de un build con `apex-control` y telemetría de `/health`; hoy esos ambientes publican p95, errorRate y la sonda cloud, y el resto sale en gris por ausencia de dato.
- [ ] Pendiente (ajeno a la torre): decidir si `computeOverall` deja de dar `ok` a un ambiente con chequeos `unknown`.

## 11. Documentación, agentes y publicación (obligatoria)

- **Preflight de agentes**: `npm run agents:preflight -- --paths "apps/control-tower/**,scripts/certifications/**,docs/qa/**,docs/briefs/**,agents/**,.qoder/skills/**"` → veredicto `OK`, sin `INTEGRAR_REMOTO` ni `CONFLICTO`.
- **Agentes consultados**: `equipo-apexos`, `apexos-brief`, `apexos-git-guardian`, `apexos-performance`, `apexos-qa`, `apexos-seguridad`.
- **Documentación actualizada**: este brief y `apps/control-tower/README.md`.
- **Agentes actualizados**: `apexos-performance`, `apexos-qa`, `apexos-seguridad`, `apexos-brief`, `equipo-apexos` (bump semver + `updated_at` + `sha256` en `agents/registry.json` y entrada en `agents/CHANGELOG.md`).
- **Cobertura de contexto**: `npm run agents:coverage -- --paths "<inventario exacto>"` en verde.
- **Publicación obligatoria**: `git push origin desarrollo`. No cubre `develop`, `main`, force push, merges, migraciones remotas ni infraestructura.
