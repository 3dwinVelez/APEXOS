# Certificación local — UI/UX Fase 1

Fecha: 2026-09-08
Rama: `desarrollo`
Estado: implementación e inspección visual local completas.

## Alcance implementado

- Tokens semánticos de color, tipografía, espaciado, radios y sombras conectados con Tailwind.
- Button, Input, Select y Textarea con estados coherentes de foco, deshabilitado, carga y error accesible.
- Card, Tabs, Modal, Drawer, Toast, Badge, Avatar y Skeleton como biblioteca compartida.
- Modal con retorno de foco, cierre por Escape y contención de navegación por Tab.
- `SmartDataTable` con selección individual/de página, ordenamiento, paginación, acciones masivas y configuración de columnas persistida localmente.
- Aplicación inicial del DataTable al maestro de Productos, incluyendo exportación masiva de la selección.
- Formulario simple de orden de venta normalizado a dos columnas con validación `onBlur`.
- Formulario extenso de Producto dividido en Datos básicos, Existencias y Operación.
- Navegaciones de Inventario, Compras y Ventas con tabs horizontales adaptables, sin recorte en pantallas estrechas.
- Centro global con contador e historial persistente de las notificaciones generadas por los toast.

## Evidencia automatizada

- `node --test apps/web/test/login-phase-zero-ux.test.mjs apps/web/test/phase-one-design-system.test.mjs`: 23/23 aprobadas.
- `npm --workspace apps/web run typecheck`: aprobado.
- Lint del alcance: 0 errores; se retiró la única advertencia propia del cambio.
- `npm --workspace apps/web run build`: aprobado; 100 rutas generadas.
- `node apps/web/test/certify-ui-ux-phase-one-local.mjs`: 12/12 comprobaciones de navegador headless aprobadas; salida estructurada en `browser-certification.json`.

## Inspección visual autenticada

Se validaron con el perfil local `APEX_ADMIN`, sin enviar formularios ni modificar datos:

- Productos en escritorio: tabla, selección, orden por Nombre, acciones masivas y panel de columnas visibles.
- Nuevo producto: progreso y navegación por los tres pasos; se usó texto temporal únicamente en estado local y no se ejecutó ninguna acción de creación.
- Nueva orden de venta: distribución en dos columnas y aparición del mensaje accesible al abandonar Cliente sin selección.
- Inventario, Compras y Ventas en 390 × 844 px: tabs con desplazamiento horizontal controlado y cero overflow del documento.
- Centro de notificaciones: apertura del Drawer, estado vacío, controles con nombre y adaptación móvil.
- Escaneo de controles en Productos, Nuevo producto y Nueva orden de venta: cero controles sin nombre accesible.
- Compras presentó inicialmente 21 campos de líneas sin nombre; se corrigieron el buscador, cantidades y costos unitarios. La repetición del escaneo devolvió cero controles sin nombre y cero overflow.

## Criterio de publicación

Esta evidencia certifica la implementación local. Antes de cualquier promoción se debe generar el manifiesto de alcance versión 2 contra el commit candidato y aprobar `npm run qa:promotion:scope` y `npm run qa:approval:evidence` conforme a la política del repositorio.
