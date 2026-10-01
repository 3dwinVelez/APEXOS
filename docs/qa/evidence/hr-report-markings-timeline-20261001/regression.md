# Regression evidence - hr-report-markings-timeline-20261001

TEST: Alertas y exportacion del reporte.
RESULTADO: passed.
ESPERADO: La nueva vista del drawer no debe afectar columnas de alertas ni exportacion Excel.
OBTENIDO: `hr-report-punch-alerts.test.mjs` y `hr-reports-xlsx.test.mjs` aprobaron.
EVIDENCIA: `local-certification.json`.

TEST: Monitor de rutas adyacente.
RESULTADO: passed.
ESPERADO: El reporte y el monitor siguen compartiendo la fuente de puntualidad.
OBTENIDO: El certificador local valida `@/lib/punchPunctuality` en ambos flujos.
EVIDENCIA: `local-certification.json`.

