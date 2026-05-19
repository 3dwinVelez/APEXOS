# Cambios de migracion legacy - Servicios

## Validacion
- Se valido que APEXOS conserva las funciones principales de legacy: ordenes de servicio, referencias, tecnico asignado, inicio, inspeccion, ejecucion, cierre, cierre no ejecutado, novedades/evidencias y fotos.
- No se aplicaron cambios de codigo en Servicios durante esta intervencion.

## Experiencia movil
- Se ajusto el monitor de servicios para celulares con header sticky, buscador de 48px, filtros tactiles y tarjetas de orden mas altas.
- Se agrego barra inferior fija en movil para crear una nueva orden y acceder a referencias.
- La pantalla de nueva orden fue ajustada con inputs/selects de 48px, boton principal fijo en la parte inferior y menor texto introductorio.
- La pantalla operativa de servicio fue ajustada para campo movil: botones principales de 56px, controles de inspeccion de 44px o mas, tarjetas con sombra ligera y acciones de cierre fijas al fondo.
- La captura de fotos ahora ofrece botones tactiles mas grandes y previsualizaciones mas amplias.
- Se oculto el banner superior de APEX AI Core en pantallas moviles para priorizar la operacion de campo.

## Ajuste legacy de flujo y reporte
- La pantalla de servicio ahora funciona como una unica pantalla operativa con formularios anexos por boton: Inicio, Inspeccion, Ejecucion, Novedad e Historial.
- Se evita saturacion visual en celular mostrando solo el formulario activo, manteniendo botones tactiles para cambiar de seccion.
- Al abrir una orden cerrada o no ejecutada se puede entrar al panel Historial para ver linea de tiempo, GPS de inicio/cierre, inspeccion, novedades y evidencias fotograficas.
- Se agrego descarga de reporte PDF para la orden desde el historial.
- Se reemplazo la carga de archivo de firma por firma digital real en canvas, alineada al componente legacy `FirmaDigital.jsx`.
- Se elimino la opcion de cargar archivos en evidencias fotograficas; el flujo operativo queda orientado a tomar fotos desde camara movil.
- El cierre normal exige producto abierto, producto cerrado, foto del cliente y firma del cliente.
- El cierre no ejecutado exige motivo, foto de evidencia y firma del cliente.
- Se agregaron endpoints de reporte:
  - `GET /api/v1/services/orders/:id/report`
  - `GET /api/v1/services/orders/:id/report-pdf`

## Filosofia de producto aplicada
- Se reorganizo el panel principal de Servicios para que abra con acciones claras: Nueva orden y Referencias.
- El listado de ordenes queda como bloque de consulta separado de los accesos de configuracion/creacion.
- Se redujo la sensacion de botones sueltos y se priorizo una lectura de panel: acciones principales, KPIs y ordenes.

## Validacion end to end con datos demo
- Se crearon 2 referencias demo: una para servicio cerrado y otra para cierre no ejecutado.
- Se crearon ordenes de servicio usando tecnicos demo y referencias demo.
- Se ejecuto flujo completo de servicio cerrado: crear orden, iniciar con GPS, inspeccionar piezas, pasar a ejecucion, cargar evidencias y cerrar.
- Se ejecuto flujo no ejecutado: iniciar, registrar pieza faltante, guardar inspeccion no armable, crear novedad, cargar evidencias y cerrar como no ejecutada.
- Resultado verificado: 2 ordenes demo creadas, 1 cerrada y 1 no ejecutada.
- Se valido sintaxis backend de servicios y typecheck web despues del ajuste de paneles/reporte.

## 2026-05-18 - Seed operativo y tecnico conectado

- Se creo seed operativo SCJ/Puebla con 100 referencias por organizacion y servicios en estados pendiente, en curso, inspeccion, ejecucion, cerrada, no ejecutada y cancelada.
- Las ordenes demo incluyen evidencias, novedades y firma de cliente simulada para validar historial y reporte.
- La pantalla de nueva orden ya no muestra lista de tecnicos para seleccion manual.
- La API asigna la orden al tecnico autenticado cuando el usuario conectado no es admin/coordinador.
- Se mantiene soporte para admin/coordinador en la creacion administrativa de ordenes.
- Se valido typecheck web despues del ajuste visual de panel principal.
