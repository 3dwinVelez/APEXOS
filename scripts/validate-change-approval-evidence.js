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
const requiredChecks = ["functional", "error", "support_scripts", "regression"];
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
if (manifest.target_branch !== "main" || manifest.source_branch !== "develop") {
  errors.push("el manifiesto debe certificar develop -> main");
}

if (errors.length) {
  console.error("APROBACION QA BLOQUEADA");
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}
console.log(`APROBACION QA VALIDA: ${manifest.change_id}`);
