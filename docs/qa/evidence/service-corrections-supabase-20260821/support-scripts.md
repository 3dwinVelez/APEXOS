# Scripts de soporte y validaciones ejecutadas

Fecha: 2026-08-21
Commit evaluado: `351431a`

| Validacion | Comando | Resultado |
| --- | --- | --- |
| Typecheck web | `npm --workspace apps/web run typecheck` | PASS |
| Lint web | `npm --workspace apps/web run lint` | PASS |
| Build web | `npm --workspace apps/web run build` | PASS |
| Prisma schema | `npx prisma validate --schema apps/api/prisma/schema.prisma` | PASS |
| Prisma client | `npx prisma generate --schema apps/api/prisma/schema.prisma` | PASS (regenerado) |
| Pruebas correcciones | `node --test apps/api/test/service-order-administrative-corrections.test.js` | 20/20 PASS |
| Pruebas inventario | `node --env-file-if-exists=.env --test apps/api/test/inventory-valuation-transit.test.js` | 7/7 PASS |

## Certificadores QA

Disponibles y con contrato establecido:

- `npm run certify:service-master-correction:qa`
- `npm run certify:service-correction-external-id:qa`
- `npm run certify:service-correction-evidence:nyvora`

Pendientes de ejecucion: requieren Docker Desktop activo (base local 54320
para el fixture Nyvora controlado) y validacion del commit desplegado en QA.
