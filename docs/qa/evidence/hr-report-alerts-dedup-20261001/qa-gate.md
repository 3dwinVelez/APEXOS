# QA GATE - APEXOS

RAMA: desarrollo.
COMMIT: 8aea06378ee69b6ebe25a9a9c7a408650c276e2c.
ALCANCE: evitar alertas triplicadas en el reporte de horas de Talento Humano, dejando maximo entrada y cierre en el resumen.

TESTS EJECUTADOS:
- `node --experimental-strip-types --test test/hr-report-punch-alerts.test.mjs test/hr-reports-xlsx.test.mjs`
- `node scripts/certifications/hr-report-punch-alerts-local.js --output docs/qa/evidence/hr-report-alerts-dedup-20261001/local-certification.json`
- `npm run typecheck` en `apps/web`
- `npm run lint` en `apps/web`

PASSED:
- 6/6 pruebas focalizadas.
- 9/9 controles de certificacion local.
- Typecheck sin errores.
- Lint sin errores.

FAILED: ninguno.
SKIPPED: QA vivo para produccion.

REGRESIONES: no detectadas en alcance local proporcional.
RIESGOS: `develop -> main` sigue bloqueado hasta QA funcional vivo, aprobacion explicita y `qa:approval:evidence`.
RESULTADO: APTO CON OBSERVACIONES para integrar en `develop`.
EVIDENCIA: `local-certification.json`, `validation-checks.json`, `security-review.md`.
SIGUIENTE ACCION AUTORIZADA: promover puntualmente `desarrollo -> develop`.

