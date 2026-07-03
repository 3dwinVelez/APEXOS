# Manual del administrador

Cliente: IMPORTADORA SCJ SAS  
NIT: 901406939  
Producto: NYVORA - APEX OS  
Version del documento: 1.0  
Fecha: 2026-07-03

## Objetivo

Orientar al administrador de IMPORTADORA SCJ SAS en la configuracion y operacion inicial de usuarios, roles, permisos, modulos, maestros, vehiculos y servicios.

## Alcance

Este manual aplica para usuarios con permisos administrativos dentro de la empresa. No reemplaza las politicas internas de la organizacion.

## Requisitos

- Usuario administrador activo.
- Acceso a la plataforma.
- Conocimiento basico de los usuarios y areas de la empresa.
- Lista de personas que usaran el sistema.
- Definicion de roles internos.

## Descripcion general

El administrador controla quien puede ingresar, que modulos puede ver cada usuario y que acciones puede realizar. Tambien apoya la configuracion inicial de maestros, vehiculos y servicios.

## Creacion de usuarios

1. Ingrese a **Administracion APEX**.
2. Abra la seccion de usuarios.
3. Seleccione **Crear usuario**.
4. Registre nombre, correo, documento y datos requeridos.
5. Asigne empresa, rol y estado activo.
6. Guarde el usuario.
7. Entregue credenciales temporales por un canal seguro.

## Edicion de usuarios

1. Busque el usuario.
2. Abra la opcion de editar.
3. Actualice los datos permitidos.
4. Revise que el rol siga siendo correcto.
5. Guarde cambios.

Si un usuario ya no debe ingresar, cambie su estado a inactivo. No elimine usuarios con historial.

## Roles

Los roles agrupan permisos. Un rol debe representar una responsabilidad real dentro de la empresa.

Roles sugeridos:

- Administrador de empresa.
- Supervisor operativo.
- Tecnico.
- Empleado.
- Auditor.

## Permisos

Los permisos definen acciones como ver, crear, editar, adjuntar, descargar o ejecutar. Asigne solo lo necesario para cada funcion.

El permiso de borrado fisico no se entrega por defecto. Las acciones de baja deben realizarse como inactivacion, anulacion, cierre o archivo.

## Empresas

La empresa activa para este kit es IMPORTADORA SCJ SAS. La administracion de empresas permite revisar datos principales, estado y modulos habilitados.

No inactive una empresa sin autorizacion interna. Si se requiere hacerlo, registre el motivo y confirme la accion.

## Modulos

Modulos activos:

- Inicio.
- Administracion APEX.
- Talento Humano.
- Servicios.
- Transporte.

Los demas modulos quedan disponibles para futuras expansiones.

## Maestros

Los maestros son listas base usadas por la operacion. Ejemplos:

- Tipos de servicio.
- Referencias.
- Piezas.
- Cargos.
- Zonas.
- Estados.

Revise que los maestros esten completos antes de iniciar operacion masiva.

## Vehiculos

1. Ingrese a Transporte.
2. Cree o edite vehiculos.
3. Verifique placa, estado y datos operativos.
4. Mantenga inactivos los vehiculos que ya no se usen.

## Servicios

Desde Servicios puede consultar ordenes, asignar tecnicos, revisar estados y validar evidencias.

Estados comunes:

- Agendado.
- Pendiente.
- En curso.
- Inspeccion.
- Ejecucion.
- Cerrada.
- No ejecutada.
- Cancelada.

## Paso a paso inicial recomendado

1. Confirmar datos de empresa.
2. Confirmar modulos habilitados.
3. Crear usuarios administrativos.
4. Crear usuarios tecnicos.
5. Revisar roles y permisos.
6. Validar maestros.
7. Confirmar vehiculos.
8. Crear una orden de servicio controlada.
9. Validar flujo tecnico.
10. Revisar evidencias y cierre.

## Capturas

Pendiente insertar capturas oficiales:

- [Captura: Administracion APEX]
- [Captura: usuarios]
- [Captura: roles y permisos]
- [Captura: modulos de empresa]
- [Captura: servicios]

## Buenas practicas

- Crear usuarios individuales.
- Revisar permisos antes de activar usuarios.
- No compartir contrasenas.
- Inactivar usuarios retirados.
- Mantener maestros limpios y actualizados.
- Validar evidencias antes de cerrar servicios.

## Preguntas frecuentes

**Puedo crear todos los usuarios desde el primer dia?**  
Si, pero se recomienda empezar con un grupo controlado.

**Que hago si un usuario ve modulos que no deberia?**  
Revise su rol, permisos y modulos activos.

**Se pueden eliminar empresas o usuarios?**  
La politica recomendada es inactivar para conservar historial.

## Recomendaciones

Defina responsables internos para usuarios, servicios y transporte. Esto evita cambios no controlados y mejora la trazabilidad.

## Historial de cambios

| Version | Fecha | Cambio |
| --- | --- | --- |
| 1.0 | 2026-07-03 | Manual administrativo inicial para Cliente Productivo #001. |
