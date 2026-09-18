# Validaciones de soporte

- `npx prisma validate --schema apps/api/prisma/schema.prisma`: aprobado.
- `node --test apps/api/test/apex-heart-domain.test.js apps/web/test/apex-heart-ui.test.mjs`: 4/4 aprobadas.
- `npm --workspace apps/web run typecheck`: aprobado.
- `npm --workspace apps/web run build`: aprobado, incluidas las rutas `/dashboard/reportes` y `/dashboard/reportes/apex-heart`.
- ESLint focalizado: 0 errores; permanecen dos advertencias históricas en `apps/web/lib/api.ts`.
- `npm run certify:apex-heart:local`: aprobado.
- `npm run certify:apex-heart:regression`: aprobado.

Entorno de ejecución: Node 24.14.0. El repositorio declara Node 22.x; esta diferencia queda registrada y deberá respetarse en el runner remoto.
