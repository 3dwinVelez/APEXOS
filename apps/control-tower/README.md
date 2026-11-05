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

Siete vistas, una por pregunta; la elección se recuerda en el navegador (`towerView`). Cada bloque del HTML declara en `data-views` en cuáles aparece, así que una vista nunca muestra lo que no responde a su pregunta:

| Vista | Pregunta que responde | Qué pinta |
|---|---|---|
| **Resumen** | ¿Dónde hay que mirar? | Indicador oficial del ambiente, los medidores con su umbral y las alertas abiertas. Sin teselas numéricas. |
| **Latencia** | ¿Cómo está la latencia? | Veredicto (dentro del tope / picos por vigilar / fuera del tope: atender) con la regla que lo produjo y la serie del p95 con sus líneas de óptimo y tope. La serie es inspeccionable: cada muestra es un punto que se puede señalar con el cursor o con Tab, y debajo están **Picos y horarios medidos** (los tiempos más altos de la ventana, nombrados por su hora y su medición) y la tarjeta del punto elegido: hora, medición con su banda, si la sonda respondió o falló, posición dentro de la ventana, desviación contra el promedio y contra el p95, y las muestras anterior y siguiente. Debajo, la memoria del proceso, las peticiones por bucket de estado, las consultas lentas y el uptime. |
| **API** | ¿El API responde bien con la carga que tiene? | Teselas de indicadores y la latencia que el propio servidor mide componente por componente (`/apex-control/status`), con su banda. |
| **Módulos** | ¿Los módulos están óptimos? | Mapa único de módulos vs API (una marca por sondeo), tarjetas por dominio con registros, frescura, servicios y alertas, y actividad. |
| **Base de datos** | ¿La base está óptima y rápida? y ¿qué volumen tiene? | Veredicto de la base medido desde adentro del API, teselas de volumen/cobertura/frescura, la tabla de registros por módulo y el monitor consolidado por empresa con su selector. |
| **Nube** | ¿Los servicios de la nube están bien? | Railway, Supabase y Vercel con métricas medibles, o la variable exacta que falta, y la preparación de credenciales por ambiente. |
| **Operación** | ¿Qué hago con esto? | Ramas, trabajos del puente Qoder, Telegram y la traza de eventos. |

Reglas de lectura que aplican a todas las vistas:

- **Lo no medido no es cero.** Un componente sin `latency_ms`, un módulo sin conteo de registros o un ambiente sin historia quedan en `Sin medición` / `Sin dato`; el panel nunca los cuenta como métrica ni los pinta en verde (`measuredNumber` en el navegador, `measuredValue` en `lib/metrics.js` en el servidor).
- **El umbral lo publica el servidor.** Valor, banda y cortes salen de `lib/metrics.js` (`GAUGES`, una entrada por pregunta) y el navegador solo pinta; no hay topes escritos a mano en el panel.
- **Picos contra sostenido.** La regla está en `latencyVerdict`: solo un evento por encima del tope es un pico que se vigila; una racha o un porcentaje sostenido sobre la ventana es un problema que se atiende. La regla usada aparece escrita bajo el veredicto.
- **Una vista, una fila.** `main` es una rejilla de doce columnas: cada sección declara su `grid-column` y la barra de vistas ocupa las doce. Un hijo sin declaración cae a una columna de ~108 px y deja una banda muerta, que es exactamente el desorden que el propietario ve. La leyenda de estados es el último elemento del panel, nunca un muro entre la navegación y la respuesta.
- **El punto señalado no se reasigna.** La selección del gráfico se casa por el timestamp ISO de la muestra. Si esa muestra sale de la ventana medida (40 sondeos), la tarjeta lo dice en vez de mostrar otra; cambiar de ambiente descarta la selección porque los horarios pertenecen al ambiente anterior.
- **Servicios**: estado, latencia, detalle, impacto funcional, acción sugerida y detalle técnico expandible.
- **Módulos**: resumen (en objetivo, requieren atención, caídos, sin dato, registros), agrupación por dominio y tarjetas con registros, última actividad, frescura esperada, servicios y alertas. El filtro **Solo problemas** deja a la vista únicamente lo que está caído o fuera del objetivo. Si la API no entrega datos, el panel muestra el catálogo en `Sin dato` y lo declara, no lo pinta como sano.
- **Actividad**: actividad de hoy, usuarios activos, sesiones, clientes WebSocket, pings GPS y última actividad, con serie diaria de auditoría y eventos.
- **Empresas**: monitor consolidado con conectividad por `tenant_id` (sesiones, usuarios, última actividad, pings GPS, estado) y sus acciones de intervención. El Resumen muestra hasta 12 empresas; la vista Base de datos conserva la tabla completa.
- **Acciones de intervención**: en cada bloque bloqueado o con módulos fallando, una lista priorizada con qué hacer, el agente responsable y el siguiente comando.
- **Alertas**: incidentes por ambiente, con impacto funcional, acción y detalle técnico.
- **Rendimiento**: p50, p95, promedio, mínimo, máximo, tasa de error y serie temporal por ambiente, con dos chips de banda separados — **latencia** (p95 medido) y **sondas** (sondeos `/health` que fallaron) — porque no son la misma señal.
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
| `local` | `desarrollo` | `ENV_LOCAL_API_URL`, `ENV_LOCAL_WEB_URL`, `ENV_LOCAL_APEX_TOKEN` (o `APEX_CONTROL_TOKEN`) |
| `develop` | `develop` | `ENV_DEVELOP_API_URL`, `ENV_DEVELOP_WEB_URL`, `ENV_DEVELOP_SUPABASE_URL`, `ENV_DEVELOP_APEX_TOKEN` |
| `main` | `main` | `ENV_MAIN_API_URL`, `ENV_MAIN_WEB_URL`, `ENV_MAIN_SUPABASE_URL`, `ENV_MAIN_APEX_TOKEN` |

### Salud por módulo

El panel de módulos consume `GET /api/v1/apex-control/modules` con `Authorization: Bearer <JWT>`. El JWT debe pertenecer a un usuario con permiso `apex-control:read` del tenant que se quiere vigilar. Cada ambiente usa su propio token:

- `ENV_LOCAL_APEX_TOKEN` apunta a la API local; si falta, se usa `APEX_CONTROL_TOKEN`.
- `ENV_DEVELOP_APEX_TOKEN` y `ENV_MAIN_APEX_TOKEN` son obligatorios para leer módulos remotos. La torre **no** reutiliza el token local contra QA ni PROD: sin token propio el ambiente queda `SIN_TOKEN` y sus módulos en `Sin dato`.
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

El bloque **Medidores del sistema** sustituye el reguero de teselas del Resumen. Cada tarjeta es una magnitud medida con su escala de tres tramos (verde / ámbar / rojo), el marcador del valor y los cortes que produjeron la banda:

| Medidor | Óptimo | En riesgo | Crítico | Vista | Fuente del corte |
|---|---|---|---|---|---|
| p95 de la sonda al API | 60 % del presupuesto | = presupuesto | > presupuesto | Latencia | `PROBE_BUDGET_MS` por ambiente: 400 ms LOCAL · 900 ms QA · 1.400 ms PROD (es el viaje torre→ambiente, no la latencia interna del API) |
| Sondas fallidas | ≤ 1 % | ≤ 5 % | > 5 % | API | serie de sondas `/health` de la torre |
| Memoria del API | ≤ 512 MB | ≤ 1.024 MB | > 1.024 MB | API | `memory_mb.rss` de `/health` |
| Consultas lentas | 0 | ≤ 5 | > 5 | Base de datos | `usage.slow_queries_total` |
| Latencia de la base | ≤ 100 ms | ≤ 300 ms | > 300 ms | Base de datos | componente `db` de `/apex-control/status`: la ida y vuelta la midió el propio API |
| Registros medidos | — | — | — | Base de datos | `Informativo`: suma de `records` por módulo en `/apex-control/modules` |
| Empresas con actividad | ≥ 20 % | ≥ 5 % | < 5 % | Base de datos | `tenants.summary` sobre `active` (dirección invertida: gana el valor alto) |
| Frescura de datos | ≤ 1x | ≤ 3x | > 3x | Módulos | peor ratio `age_minutes / expected_minutes` entre módulos |
| Uptime y peticiones | — | — | — | API | `Informativo`: contexto del proceso, no diagnóstico |

- Ningún umbral vive en el navegador. El servidor publica `environment.gauges` con `value`, `band`, `tone`, `label_text`, `limits` y `source`; el panel solo pinta. Cambiar `PERF_API_P95_MS` o los presupuestos de sonda (`PERF_PROBE_P95_LOCAL_MS`, `PERF_PROBE_P95_DEVELOP_MS`, `PERF_PROBE_P95_MAIN_MS`) mueve el corte del medidor sin tocar el HTML.
- Bandas visibles: **Óptimo**, **En riesgo**, **Crítico**, **Sin dato** y **Informativo**. No hay jerga interna en la superficie.
- **Sin dato no es verde**: un valor que no se pudo medir (`null`) queda en banda neutra. Un ambiente que nunca responde no puede aparecer sano.
- Un medidor informativo no tiene escala ni veredicto: pinta la línea base y la nota «contexto del proceso, no diagnóstico», y no cuenta en el resumen de «en rojo / en riesgo».
- Si el valor se sale del extremo de la escala, la tarjeta se marca `fuera de escala` en lugar de pegar el marcador al borde.

### Mapa de módulos vs API

El bloque **Mapa de módulos vs API** concentra en un solo gráfico el comportamiento de todos los módulos y del propio API, alineados en el mismo eje temporal: una fila por módulo (de peor a mejor banda) y una fila final para `API /health`.

- Cada marca es un sondeo real de la torre, guardado en el anillo `ModuleTelemetry` (`apps/control-tower/lib/telemetry.js`, 40 muestras persistidas por ambiente). La ventana se ve en la cabecera: `N sondeos · desde → hasta`.
- **Altura = frescura medida** (`age_minutes / expected_minutes`), color = banda del módulo en ese momento. Un módulo sin fecha medida usa la altura base de su banda; nunca se dibuja una altura inventada.
- La fila del API lleva la lectura `/health` del mismo sondeo embebida en el tick (`api { ms, ok, band }`), así que la latencia del API y el estado de cada módulo se comparan en la misma columna sin casar marcas por fecha.
- La API no publica latencia por módulo, así que el mapa no la simula: muestra frescura y banda, que sí están medidas.
- Una fila es clicable y abre el detalle del módulo; la fila del API no lo es.
- El anillo se alimenta del sondeo real **antes** de aplicar simulaciones o overrides: una prueba simulada no contamina el historial persistido.
- Con 32 módulos el cuerpo tiene su propio desplazamiento; en móvil la fila se colapsa a nombre y marcas.

### Telemetría del proceso

`GET /health` de la API publica, además de estado y commit, los agregados del propio proceso: `uptime_seconds`, `memory_mb` (`rss`, `heap_used`, `heap_total`, `external`), `usage.requests_total`, `usage.by_status` (buckets `2xx`/`3xx`/`4xx`/`5xx`) y `usage.slow_queries_total`. La torre los normaliza en `deployedInfo` y los convierte en las teselas **Memoria del API** y **Uso del API** (vista **Base de datos**) y en las filas de proceso de la vista **Latencia**.

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
| `TOKEN_INVALIDO` | Alta | `apexos-seguridad` | Renovar el JWT vigente del ambiente y reiniciar la torre. |
| `SIN_CONEXION` | Alta | `apexos-performance` · `apexos-seguridad` | Verificar la URL del ambiente, la red y el servicio contra `GET /health`. |
| Módulo caído (`MODULO_CAIDO`) | Alta | `apexos-backend` | Revisar el servicio y su dependencia caída (hasta 5 módulos por ciclo). |
| Módulo fuera del objetivo (`MODULO_ATENCION`) | Media | `apexos-performance` | Medir frescura y dependencia lenta del módulo. |
| `CROSS_TENANT_DESHABILITADO` | Media | `apexos-seguridad` | Aprobar y encender `APEX_CONTROL_CROSS_TENANT` con su allowlist. |
| `PERMISO_DENEGADO` | Media | `apexos-seguridad` | Otorgar `apex-control:read_all_tenants` al rol del token. |
| `MODULO_NO_HABILITADO` | Media | `apexos-backend` · `apexos-seguridad` | Habilitar `apex-control` para la empresa del token. |
| `EMPRESA_FUERA_DE_ALCANCE` / `VISTA_EMPRESAS_NO_DISPONIBLE` | Media | `apexos-seguridad` | Ajustar `APEX_CONTROL_CROSS_TENANT_TENANTS` del ambiente. |
| `CLOUD_SIN_TOKEN` / `CLOUD_ERROR` | Media | `apexos-performance` · `apexos-seguridad` | Cargar o revisar `RAILWAY_TOKEN`, `VERCEL_TOKEN`, `SUPABASE_ACCESS_TOKEN`. |
| Rendimiento fuera de presupuesto (`RENDIMIENTO`) | Alta/Media | `apexos-performance` | Guard de rendimiento del ambiente con p95 y tasa de error medidos. |
| Puntaje en riesgo o crítico sin otra causa (`SALUD`) | Alta/Media | `equipo-apexos` | Abrir el detalle del módulo con peor puntaje. |
| `EMPRESA_NO_ENCONTRADA` | Baja | `equipo-apexos` | Releer el monitor y elegir la empresa de la lista; la torre no sondea tenants a ciegas. |

Ninguna acción se ejecuta sola: la torre es de solo lectura y el comando es una sugerencia con su autorización independiente.

### Conexión real con QA y PROD

Los ambientes remotos están configurados con su URL de API, web y proyecto Supabase. La torre los consulta en cada ciclo y publica lo que cada build responde de verdad:

- `GET /health` entrega estado, versión, módulos y commit desplegado. Ese commit se muestra en el tab y en el encabezado del indicador, para comparar el build con la rama.
- La salud por módulo, la actividad y la vista por empresa requieren que ese build incluya el módulo `apex-control`. Un build anterior responde `404` y la torre lo declara como `MODULO_NO_DESPLEGADO` con el commit afectado; no lo confunde con falta de token ni con una caída.
- Cuando la ruta responde `401`, el módulo sí está desplegado y lo que falta es el JWT del ambiente. Es el momento de configurar `ENV_DEVELOP_APEX_TOKEN` o `ENV_MAIN_APEX_TOKEN`.
- Estado observado el 2026-11-03: QA corría `a505e97f9622` y PROD `938fc2b6f42c`, ambos anteriores al módulo `apex-control`; por eso mostraban `MODULO_NO_DESPLEGADO`. La conexión no requiere cambios de código adicionales: al desplegar un build que incluya el módulo y configurar su JWT, el panel pasa a cifras reales sin tocar la torre.

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

- **Railway**: `RAILWAY_TOKEN` y `ENV_DEVELOP_RAILWAY_PROJECT_ID` / `ENV_MAIN_RAILWAY_PROJECT_ID`.
- **Vercel**: `VERCEL_TOKEN` (y `VERCEL_TEAM_ID` si aplica) y `ENV_DEVELOP_VERCEL_PROJECT_ID` / `ENV_MAIN_VERCEL_PROJECT_ID`.
- **Supabase**: `SUPABASE_ACCESS_TOKEN`; el `ref` de cada proyecto ya viene en `ENV_DEVELOP_SUPABASE_REF` y `ENV_MAIN_SUPABASE_REF`.
- Para validar `auth/v1/health` con `200`, define además `ENV_DEVELOP_SUPABASE_ANON_KEY` y `ENV_MAIN_SUPABASE_ANON_KEY` (llave publica anon).

Sin tokens, la tarjeta del proveedor queda en `Sin credenciales` con la variable que falta; nunca se inventa un estado `ok`. Los tokens no se muestran en el panel, la API, los eventos ni la evidencia. La tarjeta **Credenciales cloud** (vista **Nube**) resume cuántos proveedores están listos por ambiente y enumera únicamente los nombres de las variables faltantes.

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

`control:test` incluye las suites de módulos, cloud, actividad y acciones de intervención: catálogo sin token, API con Bearer, token inválido, 404, ambiente sin conexión, herencia de servicios caídos, el cálculo de métricas Railway/Vercel/Supabase con respuestas congeladas, la puerta entre empresas (`403 CROSS_TENANT_DESHABILITADO`), la ausencia de red sin token, el token local que no viaja a QA/PROD y que cada bloqueo devuelva una acción con prioridad, responsable y comando.

La certificación fase uno (`certify:control-tower:local`, **66/66** el 2026-11-05) levanta la torre en modo simulación y Telegram dry-run, verifica API, ambientes, rendimiento, panel, cola, puente, alertas, recuperación y Telegram, y después corre una **fase real**: la torre apunta al API del puesto (`/health` y `/api/v1/apex-control/status`) y exige que el panel muestre al menos 6 componentes con latencias leídas del servidor, las cifras de memoria/uso publicadas por el propio proceso y el veredicto de latencia con su tope. Captura con Chrome headless y deja evidencia en `docs/qa/evidence/apex-control-tower-f1/` (`tower-datos-reales.png`, `tower-modulos-reales.png`, `tower-latencia-punto.png` y las capturas por vista). La fase real se corre con UNA sola torre leyendo el puesto: con la torre del escritorio abierta al tiempo, el barrido `/apex-control/status` del API local (2,2-5,6 s en reposo) supera el presupuesto de sonda de 6 s y `local_fuente_real` se pone rojo sin cambio de producto.

`certify:control-tower:consolidado` (**53/53** el 2026-11-05) levanta dos APIs de prueba en `127.0.0.1`: una rica (telemetría de proceso en `/health`, `/apex-control/status` con componentes y sus `latency_ms`, módulos, actividad, empresas y salud por empresa) y otra con el build anterior al módulo (`/health` con commit y `404` en `apex-control`, como QA y PROD hoy). Con Chrome por CDP comprueba las siete vistas-pregunta, el monitor consolidado, el selector de empresa, las teselas de memoria y uso con los números publicados por el API, **los medidores con su umbral y el mapa de módulos vs API** (incluido que el Resumen no muestre ninguna tesela), que un componente **sin latencia publicada se lea `sin medición` y nunca cero**, el veredicto de latencia con su tope y su regla de muestras, **la rejilla de la barra de vistas** (ancho > 60 % del panel, hueco < 40 px hasta la primera sección y leyenda de estados como último elemento), **el detalle por punto** (blancos ≥ 2, horarios dibujados, clic en un pico que devuelve ≥ 6 filas con hora, medición y banda, cursor y pico activo marcados), las acciones con responsable y siguiente comando, el bloqueo de PROD que nombra su commit sin inventar empresas, que las bandas solo usen las cinco palabras del vocabulario, la ausencia de jerga `degrade`, la leyenda de estados y una consola sin errores. El explorador del gráfico se espera hasta 30 s: la serie se llena sondeo a sondeo y, leída de una sola vez, la gate dependía del minuto en que arrancaba el navegador. Deja `certification.json`, `snapshot-ambientes.json`, `empresa-tenant-demo.json` y tres capturas (`01-monitor-consolidado-empresa.png`, `02-producto-bloqueado-con-acciones.png`, `03-vista-latencia-consolidado.png`) en `docs/qa/evidence/torre-consolidado-empresas-20261103/`. No usa bases de datos ni credenciales reales; la evidencia se sanea y se verifica que ni el token de la torre ni el JWT aparecen en ella.

La verificación manual de módulos y métricas cloud de esta intervención está en `docs/qa/evidence/torre-modulos-metricas-20261103/`. La de actividad, conexiones y empresas, con capturas de las vistas Resumen y Detalle, está en `docs/qa/evidence/tower-activity-tenants-20261103/`. La del indicador oficial de salud, umbrales y vista por empresa está en `docs/qa/evidence/tower-health-charts-20261103/`. Las cuatro capturas del panel vivo con medidores y mapa están en `docs/qa/evidence/torre-medidores-20261105/`.

Evidencia actual de la fase uno: `certification.json`, `tower-overview.png`, `tower-env-main.png`, `tower-api-down.png`, `tower-datos-reales.png`, `tower-modulos-reales.png`, `tower-vista-latencia.png`, `tower-vista-api.png`, `tower-vista-datos.png`, `tower-vista-modulos.png`, `tower-latencia-punto.png` y `telegram-outbox.json`. Las capturas anteriores a las vistas-pregunta (`torre-modulos-metricas-20261103`, `tower-activity-tenants-20261103` con la versión Resumen/Detalle, `tower-health-charts-20261103` y `torre-medidores-20261105`) quedan como histórico de intervenciones previas.

### Conexiones reales por fuente

Qué se lee de verdad y qué queda en `sin medición`, ambiente por ambiente:

| Fuente | Ruta real | Quién la consume |
|---|---|---|
| Proceso del API (uptime, memoria, buckets de estado, consultas lentas) | `GET /health` | teselas **Memoria del API** / **Uso del API** y vista **Latencia → Rendimiento** |
| Componentes internos (PostgreSQL, Redis, colas, cron, correo, WebSocket) con `latency_ms` y `score` | `GET /api/v1/apex-control/status` | vista **API** (filas por componente) y medidor **Latencia de la base** |
| Salud por módulo del ambiente | `GET /api/v1/apex-control/modules` | **mapa de módulos vs API** y gráfico por módulo |
| Actividad del tenant del token | `GET /api/v1/apex-control/activity` | **carga de datos** y **actividad** del consolidado |
| Empresas del ambiente | `GET /api/v1/apex-control/tenants` (con `APEX_CONTROL_CROSS_TENANT` encendida) | selector **Empresa** y sus seis KPI |
| Nube (Railway, Vercel, Supabase) | APIs de proveedor con `RAILWAY_TOKEN` / `VERCEL_TOKEN` / `SUPABASE_ACCESS_TOKEN` | vista **Nube** |

- **Local** (`desarrollo`): las seis primeras fuentes están activas porque el puesto corre el API y la base reales. La evidencia `tower-datos-reales.png` y `tower-modulos-reales.png` sale de esa fase real de la certificación.
- **QA y PROD**: bloqueadas hoy por despliegue y credenciales, no por código. Los builds desplegados (`a505e97f9622` en QA, `938fc2b6f42c` en PROD) son anteriores al módulo `apex-control` y falta `ENV_DEVELOP_APEX_TOKEN` / `ENV_MAIN_APEX_TOKEN`; sin ellos la torre declara `MODULO_NO_DESPLEGADO` / `SIN_TOKEN` con su acción y responsable, y **no** hereda cifras de otro ambiente.
- Con `TOWER_SIMULATION=true` la torre es hermética: los módulos vienen del catálogo congelado (`catalogPayload("SIMULACION")`) y las sondas remotas se saltan, así que **ese modo no muestra registros reales** y sirve solo para certificar la interfaz.
- Los servicios de nube quedan en `Sin credenciales` hasta definir sus tokens; nunca se pinta un `ok` inventado.

Si Chrome no está en la ruta estándar, define `CHROME_PATH`.

## Seguridad

- Escucha solo en `127.0.0.1` por defecto y rechaza Host no loopback.
- `TOWER_UI_TOKEN` protege las mutaciones; el panel admite `?token=...`.
- `BRIDGE_TOKEN` autentica al puente.
- Telegram exige allowlist y emparejamiento con código temporal.
- Los tokens nunca se muestran en el panel, eventos, logs ni evidencia.
- Los secretos van solo en `.env.local`.

## Problemas comunes

- **No abre el panel**: revisa que el puerto 4310 esté libre y que Node esté en PATH.
- **Sin lecturas de API**: confirma `API_BASE_URL` y que la API esté corriendo.
- **Ramas sin remoto**: `git` no pudo ejecutar `ls-remote`; la torre muestra el estado local y una advertencia.
- **Telegram no responde**: token inválido, modo `off`, chat no emparejado o bot sin mensajes iniciados.
- **Puente fuera de línea**: la sesión de Qoder debe enviar latidos cada 30 segundos como máximo.
- **Redis en `down` con el contenedor arriba**: la sonda exige `+PONG` real en `REDIS_HOST:REDIS_PORT`; confirma el puerto publicado (`55432` para PostgreSQL, `6379` para Redis) y que no haya otro proceso interceptando la conexión.
