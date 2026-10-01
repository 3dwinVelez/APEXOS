# Functional evidence - hr-report-markings-timeline-20261001

TEST: Detalle de marcaciones con presentacion actualizada.
RESULTADO: passed.
ESPERADO: El drawer del reporte de horas debe mostrar una vista moderna y entendible de marcaciones/actividades, alineada con el monitor actual: resumen, timeline, tipo de evento, alerta, hora, GPS y evidencia.
OBTENIDO: El detalle usa `Trazabilidad cronologica de la jornada`, badges de marcaciones/actividades/alertas y cards por evento con hora, GPS, precision y estado de evidencia.
EVIDENCIA: `local-certification.json`, `validation-checks.json`.

TEST: Datos conservados.
RESULTADO: passed.
ESPERADO: La modernizacion visual no debe cambiar calculos de horas, exportacion ni eventos de trazabilidad.
OBTENIDO: `events` conserva marcaciones y actividades; solo se agregan `accuracy` y `evidenceCount` para renderizado.
EVIDENCIA: `local-certification.json`.

