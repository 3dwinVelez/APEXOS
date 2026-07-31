# HR Route Tracking Metadata Route ID Fix

**Fecha:** 2026-07-23
**Auditor:** Validación automática HR Flow
**Tipo:** Bug fix + validación integral

## Bug encontrado

- **Archivo:** `apps/api/src/modules/hr/service.js` — función `getRouteTracking`
- **Problema:** La función buscaba punches y pings GPS solo por `route_id` numérico directo, ignorando registros donde el route_id solo existe en `metadata.display_route_id`, `metadata.route_code`, `metadata.legacy_route_id` o `metadata.source_route_id`.
- **Impacto:** Marcaciones y pings guardados desde la marcación móvil con display_route_id en metadata no aparecían en el Route Tracking, causando datos "huérfanos" en el seguimiento de rutas.
- **Corrección:** Reemplazar `route_id: Number(id)` por `...routeScopeWhere(id)` (función ya existente) que busca tanto por route_id directo como por los 4 campos de metadata.

## Validación ejecutada

Se ejecutó script `scripts/validate-hr-flow.js` con 50 pruebas que cubren:

1. Creación de usuarios con empleados vinculados (conductor y operario)
2. Creación de horarios, vehículos y rutas
3. Marcaciones conductor con checklist preoperacional (4 marcas + aprobación checklist)
4. Marcaciones operario sin checklist (4 marcas)
5. Actividades diarias (rechazo post-cierre)
6. Monitor Operations Map (verifica marcaciones y empleados en ruta)
7. Route Tracking (verifica punches vía route_id y metadata route_id)
8. Attendance (verifica next_type null en jornada completa)
9. Work Sessions (verifica sesión cerrada)
10. Procesamiento de jornada laboral
11. Edge cases (6 validaciones: ruta sin empleados, end<=start, fuera de secuencia, sin GPS, sin foto, sin identidad)

**Resultado:** 50/50 pruebas pasaron.

## Regresiones

- `scripts/seed-hr-map-demo.js` y `scripts/validate-hr-map-demo.js`: OK (mapa histórico y última huella)
- `scripts/qa-hr-services-linear-stress.js`: 28/28 tests HR OK (fallos solo en Servicios, preexistente)
