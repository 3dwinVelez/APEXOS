# Modulo Talento Humano

## Intervencion de marcaciones masivas 2026-09-02

- `GET /api/v1/hr/self/time-routes` ignora rangos suministrados por el cliente y entrega exclusivamente los horarios asignados al usuario para la fecha operativa actual de `America/Bogota`. La pantalla movil aplica el mismo filtro defensivo.
- Las operaciones autocontenidas de marcacion, actividad y sesion rechazan con `HORARIO_FUERA_DEL_DIA` cualquier horario que no corresponda al dia operativo actual, aunque el usuario lo haya tenido asignado historicamente.
- Cada marcacion movil genera una `idempotency_key`. Prisma y el respaldo Supabase mantienen unicidad por tenant/empresa para que un reintento de red devuelva la marca existente y no inserte duplicados.
- La secuencia de marcacion se serializa mediante un bloqueo transaccional por tenant, empleado, horario y dia. Personas diferentes no comparten el bloqueo y conservan concurrencia real.
- La transaccion admite hasta 10 segundos para adquirir conexion, conserva un limite de ejecucion de 20 segundos y reintenta solo fallos transitorios de pool o serializacion. Las reglas funcionales `4xx` no se reintentan.
- El endpoint autocontenido de marcaciones admite hasta 600 solicitudes por minuto para soportar la rafaga certificada de 100 usuarios; autenticacion y las demas rutas conservan sus limites restrictivos.
- La cola movil conserva errores transitorios para sincronizacion posterior y descarta solicitudes rechazadas permanentemente, evitando que una marca invalida bloquee las siguientes.
- La certificacion masiva versionada usa Nyvora en QA, valida el SHA desplegado y ejecuta niveles de 20, 50 y 100 usuarios con cuatro marcas, reenvio idempotente, persistencia, ausencia de perdidas/duplicados y limpieza controlada.

## Cambios aplicados

- La entrada principal se simplifico como centro operativo de lectura rapida, con encabezado compacto, dos acciones prioritarias y cuatro indicadores esenciales.
- Los accesos a Marcacion, Planeacion, Mapa GPS, Reportes y Nomina usan bloques compactos con iconos y una descripcion breve de su funcion.
- El monitor de horarios presenta tabla profesional en escritorio y tarjetas tactiles en movil para comparar equipo, eventos, senal y estado operativo.
- La consulta permite buscar por placa, persona o estado y filtrar por prioridad operativa, horarios activos, ausencia de eventos o personas sin senal.
- Los horarios que requieren atencion se priorizan automaticamente; el detalle cronologico permanece en un panel separado para no saturar la vista principal.
- La pantalla administrativa Asignar horarios usa indicadores compactos y una tabla comparativa con filtros por persona/sede/placa, tipo de jornada, estado y fecha.
- La consulta administrativa conserva el historial completo de horarios y agrega sobre cada registro la trazabilidad disponible del dia, sin ocultar jornadas pasadas.
- Crear, editar y clonar horarios permanece en una ventana separada y guiada visualmente, diferenciando jornadas administrativas de sede fija y jornadas operativas con recurso movil.
- Las jornadas de sede fija toman sus opciones del maestro administrativo `locations`; no admiten sedes escritas libremente. El formulario informa en una ventana emergente todos los datos faltantes antes de guardar.
- Los horarios nocturnos pueden finalizar al dia siguiente (por ejemplo, `21:00` a `06:00`). Solo se rechazan horas de inicio y fin iguales. La asignacion de horarios ya no captura ni procesa viaticos.
- La persistencia de horarios cubre creacion individual, edicion y clonacion por rango tanto en la API operativa como en el respaldo Supabase, incluyendo las personas asignadas.
- Marcaciones mantiene enfoque movil con acciones tactiles y separacion entre marcar e historial.
- El mapa GPS usa coordenadas reales, enlace correcto a Google Maps y trazado de rutas.
- Planeacion de rutas se reorganizo como panel con KPIs, listado y acciones en ventanas flotantes.
- La creacion de ruta y la creacion de operario/tecnico se separaron para evitar saturacion.
- El mapa GPS fue reconstruido como centro de control operativo en vivo, usando tiles reales de OpenStreetMap y proyeccion Web Mercator sin depender de librerias externas.
- Se agrego el endpoint `GET /api/v1/hr/operations-map` para entregar rutas planeadas del dia, personas asignadas, ultima ubicacion GPS, ultima marcacion, estado operativo, tiempo en ruta y conteos de control.
- El panel del mapa ahora prioriza rutas, personas online, personas sin GPS, estado actual, placa, horario y acceso directo a Google Maps.
- La pantalla movil de marcacion ahora muestra mapa real embebido al activar GPS y envia presencia en vivo cada 30 segundos mientras el usuario permanece con GPS activo.
- El mapa deja de ser una grilla visual y pasa a funcionar como tablero dinamico de seguimiento para rutas planeadas y marcaciones.
- El mapa ya no depende solo de GPS activo: si una persona queda sin senal, conserva y muestra su ultima huella conocida de los ultimos dias configurados.
- Las rutas ahora exponen marcaciones georreferenciadas y el mapa conecta ingreso, almuerzo, retorno y cierre por usuario/ruta para reconstruir el recorrido operativo aunque haya zonas sin internet.
- Cada marcacion en el mapa es clicable y muestra tipo de marca, hora, fecha, placa, ruta, coordenadas, precision y minutos extra cuando aplique.
- El mapa GPS incorpora modo Historico, equivalente al flujo legacy, para revisar rutas cerradas o pasadas por fecha, ruta y usuario sin depender de que exista GPS activo en ese momento.
- Se normalizo el rango de fecha operativa a America/Bogota para que las rutas y marcaciones historicas se recuperen correctamente aunque el proceso Node corra con otra zona horaria.
- El fallback Supabase de GPS ya no confirma exito cuando la escritura falla: cualquier error de RLS, columnas, red o identidad se propaga al frontend para evitar falsos positivos de presencia.
- La identidad operativa de Supabase se normaliza antes de guardar GPS, marcaciones y actividades: empleados reales usan `employee_id`, usuarios sin ficha operativa usan `user_id`, y `user_name` conserva el alias enviado por la pantalla movil.
- Las pings GPS guardan la placa y el nombre suministrado dentro de `metadata` cuando la tabla Supabase no tiene columna fisica `vehicle_plate`, manteniendo trazabilidad para diagnostico y reconciliacion.
- El backend Prisma evita convertir UUIDs de Supabase a IDs numericos: si llega un UUID por `employee_id`, busca aliases/metadatos estables y no genera consultas con `NaN`.
- La asignacion de horarios separa identidad tecnica y visual: la UI envia un alias operativo legible de empleado y el monitor expone `employee_names`; la trazabilidad correlaciona marcaciones, actividades y GPS por `employee_id`, `user_id`, `user_name`, email y metadata, evitando que aliases genericos como `USR-*` oculten al usuario real.
- La creacion/edicion/clonacion de horarios normaliza la persona asignada hacia un alias operativo usable por Marcacion movil; si llega un UUID o ID tecnico, el backend intenta resolverlo contra aliases del empleado antes de guardar `route.employees`.
- Marcacion movil muestra los horarios asignados del usuario y, cuando hay mas de uno, exige seleccionar el horario antes de marcar o registrar actividades. La secuencia `entrada -> almuerzo -> retorno -> salida` se calcula por `route_id`, no por todas las marcas del dia.
- El estado operativo de Marcacion movil se reconstruye desde las marcaciones reales del horario seleccionado: si existe `entrada` sin `salida`, la jornada se muestra activa aunque el registro auxiliar `work_sessions` no exista, y el backend repara esa sesion al consultar o registrar actividades.
- Marcacion movil consume la misma trazabilidad de `operations-map` que usa el monitor administrativo como respaldo de `/attendance`; si el monitor ya muestra eventos del horario, el movil tambien debe derivar estado, proxima marca y actividades desde esos `punch_points` y `activity_points`.
- En el fallback Supabase, los IDs visibles de horario como `11` no se escriben en columnas UUID (`route_id`); se resuelven contra `operational_routes.id` cuando es posible y, si no hay UUID, se conservan como `metadata.display_route_id` para evitar errores 400 al guardar actividades o pings.
- Marcacion movil fusiona `/attendance` con `operations-map` para calcular la proxima marca por horario, de modo que eventos historicos sin `display_route_id` y eventos nuevos con metadata no rompan la secuencia. La UI avanza de forma optimista mientras Supabase sincroniza en segundo plano.
- Las marcas y actividades quedan en una cola local optimista mientras Supabase responde; el usuario no espera la carga de evidencias/GPS para continuar operando y solo recibe estado de sincronizacion o pendiente de confirmar.
- El monitor administrativo asocia marcaciones, GPS y actividades por `route_id` real o por `metadata.display_route_id`; esto permite reflejar ciclos completos guardados desde Marcacion movil aunque Supabase almacene el horario visible fuera de la columna UUID.
- La validacion funcional del monitor debe cubrir el cruce `route.id = 11` contra `operations.routes[].id = UUID` y `operations.routes[].code/display_id = 11`, esperando que el monitor fusionado conserve las 4 marcaciones y las actividades del usuario.
- La validacion de Marcacion movil debe comprobar que `apexos_hr_mobile_pending_sync` queda vacio despues de sincronizar; si hay registros pendientes, el monitor aun no puede considerarse actualizado aunque la UI movil haya avanzado localmente.
- Cuando `NEXT_PUBLIC_API_URL` esta configurado, las rutas operativas de Talento Humano usan el API operacional como fuente primaria para que el monitor y la marcacion consulten la misma base. Supabase queda como fallback de lectura, pero las escrituras criticas de marcaciones, actividades y GPS no se confirman por fallback si el API responde error.
- Cada marca, actividad y ping GPS movil envia `metadata.display_route_id`, `metadata.route_code` y `metadata.source_route_id` cuando estan disponibles. El backend Prisma tambien conserva estos metadatos, de modo que el monitor pueda reconciliar eventos aunque el horario llegue como ID visible, ID tecnico o UUID.
- El backend valida la secuencia de marcacion con la identidad operativa enviada por el movil (`user_name`, `employee_id` y aliases de metadata), ademas del empleado espejo del login. Esto evita que un usuario como `demo04` vea "Retorno almuerzo" en la UI pero el API responda que la siguiente marca permitida es `entrada`.
- La busqueda de marcaciones por horario acepta `route_id` numerico y metadatos historicos (`display_route_id`, `route_code`, `legacy_route_id`, `source_route_id`), evitando que al cambiar de horario se pierdan marcas guardadas por identificador visible.
- Las actividades moviles envian `user_name` y `employee_id` junto con GPS, evidencia y horario para que queden asociadas al mismo usuario/ruta que consume el monitor.
- La pantalla movil solo informa que el monitor puede actualizarse cuando la cola local de sincronizacion queda en cero; mientras existan pendientes, muestra que el monitor se actualizara al confirmar la cola.
- Se agregaron escenarios demo para validar mapa historico, recorrido por marcaciones y ultima huella offline:
  - `node scripts/seed-hr-map-demo.js`
  - `node scripts/validate-hr-map-demo.js`
- Los controles blancos ubicados sobre encabezados y paneles oscuros conservan su tratamiento inverso al alternar el tema, evitando perdida de contraste en el acceso a Marcacion y en los filtros del mapa.
- Reportes de tiempo consulta `attendance`, actividades y horarios con el mismo rango inclusivo aplicado por el usuario; el backend y el fallback Supabase limitan el rango a 92 dias para evitar consultas sin cota.
- Los filtros de reportes incluyen rangos rapidos (hoy, ultimos 7/30 dias y mes actual), empleado por identidad estable, jornadas completas/incompletas, solo horas extra y busqueda tolerante a tildes por persona, documento, rol, ruta, vehiculo o actividad.
- La trazabilidad del reporte solo asocia actividades de la misma fecha operativa de la jornada, incluso cuando coinciden identificadores de ruta reutilizados en otros dias.
- La descarga de reportes exige el permiso fino `hr:export` y usa un archivo `.xlsx` real con hojas Resumen, Jornadas y Trazabilidad, cabeceras visibles, autofiltros, panel congelado, fechas y horas numericas ordenadas; CSV deja de ser el formato de salida de esta pantalla.
- **2026-07-23 — Route Tracking ahora busca por metadata route_id.** La función `getRouteTracking` en `service.js` solo buscaba punches/pings GPS por `route_id` numérico directo. Las marcaciones desde móvil que guardan el route_id en `metadata.display_route_id` (por compatibilidad Supabase) quedaban huérfanas del seguimiento de ruta. Se reemplazó `route_id: Number(id)` por `...routeScopeWhere(id)`, una función ya existente que busca tanto por route_id directo como por `metadata.display_route_id`, `route_code`, `legacy_route_id` y `source_route_id`.
- **2026-07-23 — Script de validación integral HR.** Se agregó `scripts/validate-hr-flow.js` con 50 pruebas que cubren: creación de usuarios con empleados vinculados (conductor/operario), horarios, rutas, marcaciones completas con y sin checklist preoperacional, actividades post-cierre, monitor Operations Map, Route Tracking, Attendance, Work Sessions, procesamiento de jornada, y 6 edge cases de validación.
- **2026-07-23 — Documentación de auditoría.** Se agregó `docs/audits/HR_ROUTE_TRACKING_METADATA_FIX_20260723.md` con el detalle del bug, corrección y resultados de validación.

## Regla de experiencia

Talento Humano debe separar operacion diaria, configuracion y seguimiento. Marcaciones y rutas deben funcionar bien desde celular.

## Validaciones esperadas

- Registrar ingreso, almuerzo, retorno y cierre con GPS.
- Consultar historial.
- Ver ubicacion en mapa y tracking de ruta.
- Ver en el mapa central todas las personas con ruta planeada, diferenciando online, sin senal y sin GPS.
- Confirmar que una marcacion movil con GPS actualiza la presencia operativa en vivo.
- Confirmar que una falla al guardar presencia GPS en Supabase no se muestra como exitosa y deja alerta visible en la pantalla movil.
- Confirmar que usuarios Supabase sin ficha `employees` real pueden guardar GPS usando `user_id` sin romper RLS ni foreign keys.
- Confirmar que una persona sin GPS activo sigue apareciendo con su ultima huella conocida.
- Confirmar que las cuatro marcaciones de una ruta se conectan visualmente y muestran detalle al hacer clic.
- Confirmar que la marcacion movil no bloquea el registro esperando el ping redundante de presencia: la marca debe guardar rapido y la presencia se actualiza en segundo plano.
- Confirmar que el monitor en vivo correlaciona por `employee_id`, `user_id`, `user_name`, email y metadata para usuarios demo/autocreados, evitando aliases genericos tipo `usuario-###`.
- Confirmar que un usuario como `deemo04` asignado a un horario aparece con su nombre real y que sus marcaciones/actividades se ven en la trazabilidad aunque existan registros historicos con `USR-*`.
- Confirmar que al crear un horario desde Administracion, la columna Personas no muestra UUIDs y la pantalla movil detecta el horario asignado antes de guardar marcaciones o actividades.
- Confirmar que una persona con 2 o 3 horarios asignados puede elegir el horario correcto, cerrar la jornada de ese horario y registrar actividades sin mezclar eventos de otros horarios del mismo dia.
- Confirmar que una persona con una `entrada` ya registrada en un horario no vuelve a ver "Inicio jornada" como siguiente accion; debe ver la jornada activa, el horario seleccionado y la proxima marcacion pendiente de ese `route_id`.
- Confirmar que el monitor administrativo muestra el ID de horario en la tabla principal y que coincide con el horario seleccionado en Marcacion movil.
- Confirmar que un flujo real de 4 marcas mas evento operativo deja 4 `punch_points`, al menos 1 `activity_point` y huellas GPS visibles en la ruta del monitor.
- Confirmar que, tras cerrar un ciclo completo de `demo04` en `Horario 11`, `GET /api/v1/hr/operations-map?date=AAAA-MM-DD` expone 4 `punch_points` y las actividades del mismo horario, y que `apexos_hr_mobile_pending_sync` esta vacio.
- Confirmar que el modo Historico muestra rutas cerradas con sus 4 marcaciones por usuario, recorrido conectado y detalle clicable de cada marca.
- Confirmar que el escenario `MAP-101` contiene una ruta historica cerrada con 2 tecnicos y 8 marcaciones georreferenciadas.
- Confirmar que el escenario `MAP-202` conserva la ultima huella de una persona sin senal activa.
- Confirmar que cambiar Desde/Hasta consulta y muestra todas las jornadas del rango, incluye el dia final y rechaza rangos invertidos o superiores a 92 dias.
- Confirmar que los filtros rapidos, empleado, estado de jornada, solo extras y busqueda combinada producen el mismo subconjunto visible que se descarga.
- Abrir el `.xlsx` descargado y comprobar Resumen, Jornadas y Trazabilidad, autofiltros, fila congelada, formatos de fecha/horas y ausencia de eventos pertenecientes a otra fecha.
- Crear ruta sin mezclar el listado principal con formularios abiertos.
# Talento humano

## Planeacion de rutas y checklist preoperacional

- La creacion de personas ahora incluye clasificacion transversal `user_type`: conductor, auxiliar conductor, operario, tecnico, administrativo o supervisor.
- Cuando un usuario/empleado clasificado como conductor marca `Inicio jornada`, APEXOS crea un checklist preoperacional obligatorio si existe ruta y vehiculo asignado.
- El checklist pertenece a Planeacion de Rutas. Vehiculos solo aporta placa, sede, documentos, capacidad y score maestro.
- Sin checklist aprobado la autorizacion de inicio de ruta queda bloqueada.
- Las fallas criticas bloquean automaticamente la ruta y generan novedad/bloqueo.
- Las fallas medias permiten continuar con registro, observacion y evidencia cuando aplique.
- Se guardan respuestas, firma digital, GPS, kilometraje inicial, nivel de combustible/carga, evidencias y novedades.
- El monitor central consume metricas preoperacionales: realizados hoy, pendientes, bloqueados, cumplimiento y aprobados con novedad.

## Referencia normativa

El flujo se alinea con la Resolucion 20223040040595 de 2022 PESV: procedimiento de inspeccion preoperacional diaria, control de registros/evidencias y articulacion con SST/seguridad vial.
