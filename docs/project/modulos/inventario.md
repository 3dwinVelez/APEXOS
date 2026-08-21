# Modulo Inventario

## Revision de experiencia

- La pantalla principal ya usa entradas por workspace: productos, WMS, stock y analitica.
- Cada funcion se abre en pantalla dedicada, evitando mezclar maestros, movimientos y reportes en una sola vista.
- El panel mantiene resumen operativo, flujo transversal y accion recomendada.

## Regla de experiencia

Inventario debe separar maestro, bodega, stock y analitica. La vista principal debe orientar al usuario hacia el espacio correcto, no convertirse en un formulario unico.

## Validaciones esperadas

- Abrir creacion de producto.
- Consultar WMS.
- Revisar stock.
- Abrir reportes de inventario.
- Abrir Traslados desde la navegacion y el resumen de Inventario; la funcionalidad conserva sus pantallas independientes de reporte y creacion.
- Los numeros de traslado y documentos del kardex abren su detalle con un clic; muestran fechas, usuarios, origen, destino, SKU, cantidades y costos.
- Las rutas de Inventario deben aceptar los identificadores de modulo `M-01`, `inventario` e `inventory` sincronizados para el tenant.
- Kardex y costos cargan todos los SKU, permiten filtrar por bodega y descargar el resultado visible en Excel.
- El producto del Kardex se captura como código SKU libre. Enter vacío o el botón de búsqueda abre un modal con todos los SKU; un código inexistente muestra error y no consulta el reporte.
- Cuando un movimiento tiene documento contable, su detalle muestra cabecera, usuario, referencia y lineas debito/credito sin salir del Kardex.
- Traslados busca SKU por codigo o nombre, muestra la existencia disponible en origen, impide excederla y ofrece `Crear y nuevo` conservando las bodegas. No incluye soporte de escaner.
- En la creación de traslados, cada línea separa código SKU y nombre. El código se valida al salir del campo o presionar Enter, el nombre se completa desde el maestro y un botón abre la búsqueda por código o nombre.
- Los traslados y sus posiciones conservan obligatoriamente el `tenant_id`; su creación no puede escapar del aislamiento de empresa.
- Una bodega de consignación exige un cliente activo, conserva el vínculo en sus metadatos y lo muestra en el maestro de bodegas.
- `Inventario > Lista de productos` consulta SKU activos e inactivos, filtra por texto, familia y estado, y exporta el resultado visible a Excel.
- Cada producto admite un código de artículo anterior opcional. Se muestra junto al SKU y participa en búsquedas de inventario, compras, ventas y traslados sin reemplazar el código vigente.
- Cada traslado permite descargar una remision PDF con sociedad, fechas, motivo, bodegas de origen y destino, tipo, direccion y ciudad, detalle de SKU y cantidades, espacio para novedades fisicas y campos de firma de quien entrega y quien recibe.
- La recepción de importaciones actualiza el promedio por SKU/sociedad con mercancía más indirectos capitalizables distribuidos por valor; impuestos recuperables y gastos no se capitalizan.

## Cargue inicial

- `Inventario > Cargue inicial` permite descargar una plantilla `.xlsx`, validar el archivo sin afectar saldos y confirmar posteriormente la contabilizacion.
- Cada archivo corresponde a una sociedad y fecha; exige SKU, bodega, cantidad y costo unitario positivos. Ubicacion, lote y observaciones son opcionales.
- La confirmacion es atomica: incrementa stock global y por ubicacion, registra kardex `inventory_initial_load`, actualiza costo promedio y valoracion por SKU/sociedad y crea un comprobante `AJ`.
- El asiento debita la cuenta de inventario de alta configurada en la familia de cada SKU y acredita la cuenta puente transaccional `99999999`. El documento queda disponible en Contabilidad y enlazado desde Kardex.
- Se bloquean filas duplicadas, sociedades o fechas mezcladas, periodos cerrados y el reprocesamiento del mismo archivo.
