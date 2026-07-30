#!/usr/bin/env node
const { spawnSync } = require("node:child_process");

const PERMANENT_BRANCHES = new Set(["desarrollo", "develop", "main"]);
const AUXILIARY_PREFIXES = ["codex/", "feature/", "fix/", "hotfix/", "chore/", "sync/"];
const PROMOTION_AUTH = {
  "desarrollo-to-develop": "AUTORIZO_PROMOVER_DESARROLLO_A_DEVELOP",
  "develop-to-main": "AUTORIZO_PROMOVER_DEVELOP_A_MAIN"
};

function git(args) {
  const result = spawnSync("git", args, { encoding: "utf8", shell: false });
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

const command = process.argv[2] || "status";

try {
  if (command === "implementation") assertImplementationBranch();
  else if (command === "local") {
    assertImplementationBranch();
    assertCleanWorktree();
    assertNoAuxiliaryBranches();
  } else if (command === "ci") assertGithubRef();
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
