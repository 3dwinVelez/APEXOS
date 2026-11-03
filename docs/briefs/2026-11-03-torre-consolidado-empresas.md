# Brief — Monitor consolidado por empresa y acciones de intervención

- **ID**: `2026-11-03-torre-consolidado-empresas`
- **Fecha**: `2026-11-03`
- **Rama activa**: `desarrollo`
- **Prompt crudo**: "veo que actualmente no tengo la posibilidad de poder seleccionar la empresa, los datos no son reales no trae informacion veridica de los ambientes, tampoco cuento con un monitor consolidado donde me muestre por empresa en la rama main que es productivo donde debemos hacer enfasis un consolidado de todas las empresas y sus estados operativos cargas de datos, consumos de memoria usos del api, rendimiento de todo reajusta el monitor con estas premisas y garantizame que si o si exista una conexion con todo el ecosistema de apexos y que este funcionando en vivo! no parcial ni informacion degradada ya que no entiendo el degrade ni existen sgerencias de intervencion para que los agentes tomen accion"

## 1. Objetivo

La torre de control deja de ser una lista de componentes: el dueño del ambiente elige una empresa concreta, ve el consolidado de todas las empresas del ambiente con su estado operativo, carga de datos, memoria y uso del API y rendimiento, y cada bloqueo viene con una acción de intervención con agente responsable y siguiente comando. El vocabulario `degrade` desaparece de la pantalla y se explica con una leyenda de estados.

## 2. Alcance exacto

| Estado | Archivo | Qué cambia |
|---|---|---|
| `A` | `apps/api/test/metrics-runtime.test.js` | 3 pruebas de `runtimeSnapshot` (valores inyectados, proceso real, redondeo a MB). |
| `M` | `apps/api/src/fabric/metrics.js` | Contadores de proceso (`runtimeCounters`, `statusBucket`, `megabytes`) y `runtimeSnapshot()` agregado sin rutas, tenants ni datos personales. |
| `M` | `apps/api/server.js` | `/health` publica `uptime_seconds`, `memory_mb` y `usage` en la rama `200` y en el `503 NOT_READY`. |
| `M` | `apps/api/src/modules/apex-control/modules.js` | El detalle visible pasa de `Dependencia degradada:` a `Dependencia fuera del objetivo:`. |
| `M` | `apps/api/src/modules/apex-control/pulse.js` | El pulso describe `degraded` como `requiere atencion`, no `esta degradado`. |
| `M` | `apps/api/src/modules/apex-control/report.js` | La etiqueta del reporte pasa de `Degradado` a `Requiere atencion`. |
| `A` | `apps/control-tower/lib/recommendations.js` | Motor puro de acciones de intervención por causa: prioridad, título, acción, agente responsable y comando; cubre build, credencial, conexión, módulos, cloud, rendimiento, salud y bloqueo por empresa. |
| `A` | `apps/control-tower/test/recommendations.test.js` | 13 pruebas del motor, incluidas las de bloqueo por empresa y que simulación no invente acciones. |
| `M` | `apps/control-tower/lib/probes.js` | `deployedInfo` normaliza uptime, memoria, uso y consultas lentas desde `/health`. |
| `M` | `apps/control-tower/lib/modules.js` | El resumen de módulos se redacta en lenguaje operativo (`en objetivo` / `requieren atencion` / `sin dato`). |
| `M` | `apps/control-tower/lib/alerts.js` | El título de alerta pasa de `degradado` a `requiere atención`. |
| `M` | `apps/control-tower/lib/diagnostics.js` | La explicación funcional del estado `web/degraded` deja de decir `se degrada`. |
| `M` | `apps/control-tower/server.js` | Adjunta `recommendations` al snapshot, al `/api/tenants` y a `/api/tenants/:tenantId/modules`; el 404 y el 409 devuelven su acción; `redactEnv` sigue saneando la evidencia. |
| `M` | `apps/control-tower/public/index.html` | Monitor consolidado: título, teselas `#companySummary`, selector `#companySelect` con botón **Actualizar**, panel `#companyPanel` con `#companyKpis` y leyenda `#statusLegend`. |
| `M` | `apps/control-tower/public/app.js` | Teselas consolidadas por ambiente, selector de empresa, panel por empresa con 6 KPI, listas de acciones con responsable y comando, leyenda de estados, filas de memoria/uso/uptime en Rendimiento, deselección de empresa al cambiar de ambiente y purga del vocabulario `degrade`. |
| `M` | `apps/control-tower/public/styles.css` | Estilos de leyenda, selector, teselas consolidadas, listas de acción por prioridad y nota de rendimiento; adaptables al tema claro/oscuro y al layout móvil. |
| `M` | `apps/control-tower/package.json` | Versión `1.2.0` → `1.3.0`. |
| `M` | `apps/control-tower/test/environments.test.js` | El stub de `/health` publica la telemetría de proceso y se contrasta normalizada. |
| `M` | `apps/control-tower/test/server.test.js` | snapshot con `recommendations` válidas y acción con responsable en la empresa bloqueada. |
| `M` | `apps/control-tower/test/modules.test.js` | El detalle del resumen se afirma sin jerga y con la redacción operativa nueva. |
| `M` | `apps/control-tower/README.md` | Documenta el monitor consolidado, el selector de empresa, las acciones de intervención, la telemetría de `/health` y la leyenda de estados. |
| `A` | `scripts/certifications/apex-control-tower-consolidado-local.js` | Certificación E2E con API rica (telemetría real), API con build anterior al módulo, Chrome por CDP, 3 capturas y evidencia JSON saneada. |
| `M` | `scripts/certifications/apex-control-tower-local.js` | Los contadores de `.perf-stat` se afirman con umbral y se agrega `browser_performance_runtime_telemetry`. |
| `M` | `package.json` | Script `certify:control-tower:consolidado`. |
| `A` | `docs/briefs/2026-11-03-torre-consolidado-empresas.md` | Este brief. |
| `A` | `docs/qa/evidence/torre-consolidado-empresas-20261103/certification.json` | Síntesis de 42 verificaciones, ambiente, commit y `console_errors`. |
| `A` | `docs/qa/evidence/torre-consolidado-empresas-20261103/snapshot-ambientes.json` | Snapshot de los tres ambientes con `recommendations`, sin tokens. |
| `A` | `docs/qa/evidence/torre-consolidado-empresas-20261103/empresa-tenant-demo.json` | Lectura por empresa con KPI y acciones, sin tokens. |
| `A` | `docs/qa/evidence/torre-consolidado-empresas-20261103/lectura-viva-20261103.json` | Lectura real de `/api/status` en los tres ambientes (salud, commit desplegado, memoria/uso del API, empresas, p95 y acciones con responsable), comprobada contra los valores de `.env.local` para asegurar que no sale ningún secreto. |
| `A` | `docs/qa/evidence/torre-consolidado-empresas-20261103/01-monitor-consolidado-empresa.png` | Captura del consolidado con empresa seleccionada. |
| `A` | `docs/qa/evidence/torre-consolidado-empresas-20261103/02-producto-bloqueado-con-acciones.png` | Captura de PROD bloqueado con la acción y el build responsable. |
| `A` | `docs/qa/evidence/torre-consolidado-empresas-20261103/03-vista-detalle-consolidado.png` | Captura de Detalle con memoria y uso del API. |
| `M` | `docs/qa/evidence/apex-control-tower-f1/certification.json` | Re-ejecución de la gate fase uno con telemetría de proceso. |
| `M` | `docs/qa/evidence/apex-control-tower-f1/telegram-outbox.json` | Salida del arnés re-ejecutado. |
| `M` | `docs/qa/evidence/apex-control-tower-f1/tower-overview.png` | Captura re-ejecutada. |
| `M` | `docs/qa/evidence/apex-control-tower-f1/tower-env-main.png` | Captura re-ejecutada. |
| `M` | `docs/qa/evidence/apex-control-tower-f1/tower-api-down.png` | Captura re-ejecutada. |
| `M` | `.qoder/skills/apexos-backend/SKILL.md` | Regla 19 de telemetría de proceso en `/health`; `2.3.0` → `2.4.0`. |
| `M` | `.qoder/skills/apexos-performance/SKILL.md` | Regla 15 de consumo y uso medidos; reglas renumeradas; `2.4.0` → `2.5.0`. |
| `M` | `.qoder/skills/apexos-seguridad/SKILL.md` | Regla 17 de telemetría agregada sin fuga y evidencia saneada; renumeración; `2.4.0` → `2.5.0`. |
| `M` | `.qoder/skills/apexos-qa/SKILL.md` | Regla 21 de certificación del consolidado en vivo; renumeración; `2.5.0` → `2.6.0`. |
| `M` | `.qoder/skills/equipo-apexos/SKILL.md` | Regla 16 de estado sin explicación no es entrega; renumeración; `2.3.0` → `2.4.0`. |
| `M` | `.qoder/skills/apexos-brief/SKILL.md` | Regla 19 de brief con cifras nombradas; renumeración; `2.5.0` → `2.6.0`. |
| `M` | `agents/registry.json` | Nuevos controles declarados (las versiones y `sha256` las fija `npm run agents:sync`). |
| `M` | `agents/CHANGELOG.md` | Entrada de la intervención. |
| `M` | `agents/<agente>/SKILL.md` (6 espejos) | Espejos regenerados por `npm run agents:sync`. |

### Módulos (`change_intent.modules`)

- `control-tower`
- `api`
- `agents`
- `qa-evidence`

### Borrados autorizados (`allowed_deletions`)

- ninguno

## 3. Fuera de alcance

- `docs/design/APEXOS_CONTROL_PLANE.md`: documento de diseño del propietario, sin seguimiento y sin publicar; no se lee como contrato ni se modifica.
- Promoción a `develop`/`main`, despliegue en Railway/Vercel/Supabase, cambio de infraestructura o de secretos. La conexión en vivo de QA y PROD depende de esas autorizaciones, no de este cambio.
- `apps/web/**`: ninguna pantalla de negocio se toca.
- Esquema y migraciones: `/health` y `/api/v1/apex-control/*` no requieren columnas nuevas.
- Escritura de datos por la torre: sigue siendo de solo lectura.

## 4. Restricciones

- Rama: solo `desarrollo`. Push permitido únicamente a `origin/desarrollo` al cierre (sección 11). Prohibido `develop`, `main`, force push, merge, deploy, migración remota y cambios en Railway/Supabase sin autorización explícita.
- La torre no escribe ni muta nada; los comandos de las acciones son sugerencias que el agente dueño ejecuta con su propia autorización.
- `/health` solo agrega totales del proceso. Rutas, identificadores de request, tenants, usuarios, correos y payloads siguen prohibidos en esa superficie y en la evidencia.
- Los tokens (`TOWER_UI_TOKEN`, `APEX_CONTROL_TOKEN`, JWT por ambiente, `RAILWAY_TOKEN`, `VERCEL_TOKEN`, `SUPABASE_ACCESS_TOKEN`) viven solo en `apps/control-tower/.env.local`, gitignored: no se imprimen, no se versionan, no entran en logs, snapshots, JSON ni PNG de evidencia.
- La lectura entre empresas conserva permiso explícito `apex-control:read_all_tenants`, guarda `APEX_CONTROL_CROSS_TENANT` y allowlist; cambiar de ambiente deselecciona la empresa para no releer un tenant de otro ambiente.
- Sin secretos ni credenciales en el brief ni en el diff.

## 5. Criterios de aceptación

1. `npm run control:test` → 81/81 en verde, incluidas las 13 pruebas del motor de acciones.
2. `node --test apps/api/test/metrics-runtime.test.js apps/api/test/apex-control-*.test.js` → 31/31 en verde.
3. `curl http://127.0.0.1:3000/health` → respuesta `200` con `uptime_seconds`, `memory_mb.{rss,heap_used,heap_total,external}` y `usage.{requests_total,by_status,slow_queries_total}`.
4. `npm run certify:control-tower:consolidado` → `Certificacion passed: 42/42` con 3 PNG y evidencia JSON en `docs/qa/evidence/torre-consolidado-empresas-20261103/`; ninguna verificación en fallo y `console_errors` vacío.
5. `npm run certify:control-tower:local` → gate fase uno sigue en verde (`38/38`) con la telemetría de proceso visible en **Detalle → Rendimiento**.
6. En el navegador, con la torre abierta: el selector **Empresa** se llena con las empresas de la lectura vigente del ambiente activo; al elegir una, el panel muestra estado operativo, carga de datos, actividad, memoria del API, uso del API y p95 con números que coinciden con `/health` y con `/api/v1/apex-control/*`.
7. En un ambiente cuyo build no trae `apex-control`, el panel nombra el `commit` desplegado, deja el selector vacío y no inventa empresas; la única acción visible es desplegar el build, con su responsable.
8. Ninguna palabra visible coincide con `degrad*`; la leyenda bajo las pestañas de ambiente explica **Óptimo / En riesgo / Requiere atención / Caído / Sin dato**.
9. `npm run agents:sync && npm run agents:check && npm run agents:preflight && npm run agents:coverage -- --paths "<inventario exacto>"` → los cuatro en verde.

## 6. Evidencia y certificación exigida

- Pruebas: `apps/control-tower/test/*.test.js` (81) y `apps/api/test/metrics-runtime.test.js` + `apps/api/test/apex-control-*.test.js` (31).
- Certificación: `npm run certify:control-tower:consolidado` (`scripts/certifications/apex-control-tower-consolidado-local.js`) con evidencia en `docs/qa/evidence/torre-consolidado-empresas-20261103/`; regresión `npm run certify:control-tower:local` en `docs/qa/evidence/apex-control-tower-f1/`.
- `certification_status` esperado: `local_passed_qa_pending`.
- La certificación del consolidado usa dos APIs de prueba en `127.0.0.1` (puertos efímeros): una publica la telemetría de proceso y las rutas `apex-control`; la otra imita el build desplegado en QA/PROD (`/health` con `commit`, 404 en `apex-control`). No toca bases de datos ni credenciales reales.
- Lectura en vivo adicional: `docs/qa/evidence/torre-consolidado-empresas-20261103/lectura-viva-20261103.json`, tomada del panel real contra la API local y los despliegues de QA (`a505e97f9622`) y PROD (`938fc2b6f42c`), con 200 empresas leídas en `local`, memoria y peticiones reales del proceso y las acciones con su responsable. Se verificó que ninguno de los valores de `.env.local` aparece en el archivo.

## 7. Capacidades protegidas

- `Lectura por empresa con la puerta entre tenants` — `ruta_empresa_ok`, `ruta_empresa_bloqueada_con_accion`, `empresa_inexistente_no_se_inventa`, `ruta_empresa_exige_token` en la certificación nueva y `tenant route` en `test/server.test.js`.
- `Aislamiento por ambiente` — el selector se reconstruye al cambiar de rama y la empresa abierta se deselecciona; `navegador_producico_sin_empresas_inventadas` lo prueba.
- `Telemetría sin fuga de datos personales` — `health_expone_runtime`, `snapshot_no_filtra_el_token_de_la_torre` y `redactEnv` sobre la evidencia.
- `Vigilancia sin mutaciones` — la certificación solo lee; el bridge y Telegram conservan sus gates de la fase uno.
- `Compartimentos del bridge y de la fábrica de trabajo` — regresión `certify:control-tower:local` (38 verificaciones).

## 8. Riesgos y rollback

- Riesgo: `/health` anónimo ahora publica consumos del proceso → Mitigación: solo agregados del propio proceso, sin rutas, tenants ni identificadores; prueba explícita de que no hay datos personales y gate de seguridad en la revisión. → Rollback: `git revert` del commit de código; la torre simply vuelve a declarar el dato como no medido.
- Riesgo: el motor de acciones sugiere comandos y puede leerse como autorización → Mitigación: cada acción nombra el agente responsable y la sección 4 deja explícito que nada se ejecuta sin autorización independiente.
- Riesgo: renumerar reglas y reescribir textos visibles rompe arneses históricos → Mitigación: las certificaciones afirman umbrales (`>=`) y el contrato de estado (`degraded`) no cambia; la gate fase uno se re-ejecutó en verde.
- Riesgo: las teselas de memoria y uso dependen de un build desplegado que aún no publica esos campos en QA/PROD → Mitigación: la torre muestra `runtimeMissing` en vez de heredar cifras de otro ambiente, y el bloqueo nombra el commit.

## 9. Supuestos y preguntas abiertas

- Supuesto: la telemetría de proceso se reinicia con cada arranque del API; es contadores del proceso actual, no historia acumulada. La tendencia sigue viviendo en `/metrics`.
- Supuesto: la lectura consolidada por empresa es agregados (`_count`, sesiones, última actividad); no se exportan filas de cliente.
- Pregunta (no altera este alcance): ¿se autoriza promover y desplegar en QA y PROD un build que contenga `apex-control` y la telemetría de `/health`, y configurar `ENV_DEVELOP_APEX_TOKEN`/`ENV_MAIN_APEX_TOKEN`? Sin eso la conexión en vivo de producción es imposible.
- Pregunta: ¿se entregan `SUPABASE_ACCESS_TOKEN` y `VERCEL_TOKEN` y se corrige el `RAILWAY_TOKEN` (hoy responde `Not Authorized`)?

## 10. Autorizaciones requeridas

- [ ] **Residencia declarada (decisión del propietario, 2026-11-03)**: `apps/control-tower/**` repose y se ejecute **solo en `desarrollo`**. No se promueve a `develop` ni a `main`, no se despliega y sus certificaciones no alimentan manifiestos de promoción. Registrado en `docs/project/flujo-ramas-y-ambientes.md` y en `apps/control-tower/README.md`.
- [ ] Promoción `desarrollo -> develop` con su manifiesto pre-QA y `develop -> main` con su manifiesto QA **solo del API** (`apps/api/src/modules/apex-control/**` y la telemetría de `/health`): es la otra mitad de la conexión, sin ella la torre no puede leer QA ni PROD.
- [ ] Despliegue en Railway (API) y Vercel (web) de un build que incluya `apex-control` y la telemetría de `/health` en QA y PROD.
- [ ] JWT por ambiente en `apps/control-tower/.env.local`: `ENV_DEVELOP_APEX_TOKEN` y `ENV_MAIN_APEX_TOKEN`, con el permiso `apex-control:read_all_tenants` si se quiere el consolidado entre empresas.
- [ ] `APEX_CONTROL_CROSS_TENANT` (y su allowlist) en el ambiente que deba exponer el consolidado de empresas.
- [ ] Tokens cloud: `SUPABASE_ACCESS_TOKEN`, `VERCEL_TOKEN` y un `RAILWAY_TOKEN` válido.
- [ ] Aplicar en la nube las migraciones pendientes declaradas en intervenciones anteriores (fuera de este alcance).

## 11. Documentación, agentes y publicación (obligatoria)

- **Preflight de agentes**: `npm run agents:preflight -- --paths "apps/api,apps/control-tower,scripts/certifications,docs/qa,docs/briefs,agents,.qoder/skills"` → `Veredicto: OK_CON_ADVERTENCIAS`; rutas sin agente asignado resueltas con `equipo-apexos`.
- **Agentes consultados**: `apexos-backend`, `apexos-performance`, `apexos-seguridad`, `apexos-qa`, `equipo-apexos`, `apexos-brief` (ruteo por `apps/api/src/**`, `apps/control-tower/**`, `scripts/certifications/**`, `docs/qa/**`, `docs/briefs/**`).
- **Documentación a actualizar**: `docs/briefs/2026-11-03-torre-consolidado-empresas.md`, `apps/control-tower/README.md`, `agents/CHANGELOG.md`, `docs/qa/evidence/torre-consolidado-empresas-20261103/`.
- **Agentes a actualizar**:
  - `apexos-backend` `2.3.0` → `2.4.0`; control nuevo `telemetria-proceso-health`.
  - `apexos-performance` `2.4.0` → `2.5.0`; control nuevo `consumo-uso-api-medido`.
  - `apexos-seguridad` `2.4.0` → `2.5.0`; control nuevo `telemetria-agregada-sin-fuga`.
  - `apexos-qa` `2.5.0` → `2.6.0`; control nuevo `certificacion-consolidado-vivo`.
  - `equipo-apexos` `2.3.0` → `2.4.0`; control nuevo `accion-sin-jerga`.
  - `apexos-brief` `2.5.0` → `2.6.0`; control nuevo `brief-cifras-nombradas`.
- **Registro**: `agents/registry.json` actualizado (`version`, `updated_at`, `sha256`) y entrada en `agents/CHANGELOG.md`.
- **Cobertura de contexto**: `npm run agents:coverage -- --paths "<inventario exacto>"`, con cada agente dueño bumppeado y mencionado en la sección más reciente de `agents/CHANGELOG.md`.
- **Secuencia de cierre**: `npm run agents:sync` → `npm run agents:check` → `npm run agents:preflight` → `npm run agents:coverage` → pruebas de la sección 5 → commit de código y documentación → re-ejecución de las dos certificaciones → commit de evidencia → `git push origin desarrollo`.
- **Publicación obligatoria**: `git push origin desarrollo` (rama `desarrollo`, pruebas verdes, sin secretos ni artefactos locales). No cubre `develop`, `main`, force push, merges, migraciones remotas ni infraestructura.
- [x] Preflight sin `INTEGRAR_REMOTO` ni `CONFLICTO`
- [ ] Cobertura de contexto en verde (`agents:coverage`)
- [ ] Sin secretos, credenciales ni artefactos locales en el diff
- [ ] Documentación y agentes actualizados en el mismo commit
