# Rediseño de liquidación de nómina

Implementado en desarrollo el 25 de noviembre de 2026, tomando como referencia visual el PDF suministrado por el usuario. Sin publicación ni promoción a QA o producción.

## Cambios

- Cabecera con estado y selector de origen; navegación por etapas.
- Consulta del periodo y acciones principales antes del resumen de valores.
- Indicadores de empleados con horas, devengado, deducciones, neto y netos negativos.
- Documentos con buscador, filtro de alertas, horas en h:mm y totales de filas filtradas. Los documentos con valores monetarios sin horas permanecen visibles, incluyendo netos negativos. Los indicadores superiores resumen todos los documentos con tiempo o valores; el pie de tabla resume el filtro visible.
- Ajustes y novedades a la izquierda; cierre e historial a la derecha en escritorio. Disposición en una columna en móvil.
- Se conservan manejadores, cálculos del servidor, campos especializados IBC, importación, comprobantes y plano bancario. No se modificaron API, migraciones ni reglas de liquidación.

## Validación ejecutada

- `npx tsc --noEmit -p apps/web/tsconfig.json`: aprobado.
- ESLint de la página y `payrollDisplay.ts`: sin errores; tres advertencias existentes sobre selectedDocument, preview.length y openPdf.
- Desde apps/web: `node --experimental-strip-types --test test/payroll-display.test.mjs test/ibc-nomina-ui.test.mjs test/payroll-employee-entity-ui.test.mjs`: 11 pruebas aprobadas.
- `node scripts/certifications/hr-employee-user-association-isolated-local.js --certificate=hr-payroll-markings-local.js`: aprobado en base PostgreSQL desechable y navegador Chrome real; sin respuestas HTTP simuladas. Incluye límites del periodo, permisos y aislamiento; consulta y prueba con marcaciones; buscador y totales filtrados; filtro de alertas; detalle de conceptos; escritorio y móvil sin desbordamiento de página; error de periodo cerrado; espera real por transacción; guardado; fallo de lectura posterior al guardado; recarga y persistencia; corrección de jornada sin doble pago.
- El caso de neto negativo sin horas se verifica en pruebas unitarias de presentación; la fixture del navegador tiene un empleado con horas y neto positivo. No se certifica un pago bancario real, una importación Excel completa ni una liquidación jurídica de cada novedad con este cambio visual.

Evidencia: `../evidence/hr-payroll-redesign-20261125/certification.json`, `desktop.png`, `mobile.png`. Las capturas contienen datos sintéticos locales; el distintivo de desarrollo visible en móvil pertenece al servidor de prueba.

Antes de cualquier promoción se requiere el alcance exacto contra el destino vigente y las compuertas de evidencia exigidas por el repositorio.
