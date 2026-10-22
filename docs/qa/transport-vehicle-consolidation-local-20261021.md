# Consolidado por vehículo — desarrollo local

## Alcance y comportamiento

Se reemplazó la tabla horizontal extensa y el modal que desplegaba todos los paquetes/documentos por SettlementVehicleConsolidation, integrado en la pestaña Vehículos de Liquidaciones. Cambios únicamente frontend en desarrollo; sin cambios de contratos API, importes, permisos, datos ni asientos.

La vista principal muestra indicadores esenciales, búsqueda por placa/tipo y tarjetas con importe ajustado, cantidad de paquetes/documentos y etiquetas de estado. Las etiquetas abren el detalle filtrado. La lista de vehículos se pagina de ocho en ocho.

El detalle utiliza ModalFrame, conserva los totales globales preliquidado/ajustado/aprobado y diferencia el importe del resultado filtrado. Peso, volumen y distancia quedan en una sección desplegable. Las etiquetas permiten filtrar estados; la búsqueda encuentra paquete, guía, ruta/destino o periodo. Se muestran ocho paquetes por página. Los documentos solo se montan al expandir un paquete y se paginan de diez en diez. Abrir liquidación utiliza el detalle existente y cierra el consolidado, evitando superponer ventanas. Escape se consume dentro del modal para impedir que el atajo global del centro de comandos capture el foco; el foco vuelve a la etiqueta o botón que abrió el consolidado.

Los filtros superiores y el límite existente de la respuesta API (200 paquetes en el conjunto local probado) permanecen vigentes. Los indicadores son los datos cargados, no una consulta histórica sin límites. Se conserva también el grupo SIN PLACA para hacer visibles los documentos sin vehículo.

## Evidencia

- `node scripts/certifications/transport-vehicle-consolidation-local.cjs`: 20/20 comprobaciones aprobadas sobre interfaz, API y datos locales reales. Flujo de solo lectura, con bloqueo de escrituras y destinos remotos durante la navegación.
- Evidencia: `C:/Users/mq1/AppData/Local/Temp/apex-vehicle-consolidation-P0yNn7/evidence.json`, con SHA256 del componente y página. Capturas de detalle y móvil en claro/oscuro y resumen de vehículos; revisadas visualmente.
- Datos de la reproducción: cuatro grupos de vehículos, 200 paquetes; ESQ294 tiene 171 paquetes y 241 líneas. El detalle inicial monta ocho paquetes y ninguna línea desplegada.
- Verifica búsqueda sin resultados/limpieza, filtrado por estado, paginación, búsqueda de guía y expansión, importes superiores y filtrados contra API, límite de documentos montados, ausencia de desbordamiento móvil, apertura de la liquidación real, etiquetas desde tarjeta, Escape y retorno del foco. Ninguna escritura de negocio.
- ESLint del componente/página y TypeScript web aprobados; `git diff --check` aprobado.
- Regresión web Transporte: 97/99 aprobadas. Persisten los dos fallos previos: expectativa literal idempotente en transport-settlement-tower.test.mjs y expectativa textual del árbol contable en transport-vehicle-master-catalogs.test.mjs. El test de la vista se actualizó para seguir la extracción del componente; no se eliminaron comprobaciones funcionales.

La certificación inicial detectó interferencia del atajo Escape global; se corrigió dentro del nuevo diálogo. Los errores de temporización de la prueba se separaron de esta causa mediante inspección del elemento con foco. La ejecución final completa aprobó.

No se ejecutaron promociones ni despliegues. Los fallos globales preexistentes siguen bloqueando publicación/promoción general. Reversión mediante hunks del componente y su integración sobre la base actual, preservando los otros cambios locales.
