# Certificación local — cierre UI/UX Fase 0

Fecha: 2026-09-08
Rama: `desarrollo`
Alcance: Login, Inventario, Compras y Ventas.

## Recorrido manual

Se recorrieron con una sesión local autenticada las siguientes rutas:

- `/dashboard/inventario`
- `/dashboard/inventario/productos`
- `/dashboard/inventario/productos/nuevo`
- `/dashboard/inventario/stock`
- `/dashboard/inventario/ajustes/nuevo`
- `/dashboard/inventario/traslados/nuevo`
- `/dashboard/inventario/cargue-inicial`
- `/dashboard/compras`
- `/dashboard/compras/ordenes/nueva`
- `/dashboard/ventas`
- `/dashboard/ventas/ordenes/nueva`

Las once rutas fueron verificadas en escritorio y en viewport móvil de 390 × 844 px. No se detectó overflow horizontal del documento. La inspección del árbol accesible confirmó navegación, encabezados y nombres de los controles prioritarios. La orden de venta móvil se verificó visualmente después de completar la carga de permisos.

También se validó el cambio al tema claro desde las preferencias de cuenta. El documento aplicó `data-theme="light"`, fondo `rgb(245, 247, 249)` y texto `rgb(23, 33, 43)`. El contrato automatizado cubre las superficies claras y oscuras del login y la preferencia de movimiento reducido.

## Hallazgo y corrección

La pantalla de Stock tenía filtros `<select>` sin nombre accesible y el resultado filtrado no se anunciaba. Se agregaron nombres explícitos al buscador y a los tres selectores, `role="alert"` al error de carga y una región `role="status"` para el conteo de referencias.

## Evidencia automatizada

- `node --test apps/web/test/login-phase-zero-ux.test.mjs`: 17/17 aprobadas.
- `npm --workspace apps/web run typecheck`: aprobado.
- `npm run lint -- app/dashboard/inventario/stock/page.tsx test/login-phase-zero-ux.test.mjs` desde `apps/web`: 0 errores; 9 advertencias preexistentes fuera del alcance.
- `npm --workspace apps/web run build`: aprobado; 100 rutas generadas.

## Resultado

Fase 0 cerrada localmente. El seguimiento funcional queda marcado como terminado en `docs/design/APEX_OS_UI_UX_ROADMAP_CHECKLIST.md`. Este cierre no implica promoción ni despliegue.
