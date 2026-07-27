# Performance Changelog

## 2026-07-26

- Revalidación QA de solo lectura con concurrencias 1, 10, 50 y 100.
- Servicios HTML: p95 124,32 ms a concurrencia 10 y 246,70 ms a concurrencia 100.
- `service_orders`: p95 611,26 ms a concurrencia 10 y 1.073,24 ms a concurrencia 100.
- Cero errores en todos los escenarios ejecutados.
- El benchmark ahora registra p50 y máximo.
- CI deja de simular lint exitoso y ejecuta el lint real.
- CI y release ejecutan el guard de regresión.

Consulte `PERFORMANCE_BASELINE.md` y el reporte JSON asociado para la evidencia.
