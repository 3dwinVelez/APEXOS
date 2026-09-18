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
- Las rutas de Inventario deben aceptar los identificadores de modulo `M-01`, `inventario` e `inventory` sincronizados para el tenant.

## Ajustes de inventario

- Inventario permite crear documentos multiposicion `AE` (entrada) y `AS` (salida), con bodega, fecha y motivo obligatorio. Se contabilizan al guardar y generan un identificador consecutivo visible en Kardex.
- `AE` usa el costo promedio vigente; si el SKU aun no tiene costo exige costo unitario. `AS` usa siempre el promedio vigente y no permite inventario negativo.
- `AE` debita inventario de alta y acredita ajuste manual de entrada; `AS` debita ajuste manual de salida y acredita inventario de alta, segun la familia del SKU.
- El reporte muestra documento, fecha, tipo, bodega, motivo, usuario, posiciones y asiento contable relacionado.
