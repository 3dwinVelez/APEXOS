# Plantilla: Formas / metodos de pago

Catalogo global. Actualmente contabilidad valida `cash`, `transfer`, `card`, `check`, `other`.

| Columna | Descripcion | Obligatorio | Tipo | Ejemplo | Maestro relacionado | Validacion |
| --- | --- | --- | --- | --- | --- | --- |
| payment_method_code | Codigo | Si | texto | transfer | Ninguno | Unico |
| name | Nombre | Si | texto | Transferencia | Ninguno | No vacio |
| description | Descripcion | No | texto | Pago por transferencia bancaria | Ninguno | Texto |
| requires_bank | Requiere banco | No | booleano | true | Bancos | Booleano |
| active | Activo | No | booleano | true | Ninguno | Default true |
| sort_order | Orden | No | entero | 10 | Ninguno | Mayor o igual a 0 |
