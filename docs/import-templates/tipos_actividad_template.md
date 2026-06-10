# Plantilla: Tipos de actividad operativa

Catalogo por empresa o base global. Ya existe `ActivityType`, pero tambien hay defaults quemados en API.

| Columna | Descripcion | Obligatorio | Tipo | Ejemplo | Maestro relacionado | Validacion |
| --- | --- | --- | --- | --- | --- | --- |
| company_code | Empresa o GLOBAL | No | texto | SCJ | Empresas | Vacio/GLOBAL para base |
| activity_type_code | Codigo | Si | texto | ENTREGA_CLIENTE | Ninguno | Unico por ambito |
| name | Nombre | Si | texto | Entrega en cliente | Ninguno | No vacio |
| description | Descripcion | No | texto | Registro de entrega final | Ninguno | Texto |
| active | Activo | No | booleano | true | Ninguno | Default true |
| sort_order | Orden | No | entero | 10 | Ninguno | Mayor o igual a 0 |
