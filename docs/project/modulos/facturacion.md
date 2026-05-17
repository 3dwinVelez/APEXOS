# Modulo Facturacion

## Cambios aplicados

- La emision de factura se movio a ventana flotante.
- La vista principal muestra ordenes listas y acciones disponibles.
- Se agrego bloque de ordenes pendientes para guiar el flujo operativo antes de emitir.

## Regla de experiencia

Facturacion debe separar consulta, preparacion y emision. Emitir es una accion clara, no un formulario permanente compitiendo con el estado de documentos.

## Validaciones esperadas

- Ver ordenes pendientes.
- Abrir emision en modal.
- Generar factura.
- Mantener claridad entre documentos emitidos y acciones nuevas.
