# Plantilla: Tipos de documento

Catalogo global. APEXOS ya maneja defaults DIAN en contabilidad.

| Columna | Descripcion | Obligatorio | Tipo | Ejemplo | Maestro relacionado | Validacion |
| --- | --- | --- | --- | --- | --- | --- |
| document_type_code | Codigo | Si | texto | CC | Ninguno | Unico |
| dian_code | Codigo DIAN | No | texto | 13 | DIAN | Recomendado Colombia |
| name | Nombre | Si | texto | Cedula de ciudadania | Ninguno | No vacio |
| applies_to | Uso | No | lista | usuarios;terceros | Ninguno | Valores documentados |
| active | Activo | No | booleano | true | Ninguno | Default true |
| sort_order | Orden | No | entero | 10 | Ninguno | Mayor o igual a 0 |
