# NYVORA Record Lifecycle Management Policy

Fecha: 2026-07-03

## Regla definitiva

NYVORA no permite borrado fisico por defecto. Toda entidad productiva debe operar con ciclo de vida: activo, inactivo, suspendido, anulado, cerrado o archivado, segun corresponda.

El permiso especial `DELETE_PHYSICAL_RECORDS` existe solo como permiso explicito de emergencia. No se hereda por ningun rol del sistema, incluyendo Administrador de empresa y Platform SuperAdmin. La accion interna usa la clave `delete_physical_records`.

## Requisitos para borrado fisico

Un borrado fisico solo puede ejecutarse cuando se cumplan todas las condiciones:

- Permiso explicito `delete_physical_records`.
- Doble confirmacion visual.
- Motivo obligatorio.
- Validacion de dependencias.
- Respuesta controlada al usuario.
- Registro auditable del intento y del resultado.

## Entidades protegidas

- Empresas: nunca se eliminan fisicamente; solo se inactivan.
- Usuarios con historial: nunca se eliminan fisicamente; se inactivan.
- Servicios iniciados, en ejecucion o cerrados: nunca se eliminan fisicamente; cambian de estado.
- Marcaciones, logs y auditoria: nunca se eliminan fisicamente.
- Evidencias asociadas a servicios o novedades: nunca se eliminan fisicamente.
- Vehiculos con historial: se inactivan.
- Referencias con uso: se inactivan.
- Roles asignados: no se eliminan hasta remover asignaciones.
- Catalogos sin uso: pueden eliminarse solo con permiso explicito y validacion de dependencias.

## Implementacion actual

- El catalogo de permisos expone `delete_physical_records`.
- Los roles por defecto lo reciben en `false`.
- La accion de empresa en Administracion APEX inactiva la empresa y exige motivo.
- El endpoint `/api/platform/companies` no ejecuta `DELETE` real sobre `companies`; actualiza `status=inactive`.

## Regla para futuros modulos

Toda tabla nueva debe definir:

- `company_id` obligatorio cuando el dato pertenezca a una empresa.
- Estado funcional para cierre/inactivacion/anulacion.
- Auditoria minima de creacion y actualizacion.
- Politica RLS por empresa.
- Validacion de permiso por accion.
- Decisiones RLM documentadas antes de exponer botones destructivos.
