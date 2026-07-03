# NYVORA RBAC / ABAC Matrix

Fecha: 2026-07-03

## Principio

RBAC define que puede hacer un rol. ABAC define sobre que empresa, alcance, modulo y recurso puede hacerlo.

Una autorizacion valida requiere simultaneamente:

- Usuario autenticado.
- Perfil activo.
- Empresa activa.
- Relacion usuario-empresa activa.
- Modulo activo para la empresa.
- Permiso RBAC para la accion.
- Alcance ABAC compatible con el recurso.

## Roles CORE

| Rol | Alcance | Modulos | Restricciones |
| --- | --- | --- | --- |
| Platform SuperAdmin | Plataforma | Administracion APEX | Solo flujo platform. No implica datos de empresas si no corresponde. |
| Administrador de empresa | Empresa | Modulos habilitados | No recibe borrado fisico por defecto. |
| Supervisor operativo | Area / empresa | Servicios, transporte, marcaciones | No administra plataforma. |
| Tecnico | Asignado | Servicios | Solo ve y ejecuta ordenes asignadas de su empresa. |
| Auditor | Empresa | Auditoria/reportes | Lectura sensible controlada. |

## Permisos especiales

| Permiso | Estado por defecto | Uso |
| --- | --- | --- |
| `delete` | Segun rol | Eliminacion logica, anulacion o inactivacion. |
| `delete_physical_records` | Siempre false | Borrado fisico excepcional con validaciones RLM. |
| `manage_users` | Roles administrativos | Gestion de usuarios de la empresa. |
| `manage_roles` | Roles administrativos | Gestion de roles de la empresa. |
| `sensitive` | Solo roles autorizados | Datos sensibles y auditoria. |

## ABAC multiempresa

Toda consulta de datos operativos debe filtrar por `company_id` o por una relacion equivalente que derive a la empresa. Ningun modulo debe consultar tecnicos, usuarios, referencias, servicios, vehiculos, clientes, evidencias o logs de otra empresa.

Para datos maestros globales se permite `company_id is null` solo cuando el dato sea catalogo base no sensible. Si una empresa personaliza el dato, se debe crear registro propio con `company_id`.

## Validacion obligatoria por endpoint

Cada endpoint CORE debe validar:

- Token o sesion.
- Membresia activa.
- Modulo activo.
- Permiso de accion.
- Recurso pertenece a la empresa del usuario.
- Respuesta 401/403 controlada si no cumple.

## Pantallas

La UI puede ocultar acciones, pero la seguridad real debe vivir en endpoint, RLS o ambos. Ningun boton oculto reemplaza autorizacion backend.
