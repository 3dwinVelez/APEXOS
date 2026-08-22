#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { PROTECTED_BRANCHES, ROOT, currentBranch, git, output } = require("./lib");

function fail(message) {
  console.error(`[BLOCKED] ${message}`);
  process.exit(1);
}

const inside = git(["rev-parse", "--is-inside-work-tree"]);
if (inside.status !== 0 || inside.stdout.trim() !== "true") {
  fail("El directorio actual no pertenece a un repositorio Git.");
}

const branch = currentBranch();
if (!branch) fail("HEAD está separado; crear o seleccionar una rama de trabajo.");
if (PROTECTED_BRANCHES.has(branch.toLowerCase())) {
  fail(`No se permite trabajo de agentes sobre la rama protegida "${branch}".`);
}

const operations = [
  ["MERGE_HEAD", "merge"],
  ["rebase-merge", "rebase"],
  ["rebase-apply", "rebase"],
  ["CHERRY_PICK_HEAD", "cherry-pick"],
  ["REVERT_HEAD", "revert"]
];

for (const [gitPath, operation] of operations) {
  if (fs.existsSync(path.join(ROOT, ".git", gitPath))) {
    fail(`Hay una operación ${operation} en curso.`);
  }
}

const topLevel = git(["rev-parse", "--show-toplevel"]);
if (topLevel.status !== 0) fail(output(topLevel));

console.log(`[OK] Rama segura: ${branch}`);
console.log(`[OK] Repositorio: ${topLevel.stdout.trim()}`);
