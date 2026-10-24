# Tarifarios: asistente de tres etapas

Rama `desarrollo`, HEAD inicial/final `85fdbe81ee293e866ac8a6d06c5ff22d264c8874`, cambios locales sin commit. Skills aplicadas: orquestación, frontend, QA y verificación PDF. Se conserva el trabajo previo del usuario. Sin push, promoción, despliegue, migración ni cambios de infraestructura.

## Cambio autorizado

Se retiró «Ámbito geográfico» del asistente y su selector en cascada. El flujo queda:

1. Identificación.
2. Transporte y vigencia.
3. Cálculo del costo.

Se ajustaron avance, retroceso, índices de validación, numeración y apertura del modal ancho del diseñador. Se conservan las validaciones de identidad, vigencia, transportadora de terceros y ubicaciones de simulación. Las tarifas nuevas mantienen campos de alcance vacíos, equivalentes al alcance nacional que ya admitía el sistema. Al editar se conservan los campos geográficos históricos y el listado sigue mostrándolos: no se amplía silenciosamente el alcance de una tarifa guardada.

No cambian APIs, contratos de payload, motor de costos ni esquema de datos. Los anexos PDF ahora titulan «Cálculo del costo» sin ordinal; ya no presentan la antigua etapa 4. Se actualizaron las pruebas que exigían expresamente la etapa retirada y las certificaciones de navegación dependientes de cuatro pasos.

## Evidencia ejecutada

- `node scripts/certifications/transport-rate-three-steps-local.cjs`: **passed, 21 comprobaciones**. Flujo real completo en navegador y API local: validaciones, tres pasos, navegación hacia atrás conservando valores, guardado, consulta persistida, reapertura y creación de nueva versión desde edición.
- Fixture local creado: `QA-3STEP-1792600314695`, registro **339 v1 activa** por $85.000 y **340 v2 borrador** por $90.000. La versión original conserva sus datos. No se modificaron tarifas ajenas ni se eliminaron registros. El primer intento del harness falló por una variable del helper de clic antes de cualquier escritura; se corrigió el helper.
- Capturas de escritorio (1440 px) y móvil (390 px), inspeccionadas visualmente: `C:/Users/mq1/AppData/Local/Temp/apex-rate-three-steps-Pck6Yz/`. Incluye `transport-desktop.png`, `transport-mobile.png`, `cost-desktop.png`, `cost-mobile.png` y `evidence.json`.
- `node --test apps/web/test/transport-rate-wizard-interactions.test.mjs`: **3 passed**. Incluye fechas inválidas, avance/retroceso, guardado solo al final, nuevos alcances vacíos, conservación de ámbito histórico y transportadora obligatoria para terceros.
- `npm --workspace apps/web run typecheck`: **passed**.
- ESLint de página de tarifarios y prueba nueva: **passed**, sin advertencias.
- Regresión `node --test --test-reporter=spec apps/web/test/transport-*.test.mjs`: **97 passed / 2 failed**, 99 pruebas. Son los dos fallos previos: expectativa de `idempotente` en Liquidaciones y llamada literal a `organization-tree` en flota. No se cambiaron sus expectativas.
- `node scripts/certifications/transport-print-theme-local.cjs`: **passed, 10 comprobaciones**. PDFs desde claro/oscuro conservan captura real, tema claro de papel y preferencia guardada. Ambos se renderizaron con PDFium; el anexo del PDF desde oscuro se inspeccionó visualmente con título sin ordinal. Artefactos en `C:/Users/mq1/AppData/Local/Temp/apex-transport-print-theme-Y6YX4a/`.
- `git diff --check`: **passed**.

Regresión local: `%TEMP%/transport-three-step-regression.txt`. Logs, capturas y PDFs generados se mantienen fuera del repositorio.

## Dictamen

Flujo de tres etapas en local: **APTO CON OBSERVACIONES**, con creación/edición funcionales y datos históricos conservados. Gate integral/publicación: **NO APTO** por los dos fallos previos de la suite; promoción no solicitada y bloqueada. No se sustituyen los manifiestos y gates de `desarrollo -> develop -> main`.

Siguiente acción autorizada: evaluación del asistente de tres etapas en la aplicación local.
