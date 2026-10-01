# Error and negative evidence - hr-report-monitor-parity-20261001

TEST: Evento sin GPS o evidencia.
RESULTADO: passed.
ESPERADO: El timeline no debe romperse cuando falten coordenadas o fotos.
OBTENIDO: GPS se renderiza solo si existe; sin evidencia muestra `Sin evidencia fotografica` con el mismo patron del monitor.
EVIDENCIA: `local-certification.json`.

