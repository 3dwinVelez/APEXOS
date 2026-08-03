# APEXOS UI V3 - Benchmark final main vs candidata

Fecha: 2026-08-03

## Dictamen

NO APROBADO - REGRESIONES.

La regresion critica de bundle en `/dashboard/proyectos` fue corregida: el bundle server candidato bajo de 441,111 B a 57,626 B, sin `recharts` en el server page. Sin embargo, el benchmark final con cobertura 9/9 muestra beneficio global corregido de 4.6%, por debajo del umbral minimo, y regresiones operativas relevantes en `/dashboard` T3/T4 p50 y p95.

## Metricas finales

| Perfil | Ruta | Main T3 | Cand. T3 | Mejora T3 | Main T4 | Cand. T4 | Mejora T4 | Mejora p95 T4 | DOM | JS | Requests bloq. |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| desktop-normal | login | 497 | 516 | -3.8% | 548 | 532 | 2.9% | -1.6% | 0.0% | -0.9% | 0.0% |
| desktop-normal | dashboard | 642 | 740 | -15.3% | 651 | 744 | -14.3% | -176.3% | 10.8% | 33.4% | 6.3% |
| desktop-normal | administracion | 626 | 589 | 5.9% | 639 | 657 | -2.8% | -6.6% | 17.5% | 24.2% | 5.1% |
| desktop-normal | administracion-suscripciones | 319 | 349 | -9.4% | 330 | 360 | -9.1% | -107.4% | 2.9% | 31.6% | 3.6% |
| desktop-normal | servicios | 559 | 516 | 7.7% | 575 | 520 | 9.6% | 44.4% | 28.3% | 36.3% | 15.4% |
| desktop-normal | detalle-orden | 470 | 460 | 2.1% | 476 | 476 | 0.0% | 1.7% | 28.9% | 28.7% | 5.9% |
| desktop-normal | proyectos | 548 | 405 | 26.1% | 553 | 420 | 24.1% | 21.3% | 1.4% | -2.5% | 0.0% |
| mobile-limited | servicios | 814 | 691 | 15.1% | 827 | 706 | 14.6% | 4.2% | 23.5% | 39.9% | 20.6% |
| mobile-limited | detalle-orden | 623 | 612 | 1.8% | 630 | 621 | 1.4% | 5.5% | 28.9% | -0.5% | 3.8% |

## Indices

Formula: tecnico 35%, navegacion 30%, productividad 25%, ligereza 10%. Dentro de tecnico: T3 30%, T4 25%, FCP 15%, JS 15%, long tasks 10% neutralizado por cobertura limitada, requests bloqueantes 5%. Navegacion: T1 30%, T2 30%, T3 30%, p95 T4 10%.

| Familia | Resultado |
| --- | ---: |
| Tecnico | 5.6% |
| Navegacion | -1.8% |
| Productividad proxy | 8.6% |
| Ligereza visual | 10.7% |
| Global corregido | 4.6% |

## Validaciones

| Comando | Resultado |
| --- | --- |
| typecheck | pasa |
| lint | pasa |
| build | pasa; Proyectos queda en 12.2 kB / 152 kB |
| test:offline | baseline reproducida con 40 pass / 9 fail, mismos subtests historicos |

## Integracion

No se recomienda integrar todavia. El rollback puntual del arreglo de Proyectos consiste en revertir `apps/web/app/dashboard/proyectos/ProjectsCharts.tsx` y las importaciones dinamicas en `page.tsx`, aunque no se recomienda porque corrige el bundle server.
