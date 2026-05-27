# Plantilla: Referencias / productos

Maestro de productos, referencias de servicio o items. No incluye movimientos de inventario ni ordenes.

| Columna | Descripcion | Obligatorio | Tipo | Ejemplo | Maestro relacionado | Validacion |
| --- | --- | --- | --- | --- | --- | --- |
| company_code | Empresa | Si | texto | SCJ | Empresas | Debe existir |
| item_code | Codigo item/referencia | Si | texto | REF-MON-001 | Ninguno | Unico por empresa |
| name | Nombre | Si | texto | Montaje escritorio modular | Ninguno | No vacio |
| item_type_code | Tipo item | Si | texto | service | Tipos item | Actual API: `product`, `service`, `asset`, `component`, `raw_material` |
| category_code | Categoria | No | texto | OFICINA | Categorias producto | Debe existir |
| unit_code | Unidad | Si | texto | UND | Unidades medida | Debe existir |
| brand_code | Marca | No | texto | DEMOOFFICE | Marcas producto | Debe existir si viene |
| model | Modelo | No | texto | MOD-90 | Ninguno | Texto |
| description | Descripcion | No | texto | Servicio de montaje | Ninguno | Texto |
| unit_cost | No | numero | 120000 | Ninguno | Mayor o igual a 0 |
| unit_price | No | numero | 190000 | Ninguno | Mayor o igual a 0 |
| tax_rate | No | numero | 19 | Impuestos | Porcentaje |
| stock_min | No | numero | 2 | Ninguno | Mayor o igual a 0 |
| stock_max | No | numero | 20 | Ninguno | Mayor o igual a 0 |
| estimated_minutes | No | entero | 90 | Servicios | Para referencias de servicio |
| active | No | booleano | true | Ninguno | Default true |
