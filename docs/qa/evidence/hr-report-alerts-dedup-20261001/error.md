# Error and negative evidence - hr-report-alerts-dedup-20261001

TEST: Jornada sin cierre.
RESULTADO: passed.
ESPERADO: Si no hay salida, la tabla no debe inventar alerta de cierre.
OBTENIDO: `reportPunchAlerts` omite valores `undefined` antes de calcular la puntualidad.
EVIDENCIA: revision estatica del helper y pruebas focalizadas.

TEST: Duplicados en la fuente.
RESULTADO: passed.
ESPERADO: Duplicados de entrada/salida en `events` no deben duplicar badges en la columna Alertas.
OBTENIDO: La prueba versionada bloquea el patron anterior `const punchAlerts = events.flatMap`.
EVIDENCIA: `local-certification.json`.

