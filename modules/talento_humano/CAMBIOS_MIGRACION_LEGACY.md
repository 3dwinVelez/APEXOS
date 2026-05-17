# Cambios de migracion legacy - Talento Humano

## Marcaciones
- Se ajusto el registro de marcaciones para aceptar equivalencias legacy de tipo: INGRESO/ENTRADA, ALMUERZO, RETORNO/FIN_ALMUERZO y CIERRE/SALIDA.
- Si una marcacion llega para una persona aun no creada como empleado, APEXOS crea una ficha operativa minima para no romper el flujo de campo.
- Se devuelve respuesta compatible con legacy: ok, hora, es_extra, minutos_extra y alerta.
- Se mantiene registro GPS asociado a la marcacion cuando vienen latitud y longitud.

## Rutas
- La respuesta de rutas ahora incluye aliases legacy: placa, equipo, h_inicio, h_fin, viaticos y tolerancia_minutos.
- Se agrego consulta de tracking por ruta con recorrido GPS, marcaciones y ultimas posiciones:
  - `GET /api/v1/hr/routes/:id/tracking`
- Se agrego centro operativo consolidado:
  - `GET /api/v1/hr/operations-map`
- El centro operativo entrega rutas del dia, personas asignadas, ultima ubicacion, ultima marcacion, estado actual, tiempo en ruta, conteos online/offline y personas sin GPS.
- El centro operativo conserva ultima huella conocida aunque la persona no tenga GPS activo o no cuente con internet temporalmente.
- El centro operativo entrega `punch_points` y `marks_by_user` para reconstruir el recorrido entre las 4 marcaciones de cada usuario en una ruta.

## Asistencia
- El listado de asistencia acepta filtros legacy: fecha, fecha_inicio, fecha_fin y usuario.
- Se agrego salida plana compatible usando `flat=1` o `legacy=1`, con usuario, placa, tipo_marca, hora y fecha.

## Nomina
- Se agregaron endpoints de procesamiento y consulta de nomina sobre jornadas procesadas:
  - `POST /api/v1/hr/payroll/process`
  - `GET /api/v1/hr/payroll`
- La liquidacion usa salario base del empleado, dias trabajados, horas extra procesadas, devengado, deducciones y neto.

## Experiencia movil
- La pantalla de marcacion fue ajustada para uso prioritario en celulares.
- Los selectores de operario y vehiculo aumentaron a altura tactil de 48px.
- Las acciones de marcacion usan tarjetas de minimo 96px de alto, iconos mas grandes y estados claros para el siguiente paso disponible.
- Se agrego una barra inferior fija en movil con la siguiente accion de marcacion para operar con una mano.
- Se separo Marcacion movil en dos vistas tactiles: Marcar e Historial, evitando que todo el flujo compita en una sola pantalla.
- Se agrego mini mapa en marcacion con coordenada real, precision GPS y enlace correcto a Google Maps.
- Se corrigio el enlace de mapa GPS para usar `https://www.google.com/maps?q=lat,lon&z=17`.
- El mapa GPS de Talento Humano ahora tiene modo En vivo e Historico, filtro por fecha, selector de ruta, marcadores por coordenadas reales y trazado del recorrido de ruta.
- Se agrego panel lateral de operarios activos con estado reciente, vehiculo, ruta y acceso directo a Google Maps.
- El mapa fue reconstruido con tiles reales de OpenStreetMap y proyeccion interna para evitar pantallas en blanco por ausencia de Leaflet o CSS externo.
- La pantalla de marcacion movil muestra mapa real embebido y envia presencia GPS cada 30 segundos mientras el usuario esta activo en la pantalla.
- El mapa dibuja recorridos GPS continuos y tambien una linea entre marcaciones por usuario/ruta.
- Cada marca de ingreso, almuerzo, retorno y cierre puede abrirse para revisar hora, placa, ruta, coordenadas y detalles.
- El modo Historico del mapa permite revisar rutas pasadas o cerradas por fecha, ruta y usuario, alineado con el comportamiento legacy de consulta historica GPS.
- Se corrigio el calculo de fecha operativa para America/Bogota, evitando que historicos de rutas y marcaciones queden fuera del rango por diferencias de zona horaria.
- La presencia GPS vencida se clasifica como `last_known` para indicar ultima huella y no como ubicacion viva.
- Se aumento el espaciado inferior para que la barra fija no tape contenido.
- Se oculto el banner superior de APEX AI Core en pantallas moviles para que la primera vista sea la tarea operativa.

## Filosofia de producto aplicada
- Planeacion de rutas se reorganizo como panel de control: KPIs y listado de rutas son la vista principal.
- La creacion de ruta y la creacion de operario/tecnico se movieron a ventanas emergentes independientes.
- La seleccion de equipo quedo dentro del flujo de Nueva ruta para evitar mezclar configuracion y consulta.
- Los accesos principales usan botones tactiles claros y consistentes con el resto de APEXOS.

## Validacion end to end con datos demo
- Se crearon tecnicos y empleado demo para rutas, marcaciones y nomina.
- Se crearon vehiculos demo para asignacion operativa.
- Se creo una ruta demo del dia con vehiculo, equipo, horario, tolerancia y viaticos.
- Se registraron marcaciones demo completas: ingreso, almuerzo, retorno y cierre con GPS.
- Se creo un horario laboral demo y se reprocesaron jornadas.
- Se corrigio procesamiento de jornadas para empleados operativos sin usuario asociado.
- Se corrigio creacion de jornadas procesadas incluyendo `tenant_id`.
- Resultado verificado: 2 jornadas procesadas y 6 liquidaciones de nomina generadas en el tenant demo.
- Se valido sintaxis backend de talento humano y typecheck web despues del ajuste de mapa/tracking.
- Se valido typecheck web despues del rediseño de rutas y marcacion.
- Se agregaron scripts de escenarios para mapa operativo:
  - `node scripts/seed-hr-map-demo.js`
  - `node scripts/validate-hr-map-demo.js`
- Escenario validado `MAP-101`: ruta historica cerrada con 2 tecnicos, recorrido GPS y 8 marcaciones georreferenciadas.
- Escenario validado `MAP-202`: ruta actual con persona sin senal activa visible mediante ultima huella GPS.
