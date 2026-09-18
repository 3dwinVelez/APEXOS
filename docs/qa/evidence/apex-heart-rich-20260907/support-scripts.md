# Evidencia de soporte

- `npm --workspace apps/web run typecheck`: aprobado.
- `npm --workspace apps/web run build`: aprobado; `/dashboard/reportes` y `/dashboard/reportes/apex-heart` generadas.
- `node --test apps/api/test/apex-heart-domain.test.js`: 3/3 aprobadas.
- `node --test apps/web/test/apex-heart-ui.test.mjs`: 2/2 aprobadas.
- `npm run certify:apex-heart:local`: aprobado, versión 3.
- `npm run certify:apex-heart:regression`: aprobado.
- `node scripts/seed-apex-heart-demo.js`: 36 productos, 18 meses, 72 facturas, 10 clientes y 8 proveedores.

