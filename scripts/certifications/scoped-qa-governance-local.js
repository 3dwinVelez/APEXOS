#!/usr/bin/env node
/*
 * End-to-end local certification for the promotion governance CLI.
 * It uses a real temporary Git repository and the versioned guard/scope/pre-QA
 * CLIs. Nothing from the fixture is written to the working tree.
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync, spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "../..");
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "apex-governance-"));
const checks = [];

function git(args) { return execFileSync("git", args, { cwd: fixture, encoding: "utf8" }).trim(); }
function isolatedEnv(env = {}) {
  const clean = { ...process.env };
  for (const key of ["GITHUB_EVENT_NAME", "GITHUB_REF_NAME", "GITHUB_BASE_REF", "GITHUB_HEAD_REF", "APEXOS_PROMOTION_AUTH"]) delete clean[key];
  return { ...clean, ...env };
}
function runNode(file, args = [], env = {}) {
  return spawnSync(process.execPath, [file, ...args], { cwd: fixture, env: isolatedEnv(env), encoding: "utf8" });
}
function record(name, ok, detail = {}) {
  checks.push({ name, status: ok ? "passed" : "failed", ...detail });
  if (!ok) throw new Error(`${name} failed`);
}
function expect(name, command, args, env, expectedFailure = false) {
  const result = runNode(command, args, env);
  const passed = expectedFailure ? result.status !== 0 : result.status === 0;
  record(name, passed, { exit_code: result.status, stdout: String(result.stdout || "").trim().slice(-500), stderr: String(result.stderr || "").trim().slice(-500) });
}
function writeJson(file, value) { fs.writeFileSync(path.join(fixture, file), `${JSON.stringify(value, null, 2)}\n`); }
function commit(message) { git(["add", "."]); git(["commit", "-m", message]); return git(["rev-parse", "HEAD"]); }

function runStrictPromotionFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "apex-governance-promotion-"));
  const sg = (args) => execFileSync("git", args, { cwd: dir, encoding: "utf8" }).trim();
  const sn = (file, args, env = {}) => spawnSync(process.execPath, [file, ...args], { cwd: dir, env: isolatedEnv(env), encoding: "utf8" });
  const sx = (name, file, args, env = {}, failure = false, expectedError = null) => {
    const result = sn(file, args, env);
    const stderr = String(result.stderr || "").trim();
    const passed = failure ? result.status !== 0 && (!expectedError || stderr.includes(expectedError)) : result.status === 0;
    record(name, passed, { exit_code: result.status, stderr: stderr.slice(-500), expected_error: expectedError });
  };
  try {
    sg(["init", "--quiet"]); sg(["config", "user.email", "certification@example.invalid"]); sg(["config", "user.name", "APEX certification"]);
    fs.writeFileSync(path.join(dir, "base.txt"), "base\n"); sg(["add", "."]); sg(["commit", "-m", "promotion baseline"]);
    const base = sg(["rev-parse", "HEAD"]); sg(["branch", "-M", "main"]); sg(["branch", "develop"]); sg(["update-ref", "refs/remotes/origin/develop", base]);
    sg(["checkout", "-b", "desarrollo"]); fs.writeFileSync(path.join(dir, "allowed.txt"), "functional\n"); sg(["add", "."]); sg(["commit", "-m", "certified functional change"]);
    const certified = sg(["rev-parse", "HEAD"]); sg(["checkout", "-b", "codex/qa-ibc-57481e6c"]);
    const files = ["scripts/git-governance-guard.js"];
    for (const file of files) { const target = path.join(dir, file); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.copyFileSync(path.join(root, file), target); }
    fs.mkdirSync(path.join(dir, "docs/qa/certifications"), { recursive: true }); fs.writeFileSync(path.join(dir, "docs/qa/certifications/hr-ibc-novelties-20261016.md"), "fixture attestation\n");
    const changed = [
      { status: "A", file: "allowed.txt" },
      ...files.map((file) => ({ status: "A", file })),
      { status: "A", file: "docs/qa/certifications/hr-ibc-novelties-20261016.md" },
      { status: "A", file: "docs/qa/manifests/fixture-preqa.json" },
      { status: "A", file: "docs/qa/manifests/fixture-scope.json" }
    ];
    const scope = { scope_schema_version: 2, change_id: "fixture-strict", environment: "LOCAL", source_branch: "desarrollo", target_branch: "develop", promotion_branch: "codex/qa-ibc-57481e6c", candidate_source: { branch: "desarrollo", commit: certified }, target_head: base, certified_commit: certified, base_commits: { develop: base }, change_intent: { summary: "fixture", modules: ["promotion-governance"] }, expected_changes: changed, allowed_paths: changed.map((x) => x.file), allowed_deletions: [], certified_functional_paths: ["allowed.txt"], protected_capabilities: [{ name: "fixture", status: "passed", evidence: ["../certifications/hr-ibc-novelties-20261016.md"] }] };
    const preqa = { scope_schema_version: 2, change_id: "fixture-strict-preqa", environment: "LOCAL", source_branch: "desarrollo", target_branch: "develop", promotion_branch: "codex/qa-ibc-57481e6c", target_head: base, commit: certified, candidate: { status: "certified", reviewed_commit: certified, scope_manifest: "fixture-scope.json" }, qa_status: "pending", approval: { status: "approved", scope: "promotion_to_develop_for_qa", approved_by: "fixture", approved_at: "2026-10-16T00:00:00Z", authorization_flags: { auxiliary_branch_promotion: true } }, checks: Object.fromEntries(["functional", "error", "support_scripts", "regression", "platform_regression"].map((name) => [name, { status: "passed", evidence: ["../certifications/hr-ibc-novelties-20261016.md"] }])), certification: { status: "passed", script: "../../../scripts/git-governance-guard.js", evidence: ["../certifications/hr-ibc-novelties-20261016.md"] }, regression_certification: { status: "passed", script: "../../../scripts/git-governance-guard.js", evidence: ["../certifications/hr-ibc-novelties-20261016.md"] } };
    fs.mkdirSync(path.join(dir, "docs/qa/manifests"), { recursive: true }); fs.writeFileSync(path.join(dir, "docs/qa/manifests/fixture-scope.json"), `${JSON.stringify(scope, null, 2)}\n`); fs.writeFileSync(path.join(dir, "docs/qa/manifests/fixture-preqa.json"), `${JSON.stringify(preqa, null, 2)}\n`); sg(["add", "."]); sg(["commit", "-m", "promotion manifests"]);
    for (const utility of ["scripts/validate-promotion-scope.js", "scripts/validate-preqa-promotion-evidence.js"]) { const target = path.join(dir, utility); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.copyFileSync(path.join(root, utility), target); }
    fs.appendFileSync(path.join(dir, ".git/info/exclude"), "scripts/validate-promotion-scope.js\nscripts/validate-preqa-promotion-evidence.js\n");
    const candidate = sg(["rev-parse", "HEAD"]); const guard = path.join(dir, "scripts/git-governance-guard.js");
    sx("strict_authorized_develop_promotion", guard, ["ci-promotion", "HEAD", base, "develop", "codex/qa-ibc-57481e6c"]);
    sx("strict_develop_to_main_ci_remains_allowed", guard, ["ci"], { GITHUB_EVENT_NAME: "pull_request", GITHUB_BASE_REF: "main", GITHUB_HEAD_REF: "develop" });
    sx("strict_wrong_actual_head_branch_rejected", guard, ["ci-promotion", "HEAD", base, "develop", "codex/qa-wrong"], {}, true, "promotion_branch no coincide");
    sg(["update-ref", "-d", "refs/remotes/origin/develop"]); sx("strict_missing_origin_target_rejected", guard, ["ci-promotion", "HEAD", base, "develop", "codex/qa-ibc-57481e6c"], {}, true, "no existe origin/develop");
    sg(["update-ref", "refs/remotes/origin/develop", base]); fs.writeFileSync(path.join(dir, "allowed.txt"), "tampered\n"); sg(["add", "allowed.txt"]); sg(["commit", "-m", "alter certified function"]); sx("strict_altered_functional_path_rejected", guard, ["ci-promotion", "HEAD", base, "develop", "codex/qa-ibc-57481e6c"], {}, true, "las rutas funcionales certificadas cambiaron");
    const mutateManifest = (name, mutate, expectedError = null) => {
      sg(["checkout", "-b", `negative-${name}`, candidate]);
      const scopePath = path.join(dir, "docs/qa/manifests/fixture-scope.json");
      const preqaPath = path.join(dir, "docs/qa/manifests/fixture-preqa.json");
      const nextScope = JSON.parse(fs.readFileSync(scopePath, "utf8"));
      const nextPreqa = JSON.parse(fs.readFileSync(preqaPath, "utf8"));
      mutate(nextScope, nextPreqa);
      fs.writeFileSync(scopePath, `${JSON.stringify(nextScope, null, 2)}\n`); fs.writeFileSync(preqaPath, `${JSON.stringify(nextPreqa, null, 2)}\n`);
      sg(["add", "."]); sg(["commit", "-m", `negative ${name}`]);
      sx(`strict_${name}_rejected`, guard, ["ci-promotion", "HEAD", base, "develop", "codex/qa-ibc-57481e6c"], {}, true, expectedError);
      sg(["checkout", "codex/qa-ibc-57481e6c"]);
    };
    mutateManifest("absolute_evidence_path", (scope, preqa) => { scope.protected_capabilities[0].evidence = ["C:/outside-evidence.json"]; preqa.certification.evidence = ["C:/outside-evidence.json"]; }, "ruta no portable");
    mutateManifest("repository_traversal_evidence_path", (scope, preqa) => { scope.protected_capabilities[0].evidence = ["../../../../outside-evidence.json"]; preqa.certification.evidence = ["../../../../outside-evidence.json"]; }, "escapa el repositorio");
    mutateManifest("untracked_evidence", (scope, preqa) => { scope.protected_capabilities[0].evidence = ["../certifications/untracked.json"]; preqa.certification.evidence = ["../certifications/untracked.json"]; }, "no esta versionada");
    mutateManifest("extra_noncertified_product_inventory", (scope) => { scope.expected_changes.push({ status: "A", file: "apps/product/rogue.js" }); scope.allowed_paths.push("apps/product/rogue.js"); });
    mutateManifest("certified_commit_already_in_target", (scope) => { scope.certified_commit = base; scope.candidate_source.commit = base; }, "certified_commit");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

try {
  git(["init", "--quiet"]);
  git(["config", "user.email", "certification@example.invalid"]);
  git(["config", "user.name", "APEX certification"]);
  fs.writeFileSync(path.join(fixture, "base.txt"), "base\n");
  const base = commit("fixture baseline");
  git(["branch", "-M", "main"]);
  git(["branch", "develop"]);
  git(["checkout", "-b", "desarrollo"]);
  fs.writeFileSync(path.join(fixture, "allowed.txt"), "candidate\n");
  const candidate = commit("fixture candidate");
  git(["checkout", "-b", "divergent"]);
  fs.writeFileSync(path.join(fixture, "divergent.txt"), "unrelated\n");
  const divergent = commit("fixture divergent certificate");
  git(["checkout", "desarrollo"]);

  const guard = path.join(fixture, "git-governance-guard.js");
  const scope = path.join(fixture, "validate-promotion-scope.js");
  const preqa = path.join(fixture, "validate-preqa-promotion-evidence.js");
  fs.copyFileSync(path.join(root, "scripts/git-governance-guard.js"), guard);
  git(["add", "git-governance-guard.js"]);
  git(["commit", "-m", "fixture governance guard"]);
  fs.copyFileSync(path.join(root, "scripts/validate-promotion-scope.js"), scope);
  fs.copyFileSync(path.join(root, "scripts/validate-preqa-promotion-evidence.js"), preqa);

  const manifest = {
    scope_schema_version: 2, change_id: "fixture-governance", environment: "LOCAL",
    source_branch: "desarrollo", target_branch: "develop", candidate,
    base_commits: { develop: base }, certified_commit: candidate,
    change_intent: { summary: "fixture scope", modules: ["promotion-governance"] },
    expected_changes: [{ status: "A", file: "allowed.txt" }], allowed_paths: ["allowed.txt"],
    allowed_deletions: [], protected_capabilities: [{ name: "fixture", status: "passed", evidence: ["attestation.md"] }]
  };
  fs.writeFileSync(path.join(fixture, "attestation.md"), "fixture evidence\n");
  writeJson("scope.json", manifest);
  git(["add", "."]);
  git(["commit", "-m", "fixture certification inputs"]);

  expect("guard_authorized_ci_flow", guard, ["ci"], { GITHUB_EVENT_NAME: "pull_request", GITHUB_BASE_REF: "develop", GITHUB_HEAD_REF: "desarrollo" });
  expect("guard_authorized_promotion", guard, ["promote", "desarrollo-to-develop"], { APEXOS_PROMOTION_AUTH: "AUTORIZO_PROMOVER_DESARROLLO_A_DEVELOP" });
  expect("guard_main_target_rejected", guard, ["ci"], { GITHUB_EVENT_NAME: "pull_request", GITHUB_BASE_REF: "main", GITHUB_HEAD_REF: "desarrollo" }, true);
  expect("guard_unapproved_promotion_rejected", guard, ["promote", "desarrollo-to-develop"], {}, true);
  expect("guard_auxiliary_branch_rejected", guard, ["ci"], { GITHUB_REF_NAME: "codex/qa-unapproved" }, true);
  expect("scope_authorized_flow", scope, ["scope.json", candidate, "develop"]);

  const missingCert = { ...manifest, certified_commit: divergent };
  writeJson("missing-cert.json", missingCert);
  expect("scope_missing_cert_ancestor_rejected", scope, ["missing-cert.json", "desarrollo", "develop"], {}, true);
  const changedBaseline = { ...manifest, base_commits: { develop: candidate } };
  writeJson("changed-baseline.json", changedBaseline);
  expect("scope_changed_baseline_rejected", scope, ["changed-baseline.json", "desarrollo", "develop"], {}, true);

  fs.writeFileSync(path.join(fixture, "extra.txt"), "extra\n");
  const extraCandidate = commit("fixture out of scope change");
  const extraManifest = { ...manifest, candidate: extraCandidate };
  writeJson("extra-diff.json", extraManifest);
  expect("scope_extra_diff_rejected", scope, ["extra-diff.json", "desarrollo", "develop"], {}, true);

  const preqaManifest = {
    scope_schema_version: 2, change_id: "fixture-preqa", environment: "LOCAL", source_branch: "desarrollo", target_branch: "develop",
    commit: candidate, qa_status: "pending", approval: {}, checks: {}, certification: {}, regression_certification: {}
  };
  writeJson("missing-approval.json", preqaManifest);
  expect("preqa_missing_approval_rejected", preqa, ["missing-approval.json"], {}, true);
  runStrictPromotionFixture();

  const output = { version: 1, certification: "scoped-qa-governance-local", status: "passed", fixture: "real-git", candidate, baseline: base, checks };
  const outputArg = process.argv.find((arg) => arg.startsWith("--output="));
  if (outputArg) {
    const target = path.resolve(root, outputArg.slice("--output=".length));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, `${JSON.stringify(output, null, 2)}\n`);
  }
  console.log(JSON.stringify(output, null, 2));
} catch (error) {
  console.error(JSON.stringify({ certification: "scoped-qa-governance-local", status: "failed", error: String(error.stack || error), checks }, null, 2));
  process.exitCode = 1;
} finally {
  fs.rmSync(fixture, { recursive: true, force: true });
}
