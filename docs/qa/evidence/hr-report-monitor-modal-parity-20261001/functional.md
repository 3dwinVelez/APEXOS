# Functional evidence - hr-report-monitor-modal-parity-20261001

TEST: Modal del reporte igualada al monitor.
RESULTADO: passed.
ESPERADO: La trazabilidad del reporte no debe abrirse como panel derecho; debe usar la misma ventana emergente centrada del monitor, con `max-w-6xl`, `rounded-overlay`, header compacto, resumen de badges y layout de dos columnas.
OBTENIDO: El reporte usa `role="dialog"`, overlay centrado, `md:max-w-6xl md:rounded-overlay`, grid `lg:grid-cols-[320px_1fr]` y timeline con `ol/li` igual al monitor.
EVIDENCIA: `local-certification.json`, `validation-checks.json`.

