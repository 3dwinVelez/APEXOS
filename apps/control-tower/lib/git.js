"use strict";

const { execFile } = require("node:child_process");

const BRANCH_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,119}$/;
const FLOW = [
  { from: "main", to: "develop" },
  { from: "develop", to: "desarrollo" }
];

const remoteCache = new Map();

function clearRemoteCache() {
  remoteCache.clear();
}

function validBranch(name) {
  return typeof name === "string" && BRANCH_PATTERN.test(name) && !name.includes("..") && !name.endsWith("/");
}

function runGit(args, { repoRoot, timeoutMs = 8000 } = {}) {
  const startedAt = Date.now();
  return new Promise((resolve) => {
    execFile("git", args, { cwd: repoRoot, timeout: timeoutMs, windowsHide: true, maxBuffer: 2 * 1024 * 1024 }, (error, stdout, stderr) => {
      resolve({
        ok: !error,
        code: error && typeof error.code === "number" ? error.code : error ? 1 : 0,
        stdout: String(stdout || "").trim(),
        stderr: String(stderr || "").trim(),
        durationMs: Date.now() - startedAt,
        error: error ? String(error.message || error) : null
      });
    });
  });
}

async function resolveCommit(repoRoot, ref, timeoutMs) {
  if (!validBranch(ref) && !/^refs\/[A-Za-z0-9._/-]+$/.test(ref) && !/^[0-9a-f]{7,40}$/.test(ref)) {
    return null;
  }
  const result = await runGit(["rev-parse", "--verify", "--quiet", ref], { repoRoot, timeoutMs });
  return result.ok && /^[0-9a-f]{40}$/.test(result.stdout) ? result.stdout : null;
}

async function objectExists(repoRoot, sha, timeoutMs) {
  const result = await runGit(["cat-file", "-e", `${sha}^{commit}`], { repoRoot, timeoutMs });
  return result.ok;
}

async function isAncestor(repoRoot, ancestor, descendant, timeoutMs) {
  if (!ancestor || !descendant) return null;
  const result = await runGit(["merge-base", "--is-ancestor", ancestor, descendant], { repoRoot, timeoutMs });
  if (result.ok) return true;
  return result.code === 1 ? false : null;
}

async function divergence(repoRoot, left, right, timeoutMs) {
  if (!left || !right) return { ahead: null, behind: null };
  if (!(await objectExists(repoRoot, left, timeoutMs)) || !(await objectExists(repoRoot, right, timeoutMs))) {
    return { ahead: null, behind: null };
  }
  const result = await runGit(["rev-list", "--left-right", "--count", `${left}...${right}`], { repoRoot, timeoutMs });
  if (!result.ok) return { ahead: null, behind: null };
  const [ahead, behind] = result.stdout.split(/\s+/).map((value) => Number(value));
  return {
    ahead: Number.isInteger(ahead) ? ahead : null,
    behind: Number.isInteger(behind) ? behind : null
  };
}

function relationOf(localSha, remoteSha, ahead, behind) {
  if (!localSha && !remoteSha) return "missing";
  if (!localSha) return "remote_only";
  if (!remoteSha) return "local_only";
  if (localSha === remoteSha) return "in_sync";
  if (ahead == null || behind == null) return "unknown";
  if (ahead === 0) return "behind";
  if (behind === 0) return "ahead";
  return "diverged";
}

async function readWorktree(repoRoot, timeoutMs) {
  const branchResult = await runGit(["rev-parse", "--abbrev-ref", "HEAD"], { repoRoot, timeoutMs });
  const headResult = await runGit(["rev-parse", "HEAD"], { repoRoot, timeoutMs });
  const statusResult = await runGit(["status", "--porcelain=v1"], { repoRoot, timeoutMs });
  const lines = statusResult.ok && statusResult.stdout ? statusResult.stdout.split(/\r?\n/).filter(Boolean) : [];
  const stats = { modified: 0, staged: 0, untracked: 0 };
  for (const line of lines) {
    if (line.startsWith("??")) stats.untracked += 1;
    else if (line[0] !== " ") stats.staged += 1;
    else stats.modified += 1;
  }
  return {
    branch: branchResult.ok ? branchResult.stdout : null,
    head: headResult.ok ? headResult.stdout : null,
    clean: stats.modified + stats.staged + stats.untracked === 0,
    changes: { ...stats, total: lines.length },
    detached: branchResult.ok && branchResult.stdout === "HEAD"
  };
}

async function readRemoteHeads(repoRoot, remote, timeoutMs, cacheMs = 0) {
  if (!/^[A-Za-z0-9._/-]+$/.test(remote)) throw new Error("remoto invalido");
  const key = `${repoRoot}|${remote}`;
  const cached = remoteCache.get(key);
  if (cacheMs > 0 && cached && Date.now() - cached.at < cacheMs) return cached.heads;
  const result = await runGit(["ls-remote", "--heads", remote], { repoRoot, timeoutMs: Math.max(timeoutMs, 15000) });
  if (!result.ok) throw new Error(result.stderr || result.error || "git ls-remote fallo");
  const heads = new Map();
  for (const line of result.stdout.split(/\r?\n/).filter(Boolean)) {
    const [sha, ref] = line.split(/\s+/);
    if (!ref || !sha) continue;
    const name = ref.replace("refs/heads/", "");
    heads.set(name, sha);
  }
  remoteCache.set(key, { at: Date.now(), heads });
  return heads;
}

async function collectGitState(config) {
  const { repoRoot } = config;
  const gitConfig = config.git;
  const timeoutMs = gitConfig.timeoutMs;
  const checkedAt = new Date().toISOString();

  const worktree = await readWorktree(repoRoot, timeoutMs);
  const branches = [];
  const warnings = [];

  let remoteHeads = new Map();
  let remoteError = null;
  if (gitConfig.remoteEnabled) {
    try {
      remoteHeads = await readRemoteHeads(repoRoot, gitConfig.remote, timeoutMs, gitConfig.remoteCacheMs);
    } catch (error) {
      remoteError = String(error.message || error);
    }
  }

  for (const name of gitConfig.branches) {
    if (!validBranch(name)) {
      warnings.push(`Rama ignorada por nombre invalido: ${name}`);
      continue;
    }
    const localSha = await resolveCommit(repoRoot, `refs/heads/${name}`, timeoutMs);
    const trackingRef = `refs/remotes/${gitConfig.remote}/${name}`;
    const trackingSha = gitConfig.remoteEnabled ? await resolveCommit(repoRoot, trackingRef, timeoutMs) : null;
    const remoteSha = remoteHeads.get(name) || null;
    const { ahead, behind } = await divergence(repoRoot, localSha, trackingSha, timeoutMs);
    const relation = relationOf(localSha, trackingSha, ahead, behind);
    const remoteMoved = Boolean(remoteSha && trackingSha && remoteSha !== trackingSha);
    branches.push({
      name,
      localSha,
      trackingSha,
      remoteSha,
      relation,
      remoteMoved,
      ahead,
      behind,
      current: worktree.branch === name
    });
  }

  const flow = [];
  for (const pair of FLOW) {
    if (!gitConfig.branches.includes(pair.from) || !gitConfig.branches.includes(pair.to)) continue;
    const ancestorRef = await resolveCommit(repoRoot, `refs/remotes/${gitConfig.remote}/${pair.from}`, timeoutMs);
    const descendantRef = await resolveCommit(repoRoot, `refs/remotes/${gitConfig.remote}/${pair.to}`, timeoutMs);
    const ancestor = await isAncestor(repoRoot, ancestorRef, descendantRef, timeoutMs);
    const entry = { from: pair.from, to: pair.to, ok: ancestor === true, checked: ancestor };
    flow.push(entry);
    if (ancestor === false) {
      warnings.push(`${pair.from} no es ancestro de ${pair.to}: ramas divergentes`);
    }
  }

  if (!worktree.branch) warnings.push("No se pudo leer la rama activa del repositorio");
  else if (worktree.branch !== "desarrollo") warnings.push(`Rama activa distinta de desarrollo: ${worktree.branch}`);
  if (worktree.changes.total > 0) warnings.push(`Arbol de trabajo con ${worktree.changes.total} cambio(s) sin confirmar`);
  if (remoteError) warnings.push("Remoto git no disponible: se usa solo el estado local");

  const flowOk = flow.length > 0 && flow.every((entry) => entry.ok);
  return {
    at: checkedAt,
    repoRoot,
    remote: gitConfig.remote,
    remoteEnabled: gitConfig.remoteEnabled,
    remoteError,
    worktree,
    branches,
    flow,
    flowOk,
    warnings,
    status: remoteError ? "degraded" : flowOk ? "ok" : "warn"
  };
}

module.exports = {
  FLOW,
  validBranch,
  runGit,
  collectGitState,
  readWorktree,
  isAncestor,
  clearRemoteCache
};
