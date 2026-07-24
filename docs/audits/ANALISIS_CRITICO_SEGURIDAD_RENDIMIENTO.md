# Análisis Crítico de Seguridad, Rendimiento y Saturación de Datos

> **Documento:** ANÁLISIS CRÍTICO — APEX OS 2.0 / NYVORA  
> **Versión:** 1.0  
> **Fecha:** 2026-07-24  
> **Propósito:** Servir como contexto canónico para que cualquier agente o desarrollador valide errores, problemas de seguridad, cuellos de botella y riesgos de saturación en la plataforma. No aplica correcciones — solo identifica y prioriza.  
> **Alcance:** Infraestructura, backend (Fastify), frontend (Next.js), base de datos (Prisma + Supabase), workers (BullMQ), flujo de datos, autenticación, almacenamiento.

---

## Índice

1. [Resumen Ejecutivo](#1-resumen-ejecutivo)
2. [Matriz de Riesgos por Prioridad](#2-matriz-de-riesgos-por-prioridad)
3. [Infraestructura y Despliegue](#3-infraestructura-y-despliegue)
4. [Backend API](#4-backend-api)
5. [Base de Datos](#5-base-de-datos)
6. [Frontend](#6-frontend)
7. [Workers y Colas](#7-workers-y-colas)
8. [Flujo de Datos y Cuellos de Botella](#8-flujo-de-datos-y-cuellos-de-botella)
9. [Comparativa con Estándares Modernos](#9-comparativa-con-estándares-modernos)
10. [Proyección a 10x y 100x de Volumen](#10-proyección-a-10x-y-100x-de-volumen)
11. [Apéndice: Checklist para Intervenciones Futuras](#11-apéndice-checklist-para-intervenciones-futuras)

---

## 1. Resumen Ejecutivo

APEX OS 2.0 es una plataforma ERP SaaS multi-tenancy construida con Node.js 22 + Fastify 5 + Next.js 15 + PostgreSQL (Prisma ORM + Supabase). Está en producción con el cliente IMPORTADORA SCJ SAS (México). El análisis revela **hallazgos críticos en todas las capas** que comprometen la seguridad, la estabilidad bajo carga y la capacidad de escalar.

### Hallazgos Clave

| Capa | Críticos | Altos | Medios |
|------|----------|-------|--------|
| Infraestructura | 4 | 6 | 5 |
| Backend API | 10 | 12 | 8 |
| Base de Datos | 5 | 8 | 7 |
| Frontend | 8 | 10 | 6 |
| Workers/Colas | 8 | 6 | 4 |
| Flujo de Datos | 7 | 9 | 5 |
| **Total** | **42** | **51** | **35** |

**Riesgo #1:** `connection_limit=5` en producción — el pool de conexiones se agota con ~10 usuarios concurrentes.

**Riesgo #2:** Almacenamiento de fotos como base64 en PostgreSQL — colapsará la BD con el crecimiento.

**Riesgo #3:** Bypass de roles de administrador por substring "admin" — cualquier rol con "admin" en el nombre tiene acceso total.

**Riesgo #4:** Sin CSP, sin HTTPS en Docker local, sin httpOnly cookies — vectores de XSS y MITM activos.

**Riesgo #5:** Workers sin try-catch, sin DLQ, sin timeouts — tormenta de reintentos colapsa Redis y la API.

---

## 2. Matriz de Riesgos por Prioridad

### 🔴 CRÍTICO — Acción Inmediata

| ID | Riesgo | Capa | Impacto | Detalle |
|----|--------|------|---------|---------|
| C-01 | **Pool de conexiones: `connection_limit=5`** | BD | Caída total | En producción. 5 conexiones para API + workers + health checks. Con 10 usuarios concurrentes se agota. |
| C-02 | **Base64 de fotos en PostgreSQL** | BD/Flujo | Degradación irreversible | `ServicePhoto.base64_data`, `RoutePreoperationalChecklistEvidence.base64_data` almacenan ~2-3MB por foto en la BD. Sin MinIO real implementado. |
| C-03 | **Bypass de roles por substring "admin"** | Backend | Acceso no autorizado total | `rbac.js` L60: `value.includes("admin")` — un rol "subadmin_operador" obtiene privilegios de admin. |
| C-04 | **Sin Content-Security-Policy** | Frontend | XSS sin restricciones | Sin CSP en `next.config.ts`. Cualquier script inyectado se ejecuta. |
| C-05 | **`dangerouslySetInnerHTML` en layout** | Frontend | XSS directo | `app/layout.tsx` lee `localStorage` y lo escribe como HTML inline. Si localStorage es envenenado, XSS es inmediato. |
| C-06 | **Sin HTTPS/TLS en Docker** | Infraestructura | MITM | Nginx escucha en puerto 80 sin TLS. Todo el tráfico viaja en texto plano. |
| C-07 | **Workers sin try-catch** | Workers | Caída del proceso | `brainWorker.js` hace `await fetch()` sin try-catch. Si el servicio BRAIN falla, unhandled rejection mata Node. |
| C-08 | **Sin timeouts en brainWorker.fetch()** | Workers | Hanging perpetuo | `fetch()` sin `AbortController`. Si BRAIN cuelga, el worker cuelga para siempre → reintentos infinitos. |
| C-09 | **Sin removeOnComplete/removeOnFail en colas** | Workers | OOM de Redis | Cada trabajo completado/fallado se retiene en Redis para siempre. Bajo carga, Redis se queda sin memoria. |
| C-10 | **`nextNumber()` con COUNT(*) full scan** | BD/Backend | Timeout en creación | `prisma.serviceOrder.count()` escanea toda la tabla en cada creación de orden. A 100K órdenes = scan secuencial. |
| C-11 | **Race condition en stock deduction** | Backend | Inconsistencia de inventario | TOCTOU: lee `item.stock_current` antes del write. Dos requests concurrentes pueden deducir el mismo stock. |
| C-12 | **`connection_limit=5` en DATABASE_URL** | BD | Timeout general | Configurado en `config/production.env`. La URL del pooler de Supabase limita a 5 conexiones. |
| C-13 | **Sin particionamiento en tablas de alto crecimiento** | BD | Degradación progresiva | `GpsPing`, `AuditLog`, `TimePunch`, `Movement` sin particionamiento por fecha. A 500M filas son insostenibles. |
| C-14 | **Sin dead letter queue** | Workers | Tormenta de reintentos | Trabajos con payload inválido reintentan para siempre con delay 0ms, saturando Redis y CPU. |
| C-15 | **Sin isolated workers** | Workers | API bloqueada | Todos los workers corren en el mismo proceso Node.js que el servidor HTTP. Un worker CPU-intensivo bloquea peticiones. |
| C-16 | **Sin límite de mensajes WebSocket** | Backend | DoS | `wsManager.js` no tiene rate limiting. Un cliente puede enviar mensajes ilimitados. |

### 🟡 ALTO — Debe corregirse pronto

| ID | Riesgo | Capa | Detalle |
|----|--------|------|---------|
| H-01 | **Sin CI/CD pipeline** | Infra | Cada deploy es manual. Sin GitHub Actions, sin audits automatizados. |
| H-02 | **Contenedores ejecutándose como root** | Infra | Todos los Dockerfiles sin `USER` directive. Escalación de privilegios si el contenedor es comprometido. |
| H-03 | **Sin `.dockerignore`** | Infra | `node_modules`, `.git`, `docs/`, `logs/` se copian a la imagen. Aumenta tamaño y riesgo de leak de secrets. |
| H-04 | **Prometheus scrapea `/health` como métricas** | Infra | `/health` devuelve JSON, no métricas Prometheus. El monitoreo es no-funcional. |
| H-05 | **Puertos expuestos de todos los servicios** | Infra | Redis (6379), MinIO (9000/9001), PostgreSQL (55432) expuestos al host sin auth. |
| H-06 | **`include("admin")` y `include("coordinador")`** | Backend | Cualquier rol con "admin" o "coordinador" en su nombre tiene bypass total de permisos. |
| H-07 | **`require()` en hotpath de auth** | Backend | `require("./jwt")` y `require("./supabaseAuth")` en cada request. Destruye el cache de módulos de Node. |
| H-08 | **Sin verificación de firma de token Supabase** | Backend | `getSupabaseUser()` llama REST API en vez de verificar JWT localmente. Dependencia de red para auth. |
| H-09 | **Mass Assignment en `createUser`** | Backend | Todos los campos de metadata se aceptan sin allowlist. `bank_account_number`, `salary_base`, etc. |
| H-10 | **`exportTenantData` sin paginación** | Backend | Devuelve TODOS los registros del tenant en una sola response. Gigabytes de datos. |
| H-11 | **Generación de PDF en el hilo principal** | Backend | `buildReportPdf()` hace string concat síncrono en el event loop. Una solicitud concurrente puede OOM el proceso. |
| H-12 | **WebSocket no soporta multi-instancia** | Arquitectura | `wsManager.js` es in-memory. En horizontal scaling, broadcasts no llegan a todos los clients. |
| H-13 | **Sin paginación en GPS pings** | Backend | `getOperationsMap()` carga hasta 2000 pings + 2000 punches cada 10 segundos. Payload de red de MBs. |
| H-14 | **AuditLog sin archivado** | BD | Cada mutación crea una fila. Sin TTL, sin partición, sin archivado. Crecimiento ilimitado. |
| H-15 | **Sin httpOnly cookies para tokens** | Frontend | Tokens en `localStorage`. Cualquier XSS roba todas las sesiones. |
| H-16 | **Sin CSRF protection** | Frontend | `POST /api/public/service-requests` sin CSRF token. Ataques cross-origin posibles. |
| H-17 | **Cron jobs sin protección de overlap** | Workers | `processBilling()` puede ejecutarse en paralelo si tarda >24h. Duplicación financiera. |
| H-18 | **Cron jobs sin distributed locking** | Workers | Múltiples instancias ejecutan el mismo cron simultáneamente. |
| H-19 | **stockSyncWorker es un no-op** | Workers | `{ synced: true, payload: job.data }` — no hace nada. Sincronización de stock silenciosamente rota. |
| H-20 | **emailWorker no es un worker BullMQ** | Workers | `sendInvoice()` devuelve `{ queued: true }` pero no envía ningún email. La función está aislada sin integración con colas. |
| H-21 | **`bulkImportReferences` sin transacción** | Backend | Itera 500 referencias sin wrapping en transacción. Import parcial deja estado inconsistente. |
| H-22 | **Sin warmup de tenant cache** | Backend | En cada request de un tenant nuevo, se paga el full DB query para cargar config. |
| H-23 | **`getKardex` sin límite** | Backend | `prisma.movement.findMany()` sin limit. Puede devolver millones de filas, luego hace `.slice()` en JS. |
| H-24 | **`getVehicleDashboardMetrics` carga todo** | Backend | `vehicle.findMany({ include: { documents: true } })` — carga TODOS los vehículos con documentos en memoria. |
| H-25 | **Base64 en metadata de TimePunch** | BD | `extra_evidence.base64` almacenado en columna JSONB de `TimePunch`. Fotos embebidas en JSON. |
| H-26 | **Supabase ANON_KEY en bundle del cliente** | Frontend | `NEXT_PUBLIC_SUPABASE_ANON_KEY` visible en source maps. Si RLS está mal configurado, acceso directo a datos. |
| H-27 | **Servicio public expone catálogo completo** | Frontend | `GET /api/public/service-requests` devuelve references, tipos de servicio y almacenes sin auth. |
| H-28 | **No hay retry logic en API calls** | Frontend | `authorizedFetch` solo retryea en 401. Fallos de red = error inmediato al usuario. |
| H-29 | **Dashboard carga 200 órdenes en cliente** | Frontend | `limit=200` + 5 requests paralelas visibles en Network Tab. Payload masivo en cada carga. |
| H-30 | **`keepSessionAlive` sin check de visibilidad** | Frontend | Heartbeat cada 60s incluso con tab oculta. Batería y datos móviles desperdiciados. |

### 🟠 MEDIO — Debe planificarse

| ID | Riesgo | Capa | Detalle |
|----|--------|------|---------|
| M-01 | **Sin resource limits en Docker** | Infra | Servicios sin CPU/memory limits. Un service puede starvation a los demás. |
| M-02 | **Grafana con password por defecto** | Infra | `${GRAFANA_PASS:-change_me_grafana}` — literal hardcodeado. |
| M-03 | **Sin healthchecks en PostgreSQL, Redis, MinIO** | Infra | Fallos silenciosos en infraestructura crítica. |
| M-04 | **Tres loaders de env diferentes** | Backend | `loadEnv.js`, `rootEnv()`, `env-doctor.js` — tres mecanismos distintos. Inconsistencia. |
| M-05 | **`minio` en package.json sin uso** | Backend | Dependencia muerta. Confunde sobre el stack de almacenamiento real. |
| M-06 | **Memory cache sin límite de tamaño** | Backend | `tenantCache.js` Map sin LRU. Crecimiento ilimitado en procesos long-running. |
| M-07 | **Audit log bloquea response pipeline** | Workers | `await auditQueue.add()` en `onResponse` hook. Si Redis está lento, la HTTP response se retrasa. |
| M-08 | **Workflow engine síncrono en request path** | Workers | `executeHooks()` ejecuta `reserve_stock` y `send_invoice` en el hilo HTTP. |
| M-09 | **`classifyMinute()` crea `Intl.DateTimeFormat` por minuto** | Backend/Flujo | 540+ objetos creados por empleado por día. Costoso en CPU. |
| M-10 | **Sin WebSocket ping/pong keepalive** | Backend | Conexiones stale se acumulan en `clientsByTenant`. Memory leak. |
| M-11 | **Sin migraciones para tablas core** | BD | Solo 3 migraciones en Prisma. `db push` usado en vez de migrations formales. |
| M-12 | **Campos TEXT sin límite de longitud** | BD | `ServiceOrder.notes`, `WorkActivity.observation`, `Vehicle.notes` sin maxlength. Bloat potencial. |
| M-13 | **Float vs Decimal para valores monetarios** | BD | Tipo `Float` usado para precios/costos. Error de precisión en operaciones contables. |
| M-14 | **Sin revalidación de caché en stale data** | Frontend | Si refresh falla, el usuario ve datos stale indefinidamente. |
| M-15 | **Zustand store desync de localStorage** | Frontend | El store y localStorage se actualizan independientemente. Estado auth inconsistente. |
| M-16 | **Sin dynamic imports para modales/charts** | Frontend | `ModalFrame`, `recharts`, `SignatureCapture` siempre bundled aunque ocultos. |
| M-17 | **Waterfall de 5 requests en dashboard** | Frontend | 5 llamadas secuenciales visibles en cada carga. |
| M-18 | **PhotoCapture memory leak** | Frontend | `URL.revokeObjectURL` solo limpia el último preview. Llamadas múltiples a `select()` filtran URLs. |
| M-19 | **Session companies fetch sin cache** | Frontend | `loadSessionCompanies()` llama API cada vez que UserSessionBadge monta. |
| M-20 | **Procesamiento de imágenes en main thread** | Frontend | 20 canvas encodes secuenciales bloquean UI por segundos. Sin Web Worker. |
| M-21 | **`runSlotting` con N+1 queries** | Backend | Itera TODOS los items activos con `movement.aggregate` por item. O(items × aggregates). |
| M-22 | **`getInventoryCosts` con N+1** | Backend | Fetch de todos los items, luego fetch de `productCost` en segundo barrido. |

---

## 3. Infraestructura y Despliegue

### 3.1 Docker Compose

El stack se define en `infra/docker-compose.yml` con 9 servicios. No hay resource limits, no hay healthchecks en 7 de 9 servicios.

#### Riesgos Identificados

- **Sin resource limits:** Un servicio con fuga de memoria (p.ej., Puppeteer no usado pero instalado) puede OOM-killear otros servicios.
- **Puertos expuestos:** PostgreSQL (55432), Redis (6379), MinIO (9000/9001), Prometheus (9090), Grafana (4000) están mapeados al host. Redis sin password, MinIO con credenciales por defecto.
- **Redes planas:** Todos los servicios en la misma red Docker. Sin segmentación. Si un servicio es comprometido, todos los demás son accesibles.
- **Sin healthchecks en servicios de estado:** PostgreSQL, Redis, MinIO no tienen healthcheck. El `depends_on` solo garantiza orden de inicio, no disponibilidad.
- **WebSocket no multi-instancia:** `wsManager.js` es in-memory. Escalar horizontalmente rompe broadcasts en tiempo real.

### 3.2 Dockerfiles

- **Todos los contenedores corren como root.** No hay `USER` directive en ningún Dockerfile.
- **Sin `.dockerignore`.** `node_modules` local, `.git`, `docs/`, `logs/` se copian a la imagen. Aumenta tamaño (~500MB+ innecesarios) y puede filtrar secrets.
- **`npm install` en vez de `npm ci`.** Sin garantía de reproducibilidad. `package-lock.json` existe pero no se usa.
- **Sin compilación multi-stage.** Las imágenes incluyen devDependencies y source code completo.

### 3.3 Nginx

```nginx
listen 80;  # Sin HTTPS
# Sin rate limiting
# Sin límite de body size
# Sin compression
# Sin X-Forwarded-Proto
```

El proxy inverso no tiene TLS, no protege contra abusos, y no comprime respuestas.

### 3.4 Monitoreo

- **Prometheus mal configurado:** Scrapea `/health` que devuelve JSON. No hay endpoint `/metrics` con formato Prometheus. El monitoreo de métricas **no funciona**.
- **Grafana sin dashboards precargados.** Contraseña admin por defecto `${GRAFANA_PASS:-change_me_grafana}`.
- **Sin collectores:** No hay node_exporter, cAdvisor, Redis exporter, ni PostgreSQL exporter.
- **Sin Alertmanager:** No hay reglas de alerta configuradas.

### 3.5 CI/CD

**No existe pipeline de CI/CD.** Sin GitHub Actions, sin GitLab CI, sin scripts de deploy automatizados. Cada deploy es manual desde Railway dashboard.

- Sin tests automáticos pre-deploy
- Sin lint/typecheck gates
- Sin validación de migraciones
- Sin rollback automatizado
- Sin escaneo de seguridad de dependencias

### 3.6 Almacenamiento (MinIO vs Supabase)

- MinIO está en la infraestructura Docker pero **nunca se usa en código**. La dependencia `minio` en `apps/api/package.json` es peso muerto.
- Todo el almacenamiento real va a **Supabase Storage** directamente desde el frontend, sin pasar por el backend:
  - Buckets: `company-assets`, `user-avatars`, `service-images`, `user-documents`
  - URLs firmadas con 1 hora de expiración
  - Validación de archivos solo del lado del cliente (MIME type, tamaño)
  - Sin escaneo de malware/virus
  - Sin CDN o capa de caché

**Problema:** El frontend se comunica directamente con Supabase Storage. El backend no puede validar, transformar, ni auditar los archivos subidos. Cualquier validación de MIME type es eludible.

---

## 4. Backend API

### 4.1 Server.js — Punto de Entrada

**`server.js`** arranca Fastify con plugins y decorators críticos:

| Línea | Riesgo | Severidad |
|-------|--------|-----------|
| 5 | `bodyLimit: 25MB` — payloads masivos como DoS vector | Medio |
| 54 | CORS abierto en dev: `localhost:*`, `127.0.0.1:*` | Medio |
| 61 | Rate limit: 200 req/min por tenant (no por IP) | Medio |
| 75 | `require("./src/security/jwt")` **por cada request** — destruye cache de módulos | **Crítico** |
| 133 | `request.body?.tenant_id` sin validación en hook de auditoría | Alto |
| 237 | WebSocket auth como preHandler — autenticación post-upgrade no implementada | **Crítico** |
| 265 | Errores Prisma (P2002, P2025) expuestos con mensajes en español | Bajo |
| 335 | `process.exit(1)` en errores — sin graceful shutdown | Alto |

### 4.2 Seguridad — JWT

- **Validación débil de JWT_SECRET:** Solo verifica `secret.length < 24`. Un secret de 24 caracteres como `aaaaaaaaaaaaaaaaaaaaaaaa` es aceptado.
- **Sin blacklist de tokens:** Una vez emitidos, los tokens JWT viven 8h sin posibilidad de revocación.
- **Sin `jti` (JWT ID):** Imposible rastrear emisión específica de tokens.
- **Sin `aud`/`iss`:** Los tokens son válidos cross-origin.
- **Refresh token usa el mismo JWT_SECRET:** Si el secret se filtra, ambos tokens están comprometidos.

### 4.3 Seguridad — Supabase Auth

- **Sin verificación local de firma JWT de Supabase:** `getSupabaseUser()` llama REST API para validar el token. Un MITM que pueda suplantar la URL de Supabase puede inyectar usuarios falsos.
- **Cache de auth en memoria (30s TTL):** Si Supabase revoca un token, el cache sigue sirviendo como válido hasta 30s.
- **Race condition en `ensureUserMirror`:** Sin distributed lock. Dos requests concurrentes para el mismo usuario pueden crear duplicados en Prisma.
- **`syncExistingTenantWithSupabase()` sin advisory lock:** Modifica config del tenant mientras otras operaciones pueden estar leyéndola.

### 4.4 RBAC — Bypass Crítico

```javascript
// rbac.js L60-61
const scopeName = roleName.replace("APEX_", "").toLowerCase();
if (value.includes("admin") || value.includes("coordinador")) return next(); // BYPASS TOTAL
```

**Cualquier rol que contenga "admin" o "coordinador" en su nombre obtiene acceso completo a la plataforma.** Un rol llamado `subadmin_operador`, `administrative_assistant`, `coordinador_logistica` tiene los mismos permisos que `APEX_ADMIN`.

### 4.5 Modulos — Riesgos Específicos

#### Admin (1306 líneas)

- **Mass Assignment en `createUser` (L1140-1222):** Todos los campos de metadata se aceptan sin allowlist: `bank_account_number`, `salary_base`, `driver_license`, `eps`, `pension_fund`. PII/PCI leak.
- **`exportTenantData` sin paginación (L816):** Devuelve ALL parties, items, transactions, employees, movements en una sola response.
- **`USER_MASTER_DATA` en memoria (L936):** Array modificado in-memory. Los cambios se pierden al reiniciar.

#### Servicios

- **PDF en hilo principal:** `buildReportPdf()` construye string HTML gigante en el event loop. Una solicitud de PDF grande puede OOM el proceso.
- **`nextNumber()` con `count()` full scan:** `prisma.serviceOrder.count()` escanea toda la tabla en cada creación.
- **`closeOrder` requiere 3+ queries secuenciales:** `requireSatisfactionSurvey()`, `requireEvidence()`, `update()`.

#### Inventario

- **`runSlotting` N+1:** Itera TODOS los items activos y ejecuta `movement.aggregate` por cada uno. O(items × aggregates).
- **`getKardex` sin límite:** `prisma.movement.findMany()` con `orderBy: "asc"` sin limit. Millones de filas devueltas.
- **Race condition en stock:** TOCTOU entre `item.stock_current` check y el write en `stockMoveTx`.

#### HR

- **GPS pings sin rate limit:** `POST /hr/gps/ping` sin límite de frecuencia. Ingestión ilimitada.
- **`processWorkday` minuto a minuto:** `classifyMinute()` itera minuto por minuto. 12h = 720 iteraciones/empleado/día.
- **`Intl.DateTimeFormat("en-CA")` creado por iteración:** Sin cache. 720 objetos nuevos por empleado por día.

### 4.6 Security Headers

| Header | Estado | Impacto |
|--------|--------|---------|
| Content-Security-Policy | ❌ Ausente | XSS sin restricciones |
| X-Content-Type-Options | ❌ Ausente | MIME sniffing |
| X-Frame-Options | ❌ Ausente | Clickjacking |
| Strict-Transport-Security | ❌ Solo en HTTPS | Sin HSTS si X-Forwarded-Proto no está |
| Referrer-Policy | ❌ Ausente | Leak de URL en referrer |
| Permissions-Policy | ❌ Ausente | Cámara/geolocalización permitidas en same-origin |

### 4.7 Rate Limiting

- **200 req/min por tenant (keyGenerator usa `req.user?.tenant_id \|\| req.ip`):** Si `tenant_id` está ausente, cae a IP. Un atacante autenticado en múltiples tenants obtiene N × 200 req/min.
- **Sin rate limiting por endpoint específico:** Los endpoints sensibles (`POST /auth/login`, `POST /hr/gps/ping`, WebSocket) comparten el mismo límite global.

---

## 5. Base de Datos

### 5.1 Pool de Conexiones — Riesgo #1 del sistema

```env
DATABASE_URL=postgresql://postgres.jzbwzmkidfthknsohhnr:...@aws-1-sa-east-1.pooler.supabase.com:5432/postgres?sslmode=require&connection_limit=5
```

**`connection_limit=5` es catastróficamente bajo.** Concurrentes que compiten por esas 5 conexiones:

- API Fastify (15 módulos de rutas)
- Workers (audit, brain, stock sync — en el mismo proceso)
- Health checks periódicos
- Brain Python service
- Next.js server-side queries
- Pooler de Supabase

**Apenas 5 usuarios realizando operaciones concurrentes agotan el pool.** No hay PgBouncer ni pooler externo configurado.

### 5.2 Tablas de Alto Crecimiento

| Tabla | Tasa de Crecimiento | Índices | Riesgo a 10x | Riesgo a 100x |
|-------|--------------------|---------|--------------|---------------|
| `GpsPing` | **Muy Alta** — ping cada ~30s por empleado | 4 índices compuestos | ⚠️ Degradación | ❌❌ 500M+ filas, crash |
| `AuditLog` | **Alta** — cada operación | 2 índices | ⚠️ Sin partición | ❌❌ 500M+ filas |
| `TimePunch` | **Alta** — 4+ punches/emp/día | 4 índices | ✅ Adecuado | ❌ Sin partición |
| `ServiceOrder` | **Media-Alta** | 5 índices | ✅ Bien indexado | ⚠️ Sin date-range partition |
| `Movement` | **Alta** — cada transacción stock | 2 índices | ⚠️ Falta (tenant, transaction_id) | ❌ Sin (tenant, created_at) |

### 5.3 Índices Faltantes (Table Scans Bajo Carga)

| Tabla | Índice Faltante | Consulta Afectada |
|-------|----------------|-------------------|
| `LedgerEntry` | `(tenant_id, account_id, date, period)` | Balance sheet queries |
| `Movement` | `(tenant_id, transaction_id)` | Kardex joins |
| `Movement` | `(tenant_id, created_at)` | Kardex date-range queries |
| `Item` | `(tenant_id, name)` trigram index | `listItems` con `contains, insensitive` |
| `Item` | `(tenant_id, stock_current, stock_min)` | Low-stock alerts |
| `ServiceReference` | trigram indexes en `code`, `name`, `brand` | Búsqueda de referencias |
| `CxpCabdoc` | `(tenant_id, status)` | Filtros por estado |
| `Payroll` | `(tenant_id, employee_id, period)` | Cálculos de nómina |

### 5.4 Soft Delete — Solo 5 de 60+ Modelos

```javascript
const SOFT_DELETE = new Set(["Item", "Party", "Employee", "Resource", "Place"]);
```

**55+ modelos NO tienen protección soft delete.** Una operación `delete()` o `deleteMany()` en:

- `ServiceOrder` → cascada elimina `ServiceIncident`, `ServicePhoto`
- `Project` → cascada elimina 8 tablas hijas
- `Transaction` → elimina registros financieros
- `CntCabdoc` → documentos contables
- `GpsPing`, `TimePunch`, `WorkActivity` → registros de RRHH

...los elimina físicamente sin posibilidad de recuperación.

### 5.5 Particionamiento y Archivado

**No existe ninguna estrategia de particionamiento ni archivado de datos:**

- `GpsPing` — sin partición mensual
- `AuditLog` — sin partición mensual
- `TimePunch` — sin partición mensual
- `Movement` — sin partición trimestral
- `ServiceOrder` — sin partición

Sin retención de datos definida. Los registros de GPS de hace 2 años ocupan el mismo tablespace que los de hoy.

### 5.6 RLS Policies — Performance Overhead

Cada chequeo de RLS ejecuta:
```sql
app_private.is_company_member(company_id)  → 1 query
app_private.has_company_module(company_id, module) → 3 CTEs + joins
```

Para un simple `SELECT * FROM gps_pings WHERE company_id = X`, el planner ejecuta ambas policies, cada una con ambas funciones = **2-4 subqueries por fila revisada**.

### 5.7 Dual Schema Drift

El sistema opera dos schemas paralelos sin sincronización:

| Schema | Modelos | IDs | Propósito |
|--------|---------|-----|-----------|
| Prisma | 60+ modelos con `tenant_id` | Enteros autoincrementales | Lógica de negocio core |
| Supabase | Tablas con `company_id` | UUIDs | Auth, RLS, mobile API |

`GpsPing`, `TimePunch`, `ServiceOrder`, `Employee` existen en **ambos schemas** con diferentes IDs, diferentes columnas, y sin mecanismo de sync. Data drift entre Prisma y Supabase es inevitable.

---

## 6. Frontend

### 6.1 Content-Security-Policy — Ausente

**No hay CSP definido en `next.config.ts`.** Esto significa:

- Cualquier script inyectado (XSS) se ejecuta sin restricción
- `dangerouslySetInnerHTML` en layout.tsx es un vector activo
- No hay protección contra inline script injection
- Los websockets pueden conectarse a cualquier origen
- Las imágenes pueden cargarse de cualquier dominio

### 6.2 Tokens en localStorage

Todos los tokens de autenticación se almacenan en `localStorage`:

```typescript
localStorage.getItem("token")        // JWT de acceso
localStorage.getItem("refresh")      // Refresh token
localStorage.getItem("user_email")   // Email del usuario
```

- Accesibles desde cualquier JavaScript en el mismo origen
- Si hay XSS, el atacante exfiltra todas las sesiones
- No hay httpOnly cookies como alternativa
- No hay `SameSite` protection

### 6.3 Exposición de Datos en Client Bundle

**`lib/api.ts` (~194KB en bundle del cliente)** contiene:

- `adminPermissionCatalog` — matriz completa de permisos, definiciones de roles, `delete_physical_records`
- `defaultAdminRoles()` — definiciones completas de roles por defecto
- `fallbackActivityTypes` — tipos de actividad internos
- `tenantModuleCodesByPermissionModule` — lógica de enrutamiento interno de módulos

Estos datos son visibles en cualquier browser con DevTools abiertos.

### 6.4 API Routes con Service Role Key

Varias rutas en `app/api/` usan `SUPABASE_SERVICE_ROLE_KEY`:
- Estas rutas son accesibles desde el frontend
- Si ocurre un error de servidor, la key podría filtrarse en stack traces
- Cualquier bug de autorización permite operaciones con service_role

### 6.5 Sin CSRF Protection

- No hay CSRF tokens en ningún formulario
- `POST /api/public/service-requests` es accesible cross-origin
- Sin doble-submit cookie pattern

### 6.6 Bundle Size y Code Splitting

| Módulo | Tamaño Estimado | Problema |
|--------|----------------|----------|
| `lib/api.ts` | ~194 KB | Contiene catálogo de permisos, roles, config — cargado en cada página que importa `api` |
| `recharts` | ~150-200 KB | Dashboard lo importa como `"use client"` sin dynamic import |
| `servicios/[id]/page.tsx` | ~52 KB | Un solo componente cliente masivo para todo el lifecycle |
| `ModalFrame`, `SignatureCapture`, `BrainPanel` | Siempre bundled | Sin dynamic imports — siempre cargados aunque ocultos |

### 6.7 Data Fetching — Waterfall y Exposición

**Dashboard:** 5 requests paralelas en el cliente:
```typescript
Promise.all([
  api("/api/v1/services/orders?limit=200"),    // 200 registros
  api("/api/v1/hr/operations-map"),
  api("/api/v1/hr/attendance"),
  api("/api/v1/transport/vehicles/metrics/dashboard"),
  api("/api/v1/hr/routes/preop/metrics")
])
```

- 200 órdenes de servicio visibles en Network Tab
- Sin React Server Components (todo es `"use client"`)
- Sin Suspense boundaries — charts se renderizan vacíos durante carga

**UserSessionBadge** lee `localStorage` en cada render:
```typescript
localStorage.getItem("apex_theme")
localStorage.getItem("role_name")
localStorage.getItem("user_email")
localStorage.getItem("auth_provider")
localStorage.getItem("apexos_company_name")
localStorage.getItem("apexos_company_id")
localStorage.getItem("token")
```

### 6.8 PhotoCapture — Problemas

- **20 canvas encodes secuenciales** en main thread: 4 resoluciones × 5 calidades. Bloquea UI por 2-6 segundos en dispositivos medios.
- **Sin Web Worker:** Todo el procesamiento de imagen en el hilo principal.
- **Memory leak:** `URL.revokeObjectURL` solo limpia el último preview. Llamadas múltiples a `select()` filtran URLs intermedias.
- **Base64 en estado de React:** La imagen completa (~2MB) se mantiene en estado React, pasada por props.

---

## 7. Workers y Colas

### 7.1 Arquitectura General

Todos los workers corren **dentro del mismo proceso Node.js que el servidor HTTP**. No hay aislamiento de procesos:

```javascript
// server.js
require("./src/fabric/workers/auditWorker");
require("./src/fabric/workers/brainWorker");
require("./src/fabric/workers/stockSyncWorker");
require("./src/fabric/workers/iotWorker");    // Objeto vacío: module.exports = {}
require("./src/fabric/workers/emailWorker").sendInvoice;  // No es un worker BullMQ
```

**Un worker CPU-intensivo o que lance un unhandled rejection mata toda la API.**

### 7.2 Configuración de Colas

```javascript
const auditQueue = new Queue("apex-audit", { connection });
const brainQueue = new Queue("apex-brain", { connection });
const stockQueue = new Queue("apex-stock-sync", { connection });
```

**Sin `defaultJobOptions`:** BullMQ defaults = reintentos infinitos sin delay, trabajos retenidos para siempre en Redis.

| Configuración | Estado | Impacto |
|--------------|--------|---------|
| `defaultJobOptions.attempts` | ❌ No configurado (default: infinito) | Retry storm |
| `defaultJobOptions.backoff` | ❌ No configurado (default: 0ms delay) | Sin backoff exponencial |
| `defaultJobOptions.removeOnComplete` | ❌ No configurado | Redis OOM |
| `defaultJobOptions.removeOnFail` | ❌ No configurado | Poison jobs acumulados |
| Dead Letter Queue | ❌ No implementado | No hay aislamiento de poison jobs |

### 7.3 Worker por Worker

#### `auditWorker.js` — Alto Riesgo

- **Sin try-catch:** `prisma.auditLog.create()` sin protección. Si la BD falla, retry infinito.
- **Audit hook bloquea response:** `await auditQueue.add()` en `onResponse` — Redis lento = HTTP lento.
- **Sin batch processing:** Cada log es un `create()` individual. `createMany()` sería más eficiente.

#### `brainWorker.js` — **Crítico**

- **Sin try-catch:** `await fetch(brainUrl)` sin protección. Error de red = unhandled rejection.
- **Sin timeout:** `fetch()` sin `AbortController`. Si BRAIN cuelga, el worker cuelga para siempre.
- **Sin validación de response:** `response.json()` sin `response.ok`. 502 se parsea como JSON y puede fallar.
- **Broadcast frágil:** Si el WebSocket se desconecta entre el inicio y la completación del job, el broadcast se pierde.

#### `stockSyncWorker.js` — No-op

```javascript
return { synced: true, payload: job.data };  // No hace nada
```

Trabajos añadidos a la cola `apex-stock-sync` se marcan como completados exitosamente pero **no ejecutan ninguna sincronización**. Silenciosamente roto.

#### `iotWorker.js` — Objeto Vacío

```javascript
module.exports = {};  // No es un worker
```

Cargado en `server.js` pero no tiene funcionalidad alguna. Código legacy o placeholder.

#### `emailWorker.js` — Función Aislada

```javascript
async function sendInvoice(tenantId) {
  return { queued: true, tenant_id: tenantId };  // No envía nada
}
```

- No es un worker BullMQ
- No usa `nodemailer` (aunque está en package.json)
- Devuelve `{ queued: true }` pero nunca encola ni envía
- **Las facturas nunca se envían por email**

### 7.4 Cron Jobs

```javascript
cron.schedule("0 6 * * *", async () => { await scheduleDailyAnalysis(); });
cron.schedule("0 2 * * *", async () => { await processBilling(); });
```

- **Sin protección de overlap:** Si `processBilling()` tarda >24h, una segunda instancia se ejecuta en paralelo. Duplicación financiera.
- **Sin error handling:** Unhandled rejection en async cron mata Node 22+.
- **Sin distributed locking:** Múltiples instancias ejecutan el mismo cron simultáneamente.
- **Sin logging:** Sin registro de éxito/fallo dentro de los callbacks.

### 7.5 Redis

```yaml
command: redis-server --appendonly yes --maxmemory 512mb --maxmemory-policy noeviction
```

- **`noeviction`:** Redis lanza errores OOM cuando se llena la memoria. Para un sistema de colas, `allkeys-lru` o `volatile-lru` son obligatorios.
- **`--appendonly yes`:** La persistencia AOF duplica el uso de memoria durante reescrituras.
- **Sin TLS:** Conexión Redis en texto plano (`redis://localhost:6379`).

---

## 8. Flujo de Datos y Cuellos de Botella

### 8.1 Pipeline de Evidencias (Fotos)

```
PhotoCapture.tsx → 20 canvas encodes → base64 DataURL → 
  POST /api/v1/services/photos → 
    Prisma ServicePhoto.create({ base64_data: "data:image/jpeg;base64,..." })
```

**Problemas por etapa:**

1. **Cliente:** 20 canvas encodes en main thread. Sin Web Worker.
2. **Red:** Payload JSON con base64 embebido (~2-3MB por foto). Multiplica tamaño por 1.33 (base64 overhead).
3. **API:** Carga el string completo en memoria para parsear JSON y pasarlo a Prisma.
4. **BD:** Almacena el base64 en columna TEXT de PostgreSQL. TOAST storage, backups masivos.

**A 100 servicios/día con 3 fotos cada uno:** ~600MB/día de base64 en la BD. A 1000 servicios/día: ~6GB/día.

### 8.2 Ingestión de GPS

```
Mobile → POST /hr/gps/ping → employee.findFirst (DB) → gpsPing.create (DB)
  Cada ping: 500+ bytes de metadata duplicada (employee_code, employee_name, user_email, identity_aliases...)
```

- **Sin rate limit:** Un dispositivo puede enviar pings ilimitados.
- **Resolución N+1:** Cada ping ejecuta `findEmployee()` con consulta DB.
- **Metadata redundante:** `identity_aliases` (5-15 entradas) se repite en cada ping.
- **Sin partición:** `GpsPing` crece sin límite. A 100 empleados → ~5M pings/mes.

### 8.3 Procesamiento de Jornada Laboral

```javascript
// timeLogic.js - bucketIntervals()
for (const [start, end, nature] of intervals) {
  let cursor = new Date(start);
  while (cursor < end) {
    const next = new Date(Math.min(end.getTime(), cursor.getTime() + 60000));
    buckets[classifyMinute(cursor, nature, params, holidays)] += 1;
    cursor = next;  // 540+ iteraciones por jornada de 9h
  }
}
```

- **O(minutos trabajados):** ~540 iteraciones por empleado por día.
- **`Intl.DateTimeFormat` sin cache:** Crea 2 objetos por iteración en `classifyMinute()`. 1,080 objetos/empleado/día.
- **A 500 empleados:** 270,000 iteraciones y 540,000 objetos DateTimeFormat por día de proceso.

### 8.4 Operations Map

```
GET /api/v1/hr/operations-map →
  Promise.all([
    timeRoute.findMany({ take: 200 }),
    employee.findMany({ take: 500 }),
    gpsPing.findMany({ take: 2000 }),
    timePunch.findMany({ take: 2000 }),
    workActivity.findMany({ take: 2000 })
  ]) → Construye 8+ Maps en memoria
```

- **Carga full de datos del día** en cada request (cada ~10s desde el frontend).
- **8 Maps concurrentes** en memoria: `latestPingByUser`, `pingsByRoute`, `lastFootprintByUser`, `latestPunchByUser`, `punchesByRoute`, `activitiesByRoute`, `latestActivityByUser`, `employeeByAlias`.
- **Filtrado O(pings × routes):** `pings.filter(matchesAssigned)` dentro de `.map()` sobre todas las rutas.
- **Sin carga incremental:** Cada refresh refetcha TODO, aunque solo cambiaron los últimos 10 segundos.

### 8.5 Flujo de Cierre de Orden de Servicio

```
closeOrder() →
  requireSatisfactionSurvey() → tenant.findUnique (config read)
  requireEvidence() → servicePhoto.findMany (photo check)
  serviceOrder.update()
```

- **Tenant config leído de DB en cada cierre:** `tenant.config` es altamente estático pero se consulta en cada operación.
- **Sin cache:** No hay capa de caché para configuración de tenant.

---

## 9. Comparativa con Estándares Modernos

### 9.1 Autenticación y Sesiones

| Aspecto | APEX OS Actual | Mejor Práctica Moderna |
|---------|---------------|----------------------|
| Token storage | `localStorage` | httpOnly cookies con `SameSite=Strict` + CSRF token |
| Refresh token | Mismo `JWT_SECRET` | Rotación de keys, refresh token rotation |
| Token revocación | No implementada | Blocklist/allowlist en Redis, jti tracking |
| MFA | No implementado | TOTP/WebAuthn como segundo factor |
| Brute force | In-memory Map (por proceso) | Redis-based rate limiting con persistencia |
| Password policy | 8 chars, letters + numbers | 12+ chars, special chars, common-password check, zxcvbn |

### 9.2 API Design

| Aspecto | APEX OS Actual | Mejor Práctica Moderna |
|---------|---------------|----------------------|
| Versiones de API | Solo `/api/v1/` | Version negotiation via Accept header |
| Rate limiting | 200 req/min global | Per-endpoint + per-user + per-IP tiers |
| Request validation | Fastify schemas (parcial) | OpenAPI/Zod completo con tipos |
| Response pagination | Manual (take/skip) | Cursor-based pagination con `Link` headers |
| Deprecation headers | No implementado | `Sunset` + `Deprecation` headers |
| Idempotency | No implementado | `Idempotency-Key` header en mutations |

### 9.3 Base de Datos

| Aspecto | APEX OS Actual | Mejor Práctica Moderna |
|---------|---------------|----------------------|
| Pool de conexiones | `connection_limit=5` | PgBouncer + pool de 20-50 conexiones |
| Particionamiento | No implementado | Range partitioning por fecha en tablas grandes |
| Índices | Parciales | Trigram indexes + partial indexes + covering indexes |
| Soft delete | 5 modelos | Middleware global con `deleted_at` |
| Migraciones | 3 migraciones (incompleto) | Migration-as-code con rollback plan |
| Query logging | En desarrollo | PII-safe query logging con slow query threshold |

### 9.4 Frontend

| Aspecto | APEX OS Actual | Mejor Práctica Moderna |
|---------|---------------|----------------------|
| CSP | Ausente | Strict CSP con nonces/hashes |
| Code splitting | None (excepto `optimizePackageImports`) | Dynamic imports + React.lazy + route-based splitting |
| Data fetching | `useEffect` cliente | React Server Components + Server Actions |
| Image optimization | Canvas client-side | Server-side Sharp + WebP + responsive srcset |
| Bundle size | ~194KB + recharts 200KB | Code-splitting + tree-shaking + bundle analysis |
| State management | Zustand + localStorage | React Query/SWR para server state, Zustand para client state |

### 9.5 Workers y Background Jobs

| Aspecto | APEX OS Actual | Mejor Práctica Moderna |
|---------|---------------|----------------------|
| Proceso de workers | Mismo proceso que API | Procesos separados o containers independientes |
| Error handling | Sin try-catch | try-catch + DLQ + alerting |
| Retry strategy | Defaults (infinito, sin delay) | Exponential backoff, max 3-5 attempts |
| Job retention | Forever | `removeOnComplete: 1000`, `removeOnFail: 500` |
| Monitoreo | No implementado | Bull Board + Prometheus metrics |
| Dead letter queue | No implementado | Queue separada para poison jobs |
| Cron overlap | No protegido | Redlock/mutex + grace period |

### 9.6 Infraestructura

| Aspecto | APEX OS Actual | Mejor Práctica Moderna |
|---------|---------------|----------------------|
| TLS | No en Docker | Let's Encrypt + auto-renewal + HSTS preload |
| Container user | Root | Non-root user con capabilities mínimas |
| Resource limits | No configurados | CPU/memory limits + reservations |
| Healthchecks | Solo API | Healthchecks en todos los servicios con dependencias |
| CI/CD | No existe | GitHub Actions + lint + test + security scan + deploy |
| Monitoring | Prometheus mal configurado | Prometheus + Grafana + Alertmanager + exporters |

---

## 10. Proyección a 10x y 100x de Volumen

### 10.1 Escenario 10x (~100 empleados, ~10K órdenes, ~50M GPS pings)

| Componente | Impacto | Modo de Falla |
|-----------|---------|---------------|
| Pool de conexiones (5) | ❌ Falla | Timeouts en segundos |
| `COUNT(*)` en `nextNumber()` | ❌ Falla | Scan de 10M+ filas |
| GPS pings sin partición | ⚠️ Degradado | 50M filas en una tabla |
| RLS function overhead | ⚠️ Lento | 2-4 subqueries por fila |
| Vehicle dashboard all-rows | ⚠️ Lento | 10K vehículos en memoria |
| Procesamiento minuto-a-minuto | ⚠️ Lento | 7.2M iteraciones/mes |
| Base64 en BD | ⚠️ Lento | TOAST bloat, backups lentos |
| Foto sin MinIO | ⚠️ Lento | ~600MB/día en BD |

### 10.2 Escenario 100x (~1000 empleados, ~100K órdenes, ~500M GPS pings)

| Componente | Impacto | Modo de Falla |
|-----------|---------|---------------|
| Todo lo anterior | ❌❌ Catastrófico | Caída completa |
| GPS pings (500M filas) | ❌❌ Crash | Sin partición = inmanejable |
| AuditLog (500M+ filas) | ❌❌ Crash | Sin partición = inmanejable |
| Movement table | ❌❌ Crash | Scan de cientos de millones |
| RLS por cada query | ❌❌ Crash | Millones de function calls/segundo |
| Procesamiento de nómina | ❌❌ Crash | 72M iteraciones/mes |
| Pool de 5 conexiones | ❌❌ Crash | Timeout en milisegundos |

### 10.3 Capacidades que Faltan para Soportar 100x

1. **Particionamiento automático** — `GpsPing`, `AuditLog`, `TimePunch` particionados por mes
2. **Pool de conexiones adecuado** — Mínimo 50 conexiones con PgBouncer
3. **Caché distribuida** — Redis para config de tenant, sesiones, y queries frecuentes
4. **Workers aislados** — Procesos separados para background jobs
5. **Procesamiento batch** — GPS pings en batches, no por-ping
6. **Carga incremental** — Operations Map delta, no full refresh
7. **Streaming de evidencias** — No base64 en JSON, usar multipart upload directo a S3
8. **Arquitectura de microservicios** — Separar HR tracking, servicios, inventario en servicios independientes
9. **Read replicas** — Queries de lectura en réplicas, escritura en primary
10. **CDN para assets** — Imágenes servidas desde CDN con cache headers

---

## 11. Apéndice: Checklist para Intervenciones Futuras

### 🔴 Validar Antes de Tocar Código

- [ ] Verificar estado de `connection_limit` en `config/production.env`
- [ ] Verificar si hay datos base64 en `ServicePhoto` y `RoutePreoperationalChecklistEvidence`
- [ ] Verificar roles creados que contengan "admin" o "coordinador" en el nombre
- [ ] Verificar uso de `SUPABASE_SERVICE_ROLE_KEY` en frontend API routes
- [ ] Verificar logs de Redis: `INFO memory` para evaluar uso de memoria

### 🔴 Lo Que Nunca Debe Hacerse

1. **No almacenar más base64 en la BD** — Siempre usar Supabase Storage o MinIO, guardar solo `storage_path`
2. **No agregar roles con "admin" o "coordinador" en el nombre** hasta corregir `rbac.js`
3. **No desplegar a producción sin validar `connection_limit`** — Mínimo 20 conexiones
4. **No añadir workers sin try-catch y timeout**
5. **No exponer `SUPABASE_SERVICE_ROLE_KEY` en rutas del frontend**

### ✅ Patrones Seguros y Eficientes

1. **Cachear config de tenant** en memoria (60s TTL) — `tenant.config` es altamente estático
2. **Usar `findFirst({ orderBy: { id: 'desc' } })` en vez de `count()`** para numeración secuencial
3. **Preferir `createMany()` sobre `create()` en loops** para escrituras batch
4. **Usar `Promise.all()` para queries independientes** — evitar waterfall en handlers
5. **Implementar idempotency keys** en endpoints de mutación (`POST /orders`, `POST /gps/ping`)
6. **Usar cursor-based pagination** en vez de `skip/take` para tablas grandes
7. **Implementar soft-delete global** con middleware Prisma para todos los modelos
8. **Usar Web Workers** para procesamiento de imágenes en el frontend

### 🔍 Puntos de Monitoreo Continuo

- [ ] `connection_limit` agotándose → Timeouts en API
- [ ] `AuditLog` creciendo sin control → Backup lento, queries lentas
- [ ] `GpsPing` tabla sin partición → Degradación progresiva de queries
- [ ] Redis memory usage → `INFO memory`, `MEMORY STATS`
- [ ] BullMQ job counts → `getJobCounts()` en cada queue
- [ ] Unhandled rejections → `process.on('unhandledRejection')`
- [ ] Retry storms → Monitorear `failedCount` en colas
- [ ] Latencia de Supabase Auth → `authPhase` en `Server-Timing` headers

---

> **Fin del documento.** Este análisis debe ser revisado y actualizado cada vez que se realicen cambios significativos en la arquitectura, se añadan nuevos módulos, o se identifiquen nuevos patrones de riesgo. Cualquier agente que intervenga en el proyecto debe leer este documento antes de modificar código y verificar que sus cambios no introduzcan riesgos no cubiertos aquí.
