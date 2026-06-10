# Plantilla: Usuarios

Maestro principal de personas con acceso o identidad operativa. `employees` debe ser extension laboral asociada al usuario.

| Columna | Descripcion | Obligatorio | Tipo | Ejemplo | Maestro relacionado | Validacion |
| --- | --- | --- | --- | --- | --- | --- |
| company_code | Empresa | Si | texto | SCJ | Empresas | Debe existir |
| email | Correo de acceso | Si | email | laura.qa@example.com | Ninguno | Unico por empresa |
| first_name | Nombres | Si | texto | Laura | Ninguno | No vacio |
| last_name | Apellidos | Si | texto | Martinez | Ninguno | No vacio |
| display_name | Nombre visible | No | texto | Laura Martinez | Ninguno | Si vacio se compone |
| role_code | Rol/perfil | Si | texto | SUPERVISOR | Roles | Debe existir |
| user_type_code | Tipo usuario | Si | texto | supervisor | Tipos usuario | Debe existir |
| document_type_code | Tipo documento | No | texto | CC | Tipos documento | Debe existir |
| document_number | Documento | No | texto | 1020304050 | Tipos documento | Unico recomendado |
| phone | Telefono | No | texto | 3001112233 | Ninguno | Texto |
| status | Estado | No | texto | activo | Catalogo estado usuario | Actual: `activo`, `inactivo`, `suspendido`, `retirado`, `pendiente_activacion` |
| position_code | Cargo | No | texto | SUP_RUTA | Cargos | Debe existir |
| area_code | Area | No | texto | OPER | Areas | Debe existir |
| location_code | Sede | No | texto | BOG-NORTE | Sedes | Debe existir |
| warehouse_code | Bodega | No | texto | BOG-NORTE-B01 | Bodegas | Debe existir si aplica |
| cost_center_code | Centro costo | No | texto | CC-OPER | Centros costo | Debe existir |
| hire_date | Fecha ingreso | No | fecha | 2026-05-01 | Ninguno | `YYYY-MM-DD` |
| temporary_password | Password temporal | No | texto | Cambio123! | Ninguno | Solo alta inicial |
| require_password_change | Forzar cambio | No | booleano | true | Ninguno | Recomendado true |

No diligenciar: `id`, `user_id`, `employee_id`, `company_id`, tokens, hash password.
