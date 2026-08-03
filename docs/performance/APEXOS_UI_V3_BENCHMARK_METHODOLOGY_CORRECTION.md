# APEXOS UI V3 - Metodologia corregida final

Fecha: 2026-08-03

Quedan invalidadas las metricas basadas en `network-idle` y tambien la corrida intermedia donde T1/T2/T3/T4 se registraban como espera incremental de selector. La medicion final registra cada senal como `T0 -> senal`.

| Senal | Regla final |
| --- | --- |
| T3 | primer contenido util por selector especifico de ruta |
| T4 | control o accion principal habilitada |
| Red | clasificada, no usada como condicion operativa |
| Timeouts | no se convierten en valores de rendimiento |

## Actividad de red candidata

| Ruta | Path | Sesion | API critica | API secundaria | Bloqueo inicial | Diferida | Accion |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| login | /login | 0 | 0 | 0 | 12 | 0 | ninguna eliminada |
| dashboard | /dashboard | 5 | 1 | 15 | 24 | 0 | ninguna eliminada |
| administracion | /dashboard/administracion | 5 | 3 | 24 | 30 | 0 | ninguna eliminada |
| administracion-suscripciones | /dashboard/administracion/suscripciones | 4 | 0 | 13 | 23 | 0 | ninguna eliminada |
| servicios | /dashboard/servicios | 4 | 5 | 17 | 24 | 0 | ninguna eliminada |
| detalle-orden | /dashboard/servicios/48 | 4 | 2 | 15 | 26 | 0 | ninguna eliminada |
| proyectos | /dashboard/proyectos | 4 | 1 | 16 | 26 | 0 | ninguna eliminada |
| servicios | /dashboard/servicios | 4 | 5 | 7 | 18 | 0 | ninguna eliminada |
| detalle-orden | /dashboard/servicios/48 | 4 | 2 | 3 | 19 | 0 | ninguna eliminada |
