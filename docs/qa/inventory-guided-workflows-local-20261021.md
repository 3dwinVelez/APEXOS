# Inventario: ventanas guiadas en desarrollo local

Rama: desarrollo. Sin promoción, despliegue ni cambios de backend o base de datos.

## Cambios de flujo

- Familias y Clasificación: listado de consulta con búsqueda; Nueva/Editar abre ModalFrame con pasos, validación y revisión antes de guardar. Familias conserva las siete cuentas en el paso Contabilización, simplifica las columnas y pagina a 25 registros.
- Bodegas: Datos de la bodega → Unidad contable → Revisar y confirmar. Consignación exige un cliente real; sociedad, sucursal y centro mantienen sus dependencias.
- Productos: creación en ventana flotante sobre el listado conservando sus tres etapas; detalle de consulta con Editar producto en ventana guiada y revisión. Se conserva Crear y seguir.
- Traslados: Origen y destino → Productos y cantidades → Revisión. Se conservan validación de existencias, buscador SKU, idempotencia y Crear y nuevo.
- Ajustes: Datos del ajuste → Posiciones → Revisión. Una posición inicial, con acciones para agregar/quitar; motivo, bodega, fecha, SKU y cantidad se validan antes de avanzar.
- Cargue inicial: ventana sobre Existencias; confirmación anidada con ModalFrame para evitar quedar detrás de la ventana principal. Al completar ofrece Finalizar y ver existencias y conserva el resumen del documento.
- Reportes: pestañas separan Kardex y Costos; se conservan filtros, consultas, detalle y exportación.

Los cierres por Escape distinguen opciones de búsqueda, ventanas anidadas y formulario principal. Durante guardado se bloquea el cierre. Los contratos API existentes se conservan.

## Evidencia

`node scripts/certifications/inventory-guided-workflows-local.cjs`: **28/28 controles aprobados** con API y navegador locales, sin simular respuestas. Comprueba apertura, campos obligatorios, revisión, retroceso sin perder datos, cancelación, navegación al listado, escritorio/móvil y ausencia de errores de ejecución. Bloquea escrituras de negocio y HTTP externo.

Evidencia: `C:/Users/mq1/AppData/Local/Temp/apex-inventory-guided-pAlIjc/evidence.json`; capturas en la misma carpeta. Inspección visual de escritorio oscuro realizada; modal acotado para lectura en escritorio.

La auditoría general actualizada recorrió 17 rutas y aprobó **111/111 controles**; evidencia en `C:/Users/mq1/AppData/Local/Temp/apex-inventory-modern-7v9GBw/evidence.json`. La cantidad de controles con selectores cambia porque Familias y Clasificación ahora los muestran únicamente dentro del editor. Se revisaron capturas en escritorio oscuro y móvil claro.

TypeScript y ESLint del alcance aprobados. Seis pruebas de navegación/productos y trece pruebas de contratos de ajustes, cargue, traslados, aislamiento y reportes aprobadas.

## Límites

Esta es certificación de interfaz hasta revisión/cancelación, no certificación integral de contabilización. No se crearon productos, maestros ni documentos financieros durante la auditoría. WMS conserva su interfaz de prototipo y sus acciones locales existentes; no se anuncia como operación real ni se incorpora a la navegación. No se ejecutaron gates de promoción; la certificación de escritura completa sigue pendiente y bloquea publicación/promoción. Las incidencias generales de Transporte previamente documentadas permanecen fuera de este alcance.
