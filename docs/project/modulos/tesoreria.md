# Módulo Tesorería

Tesorería centraliza el maestro de bancos y los movimientos que liquidan partidas de clientes y proveedores. La pantalla `/dashboard/tesoreria` separa registro, bancos y reporte.

## Bancos

- Código único por empresa, nombre, estado y cuenta contable activa que permita movimientos.
- Los bancos se inactivan; no se eliminan cuando tienen historial.

## Recaudos y pagos

- `CI`: recaudo de cliente, débito banco y crédito CxC.
- `CE`: pago a proveedor, débito CxP y crédito banco.
- Fecha contable, tercero, banco, referencia, observaciones y aplicaciones por factura son obligatorias según el contrato.
- Se permiten aplicaciones parciales o totales. El backend vuelve a validar el saldo dentro de la transacción y evita saldos negativos o pagos concurrentes sobre información obsoleta.
- Un pago no mezcla terceros ni sociedades.
- La anulación crea documento contable inverso y reabre todas las partidas; conserva usuario, fecha y trazabilidad.

## Reportes

- Consulta unificada con filtros por tipo, estado y fechas.
- Cada módulo enlaza a su vista: recaudos desde CxC y pagos desde CxP.
- El reporte permite descargar CSV y muestra banco, tercero, partidas, importe y estado.

## Anticipos

La captura de pagos permite pegar referencias separadas por linea, coma o punto y coma, mostrar solo partidas abiertas coincidentes e informar las no encontradas. `Marcar todo` y `Desmarcar todo` actuan sobre las partidas visibles; no existe distribucion automatica por antiguedad.

- `AC` registra anticipos recibidos de clientes contra una cuenta pasiva; `AP` registra anticipos entregados a proveedores contra una cuenta activa.
- El anticipo permanece separado de las facturas y su cruce valida tercero, sociedad y ambos saldos dentro de una transacción.
