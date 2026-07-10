# Auditoría Profunda: Módulo Talento Humano (M-17) — Producción

**Fecha:** 2026-07-10  
**Ramas auditadas:** `main`, `develop`, `desarrollo`  
**Commit base:** `b8831b1`  
**Tipo:** Auditoría de calidad + corrección de bugs silenciosos  
**Auditor:** QA Engineering — Análisis línea por línea de frontend (Next.js) y backend (Fastify/Prisma)

---

## Resumen de Hallazgos

| # | Bug | Área | Severidad | Estado |
|---|---|---|---|---|
| 1 | `createGpsPing` auto-creaba empleados dummy cada 30s | `service.js` | **Crítico** | ✅ Corregido |
| 2 | `reportes/page.tsx` usaba `supabaseFetch` directo bypassando tenancy/RBAC | Frontend (reportes) | **Crítico** | ✅ Corregido |
| 3 | `timeLogic.classifyMinute` usaba `date.getHours()` local del servidor, no Colombia | `timeLogic.js` | **Alto** | ✅ Corregido |
| 4 | `createPunch` calculaba `extraMinutes` con timezone local del servidor | `service.js` | **Alto** | ✅ Corregido |
| 5 | `timeString()` usaba `.toTimeString()` local, no Colombia | `service.js` | **Alto** | ✅ Corregido |
| 6 | GPS Ping en frontend no limpiaba promesas post-desmontaje ni notificaba errores | `marcacion/page.tsx` | **Medio** | ✅ Corregido |
| 7 | Tipos `Punch` en reportes incompatibles con API (usaban `punch_type`, `employee_id`) | `reportes/page.tsx` | **Alto** | ✅ Corregido |
| 8 | Filtro de empleados en reportes roto (comparaba por ID numérico, no por nombre) | `reportes/page.tsx` | **Medio** | ✅ Corregido |
| 9 | Employee lookup en report rows usaba `employeesById` pero API devuelve `user_name` | `reportes/page.tsx` | **Alto** | ✅ Corregido |
| 10 | `work-activities` en reportes filtraba por `metadata.activity_type_name` inexistente | `reportes/page.tsx` | **Medio** | ✅ Corregido |

---

## Bug 1 — Crítico: Auto-creación de empleados en GPS Ping

**Archivo:** `apps/api/src/modules/hr/service.js` — función `createGpsPing()`

**Problema:** Cada ping GPS (cada 30s por dispositivo) llamaba a `resolveEmployeeForPunch()` que **crea un empleado nuevo** si no encuentra uno existente. Esto contaminaba el maestro de empleados con registros dummy como `{ code: "user_name", salary_base: 0 }`.

**Corrección:** Reemplazado por `findEmployee()` que solo busca, nunca crea. `employee_id` se deja como `null` si no hay match.

```diff
- const employee = await resolveEmployeeForPunch(tenantId, input);
+ let employeeId = null;
+ const employee = await findEmployee(input).catch(() => null);
+ if (employee) employeeId = employee.id;
```

**Impacto:** Elimina la creación de ~2880 empleados dummy/mes por dispositivo activo.

---

## Bug 2 — Crítico: Reportes bypassando seguridad

**Archivo:** `apps/web/app/dashboard/talento-humano/reportes/page.tsx`

**Problema:** Usaba `supabaseFetch()` directo a Supabase REST (`/rest/v1/employees`, `/rest/v1/time_punches`, etc.), omitiendo:
- Middleware de tenencia multi-tenant
- Middleware RBAC (verificación de permisos)
- Lógica de negocio del backend Fastify

**Corrección:** Migrado completamente a `api()` del backend Fastify, usando:
- `GET /api/v1/hr/employees?active=true`
- `GET /api/v1/hr/attendance`
- `GET /api/v1/hr/work-activities?limit=500`
- `GET /api/v1/hr/routes`

**Impacto:** Restaura la seguridad multi-tenant y RBAC. Elimina riesgo de fuga de datos entre empresas.

---

## Bug 3 — Alto: Timezone incorrecto en clasificación de minutos

**Archivo:** `apps/api/src/modules/hr/timeLogic.js` — función `classifyMinute()`

**Problema:** Usaba `date.getHours()` que devuelve la hora local del servidor. Si el servidor está en UTC (común en contenedores/serverless), todas las clasificaciones nocturnas/extra se calculaban incorrectamente para Colombia (UTC-5).

**Corrección:** Implementado `Intl.DateTimeFormat` con `timeZone: "America/Bogota"` para obtener hora, minuto, fecha y día de la semana correctos para Colombia.

**Impacto:** Cálculo correcto de recargos nocturnos, horas extra, dominicales y festivos.

---

## Bug 4 — Alto: Timezone incorrecto en cálculo de minutos extra

**Archivo:** `apps/api/src/modules/hr/service.js` — dentro de `createPunch()`

**Problema:** El cálculo `punchedAt.getHours() * 60 + punchedAt.getMinutes()` usaba la hora local del servidor, no Colombia.

**Corrección:** Implementado `Intl.DateTimeFormat` con `timeZone: OPERATING_TIMEZONE` para obtener la hora real en Colombia.

**Impacto:** Cálculo preciso de horas extra para justificación laboral.

---

## Bug 5 — Alto: timeString() inconsistente con timezone

**Archivo:** `apps/api/src/modules/hr/service.js` — función `timeString()`

**Problema:** `new Date(date).toTimeString().slice(0, 5)` devuelve la hora local del servidor, no Colombia.

**Corrección:** Reemplazado por `Intl.DateTimeFormat("es-CO", { timeZone: OPERATING_TIMEZONE, ... })`.

**Impacto:** Consistencia en todos los reportes y vistas que muestran horas de marcación.

---

## Bug 6 — Medio: GPS Ping memory leak y error silencioso

**Archivo:** `apps/web/app/dashboard/talento-humano/marcacion/page.tsx`

**Problema:**
1. Las promesas de `getGpsFix()` y `api()` podían ejecutarse después de desmontar el componente
2. Los errores se tragaban con `.catch(() => undefined)` sin feedback al usuario
3. El timer `setInterval` no manejaba correctamente el estado de montaje

**Corrección:**
- Variable `mounted` para evitar setState post-desmontaje
- `.catch()` actualiza `gpsStatus("error")` para feedback visual
- Timer cleanup con mounted flag

**Impacto:** Sin memory leaks, el usuario ve cuándo falla el GPS.

---

## Bugs 7-10 — Alto/Medio: Reportes con tipos rotos

**Archivo:** `apps/web/app/dashboard/talento-humano/reportes/page.tsx`

**Problemas:**
- Tipos `Punch` tenían `punch_type` y `employee_id` que la API de Fastify no devuelve (usa `type` y `user_name`)
- Employee lookup por ID numérico pero API agrupa por `user_name`
- Filtro comparaba `row.employeeId !== employeeFilter` pero ambos podían diferir en tipo
- Actividades filtradas por `metadata.activity_type_name` que no existe en la API

**Corrección:** Reescribir `useMemo` para usar `user_name` como clave de agrupación, lookup de empleados por nombre, y tipos alineados con lo que realmente devuelve la API.

---

## Documentación actualizada

Se actualizó este documento de auditoría en `docs/audits/TALENTO_HUMANO_DEEP_AUDIT_PROD.md`.

---

## Próximas mejoras recomendadas (no críticas)

1. **Tipos compartidos:** Crear un archivo `apps/web/lib/hr-types.ts` para evitar las 5+ definiciones inline del mismo tipo
2. **Paginación real:** Implementar cursor-based pagination en `listRoutes`, `listEmployees`, `listWorkActivities`
3. **AbortController:** Usar `AbortController` en todos los `useEffect` con fetch para cancelar calls obsoletas
4. **Validación de fecha futura:** En `rutas/page.tsx`, validar que `form.date` no sea pasada
5. **Cache de tiles:** Implementar caché de tiles OSM en `mapa/page.tsx` para evitar redibujar en cada render
6. **Transacción atómica en createPunch:** Envolver `timePunch.create` + `workSession.create` en una transacción Prisma
