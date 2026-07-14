# Evidencia pruebas reales Nyvora - Transporte y Talento Humano

- Fecha: 2026-07-14T21:41:51.159Z
- Ambiente: production
- Empresa: NYVORA
- Company ID: 82c2da06-418d-4026-8c49-b28a2db4552d
- Tenant ID: 9a6ffc43-9aec-4b1b-8943-f098a4046b97
- Sede usada: NYVORA Centro
- Marcador tecnico: nyvora_real_transport_hr_202607141645

## Usuarios y roles utilizados

- nyvora.real.admin.202607141645@internal.apexos.local | rol: NYVORA Real Admin 202607141645 | empleado: NYV-REAL-202607141645-ADM | modulo: Transporte/Talento Humano administracion
- nyvora.real.driver.202607141645@internal.apexos.local | rol: NYVORA Real Operativo 202607141645 | empleado: NYV-REAL-202607141645-DRV | modulo: Talento Humano marcaciones, checklist, ruta; Transporte lectura
- nyvora.real.operativo.202607141645@internal.apexos.local | rol: NYVORA Real Operativo 202607141645 | empleado: NYV-REAL-202607141645-OPR | modulo: Talento Humano estado incompleto
- nyvora.real.consulta.202607141645@internal.apexos.local | rol: NYVORA Real Consulta 202607141645 | empleado: NYV-REAL-202607141645-CON | modulo: Consulta permisos negativos

## Datos creados o reutilizados

- Empleado conductor: NYV-REAL-202607141645-DRV (124)
- Empleado operativo incompleto: NYV-REAL-202607141645-OPR (125)
- Vehiculo: NY1645 (17)
- Ruta: 14 en 2026-07-14
- Checklist generado desde marcacion de entrada y aprobado para ruta 14

## Pruebas ejecutadas

| Prueba | Resultado | Evidencia tecnica |
| --- | --- | --- |
| nyvora_roles_users_employees_created_or_reused | OK | `{"roles":["NYVORA Real Admin 202607141645","NYVORA Real Operativo 202607141645","NYVORA Real Consulta 202607141645"],"credentials_file":"C:\\Users\\mq1\\Documents\\Proyectos\\APEXOS\\config\\nyvora-real-test-credentials.env","users":[{"email":"nyvora.real.admin.202607141645@internal.apexos.local","role":"NYVORA Real Admin 202607141645","employee_id":123,"code":"NYV-REAL-202607141645-ADM"},{"email":"nyvora.real.driver.202607141645@internal.apexos.local","role":"NYVORA Real Operativo 202607141645","employee_id":124,"code":"NYV-REAL-202607141645-DRV"},{"email":"nyvora.real.operativo.202607141645@internal.apexos.local","role":"NYVORA Real Operativo 202607141645","employee_id":125,"code":"NYV-REAL-202607141645-OPR"},{"email":"nyvora.real.consulta.202607141645@internal.apexos.local","role":"NYVORA Real Consulta 202607141645","employee_id":126,"code":"NYV-REAL-202607141645-CON"}]}` |
| transport_vehicle_created_or_reused_for_nyvora | OK | `{"id":17,"plate":"NY1645","site":"NYVORA Centro","driver_id":124,"master_status":"apto_documentalmente","document_status":"apto_documentalmente"}` |
| hr_schedule_created_for_nyvora_processing | OK | `{"id":5,"name":"Horario Nyvora Real 202607141645","start_time":"08:00","end_time":"17:00","lunch_start_time":"12:00","lunch_end_time":"13:00"}` |
| hr_transport_route_created_for_nyvora | OK | `{"id":14,"date":"2026-07-14","vehicle_plate":"NY1645","employees":["NYV-REAL-202607141645-DRV"],"status":"active"}` |
| tenant_modules_enabled_for_hr_transport | OK | `{"tenant_id":"9a6ffc43-9aec-4b1b-8943-f098a4046b97","active_modules":["produccion","apex_ai","cartera","planeacion_demanda","tesoreria","facturacion","activos","inventario","administracion_apex","costos","facturacion_electronica","compras","talento_humano","finanzas","calidad","configuracion_inicial","transporte","servicios","crm","comercio_exterior","devoluciones","wms","reportes","contabilidad","proyectos","configuracion","suscripciones","ventas","recetas","punto_de_venta","presupuestos"]}` |
| rbac_admin_can_write_transport | OK | `{"ok":true,"status":200,"payload":null}` |
| rbac_operative_can_write_hr_punches | OK | `{"ok":true,"status":200,"payload":null}` |
| rbac_operative_cannot_write_transport_master | OK | `{"ok":false,"status":403,"payload":{"error":"Sin permiso para esta acción","code":"PERMISO_DENEGADO","details":{"module":"transport","action":"write"}}}` |
| rbac_readonly_cannot_write_hr | OK | `{"ok":false,"status":403,"payload":{"error":"Sin permiso para esta acción","code":"PERMISO_DENEGADO","details":{"module":"hr","action":"write"}}}` |
| hr_driver_entry_requires_preoperational_checklist | OK | `{"checklist_id":7,"route_authorized":false}` |
| hr_preop_incomplete_checklist_rejected | OK | `{"expected_status":422,"obtained_status":422,"code":null,"message":"Debes responder todo el checklist preoperacional."}` |
| transport_preoperational_checklist_approved | OK | `{"checklist_id":7,"status":"aprobado","route_authorized":true}` |
| hr_full_workday_punch_flow_completed | OK | `{"punch_ids":[71,72,73,74],"types":["entrada","inicio_almuerzo","fin_almuerzo","salida"],"route_id":14,"vehicle_plate":"NY1645"}` |
| hr_duplicate_or_completed_day_rejected | OK | `{"expected_status":409,"obtained_status":409,"code":"JORNADA_COMPLETA","message":"La jornada ya esta completa para hoy."}` |
| hr_missing_user_data_rejected | OK | `{"expected_status":400,"obtained_status":400,"code":null,"message":"Usuario requerido para registrar marcacion"}` |
| hr_route_without_employee_rejected | OK | `{"expected_status":400,"obtained_status":400,"code":"VALIDATION_ERROR","message":"Selecciona al menos una persona para asignar el horario."}` |
| hr_incomplete_state_visible_and_queryable | OK | `{"punch_id":75,"attendance_next_type":"inicio_almuerzo","session_active":true,"alerts":[{"type":"sin_actividades","severity":"warning","message":"Jornada activa sin actividades registradas."}]}` |
| hr_gps_and_route_tracking_queryable | OK | `{"gps_points":4,"tracking_punches":4,"route_id":14}` |
| hr_monitor_operations_map_reflects_route_punches | OK | `{"route_id":14,"monitor_route_id":14,"monitor_employee_names":["Nyvora Conductor Real 202607141645"],"punch_points":[{"id":71,"type":"entrada","user_name":"Nyvora Conductor Real 202607141645","route_id":14},{"id":72,"type":"inicio_almuerzo","user_name":"Nyvora Conductor Real 202607141645","route_id":14},{"id":73,"type":"fin_almuerzo","user_name":"Nyvora Conductor Real 202607141645","route_id":14},{"id":74,"type":"salida","user_name":"Nyvora Conductor Real 202607141645","route_id":14}],"activity_points":0}` |
| hr_workday_processing_consults_nyvora_data | OK | `{"processed":6,"driver_processed":true}` |
| transport_query_filters_detail_and_planning_ok | OK | `{"filtered_count":12,"vehicle_id":17,"plate":"NY1645","can_start_route":true,"master_status":"apto_documentalmente"}` |
| transport_route_status_changed_after_execution | OK | `{"route_id":14,"status":"completed"}` |
| transport_vehicle_missing_required_fields_rejected | OK | `{"expected_status":400,"obtained_status":400,"code":null,"message":"El campo brand es obligatorio."}` |
| transport_vehicle_inconsistent_dates_rejected | OK | `{"expected_status":400,"obtained_status":400,"code":null,"message":"La fecha de vencimiento de SOAT no puede ser anterior a la fecha de emision."}` |
| database_nyvora_records_persisted_and_isolated | OK | `{"tenant_id":"9a6ffc43-9aec-4b1b-8943-f098a4046b97","counts":{"users":4,"employees":4,"vehicles":1,"time_punches":5,"gps_pings":5,"routes":1,"checklists":1},"cross_tenant":[{"table_name":"Employee","count":0},{"table_name":"Vehicle","count":0},{"table_name":"TimePunch","count":0},{"table_name":"GpsPing","count":0}]}` |
| database_closed_work_session_for_driver | OK | `{"session_id":18,"status":"cerrada","route_id":14,"preop_checklist_id":7}` |
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
- `apps/web/app/dashboard/talento-humano/rutas/page.tsx`: el monitor muestra el ID del horario en la tabla principal.
- `apps/web/lib/api.ts`: Transporte y Talento Humano ahora prefieren el API operativo cuando esta configurado, usando Supabase solo como respaldo para evitar pantallas vacias con datos reales en Prisma/API.
- `scripts/nyvora-real-transport-hr-validation.js`: se agrego validador real Nyvora con datos controlados, horario minimo, credenciales temporales locales y evidencia automatica.
- No se borraron datos existentes y no se modificaron datos sensibles fuera de los registros controlados con marcador tecnico.

## Pendientes

- Sin pendientes tecnicos bloqueantes en backend/base. Validacion visual manual queda documentada en la auditoria principal.
