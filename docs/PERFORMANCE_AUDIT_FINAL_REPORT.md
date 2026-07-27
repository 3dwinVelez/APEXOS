# Performance Audit Final Report

Fecha de revalidación: 2026-07-26. Alcance ejecutado en esta revisión: pruebas QA de solo lectura, revisión de controles automáticos, frontend, rutas de Servicios, persistencia de evidencias y documentación existente.

## Resultado medido

| Flujo | Concurrencia | p95 | Payload | Errores | Presupuesto |
| --- | ---: | ---: | ---: | ---: | --- |
| Servicios HTML | 10 | 124,32 ms | 32,85 KB | 0 | Cumple |
| Servicios HTML | 100 | 246,70 ms | 32,85 KB | 0 | Cumple |
| `service_orders` directo | 10 | 611,26 ms | 8,10 KB | 0 | Cumple guard actual de 700 ms |
| `service_orders` directo | 100 | 1.073,24 ms | 8,10 KB | 0 | Degradación documentada |
| Evidencias metadata | 100 | 449,23 ms | 34,05 KB | 0 | Cumple |
| Marcaciones | 100 | 445,64 ms | 32,85 KB | 0 | Cumple |

El documento y shell de Servicios no reproducen hoy una espera de 3–6 segundos. La parte más lenta medida es la lectura directa de órdenes, especialmente en la primera solicitud y con concurrencia 100. La evidencia completa está en `reports/performance/qa-root-cause-2026-07-27T01-02-13-599Z.json`.

## Causa y estado

- El monitor ya limita a 200 órdenes y agrupa relaciones en cuatro lecturas paralelas; no presenta N+1.
- Evidencias del monitor excluyen el archivo pesado y conservan metadatos.
- Auth/membresía y alcance se resuelven antes de la lectura multiempresa.
- El cuello observable restante está en la latencia de lectura de `service_orders` bajo frío/concurrencia, no en el HTML.
- La ausencia de `QA_API_URL` y `QA_API_TOKEN` impide certificar en esta ejecución los tramos Auth, permisos, pool, API y mutaciones del técnico.

## Controles corregidos

- El benchmark incorpora p50 y máximo además de promedio, p95 y p99.
- CI ejecuta lint real; se eliminó el marcador que siempre devolvía éxito.
- CI y release ejecutan el guard de presupuesto.
- Se corrigieron tipos `any` que impedían activar lint como puerta real.

## Límites explícitos

No se realizaron creación, edición, cierre, carga de fotografías, SQL `EXPLAIN ANALYZE`, pruebas móviles autenticadas ni mutaciones concurrentes porque no existe un entorno/token QA configurado para esos flujos. No se atribuyen cifras a acciones no medidas y no se considera esta evidencia sustituto de una sesión E2E autenticada.

## Próximo requisito de certificación

Configurar `QA_API_URL`, `QA_API_TOKEN` y una cuenta/técnico de prueba aislados. Luego ejecutar `qa:services-performance`, navegación móvil, fotografías, cierre, SQL directo y comparación antes/después siguiendo `PERFORMANCE_TESTING_GUIDE.md`.
