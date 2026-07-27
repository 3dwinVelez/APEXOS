# Performance Testing Guide

## Ejecución segura

1. Configure URLs y tokens exclusivos de QA.
2. Ejecute `npm run qa:root-cause`.
3. Ejecute `npm run performance:guard`.
4. Ejecute `npm run qa:services-performance`.
5. Archive el JSON generado en `reports/performance`.

El runner `qa:root-cause` registra concurrencia, solicitudes, p50, promedio, p95, p99, máximo, payload, throughput, estados y errores. No use credenciales de producción para cargas destructivas.

## Comparabilidad

- Use el mismo entorno, región, datos, red y concurrencia.
- Separe primera carga y repetición.
- Registre versión/commit.
- No compare promedios de escenarios distintos.
- Si falta Auth o API QA, marque el flujo como no medido; no lo estime.

## Aislamiento

Mida documento frontend, endpoint, Supabase/SQL y Storage por separado. Use Chrome Performance y React Profiler para render, y `Server-Timing` para backend. Una prueba se acepta solo con cero errores y presupuesto p95 cumplido.
