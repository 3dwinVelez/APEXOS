# Matriz de seguridad RLS

## Pruebas ejecutadas

| Usuario | Empresa origen | Recurso objetivo | Acción | Esperado | Resultado |
| --- | --- | --- | --- | --- | --- |
| Cuenta Supabase de control | SCJ/QA | Empresa distinta | SELECT empresa | 0 filas | 0 filas |
| Cuenta Supabase de control | SCJ/QA | `company_users` de otra empresa | SELECT | 0 filas | 0 filas |
| Cuenta Supabase de control | SCJ/QA | órdenes de otra empresa | SELECT | 0 filas | 0 filas |
| Cuenta Supabase de control | SCJ/QA | evidencias de otra empresa | SELECT por relación | 0 filas | 0 filas |
| Cuenta Supabase de control | SCJ/QA | prefijo Storage ajeno | LIST | 0 objetos | 0 objetos |
| Miembro productivo simulado | Membresía existente | Servicios/usuarios/empleados/evidencias/Storage | SELECT en transacción read-only | policy aplicada | Ejecutado sin bypass de rol |
| Anónimo | Ninguna | tablas de negocio | INSERT/UPDATE/DELETE | Sin grant útil | Sin write grants de negocio detectados |

## Cobertura por recurso

| Recurso | RLS | Policy desplegada | Aislamiento | Observación |
| --- | --- | --- | --- | --- |
| Servicios | Sí | módulo + membresía/acceso a orden | Empresa/orden | Coincide con repositorio |
| Usuarios | Sí | membresía/administración | Empresa | Cross-select REST = 0 |
| Roles/permisos | Sí | ámbito de empresa | Empresa | Validación funcional API determinista pasó |
| Marcaciones | Sí | membresía/módulo | Empresa | Policy versionada y desplegada |
| Evidencias | Sí | relación con orden | Empresa/orden | Cross-select REST = 0 |
| `storage.objects` | Sí | bucket + empresa + orden/usuario | Empresa/ruta | No valida bytes |
| Logs técnicos | Sí o backend-only | acceso restringido | Empresa/rol | No se expuso contenido durante inspección |
| Maestros | Sí | membresía/módulo | Empresa | Coincide con repositorio |

## Acciones no ejecutadas

Las pruebas cross-tenant de INSERT, UPDATE y DELETE no se realizaron contra producción. Las credenciales controladas disponibles no cubren los cinco perfiles dentro de Supabase Auth y no se autorizó crear cuentas productivas. La ausencia se mantiene visible; no se sustituye por una afirmación inferida.
