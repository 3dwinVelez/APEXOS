# Memoria de inventario: valoración y traslados

Leer este archivo antes de cambiar costos, movimientos, reportes o traslados de inventario.

## Decisiones confirmadas

- La captura consecutiva de traslados permite buscar SKU por codigo/nombre, consultar disponibilidad en origen y crear otro documento conservando las bodegas. No se agrega soporte de escaner.
- El grid de creación de traslados separa código y nombre: valida el código contra el maestro, completa el nombre automáticamente y ofrece un buscador funcional por código o nombre.
- Inventario incluye una lista de productos filtrable por texto, familia y estado, con exportación a Excel de las filas visibles.
- En Kardex, el producto se ingresa como código SKU libre; Enter vacío abre el selector de todos los SKU y un código inexistente muestra error.
- El documento de traslado se puede exportar como remision PDF. Identifica origen, destino y tipo de cada bodega, muestra SKU y cantidades, y reserva espacios para observaciones fisicas y firma del receptor.
- El cargue inicial se realiza desde una plantilla Excel validada antes de confirmar. Cada archivo usa una sociedad y fecha, actualiza stock, ubicacion, kardex y valoracion, y contabiliza debito a inventario de alta por familia contra credito a la cuenta puente `99999999` en un comprobante `AJ` atomico e irrepetible.

- Mantener los campos monetarios y de cantidades en `Float`; no migrarlos a `Decimal`.
- La valoración y el costo promedio son por combinación de SKU y sociedad.
- Las entradas de compras usan el costo de la línea de la orden de compra.
- Las salidas por ventas reconocen el costo promedio vigente de la tabla de valoración por SKU y sociedad.
- Un traslado conserva cantidad total, valor total y costo promedio de la sociedad.
- Al despachar un traslado se descuenta inmediatamente la bodega de origen y se suma a una ubicación técnica de tránsito.
- La bodega de destino solo aumenta al descargar el traslado.
- La descarga es obligatoriamente completa; no se permiten recepciones parciales.
- Los movimientos directos de tipo `transfer` están prohibidos para impedir que se omita el tránsito.
- Creación, despacho y descarga deben ser idempotentes y conservar trazabilidad de origen, correlación, usuario y fecha.

## Implementación vigente

- Valoración: modelo `SkuValuation`, tabla `inv_sku_valuations`.
- Traslados: `WarehouseTransfer` y `WarehouseTransferLine`.
- Estados: `draft`, `in_transit`, `received`.
- API: `GET/POST /api/v1/inventory/transfers`, `POST /:id/dispatch` y `POST /:id/receive`.
- Interfaz: `Inventario > Traslados`.
- Reporte de costos: expone existencias físicas, en tránsito, disponibles, costo promedio y valor por sociedad.
- Migración: `20260721220000_inventory_society_valuation_transit`.

## Verificación

- `npm run test:inventory:unit`: promedio de compra, costo de venta, salida total, insuficiencia, conservación en traslado y contrato sin parcialidad.
- `npm run qa:inventory:transit`: despacho, tránsito, descarga completa, invariancia del costo e idempotencia con base de datos real.
- `npm run qa:purchases:tax-reversal`: regresión del flujo de compras, impuestos, devoluciones y anulaciones.

## Historial

### 2026-08-06 - Reportes por bodega y exportacion

- Kardex y costos deben incluir todos los SKU y admitir filtro transversal por bodega.
- Los reportes visibles se descargan en Excel respetando los filtros activos.
- El documento contable enlazado al movimiento abre cabecera, usuario, fechas, referencia y lineas del asiento dentro del detalle del Kardex.

### 2026-08-02 - Consulta documental transversal

- El numero de traslado abre el detalle con un clic simple, no requiere doble clic.
- El detalle identifica usuarios y fechas de creacion, despacho y descarga, ademas de sociedad, origen, destino, SKU, cantidades y costos.
- Los documentos del kardex y el SKU del reporte de stock tambien usan clic simple para sus respectivos drill-down.

### 2026-07-21

- Se implementó la valoración por SKU y sociedad sin cambiar `Float`.
- Se implementó el ciclo obligatorio origen -> tránsito -> destino con descarga completa.

### 2026-07-21 - Experiencia documental y reportes

- La creación de traslados vive en una página independiente del reporte de documentos.
- La cabecera contiene bodega origen, bodega destino y motivo.
- El detalle admite múltiples SKU con sus cantidades; un mismo SKU no se repite dentro del documento.
- El reporte de traslados permite filtrar por fechas, origen, destino y estado.
- Los estados visibles en español son Borrador, En tránsito y Descargado.
- El número del traslado abre su cabecera y líneas mediante doble clic.
- Los reportes de stock permiten doble clic en el SKU para desglosar cantidades por bodega y ubicación.
- Los documentos del kárdex permiten doble clic para consultar el detalle correspondiente al movimiento.
- El mini reporte de costos muestra una fila separada por bodega o tránsito; no concatena bodegas.
- Documento funcional detallado: memory/inventario-valoracion-traslados/ENTENDIMIENTO.md.
