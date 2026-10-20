# Formulario de liquidacion: textos concisos

Desarrollo local, rama `desarrollo`, 2026-10-19.

Se elimina el bloque explicativo del codigo automatico y la introduccion redundante del formulario. Se retiran explicaciones repetidas del periodo, calculo de tarifas y caracter informativo de tiendas. Se conserva el contador de tiendas, se acorta el placeholder del soporte y se mantienen los campos readonly, validaciones, errores y estado Calculando. No cambia el payload ni la generacion de consecutivos, el periodo, el calculo o los permisos.

Evidencia: 25 pruebas existentes de interfaz aprobadas (`<TEMP>/apexos-settlement-concise-tests.log`). Certificacion versionada `transport-period-tariff-browser.mjs`: 11 controles de etiquetas, teclado, duplicados, periodo y tarifas readonly aprobados en el formulario simplificado (`<TEMP>/apexos-settlement-concise-browser-20261019.json`). Captura revisada del formulario sin bloque de codigo: `<TEMP>/apexos-settlement-concise-20261019.png`. Pestaña temporal cerrada sin guardar el borrador. TypeScript, ESLint y git diff --check aprobados.

Sin commit, push, despliegue o promocion.
