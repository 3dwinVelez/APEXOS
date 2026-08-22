# Escenarios negativos — Correcciones Supabase

Fecha: 2026-08-21
Commit evaluado: `351431a`

Cubiertos por pruebas automatizadas del modulo (`apps/api/test/service-order-administrative-corrections.test.js`, 20/20 PASS) y por la logica del fallback Supabase:

1. Permiso insuficiente: un rol sin `services.orders.edit_any_state` recibe 403 al intentar corregir.
2. Aislamiento entre empresas: una orden de otro tenant no se resuelve (404) ni se expone su historial.
3. Identificador vacio o invalido: 400 sin consultar Prisma.
4. Cambio sin diferencia real: 409 `SERVICE_CORRECTION_NO_CHANGES`.
5. Version desactualizada: 409 `SERVICE_ORDER_VERSION_CONFLICT` (no sobrescribe).
6. Motivo invalido, descripcion corta, confirmacion ausente o version no entera: 400.
7. Evidencia con tipo no permitido por el constraint Supabase: se normaliza a `novedad` con `metadata.original_type` preservado.
8. Correccion no aplicable (estado no `DRAFT`/`APPROVED`): error controlado.
9. Transicion de estado no permitida o hacia el mismo estado: error controlado.
10. Rechazo con menos de 8 caracteres: error controlado.

## Pendiente en vivo

- Reproducir en el QA desplegado el 404 original y confirmar que desaparece tras la correccion (requiere sesion navegador en QA).
- Probar negativos visibles en QA: rol sin permiso, orden de otro tenant, y orden UUID con evidencias.
