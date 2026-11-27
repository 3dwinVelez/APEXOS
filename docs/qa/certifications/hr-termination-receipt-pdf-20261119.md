# Comprobante PDF de liquidacion de trabajador

Implementacion local en desarrollo. No autoriza despliegue ni promocion.

El comprobante muestra el titulo de liquidacion de nomina, indica retiro, usa identificacion del empleado o Party sin sustituirla por nombre/codigo, reconoce base_salarial del retiro, imprime fechas completas y distingue salario mensual del neto a pagar. Las nuevas liquidaciones guardan identificacion, cargo y datos bancarios en su resumen; los documentos anteriores conservan consulta al maestro como respaldo.

El retiro imprime todas las lineas efectivamente incluidas en el documento, incluidas prima, cesantias, intereses y vacaciones. No incrementa ni recalcula los pagos: esas prestaciones ya estaban sumadas al bruto/neto guardado y el error estaba en el filtro del PDF. La nomina ordinaria conserva su filtro de provisiones. El generador usa paginas adicionales en vez de omitir conceptos desde el duodecimo; muestra totales generales al final. Importes con centavos, codificacion Latin-1/WinAnsi y separacion corregida en la tabla inferior.

## Evidencia

- 63 pruebas de contrato, PDF, retiro, deducciones, conceptos manuales, periodos, cierre e interfaz aprobadas. Los cuatro casos nuevos cubren campos, prestaciones, datos historicos y 26 conceptos en tres paginas sin truncamiento.
- Certificacion versionada: scripts/certifications/hr-termination-day-review-local.js, mediante wrapper aislado. Cinco recorridos aprobados del 2026-11-20T02:21:33.274Z al 2026-11-20T02:22:52.012Z. Base sintetica apexos_cert_hr_assoc_1795141277485; origen sin modificar; cero 5xx inesperados.
- Chrome ejecuta vista provisional, justificacion, recarga, guardado, reapertura y boton PDF. Se valida descarga binaria real, extraccion independiente con pypdf, identificacion 7654321, salario 2.000.000, periodo 3-6 noviembre, importes de las cuatro prestaciones y neto identico al documento. Otro tenant obtiene 404 y rol sin permiso 403.
- PDF real renderizado con Poppler e inspeccionado visualmente. Artefactos locales: .local/hr-day-review/termination-receipt.pdf, termination-receipt.png, termination-receipt.txt y certification.json. Caso adicional de paginacion en .local/hr-receipt/multipage.pdf, validado con pdfinfo (3 paginas).
- Sin migraciones, modificaciones de pagos existentes ni escrituras remotas. QA funcional y publicacion quedan pendientes de autorizacion y compuertas del repositorio.
