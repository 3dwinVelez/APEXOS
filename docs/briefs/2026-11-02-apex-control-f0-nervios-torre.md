# Brief — APEX Control F0: sistema nervioso y Control Tower

- **ID**: `2026-11-02-apex-control-f0-nervios-torre`
- **Fecha**: `2026-11-02`
- **Rama activa**: `desarrollo`
- **Prompt crudo**: "vamos a construir un apex control total tipo jarvis, con las herramientas que tengamos a la mano el cual debe poder vigilar el sistema en vivo, controlar un flujo de trabajo con los agentes de trabajo que ya creamos para apexos, debe existir una fabrica de desarrollo y control de calidad, niveles de autorizacion, yu chat en vivo con apex control, tambien debemos garantizar poder diseñar algun panel de control ndonde pueda ver constantemente el estado de salud de mi sistema, apex no debe esperar que yo le de instrucciones, debe operar autonamente cuando detecte algo informar, pasar reportes etc.. ayudame a construir el mejor diseño para darle vida a apex" / decisión de alcance: "F0: nervios + Torre" y "Qoder Team / qc-cli" como runtime futuro de agentes.

## 1. Objetivo

Construir la capa de percepción y la Torre de Control de APEX Control: un colector de salud que muestrea API, base de datos, Redis, colas, crons, Brain, almacenamiento y correo cada 15 segundos; un bus de eventos con deduplicación; incidentes preliminares automáticos; notificaciones in-app; briefing diario por correo; y la pantalla `/dashboard/apex-control` con vista de resumen y flujo en vivo. Al terminar F0, una caída de Redis, Brain o un pico de errores 5xx debe verse en el panel y generar un incidente en menos de 30 segundos, sin que el usuario pregunte nada.

## 2. Alcance exacto

| Estado | Archivo | Qué cambia |
|---|---|---|
| `A` | `apps/api/src/modules/apex-control/events.js` | Emisión normalizada de eventos, `fingerprint`, deduplicación y correlación |
| `A` | `apps/api/src/modules/apex-control/probes.js` | Sondas con timeout individual para API, DB, Redis, colas, crons, Brain, MinIO, correo y WebSocket |
| `A` | `apps/api/src/modules/apex-control/pulse.js` | Ciclo de muestreo, clasificación `ok/degraded/down/unknown`, apertura/actualización/resolución de incidentes y broadcast |
| `A` | `apps/api/src/modules/apex-control/service.js` | Consultas de estado, eventos, incidentes, notificaciones y reportes |
| `A` | `apps/api/src/modules/apex-control/report.js` | Briefing diario por `emailQueue`, resumen de 24 h y limpieza por retención |
| `A` | `apps/api/src/modules/apex-control/routes.js` | Endpoints REST y WebSocket `/apex-control/live`; simulación de fallo solo local |
| `A` | `apps/api/test/apex-control-pulse.test.js` | Pruebas de clasificación, fingerprint, deduplicación y transiciones de incidente con sondas inyectadas |
| `A` | `apps/api/test/apex-control-contract.test.js` | Contrato de endpoints, autenticación, RBAC y aislamiento de notificaciones |
| `A` | `apps/api/prisma/migrations/20261102120000_apex_control_foundation/migration.sql` | Tablas `ApexComponent`, `ApexHealthSample`, `ApexEvent`, `ApexIncident`, `ApexNotification`, `ApexReportRun` e índices |
| `A` | `scripts/certifications/apex-control-local.js` | Certificación local: login, panel, caída real de Redis y Brain, 5xx simulado, notificación, incidente y reporte |
| `A` | `apps/web/app/dashboard/apex-control/page.tsx` | Pantalla con pestañas Resumen y En vivo; polling de respaldo y WebSocket |
| `A` | `apps/web/components/apex-control/OverviewPanel.tsx` | Semáforo global, score, grid de componentes, incidentes activos y último reporte |
| `A` | `apps/web/components/apex-control/LiveFeed.tsx` | Stream de eventos y estados con filtros y marcas de tiempo |
| `A` | `apps/web/components/apex-control/IncidentList.tsx` | Lista y detalle preliminar de incidentes con acción de acuse |
| `A` | `apps/web/lib/apexControl.ts` | Tipos, cliente REST y conector WebSocket autenticado |
| `A` | `apps/web/test/apex-control-panel.test.mjs` | Verificación de registro del módulo, ruta, contratos y estados vacíos |
| `M` | `apps/api/prisma/schema.prisma` | Seis modelos `Apex*` con índices de consulta y retención |
| `M` | `apps/api/src/core/prisma.js` | `ApexEvent`, `ApexIncident`, `ApexNotification` y `ApexReportRun` en `TENANT_MODELS`; `ApexEvent` y `ApexHealthSample` en `PHYSICAL_DELETE_ALLOWED` para retención |
| `M` | `apps/api/src/middleware/rbac.js` | Código de módulo `apex-control` con alias de licencia `administracion_apex` para F0 |
| `M` | `apps/api/server.js` | Registro de rutas, WebSocket, arranque del pulso y emisión de eventos 5xx |
| `M` | `apps/api/src/fabric/crons.js` | `startApexControl()`: pulso cada 15 s, briefing diario 07:00 America/Bogota y limpieza diaria |
| `M` | `apps/api/src/fabric/wsManager.js` | `broadcastAll` y `stats` para el canal de infraestructura |
| `M` | `apps/web/lib/modules.ts` | Módulo `M-31` / `apex-control`, área `Plataforma`, icono `Radar` |
| `M` | `apps/web/lib/moduleAccess.ts` | Mapeo de licencia, permisos, claves legacy y visibilidad de platform admin |
| `M` | `.env.example` | `APEX_CONTROL_ENABLED`, intervalo, hora de reporte y días de retención |
| `M` | `package.json` | Script `certify:apex-control:local` |

### Módulos (`change_intent.modules`)

- `apex-control`
- `platform`

### Borrados autorizados (`allowed_deletions`)

- ninguno

## 3. Fuera de alcance

- Chat conversacional con IA y herramientas de escritura (F1).
- Fábrica de agentes, `WorkItem`, adaptador Qoder Team/qc-cli y compuertas de promoción (F2).
- Acciones de remediación autónoma: reiniciar workers, limpiar colas, desplegar o promover (F1/F3).
- Integración de un proveedor LLM y claves de modelo: no se toca en F0.
- Migraciones en Supabase/Railway, despliegues y cambios de infraestructura: requieren autorización aparte.
- Nuevas dependencias npm: F0 usa `prom-client`, `ioredis`, `bullmq`, `node-cron`, `minio` y `nodemailer` ya instalados.
- Datos de negocio por tenant en el estado global: F0 solo expone salud de infraestructura; el pulso gerencial sigue en `apex-heart`.
- Licencia dedicada `M-31` en el aprovisionamiento de planes: F0 reutiliza `administracion_apex`.

## 4. Restricciones

- Rama: solo `desarrollo`. Prohibido push, merge, deploy, migración remota, cambios en Railway/Supabase o creación de ramas sin autorización explícita.
- Aislamiento multi-tenant: las notificaciones y reportes se consultan con `tenant_id` explícito; el estado de infraestructura es global y no contiene datos de negocio.
- RBAC/ABAC intactos: `read` para consultar, `operate` para acusar incidentes; el bypass administrativo existente no elimina la verificación de licencia del módulo.
- Sin secretos ni credenciales en el brief, el diff, los eventos o los transcripts; usar `redactSensitive`.
- El pulso corre en segundo plano y nunca en la ruta de una petición de usuario.
- Sin LLM, sin acciones de escritura sobre infraestructura y sin auto-remediación en F0.

## 5. Criterios de aceptación

1. `npm run prisma:validate` → esquema válido; `npx prisma migrate dev --name apex_control_foundation` aplica en local y `\dt apex_*` lista las seis tablas.
2. `node --test apps/api/test/apex-control-pulse.test.js apps/api/test/apex-control-contract.test.js` → todas las pruebas en verde, incluyendo deduplicación y transiciones `down → resolved`.
3. Con sesión `APEX_ADMIN`, `/dashboard/apex-control` muestra el semáforo global, al menos 9 componentes y la pestaña En vivo sin errores de consola; el módulo aparece en la barra lateral dentro de "Control y plataforma".
4. `docker compose -f infra/docker-compose.yml stop redis` → en ≤30 s el componente Redis pasa a `down`, el estado global a `degraded`, se abre un incidente y llega un evento por WebSocket; `docker compose -f infra/docker-compose.yml start redis` → se resuelve automáticamente en ≤30 s.
5. `docker compose -f infra/docker-compose.yml stop brain` → mismo comportamiento para Brain; al reiniciar, resolución automática.
6. `POST /api/v1/apex-control/_simulate/failure` con `APEX_CONTROL_SIMULATION_ENABLED=true` y `APP_ENV=local` → responde 500, registra un `ApexEvent` de severidad `error` y aparece en el stream; fuera de local el endpoint responde 404.
7. `POST /api/v1/apex-control/incidents/:id/acknowledge` con permiso `operate` → incidente pasa a `acknowledged`; con un rol sin permiso → 403 `PERMISO_DENEGADO`; sin token → 401.
8. Un usuario del tenant B no ve notificaciones del tenant A; una consulta de estado global no devuelve nombres, montos ni documentos de ningún tenant.
9. `npm run certify:apex-control:local` → genera `docs/qa/evidence/apex-control-f0/certification.json`, captura de navegador del panel y resumen del briefing diario; termina con código 0 solo si todos los pasos pasan.
10. `npm run qa:deterministic-validation` → sin regresiones en los módulos existentes.

## 6. Evidencia y certificación exigida

- Pruebas: `apps/api/test/apex-control-pulse.test.js`, `apps/api/test/apex-control-contract.test.js` y `apps/web/test/apex-control-panel.test.mjs`.
- Certificación: `node scripts/certifications/apex-control-local.js` con evidencia en `docs/qa/evidence/apex-control-f0/` (`certification.json`, `browser-overview.png`, `browser-degraded.png`, `daily-report.json`).
- La certificación opera solo con `APP_ENV=local`, detiene y reinicia contenedores locales de Redis y Brain en un bloque `finally`, y rechaza ejecutarse contra QA o producción.
- `certification_status` esperado: `local_passed_qa_pending`.
- La evidencia de navegador debe incluir: carga inicial, Redis caído con incidente visible, recuperación automática y acuse de incidente.
- Resultado local 2026-11-02: `certification.json` con `local_passed_qa_pending` (17/17 checks). `qa:deterministic-validation` sobre una base local desechable: todos los checks de API y frontend en verde; único fallo `supabase - Configuracion base` porque `.env` local no trae claves públicas de Supabase. La base `apexos` existente no se modificó fuera de F0.

## 7. Capacidades protegidas

- Autenticación y sesión — `/apex-control/*` exige JWT válido; se certifican 401 sin token y 403 sin permiso.
- Aislamiento multi-tenant — notificaciones y reportes filtrados por `tenant_id`; se certifica con usuarios de dos tenants.
- RBAC/ABAC — `read` y `operate` separados; el rol administrativo no omite la licencia del módulo.
- `/health` y `/metrics` — contratos sin cambios; se ejecuta regresión de ambos endpoints.
- WebSocket existente — `/brain/live` y `/collaboration/live` siguen funcionando; el canal nuevo es independiente y autenticado.
- Auditoría — acuses y acciones quedan en `AuditLog` además de `ApexIncident`.
- Rendimiento — el pulso no se ejecuta en la ruta de petición; `Server-Timing` y presupuestos de performance sin cambios.

## 8. Riesgos y rollback

- Riesgo: pulso duplicado si hay más de una instancia del API → Mitigación: F0 asume una instancia; el upsert de componentes y el fingerprint evitan duplicar muestras; F1 agrega elección de líder → Rollback: `git revert <commit>` y detener `startApexControl`.
- Riesgo: Redis caído afecta también colas y pub/sub → Mitigación: el pulso corre en proceso y el broadcast local sigue funcionando; el reporte registra `status=queue_unavailable` si no puede encolar → Rollback: revertir el commit.
- Riesgo: falsos positivos por despliegues o reinicios → Mitigación: caída se declara con una muestra fallida y recuperación exige dos muestras `ok` consecutivas; cooldown por fingerprint → Rollback: deshabilitar `APEX_CONTROL_ENABLED`.
- Riesgo: volumen de eventos y muestras → Mitigación: retención de 30 días para eventos y 7 días para muestras, con limpieza diaria → Rollback: aumentar retención o deshabilitar limpieza por env.
- Riesgo: endpoint de simulación expuesto → Mitigación: responde 404 salvo `APP_ENV=local` y flag explícito, además de permiso `operate` → Rollback: eliminar la ruta en el mismo revert.

## 9. Supuestos y preguntas abiertas

- Supuesto: F0 opera con una sola instancia del API; la elección de líder y el despliegue multi-instancia son F1.
- Supuesto: la licencia del módulo se reutiliza de `administracion_apex`; la licencia dedicada `M-31` se aprovisiona en F1.
- Supuesto: el estado de infraestructura es global y visible para administradores; las notificaciones y reportes son por tenant.
- Supuesto: el briefing diario se envía por correo a propietarios/administradores y también queda visible en la Torre; no se envía a clientes.
- Supuesto: MinIO y correo se reportan como `unknown` cuando no están configurados, nunca como `down`.
- Pregunta abierta: ¿el briefing debe incluir métricas de negocio de `apex-heart` o solo salud técnica en F0? Se asume solo salud técnica; el enlace a `apex-heart` queda visible.

## 10. Autorizaciones requeridas

- [x] Aplicar la migración `20261102120000_apex_control_foundation` en la base local. Autorizado el 2026-11-02. La base local tenía historial divergente previo (`sales_invoicing_cxc` fallida desde 2026-09-07), así que el SQL de F0 se ejecutó de forma aditiva y se registró con `prisma migrate resolve --applied`; no se reparó ni borró el historial ajeno.
- [x] Ejecutar la certificación local con Docker (`redis` y `brain`) y captura de navegador. Autorizado el 2026-11-02. Resultado `local_passed_qa_pending` con 17/17 checks en `docs/qa/evidence/apex-control-f0/`.
- [ ] Push, promoción a `develop`, despliegue o migración remota: no solicitados en este brief.
- [ ] Habilitar `APEX_CONTROL_ENABLED` en QA o producción: no solicitado en este brief.

## 11. Contrato técnico mínimo

```text
GET  /api/v1/apex-control/status            → overall, components[], incidents[], generated_at
GET  /api/v1/apex-control/events?limit=100  → eventos recientes
GET  /api/v1/apex-control/incidents?status= → incidentes
POST /api/v1/apex-control/incidents/:id/acknowledge
GET  /api/v1/apex-control/notifications
POST /api/v1/apex-control/notifications/:id/read
GET  /api/v1/apex-control/reports
WS   /apex-control/live                     → { type: "apex-control:snapshot" | "apex-control:event" }
```

- `status` global: `ok | degraded | down | unknown`; score 0–100; estado global `degraded` si algún componente crítico está `down`.
- Componentes mínimos: `api`, `db`, `redis`, `queues`, `crons`, `brain`, `minio`, `mail`, `websocket`.
- `fingerprint` de incidente: `<component_key>:<causa>`; un incidente abierto se actualiza, no se duplica.
- El canal WebSocket autentica con token en el primer mensaje y transmite solo después de validar sesión y tenant.
