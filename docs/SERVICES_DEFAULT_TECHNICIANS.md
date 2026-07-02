# Tecnicos base del modulo Servicios

## Cuando se ejecuta

La generacion se dispara desde la ruta oficial de Administracion APEX que activa modulos por empresa:

`PATCH /api/platform/company-modules`

Solo se evalua cuando el modulo activado corresponde a `servicios` y la operacion se hace desde un Platform SuperAdmin validado.

## Como funciona

Al activar Servicios, el servidor:

1. Valida que el usuario sea Platform SuperAdmin activo.
2. Activa el modulo en `company_modules`.
3. Detecta si el modulo activado es Servicios.
4. Asegura el rol funcional global `tecnico_servicios`.
5. Genera o completa los tecnicos base `tecnico01` a `tecnico10`.

## Usuarios generados

Siempre se cubre el rango fijo:

- `tecnico01`
- `tecnico02`
- `tecnico03`
- `tecnico04`
- `tecnico05`
- `tecnico06`
- `tecnico07`
- `tecnico08`
- `tecnico09`
- `tecnico10`

El sistema no genera usuarios fuera de ese rango automatico.

## Correos

El dominio local se construye a partir del primer identificador util del nombre de la empresa, normalizado a ASCII y minusculas.

Ejemplos:

- `IMPORTADORA SCJ SAS` -> `importadora`
- `NYVORA INTERNAL` -> `nyvora`

Con ese identificador se generan correos como:

- `tecnico01@importadora.local`
- `tecnico10@importadora.local`
- `tecnico01@nyvora.local`

## Contrasena inicial

La contrasena inicial se genera como:

`<identificador>1234`

Ejemplos:

- `importadora1234`
- `nyvora1234`

Todos los tecnicos base de una misma empresa comparten esa clave inicial. La clave no se guarda en metadata como texto plano; se deriva por regla y puede cambiarse posteriormente desde el flujo administrativo seguro.

## Rol y permisos

El rol funcional es:

`tecnico_servicios`

Para compatibilidad con el control de acceso existente, los empleados quedan con:

- `role_id`: `tecnico_servicios`
- `role_code`: `tecnico_servicios`
- `role_name`: `Tecnico`
- `user_type`: `tecnico`
- `profile_kind`: `tecnico`

El rol permite operar Servicios asignados, actualizar estados, cargar evidencias y registrar novedades. No concede permisos de administracion, otros modulos ni acceso entre empresas.

## Idempotencia y duplicados

La operacion es deterministica por empresa:

- Solo intenta cubrir `tecnico01` a `tecnico10`.
- Antes de insertar un empleado, busca por `user_id`, `email` o `employee_code`.
- Si un tecnico ya existe, no lo duplica.
- Si falta alguno del rango, crea solo el faltante.

Esto permite reintentos seguros sin generar mas de diez tecnicos base.

## Usuarios adicionales

Si la empresa necesita mas tecnicos, deben crearse manualmente desde Administracion APEX usando el flujo oficial de usuarios. La generacion automatica solo cubre los diez tecnicos iniciales del modulo Servicios.
