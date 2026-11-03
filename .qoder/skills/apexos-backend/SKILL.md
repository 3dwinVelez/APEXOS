---
name: apexos-backend
description: Experto de backend del Equipo APEXOS: Fastify, Node.js 22, BullMQ, Prisma, servicios, autenticación JWT, RBAC/ABAC y aislamiento multi-tenant. Usar para endpoints nuevos o modificados, lógica de módulos (Servicios, Talento Humano, etc.), correcciones administrativas, hooks de auditoría, colas de trabajo o sincronización con Supabase.
when_to_use: Cambios en apps/api, endpoints, lógica de servicios, auditoría, colas BullMQ, sincronización Supabase, RBAC.
version: 1.1.0
updated_at: 2026-11-02
---

# Experto de backend — Equipo APEXOS

## Referencias clave

- `apps/api/src/` — `core/`, `fabric/`, `middleware/`, `modules/`, `offline/`, `security/`
- `apps/api/server.js`, `apps/api/worker.js`, `packages/types/`
- `docs/NYVORA_RBAC_ABAC_MATRIX.md`, `docs/MULTITENANT_DATA_ISOLATION.md`, `docs/END_TO_END_PERFORMANCE_TRACING.md`

## Reglas

- Node.js 22 LTS obligatorio (`npm run doctor:node`). No introducir dependencias sin justificación.
- Toda respuesta expone `Server-Timing` (app, auth, tenant, autorización, Prisma) y `x-request-id`.
- La sincronización Supabase/Prisma solo escribe cuando usuario, rol, tenant o módulos cambian. Prohibido calcular bcrypt en cada request.
- El hook global de auditoría acepta operaciones sin cuerpo (no devolver 400 tras cambios de estado válidos). El cliente API no declara JSON en solicitudes sin cuerpo (evitar `FST_ERR_CTP_EMPTY_JSON_BODY`).
- Correcciones administrativas sobre órdenes: crearse como DRAFT en fallback Supabase y respetar `order_version` para concurrencia.
- Aislamiento de tenant y RBAC se validan juntos en toda corrección o cambio de estado (capacidades protegidas de Servicios).
- Identidad operativa: empleados reales usan `employee_id`, usuarios sin ficha usan `user_id`; UUIDs de Supabase nunca se convierten a IDs numéricos (`NaN`).
- Toda modificación incluye pruebas en el suite correspondiente (`apps/api/test/`).

## Controles acumulados (entrenamiento 2026-11-02)

- **Nómina y marcaciones (HR).** El motor vive en `apps/api/src/modules/hr/service.js`. Los topes y pisos de IBC se aplican también a la rama sin novedades segmentadas; `buildSocialContributionRows` no cae al salario: exige IBC reportado (409 `IBC_REPORTADO_REQUERIDO`) salvo modo tolerante. El cierre ejecuta liquidación → provisiones → aportes; sin documentos responde `skipped: "SIN_NOMINA"` y no inventa provisiones. Antes de tocar HR, leer `docs/audits/2026-10-30-marcaciones-nomina/07-ejecucion-remediacion.md` y correr la regresión `hr-*`.
- **Aislamiento de tenant.** No todas las tablas tienen RLS: el middleware `runWithTenant` es el único filtro. Toda consulta debe ejecutarse dentro del contexto del tenant; una lectura sin contexto puede devolver filas de otros tenants.
- **P2028 en transacciones de mallas.** El timeout de 5 s se agota por concurrencia, no por caída del servicio. Acortar la transacción, sacar trabajo de ella o idempotentizar; no inflar el timeout sin medición.
- **Doble almacén.** `TimeRoute` vs `operational_routes` y `Employee` vs `employees`; el cliente web cae en silencio a Supabase cuando la API rechaza. Un fix cubre ambos caminos o declara por qué no.
- **Alias de rutas.** `/hr/*` y `/talento-humano/*` duplican superficie: todo cambio de contrato se aplica a ambos o se documenta la divergencia.
- **Auditoría.** El hook global depende de Redis; sin Redis es noop. No usar la auditoría como evidencia de un flujo si Redis no estaba activo.
- **Pruebas.** `node:test` con Prisma falso inyectado en `require.cache`. `Prisma.join` anida `.values` (aplanar parámetros) y `tenantCache` exige `tenant.findUnique` en el fake. Un test que solo lee código fuente no prueba el endpoint.
- **Errores Prisma.** Un 500 por `_count` suele indicar relación inexistente o no declarada; revisar `schema.prisma` antes de parchear el handler.
