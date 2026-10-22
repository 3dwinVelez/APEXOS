# Inventario: revisión de redundancias

Solo desarrollo local, rama desarrollo. Sin cambios de API, datos ni despliegues.

- Nuevo producto se conserva como acción principal del listado; se retira de la navegación Maestros. La ruta directa continúa operativa y Productos permanece activo dentro del asistente.
- La fila secundaria se omite cuando el dominio tiene un solo destino, evitando repetir Resumen.
- El contador de productos del filtro se muestra solo en móvil; escritorio conserva el contador y selección de SmartDataTable. La cuadrícula de filtros utiliza tres columnas en escritorio.
- El enlace de cada producto se llama Ver detalle, acorde con la pantalla de consulta que abre; Editar producto sigue dentro del detalle.
- Familias, Clasificación, Bodegas, Stock, Traslados y Ajustes conservan un destino por función en su navegación secundaria visible. Los accesos rápidos de la portada se conservan por su función contextual; navegación móvil/escritorio son alternativas por tamaño, no acciones visibles duplicadas.

Certificación: `node scripts/certifications/inventory-redundancy-local.cjs`, **23/23 controles** aprobados con API/navegador locales, sin escrituras de negocio ni conexiones externas. Recorre siete listados, Resumen y Productos en 1440/390 px; comprueba acción única, contadores, apertura/cierre real del asistente y ausencia de errores de navegador.

Evidencia y capturas: `C:/Users/mq1/AppData/Local/Temp/apex-inventory-redundancy-qPWSfg/evidence.json`. Captura de escritorio inspeccionada visualmente. Seis pruebas de navegación aprobadas; TypeScript y ESLint del alcance aprobados. La primera comprobación del contador detectaba también el anuncio sr-only de cambio de página: se corrigió el selector del certificado para medir el contador correspondiente, conservando el anuncio accesible.

Alcance: redundancias de navegación y consulta; no certifica altas contables ni operaciones WMS. No se ejecutaron gates ni se autoriza publicación/promoción. Se conservan los bloqueos de certificación integral previamente documentados.
