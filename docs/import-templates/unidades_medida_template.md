# Plantilla: Unidades de medida

Catalogo global de unidades.

| Columna | Descripcion | Obligatorio | Tipo | Ejemplo | Maestro relacionado | Validacion |
| --- | --- | --- | --- | --- | --- | --- |
| unit_code | Codigo | Si | texto | UND | Ninguno | Unico |
| name | Nombre | Si | texto | Unidad | Ninguno | No vacio |
| symbol | Simbolo | No | texto | und | Ninguno | Texto |
| unit_type | Tipo | No | texto | cantidad | Catalogo recomendado | cantidad, peso, volumen, tiempo |
| active | Activo | No | booleano | true | Ninguno | Default true |
| sort_order | Orden | No | entero | 10 | Ninguno | Mayor o igual a 0 |
