#!/usr/bin/env node
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const PERMANENT_BRANCHES = new Set(["desarrollo", "develop", "main"]);
const AUXILIARY_PREFIXES = ["codex/", "feature/", "fix/", "hotfix/", "chore/", "sync/"];
const PROMOTION_AUTH = {
  "desarrollo-to-develop": "AUTORIZO_PROMOVER_DESARROLLO_A_DEVELOP",
  "develop-to-main": "AUTORIZO_PROMOVER_DEVELOP_A_MAIN"
};

function git(args, cwd = process.cwd()) {
  const result = spawnSync("git", args, { encoding: "utf8", shell: false, cwd });
  if (result.status !== 0) throw new Error((result.stderr || result.stdout || "git command failed").trim());
  return (result.stdout || "").trim();
}

function fail(message) {
  console.error(`GOBIERNO GIT BLOQUEADO: ${message}`);
  process.exit(1);
}

function lines(value) {
  return String(value || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function currentBranch() {
  return git(["branch", "--show-current"]);
}

function assertCleanWorktree() {
  if (git(["status", "--porcelain"])) fail("El worktree tiene cambios sin guardar o sin commit.");
}

function assertImplementationBranch() {
  const branch = currentBranch();
  if (branch !== "desarrollo") {
    fail(`Las implementaciones solo estan permitidas en desarrollo. Rama actual: ${branch || "DETACHED"}.`);
  }
}

function assertNoAuxiliaryBranches() {
  const refs = [
    ...lines(git(["branch", "--format=%(refname:short)"])),
    ...lines(git(["branch", "-r", "--format=%(refname:short)"]))
  ];
  const forbidden = refs.filter((ref) => {
    const normalized = ref.replace(/^origin\//, "");
    return !PERMANENT_BRANCHES.has(normalized) && AUXILIARY_PREFIXES.some((prefix) => normalized.startsWith(prefix));
  });
  if (forbidden.length) fail(`Existen ramas auxiliares no autorizadas: ${forbidden.join(", ")}`);
}

function assertPromotionAuth(flow) {
  const expected = PROMOTION_AUTH[flow];
  if (!expected) fail(`Flujo de promocion no soportado: ${flow}`);
  if (process.env.APEXOS_PROMOTION_AUTH !== expected) {
    fail(`Promocion ${flow} requiere APEXOS_PROMOTION_AUTH=${expected}.`);
  }
}

function assertGithubRef() {
  const eventName = process.env.GITHUB_EVENT_NAME || "";
  const refName = process.env.GITHUB_REF_NAME || "";
  const baseRef = process.env.GITHUB_BASE_REF || "";
  const headRef = process.env.GITHUB_HEAD_REF || "";

  if (eventName === "pull_request") {
    if (baseRef === "develop" && headRef !== "desarrollo") fail(`PR hacia develop solo desde desarrollo. Origen: ${headRef || "desconocido"}.`);
    if (baseRef === "main" && headRef !== "develop") fail(`PR hacia main solo desde develop. Origen: ${headRef || "desconocido"}.`);
    if (!["develop", "main"].includes(baseRef)) fail(`Destino de PR no autorizado: ${baseRef || "desconocido"}.`);
    return;
  }

  if (refName && !PERMANENT_BRANCHES.has(refName)) fail(`Push/CI sobre rama no permanente no autorizado: ${refName}.`);
}

function changedFiles(base, candidate, cwd = process.cwd()) {
  const output = git(["diff", "--name-status", `${base}..${candidate}`], cwd);
  return output ? output.split(/\r?\n/).flatMap((line) => {
    const parts = line.split("\t");
    if (parts[0].startsWith("R")) return [{ status: "D", file: parts[1] }, { status: "A", file: parts[2] }];
    return [{ status: parts[0], file: parts[parts.length - 1] }];
  }) : [];
}

function manifestAt(ref, file) {
  try { return JSON.parse(git(["show", `${ref}:${file}`])); }
  catch (error) { throw new Error(`No se pudo leer ${file} en ${ref}: ${error.message}`); }
}

function exactlyOneManifest(files, suffix, label) {
  const matches = files.filter(({ status, file }) => ["A", "M"].includes(status) && file.startsWith("docs/qa/manifests/") && !file.slice("docs/qa/manifests/".length).includes("/") && file.endsWith(suffix)).map(({ file }) => file);
  if (matches.length !== 1) throw new Error(`Se requiere exactamente un manifiesto ${label}; encontrados: ${matches.join(", ") || "ninguno"}`);
  return matches[0];
}

function ancestor(commit, candidate, label) {
  try { git(["merge-base", "--is-ancestor", commit, candidate]); }
  catch { throw new Error(`${label} ${commit} no es ancestro del candidato ${candidate}`); }
}

function candidatePath(ref, manifestFile, item, label) {
  if (typeof item !== "string" || !item.trim() || path.isAbsolute(item) || path.posix.isAbsolute(item) || path.win32.isAbsolute(item)) throw new Error(`${label} contiene una ruta no portable`);
  const root = path.resolve(process.cwd());
  const absolute = path.resolve(path.dirname(path.resolve(manifestFile)), item);
  const relative = path.relative(root, absolute);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error(`${label} escapa el repositorio: ${item}`);
  const repoPath = relative.split(path.sep).join("/");
  const result = spawnSync("git", ["cat-file", "-e", `${ref}:${repoPath}`], { encoding: "utf8", shell: false });
  if (result.status !== 0) throw new Error(`${label} no esta versionada en el candidato: ${repoPath}`);
  return repoPath;
}

function assertManifestRefs(ref, manifestFile, manifest, label, names) {
  for (const name of names) {
    const value = manifest[name];
    if (!value) continue;
    const entries = Array.isArray(value) ? value : [value];
    entries.forEach((entry, index) => {
      if (typeof entry.script === "string") candidatePath(ref, manifestFile, entry.script, `${label}.${name}[${index}].script`);
      if (Array.isArray(entry.evidence)) entry.evidence.forEach((item) => candidatePath(ref, manifestFile, item, `${label}.${name}[${index}].evidence`));
    });
  }
}

function assertScopedPromotion(candidateRef, targetRef, targetBranch, headBranch) {
  if (targetBranch !== "develop") throw new Error(`Destino CI no autorizado: ${targetBranch || "desconocido"}`);
  const candidate = git(["rev-parse", candidateRef]);
  const target = git(["rev-parse", targetRef]);
  let current;
  try { current = git(["rev-parse", `origin/${targetBranch}`]); }
  catch { throw new Error(`no existe origin/${targetBranch}; no se puede verificar el target actual`); }
  if (current !== target) throw new Error(`el target ${targetBranch} cambio durante la evaluacion`);
  const files = changedFiles(target, candidate);
  const scopeFile = exactlyOneManifest(files, "-scope.json", "scope v2");
  const preqaFile = exactlyOneManifest(files, "-preqa.json", "pre-QA");
  const scope = manifestAt(candidate, scopeFile);
  const preqa = manifestAt(candidate, preqaFile);
  if (scope.scope_schema_version !== 2) throw new Error("scope_schema_version debe ser 2");
  if (scope.source_branch !== "desarrollo" || scope.target_branch !== "develop" || preqa.source_branch !== "desarrollo" || preqa.target_branch !== "develop") throw new Error("Los manifiestos deben certificar desarrollo -> develop");
  if (!/^codex\/qa-[^/]+$/.test(headBranch || "") || scope.promotion_branch !== headBranch || preqa.promotion_branch !== headBranch) throw new Error("promotion_branch no coincide con la rama auxiliar autorizada");
  const approval = preqa.approval || scope.approval;
  if (approval?.status !== "approved" || approval?.authorization_flags?.auxiliary_branch_promotion !== true) throw new Error("falta autorizacion explicita de rama auxiliar");
  const source = scope.candidate_source;
  if (!source || source.branch !== "desarrollo" || !source.commit) throw new Error("candidate_source debe declarar branch desarrollo y commit");
  const certified = git(["rev-parse", scope.certified_commit]);
  const sourceCommit = git(["rev-parse", source.commit]);
  if (sourceCommit !== certified) throw new Error("candidate_source.commit debe identificar el certified_commit funcional");
  ancestor(certified, candidate, "certified_commit");
  try { git(["merge-base", "--is-ancestor", certified, target]); throw new Error("certified_commit ya esta contenido en el target"); }
  catch (error) { if (error.message.includes("ya esta")) throw error; }
  ancestor(sourceCommit, candidate, "candidate_source.commit");
  if (!scope.target_head || git(["rev-parse", scope.target_head]) !== target) throw new Error("scope.target_head no coincide con target");
  if (!preqa.target_head || git(["rev-parse", preqa.target_head]) !== target) throw new Error("pre-QA target_head no coincide con target");
  if (!Array.isArray(scope.certified_functional_paths) || !scope.certified_functional_paths.length || new Set(scope.certified_functional_paths).size !== scope.certified_functional_paths.length || scope.certified_functional_paths.some((file) => typeof file !== "string" || !file.trim())) throw new Error("certified_functional_paths debe enumerar rutas unicas");
  const certifiedParent = git(["rev-parse", `${certified}^`]);
  const certifiedInventory = changedFiles(certifiedParent, certified).map(({ file }) => file).sort();
  const declaredInventory = [...scope.certified_functional_paths].sort();
  if (certifiedInventory.length !== declaredInventory.length || certifiedInventory.some((file, index) => file !== declaredInventory[index])) throw new Error("certified_functional_paths no coincide con el diff exacto del commit certificado");
  const governancePaths = new Set([
    ".github/workflows/ci.yml",
    "scripts/git-governance-guard.js",
    "scripts/test/git-governance-guard.test.js",
    "scripts/certifications/scoped-qa-governance-local.js",
    "docs/qa/certifications/hr-ibc-novelties-20261016.md",
    scopeFile,
    preqaFile
  ]);
  const postCertified = changedFiles(certified, candidate).map(({ file }) => file);
  const unexpectedProduct = postCertified.filter((file) => !scope.certified_functional_paths.includes(file) && !governancePaths.has(file));
  if (unexpectedProduct.length) throw new Error(`cambios de producto fuera del commit certificado: ${unexpectedProduct.join(", ")}`);
  const functionalDiff = spawnSync("git", ["diff", "--quiet", `${certified}..${candidate}`, "--", ...scope.certified_functional_paths], { encoding: "utf8", shell: false });
  if (functionalDiff.status !== 0) throw new Error("las rutas funcionales certificadas cambiaron despues del commit certificado");
  const root = process.cwd();
  assertManifestRefs(candidate, scopeFile, scope, "scope", ["protected_capabilities"]);
  assertManifestRefs(candidate, preqaFile, preqa, "pre-QA", ["certification", "regression_certification"]);
  for (const name of ["functional", "error", "support_scripts", "regression", "platform_regression"]) {
    if (!preqa.checks?.[name]) throw new Error(`pre-QA checks.${name} ausente`);
    preqa.checks[name].evidence?.forEach((item) => candidatePath(candidate, preqaFile, item, `pre-QA.checks.${name}.evidence`));
  }
  const scopeResult = spawnSync(process.execPath, [path.join(root, "scripts/validate-promotion-scope.js"), path.resolve(scopeFile), candidate, `origin/${targetBranch}`], { encoding: "utf8" });
  if (scopeResult.status !== 0) throw new Error(`scope validator rechazo: ${(scopeResult.stderr || scopeResult.stdout).trim()}`);
  const preqaResult = spawnSync(process.execPath, [path.join(root, "scripts/validate-preqa-promotion-evidence.js"), path.resolve(preqaFile)], { encoding: "utf8" });
  if (preqaResult.status !== 0) throw new Error(`pre-QA validator rechazo: ${(preqaResult.stderr || preqaResult.stdout).trim()}`);
  console.log(`PROMOCION CI ALCANZADA: ${scope.change_id}`);
}

if (require.main === module) {
const command = process.argv[2] || "status";
try {
  if (command === "implementation") assertImplementationBranch();
  else if (command === "local") {
    assertImplementationBranch();
    assertCleanWorktree();
    assertNoAuxiliaryBranches();
  } else if (command === "ci") assertGithubRef();
  else if (command === "ci-promotion") assertScopedPromotion(process.argv[3], process.argv[4], process.argv[5], process.argv[6]);
  else if (command === "promote") {
    assertCleanWorktree();
    assertPromotionAuth(process.argv[3]);
  } else if (command === "no-auxiliary-branches") assertNoAuxiliaryBranches();
  else if (command === "status") {
    console.log(JSON.stringify({
      branch: currentBranch(),
      clean: !git(["status", "--porcelain"]),
      permanent_branches: Array.from(PERMANENT_BRANCHES),
      auxiliary_prefixes_blocked: AUXILIARY_PREFIXES
    }, null, 2));
  } else fail(`Comando no soportado: ${command}`);
} catch (error) {
  fail(error.message);
}
}

module.exports = { changedFiles, exactlyOneManifest, candidatePath, assertScopedPromotion };
