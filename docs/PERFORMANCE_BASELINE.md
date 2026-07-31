# Performance Baseline

Fecha: 2026-07-22/23. Entorno observado: frontend QA público y Supabase configurado. API QA autenticada no disponible por falta de `QA_API_URL`, `QA_API_TOKEN` y credenciales QA.

## Revalidación 2026-07-26

Medición de solo lectura ejecutada con concurrencias 1, 10, 50 y 100. No se ejecutaron mutaciones ni pruebas autenticadas del API porque `QA_API_URL` y `QA_API_TOKEN` no están configurados.

| Flujo | Concurrencia | Promedio | p95 | Payload | Errores |
| --- | ---: | ---: | ---: | ---: | ---: |
| Servicios HTML | 10 | 118,39 ms | 124,32 ms | 32,85 KB | 0 |
| Servicios HTML | 100 | 232,07 ms | 246,70 ms | 32,85 KB | 0 |
| `service_orders` directo | 10 | 491,02 ms | 611,26 ms | 8,10 KB | 0 |
| `service_orders` directo | 100 | 590,22 ms | 1.073,24 ms | 8,10 KB | 0 |
| Evidencias metadata | 10 | 326,31 ms | 408,27 ms | 34,05 KB | 0 |
| Evidencias metadata | 100 | 350,60 ms | 449,23 ms | 34,05 KB | 0 |
| Empleados | 10 | 295,42 ms | 368,20 ms | 7,47 KB | 0 |
| Vehículos | 10 | 185,17 ms | 343,42 ms | 2,22 KB | 0 |
| Marcaciones | 10 | 168,55 ms | 186,45 ms | 32,85 KB | 0 |

Evidencia: `reports/performance/qa-root-cause-2026-07-27T01-02-13-599Z.json`. El runner histórico aún no calculaba p50 ni máximo; esa omisión se corrigió después de esta ejecución y queda cubierta por futuras mediciones.

## Línea base

| Flujo | Frío | p50 | p95 | Concurrencia | Tamaño | Estado |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Login HTML | 934 ms | 345 ms promedio | 537 ms | 10 | 17,11 KB | Atención |
| Dashboard HTML | 134 ms | 139 ms promedio | 166 ms | 10 | 36,66 KB | Cumple |
| Servicios HTML | 123 ms | 139 ms promedio | 155 ms | 10 | 33,51 KB | Cumple |
| `service_orders` directo | 797 ms | 453 ms promedio | 533 ms | 10 | 8,10 KB | Atención |
| Evidencias metadata | 249 ms | 181 ms promedio | 249 ms | 10 | 34,05 KB | Cumple |
| Empleados | 167 ms | 136 ms promedio | 154 ms | 10 | 7,47 KB | Cumple |
| Vehículos | 159 ms | 158 ms promedio | 174 ms | 10 | 2,22 KB | Cumple |
| Marcaciones | 157 ms | 158 ms promedio | 184 ms | 10 | 32,85 KB | Cumple |

Patrón real del monitor, 20 iteraciones, empresa pequeña:

| Fase | p50 | p95 |
| --- | ---: | ---: |
| Órdenes filtradas por empresa | 124,93 ms | 305,65 ms |
| Relaciones paralelas | 124,55 ms | 137,37 ms |
| Total datos sin Auth/membresía | 249,21 ms | 434,33 ms |

Volumen observado en el proyecto: 58 órdenes, 55 empleados, 17 vehículos, 229 marcaciones y 73 pings GPS. No es suficiente para certificar escala; las cifras no sustituyen pruebas sintéticas QA.

Evidencia: `reports/performance/qa-root-cause-2026-07-23T04-12-52-147Z.json`.
