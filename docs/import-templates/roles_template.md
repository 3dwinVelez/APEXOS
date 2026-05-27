# Plantilla: Roles / perfiles

Controla permisos de acceso.

| Columna | Descripcion | Obligatorio | Tipo | Ejemplo | Maestro relacionado | Validacion |
| --- | --- | --- | --- | --- | --- | --- |
| company_code | Empresa | Si | texto | SCJ | Empresas | Debe existir |
| role_code | Codigo del rol | Si | texto | SUPERVISOR | Ninguno | Unico por empresa |
| role_name | Nombre visible | Si | texto | Supervisor | Ninguno | No vacio |
| description | Descripcion | No | texto | Gestiona equipo operativo | Ninguno | Texto |
| is_system | Rol sistema | No | booleano | false | Ninguno | No editar roles sistema sin control |
| active | Activo | No | booleano | true | Ninguno | Default true |
| permissions | Permisos | No | lista/json | hr:read;hr:write | Catalogo permisos | Deben existir en modulos |

Generados por sistema: `id`, permisos normalizados, auditoria.
