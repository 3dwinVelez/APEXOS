const fs = require("node:fs");
const path = require("node:path");

const manifestPath = process.argv[2];
if (!manifestPath) {
  console.error("Uso: npm run qa:approval:evidence -- <ruta-manifest.json>");
  process.exit(2);
}

const absoluteManifest = path.resolve(manifestPath);
if (!fs.existsSync(absoluteManifest)) {
  console.error(`Manifest no encontrado: ${absoluteManifest}`);
  process.exit(2);
}

const manifest = JSON.parse(fs.readFileSync(absoluteManifest, "utf8"));
const requiredChecks = ["functional", "error", "support_scripts", "regression", "platform_regression"];
const errors = [];
if (!manifest.change_id) errors.push("change_id es obligatorio");
if (!/^[a-f0-9]{7,40}$/i.test(String(manifest.commit || ""))) errors.push("commit debe contener el SHA evaluado");
if (manifest.environment !== "QA") errors.push("environment debe ser QA");
if (manifest.approval?.status !== "approved") errors.push("approval.status debe ser approved");
if (!manifest.approval?.approved_by || !manifest.approval?.approved_at) errors.push("la aprobacion QA requiere responsable y fecha");
for (const name of requiredChecks) {
  const check = manifest.checks?.[name];
  if (check?.status !== "passed") errors.push(`checks.${name}.status debe ser passed`);
  const evidence = Array.isArray(check?.evidence) ? check.evidence : [];
  if (!evidence.length) errors.push(`checks.${name}.evidence debe contener archivos`);
  for (const item of evidence) {
    const evidencePath = path.resolve(path.dirname(absoluteManifest), item);
    if (!fs.existsSync(evidencePath)) errors.push(`evidencia inexistente: ${evidencePath}`);
  }
}
if (manifest.certification?.status !== "passed") errors.push("certification.status debe ser passed");
const certificationScript = path.resolve(path.dirname(absoluteManifest), String(manifest.certification?.script || ""));
if (!manifest.certification?.script || !fs.existsSync(certificationScript)) errors.push("certification.script debe apuntar a un script versionado existente");
const certificationEvidence = Array.isArray(manifest.certification?.evidence) ? manifest.certification.evidence : [];
if (!certificationEvidence.length) errors.push("certification.evidence debe contener el resultado del script");
for (const item of certificationEvidence) {
  const evidencePath = path.resolve(path.dirname(absoluteManifest), item);
  if (!fs.existsSync(evidencePath)) errors.push(`evidencia de certificacion inexistente: ${evidencePath}`);
}
if (manifest.regression_certification?.status !== "passed") errors.push("regression_certification.status debe ser passed");
const regressionScript = path.resolve(path.dirname(absoluteManifest), String(manifest.regression_certification?.script || ""));
if (!manifest.regression_certification?.script || !fs.existsSync(regressionScript)) {
  errors.push("regression_certification.script debe apuntar a un script versionado existente");
}
const regressionEvidence = Array.isArray(manifest.regression_certification?.evidence)
  ? manifest.regression_certification.evidence
  : [];
if (!regressionEvidence.length) errors.push("regression_certification.evidence debe contener el resultado transversal");
for (const item of regressionEvidence) {
  const evidencePath = path.resolve(path.dirname(absoluteManifest), item);
  if (!fs.existsSync(evidencePath)) errors.push(`evidencia de regresion transversal inexistente: ${evidencePath}`);
}
if (manifest.model_company_certification?.status !== "passed") errors.push("model_company_certification.status debe ser passed");
if (String(manifest.model_company_certification?.company || "").toUpperCase() !== "NYVORA") errors.push("model_company_certification.company debe ser NYVORA");
if (manifest.model_company_certification?.environment !== "QA") errors.push("model_company_certification.environment debe ser QA");
const modelScript = path.resolve(path.dirname(absoluteManifest), String(manifest.model_company_certification?.script || ""));
if (!manifest.model_company_certification?.script || !fs.existsSync(modelScript)) errors.push("model_company_certification.script debe apuntar a un script versionado existente");
const modelEvidence = Array.isArray(manifest.model_company_certification?.evidence) ? manifest.model_company_certification.evidence : [];
if (!modelEvidence.length) errors.push("model_company_certification.evidence debe contener el resultado Nyvora");
for (const item of modelEvidence) {
  const evidencePath = path.resolve(path.dirname(absoluteManifest), item);
  if (!fs.existsSync(evidencePath)) errors.push(`evidencia Nyvora inexistente: ${evidencePath}`);
}
if (manifest.rollback_plan?.status !== "ready") errors.push("rollback_plan.status debe ser ready");
if (manifest.rollback_plan?.strategy !== "controlled_revert") errors.push("rollback_plan.strategy debe ser controlled_revert");
if (!/^[a-f0-9]{7,40}$/i.test(String(manifest.rollback_plan?.previous_main_commit || ""))) errors.push("rollback_plan.previous_main_commit debe identificar la version productiva estable");
if (!String(manifest.rollback_plan?.trigger || "").trim()) errors.push("rollback_plan.trigger es obligatorio");
if (manifest.target_branch !== "main" || manifest.source_branch !== "develop") {
  errors.push("el manifiesto debe certificar develop -> main");
}

if (errors.length) {
  console.error("APROBACION QA BLOQUEADA");
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}
console.log(`APROBACION QA VALIDA: ${manifest.change_id}`);
