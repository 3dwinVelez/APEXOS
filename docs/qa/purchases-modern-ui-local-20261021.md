# Compras: auditoría y modernización local

Rama desarrollo; trabajo local. Se preservaron los cambios previos de Inventario y Transporte. Sin push, promoción, despliegue, migración ni cambios de backend.

## Pantallas y flujos

| Superficie | Ajuste |
| --- | --- |
| Navegación | Cuatro dominios: Resumen, Proveedores, Operación y Reportes. Submenú solo cuando hay varios destinos; móvil desplegable. Crear registros es una acción contextual, no una pestaña duplicada. |
| Órdenes | Consulta en /dashboard/compras/ordenes. Nueva orden y edición abren ventana con Datos → Productos → Revisión. Se conserva el acceso directo /ordenes/nueva, buscadores de proveedor/SKU, diez posiciones iniciales, borrador, aprobación, duplicado, cierre y PDF. Acciones de guardado solo dentro del editor. Revisión incluye proveedor, bodega, moneda, cantidades, importes y descuentos existentes. |
| Proveedores | Alta: Identificación → Condiciones y contacto → Revisión. Edición en ficha también revisa antes de guardar. Se conservan maestros, DV, ubicación, categoría, condiciones de pago y contacto de OC. |
| Facturas | Consulta y registro separados; Nuevo documento abre formulario flotante conservando factura/nota crédito, retenciones, referencias, buscadores y simulación contable. Registrar y nueva conserva el editor abierto y refresca el reporte. |
| Importaciones | Nueva importación y Agregar costo abren ventanas con revisión antes de confirmar. Se mantienen expediente, costos por tercero, tratamiento y cuentas. Campos de costos con rótulos persistentes. |
| Recepciones | Selectores buscables, superficies semánticas y ventanas con ancho acotado; se preserva flujo de recepción/devolución y consulta de documentos. |
| Reportes OC/facturas | Páginas de 25 posiciones, resumen/exportación del resultado filtrado completo. En móvil, tarjetas con detalles desplegables; escritorio conserva tablas. Fechas de facturas rotuladas, consulta dependiente del rango y aviso de rango inválido. |

Se sustituyeron listas simples por el buscador compartido de APEXOS, conservando value/onChange/required/disabled del control original. Enter abre opciones y se admite búsqueda textual/iniciales. Colores de superficies, texto y botones secundarios se ajustan al tema; no se modifican estilos globales. No se alteran permisos, payloads ni reglas contables del servidor.

## Validación

Certificados versionados:

- `node scripts/certifications/purchases-modern-ui-local.cjs`: navegador y API reales en localhost. Nueve pantallas, claro/oscuro, 390/1440 px, navegación sin duplicados, selectores con Enter, ventanas guiadas, validación obligatoria, cancelación por teclado, edición hasta revisión, selección de SKU real y Escape anidado. También conserva la ruta directa de creación.
- `node scripts/certifications/purchases-reports-local.cjs`: descarga XLS de OC y XLSX de facturas; concilia las filas exportadas con los datos API completos. Comprueba paginación y tarjetas móviles.
- 22 pruebas de contratos de Compras aprobadas: proveedores, OC, recepción, devolución, PDF, cierre, aislamiento de importaciones y transacción de facturas.
- Prueba de visibilidad del botón Nuevo proveedor, ESLint del alcance, TypeScript y git diff --check.

Las auditorías bloquean escrituras API y destinos HTTP externos. No se crearon proveedores, órdenes, expedientes, facturas, recepciones ni asientos para la certificación de interfaz. La validación de ausencia de escrituras es explícita.

Resultados: **80/80 controles de interfaz** aprobados en `C:/Users/mq1/AppData/Local/Temp/apex-purchases-modern-WyZEbW/evidence.json`; **9/9 controles de reportes/exportación** aprobados en `C:/Users/mq1/AppData/Local/Temp/apex-purchases-reports-0QUORd/evidence.json`. Las carpetas contienen capturas y hashes de fuentes. Se inspeccionaron visualmente el alta del proveedor, la revisión de OC en oscuro y las tarjetas de facturas en móvil. Total de pruebas de contratos/visibilidad: **23 aprobadas**.

Durante la auditoría se corrigieron la obligatoriedad del proveedor en la primera etapa y el fondo blanco heredado de botones secundarios. La cancelación se certifica también mediante foco/Enter para no confundir la superposición del indicador de compilación de Next en desarrollo con el funcionamiento del botón. La última revisión de reportes añadió etiquetas visibles de fechas, estados traducidos, descarte de respuestas antiguas y bloqueo de exportación con rango inválido; la certificación de nueve controles se ejecutó después de esos ajustes.

## Límites

La certificación alcanza interfaz, consultas, preparación/revisión y exportación. No constituye certificación integral de altas, aprobaciones ni contabilización real; ese flujo sigue pendiente y bloquea publicación/promoción conforme a AGENTS.md. No se ejecutaron gates de promoción. No se modifican ni se consideran resueltos los bloqueos generales preexistentes de Transporte. La paginación limita el montaje visual, pero respeta los topes y alcance del API existente.
