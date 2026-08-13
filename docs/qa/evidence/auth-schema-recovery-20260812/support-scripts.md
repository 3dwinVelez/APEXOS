# Scripts de soporte

- `node --test apps/api/test/runtime-schema-health.test.js apps/api/test/security-authorization-revocation.test.js`: 7/7 pruebas aprobadas.
- `npm run prisma:validate`: esquema Prisma valido.
- `git diff --check`: sin errores.
- Migracion productiva `20260727042000_authorization_versions/migration.sql`: ejecutada exitosamente mediante `prisma db execute` el 2026-08-12.

La suite API paralela obtuvo 112/113 por una prueba antigua de umbral temporal que tardo 280 ms bajo carga. Esa prueba paso aisladamente en 191 ms y luego en 136 ms; queda documentada y no se presenta como un fallo funcional de autenticacion.
