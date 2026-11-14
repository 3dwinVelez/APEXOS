# Certificación local: errores visibles al importar presupuesto

Fecha local: 26 de octubre de 2026 (America/Bogota). Implementación en `desarrollo`.

## Resultado

Guion integral versionado `scripts/certifications/accounting-reversal-budget-import-browser-local.js`: **passed, 91 comprobaciones**, `browser_coverage_completed: true`, finalizado en `2026-10-27T02:14:36.879Z`. Chrome real, API local y PostgreSQL loopback reales; sin respuestas simuladas ni cambios en QA.

La vista previa muestra un resumen accesible fuera del scroll con número de fila Excel y todos sus motivos de error. Abre automáticamente en Solo errores y permite alternar a Todas las filas, preservando orden y numeración. Al cambiar archivo o volver a validar elimina la vista anterior. Los errores por fila recibidos al confirmar también activan el resumen y el filtro. Confirmar permanece bloqueado cuando hay errores.

## Recorrido certificado

- Excel de 145 filas del mismo mes: 144 válidas y la última, fila Excel 149, con cuenta inexistente y presupuesto negativo. La API real devuelve dos motivos; ambos se muestran fuera del scroll y solo esa fila aparece inicialmente en la tabla.
- Todas las filas muestra las 145 en orden original, de Excel 5 a 149. Solo errores vuelve a la única fila afectada, también mediante teclado.
- Validar el archivo incorrecto no escribe presupuesto. Cambiar a un archivo válido elimina el resumen anterior y muestra su fila válida; importar crea el presupuesto esperado y el comparativo contable lo refleja.
- Conflicto entre validar y confirmar: otra carga de contenido distinto registra la misma tupla. La confirmación rechazada muestra fila y motivo, activa Solo errores y bloquea una nueva confirmación. El intento anterior con archivos idénticos ejercitó la protección global de archivo duplicado, pero no fue la certificación final del conflicto por fila.
- El guion conserva los recorridos de anulación de asientos, documento inverso, elegibilidad por origen, período cerrado, permisos y aislamiento entre empresas, además del importador válido y del presupuesto comparativo.

## Pruebas adicionales

- 6 pruebas nuevas de render real React/SSR y lógica de vista previa: errores al final, múltiples motivos, conservación del orden, filtro sin errores, estados inconsistentes y primer render sin llamadas API.
- 9 pruebas de regresión web de anulación e importación de presupuesto.
- 64 pruebas API de importación de presupuesto y anulación.
- Total: **79 aprobadas**, sin fallos ni omisiones.
- Compilación de producción y TypeScript aprobados: `.next-budget-errors-20261026`. Hash del componente compilado idéntico al del código revisado. ESLint del componente sin errores ni advertencias.
- Revisión independiente sin bloqueos funcionales. El API, el motor contable y las reglas de validación no cambian.

## Evidencia y publicación

Artefacto local: `docs/qa/evidence/accounting-budget-errors-20261026/browser-local.json`.

SHA-256 del artefacto: `f59a070b6d13b44d2c72eed8f4dd0ddc99ec9c1aab6d9fb6ba8b4168483c5331`.

SHA-256 del guion ejecutado: `e1b4abc1798e07f85e1016b3d42a3bbdd83cd0a6840d575e99d2610fd2fcb37a`.

El JSON crudo, capturas, archivos Excel y registros quedan locales y fuera del commit. Se versionan este informe y el guion reproducible. La ejecución fallida previa no acredita aprobación; la aprobación corresponde exclusivamente al resultado final indicado arriba.

Sin migraciones, configuración, cambios de CI ni infraestructura. Publicación aún pendiente de autorización independiente y de gates pre-QA y alcance exacto contra el `develop` vigente, siguiendo `desarrollo -> develop -> main`. Las pruebas locales no equivalen a validación funcional de QA ni autorizan producción.
