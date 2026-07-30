# APEXOS UI Screen Migration Matrix

Fecha: 2026-07-29

La matriz detallada de las 58 rutas, sus controles, estilos, riesgo y prioridad está en `APEXOS_UI_ADOPTION_INVENTORY.md`.

## Estado de decisión

| Grupo | Pantalla o flujo | Tipo | Estado | Medición | Decisión |
| --- | --- | --- | --- | --- | --- |
| Inventario | 58 rutas | Desktop/Mobile | Completado | 0 adopciones de las cuatro primitivas nuevas | No escalar |
| Piloto 1 | `/dashboard/administracion` Usuarios/Roles | Desktop, tabla extensa | Intentado y revertido | 23 kB antes y después; 179 kB First Load antes y después | Rechazado |
| Piloto 2 | `/dashboard/compras/proveedores` | Desktop, formulario | No iniciado | Bloqueado por Piloto 1 | Detenido |
| Piloto 3 | `/dashboard/servicios` | Desktop, filtros/operación | No iniciado | Bloqueado por Piloto 1 | Detenido |
| Mobile 1 | Servicios, órdenes asignadas | Mobile | No iniciado | Pilotos Desktop no aprobados | Detenido |
| Mobile 2 | Detalle y actividades | Mobile | No iniciado | Pilotos Desktop no aprobados | Detenido |
| Mobile 3 | Checklist/evidencia | Mobile | No iniciado | Pilotos Desktop no aprobados | Detenido |

## Clasificación consolidada

| Clasificación | Cantidad | Observación |
| --- | ---: | --- |
| No migrada | 57 | No importan las primitivas nuevas auditadas |
| Migración parcial | 0 | El cambio global de tokens no cuenta como migración de pantalla |
| Migrada con duplicación | 0 | No se aceptó ninguna coexistencia |
| Migrada correctamente | 0 | Ningún piloto alcanzó umbral |
| Excluida con justificación | 1 | `/dashboard/configuracion` es un placeholder |

## Regla de reapertura

La migración solo puede reanudarse cuando una propuesta para Administración:

1. reduzca el JavaScript de ruta o justifique equivalencia con mejora medible de DOM/renders;
2. cuente con una sesión QA reproducible;
3. mida cinco repeticiones;
4. mantenga usuarios, roles y permisos;
5. pase pruebas funcionales y de accesibilidad.

