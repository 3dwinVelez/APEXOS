# Plantilla: Tipos de vehiculo

Catalogo mixto global/empresa para clasificacion vehicular.

| Columna | Descripcion | Obligatorio | Tipo | Ejemplo | Maestro relacionado | Validacion |
| --- | --- | --- | --- | --- | --- | --- |
| company_code | Empresa o GLOBAL | No | texto | GLOBAL | Empresas | Vacio/GLOBAL para base global |
| vehicle_type_code | Codigo | Si | texto | camioneta | Ninguno | Unico por ambito |
| name | Nombre | Si | texto | Camioneta | Ninguno | No vacio |
| description | Descripcion | No | texto | Vehiculo liviano operativo | Ninguno | Texto |
| active | Activo | No | booleano | true | Ninguno | Default true |
| sort_order | Orden | No | entero | 10 | Ninguno | Mayor o igual a 0 |
