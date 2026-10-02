# QA GATE — APEXOS

RAMA: desarrollo
COMMIT: 4dc7a889fc381d3c7931bfb42bb8ae104f0b2150
ALCANCE: Modal de trazabilidad del reporte de horas de Talento Humano; bloqueo de scroll del fondo y foco inicial del dialogo.

TESTS EJECUTADOS:
- `node --experimental-strip-types --test test/hr-report-punch-alerts.test.mjs test/hr-reports-xlsx.test.mjs` en `apps/web`.
- `node scripts/certifications/hr-report-punch-alerts-local.js --changeId hr-report-modal-scroll-lock-20261001 --output docs/qa/evidence/hr-report-modal-scroll-lock-20261001/local-certification.json`.
- `npm run typecheck` en `apps/web`.

PASSED: 6 pruebas Node, 10 controles de certificacion, typecheck web.
FAILED: 0.
SKIPPED: 0.

REGRESIONES: No observadas en alertas, detalle, monitor compartido ni exportacion XLSX.
RIESGOS: Validacion visual manual en navegador real recomendada durante QA funcional; no bloquea pre-QA local.
RESULTADO: APTO CON OBSERVACIONES.
EVIDENCIA: Archivos de esta carpeta.
SIGUIENTE ACCION AUTORIZADA: Promocion controlada `desarrollo -> develop` para QA.

