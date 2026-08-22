# Memoria — Tesorería, bancos y pagos

## Decisiones confirmadas

- Pagos y recaudos permiten filtrar partidas pegando referencias explicitas y marcar o desmarcar el total de todas las facturas visibles. No se implementa distribucion automatica por antiguedad.

- Tesorería es el único punto operativo para recibir pagos de clientes y pagar proveedores.
- El maestro global de bancos guarda código, nombre, estado y cuenta contable de movimiento.
- Los recaudos usan clase contable `CI`; los pagos a proveedores usan `CE`. Cada clase conserva numeración independiente del maestro contable.
- Una operación afecta un solo tercero, banco y sociedad, pero puede aplicar varias facturas del mismo tercero.
- Cada partida tiene importe explícito y admite pago parcial o total. Nunca puede superar el saldo vivo mostrado.
- Documento de tesorería, aplicaciones, saldos CxC/CxP, saldo del tercero, libro mayor y asiento contable se registran dentro de una sola transacción.
- La concurrencia se controla comparando el saldo vigente con el saldo leído. Si cambió por otro pago, toda la operación se rechaza.
- Anular no borra físicamente: crea asiento inverso, marca el pago y asiento original como anulados, registra usuario/fecha y reabre exactamente las partidas aplicadas.
- Los registros históricos de `CxcPayment` y `Payment` se conservan para consulta; sus rutas de creación quedan sustituidas por Tesorería.

## Asientos

- Recaudo cliente: débito a banco y crédito a la cuenta asociada CxC de cada factura.
- Pago proveedor: débito a la cuenta asociada CxP de cada factura y crédito a banco.
- Reversión: intercambia débitos y créditos del asiento original.

## Validaciones permanentes

- Banco y cuenta contable deben estar activos y permitir movimientos.
- No mezclar facturas de terceros o sociedades diferentes.
- No pagar documentos anulados, sin saldo o que no sean facturas.
- Respetar periodos contables cerrados tanto al pagar como al anular.
- Mantener aislamiento por empresa y permisos contables de lectura, escritura y aprobación.

## Anticipos confirmados

- `AC` registra anticipos de clientes: débito al banco y crédito a una cuenta pasiva de anticipos recibidos.
- `AP` registra anticipos a proveedores: débito a una cuenta activa de anticipos entregados y crédito al banco.
- Crear el anticipo no reduce CxC ni CxP; queda como saldo a favor independiente hasta su cruce.
- El cruce parcial o total exige mismo tercero y sociedad y no supera el saldo del anticipo ni de la factura.
