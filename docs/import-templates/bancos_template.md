# Plantilla: Bancos

Catalogo de entidades financieras.

| Columna | Descripcion | Obligatorio | Tipo | Ejemplo | Maestro relacionado | Validacion |
| --- | --- | --- | --- | --- | --- | --- |
| bank_code | Codigo banco | Si | texto | BANCOLOMBIA | Ninguno | Unico |
| name | Nombre | Si | texto | Bancolombia | Ninguno | No vacio |
| country | Pais | No | texto | CO | Paises | ISO recomendado |
| swift_code | SWIFT | No | texto | COLOCOBM | Ninguno | Texto |
| active | Activo | No | booleano | true | Ninguno | Default true |
| sort_order | Orden | No | entero | 10 | Ninguno | Mayor o igual a 0 |
