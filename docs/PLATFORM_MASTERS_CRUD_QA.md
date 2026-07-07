# Platform masters CRUD QA

## Objetivo

Consolidar la administracion de maestros transversales en la seccion **Maestros de plataforma** y asegurar que cada catalogo pueda crearse, editarse, activarse/inactivarse y eliminarse desde una sola vista administrativa.

## Catalogos Cubiertos

- Tipos de usuario
- Estados de usuario
- Tipos de documento
- Cargos
- Areas
- Sedes
- Centros de costo
- Tipos de contrato
- Turnos
- Tipos documentales
- Bancos
- Tipos de servicio
- Almacenes de servicio
- Preguntas de satisfaccion

## Ajustes Aplicados

- El modal de maestros usa una cabecera compacta con selector de catalogo, conteo de registros y accion de nuevo registro.
- La captura queda separada de la tabla para que el usuario pueda editar sin perder visibilidad de los datos.
- Todas las filas muestran estado y acciones consistentes: editar, activar/inactivar y eliminar.
- Los maestros base de usuario ahora exponen endpoints `PUT` y `DELETE` para modificar y retirar registros.
- El fallback del frontend mantiene las mismas operaciones para ambientes que usan almacenamiento local/Supabase.
- Se bloquea la edicion de codigo cuando genera duplicados contra otro item existente.

## Prueba Funcional Esperada

1. Abrir Administracion APEX y entrar a **Maestros**.
2. Seleccionar cada catalogo disponible.
3. Crear un registro de prueba con codigo y nombre.
4. Editar el registro desde la tabla y confirmar que el formulario se carga con sus datos.
5. Guardar un cambio de nombre o descripcion.
6. Inactivar y volver a activar el registro.
7. Eliminar el registro y confirmar que desaparece de la tabla.
8. Verificar que el catalogo actualizado siga alimentando los selects de creacion/edicion de usuarios o servicios segun aplique.

## Validaciones Tecnicas

- `node -c apps/api/src/modules/admin/service.js`
- `node -c apps/api/src/modules/admin/routes.js`
- `npm --workspace apps/web run lint`
- `npm --workspace apps/web run typecheck`
- `npm --workspace apps/web run build`
