# QA real Nyvora - usuarios, roles y permisos

- Fecha: 2026-08-14T00:21:57.532Z
- Rama: desarrollo
- Commit base: 4e985ad
- Empresa usada: Nyvora
- Company ID: 82c2da06-418d-4026-8c49-b28a2db4552d
- Tenant ID: 9a6ffc43-9aec-4b1b-8943-f098a4046b97
- Marcador tecnico: nyvora_users_roles_qa_20260813MASS02

## Usuarios creados

- Nyvora QA admin 20260813MASS02 | nyvora.qa.admin.20260813mass02@internal.apexos.local | rol: NYV QA Admin Empresa 20260813MASS02 | estado: activo | empleado: 195
- Nyvora QA hr 20260813MASS02 | nyvora.qa.hr.20260813mass02@internal.apexos.local | rol: NYV QA Operativo TH 20260813MASS02 | estado: activo | empleado: 196
- Nyvora QA transport 20260813MASS02 | nyvora.qa.transport.20260813mass02@internal.apexos.local | rol: NYV QA Operativo Transporte 20260813MASS02 | estado: activo | empleado: 197
- Nyvora QA supervisor 20260813MASS02 | nyvora.qa.supervisor.20260813mass02@internal.apexos.local | rol: NYV QA Supervisor 20260813MASS02 | estado: activo | empleado: 198
- Nyvora QA readonly 20260813MASS02 | nyvora.qa.readonly.20260813mass02@internal.apexos.local | rol: NYV QA Consulta 20260813MASS02 | estado: activo | empleado: 199

## Roles creados

- NYV QA Admin Empresa 20260813MASS02 | id: 127 | permisos: admin:read, admin:write, hr:approve, hr:export, hr:read, hr:write, transport:approve, transport:export, transport:read, transport:write
- NYV QA Supervisor 20260813MASS02 | id: 128 | permisos: hr:approve, hr:read, hr:write, transport:approve, transport:read, transport:write
- NYV QA Operativo TH 20260813MASS02 | id: 129 | permisos: hr:read, hr:write
- NYV QA Operativo Transporte 20260813MASS02 | id: 130 | permisos: transport:read, transport:write
- NYV QA Consulta 20260813MASS02 | id: 131 | permisos: hr:read, transport:read

## Matriz usuario / rol / permisos

| Usuario | Rol | Permisos esperados |
| --- | --- | --- |
| nyvora.qa.admin.20260813mass02@internal.apexos.local | NYV QA Admin Empresa 20260813MASS02 | admin:read, admin:write, hr:approve, hr:export, hr:read, hr:write, transport:approve, transport:export, transport:read, transport:write |
| nyvora.qa.hr.20260813mass02@internal.apexos.local | NYV QA Operativo TH 20260813MASS02 | hr:read, hr:write |
| nyvora.qa.transport.20260813mass02@internal.apexos.local | NYV QA Operativo Transporte 20260813MASS02 | transport:read, transport:write |
| nyvora.qa.supervisor.20260813mass02@internal.apexos.local | NYV QA Supervisor 20260813MASS02 | hr:approve, hr:read, hr:write, transport:approve, transport:read, transport:write |
| nyvora.qa.readonly.20260813mass02@internal.apexos.local | NYV QA Consulta 20260813MASS02 | hr:read, transport:read |

## Pruebas ejecutadas

| Prueba | Resultado obtenido | Evidencia tecnica |
| --- | --- | --- |
| tenant_modules_admin_hr_transport_enabled | OK | `{"active_modules":["produccion","apex_ai","cartera","planeacion_demanda","tesoreria","facturacion","activos","inventario","administracion_apex","costos","facturacion_electronica","compras","talento_humano","finanzas","calidad","configuracion_inicial","transporte","servicios","crm","comercio_exterior","devoluciones","wms","reportes","contabilidad","proyectos","configuracion","suscripciones","ventas","recetas","punto_de_venta","presupuestos","dashboard","admin","usuarios","roles","maestros","services","hr","transport","logs"]}` |
| roles_created_for_nyvora | OK | `[{"id":127,"name":"NYV QA Admin Empresa 20260813MASS02","permissions":[{"id":581,"role_id":127,"module":"admin","action":"read"},{"id":582,"role_id":127,"module":"admin","action":"write"},{"id":589,"role_id":127,"module":"hr","action":"approve"},{"id":590,"role_id":127,"module":"hr","action":"export"},{"id":587,"role_id":127,"module":"hr","action":"read"},{"id":588,"role_id":127,"module":"hr","action":"write"},{"id":585,"role_id":127,"module":"transport","action":"approve"},{"id":586,"role_id":127,"module":"transport","action":"export"},{"id":583,"role_id":127,"module":"transport","action":"read"},{"id":584,"role_id":127,"module":"transport","action":"write"}]},{"id":128,"name":"NYV QA Supervisor 20260813MASS02","permissions":[{"id":596,"role_id":128,"module":"hr","action":"approve"},{"id":594,"role_id":128,"module":"hr","action":"read"},{"id":595,"role_id":128,"module":"hr","action":"write"},{"id":593,"role_id":128,"module":"transport","action":"approve"},{"id":591,"role_id":128,"module":"transport","action":"read"},{"id":592,"role_id":128,"module":"transport","action":"write"}]},{"id":129,"name":"NYV QA Operativo TH 20260813MASS02","permissions":[{"id":597,"role_id":129,"module":"hr","action":"read"},{"id":598,"role_id":129,"module":"hr","action":"write"}]},{"id":130,"name":"NYV QA Operativo Transporte 20260813MASS02","permissions":[{"id":599,"role_id":130,"module":"transport","action":"read"},{"id":600,"role_id":130,"module":"transport","action":"write"}]},{"id":131,"name":"NYV QA Consulta 20260813MASS02","permissions":[{"id":602,"role_id":131,"module":"hr","action":"read"},{"id":601,"role_id":131,"module":"transport","action":"read"}]}]` |
| duplicate_role_rejected | OK | `{"expected_status":409,"obtained_status":409,"message":"Ya existe un rol visualmente igual: \"NYV QA Consulta 20260813MASS02\". Usa otro nombre o edita el rol existente."}` |
| inactive_role_cannot_create_user | OK | `{"expected_status":400,"obtained_status":400,"message":"El rol seleccionado esta inactivo"}` |
| quick_users_created_with_relations | OK | `[{"id":154,"name":"Nyvora QA admin 20260813MASS02","email":"nyvora.qa.admin.20260813mass02@internal.apexos.local","role":"NYV QA Admin Empresa 20260813MASS02","active":true,"employee_id":195,"expected_permissions":"admin:read, admin:write, hr:approve, hr:export, hr:read, hr:write, transport:approve, transport:export, transport:read, transport:write"},{"id":155,"name":"Nyvora QA hr 20260813MASS02","email":"nyvora.qa.hr.20260813mass02@internal.apexos.local","role":"NYV QA Operativo TH 20260813MASS02","active":true,"employee_id":196,"expected_permissions":"hr:read, hr:write"},{"id":156,"name":"Nyvora QA transport 20260813MASS02","email":"nyvora.qa.transport.20260813mass02@internal.apexos.local","role":"NYV QA Operativo Transporte 20260813MASS02","active":true,"employee_id":197,"expected_permissions":"transport:read, transport:write"},{"id":157,"name":"Nyvora QA supervisor 20260813MASS02","email":"nyvora.qa.supervisor.20260813mass02@internal.apexos.local","role":"NYV QA Supervisor 20260813MASS02","active":true,"employee_id":198,"expected_permissions":"hr:approve, hr:read, hr:write, transport:approve, transport:read, transport:write"},{"id":158,"name":"Nyvora QA readonly 20260813MASS02","email":"nyvora.qa.readonly.20260813mass02@internal.apexos.local","role":"NYV QA Consulta 20260813MASS02","active":true,"employee_id":199,"expected_permissions":"hr:read, transport:read"}]` |
| duplicate_user_email_rejected | OK | `{"expected_status":409,"obtained_status":409,"message":"Ya existe un usuario con este correo en la empresa."}` |
| required_company_validated | OK | `{"expected_status":400,"obtained_status":400,"message":"La empresa del usuario es obligatoria."}` |
| required_role_validated | OK | `{"expected_status":400,"obtained_status":400,"message":"El rol principal es obligatorio."}` |
| inactive_user_cannot_login | OK | `{"expected_status":401,"obtained_status":401,"message":"No fue posible iniciar sesion con esas credenciales."}` |
| active_user_can_login_after_reactivation | OK | `{"email":"nyvora.qa.inactive.20260813mass02@internal.apexos.local","role":"NYV QA Consulta 20260813MASS02"}` |
| login_ok_nyvora.qa.admin.20260813mass02@internal.apexos.local | OK | `{"role":"NYV QA Admin Empresa 20260813MASS02","permissions":10}` |
| login_ok_nyvora.qa.hr.20260813mass02@internal.apexos.local | OK | `{"role":"NYV QA Operativo TH 20260813MASS02","permissions":2}` |
| login_ok_nyvora.qa.transport.20260813mass02@internal.apexos.local | OK | `{"role":"NYV QA Operativo Transporte 20260813MASS02","permissions":2}` |
| login_ok_nyvora.qa.supervisor.20260813mass02@internal.apexos.local | OK | `{"role":"NYV QA Supervisor 20260813MASS02","permissions":6}` |
| login_ok_nyvora.qa.readonly.20260813mass02@internal.apexos.local | OK | `{"role":"NYV QA Consulta 20260813MASS02","permissions":2}` |
| permission_nyvora.qa.admin.20260813mass02@internal.apexos.local_admin_write | OK | `{"ok":true,"status":200,"payload":null}` |
| permission_nyvora.qa.admin.20260813mass02@internal.apexos.local_hr_write | OK | `{"ok":true,"status":200,"payload":null}` |
| permission_nyvora.qa.admin.20260813mass02@internal.apexos.local_transport_write | OK | `{"ok":true,"status":200,"payload":null}` |
| permission_nyvora.qa.hr.20260813mass02@internal.apexos.local_hr_write | OK | `{"ok":true,"status":200,"payload":null}` |
| permission_nyvora.qa.hr.20260813mass02@internal.apexos.local_transport_write_denied | OK | `{"ok":false,"status":403,"payload":{"error":"Sin permiso para esta acción","code":"PERMISO_DENEGADO","details":{"module":"transport","action":"write"}}}` |
| permission_nyvora.qa.transport.20260813mass02@internal.apexos.local_transport_write | OK | `{"ok":true,"status":200,"payload":null}` |
| permission_nyvora.qa.transport.20260813mass02@internal.apexos.local_hr_write_denied | OK | `{"ok":false,"status":403,"payload":{"error":"Sin permiso para esta acción","code":"PERMISO_DENEGADO","details":{"module":"hr","action":"write"}}}` |
| permission_nyvora.qa.supervisor.20260813mass02@internal.apexos.local_hr_read | OK | `{"ok":true,"status":200,"payload":null}` |
| permission_nyvora.qa.supervisor.20260813mass02@internal.apexos.local_transport_write | OK | `{"ok":true,"status":200,"payload":null}` |
| permission_nyvora.qa.readonly.20260813mass02@internal.apexos.local_hr_read | OK | `{"ok":true,"status":200,"payload":null}` |
| permission_nyvora.qa.readonly.20260813mass02@internal.apexos.local_transport_read | OK | `{"ok":true,"status":200,"payload":null}` |
| permission_nyvora.qa.readonly.20260813mass02@internal.apexos.local_hr_write_denied | OK | `{"ok":false,"status":403,"payload":{"error":"Sin permiso para esta acción","code":"PERMISO_DENEGADO","details":{"module":"hr","action":"write"}}}` |
| permission_nyvora.qa.readonly.20260813mass02@internal.apexos.local_transport_write_denied | OK | `{"ok":false,"status":403,"payload":{"error":"Sin permiso para esta acción","code":"PERMISO_DENEGADO","details":{"module":"transport","action":"write"}}}` |
| permission_nyvora.qa.readonly.20260813mass02@internal.apexos.local_admin_write_denied | OK | `{"ok":false,"status":403,"payload":{"error":"Sin permiso para esta acción","code":"PERMISO_DENEGADO","details":{"module":"admin","action":"write"}}}` |
| database_records_are_nyvora_scoped | OK | `{"tenant_id":"9a6ffc43-9aec-4b1b-8943-f098a4046b97","counts":{"roles":6,"users":6,"nyvora_employees_total":64},"cross_tenant":[{"table_name":"Role","count":0},{"table_name":"User","count":0},{"table_name":"Employee","count":0}]}` |
| frontend_quick_creation_visible | OK | `{"quick_title":true,"minimal_fields":true}` |
| frontend_complete_creation_blocked | OK | `{"upcoming_text":true,"disabled_button":true}` |
| frontend_responsive_classes_present | OK | `{"responsive_classes":27}` |

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

- Se ajusto el certificado para esperar el `401` generico y seguro que devuelve una cuenta inactiva, sin revelar su existencia.
- El conteo de correos tecnicos ahora es insensible a mayusculas para coincidir con la normalizacion aplicada al crear usuarios.
- Se agregaron pruebas contractuales que bloquean una regresion de ambas reglas.

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
