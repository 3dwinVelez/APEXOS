# QA real Nyvora - usuarios, roles y permisos

- Fecha: 2026-07-06T14:26:38.439Z
- Rama: codex-user-creation-agile-audit
- Commit base: 7f04df9
- Empresa usada: Nyvora
- Company ID: 82c2da06-418d-4026-8c49-b28a2db4552d
- Tenant ID: 9a6ffc43-9aec-4b1b-8943-f098a4046b97
- Marcador tecnico: nyvora_users_roles_qa_202607061426

## Usuarios creados

- Nyvora QA admin 202607061426 | nyvora.qa.admin.202607061426@internal.apexos.local | rol: NYV QA Admin Empresa 202607061426 | estado: activo | empleado: 107
- Nyvora QA hr 202607061426 | nyvora.qa.hr.202607061426@internal.apexos.local | rol: NYV QA Operativo TH 202607061426 | estado: activo | empleado: 108
- Nyvora QA transport 202607061426 | nyvora.qa.transport.202607061426@internal.apexos.local | rol: NYV QA Operativo Transporte 202607061426 | estado: activo | empleado: 109
- Nyvora QA supervisor 202607061426 | nyvora.qa.supervisor.202607061426@internal.apexos.local | rol: NYV QA Supervisor 202607061426 | estado: activo | empleado: 110
- Nyvora QA readonly 202607061426 | nyvora.qa.readonly.202607061426@internal.apexos.local | rol: NYV QA Consulta 202607061426 | estado: activo | empleado: 111

## Roles creados

- NYV QA Admin Empresa 202607061426 | id: 43 | permisos: admin:read, admin:write, hr:approve, hr:export, hr:read, hr:write, transport:approve, transport:export, transport:read, transport:write
- NYV QA Supervisor 202607061426 | id: 44 | permisos: hr:approve, hr:read, hr:write, transport:approve, transport:read, transport:write
- NYV QA Operativo TH 202607061426 | id: 45 | permisos: hr:read, hr:write
- NYV QA Operativo Transporte 202607061426 | id: 46 | permisos: transport:read, transport:write
- NYV QA Consulta 202607061426 | id: 47 | permisos: hr:read, transport:read

## Matriz usuario / rol / permisos

| Usuario | Rol | Permisos esperados |
| --- | --- | --- |
| nyvora.qa.admin.202607061426@internal.apexos.local | NYV QA Admin Empresa 202607061426 | admin:read, admin:write, hr:approve, hr:export, hr:read, hr:write, transport:approve, transport:export, transport:read, transport:write |
| nyvora.qa.hr.202607061426@internal.apexos.local | NYV QA Operativo TH 202607061426 | hr:read, hr:write |
| nyvora.qa.transport.202607061426@internal.apexos.local | NYV QA Operativo Transporte 202607061426 | transport:read, transport:write |
| nyvora.qa.supervisor.202607061426@internal.apexos.local | NYV QA Supervisor 202607061426 | hr:approve, hr:read, hr:write, transport:approve, transport:read, transport:write |
| nyvora.qa.readonly.202607061426@internal.apexos.local | NYV QA Consulta 202607061426 | hr:read, transport:read |

## Pruebas ejecutadas

| Prueba | Resultado obtenido | Evidencia tecnica |
| --- | --- | --- |
| tenant_modules_admin_hr_transport_enabled | OK | `{"active_modules":["produccion","apex_ai","cartera","planeacion_demanda","tesoreria","facturacion","activos","inventario","administracion_apex","costos","facturacion_electronica","compras","talento_humano","finanzas","calidad","configuracion_inicial","transporte","servicios","crm","comercio_exterior","devoluciones","wms","reportes","contabilidad","proyectos","configuracion","suscripciones","ventas","recetas","punto_de_venta","presupuestos"]}` |
| roles_created_for_nyvora | OK | `[{"id":43,"name":"NYV QA Admin Empresa 202607061426","permissions":[{"id":295,"role_id":43,"module":"admin","action":"read"},{"id":296,"role_id":43,"module":"admin","action":"write"},{"id":303,"role_id":43,"module":"hr","action":"approve"},{"id":304,"role_id":43,"module":"hr","action":"export"},{"id":301,"role_id":43,"module":"hr","action":"read"},{"id":302,"role_id":43,"module":"hr","action":"write"},{"id":299,"role_id":43,"module":"transport","action":"approve"},{"id":300,"role_id":43,"module":"transport","action":"export"},{"id":297,"role_id":43,"module":"transport","action":"read"},{"id":298,"role_id":43,"module":"transport","action":"write"}]},{"id":44,"name":"NYV QA Supervisor 202607061426","permissions":[{"id":310,"role_id":44,"module":"hr","action":"approve"},{"id":308,"role_id":44,"module":"hr","action":"read"},{"id":309,"role_id":44,"module":"hr","action":"write"},{"id":307,"role_id":44,"module":"transport","action":"approve"},{"id":305,"role_id":44,"module":"transport","action":"read"},{"id":306,"role_id":44,"module":"transport","action":"write"}]},{"id":45,"name":"NYV QA Operativo TH 202607061426","permissions":[{"id":311,"role_id":45,"module":"hr","action":"read"},{"id":312,"role_id":45,"module":"hr","action":"write"}]},{"id":46,"name":"NYV QA Operativo Transporte 202607061426","permissions":[{"id":313,"role_id":46,"module":"transport","action":"read"},{"id":314,"role_id":46,"module":"transport","action":"write"}]},{"id":47,"name":"NYV QA Consulta 202607061426","permissions":[{"id":316,"role_id":47,"module":"hr","action":"read"},{"id":315,"role_id":47,"module":"transport","action":"read"}]}]` |
| duplicate_role_rejected | OK | `{"expected_status":409,"obtained_status":409,"message":"Ya existe un rol con ese nombre en esta empresa."}` |
| inactive_role_cannot_create_user | OK | `{"expected_status":400,"obtained_status":400,"message":"El rol seleccionado esta inactivo"}` |
| quick_users_created_with_relations | OK | `[{"id":51,"name":"Nyvora QA admin 202607061426","email":"nyvora.qa.admin.202607061426@internal.apexos.local","role":"NYV QA Admin Empresa 202607061426","active":true,"employee_id":107,"expected_permissions":"admin:read, admin:write, hr:approve, hr:export, hr:read, hr:write, transport:approve, transport:export, transport:read, transport:write"},{"id":52,"name":"Nyvora QA hr 202607061426","email":"nyvora.qa.hr.202607061426@internal.apexos.local","role":"NYV QA Operativo TH 202607061426","active":true,"employee_id":108,"expected_permissions":"hr:read, hr:write"},{"id":53,"name":"Nyvora QA transport 202607061426","email":"nyvora.qa.transport.202607061426@internal.apexos.local","role":"NYV QA Operativo Transporte 202607061426","active":true,"employee_id":109,"expected_permissions":"transport:read, transport:write"},{"id":54,"name":"Nyvora QA supervisor 202607061426","email":"nyvora.qa.supervisor.202607061426@internal.apexos.local","role":"NYV QA Supervisor 202607061426","active":true,"employee_id":110,"expected_permissions":"hr:approve, hr:read, hr:write, transport:approve, transport:read, transport:write"},{"id":55,"name":"Nyvora QA readonly 202607061426","email":"nyvora.qa.readonly.202607061426@internal.apexos.local","role":"NYV QA Consulta 202607061426","active":true,"employee_id":111,"expected_permissions":"hr:read, transport:read"}]` |
| duplicate_user_email_rejected | OK | `{"expected_status":409,"obtained_status":409,"message":"Ya existe un usuario con este correo en la empresa."}` |
| required_company_validated | OK | `{"expected_status":400,"obtained_status":400,"message":"La empresa del usuario es obligatoria."}` |
| required_role_validated | OK | `{"expected_status":400,"obtained_status":400,"message":"El rol principal es obligatorio."}` |
| inactive_user_cannot_login | OK | `{"expected_status":403,"obtained_status":403,"message":"Usuario desactivado"}` |
| active_user_can_login_after_reactivation | OK | `{"email":"nyvora.qa.inactive.202607061426@internal.apexos.local","role":"NYV QA Consulta 202607061426"}` |
| login_ok_nyvora.qa.admin.202607061426@internal.apexos.local | OK | `{"role":"NYV QA Admin Empresa 202607061426","permissions":10}` |
| login_ok_nyvora.qa.hr.202607061426@internal.apexos.local | OK | `{"role":"NYV QA Operativo TH 202607061426","permissions":2}` |
| login_ok_nyvora.qa.transport.202607061426@internal.apexos.local | OK | `{"role":"NYV QA Operativo Transporte 202607061426","permissions":2}` |
| login_ok_nyvora.qa.supervisor.202607061426@internal.apexos.local | OK | `{"role":"NYV QA Supervisor 202607061426","permissions":6}` |
| login_ok_nyvora.qa.readonly.202607061426@internal.apexos.local | OK | `{"role":"NYV QA Consulta 202607061426","permissions":2}` |
| permission_nyvora.qa.admin.202607061426@internal.apexos.local_admin_write | OK | `{"ok":true,"status":200,"payload":null}` |
| permission_nyvora.qa.admin.202607061426@internal.apexos.local_hr_write | OK | `{"ok":true,"status":200,"payload":null}` |
| permission_nyvora.qa.admin.202607061426@internal.apexos.local_transport_write | OK | `{"ok":true,"status":200,"payload":null}` |
| permission_nyvora.qa.hr.202607061426@internal.apexos.local_hr_write | OK | `{"ok":true,"status":200,"payload":null}` |
| permission_nyvora.qa.hr.202607061426@internal.apexos.local_transport_write_denied | OK | `{"ok":false,"status":403,"payload":{"error":"Sin permiso para esta acción","code":"PERMISO_DENEGADO","details":{"module":"transport","action":"write"}}}` |
| permission_nyvora.qa.transport.202607061426@internal.apexos.local_transport_write | OK | `{"ok":true,"status":200,"payload":null}` |
| permission_nyvora.qa.transport.202607061426@internal.apexos.local_hr_write_denied | OK | `{"ok":false,"status":403,"payload":{"error":"Sin permiso para esta acción","code":"PERMISO_DENEGADO","details":{"module":"hr","action":"write"}}}` |
| permission_nyvora.qa.supervisor.202607061426@internal.apexos.local_hr_read | OK | `{"ok":true,"status":200,"payload":null}` |
| permission_nyvora.qa.supervisor.202607061426@internal.apexos.local_transport_write | OK | `{"ok":true,"status":200,"payload":null}` |
| permission_nyvora.qa.readonly.202607061426@internal.apexos.local_hr_read | OK | `{"ok":true,"status":200,"payload":null}` |
| permission_nyvora.qa.readonly.202607061426@internal.apexos.local_transport_read | OK | `{"ok":true,"status":200,"payload":null}` |
| permission_nyvora.qa.readonly.202607061426@internal.apexos.local_hr_write_denied | OK | `{"ok":false,"status":403,"payload":{"error":"Sin permiso para esta acción","code":"PERMISO_DENEGADO","details":{"module":"hr","action":"write"}}}` |
| permission_nyvora.qa.readonly.202607061426@internal.apexos.local_transport_write_denied | OK | `{"ok":false,"status":403,"payload":{"error":"Sin permiso para esta acción","code":"PERMISO_DENEGADO","details":{"module":"transport","action":"write"}}}` |
| permission_nyvora.qa.readonly.202607061426@internal.apexos.local_admin_write_denied | OK | `{"ok":false,"status":403,"payload":{"error":"Sin permiso para esta acción","code":"PERMISO_DENEGADO","details":{"module":"admin","action":"write"}}}` |
| database_records_are_nyvora_scoped | OK | `{"tenant_id":"9a6ffc43-9aec-4b1b-8943-f098a4046b97","counts":{"roles":6,"users":6,"nyvora_employees_total":32},"cross_tenant":[{"table_name":"Role","count":0},{"table_name":"User","count":0},{"table_name":"Employee","count":0}]}` |
| frontend_quick_creation_visible | OK | `{"quick_title":true,"minimal_fields":true}` |
| frontend_complete_creation_blocked | OK | `{"upcoming_text":true,"disabled_button":true}` |
| frontend_responsive_classes_present | OK | `{"responsive_classes":32}` |

## Resultado esperado

- Usuarios creados en Nyvora con datos minimos y relaciones User/Employee/Role.
- Roles creados y permisos aplicados por middleware RBAC.
- Login funcional para usuarios activos.
- Duplicados rechazados.
- Roles y usuarios aislados por tenant.
- Creacion completa visible pero bloqueada.

## Errores encontrados

- No se encontraron errores bloqueantes en la corrida automatizada.

## Correcciones aplicadas

- No fue necesario corregir codigo durante esta corrida QA.

## Validacion posterior

- Roles y usuarios creados mediante servicios reales de administracion.
- Login validado con bcrypt/JWT para usuarios activos e inactivos.
- Permisos validados con middleware backend `requirePermission`.
- Aislamiento validado por tenant con consulta de solo lectura cross-tenant para el marcador tecnico.
- Creacion completa validada como visible y bloqueada por inspeccion de codigo fuente.

## Riesgos pendientes

- La revision de consola de navegador requiere sesion interactiva con frontend productivo; esta corrida valida UI por build y codigo fuente.

## Estado final

APROBADO: usuarios, roles y permisos Nyvora validados con datos reales controlados.
