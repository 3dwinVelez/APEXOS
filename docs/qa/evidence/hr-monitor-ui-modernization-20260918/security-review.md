# Revisión de seguridad — hr-monitor-ui-modernization-20260918

Cambio revisado: modernización del monitor de mallas horarias
- `apps/web/app/dashboard/talento-humano/rutas/page.tsx` (drawer rediseñado: chips de marcación, timeline con íconos/puntualidad/GPS, evidencias en batch con thumbnails + lightbox, badges KPI)
- `apps/api/src/modules/hr/service.js` + `routes.js` (nuevo `GET /hr/monitor-evidence/route/:routeId` batch)
- `apps/api/test/hr-monitor-evidence-demand.test.js` (3 pruebas nuevas)

## Hallazgos

### 1. XSS almacenado vía `file_url` — Severidad: Media — CORREGIDO
- **Riesgo:** `file_url` proviene de `metadata.extra_evidence` de marcaciones controladas por el cliente; renderizarlo en `<a href>` sin validar el esquema permitía `javascript:` URLs.
- **Mitigación aplicada:** `safeEvidenceUrl()` en `rutas/page.tsx` valida `/^https?:\/\//i` antes de renderizar o contar cualquier enlace de evidencia. Los enlaces externos usan `target="_blank" rel="noreferrer"`.

### 2. RBAC del endpoint batch — Sin hallazgos
- `GET /hr/monitor-evidence/route/:routeId` exige `hr:read` vía `requirePermission` (verificado 403 para rol "Empleado marcaciones", que solo tiene `time_tracking`).

### 3. Aislamiento de tenant — Sin hallazgos
- Todas las consultas del batch filtran por `tenant_id` explícito (TimePunch y WorkActivity + evidencia relacionada). Verificado con prueba cross-tenant: otro tenant obtiene conteos vacíos.

### 4. Validación de entrada — Sin hallazgos
- `routeId` no numérico se rechaza con 400 `EVIDENCIA_MONITOR_RUTA_INVALIDA` antes de consultar la base de datos.

### 5. Imágenes base64 — Información
- Los thumbnails se renderizan vía `next/image` con `unoptimized`; el contenido es `data:image/*` generado por el servidor desde registros con tamaño acotado (MAX_EVIDENCE_BYTES en la API). No se renderiza HTML del cliente.

## Hallazgo preexistente fuera de alcance (reportado al usuario)

- `createPunch` (service.js:1954-1966) inserta en `th_jornada_kilometrajes` con `ON CONFLICT (tenant_id, route_id, employee_id, active) WHERE active=true`, pero el índice de la migración `20260917120000_hr_workday_novelties_foundation` es parcial sobre `COALESCE(route_id,-1), COALESCE(employee_id,-1)` → error 42P10 que aborta la transacción y produce 500 en cualquier marcación de salida con placa y kilometraje. El error se traga con `.catch(() => null)` y la transacción falla después (25P02). Código presente en `main` (commit d704110). Requiere corrección separada con su propia certificación.
- La base de datos local de desarrollo carecía de las tablas `th_*` de la migración (nunca aplicada localmente); se aplicó el SQL idempotente de la migración (`CREATE TABLE IF NOT EXISTS` + índices + catálogos) sin tocar datos existentes.

## Veredicto

Sin hallazgos bloqueantes para el cambio de modernización del monitor. Los hallazgos propios del cambio fueron corregidos antes de la certificación (safeEvidenceUrl). El hallazgo 42P10 es preexistente, está en producción y queda pendiente de una corrección separada con autorización.
