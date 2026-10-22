# PDF de Transporte independiente del tema de pantalla

Rama `desarrollo`, HEAD `85fdbe81ee293e866ac8a6d06c5ff22d264c8874`, cambios locales sin commit. Skills: frontend, QA y PDF. Se conserva el trabajo local previo; sin cambios de datos, backend, permisos, infraestructura o dependencias. Sin push ni despliegue.

## Causa y ajuste

La página de impresión seguía bajo `html.dark` durante la captura JPEG de los anexos. Su paleta de papel tampoco declaraba `--surface-muted` y `--text-subtle`; esos valores se heredaban del tema oscuro. Una regla antigua forzaba además el título del resumen a blanco.

La vista de impresión ahora aplica temporalmente el esquema claro al documento antes de preparar las capturas, declara los tonos secundarios de papel y elimina esa regla blanca. Al abandonar la vista restaura las clases y el atributo de tema originales. No escribe la preferencia `apex_theme`: otra pestaña y la selección guardada conservan su tema. Las mismas capturas y reportes autorizados siguen siendo la fuente del PDF.

## Validación ejecutada

- `node scripts/certifications/transport-print-theme-local.cjs`: **passed**, 10 comprobaciones con una liquidación local existente. Genera un PDF desde preferencia clara y otro desde oscura, verifica anexos reales, esquema claro de impresión, preferencia guardada y tema de otra pestaña. No crea ni modifica entidades.
- Ambos PDFs contienen dos páginas: soporte y anexo horizontal. Se extrajeron datos y se verificó la imagen embebida. Capturas reales de 1536 × 917 px; el fondo muestreado del resumen es RGB `(236, 243, 253)` en ambos temas.
- Renderizado con PDFium e inspección visual de los anexos de ambos PDFs y la primera página del PDF generado desde oscuro: fondos de papel, textos, resumen, métricas, consumo, mapa y total legibles.
- `node --test apps/web/test/transport-print-theme.test.mjs`: **2 passed**. Comprueba aislamiento/restauración de temas claro, oscuro y atributo ausente, y presencia de los tokens de papel.
- `npm --workspace apps/web run typecheck`: **passed**.
- ESLint de página y nueva prueba: **0 errores**, una advertencia existente por `<img>` necesario para la captura embebida.
- Regresión `node --test --test-reporter=spec apps/web/test/transport-*.test.mjs`: **94 passed / 2 failed**, 96 pruebas. Persisten las expectativas anteriores ajenas al PDF: literal `idempotente` y llamada literal sin parámetros a `organization-tree`.

Artefactos locales fuera del repositorio: `C:/Users/mq1/AppData/Local/Temp/apex-transport-print-theme-L4KswT/`. Incluye `light.pdf`, `dark.pdf`, sus páginas PNG, anexos JPEG, `evidence.json` y `pdf-validation.json`. Regresión: `%TEMP%/transport-print-theme-regression.txt`.

El primer intento del harness bloqueó las teselas públicas y la rasterización no terminó; se clasificó como restricción de la prueba. La ejecución aprobada permite GET públicos de recursos cartográficos y bloquea escrituras externas y llamadas a backends remotos. No se alteraron controles del producto para obtener la aprobación.

## Dictamen

Flujo visual de PDF desde claro y oscuro: **APTO CON OBSERVACIONES**. Certificación integral/publicación: **NO APTO**, por los dos fallos de regresión previos y certificación integral pendiente. Promoción no solicitada y bloqueada; no se sustituyen los gates de `desarrollo -> develop -> main`.

Siguiente acción autorizada: volver a generar el PDF desde la aplicación local y evaluar el resultado; los PDFs descargados previamente conservan su captura anterior.
