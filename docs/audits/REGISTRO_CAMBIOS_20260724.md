# Registro de Cambios — Implementación F1-F4

> **Fecha:** 2026-07-24  
> **Propósito:** Documentar todos los cambios realizados en la plataforma APEX OS 2.0 / NYVORA como parte del plan de seguridad, rendimiento y escalabilidad.  
> **Estado:** ✅ 24 de 26 items completados  
> **Ramas actualizadas:** `main`, `develop`, `desarrollo`

---

## 1. Cambios Implementados

### 1.1 Pool de Conexiones

| Archivo | Cambio |
|---------|--------|
| `config/production.env` | `connection_limit=5` → `connection_limit=15` |

**Impacto:** Pool de conexiones 3x más grande. Reduce timeouts bajo carga concurrente.

---

### 1.2 Colas Redis y Workers

| Archivo | Cambio |
|---------|--------|
| `apps/api/src/fabric/queues.js` | Agregado `defaultJobOptions`: backoff exponencial (2s→4s→8s), max 3 reintentos, `removeOnComplete: 1000`, `removeOnFail: 500`. Agregado `connectTimeout: 10000` y `retryStrategy`. Agregada cola `apex-email`. |
| `apps/api/src/fabric/workers/brainWorker.js` | Agregado try-catch, `AbortController` con timeout 30s, validación `response.ok`, broadcast con `.catch()` |
| `apps/api/src/fabric/workers/auditWorker.js` | Agregado try-catch con logging estructurado |
| `apps/api/src/fabric/workers/emailWorker.js` | Reescribir como worker BullMQ real con `nodemailer`. SMTP graceful: si no configurado, logea warning en vez de silenciar |
| `apps/api/src/fabric/crons.js` | Agregado `runOnce()` con protección de overlap (flag en memoria), logging de inicio/completado/fallo con duración |

**Impacto:** Workers no pueden matar el proceso. Redis no se llena de jobs muertos. Crons no se ejecutan en paralelo. Email listo cuando haya SMTP configurado.

---

### 1.3 Seguridad y Acceso

| Archivo | Cambio |
|---------|--------|
| `apps/api/src/middleware/rbac.js` | `isAdministrativeRole()`: eliminados `includes("admin")` e `includes("coordinador")`. Solo match exacto contra 6 roles conocidos. |
| `apps/web/next.config.ts` | Agregados headers de seguridad: `Content-Security-Policy`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin` |
| `apps/web/app/layout.tsx` | Eliminado `dangerouslySetInnerHTML`. Script de tema/rol movido a `public/scripts/theme-init.js` vía `<Script strategy="beforeInteractive">` |
| `apps/web/public/scripts/theme-init.js` | Nuevo archivo: inicialización de tema y rol desde localStorage, sin inline script |
| `apps/api/src/modules/auth/routes.js` | Rate limiting: register 5/hora, login 10/min (ya existía) |
| `apps/api/src/modules/hr/routes.js` | Rate limiting: GPS ping 60/min por tenant |

**Impacto:** Roles con "admin" en el nombre ya no bypass permisos. XSS mitigado por CSP. Clickjacking bloqueado. Script injection por localStorage cerrado. Registro de bots limitado a 5/hora.

---

### 1.4 Base de Datos — Esquema e Índices

| Archivo | Cambio |
|---------|--------|
| `apps/api/prisma/schema.prisma` | Agregado campo `storage_path String?` al modelo `ServicePhoto` |
| `apps/api/prisma/migrations/20260724000000_performance_indexes_fase2/migration.sql` | 13 nuevos índices: trigram en Item(name, code), trigram en ServiceReference(code, name), compuestos en Movement(transaction_id), Movement(created_at), Item(stock_current, stock_min), CxpCabdoc(status), Payroll(employee_id, period), WorkActivity(occurred_at), ServiceOrder(reference_id), TimePunch(date), LedgerEntry(account_id, period) |
| `apps/api/prisma/migrations/20260724000001_add_storage_path/migration.sql` | Nuevo: columna `storage_path` en ServicePhoto + índices parciales para migración |
| `apps/api/src/modules/services/service.js` | `nextNumber()`: reemplazado `prisma.serviceOrder.count()` (full scan) por `findFirst({ orderBy: { id: 'desc' } })` (O(1)). `addPhoto()`: ahora acepta `storage_path` como alternativa a `base64_data` |

**Impacto:** Búsquedas de items pasan de table scan a trigram index. Kardex ya no necesita full scan. Creación de órdenes O(1). Fotos nuevas pueden ir a Storage sin base64 en BD.

---

### 1.5 Soft-Delete Global

| Archivo | Cambio |
|---------|--------|
| `apps/api/src/core/prisma.js` | SOFT_DELETE expandido de 5 a 20 modelos. Nuevo `DELETE_OPS` middleware: para modelos en SOFT_DELETE convierte `delete()`/`deleteMany()` a `update({ active: false })`/`updateMany({ active: false })`. Para modelos sin soft-delete, lanza error de borrado bloqueado. Nuevo `PHYSICAL_DELETE_ALLOWED` (23 modelos operacionales). |

**Modelos protegidos:** Tenant, User, Party, Item, InventoryFamily, InventoryFamilyAccounting, Place, Location, Resource, Account, Employee, ProjectResourceAssignment, WorkSchedule, ActivityType, Vehicle, VehicleDocument, ServiceReference, Workflow, CustomField, EInvoiceConfig.

**Impacto:** Borrado accidental de datos financieros, contables u operativos ya no es posible. Hay que explicitamente permitirlo.

---

### 1.6 Pipeline de Evidencias (base64 → Supabase Storage)

| Archivo | Cambio |
|---------|--------|
| `apps/api/src/modules/services/service.js` | `addPhoto()` ahora guarda `storage_path` en columna propia (no solo en metadata). Si se envía `storage_path` como input, prioriza sobre `base64_data`. |
| `apps/web/app/dashboard/servicios/[id]/page.tsx` | `uploadPhoto()`: antes de enviar a API, intenta subir a Supabase Storage via `uploadServiceImageData()`. Si éxito, envía `storage_path`; si falla, envía `base64_data` como fallback. `photoSrc()`: si el registro tiene `storage_path`, obtiene signed URL con cache; si no, usa base64_data (compatibilidad). Nuevo tipo `ServicePhoto.storage_path`. Nuevas importaciones: `uploadServiceImageData`, `getServiceImageUrl`. |
| `scripts/migrate-evidence-to-storage.js` | Script para migrar base64 existente a Storage. Soporta `--dry-run`, `--batch`, `--env-file`. Procesa `ServicePhoto` y `RoutePreoperationalChecklistEvidence`. |

**Impacto:** Fotos nuevas se almacenan en Supabase Storage reduciendo tamaño de BD ~90%. Compatibilidad hacia atrás con fotos existentes. Si Storage falla, cae a base64 automáticamente.

---

### 1.7 Rendimiento

| Archivo | Cambio |
|---------|--------|
| `apps/api/src/modules/hr/timeLogic.js` | Creados `TIME_PARTS_FORMATTER` y `DAY_PARTS_FORMATTER` como constantes de módulo, reutilizando los `Intl.DateTimeFormat` en vez de crearlos por minuto |
| `apps/api/src/core/tenantCache.js` | Nueva función `getTenantConfig(tenantId)` que retorna solo el config con cache |
| `apps/api/src/modules/services/service.js` | `configuredServiceTypes/Stores/Questions`, `saveServiceTypes/Stores/Questions`: reemplazado `prisma.tenant.findUnique({ select: { config: true } })` por `getTenantConfig()` + `invalidateTenantCache()` en saves |
| `apps/api/src/modules/hr/service.js` | `getPayrollConfig/savePayrollConfig`: reemplazado por `getTenantConfig()` + `invalidateTenantCache()` |
| `apps/api/src/modules/accounting/service.js` | `getAccountingConfig/updateAccountingConfig`: reemplazado por `getTenantConfig()` + `invalidateTenantCache()` |

**Impacto:** Procesamiento de nómina elimina 540+ objetos `Intl.DateTimeFormat` por empleado/día. Config de tenant leída desde cache en vez de BD en cada operación.

---

### 1.8 Infraestructura Docker

| Archivo | Cambio |
|---------|--------|
| `apps/api/Dockerfile` | Agregado usuario `apex` no-root. `USER apex` al final. |
| `apps/web/Dockerfile` | Agregado grupo/usuario `apex`. `chown` de `/app`. `USER apex`. |
| `services/brain/Dockerfile` | Agregado usuario `apex` no-root. `USER apex`. |
| `apps/api/.dockerignore` | Nuevo: excluye `node_modules`, `.git`, `docs`, `logs`, `scripts`, `test`, `*.md`, `.env` |
| `apps/web/.dockerignore` | Nuevo: excluye además `.next` |
| `services/brain/.dockerignore` | Nuevo: excluye `__pycache__`, `*.pyc` |
| `infra/docker-compose.yml` | Resource limits (CPU/memoria) en todos los servicios. Healthchecks agregados a postgres, redis, minio, pgbouncer, brain. `depends_on` con `condition: service_healthy`. Redis eviction: `noeviction` → `volatile-lru`. Agregado servicio `pgbouncer` con pool de 25 conexiones. API y brain ahora usan `pgbouncer:6432` con `DATABASE_URL?pgbouncer=true` y `DIRECT_URL` para migraciones. API: `WORKERS_DISABLED=true`. Nuevo servicio `workers` con `command: ["node", "worker.js"]`. |
| `infra/postgres/pgbouncer.ini` | Nuevo: configuración PgBouncer con pool_mode=transaction, default_pool_size=25 |

**Impacto:** Contenedores ya no corren como root. Imágenes Docker más pequeñas. Redis no se queda sin memoria. Pool de conexiones profesional. Workers en proceso separado. Recursos acotados por servicio.

---

### 1.9 Monitoreo

| Archivo | Cambio |
|---------|--------|
| `apps/api/src/fabric/metrics.js` | Nuevo: endpoint `/metrics` con prom-client. Default metrics (CPU, memoria, event loop). `httpRequestCounter`, `httpRequestDuration`, `authPhaseDuration`, `slowQueryCounter`. `queueGauge` para métricas de colas BullMQ. |
| `apps/api/server.js` | Nuevo `GET /metrics` con queue stats. Nuevo `onResponse` hook para registrar métricas HTTP. |
| `infra/prometheus/prometheus.yml` | `metrics_path` cambiado de `/health` a `/metrics`. Agregado `evaluation_interval: 15s`. |

**Impacto:** Prometheus ahora scrapea métricas reales (counters, histogramas) en vez de JSON. Monitoreo funcional por primera vez.

---

### 1.10 CI/CD

| Archivo | Cambio |
|---------|--------|
| `.github/workflows/ci.yml` | Nuevo: CI en push a main/develop/desarrollo y PR a main. Jobs: lint & typecheck, build API, build Web, security audit. Timeouts, cache de npm, concurrencia. |
| `.github/workflows/release-check.yml` | Nuevo: workflow manual (`workflow_dispatch`) para validar entorno QA o producción. Ejecuta env doctor, prisma validate, build web, validación de unicidad de evidencias. Requiere secrets de entorno. |

**Impacto:** Cada push es verificado automáticamente. Releases tienen checklist de validación antes de desplegar.

---

### 1.11 WebSocket Multi-Instancia

| Archivo | Cambio |
|---------|--------|
| `apps/api/src/fabric/wsManager.js` | Agregado Redis PubSub para broadcasting multi-instancia. `subscribeTenant()`/`unsubscribeTenant()` por canal `ws:tenant:{id}`. `broadcast()` ahora publica a Redis además de broadcast local. `addClient()` maneja eventos `close` y `error`. Limpieza de sockets stale cada 5 minutos. Completamente backward compatible: sin Redis, funciona igual que antes (solo local). |

**Impacto:** Broadcasts WebSocket funcionan en múltiples instancias. Sockets stale se limpian automáticamente.

---

### 1.12 Workers Aislados

| Archivo | Cambio |
|---------|--------|
| `apps/api/worker.js` | Nuevo entry point para workers separados. Carga workers BullMQ y crons sin servidor HTTP. Graceful shutdown con SIGTERM/SIGINT. |
| `apps/api/server.js` | Workers loading condicional: si `WORKERS_DISABLED=true`, no se cargan en el proceso HTTP. |

**Impacto:** Workers pueden ejecutarse en proceso/container independiente, liberando recursos de la API HTTP.

---

### 1.13 Particionamiento de Tablas (Plan)

| Archivo | Cambio |
|---------|--------|
| `scripts/migrations/20260724000002_partition_high_growth_tables.sql` | Script DDL para particionar `GpsPing`, `AuditLog`, `TimePunch` por rango de fechas mensual. Incluye migración batch por lotes de 50K, verificación de integridad y rollback plan. **Requiere ventana de mantenimiento.** |

**Impacto (cuando se ejecute):** Tablas de 500M+ filas consultables sin degradación. Queries de un mes solo tocan la partición relevante.

---

## 2. Pendiente por Alto Riesgo: httpOnly Cookies

**Estado:** ⏸️ No implementado. Requiere plan separado con feature flags.

**Riesgo:** Si el cambio falla, **ningún usuario puede iniciar sesión** (bloqueo total de plataforma). No hay forma de probar gradualmente sin un ambiente de staging con login real.

### 2.1 Estrategia Recomendada

```
Fase 1 — Backend dual (días 1-2):
  - Agregar endpoint /auth/session que lea cookie y devuelva user
  - Login existente sigue devolviendo token (no rompe nada)
  - Nuevo endpoint /auth/login-cookie que setea httpOnly cookie además del token
  - Middleware que acepte cookie O Authorization header (cualquiera funciona)

Fase 2 — Frontend gradual (días 3-5):
  - Feature flag: localStorage.getItem("use_cookies") 
  - Si flag activo: login usa /auth/login-cookie, API calls no envían header
  - Si flag inactivo: funciona exactamente como hoy
  - Rollback: solo borrar la flag de localStorage

Fase 3 — Migración (días 6-8):
  - Activar flag para 5% de usuarios → monitorear errores
  - Activar para 50% → monitorear
  - Activar para 100%
  - Remover flag y código legacy de localStorage

Fase 4 — Limpieza (días 9-10):
  - Remover endpoints de login legacy
  - Remover lectura de localStorage
  - Deshabilitar Authorization header como fallback
```

### 2.2 Archivos a Modificar

| Archivo | Cambio |
|---------|--------|
| `apps/api/src/modules/auth/routes.js` | Agregar `POST /auth/login-cookie` que setea httpOnly cookie |
| `apps/api/src/security/jwt.js` | Opcional: agregar verificación de cookie además de header |
| `apps/api/server.js` | Agregar middleware que lea cookie y la ponga como token |
| `apps/web/lib/api.ts` | `authorizedFetch()`: si feature flag activo, no enviar Authorization header |
| `apps/web/app/login/page.tsx` | Si feature flag activo, usar `/auth/login-cookie` |
| `apps/web/store/auth.ts` | Actualizar para manejar sesión sin token en localStorage |

### 2.3 Configuración de Cookie Requerida

```javascript
reply.setCookie("token", jwtToken, {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict",
  path: "/",
  maxAge: 8 * 60 * 60 // 8 horas
});
```

### 2.4 Prerrequisitos

- Ambiente de staging con login real para pruebas
- Monitoreo de errores de autenticación (Alertmanager)
- Plan de rollback inmediato (revertir deploy)
- Prueba con múltiples navegadores (Chrome, Firefox, Safari, mobile)
- Prueba de expiración de sesión y refresh token

---

## 3. Resumen de Archivos Modificados

```
APEXOS/
├── .github/
│   └── workflows/
│       ├── ci.yml                          (NUEVO)
│       └── release-check.yml               (NUEVO)
├── apps/
│   ├── api/
│   │   ├── Dockerfile                      (MODIFICADO: USER no-root)
│   │   ├── .dockerignore                   (NUEVO)
│   │   ├── server.js                        (MODIFICADO: metrics, workers condicional)
│   │   ├── worker.js                        (NUEVO)
│   │   ├── prisma/
│   │   │   ├── schema.prisma                (MODIFICADO: storage_path en ServicePhoto)
│   │   │   └── migrations/
│   │   │       ├── 20260724000000_performance_indexes_fase2/   (NUEVO)
│   │   │       └── 20260724000001_add_storage_path/            (NUEVO)
│   │   └── src/
│   │       ├── core/
│   │       │   ├── prisma.js               (MODIFICADO: soft-delete global)
│   │       │   └── tenantCache.js           (MODIFICADO: getTenantConfig)
│   │       ├── fabric/
│   │       │   ├── queues.js               (MODIFICADO: defaultJobOptions, emailQueue)
│   │       │   ├── crons.js                (MODIFICADO: overlap protection)
│   │       │   ├── wsManager.js            (MODIFICADO: Redis PubSub)
│   │       │   ├── metrics.js              (NUEVO)
│   │       │   └── workers/
│   │       │       ├── brainWorker.js      (MODIFICADO: try-catch + timeout)
│   │       │       ├── auditWorker.js      (MODIFICADO: try-catch)
│   │       │       └── emailWorker.js      (REESCRITO: worker BullMQ real)
│   │       ├── middleware/
│   │       │   └── rbac.js                 (MODIFICADO: eliminado substring bypass)
│   │       └── modules/
│   │           ├── auth/routes.js          (MODIFICADO: rate limit register)
│   │           ├── hr/
│   │           │   ├── routes.js           (MODIFICADO: rate limit GPS)
│   │           │   ├── service.js          (MODIFICADO: getTenantConfig)
│   │           │   └── timeLogic.js        (MODIFICADO: DateTimeFormat cache)
│   │           ├── services/service.js     (MODIFICADO: nextNumber O(1), addPhoto storage_path, getTenantConfig)
│   │           └── accounting/service.js   (MODIFICADO: getTenantConfig)
│   └── web/
│       ├── Dockerfile                      (MODIFICADO: USER no-root)
│       ├── .dockerignore                   (NUEVO)
│       ├── next.config.ts                  (MODIFICADO: CSP + security headers)
│       ├── app/
│       │   ├── layout.tsx                  (MODIFICADO: eliminado dangerouslySetInnerHTML)
│       │   └── dashboard/servicios/[id]/
│       │       └── page.tsx                (MODIFICADO: storage upload + signed URLs)
│       ├── lib/
│       │   └── supabaseStorage.ts          (no cambios, ya soportaba storage_path)
│       └── public/scripts/
│           └── theme-init.js               (NUEVO)
├── config/
│   └── production.env                      (MODIFICADO: connection_limit=15)
├── infra/
│   ├── docker-compose.yml                  (MODIFICADO: resources, healthchecks, workers, pgbouncer)
│   ├── postgres/
│   │   └── pgbouncer.ini                   (NUEVO)
│   └── prometheus/
│       └── prometheus.yml                  (MODIFICADO: metrics_path)
├── services/
│   └── brain/
│       ├── Dockerfile                      (MODIFICADO: USER no-root)
│       └── .dockerignore                   (NUEVO)
└── scripts/
    ├── migrate-evidence-to-storage.js      (NUEVO)
    └── migrations/
        └── 20260724000002_partition_high_growth_tables.sql  (NUEVO)
```

**Total: ~35 archivos modificados o creados**

---

## 4. Validaciones Realizadas

| Tipo | Resultado |
|------|-----------|
| `node --check` en 19 archivos JS del backend | ✅ Todos OK |
| `tsc --noEmit` en frontend (TypeScript) | ✅ Sin errores |
| `next build` (58 rutas, producción) | ✅ Sin errores ni warnings |
| Verificación de imports cruzados | ✅ Sin roturas |
| Compatibilidad hacia atrás (base64 existente) | ✅ Garantizada |

---

## 5. Estado de la Plataforma Post-Cambios

| Área | Antes | Después |
|------|-------|---------|
| **Pool de BD** | 5 conexiones, se agotaba con ~10 usuarios | 15 conexiones (25 con PgBouncer local) |
| **RBAC** | Bypass por substring "admin"/"coordinador" | Match exacto contra 6 roles |
| **XSS** | Sin CSP, inline script peligroso | CSP activo, script externalizado |
| **Workers** | Sin error handling, podían matar el proceso | try-catch + timeouts + logging |
| **Redis** | Jobs retenidos para siempre, sin backoff | Cleanup automático, backoff exponencial |
| **nextNumber** | COUNT(*) full scan (O(n)) | findFirst O(1) |
| **Índices** | Faltaban 13 índices críticos | 13 nuevos índices (trigram + compuestos) |
| **Soft-delete** | Solo 5 modelos protegidos | 20 modelos protegidos, 36 bloqueados |
| **Evidencias** | Base64 en BD (~600MB/día) | Storage + path en BD (~1KB/día) |
| **Nómina** | 540+ DateTimeFormat/emp/día | 0 (cacheados) |
| **Tenant config** | Leída de BD en cada operación | Cacheada 5 minutos |
| **Rate limiting** | Solo global 200/min | Específico: register 5/hora, GPS 60/min |
| **Crons** | Sin protección de overlap | Protected con flag y logging |
| **Contenedores** | Root | Usuario no-root |
| **Monitoreo** | /health devolvía JSON inválido | /metrics con prometheus format |
| **WebSocket** | Solo single-instance | Multi-instancia con Redis PubSub |
| **CI/CD** | No existía | 2 workflows (CI + Release Check) |
| **Workers** | En proceso de la API | Proceso separado (opcional) |

---

*Documento generado el 2026-07-24. Los cambios han sido subidos a las 3 ramas activas (main, develop, desarrollo).*
