# Estrategia de reloj para pruebas offline

Fecha: 2026-07-29.

## Problema

Los fixtures originales fijaban `generatedAt` y `expiresAt` en el 27 y 28 de
julio de 2026. Al ejecutar la suite despues de esa ventana, nueve pruebas
fallaron porque el producto aplico correctamente su politica de expiracion.

## Estrategia

`apps/web/test/helpers/offlineTestClock.mjs` define un reloj controlado con:

- Instante base fijo por prueba.
- `now`, `nowMs`, `set`, `advance` y `reset`.
- Tiempos relativos para snapshots vigentes, proximos a vencer y vencidos.

El adaptador de almacenamiento y `OfflineTechnicianReadService` reciben el
reloj por inyeccion. En produccion conservan `Date.now` como valor por defecto.

## Reglas

1. Una prueba de vigencia no usa fechas calendario absolutas.
2. Expiracion y avance temporal se expresan respecto del reloj controlado.
3. `afterEach` restaura el instante base y elimina las bases de prueba.
4. Las pruebas no amplian TTL ni desactivan la politica de retencion.
5. Una prueba con base en 2042 verifica independencia de la fecha del sistema.

## Resultado

La suite aislada de almacenamiento paso de 15/24 a 24/24. Se cubren de forma
explicita los estados vigente, proximo a vencer y vencido.
