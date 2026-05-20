# Modulo Administracion y Configuracion

## Cambios aplicados

- 2026-05-20: Administracion se reorganizo como panel centralizado por categorias: Empresa y organizacion, Usuarios y seguridad, Operacion logistica, Documentos, Alertas, Contabilidad y costos, Integraciones y Sistema.
- 2026-05-20: Las configuraciones ahora se abren desde tarjetas hacia modales, ventanas amplias o accesos protegidos, evitando mostrar roles, usuarios, empresas y parametros en una sola pantalla.
- 2026-05-20: Usuarios se convirtio en ficha maestra con pestanas para datos basicos, acceso, datos laborales, operacion, documentos y auditoria, conservando la API actual y guardando extensiones en `Employee.metadata`.
- 2026-05-20: Se agregaron indicadores administrativos base: usuarios activos, pendientes, conductores y fichas incompletas.
- 2026-05-20: La ficha de usuario incluye validaciones de rol obligatorio, correo, clave inicial, conductor con licencia, marcacion con sede/turno, datos de nomina con centro de costo y fechas laborales coherentes.
- 2026-05-20: Los cambios criticos de usuarios guardan auditoria con usuario actor, fecha, entidad afectada, valor anterior y valor nuevo en `AuditLog`, ademas de la trazabilidad resumida en la ficha.
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
- Abrir configuraciones desde el panel principal sin saturar la pantalla.
- Guardar ficha maestra de usuario sin migraciones de base de datos.
