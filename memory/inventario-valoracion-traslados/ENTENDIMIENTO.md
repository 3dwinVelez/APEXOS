# Entendimiento funcional: inventario, valoración y traslados

## Objetivo

Controlar existencias y costos por SKU y sociedad, con trazabilidad documental y visibilidad por bodega, incluyendo mercancía en tránsito.

## Documento de traslado

La cabecera contiene:

- Número único.
- Sociedad.
- Bodega de origen.
- Bodega de destino.
- Motivo.
- Estado y fechas de creación, despacho y descarga.

El detalle contiene una o varias líneas:

- SKU.
- Cantidad.
- Unidad.
- Costo vigente capturado al crear el traslado.

Cada SKU puede aparecer una sola vez dentro del mismo documento. El origen y el destino deben pertenecer a la misma sociedad.

## Ciclo del traslado

1. Borrador: documento creado, sin afectar existencias.
2. En tránsito: el despacho resta todas las líneas del origen y las suma a la ubicación técnica de tránsito.
3. Descargado: la descarga completa resta tránsito y suma todas las líneas al destino.

No se permiten descargas parciales ni movimientos directos que omitan tránsito.

## Pantallas

- Inventario > Traslados: reporte documental, filtros, estados, despacho, descarga y detalle por doble clic.
- Inventario > Traslados > Nuevo traslado: captura independiente de cabecera y múltiples líneas.
- Inventario > Reportes: kárdex, stock por bodega y mini reporte de costos.

## Filtros del reporte de traslados

- Fecha inicial y final.
- Bodega de origen.
- Bodega de destino.
- Estado.

## Drill-down

- Doble clic en el número de traslado: muestra cabecera, estado, fechas y líneas.
- Doble clic en el SKU: muestra cantidades separadas por bodega, ubicación y tránsito.
- Doble clic en el documento del kárdex: muestra información del movimiento y, para traslados, todas las líneas del documento.

## Presentación

- Todos los conceptos funcionales se muestran en español.
- Las bodegas se presentan en filas independientes en el mini reporte de costos.
- El tránsito se muestra como una ubicación separada y claramente identificada.

## Reglas de costo

- Se mantienen tipos Float.
- Compras ingresan al costo de la línea de la orden de compra.
- Ventas reconocen el promedio vigente por SKU y sociedad.
- Los traslados no cambian el costo promedio ni el valor total de la sociedad.
