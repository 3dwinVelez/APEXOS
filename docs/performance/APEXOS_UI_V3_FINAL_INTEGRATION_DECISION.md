# APEXOS UI V3 - Decision final de integracion

Fecha: 2026-08-03

## Resultado

APROBADO CON OBSERVACION OFFLINE.

## Motivos

- Proyectos permanece corregido tecnicamente: server bundle 57,626 B y route size 12.2 kB / 152 kB.
- Cobertura final completa: 9/9 escenarios validos.
- Muestra final ampliada: 15 repeticiones medidas por version y escenario, 288 filas.
- Beneficio global final: 13.6%.
- `/dashboard` ya no presenta regresion: T3 p50 +21.5%, T4 p50 +24.1%, p95 T4 +16.9%.
- `administracion-suscripciones` ya no presenta regresion estable: T3 p50 +19.1%, T4 p50 +20.1%, p95 T4 +5.8%.
- La causa operacional fue prefetch RSC secundario desde enlaces masivos de navegacion; se corrigio desactivando `prefetch` en shell, dashboard y mobile nav.

## Observacion

`npm --workspace apps/web run test:offline` queda en 40/49. Los fallos pertenecen a almacenamiento offline y no al cambio de navegacion/prefetch, pero bloquean un dictamen de release totalmente limpio si la politica exige todas las suites verdes.

## Integrar

Si el gate requerido para UI V3 es rendimiento visual-operativo, la candidata queda apta para continuar. Si el gate requerido es release completo sin fallos, primero se debe corregir la suite offline antes de promover por el flujo `desarrollo -> develop -> main`.
