# Functional evidence - hr-report-alerts-presentation-20261001

TEST: Presentacion profesional de alertas en reporte de Talento Humano.
RESULTADO: passed.
ESPERADO: La columna Alertas conserva cada alerta de marcacion, evita chips estrechos con texto roto, muestra el tipo de marcacion y mantiene las alertas visibles sin perder informacion.
OBTENIDO: `PunchAlertStack` renderiza una pila con ancho estable, conteo de alertas, indicador `Revisar` para tonos warning, icono por tono, tipo de marcacion y etiqueta completa.
EVIDENCIA: `local-certification.json`, `validation-checks.json`.

TEST: Persistencia de datos del reporte y exportacion.
RESULTADO: passed.
ESPERADO: El cambio visual no altera calculos, detalle de trazabilidad ni columnas Excel `alerta_entrada`, `alerta_cierre` y `alerta`.
OBTENIDO: La suite `hr-report-punch-alerts.test.mjs` y `hr-reports-xlsx.test.mjs` aprobo 6/6 pruebas; el certificador local aprobo 9 controles.
EVIDENCIA: `local-certification.json`.

