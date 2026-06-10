# Plantilla: Tipos de tercero

Catalogo global para clasificar terceros.

| Columna | Descripcion | Obligatorio | Tipo | Ejemplo | Maestro relacionado | Validacion |
| --- | --- | --- | --- | --- | --- | --- |
| third_party_type_code | Codigo | Si | texto | customer | Ninguno | Unico |
| name | Nombre | Si | texto | Cliente | Ninguno | No vacio |
| description | Descripcion | No | texto | Tercero cliente | Ninguno | Texto |
| active | Activo | No | booleano | true | Ninguno | Default true |
| sort_order | Orden | No | entero | 10 | Ninguno | Mayor o igual a 0 |
