# Evidencia pruebas reales Nyvora - Transporte y Talento Humano

- Fecha: 2026-07-05T23:50:44.880Z
- Ambiente: production
- Empresa: NYVORA
- Company ID: 82c2da06-418d-4026-8c49-b28a2db4552d
- Tenant ID: 9a6ffc43-9aec-4b1b-8943-f098a4046b97
- Sede usada: NYVORA Centro
- Marcador tecnico: nyvora_real_transport_hr_202607052350

## Usuarios y roles utilizados

- nyvora.real.admin.202607052350@internal.apexos.local | rol: NYVORA Real Admin 202607052350 | empleado: NYV-REAL-202607052350-ADM | modulo: Transporte/Talento Humano administracion
- nyvora.real.driver.202607052350@internal.apexos.local | rol: NYVORA Real Operativo 202607052350 | empleado: NYV-REAL-202607052350-DRV | modulo: Talento Humano marcaciones, checklist, ruta; Transporte lectura
- nyvora.real.operativo.202607052350@internal.apexos.local | rol: NYVORA Real Operativo 202607052350 | empleado: NYV-REAL-202607052350-OPR | modulo: Talento Humano estado incompleto
- nyvora.real.consulta.202607052350@internal.apexos.local | rol: NYVORA Real Consulta 202607052350 | empleado: NYV-REAL-202607052350-CON | modulo: Consulta permisos negativos

## Datos creados o reutilizados

- Empleado conductor: NYV-REAL-202607052350-DRV (98)
- Empleado operativo incompleto: NYV-REAL-202607052350-OPR (99)
- Vehiculo: NY2350 (15)
- Ruta: 5 en 2026-07-05
- Checklist generado desde marcacion de entrada y aprobado para ruta 5

## Pruebas ejecutadas

| Prueba | Resultado | Evidencia tecnica |
| --- | --- | --- |
| nyvora_roles_users_employees_created_or_reused | OK | `{"roles":["NYVORA Real Admin 202607052350","NYVORA Real Operativo 202607052350","NYVORA Real Consulta 202607052350"],"credentials_file":"C:\\Users\\pc\\Documents\\2026\\APEXOS\\config\\nyvora-real-test-credentials.env","users":[{"email":"nyvora.real.admin.202607052350@internal.apexos.local","role":"NYVORA Real Admin 202607052350","employee_id":97,"code":"NYV-REAL-202607052350-ADM"},{"email":"nyvora.real.driver.202607052350@internal.apexos.local","role":"NYVORA Real Operativo 202607052350","employee_id":98,"code":"NYV-REAL-202607052350-DRV"},{"email":"nyvora.real.operativo.202607052350@internal.apexos.local","role":"NYVORA Real Operativo 202607052350","employee_id":99,"code":"NYV-REAL-202607052350-OPR"},{"email":"nyvora.real.consulta.202607052350@internal.apexos.local","role":"NYVORA Real Consulta 202607052350","employee_id":100,"code":"NYV-REAL-202607052350-CON"}]}` |
| transport_vehicle_created_or_reused_for_nyvora | OK | `{"id":15,"plate":"NY2350","site":"NYVORA Centro","driver_id":98,"master_status":"apto_documentalmente","document_status":"apto_documentalmente"}` |
| hr_schedule_created_for_nyvora_processing | OK | `{"id":3,"name":"Horario Nyvora Real 202607052350","start_time":"08:00","end_time":"17:00","lunch_start_time":"12:00","lunch_end_time":"13:00"}` |
| hr_transport_route_created_for_nyvora | OK | `{"id":5,"date":"2026-07-05","vehicle_plate":"NY2350","employees":["NYV-REAL-202607052350-DRV"],"status":"active"}` |
| tenant_modules_enabled_for_hr_transport | OK | `{"tenant_id":"9a6ffc43-9aec-4b1b-8943-f098a4046b97","active_modules":["produccion","apex_ai","cartera","planeacion_demanda","tesoreria","facturacion","activos","inventario","administracion_apex","costos","facturacion_electronica","compras","talento_humano","finanzas","calidad","configuracion_inicial","transporte","servicios","crm","comercio_exterior","devoluciones","wms","reportes","contabilidad","proyectos","configuracion","suscripciones","ventas","recetas","punto_de_venta","presupuestos"]}` |
| rbac_admin_can_write_transport | OK | `{"ok":true,"status":200,"payload":null}` |
| rbac_operative_can_write_hr_punches | OK | `{"ok":true,"status":200,"payload":null}` |
| rbac_operative_cannot_write_transport_master | OK | `{"ok":false,"status":403,"payload":{"error":"Sin permiso para esta acción","code":"PERMISO_DENEGADO","details":{"module":"transport","action":"write"}}}` |
| rbac_readonly_cannot_write_hr | OK | `{"ok":false,"status":403,"payload":{"error":"Sin permiso para esta acción","code":"PERMISO_DENEGADO","details":{"module":"hr","action":"write"}}}` |
| hr_driver_entry_requires_preoperational_checklist | OK | `{"checklist_id":5,"route_authorized":false}` |
| hr_preop_incomplete_checklist_rejected | OK | `{"expected_status":422,"obtained_status":422,"code":null,"message":"Debes responder todo el checklist preoperacional."}` |
| transport_preoperational_checklist_approved | OK | `{"checklist_id":5,"status":"aprobado","route_authorized":true}` |
| hr_full_workday_punch_flow_completed | OK | `{"punch_ids":[51,52,53,54],"types":["entrada","inicio_almuerzo","fin_almuerzo","salida"],"route_id":5,"vehicle_plate":"NY2350"}` |
| hr_duplicate_or_completed_day_rejected | OK | `{"expected_status":409,"obtained_status":409,"code":"JORNADA_COMPLETA","message":"La jornada ya esta completa para hoy."}` |
| hr_missing_user_data_rejected | OK | `{"expected_status":400,"obtained_status":400,"code":null,"message":"Usuario requerido para registrar marcacion"}` |
| hr_route_without_employee_rejected | OK | `{"expected_status":400,"obtained_status":400,"code":"VALIDATION_ERROR","message":"Selecciona al menos una persona para asignar el horario."}` |
| hr_incomplete_state_visible_and_queryable | OK | `{"punch_id":55,"attendance_next_type":"inicio_almuerzo","session_active":true,"alerts":[{"type":"sin_actividades","severity":"warning","message":"Jornada activa sin actividades registradas."}]}` |
| hr_gps_and_route_tracking_queryable | OK | `{"gps_points":4,"tracking_punches":4,"route_id":5}` |
| hr_workday_processing_consults_nyvora_data | OK | `{"processed":10,"driver_processed":true}` |
| transport_query_filters_detail_and_planning_ok | OK | `{"filtered_count":10,"vehicle_id":15,"plate":"NY2350","can_start_route":true,"master_status":"apto_documentalmente"}` |
| transport_route_status_changed_after_execution | OK | `{"route_id":5,"status":"completed"}` |
| transport_vehicle_missing_required_fields_rejected | OK | `{"expected_status":400,"obtained_status":400,"code":null,"message":"El campo brand es obligatorio."}` |
| transport_vehicle_inconsistent_dates_rejected | OK | `{"expected_status":400,"obtained_status":400,"code":null,"message":"La fecha de vencimiento de SOAT no puede ser anterior a la fecha de emision."}` |
| database_nyvora_records_persisted_and_isolated | OK | `{"tenant_id":"9a6ffc43-9aec-4b1b-8943-f098a4046b97","counts":{"users":4,"employees":4,"vehicles":1,"time_punches":5,"gps_pings":5,"routes":1,"checklists":1},"cross_tenant":[{"table_name":"Employee","count":0},{"table_name":"Vehicle","count":0},{"table_name":"TimePunch","count":0},{"table_name":"GpsPing","count":0}]}` |
| database_closed_work_session_for_driver | OK | `{"session_id":9,"status":"cerrada","route_id":5,"preop_checklist_id":5}` |
| ux_relevant_frontend_files_without_generic_filler_text | OK | `{"files_checked":["apps/web/app/dashboard/transporte/page.tsx","apps/web/app/dashboard/talento-humano/page.tsx","apps/web/app/dashboard/talento-humano/rutas/page.tsx","apps/web/app/dashboard/talento-humano/marcacion/page.tsx","apps/web/app/dashboard/talento-humano/mapa/page.tsx","apps/web/app/dashboard/talento-humano/reportes/page.tsx"],"hits":[]}` |
| ux_forms_have_error_loading_and_responsive_classes | OK | `{"transport_error_handling_detected":true,"responsive_classes_detected":true}` |

## Resultado esperado vs obtenido

- Esperado: datos operativos Nyvora aislados por tenant, jornada completa registrable solo en secuencia valida, checklist preoperacional obligatorio para conductor con ruta/vehiculo, vehiculo consultable por filtros/detalle, errores controlados para datos incompletos e inconsistentes.
- Obtenido: todos los checks obligatorios quedaron OK.

## Errores encontrados

- No quedaron errores bloqueantes en la corrida automatizada real.

## Correcciones aplicadas

- `apps/api/src/modules/hr/service.js`: se corrigio la busqueda de empleado para normalizar `user_name` ausente y devolver error 400 controlado en marcaciones incompletas.
- `apps/web/lib/api.ts`: se corrigio la prioridad de consumo para que Transporte y Talento Humano consulten primero el API operativo cuando esta configurado; Supabase queda como respaldo.
- `scripts/nyvora-real-transport-hr-validation.js`: se agrego validador real Nyvora con datos controlados, horario minimo, credenciales temporales locales y evidencia automatica.
- No se borraron datos existentes y no se modificaron datos sensibles fuera de los registros controlados con marcador tecnico.

## Evidencia UX/UI productiva

- Usuario visual: `nyvora.real.admin.202607052350@internal.apexos.local`.
- Rol visual: `NYVORA Real Admin 202607052350`.
- Escritorio: login productivo OK; dashboard muestra 2 modulos activos (`Talento humano`, `Transporte`) y metricas operativas Nyvora.
- Talento Humano escritorio: pantalla abre sin `Acceso no autorizado`, sin textos de relleno y con metricas reales de marcaciones, rutas, preoperacionales y vehiculos.
- Transporte escritorio antes de correccion: la pantalla desplegada mostraba `0 de 0 vehiculo(s)`, sin texto de error visible.
- API productivo con el mismo usuario/rol: `/api/v1/transport/vehicles` devolvio 15 vehiculos, incluyendo `NY2350`, `NYV001` a `NYV010`.
- Diagnostico: la UI podia resolver datos desde fallback Supabase y dejar la tabla vacia aunque el backend operativo Prisma/API tuviera la flota Nyvora.
- Correccion aplicada: `apps/web/lib/api.ts` ahora prefiere backend operativo para `/api/v1/transport/*` y `/api/v1/hr/*` si `NEXT_PUBLIC_API_URL` esta configurado.
- Movil: pendiente de revalidacion posterior al despliegue del commit, porque la verificacion del navegador integrado se reinicio durante la inspeccion. El criterio responsive queda cubierto por clases estaticas y build/typecheck, pero la evidencia visual movil debe repetirse tras deploy.

## Pendientes

- Revalidar Transporte en navegador productivo despues del despliegue del commit para confirmar que la tabla muestra `NY2350` y la flota Nyvora.
- Repetir captura movil productiva despues del despliegue.
