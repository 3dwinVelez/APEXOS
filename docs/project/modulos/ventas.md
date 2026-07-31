# Modulo Ventas

## Facturación a clientes

La factura interna se integra de forma atómica con inventario, kardex, contabilidad y cuentas por cobrar. Admite orden de venta opcional, precio editable, descuento por posición, IVA del SKU, retenciones de ventas y bodegas propias o en consignación.

Las facturas están en `/dashboard/ventas/facturas`. Cartera, recaudos, vencimientos y retenciones están en `/dashboard/cxc/documentos`, también accesible desde Contabilidad.

La importación `.xlsx` agrupa facturas por `grupo_factura`; un error invalida el lote completo. La anulación genera NCV y asiento inverso, devuelve unidades con el costo histórico y conserva la trazabilidad.

## Cambios aplicados

- La creacion de clientes se movio a ventana flotante.
- El listado de cartera queda como vista principal.
- Se agregaron acciones claras para nuevo cliente y revision de cartera.

## Regla de experiencia

Ventas debe priorizar flujo comercial y consulta rapida. La captura de datos no debe competir con el listado principal salvo en pantallas dedicadas.

## Validaciones esperadas

- Crear cliente.
- Consultar clientes.
- Mantener lectura clara de cartera sin formulario abierto permanente.
