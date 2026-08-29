const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const source = fs.readFileSync(path.resolve(__dirname, "../certifications/hr-reports-export-qa.js"), "utf8");

test("el certificado de reportes exige QA, commit y tres perfiles controlados", () => {
  for (const token of [
    "TARGET_ENV", "QA_WEB_URL", "QA_API_URL", "QA_EXPECTED_COMMIT", "QA_ADMIN_EMAIL", "QA_ADMIN_PASSWORD",
    "QA_HR_NO_EXPORT_EMAIL", "QA_HR_NO_EXPORT_PASSWORD", "QA_OTHER_TENANT_EMAIL", "QA_OTHER_TENANT_PASSWORD",
    "QA_RAILWAY_PROJECT_ID", "QA_API_DEPLOYMENT_ID", "QA_WEB_DEPLOYMENT_ID"
  ]) assert.match(source, new RegExp(token));
  assert.match(source, /deployed_commit/);
  assert.match(source, /fetch\(`\$\{apiUrl\}\/health`/);
  assert.match(source, /railwayDeployment/);
  assert.match(source, /railway_cli_deployments/);
  assert.match(source, /merge-base.*--is-ancestor/s);
  assert.match(source, /process\.platform.*ComSpec.*cmd\.exe/s);
  assert.match(source, /export_permission_enforced/);
  assert.match(source, /tenant_isolation/);
});

test("el certificado abre el flujo real y valida el archivo XLSX descargado", () => {
  assert.match(source, /dashboard\/talento-humano\/reportes/);
  assert.match(source, /Ultimos 7 dias/);
  assert.match(source, /Descargar Excel/);
  assert.match(source, /ExcelJS\.Workbook/);
  assert.match(source, /Resumen.*Jornadas.*Trazabilidad/s);
  assert.doesNotMatch(source, /QA_\w*(TOKEN|SECRET)/);
});
