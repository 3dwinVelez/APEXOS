# Brief — Torre de control: medidores con umbral y mapa único de módulos vs API

- **ID**: `2026-11-05-torre-medidores-y-mapa`
- **Fecha**: `2026-11-05`
- **Rama activa**: `desarrollo`
- **Prompt crudo**: "trabajando sobre la torre de control necesitamos contar con algnas premisas de la solucion, los indicadores deben ser tipo medicion como el que ya me pusiste y podemos jugar con la gama de colres poniendo un humbral cuando sea optimo, en riesgo o definitivamente este en rojo caido, tambien en un solo grafico de estado ver todos los modulos y s comportamiento vs el api y el rendimiento de cada uno marcando los tics en ese mismo grafico todo compactodo de manera profesional lo que busco es no tener todo ese reguero de datos en la torre de control y contar con medidores visuales como el que te mande de ejemplo para asi poder visualizar los estados de todo el sistema bsca la manera de acomodar estos diseños y mostrarme una version mas fresca y profesional"

## 1. Objetivo

Que el Resumen de la torre se lea de un vistazo: cada indicador es un medidor con su umbral explícito y su banda de color (Óptimo / En riesgo / Crítico / Sin dato / Informativo), y un solo gráfico muestra el comportamiento de todos los módulos y del API en el mismo eje. El "reguero" de teselas numéricas del Resumen desaparece; el detalle técnico se queda en Detalle.

## 2. Alcance exacto

| Estado | Archivo | Qué cambia |
|---|---|---|
| `A` | `apps/control-tower/lib/metrics.js` | Fuente única de umbrales: `GAUGES` (p95, sondas, memoria, consultas lentas, cobertura, frescura, uptime, peticiones), `bandForValue`, `probeBand`, `gauge`, `gaugesFor`, `moduleBand`, `moduleTicks` (con la lectura del API embebida) y las etiquetas/tonos de banda. |
| `A` | `apps/control-tower/lib/telemetry.js` | Anillo `ModuleTelemetry` por ambiente (40 muestras persistidas) con los ticks realmente medidos en cada sondeo. |
| `A` | `apps/control-tower/test/metrics.test.js` | 11 pruebas del modelo de umbrales: cortes derivados del presupuesto, dirección `higher/lower/informational`, banda por módulo, medidores de un ambiente sin lecturas y ticks con la lectura del API. |
| `A` | `apps/control-tower/test/telemetry.test.js` | 6 pruebas del anillo: alta por sondeo, límite que descarta el más viejo, ventana `seriesFor`, filtrado de un anillo persistido corrupto y forma de `toJSON`. |
| `A` | `apps/control-tower/test/ui-indicators.test.js` | 6 pruebas del panel real (`node:vm` + DOM mínimo): un medidor por umbral publicado, bandas medidas, informativos sin escala fingida, mapa con una marca por sondeo y módulo más la fila del API y los dos estados vacíos. |
| `M` | `apps/control-tower/server.js` | `recordModuleTicks(probe, telemetry, metrics)` registra el tick por ambiente con su lectura `/health` antes de aplicar overrides, para que una simulación nunca contamine el anillo persistido. |
| `M` | `apps/control-tower/public/app.js` | Medidores (`scaleGeometry`, `measureCard`, `renderGauges`), mapa de módulos vs API (`tickHeight`, `moduleMapRows`, `mapTick`, `renderModuleMap`), umbrales leídos del servidor en lugar de los cuatro literales locales, chips separados de latencia y sondas en Rendimiento y sparkline sin color quemado. |
| `M` | `apps/control-tower/public/index.html` | Paneles nuevos **Medidores del sistema** (`#gauges`) y **Mapa de módulos vs API** (`#moduleMap`); las teselas, el desglose de módulos y el bloque de Rendimiento pasan a `detail-only`. |
| `M` | `apps/control-tower/public/styles.css` | Estilo de medidores (tarjeta con franja de banda, escala de tres tramos, marcador, límites y pie), del mapa (fila clicable, eje, marcas por banda sobre una línea base) y de los chips de banda; reglas móviles. |
| `M` | `scripts/certifications/apex-control-tower-local.js` | `browser_dashboard_rendered` exige medidores y mapa; nueva `browser_summary_uses_gauges` (Resumen sin teselas visibles); `browser_technical_details` revalida las teselas en Detalle. |
| `M` | `scripts/certifications/apex-control-tower-consolidado-local.js` | Nuevas `navegador_medidores_y_mapa` (medidores con umbral, filas y marcas del mapa, cero teselas visibles en Resumen) y `navegador_bandas_sin_jerga` (solo las cinco palabras de banda). |
| `M` | `apps/control-tower/README.md` | Secciones **Medidores con umbral** y **Mapa de módulos vs API**; el mapa de la vista Resumen se describe sin teselas. |
| `M` | `agents/registry.json`, `agents/CHANGELOG.md` | Bumps y controles de los agentes dueños. |
| `M` | `.qoder/skills/apexos-performance/SKILL.md` | `2.6.0` → `2.7.0` — control `torre-umbrales-fuente-unica`. |
| `M` | `.qoder/skills/apexos-qa/SKILL.md` | `2.7.0` → `2.8.0` — control `torre-certifica-lo-visible`. |
| `M` | `.qoder/skills/apexos-seguridad/SKILL.md` | `2.6.0` → `2.6.1` — banda `Informativo` no es un veredicto. |
| `M` | `.qoder/skills/equipo-apexos/SKILL.md` | `2.5.0` → `2.5.1` — el plano de la torre respeta la residencia declarada. |
| `M` | `.qoder/skills/apexos-brief/SKILL.md` | `2.7.1` → `2.7.2` — brief de rediseño visual con criterios observables en el DOM. |
| `A` | `docs/briefs/2026-11-05-torre-medidores-y-mapa.md` | Este brief. |
| `A` | `docs/qa/evidence/torre-medidores-20261105/*.png` | Cuatro capturas del panel vivo (Resumen arriba, medidores, mapa y Detalle). |
| `M` | `docs/qa/evidence/apex-control-tower-f1/*` | Evidencia re-ejecutada de la gate fase uno (39/39). |
| `M` | `docs/qa/evidence/torre-consolidado-empresas-20261103/*` | Evidencia re-ejecutada de la certificación consolidada (44/44). |

### Módulos (`change_intent.modules`)

- `control-tower`
- `certificaciones-control-tower`
- `agentes-gobernanza`

### Borrados autorizados (`allowed_deletions`)

- ninguno

## 3. Fuera de alcance

- No se toca `apps/api/**`: la torre sigue siendo de solo lectura frente a APEXOS.
- No se inventa latencia por módulo. La API no la publica (`lib/modules.js` no mide por componente), así que la altura de una marca sale de la frescura medida; donde no hay fecha medida se usa la altura base de la banda y nada más.
- No se promueve nada: `apps/control-tower/**` reposa solo en `desarrollo`.
- No se modifican `.env.local`, secretos, tokens cloud ni infraestructura.
- No se reescribe el indicador oficial de salud 0-100 (`lib/health.js`); los medidores son un modelo distinto (magnitud medida + cortes) y conviven con él.

## 4. Restricciones

- Rama: solo `desarrollo`. Push permitido únicamente a `origin/desarrollo` al cierre (sección 11). Prohibido `develop`, `main`, force push, merge, deploy, migración remota y cambios en Railway/Supabase sin autorización explícita.
- Aislamiento multi-tenant y RBAC intactos: el panel no agrega lecturas nuevas de empresa.
- Sin secretos ni credenciales en el brief, el diff ni la evidencia. Los `.env.local` no entran.
- Ningún umbral vive en el navegador: el servidor publica valor, banda y cortes; el panel solo pinta.

## 5. Criterios de aceptación

1. `npm run control:test` → 102/102 verdes, incluidas las tres suites nuevas (`metrics`, `telemetry`, `ui-indicators`).
2. `GET /api/status` (con token de la torre) → cada ambiente publica `gauges` con `band`, `tone`, `label_text` y `limits`, y `moduleHistory` con `ticks` por módulo y `api { ms, ok, band }`.
3. `npm run certify:control-tower:local` → 39/39 con `browser_dashboard_rendered`, `browser_summary_uses_gauges` y `browser_technical_details` en verde.
4. `npm run certify:control-tower:consolidado` → 44/44 con `navegador_medidores_y_mapa` (`teselasResumenVisibles === 0`) y `navegador_bandas_sin_jerga` en verde.
5. En el navegador, vista **Resumen**: el bloque *Medidores del sistema* pinta una tarjeta por umbral con su escala de tres tramos y el marcador en la banda medida; el *Mapa de módulos vs API* pinta una fila por módulo más la fila del API, con una marca por sondeo; ninguna tesela numérica del Resumen es visible.
6. En **Detalle** reaparecen las teselas, el desglose de módulos y el bloque de Rendimiento, con los chips separados «latencia» y «sondas».
7. Un ambiente sin lecturas no pinta verde: sus medidores quedan `Sin dato` y los informativos (`uptime`, `peticiones`) muestran `Informativo` con la nota «contexto del proceso, no diagnóstico» y sin escala.

## 6. Evidencia y certificación exigida

- Pruebas: `apps/control-tower/test/metrics.test.js`, `apps/control-tower/test/telemetry.test.js`, `apps/control-tower/test/ui-indicators.test.js` (`npm run control:test`).
- Certificación: `npm run certify:control-tower:local` (evidencia en `docs/qa/evidence/apex-control-tower-f1/`) y `npm run certify:control-tower:consolidado` (evidencia en `docs/qa/evidence/torre-consolidado-empresas-20261103/`).
- Capturas del panel vivo: `docs/qa/evidence/torre-medidores-20261105/`.
- `certification_status` esperado: `local_passed_qa_pending`. La torre no se promociona ni se despliega, así que no tiene QA de nube; sus certificaciones no alimentan ningún gate.

## 7. Capacidades protegidas

- **Umbrales en una sola fuente versionada** — `lib/metrics.js` deriva el corte de p95 del presupuesto `PERF_API_P95_MS` y el panel lo pinta; se prueba en `metrics.test.js` y en `navegador_umbrales_sin_jerga`.
- **Historial medido, no simulado** — el anillo se alimenta del sondeo real antes de `applyOverrides`; se prueba en `telemetry.test.js` y en la fila del API del mapa.
- **Léxico de bandas sin jerga** — `navegador_bandas_sin_jerga` y `navegador_resumen_sin_jerga_degrade` bloquean términos internos como `degraded`.
- **Detalle técnico accesible** — `browser_technical_details` revalida que las teselas siguen existiendo y son visibles en Detalle.
- **Cero secretos en la superficie** — `snapshot_no_filtra_el_token_de_la_torre` y `ruta_empresa_exige_token` siguen verdes tras el rediseño.

## 8. Riesgos y rollback

- Riesgo: ocultar las teselas del Resumen rompe certificaciones antiguas que las contaban → Mitigación: se gating por CSS (`detail-only`) conservando el DOM, y las dos gates se actualizaron para exigir lo visible en cada vista.
- Riesgo: 32 módulos hacen muy alta la mapa → Mitigación: orden de peor a mejor, marcas flexibles de ancho acotado y cuerpo con desplazamiento propio.
- Riesgo: un umbral nuevo puede bandear en rojo un ambiente sano → Mitigación: los cortes salen del presupuesto versionado y `Sin dato`/`Informativo` no cuentan como veredicto; `renderGauges` excluye los informativos del conteo de rojos.
- Rollback: `git revert` del commit de la torre (no reset), revierte panel, servidor, pruebas y evidencia juntos.

## 9. Supuestos y preguntas abiertas

- Supuesto: la latencia por módulo queda como deuda del API; mientras `/api/v1/apex-control/modules` no la publique, el mapa la deja fuera en lugar de estimarla.
- Supuesto: el anillo de 40 muestras por ambiente es suficiente para el puesto de trabajo local; es configurable con `maxSamples` en `ModuleTelemetry`.
- Pregunta: ninguna que altere el alcance.

## 10. Autorizaciones requeridas

- [x] Cierre en `desarrollo` con `git push origin desarrollo` (autorización permanente y acotada del propietario).
- [ ] Pendiente fuera de este brief: desplegar en QA/PROD un build del API que incluya `apex-control` y la telemetría de `/health`; sin eso, esos ambientes siguen en `Sin dato`.
- [ ] Pendiente fuera de este brief: `ENV_DEVELOP_APEX_TOKEN`, `ENV_MAIN_APEX_TOKEN`, `SUPABASE_ACCESS_TOKEN`, `VERCEL_TOKEN` y un `RAILWAY_TOKEN` válido.
- [ ] Pendiente fuera de este brief: renovar `ENV_LOCAL_APEX_TOKEN` (la lectura viva de este cierre muestra `TOKEN_INVALIDO` en LOCAL, por eso el mapa local aparece en `Sin dato`).

## 11. Documentación, agentes y publicación (obligatoria)

- **Preflight de agentes**: `npm run agents:preflight -- --paths "apps/control-tower/**,scripts/certifications/apex-control-tower-local.js,scripts/certifications/apex-control-tower-consolidado-local.js,docs/qa/evidence/torre-medidores-20261105/**,docs/briefs/**,apps/control-tower/README.md"` → veredicto `OK`, sin `INTEGRAR_REMOTO` ni `CONFLICTO`.
- **Agentes consultados**: `equipo-apexos`, `apexos-brief`, `apexos-seguridad`, `apexos-performance`, `apexos-qa`.
- **Documentación a actualizar**: `docs/briefs/2026-11-05-torre-medidores-y-mapa.md`, `apps/control-tower/README.md`, `docs/qa/evidence/torre-medidores-20261105/`.
- **Agentes a actualizar**: `apexos-performance` `2.6.0` → `2.7.0` (control nuevo `torre-umbrales-fuente-unica`); `apexos-qa` `2.7.0` → `2.8.0` (control nuevo `torre-certifica-lo-visible`); `apexos-seguridad` `2.6.0` → `2.6.1`; `equipo-apexos` `2.5.0` → `2.5.1`; `apexos-brief` `2.7.1` → `2.7.2`.
- **Registro**: `agents/registry.json` (`version`, `updated_at`, `sha256`) y entrada en `agents/CHANGELOG.md`.
- **Cobertura de contexto**: `npm run agents:coverage -- --paths "<inventario exacto>"` en verde.
- **Secuencia de cierre**: `npm run agents:sync` → `npm run agents:check` → `npm run agents:preflight` → `npm run agents:coverage` → `npm run control:test` → commit.
- **Publicación obligatoria**: `git push origin desarrollo`. No cubre `develop`, `main`, force push, merges, migraciones remotas ni infraestructura.
- [x] Preflight sin `INTEGRAR_REMOTO` ni `CONFLICTO`
- [ ] Cobertura de contexto en verde (`agents:coverage`)
- [ ] Sin secretos, credenciales ni artefactos locales en el diff
- [ ] Documentación y agentes actualizados en el mismo commit
