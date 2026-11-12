# APEX Control Tower

Torre de vigilancia externa para APEXOS. Corre como un proceso Node independiente, fuera de la aplicación y fuera de su base de datos, para que siga funcionando aunque la API, la web o la infraestructura de APEXOS fallen.

No requiere `npm install`: usa Node.js 22 o superior y solo módulos nativos.

## Rama de residencia: `desarrollo`

La torre es una herramienta de puesto de trabajo, no un servicio desplegado. Vive y se ejecuta **solo en `desarrollo`**: no se promueve a `develop` ni a `main`, no se despliega en Railway/Vercel y sus certificaciones certifican la herramienta en `desarrollo` (no son evidencia de promoción). La política completa está en `docs/project/flujo-ramas-y-ambientes.md`.

Esto no cambia la otra mitad de la conexión: el módulo `apps/api/src/modules/apex-control/**` y la telemetría de `/health` sí siguen el flujo `desarrollo -> develop -> main`, porque la torre lee QA y PROD a través del API desplegado ahí.

## Inicio rapido

En Windows, desde la raíz del repositorio:

```text
apex-control.bat
```

El lanzador inicia la torre en `http://127.0.0.1:4310` y abre el panel en el navegador. La consola muestra el estado y el código de emparejamiento de Telegram.

Alternativas:

```bash
node apps/control-tower/server.js
npm --workspace apps/control-tower start
```

Si el puerto está ocupado, define `TOWER_PORT` en `apps/control-tower/.env.local`.

## Qué vigila

Sondas independientes cada 10 segundos:

- **Local** (rama `desarrollo`): API (`/health`), web (`:3001`), PostgreSQL y Redis por TCP, Redis con `PING` real, Brain (`:8000/health`), MinIO (`:9000/minio/health/live`), Docker y `/api/v1/apex-control/status`.
- **Develop · QA** (rama `develop`): API y web públicas de QA, Supabase QA y, si hay credenciales, Railway y Vercel.
- **Main · Producción** (rama `main`): las mismas sondas contra producción.
- **Módulos**: salud detallada de los 32 módulos operativos que expone `GET /api/v1/apex-control/modules`, con registros, última actividad, frescura esperada, servicios de los que depende y alertas por módulo.
- **Repositorio git**: rama activa, árbol de trabajo, SHAs locales y remotos y flujo `desarrollo -> develop -> main`.
- **Nube**: proyecto, servicios y últimos deployments de Railway; proyecto, deployments y duración media de Vercel; estado del proyecto y salud por servicio de Supabase.
- **Cola de trabajos y puente de Qoder**.

Cada sonda remota que no se puede medir queda en `unknown` sin bloquear a las demás cuando falta configuración o credenciales. El panel no depende de los servicios vigilados: si APEXOS se cae, la torre sigue mostrando el estado y alertando.

La sonda Redis abre su propio socket TCP contra `REDIS_HOST:REDIS_PORT` y espera `+PONG`; no reutiliza el cliente de la API, así que mide el puerto real y no el estado interno de la aplicación.

## Panel

Siete vistas, una por pregunta; la elección se recuerda en el navegador (`towerView`). Cada bloque del HTML declara en `data-views` en cuáles aparece, así que una vista nunca muestra lo que no responde a su pregunta. **Qué se pinta y cuántas cosas se pintan no se decide en el panel**: el servidor lo publica en `environment.cockpit` y `environment.viewGauges` (`lib/metrics.js`) y el navegador solo dibuja esa lista.

| Vista | Pregunta que responde | Qué pinta |
|---|---|---|
| **Resumen** | ¿Cómo está APEXOS ahora mismo? | Un **cockpit de nueve elementos** —el gráfico dominante (`p95 de la sonda al API`) con su veredicto y su pie `Actual · Mín · Prom · Máx`, dos medidores radiales (**Salud de la plataforma** y **Presión de heap**) y seis teselas con su gráfico y su enlace «Ver evidencia» (**Peticiones por minuto**, **Latencia de la base**, **Registros medidos**, **Frescura de datos**, **Empresas con actividad**, **Errores del servidor**)**— y, al pie, la barra de estado (`Contadores · Errores · Advertencias · Alertas abiertas · Trabajos por aprobar`). El rótulo del panel declara la cota: **`9 de 19 medidores · N en rojo · N en riesgo`**. El veredicto del Resumen se calcula sobre esos nueve, no sobre los diecinueve. |
| **Latencia** | ¿Cómo está la latencia? | Veredicto (dentro del tope / picos por vigilar / fuera del tope: atender) con la regla que lo produjo y la serie del p95 con sus líneas de óptimo y tope. La serie es inspeccionable: cada muestra es un punto que se puede señalar con el cursor o con Tab, y debajo están **Picos y horarios medidos** (los tiempos más altos de la ventana, nombrados por su hora y su medición) y la tarjeta del punto elegido: hora, medición con su banda, si la sonda respondió o falló, posición dentro de la ventana, desviación contra el promedio y contra el p95, y las muestras anterior y siguiente. La vista se queda con los cuatro estadísticos que responden a su pregunta —**p50**, **p95**, **Máximo** y **Muestras**— y las sondas que produjeron la serie (top 10, con su cuenta); la telemetría del proceso vive en la vista API. |
| **API** | ¿El API responde bien con la carga que tiene? | Las cuatro teselas que publica `VIEW_SHORTLIST.api` (**Peticiones por minuto**, **Sondas fallidas**, **Errores del servidor**, **Presión de heap**), cada una con su gráfico y sus cortes, y la latencia que el propio servidor mide componente por componente (`/apex-control/status`) en el top 8 con su banda y su historia dibujada en la misma gramática. |
| **Módulos** | ¿Los módulos están óptimos y al día? | Mapa único de módulos vs API (un gráfico de latencia por renglón, top 10 con la línea de cuenta de lo que quedó fuera) y las cuatro teselas de `VIEW_SHORTLIST.modulos` (**Frescura de datos**, **Actividad de hoy**, **Usuarios activos**, **Pings GPS**) sobre la serie diaria de actividad. Las tarjetas por dominio y las tablas de actividad se retiraron del mapa: su evidencia ya vive en el renglón y en la vista Base de datos. |
| **Base de datos** | ¿La base está rápida y con datos reales? | Veredicto de la base medido desde adentro del API y las cuatro teselas de `VIEW_SHORTLIST.datos` (**Latencia de la base**, **Consultas lentas**, **Registros medidos**, **Empresas con actividad**) con su gráfico y sus cortes. Debajo, la tabla de registros por módulo y el monitor consolidado por empresa con su selector. |
| **Nube** | ¿Los servicios de la nube están bien? | Railway, Supabase y Vercel con tres métricas medibles cada uno y su viaje bandeado por presupuesto de ambiente, o la variable exacta que falta, o `No aplica` cuando el ambiente no usa ese proveedor, y la preparación de credenciales por ambiente. El medidor `cloudLatency` es la única tesela con umbral de la vista. |
| **Operación** | ¿Qué se está haciendo y qué falta? | Veredicto del puesto con sus dos medidores (**Alertas abiertas**, **Trabajos por aprobar**) con umbral y gráfico de su historia, ramas, trabajos del puente Qoder, Telegram y la traza de eventos (top 12, con la cuenta de lo que quedó atrás). |

Reglas de lectura que aplican a todas las vistas:

- **La cantidad es un presupuesto, no una preferencia estética.** `COCKPIT` fija los nueve elementos del Resumen y `VIEW_SHORTLIST` como máximo cuatro teselas por vista de detalle; el navegador lee `environment.viewGauges` (`viewGaugeList()`) y no filtra ni cuenta. Los topes de lista viven en `public/app.js`: `VIEW_TILE_MAX = 4`, `CHECK_LIST_MAX = 10`, `COMPONENT_LIST_MAX = 8`, `EVENT_LIST_MAX = 12`, `MAP_MAX_ROWS = 10`, `CLOUD_METRIC_MAX = 3`.

- **Lo no medido no es cero.** Un componente sin `latency_ms`, un módulo sin conteo de registros o un ambiente sin historia quedan en `Sin medición` / `Sin dato`; el panel nunca los cuenta como métrica ni los pinta en verde (`measuredNumber` en el navegador, `measuredValue` en `lib/metrics.js` en el servidor).
- **El umbral lo publica el servidor.** Valor, banda y cortes salen de `lib/metrics.js` (`GAUGES`, una entrada por pregunta) y el navegador solo pinta; no hay topes escritos a mano en el panel. La pregunta de cada vista tampoco se reescribe: sale de `VIEW_QUESTIONS`.
- **Cada medidor es el mismo gráfico de latencia.** Una sola implementación (`thresholdChart` en `public/app.js`) pinta la serie medida con sus dos cortes: la raya punteada de `óptimo`, la raya de `tope` y su rótulo. Con esa misma función se dibujan el gráfico dominante del cockpit (`cockpitHero`), las teselas del cockpit y de las vistas API / Módulos / Base de datos / Operación / Actividad, las sondas, los componentes, los proveedores cloud y cada renglón del mapa de módulos —solo cambia el alto del `viewBox`—. Los dos medidores de peso usan el mismo umbral publicado en forma de aguja (`dialSvg`), no otra escala. Ya no existe la franja de marcas ni la escala de tres tramos: un número suelto no responde ninguna pregunta. Donde el servidor no publicó corte todavía (ventana sin las 8 lecturas necesarias) el gráfico se dibuja igual y el pie lo admite: `sin banda habitual todavía: N de 8 lecturas medidas`. Donde no hubo lectura, el recuadro queda vacío y el pie dice `N sondeos guardados · ninguno dejó lectura de este monitor`, o `sin historia: N de M lecturas medidas` en un renglón del mapa. La historia vive en `lib/monitor-history.js` (anillo de 40 muestras por familia y por ambiente, persistido en `data/monitor-history.json`); la banda y los cortes se recalculan al leer, nunca se guardan. El anillo no se retrorellena: la historia empieza el día que se instaló esta versión y avanza a la cadencia de sondeo.
- **Picos contra sostenido.** La regla está en `latencyVerdict`: solo un evento por encima del tope es un pico que se vigila; una racha o un porcentaje sostenido sobre la ventana es un problema que se atiende. La regla usada aparece escrita bajo el veredicto.
- **Una vista, una fila.** `main` es una rejilla de doce columnas: cada sección declara su `grid-column` y la barra de vistas ocupa las doce. Un hijo sin declaración cae a una columna de ~108 px y deja una banda muerta, que es exactamente el desorden que el propietario ve. La leyenda de estados es el último elemento del panel, nunca un muro entre la navegación y la respuesta.
- **El punto señalado no se reasigna.** La selección del gráfico se casa por el timestamp ISO de la muestra. Si esa muestra sale de la ventana medida (40 sondeos), la tarjeta lo dice en vez de mostrar otra; cambiar de ambiente descarta la selección porque los horarios pertenecen al ambiente anterior.
- **Servicios**: estado, latencia, detalle, impacto funcional, acción sugerida y detalle técnico expandible.
- **Módulos**: un solo mapa (renglón = gráfico de latencia, top 10 de los 32 con su cuenta de los que quedaron fuera y de los que no tuvieron lectura) y el veredicto de la pregunta. Las tarjetas por dominio se retiraron: registros, frescura, servicios y alertas de cada módulo viven en el renglón y en su detalle. El filtro **Solo problemas** deja a la vista únicamente lo que está caído o fuera del objetivo. Si la API no entrega datos, el panel muestra el catálogo en `Sin dato` y lo declara, no lo pinta como sano.
- **Actividad**: las cuatro teselas que publica `VIEW_SHORTLIST.modulos` (frescura de datos, actividad de hoy, usuarios activos, pings GPS) sobre la serie diaria de auditoría y eventos. Sesiones activas y clientes WebSocket siguen midiéndose y bandeando en el servidor, pero no suben a la vista: cinco contadores de conexión no respondían a «¿los módulos están óptimos y al día?».
- **Empresas**: monitor consolidado con conectividad por `tenant_id` (sesiones, usuarios, última actividad, pings GPS, estado) y sus acciones de intervención. La tabla vive en la vista **Base de datos** con el selector de empresa; el Resumen ya no lista empresas —su cota son los nueve elementos del cockpit y la barra de estado—.
- **Acciones de intervención**: en cada bloque bloqueado o con módulos fallando, una lista priorizada con qué hacer, el agente responsable y el siguiente comando.
- **Alertas**: incidentes por ambiente, con impacto funcional, acción y detalle técnico. El bloque vive en la vista **Operación** junto con los trabajos por aprobar —las dos teselas que publica `VIEW_SHORTLIST.operacion`—; en el Resumen solo queda el chip `Alertas abiertas` de la barra de estado, porque un contador no es un incidente.
- **Rendimiento**: la vista Latencia se queda con los cuatro estadísticos que responden a su pregunta — **p50**, **p95**, **Máximo** y **Muestras** — más los dos chips de banda separados (**latencia**: p95 medido; **sondas**: sondeos `/health` que fallaron) porque no son la misma señal. El promedio, el mínimo y la tasa de error fuera de la ventana no se muestran: no cambiaban ninguna decisión. El eje del gráfico baja a segundos cuando la ventana medida dura menos de cinco minutos, porque con `hh:mm` todas las marcas caen en la misma hora y el eje queda con una sola etiqueta.
- **Ambientes**: tabs `Local`, `Develop · QA` y `Main · Producción`; el filtro se aplica a todas las vistas. Debajo, una leyenda fija qué significa cada estado. Cambiar de ambiente cierra la empresa abierta: no se relee una empresa de LOCAL contra QA o PROD.
- **Ramas**: relación local/remota de las tres ramas, con la rama del ambiente seleccionado resaltada.
- **Trabajos Qoder**: creación, aprobación, rechazo y seguimiento de instrucciones.
- **Telegram**: estado del canal, emparejamiento y simulación en dry-run.
- **Eventos**: traza de alertas, mensajes, trabajos y latidos.

Los datos locales se guardan en `apps/control-tower/data/` (ignorado por git).

## Ambientes y nube

Los tres ambientes se configuran en `.env.local`. Las URLs públicas de QA y PROD ya traen valores por defecto; normalmente solo necesitas tokens e IDs de proyecto.

| Ambiente | Rama | Variables principales |
|---|---|---|
| `local` | `desarrollo` | `ENV_LOCAL_API_URL`, `ENV_LOCAL_WEB_URL`, `ENV_LOCAL_APEX_TOKEN` (o `APEX_CONTROL_TOKEN`) y `ENV_LOCAL_APEX_REFRESH` |
| `develop` | `develop` | `ENV_DEVELOP_API_URL`, `ENV_DEVELOP_WEB_URL`, `ENV_DEVELOP_SUPABASE_URL`, `ENV_DEVELOP_APEX_TOKEN`, `ENV_DEVELOP_APEX_REFRESH` |
| `main` | `main` | `ENV_MAIN_API_URL`, `ENV_MAIN_WEB_URL`, `ENV_MAIN_SUPABASE_URL`, `ENV_MAIN_APEX_TOKEN`, `ENV_MAIN_APEX_REFRESH` |

### Credencial autorenovable

Los puntos de medición que necesitan `Authorization: Bearer` —`/apex-control/status`, `/modules`, `/activity` y `/tenants`— dependen de que ese JWT siga vivo. Un acceso del API local dura ocho horas, así que la torre dejó de pedirle a una persona que lo reescribiera a mano:

- `lib/credential.js` corre **antes** de cada sondeo (`server.js`: `await credentials.ensure()`). Si quedan más de diez minutos de vida (`credentials.marginMs`), no hace nada; si no, llama a `POST <apiBaseUrl>/api/v1/auth/refresh` con el token de renovación del ambiente y guarda el par rotado. La torre **no** firma tokens ni conoce `JWT_SECRET`: usa la ruta soportada de autenticación, y la autoridad sobre si el token sirve la sigue teniendo la API.
- El par rotado se persiste en `apps/control-tower/data/credential.json` (gitignored). `.env.local` del dueño **no** se reescribe nunca desde la torre; la semilla del refresh es `ENV_<AMBIENTE>_APEX_REFRESH`.
- Arrancar la torre no fabrica una sesión nueva: si el JWT de `.env.local` sigue vigente, se adopta su propio `exp` y no se rota la sesión del puesto.
- Si la API rechaza el refresh (`401`/`403`) el ambiente pasa a `REVOCADA`, se vacía el token para no seguir castigando la API con un token muerto y se respaldan cinco minutos (`deniedRetryMs`) antes de reintentar. Sin red queda `SIN_CONEXION` con respaldo corto; con JWT fijo vencido y sin refresh, `TOKEN_VENCIDO`.
- Cada ambiente publica su dictamen en `environment.credential` (`mode`, `status`, `reason`, `expiresAt`, `lastRefreshAt`, `nextRetryAt`, `attempts`, `refreshConfigured`, `tokenConfigured`). **Ningún token viaja al panel**, a los logs ni a la evidencia.
- Para emitir el par de un ambiente: `npm run control:credential -- --environment <local|develop|main>` con `TOWER_CREDENTIAL_EMAIL` y `TOWER_CREDENTIAL_PASSWORD` en el entorno (la contraseña nunca va en un argumento: la línea de comandos queda en el historial del shell). Escribe solo esas dos claves en `.env.local` preservando el resto del archivo, con `chmod 0600`.

El preset de la renovación se ajusta con `TOWER_CREDENTIAL_MARGIN_MS`, `TOWER_CREDENTIAL_RETRY_MS`, `TOWER_CREDENTIAL_DENIED_RETRY_MS` y `TOWER_CREDENTIAL_TIMEOUT_MS`; este último es independiente del presupuesto de sonda por ambiente (`ENV_TIMEOUT_MS`), porque la renovación ocurre antes del sondeo.

### Salud por módulo

El panel de módulos consume `GET /api/v1/apex-control/modules` con `Authorization: Bearer <JWT>`. El JWT debe pertenecer a un usuario con permiso `apex-control:read` del tenant que se quiere vigilar. Cada ambiente usa su propio token:

- `ENV_LOCAL_APEX_TOKEN` apunta a la API local; si falta, se usa `APEX_CONTROL_TOKEN`.
- `ENV_DEVELOP_APEX_TOKEN` y `ENV_MAIN_APEX_TOKEN` son obligatorios para leer módulos remotos, y su `ENV_*_APEX_REFRESH` es lo que permite que la torre los mantenga vivos. La torre **no** reutiliza el token local contra QA ni PROD: sin par propio el ambiente queda `SIN_CREDENCIAL` y sus módulos en `Sin dato`.
- Sin token la torre igual consulta la ruta, sin credencial: `401` confirma que el módulo existe y falta el JWT; `404` significa que el build desplegado no incluye `apex-control` y lo reporta como `MODULO_NO_DESPLEGADO`. Así el panel no atribuye a una credencial lo que en realidad es un despliegue pendiente.
- Los tokens de sesión viven solo en `apps/control-tower/.env.local` y caducan; renueva el valor cuando el panel reporte `TOKEN_INVALIDO`.

Los módulos no contaminan las sondas de infraestructura, pero sí el indicador oficial: el puntaje del ambiente mezcla 70% módulos y 30% infraestructura cuando ambas fuentes se pueden medir. Un módulo caído genera alerta de severidad media.

### Indicador oficial de salud

El primer bloque del panel es el indicador oficial, no un adorno: publica el puntaje, la banda y los umbrales que lo produjeron.

| Banda | Rango | Qué significa |
|---|---|---|
| Óptimo | 85–100 | Opera con datos frescos y servicios sanos. |
| En riesgo | 60–84 | Responde, pero fuera del objetivo: datos viejos, una dependencia lenta o un servicio con alerta. |
| Crítico | 0–59 | Módulo caído o dependencia vital sin servicio. |
| Sin dato | — | La API no pudo medir; no se premia ni se castiga. |

- Puntaje base por estado medido: `ok` 100, `degraded` 65, `down` 10. Un módulo sano que consumió más de tres cuartas partes de su ventana de frescura pierde hasta 25 puntos (piso 70) y entra en riesgo.
- Ambiente: 70% módulos + 30% infraestructura. Si una fuente no se puede medir, el puntaje usa solo la medible; si no hay ninguna, queda `Sin dato`.
- El gauge, las tarjetas de banda (con su conteo), la barra de umbrales y el gráfico por módulo ordenado de peor a mejor son clicables: abren el detalle del módulo o la fórmula completa en un diálogo.
- Los tabs de ambiente muestran el puntaje, las sondas medidas y el build desplegado que reporta `GET /health` (`commit` y cantidad de módulos); el indicador **Salud** del tablero replica el mismo número.
- Bajo las pestañas de ambiente hay una **leyenda de estados** con las cuatro palabras que usa el panel: **Operativo** (responde dentro del objetivo), **Requiere atención** (responde, pero fuera del objetivo: datos viejos, una dependencia lenta o un servicio con alerta), **Caído** (no responde o falla una dependencia crítica) y **Sin dato** (no se pudo medir; el indicador no premia ni castiga). El panel no usa la palabra `degrade` ni ninguna de sus formas: el estado interno `degraded` se traduce siempre a **Requiere atención**.

### Medidores con umbral

Los cortes viven en `lib/metrics.js` y se publican en `gauges[].limits`; lo que se pinta lo decide la selección versionada (`COCKPIT` para el Resumen, `VIEW_SHORTLIST` para cada vista). Cada medidor pintado es una magnitud medida con el gráfico de latencia —serie + raya de `óptimo` + raya de `tope` rotulada— sobre el propio número:

| Medidor | Óptimo | En riesgo | Crítico | Dónde se pinta | Fuente del corte |
|---|---|---|---|---|---|
| p95 de la sonda al API | 60 % del presupuesto | = presupuesto | > presupuesto | **Héroe del Resumen** · vista Latencia | `PROBE_BUDGET_MS` por ambiente: 400 ms LOCAL · 900 ms QA · 1.400 ms PROD (es el viaje torre→ambiente, no la latencia interna del API) |
| Salud de la plataforma | 85–100 | 60–84 | 0–59 | **Dial del Resumen** | puntaje oficial del ambiente (`healthScore`), publicado por `metrics.js` |
| Presión de heap | ≤ 60 % | ≤ 85 % | > 85 % | **Dial del Resumen** · vista API | `memory_mb.heap_used / heap_total` de `/health` |
| Peticiones por minuto | p65 de su ventana | p90 de su ventana | sobre p90 | **Tesela del Resumen** · vista API | `usage.requests_total` entre sondeos consecutivos |
| Latencia de la base | ≤ 100 ms | ≤ 300 ms | > 300 ms | **Tesela del Resumen** · vista Base de datos | componente `db` de `/apex-control/status`: la ida y vuelta la midió el propio API |
| Registros medidos | p35 de su ventana | p10 de su ventana | bajo p10 | **Tesela del Resumen** · vista Base de datos | suma de `records` por módulo en `/apex-control/modules` (dirección invertida: aquí perder volumen es la señal de problema) |
| Frescura de datos | ≤ 1x | ≤ 3x | > 3x | **Tesela del Resumen** · vista Módulos | peor ratio `age_minutes / expected_minutes` entre módulos |
| Empresas con actividad | ≥ 20 % | ≥ 5 % | < 5 % | **Tesela del Resumen** · vista Base de datos | `tenants.summary` sobre `active` (dirección invertida: gana el valor alto) |
| Errores del servidor | 0 | ≤ 1 % | > 1 % | **Tesela del Resumen** · vista API | `usage.by_status.5xx` sobre `usage.requests_total` de `/health` |
| Sondas fallidas | ≤ 1 % | ≤ 5 % | > 5 % | vista API · vista Latencia | serie de sondas `/health` de la torre |
| Memoria del API | ≤ 512 MB | ≤ 1.024 MB | > 1.024 MB | monitor consolidado por empresa | `memory_mb.rss` de `/health`: se publica y se compara, pero dejó de ser tesela del cockpit —la que decide es la presión de heap— |
| Uptime del proceso | ≥ 15 min | ≥ 5 min | < 5 min | publicado en `environment.gauges`; se lee como pie (`uptime …`) en el monitor consolidado y en `Rendimiento p95`, no como tesela propia | `uptime_seconds` de `/health`: bajo cinco minutos el proceso se reinició hace poco |
| Consultas lentas | 0 | ≤ 5 | > 5 | vista Base de datos | `usage.slow_queries_total` |
| Actividad de hoy, usuarios activos, sesiones, clientes WebSocket, pings GPS | ver `GAUGES` | | | vista Módulos (hasta cuatro de ellos) | catálogo `resumen: false`: son evidencia de su vista, no pregunta de entrada |
| Latencia de la nube | ≤ 250 ms | ≤ 800 ms | > 800 ms | vista Nube | peor sonda medida al SaaS del ambiente (viaje torre→proveedor, con DNS y TLS incluidos) |
| Alertas abiertas | 0 | ≤ 2 | > 2 | vista Operación · barra de estado | alerta activa de la torre por ambiente |
| Trabajos por aprobar | 0 | ≤ 3 | > 3 | vista Operación · barra de estado | cola del puente Qoder en estado pendiente |

Tres tipos de corte, todos decididos en el servidor (`lib/metrics.js`) y publicados en `gauges[].limits`:

- `kind: "budget"` — el corte versionado en el catálogo (la tabla de arriba).
- `kind: "window"` — la magnitud no tiene un valor absoluto razonable (carga, volumen, actividad). El servidor calcula la banda **de su propia ventana medida**: percentiles 65/90 para las que suben y 35/10 para las que bajan. El rótulo del pie lo dice: `banda de su propia ventana`. Necesita `WINDOW_MIN_READINGS = 8` lecturas, así que un cockpit recién arrancado trae teselas sin raya hasta el octavo sondeo: es comportamiento esperado, no un hueco que rellenar.
- `kind: "pending"` — faltan lecturas para calcular. No hay banda que afirmar: la tarjeta queda `Informativo`, el gráfico se dibuja sin rayas y el pie admite `sin banda habitual todavía: N de 8 lecturas medidas`. Un corte nulo jamás se convierte en cero.

Lo que se pinta lo decide el servidor, no la pantalla: **el Resumen pinta 9 de los 19 medidores** que publica un ambiente (`COCKPIT`: 1 gráfico dominante + 2 diales + 6 teselas) y **cada vista de detalle pinta como máximo 4** (`VIEW_SHORTLIST`; latencia 2, api 4, modulos 4, datos 4, nube 1, operacion 2). Un medidor que no está en la lista sigue midiendo, siguen guardándole su historia y sigue pudiendo entrar en otra superficie, pero deja de ocupar el Resumen. Los cinco que el catálogo marca `resumen: false` —actividad de hoy, usuarios activos, sesiones, clientes WebSocket y pings GPS— son evidencia de la vista Módulos, no pregunta de entrada.

- Ningún umbral **ni ninguna cantidad** vive en el navegador. El servidor publica `environment.gauges` con `value`, `band`, `tone`, `label_text`, `limits`, `series`, `window`, `direction`, `watch` y `source`, más `environment.cockpit` y `environment.viewGauges`; el panel solo pinta (`viewGaugeList()` usa la lista que llega). Cambiar `PERF_API_P95_MS` o los presupuestos de sonda (`PERF_PROBE_P95_LOCAL_MS`, `PERF_PROBE_P95_DEVELOP_MS`, `PERF_PROBE_P95_MAIN_MS`) mueve el corte del medidor sin tocar el HTML, y mover una clave dentro de `COCKPIT` cambia qué se ve sin tocar `app.js`.
- Bandas visibles: **Óptimo**, **En riesgo**, **Crítico**, **Sin dato** y **Informativo**. No hay jerga interna en la superficie.
- **Sin dato no es verde**: un valor que no se pudo medir (`null`) queda en banda neutra. Un ambiente que nunca responde no puede aparecer sano. Lo mismo aplica al revés: un corte `null` no es un tope en cero, y una magnitud sin ningún corte no se bandeja (comparar contra `null` pintaba de rojo un medidor sin umbral). Un dial cuyo medidor no publicó lectura no dibuja aguja: escribe `sin lectura medida: el dial no dibuja una aguja inventada`.
- Las etiquetas del gráfico se acotan: solo el `óptimo` y el `tope` rotulados, cada uno junto a su raya y por la izquierda, donde el eje no las tapa. Si dos rayas caen más cerca que una línea de texto, se conserva solo el corte. Un corte en cero no se rotula.
- El rótulo del cockpit dice la cota en cifras: `9 de 19 medidores · N en rojo · N en riesgo`, contando solo los medidores que sí tienen corte; los informativos no cuentan, para que un medidor sin ventana no maquille el semáforo de entrada.

### Mapa de módulos vs API

El bloque **Mapa de módulos vs API** concentra en un solo gráfico el comportamiento de los módulos y del propio API, alineados en el mismo eje temporal: un renglón por módulo **de peor a mejor banda, hasta `MAP_MAX_ROWS = 10`**, más la fila final `API /health`. Cada renglón **es** el gráfico de latencia recortado a la altura de la fila (`mapRowChart`), con sus rayas de `óptimo` y `tope` rotuladas: ya no es una tira de marcas sueltas, y ya no hay treinta y dos tarjetas repetidas debajo.

- Cada punto es un sondeo real de la torre, guardado en el anillo `ModuleTelemetry` (`apps/control-tower/lib/telemetry.js`, 40 muestras persistidas por ambiente). La ventana se ve en la cabecera: `N de M módulos dibujados · N sondeos · desde → hasta`.
- **El recorte se paga con su cuenta.** Lo que no entra en el mapa no desaparece: una línea `.map-silent` declara `N módulo(s) sin lectura medida en la ventana: no se dibujan como sanos` y `N módulo(s) óptimos fuera del top 10 · usa «Solo problemas» o revisa el detalle`. Dibujar solo diez es legible; no decir qué quedó fuera sería ocultar. El arranque también puede no tener nada que dibujar: con el API real del puesto los 32 módulos quedan leídos pero la ventana todavía no tiene historia, así que el mapa muestra su placeholder vacío con la cuenta de los 32 sin lectura medida —y la gate del Resumen solo acepta ese hueco si la línea está escrita; el top 10 se certifica en la fase real, donde la fuente existe—.
- **Altura = frescura medida** (`age_minutes / expected_minutes`), color = banda del módulo en ese sondeo. Los cortes son los del medidor `freshness` que publica el servidor, no una escala dibujada a mano en el renglón. Un módulo que nunca publicó frescura no se pinta como una línea plana en 0x: la fila queda vacía y dice `sin historia: N de M lecturas medidas`, porque `Number(null)` vale cero y ese cero no era una medición sana.
- La fila del API usa la lectura `/health` del mismo sondeo (`api { ms, ok, band }`) con los cortes del medidor `p95`, así que la latencia del API y la frescura de cada módulo se comparan en la misma columna sin casar marcas por fecha.
- La API no publica latencia por módulo, así que el mapa no la simula: muestra frescura y banda, que sí están medidas.
- Cada punto es inspeccionable: el `title` del renglón dice la hora, la frescura en `x` y los registros medidos en ese sondeo.
- Una fila es clicable y abre el detalle del módulo; la fila del API no lo es.
- El anillo se alimenta del sondeo real **antes** de aplicar simulaciones o overrides: una prueba simulada no contamina el historial persistido.
- El eje horario vive una sola vez al pie del mapa, no repetido en los renglones. En móvil la fila se colapsa a nombre y gráfico.

### Telemetría del proceso

`GET /health` de la API publica, además de estado y commit, los agregados del propio proceso: `uptime_seconds`, `memory_mb` (`rss`, `heap_used`, `heap_total`, `external`), `usage.requests_total`, `usage.by_status` (buckets `2xx`/`3xx`/`4xx`/`5xx`) y `usage.slow_queries_total`. La torre los normaliza en `deployedInfo` y los convierte en dos de las cuatro teselas de la vista **API** —**Presión de heap** y **Peticiones por minuto**, ambas con su historia y su corte— y en una del cockpit (**Peticiones por minuto**); **Presión de heap** es también uno de los dos diales del Resumen. La cifra **Memoria del API** (`memory_mb.rss`) sigue publicada y se lee en el monitor consolidado por empresa y en el detalle de la empresa, con su pie `rss medido por el propio proceso · uptime …`. La vista **Latencia** no lleva telemetría de proceso: se queda con los cuatro estadísticos que responden a su pregunta.

- Por qué heap y no RSS en las superficies que deciden: el tope absoluto de memoria (`≤ 512 MB`) mide cuánto pidió el proceso, no cuánto le queda; la presión (`heap_used / heap_total`) es la magnitud que anticipa un reinicio. El número absoluto no se ocultó —sigue publicado y con su corte—, dejó de ser el que manda.

- Son totales del proceso: no hay rutas, identificadores de request, tenants, usuarios ni payloads en esa superficie, y la tendencia fina sigue viviendo en `/metrics`.
- Un ambiente cuyo build no entrega esos campos (los desplegados antes de este cambio) se muestra con la nota de que no hay medición. La torre nunca hereda las cifras del ambiente anterior ni las inventa.
- Los contadores se reinician con el proceso: `usage` es desde el arranque actual, no histórico.

### Monitor consolidado por empresa

El bloque **Monitor consolidado por empresa** (vista **Base de datos**) responde primero por el ambiente completo y luego deja bajar al detalle de una sola empresa:

1. Siete teselas consolidadas: empresas activas, carga de datos, actividad acumulada, empresas sin señal, memoria del API, uso del API y p95 del ambiente.
2. Un selector **Empresa** que solo se llena con las empresas de la lectura vigente del ambiente activo, con su botón **Actualizar**.
3. Al elegir una empresa, su panel con seis KPI: estado operativo con su puntaje y banda, carga de datos (`módulos con datos / caídos / sin medir`), actividad de la empresa, memoria del API, uso del API y p95; debajo, el gráfico por módulo de esa empresa.

Al cambiar de ambiente se deselecciona la empresa: una empresa de `local` no se vuelve a consultar contra QA o PROD, para que ninguna cifra termine mezclando ramas.

### Acciones de intervención

`lib/recommendations.js` traduce cada causa de bloqueo en una acción que un agente puede ejecutar: prioridad (**Alta/Media/Baja**), título, qué hacer, **agente responsable** y siguiente comando. Se generan desde el snapshot de la torre, sin consultar redes nuevas, y aparecen en el bloque de salud del ambiente, en el panel de empresas cuando la lectura está bloqueada, en el panel de la empresa seleccionada y en las respuestas de `/api/tenants` y `/api/tenants/:tenantId/modules`.

| Causa | Prioridad | Responsable | Qué se propone |
|---|---|---|---|
| `MODULO_NO_DESPLEGADO` / `NO_DISPONIBLE` | Alta | `equipo-apexos` · `apexos-git-guardian` | Promover y desplegar un build con `apex-control`; nombra el commit desplegado y aclara que un token no resuelve esta causa. |
| `SIN_TOKEN` | Alta | `apexos-seguridad` | Generar el JWT del ambiente con `apex-control:read` y escribir `ENV_<AMBIENTE>_APEX_TOKEN` en `.env.local`. |
| `TOKEN_INVALIDO` | Alta | `apexos-seguridad` | Renovar el JWT vigente del ambiente y reiniciar la torre. Solo aparece si la credencial no está en `TOKEN_VENCIDO`/`REVOCADA`/`SIN_CREDENCIAL`/`SIN_CONEXION`: cuando el bombeo ya diagnosticó la causa, la acción de credencial lo eclipsa. |
| `CREDENCIAL_AUSENTE` / `CREDENCIAL_VENCIDA` / `CREDENCIAL_REVOCADA` | Alta | `apexos-seguridad` | Emitir el par del ambiente con `npm run control:credential -- --environment <id>`: desde ese momento la torre renueva sola. `REVOCADA` no reintenta cada sondeo, por eso su acción nombra la emisión, no la espera. |
| `CREDENCIAL_SIN_CONEXION` | Alta | `apexos-performance` · `apexos-seguridad` | Verificar que la API del ambiente responda; la torre reintentar la renovación en el ciclo corto. |
| `SIN_CONEXION` | Alta | `apexos-performance` · `apexos-seguridad` | Verificar la URL del ambiente, la red y el servicio contra `GET /health`. |
| Módulo caído (`MODULO_CAIDO`) | Alta | `apexos-backend` | Revisar el servicio y su dependencia caída (hasta 5 módulos por ciclo). |
| Módulo fuera del objetivo (`MODULO_ATENCION`) | Media | `apexos-performance` | Medir frescura y dependencia lenta del módulo. |
| `CROSS_TENANT_DESHABILITADO` | Media | `apexos-seguridad` | Aprobar y encender `APEX_CONTROL_CROSS_TENANT` con su allowlist. |
| `PERMISO_DENEGADO` | Media | `apexos-seguridad` | Otorgar `apex-control:read_all_tenants` al rol del token. |
| `MODULO_NO_HABILITADO` | Media | `apexos-backend` · `apexos-seguridad` | Habilitar `apex-control` para la empresa del token. |
| `EMPRESA_FUERA_DE_ALCANCE` / `VISTA_EMPRESAS_NO_DISPONIBLE` | Media | `apexos-seguridad` | Ajustar `APEX_CONTROL_CROSS_TENANT_TENANTS` del ambiente. |
| `CLOUD_SIN_TOKEN` / `CLOUD_ERROR` | Media | `apexos-performance` · `apexos-seguridad` | Cargar o revisar la credencial del proveedor que **sí** pertenece a la topología del ambiente: `RAILWAY_TOKEN` o sesión del CLI, `VERCEL_TOKEN`, `SUPABASE_ACCESS_TOKEN`. Un proveedor `No aplica` no genera esta acción. |
| Rendimiento fuera de presupuesto (`RENDIMIENTO`) | Alta/Media | `apexos-performance` | Guard de rendimiento del ambiente con p95 y tasa de error medidos. |
| Puntaje en riesgo o crítico sin otra causa (`SALUD`) | Alta/Media | `equipo-apexos` | Abrir el detalle del módulo con peor puntaje. |
| `EMPRESA_NO_ENCONTRADA` | Baja | `equipo-apexos` | Releer el monitor y elegir la empresa de la lista; la torre no sondea tenants a ciegas. |

Ninguna acción se ejecuta sola: la torre es de solo lectura y el comando es una sugerencia con su autorización independiente.

### Conexión real con QA y PROD

Los ambientes remotos están configurados con su URL de API, web y proyecto Supabase. La torre los consulta en cada ciclo y publica lo que cada build responde de verdad:

- `GET /health` entrega estado, versión, módulos y commit desplegado. Ese commit se muestra en el tab y en el encabezado del indicador, para comparar el build con la rama.
- La salud por módulo, la actividad y la vista por empresa requieren que ese build incluya el módulo `apex-control`. Un build anterior responde `404` y la torre lo declara como `MODULO_NO_DESPLEGADO` con el commit afectado; no lo confunde con falta de token ni con una caída.
- Cuando la ruta responde `401`, el módulo sí está desplegado y lo que falta es la credencial del ambiente. Se emite con `npm run control:credential -- --environment develop` (o `main`) y la torre escribe `ENV_DEVELOP_APEX_TOKEN` / `ENV_MAIN_APEX_TOKEN` junto con su `ENV_*_APEX_REFRESH`; desde ahí renueva sola. La torre distingue el `401` (credencial rechazada) del `403` (el token no tiene el permiso `apex-control`) para no mandar a nadie a conceder un permiso que ya está concedido.
- Estado medido el 2026-11-12 con la sonda anónima de `/health`: QA corre `3595a9bbca23` (19 módulos) y PROD `4659292f4f23` (18 módulos); ambos responden `404` en `/api/v1/apex-control/status`, o sea que el bloqueo real de las lecturas con permiso en los ambientes remotos es el **despliegue**, no la credencial. La torre lo declara `MODULO_NO_DESPLEGADO` con el commit en el tab —un JWT nuevo no resuelve una ruta que no está en el artefacto—. Cuando ese build inclua el módulo, el `401` dirá que falta la credencial y el comando anterior la emite.

### Vista por empresa

La tabla de empresas agrega la columna **Módulos** con **Ver módulos**, que abre el mismo indicador, las bandas y el gráfico de módulos para una sola empresa mediante `GET /api/v1/apex-control/tenants/:tenantId/modules`; la columna **Acción** marca cuál está seleccionada. La empresa no aporta sondas de infraestructura: cuando no las tiene, el puntaje usa únicamente sus módulos y lo declara. Si el ambiente no permite la lectura entre empresas, el panel muestra el código (`SIN_TOKEN`, `CROSS_TENANT_DESHABILITADO`, `VISTA_EMPRESAS_NO_DISPONIBLE`), el motivo y la acción con su responsable, nunca ceros que parezcan sanos. Al cambiar de ambiente la empresa queda deseleccionada y el selector se reconstruye con la lectura del ambiente nuevo.

### Actividad, conexiones y empresas

Con el mismo token por ambiente, la torre consulta:

- `GET /api/v1/apex-control/activity`: actividad del tenant del token en los últimos `days` días, con buckets diarios de auditoría y eventos, usuarios activos, sesiones, clientes WebSocket y pings GPS. Filtrado por tenant; nunca agrega cifras de otras empresas.
- `GET /api/v1/apex-control/tenants`: conectividad por `tenant_id` para la vista de empresas. Es una lectura entre empresas y por eso exige el permiso explícito `apex-control:read_all_tenants`, la guarda `APEX_CONTROL_CROSS_TENANT` (apagada por defecto fuera de local/development) y la allowlist opcional `APEX_CONTROL_CROSS_TENANT_TENANTS`. Si la guarda está cerrada, la API responde `403 CROSS_TENANT_DESHABILITADO` y la torre muestra la restricción con su motivo.

Ambos paneles son informativos: no alteran el puntaje del ambiente. El Resumen limita la tabla de empresas a 12 filas para no saturar la vista; la tabla completa vive en la vista **Base de datos**, que es donde el selector de empresa y su panel de seis KPI operan. Sin datos, la sección indica el motivo exacto (`SIN_TOKEN`, `MODULO_NO_DESPLEGADO`, `TOKEN_INVALIDO`) en vez de mostrar ceros como si hubiera actividad.

### Métricas cloud

Con los tokens de la sección siguiente, las tarjetas reportan:

- **Railway**: servicios, entornos, muestra de deployments (últimos 3 por entorno), fallidos, antigüedad y estado del último.
- **Vercel**: muestra de deployments (últimos 3), listos, fallidos, antigüedad y duración media calculada con `buildingAt`/`ready`.
- **Supabase**: versión de base, estado del proyecto y salud por servicio (`db`, `auth`, `storage`, `realtime`, `rest`).

Para la nube (solo lectura):

- **Railway**: `RAILWAY_TOKEN` **o** la sesión activa del CLI de Railway en el puesto. La torre lee `~/.railway/config.json` (`user.accessToken`) en cada sondeo —se reubica con `RAILWAY_CONFIG_DIR`— y por eso un `railway login` nuevo llega a la torre sin reiniciarla ni duplicar el token en un segundo archivo. La variable manda si existe; `TOWER_RAILWAY_SESSION=false` apaga la adopción. El proyecto ya viene versionado en `ENV_DEVELOP_RAILWAY_PROJECT_ID` (QA, `APEXOS QA`) y `ENV_MAIN_RAILWAY_PROJECT_ID` (PROD, `APEXOS PROD`); local queda vacío porque el Docker del puesto no tiene nube.
- **Vercel**: `VERCEL_TOKEN` (y `VERCEL_TEAM_ID` si aplica) y `ENV_DEVELOP_VERCEL_PROJECT_ID` / `ENV_MAIN_VERCEL_PROJECT_ID`. APEXOS no publica en Vercel, así que sin identificador la tarjeta se declara `No aplica`.
- **Supabase**: `SUPABASE_ACCESS_TOKEN` —es el único pendiente de nube que la torre no puede construirse sola: lo emite el dueño en la consola de Supabase—; el `ref` de cada proyecto ya viene en `ENV_DEVELOP_SUPABASE_REF` (`jbirkghkekuifgfsgquq`, QA) y `ENV_MAIN_SUPABASE_REF` (`jzbwzmkidfthknsohhnr`, PROD).
- Para validar `auth/v1/health` con `200`, define además `ENV_DEVELOP_SUPABASE_ANON_KEY` y `ENV_MAIN_SUPABASE_ANON_KEY` (llave publica anon).

Dos frases distintas, porque son dos hechos distintos: **`No aplica`** es topología —el ambiente no usa ese proveedor, no hay nada que sondear y no se genera ninguna acción—, y **`Sin credenciales`** es un pendiente del puesto, con la variable exacta que falta. Nunca se inventa un estado `ok`, y una tarjeta sin llamada HTTP no tiene latencia: `latencyMs` es `null`, no `0 ms`. La vista Nube publica además de dónde salió la credencial (`Credencial leída de: sesión del CLI de Railway`), nunca el valor. Los tokens no se muestran en el panel, la API, los eventos ni la evidencia.

Medido en el puesto el 2026-11-12 con la torre real: QA `railway ok, 662 ms, APEXOS QA, último deployment SUCCESS 2026-11-11T00:49:23Z`; PROD `ok, 470 ms, APEXOS PROD, SUCCESS 2026-11-11T20:01:38Z`; Vercel `No aplica` en los tres ambientes; local las tres tarjetas `No aplica` y **cero** acciones de nube. Evidencia en `docs/qa/evidence/torre-nube-medida-20261112/`.

## Telegram

1. Crea un bot con BotFather. Guarda el token únicamente en `apps/control-tower/.env.local`:
   `TELEGRAM_BOT_TOKEN=...`
2. Inicia la torre. La consola muestra un código de emparejamiento de 6 dígitos, también disponible en el panel con **Generar código**.
3. Envía `/pair <codigo>` al bot desde tu chat. El código vence en 10 minutos.
4. Usa `/estado`, `/ramas`, `/alertas`, `/trabajos` y `/puente`.

Instrucciones:

- Texto libre: se registra como análisis N1.
- `/obs <texto>`: diagnóstico N0.
- `/impl <texto>`: implementación N2 en `desarrollo`, requiere aprobación.
- `/qa <texto>`: certificación N3, requiere aprobación.
- `/aprobar <id>`, `/rechazar <id>`, `/cancelar <id>`.
- `/ack <id>`: reconocer una alerta.

Modos: `auto` (polling si hay token), `polling`, `dry-run` (sin red, para pruebas) y `off`. No se usa webhook público.

## Puente de Qoder

`qc-cli` pertenece al host de Qoder y no puede ser invocado por un proceso externo. Por eso la torre encola instrucciones y una sesión de Qoder las reclama por HTTP local:

```text
Telegram / panel -> Torre -> Puente HTTP -> Sesion Qoder -> Agentes APEXOS
```

El protocolo completo está en [bridge/PROMPT.md](bridge/PROMPT.md). El cliente no tiene dependencias:

```bash
node apps/control-tower/bridge/client.js register
node apps/control-tower/bridge/client.js claim --level N2
node apps/control-tower/bridge/client.js complete JOB-... --status completed --summary "..." --evidence ruta1,ruta2 --tests "passed=8,failed=0"
```

`BRIDGE_TOKEN` se define en `.env.local`. Sin token, los endpoints del puente responden 401/503.

## Autorización

- N0 observar y N1 analizar: sin aprobación.
- N2 implementar en `desarrollo` y N3 certificar: aprobación humana por Telegram o panel.
- N4 push, merge, deploy o migración remota: prohibido para la torre y para el puente; solo una persona con autorización explícita.

La torre nunca ejecuta git write, deploy ni migraciones. `Sincronizar ramas` solo ejecuta `git fetch` y exige confirmación.

## Pruebas y certificación

```bash
npm run control:test
npm run certify:control-tower:local
npm run certify:control-tower:consolidado
```

`control:test` incluye las suites de módulos, cloud, actividad, credenciales y acciones de intervención: catálogo sin token, API con Bearer, token inválido, 404, ambiente sin conexión, herencia de servicios caídos, el cálculo de métricas Railway/Vercel/Supabase con respuestas congeladas, la puerta entre empresas (`403 CROSS_TENANT_DESHABILITADO`), la ausencia de red sin token, el token local que no viaja a QA/PROD, el `401` que se dictamina credencial rechazada y no permiso denegado (el `403` sí) y que cada bloqueo devuelva una acción con prioridad, responsable y comando. La suite completa es **186/186** el 2026-11-12; de ellas, nueve viven en `test/credential.test.js` y fijan el ciclo de vida de la credencial: la rotación real con el par persistido en el `dataDir`, **no re-renovar** mientras el margen aguanta, que arrancar la torre con un JWT vigente **no** fabrique una sesión nueva en el puesto, que un `401` al refresh deje el ambiente en `REVOCADA` con un solo intento y respaldo, que un `TOKEN_VENCIDO` declare el punto ciego en vez de seguir enviando un token muerto, la diferencia entre `SIN_CREDENCIAL`, `SIN_CONEXION` y un ambiente apagado (los tres abren registro: «sin estado» también es un estado que hay que decir), que la simulación no renueve nada y que el objeto publicado no contenga el token. Una de ellas afirma además que `npm run control:credential` existe en `package.json` y apunta al script real: una acción cuyo comando no se puede ejecutar es un adorno. Las **ocho pruebas nuevas** de la nube medida se reparten en `test/cloud.test.js`, `test/environments.test.js`, `test/probes.test.js` y `test/recommendations.test.js`, y fijan: la lectura del almacén del CLI (con `RAILWAY_CONFIG_DIR` y cadena vacía ante archivo ilegible, JSON roto o token con espacios), la precedencia variable → sesión → nada con su puerta `sessionEnabled`, la adopción de extremo a extremo (la sonda viaja con `Bearer <sesión>` y el secreto no aparece en el payload publicado), los identificadores reales de QA y PROD versionados con el local vacío a propósito, `credentialReport` con el almacén inyectado (fuente, faltantes y `safeConfig` sin el valor), `localCloudCards()` con `latencyMs: null`, y que un proveedor que no aplica no genere fila de sonda ni acción. La suite del panel (**73/73** en `test/ui-indicators.test.js` y `test/metrics.test.js`) fija dos contratos a la vez. **Cantidad**: `COCKPIT` pinta nueve elementos y `cockpitFor()` firma el veredicto del Resumen sobre esos nueve; `VIEW_SHORTLIST` no pasa de cuatro por vista; `viewGaugeList()` usa la lista publicada por el servidor y el navegador no filtra ni cuenta; cada tope de lista imprime su línea de cuenta; y un dial cuyo medidor no publicó lectura no dibuja aguja. **Gramática** (la ronda anterior): `thresholdChart` sigue siendo el único renderer, un renglón del mapa sin dos lecturas medidas no dibuja SVG y escribe `sin historia: N de M`, los cortes nulos no se pintan en cero (`Number(null) === 0` era la fuente de las series planas «sanas»), `limits.kind: "pending"` publica su admisión en el pie y los cinco medidores marcados `resumen: false` no suben al Resumen.

La certificación fase uno (`certify:control-tower:local`, **77/77** el 2026-11-12) levanta la torre en modo simulación y Telegram dry-run, verifica API, ambientes, rendimiento, panel, cola, puente, alertas, recuperación y Telegram, y después corre una **fase real**: la torre apunta al API del puesto (`/health` y `/api/v1/apex-control/status`) y exige lecturas leídas del servidor (la corrida: `fuente: api`, 9 componentes, 26.014 registros, `db_ms: 44`, `cobertura_empresial: 5,6`, 19/19 medidores con historia). Sobre el cockpit certifica la **cantidad** y la **gramática** con gates separadas por modo: `browser_dashboard_rendered` afirma por cláusula y guarda la lectura (`teselas: 6`, `diales: 2`, `hero: 1`, `secciones: 4`; del mapa admite el modo catálogo (`mapa ≥ 3` con tres tiras reales) **o** el modo puesto (`mapa ≥ 1` con su placeholder y su línea `32 módulo(s) sin lectura medida…` escrita), porque en el arranque con API real todavía no hay historia que dibujar), `browser_cada_medidor_trae_su_grafica_con_umbral` (6 tarjetas = 6 gráficas = 6 pies, ≥4 tiras con lecturas medidas, ≥8 cortes trazados, las dos agujas del dial presentes y toda etiqueta diciendo `óptimo`/`tope`/`piso`, con las cinco teselas de actividad ausentes de los rótulos), `browser_cockpit_status_bar` (`Contadores / Errores / Advertencias / Alertas abiertas / Trabajos por aprobar`), `browser_cada_pregunta_apunta_a_su_vista` (las seis teselas enlazan a api/datos/modulos), `browser_vista_api_teselas_tecnicas` y `browser_datos_teselas_con_historia` (**4** = 4 con `sin_umbral = 0`), `browser_operacion_mesa_con_historia` (2 = 2 con su pie) y `browser_componentes_y_sondas_con_historia`. La gate nueva `local_credencial_autorenovable` afirma que el punto se sostiene solo: `modo: renovacion`, estado `VIGENTE` o `RENOVADA`, `expira` en el futuro, `reintentos: 0` y que el objeto `credential` publicado no contenga un JWT (la búsqueda explícita de `eyJ…` tiene que dar vacío). La corrida dejó `{"estado":"VIGENTE","modo":"renovacion","expira":"2026-11-12T22:06:32.000Z","ultima_renovacion":null,"reintentos":0}`; sin `ENV_LOCAL_APEX_REFRESH` en `.env.local` el ambiente queda `TOKEN_VENCIDO` y esta gate se pone roja —es el modo en que el control puede fallar, no un literal—. La **profundidad con dato real** se afirma aparte: `browser_cockpit_con_historia_real` (6 tarjetas = 6 gráficas, ≥5 tiras con lectura, `sinUmbral = 0` y el rótulo `9 de 19 medidores`), `browser_modulos_con_datos_reales` (la corrida dibujó 10 de 32 renglones y contó 20 con registros) y `browser_datos_con_volumen_real`. En simulación el mapa se afirma por estructura: `browser_modulos_mapa_unico` exige `filas = gráficas`, `sinUmbral = 0` y **su línea de cuenta** (`32 módulo(s) sin lectura medida en la ventana: no se dibujan como sanos`), porque el catálogo congelado publica `data: null` y exigir serie dibujada ahí sería certificar un imposible; y `browser_modulos_veredicto_preguntado` lee la pregunta exacta de la vista. Reglas que siguen vivas de la ronda anterior: `browser_tope_del_grafico_es_el_del_medidor`, `browser_tope_dibujado_en_su_ordenada` (tolerancia 14 px), `browser_eje_con_horarios_distintos`, `browser_latencia_detalle_por_punto`, `browser_telemetria_proceso_con_umbral` y `browser_performance_panel` (**4** estadísticos, sin `Memoria RSS`, `Consultas lentas` ni `Peticiones`). Antes de leer el cockpit se espera **a que estén trazados los cortes** (`svg ≥ 4` y `líneas de umbral ≥ 8`, hasta 90 s), no solo a que haya gráficos dibujados: un corte de ventana necesita ocho lecturas y leer antes daba `lineas_umbral: 6` sobre un panel correcto. Captura con Chrome headless y deja evidencia en `docs/qa/evidence/apex-control-tower-f1/` (`certification.json`, `telegram-outbox.json` y once capturas: `tower-overview.png`, `tower-vista-latencia.png`, `tower-vista-api.png`, `tower-vista-modulos.png`, `tower-vista-datos.png`, `tower-vista-operacion.png`, `tower-datos-reales.png`, `tower-modulos-reales.png`, `tower-latencia-punto.png`, `tower-env-main.png`, `tower-api-down.png`). La fase real se corre con UNA sola torre leyendo el puesto: con la torre del escritorio abierta al tiempo, el barrido `/apex-control/status` del API local (2,2-5,6 s en reposo) supera el presupuesto de sonda de 6 s y `local_fuente_real` se pone rojo sin cambio de producto; por eso guarda `ultima_lectura` (fuente, componentes, registros, `db_ms`, sondeos) para que un rojo diga qué faltó en lugar de un `null` mudo.

`certify:control-tower:consolidado` (**73/73** el 2026-11-12; 16 verificaciones nuevas de nube, las 57 anteriores siguen como no-regresión del cableado) levanta dos APIs de prueba en `127.0.0.1`: una rica (telemetría de proceso en `/health`, `/apex-control/status` con componentes y sus `latency_ms`, módulos, actividad, empresas y salud por empresa) y otra con el build anterior al módulo (`/health` con commit y `404` en `apex-control`, como QA y PROD hoy). Con Chrome por CDP comprueba las siete vistas-pregunta, el monitor consolidado, el selector de empresa, las teselas de memoria y uso con los números publicados por el API y **el cockpit con su cota**: `navegador_resumen_con_medidores` (`hero: 1`, `diales: 2`, `tarjetas: 6`, `conUmbral ≥ 4`, `gráficas = tarjetas + hero`, cero sin umbral, ≥8 cortes trazados), la gate nueva `navegador_resumen_pinta_lo_que_decide` (el rótulo `9 de 19 medidores · N en rojo · N en riesgo` existe y coincide), `navegador_resumen_sin_teselas` (cero `metric-tile` fuera del cockpit), `navegador_mapa_de_modulos` (4 renglones = 4 gráficas con la fila sin lectura admitiendo su hueco) y `navegador_mapa_incluye_la_api`. Además la otra gate nueva, `navegador_resumen_vuelve_al_cockpit`: ir a una vista de detalle y regresar **vuelve a pintar** el cockpit completo —un rediseño con navegación por ventana no puede dejar el Resumen vacío al volver—. Sigue vivo lo de rondas anteriores: un componente **sin latencia publicada se lee `sin medición` y nunca cero** (`navegador_componente_sin_latencia_no_es_cero`), el veredicto de latencia con su tope y su regla de muestras, **la rejilla de la barra de vistas** (ancho > 60 % del panel, hueco < 40 px hasta la primera sección y leyenda de estados como último elemento), **el detalle por punto**, **la historia por tesela de la vista API** (`navegador_api_teselas_con_historia`: 4 tarjetas = 4 gráficas = 4 pies con su cota `1 ≤ tarjetas ≤ 4`) y las acciones con responsable y siguiente comando, el bloqueo de PROD que nombra su commit sin inventar empresas, que las bandas solo usen las cinco palabras del vocabulario, la ausencia de jerga `degrade`, la leyenda de estados y una consola sin errores. Las gates leen solo DOM **visible** (`offsetParent !== null`) en la vista activa: leer el `textContent` de una sección oculta daba verde sin que el dueño viera nada. El Resumen se espera hasta 45 s a que el anillo tenga al menos cinco gráficas del cockpit dibujadas y el explorador del gráfico hasta 30 s: la serie se llena sondeo a sondeo (dos lecturas para el primer trazo) y, leída de una sola vez, la gate dependía del minuto en que arrancaba el navegador. Deja `certification.json`, `snapshot-ambientes.json`, `empresa-tenant-demo.json`, `nube-certificada.json` y cuatro capturas (`01-monitor-consolidado-empresa.png`, `02-producto-bloqueado-con-acciones.png`, `03-vista-latencia-consolidado.png`, `04-vista-nube-medida.png`) en `docs/qa/evidence/torre-consolidado-empresas-20261103/`. No usa bases de datos ni credenciales reales; la evidencia se sanea y se verifica que ni el token de la torre ni el JWT aparecen en ella (`snapshot_no_filtra_el_token_de_la_torre`, `evidencia_json`).

**La fase de nube no sale a internet ni depende de con quién esté autenticado el que ejecuta**: levanta un ferrocarril local que contesta el GraphQL de Railway (proyecto, ambientes y un deployment `SUCCESS`, con 20 ms de retardo para que el viaje tenga latencia medida) y un almacén de sesión del CLI propio, redirigiendo `RAILWAY_CONFIG_DIR` y limpiando `RAILWAY_TOKEN` antes de crear la torre —con restauración al cerrar—. Diez verificaciones de servidor: `nube_sesion_del_cli_adoptada` (la tarjeta llega `configured` con la fuente «CLI de Railway»), `nube_sonda_viaja_con_la_sesion` (cada llamada llegó al proveedor con `Authorization: Bearer <sesión>`: la torre adopta, no duplica), `nube_railway_medido_con_viaje` (`applies`, `status ok`, latencia > 0, proyecto y deployment leídos), `nube_proveedor_sin_topologia_no_pide_token`, `nube_ambiente_sin_proyecto_no_inventa` (`latencyMs: null`, no cero), `nube_local_no_pide_credenciales_cloud`, `nube_no_publica_la_sesion_del_puesto` y `nube_ids_reales_cableados_en_el_config` (los dos project id medidos viven en `lib/config.js`). Seis del navegador en la vista Nube de QA: el viaje medido y el `SUCCESS` pintados, la línea «Credencial leída de: …», dos tarjetas «No aplica» con **cero** «Configura» y cero «Sin credenciales», la gráfica del viaje en banda operativa y la sesión ausente de la pantalla.

La verificación manual de módulos y métricas cloud de esta intervención está en `docs/qa/evidence/torre-modulos-metricas-20261103/`. La de actividad, conexiones y empresas, con capturas de las vistas Resumen y Detalle, está en `docs/qa/evidence/tower-activity-tenants-20261103/`. La del indicador oficial de salud, umbrales y vista por empresa está en `docs/qa/evidence/tower-health-charts-20261103/`. Las cuatro capturas del panel vivo con medidores y mapa están en `docs/qa/evidence/torre-medidores-20261105/`.

Evidencia actual de la fase uno: `certification.json`, `tower-overview.png`, `tower-env-main.png`, `tower-api-down.png`, `tower-datos-reales.png`, `tower-modulos-reales.png`, `tower-vista-latencia.png`, `tower-vista-api.png`, `tower-vista-datos.png`, `tower-vista-modulos.png`, `tower-latencia-punto.png` y `telegram-outbox.json`. Las capturas anteriores a las vistas-pregunta (`torre-modulos-metricas-20261103`, `tower-activity-tenants-20261103` con la versión Resumen/Detalle, `tower-health-charts-20261103` y `torre-medidores-20261105`) quedan como histórico de intervenciones previas.

### Conexiones reales por fuente

Qué se lee de verdad y qué queda en `sin medición`, ambiente por ambiente:

| Fuente | Ruta real | Quién la consume |
|---|---|---|
| Proceso del API (uptime, memoria, buckets de estado, consultas lentas) | `GET /health` | cockpit (**Presión de heap** como dial, **Peticiones por minuto** y **Errores del servidor** como teselas), vista **API** (sus cuatro teselas) y el monitor consolidado por empresa (**Memoria del API** / **Uso del API**) |
| Componentes internos (PostgreSQL, Redis, colas, cron, correo, WebSocket) con `latency_ms` y `score` | `GET /api/v1/apex-control/status` | vista **API** (filas por componente, top 8 con su cuenta) y medidor **Latencia de la base** |
| Salud por módulo del ambiente | `GET /api/v1/apex-control/modules` | **mapa de módulos vs API** (top 10 renglones) y gráfico por módulo |
| Actividad del tenant del token | `GET /api/v1/apex-control/activity` | **carga de datos**, la serie diaria y las cuatro teselas de la vista **Módulos** |
| Empresas del ambiente | `GET /api/v1/apex-control/tenants` (con `APEX_CONTROL_CROSS_TENANT` encendida) | selector **Empresa**, su ficha y la tabla de la vista **Base de datos** |
| Nube (Railway, Vercel, Supabase) | APIs de proveedor con la sesión del CLI de Railway adoptada en el sondeo, `VERCEL_TOKEN` o `SUPABASE_ACCESS_TOKEN` | vista **Nube** |

- **Local** (`desarrollo`): las seis primeras fuentes están activas porque el puesto corre el API y la base reales, y la credencial se renueva sola con `ENV_LOCAL_APEX_REFRESH`. La evidencia `tower-datos-reales.png` y `tower-modulos-reales.png` sale de esa fase real de la certificación. La nube **no aplica** a este ambiente: se mide en el puesto, no en la nube, y por eso sus tres tarjetas no piden ningún token.
- **QA y PROD**: bloqueadas por despliegue y credenciales, no por código. Medido el 2026-11-12: QA `3595a9bbca23` y PROD `4659292f4f23` responden `404` en `/api/v1/apex-control/*`, así que la torre declara `MODULO_NO_DESPLEGADO` con el commit desplegado y, encima, `SIN_CREDENCIAL` porque no hay par del ambiente. La acción da el comando `npm run control:credential -- --environment develop` (o `main`) y el responsable; **no** hereda cifras de otro ambiente. Su nube sí está medida: Railway responde `ok` en ambos con la sesión del puesto.
- Con `TOWER_SIMULATION=true` la torre es hermética: los módulos vienen del catálogo congelado (`catalogPayload("SIMULACION")`) y las sondas remotas se saltan, así que **ese modo no muestra registros reales** y sirve solo para certificar la interfaz.
- Los servicios de nube sin credencial quedan en `Sin credenciales` con la variable que falta; nunca se pinta un `ok` inventado. Un proveedor que el ambiente no usa se declara `No aplica` y no genera acción.

Si Chrome no está en la ruta estándar, define `CHROME_PATH`.

## Seguridad

- Escucha solo en `127.0.0.1` por defecto y rechaza Host no loopback.
- `TOWER_UI_TOKEN` protege las mutaciones; el panel admite `?token=...`.
- `BRIDGE_TOKEN` autentica al puente.
- Telegram exige allowlist y emparejamiento con código temporal.
- Los tokens nunca se muestran en el panel, eventos, logs ni evidencia. El dictamen de credencial (`environment.credential`) publica solo modo, estado, motivo, horas y contadores; la certificación busca `eyJ…` en él y en toda la evidencia y falla si aparece.
- Los secretos van solo en `.env.local`. El par rotado que produce el bombeo vive en `apps/control-tower/data/credential.json`, también ignorado por git; la torre **nunca** escribe `.env.local` (eso lo hace `tools/issue-credential.js`, con `chmod 0600` y por orden del operador).
- La torre no firma JWT ni conoce `JWT_SECRET`: renueva por la ruta soportada `POST /api/v1/auth/refresh` con el `ENV_<AMBIENTE>_APEX_REFRESH` del ambiente. Un `401` se dictamina credencial rechazada, no permiso denegado.
- Cada ambiente usa su propia credencial: el token de local jamás viaja contra QA o PROD, y la renovación de uno no toca la del otro.

## Problemas comunes

- **No abre el panel**: revisa que el puerto 4310 esté libre y que Node esté en PATH.
- **Sin lecturas de API**: confirma `API_BASE_URL` y que la API esté corriendo.
- **Ramas sin remoto**: `git` no pudo ejecutar `ls-remote`; la torre muestra el estado local y una advertencia.
- **Telegram no responde**: token inválido, modo `off`, chat no emparejado o bot sin mensajes iniciados.
- **Puente fuera de línea**: la sesión de Qoder debe enviar latidos cada 30 segundos como máximo.
- **Muchos medidores en `sin medición` y `fuente: catalog` con el API arriba**: la credencial del ambiente se venció. Mira `environment.credential` en `GET /api/status` (o la acción del panel): `TOKEN_VENCIDO` pide `npm run control:credential -- --environment local` una vez y, con `ENV_LOCAL_APEX_REFRESH` escrito, la torre no vuelve a quedarse ciega.
- **`REVOCADA` en un ambiente**: la API rechazó el token de renovación (sesión revocada o contraseña cambiada). La torre deja de reintentar cinco minutos para no castigar el puesto; hay que emitir el par de nuevo.
- **`SIN_CONEXION` al renovar**: la API del ambiente no contestó en `TOWER_CREDENTIAL_TIMEOUT_MS`; verifica el servicio con `GET <apiBaseUrl>/health` antes de tocar credenciales.
- **El panel no renueva aunque el refresh esté en el archivo**: la línea no puede estar comentada ni venir antes de `ENV_<AMBIENTE>_APEX_TOKEN` con valor vacío, y si la torre corre con `TOWER_SIMULATION=true` el bombeo queda en `SIMULACION` por diseño.
- **Redis en `down` con el contenedor arriba**: la sonda exige `+PONG` real en `REDIS_HOST:REDIS_PORT`; confirma el puerto publicado (`55432` para PostgreSQL, `6379` para Redis) y que no haya otro proceso interceptando la conexión.
