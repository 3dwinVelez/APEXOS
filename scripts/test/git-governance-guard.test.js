const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { changedFiles, exactlyOneManifest, candidatePath } = require("../git-governance-guard");

function git(directory, args) {
  return execFileSync("git", args, { cwd: directory, encoding: "utf8" }).trim();
}

function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "apexos-governance-"));
  git(directory, ["init", "-b", "develop"]);
  git(directory, ["config", "user.email", "qa@example.invalid"]);
  git(directory, ["config", "user.name", "QA fixture"]);
  fs.mkdirSync(path.join(directory, "docs/qa/manifests"), { recursive: true });
  fs.writeFileSync(path.join(directory, "README.md"), "base\n");
  git(directory, ["add", "."]);
  git(directory, ["commit", "-m", "base"]);
  const base = git(directory, ["rev-parse", "HEAD"]);
  fs.writeFileSync(path.join(directory, "docs/qa/manifests/change-scope.json"), "{}\n");
  git(directory, ["add", "."]);
  git(directory, ["commit", "-m", "scope"]);
  return { directory, base, candidate: git(directory, ["rev-parse", "HEAD"]) };
}

test("descubre el manifiesto scope en un diff Git real", () => {
  const current = fixture();
  try {
    const files = changedFiles(current.base, current.candidate, current.directory);
    assert.deepEqual(files, [{ status: "A", file: "docs/qa/manifests/change-scope.json" }]);
    assert.equal(exactlyOneManifest(files, "-scope.json", "scope"), "docs/qa/manifests/change-scope.json");
  } finally {
    fs.rmSync(current.directory, { recursive: true, force: true });
  }
});

test("rechaza cero o multiples manifiestos scope en el inventario Git", () => {
  const current = fixture();
  try {
    const files = changedFiles(current.base, current.candidate, current.directory);
    assert.throws(() => exactlyOneManifest([], "-scope.json", "scope"), /exactamente un manifiesto/);
    assert.throws(() => exactlyOneManifest([...files, files[0]], "-scope.json", "scope"), /exactamente un manifiesto/);
  } finally {
    fs.rmSync(current.directory, { recursive: true, force: true });
  }
});

test("rechaza referencias de evidencia absolutas, fuera del repo y no versionadas", () => {
  const manifest = path.resolve("docs/qa/manifests/hr-ibc-novelties-20261015-preqa.json");
  assert.throws(() => candidatePath("HEAD", manifest, "/etc/hosts", "evidence"), /no portable/);
  assert.throws(() => candidatePath("HEAD", manifest, "C:/outside/evidence.json", "evidence"), /no portable/);
  assert.throws(() => candidatePath("HEAD", manifest, "C:\\outside\\evidence.json", "evidence"), /no portable/);
  assert.throws(() => candidatePath("HEAD", manifest, "\\\\server\\share\\evidence.json", "evidence"), /no portable/);
  assert.throws(() => candidatePath("HEAD", manifest, "../../../../etc/hosts", "evidence"), /escapa/);
  assert.throws(() => candidatePath("HEAD", manifest, "../../../.qa-untracked-evidence.json", "evidence"), /no esta versionada/);
});
