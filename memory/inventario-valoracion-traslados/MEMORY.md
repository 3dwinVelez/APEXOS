# Inventario, valoración y traslados

## Decisiones vigentes

- Los importes continúan en `Float`; no migrar a Decimal sin nueva autorización.
- El costo es por SKU y sociedad, con promedio ponderado. Compras usa costo de la OC; ventas usa la valoración vigente.
- Productos usan familia contable y árbol categoría → subcategoría → línea → sublínea; marca y referencia son independientes.
- Precio de venta se administra desde Ventas, no desde el maestro de Inventario. Costo se forma con movimientos.
- Un producto solo puede cerrarse si no tiene stock ni OC abiertas; cerrado no admite operaciones.
- Un traslado se crea directamente en tránsito: descuenta origen al crear y suma destino únicamente al descargar completo. No hay descarga parcial.
- Kardex por bodega resta el traslado inmediatamente y lo denomina `Traslado`.
- Kardex y costos son funcionalidades y rutas separadas, con filtros por SKU y bodega; Kardex además usa rango de fechas.

## 2026-09-03

- Se incorporaron maestro de clasificación, ficha separada de producto, cierre controlado, precio de ventas con Excel, bodegas con país/ciudad de maestro y rutas separadas de reportes.
