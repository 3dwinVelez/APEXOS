#!/usr/bin/env node
const { currentBranch, git, lines, output, run } = require("./lib");

const branchCheck = run(process.execPath, ["scripts/agents/assert-safe-branch.js"]);
if (branchCheck.status !== 0) {
  console.error(output(branchCheck));
  process.exit(branchCheck.status || 1);
}
console.log(branchCheck.stdout.trim());

const branch = currentBranch();
const status = git(["status", "--porcelain=v1", "--untracked-files=all"]);
if (status.status !== 0) {
  console.error(output(status));
  process.exit(status.status || 1);
}

const changed = lines(status.stdout);
const upstream = git(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"]);
console.log(`[INFO] Estado: ${changed.length ? `${changed.length} entrada(s) modificada(s)` : "limpio"}`);
console.log(`[INFO] Upstream: ${upstream.status === 0 ? upstream.stdout.trim() : "sin configurar"}`);
console.log(`[OK] Git válido para agentes en ${branch}`);
