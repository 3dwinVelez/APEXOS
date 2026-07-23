# Performance Baseline

Fecha: 2026-07-22/23. Entorno observado: frontend QA público y Supabase configurado. API QA autenticada no disponible por falta de `QA_API_URL`, `QA_API_TOKEN` y credenciales QA.

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
