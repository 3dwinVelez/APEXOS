"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { collectGitState, validBranch, isAncestor, runGit } = require("../lib/git");

function makeRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tower-git-"));
  const git = (...args) => execFileSync("git", args, { cwd: dir, stdio: "pipe" }).toString().trim();
  git("init", "-b", "main");
  git("config", "user.email", "tower@test.local");
  git("config", "user.name", "Tower Test");
  fs.writeFileSync(path.join(dir, "a.txt"), "1");
  git("add", ".");
  git("commit", "-m", "init");
  git("branch", "develop");
  git("branch", "desarrollo");
  return { dir, git };
}

function configFor(dir) {
  return {
    repoRoot: dir,
    git: { remote: "origin", branches: ["desarrollo", "develop", "main"], remoteEnabled: false, timeoutMs: 8000, remoteCacheMs: 0 }
  };
}

test("validBranch rechaza nombres peligrosos", () => {
  assert.equal(validBranch("desarrollo"), true);
  assert.equal(validBranch("feature/x"), true);
  assert.equal(validBranch("-rf"), false);
  assert.equal(validBranch("../main"), false);
  assert.equal(validBranch("main..develop"), false);
  assert.equal(validBranch(""), false);
  assert.equal(validBranch("a/"), false);
});

test("collectGitState lee ramas locales y advierte fuera de desarrollo", async (t) => {
  const repo = makeRepo();
  t.after(() => fs.rmSync(repo.dir, { recursive: true, force: true }));

  const state = await collectGitState(configFor(repo.dir));
  assert.equal(state.status, "warn");
  assert.equal(state.worktree.branch, "main");
  assert.equal(state.branches.length, 3);
  assert.ok(state.branches.every((branch) => branch.relation === "local_only"));
  assert.ok(state.warnings.some((warning) => warning.includes("Rama activa distinta de desarrollo")));
  assert.equal(state.flow.every((entry) => entry.checked === null), true);
});

test("isAncestor distingue historia lineal de divergencia", async (t) => {
  const repo = makeRepo();
  t.after(() => fs.rmSync(repo.dir, { recursive: true, force: true }));

  repo.git("checkout", "develop");
  fs.writeFileSync(path.join(repo.dir, "b.txt"), "2");
  repo.git("add", ".");
  repo.git("commit", "-m", "develop work");

  const mainSha = (await runGit(["rev-parse", "main"], { repoRoot: repo.dir })).stdout;
  const developSha = (await runGit(["rev-parse", "develop"], { repoRoot: repo.dir })).stdout;
  assert.equal(await isAncestor(repo.dir, mainSha, developSha), true);

  repo.git("checkout", "main");
  fs.writeFileSync(path.join(repo.dir, "c.txt"), "3");
  repo.git("add", ".");
  repo.git("commit", "-m", "main work");
  const newMain = (await runGit(["rev-parse", "main"], { repoRoot: repo.dir })).stdout;
  assert.equal(await isAncestor(repo.dir, newMain, developSha), false);
});
