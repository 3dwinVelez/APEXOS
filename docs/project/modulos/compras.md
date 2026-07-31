# Modulo Compras

## Revision de experiencia

- La pantalla principal ya funciona como panel de workspaces: orden de compra, recepcion y proveedores.
- Las funciones principales estan separadas por accesos claros y no mezclan formularios abiertos con consulta.
- Las pantallas dedicadas de orden y recepcion conservan su proposito especifico.

## Regla de experiencia

Compras debe guiar el flujo necesidad, orden, aprobacion, recepcion e impacto financiero sin saturar al usuario con todos los formularios en el panel principal.

## Validaciones esperadas

- Abrir nueva orden de compra desde el panel.
- Ir a recepcion WMS.
- Gestionar proveedores desde su pantalla dedicada.
- Al registrar una factura de proveedor, crear CXP, asiento contable, trazabilidad de orden e impacto de inventario dentro de una sola transaccion atomica.

## Recepcion parcial por posicion

La confirmacion crea en la misma transaccion un documento contable `EM`: inventario alta al debito y EM/RF al credito segun la familia del articulo. Guarda tercero/NIT, usuario, referencia de OC y fecha. La consulta permite filtrar por numero, fechas, estado, proveedor, bodega y producto, y muestra los documentos contables asociados. Las retenciones de factura se gestionan en una pestana separada.

- La pantalla de recepcion despliega las posiciones de la OC con producto, unidad, cantidad pedida, recibida y pendiente.
- El usuario ingresa manualmente la cantidad recibida en cada posicion; las posiciones en cero no se envian.
- El check `Recibir todo lo pendiente` completa automaticamente el saldo de todas las posiciones abiertas y puede desmarcarse para volver al ingreso manual.
- `Registrar recepcion` abre una ventana modal con la cabecera y posiciones de una unica OC; el listado de otras ordenes permanece bloqueado al fondo.
- Una recepcion parcial mantiene la OC en estado `partial` y conserva el saldo pendiente para una recepcion posterior.
- La cantidad recibida no puede superar el saldo de su posicion y la ubicacion debe pertenecer a la bodega destino de la OC.
- Cada recepcion actualiza inventario, kardex y costo promedio unicamente por las unidades confirmadas.
