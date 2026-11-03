# Brief — APEX Control: multientorno, nube y diagnóstico profundo

- **ID**: `2026-11-02-apex-control-tower-multientorno`
- **Fecha**: `2026-11-02`
- **Rama activa**: `desarrollo`
- **Origen**: evolución de la Torre externa F1. El propietario necesita separar la vigilancia de `main`, `develop` y `local`, ver en vivo Railway, Supabase y Vercel, y entender cada fallo con impacto funcional y detalle técnico, además del rendimiento de la API.

## 1. Objetivo

Extender la Torre externa para que:

1. Filtre el panel por los tres ambientes vigilados: `local` (rama `desarrollo`), `develop` (QA) y `main` (producción).
2. Sondee cada ambiente remoto por su cuenta (API, web y Supabase) sin que un ambiente caído oculte a los demás.
3. Consulte en vivo Railway, Vercel y Supabase cuando existan credenciales, y muestre con claridad qué falta configurar cuando no.
4. Explique cada error en dos capas: impacto funcional de negocio y detalle técnico expandible.
5. Muestre rendimiento de la API por ambiente: p50, p95, promedio, mínimo, máximo, tasa de error y serie temporal.

## 2. Principio de arquitectura

```text
Panel (tabs local | develop | main)
  -> Snapshot agregado de la Torre
       +-> local:  API/web/infra + git (desarrollo)
       +-> develop: API QA, web QA, Supabase QA, Railway/Vercel QA
       +-> main:   API PROD, web PROD, Supabase PROD, Railway/Vercel PROD
  -> Diagnóstico: componente + estado -> impacto funcional + acción + técnico
  -> Rendimiento: tracker en memoria/persistido por ambiente
```

- La Torre sigue siendo un proceso local sin dependencias npm.
- Cada sonda remota tiene timeout propio (`ENV_TIMEOUT_MS`) y es opcional cuando no hay credenciales.
- Las credenciales cloud viven solo en `apps/control-tower/.env.local`.
- La simulación no toca red remota ni APIs cloud; produce chequeos `unknown` opcionales para certificar de forma determinista.

## 3. Alcance exacto

| Estado | Archivo | Qué hace |
|---|---|---|
| `A` | `apps/control-tower/lib/diagnostics.js` | Catálogo funcional por componente y estado; agrega acción y técnico |
| `A` | `apps/control-tower/lib/performance.js` | Tracker de latencia por ambiente con percentiles y persistencia |
| `A` | `apps/control-tower/lib/cloud.js` | Clientes Railway GraphQL, Vercel REST y Supabase Management API |
| `A` | `apps/control-tower/test/environments.test.js` | Config, diagnóstico, rendimiento y sondas remotas |
| `A` | `apps/control-tower/test/cloud.test.js` | Clientes cloud, estados, errores de token y no filtración |
| `A` | `docs/briefs/2026-11-02-apex-control-tower-multientorno.md` | Este brief |
| `M` | `apps/control-tower/lib/config.js` | Ambientes `local/develop/main`, URLs, IDs, timeout y sección cloud |
| `M` | `apps/control-tower/lib/probes.js` | Sondas por ambiente, agregado, métricas y diagnóstico |
| `M` | `apps/control-tower/lib/alerts.js` | Huella y alerta con ambiente, impacto funcional y técnico |
| `M` | `apps/control-tower/server.js` | `/api/environments`, `/api/performance`, rendimiento en snapshot |
| `M` | `apps/control-tower/public/index.html` | Tabs de ambiente, panel de rendimiento y panel cloud |
| `M` | `apps/control-tower/public/styles.css` | Estilos de tabs, detalle técnico, sparkline, cloud y rama seleccionada |
| `M` | `apps/control-tower/public/app.js` | Filtro por ambiente, KPIs, rendimiento, cloud y detalle expandible |
| `M` | `apps/control-tower/test/server.test.js` | Contrato de ambientes, rendimiento y alerta remota simulada |
| `M` | `apps/control-tower/test/alerts.test.js` | Alertas independientes por ambiente y campos de diagnóstico |
| `M` | `scripts/certifications/apex-control-tower-local.js` | Certificación de tabs, cloud, rendimiento y detalle técnico |
| `M` | `apps/control-tower/README.md` | Operación multientorno y credenciales cloud |
| `M` | `apps/control-tower/.env.example` | Variables `ENV_*`, Railway, Vercel y Supabase |

### Borrados autorizados

- ninguno.

## 4. Fuera de alcance

- Push, merge, deploy, migraciones remotas o cambios en Railway/Supabase/Vercel.
- Escritura o remediación automática en la nube.
- Exponer la Torre fuera de loopback.
- Guardar tokens en el repositorio, evidencia, eventos o mensajes.
- Validar con credenciales reales en la certificación: los clientes se prueban con fetch inyectado y la certificación usa simulación.

## 5. Restricciones

- Solo `desarrollo`; la Torre no hace push, merge ni deploy.
- Sin secretos en código, briefs, eventos, logs o evidencia.
- Los chequeos remotos y cloud son opcionales cuando faltan credenciales; nunca falsean un `ok`.
- Un ambiente desactivado se reporta como `unknown` con causa de configuración.
- Toda la UI escapa datos no confiables antes de insertarlos en el DOM.

## 6. Criterios de aceptación

1. El panel muestra tabs `Local`, `Develop · QA` y `Main · Producción`; al cambiar de tab se filtran KPIs, servicios, alertas, rendimiento, cloud y rama seleccionada.
2. Cada ambiente tiene resumen propio (`overall`, `summary`) y no se contamina con el estado de los otros.
3. La pestaña de un ambiente remoto muestra tarjetas de Railway, Supabase y Vercel con estado, proyecto, servicios/deployments o la instrucción exacta de configuración faltante.
4. Cada sonda muestra estado, latencia, detalle, impacto funcional, acción sugerida y un bloque de detalle técnico expandible.
5. Cada alerta conserva `environment`, `functional`, `action` y `technical`; las huellas distinguen ambientes.
6. El panel de rendimiento muestra p50, p95, promedio, mínimo, máximo, errores, tasa de error, muestras y serie.
7. `GET /api/environments` y `GET /api/performance` responden con los tres ambientes.
8. `npm run control:test` pasa completo (41 pruebas).
9. `npm run certify:control-tower:local` termina en 0 con 37 verificaciones y evidencia actualizada.
10. Ningún token aparece en `safeConfig`, respuestas, eventos o evidencia.

## 7. Evidencia

- Pruebas: `npm run control:test` — 41/41.
- Certificación: `npm run certify:control-tower:local` — 37/37.
- Evidencia: `docs/qa/evidence/apex-control-tower-f1/certification.json`, `tower-overview.png`, `tower-env-main.png`, `tower-api-down.png`, `telegram-outbox.json`.
- `certification_status` esperado: `local_passed_qa_pending`.

## 8. Capacidades protegidas

- Gobernanza de ramas: la Torre solo lee git; no promueve ni publica.
- Secretos: tokens cloud y Telegram solo en `.env.local`; `safeConfig` no los expone.
- Aislamiento: la Torre es local y no consulta datos de negocio por tenant.
- API existente: `/health` y `/apex-control/status` no cambian de contrato.
- Operación sin nube: si faltan tokens, la vigilancia de API/web/Supabase por URL sigue funcionando.

## 9. Riesgos y rollback

- Riesgo: latencia del panel por consultas cloud. Mitigación: timeouts propios, ejecución en paralelo y degradación a `unknown`.
- Riesgo: token cloud inválido. Mitigación: estado `degraded`, detalle explícito y sin bloquear otras sondas.
- Riesgo: alertas duplicadas entre ambientes. Mitigación: huella `${environment}:${id}:${status}` y sufijo de ambiente en los IDs remotos.
- Riesgo: falsos `ok` por falta de credenciales. Mitigación: chequeo `unknown` opcional y mensaje de configuración.
- Rollback: revertir los archivos de esta intervención; la Torre vuelve a vigilar solo `local` sin tocar la API ni la base de datos.

## 10. Supuestos

- Node 22+ y conectividad saliente a Railway, Vercel y Supabase cuando se configuren credenciales.
- Las URLs públicas de QA y PROD son estables; pueden sobrescribirse con `ENV_*_API_URL` y `ENV_*_WEB_URL`.
- Los tokens cloud se crean con permisos mínimos de lectura.
- La certificación corre en simulación para no depender de la red ni de credenciales reales.
