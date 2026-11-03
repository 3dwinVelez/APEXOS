# APEX Control Tower

Torre de vigilancia externa para APEXOS. Corre como un proceso Node independiente, fuera de la aplicación y fuera de su base de datos, para que siga funcionando aunque la API, la web o la infraestructura de APEXOS fallen.

No requiere `npm install`: usa Node.js 22 o superior y solo módulos nativos.

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

Cada sonda remota degrada a `unknown` sin bloquear a las demás cuando falta configuración o credenciales. El panel no depende de los servicios vigilados: si APEXOS se cae, la torre sigue mostrando el estado y alertando.

La sonda Redis abre su propio socket TCP contra `REDIS_HOST:REDIS_PORT` y espera `+PONG`; no reutiliza el cliente de la API, así que mide el puerto real y no el estado interno de la aplicación.

## Panel

Dos vistas conmutables desde la barra superior; la elección se recuerda en el navegador:

- **Resumen**: indicadores grandes por ambiente, tarjetas compactas de módulo, alertas abiertas y empresas con actividad reciente. Ideal para ver el estado de un vistazo.
- **Detalle**: todo lo anterior más el desglose técnico de sondas, rendimiento, nube, ramas, credenciales, trabajos, Telegram y eventos.

- **Ambientes**: tabs `Local`, `Develop · QA` y `Main · Producción`; el filtro se aplica a indicadores, servicios, alertas, rendimiento, nube y rama.
- **Indicadores**: salud, módulos, registros, actividad de hoy, conexiones, empresas, servicios caídos, alertas, p95, rama y fábrica Qoder.
- **Servicios**: estado, latencia, detalle, impacto funcional, acción sugerida y detalle técnico expandible.
- **Módulos**: resumen (operativos, degradados, caídos, sin dato, registros), agrupación por dominio y tarjetas con registros, última actividad, frescura esperada, servicios y alertas. El filtro **Solo problemas** deja a la vista únicamente lo degradado o caído. Si la API no entrega datos, el panel muestra el catálogo en `Sin dato` y lo declara, no lo pinta como sano.
- **Actividad**: actividad de hoy, usuarios activos, sesiones, clientes WebSocket, pings GPS y última actividad, con serie diaria de auditoría y eventos. En Detalle se agregan las tablas de conexiones y de actividad diaria.
- **Empresas**: conectividad por `tenant_id` (sesiones, usuarios, última actividad, pings GPS, estado). El Resumen muestra hasta 12 empresas; el Detalle conserva la tabla completa.
- **Alertas**: incidentes por ambiente, con impacto funcional, acción y detalle técnico.
- **Rendimiento API**: p50, p95, promedio, mínimo, máximo, tasa de error y serie temporal por ambiente.
- **Nube**: Railway, Supabase y Vercel con estado, proyecto, servicios, deployments y métricas medibles, o la variable exacta que falta.
- **Credenciales**: preparación de cada proveedor por ambiente (`develop`/`main`) con los nombres de las variables faltantes, nunca sus valores.
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
- Los tokens de sesión viven solo en `apps/control-tower/.env.local` y caducan; renueva el valor cuando el panel reporte `TOKEN_INVALIDO`.

Los módulos no contaminan las sondas de infraestructura, pero sí el indicador oficial: el puntaje del ambiente mezcla 70% módulos y 30% infraestructura cuando ambas fuentes se pueden medir. Un módulo caído genera alerta de severidad media.

### Indicador oficial de salud

El primer bloque del panel es el indicador oficial, no un adorno: publica el puntaje, la banda y los umbrales que lo produjeron.

| Banda | Rango | Qué significa |
|---|---|---|
| Óptimo | 85–100 | Opera con datos frescos y servicios sanos. |
| En riesgo | 60–84 | Funciona, pero con degradación, datos viejos o una dependencia en alerta. |
| Crítico | 0–59 | Módulo caído o dependencia vital sin servicio. |
| Sin dato | — | La API no pudo medir; no se premia ni se castiga. |

- Puntaje base por estado medido: `ok` 100, `degraded` 65, `down` 10. Un módulo sano que consumió más de tres cuartas partes de su ventana de frescura pierde hasta 25 puntos (piso 70) y entra en riesgo.
- Ambiente: 70% módulos + 30% infraestructura. Si una fuente no se puede medir, el puntaje usa solo la medible; si no hay ninguna, queda `Sin dato`.
- El gauge, las tarjetas de banda (con su conteo), la barra de umbrales y el gráfico por módulo ordenado de peor a mejor son clicables: abren el detalle del módulo o la fórmula completa en un diálogo.
- Los tabs de ambiente muestran el puntaje y las sondas medidas; el indicador **Salud** del tablero replica el mismo número.

### Vista por empresa

La tabla de empresas agrega la columna **Módulos** con **Ver módulos**, que abre el mismo indicador, las bandas y el gráfico de módulos para una sola empresa mediante `GET /api/v1/apex-control/tenants/:tenantId/modules`. La empresa no aporta sondas de infraestructura: cuando no las tiene, el puntaje usa únicamente sus módulos y lo declara. Si el ambiente no permite la lectura entre empresas, el panel muestra el código (`SIN_TOKEN`, `CROSS_TENANT_DESHABILITADO`, `VISTA_EMPRESAS_NO_DISPONIBLE`) y el motivo, nunca ceros que parezcan sanos. Al cambiar de ambiente, la empresa abierta se vuelve a consultar contra el ambiente activo.

### Actividad, conexiones y empresas

Con el mismo token por ambiente, la torre consulta:

- `GET /api/v1/apex-control/activity`: actividad del tenant del token en los últimos `days` días, con buckets diarios de auditoría y eventos, usuarios activos, sesiones, clientes WebSocket y pings GPS. Filtrado por tenant; nunca agrega cifras de otras empresas.
- `GET /api/v1/apex-control/tenants`: conectividad por `tenant_id` para la vista de empresas. Es una lectura entre empresas y por eso exige el permiso explícito `apex-control:read_all_tenants`, la guarda `APEX_CONTROL_CROSS_TENANT` (apagada por defecto fuera de local/development) y la allowlist opcional `APEX_CONTROL_CROSS_TENANT_TENANTS`. Si la guarda está cerrada, la API responde `403 CROSS_TENANT_DESHABILITADO` y la torre muestra la restricción con su motivo.

Ambos paneles son informativos: no alteran el puntaje del ambiente. El Resumen limita la tabla de empresas a 12 filas y avisa que el Detalle conserva la tabla completa. Sin token, la sección indica `SIN_TOKEN` y el motivo en vez de mostrar ceros como si hubiera actividad.

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

Sin tokens, la tarjeta del proveedor queda en `Sin credenciales` con la variable que falta; nunca se inventa un estado `ok`. Los tokens no se muestran en el panel, la API, los eventos ni la evidencia. La tarjeta **Credenciales** (solo en Detalle) resume cuántos proveedores están listos por ambiente y enumera únicamente los nombres de las variables faltantes.

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
```

`control:test` incluye las suites de módulos, cloud y actividad: catálogo sin token, API con Bearer, token inválido, 404, ambiente sin conexión, herencia de servicios caídos, el cálculo de métricas Railway/Vercel/Supabase con respuestas congeladas y, para actividad, la puerta entre empresas (`403 CROSS_TENANT_DESHABILITADO`), la ausencia de red sin token y el token local que no viaja a QA/PROD.

La certificación levanta la torre en modo simulación y Telegram dry-run, verifica API, ambientes, rendimiento, panel, cola, puente, alertas, recuperación y Telegram, captura el panel con Chrome headless y deja evidencia en `docs/qa/evidence/apex-control-tower-f1/`.

La verificación manual de módulos y métricas cloud de esta intervención está en `docs/qa/evidence/torre-modulos-metricas-20261103/`. La de actividad, conexiones y empresas, con capturas de las vistas Resumen y Detalle, está en `docs/qa/evidence/tower-activity-tenants-20261103/`. La del indicador oficial de salud, umbrales y vista por empresa está en `docs/qa/evidence/tower-health-charts-20261103/`.

Evidencia actual: `certification.json`, `tower-overview.png`, `tower-env-main.png`, `tower-api-down.png` y `telegram-outbox.json`.

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
