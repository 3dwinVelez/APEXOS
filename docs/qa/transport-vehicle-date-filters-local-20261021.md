# Filtros temporales del consolidado por vehículo

Trabajo exclusivo en desarrollo local. Sin cambios de datos, asientos, esquema o ambientes remotos.

## Comportamiento

El consolidado consulta por defecto el periodo contable del mes actual en America/Bogota. En la pestaña Vehículos se muestran filtros de periodo contable (incluidos cerrados), servicio desde/hasta, vehículo y estado. Todos los periodos (histórico) es una elección explícita. Volver al periodo actual restablece el periodo y limpia fechas/vehículo/estado.

Los filtros de esta sección no heredan silenciosamente el period_id seleccionado en Paquetes. Vehículo/estado sí son compartidos y visibles. Periodo y fechas se combinan mediante AND. Las fechas corresponden a service_date, no a creación del paquete, y excluyen documentos sin fecha al consultar un rango. El último día se incluye completamente mediante límite exclusivo del día siguiente en UTC, consistente con las fechas de servicio almacenadas.

El servidor filtra tanto los paquetes que tienen documentos en el rango como sus líneas incluidas antes de consolidar. Por ello los importes del consolidado son los de los documentos del rango, mientras Abrir liquidación sigue mostrando el paquete completo. Las consultas sin filtros mantienen compatibilidad con los otros consumidores. Se agregan matched_packages y has_more para indicar cuando el resumen es parcial por el límite existente de carga; la UI pide reducir el rango/seleccionar vehículo.

Los KPI generales de la torre se ocultan en la pestaña Vehículos para no confundirlos con los importes del rango del consolidado. Se muestra carga durante las consultas, se limpian datos previos y una secuencia de solicitudes impide que respuestas antiguas sustituyan filtros nuevos. Cambiar filtros reinicia el detalle/búsqueda/página de vehículos. Un rango invertido muestra un error y no lanza esa consulta; el servidor rechaza además fechas imposibles y rangos invertidos con 400.

## Validación

- `node scripts/certifications/transport-vehicle-consolidation-local.cjs`: 29/29 aprobadas, API/UI reales locales, solo lectura. Evidencia final en `C:/Users/mq1/AppData/Local/Temp/apex-vehicle-consolidation-M0rCHF/evidence.json`; incluye hashes de frontend y backend.
- Verifica periodo actual inicial, periodo futuro sin registros, fecha inválida rechazada, rango de un día sin líneas externas, total conciliado contra documentos devueltos, controles de fecha que actualizan el resumen por API, selección explícita de histórico conservando fechas y retorno al periodo actual. Conserva las pruebas de búsqueda, etiquetas, paginación, detalle, apertura de paquete, teclado, móvil y temas.
- Captura vehicle-service-date-filters.png revisada visualmente. La consulta de 21/10/2026 produjo cuatro documentos/paquetes en tres vehículos y 755.000 COP, frente al conjunto amplio de 200 paquetes.
- 66/66 pruebas API de liquidaciones aprobadas, incluidas pruebas nuevas de límites de calendario, fecha final inclusiva y errores de rango.
- ESLint y TypeScript aprobados. Regresión web Transporte: 97/99; persisten los dos fallos textuales anteriores documentados en transport-vehicle-consolidation-local-20261021.md. Se ajustó el matcher del componente a su nueva propiedad key, conservando la comprobación de integración.
- git diff --check aprobado. No se realizaron escrituras de negocio durante la certificación funcional.

Los fallos globales preexistentes siguen bloqueando publicación/promoción general. No se ejecutó ninguna promoción ni despliegue. Los indicadores siguen acotados al límite de carga indicado; el aviso de resultado parcial evita presentarlos como el total histórico completo.
