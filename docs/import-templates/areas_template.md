# Plantilla: Areas

Catalogo por empresa para areas/departamentos.

| Columna | Descripcion | Obligatorio | Tipo | Ejemplo | Maestro relacionado | Validacion |
| --- | --- | --- | --- | --- | --- | --- |
| company_code | Empresa | Si | texto | SCJ | Empresas | Debe existir |
| area_code | Codigo area | Si | texto | OPER | Ninguno | Unico por empresa |
| name | Nombre | Si | texto | Operacion | Ninguno | No vacio |
| description | Descripcion | No | texto | Equipo operativo | Ninguno | Texto |
| parent_area_code | Area padre | No | texto | DIR-OPER | Areas | Debe existir si viene |
| active | Activo | No | booleano | true | Ninguno | Default true |
| sort_order | Orden | No | entero | 10 | Ninguno | Mayor o igual a 0 |
