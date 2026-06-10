# Plantilla: Tipos de servicio

Catalogo mixto para clasificar servicios.

| Columna | Descripcion | Obligatorio | Tipo | Ejemplo | Maestro relacionado | Validacion |
| --- | --- | --- | --- | --- | --- | --- |
| company_code | Empresa o GLOBAL | No | texto | GLOBAL | Empresas | Vacio/GLOBAL para base |
| service_type_code | Codigo | Si | texto | montaje | Ninguno | Unico por ambito |
| name | Nombre | Si | texto | Montaje | Ninguno | No vacio |
| description | Descripcion | No | texto | Servicio de instalacion/montaje | Ninguno | Texto |
| active | Activo | No | booleano | true | Ninguno | Default true |
| sort_order | Orden | No | entero | 10 | Ninguno | Mayor o igual a 0 |
