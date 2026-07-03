# NYVORA Core Enterprise Certification

Fecha: 2026-07-03

## Objetivo

Certificar el hardening final del CORE NYVORA para clientes controlados, cerrando brechas de ciclo de vida de registros, RBAC/ABAC, multiempresa y clasificacion de modulos.

## Cambios aplicados

- Se incorporo el permiso especial `DELETE_PHYSICAL_RECORDS` como `delete_physical_records` en el catalogo de permisos.
- Se garantizo que los roles por defecto no hereden borrado fisico.
- Se cambio la accion de empresa desde eliminacion destructiva a inactivacion controlada.
- La inactivacion de empresa exige motivo obligatorio.
- El endpoint oficial de empresas conserva datos historicos con `status=inactive`.
- Se documento la politica RLM, matriz RBAC/ABAC y estandares de producto.

## Cobertura CORE

| Area | Estado | Criterio |
| --- | --- | --- |
| Administracion APEX | CORE | Platform Admin y empresas. |
| Empresas | CORE | Inactivacion, no borrado fisico. |
| Usuarios | CORE | Roles y permisos por empresa. |
| Roles | CORE | Permiso RLM explicito. |
| Servicios | CORE | Flujo por estados y evidencias. |
| Talento Humano | CORE | Tecnicos y marcaciones por empresa. |
| Transporte / Vehiculos | CORE | Entidades con historial se inactivan. |
| Dashboard | CORE | Resumen por empresa activa. |
| Auditoria / Logs | CORE | No borrado fisico. |
| Storage / Evidencias | CORE | Evidencias asociadas protegidas. |

## Dictamen tecnico

El CORE queda preparado para operacion con clientes controlados bajo las siguientes reglas:

- Ninguna empresa se elimina fisicamente desde Administracion APEX.
- El borrado fisico requiere permiso especial explicito y no se entrega por defecto.
- Todo nuevo modulo debe implementar `company_id`, RBAC, ABAC, RLS y RLM antes de considerarse estable.

## Pendientes de verificacion externa

Las pruebas con login real de usuarios NYVORA y salud de backend productivo dependen de credenciales y disponibilidad externa. Deben ejecutarse en la ventana operativa final sin imprimir secretos.
