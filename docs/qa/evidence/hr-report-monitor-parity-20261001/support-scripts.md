# Support scripts - hr-report-monitor-parity-20261001

TEST: Suite focalizada HR reportes.
RESULTADO: passed.
COMANDO: `node --experimental-strip-types --test test/hr-report-punch-alerts.test.mjs test/hr-reports-xlsx.test.mjs`
OBTENIDO: 6/6 pruebas aprobadas.

TEST: Certificacion local versionada.
RESULTADO: passed.
COMANDO: `node scripts/certifications/hr-report-punch-alerts-local.js --output docs/qa/evidence/hr-report-monitor-parity-20261001/local-certification.json`
OBTENIDO: 10/10 controles aprobados.

TEST: Typecheck y lint web.
RESULTADO: passed.
OBTENIDO: typecheck sin errores; lint con 0 errores y 13 warnings preexistentes.

