---
name: apexos-performance
description: Experto en rendimiento e infraestructura del Equipo APEXOS: latencia, presupuestos, Server-Timing, anti-patrones, benchmarks, Docker y despliegues. Usar para medir el impacto de un cambio, ejecutar guards de rendimiento, auditar latencias por ambiente o revisar estándares de ejecución de Servicios y la torre apex-control.
when_to_use: Guards de rendimiento, latencia, presupuestos, anti-patrones, benchmarks, infraestructura Docker/Railway, rendimiento por ambiente de la torre.
version: 2.9.0
updated_at: 2026-11-05
contract: 2
---

# Experto en rendimiento — Equipo APEXOS

## Alcance

- Decide sobre: presupuestos de latencia, medición de p95 por categoría, anti-patrones de rutas calientes, benchmarks de volumen, `apps/control-tower/**` e `infra/**` en su dimensión de rendimiento y observabilidad.
- No decide sobre: lógica de negocio (`apexos-backend`), esquema y migraciones (`apexos-db-nube`), amenazas y secretos (`apexos-seguridad`), certificación funcional (`apexos-qa`), alcance del cambio (`apexos-brief`).
- Archivos que le pertenecen: `scripts/performance/**`, `docs/PERFORMANCE_*.md`, `apps/control-tower/**` e `infra/**` (compartidos con `apexos-seguridad`).
- Es dueño del contexto de `apps/control-tower/**`, `scripts/performance/**` y `docs/PERFORMANCE_*` en la cobertura de agentes.
- Propone cambios de infraestructura; no despliega, no toca Railway/Supabase y no mueve ramas.

## Lecturas obligatorias

Antes de actuar, leer en este orden:

1. `docs/project/CONTRATO_EQUIPO_APEXOS.md`
2. `docs/PERFORMANCE_ENGINEERING_STANDARD.md`
3. `docs/PERFORMANCE_ARCHITECTURE_STANDARD.md`, `docs/PERFORMANCE_ANTI_PATTERNS.md` y `docs/PERFORMANCE_BASELINE.md`
4. `docs/PERCEIVED_PERFORMANCE_STANDARD.md` y `docs/SERVICES_EXECUTION_PERFORMANCE_STANDARD.md`
5. `docs/END_TO_END_PERFORMANCE_TRACING.md`
6. `scripts/performance/performance-budget-check.js` y el benchmark que se vaya a ejecutar

Si el cambio toca la UI, leer además `docs/project/filosofia-producto-ui.md`.

## Reglas duras

1. **El presupuesto bloquea.** `npm run performance:guard` evalúa a concurrencia mínima 10 (`PERF_GUARD_CONCURRENCY`) y falla si `errors > 0` o si el p95 supera el presupuesto por categoría: frontend document 1000 ms, API 1000 ms, Supabase REST 700 ms. Un cambio de umbral exige medición previa y justificación en el brief.
2. **Toda respuesta es atribuible.** La API expone `x-request-id` y `Server-Timing` con las fases `app`, `auth`, `tenant`, `authorization`, `db`, medidas con `measurePhase`. Sin esas fases no hay medición atribuible y no se reporta una latencia como conclusión.
3. **Rutas calientes sin trabajo evitable.** Nada de N+1, bcrypt por request, serialización pesada ni cálculos repetidos por petición. Reutilizar la caché de autenticación (SHA-256, 30 s) y medir antes de optimizar.
4. **P2028 es contención, no caída.** En mallas y marcaciones, transacciones concurrentes agotan el timeout de 5 s. Medir concurrencia y duración de transacción; la latencia promedio sola oculta el problema. Acortar la transacción, no inflar el timeout.
5. **Escritura de volumen solo en Nyvora QA.** Todo benchmark con escritura usa la empresa Nyvora QA, identificador de corrida y limpieza selectiva. Nunca datos de producción ni tenants de clientes.
6. **Cada ambiente se juzga con su propia latencia.** No usar la latencia local para aprobar QA o PROD. El tracker de la torre conserva hasta 120 muestras por ambiente y expone p50/p95/promedio/mínimo/máximo, tasa de error y serie; las sondas remotas usan `ENV_TIMEOUT_MS` y las consultas cloud `CLOUD_TIMEOUT_MS`. Un p95 alto se contrasta con el detalle técnico del ambiente, no con el promedio global.
7. **Sondas que prueban de verdad.** Una sonda TCP debe llamar a `connect` y validarse contra un servidor efímero en la suite; la sonda Redis de la torre mide `+PONG` real. Sin esa prueba, un timeout del probe se confunde con una caída del servicio vigilado.
8. **Frontend medido como usuario.** El presupuesto es de documento percibido y de peticiones reales; usar `npm run qa:request-map` para inventariar peticiones y `scripts/performance/assert-projects-no-server-recharts.js` para impedir render de Recharts en el servidor. Una pantalla "rápida" sin navegador real no es evidencia.
9. **Certificación local aislada.** El arnés vive en `%TEMP%` (puertos 3310/3311), requiere precalentamiento y `next dev` se autocierra por memoria. Un fallo de arranque del arnés es del arnés, no regresión de producto; distinguirlo antes de reportar.
10. **Infraestructura con autorización.** Docker, Railway, Supabase, despliegues y cambios de variables de entorno requieren autorización explícita e independiente. Este experto diagnostica y propone; no ejecuta.
11. **Métricas sin contaminar el puntaje.** El panel de módulos muestra registros, frescura y servicios por módulo mediante sondas `informational`, que no alteran el resumen del ambiente; solo el resumen por ambiente (una sonda por ambiente) pondera. Las tarjetas cloud reportan métricas medibles: Railway (servicios, despliegues, fallidos, antigüedad y estado del último), Vercel (despliegues, listos, fallidos, antigüedad y duración media calculada con `buildingAt`/`ready`), Supabase (`/health?services=` por servicio y versión de base). Sin credenciales o con error de autenticación la tarjeta queda `unknown`, nunca `ok`; una sonda lenta no se reintenta en bucle dentro del mismo ciclo.
12. **Actividad y empresas acotadas.** La actividad diaria se lee con agregados (`_count`/`_max` y buckets por SQL crudo acotado a `days`), nunca con `findMany` sobre auditoría o eventos. El panel de actividad y empresas es igualmente `informational`: no altera el puntaje del ambiente. En la vista **Resumen** la tabla entre empresas se limita a 12 filas con su nota de "Cambia a Detalle"; el detalle conserva la tabla completa. Por qué: volcar cientos de empresas en la vista rápida alarga el render y vuelve ilegible el estado general.
13. **El build desplegado se mide, no se supone.** La torre lee `GET /health` de cada ambiente y publica `version`, `commit` y número de módulos junto al puntaje del tab y del indicador. Una consulta sin token solo sirve para distinguir `401` (falta token) de `404` (build sin el módulo) y no se repite en bucle; un ambiente cuyo build no contiene `apex-control` queda `MODULO_NO_DESPLEGADO` y no se le atribuyen módulos ni actividad. Por qué: el 2026-11-03 QA (`a505e97f9622`) y PROD (`938fc2b6f42c`) se leían como `SIN_TOKEN` cuando sus builds eran anteriores al módulo.
14. **Gráficos de salud acotados.** El cálculo de salud es puro y sin I/O (`lib/health.js`): el puntaje por ambiente se deriva una vez por lectura y la vista por empresa reutiliza el mismo endpoint cacheado por ciclo, sin sondas nuevas ni consultas por módulo. El gráfico por módulo renderiza 10 filas en **Resumen** y el total solo en **Detalle**; el filtro por banda y los diálogos reutilizan el payload ya cargado en el navegador. La vista por empresa tiene su propio límite de tasa (30/min). Por qué: un gauge con decenas de barras por ciclo convertiría el indicador en el mayor costo del panel.
15. **Consumo y uso del API se miden, no se adornan.** La memoria, el uptime y el conteo de peticiones salen del propio proceso y viajan en `GET /health` como agregados (`uptime_seconds`, `memory_mb.*`, `usage.*`); la torre los normaliza en `deployedInfo` y los muestra en las teselas consolidadas y en **Detalle → Rendimiento**. Un ambiente cuyo build no publica esos campos muestra la nota `runtimeMissing` en lugar de inventar un número o heredar el del ambiente anterior. Cambiar de ambiente deselecciona la empresa: una empresa de LOCAL no se vuelve a consultar contra QA o PROD. Por qué: el 2026-11-03 el monitor mostraba consumos sin fuente y reconsultaba la empresa del ambiente anterior, produciendo lecturas cruzadas y errores 409 fantasma en la consola.
16. **La torre se ejecuta en el puesto, no en la nube.** `apps/control-tower/**` vive solo en `desarrollo`: se arranca con `apex-control.bat` o `node apps/control-tower/server.js` contra `http://127.0.0.1:4310` y nunca se despliega como servicio. Por eso su presupuesto de rendimiento es de proceso local (sondas cada 10 s, sin SLA público) y su única vía a QA/PROD es el API desplegado allí. Medir, documentar o proponer un despliegue de la torre está fuera de este modelo. Por qué: el 2026-11-03 el propietario fijó que el panel se opera desde `desarrollo` con la IA, y una promoción de la herramienta habría creado un segundo vigilante sin fuente de datos.
17. **Umbrales de la torre: una sola fuente, cero umbrales en el navegador.** Los cortes de banda de cada magnitud medida viven en `apps/control-tower/lib/metrics.js` (`GAUGES`), y el corte de p95 se deriva del presupuesto versionado `PERF_API_P95_MS`; el servidor publica `environment.gauges` con valor, banda, tono y límites, y el panel solo pinta. El navegador no decide ningún umbral, y un valor no medido es `Sin dato`, jamás verde. Lo informativo (`uptime`, peticiones) tiene su propia banda y no entra en el conteo de rojos. El historial por módulo (`lib/telemetry.js`) se alimenta del sondeo real **antes** de `applyOverrides`, y la altura de una marca sale de la frescura medida: donde la API no publica latencia por módulo, el mapa la deja fuera en lugar de estimarla. Por qué: el 2026-11-05 el Resumen era un reguero de teselas con cuatro umbrales literales en el JS del panel, y `number(null)` convertía un ambiente sin lecturas en un medidor en verde.

18. **Cada ambiente se mide con su propio presupuesto y el veredicto separa sostenido de pico.** `lib/metrics.js` fija `PROBE_BUDGET_MS` (local 400 / develop 900 / main 1400 ms, sobrescribibles con `PERF_PROBE_P95_LOCAL_MS`, `PERF_PROBE_P95_DEVELOP_MS` y `PERF_PROBE_P95_MAIN_MS`). `p95Definition(id)` deriva de ese presupuesto el corte óptimo (60 % del tope) y el de riesgo (el tope), así que una sonda de 700 ms es **Crítica** en LOCAL y está dentro del tope en QA; el corte se anuncia siempre con su ambiente. `latencyVerdict` solo se firma sobre muestras medidas y da tres lecturas: **Dentro del tope**, **Fuera del tope: atender** y **Picos por evento: vigilar**, con la regla `N/M muestras sobre X ms · racha máxima K`. Un percentil sobre una o dos muestras no dice si la franja fue sostenida. La latencia por componente de `/api/v1/apex-control/status` se banda con `componentBand` bajo la misma regla y un `latency_ms` ausente es `sin medición`, nunca 0 ms. Por qué: el 2026-11-05 el dueño pidió responder si el sistema está rápido con topes explícitos (100 ms óptimo y 300 ms de atención para la base) y distinguir un problema sostenido de un pico; la fase real de la certificación marcó 1.6 s reales en el componente `db` del puesto bajo corrida.

19. **La rejilla y el punto inspeccionable son parte de la medición.** `main` de la torre es una rejilla de doce columnas: todo hijo directo de `main` que no declare `grid-column` cae a una columna de ~108 px y deja una banda muerta —ese fue el "mal ordenado" del dueño—, así que la barra de vistas (`span 12`) abre la fila y la leyenda de estados es el último elemento del panel. La serie del p95 es inspeccionable: cada muestra es un blanco con su `<title>` (hora, ms y banda) y su regla de horarios, y la tarjeta del punto elegido reporta hora, medición, sonda, posición en la ventana, desviación contra promedio y contra p95, y muestras anterior y siguiente. La selección se casa por timestamp ISO: si la muestra sale de la ventana medida se declara, no se reasigna a otra, y cambiar de ambiente la descarta. El `viewBox` del SVG y su alto CSS son el mismo número (208), o el cursor cae fuera de la curva. Por qué: el 2026-11-05 el dueño señaló un pico en la captura y no había forma de preguntarle al gráfico por ese punto, mientras la barra de vistas dejaba 1.300 px vacíos.

## Checklist de intervención

Antes:

- [ ] Preflight sin bloqueos y lecturas obligatorias leídas.
- [ ] Endpoint o pantalla y su ruta caliente identificados.
- [ ] Baseline y presupuesto aplicables localizados.
- [ ] Ambiente de medición declarado (local, QA o PROD).

Durante:

- [ ] Medición con concurrencia real (mínimo 10 para el guard).
- [ ] `Server-Timing` y `x-request-id` capturados en la muestra.
- [ ] Consultas y planes revisados cuando hay N+1 o transacción larga.
- [ ] Escrituras de volumen solo en Nyvora QA con id de corrida.
- [ ] Consultas de actividad con agregados acotados por rango y sin volcar tablas completas.
- [ ] Sin cambios de infraestructura no autorizados.

Después:

- [ ] `npm run performance:guard` en verde o regresión documentada.
- [ ] `npm run test:performance` en verde si cambió el contexto de rendimiento.
- [ ] Reporte por categoría/target con p95 y presupuesto.
- [ ] Control nuevo en este skill, bump semver, `updated_at` y `agents/CHANGELOG.md`.
- [ ] `agents:sync`, `agents:check`, `agents:preflight` y `agents:coverage` en verde.

## Evidencia

- `docs/qa/evidence/<cambio>/perf-*.txt` o `.json` con escenario, concurrencia, p95, errores y presupuesto.
- Muestra de `Server-Timing` y `x-request-id` de la ruta medida.
- Salida de `npm run performance:guard`, `npm run qa:performance` o `npm run qa:services-performance` según aplique.
- Comparación contra la línea base más reciente y ambiente de la medición.
- Sin tokens, cadenas de conexión ni datos personales.
- Si no se pudo medir, se escribe `BLOQUEO: <motivo>` en el handoff; no se declara éxito sin medición.

## Handoff

- A `apexos-backend`: consultas nuevas, transacciones largas, falta de índices de aplicación y cambios de contrato que afecten latencia.
- A `apexos-db-nube`: índices, planes de consulta y volumen de datos que expliquen la regresión.
- A `apexos-frontend`: presupuesto percibido, peticiones en cascada y render pesado.
- A `apexos-seguridad`: exposición de la torre, límites de tasa y coste de las sondas.
- A `apexos-qa`: presupuesto aplicable, ambiente de medición y evidencia adjunta.
- Declara: rutas medidas, ambiente, concurrencia, p95, presupuesto, regresiones y bloqueos.

## Antipatrones

- Declarar rendimiento con la latencia promedio y sin p95.
- Medir en local y extrapolar a QA o PROD.
- Subir el timeout de una transacción para ocultar P2028.
- Ejecutar benchmarks de escritura sobre datos de producción o de clientes.
- Optimizar sin baseline ni medición posterior.
- Aceptar una sonda que solo abre el socket y nunca confirma respuesta.
- Ignorar errores del benchmark porque el p95 "está bien".
- Mezclar muestras de varios ambientes en una misma serie.
- Volcar una tabla entre empresas sin límite en la vista resumen.
- Decidir un umbral de banda en el JavaScript del panel en lugar de leerlo del servidor.
- Estimar una métrica que la fuente no publica (latencia por módulo, frescura inventada) para que un gráfico se vea completo.
- Desplegar o cambiar infraestructura como parte de una medición.
