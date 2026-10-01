# Regression evidence - hr-report-alerts-presentation-20261001

TEST: Reglas de puntualidad compartidas con monitor de rutas.
RESULTADO: passed.
ESPERADO: El reporte debe seguir usando `@/lib/punchPunctuality`, sin duplicar reglas ni cambiar las etiquetas de entrada/cierre.
OBTENIDO: `hr-report-punch-alerts.test.mjs` aprobo los controles de puntualidad y fuente compartida.
EVIDENCIA: `local-certification.json`.

TEST: Exportacion XLSX del reporte.
RESULTADO: passed.
ESPERADO: La exportacion debe conservar resumen, jornadas y trazabilidad con alertas.
OBTENIDO: `hr-reports-xlsx.test.mjs` aprobo 2/2 pruebas.
EVIDENCIA: `local-certification.json`.

TEST: Modal de monitoreo HR adyacente.
RESULTADO: passed.
ESPERADO: La certificacion local de alertas debe preservar el comportamiento adyacente del monitor/modal por usuario.
OBTENIDO: El certificador ejecuto `hr-monitor-modal-per-user.test.mjs` con 8/8 pruebas aprobadas.
EVIDENCIA: `local-certification.json`.

