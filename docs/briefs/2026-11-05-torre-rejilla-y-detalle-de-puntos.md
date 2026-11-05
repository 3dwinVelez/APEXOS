# Brief — Torre de control: rejilla de una fila y detalle inspeccionable del punto

- **ID**: `2026-11-05-torre-rejilla-y-detalle-de-puntos`
- **Fecha**: `2026-11-05`
- **Rama activa**: `desarrollo`
- **Prompt crudo**: "revisa nuevamente la visual ya que se te pasaron muchos elementos mal ordenados y ubicados, adicionalmente el reporte debe poder permitirme ver el detalle en el punto que yo desee ver para que me muestre horarios, picos ect.." (con dos capturas: una banda muerta con una X sobre el gráfico de Latencia y un pico señaladado a lápiz sobre la curva).

## 1. Objetivo

Dos defectos que impiden leer la vista **Latencia** como respuesta a la pregunta del propietario:

1. **El orden**. `main` es una rejilla de 12 columnas; cualquier hijo sin `grid-column` ocupa una sola columna de ~108 px. La barra de vistas (`#viewNav`) no lo declaraba, así que quedaba como un mini-menú apilado a la izquierda con una banda vacía de más de 1.300 px al lado, y la leyenda global estaba en medio, entre la navegación y la respuesta. La vista debe leerse: pregunta → barra de vistas en toda la fila → evidencia → leyenda de estados al final.
2. **El punto**. La curva dibujaba el tope pero no dejaba preguntar por una muestra. El propietario necesita señalar un punto y que el panel responda con su hora, su medición, su banda, si la sonda falló, su posición dentro de la ventana medida, su desviación contra el promedio y contra el p95, y las muestras anterior y siguiente. Y necesita la lista de picos ordenada, no solo la forma de la línea.

Regla transversal que se mantiene: **lo no medido no es cero**. Un punto que salió de la ventana medida se declara como tal; el panel no reasigna la selección a otra muestra para parecer completo.

## 2. Alcance exacto

| Estado | Archivo | Qué cambia |
|---|---|---|
| `M` | `apps/control-tower/public/index.html` | `#statusLegend` sale de entre la navegación y las secciones y pasa a ser el último hijo de `main`. |
| `M` | `apps/control-tower/public/styles.css` | `.view-nav { grid-column: span 12 }` (la corrección del orden); alto del gráfico 208 px acorde al `viewBox`; `.chart-label` con `paint-order: stroke` para que la serie no tache el texto "tope 400 ms"; clases nuevas del explorador: `.chart-hit`, `.chart-cursor`, `.chart-cursor-dot`, `.chart-tick`, `.latency-explorer`, `.peaks`, `.point-detail`, `.peak-btn`, `.point-row`. |
| `M` | `apps/control-tower/public/app.js` | `latencyChart()` dibuja un blanco por muestra (`<rect class="chart-hit" data-chart-point-at tabindex role aria-label>` con su `<title>` `fecha, hora · ms · banda`), una regla de horarios (`axisTicks`, 4 marcas) y el cursor del punto elegido; `latencyExplorer()` agrega **Picos y horarios medidos** (los tiempos más altos, nombrados por hora y medición, no por posición) y `pointDetail()` la tarjeta de ocho filas del punto; `state.chartPointAt` se casa por timestamp ISO, se deselecciona al cambiar de ambiente y Enter/Espacio activan el blanco. |
| `M` | `apps/control-tower/test/ui-indicators.test.js` | Nuevas pruebas en `node:vm`: blancos y horarios dibujados, `<title>` con hora y medición, lista de picos con el pico sobre el tope nombrado por su hora (y la muestra con sonda fallida marcada), punto aún no seleccionado, y el contrato de rejilla leído del propio `index.html`/`styles.css` (leyenda después de la última sección, `.view-nav` con `span 12`). |
| `M` | `scripts/certifications/apex-control-tower-local.js` | Nuevas gates navegador: `browser_rejilla_vistas_horizontal` (nav > 60 % del ancho, alto < 90 px, leyenda última, ≥2 secciones visibles) y `browser_latencia_detalle_por_punto` (blancos ≥2, horarios ≥2, clic a un pico, ≥6 filas, `Hora de la muestra`, `N ms · Óptimo/En riesgo/Crítico`, cursor y activo = 1) más la captura `tower-latencia-punto.png`. La lectura del explorador ahora **espera a que la serie tenga ≥2 muestras**: el gráfico se llena sondeo a sondeo y, leído de una vez, el gate pasaba o fallaba según el minuto. |
| `M` | `scripts/certifications/apex-control-tower-consolidado-local.js` | Las dos mismas gates en el harness de dos APIs (`navegador_rejilla_vistas_horizontal`, con `huecoHastaLaPrimeraSeccion < 40` en lugar de un `bandaMuerta` que confundía una `<nav>` legítima con una banda muerta; `navegador_latencia_detalle_por_punto` con `waitFor` de 30 s por la misma razón). |
| `M` | `docs/qa/evidence/apex-control-tower-f1/*` | Certificación fase uno re-ejecutada: 66/66. |
| `M` | `docs/qa/evidence/torre-consolidado-empresas-20261103/*` | Certificación consolidada re-ejecutada: 53/53. |
| `A` | `docs/qa/evidence/apex-control-tower-f1/tower-latencia-punto.png` | Captura de la vista Latencia con un pico seleccionado y su tarjeta de detalle. |
| `M` | `apps/control-tower/README.md` | Contrato de la rejilla (cada sección declara su columna), la fila de Latencia con el explorador de puntos y los recuentos de certificación. |
| `M` | `agents/registry.json`, `agents/CHANGELOG.md` | Bumps y controles de los agentes dueños. |
| `M` | `agents/apexos-performance/SKILL.md` | Control del contrato de rejilla y del explorador de puntos como lectura del p95. |
| `M` | `agents/apexos-qa/SKILL.md` | Control de la espera por ≥2 muestras antes de afirmar sobre la serie. |
| `M` | `agents/apexos-seguridad/SKILL.md` | Control del `aria-label`/`<title>` del gráfico: hora y medición agregadas, sin rutas, tenants ni payloads. |
| `M` | `agents/equipo-apexos/SKILL.md` | "Una vista por concepto" aplicado al orden de la fila de navegación y a la inspección por punto. |
| `M` | `.qoder/skills/**` | Fuentes canónicas de los cuatro agentes anteriores. |
| `A` | `docs/briefs/2026-11-05-torre-rejilla-y-detalle-de-puntos.md` | Este brief. |

### Módulos (`change_intent.modules`)

- `control-tower`
- `certificaciones-control-tower`
- `agentes-gobernanza`

### Borrados autorizados (`allowed_deletions`)

- ninguno.

## 3. Fuera de alcance

- No se toca `apps/api/**` ni `apps/web/**`: la serie, el tope y las bandas ya las publica el servidor de la torre desde `/health`.
- No se habilitan ni se rotan credenciales: QA/PROD siguen bloqueados por despliegue y JWT, y la nube por tokens ausentes.
- No se promueve nada. `apps/control-tower/**` reposa solo en `desarrollo`.
- No se borra evidencia antigua ni se reescribe historia compartida.
- El defecto declarado de `computeOverall` (`apps/control-tower/lib/probes.js:386` devuelve `ok` a un ambiente con 3 chequeos `unknown`) queda abierto, no se toca en este brief.

## 4. Restricciones

- Rama: solo `desarrollo`; push únicamente a `origin/desarrollo` al cierre. Prohibido `develop`, `main`, force push, merge, deploy, migraciones remotas e infraestructura sin autorización expresa.
- Ningún umbral vive en el navegador: el gráfico usa `limits` del medidor `p95` publicado por el servidor; el panel solo pinta y consulta.
- La inspección no agranda la superficie: el `<title>` y el `aria-label` de cada blanco dicen hora, milisegundos y banda —nunca ruta, tenant, usuario ni payload—.
- Secretos solo en `apps/control-tower/.env.local` (gitignored): no se imprimen, commitean, loguean ni van a evidencia.
- Frente en paralelo: el trabajo de `vitrina-comercio-tematizada` está sin commitear en `apps/api/**`, `apps/web/**` y su brief. No se toca, no se commitea y no se revierte; el `agents/CHANGELOG.md` se respeta con su hunco ajeno fuera del commit de la torre.

## 5. Criterios de aceptación

1. `npm run control:test` → **140/140** verdes (3 pruebas nuevas de UI sobre `node:vm`: blancos/horarios, picos nombrados por hora y el contrato de rejilla).
2. `npm run certify:control-tower:local` → **66/66**, con `browser_rejilla_vistas_horizontal` y `browser_latencia_detalle_por_punto` verdes y `tower-latencia-punto.png` en evidencia.
3. `npm run certify:control-tower:consolidado` → **53/53**, con `navegador_rejilla_vistas_horizontal` (hueco < 40 px, leyenda última) y `navegador_latencia_detalle_por_punto` (clic en un pico devuelve ≥6 filas con hora y banda).
4. Orden: la barra de vistas ocupa toda la fila, ninguna banda muerta entre navegación y primera sección, y la leyenda de estados es el último elemento del panel en las siete vistas.
5. Punto: al señalar un blanco o un pico, la tarjeta muestra `Hora de la muestra`, `Medicion` (`N ms · banda`), `Sonda`, `Posicion`, `Contra el promedio`, `Contra el p95`, `Muestra anterior` y `Muestra siguiente`; al señalar de nuevo, se deselecciona; al cambiar de ambiente, la selección se descarta.
6. Honestidad del dato: una muestra que salió de la ventana medida se declara ("ya salió de la ventana medida"), no se reemplaza por otra.

## 6. Evidencia y certificación exigida

- Pruebas unitarias: `apps/control-tower/test/*.test.js` vía `npm run control:test` (140/140).
- Certificaciones con navegador real: `npm run certify:control-tower:local` (66/66, `docs/qa/evidence/apex-control-tower-f1/`) y `npm run certify:control-tower:consolidado` (53/53, `docs/qa/evidence/torre-consolidado-empresas-20261103/`).
- Diagnóstico que originó el trabajo: la X de la captura del propietario venía de una pestaña abierta antes de los últimos cambios de CSS/JS; el servidor responde `cache-control: no-store`, así que el panel necesita recarga dura (`Ctrl+F5`) para verse como está ahora.
- Falso rojo propio, corregido en el arnés: la expresión CDP del explorador estaba escrita `(() => ({...}))` sin invocar, así que `evaluate` devolvía la función y el detalle se serializaba `{}`. Se corrigió y la lectura ahora espera la serie.
- `certification_status`: `local_passed_qa_pending`. La torre no se despliega, así que no hay QA de nube para sus certificaciones y estas no alimentan ningún gate de promoción.

## 7. Capacidades protegidas

- **Una vista por concepto, en una fila** — contrato probado dos veces: en `ui-indicators.test.js` leyendo `index.html`/`styles.css` y en navegador (`browser_rejilla_vistas_horizontal`, `navegador_rejilla_vistas_horizontal`).
- **Latencia explicable por punto** — `latencyChart` + `latencyExplorer` + `pointDetail`; probado en `browser_latencia_detalle_por_punto` y `navegador_latencia_detalle_por_punto`.
- **No medido ≠ cero y selección que no miente** — la muestra fuera de ventana se declara; probado en la prueba nueva de deselección/ventana.
- **Umbral único en el servidor** — el gráfico toma `limits` del medidor `p95`; ninguna constante de umbral entró en el navegador.
- **Consola sin errores y sin jerga interna** — `navegador_consola_sin_errores`, `navegador_sin_jerga_degrade` siguen verdes con el DOM nuevo.

## 8. Riesgos y rollback

- Riesgo: los gates del gráfico leídos una sola vez son un falso rojo según el minuto (la serie se llena cada 4 s) → Mitigación: `waitFor` con umbral estructural (≥2 blancos y ≥1 pico), no de tiempo.
- Riesgo: `viewBox` y alto CSS desalineados deforman el gráfico y el cursor cae fuera de la curva → Mitigación: `208` en ambos lados y prueba que afirma el `aria-label` con el número de muestras dibujado.
- Riesgo: el propietario sigue viendo la versión vieja si no recarga → Mitigación declarada: recarga dura; no se puede forzar desde el servidor porque el documento ya está abierto.
- Riesgo: confundir el commit de la torre con el del frente Comercio (ambos tocan `agents/CHANGELOG.md`) → Mitigación: inventario exacto por archivo y el hunco ajeno se preserva sin commitear.
- Rollback: `git revert` del commit de la torre (no reset): revierte panel, pruebas, certificaciones y evidencia juntos.

## 9. Supuestos y preguntas abiertas

- Supuesto: la "X" de la captura es el documento viejo del propietario, no un estado que el código actual dibuje; la certificación y las cuatro vistas verificadas en 1512×950 no reproducen ese dibujo.
- Supuesto: la inspección por punto se queda en la vista Latencia; si el propietario la pide en Nube o Base de datos, es otra intervención con su propia gate.
- Preguntas abiertas (fuera de alcance, requieren autorización expresa): desplegar en QA/PROD un build con `apex-control`, configurar `ENV_DEVELOP_APEX_TOKEN`/`ENV_MAIN_APEX_TOKEN` y los tokens `RAILWAY_TOKEN`/`VERCEL_TOKEN`/`SUPABASE_ACCESS_TOKEN`.

## 10. Autorizaciones requeridas

- [x] Cierre en `desarrollo` con `git push origin desarrollo` (autorización permanente y acotada del propietario).
- [ ] Pendiente: despliegue en QA/PROD del build con `apex-control` y telemetría de `/health`.
- [ ] Pendiente: JWTs de QA/PROD para la torre y tokens cloud.
- [ ] Pendiente (ajeno a la torre): decidir si `computeOverall` deja de dar `ok` a un ambiente con chequeos `unknown`.

## 11. Documentación, agentes y publicación (obligatoria)

- **Preflight de agentes**: `npm run agents:preflight -- --paths "apps/control-tower/**,scripts/certifications/apex-control-tower-local.js,scripts/certifications/apex-control-tower-consolidado-local.js,docs/briefs/**,docs/qa/evidence/**,agents/**,.qoder/skills/**"` → sin `INTEGRAR_REMOTO` ni `CONFLICTO`.
- **Agentes consultados**: `equipo-apexos`, `apexos-brief`, `apexos-performance`, `apexos-qa`, `apexos-seguridad`.
- **Documentación actualizada**: este brief y `apps/control-tower/README.md`.
- **Agentes actualizados**: `apexos-performance`, `apexos-qa`, `apexos-seguridad`, `equipo-apexos` (bump semver + `updated_at` + `sha256` en `agents/registry.json` y entrada en `agents/CHANGELOG.md`).
- **Cobertura de contexto**: `npm run agents:coverage -- --paths "<inventario exacto>"` en verde.
- **Publicación obligatoria**: `git push origin desarrollo`. No cubre `develop`, `main`, force push, merges, migraciones remotas ni infraestructura.
