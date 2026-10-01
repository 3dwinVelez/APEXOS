# Error and negative evidence - hr-report-markings-timeline-20261001

TEST: Evento sin evidencia.
RESULTADO: passed.
ESPERADO: La vista debe mostrar un estado claro cuando no hay evidencia fotografica.
OBTENIDO: Cada evento sin evidencia muestra `Sin evidencia fotografica`.
EVIDENCIA: `local-certification.json`.

TEST: Evento sin GPS.
RESULTADO: passed.
ESPERADO: La vista no debe renderizar coordenadas vacias ni romper el layout.
OBTENIDO: El bloque GPS se renderiza solo cuando `event.gps` existe.
EVIDENCIA: revision estatica del JSX.

