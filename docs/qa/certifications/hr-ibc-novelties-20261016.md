# Acta de certificación local y gobernanza

**Cambio:** `hr-ibc-novelties-20261015`
**Candidato funcional revisado:** `57481e6c0ede8d4ad26beeb0f24dc01643e9b159`
**Rama de implementación:** `desarrollo`
**Fecha:** 2026-10-16

Esta acta versionada resume la revisión de los certificados locales existentes para el candidato funcional. Los archivos JSON y registros crudos permanecen como evidencia local no versionada en `docs/qa/evidence/hr-ibc-novelties-20261015/` y `docs/qa/evidence/payroll-accounting-masters-20261014/`.

## Certificación funcional revisada

- IBC por novedades laborales y vista previa PILA: certificado local `hr-ibc-novelties-browser-local.json`, estado `passed`.
- Regresión de maestros de nómina y contabilidad, RBAC y aislamiento por tenant: certificado local `payroll-masters-regression.json`, estado `passed`.
- El recorrido funcional de IBC registró 67 comprobaciones y la regresión de maestros registró 31 comprobaciones; ambos estados son `passed`.
- El certificado local se declara como soporte de pre-QA; la aprobación funcional sobre QA requiere repetir el flujo en el bundle desplegado.

## Huellas de evidencia local

Las huellas se calculan con SHA-256 sobre los archivos JSON crudos presentes al momento de la certificación:

| Archivo | SHA-256 |
| --- | --- |
| `docs/qa/evidence/hr-ibc-novelties-20261015/hr-ibc-novelties-browser-local.json` | `8A8FD8E4CA4A47D42BD44BF8E004A209D29DCA9F60FA150AB4091EAD57934A9E` |
| `docs/qa/evidence/hr-ibc-novelties-20261015/payroll-masters-regression.json` | `8DF7496369258FDA0029F3C1A5A07378ABE8D43E723F9870ED760438E71A6C25` |
| `docs/qa/evidence/payroll-accounting-masters-20261014/payroll-accounting-masters-browser-local.json` | `4CB0D4328B157D068DB3E6B888C25CF90F9280872D98557C97C51A8D1C70E89E` |

## Gobernanza

La certificación de gobernanza ejecutó el CLI versionado contra un fixture Git local real y comprobó 20 casos: flujo autorizado `desarrollo -> develop`, ruta `develop -> main`, rama `main` incorrecta, autorización ausente, rama auxiliar incorrecta, certificado fuera de la historia, baseline cambiado, diff fuera de alcance, aprobación ausente, `ci-promotion` autorizado, head auxiliar incorrecto, `origin/develop` ausente, función certificada alterada, ruta de evidencia absoluta, traversal fuera del repositorio, evidencia no versionada, inventario de producto no certificado y certificado ya contenido en target. Resultado: **20/20 passed**. La salida JSON generada se mantiene como evidencia local y no se incluye en el commit.

El inventario versionado de esta intervención contiene 20 rutas: las 13 rutas funcionales certificadas, los dos manifiestos de promoción, y cinco rutas de gobernanza (`.github/workflows/ci.yml`, `scripts/git-governance-guard.js`, `scripts/test/git-governance-guard.test.js`, `scripts/certifications/scoped-qa-governance-local.js` y esta acta).
