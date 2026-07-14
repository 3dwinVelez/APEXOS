# Modulo Talento Humano

## Cambios aplicados

- La entrada principal se simplifico como centro operativo de lectura rapida, con encabezado compacto, dos acciones prioritarias y cuatro indicadores esenciales.
- Los accesos a Marcacion, Planeacion, Mapa GPS, Reportes y Nomina usan bloques compactos con iconos y una descripcion breve de su funcion.
- El monitor de horarios presenta tabla profesional en escritorio y tarjetas tactiles en movil para comparar equipo, eventos, senal y estado operativo.
- La consulta permite buscar por placa, persona o estado y filtrar por prioridad operativa, horarios activos, ausencia de eventos o personas sin senal.
- Los horarios que requieren atencion se priorizan automaticamente; el detalle cronologico permanece en un panel separado para no saturar la vista principal.
- La pantalla administrativa Asignar horarios usa indicadores compactos y una tabla comparativa con filtros por persona/sede/placa, tipo de jornada, estado y fecha.
- La consulta administrativa conserva el historial completo de horarios y agrega sobre cada registro la trazabilidad disponible del dia, sin ocultar jornadas pasadas.
- Crear, editar y clonar horarios permanece en una ventana separada y guiada visualmente, diferenciando jornadas administrativas de sede fija y jornadas operativas con recurso movil.
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
- Se agregaron escenarios demo para validar mapa historico, recorrido por marcaciones y ultima huella offline:
  - `node scripts/seed-hr-map-demo.js`
  - `node scripts/validate-hr-map-demo.js`
- Los controles blancos ubicados sobre encabezados y paneles oscuros conservan su tratamiento inverso al alternar el tema, evitando perdida de contraste en el acceso a Marcacion y en los filtros del mapa.

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
- Confirmar que un flujo real de 4 marcas mas evento operativo deja 4 `punch_points`, al menos 1 `activity_point` y huellas GPS visibles en la ruta del monitor.
- Confirmar que el modo Historico muestra rutas cerradas con sus 4 marcaciones por usuario, recorrido conectado y detalle clicable de cada marca.
- Confirmar que el escenario `MAP-101` contiene una ruta historica cerrada con 2 tecnicos y 8 marcaciones georreferenciadas.
- Confirmar que el escenario `MAP-202` conserva la ultima huella de una persona sin senal activa.
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
