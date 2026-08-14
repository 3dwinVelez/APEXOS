# Evidencia pruebas reales Nyvora - Transporte y Talento Humano

- Fecha: 2026-08-14T00:19:39.440Z
- Ambiente: production
- Empresa: NYVORA
- Company ID: 82c2da06-418d-4026-8c49-b28a2db4552d
- Tenant ID: 9a6ffc43-9aec-4b1b-8943-f098a4046b97
- Sede usada: NYVORA Centro
- Marcador tecnico: nyvora_real_transport_hr_20260813MASS02

## Usuarios y roles utilizados

- nyvora.real.admin.20260813MASS02@internal.apexos.local | rol: NYVORA Real Admin 20260813MASS02 | empleado: NYV-REAL-20260813MASS02-ADM | modulo: Transporte/Talento Humano administracion
- nyvora.real.driver.20260813MASS02@internal.apexos.local | rol: NYVORA Real Operativo 20260813MASS02 | empleado: NYV-REAL-20260813MASS02-DRV | modulo: Talento Humano marcaciones, checklist, ruta; Transporte lectura
- nyvora.real.operativo.20260813MASS02@internal.apexos.local | rol: NYVORA Real Operativo 20260813MASS02 | empleado: NYV-REAL-20260813MASS02-OPR | modulo: Talento Humano estado incompleto
- nyvora.real.consulta.20260813MASS02@internal.apexos.local | rol: NYVORA Real Consulta 20260813MASS02 | empleado: NYV-REAL-20260813MASS02-CON | modulo: Consulta permisos negativos

## Datos creados o reutilizados

- Empleado conductor: NYV-REAL-20260813MASS02-DRV (192)
- Empleado operativo incompleto: NYV-REAL-20260813MASS02-OPR (193)
- Vehiculo: NYSS02 (20)
- Ruta: 29 en 2026-08-13
- Checklist generado desde marcacion de entrada y aprobado para ruta 29

## Pruebas ejecutadas

| Prueba | Resultado | Evidencia tecnica |
| --- | --- | --- |
| nyvora_roles_users_employees_created_or_reused | OK | `{"roles":["NYVORA Real Admin 20260813MASS02","NYVORA Real Operativo 20260813MASS02","NYVORA Real Consulta 20260813MASS02"],"credentials_file":"C:\\Users\\mq1\\Documents\\Proyectos\\APEXOS-worktrees\\desarrollo-login-visibility\\config\\nyvora-real-test-credentials.env","users":[{"email":"nyvora.real.admin.20260813MASS02@internal.apexos.local","role":"NYVORA Real Admin 20260813MASS02","employee_id":191,"code":"NYV-REAL-20260813MASS02-ADM"},{"email":"nyvora.real.driver.20260813MASS02@internal.apexos.local","role":"NYVORA Real Operativo 20260813MASS02","employee_id":192,"code":"NYV-REAL-20260813MASS02-DRV"},{"email":"nyvora.real.operativo.20260813MASS02@internal.apexos.local","role":"NYVORA Real Operativo 20260813MASS02","employee_id":193,"code":"NYV-REAL-20260813MASS02-OPR"},{"email":"nyvora.real.consulta.20260813MASS02@internal.apexos.local","role":"NYVORA Real Consulta 20260813MASS02","employee_id":194,"code":"NYV-REAL-20260813MASS02-CON"}]}` |
| transport_vehicle_created_or_reused_for_nyvora | OK | `{"id":20,"plate":"NYSS02","site":"NYVORA Centro","driver_id":192,"master_status":"apto_documentalmente","document_status":"apto_documentalmente"}` |
| hr_schedule_created_for_nyvora_processing | OK | `{"id":8,"name":"Horario Nyvora Real 20260813MASS02","start_time":"08:00","end_time":"17:00","lunch_start_time":"12:00","lunch_end_time":"13:00"}` |
| hr_transport_route_created_for_nyvora | OK | `{"id":29,"date":"2026-08-13","vehicle_plate":"NYSS02","employees":["NYV-REAL-20260813MASS02-DRV"],"status":"active"}` |
| tenant_modules_enabled_for_hr_transport | OK | `{"tenant_id":"9a6ffc43-9aec-4b1b-8943-f098a4046b97","active_modules":["produccion","apex_ai","cartera","planeacion_demanda","tesoreria","facturacion","activos","inventario","administracion_apex","costos","facturacion_electronica","compras","talento_humano","finanzas","calidad","configuracion_inicial","transporte","servicios","crm","comercio_exterior","devoluciones","wms","reportes","contabilidad","proyectos","configuracion","suscripciones","ventas","recetas","punto_de_venta","presupuestos","dashboard","admin","usuarios","roles","maestros","services","hr","transport","logs"]}` |
| rbac_admin_can_write_transport | OK | `{"ok":true,"status":200,"payload":null}` |
| rbac_operative_can_write_hr_punches | OK | `{"ok":true,"status":200,"payload":null}` |
| rbac_operative_cannot_write_transport_master | OK | `{"ok":false,"status":403,"payload":{"error":"Sin permiso para esta acción","code":"PERMISO_DENEGADO","details":{"module":"transport","action":"write"}}}` |
| rbac_readonly_cannot_write_hr | OK | `{"ok":false,"status":403,"payload":{"error":"Sin permiso para esta acción","code":"PERMISO_DENEGADO","details":{"module":"hr","action":"write"}}}` |
| hr_driver_entry_requires_preoperational_checklist | OK | `{"checklist_id":10,"route_authorized":false}` |
| hr_preop_incomplete_checklist_rejected | OK | `{"expected_status":422,"obtained_status":422,"code":null,"message":"Debes responder todo el checklist preoperacional."}` |
| transport_preoperational_checklist_approved | OK | `{"checklist_id":10,"status":"aprobado","route_authorized":true}` |
| hr_full_workday_punch_flow_completed | OK | `{"punch_ids":[145,146,147,148],"types":["entrada","inicio_almuerzo","fin_almuerzo","salida"],"route_id":29,"vehicle_plate":"NYSS02"}` |
| hr_duplicate_or_completed_day_rejected | OK | `{"expected_status":409,"obtained_status":409,"code":"JORNADA_COMPLETA","message":"La jornada ya esta completa para hoy."}` |
| hr_missing_user_data_rejected | OK | `{"expected_status":400,"obtained_status":400,"code":null,"message":"Usuario requerido para registrar marcacion"}` |
| hr_route_without_employee_rejected | OK | `{"expected_status":400,"obtained_status":400,"code":"VALIDATION_ERROR","message":"Selecciona al menos una persona para asignar el horario."}` |
| hr_incomplete_state_visible_and_queryable | OK | `{"punch_id":149,"attendance_next_type":"inicio_almuerzo","session_active":true,"alerts":[{"type":"sin_actividades","severity":"warning","message":"Jornada activa sin actividades registradas."}]}` |
| hr_sequence_accepts_metadata_only_route_marks | OK | `{"route_id":30,"created_type":"inicio_almuerzo","next":"fin_almuerzo"}` |
| hr_gps_and_route_tracking_queryable | OK | `{"gps_points":4,"tracking_punches":4,"route_id":29}` |
| hr_monitor_operations_map_reflects_route_punches | OK | `{"route_id":29,"monitor_route_id":29,"monitor_employee_names":["Nyvora Conductor Real 20260813MASS02"],"punch_points":[{"id":145,"type":"entrada","user_name":"Nyvora Conductor Real 20260813MASS02","route_id":29},{"id":146,"type":"inicio_almuerzo","user_name":"Nyvora Conductor Real 20260813MASS02","route_id":29},{"id":147,"type":"fin_almuerzo","user_name":"Nyvora Conductor Real 20260813MASS02","route_id":29},{"id":148,"type":"salida","user_name":"Nyvora Conductor Real 20260813MASS02","route_id":29}],"activity_points":0}` |
| hr_workday_processing_consults_nyvora_data | OK | `{"processed":25,"driver_processed":true}` |
| transport_query_filters_detail_and_planning_ok | OK | `{"filtered_count":15,"vehicle_id":20,"plate":"NYSS02","can_start_route":true,"master_status":"apto_documentalmente"}` |
| transport_route_status_changed_after_execution | OK | `{"route_id":29,"status":"completed"}` |
| transport_vehicle_missing_required_fields_rejected | OK | `{"expected_status":400,"obtained_status":400,"code":null,"message":"El campo brand es obligatorio."}` |
| transport_vehicle_inconsistent_dates_rejected | OK | `{"expected_status":400,"obtained_status":400,"code":null,"message":"La fecha de vencimiento de SOAT no puede ser anterior a la fecha de emision."}` |
| database_nyvora_records_persisted_and_isolated | OK | `{"tenant_id":"9a6ffc43-9aec-4b1b-8943-f098a4046b97","counts":{"users":4,"employees":4,"vehicles":1,"time_punches":7,"gps_pings":6,"routes":2,"checklists":1},"cross_tenant":[{"table_name":"Employee","count":0},{"table_name":"Vehicle","count":0},{"table_name":"TimePunch","count":0},{"table_name":"GpsPing","count":0}]}` |
| database_closed_work_session_for_driver | OK | `{"session_id":30,"status":"cerrada","route_id":29,"preop_checklist_id":10}` |
| ux_relevant_frontend_files_without_generic_filler_text | OK | `{"files_checked":["apps/web/app/dashboard/transporte/page.tsx","apps/web/app/dashboard/talento-humano/page.tsx","apps/web/app/dashboard/talento-humano/rutas/page.tsx","apps/web/app/dashboard/talento-humano/marcacion/page.tsx","apps/web/app/dashboard/talento-humano/mapa/page.tsx","apps/web/app/dashboard/talento-humano/reportes/page.tsx"],"hits":[]}` |
| ux_forms_have_error_loading_and_responsive_classes | OK | `{"transport_error_handling_detected":true,"responsive_classes_detected":true}` |

## Resultado esperado vs obtenido

- Esperado: datos operativos Nyvora aislados por tenant, jornada completa registrable solo en secuencia valida, checklist preoperacional obligatorio para conductor con ruta/vehiculo, vehiculo consultable por filtros/detalle, errores controlados para datos incompletos e inconsistentes.
- Obtenido: todos los checks obligatorios quedaron OK.

## Errores encontrados

- No quedaron errores bloqueantes en la corrida automatizada real.

## Correcciones aplicadas

- `apps/api/src/modules/hr/service.js`: se corrigio la busqueda de empleado para normalizar `user_name` ausente y devolver error 400 controlado en marcaciones incompletas.
- `apps/api/src/modules/hr/service.js`: la secuencia de marcacion valida aliases operativos enviados por el movil para alinear API, Marcacion y monitor.
- `apps/api/src/modules/hr/service.js`: la busqueda por horario acepta `route_id` numerico y metadata (`display_route_id`, `route_code`, `legacy_route_id`, `source_route_id`) para no perder marcas historicas.
- `apps/web/app/dashboard/talento-humano/rutas/page.tsx`: el monitor muestra el ID del horario en la tabla principal.
- `apps/web/lib/api.ts`: Transporte y Talento Humano ahora prefieren el API operativo cuando esta configurado, usando Supabase solo como respaldo para evitar pantallas vacias con datos reales en Prisma/API.
- `scripts/nyvora-real-transport-hr-validation.js`: se agrego validador real Nyvora con datos controlados, horario minimo, credenciales temporales locales y evidencia automatica.
- No se borraron datos existentes y no se modificaron datos sensibles fuera de los registros controlados con marcador tecnico.

## Pendientes

- Sin pendientes tecnicos bloqueantes en backend/base. Validacion visual manual queda documentada en la auditoria principal.
