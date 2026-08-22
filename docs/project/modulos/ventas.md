# Modulo Ventas

## Facturación a clientes

La factura interna se integra de forma atómica con inventario, kardex, contabilidad y cuentas por cobrar. Admite orden de venta opcional, precio editable, descuento por posición, IVA del SKU, retenciones de ventas y bodegas propias o en consignación.

Las facturas están en `/dashboard/ventas/facturas`. Cartera, recaudos, vencimientos y retenciones están en `/dashboard/cxc/documentos`, también accesible desde Contabilidad.

La importación `.xlsx` agrupa facturas por `grupo_factura`; un error invalida el lote completo. La anulación genera NCV y asiento inverso, devuelve unidades con el costo histórico y conserva la trazabilidad.

## Cambios aplicados

- La factura nueva presenta diez filas vacias de captura. Las filas que permanezcan totalmente vacias no se envian a simulacion ni contabilizacion, y `Emitir y nueva` restablece el mismo grid de diez filas.
- El script `npm run seed:demo:consignment-sales -- --tenant <id-o-dominio>` prepara en modo de vista previa un cliente, una bodega de consignacion, un traslado con stock y facturas de demostracion para los reportes. Requiere `--apply` para escribir y bloquea produccion.
- Facturacion ofrece `Emitir y nueva`: conserva sociedad, sucursal, centro de costo y cuenta asociada, pero limpia cliente, orden, posiciones, referencias y retenciones del documento emitido.

- La creacion de clientes se movio a ventana flotante.
- El listado de cartera queda como vista principal.
- Se agregaron acciones claras para nuevo cliente y revision de cartera.

## Regla de experiencia

Ventas debe priorizar flujo comercial y consulta rapida. La captura de datos no debe competir con el listado principal salvo en pantallas dedicadas.

- Los reportes usan campos de texto asistidos para Cliente y Producto en lugar de listas desplegables. Enter selecciona una coincidencia exacta o abre el buscador —tambien cuando el campo esta vacio— por codigo, NIT, nombre, SKU, codigo anterior o familia.

## Validaciones esperadas

- Crear cliente.
- Consultar clientes.
- Mantener lectura clara de cartera sin formulario abierto permanente.
- Pulsar el numero de una factura para consultar cliente, fechas, usuario, SKU, cantidades, bodegas, CxC y asiento contable relacionado.
- Clientes consume el maestro canónico de Contabilidad > Terceros. Si el NIT ya existe como proveedor, se agrega el rol cliente al mismo registro y Ventas usa únicamente su saldo CxC para cupo y cartera.
- Los recaudos se realizan desde Tesorería como comprobantes `CI`; CxC enlaza al reporte filtrado de recaudos.
- La captura inicia por clase de documento; la nota credito se origina siempre desde una factura contabilizada para garantizar la reversion completa.
- Cliente y SKU se diligencian como texto y Enter abre buscadores por codigo/nombre/NIT o codigo/nombre/familia.
- Sociedad, sucursal, centro de costos y cuenta asociada de deudores provienen de maestros contables enlazados; la bodega se define exclusivamente por posicion.
- El precio visible incluye IVA, pero la contabilizacion conserva por separado base e impuesto. Parte del precio vigente del SKU y sigue siendo editable.
- IVA se selecciona desde el maestro parametrizado y las retenciones se presentan en una pestana independiente.
- Al seleccionar el cliente, la factura consulta y precarga exclusivamente las retenciones de venta asignadas a ese tercero en Contabilidad. La API rechaza cualquier retencion activa que no este asignada al cliente.
