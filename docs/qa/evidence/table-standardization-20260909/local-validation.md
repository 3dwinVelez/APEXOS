# Validación local — estandarización global de tablas

Fecha: 2026-09-09
Entorno: LOCAL
Rama: `desarrollo`

## Resultado

- Inventario estático: 112 tablas distribuidas en 64 archivos TSX.
- Pruebas versionadas: 11/11 aprobadas.
- TypeScript: aprobado.
- ESLint dirigido: aprobado.
- Build de producción: aprobado, 101 rutas.
- Proveedores: un toolbar, contador y selector de 6 columnas.
- Stock: un toolbar, contador y selector de columnas.
- Precios de venta: un toolbar y contador.
- Productos: un `SmartDataTable` y cero toolbars heredados duplicados.
- Ocultar/restaurar una columna: 2 celdas ocultas y luego 0; preferencia restaurada.
- No se crearon, editaron ni eliminaron datos funcionales.

## Decisión de diseño

Los listados principales reciben el patrón global. Los editores de líneas, detalles y tablas dentro de formularios o diálogos se excluyen para no introducir selección, paginación o controles que cambien el significado de una operación transaccional.
