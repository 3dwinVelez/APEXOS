# QA GATE — APEXOS

RAMA: desarrollo
ALCANCE: Transporte, flujo de 4 etapas, correccion del orden visible de etapas y preparacion de certificacion viva con datos reales.

TESTS EJECUTADOS:
- `node --test test/transport-tms-foundation.test.js test/transport-settlement-engine.test.js test/transport-packing.test.js` en `apps/api`.
- `node --experimental-strip-types --test test/transport-tms-ui.test.mjs test/transport-settlement-ui.test.mjs test/transport-master-access.test.mjs` en `apps/web`.
- `npm run prisma:validate`.
- `npm --workspace apps/web run typecheck`.
- `node scripts/certifications/transport-tms-local.js --api-url http://localhost:3000 --output docs/qa/evidence/transport-four-stage-develop-20261002/live-tms-certification-attempt.json`.

PASSED: 71 pruebas versionadas, Prisma validate, TypeScript web.
FAILED: Certificacion viva TMS local por API no disponible.
SKIPPED: Poblado real de datos y recorrido HTTP completo de 4 etapas; bloqueado por ambiente.

REGRESIONES: Se detecto y corrigio desorden de etapas en la portada de Transporte.
RIESGOS: No hay evidencia viva de datos reales sobre ambiente `develop`; no se puede declarar completo el alcance solicitado.
RESULTADO: NO APTO.
EVIDENCIA: Archivos de esta carpeta.
SIGUIENTE ACCION AUTORIZADA: Levantar o indicar un ambiente `develop` accesible con API, base de datos y credenciales; repetir certificacion viva antes de promover.

