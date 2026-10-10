# Regresion local - Modulo de nomina y talento humano

Fecha: 2026-10-10
Ambiente: LOCAL

## Suites ejecutadas (automatizadas)

- `node scripts/certifications/hr-workday-novelties-local.js` -> passed (exit 0).
- `node --test apps/api/test/hr-workday-novelties-contract.test.js` -> 24/24.
- `node --test apps/web/test/hr-workday-novelties-ui.test.mjs` -> 14/14.
- `npx tsc -p apps/web/tsconfig.json --noEmit` -> sin errores.
- `npx prisma validate --schema apps/api/prisma/schema.prisma` -> schema valido.

## Alcance de regresion

- Talento humano / nomina: sin regresiones; conceptos de recargo/hora extra, mes comercial,
  auxilio de transporte, provisiones, aportes y reportes verificados.
- No se modificaron modulos ajenos en este alcance (inventario y contabilidad/terceros quedan fuera
  de esta certificacion; el commit de terceros se certifica aparte).

## Observaciones

- El test de integracion `apps/api/test/accounting-routes-contract.test.js` requiere el stack
  completo y no corresponde a este alcance (modulo de nomina). El modulo de contabilidad/terceros
  se certifica y promueve por separado.
