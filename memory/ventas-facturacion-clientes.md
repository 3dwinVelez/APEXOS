# Memoria: facturación a clientes y cuentas por cobrar

Última actualización: 2026-07-29.

## Decisiones confirmadas

- La factura de venta puede existir sin orden de venta. Si se enlaza una orden, cliente, SKU y cantidades deben coincidir.
- El precio parte de la orden de venta cuando existe; en caso contrario, del precio del SKU. Es editable y admite descuento por línea.
- El IVA parte del SKU.
- ReteFuente, ReteIVA y ReteICA de ventas son maestros contables separados de las retenciones de compras. Son activos a favor, con cuenta contable, base mínima, porcentaje, tipo de base y estado.
- Las retenciones aplicables se heredan del cliente y en la factura se pueden modificar base, porcentaje e importe.
- La cuenta asociada de CxC se configura en el cliente desde Contabilidad. Ingresos, costo de venta e inventario se toman de la configuración contable de la familia del SKU.
- Solo la contabilización descuenta inventario y crea la CxC. No se permite inventario negativo.
- El costo reconocido en ventas se toma de la valoración por SKU y sociedad. Se mantienen `Float`; no convertir a `Decimal`.
- Cada línea indica SKU, cantidad y bodega de origen.
- Una bodega de consignación debe estar enlazada a un cliente. La factura puede mezclar bodegas propias y de consignación, pero la bodega debe corresponder al cliente facturado y exige referencia por línea.
- La importación Excel admite varias facturas agrupadas por `grupo_factura` y es atómica.
- Moneda inicial: COP. Facturación electrónica DIAN queda fuera del alcance inicial.
- CxC controla vencimientos, saldos, antigüedad, abonos parciales y pagos completos.
- Un recaudo selecciona cuenta de caja/banco, puede aplicar a varias facturas del mismo cliente y no permite sobrepago.
- Antes de anular una factura deben anularse los recaudos aplicados.
- Toda nota crédito/anulación revierte CxC, ingresos, IVA, retenciones, inventario, costo y kardex; conserva vínculo, usuario y fecha.

## Archivo de importación Excel

Una fila representa una posición. Encabezados mínimos: `grupo_factura`, `cliente_nit`, `sku`, `cantidad` y `bodega`.

Encabezados opcionales: `fecha`, `plazo`, `precio`, `descuento`, `iva`, `referencia_cliente`, `sociedad`, `sucursal`, `centro_costo` y `concepto`.

## Seguridad funcional

- Factura, inventario, kardex, asiento y CxC se escriben en una única transacción.
- Todas las operaciones respetan `tenant_id`.
- Las numeraciones FV, NCV y CI salen de los maestros contables activos.
- No ejecutar migraciones ni pruebas contra bases compartidas o productivas.

