# Estándar de seguridad de archivos

## Control aplicado

Las cargas directas de imágenes y documentos inspeccionan únicamente los primeros 16 bytes antes de enviar el archivo a Storage. Se permiten JPEG, PNG, WebP y PDF cuando el MIME declarado coincide con su firma binaria. Los flujos API que reciben Base64 aplican la misma regla y además reconocen MP4 y WebM, formatos usados por evidencias operativas.

Los archivos vacíos, truncados, con MIME falso o firma desconocida se rechazan. SVG, HTML, ZIP y formatos activos permanecen bloqueados. Los nombres de objetos se generan con fecha y UUID; el nombre original no controla la ruta. Las rutas conservan los segmentos de empresa y usuario/entidad existentes, protegidos por las políticas de Storage.

## Límites

- Imágenes directas: 2 MB.
- Documentos de usuario: 10 MB.
- Evidencias API: `MAX_EVIDENCE_BYTES`.
- Documentos API: `MAX_DOCUMENT_BYTES`.
- Dimensión máxima aceptada: 4096 px por lado. Las fotografías que requieren optimización continúan redimensionándose a un máximo de 1600 px.

## Rendimiento

La detección es asíncrona y lee un prefijo de 16 bytes, no el archivo completo. Las imágenes se decodifican mediante `createImageBitmap` para comprobar integridad y dimensiones fuera del hilo principal; el límite previo de 2 MB acota ese trabajo.

## Riesgo residual y siguiente fase

La inspección del navegador reduce cargas accidentales o manipuladas desde la aplicación, pero un cliente que invoque Storage directamente puede omitirla. La validación definitiva posterior a Storage requiere un flujo de autorización, cuarentena y confirmación en servidor, coordinado con políticas RLS/Storage, y no se incorpora en esta corrección mínima para evitar una migración arquitectónica no autorizada.

## Reversión

Revertir el commit restaura la validación basada en MIME. No requiere migración de datos. Los objetos ya almacenados no se modifican.
