# Plantilla: Cargos

Catalogo por empresa para cargo/puesto.

| Columna | Descripcion | Obligatorio | Tipo | Ejemplo | Maestro relacionado | Validacion |
| --- | --- | --- | --- | --- | --- | --- |
| company_code | Empresa | Si | texto | SCJ | Empresas | Debe existir |
| position_code | Codigo cargo | Si | texto | CONDUCTOR | Ninguno | Unico por empresa |
| name | Nombre | Si | texto | Conductor | Ninguno | No vacio |
| description | Descripcion | No | texto | Conduce vehiculos de reparto | Ninguno | Texto |
| area_code | Area asociada | No | texto | TRANSP | Areas | Debe existir si viene |
| active | Activo | No | booleano | true | Ninguno | Default true |
| sort_order | Orden | No | entero | 10 | Ninguno | Mayor o igual a 0 |
