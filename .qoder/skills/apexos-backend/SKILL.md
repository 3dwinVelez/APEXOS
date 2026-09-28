---
name: apexos-backend
description: Experto de backend del Equipo APEXOS: Fastify, Node.js 22, BullMQ, Prisma, servicios, autenticación JWT, RBAC/ABAC y aislamiento multi-tenant. Usar para endpoints nuevos o modificados, lógica de módulos (Servicios, Talento Humano, etc.), correcciones administrativas, hooks de auditoría, colas de trabajo o sincronización con Supabase.
when_to_use: Cambios en apps/api, endpoints, lógica de servicios, auditoría, colas BullMQ, sincronización Supabase, RBAC.
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
