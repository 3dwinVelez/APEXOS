# Support scripts - hr-report-markings-timeline-20261001

TEST: Suite focalizada HR reportes.
RESULTADO: passed.
COMANDO: `node --experimental-strip-types --test test/hr-report-punch-alerts.test.mjs test/hr-reports-xlsx.test.mjs`
OBTENIDO: 6/6 pruebas aprobadas.
EVIDENCIA: `validation-checks.json`.

TEST: Certificacion local versionada.
RESULTADO: passed.
COMANDO: `node scripts/certifications/hr-report-punch-alerts-local.js --output docs/qa/evidence/hr-report-markings-timeline-20261001/local-certification.json`
OBTENIDO: 10/10 controles aprobados.
EVIDENCIA: `local-certification.json`.

TEST: Typecheck web.
RESULTADO: passed.
COMANDO: `npm run typecheck` desde `apps/web`.
OBTENIDO: sin errores.
EVIDENCIA: `validation-checks.json`.

TEST: Lint web.
RESULTADO: passed.
COMANDO: `npm run lint` desde `apps/web`.
OBTENIDO: 0 errores; 13 warnings preexistentes fuera del cambio.
EVIDENCIA: `validation-checks.json`.

