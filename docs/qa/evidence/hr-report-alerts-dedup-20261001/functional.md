# Functional evidence - hr-report-alerts-dedup-20261001

TEST: La columna Alertas resume solo entrada y cierre por jornada.
RESULTADO: passed.
ESPERADO: Una fila con marcaciones duplicadas no debe mostrar 3 entradas y 3 cierres; debe mostrar maximo una alerta de `Entrada` y una de `Cierre`.
OBTENIDO: `reportPunchAlerts(entry, exit, route)` calcula el resumen desde las marcaciones efectivas de la fila, no desde todos los eventos de trazabilidad.
EVIDENCIA: `local-certification.json`, `validation-checks.json`.

TEST: El detalle de trazabilidad conserva los eventos.
RESULTADO: passed.
ESPERADO: La correccion del resumen no debe ocultar eventos en el panel de trazabilidad.
OBTENIDO: `events` sigue construyendose desde todas las marcaciones y actividades; solo `punchAlerts` cambio de fuente.
EVIDENCIA: revision del diff y `local-certification.json`.

