const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

function fail(message) {
  throw new Error(message);
}

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function matchesAllowed(file, allowedPaths) {
  return allowedPaths.some((allowed) => allowed.endsWith("/") ? file.startsWith(allowed) : file === allowed);
}

function changedFiles(base, candidate) {
  const output = git(["diff", "--name-status", `${base}..${candidate}`]);
  if (!output) return [];
  return output.split(/\r?\n/).flatMap((line) => {
    const parts = line.split("\t");
    const status = parts[0];
    if (status.startsWith("R")) return [{ status: "D", file: parts[1] }, { status: "A", file: parts[2] }];
    return [{ status, file: parts[parts.length - 1] }];
  });
}

function normalizedChange(change) {
  return `${change.status}:${change.file}`;
}

function validateExpectedChanges(manifest, changes) {
  if (manifest.scope_schema_version !== 2) return;
  if (!manifest.change_intent || typeof manifest.change_intent.summary !== "string" || !manifest.change_intent.summary.trim()) {
    fail("scope_schema_version 2 requiere change_intent.summary");
  }
  if (!Array.isArray(manifest.change_intent.modules) || !manifest.change_intent.modules.length) {
    fail("scope_schema_version 2 requiere change_intent.modules");
  }
  if (!Array.isArray(manifest.expected_changes) || !manifest.expected_changes.length) {
    fail("scope_schema_version 2 requiere expected_changes");
  }
  const expected = manifest.expected_changes.map((change) => {
    if (!change || !["A", "M", "D"].includes(change.status) || typeof change.file !== "string" || !change.file.trim()) {
      fail("expected_changes solo admite entradas exactas { status: A|M|D, file }");
    }
    return normalizedChange(change);
  }).sort();
  if (new Set(expected).size !== expected.length) fail("expected_changes contiene entradas duplicadas");
  const actual = changes.map(normalizedChange).sort();
  if (expected.length !== actual.length || expected.some((entry, index) => entry !== actual[index])) {
    const missing = expected.filter((entry) => !actual.includes(entry));
    const extra = actual.filter((entry) => !expected.includes(entry));
    fail(`diff distinto al inventario exacto; faltan [${missing.join(", ")}], sobran [${extra.join(", ")}]`);
  }
}

function validateManifest(manifest, manifestDir, changes) {
  if (!manifest.change_id || (!manifest.base_commit && !manifest.base_commits) || !manifest.certified_commit) fail("faltan change_id, base_commit/base_commits o certified_commit");
  if (!Array.isArray(manifest.allowed_paths) || !manifest.allowed_paths.length) fail("allowed_paths debe declarar rutas puntuales");
  if (!Array.isArray(manifest.allowed_deletions)) fail("allowed_deletions debe existir, incluso cuando este vacio");
  const unexpected = changes.filter(({ file }) => !matchesAllowed(file, manifest.allowed_paths));
  if (unexpected.length) fail(`rutas fuera de alcance: ${unexpected.map(({ status, file }) => `${status}:${file}`).join(", ")}`);
  const forbiddenDeletes = changes.filter(({ status, file }) => status.startsWith("D") && !manifest.allowed_deletions.includes(file));
  if (forbiddenDeletes.length) fail(`eliminaciones no autorizadas: ${forbiddenDeletes.map(({ file }) => file).join(", ")}`);
  validateExpectedChanges(manifest, changes);
  if (!Array.isArray(manifest.protected_capabilities) || !manifest.protected_capabilities.length) fail("protected_capabilities es obligatorio");
  for (const capability of manifest.protected_capabilities) {
    if (!capability.name || capability.status !== "passed") fail("toda capacidad protegida debe estar identificada y aprobada");
    if (!Array.isArray(capability.evidence) || !capability.evidence.length) fail(`la capacidad ${capability.name} no tiene evidencia`);
    for (const evidence of capability.evidence) {
      if (!fs.existsSync(path.resolve(manifestDir, evidence))) fail(`no existe evidencia para ${capability.name}: ${evidence}`);
    }
  }
}

function main() {
  const manifestPath = process.argv[2];
  const candidateRef = process.argv[3] || "HEAD";
  const targetRef = process.argv[4] || "origin/main";
  if (!manifestPath) fail("uso: npm run qa:promotion:scope -- <manifiesto> <candidato> <destino>");

  const absoluteManifest = path.resolve(manifestPath);
  const manifest = JSON.parse(fs.readFileSync(absoluteManifest, "utf8"));
  const candidate = git(["rev-parse", candidateRef]);
  const target = git(["rev-parse", targetRef]);
  const certified = git(["rev-parse", manifest.certified_commit]);
  const targetName = targetRef.split("/").pop();
  const declaredBase = manifest.base_commits?.[targetName] || manifest.base_commit;
  if (!declaredBase) fail(`el manifiesto no declara baseline para ${targetName}`);
  if (target !== git(["rev-parse", declaredBase])) fail(`el destino ${targetRef} cambio desde el baseline aprobado`);
  const commonBase = git(["merge-base", target, candidate]);
  if (!commonBase) fail("el candidato y el destino no comparten un historial controlado");
  let certifiedContained = true;
  try { git(["merge-base", "--is-ancestor", certified, candidate]); } catch { certifiedContained = false; }
  if (!certifiedContained) {
    try { git(["merge-base", "--is-ancestor", certified, target]); } catch { fail("ni el candidato ni el destino contienen el commit funcional certificado"); }
  }
  const changes = changedFiles(target, candidate);
  validateManifest(manifest, path.dirname(absoluteManifest), changes);
  console.log(`ALCANCE DE PROMOCION VALIDO: ${manifest.change_id} (${changes.length} rutas)`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`ALCANCE DE PROMOCION INVALIDO: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

module.exports = { changedFiles, matchesAllowed, validateExpectedChanges, validateManifest };
