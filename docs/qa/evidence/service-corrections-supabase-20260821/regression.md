# Regresion — Correcciones Supabase

Fecha: 2026-08-21
Commit evaluado: `351431a`

## Flujos adyacentes verificados

1. Correcciones sobre ordenes locales Prisma (id numerico o `external_order_id`): sin cambios en el backend, cubiertas por `service-order-administrative-corrections.test.js` (20/20 PASS) y el certificador `service-master-correction-qa.js`.
2. `PUT /api/v1/services/orders/{uuid}` (edicion de orden Supabase): intacto, el fallback existente continua funcionando.
3. Flujo de evidencias locales: el panel conserva la ruta de autorizacion firmada + cuarentena para ordenes locales (sin cambios).
4. Flujo de evidencias Supabase: nueva ruta de storage directo, aislada por `isUuidOrder(order)`.
5. `reopen`/`force-close`: para ordenes locales el backend no cambio; para UUID se agrego el fallback.
6. Monitor de servicios y deduplicacion `mergeOrders`: sin cambios.
7. Build, typecheck y lint de toda la app web: PASS (el Prisma client regenerado destraba los tipos de `ServiceOrder.items`).

## Pendiente

- Regresion visual en QA desplegado del flujo `Corregir y anexar` para una orden UUID con evidencias, novedad de pieza y cambio de estado (requiere navegador en QA).
- Certificacion transversal de plataforma (`platform-regression-qa.js`) tras el despliegue a develop.
