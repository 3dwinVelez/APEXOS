# Modulo Servicios

## Cambios aplicados

- El panel principal se reorganizo con acciones principales claras: nueva orden y referencias.
- Las acciones usan `ActionCard` para mantener consistencia visual y tactil.
- El listado de ordenes queda separado del acceso a creacion/configuracion.
- La pantalla operativa de servicio mantiene flujo de una sola orden con formularios anexos por boton.
- El historial de servicio conserva linea de tiempo, evidencias, GPS y descarga de reporte PDF.
- El cierre de servicio ahora replica el patron legacy de firma digital: canvas tactil para que el cliente firme sobre el celular, boton de confirmar y opcion de limpiar antes de guardar.
- Se elimino la opcion visual de cargar archivos en evidencias; las evidencias fotograficas se capturan desde camara usando `capture="environment"`.
- La firma del cliente se guarda como evidencia `firma_cliente` en PNG base64 con metadata de firmante y fecha.
- Se retiro la foto de fachada del inicio; el tecnico confirma su presencia y la plataforma registra el GPS automaticamente.
- Se reemplazo la foto final del cliente por una encuesta tactil de satisfaccion con tres preguntas calificadas de 1 a 5 estrellas.
- El cierre guiado muestra el avance de la encuesta, usa controles grandes para movil y conserva la firma digital como aceptacion final.
- El backend bloquea el cierre normal si faltan producto abierto, producto cerrado, las tres respuestas de satisfaccion o la firma del cliente.
- El backend bloquea el cierre no ejecutado si falta motivo, evidencia fotografica o firma del cliente.
- La creacion/edicion de referencias queda como ficha tecnica: datos base, marca/modelo, tiempos, piezas de inspeccion y documentos tecnicos.
- Las referencias permiten adjuntar manuales o guias en PDF/imagen usando `ServiceReference.metadata.manuals`, sin migracion de base de datos.
- Los manuales/guias aparecen para el tecnico dentro de la inspeccion de piezas, antes de marcar OK, averiada o faltante.
- Se agrega plantilla CSV para carga masiva de referencias; filas con el mismo codigo se agrupan como una referencia con varias piezas.
- El backend expone importacion masiva por `/api/v1/services/references/import` y hace upsert por codigo.
- El lobby de ordenes incorpora busqueda instantanea por orden, cliente, telefono, direccion y referencia.
- La consulta de ordenes permite combinar filtros dinamicos por estado, agenda, tipo de servicio, evidencia y novedades sin recargar la pagina.
- Se agregaron ordenamiento por prioridad operativa o fecha, indicadores de ordenes vencidas/hoy, limpieza de filtros y vistas de tarjetas o lista compacta.
- La cabecera del lobby concentra solo contexto y acciones; los KPIs se retiraron para reservar la pantalla a prioridades, filtros y ordenes.
- El hook global de auditoria acepta operaciones sin cuerpo, evitando respuestas `400` posteriores a cambios de estado validos como pasar una orden a ejecucion.
- El cliente API deja de declarar contenido JSON en solicitudes sin cuerpo, evitando el rechazo `FST_ERR_CTP_EMPTY_JSON_BODY` en transiciones operativas.
- El listado principal usa una tabla profesional en escritorio para comparar orden, cliente, servicio, agenda, soportes y accion; en movil conserva tarjetas tactiles.
- La creacion de orden exige referencia, tipo, fecha del servicio, fecha de entrega CEDI, nombre, cedula, telefono, direccion, factura/pedido y observaciones; cedula y entrega CEDI se conservan en metadata para compatibilidad.

## Regla de experiencia

Servicios debe operar como una experiencia de campo: pocas decisiones visibles a la vez, botones tactiles y evidencia disponible al consultar una orden cerrada.

## Validaciones esperadas

- Crear orden.
- Iniciar servicio con GPS.
- Registrar inspeccion, ejecucion, novedades y fotos.
- Capturar firma digital del cliente sobre el dispositivo movil.
- Completar las tres preguntas de satisfaccion y verificar su inclusion en el reporte PDF.
- Adjuntar manuales o guias a una referencia y visualizarlos durante la inspeccion del servicio.
- Descargar plantilla CSV e importar referencias con piezas.
- Cerrar solo con evidencias tecnicas, encuesta y firma completas; marcar no ejecutada solo con motivo, evidencia y firma.
- Consultar historial y descargar PDF.
