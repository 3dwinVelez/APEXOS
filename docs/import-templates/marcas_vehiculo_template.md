# Plantilla: Marcas de vehiculo

Catalogo mixto para marcas vehiculares.

| Columna | Descripcion | Obligatorio | Tipo | Ejemplo | Maestro relacionado | Validacion |
| --- | --- | --- | --- | --- | --- | --- |
| company_code | Empresa o GLOBAL | No | texto | GLOBAL | Empresas | Vacio/GLOBAL para global |
| vehicle_brand_code | Codigo marca | Si | texto | TOYOTA | Ninguno | Unico por ambito |
| name | Nombre | Si | texto | Toyota | Ninguno | No vacio |
| description | Descripcion | No | texto | Marca vehicular | Ninguno | Texto |
| active | Activo | No | booleano | true | Ninguno | Default true |
| sort_order | Orden | No | entero | 10 | Ninguno | Mayor o igual a 0 |
