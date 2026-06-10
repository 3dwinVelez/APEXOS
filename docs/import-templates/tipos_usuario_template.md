# Plantilla: Tipos de usuario

Catalogo de clasificacion funcional del usuario.

| Columna | Descripcion | Obligatorio | Tipo | Ejemplo | Maestro relacionado | Validacion |
| --- | --- | --- | --- | --- | --- | --- |
| company_code | Empresa o GLOBAL | No | texto | SCJ | Empresas | Vacio/GLOBAL para global |
| user_type_code | Codigo | Si | texto | conductor | Ninguno | Unico por ambito |
| name | Nombre | Si | texto | Conductor | Ninguno | No vacio |
| description | Descripcion | No | texto | Usuario operativo de transporte | Ninguno | Texto |
| active | Activo | No | booleano | true | Ninguno | Default true |
| sort_order | Orden | No | entero | 40 | Ninguno | Mayor o igual a 0 |

Debe alimentar selects de usuario, empleados y asignaciones operativas.
