# Lectura operativa: Órdenes y Recepciones

Desarrollo local, rama desarrollo. Solo presentación, navegación de consulta y prueba de contrato UI; no se modificaron APIs ni reglas contables.

## Órdenes

- Encabezado compacto; se retira la pestaña interna redundante Órdenes. Trazabilidad conserva acceso contextual y retorno.
- Búsqueda de orden/proveedor independiente de la búsqueda de productos del editor. El detalle se deriva del resultado visible para evitar mostrar una orden fuera del filtro.
- Tabla de seguimiento en escritorio y tarjetas en móvil: orden/estado, proveedor, destino, porcentaje recibido, pendientes e importe en su moneda. Ver detalle abre una ventana con las acciones existentes. Diez registros por página. Se elimina el recorte permanente a las primeras doce órdenes.
- Detalle con identificación, proveedor, destino real de bodega, porcentaje recibido, barra de avance y posiciones pendientes. No se suman unidades de medida distintas.
- Inbound deja de ocupar una métrica principal. Se mantiene la información técnica existente en trazabilidad.
- Los productos muestran SKU, descripción, unidad y columnas Pedido/Recibido/Pendiente. Se elimina el recorte a seis posiciones; la lista tiene desplazamiento interno.
- Mensaje contextual según borrador, entrega pendiente o documento de consulta. Las acciones existentes de PDF, duplicado, edición, aprobación y cierre se conservan.

## Recepciones

- Resumen interactivo Todas/Por recibir/Parciales/Completadas, aplicando el filtro de estado existente. En móvil, cuadrícula de dos columnas.
- Número y estado permanecen visibles; fechas, proveedor, bodega y producto se agrupan en Filtros adicionales, plegado inicialmente.
- Tarjetas con número y estado; proveedor separado de destino. Pie con cantidad de posiciones, posiciones pendientes y entrega esperada. No se presenta una moneda inferida a partir del total numérico.
- Registrar recepción conserva prioridad visual. Devolver mercancía sigue disponible como acción secundaria con los bloqueos originales.
- Orden y documento contable se abren con un clic; se conserva compatibilidad de doble clic. Prueba de contrato UI actualizada para reflejar la interacción nueva.
- Diez órdenes por página y estado vacío comprensible. Los filtros siguen aplicando a toda la colección cargada antes de paginar.

## Evidencia

`node scripts/certifications/purchases-operator-readability-local.cjs`: **23/23 controles** aprobados. API y navegador reales locales; sin simular respuestas. Dos pantallas × claro/oscuro × 390/1440 px, búsqueda/selección coordinada, páginas posteriores, posiciones completas, filtros plegados, etiqueta Completadas, apertura de orden/documento con un clic y ausencia de errores. Se bloquean escrituras de negocio y HTTP externo.

Evidencia/hashes/capturas: `C:/Users/mq1/AppData/Local/Temp/apex-purchase-operator-tXt0AI/evidence.json`. Inspección visual de escritorio claro y móvil oscuro realizada; motivó compactar encabezado e indicadores y sustituir el panel lateral por tabla con detalle flotante antes de la ejecución final.

Doce pruebas de OC, devolución, documentos EM, PDF y cierre aprobadas. ESLint del alcance y TypeScript aprobados; git diff --check aprobado. Se corrigieron los errores transitorios de ámbito de la variable de página, dependencia del filtro y tipado del nombre de bodega antes de la certificación final.

## Límites

No se ejecutaron recepción, devolución, aprobación ni contabilización real durante la auditoría. No hay certificación financiera integral ni gates de promoción; publicación/promoción siguen bloqueadas por la certificación completa pendiente conforme a AGENTS.md. La paginación opera sobre el resultado que entrega el API existente; no cambia su alcance histórico ni topes. Se preservan cambios previos de otros módulos.
