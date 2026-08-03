# APEXOS - Analisis de rendimiento de dashboard

Fecha: 2026-08-03

## Contexto

`/dashboard` aparecio como regresion en una muestra corta de 5 repeticiones: T3 -15.3%, T4 -14.3% y p95 T4 -176.3%. Esa senal era incompatible con la reduccion de JS/DOM observada, por lo que se analizo con muestra focal ampliada y waterfall por solicitud.

## Diagnostico

La ruta tenia alta variabilidad y solicitudes RSC secundarias generadas por prefetch automatico. Al cargar el dashboard, los enlaces visibles hacia multiples modulos activaban solicitudes `?_rsc=...` que no eran necesarias para que la pantalla fuera operativa.

## Correccion aplicada

Se agrego `prefetch={false}` a enlaces de navegacion masiva en shell, dashboard y mobile nav. La pantalla sigue navegando igual cuando el usuario hace click, pero deja de competir por red/CPU durante el primer render operativo.

## Evidencia final

| Metrica `/dashboard` desktop | Main | Candidata | Beneficio |
| --- | ---: | ---: | ---: |
| T3 p50 | 1146 ms | 900 ms | +21.5% |
| T3 p90 | 1241 ms | 949 ms | +23.5% |
| T3 p95 | 1264 ms | 1067 ms | +15.6% |
| T4 p50 | 1207 ms | 916 ms | +24.1% |
| T4 p90 | 1255 ms | 962 ms | +23.3% |
| T4 p95 | 1295 ms | 1076 ms | +16.9% |
| DOM nodes | - | - | +10.8% |
| JS bytes | - | - | +43.3% |
| Requests bloqueantes | - | - | +33.3% |

Conclusion: `/dashboard` queda corregido para la matriz UI V3. La regresion anterior fue una mezcla de muestra corta y prefetch secundario, no una degradacion estructural del dashboard simplificado.
