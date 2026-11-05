# Changelog de agentes — Equipo APEXOS

Formato: `YYYY-MM-DD` — agente — `version` — cambio. La versión sigue semver: major cambia rol/contrato, minor agrega control o especialidad, patch corrige redacción o rutas.

## 2026-11-05

### Vitrina pública de Comercio tematizable por tenant (colores, banner, textos y generación gratuita)

- El link público del catálogo (`/tienda/<code>`) deja de ser una plantilla fija: el comercio configura desde **Comercio → Configuración** sus colores (base, acento, promo), sus textos de cartel y su banner, y esa apariencia se pinta solo en su espacio. El tenant que no configura nada ve exactamente la pantalla de ayer: el default es el mismo RGB anterior y no hay migración —el tema vive en `ComercioSettings.preferences_json.theme`.
- Contrato público nuevo: `PUT /comercio/settings/storefront/theme` (lista blanca de colores con regex de hex y topes de longitud), `POST`/`DELETE /comercio/settings/storefront/banner` (multipart al bucket `comercio-assets`, revalidado con magic bytes) y `POST .../storefront/generate-image` con el modelo gratuito de Pollinations (sin clave, límite propio de 8/min, host hardcodeado → sin SSRF). `/api/v1/comercio/public/catalog/:code` ahora lleva el `theme` reconstruido campo a campo; nunca salen `cost`, `stock`, el tenant interno ni `banner_path`, y **la URL de la imagen la produce solo el servidor**.
- Frontend: `apps/web/components/comercio/storefront-theme.ts` (`buildStorefrontVars`) inyecta variables RGB-triplet en el contenedor raíz y `storefront.css` pasó a clases `sf-*` —cero colores literales de Tailwind en la vitrina, con prueba que lo barre por regex—. El `:root` de la hoja es exactamente el tema default (prueba lo verifica).
- **Defecto de producto encontrado revisando la captura, no en las pruebas:** con banner subido y tema claro, el titular del hero quedaba casi negro sobre la fotografía y era ilegible. Se agregó una capa de tinta sobre fotografía (`--sf-photo-*` + `.sf-on-photo`, aplicada por nodo de texto) con letra clara y acentos aclarados por mezcla con blanco, independiente del `base` del tema. La aserción antigua (`la_letra_se_invierte_sobre_fondo_claro`) codificaba el defecto como expectativa y fue reemplazada.
- Corrección de arnés y de contrato: Fastify monta AJV con `removeAdditional: true`, así que un `banner_url`/`banner_path` inyectado se **elimina en silencio y responde 200**, no 400. Las gate cambiaron a afirmación por efecto (snapshot del `theme` público antes/después, idéntico) y quedó una prueba de servicio que lo documenta. El restore del tenant ahora corre al inicio y en el `finally`: una corrida abortada dejaba el tema claro puesto y convertía la siguiente en un falso rojo.
- Pruebas y evidencia: certificación nueva `node scripts/certifications/comercio-storefront-theme-local.js` **40/40 en verde** (`fallidos: []`) con tres estados de pintura medidos en navegador (sin tema, tema oscuro propio con banner 1366×580, tema claro), contraste WCAG en botones, inyecciones, panel vivo (login → sección → previa → preset → PUT 200 → releído público) y cuatro capturas en `docs/qa/evidence/vitrina-comercio-tematizada-20261105/`. Suites: `apps/web/test/comercio-storefront-theme.test.mjs` 13/13, suite web completa 622 en verde, subset API de Comercio 54/54 y `apps/api/test/comercio-storefront-theme.test.js` 19/19; `tsc --noEmit`, `eslint` y `node --check` limpios.
- Limitaciones declaradas, no verificadas: el bucket `comercio-assets` no existe en el ambiente local, así que la subida real responde 500 `ERROR_INTERNO` (la gate lo registra como constancia, no como éxito), y el modelo gratuito devolvió un JPEG válido de 78.686 bytes en la prueba aislada pero después su cuota gratuita respondió 402 → `IMAGEGEN_UNAVAILABLE`. Falta autorización para crear el bucket.
- Brief: `docs/briefs/2026-11-05-vitrina-comercio-tematizada.md`.
- Agentes dueños (preflight: `apexos-backend`, `apexos-seguridad`, `apexos-frontend`, `apexos-qa`, `apexos-brief`):
  - `apexos-backend` — `2.4.0` → `2.5.0` — controles nuevos `tema-vitrina-sin-migracion` y `strip-ajv-reconstruccion` (regla 20): metadata de presentación en `preferences_json`, reconstrucción campo por campo del DTO y del persistido, y el strip silencioso de AJV como contrato —probar un 400 es firmar un falso positivo—; la URL de imagen la produce solo el servidor. Tres antipatrones nuevos.
  - `apexos-frontend` — `2.3.0` → `2.4.0` — controles nuevos `vitrina-tokens-sf` y `tinta-sobre-fotografia` (regla 14): ni un color literal en una superficie personalizable, `:root` ≡ `buildStorefrontVars(default)`, capa de tinta fotográfica por nodo de texto y tinta de mayor contraste en botón sólido. Tres antipatrones nuevos.
  - `apexos-seguridad` — `2.6.1` → `2.7.0` — control nuevo `superficie-tema-sin-inyeccion` (regla 19): la superficie pública personalizable no abre canal de inyección (catálogo sin `cost`/`stock`/`banner_path`, subida multipart única vía, generador con host hardcodeado, 8/min y revalidación de bytes). Cuatro antipatrones nuevos.
  - `apexos-qa` — `2.8.0` → `2.9.0` — control nuevo `certificacion-pintura-medida` (regla 24): un cambio de tema se certifica por `rgb()` efectivo estado por estado con aritmética WCAG, las defensas se afirman por efecto, el restore corre al iniciar y en el `finally`, las limitaciones de ambiente se separan del defecto de producto y **la captura se mira**. Tres antipatrones nuevos.
  - `apexos-brief` — `2.7.2` → `2.8.0` — control nuevo `brief-personalizacion-residencia-dato` (regla 21): el brief de personalización declara residencia del dato (JSON vs migración, archivos → bucket), capacidades preservadas para el tenant que no configura nada, dependencias de infraestructura como limitación y quién pone la URL de un servicio externo.
- Publicación: **commit local en `desarrollo`, sin push** — el propietario pidió evaluar el resultado antes de publicar, así que esta intervención no cuenta con la autorización de `git push origin desarrollo`. Siguen pendientes, fuera de este brief: el push, la creación del bucket `comercio-assets` en el ambiente local/nube y cualquier promoción a `develop`/`main`.

### Torre de control: medidores con umbral y mapa único de módulos vs API

- El **Resumen** de la torre deja de ser un reguero de teselas. Dos bloques nuevos lo sustituyen: **Medidores del sistema** (una tarjeta por magnitud medida, con su escala de tres tramos verde/ámbar/rojo, el marcador del valor, los cortes que produjeron la banda y su fuente) y **Mapa de módulos vs API** (una fila por módulo de peor a mejor banda más la fila final `API /health`, con una marca por sondeo real en el mismo eje temporal). Las teselas, el desglose de módulos y el bloque de Rendimiento pasan a **Detalle** con gating CSS (`detail-only`), así que el DOM y las verificaciones antiguas siguen intactos.
- Fuente única de umbrales: `apps/control-tower/lib/metrics.js` (`GAUGES`, `bandForValue`, `gauge`, `gaugesFor`, `moduleBand`, `moduleTicks`, `probeBand`). El corte de p95 se deriva del presupuesto versionado `PERF_API_P95_MS`; el navegador no decide ningún umbral y el servidor publica valor, banda, tono y límites. Vocabulario de banda cerrado: **Óptimo / En riesgo / Crítico / Sin dato / Informativo**.
- Corrección de producto encontrada por las pruebas nuevas: `number(null)` coerciona a `0`, así que un ambiente sin lecturas se bandaba **Óptimo** (verde silencioso). Un valor no medido es ahora `Sin dato`, y lo informativo (`uptime`, peticiones) tiene banda propia sin escala ni veredicto.
- Historial medido: `apps/control-tower/lib/telemetry.js` persiste un anillo de 40 muestras por ambiente. `server.js` lo alimenta del sondeo real **antes** de `applyOverrides`, de modo que una simulación no contamina el historial. Cada tick lleva embebida la lectura `/health` de ese mismo sondeo (`api { ms, ok, band }`), porque por ambiente y ciclo solo hay una métrica del API y casar marcas por fecha habría desalineado la fila.
- La altura de una marca sale de la frescura medida (`age_minutes / expected_minutes`); donde la API no publica latencia por módulo el mapa **no la estima**. Se documenta como deuda del API, no del panel.
- En **Detalle → Rendimiento** se separan las dos señales que un solo chip confundía: **latencia** (p95 medido) y **sondas** (sondeos `/health` que fallaron), cada una con su banda y una nota que aclara que las peticiones 4xx/5xx de los usuarios no son la misma medición.
- Pruebas: `npm run control:test` **102/102** con tres suites nuevas (`test/metrics.test.js` 11, `test/telemetry.test.js` 6, `test/ui-indicators.test.js` 6 — esta carga el `public/app.js` real en `node:vm` con un DOM mínimo). Certificaciones re-ejecutadas: `certify:control-tower:local` **39/39** (`docs/qa/evidence/apex-control-tower-f1/`) y `certify:control-tower:consolidado` **44/44** (`docs/qa/evidence/torre-consolidado-empresas-20261103/`), ambas con verificaciones nuevas de visibilidad por vista. Capturas del panel vivo en `docs/qa/evidence/torre-medidores-20261105/`.
- Brief: `docs/briefs/2026-11-05-torre-medidores-y-mapa.md`. Documentación: `apps/control-tower/README.md` (secciones **Medidores con umbral** y **Mapa de módulos vs API**, y el mapa de la vista Resumen reescrito).
- Agentes dueños (preflight: `equipo-apexos`, `apexos-brief`, `apexos-seguridad`, `apexos-performance`, `apexos-qa`):
  - `apexos-performance` — `2.6.0` → `2.7.0` — control nuevo `torre-umbrales-fuente-unica` (regla 17): los cortes viven en `lib/metrics.js` derivados del presupuesto, el navegador no bandea, `Sin dato` no es verde, el anillo se alimenta del sondeo pre-override y la latencia por módulo no se inventa. Dos antipatrones nuevos.
  - `apexos-qa` — `2.7.0` → `2.8.0` — control nuevo `torre-certifica-lo-visible` (regla 23): con gating CSS hay que afirmar visibilidad real (`offsetParent`, `getComputedStyle`), exigir medidores y mapa en Resumen y `teselasResumenVisibles === 0`, y validar las cinco palabras de banda como lista cerrada.
  - `apexos-seguridad` — `2.6.0` → `2.6.1` — regla 17 extendida: `environment.gauges` y `moduleHistory` son agregados de banda, frescura y conteo de registros sin ids de empresa, usuario, ruta ni payload; `Sin dato`/`Informativo` no son un veredicto de salud.
  - `equipo-apexos` — `2.5.0` → `2.5.1` — regla 17 aclarada: un rediseño de la interfaz de una herramienta residente tampoco se promociona; se integra con sus gates locales y se publica en `desarrollo`.
  - `apexos-brief` — `2.7.1` → `2.7.2` — regla 20 extendida: en un rediseño visual los criterios de aceptación son observables en el DOM por vista y lo que la fuente no publica se declara fuera de alcance.
- Publicación: `git push origin desarrollo`. La torre no se despliega ni se promueve; siguen pendientes, fuera de este brief, el build del API con `apex-control` en QA/PROD, sus tokens propios y la renovación de `ENV_LOCAL_APEX_TOKEN`.

## 2026-11-03

### La torre de control reposa solo en `desarrollo`

- Decisión del propietario: `apps/control-tower/**` es una herramienta de puesto de trabajo que **vive y se ejecuta solo en `desarrollo`**. No se promueve a `develop`, no llega a `main`, no se despliega y sus certificaciones no alimentan un gate de promoción. Se registró en `docs/project/flujo-ramas-y-ambientes.md` (sección «Residentes que nunca se promueven») y en `apps/control-tower/README.md` (sección «Rama de residencia»).
- Lo que sí sigue el flujo `desarrollo -> develop -> main` es la otra mitad del dato: `apps/api/src/modules/apex-control/**` y la telemetría de `/health`. La residencia del panel no cancela esa promoción; sin un API desplegado con el módulo, la torre no puede leer QA ni PROD.
- Control nuevo compartido `torre-residente-en-desarrollo`:
  - `apexos-git-guardian` — `2.2.0` — regla 19: no despacha promoción ni despliegue del panel; el cierre termina en `git push origin desarrollo`.
  - `apexos-performance` — `2.6.0` — regla 16: la torre se arranca en el puesto (`127.0.0.1:4310`), su presupuesto es de proceso local y su única vía a QA/PROD es el API desplegado.
  - `apexos-seguridad` — `2.6.0` — regla 18: residir en `desarrollo` no relaja secretos ni la guarda cross-tenant; `.env.local` sigue fuera de commits y manifiestos.
  - `apexos-qa` — `2.7.0` — regla 22: una verde de `certify:control-tower:*` certifica la herramienta, nunca promueve.
  - `equipo-apexos` — `2.5.0` — regla 17: la residencia declarada se respeta; no se ofrece promocionar bloques que el dueño no pidió desplegar.
  - `apexos-brief` — `2.7.0` — regla 20: todo brief declara la rama de destino y qué bloques no se promueven.
- Brief actualizado: `docs/briefs/2026-11-03-torre-consolidado-empresas.md` (sección 10 separa la residencia del panel de la promoción pendiente del API).
- `apexos-git-guardian` — `2.2.1` — regla 18 aclarada: un documento no rastreado del propietario entra al commit solo si él lo pide explícitamente y se escanea por secretos. El 2026-11-03 se pidió y se versionó `docs/design/APEXOS_CONTROL_PLANE.md` en `desarrollo` (431 líneas, cero secretos contra los valores de `.env.local`); la sección 3 del brief registra esa excepción.
- `apexos-frontend` — `2.3.0` — control nuevo `documento-plano-control-referencia` (regla 13): el documento funcional del plano de control es la referencia de jerarquía visual (general → empresa → módulo) para cualquier panel nuevo y no se reescribe sin autorización del propietario.
- `apexos-brief` — `2.7.1` — regla 20 extendida: un documento no rastreado del propietario entra al inventario solo con pedido explícito, y el brief lo registra con fecha y escaneo de secretos.

### Monitor consolidado por empresa, telemetría medida y acciones de intervención

- La torre publica un **monitor consolidado por empresa** por ambiente (empresas activas, carga de datos, actividad acumulada, empresas sin señal, memoria del API, uso del API y p95) y un **selector de empresa** alimentado solo con la lectura vigente. Al elegir una empresa, su panel muestra estado operativo, carga de datos, actividad y consumo del API con los números que devuelven `/health` y `/api/v1/apex-control/tenants/:tenantId/modules`. Cambiar de rama deselecciona la empresa: una empresa de LOCAL no se relee contra QA ni PROD.
- `GET /health` publica telemetría agregada del proceso (`uptime_seconds`, `memory_mb`, `usage.requests_total`, `usage.by_status`, `usage.slow_queries_total`) también en el `503 NOT_READY`; `probes.js` la normaliza en `deployedInfo` y el panel de **Detalle → Rendimiento** la muestra. Un ambiente sin esos campos se declara `sin medición` en vez de heredar cifras de otro. Por diseño: son totales del proceso, sin rutas, tenants ni datos personales.
- Nuevo motor de acciones `apps/control-tower/lib/recommendations.js`: cada causa de bloqueo (build sin módulo, falta de token, token inválido, sin conexión, simulación, guarda cross-tenant, permiso denegado, módulo no habilitado, empresa fuera de alcance o inexistente, módulo caído, módulo fuera de objetivo, rendimiento y salud) devuelve prioridad, título, acción concreta, **agente responsable** y siguiente comando. Vive en el bloque de salud del ambiente, en el panel de empresas bloqueado, en el panel por empresa y en las respuestas de `/api/tenants` y `/api/tenants/:tenantId/modules`.
- El vocabulario `degrade` y sus formas en español desaparecen de lo visible: `degradado` pasa a **Requiere atención** (leyenda, alertas, resumen de módulos, pulso y reporte), se agrega una leyenda de estados bajo las pestañas de ambiente y cada módulo abierto explica qué significa su estado. El detalle de módulos dice `en objetivo / requieren atencion / caidos / sin dato`.
- Lectura en vivo del panel real (`docs/qa/evidence/torre-consolidado-empresas-20261103/lectura-viva-20261103.json`): `local` con 200 empresas, 160 MB de RSS, 791 peticiones y p95 de 148 ms; QA (`a505e97f9622`) y PROD (`938fc2b6f42c`) sin telemetría porque sus builds no la publican, con el bloqueo nombrado y PROD además en **Rendimiento fuera de objetivo** (p95 1091 ms). El archivo se comprobó contra los valores de `.env.local`: ningún secreto sale en la evidencia.
- Certificación nueva `npm run certify:control-tower:consolidado` (42 verificaciones, `docs/qa/evidence/torre-consolidado-empresas-20261103/`): API rica con telemetría + API con el build anterior al módulo, tres capturas de navegador, snapshot y lectura por empresa en JSON saneado, bloqueo de PROD que nombra el commit, selector vacío cuando no hay lectura real y consola sin errores. La gate fase uno se re-ejecuta con umbrales de contadores (`>= 8`) más `browser_performance_runtime_telemetry` y queda 38/38; suites: torre 81/81 y API 31/31.
- `apexos-backend` — `2.4.0` — control nuevo `telemetria-proceso-health`: `/health` solo publica agregados del proceso; un campo de ruta, tenant o usuario bloquea el cambio.
- `apexos-performance` — `2.5.0` — control nuevo `consumo-uso-api-medido`: memoria, uso y uptime se miden en `/health` y se normalizan en la torre; sin dato se declara `runtimeMissing`; el cambio de ambiente deselecciona la empresa.
- `apexos-seguridad` — `2.5.0` — control nuevo `telemetria-agregada-sin-fuga`: telemetría sin superficie nueva de datos personales, evidencia saneada con prueba explícita de que ni el token de la torre ni el JWT aparecen en JSON ni PNG.
- `apexos-qa` — `2.6.0` — control nuevo `certificacion-consolidado-vivo`: el consolidado se certifica con números publicados por el API, selector real, acciones con responsable, cero jerga `degrade` y consola limpia; los conteos DOM se afirman con umbral y se contrastan con el payload.
- `equipo-apexos` — `2.4.0` — control nuevo `accion-sin-jerga`: un estado que el dueño del ambiente no entiende no es entrega; todo bloqueo cierra con acción, responsable y comando.
- `apexos-brief` — `2.6.0` — control nuevo `brief-cifras-nombradas`: el brief de un monitor declara qué número se mide en vivo, cuál depende de credenciales o despliegue y cuál está bloqueado por el build con su commit; la evidencia se publica en commit separado.
- Se renumeraron las reglas duras que habían quedado fuera de orden (`apexos-performance`, `apexos-seguridad`, `apexos-qa`, `equipo-apexos`, `apexos-brief`) sin cambiar su contenido.
- Brief: `docs/briefs/2026-11-03-torre-consolidado-empresas.md`; evidencia en `docs/qa/evidence/torre-consolidado-empresas-20261103/`.

### Conexión real con los ambientes QA y PROD

- La torre ya no responde `SIN_TOKEN` a ciegas: si el ambiente no tiene token, consulta `GET /health` sin credenciales y distingue `401` (falta token) de `404` (el build desplegado no incluye `apex-control`). El nuevo motivo `MODULO_NO_DESPLEGADO` nombra la causa real y el commit responsable.
- El tab de cada ambiente y el encabezado del indicador muestran `version`, `commit` (7 caracteres) y número de módulos leídos de `/health`; `probes.js` los publica como `deployed`. Un `commit: "unknown"` no se muestra.
- La actividad y la lectura por empresa usan el mismo diagnóstico: `404` con token informa `MODULO_NO_DESPLEGADO`, sin token informa `SIN_TOKEN`, y la sonda sin credenciales no envía `Authorization`.
- Medición real del 2026-11-03: QA responde `200` en `/health` con build `a505e97f9622` y PROD con `938fc2b6f42c`; ambos devuelven `404` en `/api/v1/apex-control/modules` porque sus builds son anteriores al módulo (`2a186a63`, 2026-11-02). Los datos por módulo requieren un build con el módulo desplegado y `ENV_DEVELOP_APEX_TOKEN`/`ENV_MAIN_APEX_TOKEN`.
- `apexos-performance` — `2.4.0` — control nuevo `diagnostico-build-por-ambiente`: el build desplegado se mide y se publica con el puntaje; una consulta sin token solo separa 401 de 404.
- `apexos-seguridad` — `2.4.0` — control nuevo `sonda-anonima-diagnostico`: la sonda sin credenciales se limita a `/health`, no envía `Authorization` y no persiste tokens.
- `apexos-qa` — `2.5.0` — control nuevo `certificacion-conexion-build`: la evidencia de conexión exige `/health` real, códigos reales de la ruta de módulos, captura por ambiente y `BLOQUEO: build sin módulo` cuando falta el despliegue.
- `equipo-apexos` — `2.3.0` — control nuevo `diagnostico-sin-datos-por-causa`: sin datos se separa en credencial, build y red antes de pedir tokens o declarar falla.
- `apexos-brief` — `2.5.0` — control nuevo `brief-build-desplegado`: el brief de conexión nombra el build desplegado y deja promoción, despliegue y tokens en autorizaciones separadas.
- Brief: `docs/briefs/2026-11-03-torre-conexion-ambientes.md`; evidencia en `docs/qa/evidence/tower-env-connection-20261103/`.

### Indicador oficial de salud y vista por empresa

- `apps/control-tower/lib/health.js` publica el puntaje con umbrales fijos (Óptimo ≥ 85, En riesgo 60–84, Crítico < 60, Sin dato) y mezcla 70% módulos + 30% infraestructura cuando ambas fuentes se miden. `degraded` pasa de 55 a 65: un servicio que responde degradado se lee **En riesgo**, no **Crítico**; solo `down` (10) es crítico. `test/health.test.js` fija las fronteras 85/84/60/59, la penalización por frescura y la mezcla.
- La torre muestra el indicador como gauge, tarjetas de banda con conteo, barra de umbrales y gráfico por módulo ordenado de peor a mejor; las bandas filtran, las filas abren el detalle del módulo y **Umbrales y fórmula** abre la metodología.
- `GET /api/v1/apex-control/tenants/:tenantId/modules` mide una sola empresa con la misma guarda, permiso explícito y allowlist de `/tenants`; id inválido 400, inexistente 404 y fuera de allowlist 403. La tabla de empresas abre el detalle por empresa con su propio gauge y gráfico, y lo relee al cambiar de ambiente.
- QA y PROD siguen `SIN_TOKEN` porque faltan `ENV_DEVELOP_APEX_TOKEN` y `ENV_MAIN_APEX_TOKEN`; el panel nombra la variable exacta. `SUPABASE_ACCESS_TOKEN` y `VERCEL_TOKEN` están vacíos y `RAILWAY_TOKEN` responde `Not Authorized`; se reporta como limitación declarada.
- `apexos-backend` — `2.3.0` — control nuevo `detalle-empresa-modulos`: ruta por empresa con id validado, 404/403 propios y la misma puerta entre empresas.
- `apexos-seguridad` — `2.3.0` — control nuevo `detalle-empresa-misma-puerta`: sin superficie paralela de lectura entre tenants; rechazos 400/403/404 probados y tokens por ambiente.
- `apexos-performance` — `2.3.0` — control nuevo `graficos-salud-acotados`: cálculo puro sin I/O, 10 filas en Resumen y total solo en Detalle, vista por empresa con límite propio de 30/min.
- `apexos-qa` — `2.4.0` — control nuevo `certificacion-salud-empresa`: fronteras de banda en pruebas, certificación que valida Resumen y Detalle por separado, dos empresas con cifras distintas y snapshot sin tokens.
- `equipo-apexos` — `2.2.0` — control nuevo `indicador-oficial-y-empresa`: un gráfico sin frontera probada no se presenta como indicador oficial; la vista por empresa conserva la puerta entre empresas.
- `apexos-brief` — `2.4.0` — control nuevo `alcance-sin-archivos-sin-seguimiento`: un archivo sin seguimiento que no se publica queda fuera del inventario y la cobertura de cierre se corre con `--paths` del alcance exacto, no con todo el árbol.
- Brief: `docs/briefs/2026-11-03-torre-salud-por-empresa.md`; evidencia en `docs/qa/evidence/tower-health-charts-20261103/` y certificación 37/37 en `docs/qa/evidence/apex-control-tower-f1/`.

### Cierre de las certificaciones UI y del hueco del palette

- Las seis certificaciones de navegador que fallaban (`phase-two`, `phase-three-accessibility`, `phase-three-collaboration`, `phase-three-personalization`, `phase-three-toolkit`, `phase-three-totp`) se corrigieron en el arnés: hidratación por `dataset.density`, desplegable **Herramientas** abierto antes de pulsar cada herramienta, `press("k")` en lugar de `KeyK`, etiqueta vigente `Nueva compra` y configuración pública de Supabase inyectada en el flujo 2FA simulado. `offline-bootstrap` desactiva Redis antes de importar `tenantCache`. Nueve certificaciones en verde (71 comprobaciones) en `docs/qa/evidence/ui-ux-phase-certifications-20261103/`.
- `apps/web/lib/moduleFunctions.ts` registra `Gestionar promociones del comercio` para la ruta `/dashboard/comercio/promociones`, que existía sin entrada en el centro de comandos; la prueba de paleta queda 10/10.
- `apexos-frontend` — `2.2.0` — control nuevo `ruta-dashboard-en-centro-comandos`: toda pantalla estática del dashboard se registra en `lib/moduleFunctions.ts` en la misma intervención, con nombre de función de negocio y keywords de trabajo diario.
- `apexos-qa` — `2.3.0` — control nuevo `certificar-contra-shell-vigente`: esperar `dataset.density`, abrir **Herramientas**, usar `press("k")`, inyectar la configuración pública de Supabase cuando el build no la trae y desactivar Redis en pruebas que importan `tenantCache`.
- `apexos-brief` — `2.3.0` — control nuevo `inventario-cierre-certificaciones`: un cierre de deuda de certificaciones enumera cada arnés, cada archivo de evidencia y la salida de síntesis, con conteo exacto por certificación como criterio.
- Brief: `docs/briefs/2026-11-03-cierre-certificaciones-ui.md`; evidencia en `docs/qa/evidence/ui-ux-phase-certifications-20261103/`.

### Torre: actividad, conexiones y vistas Resumen/Detalle

- `GET /api/v1/apex-control/activity` agrega buckets diarios de auditoría y eventos con `$queryRaw` y filtro de tenant; `GET /api/v1/apex-control/tenants` expone conectividad por empresa con permiso explícito, guarda de ambiente y allowlist, y `403 CROSS_TENANT_DESHABILITADO` cuando la guarda está cerrada.
- `apexos-backend` — `2.2.0` — control nuevo `actividad-por-empresa`: buckets diarios exactos, filtro por tenant y lectura entre empresas con permiso explícito, guarda de ambiente y allowlist.
- `apexos-seguridad` — `2.2.0` — control nuevo `lectura-entre-empresas`: la conectividad global solo se expone tras aprobación registrada, guarda apagada por defecto fuera de local/development y rechazo 403 probado.
- `apexos-performance` — `2.2.0` — control nuevo `actividad-empresas-acotadas`: actividad con agregados por rango, panel informativo que no puntúa y vista Resumen limitada a 12 empresas con la tabla completa solo en Detalle.
- `apexos-qa` — `2.2.0` — control nuevo `certificacion-actividad-empresas`: suite de actividad y empresas en la torre y la API, puerta cerrada 403, token local que no viaja a remotos y capturas reales de Resumen y Detalle.
- Brief: `docs/briefs/2026-11-03-torre-actividad-empresas.md`; evidencia en `docs/qa/evidence/tower-activity-tenants-20261103/`.

### Certificación UI fase uno

- `apps/web/test/certify-ui-ux-phase-one-local.mjs` valida la navegación por `aria-current` y el panel vigente (`Clasificación y organización`), no por la etiqueta retirada `Existencias y dimensiones`; el conteo de controles con nombre excluye `aria-hidden="true"` y `type="hidden"`. Certificación 13/13 en `docs/qa/evidence/ui-ux-phase-one-revalidation-20261103/`.
- `apexos-qa` — `2.2.0` — control nuevo `certificacion-contra-codigo-vigente`: un fallo por etiqueta o estructura se reproduce en navegador y se contrasta con el código antes de declarar regresión; el arnés obsoleto se corrige en la misma intervención.
- `apexos-frontend` — `2.1.0` — control nuevo `certificacion-ui-en-la-misma-intervencion`: renombrar pasos, etiquetas o paneles visibles obliga a actualizar la certificación de navegador que los verifica.
- `apexos-brief` — `2.2.0` — control nuevo `certificacion-ui-en-el-inventario`: todo cambio de etiquetas o pasos incluye el archivo de certificación UI en el inventario `A`/`M`.
- Brief: `docs/briefs/2026-11-03-certificacion-ui-fase-uno.md`.

### Contexto vivo y frescura de agentes

- Se agrega `npm run agents:preflight`: compara semver, `updated_at` y `sha256` contra `origin/desarrollo`, bloquea con `INTEGRAR_REMOTO`/`CONFLICTO` y rutea las rutas de la intervención a los agentes obligatorios.
- `AGENTS.md` incorpora el protocolo de contexto vivo y la tabla de ruteo obligatorio; la sección de documentación exige preflight antes de editar y al cierre.
- `docs/briefs/_TEMPLATE.md` sección 11 declara agentes consultados y exige preflight sin bloqueos.
- `equipo-apexos` — `1.3.0` — el despacho parte del preflight; no cierra sin agentes consultados y actualizados.
- `apexos-brief` — `1.2.0` — el preflight es puerta del brief y define los agentes consultados.
- `apexos-git-guardian` — `1.2.0` — reglas de frescura: fetch permitido, veredictos bloqueantes y prohibición de sobrescribir referencias remotas.

### Contrato de equipo y entrenamiento de contenido

- Se crea `docs/project/CONTRATO_EQUIPO_APEXOS.md` (v2): regla de oro del contexto vivo, preflight, tabla de dueños, contrato obligatorio por agente, checklist universal, evidencia, handoff y antipatrones.
- Se crea `agents/TEMPLATE_SKILL.md` como plantilla de `contract: 2` para migrar el resto del equipo.
- `apexos-frontend` — `2.0.0` — migra a `contract: 2`; homologación obligatoria antes que creatividad, catálogo de componentes y pantallas de referencia, tokens sin hex, dos temas, evidencia de navegador. Nuevos controles: `contrato-v2`, `catalogo-componentes`, `pantallas-referencia`, `homologacion-obligatoria`, `tokens-sin-hex`.
- `apexos-db-nube` — `2.0.0` — migra a `contract: 2`; convención de tablas snake_case plural, checklist de tabla nueva, migración forward-only, índices por tenant y dinero en `Decimal`. Nuevos controles: `contrato-v2`, `convencion-tablas`, `checklist-tabla-nueva`, `migracion-forward-only`, `indices-tenant`, `dinero-decimal`.
- `docs/design/APEXOS_COMPONENT_CATALOG.md` ordena tokens, primitivas, pantallas de referencia y prohibiciones medidas (269 hex, 93 tablas crudas frente a 8 `DataTable`).
- `docs/DATABASE_CONVENTIONS.md` documenta el estado medido (191 modelos, 639 columnas `tenant_id`, 216 `Float` heredados) y las reglas para no repetir la deuda.
- `agents:check` valida que todo agente con `contract: 2` tenga las secciones obligatorias, en orden, no vacías y con lecturas existentes.
- `npm run agents:coverage` se vuelve bloqueante: cada agente dueño de una ruta debe tener bump local frente a `origin/desarrollo` y mención en la sección más reciente de este changelog.
- El preflight deja de perder el primer carácter de la primera ruta de `git status --porcelain` y de marcar `CONFLICTO` en ediciones locales del mismo día cuando `origin/desarrollo` ya está contenido en `HEAD`.
- `equipo-apexos` — `1.4.0` — el cierre exige `agents:coverage` y no admite actualizar al dueño en una intervención posterior.
- `apexos-brief` — `1.3.0` — la sección 11 declara dueño por ruta y exige cobertura en verde.
- `apexos-git-guardian` — `1.3.0` — la secuencia de cierre incluye `agents:coverage`; sin cobertura no hay commit ni push.

### Fase 2: backend, seguridad y QA

- `apexos-backend` — `2.0.0` — migra a `contract: 2`; contexto de tenant obligatorio, permisos explícitos por guardas, JWT HS256 con `timingSafeEqual`, rate limit por tenant, `Server-Timing` por fases, P2028 como contención, doble almacén, auditoría dependiente de Redis, subidas con firma real y torre fuera de `apps/api`. Nuevos controles: `contrato-v2`, `tenant-context-obligatorio`, `permisos-explicitos`, `jwt-hs256`, `rate-limit-por-tenant`, `uploads-firma-real`, `torre-fuera-api`.
- `apexos-seguridad` — `2.0.0` — migra a `contract: 2`; el tenant como única frontera donde no hay RLS, secretos fuera del repositorio y del cliente, JWT sin atajos, uploads por firma, dependencias justificadas, hallazgos con reproducción y tokens cloud de la torre solo en servidor. Nuevos controles: `contrato-v2`, `tenant-unico-filtro`, `jwt-timing-safe`, `uploads-firma-real`, `dependencias-justificadas`, `torre-tokens-server-only`, `hallazgos-con-reproduccion`.
- `apexos-qa` — `2.0.0` — migra a `contract: 2`; certificación bloqueante, manifiesto v2 exacto contra el target remoto, capacidades protegidas juntas, arnés vs producto, aprobación explícita de `main`, evidencia sin datos personales y harness aislado. Nuevos controles: `contrato-v2`, `certificacion-bloqueante`, `manifiesto-v2-exacto`, `capacidades-juntas`, `arnes-vs-producto`, `aprobacion-main-explicita`, `evidencia-sin-pii`, `harness-aislado`.

### Fase 3: proceso, orquestación y auditores

- `agents:sync` y `agents:check` exigen `contract: 2` a todo agente registrado; un agente nuevo o una regresión a `contract: 1` bloquea la sincronización y la validación. `agents:sync` además rechaza un cambio de contenido sin bump de versión. La suite `test:agents` verifica que los once agentes cumplen el contrato y sus lecturas obligatorias existen.
- `apexos-performance` — `2.0.0` — migra a `contract: 2`; presupuesto bloqueante medido a concurrencia 10 (frontend document 1000 ms, API 1000 ms, Supabase REST 700 ms), p95 por ambiente en vez de promedio global, sondas TCP verificadas contra servidor efímero, escritura de volumen solo en Nyvora QA, inframestructura solo con autorización. Nuevos controles: `contrato-v2`, `p95-por-ambiente`, `sondas-verificadas`, `escritura-solo-nyvora-qa`, `infra-con-autorizacion`.
- `apexos-brief` — `2.0.0` — migra a `contract: 2`; rutas verificadas antes de citarlas, inventario A/M/D exacto como insumo del manifiesto v2, criterios observables, gates `preqa`/`approval` declarados desde el brief y prohibición de secretos. Nuevos controles: `contrato-v2`, `rutas-verificadas`, `criterios-observables`, `gates-preqa-aprobacion`, `sin-secretos`.
- `apexos-git-guardian` — `2.0.0` — migra a `contract: 2`; gate de alcance v2 con entradas exactas y `allowed_deletions`, candidato contra el target remoto vigente, evidencia pre-QA y de aprobación con sus campos obligatorios, y prohibición de operaciones destructivas sin autorización. Nuevos controles: `contrato-v2`, `gate-alcance-v2`, `candidato-vs-target-remoto`, `evidencia-preqa`, `evidencia-aprobacion`, `sin-operaciones-destructivas`.
- `equipo-apexos` — `2.0.0` — migra a `contract: 2`; despacho por ruteo del preflight, conflictos resueltos por gobernanza, cobertura bloqueante, auditores solo para dictamen, torre de solo lectura y confirmación de acciones irreversibles. Nuevos controles: `contrato-v2`, `auditores-solo-dictamen`, `torre-solo-lectura`, `confirmacion-irreversible`.
- `apexos-auditor-marcaciones` — `2.0.0` — migra a `contract: 2`; tres pasadas separadas, cita `archivo:linea`, reproducción obligatoria antes de reportar, configuración real del tenant, anonimización y sin veredicto legal propio. Nuevos controles: `contrato-v2`, `tres-pasadas`, `cita-archivo-linea`, `reproducir-antes-de-reportar`, `sin-veredicto-legal`.
- `apexos-auditor-nomina` — `2.0.0` — migra a `contract: 2`; recálculo independiente por concepto, cuadre preview/liquidación/cierre/aportes/provisiones, delta económico por P0, tres pasadas y sin veredicto legal propio. Nuevos controles: `contrato-v2`, `tres-pasadas`, `delta-economico`, `sin-veredicto-legal`.

### Torre apex-control

- `apexos-performance` — `1.3.0` — control nuevo: las sondas TCP deben llamar a `connect` y probarse contra un servidor efímero; un `timeout` del probe no se confunde con caída del servicio vigilado. Origen: la sonda Redis de la torre nunca conectaba y reportaba `down` con el contenedor arriba.

### Salud por módulo y métricas cloud

- `apps/api` expone `GET /api/v1/apex-control/modules` (32 módulos, `apex-control:read`, tenant-scoped) y la torre agrega panel por módulo con registros, frescura, servicios y alertas, más tarjetas medibles de Railway, Vercel y Supabase. Brief: `docs/briefs/2026-11-03-torre-modulos-metricas.md`.
- `apexos-backend` — `2.1.1` — control nuevo `salud-por-modulo`: endpoint de solo lectura con permiso explícito, `runWithTenant`, contraste con el delegado real de Prisma, `unavailable` ante error de medición y frescura por campo de fecha/expectativa.
- `apexos-seguridad` — `2.1.0` — controles nuevos `aislamiento-salud-modulos` y `token-por-ambiente`: sin agregación entre tenants y la torre no reutiliza el token local contra QA/PROD.
- `apexos-performance` — `2.1.0` — controles nuevos `metricas-cloud-medibles` y `sondas-informativas`: módulos no contaminan el puntaje y las tarjetas cloud reportan despliegues, antigüedad, duración media y salud por servicio; sin token quedan `unknown`.
- `apexos-qa` — `2.1.0` — controles nuevos `pruebas-salud-modulos` y `limitacion-cloud-declarada`: suites de torre y API más captura real; la falta de credenciales cloud se declara, no se infiere.
- `apexos-brief` — `2.1.0` — control nuevo `brief-salud-modulos-cloud`: todo brief de módulos/cloud parte del brief de referencia y entrega la sección 11 completa.
- `apexos-git-guardian` — `2.1.0` — control nuevo `alcance-torre-modulos`: el commit incluye solo fuente, pruebas, brief, agentes y evidencia; deja fuera `.env.local` y documentos no rastreados ajenos.
- `equipo-apexos` — `2.1.0` — control nuevo `cierre-salud-modulos-cloud`: el cierre exige backend, seguridad, performance y QA con `agents:coverage` en verde y limitaciones declaradas.

## 2026-11-02

### Registro y gobernanza

- Se crea `agents/` como espejo portable del equipo, con `registry.json` (versión, fecha, `sha256`, controles) y este changelog.
- Se agregan `npm run agents:sync` y `npm run agents:check`; `restore` reconstruye `.qoder/skills` desde el espejo en otra máquina.
- `AGENTS.md` incorpora la sección **Documentation, agents and publication**: toda intervención actualiza documentación y agentes, y autoriza de forma permanente y acotada `git push origin desarrollo`. No cubre `develop`, `main`, force push, merges, migraciones remotas ni infraestructura.
- `docs/briefs/_TEMPLATE.md` incorpora la sección 11 obligatoria (documentación, agentes y publicación) y ajusta la restricción de push.

### Agentes

- `equipo-apexos` — `1.1.0` — roster completo (brief y auditores), validación de `registry.json` contra `origin/desarrollo`, cierre obligatorio con documentación, agentes y push acotado.
- `apexos-brief` — `1.1.0` — preflight de versiones y fechas, regla semver/sha256 para no sobrescribir versiones nuevas, sección 11 obligatoria y publicación a `origin/desarrollo`.
- `apexos-backend` — `1.1.0` — motor HR (IBC sin fallback, cierre con provisiones), tenant como único filtro, contención P2028, doble almacén, alias `/hr` y `/talento-humano`, auditoría dependiente de Redis, pruebas con Prisma falso.
- `apexos-db-nube` — `1.1.0` — migraciones idempotentes validadas dos veces, sin nube por defecto, RLS compensatorio, seeds por tenant, tipos monetarios, alineación real de esquemas.
- `apexos-frontend` — `1.1.0` — una vista por concepto, formulario consolidado, reutilización de la tubería, `next build` y rutas tipadas, evidencia en navegador y ambos temas.
- `apexos-git-guardian` — `1.1.0` — push acotado a `origin/desarrollo`, manifiesto de alcance v2, comparación contra target remoto, worktrees y recuperación sin snapshot viejo.
- `apexos-performance` — `1.1.0` — P2028 como contención, harness en `%TEMP%`, `performance:guard` bloqueante, rutas calientes y `Server-Timing`.
- `apexos-qa` — `1.1.0` — carreras del arnés vs fallos de negocio, harness aislado, puertas de evidencia, regresión HR, UI en navegador y bloqueo explícito.
- `apexos-seguridad` — `1.1.0` — RLS no universal y fuga medida por falta de contexto, service role, tokens, uploads, RBAC de HR y revisión de secretos precommit.
- `apexos-auditor-marcaciones` — `1.1.0` — estado de la remediación 2026-10-30, R-01..R-05 en `desarrollo`, `main` sin motor corregido y firma legal pendiente.
- `apexos-auditor-nomina` — `1.1.0` — R-04/R-05 implementados en `desarrollo`, evidencia local (IBC 7/7, cierre 2/2, HR 175/175), R-06..R-10 abiertos y firma legal pendiente.
