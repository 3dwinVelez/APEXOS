const fs = require("node:fs");
const path = require("node:path");

const manifestPath = process.argv[2];
if (!manifestPath) {
  console.error("Uso: npm run qa:preqa:evidence -- <ruta-manifest.json>");
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
const manifestDirectory = path.dirname(absoluteManifest);

function validateEvidence(items, label) {
  if (!Array.isArray(items) || !items.length) {
    errors.push(`${label} debe contener archivos`);
    return;
  }
  for (const item of items) {
    if (!fs.existsSync(path.resolve(manifestDirectory, item))) {
      errors.push(`evidencia inexistente: ${path.resolve(manifestDirectory, item)}`);
    }
  }
}

function validateCertification(name) {
  const certification = manifest[name];
  if (certification?.status !== "passed") errors.push(`${name}.status debe ser passed`);
  const script = path.resolve(manifestDirectory, String(certification?.script || ""));
  if (!certification?.script || !fs.existsSync(script)) {
    errors.push(`${name}.script debe apuntar a un script versionado existente`);
  }
  validateEvidence(certification?.evidence, `${name}.evidence`);
}

if (!manifest.change_id) errors.push("change_id es obligatorio");
if (!/^[a-f0-9]{7,40}$/i.test(String(manifest.commit || ""))) errors.push("commit debe contener el SHA evaluado");
if (manifest.environment !== "LOCAL") errors.push("environment debe ser LOCAL");
if (manifest.source_branch !== "desarrollo" || manifest.target_branch !== "develop") {
  errors.push("el manifiesto pre-QA debe certificar desarrollo -> develop");
}
if (manifest.qa_status !== "pending") errors.push("qa_status debe ser pending");
if (manifest.approval?.status !== "approved") errors.push("approval.status debe ser approved");
if (manifest.approval?.scope !== "promotion_to_develop_for_qa") {
  errors.push("approval.scope debe ser promotion_to_develop_for_qa");
}
if (!manifest.approval?.approved_by || !manifest.approval?.approved_at) {
  errors.push("la autorizacion pre-QA requiere responsable y fecha");
}

for (const name of requiredChecks) {
  const check = manifest.checks?.[name];
  if (check?.status !== "passed") errors.push(`checks.${name}.status debe ser passed`);
  validateEvidence(check?.evidence, `checks.${name}.evidence`);
}

validateCertification("certification");
validateCertification("regression_certification");

if (errors.length) {
  console.error("AUTORIZACION PRE-QA BLOQUEADA");
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}

console.log(`AUTORIZACION PRE-QA VALIDA: ${manifest.change_id}`);
