# User HR visibility QA

## Objetivo

Validar que un usuario creado desde Administracion APEX quede disponible en los modulos operativos que dependen del maestro de personas, especialmente Talento Humano > Horarios.

## Hallazgo

El selector de personas para crear horarios consume `/api/v1/hr/employees?active=true`. En ambientes Supabase el fallback filtraba directamente con `status=eq.active`. Esto podia excluir usuarios habilitados cuando el estado venia de datos heredados o integraciones como `activo`, `true` o valores no normalizados, aunque el usuario si existiera en Administracion.

## Correccion

- Se agrego normalizacion de estado de empleado para considerar activos los estados equivalentes y bloquear solo estados inactivos/retiro/suspension.
- La carga de empleados de HR ya no usa filtro rigido `status=eq.active` contra Supabase; filtra despues de normalizar.
- La lista de HR se reconcilia con `/api/admin/users`, de modo que un usuario activo del maestro administrativo tambien quede visible para asignacion de horarios.
- Se eliminan duplicados por `employee.id` al consolidar ambas fuentes.

## Prueba Funcional

1. Crear un usuario activo desde Administracion APEX con rol operativo o administrativo.
2. Confirmar que aparece en el listado de Usuarios de plataforma.
3. Abrir Talento Humano > Horarios.
4. Crear un horario y buscar el usuario por nombre, correo, documento o codigo.
5. Confirmar que el usuario aparece y puede seleccionarse.
6. Guardar el horario y verificar que la persona queda en `employees` del horario.

## Validaciones Tecnicas

- `npm --workspace apps/web run lint`
- `npm --workspace apps/web run typecheck`
- `npm --workspace apps/web run build`
