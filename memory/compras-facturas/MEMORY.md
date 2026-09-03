# Compras y facturas

## Decisiones vigentes

- Los proveedores comparten el tercero contable, usan tipos de documento y ciudades activos del maestro de Contabilidad, DV calculado, categoría editable y condición de pago AP.
- El contacto para la orden de compra (nombre, teléfono y correo) pertenece al proveedor y es editable desde su ficha individual.
- El directorio de proveedores es solo consulta; la edición se abre desde `Ver información`.
- La OC busca proveedor por NIT o nombre, presenta su nombre como solo lectura y permite búsqueda modal con Enter.
- Las posiciones muestran SKU, cantidad pedida y entregada. La recepción admite parciales y búsqueda multífiltro de OC pendiente.
- La factura de compra integrada con OC toma el costo de la línea de la orden y contabiliza contra EM/RF. El reporte es por posición y exportable.
- Anular una factura exige motivo, asiento inverso, compensación de CXP y auditoría de usuario/fecha/hora. No se anula una factura con aplicaciones o pagos.

## 2026-09-03

- Se sincronizó `desarrollo` con la versión de QA en `origin/develop` preservando cambios locales.
- Se añadieron maestros de categorías de proveedor y condiciones AP, ficha de proveedor, búsqueda asistida de OC, reporte de facturas y anulación.
