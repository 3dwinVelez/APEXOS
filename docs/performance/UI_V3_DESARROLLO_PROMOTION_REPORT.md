# APEXOS UI V3 - Promocion a desarrollo

Fecha: 2026-08-03

## Alcance

Se incorporo la rama validada `origin/integration/ui-v3-validated` a `desarrollo` mediante merge no fast-forward. La promocion conserva el historial de UI V3, la correccion de prefetch selectivo, el aislamiento de graficos de Proyectos, los benchmarks y los estandares permanentes de performance.

## Origen y destino

| Campo | Valor |
| --- | --- |
| Origen | `origin/integration/ui-v3-validated` |
| Commit origen | `e99acf79184e6b00d29da3a3cb814e707dcd4846` |
| Destino | `desarrollo` |
| Commit desarrollo anterior | `82037c272f265598424c22a998a86877466b2650` |
| Commit de merge | `fb1cb39` |

## Conflictos

No hubo conflictos durante el merge a `desarrollo`. La resolucion funcional de Servicios ya venia preservada desde la rama de integracion.

## Servicios

Se verifico que permanecen:

- `AdministrativeCorrectionPanel`;
- estados recientes `cancelada`, `reabierta`, `lista_facturacion`;
- carga diferida de `satisfaction-questions`;
- `PhotoCapture`;
- `SignatureCapture`;
- `uploadPhoto`;
- flujo operativo y evidencias.

## Proyectos

| Control | Resultado |
| --- | --- |
| `ProjectsCharts.tsx` | presente |
| `next/dynamic` | presente |
| `ssr: false` | presente |
| import directo de `recharts` en `page.tsx` | no |
| route size | `12.2 kB` |
| First Load JS | `152 kB` |

## Validaciones

| Validacion | Resultado |
| --- | --- |
| `git diff --check origin/desarrollo..HEAD` | aprobado |
| Guardia de bundle Proyectos | aprobado |
| `npm --workspace apps/web run typecheck` | aprobado |
| `npm --workspace apps/web run lint` | aprobado |
| `npm --workspace apps/web run build` | aprobado |
| `npm --workspace apps/web run test:offline` | 49/49 |
| Unitarias web adicionales | 11/11 |
| Smoke HTTP | aprobado |
| Escaneo de secretos | aprobado |

## Benchmark smoke

| Ruta | Status | DOMContentLoaded | T3 | T4 | Requests | DOM |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `/dashboard` | 200 | 784 ms | 1234 ms | 1542 ms | 17 | 289 |
| `/dashboard/proyectos` | 200 | 310 ms | 919 ms | 1063 ms | 18 | 302 |
| `/dashboard/administracion/suscripciones` | 200 | 412 ms | 974 ms | 1146 ms | 18 | 306 |
| `/dashboard/servicios` | 200 | 350 ms | 893 ms | 1060 ms | 17 | 279 |
| `/dashboard/servicios/1` mobile | 200 | 771 ms | 1371 ms | 1454 ms | 20 | 271 |

## Riesgos

No se detectaron regresiones nuevas en las validaciones locales. La medicion smoke confirma render operativo, pero el benchmark completo de 288 filas queda como evidencia historica de la rama validada.

## Rollback

Revertir el commit de merge `fb1cb39` en `desarrollo` y volver a ejecutar:

```bash
node scripts/performance/assert-projects-no-server-recharts.js
npm --workspace apps/web run typecheck
npm --workspace apps/web run lint
npm --workspace apps/web run build
npm --workspace apps/web run test:offline
```

## Siguiente paso

Preparar promocion controlada de `desarrollo` hacia `develop`, con pruebas completas en QA, validacion de rendimiento real en Railway/Supabase QA y pruebas operativas de Servicios movil.
