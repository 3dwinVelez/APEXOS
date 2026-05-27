# Plantilla: Marcas de producto

Catalogo mixto para marcas comerciales de productos/referencias.

| Columna | Descripcion | Obligatorio | Tipo | Ejemplo | Maestro relacionado | Validacion |
| --- | --- | --- | --- | --- | --- | --- |
| company_code | Empresa o GLOBAL | No | texto | SCJ | Empresas | Vacio/GLOBAL para global |
| product_brand_code | Codigo marca | Si | texto | DEMOOFFICE | Ninguno | Unico por ambito |
| name | Nombre | Si | texto | DemoOffice | Ninguno | No vacio |
| description | Descripcion | No | texto | Marca de mobiliario demo | Ninguno | Texto |
| active | Activo | No | booleano | true | Ninguno | Default true |
| sort_order | Orden | No | entero | 10 | Ninguno | Mayor o igual a 0 |
