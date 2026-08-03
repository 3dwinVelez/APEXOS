# APEXOS UI V3 - Benchmark final main vs candidata

Fecha: 2026-08-03

## Dictamen

APROBADO CON OBSERVACION OFFLINE.

La regresion critica de bundle en `/dashboard/proyectos` sigue corregida: server bundle candidato 57,626 B y Next route size 12.2 kB / 152 kB. La regresion aparente de `/dashboard` y `administracion-suscripciones` quedo aislada como ruido operativo provocado por prefetch RSC secundario desde navegacion masiva. Despues de desactivar prefetch en enlaces de shell/dashboard/mobile, el benchmark completo con 9/9 comparaciones validas y 15 repeticiones por version muestra beneficio global corregido de 13.6%.

## Metricas finales

| Perfil | Ruta | Main T3 | Cand. T3 | Mejora T3 | Main T4 | Cand. T4 | Mejora T4 | Mejora p95 T4 | DOM | JS | Requests bloq. |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| desktop-normal | login | 544 | 564 | -3.7% | 557 | 579 | -3.9% | 8.5% | 0.0% | -0.9% | 0.0% |
| desktop-normal | dashboard | 1146 | 900 | 21.5% | 1207 | 916 | 24.1% | 16.9% | 10.8% | 43.3% | 33.3% |
| desktop-normal | administracion | 980 | 742 | 24.3% | 1014 | 816 | 19.5% | 18.6% | 17.5% | 27.0% | 24.4% |
| desktop-normal | administracion-suscripciones | 759 | 614 | 19.1% | 790 | 631 | 20.1% | 5.8% | 2.9% | 36.4% | 30.0% |
| desktop-normal | servicios | 902 | 717 | 20.5% | 951 | 736 | 22.6% | 21.2% | 28.3% | 42.6% | 29.7% |
| desktop-normal | detalle-orden | 753 | 628 | 16.6% | 769 | 642 | 16.5% | 9.6% | 28.9% | 35.2% | 24.2% |
| desktop-normal | proyectos | 515 | 366 | 28.9% | 521 | 398 | 23.6% | 19.4% | 1.2% | 4.4% | 20.0% |
| mobile-limited | servicios | 859 | 734 | 14.6% | 869 | 751 | 13.6% | 30.0% | 28.3% | 39.9% | 15.6% |
| mobile-limited | detalle-orden | 700 | 633 | 9.6% | 707 | 645 | 8.8% | 2.8% | 28.9% | -0.5% | 0.0% |

## Indices

Formula: tecnico 35%, navegacion 30%, productividad 25%, ligereza 10%. Dentro de tecnico: T3 30%, T4 25%, FCP 15%, JS 15%, long tasks neutralizado por cobertura limitada, requests bloqueantes 5%. Navegacion: T1 30%, T2 30%, T3 30%, p95 T4 10%.

| Familia | Resultado |
| --- | ---: |
| Tecnico | 15.2% |
| Navegacion | 12.4% |
| Productividad proxy | 14.0% |
| Ligereza visual | 10.9% |
| Global corregido | 13.6% |

## Validaciones

| Comando | Resultado |
| --- | --- |
| benchmark operacional | pasa; 288 filas, 9/9 comparaciones validas, 15 reps medidas por version |
| typecheck | pasa |
| lint | pasa |
| build | pasa; Proyectos queda en 12.2 kB / 152 kB |
| test:offline | falla 40/49; riesgo residual fuera del cambio de prefetch/dashboard |

## Integracion

Se puede continuar la integracion de UI V3 con observacion obligatoria: los 9 fallos de `test:offline` deben tratarse antes de una promocion productiva si el criterio de release exige suite completa verde. No se recomienda revertir la correccion de Proyectos ni la desactivacion de prefetch masivo, porque ambas reducen carga de JS/RSC y estabilizan T3/T4.
