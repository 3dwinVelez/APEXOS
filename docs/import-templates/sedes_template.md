# Plantilla: Sedes

Catalogo por empresa. Puede mapearse a `Place(type='site')`.

| Columna | Descripcion | Obligatorio | Tipo | Ejemplo | Maestro relacionado | Validacion |
| --- | --- | --- | --- | --- | --- | --- |
| company_code | Empresa | Si | texto | SCJ | Empresas | Debe existir |
| location_code | Codigo sede | Si | texto | BOG-NORTE | Ninguno | Unico por empresa |
| name | Nombre | Si | texto | Sede Bogota Norte | Ninguno | No vacio |
| address | Direccion | No | texto | Calle 10 20 30 | Ninguno | Texto |
| city | Ciudad | No | texto | Bogota | Ciudades | Catalogo recomendado |
| country | Pais | No | texto | CO | Paises | ISO recomendado |
| active | Activo | No | booleano | true | Ninguno | Default true |
| sort_order | Orden | No | entero | 10 | Ninguno | Mayor o igual a 0 |
