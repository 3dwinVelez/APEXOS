# Regression evidence - hr-report-alerts-dedup-20261001

TEST: Alertas de entrada/cierre y exportacion.
RESULTADO: passed.
ESPERADO: Excel debe seguir exportando `alerta_entrada` y `alerta_cierre` desde `row.punchAlerts`.
OBTENIDO: `hr-reports-xlsx.test.mjs` y `hr-report-punch-alerts.test.mjs` aprobaron.
EVIDENCIA: `local-certification.json`.

TEST: Monitor de rutas adyacente.
RESULTADO: passed.
ESPERADO: La fuente compartida de puntualidad sigue siendo `@/lib/punchPunctuality`.
OBTENIDO: El certificador verifico que monitor y reporte comparten la libreria sin duplicar reglas.
EVIDENCIA: `local-certification.json`.

