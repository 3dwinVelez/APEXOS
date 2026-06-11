# Modulo Administracion y Configuracion

## Cambios aplicados

- 2026-05-20: Administracion se reorganizo como panel centralizado por categorias: Empresa y organizacion, Usuarios y seguridad, Operacion logistica, Documentos, Alertas, Contabilidad y costos, Integraciones y Sistema.
- 2026-05-20: Las configuraciones ahora se abren desde tarjetas hacia modales, ventanas amplias o accesos protegidos, evitando mostrar roles, usuarios, empresas y parametros en una sola pantalla.
- 2026-05-20: Usuarios se convirtio en ficha maestra con pestanas para datos basicos, acceso, datos laborales, operacion, documentos y auditoria, conservando la API actual y guardando extensiones en `Employee.metadata`.
- 2026-05-20: Se agregaron indicadores administrativos base: usuarios activos, pendientes, conductores y fichas incompletas.
- 2026-05-20: La ficha de usuario incluye validaciones de rol obligatorio, correo, clave inicial, conductor con licencia, marcacion con sede/turno, datos de nomina con centro de costo y fechas laborales coherentes.
- 2026-05-20: Los cambios criticos de usuarios guardan auditoria con usuario actor, fecha, entidad afectada, valor anterior y valor nuevo en `AuditLog`, ademas de la trazabilidad resumida en la ficha.
- 2026-06-07: El alta de usuarios se separo en dos flujos guiados: tecnico de servicios y empleado normal, con acceso directo por boton y guias cortas por perfil.
- 2026-06-07: Se agrego el campo `profile_kind` para persistir si la ficha corresponde a tecnico o empleado, y el backend ajusta estados, defaults operativos y trazabilidad segun ese tipo.
- 2026-06-07: Los tecnicos solo capturan nombre de usuario y contraseña en la interfaz; el resto de valores operativos se autocompleta para Servicios. El sistema normaliza el usuario a correo de acceso para poder iniciar sesion.
- 2026-06-07: Los tecnicos quedan orientados al modulo de Servicios con perfil operativo activo por defecto; los empleados conservan el flujo laboral completo.
- 2026-06-07: La resolucion de rol para altas y ediciones de tecnicos se corrigio para priorizar el rol exacto `Tecnico` y evitar asignar por error `Soporte tecnico`, ya que ese rol no habilita el modulo de Servicios para operacion de campo.
- 2026-06-08: El backend ahora valida compatibilidad minima entre `profile_kind` y rol antes de guardar usuarios. Un tecnico debe conservar acceso funcional a Servicios; un empleado debe conservar acceso operativo o de talento humano. Se agrego ademas un auditor correctivo para normalizar usuarios existentes sin borrar historial.
- 2026-06-08: El flujo administrativo ejecutado desde `localhost:3001` con sesion Supabase se alineo con la misma semantica de roles base (`Tecnico`, `Empleado`, `Soporte tecnico`). El fallback del frontend ahora inyecta esos roles si faltan, preserva roles personalizados y la ruta Next normaliza el rol correcto antes de crear o actualizar usuarios.
- 2026-06-08: La gestion administrativa de usuarios con sesion Supabase dejo de duplicar escrituras entre frontend fallback y ruta Next. La actualizacion de usuario, acceso y documentos ahora prioriza la ruta server-side y solo usa parche directo como contingencia.
- 2026-06-08: Al crear, editar, bloquear o inactivar usuarios Supabase, la ruta administrativa sincroniza tambien `profiles` y `company_users` para mantener estado y membresia coherentes con `employees`.
- 2026-06-08: El shell del dashboard ahora expone cierre de sesion visible, limpia completamente caches locales al salir y muestra alertas tecnicas con ruta/estado cuando falla autenticacion o una llamada API, para acelerar soporte y estabilizacion pre-productiva.
- 2026-06-08: La autenticacion web ahora intenta renovar token automaticamente antes de expulsar al usuario y el backend deja de aceptar cuentas bloqueadas por `session_status`, tanto para JWT local como para sesiones Supabase con espejo Prisma.
- 2026-06-08: `require_password_change` ya tiene flujo real: login y dashboard redirigen a `/cambiar-clave`, el usuario actualiza su clave en autoservicio y el sistema limpia la marca obligatoria tanto en auth local como en sesiones Supabase.
- Usuarios y roles quedan en una misma entrada administrativa, pero separados por selector de seccion.
- La vista evita mostrar usuarios y roles al mismo tiempo.
- Roles mantiene matriz de permisos alineada con legacy.
- Usuarios conserva creacion de empleado asociado para alimentar Talento Humano, Servicios, Marcaciones y Nomina.
- La creacion de usuarios ahora permite escoger de forma explicita si la ficha corresponde a tecnico o empleado, reduciendo campos irrelevantes y mejorando la validacion del alta.
- 2026-06-11: El rol exacto `Tecnico` queda limitado a permisos de lectura y operacion de Servicios. Su navegacion no expone dashboard, administracion ni otros modulos.
- 2026-06-11: El seed local crea y mantiene diez tecnicos demo activos con ficha laboral asociada para asignacion obligatoria en ordenes.

## Regla de experiencia

Configuracion debe ser potente pero ordenada: cada seccion administrativa debe mostrar una tarea principal y evitar mezclar permisos, usuarios y datos maestros sin separacion visual.

## Contexto historico

La trazabilidad de migracion desde APEX legacy se conserva en `docs/legacy/modules/administracion/cambios-migracion-legacy.md`. La fuente vigente de cambios de producto es este documento.

## Validaciones esperadas

- Crear usuario.
- Activar/inactivar usuario.
- Crear rol.
- Editar permisos de rol.
- Cambiar entre secciones sin perder contexto.
- Abrir configuraciones desde el panel principal sin saturar la pantalla.
- Guardar ficha maestra de usuario sin migraciones de base de datos.
