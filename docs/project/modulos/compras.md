# Modulo Compras

## Revision de experiencia

- La captura consecutiva ofrece `Aprobar y nueva` en OC, `Registrar y nueva` en facturas y `Confirmar y siguiente OC` en recepcion. Se conservan los maestros repetitivos y se limpian referencias, posiciones y observaciones propias del documento terminado.

- La pantalla principal ya funciona como panel de workspaces: orden de compra, recepcion y proveedores.
- Las funciones principales estan separadas por accesos claros y no mezclan formularios abiertos con consulta.
- Las pantallas dedicadas de orden y recepcion conservan su proposito especifico.

## Regla de experiencia

Compras debe guiar el flujo necesidad, orden, aprobacion, recepcion e impacto financiero sin saturar al usuario con todos los formularios en el panel principal.

- El detalle de una nueva orden inicia como una tabla con diez posiciones vacías para captura consecutiva.
- El SKU puede escribirse directamente o seleccionarse desde el buscador; al reconocerlo se completan producto y costo vigente.
- Enter sobre un SKU vacío abre el buscador por código, nombre o clasificación ABC. Si el código digitado no existe, se informa al usuario y se abre el buscador sobre esa misma posición.
- La orden de compra captura SKU, cantidad y costo sin IVA por posición. Las filas vacías no se envían al API.
- El panel de órdenes no inicia recepciones WMS; la recepción se gestiona exclusivamente desde su submódulo dedicado.

- Una orden en borrador se puede abrir con la accion `Editar borrador` o con doble clic en su tarjeta. El guardado actualiza la misma OC y conserva su numero; otros estados no admiten edicion.
- Las OC aprobadas o parcialmente recibidas con saldo pendiente se pueden cerrar manualmente indicando un motivo. El cierre guarda usuario, fecha, estado anterior y cantidades ordenada, recibida y no recibida; no altera lo recibido ni genera inventario o contabilidad adicional.
- Cada OC permite descargar un PDF formal con empresa compradora, NIT, pais, sociedad, proveedor, creador, fechas, bodega de entrega, direccion, ciudad, centro de costo, posiciones, SKU, cantidades pedidas/recibidas/pendientes, costos, totales, condiciones y observaciones. La sucursal no se presenta en la orden.

## Validaciones esperadas

- Abrir nueva orden de compra desde el panel.
- Ir a recepcion WMS.
- Gestionar proveedores desde su pantalla dedicada.
- Al registrar una factura de proveedor, crear CXP, asiento contable, trazabilidad de orden e impacto de inventario dentro de una sola transaccion atomica.
- Al pulsar el numero de una OC, mostrar proveedor, fecha, bodega, estado, posiciones, cantidades recibidas/pendientes y los asientos EM relacionados con usuario y detalle debito/credito.
- Proveedores consume el maestro canónico de Contabilidad > Terceros. Si el NIT ya existe como cliente, se agrega el rol proveedor al mismo registro y Compras presenta únicamente su saldo CxP.
- Los pagos de facturas se realizan desde Tesorería como comprobantes `CE`; CxP enlaza al reporte filtrado de pagos a proveedores.

## Recepcion parcial por posicion

La confirmacion crea en la misma transaccion un documento contable `EM`: inventario alta al debito y EM/RF al credito segun la familia del articulo. Guarda tercero/NIT, usuario, referencia de OC y fecha. La consulta permite filtrar por numero, fechas, estado, proveedor, bodega y producto, y muestra los documentos contables asociados. Las retenciones de factura se gestionan en una pestana separada.

- La simulación y contabilización de facturas incluyen cada retención activa seleccionada, respetan base e importe editables, acreditan la cuenta de retención y llevan el neto a la cuenta del proveedor. En notas crédito invierten esos movimientos.
- Código, tipo, base, porcentaje e importe de IVA y retenciones quedan persistidos en el cuerpo CXP y en las líneas contables.

- La pantalla de recepcion despliega las posiciones de la OC con producto, unidad, cantidad pedida, recibida y pendiente.
- El usuario ingresa manualmente la cantidad recibida en cada posicion; las posiciones en cero no se envian.
- El check `Recibir todo lo pendiente` completa automaticamente el saldo de todas las posiciones abiertas y puede desmarcarse para volver al ingreso manual.
- `Registrar recepcion` abre una ventana modal con la cabecera y posiciones de una unica OC; el listado de otras ordenes permanece bloqueado al fondo.
- Una recepcion parcial mantiene la OC en estado `partial` y conserva el saldo pendiente para una recepcion posterior.
- La cantidad recibida no puede superar el saldo de su posicion y la ubicacion debe pertenecer a la bodega destino de la OC.
- Cada recepcion actualiza inventario, kardex y costo promedio unicamente por las unidades confirmadas.
- La devolucion de mercancia se confirma dentro de un modal de APEXOS y admite cantidades parciales por posicion. No permite devolver mas que la cantidad recibida neta de devoluciones anteriores; cada confirmacion disminuye stock y ubicacion, registra el movimiento en kardex y genera un documento EM de reversion usando las cuentas de inventario y EM/RF de la familia del SKU.
- Los numeros de los documentos de entrada y devolucion abren su detalle y contabilizacion unicamente con doble clic; el detalle no se despliega automaticamente en el listado.
- El detalle de cada documento EM muestra tambien las posiciones físicas pertenecientes a esa entrada o devolucion, con SKU, descripcion, cantidad, unidad y costo unitario, separadas de las lineas del asiento contable.

## Importaciones

- `Compras > Importaciones` crea un expediente sobre una OC y administra costos de aduana, transporte, seguros, impuestos y otros conceptos con terceros independientes.
- Cada concepto se clasifica como capitalizable, impuesto recuperable o gasto y conserva cuentas contables.
- El costo capitalizable se distribuye proporcionalmente por el valor de las posiciones.
- La hoja de costos debe confirmarse y la recepción es completa; cada proveedor solo puede facturar sus conceptos asignados.
- La factura real queda enlazada al concepto. Las diferencias capitalizables generan ajuste de valoración y asiento; si no queda inventario, el sistema bloquea la capitalización para evitar alterar costos incorrectamente.
