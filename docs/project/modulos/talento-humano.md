# Modulo Talento Humano

## Cambios aplicados

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
- Se agregaron escenarios demo para validar mapa historico, recorrido por marcaciones y ultima huella offline:
  - `node scripts/seed-hr-map-demo.js`
  - `node scripts/validate-hr-map-demo.js`

## Regla de experiencia

Talento Humano debe separar operacion diaria, configuracion y seguimiento. Marcaciones y rutas deben funcionar bien desde celular.

## Validaciones esperadas

- Registrar ingreso, almuerzo, retorno y cierre con GPS.
- Consultar historial.
- Ver ubicacion en mapa y tracking de ruta.
- Ver en el mapa central todas las personas con ruta planeada, diferenciando online, sin senal y sin GPS.
- Confirmar que una marcacion movil con GPS actualiza la presencia operativa en vivo.
- Confirmar que una persona sin GPS activo sigue apareciendo con su ultima huella conocida.
- Confirmar que las cuatro marcaciones de una ruta se conectan visualmente y muestran detalle al hacer clic.
- Confirmar que el modo Historico muestra rutas cerradas con sus 4 marcaciones por usuario, recorrido conectado y detalle clicable de cada marca.
- Confirmar que el escenario `MAP-101` contiene una ruta historica cerrada con 2 tecnicos y 8 marcaciones georreferenciadas.
- Confirmar que el escenario `MAP-202` conserva la ultima huella de una persona sin senal activa.
- Crear ruta sin mezclar el listado principal con formularios abiertos.
