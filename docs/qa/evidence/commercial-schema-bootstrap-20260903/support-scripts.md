# Scripts de soporte

- Certificación versionada: `scripts/certifications/commercial-schema-bootstrap-local.js`.
- Contrato de cadena: `apps/api/test/commercial-migration-chain.test.js`.
- Integración de rutas: `apps/api/test/commercial-route-registration.integration.test.js`.
- Migración base: `apps/api/prisma/migrations/20260814140000_commercial_management_base/migration.sql`.
- Resultado ejecutado: `certification.json`.

El script levanta y elimina PostgreSQL 16 temporal; no depende de QA ni modifica ambientes remotos.
