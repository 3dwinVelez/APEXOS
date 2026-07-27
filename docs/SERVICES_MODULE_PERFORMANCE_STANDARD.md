# Services Module Performance Standard

Este estándar complementa `SERVICES_EXECUTION_PERFORMANCE_STANDARD.md`.

- El monitor solicita como máximo la primera página operativa y relaciones compactas.
- Referencias, técnicos, incidentes y evidencias se agrupan; nunca se consultan por orden.
- La apertura de una orden no vuelve a cargar el monitor completo.
- Una transición actualiza solo orden, estado y evidencia afectada.
- Las evidencias del listado contienen metadatos; el archivo se obtiene bajo demanda.
- La captura muestra vista previa local y no congela navegación.
- La búsqueda debe operar sobre una página limitada o delegarse al servidor al crecer el volumen.
- Presupuesto: primer dato útil menor a 1.200 ms; transición común p95 menor a 600 ms.
- Las pruebas mínimas cubren carga, detalle, transición, evidencia, cierre, retorno e idempotencia.
