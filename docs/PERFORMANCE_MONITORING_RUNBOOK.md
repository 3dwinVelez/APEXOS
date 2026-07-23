# Performance Monitoring Runbook

## Señales

- `api_performance.severity=warning`: superar 300 ms.
- `critical`: superar 2.000 ms.
- Revisar `phases_ms`, `query_count`, `query_total_ms`, `query_max_ms`, bytes y request ID.
- Alertar si error rate >2%, p95 crece >25% contra baseline, pool >80%, CPU/memoria >85%.

## Diagnóstico

1. Confirmar alcance por módulo, empresa y despliegue.
2. Separar `authentication`, `tenant`, `authorization`, `db` y tiempo restante.
3. Auth alto: Supabase, caché, región y saturación bcrypt/thread pool.
4. DB alto: consulta exacta, volumen, índice, RLS, locks y estadísticas.
5. App alto con DB bajo: serialización, bucles, PDF/archivos o event loop.
6. Cliente alto con servidor bajo: waterfall, bundle, render e imágenes.

## Respuesta

- No desactivar seguridad ni RLS.
- Capturar 15 minutos de métricas y request IDs.
- Mitigar con rollback o reducción de carga secundaria.
- Ejecutar smoke read-only tras el cambio.
- Actualizar baseline y reporte; documentar causa y prevención.

## Infraestructura pendiente

Confirmar en Railway y Supabase: regiones, pooler, CPU/memoria, reinicios, réplicas, health checks y conexiones. Si las regiones difieren, medir RTT y migrar sólo con ventana y plan formal.
