# Cambios de migracion legacy - Administracion

## Usuarios
- Se agregaron endpoints administrativos para listar, crear, editar y activar/inactivar usuarios en APEXOS.
- La creacion de usuarios queda ubicada funcionalmente en Configuracion / Administracion.
- Al crear un usuario se crea tambien su ficha de empleado para alimentar Talento Humano, Servicios, Marcaciones y Nomina.
- Se conservaron campos legacy relevantes: nombre, usuario/email, rol, codigo interno, documento, empresa, cargo, area, salario base y estado laboral.

## Roles
- Se agrego catalogo de permisos alineado con APEX legacy: dashboard, personal, roles, servicios, horarios, vehiculos, referencias, reportes, configuracion y nomina.
- Se agregaron roles base equivalentes a legacy: Tecnico, Empleado y Coordinador.
- La matriz legacy se traduce al RBAC interno de APEXOS para los modulos reales: admin, hr, services, transport y payroll.
- Se agregaron endpoints para listar, crear, editar y activar/inactivar roles.

## Interfaz
- Se creo la pantalla `/dashboard/administracion` con gestion de usuarios y roles.
- Se agrego alias `/dashboard/configuracion` redirigiendo a Administracion.
