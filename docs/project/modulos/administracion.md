# Modulo Administracion y Configuracion

## Cambios aplicados

- Usuarios y roles quedan en una misma entrada administrativa, pero separados por selector de seccion.
- La vista evita mostrar usuarios y roles al mismo tiempo.
- Roles mantiene matriz de permisos alineada con legacy.
- Usuarios conserva creacion de empleado asociado para alimentar Talento Humano, Servicios, Marcaciones y Nomina.

## Regla de experiencia

Configuracion debe ser potente pero ordenada: cada seccion administrativa debe mostrar una tarea principal y evitar mezclar permisos, usuarios y datos maestros sin separacion visual.

## Validaciones esperadas

- Crear usuario.
- Activar/inactivar usuario.
- Crear rol.
- Editar permisos de rol.
- Cambiar entre secciones sin perder contexto.
