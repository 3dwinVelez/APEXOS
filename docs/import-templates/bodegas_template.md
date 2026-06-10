# Plantilla: Bodegas

Catalogo por empresa. Puede mapearse a `Place(type='warehouse')` y `Location`.

| Columna | Descripcion | Obligatorio | Tipo | Ejemplo | Maestro relacionado | Validacion |
| --- | --- | --- | --- | --- | --- | --- |
| company_code | Empresa | Si | texto | SCJ | Empresas | Debe existir |
| warehouse_code | Codigo bodega | Si | texto | BOG-NORTE-B01 | Ninguno | Unico por empresa |
| name | Nombre | Si | texto | Bodega principal norte | Ninguno | No vacio |
| location_code | Sede asociada | No | texto | BOG-NORTE | Sedes | Debe existir si viene |
| address | Direccion | No | texto | Calle 10 20 30 | Ninguno | Texto |
| city | Ciudad | No | texto | Bogota | Ciudades | Catalogo recomendado |
| active | Activo | No | booleano | true | Ninguno | Default true |
| sort_order | Orden | No | entero | 10 | Ninguno | Mayor o igual a 0 |
