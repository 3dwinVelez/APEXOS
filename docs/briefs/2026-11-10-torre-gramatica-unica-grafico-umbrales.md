# Brief — Torre de control: gramática única de gráfico con umbral en todas las superficies de medición

- **ID**: `2026-11-10-torre-gramatica-unica-grafico-umbrales`
- **Fecha**: `2026-11-10`
- **Rama activa**: `desarrollo`
- **Prompt crudo**: "no veo que los graficos sean como el de latencia con la barra de comportamiento todos los modelos de medicion deben ser con el grafico de latencia con umbrales definidos pero veo que no esta de esa manera y los demas modulos tieenen etiquetas"

## 1. Objetivo

Que **toda** superficie de medición de `apps/control-tower` se pinte con la misma forma que el dueño señaló como referencia —la gráfica de latencia con su franja de comportamiento y sus cortes `óptimo`/`tope`— y que ningún monitor quede como etiqueta + número suelto ni como tira de marcas sin escala. Tres cosas, verificables una por una:

1. **Un solo renderer para las siete superficies.** `thresholdChart()` en `apps/control-tower/public/app.js` dibuja la vista Latencia, las tarjetas del Resumen, las teselas de API / Base de datos / Operación, las filas de componentes, las sondas, los proveedores cloud y **cada renglón del mapa de módulos** (variante compacta, altura de renglón, eje horario una sola vez al pie del mapa).
2. **El corte siempre visible o siempre admitido.** Donde hay dos lecturas medidas se trazan las líneas de umbral con su etiqueta; donde no las hay, el propio gráfico lo dice con su texto (`sin banda habitual todavía: N de 8 lecturas medidas`, `N sondeos guardados · ninguno dejó lectura de este monitor`, `sin historia: 0 de N lecturas medidas`). Ningún hueco se rellena con un `0`.
3. **Las etiquetas que no deciden, fuera.** El Resumen muestra 13 de los 18 medidores del catálogo: los cinco marcados `resumen: false` (actividad de hoy, usuarios activos, sesiones activas, conexiones WebSocket y pings GPS) viven en su vista y no suben a la tarjeta de entrada.

Regla transversal, la misma de la ronda anterior: **lo no medido no es cero**.

## 2. Alcance exacto

| Estado | Archivo | Qué cambia |
|---|---|---|
| `M` | `apps/control-tower/public/app.js` | `thresholdChart()` queda como único renderer: `cutOf()` no traza con cortes nulos (`Number(null) === 0` pintaba franjas sanas en cero), `sampleBand()` devuelve `unknown` sin cortes finitos, `measureLimits()` publica `limits.kind: "pending"` con `readings`/`needed`, `monitorChart()`/`monitorChartFoot()` dan la variante de tesela con su pie, `mapRowChart()` pinta cada renglón del mapa como la misma gráfica en altura de renglón (o su admisión honesta) y `renderGauges()` filtra `resumen !== false`. |
| `M` | `apps/control-tower/lib/metrics.js` | Catálogo `GAUGES` con los cortes versionados de las 18 magnitudes y las tres familias de `limits.kind` (`budget`, `window`, `pending`); `windowLimits()`/`applyWindowLimits()` con `WINDOW_MIN_READINGS = 8` y cortes por percentil según `watch` (`p65/p90` hacia arriba, `p35/p10` hacia abajo); `limitText()` fija el vocabulario `óptimo`/`tope`/`piso`; `moduleTicks()` publica la frescura y los registros por módulo que el renglón del mapa dibuja. |
| `M` | `apps/control-tower/lib/monitor-history.js` | `measuredValues()` para que el corte de ventana se calcule sobre las lecturas del propio monitor y `finite()` siga tratando `null`/`undefined`/`""` como ausencia, no como cero. |
| `M` | `apps/control-tower/server.js` | `attachIndicators()` aplica primero el corte de ventana y luego bandea (así toda serie tiene su barra de comportamiento o dice cuántas lecturas faltan), adjunta `series`/`window` a gauges, componentes y sondas, y firma `verdicts.resumen` sobre los medidores que sí suben al Resumen. |
| `M` | `apps/control-tower/public/styles.css` | Gramática visual de `.threshold-chart` en sus tres tamaños (grande, tesela, renglón), `.monitor-chart`/`.monitor-chart idle`, `.monitor-chart-foot`, `.map-strip.map-chart`, `.chart-optimal`/`.chart-risk`/`.chart-label.risk` y los puntos `.spark-over`/`.spark-fail`. |
| `M` | `apps/control-tower/test/ui-indicators.test.js` | Pruebas de la gramática única: el mismo renderer en las siete superficies, renglón del mapa sin SVG con menos de dos lecturas y con su texto `sin historia`, cortes nulos que no se pintan en cero, pie de `pending` y filtrado de los cinco medidores `resumen: false`. |
| `M` | `apps/control-tower/test/metrics.test.js` | `windowLimits`/`applyWindowLimits` por `watch` y por minimum de lecturas, `limitText` con su vocabulario y los cortes versionados de las magnitudes que antes eran informativas. |
| `M` | `scripts/certifications/apex-control-tower-local.js` | Gates de la gramática: `browser_cada_medidor_trae_su_grafica_con_umbral` (13 tarjetas = 13 gráficas = 13 pies, ≥5 franjas con lecturas, ≥8 cortes, toda etiqueta dice `óptimo`/`tope`/`piso` y ninguna tesela de actividad sube al Resumen), `browser_vista_api_teselas_tecnicas`, `browser_componentes_y_sondas_con_historia`, `browser_modulos_mapa_unico` y `browser_datos_teselas_con_historia`/`browser_operacion_mesa_con_historia` con la regla estructural `sinUmbral === 0`. Recalentamiento `historiaLista` (hasta 60 s) antes de leer el Resumen; fase real con ventana de 150 s, diagnóstico `ultima_lectura` y `browser_modulos_con_datos_reales` exigiendo ≥3 renglones con registros medidos; `launchChrome` tolera el `EBUSY` de `DevToolsActivePort`. |
| `M` | `scripts/certifications/apex-control-tower-consolidado-local.js` | `navegador_resumen_con_medidores` (13 gráficas, cero sin umbral), `navegador_mapa_de_modulos` (renglón = gráfica) y `navegador_api_teselas_con_historia` con espera de hasta 40 s a la primera serie dibujada; la misma ayuda `graficaConUmbral`/`sinGrafica` y el mismo `launchChrome` endurecido. |
| `M` | `apps/control-tower/README.md` | Modelo de medición (gramática única y las tres familias de `limits.kind`), tabla de medidores con umbral (15 filas con sus topes), contrato del mapa por renglón, recuentos y nombres de gates de ambas tuberías y el contrato de suites (`161/161`). |
| `A` | `docs/briefs/2026-11-10-torre-gramatica-unica-grafico-umbrales.md` | Este brief. |
| `M` | `docs/qa/evidence/apex-control-tower-f1/certification.json`, `docs/qa/evidence/apex-control-tower-f1/telegram-outbox.json` y los once PNG de esa carpeta (`tower-overview`, `tower-env-main`, `tower-api-down`, `tower-datos-reales`, `tower-modulos-reales`, `tower-latencia-punto`, `tower-vista-latencia`, `tower-vista-api`, `tower-vista-datos`, `tower-vista-modulos`, `tower-vista-operacion`) | Certificación local re-ejecutada contra el panel con la gramática única: **73/73**. |
| `M` | `docs/qa/evidence/torre-consolidado-empresas-20261103/certification.json`, `snapshot-ambientes.json`, `empresa-tenant-demo.json` y las tres capturas (`01-monitor-consolidado-empresa.png`, `02-producto-bloqueado-con-acciones.png`, `03-vista-latencia-consolidado.png`) | Certificación consolidada re-ejecutada con las gates de la gramática: **55/55**. |
| `M` | `agents/apexos-performance/SKILL.md` | Control 21: la gramática única del gráfico de latencia en toda superficie de medición, con su hueco honesto y su variante compacta. |
| `M` | `agents/apexos-qa/SKILL.md` | Control 55: una gate afirma lo que su modo puede producir (estructura siempre, profundidad solo donde hay fuente). |
| `M` | `agents/apexos-seguridad/SKILL.md` | Control 34: una gramática visual nueva es superficie pública nueva; el saneado de la evidencia se re-exige y el compacto no ensancha lo publicado. |
| `M` | `agents/apexos-brief/SKILL.md` | Regla 47: un criterio visual se escribe por superficie y por modo. |
| `M` | `agents/equipo-apexos/SKILL.md` | Control 34: un rechazo visual del dueño se cierra con la vista que él mira y un rojo del arnés se corrige en el arnés. |
| `M` | `agents/apexos-git-guardian/SKILL.md` | Control 29: el inventario exacto se calcula sobre las rutas propias aunque el árbol esté sucio con trabajo ajeno. |
| `M` | `agents/registry.json`, `agents/CHANGELOG.md` | Bumps de las seis versiones, `updated_at`, `sha256` y la entrada de la intervención. |
| `M` | `.qoder/skills/apexos-performance/SKILL.md`, `.qoder/skills/apexos-qa/SKILL.md`, `.qoder/skills/apexos-seguridad/SKILL.md`, `.qoder/skills/apexos-brief/SKILL.md`, `.qoder/skills/equipo-apexos/SKILL.md`, `.qoder/skills/apexos-git-guardian/SKILL.md` | Espejo generado por `npm run agents:sync`. |

### Módulos (`change_intent.modules`)

- `apex-control-tower`
- `certificaciones-torre`
- `agentes-equipo`

### Borrados autorizados (`allowed_deletions`)

- ninguno. No se elimina ningún archivo; lo retirado en esta ronda son superficies de pintura (franjas de marcas y tarjetas número+etiqueta), no rutas.

## 3. Fuera de alcance

- `apps/api/**` y `apps/web/**`: la torre consume `/health` y `/api/v1/apex-control/*` tal como están; ningún endpoint nuevo ni cambio de telemetría del API.
- Promoción a `develop` o `main`: `apps/control-tower/**` reposa solo en `desarrollo` y sus certificaciones no alimentan compuerta de promoción alguna.
- Credenciales cloud (`RAILWAY_TOKEN`, `VERCEL_TOKEN`, `SUPABASE_ACCESS_TOKEN`) y tokens `ENV_DEVELOP_APEX_TOKEN`/`ENV_MAIN_APEX_TOKEN`: siguen siendo decisión y acción del dueño sobre `.env.local`; la vista Nube y QA/PROD quedan en `Sin credenciales`/`SIN_TOKEN` con su acción y responsable, no en cero.
- No se toca `ModalFrame.tsx` ni ninguna otra ruta que apareciera modificada por otro frente en el árbol de trabajo, ni `vibe_images/`.

## 4. Restricciones

- Rama: solo `desarrollo`. Push permitido únicamente a `origin/desarrollo` al cierre (sección 11). Prohibido `develop`, `main`, force push, merge, deploy, migración remota y cambios en Railway/Supabase sin autorización explícita.
- Aislamiento multi-tenant y RBAC intactos: la torre no escribe dato de negocio y no cruje empresas (el puente `403 CROSS_TENANT_DESHABILITADO` sigue certificado).
- Sin secretos ni credenciales en el brief ni en el diff. Los tokens viven solo en `apps/control-tower/.env.local` (gitignored) y la certificación verifica que ni el token de la torre ni el JWT aparecen en la evidencia.
- La fase real de la certificación se corre con **una sola** torre leyendo el puesto: con la instancia del dueño abierta, el barrido `/apex-control/status` (2,2-5,6 s en reposo) revienta el presupuesto de sonda de 6 s y `local_fuente_real` se pone rojo sin cambio de producto. El presupuesto `ENV_TIMEOUT_MS` no se baja para dar verde.

## 5. Criterios de aceptación

Cada superficie con su gate nombrada, y la exigencia declarada por modo (estructura en simulación, profundidad con dato real):

1. **Resumen** — `npm run certify:control-tower:local` → `PASS browser_cada_medidor_trae_su_grafica_con_umbral` con `tarjetas = gráficas = pies = 13`, `≥5` franjas con lecturas medidas, `≥8` cortes trazados, toda etiqueta de corte `óptimo|tope|piso` y ninguna de las cinco teselas de actividad en los rótulos.
2. **Vista API** — `PASS browser_vista_api_teselas_tecnicas` (6 teselas = 6 gráficas, `sinUmbral = 0`, `≥4` cortes) y `PASS browser_componentes_y_sondas_con_historia` (una gráfica por componente y por sonda, cero sin umbral).
3. **Módulos (mapa)** — en simulación `PASS browser_modulos_mapa_unico`: 33 renglones = 33 gráficas y `sinUmbral = 0` admitiendo `sin historia` (el catálogo congelado publica `data: null`, así que exigir serie dibujada aquí sería certificar un imposible). Con dato real `PASS browser_modulos_con_datos_reales`: `≥3` renglones con registros medidos en sus `<title>` (la corrida midió 30 de 33) y `conRegistros` contado sobre SVG con la palabra `registros`.
4. **Base de datos y Operación** — `PASS browser_datos_teselas_con_historia`, `PASS browser_operacion_mesa_con_historia` y `PASS browser_datos_con_volumen_real` (5 teselas = 5 gráficas, `sinUmbral = 0`).
5. **Consolidado por empresa** — `npm run certify:control-tower:consolidado` → `PASS navegador_resumen_con_medidores` (13 = 13, cero sin umbral), `PASS navegador_mapa_de_modulos` (4 = 4) y `PASS navegador_api_teselas_con_historia` (6 = 6 = 6, 6 franjas con lecturas y 10 cortes).
6. **El umbral que se pinta es el que publica el servidor** — `PASS browser_tope_del_grafico_es_el_del_medidor` y `PASS browser_tope_dibujado_en_su_ordenada` (la etiqueta del tope cae sobre la ordenada que le corresponde, tolerancia 14 px).
7. **Lo recortado sigue recortado** — `PASS browser_performance_panel` (**4** estadísticos y `Memoria RSS`/`Consultas lentas`/`Peticiones` ausentes) y `PASS browser_bandas_sin_jerga` (solo las cinco palabras del vocabulario, sin `degrade`).
8. **Pruebas del panel** — `npm run control:test` → **161/161** verdes, incluidas las de `sin SVG con menos de dos lecturas` y `cortes nulos no pintados en cero`.
9. **El dueño lo ve en su herramienta** — relanzar la torre desde `desarrollo` (`apex-control.bat` o `node apps/control-tower/server.js`) y abrir `http://127.0.0.1:4310` con recarga forzada (`Ctrl+F5`): cada vista muestra su franja con sus cortes, y las franjas se llenan sondeo a sondeo (dos lecturas para el primer trazo).

## 6. Evidencia y certificación exigida

Ambas tuberías leen el mismo panel, así que **las dos** se re-ejecutan en esta intervención (regla 46 del `apexos-brief`) con su recuento esperado:

- Pruebas: `npm run control:test` → **161/161** (`apps/control-tower/test/**`; `ui-indicators.test.js` renderiza `app.js` en un DOM de prueba y `metrics.test.js` fija el catálogo de cortes).
- Certificación 1: `npm run certify:control-tower:local` → **73/73** esperados y obtenidos; evidencia en `docs/qa/evidence/apex-control-tower-f1/` (`certification.json`, `telegram-outbox.json` y once capturas, incluidas `tower-datos-reales.png`, `tower-modulos-reales.png`, `tower-latencia-punto.png`, `tower-vista-operacion.png`).
- Certificación 2: `npm run certify:control-tower:consolidado` → **55/55** esperados y obtenidos; evidencia en `docs/qa/evidence/torre-consolidado-empresas-20261103/` (`certification.json`, `snapshot-ambientes.json`, `empresa-tenant-demo.json` y tres capturas).
- `certification_status` esperado: `local_passed_qa_pending`. La torre no se promociona, así que no hay QA de nube para este cambio; lo que queda pendiente es configuración del dueño (tokens cloud y `ENV_*_APEX_TOKEN`), no código.

## 7. Capacidades protegidas

- **Un renderer, una gramática** — `browser_cada_medidor_trae_su_grafica_con_umbral`, `browser_vista_api_teselas_tecnicas`, `browser_modulos_mapa_unico`, `navegador_resumen_con_medidores`, `navegador_mapa_de_modulos`.
- **Lo no medido no es cero** — `sinUmbral === 0` en las siete superficies con la regla de admisión (`graficaConUmbral`), pruebas de cortes nulos y `browser_componente_sin_latencia_no_es_cero` (sin medición, nunca `0 ms`).
- **Umbral único en el servidor** — `browser_tope_del_grafico_es_el_del_medidor` + `limitText`/`windowLimits` en `metrics.test.js`.
- **Etiquetas acotadas** — los rótulos del Resumen no contienen las cinco teselas `resumen: false` y `browser_performance_panel` afirma la ausencia de lo retirado.
- **Lectura real del puesto** — `local_fuente_real`, `mapa_real_de_modulos`, `browser_datos_con_volumen_real`, `browser_modulos_con_datos_reales`, todos con `ultima_lectura` como diagnóstico.
- **No fuga de credenciales** — `snapshot_no_filtra_el_token_de_la_torre` y `evidence_json` en ambas tuberías.
- **Alerta, intervención y recuperación** — `outage_visible`, `alert_opened`, `telegram_alert_sent`, `recovery_resolved`, `jobs_traceable` (intactos respecto de la ronda anterior).

## 8. Riesgos y rollback

- Riesgo: una gate que exige lecturas donde el modo no las produce (simulación con catálogo `data: null`) da rojo sobre un panel correcto y empuja a maquillar el dato. → Mitigación: la acceptance declara estructura por modo y profundidad con fuente real (regla 47), y la fase real exige `≥3` renglones con registros medidos. → Rollback: revert del commit, no reset.
- Riesgo: leer el panel antes de que el anillo tenga dos lecturas hace depender la gate del minuto en que arrancó el navegador. → Mitigación: recalentamientos explícitos (`historiaLista` 60 s en local, 40 s en las teselas del consolidado) y espera del mapa hasta 60 s con su propia evidencia de cuenta.
- Riesgo: el arranque de Chrome por CDP falla con `EBUSY` al leer `DevToolsActivePort` mientras el navegador lo escribe. → Mitigación: reintento dentro de `waitFor` en ambos arneses (el fallo abortaba la fase de navegador entera, como se midió en la corrida `25/26`).
- Riesgo: dos torres leyendo el puesto a la vez inflan `/apex-control/status` y rojan la fase real. → Mitigación: la instancia del dueño se detiene durante la certificación y se relanza al cierre; el presupuesto `ENV_TIMEOUT_MS` no se toca.

## 9. Supuestos y preguntas abiertas

- Supuesto: un gráfico necesita dos lecturas medidas para trazar su franja; con una sola, la tarjeta existe y su pie dice cuántas faltan. Eso es comportamiento esperado, no defecto.
- Supuesto: la cota honesta se le dice al dueño —el anillo no se retrollena; las franjas crecen a la cadencia de sondeo (10 s en el puesto, 4 s en las certificaciones).
- Pregunta: ninguna que altere el alcance. Los tokens cloud y los `ENV_*_APEX_TOKEN` siguen siendo acción del dueño (sección 3).

## 10. Autorizaciones requeridas

- [x] `git push origin desarrollo` al cierre (autorización permanente y acotada de AGENTS.md).
- [ ] Ninguna otra: sin `develop`, sin `main`, sin despliegue, sin Railway/Supabase, sin secretos.

## 11. Documentación, agentes y publicación (obligatoria)

- **Preflight de agentes**: `npm run agents:preflight -- --paths "apps/control-tower/**,scripts/certifications/**,docs/briefs/**,agents/**,.qoder/skills/**"` → **Veredicto: OK** (sin `INTEGRAR_REMOTO` ni `CONFLICTO`; ocho agentes `in-sync` con `origin/desarrollo`, gobernanza en verde).
- **Agentes requeridos por el ruteo**: `apexos-performance`, `apexos-seguridad`, `apexos-qa` (`apps/control-tower/**`), `apexos-qa` (`scripts/certifications/**`), `equipo-apexos`, `apexos-brief`, `apexos-git-guardian` (`agents/**`, `.qoder/skills/**`, `docs/briefs/**`).
- **Documentación a actualizar**: `apps/control-tower/README.md` y este brief.
- **Agentes a actualizar** (con su bump): `apexos-performance` 2.10.0 → 2.11.0 (control 21), `apexos-qa` 2.41.0 → 2.42.0 (control 55), `apexos-seguridad` 2.19.0 → 2.20.0 (control 34), `apexos-brief` 2.33.0 → 2.34.0 (regla 47), `equipo-apexos` 2.20.0 → 2.21.0 (control 34), `apexos-git-guardian` 2.11.0 → 2.12.0 (control 29).
- **Registro**: `agents/registry.json` (`version`, `updated_at`, `sha256`) y entrada en `agents/CHANGELOG.md` bajo `## 2026-11-10`.
- **Cobertura de contexto**: `npm run agents:coverage -- --paths "apps/control-tower/**,scripts/certifications/**,docs/briefs/**,agents/**,.qoder/skills/**"` → los seis dueños con bump local y mención en la sección más reciente.
- **Secuencia de cierre**: `npm run agents:sync` → `npm run agents:check` → `npm run agents:preflight` → `npm run agents:coverage` → `npm run control:test` → `npm run certify:control-tower:local` → `npm run certify:control-tower:consolidado` → commit exacto (sin `ModalFrame.tsx` ni `vibe_images/`) → `git push origin desarrollo` → relanzar la torre del dueño.
- **Publicación obligatoria**: `git push origin desarrollo`. No cubre `develop`, `main`, force push, merges, migraciones remotas ni infraestructura. La torre no se promociona: es herramienta de puesto y sus certificaciones no son evidencia de promoción.
- [x] Preflight sin `INTEGRAR_REMOTO` ni `CONFLICTO`
- [ ] Cobertura de contexto en verde (`agents:coverage`)
- [ ] Sin secretos, credenciales ni artefactos locales en el diff
- [ ] Documentación y agentes actualizados en el mismo commit
