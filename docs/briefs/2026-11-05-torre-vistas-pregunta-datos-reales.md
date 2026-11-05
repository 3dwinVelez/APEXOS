# Brief — Torre de control: siete vistas-pregunta con datos reales por fuente

- **ID**: `2026-11-05-torre-vistas-pregunta-datos-reales`
- **Fecha**: `2026-11-05`
- **Rama activa**: `desarrollo`
- **Prompt crudo**: "continua con las tareas pendientes y termina el rediseño garantizando conexiones reales a los ambientes, api, base de datos etc.. … la informacion aun no carga con la realidad de cada uno de los ambientes, cuenta con saturacion de informacion sin ordenar en vistas claras e independientes … mi finalidad con esta torre de control mas haya de ver datos tecnicos es poder ver como esta el estado de latencia? la velocidad de los datos es optima? los modulos estan optimos? el api responde bien? los servicios de railway estan bien? volumen de datos de la base con supabase? la base de datos esta optima y rapida? el api esta optima con las peticiones que tiene? … de manera dinamica no con la informacion regada, usando el semaforo de colores … el pin debe ser 100 ms optimo y estamos en 150 ms, eso en la grafica de lineas sobrepasa el umbral de latencia y debe ser atendido o solo esta teniendo picos por algun evento?"

## 1. Objetivo

Que la torre responda a cada pregunta del propietario en su propia vista, con cifras leídas del ambiente que se está mirando, sin regar la información por la pantalla:

1. ¿Está rápido el sistema? → **Latencia** (medidor + gráfico con el tope dibujado + veredicto sostenido vs pico).
2. ¿El API responde bien? → **API** (filas por componente con su latencia real y su banda).
3. ¿Los módulos están óptimos? → **Módulos** (mapa único vs API con ticks medidos).
4. ¿La base está óptima y con volumen real? → **Base de datos** (consolidado por empresa + memoria/uso del API).
5. ¿Los servicios de la nube están bien? → **Nube** (Railway, Vercel, Supabase medidos o con la variable que falta).
6. ¿Qué está pasando en el puesto? → **Operación** (git, trabajos, alertas, Telegram).
7. Visión de un vistazo sin saturación → **Resumen** (medidores con umbral y mapa, cero teselas).

Regla transversal que sostiene el objetivo: **lo no medido no es cero**. Un componente sin `latency_ms` publicada se lee `sin medición`; un ambiente sin build con `apex-control` se lee bloqueado con su código y su acción, nunca heredando cifras de otro ambiente.

## 2. Alcance exacto

| Estado | Archivo | Qué cambia |
|---|---|---|
| `M` | `apps/control-tower/lib/metrics.js` | `PROBE_BUDGET_MS` por ambiente (`local 400 / develop 900 / main 1400`, sobrescribible con `PERF_PROBE_P95_*`), `p95Definition`, `latencyVerdict` (sostenido vs pico con regla "N/M muestras sobre X ms · racha máxima K"), `componentBand`/`componentBands`, `measuredValue` exportado y el medidor `dbLatency` con cortes 100/300 ms. |
| `M` | `apps/control-tower/lib/probes.js` | `normalizeComponents` conserva `latency_ms`/`score` como medición real (`measuredValue`, no 0) y `probeApexControl` publica los componentes del ambiente con su timeout propio; `probeFromStatus` aplica la misma regla. |
| `M` | `apps/control-tower/lib/telemetry.js` | `record()` pasa el id del ambiente a `moduleTicks`, para que los ticks queden bandeados con el presupuesto de su propio ambiente. |
| `M` | `apps/control-tower/server.js` | `attachIndicators` adjunta `gauges`, `components` bandeados, `moduleHistory` y `latency` (veredicto firmado por el servidor sobre la serie medida). |
| `M` | `apps/control-tower/public/index.html` | Navegador de siete vistas (`data-view`) y secciones marcadas con `data-views`; paneles **Componentes del API**, **Veredicto de latencia**, **Monitor consolidado por empresa** y **Credenciales cloud** en su vista. |
| `M` | `apps/control-tower/public/app.js` | `applyView` + `LEGACY_VIEWS` + `state.view` persistido; `measuredNumber` como regla cliente; `renderGauges`, `renderModuleMap`, `renderComponents` (latencia real / `sin medición`), `renderPerformance`, `renderDatabase`, `consolidatedTiles` (7 teselas), `companyTiles` (6 teselas) y el selector de empresa que se deselecciona al cambiar de ambiente. |
| `M` | `apps/control-tower/public/styles.css` | Pestañas de vista, veredicto con tope dibujado, filas de componente con su columna de milisegundos y panel consolidado; reglas móviles. |
| `M` | `apps/control-tower/test/metrics.test.js` | Presupuestos por ambiente, `p95Definition`, `latencyVerdict` (dentro/fuera/picos), bandas de componente y `measuredValue` con null/NaN/vacío. |
| `M` | `apps/control-tower/test/probes.test.js` | Componentes normalizados desde `/apex-control/status`: latencia ausente ≠ 0 y banda derivada del servidor. |
| `M` | `apps/control-tower/test/ui-indicators.test.js` | Render real en `node:vm`: fila de componente con `sin medición`, veredicto con su regla, teselas solo en su vista y consolidado con memoria/uso. |
| `M` | `scripts/certifications/apex-control-tower-local.js` | **Fase real** contra el API del puesto: exige ≥6 componentes leídos de `/apex-control/status`, `base responde en [\d.,]+ ms`, memoria/uso publicados, el mapa con la fila del API y capturas por vista (`tower-vista-latencia/api/datos/modulos.png`, `tower-datos-reales.png`, `tower-modulos-reales.png`). `Cdp.evaluate` ahora divulga `exception.description` y las capturas reintentan tras liberar el PNG bloqueado. |
| `M` | `scripts/certifications/apex-control-tower-consolidado-local.js` | Migra de la vista `Detalle` a las siete vistas; nuevas aserciones de componentes con latencia real, componente sin latencia ≠ cero, veredicto de latencia con tope, resumen sin teselas, leyenda de estados y captura `03-vista-latencia-consolidado.png`. El API rico de prueba expone `/api/v1/apex-control/status`. |
| `M` | `apps/control-tower/README.md` | Tabla de siete vistas, reglas de lectura (**lo no medido no es cero**, **el umbral lo publica el servidor**, **picos contra sostenido**), tabla de medidores ampliada, variables de presupuesto y la nueva sección **Conexiones reales por fuente**. |
| `M` | `docs/qa/evidence/apex-control-tower-f1/*` | Certificación fase uno re-ejecutada: 63/63 (incluida la fase real). |
| `M` | `docs/qa/evidence/torre-consolidado-empresas-20261103/*` | Certificación consolidada re-ejecutada: 51/51. |
| `A` | `docs/qa/evidence/apex-control-tower-f1/tower-datos-reales.png`, `tower-modulos-reales.png`, `tower-vista-api.png`, `tower-vista-datos.png`, `tower-vista-latencia.png`, `tower-vista-modulos.png` | Capturas nuevas de la fase real y por vista. |
| `A` | `docs/qa/evidence/torre-consolidado-empresas-20261103/03-vista-latencia-consolidado.png` | Captura de la vista Latencia con tope y veredicto. |
| `M` | `agents/registry.json`, `agents/CHANGELOG.md` | Bumps y controles de los agentes dueños. |
| `M` | `agents/apexos-performance/SKILL.md` | Control del presupuesto de sonda por ambiente y del veredicto sostenido vs pico. |
| `M` | `agents/apexos-qa/SKILL.md` | Control de la fase real de la certificación de la torre. |
| `M` | `agents/apexos-seguridad/SKILL.md` | Control `sin medición ≠ cero` y de la superficie agregada de `/apex-control/status`. |
| `M` | `agents/equipo-apexos/SKILL.md` | Vista-pregunta como contrato de producto de la torre. |
| `M` | `.qoder/skills/**` (espejos limpios) | Solo los espejos sin trabajo de otra intervención en curso. |
| `A` | `docs/briefs/2026-11-05-torre-vistas-pregunta-datos-reales.md` | Este brief. |

### Módulos (`change_intent.modules`)

- `control-tower`
- `certificaciones-control-tower`
- `agentes-gobernanza`

### Borrados autorizados (`allowed_deletions`)

- ninguno. La captura histórica `03-vista-detalle-consolidado.png` se conserva; la certificación ahora escribe `03-vista-latencia-consolidado.png` al lado.

## 3. Fuera de alcance

- No se toca `apps/api/**` en esta intervención: la torre consume los endpoints que el API ya publica (`/health`, `/apex-control/status`, `/modules`, `/activity`, `/tenants`).
- No se habilitan ni se rotan credenciales: QA/PROD siguen bloqueados por despliegue y JWT, y la nube por tokens ausentes.
- No se promueve nada. `apps/control-tower/**` reposa solo en `desarrollo`.
- No se borra evidencia antigua ni se reescribe historia compartida.

## 4. Restricciones

- Rama: solo `desarrollo`; push únicamente a `origin/desarrollo` al cierre. Prohibido `develop`, `main`, force push, merge, deploy, migraciones remotas e infraestructura sin autorización expresa.
- Ningún umbral ni corte vive en el navegador: el servidor publica `value`, `band`, `tone`, `label_text`, `limits` y `source`.
- Superficie de solo lectura y sin identificadores: `/health` y `/apex-control/status` publican agregados del proceso (memoria, buckets, peticiones, latencias por componente), nunca rutas, ids de request, tenants, usuarios ni payloads.
- Secretos solo en `apps/control-tower/.env.local` (gitignored): no se imprimen, commitean, loguean ni van a evidencia.
- Con `TOWER_SIMULATION=true` el catálogo es simulado: la fase real de la certificación exige el API del puesto, no el modo hermético.

## 5. Criterios de aceptación

1. `npm run control:test` → **137/137** verdes (métricas, sondas, telemetría, UI, módulos, cloud, actividad, recomendaciones, seguridad).
2. `npm run certify:control-tower:local` → **63/63**, incluyendo la fase real: `browser_vista_api_con_componentes_reales` (≥6 componentes leídos del API del puesto y `N componentes · M con latencia medida`) y `browser_datos_veredicto_de_base` con la cifra real en ms.
3. `npm run certify:control-tower:consolidado` → **51/51**, con `navegador_componentes_con_latencia_real` (filas ≥6, ≥5 con milisegundos), `navegador_componente_sin_latencia_no_es_cero` (`sinMedicion === 1 && ceros === 0`), `navegador_veredicto_de_latencia_con_tope` y `navegador_resumen_sin_teselas` (`teselasVisibles === 0`).
4. Navegación: cada una de las siete vistas muestra exclusivamente sus secciones (`section.hidden`), la elección queda en `localStorage("towerView")` y `summary`/`detail` antiguos siguen resolviendo a `resumen`/`api`.
5. Cambio de ambiente: el selector de empresa se reconstruye con la lectura vigente y la empresa previa queda deseleccionada; ninguna cifra viaja entre ramas.
6. Bloqueo real: un ambiente cuyo build no incluye `apex-control` muestra `MODULO_NO_DESPLEGADO` con su commit y su acción con responsable; no pinta ceros verdes.

## 6. Evidencia y certificación exigida

- Pruebas unitarias: `apps/control-tower/test/{metrics,probes,telemetry,ui-indicators,modules,cloud,activity,recommendations,security}.test.js` vía `npm run control:test`.
- Certificaciones con navegador real: `npm run certify:control-tower:local` (`docs/qa/evidence/apex-control-tower-f1/`) y `npm run certify:control-tower:consolidado` (`docs/qa/evidence/torre-consolidado-empresas-20261103/`).
- Hallazgo medido durante la fase real: el componente `db` del API local reportó del orden de **1.6 s** bajo la carga de la corrida, bandeado **Crítico** (óptimo ≤100 ms, riesgo ≤300 ms). La torre lo señaló correctamente; la causa raíz es de infraestructura del puesto y queda fuera de este brief.
- `certification_status`: `local_passed_qa_pending`. La torre no se despliega, así que no hay QA de nube para sus certificaciones y estas no alimentan ningún gate de promoción.

## 7. Capacidades protegidas

- **Medición real por fuente** — la certificación fase uno exige `/apex-control/status` del API del puesto; `browser_vista_api_con_componentes_reales` no pasa con datos simulados.
- **No medido ≠ cero** — `measuredValue`/`measuredNumber` en servidor y panel; probado en `probes.test.js`, `ui-indicators.test.js` y `navegador_componente_sin_latencia_no_es_cero`.
- **Umbral único en el servidor** — presupuestos por ambiente y cortes derivados; probado en `metrics.test.js` y en `navegador_umbrales_sin_jerga`.
- **Sostenido vs pico** — `latencyVerdict` firma "Dentro del tope / Fuera del tope: atender / Picos por evento: vigilar" sobre la serie medida.
- **Sin jerga interna ni estados fingidos** — `navegador_bandas_sin_jerga`, `navegador_resumen_sin_jerga_degrade`, `navegador_leyenda_de_estados`.
- **Cero secretos en la superficie** — `snapshot_no_filtra_el_token_de_la_torre`, `ruta_empresa_exige_token` y el saneado de la evidencia siguen verdes.

## 8. Riesgos y rollback

- Riesgo: ocultar secciones por vista rompe certificaciones antiguas que contaban nodos en `Detalle` → Mitigación: el DOM se se conserva y solo cambia `hidden`; las dos gates se migraron a la secuencia explícita de vistas.
- Riesgo: la fase real depende de que el API del puesto esté levantado y rápido; con carga competitiva la lectura puede tardar más que un sondeo → Mitigación: la vista se espera a lo largo de varios sondeos (45 s) y `alert_opened` dispone de 60 s; la corrida se ejecuta sola.
- Riesgo: Windows bloquea el PNG de la corrida anterior y la captura falla → Mitigación: se borra antes de escribir y se reintenta una vez.
- Riesgo: `agents:sync` sobrescribiría espejos con trabajo de otra intervención en curso → Mitigación: no se corrió `agents:sync` en esta cierre; se editaron las fuentes canónicas y solo los espejos limpios, y se reporta honestamente el desajuste preexistente de `agents:check`.
- Rollback: `git revert` del commit de la torre (no reset): revierte panel, servidor, pruebas, certificaciones y evidencia juntos.

## 9. Supuestos y preguntas abiertas

- Supuesto: la latencia real medida en `db` en local (~1.6 s bajo corrida) es señal de contention del puesto, no del modelo de umbrales; merece seguimiento del dueño de infraestructura, no un umbral más permisivo.
- Supuesto: las siete vistas son el contrato de lectura del propietario; una pregunta nueva entra como sección con `data-views`, no como tesela suelta en Resumen.
- Preguntas abiertas (fuera de alcance, requieren autorización expresa): desplegar en QA/PROD un build con `apex-control`, configurar `ENV_DEVELOP_APEX_TOKEN`/`ENV_MAIN_APEX_TOKEN` y los tokens `RAILWAY_TOKEN`/`VERCEL_TOKEN`/`SUPABASE_ACCESS_TOKEN`.

## 10. Autorizaciones requeridas

- [x] Cierre en `desarrollo` con `git push origin desarrollo` (autorización permanente y acotada del propietario).
- [ ] Pendiente: despliegue en QA/PROD del build con `apex-control` y telemetría de `/health`.
- [ ] Pendiente: JWTs de QA/PROD para la torre y tokens cloud.
- [ ] Pendiente (ajeno a la torre): perseguir la latencia real de la base del puesto que la torre marca como Crítica.

## 11. Documentación, agentes y publicación (obligatoria)

- **Preflight de agentes**: `npm run agents:preflight -- --paths "apps/control-tower/**,scripts/certifications/apex-control-tower-local.js,scripts/certifications/apex-control-tower-consolidado-local.js,docs/briefs/**,docs/qa/evidence/**,agents/**,.qoder/skills/**"` → sin `INTEGRAR_REMOTO` ni `CONFLICTO`.
- **Agentes consultados**: `equipo-apexos`, `apexos-brief`, `apexos-performance`, `apexos-qa`, `apexos-seguridad`.
- **Documentación actualizada**: este brief y `apps/control-tower/README.md`.
- **Agentes actualizados**: `apexos-performance`, `apexos-qa`, `apexos-seguridad`, `equipo-apexos` (bump semver + `updated_at` + `sha256` en `agents/registry.json` y entrada en `agents/CHANGELOG.md`).
- **Cobertura de contexto**: `npm run agents:coverage -- --paths "<inventario exacto>"` en verde.
- **Publicación obligatoria**: `git push origin desarrollo`. No cubre `develop`, `main`, force push, merges, migraciones remotas ni infraestructura.
- [x] Preflight sin `INTEGRAR_REMOTO` ni `CONFLICTO`
- [ ] Cobertura de contexto en verde (`agents:coverage`)
- [x] Sin secretos, credenciales ni artefactos locales en el diff
- [x] Documentación y agentes actualizados en el mismo commit
