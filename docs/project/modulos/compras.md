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

## Contabilizacion de facturas con orden de compra

- La recepcion debita la cuenta de inventario alta y acredita la cuenta EM/RF parametrizada en la familia del articulo.
- La factura vinculada a una orden debita esa misma cuenta EM/RF y acredita la cuenta asociada de cuentas por pagar del proveedor.
- La cuenta EM/RF no puede coincidir con la cuenta asociada del proveedor; la simulacion debe bloquear la contabilizacion y solicitar corregir la familia del articulo.
