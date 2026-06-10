#!/usr/bin/env node
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const TEMP_ROOT = path.join(os.tmpdir(), "apexos-workflow");
function runGit(args, options = {}) {
  const result = spawnSync("git", args, {
    cwd: options.cwd || ROOT,
    encoding: "utf8",
    shell: false,
    ...options
  });
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || "git command failed").trim();
    throw new Error(detail);
  }
  return (result.stdout || "").trim();
}

function currentBranch() {
  return runGit(["branch", "--show-current"]);
}

function worktreeClean() {
  return !runGit(["status", "--porcelain"]).trim();
}

function ensureBranch(name) {
  const branch = currentBranch();
  if (branch !== name) throw new Error(`Debes ejecutar este flujo desde la rama ${name}. Rama actual: ${branch}`);
}

function ensureCleanWorktree() {
  if (!worktreeClean()) throw new Error("El worktree tiene cambios sin guardar/committear. Limpialo antes de continuar.");
}

function ensureOnlyWorkflowBranches() {
  const local = runGit(["branch", "--format=%(refname:short)"]).split(/\r?\n/).filter(Boolean);
  const invalid = local.filter((name) => !["main", "develop", "desarrollo"].includes(name));
  if (invalid.length) throw new Error(`Hay ramas locales fuera del flujo esperado: ${invalid.join(", ")}`);
}

function printStatus() {
  const branch = currentBranch();
  const clean = worktreeClean();
  const local = runGit(["branch", "--format=%(refname:short)"]).split(/\r?\n/).filter(Boolean);
  const remote = runGit(["branch", "-r", "--format=%(refname:short)"]).split(/\r?\n/).filter((name) => Boolean(name) && name !== "origin");
  console.log(JSON.stringify({
    branch,
    clean,
    local_branches: local,
    remote_branches: remote
  }, null, 2));
}

function syncDesarrollo() {
  ensureBranch("desarrollo");
  ensureCleanWorktree();
  runGit(["fetch", "--all", "--prune"]);
  runGit(["merge", "--no-ff", "origin/develop", "-m", "merge: sync desarrollo with develop"]);
  console.log("desarrollo sincronizada con origin/develop");
}

function withTempDevelopSync(callback) {
  fs.mkdirSync(TEMP_ROOT, { recursive: true });
  const suffix = Date.now().toString();
  const branch = `sync/develop-${suffix}`;
  const worktree = path.join(TEMP_ROOT, branch.replace(/[/:]/g, "-"));
  try {
    runGit(["worktree", "add", "-b", branch, worktree, "origin/develop"]);
    callback({ branch, worktree });
  } finally {
    try {
      runGit(["worktree", "remove", "--force", worktree]);
    } catch {}
    try {
      runGit(["branch", "-D", branch]);
    } catch {}
  }
}

function promoteDevelop() {
  ensureBranch("desarrollo");
  ensureCleanWorktree();
  ensureOnlyWorkflowBranches();
  runGit(["fetch", "--all", "--prune"]);
  runGit(["push", "origin", "desarrollo"]);
  withTempDevelopSync(({ worktree }) => {
    runGit(["merge", "--no-ff", "origin/desarrollo", "-m", "merge: promote desarrollo into develop"], { cwd: worktree });
    runGit(["push", "origin", "HEAD:develop"], { cwd: worktree });
  });
  console.log("desarrollo promovida a develop");
}

const command = process.argv[2] || "status";

try {
  if (command === "status") printStatus();
  else if (command === "sync-desarrollo") syncDesarrollo();
  else if (command === "promote-develop") promoteDevelop();
  else throw new Error(`Comando no soportado: ${command}`);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
