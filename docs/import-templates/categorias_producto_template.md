# Plantilla: Categorias de producto

Catalogo por empresa. Puede mapearse a Prisma `Category`.

| Columna | Descripcion | Obligatorio | Tipo | Ejemplo | Maestro relacionado | Validacion |
| --- | --- | --- | --- | --- | --- | --- |
| company_code | Empresa | Si | texto | SCJ | Empresas | Debe existir |
| category_code | Codigo categoria | Si | texto | MUEBLES | Ninguno | Unico por empresa |
| name | Nombre | Si | texto | Muebles | Ninguno | No vacio |
| parent_category_code | Categoria padre | No | texto | HOGAR | Categorias | Debe existir si viene |
| type | Tipo | No | texto | item | Ninguno | Default `item` |
| active | Activo | No | booleano | true | Ninguno | Default true |
| sort_order | Orden | No | entero | 10 | Ninguno | Mayor o igual a 0 |
