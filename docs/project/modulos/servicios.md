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
- El backend bloquea el cierre normal si faltan producto abierto, producto cerrado, foto del cliente o firma del cliente.
- El backend bloquea el cierre no ejecutado si falta motivo, evidencia fotografica o firma del cliente.
- La creacion/edicion de referencias queda como ficha tecnica: datos base, marca/modelo, tiempos, piezas de inspeccion y documentos tecnicos.
- Las referencias permiten adjuntar manuales o guias en PDF/imagen usando `ServiceReference.metadata.manuals`, sin migracion de base de datos.
- Los manuales/guias aparecen para el tecnico dentro de la inspeccion de piezas, antes de marcar OK, averiada o faltante.
- Se agrega plantilla CSV para carga masiva de referencias; filas con el mismo codigo se agrupan como una referencia con varias piezas.
- El backend expone importacion masiva por `/api/v1/services/references/import` y hace upsert por codigo.

## Regla de experiencia

Servicios debe operar como una experiencia de campo: pocas decisiones visibles a la vez, botones tactiles y evidencia disponible al consultar una orden cerrada.

## Validaciones esperadas

- Crear orden.
- Iniciar servicio con GPS.
- Registrar inspeccion, ejecucion, novedades y fotos.
- Capturar firma digital del cliente sobre el dispositivo movil.
- Adjuntar manuales o guias a una referencia y visualizarlos durante la inspeccion del servicio.
- Descargar plantilla CSV e importar referencias con piezas.
- Cerrar o marcar no ejecutada solo con evidencias y firma completas.
- Consultar historial y descargar PDF.
