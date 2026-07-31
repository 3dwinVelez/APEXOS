#!/usr/bin/env node
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const TEMP_ROOT = path.join(os.tmpdir(), "apexos-workflow");
const PROMOTION_AUTH = {
  develop: "AUTORIZO_PROMOVER_DESARROLLO_A_DEVELOP",
  main: "AUTORIZO_PROMOVER_DEVELOP_A_MAIN"
};
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

function ensurePromotionAuthorization(target) {
  const expected = PROMOTION_AUTH[target];
  if (!expected || process.env.APEXOS_PROMOTION_AUTH !== expected) {
    throw new Error(`Promocion bloqueada. Define APEXOS_PROMOTION_AUTH=${expected} solo con autorizacion expresa.`);
  }
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
  const worktree = path.join(TEMP_ROOT, `develop-${suffix}`);
  try {
    runGit(["worktree", "add", "--detach", worktree, "origin/develop"]);
    callback({ worktree });
  } finally {
    try {
      runGit(["worktree", "remove", "--force", worktree]);
    } catch {}
  }
}

function withTempMainSync(callback) {
  fs.mkdirSync(TEMP_ROOT, { recursive: true });
  const suffix = Date.now().toString();
  const worktree = path.join(TEMP_ROOT, `main-${suffix}`);
  try {
    runGit(["worktree", "add", "--detach", worktree, "origin/main"]);
    callback({ worktree });
  } finally {
    try {
      runGit(["worktree", "remove", "--force", worktree]);
    } catch {}
  }
}

function promoteDevelop() {
  ensureBranch("desarrollo");
  ensureCleanWorktree();
  ensureOnlyWorkflowBranches();
  ensurePromotionAuthorization("develop");
  runGit(["fetch", "--all", "--prune"]);
  runGit(["push", "origin", "desarrollo"]);
  withTempDevelopSync(({ worktree }) => {
    runGit(["merge", "--no-ff", "origin/desarrollo", "-m", "merge: promote desarrollo into develop"], { cwd: worktree });
    runGit(["push", "origin", "HEAD:develop"], { cwd: worktree });
  });
  console.log("desarrollo promovida a develop");
}

function promoteMain() {
  ensureBranch("develop");
  ensureCleanWorktree();
  ensureOnlyWorkflowBranches();
  ensurePromotionAuthorization("main");
  runGit(["fetch", "--all", "--prune"]);
  runGit(["push", "origin", "develop"]);
  withTempMainSync(({ worktree }) => {
    runGit(["merge", "--no-ff", "origin/develop", "-m", "merge: promote develop into main"], { cwd: worktree });
    runGit(["push", "origin", "HEAD:main"], { cwd: worktree });
  });
  console.log("develop promovida a main");
}

const command = process.argv[2] || "status";

try {
  if (command === "status") printStatus();
  else if (command === "sync-desarrollo") syncDesarrollo();
  else if (command === "promote-develop") promoteDevelop();
  else if (command === "promote-main") promoteMain();
  else throw new Error(`Comando no soportado: ${command}`);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
